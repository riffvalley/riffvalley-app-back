import {
  Controller,
  Get,
  Param,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SpotifyApiService } from 'src/wordpress/spotify-api.service';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('spotify/albums')
export class SpotifyAlbumsController {
  constructor(private readonly spotifyApiService: SpotifyApiService) {}

  @Get(':spotifyAlbumId/most-popular-track')
  getMostPopularTrack(@Param('spotifyAlbumId') spotifyAlbumId: string) {
    return this.spotifyApiService.getMostPopularAlbumTrack(spotifyAlbumId);
  }
}
