/** Fixed shrinkage strength approved for the TopDiscs ranking. */
export const TOP_DISCS_PRIOR_STRENGTH = 4;

/**
 * Selects one current Rate per user/disc pair. RatesService updates that row
 * in place; historical duplicates are resolved by latest edit, creation time,
 * then UUID, all descending for deterministic results.
 */
export const CURRENT_RATES_CTE = `
  current_rates AS (
    SELECT DISTINCT ON (r."discId", r."userId")
      r.id,
      r."discId",
      r."userId",
      r.rate,
      r.cover
    FROM rate r
    WHERE r."userId" IS NOT NULL
    ORDER BY
      r."discId",
      r."userId",
      r."editedAt" DESC NULLS LAST,
      r."createdAt" DESC,
      r.id DESC
  ),
  valid_current_rates AS (
    SELECT id, "discId", "userId", rate, cover
    FROM current_rates
    WHERE rate BETWEEN 0 AND 10
  )
`;
