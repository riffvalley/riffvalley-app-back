import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rate } from '../entities/rate.entity';
import { getHistoricalRateCohortQuery } from './helpers/historical-rate-cohort-query';

export interface HistoricalRateAssignment {
  rateId: string;
  discId: string;
  releaseDate: string;
  /** Stored calendar value interpreted as Europe/Madrid local time. */
  createdAtLocal: string;
  currentRate: number | null;
}

export interface CurrentScoredDisc {
  rateId: string;
  discId: string;
  releaseDate: string;
  currentRate: number;
}

export interface RatesHistoricalCohort {
  year: 2025 | 2026;
  /** One entry per eligible Rate row; duplicate user/disc rows remain visible. */
  historicalAssignments: HistoricalRateAssignment[];
  /** At most one current valid score per eligible disc. */
  currentScoredDiscs: CurrentScoredDisc[];
}

interface HistoricalRateRow {
  rateId: string;
  discId: string;
  releaseDate: string;
  createdAtLocal: string;
  currentRate: string | number | null;
  currentScorePosition: number | string;
}

@Injectable()
export class RatesHistoricalCohortService {
  constructor(
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
  ) {}

  async selectForUser(
    userId: string,
    year: number,
  ): Promise<RatesHistoricalCohort> {
    const query = getHistoricalRateCohortQuery(userId, year);
    const rows = await this.rateRepository.query<HistoricalRateRow[]>(
      `
      WITH ${query.eligibleRateRowsCte}, ranked_rate_rows AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "discId"
          ORDER BY "editedAt" DESC NULLS LAST, "createdAt" DESC, "rateId" DESC
        ) AS "currentScorePosition"
        FROM eligible_rate_rows
      )
      SELECT
        "rateId",
        "discId",
        "releaseDate",
        TO_CHAR("createdAtLocal", 'YYYY-MM-DD HH24:MI:SS.US') AS "createdAtLocal",
        "currentRate",
        "currentScorePosition"
      FROM ranked_rate_rows
      ORDER BY "createdAtLocal" ASC, "discId" ASC, "rateId" ASC
      `,
      query.parameters,
    );

    const historicalAssignments = rows.map(
      (row): HistoricalRateAssignment => ({
        rateId: row.rateId,
        discId: row.discId,
        releaseDate: row.releaseDate,
        createdAtLocal: row.createdAtLocal,
        currentRate: row.currentRate === null ? null : Number(row.currentRate),
      }),
    );
    const currentScoredDiscs = rows.flatMap((row) => {
      const currentRate =
        row.currentRate === null ? null : Number(row.currentRate);
      if (
        Number(row.currentScorePosition) !== 1 ||
        currentRate === null ||
        !Number.isFinite(currentRate) ||
        currentRate < 0 ||
        currentRate > 10
      ) {
        return [];
      }
      return [
        {
          rateId: row.rateId,
          discId: row.discId,
          releaseDate: row.releaseDate,
          currentRate,
        },
      ];
    });

    return {
      year: query.year,
      historicalAssignments,
      currentScoredDiscs,
    };
  }
}
