import { buildHomeDateRange } from '../helpers/home-date-range';
import { HomeQueryRunner } from './home-query-runner';

/** Loads the Home ranking of users with the most non-NULL rates. */
export async function loadHomeTopUsersByRates(
  discRepository: HomeQueryRunner,
  statsDateRange?: (string | Date)[],
) {
  const { condition: dateCondition, params } = buildHomeDateRange(
    'AND',
    statsDateRange,
  );
  const topUsersByRatesQuery = `
    SELECT u.id AS "userId", u.username, COUNT(r.id) AS "rateCount"
    FROM rate r
    JOIN "users" u ON u.id = r."userId"
    JOIN "disc" d ON d.id = r."discId"
    WHERE r.rate IS NOT NULL${dateCondition}
    GROUP BY u.id, u.username
    ORDER BY "rateCount" DESC
    LIMIT 20;
  `;
  const rows = await discRepository.query(topUsersByRatesQuery, params);

  return rows.map((row) => ({
    user: {
      id: String(row.userId),
      username: String(row.username),
    },
    rateCount: Number.parseInt(String(row.rateCount), 10),
  }));
}
