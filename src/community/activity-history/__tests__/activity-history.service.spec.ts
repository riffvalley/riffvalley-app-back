import { DataSource, EntityManager, Repository } from 'typeorm';
import { RateVoteEvent } from '../../rates/entities/rate-vote-event.entity';
import { ActivityHistoryService } from '../activity-history.service';
import { ActivityHistoryContinuation } from '../types/activity-history.types';

type RawRow = {
  event_id: string;
  event_type: 'set' | 'change';
  occurred_at: string;
  previous_value: string | null;
  new_value: string | null;
  disc_id: string;
  disc_name: string | null;
  disc_image: string | null;
  artist_id: string | null;
  artist_name: string | null;
  genre_id: string | null;
  genre_name: string | null;
};

type HistoryQueryBuilderMock = {
  innerJoin: jest.Mock<HistoryQueryBuilderMock, [string, string, string]>;
  leftJoin: jest.Mock<HistoryQueryBuilderMock, [string, string, string]>;
  select: jest.Mock<HistoryQueryBuilderMock, [string, string]>;
  addSelect: jest.Mock<HistoryQueryBuilderMock, [string, string]>;
  where: jest.Mock<HistoryQueryBuilderMock, [string, Record<string, unknown>]>;
  andWhere: jest.Mock<
    HistoryQueryBuilderMock,
    [string, Record<string, unknown>?]
  >;
  orderBy: jest.Mock<HistoryQueryBuilderMock, [string, 'DESC']>;
  addOrderBy: jest.Mock<HistoryQueryBuilderMock, [string, 'DESC']>;
  limit: jest.Mock<HistoryQueryBuilderMock, [number]>;
  getRawMany: jest.Mock<Promise<RawRow[]>, []>;
};

function createQueryBuilder(rows: RawRow[]): HistoryQueryBuilderMock {
  const builder: HistoryQueryBuilderMock = {
    innerJoin: jest.fn<HistoryQueryBuilderMock, [string, string, string]>(),
    leftJoin: jest.fn<HistoryQueryBuilderMock, [string, string, string]>(),
    select: jest.fn<HistoryQueryBuilderMock, [string, string]>(),
    addSelect: jest.fn<HistoryQueryBuilderMock, [string, string]>(),
    where: jest.fn<
      HistoryQueryBuilderMock,
      [string, Record<string, unknown>]
    >(),
    andWhere: jest.fn<
      HistoryQueryBuilderMock,
      [string, Record<string, unknown>?]
    >(),
    orderBy: jest.fn<HistoryQueryBuilderMock, [string, 'DESC']>(),
    addOrderBy: jest.fn<HistoryQueryBuilderMock, [string, 'DESC']>(),
    limit: jest.fn<HistoryQueryBuilderMock, [number]>(),
    getRawMany: jest.fn<Promise<RawRow[]>, []>().mockResolvedValue(rows),
  };
  for (const method of [
    builder.innerJoin,
    builder.leftJoin,
    builder.select,
    builder.addSelect,
    builder.where,
    builder.andWhere,
    builder.orderBy,
    builder.addOrderBy,
    builder.limit,
  ]) {
    method.mockReturnValue(builder);
  }
  return builder;
}

function eventRow(
  id: string,
  occurredAt: string,
  overrides: Partial<RawRow> = {},
): RawRow {
  return {
    event_id: id,
    event_type: 'change',
    occurred_at: occurredAt,
    previous_value: '6.00',
    new_value: '8.50',
    disc_id: 'disc-1',
    disc_name: 'Record',
    disc_image: 'cover.jpg',
    artist_id: 'artist-1',
    artist_name: 'Artist',
    genre_id: 'genre-1',
    genre_name: 'Rock',
    ...overrides,
  };
}

