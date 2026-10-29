import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { getHistoricalRateCohortQuery } from './helpers/historical-rate-cohort-query';

interface HistoricalActivityAggregateRow {
  aggregation: 'year' | 'month' | 'day' | 'genre' | 'withoutGenre';
  period: string | null;
  activityCount: number | string;
}

export interface HistoricalMonthlyActivity {
  month: string;
  activityCount: number;
}

export interface HistoricalDailyActivity {
  date: string;
  activityCount: number;
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
        COUNT(*)::int AS "activityCount"
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
        COUNT(*)::int AS "activityCount"
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
    const activityByDay = [...dayCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({ date, activityCount: count }));
    const attributedActivityCount =
      sum(activityByGenre.map((row) => row.activityCount)) +
      activityWithoutGenre;

    if (
      sum(activityByMonth.map((row) => row.activityCount)) !== activityCount ||
      sum(activityByDay.map((row) => row.activityCount)) !== activityCount ||
      attributedActivityCount < activityCount
    ) {
      throw new Error(
        'Historical activity aggregate totals are inconsistent across periods.',
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
