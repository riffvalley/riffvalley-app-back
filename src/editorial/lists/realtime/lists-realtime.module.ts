import { Module } from '@nestjs/common';
import { EditorialRealtimeModule } from 'src/editorial/realtime/editorial-realtime.module';
import { ListsEventPublisher } from './lists-event-publisher.service';
import { ListsStreamService } from './lists-stream.service';

@Module({
  imports: [EditorialRealtimeModule],
  providers: [ListsEventPublisher, ListsStreamService],
  exports: [ListsEventPublisher, ListsStreamService],
})
export class ListsRealtimeModule {}
