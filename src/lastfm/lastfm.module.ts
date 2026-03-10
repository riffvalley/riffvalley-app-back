import { Module } from '@nestjs/common';
import { LastfmController } from './lastfm.controller';
import { LastfmService } from './lastfm.service';
import { DiscModule } from 'src/discs/discs.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [DiscModule, AuthModule],
  controllers: [LastfmController],
  providers: [LastfmService],
})
export class LastfmModule {}
