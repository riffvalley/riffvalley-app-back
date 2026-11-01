import { Module } from '@nestjs/common';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { ContentCalendarEventsController } from './content-calendar-events.controller';
import { ContentCalendarEventPublisher } from './content-calendar-event-publisher.service';
import { ContentCalendarStreamService } from './content-calendar-stream.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [ContentCalendarEventsController],
  providers: [ContentCalendarEventPublisher, ContentCalendarStreamService],
  exports: [ContentCalendarEventPublisher],
})
export class ContentCalendarRealtimeModule {}
