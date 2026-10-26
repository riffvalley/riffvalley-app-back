import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';

export type HistoricalPeriodCoverage =
  | 'complete'
  | 'partial_missing_disc_ids'
  | 'before_capture'
  | 'unknown';

export interface HistoricalPeriodStats {
  ratedDiscs: number | null;
  ratedDiscIds: string[] | null;
  coverage: HistoricalPeriodCoverage;
}

export interface HistoricalRatesStats {
  timezone: 'Europe/Madrid';
  totalRatedDiscs: number;
  month: HistoricalPeriodStats & { activeDays: number | null };
  year: HistoricalPeriodStats;
  history: HistoricalPeriodStats;
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
      captureStartedAt: Date | string | null;
      totalRatedDiscs: number | string;
      monthRatedDiscIds: string[] | null;
      yearRatedDiscIds: string[] | null;
      monthRatedDiscCount: number | string;
      yearRatedDiscCount: number | string;
      monthMissingDiscEvents: number | string;
      yearMissingDiscEvents: number | string;
      historyMissingDiscEvents: number | string;
      monthActiveDays: number | string;
      streakDays: number | string;
      streakMayExtendBeforeCapture: boolean;
      monthActiveDaysCovered: boolean;
      streakCovered: boolean;
      monthCovered: boolean;
      yearCovered: boolean;
    };

    const [row] = (await this.eventRepository.query(
      `
      WITH context AS (
        SELECT
          $1::uuid AS user_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS today,
          date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS month_start,
          date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS year_start,
          capture.started_at,
          (capture.started_at AT TIME ZONE 'Europe/Madrid')::date AS capture_day
        FROM (SELECT 1) AS singleton
        LEFT JOIN rate_vote_event_capture capture ON capture.id = 1
      ), valid_sets AS (
        SELECT event.disc_id, event.occurred_at,
          (event.occurred_at AT TIME ZONE 'Europe/Madrid')::date AS activity_day
        FROM rate_vote_events event
        CROSS JOIN context
        WHERE event.user_id = context.user_id
          AND event.event_type = 'set'
          AND event.occurred_at >= context.started_at
      ), month_sets AS (
        SELECT valid_sets.* FROM valid_sets CROSS JOIN context
        WHERE valid_sets.occurred_at >= (context.month_start::timestamp AT TIME ZONE 'Europe/Madrid')
          AND valid_sets.occurred_at < ((context.month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Europe/Madrid')
      ), year_sets AS (
        SELECT valid_sets.* FROM valid_sets CROSS JOIN context
        WHERE valid_sets.occurred_at >= (context.year_start::timestamp AT TIME ZONE 'Europe/Madrid')
          AND valid_sets.occurred_at < ((context.year_start + INTERVAL '1 year')::timestamp AT TIME ZONE 'Europe/Madrid')
      ), full_activity_days AS (
        SELECT DISTINCT activity_day FROM valid_sets CROSS JOIN context
        WHERE activity_day > context.capture_day AND activity_day <= context.today
      ), ordered_days AS (
        SELECT activity_day,
          ROW_NUMBER() OVER (ORDER BY activity_day DESC) AS day_position,
          MAX(activity_day) OVER () AS latest_day
        FROM full_activity_days
      ), streak AS (
        SELECT
          COUNT(*) FILTER (
            WHERE activity_day = latest_day - (day_position - 1)::int
          )::int AS days,
          MAX(latest_day) AS latest_day
        FROM ordered_days
      )
      SELECT
        context.started_at AS "captureStartedAt",
        (SELECT COUNT(DISTINCT rate."discId")::int
          FROM rate
          WHERE rate."userId" = context.user_id
            AND rate.rate IS NOT NULL) AS "totalRatedDiscs",
        ARRAY(SELECT DISTINCT disc_id FROM month_sets WHERE disc_id IS NOT NULL) AS "monthRatedDiscIds",
        ARRAY(SELECT DISTINCT disc_id FROM year_sets WHERE disc_id IS NOT NULL) AS "yearRatedDiscIds",
        (SELECT COUNT(DISTINCT disc_id) FROM month_sets)::int AS "monthRatedDiscCount",
        (SELECT COUNT(DISTINCT disc_id) FROM year_sets)::int AS "yearRatedDiscCount",
        (SELECT COUNT(*) FROM month_sets WHERE disc_id IS NULL)::int AS "monthMissingDiscEvents",
        (SELECT COUNT(*) FROM year_sets WHERE disc_id IS NULL)::int AS "yearMissingDiscEvents",
        (SELECT COUNT(*) FROM valid_sets WHERE disc_id IS NULL)::int AS "historyMissingDiscEvents",
        (SELECT COUNT(*) FROM full_activity_days
          WHERE activity_day >= context.month_start AND activity_day <= context.today)::int AS "monthActiveDays",
        CASE WHEN streak.latest_day < context.today - 1 THEN 0
          ELSE COALESCE(streak.days, 0)::int END AS "streakDays",
        COALESCE(
          streak.latest_day >= context.today - 1
            AND streak.latest_day - (streak.days - 1)::int = context.capture_day + 1,
          FALSE
        ) AS "streakMayExtendBeforeCapture",
        context.started_at < (context.month_start::timestamp AT TIME ZONE 'Europe/Madrid') AS "monthActiveDaysCovered",
        context.capture_day < context.today - 1 AS "streakCovered",
        context.started_at <= (context.month_start::timestamp AT TIME ZONE 'Europe/Madrid') AS "monthCovered",
        context.started_at <= (context.year_start::timestamp AT TIME ZONE 'Europe/Madrid') AS "yearCovered"
      FROM context CROSS JOIN streak
      `,
      [userId],
    )) as AggregateRow[];

    if (!row) {
      throw new Error('Historical rates aggregate query returned no row');
    }

    const totalRatedDiscs = Number(row.totalRatedDiscs);
    if (row.captureStartedAt === null) {
      return this.unknownResult(totalRatedDiscs);
    }

    const monthIds = row.monthRatedDiscIds ?? [];
    const yearIds = row.yearRatedDiscIds ?? [];
    const monthCoverage = this.periodCoverage(
      row.monthCovered,
      Number(row.monthMissingDiscEvents) > 0,
    );
    const yearCoverage = this.periodCoverage(
      row.yearCovered,
      Number(row.yearMissingDiscEvents) > 0,
    );
    return {
      timezone: 'Europe/Madrid',
      totalRatedDiscs,
      month: {
        ratedDiscs:
          monthCoverage === 'complete' ? Number(row.monthRatedDiscCount) : null,
        ratedDiscIds: monthCoverage === 'complete' ? monthIds : null,
        coverage: monthCoverage,
        activeDays: row.monthActiveDaysCovered
          ? Number(row.monthActiveDays)
          : null,
      },
      year: {
        ratedDiscs:
          yearCoverage === 'complete' ? Number(row.yearRatedDiscCount) : null,
        ratedDiscIds: yearCoverage === 'complete' ? yearIds : null,
        coverage: yearCoverage,
      },
      history: {
        ratedDiscs: null,
        ratedDiscIds: null,
        coverage:
          Number(row.historyMissingDiscEvents) > 0
            ? 'partial_missing_disc_ids'
            : 'before_capture',
      },
      currentStreak: row.streakCovered
        ? row.streakMayExtendBeforeCapture
          ? null
          : Number(row.streakDays)
        : null,
      discoveries: {
        value: null,
        coverage: 'unknown',
        reason: 'incomplete_lifetime_ledger',
      },
    };
  }

  private periodCoverage(
    coveredByCapture: boolean,
    hasMissingDiscIds: boolean,
  ): HistoricalPeriodCoverage {
    if (!coveredByCapture) return 'before_capture';
    if (hasMissingDiscIds) return 'partial_missing_disc_ids';
    return 'complete';
  }

  private unknownResult(totalRatedDiscs = 0): HistoricalRatesStats {
    return {
      timezone: 'Europe/Madrid',
      totalRatedDiscs,
      month: {
        ratedDiscs: null,
        ratedDiscIds: null,
        activeDays: null,
        coverage: 'unknown',
      },
      year: {
        ratedDiscs: null,
        ratedDiscIds: null,
        coverage: 'unknown',
      },
      history: {
        ratedDiscs: null,
        ratedDiscIds: null,
        coverage: 'unknown',
      },
      currentStreak: null,
      discoveries: {
        value: null,
        coverage: 'unknown',
        reason: 'incomplete_lifetime_ledger',
      },
    };
  }
}
