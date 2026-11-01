import { Logger } from '@nestjs/common';
import {
  ContentCalendarEventPublisher,
  createContentCalendarEvent,
} from '../content-calendar-event-publisher.service';
import {
  CONTENT_CALENDAR_GENERIC_CHANGE,
  CONTENT_CALENDAR_INVALIDATE_EVENT,
  contentCalendarCivilDate,
  contentCalendarMutationContext,
} from '../contracts/content-calendar-event.contract';
import { Content, ContentType } from '../../entities/content.entity';

const userActor = { kind: 'user', id: 'user-1', displayName: 'María' } as const;
const content = {
  id: 'content-1',
  name: 'Radar semanal',
  type: ContentType.RADAR,
  publicationDate: new Date('2026-11-01T00:00:00.000Z'),
} as Content;

describe('ContentCalendarEventPublisher', () => {
  it('publishes typed v2 events to every current subscriber', () => {
    const publisher = new ContentCalendarEventPublisher();
    const event = createContentCalendarEvent({
      action: 'moved',
      content,
      actor: userActor,
      sourceId: 'tabA',
      previousDate: new Date('2026-10-30T00:00:00.000Z'),
    });
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = publisher.subscribe(first);
    const unsubscribeSecond = publisher.subscribe(second);

    publisher.publish(event);

    expect(event).toEqual({
      type: CONTENT_CALENDAR_INVALIDATE_EVENT,
      version: 2,
      reason: 'change',
      action: 'moved',
      actor: userActor,
      content: { id: 'content-1', title: 'Radar semanal' },
      sourceId: 'tabA',
      changes: { previousDate: '2026-10-30', newDate: '2026-11-01' },
    });
    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);
    expect(JSON.stringify(event)).not.toMatch(
      /notes|email|password|token|author/,
    );
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

    publisher.publish(CONTENT_CALENDAR_GENERIC_CHANGE);
    publisher.subscribe(lateSubscriber);
    otherPublisher.subscribe(isolatedSubscriber);
    expect(lateSubscriber).not.toHaveBeenCalled();
    expect(isolatedSubscriber).not.toHaveBeenCalled();

    publisher.publish(CONTENT_CALENDAR_GENERIC_CHANGE);
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
    publisher.publish(CONTENT_CALENDAR_GENERIC_CHANGE);

    expect(listener).not.toHaveBeenCalled();
    expect(publisher.getMetrics().activeSubscribers).toBe(0);
    publisher.onModuleDestroy();
  });

  it('contains event construction failures and emits a generic v2 invalidation', () => {
    const publisher = new ContentCalendarEventPublisher();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const listener = jest.fn();
    publisher.subscribe(listener);
    publisher.publishChangeSafely(() => {
      throw new Error('incomplete metadata');
    }, CONTENT_CALENDAR_GENERIC_CHANGE);

    expect(listener).toHaveBeenCalledWith(CONTENT_CALENDAR_GENERIC_CHANGE);
    expect(loggerError).toHaveBeenCalledWith(
      'event=content_calendar_event_publish_failed',
    );
    publisher.onModuleDestroy();
  });

  it('publishes a generic v2 invalidation when descriptive emission fails', () => {
    const publisher = new ContentCalendarEventPublisher();
    const listener = jest.fn();
    publisher.subscribe(listener);
    jest.spyOn(publisher, 'publish').mockImplementationOnce(() => {
      throw new Error('event transport failed');
    });
    const descriptiveEvent = createContentCalendarEvent({
      action: 'created',
      content,
      actor: userActor,
    });

    publisher.publishChangeSafely(
      descriptiveEvent,
      CONTENT_CALENDAR_GENERIC_CHANGE,
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(CONTENT_CALENDAR_GENERIC_CHANGE);
    publisher.onModuleDestroy();
  });

  it.each([
    [
      'created',
      null,
      new Date('2026-10-30T12:00:00.000Z'),
      { newDate: '2026-10-30' },
    ],
    [
      'updated',
      new Date('2026-10-30T12:00:00.000Z'),
      new Date('2026-10-30T12:00:00.000Z'),
      { fields: ['title'] },
    ],
    [
      'scheduled',
      null,
      new Date('2026-11-01T00:00:00.000Z'),
      { newDate: '2026-11-01' },
    ],
    [
      'moved',
      new Date('2026-10-31T12:00:00.000Z'),
      new Date('2026-11-01T12:00:00.000Z'),
      { previousDate: '2026-10-31', newDate: '2026-11-01' },
    ],
    [
      'unscheduled',
      new Date('2026-10-31T12:00:00.000Z'),
      null,
      { previousDate: '2026-10-31' },
    ],
    [
      'deleted',
      new Date('2026-10-31T12:00:00.000Z'),
      null,
      { previousDate: '2026-10-31' },
    ],
  ] as const)(
    'builds the required v2 properties for %s',
    (action, previousDate, nextDate, changes) => {
      const event = createContentCalendarEvent({
        action,
        content: {
          ...content,
          publicationDate: nextDate ?? undefined,
        } as Content,
        actor: userActor,
        previousDate,
        fields: ['title'],
      });
      expect(event).toMatchObject({
        type: CONTENT_CALENDAR_INVALIDATE_EVENT,
        version: 2,
        reason: 'change',
        action,
        changes,
      });
    },
  );

  it('identifies automated operations with an explicit system identity', () => {
    const event = createContentCalendarEvent({
      action: 'created',
      content,
      actor: { kind: 'system', displayName: 'Scheduler' },
    });
    expect(event).toMatchObject({
      actor: { kind: 'system', displayName: 'Scheduler' },
    });
  });

  it('builds actor identity from the authenticated public username and filters source IDs by format', () => {
    expect(
      contentCalendarMutationContext(
        { id: 'user-7', username: 'María' },
        'tab_1-ephemeral',
      ),
    ).toEqual({
      actor: { kind: 'user', id: 'user-7', displayName: 'María' },
      sourceId: 'tab_1-ephemeral',
    });
    expect(
      contentCalendarMutationContext(
        { id: 'user-7', username: 'María' },
        'tab id with spaces',
      ),
    ).toEqual({ actor: { kind: 'user', id: 'user-7', displayName: 'María' } });
  });

  it('keeps the persisted ISO civil date without local timezone conversion', () => {
    expect(contentCalendarCivilDate(new Date('2026-11-01T23:30:00.000Z'))).toBe(
      '2026-11-01',
    );
  });

  it.each(Object.values(ContentType))(
    'resolves the calendar title for %s',
    (type) => {
      const event = createContentCalendarEvent({
        action: 'created',
        content: { ...content, type } as Content,
        actor: userActor,
      });
      expect(event).toMatchObject({ content: { title: 'Radar semanal' } });
    },
  );

  it('requires real dates for date transition actions', () => {
    expect(() =>
      createContentCalendarEvent({
        action: 'scheduled',
        content: { ...content, publicationDate: undefined } as Content,
        actor: userActor,
      }),
    ).toThrow('scheduled_content_requires_date');
  });

  it('uses safe type descriptors when Content has no display name', () => {
    const event = createContentCalendarEvent({
      action: 'created',
      content: { ...content, name: '  ' } as Content,
      actor: userActor,
    });
    expect(event).toMatchObject({ content: { title: 'Radar' } });
  });
});
