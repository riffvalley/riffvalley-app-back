import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WordpressService } from './wordpress.service';
import { SpotifyApiService } from './spotify-api.service';

@Module({
  imports: [ConfigModule],
  providers: [WordpressService, SpotifyApiService],
  exports: [WordpressService, SpotifyApiService],
})
export class WordpressModule {}
