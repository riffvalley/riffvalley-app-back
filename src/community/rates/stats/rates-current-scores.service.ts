import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { RateVoteEvent } from '../entities/rate-vote-event.entity';
import { getCurrentScorePopulationQuery } from './helpers/current-score-population-query';

export interface RatesCurrentScoreDistributionBucket {
  /** Integer n represents [n, n + 1); 10 represents exactly 10. */
  score: number;
  scoredDiscCount: number;
}

export interface RatesCurrentScoreStatistics {
  year: number;
  scoredDiscs: number;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  scoreDistribution: RatesCurrentScoreDistributionBucket[];
}

interface CurrentScoreAggregateRow {
  aggregation: 'summary' | 'bucket';
  score: number | string | null;
  scoredDiscCount: number | string;
  mean: string | number | null;
  median: string | number | null;
  standardDeviation: string | number | null;
}

@Injectable()
export class RatesCurrentScoresService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    @InjectRepository(RateVoteEvent)
    private readonly eventRepository: Repository<RateVoteEvent>,
  ) {}

  async aggregateForUser(
    userId: string,
    year: number,
    timeZone?: string,
  ): Promise<RatesCurrentScoreStatistics> {
    const population = getCurrentScorePopulationQuery(userId, year, timeZone);
    const repository =
      population.repository === 'rate'
        ? this.rateRepository
        : this.eventRepository;
    const rows = await repository.query<CurrentScoreAggregateRow[]>(
      `WITH ${population.ctes},
      ranked_scores AS (
        SELECT "discId", "currentRate" AS score,
          ROW_NUMBER() OVER (ORDER BY "currentRate", "discId") AS score_position,
          COUNT(*) OVER () AS score_count
        FROM current_scores
        WHERE "currentRate" IS NOT NULL
          AND "currentRate" >= 0 AND "currentRate" <= 10
      ),
      summary AS (
        SELECT COUNT(*) AS "scoredDiscCount",
          AVG(score) AS mean,
          STDDEV_POP(score) AS "standardDeviation",
          AVG(score) FILTER (
            WHERE score_position IN (FLOOR((score_count + 1) / 2.0), FLOOR((score_count + 2) / 2.0))
          ) AS median
        FROM ranked_scores
      ),
      bucket_counts AS (
        SELECT FLOOR(score)::integer AS score, COUNT(*) AS "scoredDiscCount"
        FROM ranked_scores
        GROUP BY FLOOR(score)::integer
      )
      SELECT 'summary'::text AS aggregation, NULL::integer AS score,
        "scoredDiscCount", mean, median, "standardDeviation"
      FROM summary
      UNION ALL
      SELECT 'bucket'::text AS aggregation, buckets.score,
        COALESCE(bucket_counts."scoredDiscCount", 0) AS "scoredDiscCount",
        NULL::numeric AS mean, NULL::numeric AS median,
        NULL::numeric AS "standardDeviation"
      FROM generate_series(0, 10) AS buckets(score)
      LEFT JOIN bucket_counts ON bucket_counts.score = buckets.score
      ORDER BY aggregation, score NULLS FIRST`,
      population.parameters,
    );

    return toStatistics(year, rows);
  }
}

function toStatistics(
  year: number,
  rows: CurrentScoreAggregateRow[],
): RatesCurrentScoreStatistics {
  const summary = rows.find((row) => row.aggregation === 'summary');
  if (!summary) {
    throw new Error('Current score aggregation did not return a summary row.');
  }

  const scoreDistribution = rows
    .filter((row) => row.aggregation === 'bucket')
    .map(
      (row): RatesCurrentScoreDistributionBucket => ({
        score: toSafeInteger(row.score, 'bucket score'),
        scoredDiscCount: toSafeInteger(row.scoredDiscCount, 'bucket count'),
      }),
    );
  const scoredDiscs = toSafeInteger(
    summary.scoredDiscCount,
    'scored disc count',
  );
  if (
    scoreDistribution.length !== 11 ||
    scoreDistribution.some((bucket, index) => bucket.score !== index) ||
    scoreDistribution.reduce(
      (total, bucket) => total + bucket.scoredDiscCount,
      0,
    ) !== scoredDiscs
  ) {
    throw new Error(
      'Current score buckets do not match the scored disc count.',
    );
  }

  return {
    year,
    scoredDiscs,
    mean: toNullableFiniteNumber(summary.mean),
    median: toNullableFiniteNumber(summary.median),
    standardDeviation: toNullableFiniteNumber(summary.standardDeviation),
    scoreDistribution,
  };
}

function toNullableFiniteNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Current score aggregate must be finite.');
  }
  return number;
}

function toSafeInteger(value: string | number | null, label: string): number {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    throw new Error(`Current score ${label} must be a non-negative integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Current score ${label} must be a non-negative integer.`);
  }
  return number;
}