function createService(rows: RawRow[]) {
  const builder = createQueryBuilder(rows);
  const aggregateRows: { local_date: string; set_count: string | number }[] =
    [];
  const repository = Object.assign(
    new Repository<RateVoteEvent>(
      RateVoteEvent,
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'history-test' }),
      ),
    ),
    {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      query: jest
        .fn()
        .mockImplementation(async (_sql: string, parameters: unknown[]) => {
          const dates = parameters[4];
          return aggregateRows.filter(
            (row) => Array.isArray(dates) && dates.includes(row.local_date),
          );
        }),
    },
  );
  return {
    service: new ActivityHistoryService(repository),
    builder,
    repository,
    aggregateRows,
  };
}

describe('ActivityHistoryService', () => {
  const occurredAt = '2026-10-29T12:00:00.000000Z';

  it('requires the user in the base predicate and orders by timestamp then UUID descending', async () => {
    const { service, builder, repository } = createService([]);

    const page = await service.findUserHistory('user-1');

    expect(page).toEqual({
      items: [],
      hasMore: false,
      nextPosition: null,
      dailySetCounts: {},
    });
    expect(repository.query).not.toHaveBeenCalled();
    expect(builder.where).toHaveBeenCalledWith('event.userId = :userId', {
      userId: 'user-1',
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      "event.eventType IN ('set', 'change')",
    );
    expect(builder.innerJoin).toHaveBeenCalledWith(
      'disc',
      'disc',
      'disc.id = event.disc_id',
    );
    expect(builder.orderBy).toHaveBeenCalledWith('event.occurredAt', 'DESC');
    expect(builder.addOrderBy).toHaveBeenCalledWith('event.id', 'DESC');
    expect(builder.limit).toHaveBeenCalledWith(31);
  });

  it('uses limit plus one to report hasMore and return a position for the last item', async () => {
    const rows = [
      eventRow('f0000000-0000-4000-8000-000000000003', occurredAt),
      eventRow('f0000000-0000-4000-8000-000000000002', occurredAt),
      eventRow('f0000000-0000-4000-8000-000000000001', occurredAt),
    ];
    const { service } = createService(rows);

    const page = await service.findUserHistory('user-1', { limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual([
      rows[0].event_id,
      rows[1].event_id,
    ]);
    expect(page.hasMore).toBe(true);
    expect(page.nextPosition).toEqual({
      after: { occurredAt, id: rows[1].event_id },
      anchor: { occurredAt, id: rows[0].event_id },
    });
  });

  it('applies a typed continuation and anchor while preserving the same ordering', async () => {
    const continuation: ActivityHistoryContinuation = {
      after: { occurredAt, id: 'f0000000-0000-4000-8000-000000000002' },
      anchor: { occurredAt, id: 'f0000000-0000-4000-8000-000000000009' },
    };
    const { service, builder } = createService([]);

    await service.findUserHistory('user-1', { continuation });

    expect(builder.andWhere).toHaveBeenCalledWith(
      '(event.occurredAt, event.id) < (:afterOccurredAt, :afterId)',
      {
        afterOccurredAt: occurredAt,
        afterId: continuation.after.id,
      },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      '(event.occurredAt, event.id) <= (:anchorOccurredAt, :anchorId)',
      {
        anchorOccurredAt: occurredAt,
        anchorId: continuation.anchor.id,
      },
    );
    expect(builder.orderBy).toHaveBeenCalledWith('event.occurredAt', 'DESC');
    expect(builder.addOrderBy).toHaveBeenCalledWith('event.id', 'DESC');
  });

  it('combines user, type, local date bounds, normalized text search, and continuation', async () => {
    const continuation: ActivityHistoryContinuation = {
      after: { occurredAt, id: 'event-1' },
      anchor: { occurredAt, id: 'event-9' },
    };
    const { service, builder } = createService([]);

    await service.findUserHistory('user-1', {
      type: 'set',
      from: '2026-03-29',
      to: '2026-03-29',
      timeZone: 'Europe/Madrid',
      query: 'Björk_100%',
      limit: 100,
      continuation,
    });

    expect(builder.andWhere).toHaveBeenCalledWith(
      'event.eventType = :eventType',
      {
        eventType: 'set',
      },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'event.occurredAt >= :fromInstant',
      { fromInstant: new Date('2026-03-28T23:00:00.000Z') },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'event.occurredAt < :toExclusiveInstant',
      { toExclusiveInstant: new Date('2026-03-29T22:00:00.000Z') },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('disc.search_name_normalized LIKE'),
      expect.objectContaining({ activitySearchLegacy0: '%Björk\\_100\\%%' }),
    );
    expect(builder.limit).toHaveBeenCalledWith(101);
    expect(builder.andWhere).toHaveBeenCalledWith(
      '(event.occurredAt, event.id) < (:afterOccurredAt, :afterId)',
      expect.any(Object),
    );
  });

  it('projects disc-associated events and preserves nullable values and incomplete artist or genre relations', async () => {
    const rows = [
      eventRow('event-1', occurredAt, {
        previous_value: null,
        new_value: null,
      }),
      eventRow('event-2', occurredAt, {
        disc_id: 'disc-2',
        disc_name: 'Second record',
        artist_id: null,
        artist_name: null,
        genre_id: null,
        genre_name: null,
      }),
    ];
    const { service, builder } = createService(rows);

    const page = await service.findUserHistory('user-1', { limit: 2 });

    expect(page.items[0]).toMatchObject({
      previousValue: null,
      newValue: null,
      disc: { id: 'disc-1', title: 'Record' },
    });
    expect(page.items[1].disc).toEqual({
      id: 'disc-2',
      title: 'Second record',
      artist: null,
      coverUrl: 'cover.jpg',
      genre: null,
    });
    expect(page.hasMore).toBe(false);
    expect(builder.innerJoin).toHaveBeenCalledTimes(1);
    expect(builder.leftJoin).toHaveBeenCalledTimes(2);
    expect(builder.getRawMany).toHaveBeenCalledTimes(1);
    expect(builder.addSelect).toHaveBeenCalledTimes(11);
  });

  it('projects current disc, artist and genre catalog attributes without extra queries', async () => {
    const { service, builder } = createService([
      eventRow('event-1', occurredAt),
    ]);

    const page = await service.findUserHistory('user-1');

    expect(page.items[0]).toEqual({
      id: 'event-1',
      type: 'change',
      occurredAt,
      previousValue: 6,
      newValue: 8.5,
      disc: {
        id: 'disc-1',
        title: 'Record',
        artist: { id: 'artist-1', name: 'Artist' },
        coverUrl: 'cover.jpg',
        genre: { id: 'genre-1', name: 'Rock' },
      },
    });
    expect(builder.getRawMany).toHaveBeenCalledTimes(1);
    expect(builder.innerJoin.mock.calls).toEqual([
      ['disc', 'disc', 'disc.id = event.disc_id'],
    ]);
    expect(builder.leftJoin.mock.calls).toEqual([
      ['artist', 'artist', 'artist.id = disc."artistId"'],
      ['genre', 'genre', 'genre.id = disc."genreId"'],
    ]);
  });

  it('counts all set events for the local dates on a page in one user-scoped query', async () => {
    const rows = [
      eventRow('event-1', '2026-10-29T23:30:00.000000Z', { event_type: 'set' }),
      eventRow('event-2', '2026-10-28T23:30:00.000000Z', { event_type: 'set' }),
      eventRow('event-3', '2026-10-28T10:00:00.000000Z', {
        event_type: 'change',
      }),
    ];
    const { service, repository, aggregateRows } = createService(rows);
    aggregateRows.push(
      { local_date: '2026-10-30', set_count: '35' },
      { local_date: '2026-10-29', set_count: '11' },
    );

    const page = await service.findUserHistory('user-1', {
      limit: 3,
      timeZone: 'Europe/Madrid',
    });

    expect(page.dailySetCounts).toEqual({
      '2026-10-30': 35,
      '2026-10-29': 11,
      '2026-10-28': 0,
    });
    expect(repository.query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = repository.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain("event_type = 'set'");
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('AT TIME ZONE $2');
    expect(parameters[0]).toBe('user-1');
    expect(parameters[1]).toBe('Europe/Madrid');
    expect(parameters[2]).toEqual(new Date('2026-10-27T23:00:00.000Z'));
    expect(parameters[3]).toEqual(new Date('2026-10-30T23:00:00.000Z'));
    expect(parameters[4]).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
  });

  it('returns zero for days with only changes and keeps totals independent of page boundaries', async () => {
    const { service, aggregateRows } = createService([
      eventRow('event-1', occurredAt, { event_type: 'change' }),
    ]);
    const localDate = '2026-10-29';
    aggregateRows.push({ local_date: localDate, set_count: 4 });

    const firstPage = await service.findUserHistory('user-1', {
      limit: 1,
      timeZone: 'UTC',
    });
    expect(firstPage.dailySetCounts).toEqual({ [localDate]: 4 });
    const nextPage = await service.findUserHistory('user-1', {
      limit: 1,
      timeZone: 'UTC',
      continuation: {
        after: { occurredAt, id: 'event-1' },
        anchor: { occurredAt, id: 'event-9' },
      },
    });
    expect(nextPage.dailySetCounts).toEqual({ [localDate]: 4 });

    const { service: emptyAggregateService } = createService([
      eventRow('event-2', occurredAt, { event_type: 'change' }),
    ]);
    await expect(
      emptyAggregateService.findUserHistory('user-1', { timeZone: 'UTC' }),
    ).resolves.toMatchObject({ dailySetCounts: { [localDate]: 0 } });
  });

  it('counts dates for filtered pages without applying type, search, date-range, cursor or anchor filters to totals', async () => {
    const { service, repository } = createService([
      eventRow('event-1', occurredAt, { event_type: 'change' }),
    ]);
    await service.findUserHistory('user-1', {
      type: 'change',
      query: 'artist',
      from: '2026-10-29',
      to: '2026-10-29',
      timeZone: 'Europe/Madrid',
      limit: 1,
      continuation: {
        after: { occurredAt, id: 'event-0' },
        anchor: { occurredAt, id: 'event-9' },
      },
    });

    const [sql, parameters] = repository.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(parameters[0]).toBe('user-1');
    expect(parameters[1]).toBe('Europe/Madrid');
    expect(parameters[4]).toEqual(['2026-10-29']);
    expect(sql).not.toContain('event_type = $');
    expect(sql).not.toContain('disc');
    expect(sql).toContain('occurred_at >= $3');
    expect(sql).toContain('occurred_at < $4');
    expect(sql).not.toContain('LIMIT');
  });

  it('uses UTC without requiring timeZone and includes legacy set rows regardless of disk association', async () => {
    const { service, repository, aggregateRows } = createService([
      eventRow('event-1', '2026-10-29T00:30:00.000000Z', { event_type: 'set' }),
    ]);
    aggregateRows.push({ local_date: '2026-10-29', set_count: '1' });

    const page = await service.findUserHistory('user-1');

    expect(page.dailySetCounts).toEqual({ '2026-10-29': 1 });
    expect(repository.query.mock.calls[0][1][0]).toBe('user-1');
    expect(repository.query.mock.calls[0][1][1]).toBe('UTC');
    expect(repository.query.mock.calls[0][1][4]).toEqual(['2026-10-29']);
  });

  it('rejects invalid page sizes and returns no continuation for an empty page', async () => {
    const { service } = createService([]);

    await expect(
      service.findUserHistory('user-1', { limit: 101 }),
    ).rejects.toThrow('Limit must be an integer');
    await expect(
      service.findUserHistory('user-1', { limit: 0 }),
    ).rejects.toThrow('Limit must be an integer');
    await expect(
      service.findUserHistory('user-1', { limit: 10 }),
    ).resolves.toEqual({
      items: [],
      hasMore: false,
      nextPosition: null,
      dailySetCounts: {},
    });
  });
});
