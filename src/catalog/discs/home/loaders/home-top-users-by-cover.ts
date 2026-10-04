import { Repository } from 'typeorm';
import { Disc } from '../../entities/disc.entity';
import { buildHomeDateRange } from '../helpers/home-date-range';

/** Loads the Home ranking of users with the most non-NULL covers. */
export async function loadHomeTopUsersByCover(
  discRepository: Pick<Repository<Disc>, 'query'>,
  statsDateRange?: (string | Date)[],
) {
  const { condition: dateCondition, params } = buildHomeDateRange(
    'AND',
    statsDateRange,
  );
  const topUsersByCoverQuery = `
    SELECT u.id AS "userId", u.username, COUNT(r.id) AS "coverCount"
    FROM rate r
    JOIN "users" u ON u.id = r."userId"
    JOIN "disc" d ON d.id = r."discId"
    WHERE r.cover IS NOT NULL${dateCondition}
    GROUP BY u.id, u.username
    ORDER BY "coverCount" DESC
    LIMIT 20;
  `;
  const rows = await discRepository.query(topUsersByCoverQuery, params);

  return rows.map((row: any) => ({
    user: {
      id: row.userId,
      username: row.username,
    },
    totalCover: parseInt(row.coverCount, 10),
  }));
}
