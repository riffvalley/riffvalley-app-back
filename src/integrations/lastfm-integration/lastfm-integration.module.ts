import { Module } from '@nestjs/common';
import { LastfmApiService } from './lastfm-api.service';

@Module({
  providers: [LastfmApiService],
  exports: [LastfmApiService],
})
export class LastfmIntegrationModule {}
