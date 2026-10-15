import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/identity/auth/auth.module';
import { FestivalPlaylistsController } from './festival-playlists.controller';
import { FestivalPlaylistsService } from './festival-playlists.service';
import { RiffValleyPlaylistArtist } from './entities/riff-valley-playlist-artist.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { MailModule } from 'src/communications/mail/mail.module';
import { GenrePlaylistsController } from './genre-playlists.controller';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      RiffValleyPlaylistArtist,
      RiffValleyPlaylist,
      Artist,
    ]),
    AuthModule,
    MailModule,
    SpotifyIntegrationModule,
  ],
  controllers: [FestivalPlaylistsController, GenrePlaylistsController],
  providers: [FestivalPlaylistsService],
})
export class FestivalPlaylistsModule {}
