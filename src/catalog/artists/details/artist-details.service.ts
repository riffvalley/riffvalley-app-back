import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artist } from '../entities/artist.entity';
import { Disc } from '../../discs/entities/disc.entity';
import { NationalRelease } from '../../../national-releases/entities/national-release.entity';

@Injectable()
export class ArtistDetailsService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    @InjectRepository(NationalRelease)
    private readonly nationalReleaseRepository: Repository<NationalRelease>,
  ) {}

  async findOneWithDetails(id: string) {
    const artist = await this.artistRepository.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!artist) throw new NotFoundException(`Artist with id ${id} not found`);

    const [discs, nationalReleases] = await Promise.all([
      this.discRepository
        .createQueryBuilder('disc')
        .leftJoinAndSelect('disc.genre', 'genre')
        .addSelect(
          (sub) =>
            sub
              .select('COUNT(rate.id)', 'rateCount')
              .from('rate', 'rate')
              .where('rate.discId = disc.id AND rate.rate IS NOT NULL'),
          'rateCount',
        )
        .addSelect(
          (sub) =>
            sub
              .select('AVG(rate.rate)', 'averageRate')
              .from('rate', 'rate')
              .where('rate.discId = disc.id AND rate.rate IS NOT NULL'),
          'averageRate',
        )
        .where('disc.artistId = :id', { id })
        .orderBy('disc.releaseDate', 'DESC')
        .getRawAndEntities(),

      this.nationalReleaseRepository
        .createQueryBuilder('nr')
        .where('LOWER(nr.artistName) = LOWER(:name)', { name: artist.name })
        .orderBy('nr.releaseDay', 'DESC')
        .getMany(),
    ]);

    const processedDiscs = discs.entities.map((disc, index) => ({
      id: disc.id,
      name: disc.name,
      releaseDate: disc.releaseDate,
      ep: disc.ep,
      debut: disc.debut,
      image: disc.image,
      link: disc.link,
      genre: disc.genre
        ? { id: disc.genre.id, name: disc.genre.name, color: disc.genre.color }
        : null,
      rateCount: parseInt(discs.raw[index].rateCount, 10) || 0,
      averageRate:
        discs.raw[index].averageRate != null
          ? parseFloat(discs.raw[index].averageRate)
          : null,
    }));

    return {
      id: artist.id,
      name: artist.name,
      description: artist.description,
      image: artist.image,
      country: artist.country ?? null,
      discs: processedDiscs,
      nationalReleases: nationalReleases.map((release) => ({
        id: release.id,
        discName: release.discName,
        discType: release.discType,
        genre: release.genre,
        releaseDay: release.releaseDay,
        approved: release.approved,
        link: release.link,
        discId: release.discId,
      })),
    };
  }
}
