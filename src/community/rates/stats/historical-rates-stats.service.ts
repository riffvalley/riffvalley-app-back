import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';

export interface HistoricalPeriodStats {
  ratedDiscs: number;
  ratedDiscIds: string[];
}

export interface HistoricalRatesStats {
  timezone: 'Europe/Madrid';
  totalRatedDiscs: number;
  month: HistoricalPeriodStats & { activeDays: number };
  year: HistoricalPeriodStats;
  history: {
    ratedDiscs: null;
    ratedDiscIds: null;
    coverage: 'partial_missing_disc_ids' | 'before_capture';
  };
  currentStreak: number | null;
  discoveries: {
    value: null;
    coverage: 'unknown';
    reason: 'incomplete_lifetime_ledger';
  };
}

@Injectable()
export class HistoricalRatesStatsService {
  constructor(
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Repository<RateVoteEvent>,
  ) {}

  async getUserHistoricalStats(userId: string): Promise<HistoricalRatesStats> {
    type AggregateRow = {
      totalRatedDiscs: number | string;
      monthRatedDiscIds: string[] | null;
      yearRatedDiscIds: string[] | null;
      monthRatedDiscCount: number | string;
      yearRatedDiscCount: number | string;
      historyMissingDiscEvents: number | string;
      monthActiveDays: number | string;
      streakDays: number | string;
    };

    const [row] = (await this.eventRepository.query(
      `
      WITH context AS (
        SELECT
          $1::uuid AS user_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS today,
          date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS month_start,
          date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS year_start
      ), valid_sets AS (
        SELECT event.disc_id, event.occurred_at,
          (event.occurred_at AT TIME ZONE 'Europe/Madrid')::date AS activity_day
        FROM rate_vote_events event
        CROSS JOIN context
        WHERE event.user_id = context.user_id
          AND event.event_type = 'set'
      ), month_sets AS (
        SELECT valid_sets.* FROM valid_sets CROSS JOIN context
        WHERE valid_sets.occurred_at >= (context.month_start::timestamp AT TIME ZONE 'Europe/Madrid')
          AND valid_sets.occurred_at < ((context.month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Europe/Madrid')
      ), year_sets AS (
        SELECT valid_sets.* FROM valid_sets CROSS JOIN context
        WHERE valid_sets.occurred_at >= (context.year_start::timestamp AT TIME ZONE 'Europe/Madrid')
          AND valid_sets.occurred_at < ((context.year_start + INTERVAL '1 year')::timestamp AT TIME ZONE 'Europe/Madrid')
      ), month_disc_ids AS (
        SELECT DISTINCT disc_id FROM month_sets WHERE disc_id IS NOT NULL
      ), year_disc_ids AS (
        SELECT DISTINCT disc_id FROM year_sets WHERE disc_id IS NOT NULL
      ), activity_days AS (
        SELECT DISTINCT activity_day FROM valid_sets CROSS JOIN context
        WHERE activity_day <= context.today
      ), ordered_days AS (
        SELECT activity_day,
          ROW_NUMBER() OVER (ORDER BY activity_day DESC) AS day_position,
          MAX(activity_day) OVER () AS latest_day
        FROM activity_days
      ), streak AS (
        SELECT
          COUNT(*) FILTER (
            WHERE activity_day = latest_day - (day_position - 1)::int
          )::int AS days,
          MAX(latest_day) AS latest_day
        FROM ordered_days
      )
      SELECT
        (SELECT COUNT(DISTINCT rate."discId")::int
          FROM rate
          WHERE rate."userId" = context.user_id
            AND rate.rate IS NOT NULL) AS "totalRatedDiscs",
        ARRAY(SELECT disc_id FROM month_disc_ids) AS "monthRatedDiscIds",
        ARRAY(SELECT disc_id FROM year_disc_ids) AS "yearRatedDiscIds",
        (SELECT COUNT(*) FROM month_disc_ids)::int AS "monthRatedDiscCount",
        (SELECT COUNT(*) FROM year_disc_ids)::int AS "yearRatedDiscCount",
        (SELECT COUNT(*) FROM valid_sets WHERE disc_id IS NULL)::int AS "historyMissingDiscEvents",
        (SELECT COUNT(*) FROM activity_days
          WHERE activity_day >= context.month_start AND activity_day <= context.today)::int AS "monthActiveDays",
        CASE WHEN streak.latest_day < context.today - 1 THEN 0
          ELSE COALESCE(streak.days, 0)::int END AS "streakDays"
      FROM context CROSS JOIN streak
      `,
      [userId],
    )) as AggregateRow[];

    if (!row) {
      throw new Error('Historical rates aggregate query returned no row');
    }

    return {
      timezone: 'Europe/Madrid',
      totalRatedDiscs: Number(row.totalRatedDiscs),
      month: {
        ratedDiscs: Number(row.monthRatedDiscCount),
        ratedDiscIds: row.monthRatedDiscIds ?? [],
        activeDays: Number(row.monthActiveDays),
      },
      year: {
        ratedDiscs: Number(row.yearRatedDiscCount),
        ratedDiscIds: row.yearRatedDiscIds ?? [],
      },
      history: {
        ratedDiscs: null,
        ratedDiscIds: null,
        coverage:
          Number(row.historyMissingDiscEvents) > 0
            ? 'partial_missing_disc_ids'
            : 'before_capture',
      },
      currentStreak: Number(row.streakDays),
      discoveries: {
        value: null,
        coverage: 'unknown',
        reason: 'incomplete_lifetime_ledger',
      },
    };
  }
}
