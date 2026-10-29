import { BadRequestException } from '@nestjs/common';
import { getEventSetCohortQuery } from './event-set-cohort-query';
import { getHistoricalRateCohortQuery } from './historical-rate-cohort-query';

export interface CurrentScorePopulationQuery {
  repository: 'rate' | 'event';
  ctes: string;
  parameters: unknown[];
}

/** Shared annual population and deterministic current Rate selection for EST-BE-8+. */
export function getCurrentScorePopulationQuery(
  userId: string,
  year: number,
  timeZone?: string,
): CurrentScorePopulationQuery {
  if (year === 2025 || year === 2026) {
    const query = getHistoricalRateCohortQuery(userId, year);
    return {
      repository: 'rate',
      ctes: `eligible_rate_rows AS (${query.eligibleRateRowsCte
        .replace(/^\s*eligible_rate_rows AS \(/u, '')
        .replace(/\)\s*$/u, '')}), ranked_current_rates AS (
        SELECT "discId", "currentRate",
          MAX("createdAtLocal") OVER (PARTITION BY "discId") AS "latestEligibleAt",
          ROW_NUMBER() OVER (
            PARTITION BY "discId"
            ORDER BY "editedAt" DESC NULLS LAST, "createdAt" DESC, "rateId" DESC
          ) AS current_position
        FROM eligible_rate_rows
      ), current_scores AS (
        SELECT "discId", "currentRate", "latestEligibleAt" AS "eligibleAt"
        FROM ranked_current_rates
        WHERE current_position = 1
      )`,
      parameters: query.parameters,
    };
  }

  if (year < 2027) {
    throw new BadRequestException(
      'Current score populations support years from 2025 onward.',
    );
  }

  const query = getEventSetCohortQuery(userId, year, timeZone);
  return {
    repository: 'event',
    ctes: `eligible_set_events AS (${query.eligibleSetEventsCte
      .replace(/^\s*eligible_set_events AS \(/u, '')
      .replace(/\)\s*$/u, '')}), eligible_discs AS (
      SELECT "discId", MAX("occurredAt") AS "eligibleAt"
      FROM eligible_set_events
      GROUP BY "discId"
    ), ranked_current_rates AS (
      SELECT rate."discId" AS "discId", rate.rate AS "currentRate",
        eligible_discs."eligibleAt" AS "eligibleAt",
        ROW_NUMBER() OVER (
          PARTITION BY rate."discId"
          ORDER BY rate."editedAt" DESC NULLS LAST, rate."createdAt" DESC, rate.id DESC
        ) AS current_position
      FROM eligible_discs
      INNER JOIN rate ON rate."discId" = eligible_discs."discId"
      WHERE rate."userId" = $6
    ), current_scores AS (
      SELECT "discId", "currentRate", "eligibleAt"
      FROM ranked_current_rates
      WHERE current_position = 1
    )`,
    parameters: [...query.parameters, userId],
  };
}
