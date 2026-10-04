import { Module } from '@nestjs/common';
import { ArtistsService } from './artists.service';
import { ArtistsController } from './artists.controller';
import { Artist } from './entities/artist.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from '../discs/entities/disc.entity';
import { NationalRelease } from '../../national-releases/entities/national-release.entity';
import { AuthModule } from '../../auth/auth.module';
import { SpotifyPlaylistArtist } from '../../festival-playlists/entities/spotify-playlist-artist.entity';
import { ArtistManagementService } from './management/artist-management.service';
import { ArtistOrphansService } from './orphans/artist-orphans.service';
import { ArtistWriteService } from './write/artist-write.service';
import { ArtistCatalogService } from './catalog/artist-catalog.service';
import { ArtistSearchService } from './search/artist-search.service';
import { ArtistDetailsService } from './details/artist-details.service';

@Module({
  controllers: [ArtistsController],
  providers: [
    ArtistsService,
    ArtistCatalogService,
    ArtistWriteService,
    ArtistSearchService,
    ArtistDetailsService,
    ArtistManagementService,
    ArtistOrphansService,
  ],
  imports: [
    TypeOrmModule.forFeature([
      Artist,
      Disc,
      NationalRelease,
      SpotifyPlaylistArtist,
    ]),
    AuthModule,
  ],
})
export class ArtistsModule {}
