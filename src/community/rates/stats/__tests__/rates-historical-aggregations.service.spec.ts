import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RatesHistoricalAggregationsService } from '../rates-historical-aggregations.service';

function createService(
  rows: Array<{
    aggregation: 'year' | 'month' | 'day' | 'genre' | 'withoutGenre';
    period: string | null;
    activityCount: number | string;
  }> = [],
  dailyAssignmentOverride?: Array<{
    date: string;
    discId: string;
    title: string;
    artist: string | null;
    rate: number | string | null;
  }>,
) {
  const dailyAssignments =
    dailyAssignmentOverride ??
    rows.flatMap((row) =>
      row.aggregation === 'day' && row.period
        ? Array.from({ length: Number(row.activityCount) }, (_, index) => ({
            date: row.period as string,
            discId: `disc-${index + 1}`,
            title: 'Album',
            artist: null,
            rate: 8.5,
          }))
        : [],
    );
  const repository = new Repository<Rate>(
    Rate,
    new EntityManager(
      new DataSource({ type: 'postgres', database: 'historical-aggregations' }),
    ),
  );
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
    async (sql) =>
      sql.includes('SELECT DISTINCT ON') ? dailyAssignments : rows,
  );
  Object.assign(repository, { query });
  return {
    service: new RatesHistoricalAggregationsService(repository),
    query,
  };
}

