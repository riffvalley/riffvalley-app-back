import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { RatesArtistLastfmService } from './rates-artist-lastfm.service';

@Controller('rates/artists')
export class RatesArtistLastfmController {
  constructor(
    private readonly ratesArtistLastfmService: RatesArtistLastfmService,
  ) {}

  @Get(':artistId/lastfm')
  @Auth()
  getArtistInfo(@Param('artistId', ParseUUIDPipe) artistId: string) {
    return this.ratesArtistLastfmService.getArtistInfo(artistId);
  }
}
