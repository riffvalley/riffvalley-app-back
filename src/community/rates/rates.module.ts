import { Module } from '@nestjs/common';
import { RatesService } from './rates.service';
import { RatesController } from './rates.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rate } from './entities/rate.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { RatesStatsService } from './stats/rates-stats.service';
import { RatesHistoryService } from './history/rates-history.service';
import { UsersModule } from 'src/identity/users/users.module';
import { RateVoteEvent } from './entities/rate-vote-event.entity';
import { HistoricalRatesStatsService } from './stats/historical-rates-stats.service';
import { RatesRandomSelectionService } from './random-selection/rates-random-selection.service';
import { CommunityDashboardRatesService } from './stats/community-dashboard-rates.service';
import { RatesDashboardSummaryService } from './stats/rates-dashboard-summary.service';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { LastfmIntegrationModule } from 'src/integrations/lastfm-integration/lastfm-integration.module';
import { RatesArtistLastfmController } from './lastfm/rates-artist-lastfm.controller';
import { RatesArtistLastfmService } from './lastfm/rates-artist-lastfm.service';

@Module({
  controllers: [RatesController, RatesArtistLastfmController], // Controladores que gestionan las rutas
  providers: [
    RatesService,
    RatesStatsService,
    RatesHistoryService,
    HistoricalRatesStatsService,
    RatesRandomSelectionService,
    CommunityDashboardRatesService,
    RatesDashboardSummaryService,
    RatesArtistLastfmService,
  ],
  imports: [
    TypeOrmModule.forFeature([Rate, Disc, RateVoteEvent, Artist]),
    LastfmIntegrationModule,
    AuthorizationModule,
    UsersModule,
  ], // Registro de la entidad Rate en TypeORM
  exports: [
    RatesStatsService,
    HistoricalRatesStatsService,
    RatesRandomSelectionService,
    CommunityDashboardRatesService,
  ],
})
export class RatesModule {}
