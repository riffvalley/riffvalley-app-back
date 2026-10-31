import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import {
  RatesDashboardDiscDto,
  RatesDashboardGenreDto,
  RatesDashboardRecentRateDto,
  RatesDashboardSummaryDto,
} from '../dto/rates-dashboard-summary.dto';
import { getMadridWeekBoundaries } from './helpers/get-madrid-week-boundaries';

interface DashboardSummaryRow {
  activeRates: number | string;
  averageMusicalRate: number | string | null;
  distinctGenres: number | string;
  previousRates: number | string;
  bestRatedDisc: RatesDashboardDiscDto | string | null;
  dominantGenre: RatesDashboardGenreDto | string | null;
  recentRates: RatesDashboardRecentRateDto[] | string | null;
}

const DASHBOARD_SUMMARY_SQL = `
  WITH bounds AS (
    SELECT
      $2::timestamptz AT TIME ZONE 'UTC' AS week_start,
      $3::timestamptz AT TIME ZONE 'UTC' AS week_end,
      $4::timestamptz AT TIME ZONE 'UTC' AS previous_week_start
  ), user_rates AS (
    SELECT
      r.id AS rate_id,
      r.rate::numeric AS musical_rate,
      r.cover::numeric AS cover_rate,
      GREATEST(r."createdAt", COALESCE(r."editedAt", r."createdAt")) AS last_activity,
      d.id AS disc_id,
      d.name AS disc_name,
      d.image AS cover_image,
      a.id AS artist_id,
      a.name AS artist_name,
      g.id AS genre_id,
      g.name AS genre_name
    FROM rate r
    LEFT JOIN disc d ON d.id = r."discId"
    LEFT JOIN artist a ON a.id = d."artistId"
    LEFT JOIN genre g ON g.id = d."genreId"
    WHERE r."userId" = $1::uuid
  ), current_week AS (
    SELECT user_rates.*
    FROM user_rates CROSS JOIN bounds
    WHERE last_activity >= bounds.week_start
      AND last_activity < bounds.week_end
  ), previous_week AS (
    SELECT user_rates.*
    FROM user_rates CROSS JOIN bounds
    WHERE last_activity >= bounds.previous_week_start
      AND last_activity < bounds.week_start
  ), current_metrics AS (
    SELECT
      (SELECT COUNT(DISTINCT event.disc_id)::int
       FROM rate_vote_events event
       WHERE event.user_id = $1::uuid
         AND event.event_type = 'set'
         AND event.disc_id IS NOT NULL
         AND event.occurred_at >= $2::timestamptz
         AND event.occurred_at < $3::timestamptz) AS active_rates,
      AVG(musical_rate) AS average_musical_rate,
      COUNT(DISTINCT genre_id)::int AS distinct_genres
    FROM current_week CROSS JOIN bounds
  ), previous_metrics AS (
    SELECT COUNT(DISTINCT event.disc_id)::int AS previous_rates
    FROM rate_vote_events event CROSS JOIN bounds
    WHERE event.user_id = $1::uuid
      AND event.event_type = 'set'
      AND event.disc_id IS NOT NULL
      AND event.occurred_at >= $4::timestamptz
      AND event.occurred_at < $2::timestamptz
  ), best_disc AS (
    SELECT jsonb_build_object(
      'rateId', rate_id,
      'discId', disc_id,
      'discName', disc_name,
      'artist', CASE WHEN artist_id IS NULL THEN NULL
        ELSE jsonb_build_object('id', artist_id, 'name', artist_name) END,
      'coverImage', cover_image,
      'rate', musical_rate
    ) AS value
    FROM current_week
    WHERE musical_rate IS NOT NULL AND disc_id IS NOT NULL
    ORDER BY musical_rate DESC, disc_name ASC NULLS LAST, disc_id ASC, rate_id ASC
    LIMIT 1
  ), genre_counts AS (
    SELECT genre_id, genre_name, COUNT(*)::int AS active_rates
    FROM current_week
    WHERE genre_id IS NOT NULL
    GROUP BY genre_id, genre_name
  ), dominant_genre AS (
    SELECT jsonb_build_object(
      'id', genre_id,
      'name', genre_name,
      'activeRates', active_rates
    ) AS value
    FROM genre_counts
    ORDER BY active_rates DESC, genre_name ASC, genre_id ASC
    LIMIT 1
  ), recent AS (
    SELECT
      rate_id AS id,
      disc_id AS "discId",
      disc_name AS "discName",
      CASE WHEN artist_id IS NULL THEN NULL
        ELSE jsonb_build_object('id', artist_id, 'name', artist_name) END AS artist,
      cover_image AS "coverImage",
      musical_rate AS rate,
      cover_rate AS cover,
      to_char(last_activity AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastActivityAt"
    FROM user_rates
    WHERE disc_id IS NOT NULL
    ORDER BY last_activity DESC, rate_id ASC
    LIMIT 5
  )
  SELECT
    current_metrics.active_rates AS "activeRates",
    current_metrics.average_musical_rate AS "averageMusicalRate",
    current_metrics.distinct_genres AS "distinctGenres",
    previous_metrics.previous_rates AS "previousRates",
    (SELECT value FROM best_disc) AS "bestRatedDisc",
    (SELECT value FROM dominant_genre) AS "dominantGenre",
    COALESCE((SELECT jsonb_agg(recent ORDER BY recent."lastActivityAt" DESC, recent.id ASC)
      FROM recent), '[]'::jsonb) AS "recentRates"
  FROM current_metrics CROSS JOIN previous_metrics
`;

@Injectable()
export class RatesDashboardSummaryService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Pick<Repository<Rate>, 'query'>,
  ) {}

  async getSummary(
    userId: string,
    referenceDate = new Date(),
  ): Promise<RatesDashboardSummaryDto> {
    const period = getMadridWeekBoundaries(referenceDate);
    const [row] = (await this.rateRepository.query(DASHBOARD_SUMMARY_SQL, [
      userId,
      period.start,
      period.endExclusive,
      period.previousStart,
    ])) as DashboardSummaryRow[];

    const activeRates = Number(row.activeRates);
    const previousRates = Number(row.previousRates);
    const average = row.averageMusicalRate;

    return {
      period: {
        start: period.start.toISOString(),
        endExclusive: period.endExclusive.toISOString(),
        timezone: 'Europe/Madrid',
      },
      metrics: {
        activeRates,
        averageMusicalRate: average === null ? null : Number(average),
        distinctGenres: Number(row.distinctGenres),
        bestRatedDisc: parseJsonValue(row.bestRatedDisc),
        dominantGenre: parseJsonValue(row.dominantGenre),
        weekOverWeek: {
          currentRates: activeRates,
          previousRates,
          difference: activeRates - previousRates,
          percentageChange:
            previousRates === 0
              ? null
              : Math.round(
                  ((activeRates - previousRates) / previousRates) * 10000,
                ) / 100,
        },
      },
      recentRates: parseJsonValue(row.recentRates) ?? [],
    };
  }
}

function parseJsonValue<T>(value: T | string | null): T | null {
  if (value === null) return null;
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}
