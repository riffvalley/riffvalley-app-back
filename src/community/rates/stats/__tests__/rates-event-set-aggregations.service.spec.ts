import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesEventSetAggregationsService } from '../rates-event-set-aggregations.service';

type AggregateRow = {
  aggregation: 'year' | 'month' | 'day' | 'genre' | 'withoutGenre';
  period: string | null;
  activityCount: number | string;
};

function createService(
  rows: AggregateRow[] = [],
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
  const repository = new Repository<RateVoteEvent>(
    RateVoteEvent,
    new EntityManager(
      new DataSource({ type: 'postgres', database: 'event-set-aggregations' }),
    ),
  );
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
    async (sql) =>
      sql.includes('ranked_current_rates') ? dailyAssignments : rows,
  );
  Object.assign(repository, { query });
  return { service: new RatesEventSetAggregationsService(repository), query };
}

describe('RatesEventSetAggregationsService', () => {
  it('counts annual discs once while preserving monthly event and daily disc totals', async () => {
    const { service, query } = createService([
      { aggregation: 'year', period: null, activityCount: '2' },
      { aggregation: 'month', period: '2027-01', activityCount: 2 },
      { aggregation: 'month', period: '2027-12', activityCount: 2 },
      { aggregation: 'day', period: '2027-01-01', activityCount: 2 },
      { aggregation: 'day', period: '2027-12-31', activityCount: 2 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 3 },
      { aggregation: 'genre', period: 'Doom', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2027);

    expect(result).toEqual({
      year: 2027,
      timeZone: 'UTC',
      activityCount: 2,
      activityByMonth: [
        { month: '2027-01', activityCount: 2 },
        ...Array.from({ length: 10 }, (_, index) => ({
          month: `2027-${String(index + 2).padStart(2, '0')}`,
          activityCount: 0,
        })),
        { month: '2027-12', activityCount: 2 },
      ],
      activityByDay: [
        {
          date: '2027-01-01',
          activityCount: 2,
          discs: [
            {
              discId: 'disc-1',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2027-01-01',
            },
            {
              discId: 'disc-2',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2027-01-01',
            },
          ],
        },
        {
          date: '2027-12-31',
          activityCount: 2,
          discs: [
            {
              discId: 'disc-1',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2027-12-31',
            },
            {
              discId: 'disc-2',
              title: 'Album',
              artist: null,
              rate: null,
              date: '2027-12-31',
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
    expect(query.mock.calls[0][0]).toContain("event.event_type = 'set'");
    expect(query.mock.calls[0][0]).toContain('event.previous_value IS NULL');
    expect(query.mock.calls[0][0]).toContain('event.new_value IS NOT NULL');
    expect(query.mock.calls[0][0]).toContain('event.user_id = $1');
    expect(query.mock.calls[0][0]).toContain('INNER JOIN disc');
    expect(query.mock.calls[0][0]).toContain('genre.id = disc."genreId"');
    expect(query.mock.calls[0][0]).toContain('disc."releaseDate" >= $2::date');
    expect(query.mock.calls[0][0]).toContain(
      'event.occurred_at >= $4::timestamptz',
    );
    expect(query.mock.calls[0][0]).toContain('"occurredAt" AT TIME ZONE $6');
    expect(query.mock.calls[0][0]).toContain('SELECT "eventId", "discId"');
    expect(query.mock.calls[0][0]).toContain('COUNT("eventId")');
    expect(
      query.mock.calls[0][0].match(/COUNT\(DISTINCT "discId"\)/gu) ?? [],
    ).toHaveLength(2);
    expect(query.mock.calls[0][0]).not.toContain('rate.createdAt');
    expect(query.mock.calls[0][0]).not.toContain("event.event_type = 'change'");
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN current_scores');
    expect(query.mock.calls[1][0]).toContain('event."eventId"');
    expect(query.mock.calls[1][0]).toContain('SELECT DISTINCT ON');
    expect(query.mock.calls[0][1]).toEqual([
      'user-id',
      '2027-01-01',
      '2028-01-01',
      new Date('2027-01-01T00:00:00.000Z'),
      new Date('2028-01-01T00:00:00.000Z'),
      'UTC',
    ]);
  });

  it('uses local year bounds and a parameterized IANA zone for daily and monthly grouping', async () => {
    const { service, query } = createService([
      { aggregation: 'year', period: null, activityCount: 1 },
      { aggregation: 'month', period: '2027-01', activityCount: 1 },
      { aggregation: 'day', period: '2027-01-01', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 1 },
    ]);

    const result = await service.aggregateActivityForUser(
      'user-id',
      2027,
      'Europe/Madrid',
    );

    expect(result.timeZone).toBe('Europe/Madrid');
    expect(query.mock.calls[0][1]).toEqual([
      'user-id',
      '2027-01-01',
      '2028-01-01',
      new Date('2026-12-31T23:00:00.000Z'),
      new Date('2027-12-31T23:00:00.000Z'),
      'Europe/Madrid',
    ]);
    expect(query.mock.calls[0][0]).toContain(
      'TO_CHAR(DATE_TRUNC(\'month\', "localDate")',
    );
    expect(query.mock.calls[0][0]).toContain(
      'TO_CHAR("localDate", \'YYYY-MM-DD\')',
    );
  });

  it('returns zero total, twelve zero months, and an empty calendar for an empty cohort', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2027);

    expect(result.activityCount).toBe(0);
    expect(result.activityByMonth).toHaveLength(12);
    expect(
      result.activityByMonth.every((month) => month.activityCount === 0),
    ).toBe(true);
    expect(result.activityByDay).toEqual([]);
  });

  it('counts a repeated set disc once per date and returns one scored disc detail', async () => {
    const { service } = createService(
      [
        { aggregation: 'year', period: null, activityCount: 1 },
        { aggregation: 'month', period: '2027-05', activityCount: 2 },
        { aggregation: 'day', period: '2027-05-09', activityCount: 1 },
        { aggregation: 'withoutGenre', period: null, activityCount: 2 },
      ],
      [
        {
          date: '2027-05-09',
          discId: 'same-disc',
          title: 'Album',
          artist: 'Artist',
          rate: '8.75',
        },
      ],
    );

    const result = await service.aggregateActivityForUser('user-id', 2027);

    expect(result.activityCount).toBe(1);
    expect(result.activityByDay[0]).toEqual({
      date: '2027-05-09',
      activityCount: 1,
      discs: [
        {
          discId: 'same-disc',
          title: 'Album',
          artist: 'Artist',
          rate: 8.75,
          date: '2027-05-09',
        },
      ],
    });
  });

  it.each([2025, 2026])(
    'rejects historical year %i before querying',
    async (year) => {
      const { service, query } = createService();

      await expect(
        service.aggregateActivityForUser('user-id', year),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    { userId: '', year: 2027, timeZone: 'UTC' },
    { userId: 'user-id', year: 2027, timeZone: 'Invalid/Zone' },
  ])('rejects invalid cohort request before querying: %o', async (request) => {
    const { service, query } = createService();

    await expect(
      service.aggregateActivityForUser(
        request.userId,
        request.year,
        request.timeZone,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('allows monthly event counts to exceed annual distinct disc counts', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 1 },
      { aggregation: 'month', period: '2027-01', activityCount: 2 },
      { aggregation: 'day', period: '2027-01-01', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 2 },
    ]);

    await expect(
      service.aggregateActivityForUser('user-id', 2027),
    ).resolves.toMatchObject({
      activityCount: 1,
      activityByMonth: expect.arrayContaining([
        { month: '2027-01', activityCount: 2 },
      ]),
    });
  });

  it('fails if genre attribution does not account for every eligible set event', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 2 },
      { aggregation: 'month', period: '2027-01', activityCount: 2 },
      { aggregation: 'day', period: '2027-01-01', activityCount: 2 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    await expect(
      service.aggregateActivityForUser('user-id', 2027),
    ).rejects.toThrow(
      'Event set activity aggregate totals are inconsistent across periods.',
    );
  });

  it('keeps full counts for each genre even when their sum exceeds annual activity', async () => {
    const { service } = createService([
      { aggregation: 'year', period: null, activityCount: 2 },
      { aggregation: 'month', period: '2027-01', activityCount: 3 },
      { aggregation: 'day', period: '2027-01-01', activityCount: 2 },
      { aggregation: 'genre', period: 'Black Metal', activityCount: 2 },
      { aggregation: 'genre', period: 'Post-Metal', activityCount: 1 },
      { aggregation: 'withoutGenre', period: null, activityCount: 0 },
    ]);

    const result = await service.aggregateActivityForUser('user-id', 2027);

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

  it.each([-1, 1.5, 'not-a-count'])(
    'rejects invalid aggregate count %p',
    async (count) => {
      const { service } = createService([
        {
          aggregation: 'year',
          period: null,
          activityCount: count as number | string,
        },
      ]);

      await expect(
        service.aggregateActivityForUser('user-id', 2027),
      ).rejects.toThrow(
        'Event set activity count must be a non-negative integer.',
      );
    },
  );
});
