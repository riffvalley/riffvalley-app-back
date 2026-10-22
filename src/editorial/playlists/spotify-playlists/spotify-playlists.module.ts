import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { FestivalPlaylistsController } from './festival-playlists.controller';
import { SpotifyPlaylistsService } from './spotify-playlists.service';
import { RiffValleyPlaylistArtist } from './entities/riff-valley-playlist-artist.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { GenrePlaylistsController } from './genre-playlists.controller';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';
import { SpotifyPlaylistAuthorizationService } from './spotify-authorization/spotify-playlist-authorization.service';
import { FestivalSetlistService } from './setlist/festival-setlist.service';
import { SpotifyPlaylistManagementService } from './management/spotify-playlist-management.service';
import { SpotifyPlaylistArtistSyncService } from './artist-sync/spotify-playlist-artist-sync.service';
import { SpotifyPlaylistTrackMaintenanceService } from './track-maintenance/spotify-playlist-track-maintenance.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      RiffValleyPlaylistArtist,
      RiffValleyPlaylist,
      Artist,
    ]),
    AuthorizationModule,
    SpotifyIntegrationModule,
  ],
  controllers: [FestivalPlaylistsController, GenrePlaylistsController],
  providers: [
    SpotifyPlaylistsService,
    SpotifyPlaylistAuthorizationService,
    FestivalSetlistService,
    SpotifyPlaylistManagementService,
    SpotifyPlaylistArtistSyncService,
    SpotifyPlaylistTrackMaintenanceService,
  ],
})
export class SpotifyPlaylistsModule {}
