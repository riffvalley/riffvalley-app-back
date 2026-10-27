import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';
import {
  CommunityDashboardRankingsResponse,
  CommunityDashboardRatesStatsResponse,
} from './community-dashboard-rates.types';

type UserCountRow = {
  userId: string;
  username: string;
  count: number | string;
};

type SummaryRow = {
  ratedDiscs: number | string;
  participatingUsers: number | string;
  averageRating: number | string | null;
};

type DistributionRow = { bucket: string; count: number | string };
type GenreRow = { id: string; name: string; ratedDiscs: number | string };
type StreakRow = { userId: string; username: string; days: number | string };

const VOTES_CTE = `
  WITH bounds AS (
    SELECT make_date($1::int, 1, 1) AS year_start,
      make_date($1::int + 1, 1, 1) AS year_end
  ), votes AS (
    SELECT DISTINCT ON (r."userId", r."discId")
      r."userId" AS user_id, r."discId" AS disc_id, r.rate::numeric AS value,
      d."genreId" AS genre_id
    FROM rate r
    JOIN disc d ON d.id = r."discId"
    CROSS JOIN bounds
    WHERE r.rate IS NOT NULL
      AND d."releaseDate" >= bounds.year_start
      AND d."releaseDate" < bounds.year_end
    ORDER BY r."userId", r."discId", COALESCE(r."editedAt", r."createdAt") DESC, r.id DESC
  )`;

const EVENTS_CTE = `
  WITH bounds AS (
    SELECT make_date($1::int, 1, 1)::timestamp AT TIME ZONE 'Europe/Madrid' AS year_start,
      make_date($1::int + 1, 1, 1)::timestamp AT TIME ZONE 'Europe/Madrid' AS year_end
  ), votes AS (
    SELECT event.user_id, event.disc_id, event.new_value::numeric AS value,
      d."genreId" AS genre_id
    FROM rate_vote_events event
    LEFT JOIN disc d ON d.id = event.disc_id
    CROSS JOIN bounds
    WHERE event.event_type = 'set'
      AND event.new_value IS NOT NULL
      AND event.occurred_at >= bounds.year_start
      AND event.occurred_at < bounds.year_end
  )`;

