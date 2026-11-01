import { Module } from '@nestjs/common';
import { EditorialSseTransport } from './editorial-sse-transport.service';

@Module({
  providers: [EditorialSseTransport],
  exports: [EditorialSseTransport],
})
export class EditorialRealtimeModule {}
