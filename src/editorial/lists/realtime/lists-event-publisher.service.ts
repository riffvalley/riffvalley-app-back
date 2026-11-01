import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { Asignation } from '../asignations/entities/asignations.entity';
import { List, ListType } from '../entities/list.entity';
import {
  ListsDescriptiveChangeEvent,
  ListsEvent,
  ListsEventListReference,
  ListsMutationContext,
  listsGenericChangeEvent,
} from './contracts/lists-event.contract';

@Injectable()
export class ListsEventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(ListsEventPublisher.name);
  private readonly events = new Subject<ListsEvent>();
  private activeSubscribers = 0;
  private publishedEvents = 0;

  subscribe(listener: (event: ListsEvent) => void): () => void {
    const subscription = this.events.subscribe(listener);
    this.activeSubscribers += 1;
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscription.unsubscribe();
      this.activeSubscribers = Math.max(0, this.activeSubscribers - 1);
    };
  }

  publishChangeSafely(
    createEvent: () => ListsDescriptiveChangeEvent,
    fallbackList?: ListsEventListReference,
  ): void {
    try {
      this.publish(createEvent());
    } catch {
      this.logger.error('event=lists_event_description_failed');
      try {
        this.publish(listsGenericChangeEvent(fallbackList));
      } catch {
        this.logger.error('event=lists_event_fallback_failed');
      }
    }
  }

  publish(event: ListsEvent): void {
    this.publishedEvents += 1;
    this.logger.log(`event=lists_event count=${this.publishedEvents}`);
    this.events.next(event);
  }

  createAssignmentEvent(
    assignment: Asignation,
    list: List,
    context: ListsMutationContext | undefined,
    action: 'assignment.created',
  ): ListsDescriptiveChangeEvent {
    if (!context) throw new Error('lists_event_actor_missing');
    return {
      type: 'lists.invalidate',
      version: 1,
      reason: 'change',
      action,
      actor: context.actor,
      assignee: assignment.user
        ? {
            id: assignment.user.id,
            displayName: this.requiredText(assignment.user.username),
          }
        : null,
      list: this.listReference(list),
      assignmentId: this.requiredText(assignment.id),
      discId: this.requiredText(assignment.disc?.id),
      artistName: this.requiredText(assignment.disc?.artist?.name),
      newPosition: this.positionValue(assignment.position),
      ...(context.sourceId ? { sourceId: context.sourceId } : {}),
    };
  }

  createPositionEvent(input: {
    readonly assignment: Asignation;
    readonly list: List;
    readonly context: ListsMutationContext | undefined;
    readonly action:
      | 'assignment.placed'
      | 'assignment.moved'
      | 'assignment.unplaced';
    readonly previousPosition: number | null | undefined;
    readonly newPosition: number | null | undefined;
  }): ListsDescriptiveChangeEvent {
    const { assignment, list, context, action } = input;
    if (!context) throw new Error('lists_event_actor_missing');
    return {
      type: 'lists.invalidate',
      version: 1,
      reason: 'change',
      action,
      actor: context.actor,
      assignee: assignment.user
        ? {
            id: assignment.user.id,
            displayName: this.requiredText(assignment.user.username),
          }
        : null,
      list: this.listReference(list),
      assignmentId: this.requiredText(assignment.id),
      discId: this.requiredText(assignment.disc?.id),
      artistName: this.requiredText(assignment.disc?.artist?.name),
      previousPosition: this.positionValue(input.previousPosition),
      newPosition: this.positionValue(input.newPosition),
      ...(context.sourceId ? { sourceId: context.sourceId } : {}),
    };
  }

  createDeletionEvent(input: {
    readonly assignment: Asignation;
    readonly list: List;
    readonly context: ListsMutationContext | undefined;
  }): ListsDescriptiveChangeEvent {
    const { assignment, list, context } = input;
    if (!context) throw new Error('lists_event_actor_missing');
    return {
      type: 'lists.invalidate',
      version: 1,
      reason: 'change',
      action: 'assignment.deleted',
      actor: context.actor,
      assignee: assignment.user
        ? {
            id: assignment.user.id,
            displayName: this.requiredText(assignment.user.username),
          }
        : null,
      list: this.listReference(list),
      assignmentId: this.requiredText(assignment.id),
      discId: this.requiredText(assignment.disc?.id),
      artistName: this.requiredText(assignment.disc?.artist?.name),
      previousPosition: this.positionValue(assignment.position),
      ...(context.sourceId ? { sourceId: context.sourceId } : {}),
    };
  }

  getMetrics(): Readonly<{
    activeSubscribers: number;
    publishedEvents: number;
  }> {
    return {
      activeSubscribers: this.activeSubscribers,
      publishedEvents: this.publishedEvents,
    };
  }

  onModuleDestroy(): void {
    this.events.complete();
    this.activeSubscribers = 0;
  }

  private listReference(list: List): ListsEventListReference {
    if (list.type !== ListType.WEEK && list.type !== ListType.MONTH) {
      throw new Error('lists_event_list_type_ineligible');
    }
    return { id: this.requiredText(list.id), type: list.type };
  }

  private requiredText(value: string | null | undefined): string {
    const normalized = value?.trim();
    if (!normalized) throw new Error('lists_event_required_descriptor_missing');
    return normalized;
  }

  private positionValue(value: number | null | undefined): number | null {
    return value === undefined ? null : value;
  }
}
