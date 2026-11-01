import { EventEmitter } from 'node:events';
import { ContentCalendarEventPublisher } from '../content-calendar-event-publisher.service';
import {
  CONTENT_CALENDAR_HEARTBEAT_INTERVAL_MS,
  CONTENT_CALENDAR_MAX_STREAM_DURATION_MS,
  ContentCalendarStreamService,
} from '../content-calendar-stream.service';
import { encodeContentCalendarInvalidation } from '../contracts/content-calendar-event.contract';

class FakeRequest extends EventEmitter {
  constructor(readonly httpVersionMajor = 1) {
    super();
  }
}

class FakeResponse extends EventEmitter {
  statusCode = 0;
  writableEnded = false;
  readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];
  headersFlushed = false;
  writeAccepted = true;
  flushCount = 0;

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  flushHeaders(): void {
    this.headersFlushed = true;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return this.writeAccepted;
  }

  flush(): void {
    this.flushCount += 1;
  }

  end(): this {
    this.writableEnded = true;
    this.emit('finish');
    return this;
  }
}

describe('ContentCalendarStreamService', () => {
  let publisher: ContentCalendarEventPublisher;
  let service: ContentCalendarStreamService;

  beforeEach(() => {
    jest.useFakeTimers();
    publisher = new ContentCalendarEventPublisher();
    service = new ContentCalendarStreamService(publisher);
  });

  afterEach(() => {
    service.beforeApplicationShutdown();
    publisher.onModuleDestroy();
    jest.useRealTimers();
  });

  function openConnection() {
    const request = new FakeRequest();
    const response = new FakeResponse();
    service.open(request, response);
    return { request, response };
  }

  it('writes SSE headers and the exact initial invalidation immediately', () => {
    const { response } = openConnection();

    expect(response.statusCode).toBe(200);
    expect(response.headersFlushed).toBe(true);
    expect(response.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe(
      'no-cache, no-transform',
    );
    expect(response.headers.get('connection')).toBe('keep-alive');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(response.chunks).toEqual([encodeContentCalendarInvalidation()]);
    expect(response.chunks[0]).toBe(
      'event: contents.invalidate\ndata: {"type":"contents.invalidate","version":1}\n\n',
    );
    expect(response.chunks[0]).not.toContain('id:');
    expect(response.chunks[0]).not.toMatch(
      /notes|author|title|publicationDate/i,
    );
    expect(service.getMetrics().activeConnections).toBe(1);
    expect(publisher.getMetrics().activeSubscribers).toBe(1);
  });

  it('shares one heartbeat timer and does not publish a data event for it', () => {
    const first = openConnection();
    const second = openConnection();

    expect(jest.getTimerCount()).toBe(3);
    jest.advanceTimersByTime(CONTENT_CALENDAR_HEARTBEAT_INTERVAL_MS);

    expect(first.response.chunks[first.response.chunks.length - 1]).toBe(
      ': heartbeat\n\n',
    );
    expect(second.response.chunks[second.response.chunks.length - 1]).toBe(
      ': heartbeat\n\n',
    );
    expect(first.response.chunks).toHaveLength(2);
    expect(second.response.chunks).toHaveLength(2);
    expect(first.response.flushCount).toBe(2);
  });

  it('delivers publisher invalidations to current streams only', () => {
    const { response } = openConnection();

    publisher.publishInvalidation();

    expect(response.chunks).toEqual([
      encodeContentCalendarInvalidation(),
      encodeContentCalendarInvalidation(),
    ]);
  });

  it.each(['aborted', 'close'])(
    'releases the subscriber, listeners and heartbeat after %s',
    (event) => {
      const { request, response } = openConnection();

      if (event === 'aborted') request.emit(event);
      else response.emit(event);

      expect(service.getMetrics()).toMatchObject({
        activeConnections: 0,
        connectionsOpened: 1,
        connectionsClosed: 1,
      });
      expect(publisher.getMetrics().activeSubscribers).toBe(0);
      expect(request.listenerCount('aborted')).toBe(0);
      expect(response.listenerCount('close')).toBe(0);
      expect(response.listenerCount('finish')).toBe(0);
      expect(response.listenerCount('error')).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('does not treat the completed request close event as a closed response stream', () => {
    const { request, response } = openConnection();

    request.emit('close');

    expect(service.getMetrics().activeConnections).toBe(1);
    expect(publisher.getMetrics().activeSubscribers).toBe(1);

    response.emit('close');
    expect(service.getMetrics().activeConnections).toBe(0);
  });

  it('closes and cleans up at the ten-minute maximum duration', () => {
    const { response } = openConnection();

    jest.advanceTimersByTime(CONTENT_CALENDAR_MAX_STREAM_DURATION_MS);

    expect(response.writableEnded).toBe(true);
    expect(service.getMetrics()).toMatchObject({
      activeConnections: 0,
      connectionsClosed: 1,
    });
    expect(publisher.getMetrics().activeSubscribers).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('closes a response whose write reports backpressure', () => {
    const request = new FakeRequest();
    const response = new FakeResponse();
    response.writeAccepted = false;

    service.open(request, response);

    expect(response.writableEnded).toBe(true);
    expect(service.getMetrics().activeConnections).toBe(0);
    expect(publisher.getMetrics().activeSubscribers).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cleans every resource across repeated reconnects', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { response } = openConnection();
      response.emit('close');
      expect(service.getMetrics().activeConnections).toBe(0);
      expect(publisher.getMetrics().activeSubscribers).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }

    expect(service.getMetrics()).toMatchObject({
      connectionsOpened: 5,
      connectionsClosed: 5,
    });
  });

  it('cleans up after a response write error and during application shutdown', () => {
    const errored = openConnection();
    errored.response.emit('error', new Error('test stream error'));

    expect(service.getMetrics().activeConnections).toBe(0);
    expect(service.getMetrics().streamErrors).toBe(1);

    const remaining = openConnection();
    service.beforeApplicationShutdown();

    expect(remaining.response.writableEnded).toBe(true);
    expect(service.getMetrics().activeConnections).toBe(0);
    expect(publisher.getMetrics().activeSubscribers).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not set the HTTP/1 Connection header on newer protocol versions', () => {
    const request = new FakeRequest(2);
    const response = new FakeResponse();

    service.open(request, response);

    expect(response.headers.has('connection')).toBe(false);
    response.emit('close');
  });
});
