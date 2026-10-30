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
import { buildLegacyHomeDiscFilters } from './helpers/legacy-home-disc-filters';
import { buildLegacyHomeDiscEligibilityPredicate } from './helpers/legacy-home-disc-eligibility';
import { loadLegacyHomeGlobalStats } from './loaders/legacy-home-global-stats';

const OFFICIAL_TOP_DISCS_LIMIT = 11;
const LEGACY_HOME_DISCS_LIMIT = 20;

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
    return this.loadTopDiscs(
      paginationDto,
      user,
      genreId,
      OFFICIAL_TOP_DISCS_LIMIT,
    );
  }

  async getLegacyTopDiscs(
    paginationDto: TopStatsQueryDto,
    user: User,
    genreId?: string,
  ): Promise<DiscTopResult> {
    const {
      dateRange,
      country,
      countryId,
      statsDateRange,
      distributionDateRange,
    } = paginationDto;
    const today = new Date();
    const filters = buildLegacyHomeDiscFilters({
      userId: user.id,
      dateRange,
      genreId,
      country,
      countryId,
      today,
    });
    const { globalAvgRate, medianVotes } = await loadLegacyHomeGlobalStats(
      this.discRepository,
      filters.globalWhere,
      filters.globalParams,
    );

    const rankingQuery = `
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
      ${filters.mainWhere}
      AND ${buildLegacyHomeDiscEligibilityPredicate('d')}
      GROUP BY d.id, a.name, g.name, g.color, c.id, c.name, c."isoCode"
      ORDER BY "weightedScore" DESC, d.id ASC
      LIMIT ${LEGACY_HOME_DISCS_LIMIT};
    `;
    const topRatedDiscs = await this.discRepository.query(
      rankingQuery,
      filters.mainParams,
    );

    const { totalDiscs, totalVotes } = await loadHomeDiscTotals(
      this.discRepository,
      statsDateRange,
    );
    const topUsersByRates = await loadHomeTopUsersByRates(
      this.discRepository,
      statsDateRange,
    );
    const topUsersByCover = await loadHomeTopUsersByCover(
      this.discRepository,
      statsDateRange,
    );
    const ratingDistribution = await loadHomeRatingDistribution(
      this.discRepository,
      distributionDateRange,
    );

    return {
      discs: topRatedDiscs.map(mapHomeRankedDisc),
      totalDiscs,
      totalVotes,
      topUsersByRates,
      topUsersByCover,
      ratingDistribution,
    };
  }

  private async loadTopDiscs(
    paginationDto: TopStatsQueryDto,
    user: User,
    genreId: string | undefined,
    resultLimit: number,
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
          AND (gp."globalAvgRate" IS NOT NULL OR d."pinned" = true)
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
        drs."averageRate" AS "averageRate",
        COALESCE(ars."averageCover", 0) AS "averageCover",
        user_rate.id AS "userRateId",
        (SELECT f.id FROM favorite f WHERE f."discId" = d.id AND f."userId" = $1 LIMIT 1) AS "userFavoriteId",
        (SELECT p.id FROM pending p WHERE p."discId" = d.id AND p."userId" = $1 LIMIT 1) AS "pendingId",
        user_rate.rate AS "userRate",
        user_rate.cover AS "userCover",
        (SELECT COUNT(c.id) FROM comment c WHERE c."discId" = d.id) AS "commentCount",
        CASE
          WHEN COALESCE(drs."voteCount", 0) = 0 THEN NULL
          ELSE (
            (drs."averageRate" * drs."voteCount")
            + (gp."globalAvgRate" * ${TOP_DISCS_PRIOR_STRENGTH})
          ) / (drs."voteCount" + ${TOP_DISCS_PRIOR_STRENGTH})
        END AS "weightedScore"
      FROM candidate_discs candidate
      INNER JOIN disc d ON d.id = candidate.id
      LEFT JOIN artist a ON d."artistId" = a.id
      LEFT JOIN country c ON a."countryId" = c.id
      LEFT JOIN genre g ON d."genreId" = g.id
      LEFT JOIN disc_rate_stats drs ON drs."discId" = d.id
      LEFT JOIN all_rate_stats ars ON ars."discId" = d.id
      LEFT JOIN current_rates user_rate ON user_rate."discId" = d.id AND user_rate."userId" = $1
      CROSS JOIN global_prior gp
      ORDER BY
        CASE WHEN COALESCE(drs."voteCount", 0) > 0 THEN 0 ELSE 1 END ASC,
        "weightedScore" DESC NULLS LAST,
        d.id ASC
      LIMIT ${resultLimit};
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
