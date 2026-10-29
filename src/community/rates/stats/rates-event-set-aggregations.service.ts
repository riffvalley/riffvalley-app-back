import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';
import { getEventSetCohortQuery } from './helpers/event-set-cohort-query';
import { RatesStatsDailyAssignmentDto } from '../dto/rates-user-stats.dto';

interface EventSetActivityAggregateRow {
  aggregation: 'year' | 'month' | 'day' | 'genre' | 'withoutGenre';
  period: string | null;
  activityCount: number | string;
}

interface EventSetDailyAssignmentRow {
  date: string;
  discId: string;
  title: string;
  artist: string | null;
  rate: number | string | null;
}

export interface EventSetMonthlyActivity {
  month: string;
  activityCount: number;
}

export interface EventSetDailyActivity {
  date: string;
  activityCount: number;
  assignments: RatesStatsDailyAssignmentDto[];
}

export interface EventSetGenreActivity {
  genre: string;
  activityCount: number;
}

export interface RatesEventSetActivityAggregations {
  year: number;
  timeZone: string;
  activityCount: number;
  activityByMonth: EventSetMonthlyActivity[];
  /** Contains active local dates only; missing dates have no observed eligible event. */
  activityByDay: EventSetDailyActivity[];
  activityByGenre: EventSetGenreActivity[];
  activityWithoutGenre: number;
}

@Injectable()
export class RatesEventSetAggregationsService {
  constructor(
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Repository<RateVoteEvent>,
  ) {}

