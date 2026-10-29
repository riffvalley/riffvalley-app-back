import { Module } from '@nestjs/common';
import { DiscsService } from './discs.service';
import { DiscsController } from './discs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from './entities/disc.entity';
import { Artist } from '../artists/entities/artist.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';
import { DiscCatalogService } from './catalog/disc-catalog.service';
import { DiscCalendarService } from './calendar/disc-calendar.service';
import { DiscEnrichmentService } from './enrichment/disc-enrichment.service';
import { DiscWriteService } from './write/disc-write.service';
import { DiscSpotifyService } from './spotify/disc-spotify.service';
import { DiscTopService } from './top/disc-top.service';
import { DiscLinkMaintenanceService } from './maintenance/disc-link-maintenance.service';
import { RatesModule } from 'src/community/rates/rates.module';
import { CommentsModule } from 'src/community/comments/comments.module';
import { FavoritesModule } from 'src/community/favorites/favorites.module';
import { PendingsModule } from 'src/community/pendings/pendings.module';
import { DiscListService } from './list/disc-list.service';
import { DiscListSuggestionsService } from './suggestions/disc-list-suggestions.service';
import { SavedDiscFiltersController } from './list/saved-filters/saved-disc-filters.controller';
import { SavedDiscFiltersService } from './list/saved-filters/saved-disc-filters.service';
import { SavedDiscFilter } from './list/saved-filters/entities/saved-disc-filter.entity';

@Module({
  controllers: [DiscsController, SavedDiscFiltersController],
  providers: [
    DiscsService,
    DiscCatalogService,
    DiscCalendarService,
    DiscEnrichmentService,
    DiscWriteService,
    DiscSpotifyService,
    DiscTopService,
    DiscLinkMaintenanceService,
    DiscListService,
    DiscListSuggestionsService,
    SavedDiscFiltersService,
  ],
  imports: [
    TypeOrmModule.forFeature([Disc, Artist, Genre, Country, SavedDiscFilter]),
    AuthorizationModule,
    SpotifyIntegrationModule,
    RatesModule,
    CommentsModule,
    FavoritesModule,
    PendingsModule,
  ],
  exports: [DiscsService, DiscLinkMaintenanceService, DiscCatalogService],
})
export class DiscModule {}
