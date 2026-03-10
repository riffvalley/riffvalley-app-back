import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DiscsService } from 'src/discs/discs.service';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

@Injectable()
export class LastfmService {
  private readonly apiKey = process.env.LASTFM_API_KEY;

  constructor(private readonly discsService: DiscsService) {}

  async getArtistInfo(artist: string): Promise<object> {
    if (!this.apiKey) throw new InternalServerErrorException('LASTFM_API_KEY not configured');

    const url = `${LASTFM_BASE}?method=artist.getinfo&artist=${encodeURIComponent(artist)}&api_key=${this.apiKey}&format=json`;

    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException(`Last.fm responded with ${res.status}`);

    const data = await res.json() as any;
    if (data.error) throw new BadRequestException(data.message ?? 'Last.fm error');

    return data.artist;
  }

  async getWeeklyImages(month: number, year: number, week?: number) {
    if (!this.apiKey) throw new InternalServerErrorException('LASTFM_API_KEY not configured');

    const weekly = await this.discsService.findWeekly(month, year, week);

    const results = await Promise.all(
      weekly.map(async (weekData: any) => {
        const discsWithImages = await Promise.all(
          weekData.discs.map(async (disc: any) => {
            const image = await this.fetchAlbumImage(disc.artistName, disc.name);
            return { ...disc, lastfmImage: image };
          }),
        );
        return { ...weekData, discs: discsWithImages };
      }),
    );

    return results;
  }

  private async fetchAlbumImage(artist: string, album: string): Promise<string | null> {
    try {
      const url = `${LASTFM_BASE}?method=album.getinfo&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&api_key=${this.apiKey}&format=json`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json() as any;
      if (data.error || !data.album?.image) return null;

      // Last.fm images ordered: small, medium, large, extralarge, mega
      // Pick the largest non-empty one
      const images: { '#text': string; size: string }[] = data.album.image;
      const preferred = ['mega', 'extralarge', 'large'];
      for (const size of preferred) {
        const found = images.find((img) => img.size === size && img['#text']);
        if (found) return found['#text'];
      }
      return null;
    } catch {
      return null;
    }
  }
}
