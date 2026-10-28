import { HomeQueryRunner } from './home-query-runner';

export type LegacyHomeGlobalStats = {
  globalAvgRate: number;
  medianVotes: number;
};

/** Historical per-filter prior and vote-count median used by /homeDiscs. */
export async function loadLegacyHomeGlobalStats(
  discRepository: HomeQueryRunner,
  globalWhere: string,
  globalParams: unknown[],
): Promise<LegacyHomeGlobalStats> {
  const result = await discRepository.query(
    `
      SELECT
        AVG(avgRates) AS "globalAvgRate",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voteCount) AS "medianVotes"
      FROM (
        SELECT
          d.id,
          COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) AS voteCount,
          COALESCE(AVG(r.rate), 0) AS avgRates
        FROM disc d
        LEFT JOIN rate r ON d.id = r."discId"
        LEFT JOIN artist a ON d."artistId" = a.id
        LEFT JOIN country c ON a."countryId" = c.id
        ${globalWhere}
        GROUP BY d.id
      ) AS rate_stats;
    `,
    globalParams,
  );

  const row = result[0];

  return {
    globalAvgRate: Number.parseFloat(String(row?.globalAvgRate ?? '')) || 0,
    medianVotes: Number.parseInt(String(row?.medianVotes ?? ''), 10) || 1,
  };
}