describe('RatesHistoricalAggregationsService', () => {
  it('aggregates historical activity over the current scored disc population', async () => {
    const { service, query } = createService([
      { aggregation: 'year', period: null, activityCount: '3' },
      { aggregation: 'month', period: '2025-01', activityCount: 1 },
      { aggregation: 'month', period: '2025-12', activityCount: 2 },
      { aggregation: 'day', period: '2025-01-01', activityCount: 1 },
      { aggregation: 'day', period: '2025-12-31', activityCount: 2 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 2 },
      { aggregation: 'genre', period: 'Doom', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2025);

    expect(result).toEqual({
      year: 2025,
      activityCount: 3,
      activityByMonth: [
        { month: '2025-01', activityCount: 1 },
        ...Array.from({ length: 10 }, (_, index) => ({
          month: `2025-${String(index + 2).padStart(2, '0')}`,
          activityCount: 0,
        })),
        { month: '2025-12', activityCount: 2 },
      ],
      activityByDay: [
        {
          date: '2025-01-01',
          activityCount: 1,
          discs: [
            {
              discId: 'disc-1',
              title: 'Album',
              artist: null,
              rate: 8.5,
              date: '2025-01-01',
            },
          ],
        },
        {
          date: '2025-12-31',
          activityCount: 2,
          discs: [
            {
              discId: 'disc-1',
              title: 'Album',
              artist: null,
              rate: 8.5,
              date: '2025-12-31',
            },
            {
              discId: 'disc-2',
              title: 'Album',
              artist: null,
              rate: 8.5,
              date: '2025-12-31',
            },
          ],
        },
      ],
      activityByGenre: [
        { genre: 'Black Metal', activityCount: 2 },
        { genre: 'Doom', activityCount: 1 },
      ],
      activityWithoutGenre: 0,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(query.mock.calls[0][0]).toContain('rate."userId" = $1');
    expect(query.mock.calls[0][0]).toContain('disc."releaseDate" >= $2::date');
    expect(query.mock.calls[0][0]).toContain('genre.id = disc."genreId"');
    expect(query.mock.calls[0][0]).toContain('FROM scored_discs');
    expect(query.mock.calls[0][0]).toContain('"currentRate" BETWEEN 0 AND 10');
    expect(
      query.mock.calls[0][0].match(/COUNT\(DISTINCT "discId"\)/gu) ?? [],
    ).toHaveLength(2);
    expect(query.mock.calls[1][0]).toContain('eligible_scored_rows');
    expect(query.mock.calls[1][0]).toContain('SELECT DISTINCT ON');
  });

  it('returns zero and twelve zero months when the historical source is empty', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2026);

    expect(result.activityCount).toBe(0);
    expect(result.activityByMonth).toHaveLength(12);
    expect(
      result.activityByMonth.every((month) => month.activityCount === 0),
    ).toBe(true);
    expect(result.activityByDay).toEqual([]);
  });

  it('counts a scored disc once annually while retaining its activity across months and days', async () => {
    const { service } = createService(
      [
        { aggregation: 'year', period: null, activityCount: 1 },
        { aggregation: 'month', period: '2025-04', activityCount: 1 },
        { aggregation: 'month', period: '2025-05', activityCount: 1 },
        { aggregation: 'day', period: '2025-04-02', activityCount: 1 },
        { aggregation: 'day', period: '2025-05-03', activityCount: 1 },
        { aggregation: 'withoutGenre', period: null, activityCount: 1 },
      ],
      [
        {
          date: '2025-04-02',
          discId: 'same-disc',
          title: 'Album',
          artist: null,
          rate: '8.75',
        },
        {
          date: '2025-05-03',
          discId: 'same-disc',
          title: 'Album',
          artist: null,
          rate: '8.75',
        },
      ],
    );

    const result = await service.aggregateActivityForUser('user-id', 2025);

    expect(result.activityCount).toBe(1);
    expect(result.activityByDay).toEqual([
      {
        date: '2025-04-02',
        activityCount: 1,
        discs: [
          {
            discId: 'same-disc',
            title: 'Album',
            artist: null,
            rate: 8.75,
            date: '2025-04-02',
          },
        ],
      },
      {
        date: '2025-05-03',
        activityCount: 1,
        discs: [
          {
            discId: 'same-disc',
            title: 'Album',
            artist: null,
            rate: 8.75,
            date: '2025-05-03',
          },
        ],
      },
    ]);
  });

  it('excludes historical assignments without a valid current score', async () => {
    const { service, query } = createService([
      { aggregation: 'year', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2025);

    expect(result.activityCount).toBe(0);
    expect(result.activityByDay).toEqual([]);
    expect(query.mock.calls[0][0]).toContain('"currentRate" IS NOT NULL');
  });

  it('rejects years after 2026 through the historical selector without querying', async () => {
    const { service, query } = createService();

    await expect(
      service.aggregateActivityForUser('user-id', 2027),
    ).rejects.toThrow('Historical Rate cohorts support only 2025 and 2026.');
    expect(query).not.toHaveBeenCalled();
  });

  it('allows a scored disc to appear in more than one monthly count', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 1 },
      { aggregation: 'month', period: '2025-01', activityCount: 2 },
      { aggregation: 'day', period: '2025-01-01', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 1 },
    ]);

    await expect(
      service.aggregateActivityForUser('user-id', 2025),
    ).resolves.toMatchObject({
      activityCount: 1,
      activityByMonth: expect.arrayContaining([
        { month: '2025-01', activityCount: 2 },
      ]),
    });
  });

  it('fails if genre attribution does not account for every eligible Rate', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 2 },
      { aggregation: 'month', period: '2025-01', activityCount: 2 },
      { aggregation: 'day', period: '2025-01-01', activityCount: 2 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    await expect(
      service.aggregateActivityForUser('user-id', 2025),
    ).rejects.toThrow('Historical activity aggregate totals are inconsistent');
  });

  it('attributes each currently scored disc to its single current genre', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 3 },
      { aggregation: 'month', period: '2025-01', activityCount: 3 },
      { aggregation: 'day', period: '2025-01-01', activityCount: 2 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 2 },
      { aggregation: 'genre', period: 'Post-Metal', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2025);

    expect(result.activityCount).toBe(3);
    expect(result.activityByGenre).toEqual([
      { genre: 'Black Metal', activityCount: 2 },
      { genre: 'Post-Metal', activityCount: 1 },
    ]);
    expect(
      result.activityByGenre.reduce(
        (count, row) => count + row.activityCount,
        0,
      ),
    ).toBe(3);
  });
});
