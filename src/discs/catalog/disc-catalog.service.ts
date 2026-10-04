import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Disc } from '../entities/disc.entity';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { RandomQueryDto } from '../dto/random-query.dto';
import { OptionsQueryDto } from '../dto/options-query.dto';
import { User } from 'src/auth/entities/user.entity';
import { indexCatalogRawRows } from './helpers/catalog-raw-rows';
import { mapCatalogDisc } from './helpers/map-catalog-disc';
import { mapOptionRows } from './helpers/map-option-rows';
import { restoreRandomDiscOrder } from './helpers/restore-random-disc-order';

const FIND_ALL_ORDER_FIELDS: Record<string, string> = {
  'disc.releaseDate': 'disc.releaseDate',
  'artist.name': 'artist.name',
  'disc.createdAt': 'disc.createdAt',
  'disc.name': 'disc.name',
  'disc.averageRate': 'averagerate',
};
const FIND_ALL_AVERAGE_RATE_FILTER =
  'EXISTS (SELECT 1 FROM rate r WHERE r."discId" = disc.id AND r.rate IS NOT NULL)';

@Injectable()
export class DiscCatalogService {
  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
  ) { }

  async findOne(id: string): Promise<Disc> {
    try {
      const disc = await this.discRepository.findOneOrFail({
        where: { id },
        relations: {
          artist: { country: true },
          genre: true,
          favorites: { user: true },
          pendings: { user: true },
          comments: { user: true },
        },
      });
      return disc;
    } catch (error) {
      throw new NotFoundException(`Disc with id ${id} not found`);
    }
  }

  async findAll(paginationDto: PaginationDto, user: User) {
    const { limit = 10, offset = 0, query, dateRange, genre, country, countryId, voted, votedType } = paginationDto;
    const countryFilter = country || countryId;
    const userId = user.id;

    const today = new Date();

    // Calcula el rango de fechas si se especifica el mes
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (dateRange && dateRange.length === 2) {
      [startDate, endDate] = dateRange; // Extrae las fechas directamente del array
    }

    const queryBuilder = this.discRepository
      .createQueryBuilder('disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoinAndSelect('disc.genre', 'genre')
      .leftJoinAndSelect('disc.rates', 'rate', 'rate.userId = :userId', {
        userId,
      })
      .leftJoinAndSelect(
        'disc.favorites',
        'favorite',
        'favorite.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect(
        'disc.pendings',
        'pending',
        'pending.userId = :userId',
        { userId },
      )
      .addSelect('disc.id', 'discId')
      .addSelect((subQuery) => {
        return subQuery
          .select('AVG(rate.rate)', 'averageRate')
          .from('rate', 'rate')
          .where('rate.discId = disc.id');
      }, 'averagerate')
      .addSelect((subQuery) => {
        return subQuery
          .select('AVG(rate.cover)', 'averageCover')
          .from('rate', 'rate')
          .where('rate.discId = disc.id');
      }, 'averageCover')
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(rate.id)', 'rateCount')
          .from('rate', 'rate')
          .where('rate.discId = disc.id AND rate.rate IS NOT NULL');
      }, 'rateCount')
      .where('disc.releaseDate <= :today', { today })
      // Agrega el conteo de comentarios para cada disco
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(comment.id)', 'commentCount')
          .from('comment', 'comment')
          .where('comment.discId = disc.id');
      }, 'commentCount')
      .where('disc.releaseDate <= :today', { today });

    const totalItemsQueryBuilder = this.discRepository
      .createQueryBuilder('disc')
      .leftJoin('disc.artist', 'artist')
      .where('disc.releaseDate <= :today', { today })
      .leftJoin('artist.country', 'country');

    // Solo los filtros voted necesitan la relación rate en la consulta de count.
    if (voted === 'false' || (voted as any) === false || voted === 'true' || (voted as any) === true) {
      totalItemsQueryBuilder.leftJoin('disc.rates', 'rate', 'rate.userId = :userId', { userId });
    }

    const filterOptions = { genre, countryFilter, query, startDate, endDate, voted, votedType };
    this.applyFindAllFilters(queryBuilder, filterOptions);
    this.applyFindAllFilters(totalItemsQueryBuilder, filterOptions);


    if (paginationDto.orderBy) {
      const sortParts = paginationDto.orderBy.split(',');
      let excludesDiscsWithoutAverageRate = false;

      sortParts.forEach((part) => {
        const [field, direction] = part.split(':');
        if (field && direction) {
          const dbField = FIND_ALL_ORDER_FIELDS[field];
          if (dbField) {
            if (field === 'disc.averageRate' && !excludesDiscsWithoutAverageRate) {
              [queryBuilder, totalItemsQueryBuilder].forEach((builder) =>
                builder.andWhere(FIND_ALL_AVERAGE_RATE_FILTER),
              );
              excludesDiscsWithoutAverageRate = true;
            }
            queryBuilder.addOrderBy(dbField, direction.toUpperCase() as 'ASC' | 'DESC');
          }
        }
      });
    } else {
      queryBuilder
        .orderBy('disc.releaseDate', 'DESC')
        .addOrderBy('artist.name', 'ASC');
    }

    queryBuilder
      .take(limit)
      .skip(offset);
    const { entities: discs, raw } = await queryBuilder.getRawAndEntities();

    const rawByDiscId = indexCatalogRawRows(raw);
    const processedDiscs = discs.map((disc) =>
      mapCatalogDisc(disc, rawByDiscId.get(disc.id)!),
    );

    const totalItems = await totalItemsQueryBuilder.getCount();
    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: processedDiscs,
    };
  }

  private applyFindAllFilters(
    queryBuilder: SelectQueryBuilder<Disc>,
    filters: {
      genre?: string;
      countryFilter?: string;
      query?: string;
      startDate?: Date;
      endDate?: Date;
      voted?: string | boolean;
      votedType?: string;
    },
  ): void {
    const { genre, countryFilter, query, startDate, endDate, voted, votedType } = filters;

    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (countryFilter) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
      queryBuilder.andWhere(
        isUUID ? 'country.id = :countryFilter' : 'country.name = :countryFilter',
        { countryFilter },
      );
    }

    if (query) {
      const search = `%${query}%`;
      queryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)',
        { search },
      );
    }

    if (startDate && endDate) {
      queryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    }

    if (voted === 'false' || (voted as any) === false) {
      queryBuilder.andWhere(
        votedType === 'cover' ? 'rate.cover IS NULL' : 'rate.rate IS NULL',
      );
    } else if (voted === 'true' || (voted as any) === true) {
      queryBuilder.andWhere(
        votedType === 'cover' ? 'rate.cover IS NOT NULL' : 'rate.rate IS NOT NULL',
      );
    }
  }

  async findRandom(dto: RandomQueryDto, user: User) {
    const { genre, year, ep, debut, limit = 5 } = dto;
    const countryFilter = dto.country || dto.countryId;
    const userId = user.id;
    const today = new Date();

    // Selecciona primero IDs aleatorios; une artista/país solo si hay filtro de país.
    // La hidratación posterior carga las relaciones para esos IDs.
    const idsQueryBuilder = this.discRepository
      .createQueryBuilder('disc')
      .select('disc.id', 'id')
      .where('disc.releaseDate <= :today', { today });

    if (genre) {
      idsQueryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (countryFilter) {
      idsQueryBuilder
        .leftJoin('disc.artist', 'artist')
        .leftJoin('artist.country', 'country');
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
      if (isUUID) {
        idsQueryBuilder.andWhere('country.id = :countryFilter', { countryFilter });
      } else {
        idsQueryBuilder.andWhere('country.name = :countryFilter', { countryFilter });
      }
    }

    if (year) {
      idsQueryBuilder.andWhere('EXTRACT(YEAR FROM disc.releaseDate) = :year', { year });
    }

    if (ep !== undefined) {
      idsQueryBuilder.andWhere('disc.ep = :ep', { ep });
    }

    if (debut !== undefined) {
      idsQueryBuilder.andWhere('disc.debut = :debut', { debut });
    }

    const randomIds = (
      await idsQueryBuilder.orderBy('RANDOM()').limit(limit).getRawMany()
    ).map((row) => row.id);

    if (randomIds.length === 0) return [];

    const queryBuilder = this.discRepository
      .createQueryBuilder('disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoinAndSelect('disc.genre', 'genre')
      .leftJoinAndSelect('disc.rates', 'rate', 'rate.userId = :userId', {
        userId,
      })
      .leftJoinAndSelect(
        'disc.favorites',
        'favorite',
        'favorite.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect(
        'disc.pendings',
        'pending',
        'pending.userId = :userId',
        { userId },
      )
      .addSelect('disc.id', 'discId')
      .addSelect((subQuery) => {
        return subQuery
          .select('AVG(rate.rate)', 'averageRate')
          .from('rate', 'rate')
          .where('rate.discId = disc.id');
      }, 'averagerate')
      .addSelect((subQuery) => {
        return subQuery
          .select('AVG(rate.cover)', 'averageCover')
          .from('rate', 'rate')
          .where('rate.discId = disc.id');
      }, 'averageCover')
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(rate.id)', 'rateCount')
          .from('rate', 'rate')
          .where('rate.discId = disc.id AND rate.rate IS NOT NULL');
      }, 'rateCount')
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(comment.id)', 'commentCount')
          .from('comment', 'comment')
          .where('comment.discId = disc.id');
      }, 'commentCount')
      .where('disc.id IN (:...randomIds)', { randomIds });

    const { entities: discs, raw } = await queryBuilder.getRawAndEntities();

    // Preserve the random order decided by the IDs query above.
    const orderedDiscs = restoreRandomDiscOrder(discs, randomIds);
    const rawById = indexCatalogRawRows(raw);

    return orderedDiscs.map((disc) =>
      mapCatalogDisc(
        disc,
        rawById.get(disc.id) ?? {
          discId: disc.id,
          averagerate: null,
          averageCover: null,
          rateCount: null,
          commentCount: null,
        },
      ),
    );
  }

  async findOptions(dto: OptionsQueryDto) {
    const { field, country, genre, year, ep, debut, limit = 3 } = dto;
    const today = new Date();

    const qb = this.discRepository.createQueryBuilder('disc');

    // Solo se unen las relaciones necesarias para devolver el campo o aplicar
    // sus filtros; year/ep/debut no necesitan cargar relaciones por sí solos.
    if (field === 'country' || country) {
      qb.leftJoin('disc.artist', 'artist').leftJoin('artist.country', 'country');
    }
    if (field === 'genre' || genre) {
      qb.leftJoin('disc.genre', 'genre');
    }

    qb.where('disc.releaseDate <= :today', { today });

    // Filtros de lo YA elegido (nunca se filtra por el campo que se está pidiendo)
    if (field !== 'country' && country) qb.andWhere('country.id = :country', { country });
    if (field !== 'genre' && genre) qb.andWhere('genre.id = :genre', { genre });
    if (field !== 'year' && year) qb.andWhere('EXTRACT(YEAR FROM disc.releaseDate) = :year', { year });
    if (field !== 'ep' && ep !== undefined) qb.andWhere('disc.ep = :ep', { ep });
    if (field !== 'debut' && debut !== undefined) qb.andWhere('disc.debut = :debut', { debut });

    if (field === 'country') {
      qb.select('country.id', 'id').addSelect('country.name', 'name').addSelect('country.isoCode', 'isoCode')
        .andWhere('country.id IS NOT NULL')
        .groupBy('country.id').addGroupBy('country.name').addGroupBy('country.isoCode');
    } else if (field === 'genre') {
      qb.select('genre.id', 'id').addSelect('genre.name', 'name').addSelect('genre.color', 'color')
        .andWhere('genre.id IS NOT NULL')
        .groupBy('genre.id').addGroupBy('genre.name').addGroupBy('genre.color');
    } else if (field === 'ep') {
      qb.select('disc.ep', 'ep')
        .andWhere('disc.ep IS NOT NULL')
        .groupBy('disc.ep');
    } else if (field === 'debut') {
      qb.select('disc.debut', 'debut')
        .andWhere('disc.debut IS NOT NULL')
        .groupBy('disc.debut');
    } else {
      qb.select('EXTRACT(YEAR FROM disc.releaseDate)', 'year')
        .groupBy('EXTRACT(YEAR FROM disc.releaseDate)');
    }

    // ORDER BY RANDOM() sobre valores YA agrupados (no sobre discos), así que
    // aquí sí es seguro combinarlo con el groupBy sin el conflicto de DISTINCT.
    const rows = await qb.orderBy('RANDOM()').limit(limit).getRawMany();

    return mapOptionRows(field, rows);
  }

}
