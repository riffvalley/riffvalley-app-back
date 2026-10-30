import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { getCurrentScorePopulationQuery } from './helpers/current-score-population-query';
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
  /** Contains active dates only; missing dates have no eligible activity in the available source. */
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
    if (year !== 2025 && year !== 2026) {
      throw new BadRequestException(
        'Historical Rate cohorts support only 2025 and 2026.',
      );
    }
    const query = getCurrentScorePopulationQuery(userId, year);
    const rows = await this.rateRepository.query<
      HistoricalActivityAggregateRow[]
    >(
      `
      WITH ${query.ctes}, scored_discs AS (
        SELECT "discId" FROM current_scores
        WHERE "currentRate" IS NOT NULL AND "currentRate" BETWEEN 0 AND 10
      ), eligible_scored_rows AS (
        SELECT eligible_rate_rows."discId", eligible_rate_rows."createdAtLocal"
        FROM eligible_rate_rows
        INNER JOIN scored_discs
          ON scored_discs."discId" = eligible_rate_rows."discId"
      )
      SELECT 'year'::text AS aggregation, NULL::text AS period,
        COUNT(*)::int AS "activityCount"
      FROM scored_discs
      UNION ALL
      SELECT 'month'::text AS aggregation,
        TO_CHAR(DATE_TRUNC('month', "createdAtLocal"), 'YYYY-MM') AS period,
        COUNT(DISTINCT "discId")::int AS "activityCount"
      FROM eligible_scored_rows
      GROUP BY DATE_TRUNC('month', "createdAtLocal")
      UNION ALL
      SELECT 'day'::text AS aggregation,
        TO_CHAR("createdAtLocal"::date, 'YYYY-MM-DD') AS period,
        COUNT(DISTINCT "discId")::int AS "activityCount"
      FROM eligible_scored_rows
      GROUP BY "createdAtLocal"::date
      UNION ALL
      SELECT 'genre'::text AS aggregation, genre.name AS period,
        COUNT(*)::int AS "activityCount"
      FROM scored_discs
      INNER JOIN disc ON disc.id = scored_discs."discId"
      INNER JOIN genre ON genre.id = disc."genreId"
      GROUP BY genre.name
      UNION ALL
      SELECT 'withoutGenre'::text AS aggregation, NULL::text AS period,
        COUNT(*)::int AS "activityCount"
      FROM scored_discs
      INNER JOIN disc ON disc.id = scored_discs."discId"
      LEFT JOIN genre ON genre.id = disc."genreId"
      WHERE genre.id IS NULL
      ORDER BY aggregation, period NULLS FIRST
      `,
      query.parameters,
    );
    const dailyDiscRows = await this.rateRepository.query<
      HistoricalDailyDiscRow[]
    >(
      `WITH ${query.ctes}, scored_discs AS (
        SELECT "discId", "currentRate" FROM current_scores
        WHERE "currentRate" IS NOT NULL AND "currentRate" BETWEEN 0 AND 10
      ), eligible_scored_rows AS (
        SELECT eligible_rate_rows."createdAtLocal", eligible_rate_rows."rateId",
          scored_discs."discId", scored_discs."currentRate"
        FROM eligible_rate_rows
        INNER JOIN scored_discs
          ON scored_discs."discId" = eligible_rate_rows."discId"
      )
      SELECT DISTINCT ON (
          eligible_scored_rows."createdAtLocal"::date,
          eligible_scored_rows."discId"
        )
        TO_CHAR(eligible_scored_rows."createdAtLocal"::date, 'YYYY-MM-DD') AS date,
        eligible_scored_rows."discId" AS "discId", disc.name AS title,
        artist.name AS artist, eligible_scored_rows."currentRate" AS rate
      FROM eligible_scored_rows
      INNER JOIN disc ON disc.id = eligible_scored_rows."discId"
      LEFT JOIN artist ON artist.id = disc."artistId"
      ORDER BY eligible_scored_rows."createdAtLocal"::date,
        eligible_scored_rows."discId",
        eligible_scored_rows."createdAtLocal" DESC,
        eligible_scored_rows."rateId" DESC`,
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
      const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
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
      attributedActivityCount !== activityCount
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
      year,
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
