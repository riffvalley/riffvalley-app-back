import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artist } from '../entities/artist.entity';
import { normalizeForSearch } from '../helpers/normalize-for-search';

@Injectable()
export class ArtistOrphansService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
  ) {}

  async countForManagement(query?: string, needsReview?: boolean) {
    const orphanCountQb = this.artistRepository
      .createQueryBuilder('artist')
      .leftJoin('artist.disc', 'disc')
      .where('disc.id IS NULL')
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM national_release nr WHERE LOWER(nr."artistName") = LOWER(artist.name))`,
      )
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM spotify_playlist_artists spa WHERE spa.artist_id = artist.id)',
      );

    if (query) {
      orphanCountQb.andWhere('artist.name_normalized LIKE :q', {
        q: `%${normalizeForSearch(query)}%`,
      });
    }
    if (needsReview !== undefined) {
      orphanCountQb.andWhere('artist.needsReview = :needsReview', {
        needsReview,
      });
    }

    return orphanCountQb.getCount();
  }

  async removeOrphanArtists(): Promise<{ deleted: number; artists: string[] }> {
    const orphans = await this.artistRepository
      .createQueryBuilder('artist')
      .leftJoin('artist.disc', 'disc')
      .where('disc.id IS NULL')
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM national_release nr WHERE LOWER(nr."artistName") = LOWER(artist.name))`,
      )
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM spotify_playlist_artists spa WHERE spa.artist_id = artist.id)',
      )
      .getMany();

    if (!orphans.length) return { deleted: 0, artists: [] };

    const names = orphans.map((artist) => artist.name);
    await this.artistRepository.remove(orphans);
    return { deleted: names.length, artists: names };
  }
}
