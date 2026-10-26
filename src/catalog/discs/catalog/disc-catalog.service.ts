import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Disc } from '../entities/disc.entity';
import { DiscsListQueryDto } from '../dto/discs-list-query.dto';
import { RandomQueryDto } from '../dto/random-query.dto';
import { OptionsQueryDto } from '../dto/options-query.dto';
import { User } from 'src/identity/auth/entities/user.entity';
import { indexCatalogRawRows } from './helpers/catalog-raw-rows';
import { mapCatalogDisc } from './helpers/map-catalog-disc';
import { mapOptionRows } from './helpers/map-option-rows';
import { restoreRandomDiscOrder } from './helpers/restore-random-disc-order';
import { RatesRandomSelectionService } from 'src/community/rates/random-selection/rates-random-selection.service';

const FIND_ALL_ORDER_FIELDS: Record<string, string> = {
  'disc.releaseDate': 'disc.releaseDate',
  'artist.name': 'artist.name',
  'disc.createdAt': 'disc.createdAt',
  'disc.name': 'disc.name',
  'disc.averageRate': 'averagerate',
};
const FIND_ALL_AVERAGE_RATE_FILTER =
  'EXISTS (SELECT 1 FROM rate r WHERE r."discId" = disc.id AND r.rate IS NOT NULL)';

function isBooleanFilter(value: unknown, expected: boolean): boolean {
  return typeof value === 'boolean' && value === expected;
}

