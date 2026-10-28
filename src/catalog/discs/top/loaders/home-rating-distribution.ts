import { buildHomeDateRange } from '../helpers/home-date-range';
import { HomeQueryRunner } from './home-query-runner';

type HomeRatingDistributionItem = {
  rate: number;
  count: number;
};

/** Loads the independent Home rating distribution and maps SQL values to numbers. */
export async function loadHomeRatingDistribution(
  discRepository: HomeQueryRunner,
  distributionDateRange?: (string | Date)[],
): Promise<HomeRatingDistributionItem[]> {
  const { condition: dateCondition, params } = buildHomeDateRange(
    'AND',
    distributionDateRange,
  );
  const ratingDistributionQuery = `
    SELECT r.rate AS "rateValue", COUNT(*) AS "count"
    FROM rate r
    JOIN "disc" d ON d.id = r."discId"
    WHERE r.rate IS NOT NULL${dateCondition}
    GROUP BY r.rate
    ORDER BY r.rate;
  `;
  const result = await discRepository.query(ratingDistributionQuery, params);

  return result.map((row) => ({
    rate: Number.parseFloat(String(row.rateValue)),
    count: Number.parseInt(String(row.count), 10),
  }));
}
