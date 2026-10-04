import { Repository } from 'typeorm';
import { Disc } from '../../entities/disc.entity';
import { loadHomeGlobalStats } from './home-global-stats';

describe('loadHomeGlobalStats', () => {
  it('runs the existing per-disc SQL aggregates with the D30 filters and binds', async () => {
    const query = jest.fn().mockResolvedValue([
      { globalAvgRate: '3.25', medianVotes: 1.5 },
    ]);
    const repository = { query } as unknown as Repository<Disc>;
    const where =
      'WHERE d."releaseDate" BETWEEN $1 AND $2 AND d."releaseDate" <= $3 AND d."genreId" = $4 AND c.id = $5';
    const params = [
      new Date('2020-01-01'),
      new Date('2024-12-31'),
      new Date('2024-12-31'),
      'genre-id',
      'country-id',
    ];

    await expect(loadHomeGlobalStats(repository, where, params)).resolves.toEqual({
      globalAvgRate: 3.25,
      medianVotes: 1,
    });

    const [sql, queryParams] = query.mock.calls[0];
    expect(sql).toContain('AVG(avgRates) AS "globalAvgRate"');
    expect(sql).toContain(
      'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voteCount) AS "medianVotes"',
    );
    expect(sql).toContain(
      'COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) AS voteCount',
    );
    expect(sql).toContain('COALESCE(AVG(r.rate), 0) AS avgRates');
    expect(sql).toContain('LEFT JOIN rate r ON d.id = r."discId"');
    expect(sql).toContain('GROUP BY d.id');
    expect(sql).toContain(where);
    expect(queryParams).toBe(params);
  });

  it('uses zero for an empty global average and one for an empty median', async () => {
    const query = jest.fn().mockResolvedValue([
      { globalAvgRate: null, medianVotes: null },
    ]);
    const repository = { query } as unknown as Repository<Disc>;

    await expect(loadHomeGlobalStats(repository, 'WHERE TRUE', [])).resolves.toEqual({
      globalAvgRate: 0,
      medianVotes: 1,
    });
  });

  it('uses the same defaults when PostgreSQL returns no aggregate row', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = { query } as unknown as Repository<Disc>;

    await expect(loadHomeGlobalStats(repository, 'WHERE TRUE', [])).resolves.toEqual({
      globalAvgRate: 0,
      medianVotes: 1,
    });
  });

  it('preserves the current zero median fallback and parses SQL numeric strings', async () => {
    const query = jest.fn().mockResolvedValue([
      { globalAvgRate: '0.00', medianVotes: '0' },
    ]);
    const repository = { query } as unknown as Repository<Disc>;

    await expect(loadHomeGlobalStats(repository, 'WHERE TRUE', [])).resolves.toEqual({
      globalAvgRate: 0,
      medianVotes: 1,
    });
  });
});
