import { Module } from '@nestjs/common';
import { LastfmController } from './lastfm.controller';
import { LastfmService } from './lastfm.service';

@Module({
  controllers: [LastfmController],
  providers: [LastfmService],
})
export class LastfmModule {}
