import {
  ContentCalendarActor,
  CONTENT_CALENDAR_SYSTEM_ACTOR,
} from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';

export const REUNIONS_INVALIDATE_EVENT = 'reunions.invalidate' as const;

export interface ReunionReference {
  readonly id: string;
  readonly title: string;
}

export interface PointReference {
  readonly id: string;
  readonly title: string;
}

interface ReunionsEventBase {
  readonly type: typeof REUNIONS_INVALIDATE_EVENT;
  readonly version: 1;
}

export type ReunionsChangeEvent = ReunionsEventBase &
  (
    | { readonly reason: 'change' }
    | {
        readonly reason: 'change';
        readonly action:
          | 'reunion.created'
          | 'reunion.updated'
          | 'reunion.deleted';
        readonly actor: ContentCalendarActor;
        readonly reunion: ReunionReference;
        readonly sourceId?: string;
      }
    | {
        readonly reason: 'change';
        readonly action:
          | 'point.created'
          | 'point.updated'
          | 'point.completed'
          | 'point.reopened'
          | 'point.deleted';
        readonly actor: ContentCalendarActor;
        readonly reunion: ReunionReference;
        readonly point: PointReference;
        readonly sourceId?: string;
      }
    | {
        readonly reason: 'change';
        readonly action: 'point.moved';
        readonly actor: ContentCalendarActor;
        readonly previousReunion: ReunionReference;
        readonly reunion: ReunionReference;
        readonly point: PointReference;
        readonly sourceId?: string;
      }
  );

export type ReunionsEvent =
  | (ReunionsEventBase & { readonly reason: 'initial' })
  | ReunionsChangeEvent;

export interface ReunionsMutationContext {
  readonly actor: ContentCalendarActor;
  readonly sourceId?: string;
}

export const REUNIONS_INITIAL_EVENT: ReunionsEvent = Object.freeze({
  type: REUNIONS_INVALIDATE_EVENT,
  version: 1,
  reason: 'initial',
});

export const REUNIONS_GENERIC_CHANGE_EVENT: ReunionsChangeEvent = Object.freeze(
  {
    type: REUNIONS_INVALIDATE_EVENT,
    version: 1,
    reason: 'change',
  },
);

export const REUNIONS_SYSTEM_ACTOR = CONTENT_CALENDAR_SYSTEM_ACTOR;

export function reunionReference(reunion: {
  readonly id: string;
  readonly titulo?: string | null;
}): ReunionReference {
  return {
    id: reunion.id,
    title: reunion.titulo?.trim() || 'Reunión sin título',
  };
}

export function pointReference(point: {
  readonly id: string;
  readonly titulo?: string | null;
}): PointReference {
  return {
    id: point.id,
    title: point.titulo?.trim() || 'Punto sin título',
  };
}

export function reunionsMutationContext(
  user: { readonly id: string; readonly username: string } | undefined,
  sourceId?: string,
): ReunionsMutationContext {
  return normalizeReunionsMutationContext({
    actor: user
      ? { kind: 'user', id: user.id, displayName: user.username }
      : REUNIONS_SYSTEM_ACTOR,
    ...(sourceId ? { sourceId } : {}),
  });
}

export function normalizeReunionsMutationContext(
  context: ReunionsMutationContext | undefined,
): ReunionsMutationContext {
  const sourceId = context?.sourceId;
  const safeSourceId =
    sourceId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sourceId,
    )
      ? sourceId
      : undefined;
  return {
    actor: context?.actor ?? REUNIONS_SYSTEM_ACTOR,
    ...(safeSourceId ? { sourceId: safeSourceId } : {}),
  };
}

export function encodeReunionsEvent(event: ReunionsEvent): string {
  return [
    `event: ${REUNIONS_INVALIDATE_EVENT}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join('\n');
}
