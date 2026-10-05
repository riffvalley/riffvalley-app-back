import {
  Controller,
  Get,
  Param,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SpotifyPublicApiService } from 'src/spotify-integration/api/spotify-public-api.service';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('spotify/albums')
export class SpotifyAlbumsController {
  constructor(private readonly spotifyApiService: SpotifyPublicApiService) {}

  @Get(':spotifyAlbumId/most-popular-track')
  getMostPopularTrack(@Param('spotifyAlbumId') spotifyAlbumId: string) {
    return this.spotifyApiService.getMostPopularAlbumTrack(spotifyAlbumId);
  }
}
