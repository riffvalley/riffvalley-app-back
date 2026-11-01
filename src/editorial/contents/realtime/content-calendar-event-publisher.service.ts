import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import {
  ContentCalendarActor,
  ContentCalendarDescriptorSource,
  ContentCalendarEvent,
  ContentCalendarField,
  contentCalendarCivilDate,
  resolveContentCalendarTitle,
} from './contracts/content-calendar-event.contract';

@Injectable()
export class ContentCalendarEventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(ContentCalendarEventPublisher.name);
  private readonly events = new Subject<ContentCalendarEvent>();
  private activeSubscribers = 0;
  private publishedEvents = 0;

  subscribe(listener: (event: ContentCalendarEvent) => void): () => void {
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
    createEvent: ContentCalendarEvent | (() => ContentCalendarEvent),
    fallback?: ContentCalendarEvent,
  ): void {
    try {
      this.publish(
        typeof createEvent === 'function' ? createEvent() : createEvent,
      );
    } catch {
      this.logger.error('event=content_calendar_event_publish_failed');
      if (fallback) {
        try {
          this.publish(fallback);
        } catch {
          this.logger.error('event=content_calendar_event_fallback_failed');
        }
      }
    }
  }

  publish(event: ContentCalendarEvent): void {
    this.publishedEvents += 1;
    this.logger.log(
      `event=content_calendar_event count=${this.publishedEvents}`,
    );
    this.events.next(event);
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
}

export function createContentCalendarEvent(input: {
  readonly action:
    | 'created'
    | 'updated'
    | 'scheduled'
    | 'moved'
    | 'unscheduled'
    | 'deleted';
  readonly content: ContentCalendarDescriptorSource;
  readonly actor: ContentCalendarActor;
  readonly sourceId?: string;
  readonly previousDate?: Date | string | null;
  readonly fields?: readonly ContentCalendarField[];
}): ContentCalendarEvent {
  const { action, content, actor, sourceId } = input;
  const base = {
    type: 'contents.invalidate' as const,
    version: 2 as const,
    reason: 'change' as const,
    actor,
    content: { id: content.id, title: resolveContentCalendarTitle(content) },
    ...(sourceId ? { sourceId } : {}),
  };
  const previousDate = contentCalendarCivilDate(input.previousDate);
  const newDate = contentCalendarCivilDate(content.publicationDate);

  switch (action) {
    case 'created':
      return { ...base, action, changes: { newDate } };
    case 'scheduled':
      if (!newDate) throw new Error('scheduled_content_requires_date');
      return {
        ...base,
        action,
        changes: { newDate },
      };
    case 'moved':
      if (!previousDate || !newDate)
        throw new Error('moved_content_requires_dates');
      return {
        ...base,
        action,
        changes: {
          previousDate,
          newDate,
        },
      };
    case 'unscheduled':
      if (!previousDate) throw new Error('unscheduled_content_requires_date');
      return {
        ...base,
        action,
        changes: { previousDate },
      };
    case 'deleted':
      return { ...base, action, changes: { previousDate } };
    case 'updated':
      return {
        ...base,
        action,
        changes: { fields: input.fields ?? [] },
      };
  }
}
