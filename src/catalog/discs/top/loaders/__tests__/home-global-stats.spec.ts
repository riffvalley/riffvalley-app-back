import {
  CURRENT_RATES_CTE,
  TOP_DISCS_PRIOR_STRENGTH,
} from '../home-global-stats';

describe('TopDiscs global rating model', () => {
  it('uses the approved fixed prior strength', () => {
    expect(TOP_DISCS_PRIOR_STRENGTH).toBe(4);
  });

  it('selects the current row deterministically before validating its musical rating', () => {
    expect(CURRENT_RATES_CTE).toContain('DISTINCT ON (r."discId", r."userId")');
    expect(CURRENT_RATES_CTE).toContain('r."editedAt" DESC NULLS LAST');
    expect(CURRENT_RATES_CTE).toContain('r."createdAt" DESC');
    expect(CURRENT_RATES_CTE).toContain('r.id DESC');
    expect(CURRENT_RATES_CTE).toContain('r."userId" IS NOT NULL');
    expect(CURRENT_RATES_CTE).toContain('WHERE rate BETWEEN 0 AND 10');
    expect(CURRENT_RATES_CTE).not.toContain('rate IS NOT NULL');
  });
});
