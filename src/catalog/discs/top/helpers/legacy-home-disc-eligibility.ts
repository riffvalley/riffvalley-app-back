/** Historical eligibility for /homeDiscs: rated discs and editorial pins. */
export function buildLegacyHomeDiscEligibilityPredicate(
  discAlias = 'd',
): string {
  return `(${discAlias}."pinned" = true OR EXISTS (
    SELECT 1
    FROM rate eligible_rate
    WHERE eligible_rate."discId" = ${discAlias}.id
      AND eligible_rate.rate IS NOT NULL
  ))`;
}
