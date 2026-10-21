import { HomeQueryRunner } from './home-query-runner';

type HomeGlobalStats = {
  globalAvgRate: number;
  medianVotes: number;
};

export async function loadHomeGlobalStats(
  discRepository: HomeQueryRunner,
  globalWhere: string,
  globalParams: unknown[],
): Promise<HomeGlobalStats> {
  const globalStatsQuery = `
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
  `;

  const result = await discRepository.query(globalStatsQuery, globalParams);
  const row = result[0];
  const globalAvgRateValue = row?.globalAvgRate;
  const medianVotesValue = row?.medianVotes;

  return {
    globalAvgRate: Number.parseFloat(String(globalAvgRateValue ?? '')) || 0,
    medianVotes: Number.parseInt(String(medianVotesValue ?? ''), 10) || 1,
  };
}
