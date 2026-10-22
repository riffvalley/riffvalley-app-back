import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpotifyPublicApiService } from './api/spotify-public-api.service';
import { SpotifyClientCredentialsService } from './api/spotify-client-credentials.service';
import { SpotifyAlbumsController } from './http/spotify-albums.controller';
import { SpotifyArtistsController } from './http/spotify-artists.controller';
import { SpotifyConnection } from './oauth/spotify-connection.entity';
import { SpotifyAccountApiService } from './oauth/spotify-account-api.service';
import { SpotifyOAuthApiService } from './oauth/spotify-oauth-api.service';
import { TokenCryptoService } from './oauth/token-crypto.service';
import { SpotifyConnectionService } from './oauth/spotify-connection.service';
import { MailModule } from 'src/communications/mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SpotifyConnection]),
    MailModule,
  ],
  controllers: [SpotifyArtistsController, SpotifyAlbumsController],
  providers: [
    SpotifyPublicApiService,
    SpotifyClientCredentialsService,
    SpotifyOAuthApiService,
    SpotifyAccountApiService,
    TokenCryptoService,
    SpotifyConnectionService,
  ],
  exports: [
    SpotifyPublicApiService,
    SpotifyClientCredentialsService,
    SpotifyOAuthApiService,
    SpotifyAccountApiService,
    SpotifyConnectionService,
  ],
})
export class SpotifyIntegrationModule {}
