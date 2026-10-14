import { Injectable } from '@nestjs/common';
import { DiscsService } from 'src/catalog/discs/discs.service';
import { LastfmApiService } from 'src/integrations/lastfm-integration/lastfm-api.service';

@Injectable()
export class LastfmService {
  constructor(
    private readonly discsService: DiscsService,
    private readonly lastfmApiService: LastfmApiService,
  ) {}

  getArtistInfo(artist: string): Promise<object> {
    return this.lastfmApiService.getArtistInfo(artist);
  }

  async fillWeeklyImages(month: number, year: number, week?: number): Promise<{ updated: number; notFound: string[] }> {
    this.lastfmApiService.assertConfigured();

    const discs = await this.discsService.findWeeklyWithoutImage(month, year, week);
    if (!discs.length) return { updated: 0, notFound: [] };

    const notFound: string[] = [];
    let updated = 0;

    await Promise.all(
      discs.map(async (disc) => {
        const image = await this.lastfmApiService.getAlbumImage(
          disc.artistName,
          disc.name,
        );
        if (image) {
          await this.discsService.updateImage(disc.id, image);
          updated++;
        } else {
          notFound.push(`${disc.artistName} - ${disc.name}`);
        }
      }),
    );

    return { updated, notFound };
  }
}
