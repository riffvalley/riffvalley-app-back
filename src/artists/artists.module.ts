import { Module } from '@nestjs/common';
import { ArtistsService } from './artists.service';
import { ArtistsController } from './artists.controller';
import { Artist } from './entities/artist.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from '../discs/entities/disc.entity';
import { NationalRelease } from '../national-releases/entities/national-release.entity';
import { AuthModule } from '../auth/auth.module';
import { SpotifyPlaylistArtist } from '../festival-playlists/entities/spotify-playlist-artist.entity';

@Module({
  controllers: [ArtistsController],
  providers: [ArtistsService],
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
