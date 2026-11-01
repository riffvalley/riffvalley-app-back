import { EventEmitter } from 'node:events';
import {
  EDITORIAL_SSE_HEARTBEAT_INTERVAL_MS,
  EDITORIAL_SSE_MAX_STREAM_DURATION_MS,
  EditorialSseTransport,
  SseRequest,
  SseResponse,
} from 'src/editorial/realtime/editorial-sse-transport.service';
import { ListsEventPublisher } from '../lists-event-publisher.service';
import { ListsStreamService } from '../lists-stream.service';

class MockRequest extends EventEmitter implements SseRequest {
  readonly httpVersionMajor = 1;
}

class MockResponse extends EventEmitter implements SseResponse {
  statusCode = 0;
  writableEnded = false;
  readonly headers = new Map<string, string>();
  readonly chunks: string[] = [];

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  flushHeaders(): void {}

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): void {
    this.writableEnded = true;
  }
}

describe('ListsStreamService', () => {
  let publisher: ListsEventPublisher;
  let transport: EditorialSseTransport;
  let service: ListsStreamService;

  beforeEach(() => {
    jest.useFakeTimers();
    publisher = new ListsEventPublisher();
    transport = new EditorialSseTransport();
    service = new ListsStreamService(publisher, transport);
  });

  afterEach(() => {
    transport.beforeApplicationShutdown();
    publisher.onModuleDestroy();
    jest.useRealTimers();
  });

  it('uses the shared heartbeat and ten-minute maximum connection lifetime', async () => {
    const request = new MockRequest();
    const response = new MockResponse();
    service.open(request, response);

    expect(response.chunks[0]).toBe(
      'event: lists.invalidate\ndata: {"type":"lists.invalidate","version":1,"reason":"initial"}\n\n',
    );
    await jest.advanceTimersByTimeAsync(EDITORIAL_SSE_HEARTBEAT_INTERVAL_MS);
    expect(response.chunks).toContain(': heartbeat\n\n');
    expect(publisher.getMetrics().activeSubscribers).toBe(1);

    await jest.advanceTimersByTimeAsync(
      EDITORIAL_SSE_MAX_STREAM_DURATION_MS -
        EDITORIAL_SSE_HEARTBEAT_INTERVAL_MS,
    );
    expect(response.writableEnded).toBe(true);
    expect(service.getMetrics().activeConnections).toBe(0);
    expect(publisher.getMetrics().activeSubscribers).toBe(0);
  });

  it('cleans up listeners and publisher subscription after a client disconnect', () => {
    const request = new MockRequest();
    const response = new MockResponse();
    service.open(request, response);
    expect(service.getMetrics().activeConnections).toBe(1);
    expect(publisher.getMetrics().activeSubscribers).toBe(1);

    request.emit('aborted');

    expect(service.getMetrics().activeConnections).toBe(0);
    expect(publisher.getMetrics().activeSubscribers).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});
