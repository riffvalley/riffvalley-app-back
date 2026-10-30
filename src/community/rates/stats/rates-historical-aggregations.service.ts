import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { getHistoricalRateCohortQuery } from './helpers/historical-rate-cohort-query';
import { RatesStatsDailyDiscDto } from '../dto/rates-user-stats.dto';

interface HistoricalActivityAggregateRow {
  aggregation: 'year' | 'month' | 'day' | 'genre' | 'withoutGenre';
  period: string | null;
  activityCount: number | string;
}

interface HistoricalDailyDiscRow {
  date: string;
  discId: string;
  title: string;
  artist: string | null;
  rate: number | string | null;
}

export interface HistoricalMonthlyActivity {
  month: string;
  activityCount: number;
}

export interface HistoricalDailyActivity {
  date: string;
  activityCount: number;
  discs: RatesStatsDailyDiscDto[];
}

export interface HistoricalGenreActivity {
  genre: string;
  activityCount: number;
}

export interface RatesHistoricalActivityAggregations {
  year: number;
  activityCount: number;
  activityByMonth: HistoricalMonthlyActivity[];
  /** Contains active dates only; a missing date means no eligible Rate row in the available source. */
  activityByDay: HistoricalDailyActivity[];
  activityByGenre: HistoricalGenreActivity[];
  activityWithoutGenre: number;
}

@Injectable()
export class RatesHistoricalAggregationsService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
  ) {}

  async aggregateActivityForUser(
    userId: string,
    year: number,
  ): Promise<RatesHistoricalActivityAggregations> {
    const query = getHistoricalRateCohortQuery(userId, year);
    const rows = await this.rateRepository.query<
      HistoricalActivityAggregateRow[]
    >(
      `
      WITH ${query.eligibleRateRowsCte}
      SELECT 'year'::text AS aggregation, NULL::text AS period,
        COUNT(DISTINCT "discId")::int AS "activityCount"
      FROM eligible_rate_rows
      UNION ALL
      SELECT 'month'::text AS aggregation,
        TO_CHAR(DATE_TRUNC('month', "createdAtLocal"), 'YYYY-MM') AS period,
        COUNT(*)::int AS "activityCount"
      FROM eligible_rate_rows
      GROUP BY DATE_TRUNC('month', "createdAtLocal")
      UNION ALL
      SELECT 'day'::text AS aggregation,
        TO_CHAR("createdAtLocal"::date, 'YYYY-MM-DD') AS period,
        COUNT(DISTINCT "discId")::int AS "activityCount"
      FROM eligible_rate_rows
      GROUP BY "createdAtLocal"::date
      UNION ALL
      SELECT 'genre'::text AS aggregation, genre.name AS period,
        COUNT(*)::int AS "activityCount"
      FROM eligible_rate_rows
      INNER JOIN disc ON disc.id = eligible_rate_rows."discId"
      INNER JOIN genre ON genre.id = disc."genreId"
      GROUP BY genre.name
      UNION ALL
      SELECT 'withoutGenre'::text AS aggregation, NULL::text AS period,
        COUNT(*)::int AS "activityCount"
      FROM eligible_rate_rows
      LEFT JOIN disc ON disc.id = eligible_rate_rows."discId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      WHERE genre.id IS NULL
      ORDER BY aggregation, period NULLS FIRST
      `,
      query.parameters,
    );
    const dailyDiscRows = await this.rateRepository.query<
      HistoricalDailyDiscRow[]
    >(
      `WITH ${query.eligibleRateRowsCte}, ranked_current_rates AS (
        SELECT "discId", "currentRate",
          ROW_NUMBER() OVER (
            PARTITION BY "discId"
            ORDER BY "editedAt" DESC NULLS LAST, "createdAt" DESC, "rateId" DESC
          ) AS current_position
        FROM eligible_rate_rows
      ), current_scores AS (
        SELECT "discId", "currentRate" FROM ranked_current_rates
        WHERE current_position = 1 AND "currentRate" BETWEEN 0 AND 10
      )
      SELECT DISTINCT ON (
          eligible_rate_rows."createdAtLocal"::date,
          eligible_rate_rows."discId"
        )
        TO_CHAR(eligible_rate_rows."createdAtLocal"::date, 'YYYY-MM-DD') AS date,
        eligible_rate_rows."discId" AS "discId", disc.name AS title,
        artist.name AS artist, current_scores."currentRate" AS rate
      FROM eligible_rate_rows
      INNER JOIN disc ON disc.id = eligible_rate_rows."discId"
      LEFT JOIN artist ON artist.id = disc."artistId"
      LEFT JOIN current_scores ON current_scores."discId" = eligible_rate_rows."discId"
      ORDER BY eligible_rate_rows."createdAtLocal"::date,
        eligible_rate_rows."discId", eligible_rate_rows."createdAtLocal" DESC,
        eligible_rate_rows."rateId" DESC`,
      query.parameters,
    );
    const annualRow = rows.find((row) => row.aggregation === 'year');
    if (!annualRow) {
      throw new Error(
        'Historical activity aggregate did not return a year row.',
      );
    }

    const activityCount = toNonNegativeInteger(annualRow.activityCount);
    const monthCounts = new Map<string, number>();
    const dayCounts = new Map<string, number>();
    const activityByGenre: HistoricalGenreActivity[] = [];
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
    const discsByDay = new Map<string, RatesStatsDailyDiscDto[]>();
    for (const row of dailyDiscRows) {
      const discs = discsByDay.get(row.date) ?? [];
      discs.push({
        discId: row.discId,
        title: row.title,
        artist: row.artist,
        rate: row.rate === null ? null : toNullableScore(row.rate),
        date: row.date,
      });
      discsByDay.set(row.date, discs);
    }
    const activityByDay = [...dayCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => {
        const discs = discsByDay.get(date) ?? [];
        if (discs.length !== count) {
          throw new Error(
            'Historical daily disc details do not match activity counts.',
          );
        }
        return { date, activityCount: count, discs };
      });
    const attributedActivityCount =
      sum(activityByGenre.map((row) => row.activityCount)) +
      activityWithoutGenre;
    const monthlyActivityCount = sum(
      activityByMonth.map((row) => row.activityCount),
    );

    if (
      activityCount > monthlyActivityCount ||
      attributedActivityCount !== monthlyActivityCount
    ) {
      throw new Error(
        'Historical activity aggregate totals are inconsistent across periods.',
      );
    }
    if (
      dailyDiscRows.length !==
      sum(activityByDay.map((row) => row.activityCount))
    ) {
      throw new Error(
        'Historical daily disc details do not match daily activity counts.',
      );
    }

    return {
      year: query.year,
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
    throw new Error(
      'Historical activity count must be a non-negative integer.',
    );
  }
  return count;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toNullableScore(value: number | string): number {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error('Historical current score must be a valid Rate score.');
  }
  return score;
}
