import { buildHomeDateRange } from '../helpers/home-date-range';
import { HomeQueryRunner } from './home-query-runner';

type HomeDiscTotals = {
  totalDiscs: number;
  totalVotes: number;
};

/** Loads the Home totals using the current optional statsDateRange semantics. */
export async function loadHomeDiscTotals(
  discRepository: HomeQueryRunner,
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
  const row = result[0];
  const totalDiscsValue = row?.totalDiscs;
  const totalVotesValue = row?.totalVotes;

  return {
    totalDiscs: Number.parseInt(String(totalDiscsValue ?? ''), 10) || 0,
    totalVotes: Number.parseInt(String(totalVotesValue ?? ''), 10) || 0,
  };
}
