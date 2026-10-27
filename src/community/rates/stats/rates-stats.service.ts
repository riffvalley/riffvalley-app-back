import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { UsersService } from 'src/identity/users/users.service';
import {
  RatesGeographyCountryDto,
  RatesGeographyTopResponseDto,
  RatesGeographyWorldResponseDto,
  RatesHomeInsightsResponse,
} from '../dto/rates-geography.dto';
import { RatesTopArtistsResponseDto } from '../dto/rates-artists.dto';

type GeographyQueryRow = {
  totalRatedDiscs: number | string;
  mappedDiscs: number | string;
  countryCount: number | string;
  isoCode: string | null;
  countryName: string | null;
  discCount: number | string | null;
};

type GeographyCountryRow = GeographyQueryRow & {
  isoCode: string;
  countryName: string;
  discCount: number | string;
};

type GeographyQueryResult = {
  totalRatedDiscs: number;
  mappedDiscs: number;
  unmappedDiscs: number;
  countryCount: number;
  countries: GeographyCountryRow[];
};

@Injectable()
export class RatesStatsService {
  private readonly logger = new Logger('RatesStatsService');

  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    private readonly usersService: UsersService,
  ) {}

  async getDashboardActivitySummary(userId: string): Promise<{
    totalRatedDiscs: number;
    currentStreak: number | null;
    monthActiveDays: number | null;
  }> {
    type DashboardActivityRow = {
      totalRatedDiscs: number | string;
      currentStreak: number | string | null;
      monthActiveDays: number | string | null;
    };

    const [row] = (await this.rateRepository.query(
      `
      WITH context AS (
        SELECT
          $1::uuid AS user_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS today,
          date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS month_start,
          capture.started_at,
          (capture.started_at AT TIME ZONE 'Europe/Madrid')::date AS capture_day
        FROM rate_vote_event_capture capture
        WHERE capture.id = 1
      ), activity_days AS (
        SELECT DISTINCT
          (event.occurred_at AT TIME ZONE 'Europe/Madrid')::date AS activity_day
        FROM rate_vote_events event
        CROSS JOIN context
        WHERE event.user_id = context.user_id
          AND event.event_type = 'set'
          AND event.occurred_at >= context.started_at
      ), month_activity AS (
        SELECT COUNT(*)::int AS active_days
        FROM activity_days
        CROSS JOIN context
        WHERE activity_day >= context.month_start
          AND activity_day <= context.today
      ), ordered_activity AS (
        SELECT activity_day,
          ROW_NUMBER() OVER (ORDER BY activity_day DESC) AS day_position,
          MAX(activity_day) OVER () AS latest_day
        FROM activity_days
      ), streak AS (
        SELECT
          COUNT(*) FILTER (
            WHERE activity_day = latest_day - (day_position - 1)::int
          )::int AS contiguous_days,
          MAX(latest_day) AS latest_day,
          MIN(activity_day) AS earliest_day,
          COUNT(*)::int AS recorded_days
        FROM ordered_activity
      )
      SELECT
        (SELECT COUNT(DISTINCT rate."discId")::int
          FROM rate
          WHERE rate."userId" = context.user_id
            AND rate.rate IS NOT NULL) AS "totalRatedDiscs",
        CASE
          WHEN context.capture_day > context.today - 2
            AND (
              streak.latest_day IS NULL
              OR streak.latest_day < context.today - 1
              OR (
                streak.earliest_day = context.capture_day
                AND streak.contiguous_days = streak.recorded_days
              )
            ) THEN NULL
          WHEN streak.latest_day IS NULL THEN 0
          WHEN streak.latest_day < context.today - 1 THEN 0
          WHEN streak.earliest_day = context.capture_day
            AND streak.contiguous_days = streak.recorded_days THEN NULL
          ELSE streak.contiguous_days
        END AS "currentStreak",
        CASE
          WHEN context.started_at > (context.month_start::timestamp AT TIME ZONE 'Europe/Madrid')
            THEN NULL
          ELSE month_activity.active_days
        END AS "monthActiveDays"
      FROM context
      CROSS JOIN month_activity
      CROSS JOIN streak
      `,
      [userId],
    )) as DashboardActivityRow[];

    if (!row) {
      throw new Error('Dashboard activity summary query returned no row');
    }

    return {
      totalRatedDiscs: Number(row.totalRatedDiscs),
      currentStreak:
        row.currentStreak === null ? null : Number(row.currentStreak),
      monthActiveDays:
        row.monthActiveDays === null ? null : Number(row.monthActiveDays),
    };
  }

  async getHomeInsights(user: User): Promise<RatesHomeInsightsResponse> {
    const topArtistsQuery = this.rateRepository
      .createQueryBuilder('rate')
      .innerJoin('rate.disc', 'disc')
      .innerJoin('disc.artist', 'artist')
      .select('artist.id', 'id')
      .addSelect('artist.name', 'name')
      .addSelect('artist.image', 'image')
      .addSelect('AVG(rate.rate)', 'averageRate')
      .addSelect('COUNT(rate.id)', 'ratingCount')
      .where('rate.userId = :userId', { userId: user.id })
      .andWhere('rate.rate IS NOT NULL')
      .groupBy('artist.id')
      .addGroupBy('artist.name')
      .addGroupBy('artist.image')
      .orderBy('AVG(rate.rate)', 'DESC')
      .addOrderBy('COUNT(rate.id)', 'DESC')
      .addOrderBy('artist.name', 'ASC')
      .limit(7);

    const [topArtistsRaw, geography] = await Promise.all([
      topArtistsQuery.getRawMany(),
      this.queryGeography(user.id, 10),
    ]);

    return {
      topArtists: topArtistsRaw.map((artist) => ({
        id: artist.id,
        name: artist.name,
        image: artist.image ?? '',
        averageRate: Number(artist.averageRate),
        ratingCount: Number(artist.ratingCount),
      })),
      countries: geography.countries.map((country) =>
        this.toCountryDto(country, geography.mappedDiscs, 0),
      ),
    };
  }

  async getTopArtists(userId: string): Promise<RatesTopArtistsResponseDto> {
    type TopArtistRow = {
      id: string;
      name: string;
      image: string | null;
      ratingCount: number | string;
      averageRate: number | string;
    };

    // Keep one current musical Rate per user/disc. Use its latest known timestamp;
    // the UUID makes timestamp ties deterministic.
    const rows = (await this.rateRepository.query(
      `
      WITH ranked_musical_rates AS (
        SELECT
          rate.id,
          rate."discId",
          rate.rate,
          ROW_NUMBER() OVER (
            PARTITION BY rate."discId"
            ORDER BY GREATEST(
                       rate."createdAt",
                       COALESCE(rate."editedAt", rate."createdAt")
                     ) DESC,
                     rate.id DESC
          ) AS duplicate_position
        FROM rate
        WHERE rate."userId" = $1
          AND rate.rate IS NOT NULL
      ), latest_disc_ratings AS (
        SELECT "discId", rate
        FROM ranked_musical_rates
        WHERE duplicate_position = 1
      )
      SELECT
        artist.id AS id,
        artist.name AS name,
        artist.image AS image,
        COUNT(DISTINCT disc.id)::int AS "ratingCount",
        AVG(latest_disc_ratings.rate) AS "averageRate"
      FROM latest_disc_ratings
      INNER JOIN disc ON disc.id = latest_disc_ratings."discId"
      INNER JOIN artist ON artist.id = disc."artistId"
      GROUP BY artist.id, artist.name, artist.image
      ORDER BY
        "ratingCount" DESC,
        "averageRate" DESC,
        artist.name ASC,
        artist.id ASC
      LIMIT $2
      `,
      [userId, 7],
    )) as TopArtistRow[];

    return {
      artists: rows.map((artist) => ({
        id: artist.id,
        name: artist.name,
        image: artist.image,
        ratingCount: Number(artist.ratingCount),
        averageRate: Number(artist.averageRate),
      })),
    };
  }

  async getGeographyTop(user: User): Promise<RatesGeographyTopResponseDto> {
    const geography = await this.queryGeography(user.id, 10);
    return {
      countries: geography.countries.map((country) =>
        this.toCountryDto(country, geography.mappedDiscs, 2),
      ),
    };
  }

  async getGeographyWorld(user: User): Promise<RatesGeographyWorldResponseDto> {
    const geography = await this.queryGeography(user.id);
    return {
      totalRatedDiscs: geography.totalRatedDiscs,
      mappedDiscs: geography.mappedDiscs,
      unmappedDiscs: geography.unmappedDiscs,
      countryCount: geography.countryCount,
      countries: geography.countries.map((country) =>
        this.toCountryDto(country, geography.mappedDiscs, 2),
      ),
    };
  }

  private async queryGeography(
    userId: string,
    limit?: number,
  ): Promise<GeographyQueryResult> {
    const limitSql = limit === undefined ? '' : 'LIMIT $2';
    const parameters: (string | number)[] =
      limit === undefined ? [userId] : [userId, limit];
    const query = [
      'WITH rated_discs AS (',
      '  SELECT DISTINCT',
      '    disc.id AS "discId",',
      '    CASE',
      '      WHEN country."isoCode" ~* \'^[A-Z]{2}$\'',
      '        THEN UPPER(country."isoCode")',
      '      ELSE NULL',
      '    END AS "isoCode",',
      '    country.name AS "countryName"',
      '  FROM rate',
      '  INNER JOIN disc ON disc.id = rate."discId"',
      '  LEFT JOIN artist ON artist.id = disc."artistId"',
      '  LEFT JOIN country ON country.id = artist."countryId"',
      '  WHERE rate."userId" = $1',
      '    AND rate.rate IS NOT NULL',
      '),',
      'totals AS (',
      '  SELECT',
      '    COUNT(DISTINCT "discId")::int AS "totalRatedDiscs",',
      '    COUNT(DISTINCT "discId") FILTER (WHERE "isoCode" IS NOT NULL)::int',
      '      AS "mappedDiscs"',
      '  FROM rated_discs',
      '),',
      'country_counts AS (',
      '  SELECT',
      '    "isoCode",',
      '    MIN("countryName") AS "countryName",',
      '    COUNT(DISTINCT "discId")::int AS "discCount"',
      '  FROM rated_discs',
      '  WHERE "isoCode" IS NOT NULL',
      '  GROUP BY "isoCode"',
      '),',
      'country_total AS (',
      '  SELECT COUNT(*)::int AS "countryCount"',
      '  FROM country_counts',
      '),',
      'visible_countries AS (',
      '  SELECT "isoCode", "countryName", "discCount"',
      '  FROM country_counts',
      '  ORDER BY "discCount" DESC, "isoCode" ASC',
      '  ' + limitSql,
      ')',
      'SELECT',
      '  totals."totalRatedDiscs",',
      '  totals."mappedDiscs",',
      '  country_total."countryCount",',
      '  visible_countries."isoCode",',
      '  visible_countries."countryName",',
      '  visible_countries."discCount"',
      'FROM totals',
      'CROSS JOIN country_total',
      'LEFT JOIN visible_countries ON TRUE',
      'ORDER BY',
      '  visible_countries."discCount" DESC NULLS LAST,',
      '  visible_countries."isoCode" ASC NULLS LAST',
    ].join('\n');
    const rows = (await this.rateRepository.query(
      query,
      parameters,
    )) as GeographyQueryRow[];

    const firstRow = rows[0];
    if (!firstRow) {
      throw new Error('Geography query returned no totals row');
    }

    const totalRatedDiscs = Number(firstRow.totalRatedDiscs);
    const mappedDiscs = Number(firstRow.mappedDiscs);
    const countries = rows.filter(
      (row): row is GeographyCountryRow =>
        row.isoCode !== null &&
        row.countryName !== null &&
        row.discCount !== null,
    );

    return {
      totalRatedDiscs,
      mappedDiscs,
      unmappedDiscs: totalRatedDiscs - mappedDiscs,
      countryCount: Number(firstRow.countryCount),
      countries,
    };
  }

  private toCountryDto(
    country: GeographyCountryRow,
    mappedDiscs: number,
    decimalPlaces: 0 | 2,
  ): RatesGeographyCountryDto {
    const count = Number(country.discCount);
    const percentage = mappedDiscs ? (count / mappedDiscs) * 100 : 0;
    const factor = decimalPlaces === 0 ? 1 : 100;
    return {
      isoCode: country.isoCode,
      name: country.countryName,
      count,
      percentage: Math.round(percentage * factor) / factor,
    };
  }

  async getUserStats(user: User, year?: string) {
    const userId = user.id;
    // Sin año concreto => discos de todos los años (coherente con el leaderboard del dashboard).
    // Con año => discos publicados ese año, igual que el leaderboard (por fecha de lanzamiento
    // del disco, no por la fecha en la que se emitió el voto).
    const filterYear = year || undefined;

    // 1. Total de votos (rates) sobre discos del año filtrado (o de todos si no hay año)
    const totalVotesQb = this.rateRepository
      .createQueryBuilder('rate')
      .innerJoin('rate.disc', 'disc')
      .where('rate.userId = :userId', { userId })
      .andWhere('rate.rate IS NOT NULL');
    if (filterYear) {
      totalVotesQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", {
        filterYear,
      });
    }
    const totalVotes = await totalVotesQb.getCount();

    // 2. Votos por género - discos del año filtrado (o de todos si no hay año)
    const votesByGenreQb = this.rateRepository
      .createQueryBuilder('rate')
      .innerJoin('rate.disc', 'disc')
      .innerJoin('disc.genre', 'genre')
      .select('genre.name', 'genre')
      .addSelect('COUNT(rate.id)', 'count')
      .where('rate.userId = :userId', { userId })
      .andWhere('rate.rate IS NOT NULL');
    if (filterYear) {
      votesByGenreQb.andWhere(
        "TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear",
        { filterYear },
      );
    }
    const votesByGenre = await votesByGenreQb
      .groupBy('genre.name')
      .getRawMany();

    // Mapear resultados para asegurar formato numérico en count
    const formattedVotesByGenre = votesByGenre.map((item) => ({
      genre: item.genre,
      count: parseInt(item.count, 10),
    }));

    // 3. Votos por mes y semana (en la fecha en la que se emitió el voto), sobre discos del año filtrado
    const votesByMonthQb = this.rateRepository
      .createQueryBuilder('rate')
      .innerJoin('rate.disc', 'disc')
      .select("TO_CHAR(rate.createdAt, 'Month')", 'month')
      .addSelect('EXTRACT(MONTH FROM rate.createdAt)', 'month_num')
      .addSelect("TO_CHAR(rate.createdAt, 'W')", 'week')
      .addSelect('COUNT(rate.id)', 'count')
      .where('rate.userId = :userId', { userId })
      .andWhere('rate.rate IS NOT NULL');
    if (filterYear) {
      votesByMonthQb.andWhere(
        "TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear",
        { filterYear },
      );
    }
    const votesByMonthRaw = await votesByMonthQb
      .groupBy('month')
      .addGroupBy('month_num')
      .addGroupBy('week')
      .orderBy('month_num', 'ASC')
      .addOrderBy('week', 'ASC')
      .getRawMany();

    // Agrupar por mes y luego por semana
    const votesByMonthMap = new Map<
      string,
      { month: string; count: number; weeks: { week: string; count: number }[] }
    >();

    votesByMonthRaw.forEach((item) => {
      const month = item.month.trim();
      const count = parseInt(item.count, 10);
      const week = item.week;

      if (!votesByMonthMap.has(month)) {
        votesByMonthMap.set(month, {
          month,
          count: 0,
          weeks: [],
        });
      }

      const monthEntry = votesByMonthMap.get(month);
      monthEntry.count += count;
      monthEntry.weeks.push({
        week: week,
        count: count,
      });
    });

    const formattedVotesByMonth = Array.from(votesByMonthMap.values());

    // 4. Media y Mediana - sobre discos del año filtrado (o de todos si no hay año)
    const statsQb = this.rateRepository
      .createQueryBuilder('rate')
      .innerJoin('rate.disc', 'disc')
      .select('AVG(rate.rate)', 'mean')
      .addSelect(
        'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate.rate)',
        'median',
      )
      .where('rate.userId = :userId', { userId })
      .andWhere('rate.rate IS NOT NULL');
    if (filterYear) {
      statsQb.andWhere("TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear", {
        filterYear,
      });
    }
    const stats = await statsQb.getRawOne();

    const mean = stats && stats.mean ? parseFloat(stats.mean).toFixed(2) : 0;
    const median = stats && stats.median ? parseFloat(stats.median) : 0;

    // 5. Desglose de votos (0-10) - sobre discos del año filtrado (o de todos si no hay año)
    const votesByScoreQb = this.rateRepository
      .createQueryBuilder('rate')
      .innerJoin('rate.disc', 'disc')
      .select('rate.rate', 'score')
      .addSelect('COUNT(rate.id)', 'count')
      .where('rate.userId = :userId', { userId })
      .andWhere('rate.rate IS NOT NULL');
    if (filterYear) {
      votesByScoreQb.andWhere(
        "TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear",
        { filterYear },
      );
    }
    const votesByScoreRaw = await votesByScoreQb
      .groupBy('rate.rate')
      .orderBy('rate.rate', 'ASC')
      .getRawMany();

    // Inicializar array con 0s para todos los scores del 0 al 10
    const votesByScore = Array.from({ length: 11 }, (_, i) => ({
      score: i,
      count: 0,
    }));

    // Rellenar con los datos reales
    votesByScoreRaw.forEach((item) => {
      const score = Math.floor(parseFloat(item.score));
      const count = parseInt(item.count, 10);
      if (score >= 0 && score <= 10) {
        votesByScore[score].count += count;
      }
    });

    // 6. Total Usuarios y Ranking
    const totalUsers = await this.usersService.countUsers();

    // Ranking: Contar cuántos usuarios tienen más votos que el usuario actual sobre el mismo
    // conjunto de discos (año filtrado, o todos si no hay año) - misma lógica que el leaderboard
    const usersWithMoreVotesQb = this.rateRepository
      .createQueryBuilder('rate')
      .innerJoin('rate.disc', 'disc')
      .select('rate.user.id')
      .where('rate.rate IS NOT NULL');
    if (filterYear) {
      usersWithMoreVotesQb.andWhere(
        "TO_CHAR(disc.releaseDate, 'YYYY') = :filterYear",
        { filterYear },
      );
    }
    const usersWithMoreVotesRaw = await usersWithMoreVotesQb
      .groupBy('rate.user.id')
      .having('COUNT(rate.id) > :totalVotes', { totalVotes })
      .getRawMany();

    const rank = usersWithMoreVotesRaw.length + 1;

    return {
      totalVotes,
      mean,
      median,
      votesByGenre: formattedVotesByGenre,
      votesByMonth: formattedVotesByMonth,
      votesByScore,
      totalUsers,
      rank,
    };
  }
}
