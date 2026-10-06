import { Repository } from 'typeorm';
import { Disc } from '../../entities/disc.entity';

type HomeGlobalStats = {
  globalAvgRate: number;
  medianVotes: number;
};

export async function loadHomeGlobalStats(
  discRepository: Pick<Repository<Disc>, 'query'>,
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
  const { globalAvgRate: globalAvgRateValue, medianVotes: medianVotesValue } =
    result[0] || {};

  return {
    globalAvgRate: parseFloat(globalAvgRateValue) || 0,
    medianVotes: parseInt(medianVotesValue, 10) || 1,
  };
}
