import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { RATES_ARTISTS_BAYESIAN_PRIOR_STRENGTH } from './rates-artists.constants';
import { RatesArtistSummaryQueryDto } from '../dto/rates-artist-summary-query.dto';
import { RatesArtistsTopPeriod } from '../dto/rates-artists-top-query.dto';
import {
  RatesArtistSummaryDiscDto,
  RatesArtistSummaryGenreDto,
  RatesArtistSummaryResponseDto,
} from '../dto/rates-artist-summary.dto';

const ELIGIBLE_USER_ARTIST_RATES_CTES = `
  ranked_artist_rates AS (
    SELECT
      rate.id AS "rateId",
      rate."discId",
      disc.name AS "discName",
      disc.image AS "discImage",
      TO_CHAR(disc."releaseDate", 'YYYY-MM-DD') AS "releaseDate",
      rate.rate AS "rateValue",
      rate.cover,
      rate."createdAt",
      GREATEST(
        rate."createdAt",
        COALESCE(rate."editedAt", rate."createdAt")
      ) AS "lastActivityAt",
      ROW_NUMBER() OVER (
        PARTITION BY rate."discId"
        ORDER BY GREATEST(
          rate."createdAt",
          COALESCE(rate."editedAt", rate."createdAt")
        ) DESC, rate.id DESC
      ) AS duplicate_position
    FROM rate
    INNER JOIN disc ON disc.id = rate."discId"
    WHERE rate."userId" = $1
      AND disc."artistId" = $2
      AND rate.rate IS NOT NULL
  ), eligible_artist_rates AS (
    SELECT
      "rateId",
      "discId",
      "discName",
      "discImage",
      "releaseDate",
      "rateValue",
      cover,
      "createdAt",
      "lastActivityAt"
    FROM ranked_artist_rates
    WHERE duplicate_position = 1
  )`;

type ArtistSummaryRow = {
  artistId: string;
  artistName: string;
  artistImage: string | null;
  countryId: string | null;
  countryName: string | null;
  countryIsoCode: string | null;
  genres: RatesArtistSummaryGenreDto[];
  ratedDiscCount: number | string;
  averageRate: number | string | null;
  highestRatedDiscId: string | null;
  highestRatedDiscName: string | null;
  highestRatedDiscRate: number | string | null;
  lowestRatedDiscId: string | null;
  lowestRatedDiscName: string | null;
  lowestRatedDiscRate: number | string | null;
  firstAvailableActivityAt: string | null;
  lastAvailableActivityAt: string | null;
};

