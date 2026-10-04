import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { Disc } from '../entities/disc.entity';
import { loadHomeGlobalStats } from './loaders/home-global-stats';
import { loadHomeDiscTotals } from './loaders/home-totals';
import { loadHomeTopUsersByRates } from './loaders/home-top-users-by-rates';
import { loadHomeTopUsersByCover } from './loaders/home-top-users-by-cover';
import { loadHomeRatingDistribution } from './loaders/home-rating-distribution';
import { buildHomeDiscFilters } from './helpers/home-disc-filters';
import { mapHomeRankedDisc } from './helpers/map-home-ranked-disc';

@Injectable()
export class DiscHomeService {
  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
  ) {}

  async findTopRatedOrFeaturedAndStats(
    paginationDto: PaginationDto,
    user: User,
    genreId?: string,
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
    const today = new Date();
    const homeDiscFilters = buildHomeDiscFilters({
      userId,
      dateRange,
      genreId,
      country,
      countryId,
      today,
    });

    const { globalAvgRate, medianVotes } = await loadHomeGlobalStats(
      this.discRepository,
      homeDiscFilters.globalWhere,
      homeDiscFilters.globalParams,
    );

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
        COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) AS "voteCount",
        COALESCE(AVG(r.rate), 0) AS "averageRate",
        COALESCE(AVG(r.cover), 0) AS "averageCover",
        (SELECT r.id FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userRateId",
        (SELECT f.id FROM favorite f WHERE f."discId" = d.id AND f."userId" = $1 LIMIT 1) AS "userFavoriteId",
        (SELECT p.id FROM pending p WHERE p."discId" = d.id AND p."userId" = $1 LIMIT 1) AS "pendingId",
        (SELECT r.rate FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userRate",
        (SELECT r.cover FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userCover",
        (SELECT COUNT(c.id) FROM comment c WHERE c."discId" = d.id) AS "commentCount",
        (
          (COALESCE(AVG(r.rate), 0) * COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END))
          + (${globalAvgRate} * ${medianVotes})
        ) / (COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) + ${medianVotes}) AS "weightedScore"
      FROM disc d
      LEFT JOIN artist a ON d."artistId" = a.id
      LEFT JOIN country c ON a."countryId" = c.id
      LEFT JOIN genre g ON d."genreId" = g.id
      LEFT JOIN rate r ON d.id = r."discId"
      LEFT JOIN favorite f ON f."discId" = d.id AND f."userId" = $1
      LEFT JOIN pending p ON p."discId" = d.id AND p."userId" = $1
      ${homeDiscFilters.mainWhere}
      GROUP BY d.id, a.name, g.name, g.color, f.id, c.id, c.name, c."isoCode"
      HAVING COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) > 0 OR d."pinned" = true
      ORDER BY "weightedScore" DESC
      LIMIT 20;
    `;

    const topRatedDiscs = await this.discRepository.query(query, homeDiscFilters.mainParams);

    // --- Otras estadísticas: total de discos y total de votos ---
    const { totalDiscs, totalVotes } = await loadHomeDiscTotals(
      this.discRepository,
      statsDateRange,
    );

    // --- Consulta para obtener los top usuarios por cantidad de rates ---
    const topUsersByRates = await loadHomeTopUsersByRates(
      this.discRepository,
      statsDateRange,
    );

    // --- Consulta para obtener los top usuarios por cover ---
    const topUsersByCover = await loadHomeTopUsersByCover(
      this.discRepository,
      statsDateRange,
    );

    // --- Consulta: Distribución de ratings ---
    const ratingDistribution = await loadHomeRatingDistribution(
      this.discRepository,
      distributionDateRange,
    );

    // --- Transformación de los datos para el formato esperado ---
    const processedDiscs = topRatedDiscs.map(mapHomeRankedDisc);

    return {
      discs: processedDiscs,
      totalDiscs,
      totalVotes,
      topUsersByRates,
      topUsersByCover,
      ratingDistribution,
    };
  }
}
