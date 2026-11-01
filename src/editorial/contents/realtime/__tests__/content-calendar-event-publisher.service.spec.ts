import { Logger } from '@nestjs/common';
import { ContentCalendarEventPublisher } from '../content-calendar-event-publisher.service';
import { CONTENT_CALENDAR_INVALIDATION } from '../contracts/content-calendar-event.contract';

describe('ContentCalendarEventPublisher', () => {
  it('publishes invalidations to every current subscriber', () => {
    const publisher = new ContentCalendarEventPublisher();
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = publisher.subscribe(first);
    const unsubscribeSecond = publisher.subscribe(second);

    publisher.publishInvalidation();

    expect(first).toHaveBeenCalledWith(CONTENT_CALENDAR_INVALIDATION);
    expect(second).toHaveBeenCalledWith(CONTENT_CALENDAR_INVALIDATION);
    expect(publisher.getMetrics()).toEqual({
      activeSubscribers: 2,
      publishedEvents: 1,
    });

    unsubscribeFirst();
    unsubscribeSecond();
    publisher.onModuleDestroy();
  });

  it('does not replay old events to new subscribers and isolates publisher instances', () => {
    const publisher = new ContentCalendarEventPublisher();
    const otherPublisher = new ContentCalendarEventPublisher();
    const lateSubscriber = jest.fn();
    const isolatedSubscriber = jest.fn();

    publisher.publishInvalidation();
    publisher.subscribe(lateSubscriber);
    otherPublisher.subscribe(isolatedSubscriber);

    expect(lateSubscriber).not.toHaveBeenCalled();
    expect(isolatedSubscriber).not.toHaveBeenCalled();

    publisher.publishInvalidation();

    expect(lateSubscriber).toHaveBeenCalledTimes(1);
    expect(isolatedSubscriber).not.toHaveBeenCalled();
    publisher.onModuleDestroy();
    otherPublisher.onModuleDestroy();
  });

  it('stops notifying a subscriber after its unsubscribe callback runs', () => {
    const publisher = new ContentCalendarEventPublisher();
    const listener = jest.fn();
    const unsubscribe = publisher.subscribe(listener);

    unsubscribe();
    unsubscribe();
    publisher.publishInvalidation();

    expect(listener).not.toHaveBeenCalled();
    expect(publisher.getMetrics().activeSubscribers).toBe(0);
    publisher.onModuleDestroy();
  });

  it('logs and contains a failure from the post-commit publication API', () => {
    const publisher = new ContentCalendarEventPublisher();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(publisher, 'publishInvalidation').mockImplementation(() => {
      throw new Error('transport failed');
    });

    expect(() => publisher.publishInvalidationSafely()).not.toThrow();
    expect(loggerError).toHaveBeenCalledWith(
      'event=content_calendar_invalidation_publish_failed',
    );
    publisher.onModuleDestroy();
  });
});
