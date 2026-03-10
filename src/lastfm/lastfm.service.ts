import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

@Injectable()
export class LastfmService {
  private readonly apiKey = process.env.LASTFM_API_KEY;

  async getArtistInfo(artist: string): Promise<object> {
    if (!this.apiKey) throw new InternalServerErrorException('LASTFM_API_KEY not configured');

    const url = `${LASTFM_BASE}?method=artist.getinfo&artist=${encodeURIComponent(artist)}&api_key=${this.apiKey}&format=json`;

    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException(`Last.fm responded with ${res.status}`);

    const data = await res.json() as any;
    if (data.error) throw new BadRequestException(data.message ?? 'Last.fm error');

    return data.artist;
  }
}