@Injectable()
export class CommunityDashboardRatesService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Pick<Repository<Rate>, 'query'>,
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Pick<Repository<RateVoteEvent>, 'query'>,
  ) {}

  async getRankings(year: number): Promise<CommunityDashboardRankingsResponse> {
    const [rates, covers] = await Promise.all([
      year < 2027
        ? this.getHistoricalRateRanking(year)
        : this.getEventRateRanking(year),
      this.getCoverRanking(year),
    ]);
    return {
      year,
      topUsersByRates: rates.map((row) => ({
        user: { id: String(row.userId), username: String(row.username) },
        rateCount: Number(row.count),
      })),
      topUsersByCover: covers.map((row) => ({
        user: { id: String(row.userId), username: String(row.username) },
        totalCover: Number(row.count),
      })),
    };
  }

  async getStats(year: number): Promise<CommunityDashboardRatesStatsResponse> {
    const [summary, distribution, genre, currentStreaks] = await Promise.all([
      this.getYearSummary(year),
      this.getYearDistribution(year),
      this.getTopGenre(year),
      this.getCurrentStreaks(),
    ]);
    return {
      year,
      summary,
      ratingDistribution: distribution,
      currentStreaks,
      topGenre: genre,
    };
  }

  private async getHistoricalRateRanking(
    year: number,
  ): Promise<UserCountRow[]> {
    return this.rateRepository.query(
      `WITH bounds AS (
        SELECT make_date($1::int, 1, 1) AS year_start,
          make_date($1::int + 1, 1, 1) AS year_end
      )
      SELECT u.id AS "userId", u.username, COUNT(DISTINCT r."discId")::int AS count
      FROM rate r JOIN "users" u ON u.id = r."userId"
      JOIN disc d ON d.id = r."discId" CROSS JOIN bounds
      WHERE r.rate IS NOT NULL AND d."releaseDate" >= bounds.year_start
        AND d."releaseDate" < bounds.year_end
      GROUP BY u.id, u.username
      ORDER BY count DESC, u.username ASC, u.id ASC LIMIT 20`,
      [year],
    ) as Promise<UserCountRow[]>;
  }

  private async getEventRateRanking(year: number): Promise<UserCountRow[]> {
    return this.eventRepository.query(
      `WITH bounds AS (
        SELECT make_date($1::int, 1, 1)::timestamp AT TIME ZONE 'Europe/Madrid' AS year_start,
          make_date($1::int + 1, 1, 1)::timestamp AT TIME ZONE 'Europe/Madrid' AS year_end
      )
      SELECT u.id AS "userId", u.username, COUNT(DISTINCT event.disc_id)::int AS count
      FROM rate_vote_events event JOIN "users" u ON u.id = event.user_id
      CROSS JOIN bounds
      WHERE event.event_type = 'set' AND event.disc_id IS NOT NULL
        AND event.new_value IS NOT NULL
        AND event.occurred_at >= bounds.year_start AND event.occurred_at < bounds.year_end
      GROUP BY u.id, u.username
      ORDER BY count DESC, u.username ASC, u.id ASC LIMIT 20`,
      [year],
    ) as Promise<UserCountRow[]>;
  }

  private async getCoverRanking(year: number): Promise<UserCountRow[]> {
    return this.rateRepository.query(
      `WITH bounds AS (
        SELECT make_date($1::int, 1, 1) AS year_start,
          make_date($1::int + 1, 1, 1) AS year_end
      )
      SELECT u.id AS "userId", u.username, COUNT(r.id)::int AS count
      FROM rate r JOIN "users" u ON u.id = r."userId"
      JOIN disc d ON d.id = r."discId" CROSS JOIN bounds
      WHERE r.cover IS NOT NULL AND d."releaseDate" >= bounds.year_start
        AND d."releaseDate" < bounds.year_end
      GROUP BY u.id, u.username
      ORDER BY count DESC, u.username ASC, u.id ASC LIMIT 20`,
      [year],
    ) as Promise<UserCountRow[]>;
  }

  private async getYearSummary(year: number): Promise<{
    ratedDiscs: number;
    participatingUsers: number;
    averageRating: number | null;
  }> {
    const cte = year < 2027 ? VOTES_CTE : EVENTS_CTE;
    const rows = (await this.rateRepository.query(
      `${cte}, per_disc AS (
        SELECT disc_id, AVG(value) AS mean_rating FROM votes
        WHERE disc_id IS NOT NULL GROUP BY disc_id
      )
      SELECT COUNT(DISTINCT votes.disc_id)::int AS "ratedDiscs",
        COUNT(DISTINCT votes.user_id)::int AS "participatingUsers",
        (SELECT AVG(mean_rating) FROM per_disc) AS "averageRating"
      FROM votes`,
      [year],
    )) as SummaryRow[];
    return {
      ratedDiscs: Number(rows[0]?.ratedDiscs ?? 0),
      participatingUsers: Number(rows[0]?.participatingUsers ?? 0),
      averageRating:
        rows[0]?.averageRating == null ? null : Number(rows[0].averageRating),
    };
  }

  private async getYearDistribution(
    year: number,
  ): Promise<CommunityDashboardRatesStatsResponse['ratingDistribution']> {
    const cte = year < 2027 ? VOTES_CTE : EVENTS_CTE;
    const rows = (await this.rateRepository.query(
      `${cte}, bins(label, lower_bound, upper_bound, lower_inclusive, upper_inclusive) AS (
        VALUES ('0-1', 0::numeric, 1::numeric, true, true),
          ('>1-3', 1, 3, false, true), ('>3-5', 3, 5, false, true),
          ('>5-7', 5, 7, false, true), ('>7-10', 7, 10, false, false),
          ('10', 10, 10, true, true)
      )
      SELECT bins.label AS bucket, COUNT(votes.value)::int AS count
      FROM bins LEFT JOIN votes ON
        (votes.value > bins.lower_bound OR (bins.lower_inclusive AND votes.value = bins.lower_bound))
        AND (votes.value < bins.upper_bound OR (bins.upper_inclusive AND votes.value = bins.upper_bound))
      GROUP BY bins.label, bins.lower_bound ORDER BY bins.lower_bound`,
      [year],
    )) as DistributionRow[];
    const labels = [
      {
        bucket: '0-1',
        label: '0–1',
        min: 0,
        max: 1,
        minInclusive: true,
        maxInclusive: true,
      },
      {
        bucket: '>1-3',
        label: '>1–3',
        min: 1,
        max: 3,
        minInclusive: false,
        maxInclusive: true,
      },
      {
        bucket: '>3-5',
        label: '>3–5',
        min: 3,
        max: 5,
        minInclusive: false,
        maxInclusive: true,
      },
      {
        bucket: '>5-7',
        label: '>5–7',
        min: 5,
        max: 7,
        minInclusive: false,
        maxInclusive: true,
      },
      {
        bucket: '>7-10',
        label: '>7–<10',
        min: 7,
        max: 10,
        minInclusive: false,
        maxInclusive: false,
      },
      {
        bucket: '10',
        label: '10',
        min: 10,
        max: 10,
        minInclusive: true,
        maxInclusive: true,
      },
    ];
    return labels.map((bin) => ({
      label: bin.label,
      min: bin.min,
      max: bin.max,
      minInclusive: bin.minInclusive,
      maxInclusive: bin.maxInclusive,
      count: Number(rows.find((row) => row.bucket === bin.bucket)?.count ?? 0),
    }));
  }

  private async getTopGenre(
    year: number,
  ): Promise<CommunityDashboardRatesStatsResponse['topGenre']> {
    const cte = year < 2027 ? VOTES_CTE : EVENTS_CTE;
    const [row] = (await this.rateRepository.query(
      `${cte}
      SELECT genre.id, genre.name, COUNT(DISTINCT votes.disc_id)::int AS "ratedDiscs"
      FROM votes JOIN genre ON genre.id = votes.genre_id
      GROUP BY genre.id, genre.name
      ORDER BY "ratedDiscs" DESC, genre.name ASC, genre.id ASC LIMIT 1`,
      [year],
    )) as GenreRow[];
    return row
      ? {
          id: String(row.id),
          name: String(row.name),
          ratedDiscs: Number(row.ratedDiscs),
        }
      : null;
  }

  private async getCurrentStreaks(): Promise<
    CommunityDashboardRatesStatsResponse['currentStreaks']
  > {
    const rows = (await this.eventRepository.query(
      `WITH activity_days AS (
        SELECT DISTINCT event.user_id, (event.occurred_at AT TIME ZONE 'Europe/Madrid')::date AS activity_day
        FROM rate_vote_events event
        WHERE event.event_type = 'set' AND event.occurred_at < ((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date + 1)::timestamp AT TIME ZONE 'Europe/Madrid'
      ), grouped_days AS (
        SELECT user_id, activity_day,
          activity_day - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_day)::int AS streak_group
        FROM activity_days
      ), streaks AS (
        SELECT user_id, COUNT(*)::int AS days, MAX(activity_day) AS latest_day
        FROM grouped_days GROUP BY user_id, streak_group
      )
      SELECT users.id AS "userId", users.username, streaks.days
      FROM streaks JOIN "users" users ON users.id = streaks.user_id
      WHERE streaks.latest_day >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date - 1
      ORDER BY streaks.days DESC, users.username ASC, users.id ASC LIMIT 5`,
    )) as StreakRow[];
    return rows.map((row) => ({
      user: { id: String(row.userId), username: String(row.username) },
      days: Number(row.days),
    }));
  }
}
