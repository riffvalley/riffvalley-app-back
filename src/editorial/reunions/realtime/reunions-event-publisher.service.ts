import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import {
  REUNIONS_CHANGE_EVENT,
  ReunionsEvent,
} from './contracts/reunions-event.contract';

@Injectable()
export class ReunionsEventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(ReunionsEventPublisher.name);
  private readonly events = new Subject<ReunionsEvent>();
  private activeSubscribers = 0;
  private publishedEvents = 0;

  subscribe(listener: (event: ReunionsEvent) => void): () => void {
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

  publishChangeSafely(): void {
    try {
      this.publishedEvents += 1;
      this.events.next(REUNIONS_CHANGE_EVENT);
      this.logger.log(`event=reunions_event count=${this.publishedEvents}`);
    } catch {
      this.logger.error('event=reunions_event_publish_failed');
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
