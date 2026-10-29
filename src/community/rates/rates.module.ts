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
import { ArtistsModule } from 'src/catalog/artists/artists.module';
import { LastfmIntegrationModule } from 'src/integrations/lastfm-integration/lastfm-integration.module';
import { RatesArtistLastfmController } from './lastfm/rates-artist-lastfm.controller';
import { RatesArtistLastfmService } from './lastfm/rates-artist-lastfm.service';
import { RatesDiscListReader } from './disc-list/rates-disc-list.reader';
import { RatesHistoricalCohortService } from './stats/rates-historical-cohort.service';
import { RatesHistoricalAggregationsService } from './stats/rates-historical-aggregations.service';
import { RatesEventSetCohortService } from './stats/rates-event-set-cohort.service';
import { RatesEventSetAggregationsService } from './stats/rates-event-set-aggregations.service';
import { RatesCurrentScoresService } from './stats/rates-current-scores.service';
import { RatesFeaturedDiscService } from './stats/rates-featured-disc.service';
import { RatesControversialDiscsService } from './stats/rates-controversial-discs.service';
import { RatesGalaxyDiscsService } from './stats/rates-galaxy-discs.service';
import { RatesAnnualStatisticsService } from './stats/rates-annual-statistics.service';

@Module({
  controllers: [RatesController, RatesArtistLastfmController], // Controladores que gestionan las rutas
  providers: [
    RatesService,
    RatesStatsService,
    RatesHistoricalCohortService,
    RatesHistoricalAggregationsService,
    RatesEventSetCohortService,
    RatesEventSetAggregationsService,
    RatesCurrentScoresService,
    RatesFeaturedDiscService,
    RatesControversialDiscsService,
    RatesGalaxyDiscsService,
    RatesAnnualStatisticsService,
    RatesHistoryService,
    HistoricalRatesStatsService,
    RatesRandomSelectionService,
    CommunityDashboardRatesService,
    RatesDashboardSummaryService,
    RatesArtistLastfmService,
    RatesDiscListReader,
  ],
  imports: [
    TypeOrmModule.forFeature([Rate, Disc, RateVoteEvent]),
    ArtistsModule,
    LastfmIntegrationModule,
    AuthorizationModule,
    UsersModule,
  ], // Registro de la entidad Rate en TypeORM
  exports: [
    RatesStatsService,
    RatesHistoricalCohortService,
    RatesHistoricalAggregationsService,
    RatesEventSetCohortService,
    RatesEventSetAggregationsService,
    RatesCurrentScoresService,
    RatesFeaturedDiscService,
    RatesControversialDiscsService,
    RatesGalaxyDiscsService,
    RatesAnnualStatisticsService,
    HistoricalRatesStatsService,
    RatesRandomSelectionService,
    CommunityDashboardRatesService,
    RatesDiscListReader,
  ],
})
export class RatesModule {}