  async aggregateActivityForUser(
    userId: string,
    year: number,
    timeZone?: string,
  ): Promise<RatesEventSetActivityAggregations> {
    const query = getEventSetCohortQuery(userId, year, timeZone);
    const rows = await this.eventRepository.query<
      EventSetActivityAggregateRow[]
    >(
      `WITH ${query.eligibleSetEventsCte},
      eligible_set_events_local AS (
        SELECT "eventId", "discId",
          ("occurredAt" AT TIME ZONE $6)::date AS "localDate"
        FROM eligible_set_events
      )
      SELECT 'year'::text AS aggregation, NULL::text AS period,
        COUNT("eventId") AS "activityCount"
      FROM eligible_set_events_local
      UNION ALL
      SELECT 'month'::text AS aggregation,
        TO_CHAR(DATE_TRUNC('month', "localDate"), 'YYYY-MM') AS period,
        COUNT("eventId") AS "activityCount"
      FROM eligible_set_events_local
      GROUP BY DATE_TRUNC('month', "localDate")
      UNION ALL
      SELECT 'day'::text AS aggregation,
        TO_CHAR("localDate", 'YYYY-MM-DD') AS period,
        COUNT("eventId") AS "activityCount"
      FROM eligible_set_events_local
      GROUP BY "localDate"
      UNION ALL
      SELECT 'genre'::text AS aggregation, genre.name AS period,
        COUNT(eligible_set_events_local."eventId") AS "activityCount"
      FROM eligible_set_events_local
      INNER JOIN disc ON disc.id = eligible_set_events_local."discId"
      INNER JOIN genre ON genre.id = disc."genreId"
      GROUP BY genre.name
      UNION ALL
      SELECT 'withoutGenre'::text AS aggregation, NULL::text AS period,
        COUNT(eligible_set_events_local."eventId") AS "activityCount"
      FROM eligible_set_events_local
      LEFT JOIN disc ON disc.id = eligible_set_events_local."discId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      WHERE genre.id IS NULL
      ORDER BY aggregation, period NULLS FIRST`,
      [...query.parameters, query.timeZone],
    );
    const assignmentRows = await this.eventRepository.query<
      EventSetDailyAssignmentRow[]
    >(
      `WITH ${query.eligibleSetEventsCte}, eligible_discs AS (
        SELECT "discId", MAX("occurredAt") AS "eligibleAt"
        FROM eligible_set_events GROUP BY "discId"
      ), ranked_current_rates AS (
        SELECT rate."discId", rate.rate AS "currentRate",
          ROW_NUMBER() OVER (
            PARTITION BY rate."discId"
            ORDER BY rate."editedAt" DESC NULLS LAST, rate."createdAt" DESC, rate.id DESC
          ) AS current_position
        FROM eligible_discs
        INNER JOIN rate ON rate."discId" = eligible_discs."discId"
        WHERE rate."userId" = $7
      ), current_scores AS (
        SELECT "discId", "currentRate" FROM ranked_current_rates
        WHERE current_position = 1 AND "currentRate" BETWEEN 0 AND 10
      )
      SELECT TO_CHAR(event."occurredAt" AT TIME ZONE $6, 'YYYY-MM-DD') AS date,
        event."discId" AS "discId", disc.name AS title,
        artist.name AS artist, current_scores."currentRate" AS rate
      FROM eligible_set_events event
      INNER JOIN disc ON disc.id = event."discId"
      LEFT JOIN artist ON artist.id = disc."artistId"
      LEFT JOIN current_scores ON current_scores."discId" = event."discId"
      ORDER BY event."occurredAt", event."eventId"`,
      [...query.parameters, query.timeZone, userId],
    );

    const annualRow = rows.find((row) => row.aggregation === 'year');
    if (!annualRow) {
      throw new Error(
        'Event set activity aggregate did not return a year row.',
      );
    }

    const activityCount = toNonNegativeInteger(annualRow.activityCount);
    const monthCounts = new Map<string, number>();
    const dayCounts = new Map<string, number>();
    const activityByGenre: EventSetGenreActivity[] = [];
    let activityWithoutGenre = 0;
    for (const row of rows) {
      if (row.aggregation === 'month' && row.period !== null) {
        monthCounts.set(row.period, toNonNegativeInteger(row.activityCount));
      } else if (row.aggregation === 'day' && row.period !== null) {
        dayCounts.set(row.period, toNonNegativeInteger(row.activityCount));
      } else if (row.aggregation === 'genre' && row.period !== null) {
        activityByGenre.push({
          genre: row.period,
          activityCount: toNonNegativeInteger(row.activityCount),
        });
      } else if (row.aggregation === 'withoutGenre') {
        activityWithoutGenre = toNonNegativeInteger(row.activityCount);
      }
    }

    const activityByMonth = Array.from({ length: 12 }, (_, monthIndex) => {
      const month = `${query.year}-${String(monthIndex + 1).padStart(2, '0')}`;
      return { month, activityCount: monthCounts.get(month) ?? 0 };
    });
    const assignmentsByDay = new Map<string, RatesStatsDailyAssignmentDto[]>();
    for (const row of assignmentRows) {
      const assignments = assignmentsByDay.get(row.date) ?? [];
      assignments.push({
        discId: row.discId,
        title: row.title,
        artist: row.artist,
        rate: row.rate === null ? null : toNullableScore(row.rate),
        date: row.date,
      });
      assignmentsByDay.set(row.date, assignments);
    }
    const activityByDay = [...dayCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => {
        const assignments = assignmentsByDay.get(date) ?? [];
        if (assignments.length !== count) {
          throw new Error('Event set daily assignment details do not match activity counts.');
        }
        return { date, activityCount: count, assignments };
      });
    const attributedActivityCount =
      sum(activityByGenre.map((row) => row.activityCount)) +
      activityWithoutGenre;

    if (
      sum(activityByMonth.map((row) => row.activityCount)) !== activityCount ||
      sum(activityByDay.map((row) => row.activityCount)) !== activityCount ||
      attributedActivityCount < activityCount
    ) {
      throw new Error(
        'Event set activity aggregate totals are inconsistent across periods.',
      );
    }
    if (assignmentRows.length !== activityCount) {
      throw new Error(
        'Event set daily assignment details do not match annual activity count.',
      );
    }

    return {
      year: query.year,
      timeZone: query.timeZone,
      activityCount,
      activityByMonth,
      activityByDay,
      activityByGenre: activityByGenre.sort((left, right) =>
        left.genre.localeCompare(right.genre),
      ),
      activityWithoutGenre,
    };
  }
}

function toNonNegativeInteger(value: number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Event set activity count must be a non-negative integer.');
  }
  return count;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toNullableScore(value: number | string): number {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error('Event set current score must be a valid Rate score.');
  }
  return score;
}
