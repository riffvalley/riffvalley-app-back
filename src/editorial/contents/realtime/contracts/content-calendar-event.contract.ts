import { ContentType } from '../../entities/content.entity';

export const CONTENT_CALENDAR_INVALIDATE_EVENT = 'contents.invalidate' as const;

export interface ContentCalendarUserActor {
  readonly kind: 'user';
  readonly id: string;
  readonly displayName: string;
}

export interface ContentCalendarSystemActor {
  readonly kind: 'system';
  readonly displayName: string;
}

export type ContentCalendarActor =
  | ContentCalendarUserActor
  | ContentCalendarSystemActor;

export interface ContentCalendarContentReference {
  readonly id: string;
  readonly title: string;
}

export interface ContentCalendarDescriptorSource {
  readonly id: string;
  readonly name: string;
  readonly type: ContentType;
  readonly publicationDate?: Date | string | null;
}

export type ContentCalendarField =
  | 'title'
  | 'type'
  | 'publicationDate'
  | 'closeDate'
  | 'listDate'
  | 'ready'
  | 'backlog'
  | 'author'
  | 'editorialDetails'
  | 'list'
  | 'reunion';

interface ContentCalendarChangeBase {
  readonly type: typeof CONTENT_CALENDAR_INVALIDATE_EVENT;
  readonly version: 2;
  readonly reason: 'change';
  readonly actor: ContentCalendarActor;
  readonly content: ContentCalendarContentReference;
  readonly sourceId?: string;
}

export type ContentCalendarEditorialEvent =
  | (ContentCalendarChangeBase & {
      readonly action: 'created';
      readonly changes: { readonly newDate: string | null };
    })
  | (ContentCalendarChangeBase & {
      readonly action: 'updated';
      readonly changes: { readonly fields: readonly ContentCalendarField[] };
    })
  | (ContentCalendarChangeBase & {
      readonly action: 'scheduled';
      readonly changes: { readonly newDate: string };
    })
  | (ContentCalendarChangeBase & {
      readonly action: 'moved';
      readonly changes: {
        readonly previousDate: string;
        readonly newDate: string;
      };
    })
  | (ContentCalendarChangeBase & {
      readonly action: 'unscheduled';
      readonly changes: { readonly previousDate: string };
    })
  | (ContentCalendarChangeBase & {
      readonly action: 'deleted';
      readonly changes: { readonly previousDate: string | null };
    });

export interface ContentCalendarSyncEvent {
  readonly type: typeof CONTENT_CALENDAR_INVALIDATE_EVENT;
  readonly version: 2;
  readonly reason: 'initial' | 'change';
}

export const CONTENT_CALENDAR_GENERIC_CHANGE: ContentCalendarSyncEvent =
  Object.freeze({
    type: CONTENT_CALENDAR_INVALIDATE_EVENT,
    version: 2,
    reason: 'change',
  });

export type ContentCalendarEvent =
  | ContentCalendarEditorialEvent
  | ContentCalendarSyncEvent;

export interface ContentCalendarMutationContext {
  readonly actor: ContentCalendarActor;
  readonly sourceId?: string;
}

export const CONTENT_CALENDAR_SYSTEM_ACTOR: ContentCalendarSystemActor =
  Object.freeze({ kind: 'system', displayName: 'Proceso automático' });

export function contentCalendarActorFromUser(user: {
  readonly id: string;
  readonly username: string;
}): ContentCalendarUserActor {
  return { kind: 'user', id: user.id, displayName: user.username };
}

export function contentCalendarMutationContext(
  user: { readonly id: string; readonly username: string } | undefined,
  sourceId?: string,
): ContentCalendarMutationContext | undefined {
  if (!user) return undefined;
  const safeSourceId =
    sourceId && /^[A-Za-z0-9_-]{1,128}$/.test(sourceId) ? sourceId : undefined;
  return {
    actor: contentCalendarActorFromUser(user),
    ...(safeSourceId ? { sourceId: safeSourceId } : {}),
  };
}

export function resolveContentCalendarTitle(
  content: ContentCalendarDescriptorSource,
): string {
  const typeLabels: Record<ContentType, string> = {
    [ContentType.ARTICLE]: 'Article',
    [ContentType.PHOTOS]: 'Photos',
    [ContentType.RIFF_VALLEY_PLAYLIST]: 'Playlist de Riff Valley',
    [ContentType.RADAR]: 'Radar',
    [ContentType.BEST]: 'Best',
    [ContentType.VIDEO]: 'Video',
    [ContentType.REUNION]: 'Reunion',
  };
  const candidates: Partial<Record<ContentType, string | null | undefined>> = {
    [ContentType.ARTICLE]: content.name,
    [ContentType.PHOTOS]: content.name,
    [ContentType.RIFF_VALLEY_PLAYLIST]: content.name,
    [ContentType.RADAR]: content.name,
    [ContentType.BEST]: content.name,
    [ContentType.VIDEO]: content.name,
    [ContentType.REUNION]: content.name,
  };
  const title = candidates[content.type]?.trim();
  return title || typeLabels[content.type] || 'Contenido editorial';
}

export function contentCalendarCivilDate(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const dateOnly = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
    if (dateOnly) return dateOnly;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function encodeContentCalendarEvent(
  event: ContentCalendarEvent,
): string {
  return [
    `event: ${CONTENT_CALENDAR_INVALIDATE_EVENT}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join('\n');
}
