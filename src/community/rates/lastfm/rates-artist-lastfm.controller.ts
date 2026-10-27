import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { RatesArtistLastfmService } from './rates-artist-lastfm.service';

@Controller('rates/artists')
export class RatesArtistLastfmController {
  constructor(
    private readonly ratesArtistLastfmService: RatesArtistLastfmService,
  ) {}

  @Get(':artistId/lastfm')
  @Auth()
  getArtistInfo(
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @GetUser() user: User,
  ) {
    return this.ratesArtistLastfmService.getArtistInfo(artistId, user.id);
  }
}
