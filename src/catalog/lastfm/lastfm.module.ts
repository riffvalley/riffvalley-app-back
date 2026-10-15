import { Module } from '@nestjs/common';
import { LastfmController } from './lastfm.controller';
import { LastfmService } from './lastfm.service';
import { DiscModule } from 'src/catalog/discs/discs.module';
import { AuthModule } from 'src/identity/auth/auth.module';
import { LastfmIntegrationModule } from 'src/integrations/lastfm-integration/lastfm-integration.module';

@Module({
  imports: [DiscModule, AuthModule, LastfmIntegrationModule],
  controllers: [LastfmController],
  providers: [LastfmService],
})
export class LastfmModule {}
