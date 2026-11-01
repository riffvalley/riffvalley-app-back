export const REUNIONS_INVALIDATE_EVENT = 'reunions.invalidate' as const;

export type ReunionsEvent =
  | {
      readonly type: typeof REUNIONS_INVALIDATE_EVENT;
      readonly version: 1;
      readonly reason: 'initial';
    }
  | {
      readonly type: typeof REUNIONS_INVALIDATE_EVENT;
      readonly version: 1;
      readonly reason: 'change';
    };

export const REUNIONS_INITIAL_EVENT: ReunionsEvent = Object.freeze({
  type: REUNIONS_INVALIDATE_EVENT,
  version: 1,
  reason: 'initial',
});

export const REUNIONS_CHANGE_EVENT: ReunionsEvent = Object.freeze({
  type: REUNIONS_INVALIDATE_EVENT,
  version: 1,
  reason: 'change',
});

export function encodeReunionsEvent(event: ReunionsEvent): string {
  return [
    `event: ${REUNIONS_INVALIDATE_EVENT}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join('\n');
}
