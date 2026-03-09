import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateDiscDto } from './dto/create-discs.dto';
import { UpdateDiscDto } from './dto/update-discs.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Disc } from './entities/disc.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { User } from 'src/auth/entities/user.entity';
import { Genre } from 'src/genres/entities/genre.entity';
import { Artist } from 'src/artists/entities/artist.entity';
import { Pending } from 'src/pendings/entities/pending.entity';
@Injectable()
export class DiscsService {
  private readonly logger = new Logger('DiscsService');

  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
  ) { }

  async create(createDiscDto: CreateDiscDto) {
    try {
      const disc = this.discRepository.create(createDiscDto);
      await this.discRepository.save(disc);
      return disc;
    } catch (error) {
      this.handleDbExceptions(error);
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
      .addSelect((subQuery) => {
        return subQuery
          .select('AVG(rate.rate)', 'averageRate')
          .from('rate', 'rate')
          .where('rate.discId = disc.id');
      }, 'averageRate')
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
      .leftJoin('artist.country', 'country')
      .leftJoin('disc.genre', 'genre')
      .leftJoin('disc.rates', 'rate', 'rate.userId = :userId', { userId });

    if (genre) {
      queryBuilder.andWhere('disc.genreId = :genre', { genre });
      totalItemsQueryBuilder.andWhere('disc.genreId = :genre', { genre });
    }

    if (countryFilter) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
      if (isUUID) {
        queryBuilder.andWhere('country.id = :countryFilter', { countryFilter });
        totalItemsQueryBuilder.andWhere('country.id = :countryFilter', { countryFilter });
      } else {
        queryBuilder.andWhere('country.name = :countryFilter', { countryFilter });
        totalItemsQueryBuilder.andWhere('country.name = :countryFilter', { countryFilter });
      }
    }

    if (query) {
      const search = `%${query}%`;
      queryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)',
        { search },
      );
      totalItemsQueryBuilder.andWhere(
        '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)',
        { search },
      );
    }

    if (startDate && endDate) {
      queryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        {
          startDate,
          endDate,
        },
      );
      totalItemsQueryBuilder.andWhere(
        'disc.releaseDate BETWEEN :startDate AND :endDate',
        {
          startDate,
          endDate,
        },
      );
    }

    if (voted === 'false' || (voted as any) === false) {
      if (votedType === 'cover') {
        queryBuilder.andWhere('rate.cover IS NULL');
        totalItemsQueryBuilder.andWhere('rate.cover IS NULL');
      } else {
        queryBuilder.andWhere('rate.rate IS NULL');
        totalItemsQueryBuilder.andWhere('rate.rate IS NULL');
      }
    } else if (voted === 'true' || (voted as any) === true) {
      if (votedType === 'cover') {
        queryBuilder.andWhere('rate.cover IS NOT NULL');
        totalItemsQueryBuilder.andWhere('rate.cover IS NOT NULL');
      } else {
        queryBuilder.andWhere('rate.rate IS NOT NULL');
        totalItemsQueryBuilder.andWhere('rate.rate IS NOT NULL');
      }
    }


    if (paginationDto.orderBy) {
      const sortParts = paginationDto.orderBy.split(',');
      sortParts.forEach((part) => {
        const [field, direction] = part.split(':');
        if (field && direction) {
          // Mapping known fields to safe query builder aliases
          const validFields = {
            'disc.releaseDate': 'disc.releaseDate',
            'artist.name': 'artist.name',
            'disc.createdAt': 'disc.createdAt',
            'disc.name': 'disc.name',
            // Add more allowed fields as needed
          };

          const dbField = validFields[field];
          if (dbField) {
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

    // Mapea los valores crudos de averageRate, averageCover y commentCount a las entidades
    const processedDiscs = discs.map((disc, index) => ({
      ...disc,
      artist: {
        ...disc.artist,
        country: {
          ...disc.artist.country,
          name: disc.artist?.country?.name || null
        },
      },
      userRate: disc.rates.length > 0 ? disc.rates[0] : null,
      averageRate: parseFloat(raw[index].averageRate) || null,
      averageCover: parseFloat(raw[index].averageCover) || null,
      commentCount: parseInt(raw[index].commentCount, 10) || 0,
      voteCount: parseInt(raw[index].rateCount, 10) || 0, // <-- Add rateCount here
      favoriteId: disc.favorites.length > 0 ? disc.favorites[0].id : null, // Enviar el ID del favorito si existe
      pendingId:
        disc.pendings && disc.pendings.length > 0 ? disc.pendings[0].id : null,
    }));

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

  async findAllByDate(paginationDto: PaginationDto, user: User) {
    const { limit = 10, offset = 0, query, dateRange } = paginationDto;

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
      .orderBy('disc.releaseDate', 'ASC') // Cambia a 'ASC' si quieres orden ascendente
      .addOrderBy('artist.name', 'ASC'); // Luego ordenar por name en orden ascendente

    const [discs, totalItems] = await queryBuilder.getManyAndCount();

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    // Agrupar discos por fechas de lanzamiento
    const groupedDiscs = discs.reduce((acc, disc) => {
      const dateKey = new Date(disc.releaseDate).toISOString().split('T')[0];

      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }

      acc[dateKey].push({
        ...disc,
        artist: {
          ...disc.artist,
          country: {
            ...disc.artist.country,
            name: disc.artist?.country?.name || null
          },
        },
        userRate: disc.rates.length > 0 ? disc.rates[0] : null,
        favoriteId: disc.favorites.length > 0 ? disc.favorites[0].id : null, // Enviar el ID del favorito
        pendingId:
          disc.pendings && disc.pendings.length > 0
            ? disc.pendings[0].id
            : null,
        asignations: disc.asignations.map((asignation) => ({
          id: asignation.id,
          done: asignation.done,
          user: asignation.user,
          list: asignation.list,
        })),
      });
      return acc;
    }, {});

    // Convertir el objeto agrupado en un array de objetos para mejor legibilidad
    const groupedArray = Object.keys(groupedDiscs).map((releaseDate) => ({
      releaseDate,
      discs: groupedDiscs[releaseDate],
    }));

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: groupedArray,
    };
  }

  async findOne(id: string): Promise<Disc> {
    try {
      const disc = await this.discRepository.findOneByOrFail({ id });
      return disc;
    } catch (error) {
      throw new NotFoundException(`Disc with id ${id} not found`);
    }
  }

  async update(id: string, updateDiscDto: UpdateDiscDto) {
    // Sacamos genreId aparte
    const { genreId, artistId, ...restDto } = updateDiscDto;

    // Cargamos un parcial de disc con preload
    const disc = await this.discRepository.preload({
      id,
      ...restDto,
    });

    if (!disc) throw new NotFoundException(`Disc with id ${id} not found`);

    try {
      if (genreId) {
        disc.genre = { id: genreId } as Genre;
      }

      if (artistId) {
        disc.artist = { id: artistId } as Artist;
      }

      await this.discRepository.save(disc);
      return disc;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const result = await this.discRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Disc with id ${id} not found`);
    }
    return { message: `Disc with id ${id} has been removed` };
  }

  async findTopRatedOrFeaturedAndStats(
    paginationDto: PaginationDto,
    user: User,
    genreId?: string
  ): Promise<{
    discs: Disc[];
    totalDiscs: number;
    totalVotes: number;
    topUsersByRates: {
      user: { id: number; username: string };
      rateCount: number;
    }[];
    topUsersByCover: {
      user: { id: number; username: string };
      totalCover: number;
    }[];
    ratingDistribution: { rate: number; count: number }[];
  }> {
    const userId = user.id;
    const { dateRange, country, countryId, statsDateRange, distributionDateRange } = paginationDto as any;
    const countryFilter = country || countryId;
    const today = new Date();

    // Parámetros y condición para la consulta principal (incluye userId)
    let dateCondition = '';
    let genreCondition = '';
    let countryCondition = '';
    const params: any[] = [userId]; // $1 será userId
    let paramCounter = 1;

    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      dateCondition = `WHERE d."releaseDate" BETWEEN $${paramCounter + 1} AND $${paramCounter + 2} AND d."releaseDate" <= $${paramCounter + 3}`;
      params.push(new Date(startDate));
      params.push(new Date(endDate));
      params.push(today);
      paramCounter += 3;
    } else {
      dateCondition = `WHERE d."releaseDate" <= $${paramCounter + 1}`;
      params.push(today);
      paramCounter += 1;
    }

    if (genreId) {
      genreCondition = dateCondition ? ' AND' : ' WHERE';
      genreCondition += ` d."genreId" = $${paramCounter + 1}`;
      params.push(genreId);
      paramCounter += 1;
    }

    if (countryFilter) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
      countryCondition = (dateCondition || genreCondition) ? ' AND' : ' WHERE';
      if (isUUID) {
        countryCondition += ` c.id = $${paramCounter + 1}`;
      } else {
        countryCondition += ` c.name = $${paramCounter + 1}`;
      }
      params.push(countryFilter);
      paramCounter += 1;
    }

    // --- Cálculo de estadísticas globales con filtro de fecha ---
    // Para la consulta global no necesitamos el userId, así que definimos sus propios parámetros
    let dateConditionGlobal = '';
    let genreConditionGlobal = '';
    let countryConditionGlobal = '';
    const globalStatsParams: any[] = [];
    let globalParamCounter = 0;

    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      dateConditionGlobal = `WHERE d."releaseDate" BETWEEN $${globalParamCounter + 1} AND $${globalParamCounter + 2} AND d."releaseDate" <= $${globalParamCounter + 3}`;
      globalStatsParams.push(new Date(startDate));
      globalStatsParams.push(new Date(endDate));
      globalStatsParams.push(today);
      globalParamCounter += 3;
    } else {
      dateConditionGlobal = `WHERE d."releaseDate" <= $${globalParamCounter + 1}`;
      globalStatsParams.push(today);
      globalParamCounter += 1;
    }

    if (genreId) {
      genreConditionGlobal = dateConditionGlobal ? ' AND' : ' WHERE';
      genreConditionGlobal += ` d."genreId" = $${globalParamCounter + 1}`;
      globalStatsParams.push(genreId);
      globalParamCounter += 1;
    }

    if (countryFilter) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
      countryConditionGlobal = (dateConditionGlobal || genreConditionGlobal) ? ' AND' : ' WHERE';
      if (isUUID) {
        countryConditionGlobal += ` c.id = $${globalParamCounter + 1}`;
      } else {
        countryConditionGlobal += ` c.name = $${globalParamCounter + 1}`;
      }
      globalStatsParams.push(countryFilter);
    }

    const globalStatsQuery = `
      SELECT 
        AVG(avgRates) AS "globalAvgRate",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voteCount) AS "medianVotes"
      FROM (
        SELECT 
          d.id, 
          COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) AS voteCount,
          COALESCE(AVG(r.rate), 0) AS avgRates
        FROM disc d
        LEFT JOIN rate r ON d.id = r."discId"
        LEFT JOIN artist a ON d."artistId" = a.id
        LEFT JOIN country c ON a."countryId" = c.id
        ${dateConditionGlobal}
        ${genreConditionGlobal}
        ${countryConditionGlobal}
        GROUP BY d.id
      ) AS rate_stats;
    `;
    const globalStatsResult = await this.discRepository.query(
      globalStatsQuery,
      globalStatsParams,
    );
    const { globalAvgRate: globalAvgRateStr, medianVotes: medianVotesStr } =
      globalStatsResult[0] || {};
    const globalAvgRate = parseFloat(globalAvgRateStr) || 0;
    const medianVotes = parseInt(medianVotesStr, 10) || 1;

    // --- Consulta principal de discos (ordenados por featured y weightedScore) ---
    const query = `
      SELECT 
        d.*, 
        a.name AS "artistName", 
        c.id AS "countryId",
        c.name AS "countryName",
        c."isoCode" AS "countryIsoCode",
        g.name AS "genreName", 
        g.color AS "genreColor", 
        COUNT(r.id) AS "voteCount", 
        COALESCE(AVG(r.rate), 0) AS "averageRate", 
        COALESCE(AVG(r.cover), 0) AS "averageCover",
        (SELECT r.id FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userRateId",
        (SELECT f.id FROM favorite f WHERE f."discId" = d.id AND f."userId" = $1 LIMIT 1) AS "userFavoriteId",
        (SELECT p.id FROM pending p WHERE p."discId" = d.id AND p."userId" = $1 LIMIT 1) AS "pendingId",
        (SELECT r.rate FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userRate",
        (SELECT r.cover FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userCover",
        (SELECT COUNT(c.id) FROM comment c WHERE c."discId" = d.id) AS "commentCount",
        (
          (COALESCE(AVG(r.rate), 0) * COUNT(r.id)) 
          + (${globalAvgRate} * ${medianVotes})
        ) / (COUNT(r.id) + ${medianVotes}) AS "weightedScore"
      FROM disc d
      LEFT JOIN artist a ON d."artistId" = a.id
      LEFT JOIN country c ON a."countryId" = c.id
      LEFT JOIN genre g ON d."genreId" = g.id
      LEFT JOIN rate r ON d.id = r."discId"
      LEFT JOIN favorite f ON f."discId" = d.id AND f."userId" = $1
      LEFT JOIN pending p ON p."discId" = d.id AND p."userId" = $1
      ${dateCondition}
      ${genreCondition}
      ${countryCondition}
      GROUP BY d.id, a.name, g.name, g.color, f.id, c.id, c.name, c."isoCode"
      ORDER BY "weightedScore" DESC
      LIMIT 20;
    `;

    const topRatedDiscs = await this.discRepository.query(query, params);

    // --- Parametros de filtrado para Top Users y Totales ---
    let statsDateCondition = '';
    const statsParams: any[] = [];
    if (statsDateRange && statsDateRange.length === 2) {
      const [startDate, endDate] = statsDateRange;
      statsDateCondition = ' AND d."releaseDate" BETWEEN $1 AND $2';
      statsParams.push(new Date(startDate));
      statsParams.push(new Date(endDate));
    }

    // --- Otras estadísticas: total de discos y total de votos ---
    let totalDiscs = 0;
    let totalVotes = 0;

    if (statsDateRange && statsDateRange.length === 2) {
      const [startDate, endDate] = statsDateRange;
      const start = new Date(startDate);
      const end = new Date(endDate);

      totalDiscs = await this.discRepository
        .createQueryBuilder('disc')
        .where('disc.releaseDate BETWEEN :start AND :end', { start, end })
        .getCount();

      const totalVotesResult = await this.discRepository
        .createQueryBuilder('disc')
        .leftJoin('disc.rates', 'rates')
        .select('COUNT(*)', 'totalVotes')
        .where('rates.rate IS NOT NULL')
        .andWhere('disc.releaseDate BETWEEN :start AND :end', { start, end })
        .getRawOne();
      totalVotes = parseInt(totalVotesResult.totalVotes, 10) || 0;
    } else {
      totalDiscs = await this.discRepository.count();
      const totalVotesResult = await this.discRepository
        .createQueryBuilder('disc')
        .leftJoin('disc.rates', 'rates')
        .select('COUNT(*)', 'totalVotes')
        .where('rates.rate IS NOT NULL')
        .getRawOne();
      totalVotes = parseInt(totalVotesResult.totalVotes, 10) || 0;
    }


    // --- Consulta para obtener los top usuarios por cantidad de rates ---
    const topUsersByRatesQuery = `
      SELECT u.id AS "userId", u.username, COUNT(r.id) AS "rateCount"
      FROM rate r
      JOIN "users" u ON u.id = r."userId"
      JOIN "disc" d ON d.id = r."discId"
      WHERE r.rate IS NOT NULL${statsDateCondition}
      GROUP BY u.id, u.username
      ORDER BY "rateCount" DESC
      LIMIT 3;
    `;
    const topUsersByRates =
      await this.discRepository.query(topUsersByRatesQuery, statsParams);

    // --- Consulta para obtener los top usuarios por cover ---
    const topUsersByCoverQuery = `
      SELECT u.id AS "userId", u.username, COUNT(r.id) AS "coverCount"
      FROM rate r
      JOIN "users" u ON u.id = r."userId"
      JOIN "disc" d ON d.id = r."discId"
      WHERE r.cover IS NOT NULL${statsDateCondition}
      GROUP BY u.id, u.username
      ORDER BY "coverCount" DESC
      LIMIT 3;
    `;
    const topUsersByCover =
      await this.discRepository.query(topUsersByCoverQuery, statsParams);

    // --- Parametros de filtrado para Distribución ---
    let distributionDateCondition = '';
    const distributionParams: any[] = [];
    if (distributionDateRange && distributionDateRange.length === 2) {
      const [startDate, endDate] = distributionDateRange;
      distributionDateCondition = ' AND d."releaseDate" BETWEEN $1 AND $2';
      distributionParams.push(new Date(startDate));
      distributionParams.push(new Date(endDate));
    }

    // --- Consulta: Distribución de ratings ---
    const ratingDistributionQuery = `
      SELECT r.rate AS "rateValue", COUNT(*) AS "count"
      FROM rate r
      JOIN "disc" d ON d.id = r."discId"
      WHERE r.rate IS NOT NULL${distributionDateCondition}
      GROUP BY r.rate
      ORDER BY r.rate;
    `;
    const ratingDistributionResult = await this.discRepository.query(
      ratingDistributionQuery,
      distributionParams
    );
    const ratingDistribution = ratingDistributionResult.map((row: any) => ({
      rate: parseFloat(row.rateValue),
      count: parseInt(row.count, 10),
    }));

    // --- Transformación de los datos para el formato esperado ---
    const processedDiscs = topRatedDiscs.map((disc: any) => ({
      ...disc,
      artist: {
        name: disc.artistName,
        country: {
          id: disc.countryId,
          name: disc.countryName || null,
          isoCode: disc.countryIsoCode || null
        }
      },
      genre: { name: disc.genreName, color: disc.genreColor },
      userRate: disc.userRateId
        ? {
          id: disc.userRateId,
          rate: parseFloat(disc.userRate) || null,
          cover: parseFloat(disc.userCover) || null,
        }
        : null,
      favoriteId: disc.userFavoriteId || null,
      pendingId: disc.pendingId || null,
      averageRate: disc.averageRate !== null ? parseFloat(disc.averageRate) : 0,
      averageCover:
        disc.averageCover !== null ? parseFloat(disc.averageCover) : 0,
      voteCount: parseInt(disc.voteCount, 10) || 0,
      commentCount: parseInt(disc.commentCount, 10) || 0,
    }));

    return {
      discs: processedDiscs,
      totalDiscs,
      totalVotes,
      topUsersByRates: topUsersByRates.map((row: any) => ({
        user: {
          id: row.userId,
          username: row.username,
        },
        rateCount: parseInt(row.rateCount, 10),
      })),
      topUsersByCover: topUsersByCover.map((row: any) => ({
        user: {
          id: row.userId,
          username: row.username,
        },
        totalCover: parseInt(row.coverCount, 10),
      })),
      ratingDistribution,
    };
  }

  async findWeekly(month: number, year: number, week?: number): Promise<{
    week: number;
    label: string;
    discs: { artistName: string; name: string; genre: string; link: string | null; ep: boolean; releaseDate: string }[];
  }[]> {
    const today = new Date();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const discs = await this.discRepository
      .createQueryBuilder('disc')
      .leftJoinAndSelect('disc.artist', 'artist')
      .leftJoinAndSelect('disc.genre', 'genre')
      .where('disc.releaseDate BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth < today ? endOfMonth : today,
      })
      .orderBy('disc.releaseDate', 'ASC')
      .addOrderBy('artist.name', 'ASC')
      .getMany();

    const weekRanges = [
      { week: 1, from: 1,  to: 7  },
      { week: 2, from: 8,  to: 14 },
      { week: 3, from: 15, to: 21 },
      { week: 4, from: 22, to: 31 },
    ];

    const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const monthLabel = monthNames[month - 1];
    const daysInMonth = new Date(year, month, 0).getDate();

    return weekRanges
      .filter((w) => week === undefined || w.week === week)
      .map((w) => {
        const toDay = Math.min(w.to, daysInMonth);
        const label = `${w.from}-${toDay} ${monthLabel}`;

        const weekDiscs = discs
          .filter((d) => {
            const day = new Date(d.releaseDate).getUTCDate();
            return day >= w.from && day <= w.to;
          })
          .map((d) => ({
            artistName: d.artist?.name ?? '',
            name: d.name,
            genre: d.genre?.name ?? '',
            link: d.link ?? null,
            ep: d.ep ?? false,
            releaseDate: new Date(d.releaseDate).toISOString().split('T')[0],
          }));

        return { week: w.week, label, discs: weekDiscs };
      });
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
