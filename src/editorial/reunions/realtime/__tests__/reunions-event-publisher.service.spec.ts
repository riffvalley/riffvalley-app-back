import { ReunionsEventPublisher } from '../reunions-event-publisher.service';
import {
  encodeReunionsEvent,
  pointReference,
  REUNIONS_GENERIC_CHANGE_EVENT,
  REUNIONS_INITIAL_EVENT,
  reunionReference,
  reunionsMutationContext,
} from '../contracts/reunions-event.contract';

describe('ReunionsEventPublisher', () => {
  it('publishes one exact v1 invalidation to every active subscriber without replay', () => {
    const publisher = new ReunionsEventPublisher();
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = publisher.subscribe(first);
    const unsubscribeSecond = publisher.subscribe(second);

    publisher.publishChangeSafely();

    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({
      type: 'reunions.invalidate',
      version: 1,
      reason: 'change',
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(publisher.getMetrics()).toEqual({
      activeSubscribers: 2,
      publishedEvents: 1,
    });
    unsubscribeFirst();
    unsubscribeFirst();
    unsubscribeSecond();
    expect(publisher.getMetrics().activeSubscribers).toBe(0);

    const lateSubscriber = jest.fn();
    publisher.subscribe(lateSubscriber);
    expect(lateSubscriber).not.toHaveBeenCalled();
    publisher.onModuleDestroy();
  });

  it('encodes the initial and change discriminants exactly', () => {
    expect(encodeReunionsEvent(REUNIONS_INITIAL_EVENT)).toBe(
      'event: reunions.invalidate\ndata: {"type":"reunions.invalidate","version":1,"reason":"initial"}\n\n',
    );
    expect(encodeReunionsEvent(REUNIONS_GENERIC_CHANGE_EVENT)).toBe(
      'event: reunions.invalidate\ndata: {"type":"reunions.invalidate","version":1,"reason":"change"}\n\n',
    );
    expect(encodeReunionsEvent(REUNIONS_GENERIC_CHANGE_EVENT)).not.toMatch(
      /reunionId|title|content|done|editor/i,
    );
  });

  it('falls back to an explicit generic change when descriptive metadata fails', () => {
    const publisher = new ReunionsEventPublisher();
    const listener = jest.fn();

    publisher.subscribe(listener);
    publisher.publishChangeSafely(() => {
      throw new Error('metadata unavailable');
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(REUNIONS_GENERIC_CHANGE_EVENT);
    publisher.onModuleDestroy();
  });

  it('uses the authenticated username and accepts only UUID source IDs', () => {
    expect(
      reunionsMutationContext(
        { id: 'user-uuid', username: 'María' },
        '6f9619ff-8b86-4d11-b42d-00cf4fc964ff',
      ),
    ).toEqual({
      actor: { kind: 'user', id: 'user-uuid', displayName: 'María' },
      sourceId: '6f9619ff-8b86-4d11-b42d-00cf4fc964ff',
    });
    expect(
      reunionsMutationContext(
        { id: 'user-uuid', username: 'María' },
        'arbitrary-client-label',
      ),
    ).toEqual({
      actor: { kind: 'user', id: 'user-uuid', displayName: 'María' },
    });
  });

  it('uses safe labels when a Reunion or Point title is blank', () => {
    expect(reunionReference({ id: 'reunion-id', titulo: '  ' })).toEqual({
      id: 'reunion-id',
      title: 'Reunión sin título',
    });
    expect(pointReference({ id: 'point-id', titulo: '' })).toEqual({
      id: 'point-id',
      title: 'Punto sin título',
    });
  });
});
