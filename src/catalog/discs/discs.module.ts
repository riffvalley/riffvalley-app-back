import { Module } from '@nestjs/common';
import { DiscsService } from './discs.service';
import { DiscsController } from './discs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from './entities/disc.entity';
import { Artist } from '../artists/entities/artist.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { AuthModule } from 'src/identity/auth/auth.module';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';
import { DiscCatalogService } from './catalog/disc-catalog.service';
import { DiscCalendarService } from './calendar/disc-calendar.service';
import { DiscEnrichmentService } from './enrichment/disc-enrichment.service';
import { DiscWriteService } from './write/disc-write.service';
import { DiscSpotifyService } from './spotify/disc-spotify.service';
import { DiscHomeService } from './home/disc-home.service';
import { DiscLinkMaintenanceService } from './maintenance/disc-link-maintenance.service';

@Module({
  controllers: [DiscsController],
  providers: [
    DiscsService,
    DiscCatalogService,
    DiscCalendarService,
    DiscEnrichmentService,
    DiscWriteService,
    DiscSpotifyService,
    DiscHomeService,
    DiscLinkMaintenanceService,
  ],
  imports: [
    TypeOrmModule.forFeature([Disc, Artist, Genre, Country]),
    AuthModule,
    SpotifyIntegrationModule,
  ],
  exports: [DiscsService, DiscLinkMaintenanceService],
})
export class DiscModule {}
