import { Module } from '@nestjs/common';
import { LastfmController } from './lastfm.controller';
import { LastfmService } from './lastfm.service';
import { DiscModule } from 'src/discs/discs.module';

@Module({
  imports: [DiscModule],
  controllers: [LastfmController],
  providers: [LastfmService],
})
export class LastfmModule {}