@Injectable()
export class DiscCatalogService {
  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    private readonly ratesRandomSelectionService: RatesRandomSelectionService,
  ) {}

  countCatalogDiscs(): Promise<number> {
    return this.discRepository.count();
  }

  async countCurrentGenresForDiscSets(
    monthDiscIds: string[],
    yearDiscIds: string[],
    totalRatedDiscIds: string[] = [],
  ): Promise<{ month: number; year: number; totalRated: number }> {
    if (
      monthDiscIds.length === 0 &&
      yearDiscIds.length === 0 &&
      totalRatedDiscIds.length === 0
    ) {
      return { month: 0, year: 0, totalRated: 0 };
    }

    type GenreCountsRow = {
      monthCount: number | string;
      yearCount: number | string;
      totalRatedCount: number | string;
    };
    const [row] = (await this.discRepository.query(
      `
      WITH month_discs AS (
        SELECT DISTINCT unnest($1::uuid[]) AS disc_id
      ), year_discs AS (
        SELECT DISTINCT unnest($2::uuid[]) AS disc_id
      ), total_rated_discs AS (
        SELECT DISTINCT unnest($3::uuid[]) AS disc_id
      )
      SELECT
        (SELECT COUNT(DISTINCT disc."genreId")::int
          FROM month_discs
          INNER JOIN disc ON disc.id = month_discs.disc_id
          WHERE disc."genreId" IS NOT NULL) AS "monthCount",
        (SELECT COUNT(DISTINCT disc."genreId")::int
          FROM year_discs
          INNER JOIN disc ON disc.id = year_discs.disc_id
          WHERE disc."genreId" IS NOT NULL) AS "yearCount",
        (SELECT COUNT(DISTINCT disc."genreId")::int
          FROM total_rated_discs
          INNER JOIN disc ON disc.id = total_rated_discs.disc_id
          WHERE disc."genreId" IS NOT NULL) AS "totalRatedCount"
      `,
      [monthDiscIds, yearDiscIds, totalRatedDiscIds],
    )) as GenreCountsRow[];

    if (!row) {
      throw new Error('Current genre aggregate query returned no row');
    }

    return {
      month: Number(row.monthCount),
      year: Number(row.yearCount),
      totalRated: Number(row.totalRatedCount),
    };
  }

  async countDiscsByReleasePeriod(): Promise<{
    thisMonth: number;
    thisYear: number;
  }> {
    type ReleaseCountsRow = {
      monthCount: number | string;
      yearCount: number | string;
    };
    const [row] = (await this.discRepository.query(
      `
      WITH madrid_calendar AS (
        SELECT
          date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS month_start,
          date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS year_start
      )
      SELECT
        COUNT(DISTINCT disc.id) FILTER (
          WHERE disc."releaseDate" IS NOT NULL
            AND disc."releaseDate" >= madrid_calendar.month_start
            AND disc."releaseDate" < (madrid_calendar.month_start + INTERVAL '1 month')::date
        )::int AS "monthCount",
        COUNT(DISTINCT disc.id) FILTER (
          WHERE disc."releaseDate" IS NOT NULL
            AND disc."releaseDate" >= madrid_calendar.year_start
            AND disc."releaseDate" < (madrid_calendar.year_start + INTERVAL '1 year')::date
        )::int AS "yearCount"
      FROM disc CROSS JOIN madrid_calendar
      `,
    )) as ReleaseCountsRow[];

    if (!row) {
      throw new Error('Release period aggregate query returned no row');
    }

    return {
      thisMonth: Number(row.monthCount),
      thisYear: Number(row.yearCount),
    };
  }

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

  async findAll(paginationDto: DiscsListQueryDto, user: User) {
    const {
      limit = 10,
      offset = 0,
      query,
      dateRange,
      genre,
      country,
      countryId,
      voted: votedInput,
      votedType,
    } = paginationDto;
    const countryFilter = country || countryId;
    const userId = user.id;
    const voted: string | boolean | undefined = votedInput;

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
    if (
      voted === 'false' ||
      isBooleanFilter(voted, false) ||
      voted === 'true' ||
      isBooleanFilter(voted, true)
    ) {
      totalItemsQueryBuilder.leftJoin(
        'disc.rates',
        'rate',
        'rate.userId = :userId',
        { userId },
      );
    }

    const filterOptions = {
      genre,
      countryFilter,
      query,
      startDate,
      endDate,
      voted,
      votedType,
    };
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
            if (
              field === 'disc.averageRate' &&
              !excludesDiscsWithoutAverageRate
            ) {
              [queryBuilder, totalItemsQueryBuilder].forEach((builder) =>
                builder.andWhere(FIND_ALL_AVERAGE_RATE_FILTER),
              );
              excludesDiscsWithoutAverageRate = true;
            }
            queryBuilder.addOrderBy(
              dbField,
              direction.toUpperCase() as 'ASC' | 'DESC',
            );
          }
        }
      });
    } else {
      queryBuilder
        .orderBy('disc.releaseDate', 'DESC')
        .addOrderBy('artist.name', 'ASC');
    }

    queryBuilder.take(limit).skip(offset);
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
    const {
      genre,
      countryFilter,
      query,
      startDate,
      endDate,
      voted,
      votedType,
    } = filters;

    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (countryFilter) {
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          countryFilter,
        );
      queryBuilder.andWhere(
        isUUID
          ? 'country.id = :countryFilter'
          : 'country.name = :countryFilter',
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

    if (voted === 'false' || voted === false) {
      queryBuilder.andWhere(
        votedType === 'cover' ? 'rate.cover IS NULL' : 'rate.rate IS NULL',
      );
    } else if (voted === 'true' || voted === true) {
      queryBuilder.andWhere(
        votedType === 'cover'
          ? 'rate.cover IS NOT NULL'
          : 'rate.rate IS NOT NULL',
      );
    }
  }

  async findRandom(dto: RandomQueryDto, user: User) {
    const { genre, year, ep, debut, limit = 5, difficulty } = dto;
    const countryFilter = dto.country || dto.countryId;
    const userId = user.id;
    const today = new Date();

    const selectRandomIds = async (excludePreviousDisc: boolean) => {
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
        const isUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            countryFilter,
          );
        if (isUUID) {
          idsQueryBuilder.andWhere('country.id = :countryFilter', {
            countryFilter,
          });
        } else {
          idsQueryBuilder.andWhere('country.name = :countryFilter', {
            countryFilter,
          });
        }
      }

      if (year) {
        idsQueryBuilder.andWhere(
          'EXTRACT(YEAR FROM disc.releaseDate) = :year',
          { year },
        );
      }

      if (ep !== undefined) {
        idsQueryBuilder.andWhere('disc.ep = :ep', { ep });
      }

      if (debut !== undefined) {
        idsQueryBuilder.andWhere('disc.debut = :debut', { debut });
      }

      if (difficulty) {
        const criteria = this.ratesRandomSelectionService.getDiscCriteria(
          userId,
          difficulty,
        );
        idsQueryBuilder.addSelect(
          criteria.communityVoteCountExpression,
          'communityvotecount',
        );
        const ratePredicates = [
          criteria.notRatedPredicate,
          ...criteria.communityVotePredicates,
          ...(criteria.genrePreferencePredicate
            ? [criteria.genrePreferencePredicate]
            : []),
        ];
        for (const predicate of ratePredicates) {
          idsQueryBuilder.andWhere(predicate, criteria.parameters);
        }
        if (excludePreviousDisc && dto.previousDiscId) {
          idsQueryBuilder.andWhere('disc.id <> :previousDiscId', {
            previousDiscId: dto.previousDiscId,
          });
        }
        if (criteria.priorityOrder) {
          idsQueryBuilder
            .orderBy(criteria.priorityOrder)
            .addOrderBy('RANDOM()');
        } else {
          idsQueryBuilder.orderBy('RANDOM()');
        }
      } else {
        idsQueryBuilder.orderBy('RANDOM()');
      }

      const rows = await idsQueryBuilder.limit(limit).getRawMany();
      const ids: string[] = [];
      const communityVoteCounts = new Map<string, number>();
      for (const row of rows) {
        if (typeof row.id !== 'string') continue;
        ids.push(row.id);
        if (difficulty) {
          communityVoteCounts.set(
            row.id,
            Number.parseInt(String(row.communityvotecount), 10) || 0,
          );
        }
      }
      return { ids, communityVoteCounts };
    };

    // Selecciona primero IDs aleatorios; Catalog hidrata únicamente esa selección.
    let selection = await selectRandomIds(
      Boolean(difficulty && dto.previousDiscId),
    );
    if (difficulty && dto.previousDiscId && selection.ids.length === 0) {
      // Si no queda alternativa, se permite repetir el único candidato.
      selection = await selectRandomIds(false);
    }
    const { ids: randomIds, communityVoteCounts } = selection;

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
      .addSelect('disc.id', 'disc_id_for_mapping')
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
    const hydratedDiscIds = [
      ...new Set(
        raw
          .map((row) => row.disc_id_for_mapping ?? row.discId ?? row.disc_id)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    ];
    const discsWithIds = discs.map((disc, index) => {
      const id =
        typeof disc.id === 'string' && disc.id.length > 0
          ? disc.id
          : hydratedDiscIds[index];
      if (!id) {
        throw new Error('Hydrated random disc is missing its database ID');
      }
      return { ...disc, id };
    });
    const orderedDiscs = restoreRandomDiscOrder(discsWithIds, randomIds);
    const rawById = indexCatalogRawRows(raw);

    return orderedDiscs.map((disc) => {
      const mappedDisc = mapCatalogDisc(
        disc,
        rawById.get(disc.id) ?? {
          discId: disc.id,
          averagerate: null,
          averageCover: null,
          rateCount: null,
          commentCount: null,
        },
      );
      if (!difficulty) return mappedDisc;
      return {
        ...mappedDisc,
        id: disc.id,
        voteCount: communityVoteCounts.get(disc.id) ?? mappedDisc.voteCount,
      };
    });
  }

  async findOptions(dto: OptionsQueryDto) {
    const { field, country, genre, year, ep, debut, limit = 3 } = dto;
    const today = new Date();

    const qb = this.discRepository.createQueryBuilder('disc');

    // Solo se unen las relaciones necesarias para devolver el campo o aplicar
    // sus filtros; year/ep/debut no necesitan cargar relaciones por sí solos.
    if (field === 'country' || country) {
      qb.leftJoin('disc.artist', 'artist').leftJoin(
        'artist.country',
        'country',
      );
    }
    if (field === 'genre' || genre) {
      qb.leftJoin('disc.genre', 'genre');
    }

    qb.where('disc.releaseDate <= :today', { today });

    // Filtros de lo YA elegido (nunca se filtra por el campo que se está pidiendo)
    if (field !== 'country' && country)
      qb.andWhere('country.id = :country', { country });
    if (field !== 'genre' && genre) qb.andWhere('genre.id = :genre', { genre });
    if (field !== 'year' && year)
      qb.andWhere('EXTRACT(YEAR FROM disc.releaseDate) = :year', { year });
    if (field !== 'ep' && ep !== undefined)
      qb.andWhere('disc.ep = :ep', { ep });
    if (field !== 'debut' && debut !== undefined)
      qb.andWhere('disc.debut = :debut', { debut });

    if (field === 'country') {
      qb.select('country.id', 'id')
        .addSelect('country.name', 'name')
        .addSelect('country.isoCode', 'isoCode')
        .andWhere('country.id IS NOT NULL')
        .groupBy('country.id')
        .addGroupBy('country.name')
        .addGroupBy('country.isoCode');
    } else if (field === 'genre') {
      qb.select('genre.id', 'id')
        .addSelect('genre.name', 'name')
        .addSelect('genre.color', 'color')
        .andWhere('genre.id IS NOT NULL')
        .groupBy('genre.id')
        .addGroupBy('genre.name')
        .addGroupBy('genre.color');
    } else if (field === 'ep') {
      qb.select('disc.ep', 'ep')
        .andWhere('disc.ep IS NOT NULL')
        .groupBy('disc.ep');
    } else if (field === 'debut') {
      qb.select('disc.debut', 'debut')
        .andWhere('disc.debut IS NOT NULL')
        .groupBy('disc.debut');
    } else {
      qb.select('EXTRACT(YEAR FROM disc.releaseDate)', 'year').groupBy(
        'EXTRACT(YEAR FROM disc.releaseDate)',
      );
    }

    // ORDER BY RANDOM() sobre valores YA agrupados (no sobre discos), así que
    // aquí sí es seguro combinarlo con el groupBy sin el conflicto de DISTINCT.
    const rows = await qb.orderBy('RANDOM()').limit(limit).getRawMany();

    return mapOptionRows(field, rows);
  }
}
