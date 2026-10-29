import { BadRequestException } from '@nestjs/common';
import { getHistoricalMadridYearBounds } from './historical-madrid-year-bounds';

export interface HistoricalRateCohortQuery {
  year: 2025 | 2026;
  eligibleRateRowsCte: string;
  parameters: [string, string, string, string, string, string, string];
}

/** Shared population filter for the historical selector and its aggregations. */
export function getHistoricalRateCohortQuery(
  userId: string,
  year: number,
): HistoricalRateCohortQuery {
  if (year !== 2025 && year !== 2026) {
    throw new BadRequestException(
      'Historical Rate cohorts support only 2025 and 2026.',
    );
  }

  const bounds = getHistoricalMadridYearBounds(year);
  return {
    year,
    eligibleRateRowsCte: `
      eligible_rate_rows AS (
        SELECT
          rate.id AS "rateId",
          rate."discId" AS "discId",
          disc."releaseDate"::text AS "releaseDate",
          CASE
            WHEN pg_typeof(rate."createdAt") = 'timestamp with time zone'::regtype
              THEN rate."createdAt" AT TIME ZONE 'Europe/Madrid'
            ELSE rate."createdAt"::timestamp without time zone
          END AS "createdAtLocal",
          rate.rate AS "currentRate",
          rate."editedAt" AS "editedAt",
          rate."createdAt" AS "createdAt"
        FROM rate
        INNER JOIN disc ON disc.id = rate."discId"
        WHERE rate."userId" = $1
          AND disc."releaseDate" >= $2::date
          AND disc."releaseDate" < $3::date
          AND CASE
            WHEN pg_typeof(rate."createdAt") = 'timestamp with time zone'::regtype
              THEN rate."createdAt" >= $6::timestamptz
                AND rate."createdAt" < $7::timestamptz
            ELSE rate."createdAt" >= $4::timestamp without time zone
              AND rate."createdAt" < $5::timestamp without time zone
          END
      )`,
    parameters: [
      userId,
      bounds.releaseDateStart,
      bounds.releaseDateEnd,
      bounds.rateCreatedAtStartLocal,
      bounds.rateCreatedAtEndLocal,
      bounds.rateCreatedAtStartInstantUtc,
      bounds.rateCreatedAtEndInstantUtc,
    ],
  };
}
