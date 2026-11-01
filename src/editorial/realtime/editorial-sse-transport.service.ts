import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';

export interface SseRequest {
  readonly httpVersionMajor: number;
  once(event: 'aborted', listener: () => void): unknown;
  removeListener(event: 'aborted', listener: () => void): unknown;
}

export interface SseResponse {
  statusCode: number;
  readonly writableEnded: boolean;
  setHeader(name: string, value: string): unknown;
  flushHeaders(): void;
  write(chunk: string): boolean;
  end(): unknown;
  once(event: 'close' | 'finish', listener: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  removeListener(event: 'close' | 'finish', listener: () => void): unknown;
  removeListener(event: 'error', listener: (error: Error) => void): unknown;
  flush?: () => void;
}

interface ActiveStream {
  readonly request: SseRequest;
  readonly response: SseResponse;
  readonly unsubscribe: () => void;
  readonly requestAbortListener: () => void;
  readonly responseCloseListener: () => void;
  readonly responseErrorListener: (error: Error) => void;
  readonly domain: string;
  timeout: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

type CloseReason =
  | 'client_abort'
  | 'client_disconnect'
  | 'response_finish'
  | 'write_error'
  | 'backpressure'
  | 'max_duration'
  | 'shutdown'
  | 'stream_setup_error';

export const EDITORIAL_SSE_HEARTBEAT_INTERVAL_MS = 25_000;
export const EDITORIAL_SSE_MAX_STREAM_DURATION_MS = 10 * 60_000;

@Injectable()
export class EditorialSseTransport implements BeforeApplicationShutdown {
  private readonly logger = new Logger(EditorialSseTransport.name);
  private readonly streams = new Set<ActiveStream>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly metrics = new Map<
    string,
    { opened: number; closed: number; errors: number }
  >();

  open<Event>(input: {
    readonly domain: string;
    readonly request: SseRequest;
    readonly response: SseResponse;
    readonly subscribe: (listener: (event: Event) => void) => () => void;
    readonly encode: (event: Event) => string;
    readonly initialEvent: Event;
  }): void {
    const { request, response, domain } = input;
    let stream: ActiveStream | null = null;
    const closeForClientAbort = () => {
      if (stream) this.closeStream(stream, 'client_abort', false);
    };
    const closeForResponse = () => {
      if (!stream) return;
      this.closeStream(
        stream,
        response.writableEnded ? 'response_finish' : 'client_disconnect',
        false,
      );
    };
    const closeForError = () => {
      if (!stream) return;
      this.incrementMetric(domain, 'errors');
      this.closeStream(stream, 'write_error', true);
    };
    const unsubscribe = input.subscribe((event) => {
      if (stream) this.write(stream, input.encode(event));
    });
    const activeStream: ActiveStream = {
      request,
      response,
      unsubscribe,
      requestAbortListener: closeForClientAbort,
      responseCloseListener: closeForResponse,
      responseErrorListener: closeForError,
      domain,
      timeout: null,
      closed: false,
    };
    stream = activeStream;
    this.streams.add(activeStream);
    this.incrementMetric(domain, 'opened');
    request.once('aborted', closeForClientAbort);
    response.once('close', closeForResponse);
    response.once('finish', closeForResponse);
    response.once('error', closeForError);
    this.startHeartbeat();

    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      if (request.httpVersionMajor === 1) {
        response.setHeader('Connection', 'keep-alive');
      }
      response.flushHeaders();
      activeStream.timeout = setTimeout(
        () => this.closeStream(activeStream, 'max_duration', true),
        EDITORIAL_SSE_MAX_STREAM_DURATION_MS,
      );
      this.write(activeStream, input.encode(input.initialEvent));
      if (!activeStream.closed) {
        this.logger.log(
          `event=${domain}_sse_connected active=${this.streams.size}`,
        );
      }
    } catch {
      this.incrementMetric(domain, 'errors');
      this.closeStream(activeStream, 'stream_setup_error', true);
    }
  }

  getMetrics(domain?: string): Readonly<{
    activeConnections: number;
    connectionsOpened: number;
    connectionsClosed: number;
    streamErrors: number;
  }> {
    const entries = domain
      ? [this.metrics.get(domain)].filter(
          (
            entry,
          ): entry is { opened: number; closed: number; errors: number } =>
            entry !== undefined,
        )
      : [...this.metrics.values()];
    return {
      activeConnections: [...this.streams].filter(
        (stream) => !domain || stream.domain === domain,
      ).length,
      connectionsOpened: entries.reduce((sum, entry) => sum + entry.opened, 0),
      connectionsClosed: entries.reduce((sum, entry) => sum + entry.closed, 0),
      streamErrors: entries.reduce((sum, entry) => sum + entry.errors, 0),
    };
  }

  beforeApplicationShutdown(): void {
    for (const stream of [...this.streams]) {
      this.closeStream(stream, 'shutdown', true);
    }
    this.stopHeartbeatIfIdle();
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const stream of [...this.streams]) {
        this.write(stream, ': heartbeat\n\n');
      }
    }, EDITORIAL_SSE_HEARTBEAT_INTERVAL_MS);
  }

  private write(stream: ActiveStream, chunk: string): void {
    if (stream.closed) return;
    try {
      const accepted = stream.response.write(chunk);
      stream.response.flush?.();
      if (!accepted) this.closeStream(stream, 'backpressure', true);
    } catch {
      this.incrementMetric(stream.domain, 'errors');
      this.closeStream(stream, 'write_error', true);
    }
  }

  private closeStream(
    stream: ActiveStream,
    reason: CloseReason,
    endResponse: boolean,
  ): void {
    if (stream.closed) return;
    stream.closed = true;
    stream.unsubscribe();
    if (stream.timeout) clearTimeout(stream.timeout);
    stream.timeout = null;
    stream.request.removeListener('aborted', stream.requestAbortListener);
    stream.response.removeListener('close', stream.responseCloseListener);
    stream.response.removeListener('finish', stream.responseCloseListener);
    stream.response.removeListener('error', stream.responseErrorListener);
    this.streams.delete(stream);
    this.incrementMetric(stream.domain, 'closed');
    this.logger.log(
      `event=${stream.domain}_stream_closed reason=${reason} active=${this.streams.size}`,
    );
    this.stopHeartbeatIfIdle();
    if (endResponse && !stream.response.writableEnded) {
      try {
        stream.response.end();
      } catch {
        this.incrementMetric(stream.domain, 'errors');
      }
    }
  }

  private stopHeartbeatIfIdle(): void {
    if (this.streams.size > 0 || !this.heartbeat) return;
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private incrementMetric(
    domain: string,
    metric: 'opened' | 'closed' | 'errors',
  ): void {
    const current = this.metrics.get(domain) ?? {
      opened: 0,
      closed: 0,
      errors: 0,
    };
    current[metric] += 1;
    this.metrics.set(domain, current);
  }
}