type ArtistSummaryDiscRow = {
  rateId: string;
  discId: string;
  discName: string;
  discImage: string | null;
  releaseDate: string | null;
  rateValue: number | string;
  cover: number | string | null;
  lastActivityAt: string;
};

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

  async getTopArtists(
    userId: string,
    period: RatesArtistsTopPeriod = 'all',
  ): Promise<RatesTopArtistsResponseDto> {
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
          GREATEST(
            rate."createdAt",
            COALESCE(rate."editedAt", rate."createdAt")
          ) AS "lastActivityAt",
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
        SELECT "discId", rate, "lastActivityAt"
        FROM ranked_musical_rates
        WHERE duplicate_position = 1
      ), madrid_clock AS (
        SELECT
          $2::text AS period,
          CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid' AS madrid_now
      ), period_bounds AS (
        SELECT
          period,
          CASE period
            WHEN 'month' THEN
              (date_trunc('month', madrid_now) AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
            WHEN 'year' THEN
              (date_trunc('year', madrid_now) AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
            ELSE NULL
          END AS start_at,
          CASE period
            WHEN 'month' THEN
              ((date_trunc('month', madrid_now) + INTERVAL '1 month') AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
            WHEN 'year' THEN
              ((date_trunc('year', madrid_now) + INTERVAL '1 year') AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'
            ELSE NULL
          END AS end_at
        FROM madrid_clock
      ), period_ratings AS (
        SELECT latest_disc_ratings."discId", latest_disc_ratings.rate
        FROM latest_disc_ratings
        CROSS JOIN period_bounds
        WHERE period_bounds.period = 'all'
          OR (
            latest_disc_ratings."lastActivityAt" >= period_bounds.start_at
            AND latest_disc_ratings."lastActivityAt" < period_bounds.end_at
          )
      ), user_average AS (
        SELECT AVG(rate) AS "globalAverageRate"
        FROM period_ratings
      ), artist_averages AS (
      SELECT
        artist.id AS id,
        artist.name AS name,
        artist.image AS image,
        COUNT(DISTINCT disc.id)::int AS "ratingCount",
        AVG(latest_disc_ratings.rate) AS "averageRate"
      FROM period_ratings AS latest_disc_ratings
      INNER JOIN disc ON disc.id = latest_disc_ratings."discId"
      INNER JOIN artist ON artist.id = disc."artistId"
      GROUP BY artist.id, artist.name, artist.image
      ), scored_artists AS (
        SELECT
          artist_averages.id,
          artist_averages.name,
          artist_averages.image,
          artist_averages."ratingCount",
          artist_averages."averageRate",
          (
            artist_averages."ratingCount" * artist_averages."averageRate"
            + $3::numeric * user_average."globalAverageRate"
          ) / (artist_averages."ratingCount" + $3::numeric) AS "bayesianScore"
        FROM artist_averages
        CROSS JOIN user_average
      )
      SELECT id, name, image, "ratingCount", "averageRate"
      FROM scored_artists
      ORDER BY
        "bayesianScore" DESC,
        "averageRate" DESC,
        "ratingCount" DESC,
        name ASC,
        id ASC
      LIMIT 7
      `,
      [userId, period, RATES_ARTISTS_BAYESIAN_PRIOR_STRENGTH],
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

  async getArtistSummary(
    userId: string,
    artistId: string,
    pagination: RatesArtistSummaryQueryDto,
  ): Promise<RatesArtistSummaryResponseDto> {
    // Rate timestamps have no explicit timezone type in the entity; format stored
    // values without adding a UTC offset that the backend cannot verify.
    const [summary] = await this.rateRepository.query<ArtistSummaryRow[]>(
      `
      WITH artist_info AS (
        SELECT
          artist.id AS "artistId",
          artist.name AS "artistName",
          artist.image AS "artistImage",
          country.id AS "countryId",
          country.name AS "countryName",
          country."isoCode" AS "countryIsoCode",
          COALESCE((
            SELECT json_agg(
              json_build_object('id', genre_rows.id, 'name', genre_rows.name)
              ORDER BY genre_rows.name ASC, genre_rows.id ASC
            )
            FROM (
              SELECT DISTINCT genre.id, genre.name
              FROM disc
              INNER JOIN genre ON genre.id = disc."genreId"
              WHERE disc."artistId" = artist.id
            ) genre_rows
          ), '[]'::json) AS genres
        FROM artist
        LEFT JOIN country ON country.id = artist."countryId"
        WHERE artist.id = $2
      ),
      ${ELIGIBLE_USER_ARTIST_RATES_CTES}, activity_stats AS (
        SELECT
          COUNT(DISTINCT "discId")::int AS "ratedDiscCount",
          AVG("rateValue") AS "averageRate",
          TO_CHAR(MIN("createdAt"), 'YYYY-MM-DD"T"HH24:MI:SS.US')
            AS "firstAvailableActivityAt",
          TO_CHAR(MAX("lastActivityAt"), 'YYYY-MM-DD"T"HH24:MI:SS.US')
            AS "lastAvailableActivityAt"
        FROM eligible_artist_rates
      ), highest_rated_disc AS (
        SELECT "discId", "discName", "rateValue"
        FROM eligible_artist_rates
        ORDER BY "rateValue" DESC, "discId" ASC
        LIMIT 1
      ), lowest_rated_disc AS (
        SELECT "discId", "discName", "rateValue"
        FROM eligible_artist_rates
        ORDER BY "rateValue" ASC, "discId" ASC
        LIMIT 1
      )
      SELECT
        artist_info."artistId",
        artist_info."artistName",
        artist_info."artistImage",
        artist_info."countryId",
        artist_info."countryName",
        artist_info."countryIsoCode",
        artist_info.genres,
        activity_stats."ratedDiscCount",
        activity_stats."averageRate",
        highest_rated_disc."discId" AS "highestRatedDiscId",
        highest_rated_disc."discName" AS "highestRatedDiscName",
        highest_rated_disc."rateValue" AS "highestRatedDiscRate",
        lowest_rated_disc."discId" AS "lowestRatedDiscId",
        lowest_rated_disc."discName" AS "lowestRatedDiscName",
        lowest_rated_disc."rateValue" AS "lowestRatedDiscRate",
        activity_stats."firstAvailableActivityAt",
        activity_stats."lastAvailableActivityAt"
      FROM artist_info
      CROSS JOIN activity_stats
      LEFT JOIN highest_rated_disc ON TRUE
      LEFT JOIN lowest_rated_disc ON TRUE
      `,
      [userId, artistId],
    );

    if (!summary) {
      throw new NotFoundException(`Artist with id ${artistId} not found`);
    }

    const { page, limit } = pagination;
    const offset = (page - 1) * limit;
    const discRows = await this.rateRepository.query<ArtistSummaryDiscRow[]>(
      `
      WITH ${ELIGIBLE_USER_ARTIST_RATES_CTES}
      SELECT
        "rateId",
        "discId",
        "discName",
        "discImage",
        "releaseDate",
        "rateValue",
        cover,
        TO_CHAR("lastActivityAt", 'YYYY-MM-DD"T"HH24:MI:SS.US')
          AS "lastActivityAt"
      FROM eligible_artist_rates
      ORDER BY "lastActivityAt" DESC, "discId" ASC
      LIMIT $3
      OFFSET $4
      `,
      [userId, artistId, limit, offset],
    );

    const ratedDiscCount = Number(summary.ratedDiscCount);
    return {
      artist: {
        id: summary.artistId,
        name: summary.artistName,
        image: summary.artistImage,
        country:
          summary.countryId === null || summary.countryName === null
            ? null
            : {
                id: summary.countryId,
                name: summary.countryName,
                isoCode: summary.countryIsoCode,
              },
        genres: summary.genres,
      },
      stats: {
        ratedDiscCount,
        averageRate:
          summary.averageRate === null ? null : Number(summary.averageRate),
        highestRatedDisc:
          summary.highestRatedDiscId === null ||
          summary.highestRatedDiscName === null ||
          summary.highestRatedDiscRate === null
            ? null
            : {
                id: summary.highestRatedDiscId,
                name: summary.highestRatedDiscName,
                rate: Number(summary.highestRatedDiscRate),
              },
        lowestRatedDisc:
          summary.lowestRatedDiscId === null ||
          summary.lowestRatedDiscName === null ||
          summary.lowestRatedDiscRate === null
            ? null
            : {
                id: summary.lowestRatedDiscId,
                name: summary.lowestRatedDiscName,
                rate: Number(summary.lowestRatedDiscRate),
              },
        firstAvailableActivityAt: summary.firstAvailableActivityAt,
        lastAvailableActivityAt: summary.lastAvailableActivityAt,
      },
      discs: {
        data: discRows.map(
          (disc): RatesArtistSummaryDiscDto => ({
            id: disc.discId,
            name: disc.discName,
            image: disc.discImage,
            releaseDate: disc.releaseDate,
            rate: Number(disc.rateValue),
            cover: disc.cover === null ? null : Number(disc.cover),
            rateId: disc.rateId,
            lastActivityAt: disc.lastActivityAt,
          }),
        ),
        total: ratedDiscCount,
        page,
        limit,
        totalPages: Math.ceil(ratedDiscCount / limit),
      },
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
