import {
  Controller,
  Get,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SpotifyApiService } from 'src/wordpress/spotify-api.service';
import { SearchSpotifyArtistQueryDto } from './dto/search-spotify-artist-query.dto';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('spotify/artists')
export class SpotifyArtistsController {
  constructor(private readonly spotifyApiService: SpotifyApiService) {}

  @Get('search')
  findArtist(@Query() query: SearchSpotifyArtistQueryDto) {
    return this.spotifyApiService.findArtist(query.artistName);
  }

  @Get('search/multiple')
  findArtistCandidates(@Query() query: SearchSpotifyArtistQueryDto) {
    return this.spotifyApiService.findArtistCandidates(query.artistName);
  }

  @Get(':spotifyId/top-tracks')
  getTopTracks(@Param('spotifyId') spotifyId: string) {
    return this.spotifyApiService.getArtistTopTracks(spotifyId);
  }

  @Get(':spotifyId/images')
  async getImageCandidates(@Param('spotifyId') spotifyId: string) {
    return {
      spotifyId,
      imageCandidates:
        await this.spotifyApiService.getArtistImageCandidates(spotifyId),
    };
  }
}
