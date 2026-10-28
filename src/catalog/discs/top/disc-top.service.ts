import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../../../identity/auth/entities/user.entity';
import { TopStatsQueryDto } from '../dto/top-stats-query.dto';
import { Disc } from '../entities/disc.entity';
import {
  CURRENT_RATES_CTE,
  TOP_DISCS_PRIOR_STRENGTH,
} from './loaders/home-global-stats';
import { loadHomeDiscTotals } from './loaders/home-totals';
import { loadHomeTopUsersByRates } from './loaders/home-top-users-by-rates';
import { loadHomeTopUsersByCover } from './loaders/home-top-users-by-cover';
import { loadHomeRatingDistribution } from './loaders/home-rating-distribution';
import { buildHomeDiscFilters } from './helpers/home-disc-filters';
import { mapHomeRankedDisc } from './helpers/map-home-ranked-disc';
import { HomeQueryRunner } from './loaders/home-query-runner';
import { TopDiscOptionsQueryDto } from '../dto/top-disc-options-query.dto';
import { loadTopDiscOptions } from './loaders/load-top-disc-options';
import { DiscTopOptionsResult } from './types/disc-top-options';
import { buildTopDiscEligibilityPredicate } from './helpers/top-disc-predicates';

export interface DiscTopResult {
  discs: ReturnType<typeof mapHomeRankedDisc>[];
  totalDiscs: number;
  totalVotes: number;
  topUsersByRates: {
    user: { id: string; username: string };
    rateCount: number;
  }[];
  topUsersByCover: {
    user: { id: string; username: string };
    totalCover: number;
  }[];
  ratingDistribution: { rate: number; count: number }[];
}

@Injectable()
export class DiscTopService {
  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: HomeQueryRunner,
  ) {}

  async getTopDiscs(
    paginationDto: TopStatsQueryDto,
    user: User,
    genreId?: string,
  ): Promise<DiscTopResult> {
    const userId = user.id;
    const {
      dateRange,
      country,
      countryId,
      statsDateRange,
      distributionDateRange,
    } = paginationDto;
    const today = new Date();
    const homeDiscFilters = buildHomeDiscFilters({
      userId,
      dateRange,
      genreId,
      country,
      countryId,
      today,
    });

    const globalAsOfParameter = homeDiscFilters.mainParams.length + 1;
    const queryParams = [...homeDiscFilters.mainParams, today];

    // Global prior and ranking share one PostgreSQL statement snapshot.
    const query = `
      WITH ${CURRENT_RATES_CTE},
      global_prior AS (
        SELECT SUM(vr.rate) / NULLIF(COUNT(*), 0) AS "globalAvgRate"
        FROM valid_current_rates vr
        INNER JOIN disc prior_disc ON prior_disc.id = vr."discId"
        WHERE prior_disc."releaseDate" <= $${globalAsOfParameter}
      ),
      candidate_discs AS (
        SELECT d.id
        FROM disc d
        LEFT JOIN artist a ON d."artistId" = a.id
        LEFT JOIN country c ON a."countryId" = c.id
        CROSS JOIN global_prior gp
        ${homeDiscFilters.mainWhere}
          AND ${buildTopDiscEligibilityPredicate('d')}
          AND gp."globalAvgRate" IS NOT NULL
      ),
      disc_rate_stats AS (
        SELECT
          vr."discId",
          COUNT(*) AS "voteCount",
          AVG(vr.rate) AS "averageRate"
        FROM valid_current_rates vr
        INNER JOIN candidate_discs candidate ON candidate.id = vr."discId"
        GROUP BY vr."discId"
      ),
      all_rate_stats AS (
        SELECT r."discId", AVG(r.cover) AS "averageCover"
        FROM rate r
        INNER JOIN candidate_discs candidate ON candidate.id = r."discId"
        GROUP BY r."discId"
      )
      SELECT
        d.*,
        a.name AS "artistName",
        c.id AS "countryId",
        c.name AS "countryName",
        c."isoCode" AS "countryIsoCode",
        g.name AS "genreName",
        g.color AS "genreColor",
        COALESCE(drs."voteCount", 0) AS "voteCount",
        COALESCE(drs."averageRate", 0) AS "averageRate",
        COALESCE(ars."averageCover", 0) AS "averageCover",
        user_rate.id AS "userRateId",
        (SELECT f.id FROM favorite f WHERE f."discId" = d.id AND f."userId" = $1 LIMIT 1) AS "userFavoriteId",
        (SELECT p.id FROM pending p WHERE p."discId" = d.id AND p."userId" = $1 LIMIT 1) AS "pendingId",
        user_rate.rate AS "userRate",
        user_rate.cover AS "userCover",
        (SELECT COUNT(c.id) FROM comment c WHERE c."discId" = d.id) AS "commentCount",
        (
          (drs."averageRate" * drs."voteCount")
          + (gp."globalAvgRate" * ${TOP_DISCS_PRIOR_STRENGTH})
        ) / (drs."voteCount" + ${TOP_DISCS_PRIOR_STRENGTH}) AS "weightedScore"
      FROM candidate_discs candidate
      INNER JOIN disc d ON d.id = candidate.id
      LEFT JOIN artist a ON d."artistId" = a.id
      LEFT JOIN country c ON a."countryId" = c.id
      LEFT JOIN genre g ON d."genreId" = g.id
      INNER JOIN disc_rate_stats drs ON drs."discId" = d.id
      LEFT JOIN all_rate_stats ars ON ars."discId" = d.id
      LEFT JOIN current_rates user_rate ON user_rate."discId" = d.id AND user_rate."userId" = $1
      CROSS JOIN global_prior gp
      ORDER BY "weightedScore" DESC, d.id ASC
      LIMIT 11;
    `;

    const topRatedDiscs = await this.discRepository.query(query, queryParams);

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

  getTopDiscOptions(
    query: TopDiscOptionsQueryDto,
  ): Promise<DiscTopOptionsResult> {
    return loadTopDiscOptions(this.discRepository, query, new Date());
  }
}
