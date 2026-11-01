import { Injectable } from '@nestjs/common';
import {
  EditorialSseTransport,
  SseRequest,
  SseResponse,
} from 'src/editorial/realtime/editorial-sse-transport.service';
import { ListsEventPublisher } from './lists-event-publisher.service';
import {
  encodeListsEvent,
  LISTS_INITIAL_EVENT,
} from './contracts/lists-event.contract';

@Injectable()
export class ListsStreamService {
  constructor(
    private readonly publisher: ListsEventPublisher,
    private readonly transport: EditorialSseTransport,
  ) {}

  open(request: SseRequest, response: SseResponse): void {
    this.transport.open({
      domain: 'lists',
      request,
      response,
      subscribe: (listener) => this.publisher.subscribe(listener),
      encode: encodeListsEvent,
      initialEvent: LISTS_INITIAL_EVENT,
    });
  }

  getMetrics(): ReturnType<EditorialSseTransport['getMetrics']> {
    return this.transport.getMetrics('lists');
  }
}
