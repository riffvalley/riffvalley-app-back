import type { ContentCalendarActor } from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';
import { ListType } from '../../entities/list.entity';

export const LISTS_INVALIDATE_EVENT = 'lists.invalidate' as const;

export interface ListsEventListReference {
  readonly id: string;
  readonly type: ListType.WEEK | ListType.MONTH;
}

export interface ListsEventUserReference {
  readonly id: string;
  readonly displayName: string;
}

interface ListsEventBase {
  readonly type: typeof LISTS_INVALIDATE_EVENT;
  readonly version: 1;
}

interface ListsDescriptiveChangeBase extends ListsEventBase {
  readonly reason: 'change';
  readonly actor: ContentCalendarActor;
  readonly assignee: ListsEventUserReference | null;
  readonly list: ListsEventListReference;
  readonly assignmentId: string;
  readonly discId: string;
  readonly artistName: string;
  readonly sourceId?: string;
}

export type ListsDescriptiveChangeEvent =
  | (ListsDescriptiveChangeBase & {
      readonly action: 'assignment.created';
      readonly newPosition: number | null;
    })
  | (ListsDescriptiveChangeBase & {
      readonly action: 'assignment.placed';
      readonly previousPosition: number | null;
      readonly newPosition: number | null;
    })
  | (ListsDescriptiveChangeBase & {
      readonly action: 'assignment.moved';
      readonly previousPosition: number | null;
      readonly newPosition: number | null;
    })
  | (ListsDescriptiveChangeBase & {
      readonly action: 'assignment.unplaced';
      readonly previousPosition: number | null;
      readonly newPosition: number | null;
    })
  | (ListsDescriptiveChangeBase & {
      readonly action: 'assignment.deleted';
      readonly previousPosition: number | null;
    });

export interface ListsGenericChangeEvent extends ListsEventBase {
  readonly reason: 'change';
  readonly list?: ListsEventListReference;
}

export type ListsEvent =
  | (ListsEventBase & { readonly reason: 'initial' })
  | ListsDescriptiveChangeEvent
  | ListsGenericChangeEvent;

export interface ListsMutationContext {
  readonly actor: ContentCalendarActor;
  readonly sourceId?: string;
}

export const LISTS_INITIAL_EVENT: ListsEvent = Object.freeze({
  type: LISTS_INVALIDATE_EVENT,
  version: 1,
  reason: 'initial',
});

export function listsGenericChangeEvent(
  list?: ListsEventListReference,
): ListsGenericChangeEvent {
  return {
    type: LISTS_INVALIDATE_EVENT,
    version: 1,
    reason: 'change',
    ...(list ? { list } : {}),
  };
}

export function listsMutationContext(
  user: { readonly id: string; readonly username: string } | undefined,
  sourceId?: string,
): ListsMutationContext | undefined {
  if (!user) return undefined;
  const safeSourceId =
    sourceId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sourceId,
    )
      ? sourceId
      : undefined;
  return {
    actor: { kind: 'user', id: user.id, displayName: user.username },
    ...(safeSourceId ? { sourceId: safeSourceId } : {}),
  };
}

export function encodeListsEvent(event: ListsEvent): string {
  return [
    `event: ${LISTS_INVALIDATE_EVENT}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join('\n');
}
