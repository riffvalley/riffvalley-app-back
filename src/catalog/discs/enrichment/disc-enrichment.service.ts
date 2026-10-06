import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Disc } from '../entities/disc.entity';
import { getFridayWeekRanges } from '../shared/helpers/get-friday-week-ranges';

@Injectable()
export class DiscEnrichmentService {
  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
  ) {}

  async findWeeklyWithoutImage(month: number, year: number, week?: number): Promise<{ id: string; artistName: string; name: string }[]> {
    const weekRanges = getFridayWeekRanges(month, year);
    const filtered = weekRanges.filter((w) => week === undefined || w.week === week);
    if (!filtered.length) return [];

    const pad = (n: number) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month)}-${pad(filtered[0].from)}`;
    const end   = `${year}-${pad(month)}-${pad(filtered[filtered.length - 1].to)}`;

    const discs = await this.discRepository
      .createQueryBuilder('disc')
      .leftJoin('disc.artist', 'artist')
      .select('disc.id', 'id')
      .addSelect('disc.name', 'name')
      .addSelect('artist.name', 'artistName')
      .where('disc.releaseDate BETWEEN :start AND :end', { start, end })
      .andWhere('(disc.image IS NULL OR disc.image = :empty)', { empty: '' })
      .orderBy('disc.releaseDate', 'ASC')
      .getRawMany();

    return discs.map((disc) => ({
      id: disc.id,
      artistName: disc.artistName ?? '',
      name: disc.name,
    }));
  }

  async updateImage(id: string, image: string): Promise<void> {
    await this.discRepository.update(id, { image });
  }
}
