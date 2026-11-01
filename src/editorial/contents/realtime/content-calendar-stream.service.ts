import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { ContentCalendarEventPublisher } from './content-calendar-event-publisher.service';
import { encodeContentCalendarInvalidation } from './contracts/content-calendar-event.contract';

export const CONTENT_CALENDAR_HEARTBEAT_INTERVAL_MS = 25_000;
export const CONTENT_CALENDAR_MAX_STREAM_DURATION_MS = 10 * 60_000;

interface StreamRequest {
  readonly httpVersionMajor: number;
  once(event: 'aborted', listener: () => void): unknown;
  removeListener(event: 'aborted', listener: () => void): unknown;
}

interface StreamResponse {
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

type CloseReason =
  | 'client_abort'
  | 'client_disconnect'
  | 'response_finish'
  | 'write_error'
  | 'backpressure'
  | 'max_duration'
  | 'shutdown'
  | 'stream_setup_error';

interface ActiveStream {
  readonly request: StreamRequest;
  readonly response: StreamResponse;
  readonly unsubscribe: () => void;
  readonly requestAbortListener: () => void;
  readonly responseCloseListener: () => void;
  readonly responseErrorListener: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

@Injectable()
export class ContentCalendarStreamService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ContentCalendarStreamService.name);
  private readonly streams = new Set<ActiveStream>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private connectionsOpened = 0;
  private connectionsClosed = 0;
  private streamErrors = 0;

  constructor(private readonly publisher: ContentCalendarEventPublisher) {}

  open(request: StreamRequest, response: StreamResponse): void {
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
      this.streamErrors += 1;
      this.closeStream(stream, 'write_error', true);
    };

    const unsubscribe = this.publisher.subscribe(() => {
      if (stream) this.write(stream, encodeContentCalendarInvalidation());
    });

    const activeStream: ActiveStream = {
      request,
      response,
      unsubscribe,
      requestAbortListener: closeForClientAbort,
      responseCloseListener: closeForResponse,
      responseErrorListener: closeForError,
      timeout: null,
      closed: false,
    };
    stream = activeStream;
    this.streams.add(activeStream);
    this.connectionsOpened += 1;
    // IncomingMessage.close can mean request-body completion. Use aborted for
    // an incomplete client request and ServerResponse.close/finish for the stream.
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
        CONTENT_CALENDAR_MAX_STREAM_DURATION_MS,
      );
      this.write(activeStream, encodeContentCalendarInvalidation());
      if (!activeStream.closed) {
        this.logger.log(
          `event=content_calendar_sse_connected active=${this.streams.size}`,
        );
      }
    } catch {
      this.streamErrors += 1;
      this.closeStream(activeStream, 'stream_setup_error', true);
    }
  }

  getMetrics(): Readonly<{
    activeConnections: number;
    connectionsOpened: number;
    connectionsClosed: number;
    streamErrors: number;
  }> {
    return {
      activeConnections: this.streams.size,
      connectionsOpened: this.connectionsOpened,
      connectionsClosed: this.connectionsClosed,
      streamErrors: this.streamErrors,
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
    }, CONTENT_CALENDAR_HEARTBEAT_INTERVAL_MS);
  }

  private write(stream: ActiveStream, chunk: string): void {
    if (stream.closed) return;
    try {
      const accepted = stream.response.write(chunk);
      stream.response.flush?.();
      if (!accepted) this.closeStream(stream, 'backpressure', true);
    } catch {
      this.streamErrors += 1;
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
    this.connectionsClosed += 1;
    this.logger.log(
      `event=content_calendar_stream_closed reason=${reason} active=${this.streams.size}`,
    );
    this.stopHeartbeatIfIdle();

    if (endResponse && !stream.response.writableEnded) {
      try {
        stream.response.end();
      } catch {
        this.streamErrors += 1;
      }
    }
  }

  private stopHeartbeatIfIdle(): void {
    if (this.streams.size > 0 || !this.heartbeat) return;
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
