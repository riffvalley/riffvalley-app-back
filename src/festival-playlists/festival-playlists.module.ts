import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { SpotifyConnection } from './entities/spotify-connection.entity';
import { FestivalPlaylistsController } from './festival-playlists.controller';
import { FestivalPlaylistsService } from './festival-playlists.service';
import { TokenCryptoService } from './token-crypto.service';
import { SpotifyPlaylistArtist } from './entities/spotify-playlist-artist.entity';
import { Spotify } from 'src/spotify/entities/spotify.entity';
import { Artist } from 'src/artists/entities/artist.entity';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      SpotifyConnection,
      SpotifyPlaylistArtist,
      Spotify,
      Artist,
    ]),
    AuthModule,
    MailModule,
  ],
  controllers: [FestivalPlaylistsController],
  providers: [FestivalPlaylistsService, TokenCryptoService],
})
export class FestivalPlaylistsModule {}
