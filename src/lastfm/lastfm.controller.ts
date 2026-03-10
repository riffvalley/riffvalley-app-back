import { Controller, Get, Query } from '@nestjs/common';
import { LastfmService } from './lastfm.service';

@Controller('lastfm')
export class LastfmController {
  constructor(private readonly lastfmService: LastfmService) {}

  @Get('artist')
  getArtistInfo(@Query('artist') artist: string) {
    return this.lastfmService.getArtistInfo(artist);
  }
}
