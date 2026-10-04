import { loadHomeRatingDistribution } from './home-rating-distribution';

describe('loadHomeRatingDistribution', () => {
  it('maps SQL values to numeric rate/count items and preserves ascending SQL ordering', async () => {
    const query = jest.fn().mockResolvedValue([
      { rateValue: '1.25', count: '2' },
      { rateValue: '3.75', count: '1' },
      { rateValue: '4.50', count: '3' },
    ]);

    await expect(loadHomeRatingDistribution({ query } as any)).resolves.toEqual([
      { rate: 1.25, count: 2 },
      { rate: 3.75, count: 1 },
      { rate: 4.5, count: 3 },
    ]);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE r.rate IS NOT NULL');
    expect(sql).toContain('GROUP BY r.rate');
    expect(sql).toContain('ORDER BY r.rate;');
    expect(sql).not.toContain('statsDateRange');
    expect(sql).not.toContain('genreId');
    expect(sql).not.toContain('country');
    expect(params).toEqual([]);
  });

  it('binds only distributionDateRange as inclusive Date endpoints in order', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await expect(
      loadHomeRatingDistribution({ query } as any, ['2024-01-01', '2024-12-31']),
    ).resolves.toEqual([]);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('AND d."releaseDate" BETWEEN $1 AND $2');
    expect(params).toEqual([
      new Date('2024-01-01'),
      new Date('2024-12-31'),
    ]);
    expect(params.every((param: unknown) => param instanceof Date)).toBe(true);
  });

  it('returns an empty array when no grouped rates are returned', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await expect(loadHomeRatingDistribution({ query } as any)).resolves.toEqual([]);
  });
});
