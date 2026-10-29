import { Module } from '@nestjs/common';
import { ArtistsService } from './artists.service';
import { ArtistsController } from './artists.controller';
import { Artist } from './entities/artist.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from '../discs/entities/disc.entity';
import { NationalRelease } from '../../editorial/national-releases/entities/national-release.entity';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { RiffValleyPlaylistArtist } from '../../editorial/playlists/spotify-playlists/entities/riff-valley-playlist-artist.entity';
import { ArtistManagementService } from './management/artist-management.service';
import { ArtistOrphansService } from './orphans/artist-orphans.service';
import { ArtistWriteService } from './write/artist-write.service';
import { ArtistCatalogService } from './catalog/artist-catalog.service';
import { ArtistSearchService } from './search/artist-search.service';
import { ArtistDetailsService } from './details/artist-details.service';
import { ArtistDirectoryService } from './directory/artist-directory.service';
import { ArtistImageFillService } from './images/artist-image-fill.service';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';

@Module({
  controllers: [ArtistsController],
  providers: [
    ArtistsService,
    ArtistCatalogService,
    ArtistWriteService,
    ArtistSearchService,
    ArtistDetailsService,
    ArtistDirectoryService,
    ArtistImageFillService,
    ArtistManagementService,
    ArtistOrphansService,
  ],
  imports: [
    TypeOrmModule.forFeature([
      Artist,
      Disc,
      NationalRelease,
      RiffValleyPlaylistArtist,
    ]),
    AuthorizationModule,
    SpotifyIntegrationModule,
  ],
  exports: [ArtistCatalogService],
})
export class ArtistsModule {}
