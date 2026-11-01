export const CONTENT_CALENDAR_INVALIDATE_EVENT = 'contents.invalidate' as const;

export interface ContentCalendarInvalidationEvent {
  readonly type: typeof CONTENT_CALENDAR_INVALIDATE_EVENT;
  readonly version: 1;
}

export const CONTENT_CALENDAR_INVALIDATION: ContentCalendarInvalidationEvent =
  Object.freeze({
    type: CONTENT_CALENDAR_INVALIDATE_EVENT,
    version: 1,
  });

export function encodeContentCalendarInvalidation(): string {
  return [
    `event: ${CONTENT_CALENDAR_INVALIDATE_EVENT}`,
    `data: ${JSON.stringify(CONTENT_CALENDAR_INVALIDATION)}`,
    '',
    '',
  ].join('\n');
}
