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
            rate: null,
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
      sql.includes('ranked_current_rates') ? dailyAssignments : rows,
  );
  Object.assign(repository, { query });
  return {
    service: new RatesHistoricalAggregationsService(repository),
    query,
  };
}

describe('RatesHistoricalAggregationsService', () => {
  it('returns a year total, all months, and active days from the same counts', async () => {
    const { service, query } = createService([
      { aggregation: 'year', period: null, activityCount: '4' },
      { aggregation: 'month', period: '2025-01', activityCount: 1 },
      { aggregation: 'month', period: '2025-12', activityCount: 3 },
      { aggregation: 'day', period: '2025-01-01', activityCount: 1 },
      { aggregation: 'day', period: '2025-12-31', activityCount: 3 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 3 },
      { aggregation: 'genre', period: 'Doom', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2025);

    expect(result).toEqual({
      year: 2025,
      activityCount: 4,
      activityByMonth: [
        { month: '2025-01', activityCount: 1 },
        ...Array.from({ length: 10 }, (_, index) => ({
          month: `2025-${String(index + 2).padStart(2, '0')}`,
          activityCount: 0,
        })),
        { month: '2025-12', activityCount: 3 },
      ],
      activityByDay: [
        {
          date: '2025-01-01',
          activityCount: 1,
          assignments: [
            {
              discId: 'disc-1',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2025-01-01',
            },
          ],
        },
        {
          date: '2025-12-31',
          activityCount: 3,
          assignments: [
            {
              discId: 'disc-1',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2025-12-31',
            },
            {
              discId: 'disc-2',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2025-12-31',
            },
            {
              discId: 'disc-3',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2025-12-31',
            },
          ],
        },
      ],
      activityByGenre: [
        { genre: 'Black Metal', activityCount: 3 },
        { genre: 'Doom', activityCount: 1 },
      ],
      activityWithoutGenre: 0,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(query.mock.calls[0][0]).toContain('rate."userId" = $1');
    expect(query.mock.calls[0][0]).toContain('disc."releaseDate" >= $2::date');
    expect(query.mock.calls[0][0]).toContain('genre.id = disc."genreId"');
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN current_scores');
    expect(query.mock.calls[1][0]).toContain(
      'ORDER BY eligible_rate_rows."createdAtLocal", eligible_rate_rows."rateId"',
    );
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

  it('preserves repeated historical assignments for one disc and leaves missing current notes null', async () => {
    const { service } = createService(
      [
        { aggregation: 'year', period: null, activityCount: 2 },
        { aggregation: 'month', period: '2025-04', activityCount: 2 },
        { aggregation: 'day', period: '2025-04-02', activityCount: 2 },
        { aggregation: 'withoutGenre', period: null, activityCount: 2 },
      ],
      [
        {
          date: '2025-04-02',
          discId: 'same-disc',
          title: 'Album',
          artist: null,
          rate: null,
        },
        {
          date: '2025-04-02',
          discId: 'same-disc',
          title: 'Album',
          artist: 'Artist',
          rate: null,
        },
      ],
    );

    const result = await service.aggregateActivityForUser('user-id', 2025);

    expect(result.activityByDay[0]).toEqual({
      date: '2025-04-02',
      activityCount: 2,
      assignments: [
        {
          discId: 'same-disc',
          title: 'Album',
          artist: null,
          rate: null,
          date: '2025-04-02',
        },
        {
          discId: 'same-disc',
          title: 'Album',
          artist: 'Artist',
          rate: null,
          date: '2025-04-02',
        },
      ],
    });
  });

  it('rejects years after 2026 through the historical selector without querying', async () => {
    const { service, query } = createService();

    await expect(
      service.aggregateActivityForUser('user-id', 2027),
    ).rejects.toThrow('Historical Rate cohorts support only 2025 and 2026.');
    expect(query).not.toHaveBeenCalled();
  });

  it('fails if database period totals do not match the annual total', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 2 },
      { aggregation: 'month', period: '2025-01', activityCount: 1 },
      { aggregation: 'day', period: '2025-01-01', activityCount: 1 },
    ]);

    await expect(
      service.aggregateActivityForUser('user-id', 2025),
    ).rejects.toThrow('Historical activity aggregate totals are inconsistent');
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

  it('keeps full counts for each genre even when their sum exceeds annual activity', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 2 },
      { aggregation: 'month', period: '2025-01', activityCount: 2 },
      { aggregation: 'day', period: '2025-01-01', activityCount: 2 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 2 },
      { aggregation: 'genre', period: 'Post-Metal', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2025);

    expect(result.activityCount).toBe(2);
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
