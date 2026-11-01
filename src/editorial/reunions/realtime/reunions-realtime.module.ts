import { Module } from '@nestjs/common';
import { EditorialRealtimeModule } from 'src/editorial/realtime/editorial-realtime.module';
import { ReunionsEventPublisher } from './reunions-event-publisher.service';
import { ReunionsStreamService } from './reunions-stream.service';

@Module({
  imports: [EditorialRealtimeModule],
  providers: [ReunionsEventPublisher, ReunionsStreamService],
  exports: [ReunionsEventPublisher, ReunionsStreamService],
})
export class ReunionsRealtimeModule {}
