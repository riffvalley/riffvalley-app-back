import { loadHomeDiscTotals } from './home-totals';

describe('loadHomeDiscTotals', () => {
  it('counts the full catalog without applying main-query filters', async () => {
    const query = jest.fn().mockResolvedValue([
      { totalDiscs: '12', totalVotes: '34' },
    ]);

    await expect(loadHomeDiscTotals({ query } as any)).resolves.toEqual({
      totalDiscs: 12,
      totalVotes: 34,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('COUNT(DISTINCT d.id) AS "totalDiscs"');
    expect(sql).toContain('COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) AS "totalVotes"');
    expect(sql).toContain('LEFT JOIN rate r ON r."discId" = d.id');
    expect(sql).not.toContain('releaseDate');
    expect(sql).not.toContain('genreId');
    expect(sql).not.toContain('country');
    expect(params).toEqual([]);
  });

  it('binds inclusive statsDateRange endpoints as Date values in order', async () => {
    const query = jest.fn().mockResolvedValue([
      { totalDiscs: '2', totalVotes: '3' },
    ]);

    await expect(
      loadHomeDiscTotals({ query } as any, ['2024-01-01', '2024-12-31']),
    ).resolves.toEqual({ totalDiscs: 2, totalVotes: 3 });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE d."releaseDate" BETWEEN $1 AND $2');
    expect(params).toEqual([
      new Date('2024-01-01'),
      new Date('2024-12-31'),
    ]);
    expect(params.every((param: unknown) => param instanceof Date)).toBe(true);
  });

  it('preserves zero defaults and returns JavaScript numbers from PostgreSQL count strings', async () => {
    const query = jest.fn().mockResolvedValue([
      { totalDiscs: '0', totalVotes: '0' },
    ]);

    const totals = await loadHomeDiscTotals({ query } as any);

    expect(totals).toEqual({ totalDiscs: 0, totalVotes: 0 });
    expect(typeof totals.totalDiscs).toBe('number');
    expect(typeof totals.totalVotes).toBe('number');
  });
});
