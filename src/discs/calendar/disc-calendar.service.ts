import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Country } from 'src/countries/entities/country.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { Disc } from '../entities/disc.entity';
import { getCalendarPageMetadata } from './helpers/get-calendar-page-metadata';
import {
  mapAuthenticatedCalendarDiscGroups,
  mapNationalReleaseIds,
  mapPublicCalendarDiscGroups,
} from './helpers/map-calendar-disc-groups';
import { mapWeeklyDiscsToGroups } from './helpers/map-weekly-discs-to-groups';
import type { WeeklyCalendarGroup } from './helpers/map-weekly-discs-to-groups';
import { getFridayWeekRanges } from '../shared/helpers/get-friday-week-ranges';

@Injectable()
export class DiscCalendarService {
  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) { }

  // Listas completas usadas por el calendario público para ofrecer filtros
  // solo de entidades asociadas a algún disco.
  async getPublicFilters() {
    const genres = await this.genreRepository
      .createQueryBuilder('genre')
      .innerJoin('genre.disc', 'disc')
      .select(['genre.id', 'genre.name', 'genre.color'])
      .distinct(true)
      .orderBy('genre.name', 'ASC')
      .getMany();

    const countries = await this.countryRepository
      .createQueryBuilder('country')
      .innerJoin('country.artist', 'artist')
      .innerJoin('artist.disc', 'disc')
      .select(['country.id', 'country.name', 'country.isoCode'])
      .distinct(true)
      .orderBy('country.name', 'ASC')
      .getMany();

    return { genres, countries };
  }

  async findWeekly(
    month: number,
    year: number,
    week?: number,
  ): Promise<WeeklyCalendarGroup[]> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const discs = await this.discRepository
      .createQueryBuilder('disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoinAndSelect('disc.genre', 'genre')
      .select([
        'disc.id',
        'disc.name',
        'disc.image',
        'disc.ep',
        'disc.debut',
        'disc.link',
        'disc.releaseDate',
        'artist.id',
        'artist.name',
        'country.id',
        'country.name',
        'country.isoCode',
        'genre.id',
        'genre.name',
        'genre.color',
      ])
      .where('disc.releaseDate BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .orderBy('disc.releaseDate', 'ASC')
      .addOrderBy('artist.name', 'ASC')
      .getMany();

    return mapWeeklyDiscsToGroups(
      discs,
      getFridayWeekRanges(month, year),
      month,
      year,
      week,
    );
  }

  async findAllByDate(paginationDto: PaginationDto, user: User) {
    const { limit = 10, offset = 0, query, dateRange, genre, country, countryId } = paginationDto;
    const countryFilter = country || countryId;

    const userId = user.id;

    const queryBuilder = this.discRepository
      .createQueryBuilder('disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoinAndSelect('disc.genre', 'genre')
      .leftJoinAndSelect('disc.rates', 'rate', 'rate.userId = :userId', {
        userId,
      })
      .leftJoinAndSelect('disc.asignations', 'asignation')
      .leftJoinAndSelect('asignation.user', 'asignationUser')
      .leftJoinAndSelect('asignation.list', 'asignationList')
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
        {
          userId,
        },
      );

    if (query) {
      const search = `%${query}%`;
      queryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)',
        { search },
      );
    }

    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (countryFilter) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
      if (isUUID) {
        queryBuilder.andWhere('country.id = :countryFilter', { countryFilter });
      } else {
        queryBuilder.andWhere('country.name = :countryFilter', { countryFilter });
      }
    }

    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      queryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        },
      );
    }

    queryBuilder
      .take(limit)
      .skip(offset)
      .orderBy('disc.releaseDate', 'ASC')
      .addOrderBy('artist.name', 'ASC');

    const [discs, totalItems] = await queryBuilder.getManyAndCount();
    const { totalPages, currentPage } = getCalendarPageMetadata(
      totalItems,
      limit,
      offset,
    );

    // Obtener national releases vinculadas a estos discos
    const discIds = discs.map((d) => d.id);
    let nationalReleaseMap = new Map<string, string>();
    if (discIds.length > 0) {
      const nrRows: { discId: string; id: string }[] = await this.discRepository.manager.query(
        `SELECT "discId", id FROM national_release WHERE "discId" = ANY($1)`,
        [discIds],
      );
      nationalReleaseMap = mapNationalReleaseIds(nrRows);
    }

    const groupedArray = mapAuthenticatedCalendarDiscGroups(
      discs,
      nationalReleaseMap,
    );

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: groupedArray,
    };
  }

  // Igual que findAllByDate pero sin datos por-usuario (rate, favoritos,
  // pendientes), pensado para el calendario público sin autenticar.
  async findAllByDatePublic(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0, dateRange, genre, country, countryId } = paginationDto;
    const countryFilter = country || countryId;

    const queryBuilder = this.discRepository
      .createQueryBuilder('disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('artist.country', 'country')
      .leftJoinAndSelect('disc.genre', 'genre');

    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (countryFilter) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
      if (isUUID) {
        queryBuilder.andWhere('country.id = :countryFilter', { countryFilter });
      } else {
        queryBuilder.andWhere('country.name = :countryFilter', { countryFilter });
      }
    }

    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      queryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        },
      );
    }

    queryBuilder
      .take(limit)
      .skip(offset)
      .orderBy('disc.releaseDate', 'ASC')
      .addOrderBy('artist.name', 'ASC');

    const [discs, totalItems] = await queryBuilder.getManyAndCount();
    const { totalPages, currentPage } = getCalendarPageMetadata(
      totalItems,
      limit,
      offset,
    );
    const groupedArray = mapPublicCalendarDiscGroups(discs);

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: groupedArray,
    };
  }

}
