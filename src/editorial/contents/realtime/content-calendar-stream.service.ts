import { Injectable } from '@nestjs/common';
import {
  EDITORIAL_SSE_HEARTBEAT_INTERVAL_MS,
  EDITORIAL_SSE_MAX_STREAM_DURATION_MS,
  EditorialSseTransport,
  SseRequest,
  SseResponse,
} from 'src/editorial/realtime/editorial-sse-transport.service';
import { ContentCalendarEventPublisher } from './content-calendar-event-publisher.service';
import {
  CONTENT_CALENDAR_INVALIDATE_EVENT,
  ContentCalendarEvent,
  encodeContentCalendarEvent,
} from './contracts/content-calendar-event.contract';

const INITIAL_SYNC_EVENT: ContentCalendarEvent = {
  type: CONTENT_CALENDAR_INVALIDATE_EVENT,
  version: 2,
  reason: 'initial',
};

export const CONTENT_CALENDAR_HEARTBEAT_INTERVAL_MS =
  EDITORIAL_SSE_HEARTBEAT_INTERVAL_MS;
export const CONTENT_CALENDAR_MAX_STREAM_DURATION_MS =
  EDITORIAL_SSE_MAX_STREAM_DURATION_MS;

@Injectable()
export class ContentCalendarStreamService {
  constructor(
    private readonly publisher: ContentCalendarEventPublisher,
    private readonly transport: EditorialSseTransport,
  ) {}

  open(request: SseRequest, response: SseResponse): void {
    this.transport.open({
      domain: 'content_calendar',
      request,
      response,
      subscribe: (listener) => this.publisher.subscribe(listener),
      encode: encodeContentCalendarEvent,
      initialEvent: INITIAL_SYNC_EVENT,
    });
  }

  getMetrics(): ReturnType<EditorialSseTransport['getMetrics']> {
    return this.transport.getMetrics('content_calendar');
  }

  beforeApplicationShutdown(): void {
    this.transport.beforeApplicationShutdown();
  }
}
