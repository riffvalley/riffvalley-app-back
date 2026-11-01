import { Injectable } from '@nestjs/common';
import {
  EditorialSseTransport,
  SseRequest,
  SseResponse,
} from 'src/editorial/realtime/editorial-sse-transport.service';
import { ReunionsEventPublisher } from './reunions-event-publisher.service';
import {
  encodeReunionsEvent,
  REUNIONS_INITIAL_EVENT,
} from './contracts/reunions-event.contract';

@Injectable()
export class ReunionsStreamService {
  constructor(
    private readonly publisher: ReunionsEventPublisher,
    private readonly transport: EditorialSseTransport,
  ) {}

  open(request: SseRequest, response: SseResponse): void {
    this.transport.open({
      domain: 'reunions',
      request,
      response,
      subscribe: (listener) => this.publisher.subscribe(listener),
      encode: encodeReunionsEvent,
      initialEvent: REUNIONS_INITIAL_EVENT,
    });
  }

  getMetrics(): ReturnType<EditorialSseTransport['getMetrics']> {
    return this.transport.getMetrics('reunions');
  }
}
