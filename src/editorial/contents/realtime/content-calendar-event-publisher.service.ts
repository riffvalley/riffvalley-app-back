import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import {
  CONTENT_CALENDAR_INVALIDATION,
  ContentCalendarInvalidationEvent,
} from './contracts/content-calendar-event.contract';

@Injectable()
export class ContentCalendarEventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(ContentCalendarEventPublisher.name);
  private readonly events = new Subject<ContentCalendarInvalidationEvent>();
  private activeSubscribers = 0;
  private publishedEvents = 0;

  subscribe(
    listener: (event: ContentCalendarInvalidationEvent) => void,
  ): () => void {
    const subscription = this.events.subscribe(listener);
    this.activeSubscribers += 1;
    let subscribed = true;

    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscription.unsubscribe();
      this.activeSubscribers = Math.max(0, this.activeSubscribers - 1);
    };
  }

  publishInvalidation(): void {
    this.publishedEvents += 1;
    this.logger.log(
      `event=content_calendar_invalidation count=${this.publishedEvents}`,
    );
    this.events.next(CONTENT_CALENDAR_INVALIDATION);
  }

  publishInvalidationSafely(): void {
    try {
      this.publishInvalidation();
    } catch {
      this.logger.error('event=content_calendar_invalidation_publish_failed');
    }
  }

  getMetrics(): Readonly<{
    activeSubscribers: number;
    publishedEvents: number;
  }> {
    return {
      activeSubscribers: this.activeSubscribers,
      publishedEvents: this.publishedEvents,
    };
  }

  onModuleDestroy(): void {
    this.events.complete();
    this.activeSubscribers = 0;
  }
}
