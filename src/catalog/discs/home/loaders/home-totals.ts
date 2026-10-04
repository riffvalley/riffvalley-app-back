import { Repository } from 'typeorm';
import { Disc } from '../../entities/disc.entity';
import { buildHomeDateRange } from '../helpers/home-date-range';

type HomeDiscTotals = {
  totalDiscs: number;
  totalVotes: number;
};

/** Loads the Home totals using the current optional statsDateRange semantics. */
export async function loadHomeDiscTotals(
  discRepository: Pick<Repository<Disc>, 'query'>,
  statsDateRange?: (string | Date)[],
): Promise<HomeDiscTotals> {
  const { condition: dateCondition, params } = buildHomeDateRange(
    'WHERE',
    statsDateRange,
  );
  const totalsQuery = `
    SELECT
      COUNT(DISTINCT d.id) AS "totalDiscs",
      COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) AS "totalVotes"
    FROM disc d
    LEFT JOIN rate r ON r."discId" = d.id
    ${dateCondition};
  `;

  const result = await discRepository.query(totalsQuery, params);
  const { totalDiscs: totalDiscsValue, totalVotes: totalVotesValue } =
    result[0] || {};

  return {
    totalDiscs: parseInt(totalDiscsValue, 10) || 0,
    totalVotes: parseInt(totalVotesValue, 10) || 0,
  };
}
