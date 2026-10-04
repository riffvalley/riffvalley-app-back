import { loadHomeTopUsersByCover } from './home-top-users-by-cover';

describe('loadHomeTopUsersByCover', () => {
  it('maps grouped cover counts to user and totalCover without adding a tie-breaker', async () => {
    const query = jest.fn().mockResolvedValue([
      { userId: '00000000-0000-4000-8000-000000000002', username: 'Bea', coverCount: '3' },
      { userId: '00000000-0000-4000-8000-000000000001', username: 'Ada', coverCount: '3' },
    ]);

    await expect(loadHomeTopUsersByCover({ query } as any)).resolves.toEqual([
      { user: { id: '00000000-0000-4000-8000-000000000002', username: 'Bea' }, totalCover: 3 },
      { user: { id: '00000000-0000-4000-8000-000000000001', username: 'Ada' }, totalCover: 3 },
    ]);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE r.cover IS NOT NULL');
    expect(sql).toContain('GROUP BY u.id, u.username');
    expect(sql).toContain('COUNT(r.id) AS "coverCount"');
    expect(sql).toContain('ORDER BY "coverCount" DESC\n    LIMIT 20;');
    expect(sql).not.toMatch(/ORDER BY "coverCount" DESC\s*,/);
    expect(params).toEqual([]);
  });

  it('binds statsDateRange endpoints as Date values in their existing order', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await expect(
      loadHomeTopUsersByCover({ query } as any, ['2024-01-01', '2024-12-31']),
    ).resolves.toEqual([]);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('AND d."releaseDate" BETWEEN $1 AND $2');
    expect(params).toEqual([
      new Date('2024-01-01'),
      new Date('2024-12-31'),
    ]);
    expect(params.every((param: unknown) => param instanceof Date)).toBe(true);
  });

  it('returns an empty list for an empty raw result', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await expect(loadHomeTopUsersByCover({ query } as any)).resolves.toEqual([]);
  });
});
