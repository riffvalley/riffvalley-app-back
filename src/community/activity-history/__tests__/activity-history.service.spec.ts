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
  disc_id: string | null;
  disc_name: string | null;
  disc_image: string | null;
  artist_id: string | null;
  artist_name: string | null;
  genre_id: string | null;
  genre_name: string | null;
};

type HistoryQueryBuilderMock = {
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
  const repository = Object.assign(
    new Repository<RateVoteEvent>(
      RateVoteEvent,
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'history-test' }),
      ),
    ),
    {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    },
  );
  return { service: new ActivityHistoryService(repository), builder };
}

describe('ActivityHistoryService', () => {
  const occurredAt = '2026-10-29T12:00:00.000000Z';

  it('requires the user in the base predicate and orders by timestamp then UUID descending', async () => {
    const { service, builder } = createService([]);

    const page = await service.findUserHistory('user-1');

    expect(page).toEqual({ items: [], hasMore: false, nextPosition: null });
    expect(builder.where).toHaveBeenCalledWith('event.userId = :userId', {
      userId: 'user-1',
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      "event.eventType IN ('set', 'change')",
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

  it('projects catalog fields once and preserves legacy nulls and deleted discs', async () => {
    const rows = [
      eventRow('event-1', occurredAt, {
        previous_value: null,
        new_value: null,
        disc_id: null,
        disc_name: null,
        disc_image: null,
        artist_id: null,
        artist_name: null,
        genre_id: null,
        genre_name: null,
      }),
      eventRow('event-2', occurredAt, {
        disc_id: 'deleted-disc',
        disc_name: null,
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
      disc: null,
    });
    expect(page.items[1].disc).toEqual({
      id: 'deleted-disc',
      title: null,
      artist: null,
      coverUrl: 'cover.jpg',
      genre: null,
    });
    expect(page.hasMore).toBe(false);
    expect(builder.leftJoin).toHaveBeenCalledTimes(3);
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
    expect(builder.leftJoin.mock.calls).toEqual([
      ['disc', 'disc', 'disc.id = event.disc_id'],
      ['artist', 'artist', 'artist.id = disc."artistId"'],
      ['genre', 'genre', 'genre.id = disc."genreId"'],
    ]);
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
    });
  });
});
