import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artist } from '../entities/artist.entity';
import { Disc } from '../../discs/entities/disc.entity';
import { normalizeForSearch } from '../helpers/normalize-for-search';
import {
  ArtistDiscProjection,
  DiscRateProjectionRaw,
  mapDiscProjection,
} from '../helpers/map-disc-projection';

function isDuplicateKeyError(
  error: unknown,
): error is { code: '23505'; detail: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'detail' in error &&
    typeof error.detail === 'string'
  );
}

@Injectable()
export class ArtistSearchService {
  private readonly logger = new Logger('ArtistService');

  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
  ) {}

  async findByName(name: string) {
    if (!name) {
      throw new BadRequestException('Name parameter is required');
    }

    const q = `%${normalizeForSearch(name)}%`;

    try {
      const artists = await this.artistRepository
        .createQueryBuilder('artist')
        .leftJoinAndSelect('artist.country', 'country')
        .where('artist.name_normalized LIKE :q', { q })
        .orderBy('artist.name', 'ASC')
        .getMany();

      if (artists.length === 0) return [];

      const artistIds = artists.map((artist) => artist.id);

      const discsRaw = await this.discRepository
        .createQueryBuilder('disc')
        .leftJoinAndSelect('disc.genre', 'genre')
        .leftJoinAndSelect('disc.artist', 'discArtist')
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
        .where('discArtist.id IN (:...artistIds)', { artistIds })
        .orderBy('disc.releaseDate', 'DESC')
        .getRawAndEntities<DiscRateProjectionRaw>();

      const discsByArtist = new Map<string, ArtistDiscProjection[]>();
      discsRaw.entities.forEach((disc, index) => {
        const artistId = disc.artist?.id;
        if (!artistId) return;
        if (!discsByArtist.has(artistId)) discsByArtist.set(artistId, []);
        discsByArtist
          .get(artistId)
          .push(mapDiscProjection(disc, discsRaw.raw[index]));
      });

      return artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
        description: artist.description,
        image: artist.image,
        country: artist.country ?? null,
        discs: discsByArtist.get(artist.id) ?? [],
      }));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new BadRequestException(error.detail);
      }
      this.logger.error(error);
      throw new InternalServerErrorException('ayuda', error);
    }
  }
}
