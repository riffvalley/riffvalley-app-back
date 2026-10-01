import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentsModule } from 'src/contents/contents.module';
import { Spotify } from './entities/spotify.entity';
import { SpotifyService } from './spotify.service';
import { SpotifyController } from './spotify.controller';
import { SpotifyArtistsController } from './spotify-artists.controller';
import { SpotifyAlbumsController } from './spotify-albums.controller';
import { WordpressModule } from 'src/wordpress/wordpress.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Spotify]),
    ContentsModule,
    WordpressModule,
  ],
  controllers: [
    SpotifyController,
    SpotifyArtistsController,
    SpotifyAlbumsController,
  ],
  providers: [SpotifyService],
})
export class SpotifyModule {}
