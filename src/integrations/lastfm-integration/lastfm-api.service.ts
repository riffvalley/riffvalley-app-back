import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  LastfmAlbumResponse,
  LastfmArtistResponse,
} from './types/lastfm-api.types';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

@Injectable()
export class LastfmApiService {
  private readonly apiKey = process.env.LASTFM_API_KEY;

  assertConfigured(): void {
    if (!this.apiKey) {
      throw new InternalServerErrorException('LASTFM_API_KEY not configured');
    }
  }

  async getArtistInfo(artist: string): Promise<object> {
    this.assertConfigured();

    const url = this.buildUrl('artist.getinfo', { artist });
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException(`Last.fm responded with ${response.status}`);
    }

    const data = (await response.json()) as LastfmArtistResponse;
    if (data.error) {
      throw new BadRequestException(data.message ?? 'Last.fm error');
    }

    return data.artist;
  }

  async getAlbumImage(artist: string, album: string): Promise<string | null> {
    this.assertConfigured();

    try {
      const url = this.buildUrl('album.getinfo', { artist, album });
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = (await response.json()) as LastfmAlbumResponse;
      if (data.error || !data.album?.image) return null;

      const preferred = ['mega', 'extralarge', 'large'];
      for (const size of preferred) {
        const found = data.album.image.find(
          (image) => image.size === size && image['#text'],
        );
        if (found) return found['#text'];
      }
      return null;
    } catch {
      return null;
    }
  }

  private buildUrl(
    method: string,
    params: Record<string, string>,
  ): string {
    const query = [
      `method=${method}`,
      ...Object.entries(params).map(
        ([key, value]) => `${key}=${encodeURIComponent(value)}`,
      ),
      `api_key=${this.apiKey}`,
      'format=json',
    ];
    return `${LASTFM_BASE}?${query.join('&')}`;
  }
}
