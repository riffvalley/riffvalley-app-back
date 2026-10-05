import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SpotifyPublicApiService } from 'src/spotify-integration/api/spotify-public-api.service';
import { ListSpotifyArtistAlbumsQueryDto } from './dto/list-spotify-artist-albums.query.dto';
import { SearchSpotifyArtistQueryDto } from './dto/search-spotify-artist-query.dto';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('spotify/artists')
export class SpotifyArtistsController {
  constructor(private readonly spotifyApiService: SpotifyPublicApiService) {}

  @Get('search')
  async findArtist(@Query() query: SearchSpotifyArtistQueryDto) {
    const artist = await this.spotifyApiService.findArtist(query.artistName);
    if (!artist)
      throw new NotFoundException('Artista no encontrado en Spotify');
    return artist;
  }

  @Get('search/multiple')
  findArtistCandidates(@Query() query: SearchSpotifyArtistQueryDto) {
    return this.spotifyApiService.findArtistCandidates(query.artistName);
  }

  @Get(':spotifyId/top-tracks')
  getTopTracks(@Param('spotifyId') spotifyId: string) {
    return this.spotifyApiService.getArtistTopTracks(spotifyId);
  }

  @Get(':spotifyId/albums')
  getAlbums(
    @Param('spotifyId') spotifyId: string,
    @Query() query: ListSpotifyArtistAlbumsQueryDto,
  ) {
    return this.spotifyApiService.getArtistAlbums(
      spotifyId,
      query.include_groups,
      query.limit,
    );
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
