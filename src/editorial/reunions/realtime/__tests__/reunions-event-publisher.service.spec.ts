import { ReunionsEventPublisher } from '../reunions-event-publisher.service';
import {
  encodeReunionsEvent,
  REUNIONS_CHANGE_EVENT,
  REUNIONS_INITIAL_EVENT,
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
    expect(encodeReunionsEvent(REUNIONS_CHANGE_EVENT)).toBe(
      'event: reunions.invalidate\ndata: {"type":"reunions.invalidate","version":1,"reason":"change"}\n\n',
    );
    expect(encodeReunionsEvent(REUNIONS_CHANGE_EVENT)).not.toMatch(
      /reunionId|title|content|done|editor/i,
    );
  });
});
