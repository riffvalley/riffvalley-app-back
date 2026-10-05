import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../../auth/entities/user.entity';
import { Disc } from '../entities/disc.entity';
import { DiscCatalogService } from './disc-catalog.service';

describe('DiscCatalogService.findAll', () => {
  let service: DiscCatalogService;
  let queryBuilders: any[];
  let resultEntities: Disc[];
  let rawResult: Record<string, unknown>[];
  let countResult: number;

  beforeEach(() => {
    queryBuilders = [];
    resultEntities = [];
    rawResult = [];
    countResult = 0;
    const repository = {
      createQueryBuilder: jest.fn(() => {
        const builder: any = {};
        for (const method of [
          'leftJoinAndSelect', 'leftJoin', 'addSelect', 'where', 'andWhere',
          'orderBy', 'take', 'skip',
        ]) {
          builder[method] = jest.fn(() => builder);
        }
        builder.addOrderBy = jest.fn((field: string, direction: string) => {
          if (direction !== 'ASC' && direction !== 'DESC') {
            throw new Error('SelectQueryBuilder.addOrderBy accepts only ASC and DESC');
          }
          return builder;
        });
        builder.getRawAndEntities = jest.fn().mockImplementation(() =>
          Promise.resolve({ entities: resultEntities, raw: rawResult }),
        );
        builder.getCount = jest.fn().mockImplementation(() => Promise.resolve(countResult));
        queryBuilders.push(builder);
        return builder;
      }),
    };

    service = new DiscCatalogService(repository as unknown as Repository<Disc>);
  });

  const filtersFor = (builder: (typeof queryBuilders)[number]) =>
    builder.andWhere.mock.calls.map(([condition, parameters]) => ({
      condition,
      parameters,
    }));

  const run = async (filters: Record<string, unknown>) => {
    await service.findAll(filters as any, { id: 'user-id' } as User);
    return queryBuilders;
  };

  const setPageResult = (ids: string[]) => {
    resultEntities = ids.map((id) => ({
      id,
      name: `Disc ${id}`,
      artist: { country: {} },
      rates: [],
      favorites: [],
      pendings: [],
    }) as unknown as Disc);
    rawResult = ids.map((id) => ({
      discId: id,
      averagerate: null,
      averageCover: null,
      rateCount: '0',
      commentCount: '0',
    }));
  };

  const execute = async (filters: Record<string, unknown>) => {
    const builderIndex = queryBuilders.length;
    const response = await service.findAll(filters as any, { id: 'user-id' } as User);
    return { response, builders: queryBuilders.slice(builderIndex) };
  };

  it.each([
    ['first page', 0, 10, 47, 1, 5, 10],
    ['intermediate page', 10, 10, 47, 2, 5, 10],
    ['last page', 40, 10, 47, 5, 5, 7],
    ['empty page after the last item', 50, 10, 47, 6, 5, 0],
  ])('preserves pagination values for the %s', async (_label, offset, limit, total, currentPage, totalPages, pageSize) => {
    countResult = total as number;
    const pageIds = Array.from({ length: pageSize as number }, (_, index) => `disc-${index}`);
    setPageResult(pageIds);

    const { response, builders } = await execute({ offset, limit } as any);

    expect(response).toMatchObject({
      totalItems: total,
      totalPages,
      currentPage,
      limit,
    });
    expect(response.data.map(({ id }) => id)).toEqual(pageIds);
    expect(builders[0].take).toHaveBeenCalledWith(limit);
    expect(builders[0].skip).toHaveBeenCalledWith(offset);
    expect(builders[1].take).not.toHaveBeenCalled();
    expect(builders[1].skip).not.toHaveBeenCalled();
  });

  it('uses limit 10 and offset 0 by default', async () => {
    countResult = 21;

    const { response, builders } = await execute({});

    expect(response).toMatchObject({
      totalItems: 21,
      totalPages: 3,
      currentPage: 1,
      limit: 10,
    });
    expect(builders[0].take).toHaveBeenCalledWith(10);
    expect(builders[0].skip).toHaveBeenCalledWith(0);
  });

  it('returns zero totalPages and currentPage 1 when the filtered set is empty', async () => {
    countResult = 0;
    setPageResult([]);

    const { response } = await execute({});

    expect(response).toEqual({
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      limit: 10,
      data: [],
    });
  });

  it('uses getCount for the total, unaffected by the page size or joined raw rows', async () => {
    countResult = 3;
    setPageResult(['disc-1', 'disc-2']);
    rawResult = [
      ...Array.from({ length: 4 }, () => ({ discId: 'disc-1', averagerate: null, averageCover: null, rateCount: '0', commentCount: '0' })),
      ...Array.from({ length: 3 }, () => ({ discId: 'disc-2', averagerate: null, averageCover: null, rateCount: '0', commentCount: '0' })),
    ];

    const { response, builders } = await execute({ limit: 2, offset: 0 });

    expect(response.totalItems).toBe(3);
    expect(response.totalPages).toBe(2);
    expect(response.data).toHaveLength(2);
    expect(builders[0].take).toHaveBeenCalledWith(2);
    expect(builders[1].getCount).toHaveBeenCalledTimes(1);
    expect(builders[1].leftJoin.mock.calls.map(([relation]) => relation)).toEqual([
      'disc.artist',
      'artist.country',
    ]);
    expect(builders[1].leftJoin.mock.calls.some(([relation]) =>
      ['disc.favorites', 'disc.pendings', 'disc.comments'].includes(relation),
    )).toBe(false);
  });

  it('applies the combined D1 filters identically while leaving count independent of pagination', async () => {
    const filters = {
      query: 'Echo',
      genre: 'genre-id',
      countryId: 'a1234567-89ab-cdef-0123-456789abcdef',
      dateRange: [new Date('2020-01-01T00:00:00.000Z'), new Date('2025-01-01T00:00:00.000Z')],
      voted: 'false',
      votedType: 'cover',
      limit: 7,
      offset: 14,
    };
    countResult = 26;

    const { response, builders } = await execute(filters);

    expect(filtersFor(builders[0])).toEqual(filtersFor(builders[1]));
    expect(builders[1].leftJoin.mock.calls).toContainEqual([
      'disc.rates',
      'rate',
      'rate.userId = :userId',
      { userId: 'user-id' },
    ]);
    expect(response.totalItems).toBe(26);
    expect(response.totalPages).toBe(4);
    expect(response.currentPage).toBe(3);
    expect(builders[0].take).toHaveBeenCalledWith(7);
    expect(builders[0].skip).toHaveBeenCalledWith(14);
    expect(builders[1].take).not.toHaveBeenCalled();
    expect(builders[1].skip).not.toHaveBeenCalled();
  });

  it('applies the averageRate exclusion to data and count so totalItems matches the listable set', async () => {
    countResult = 3;
    setPageResult(['rated-disc-1', 'rated-disc-2']);

    const { response, builders } = await execute({
      query: 'Echo',
      genre: 'genre-id',
      orderBy: 'disc.averageRate:desc',
      limit: 2,
      offset: 0,
    });
    const averageRateFilter = {
      condition: 'EXISTS (SELECT 1 FROM rate r WHERE r."discId" = disc.id AND r.rate IS NOT NULL)',
      parameters: undefined,
    };

    expect(filtersFor(builders[0])).toContainEqual(averageRateFilter);
    expect(filtersFor(builders[1])).toContainEqual(averageRateFilter);
    expect(filtersFor(builders[0])).toEqual(filtersFor(builders[1]));
    expect(response).toMatchObject({
      totalItems: 3,
      totalPages: 2,
      currentPage: 1,
      limit: 2,
    });
    expect(response.data).toHaveLength(2);
  });

  it.each([
    ['disc.releaseDate', 'disc.releaseDate'],
    ['artist.name', 'artist.name'],
    ['disc.createdAt', 'disc.createdAt'],
    ['disc.name', 'disc.name'],
    ['disc.averageRate', 'averagerate'],
  ])('allows ordering by %s', async (field, queryField) => {
    const builders = await run({ orderBy: `${field}:asc` });

    expect(builders[0].addOrderBy).toHaveBeenCalledWith(queryField, 'ASC');
    if (field === 'disc.averageRate') {
      expect(filtersFor(builders[0])).toContainEqual({
        condition: 'EXISTS (SELECT 1 FROM rate r WHERE r."discId" = disc.id AND r.rate IS NOT NULL)',
        parameters: undefined,
      });
    } else {
      expect(filtersFor(builders[0])).toEqual([]);
    }
  });

  it.each(['asc', 'desc'])('normalizes the %s sort direction', async (direction) => {
    const builders = await run({ orderBy: `disc.name:${direction}` });

    expect(builders[0].addOrderBy).toHaveBeenCalledWith('disc.name', direction.toUpperCase());
  });

  it('preserves the default release date and artist order without adding a tie-breaker', async () => {
    const builders = await run({});

    expect(builders[0].orderBy.mock.calls).toEqual([['disc.releaseDate', 'DESC']]);
    expect(builders[0].addOrderBy.mock.calls).toEqual([['artist.name', 'ASC']]);
  });

  it('applies multiple allowed sort criteria in their requested priority order', async () => {
    const builders = await run({ orderBy: 'artist.name:desc,disc.releaseDate:asc,disc.name:desc' });

    expect(builders[0].addOrderBy.mock.calls).toEqual([
      ['artist.name', 'DESC'],
      ['disc.releaseDate', 'ASC'],
      ['disc.name', 'DESC'],
    ]);
    expect(builders[0].orderBy).not.toHaveBeenCalled();
  });

  it('ignores unknown fields and malformed sort criteria without adding SQL order expressions', async () => {
    const builders = await run({
      orderBy: 'disc.password:asc,artist.name,disc.name:,:desc,disc.name:desc',
    });

    expect(builders[0].addOrderBy.mock.calls).toEqual([['disc.name', 'DESC']]);
    expect(builders[0].andWhere).not.toHaveBeenCalled();
  });

  it('retains QueryBuilder validation for unsupported directions', async () => {
    await expect(run({ orderBy: 'disc.name:sideways' })).rejects.toThrow(
      'SelectQueryBuilder.addOrderBy accepts only ASC and DESC',
    );
    expect(queryBuilders[0].addOrderBy).toHaveBeenCalledWith('disc.name', 'SIDEWAYS');
  });

  it('keeps each averageRate sort key but adds its filtering predicate only once', async () => {
    const builders = await run({ orderBy: 'disc.averageRate:asc,disc.name:desc,disc.averageRate:desc' });

    expect(builders[0].addOrderBy.mock.calls).toEqual([
      ['averagerate', 'ASC'],
      ['disc.name', 'DESC'],
      ['averagerate', 'DESC'],
    ]);
    expect(filtersFor(builders[0]).filter(({ condition }) => condition.includes('EXISTS')))
      .toHaveLength(1);
    expect(filtersFor(builders[1]).filter(({ condition }) => condition.includes('EXISTS')))
      .toHaveLength(1);
  });

  it('uses the current ILIKE search expression and wildcard wrapping', async () => {
    const builders = await run({ query: 'Echo_%' });
    const expected = {
      condition: '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)',
      parameters: { search: '%Echo_%%' },
    };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('filters by genre in both result and count queries', async () => {
    const builders = await run({ genre: 'genre-id' });
    const expected = { condition: 'disc.genreId = :genre', parameters: { genre: 'genre-id' } };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it.each([
    ['UUID country', 'a1234567-89ab-cdef-0123-456789abcdef', 'country.id = :countryFilter'],
    ['country name', 'España', 'country.name = :countryFilter'],
  ])('resolves %s using the existing country selector', async (_label, countryFilter, condition) => {
    const builders = await run({ country: countryFilter });
    const expected = { condition, parameters: { countryFilter } };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('prefers country over countryId when both are present', async () => {
    const builders = await run({ country: 'España', countryId: 'a1234567-89ab-cdef-0123-456789abcdef' });

    expect(filtersFor(builders[0])).toContainEqual({
      condition: 'country.name = :countryFilter',
      parameters: { countryFilter: 'España' },
    });
    expect(filtersFor(builders[0]).some(({ parameters }) => parameters?.countryFilter === 'a1234567-89ab-cdef-0123-456789abcdef')).toBe(false);
  });

  it.each([
    ['false', 'rate.rate IS NULL'],
    [false, 'rate.rate IS NULL'],
    ['true', 'rate.rate IS NOT NULL'],
    [true, 'rate.rate IS NOT NULL'],
  ])('preserves voted=%s default rate behavior', async (voted, condition) => {
    const builders = await run({ voted });
    const expected = { condition, parameters: undefined };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it.each([
    ['false', 'cover', 'rate.cover IS NULL'],
    ['true', 'cover', 'rate.cover IS NOT NULL'],
    ['true', 'both', 'rate.rate IS NOT NULL'],
    ['false', 'unexpected', 'rate.rate IS NULL'],
  ])('preserves voted=%s with votedType=%s behavior', async (voted, votedType, condition) => {
    const builders = await run({ voted, votedType });
    const expected = { condition, parameters: undefined };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('uses inclusive BETWEEN bounds for a two-date range in both queries', async () => {
    const startDate = new Date('2024-01-01T00:00:00.000Z');
    const endDate = new Date('2024-12-31T23:59:59.999Z');
    const builders = await run({ dateRange: [startDate, endDate] });
    const expected = {
      condition: 'disc.releaseDate BETWEEN :startDate AND :endDate',
      parameters: { startDate, endDate },
    };

    expect(filtersFor(builders[0])).toContainEqual(expected);
    expect(filtersFor(builders[1])).toContainEqual(expected);
  });

  it('ignores a date range unless it has exactly two values', async () => {
    const builders = await run({ dateRange: [new Date('2024-01-01T00:00:00.000Z')] });

    expect(filtersFor(builders[0]).some(({ condition }) => condition.includes('BETWEEN'))).toBe(false);
    expect(filtersFor(builders[1]).some(({ condition }) => condition.includes('BETWEEN'))).toBe(false);
  });

  it('applies a representative combination identically to results and count', async () => {
    const filters = {
      query: 'Echo',
      genre: 'genre-id',
      countryId: 'a1234567-89ab-cdef-0123-456789abcdef',
      dateRange: [new Date('2020-01-01T00:00:00.000Z'), new Date('2025-01-01T00:00:00.000Z')],
      voted: 'false',
      votedType: 'cover',
    };
    const builders = await run(filters);

    expect(filtersFor(builders[0])).toEqual(filtersFor(builders[1]));
  });

  it('adds no optional filter predicates when values are absent', async () => {
    const builders = await run({});

    expect(filtersFor(builders[0])).toEqual([]);
    expect(filtersFor(builders[1])).toEqual([]);
  });

  it('characterizes the current findAll entity payload and selected relations', async () => {
    const disc = {
      id: 'disc-id',
      name: 'Album',
      description: null,
      artist: {
        id: 'artist-id',
        name: 'Artist',
        country: { id: 'country-id', name: 'Country', isoCode: 'CT' },
      },
      genre: { id: 'genre-id', name: 'Genre' },
      rates: [{ id: 'rate-id', rate: 4, cover: null }],
      favorites: [{ id: 'favorite-id' }],
      pendings: [{ id: 'pending-id' }],
    } as unknown as Disc;
    resultEntities = [disc];
    rawResult = [{ discId: disc.id, averagerate: '4', averageCover: null, commentCount: '2', rateCount: '1' }];

    const result = await service.findAll({} as any, { id: 'user-id' } as User);

    expect(result.data[0]).toEqual({
      ...disc,
      artist: {
        ...disc.artist,
        country: { ...disc.artist.country, name: 'Country' },
      },
      userRate: disc.rates[0],
      averageRate: 4,
      averageCover: null,
      commentCount: 2,
      voteCount: 1,
      favoriteId: 'favorite-id',
      pendingId: 'pending-id',
    });
    expect(queryBuilders[0].leftJoinAndSelect.mock.calls.map(([relation]) => relation)).toEqual([
      'disc.artist',
      'artist.country',
      'disc.genre',
      'disc.rates',
      'disc.favorites',
      'disc.pendings',
    ]);
    expect(queryBuilders[1].leftJoin.mock.calls.map(([relation]) => relation)).toEqual([
      'disc.artist',
      'artist.country',
    ]);
  });

  it('characterizes the complete payload for multiple discs with repeated raw rows', async () => {
    const emptyDisc = {
      id: 'empty-disc-id',
      name: 'Empty Album',
      description: null,
      artist: {
        id: 'artist-without-country-id',
        name: 'Artist without country',
        country: null,
      },
      genre: null,
      rates: [],
      favorites: [],
      pendings: [],
    } as unknown as Disc;
    const ratedDisc = {
      id: 'rated-disc-id',
      name: 'Rated Album',
      description: 'Description',
      artist: {
        id: 'artist-id',
        name: 'Artist',
        country: { id: 'country-id', name: null, isoCode: 'CT' },
      },
      genre: { id: 'genre-id', name: 'Genre' },
      rates: [{ id: 'rate-id', rate: null, cover: 7 }],
      favorites: [{ id: 'favorite-id' }],
      pendings: [{ id: 'pending-id' }],
    } as unknown as Disc;
    resultEntities = [emptyDisc, ratedDisc];
    rawResult = [
      { discId: emptyDisc.id, averagerate: null, averageCover: '0', rateCount: '0', commentCount: '0' },
      { discId: emptyDisc.id, averagerate: null, averageCover: '0', rateCount: '0', commentCount: '0' },
      { discId: ratedDisc.id, averagerate: '4.5', averageCover: null, rateCount: '2', commentCount: '5' },
      { discId: ratedDisc.id, averagerate: '4.5', averageCover: null, rateCount: '2', commentCount: '5' },
    ];

    const result = await service.findAll({} as any, { id: 'user-id' } as User);

    expect(result.data).toEqual([
      {
        ...emptyDisc,
        artist: {
          ...emptyDisc.artist,
          country: { name: null },
        },
        userRate: null,
        averageRate: null,
        averageCover: null,
        commentCount: 0,
        voteCount: 0,
        favoriteId: null,
        pendingId: null,
      },
      {
        ...ratedDisc,
        artist: {
          ...ratedDisc.artist,
          country: { ...ratedDisc.artist.country, name: null },
        },
        userRate: ratedDisc.rates[0],
        averageRate: 4.5,
        averageCover: null,
        commentCount: 5,
        voteCount: 2,
        favoriteId: 'favorite-id',
        pendingId: 'pending-id',
      },
    ]);
    expect(result.data.map(({ id }) => id)).toEqual([emptyDisc.id, ratedDisc.id]);
    expect(result.data.every((disc) => !('discId' in disc))).toBe(true);
  });

  it('defines each findAll aggregate once with its current SQL formula and alias', async () => {
    const builders = await run({});
    const aggregateSelects = builders[0].addSelect.mock.calls.filter(
      ([definition]) => typeof definition === 'function',
    ) as Array<[(subQuery: any) => any, string]>;
    const subqueryCalls = aggregateSelects.map(([definition, alias]) => {
      const calls: unknown[][] = [];
      const subQuery: any = {};
      for (const method of ['select', 'from', 'where']) {
        subQuery[method] = jest.fn((...args: unknown[]) => {
          calls.push([method, ...args]);
          return subQuery;
        });
      }
      definition(subQuery);
      return { alias, calls };
    });

    expect(aggregateSelects.map(([, alias]) => alias)).toEqual([
      'averagerate',
      'averageCover',
      'rateCount',
      'commentCount',
    ]);
    expect(new Set(aggregateSelects.map(([, alias]) => alias)).size).toBe(4);
    expect(builders[0].addSelect).toHaveBeenCalledWith('disc.id', 'discId');
    expect(subqueryCalls).toEqual([
      {
        alias: 'averagerate',
        calls: [
          ['select', 'AVG(rate.rate)', 'averageRate'],
          ['from', 'rate', 'rate'],
          ['where', 'rate.discId = disc.id'],
        ],
      },
      {
        alias: 'averageCover',
        calls: [
          ['select', 'AVG(rate.cover)', 'averageCover'],
          ['from', 'rate', 'rate'],
          ['where', 'rate.discId = disc.id'],
        ],
      },
      {
        alias: 'rateCount',
        calls: [
          ['select', 'COUNT(rate.id)', 'rateCount'],
          ['from', 'rate', 'rate'],
          ['where', 'rate.discId = disc.id AND rate.rate IS NOT NULL'],
        ],
      },
      {
        alias: 'commentCount',
        calls: [
          ['select', 'COUNT(comment.id)', 'commentCount'],
          ['from', 'comment', 'comment'],
          ['where', 'comment.discId = disc.id'],
        ],
      },
    ]);
  });

  it('restricts each selected user relation join to the authenticated user', async () => {
    const builders = await run({});
    const joins = builders[0].leftJoinAndSelect.mock.calls;

    expect(joins).toContainEqual([
      'disc.rates',
      'rate',
      'rate.userId = :userId',
      { userId: 'user-id' },
    ]);
    expect(joins).toContainEqual([
      'disc.favorites',
      'favorite',
      'favorite.userId = :userId',
      { userId: 'user-id' },
    ]);
    expect(joins).toContainEqual([
      'disc.pendings',
      'pending',
      'pending.userId = :userId',
      { userId: 'user-id' },
    ]);
  });

  it('associates each disc with its aggregates when user relation joins produce multiple raw rows', async () => {
    resultEntities = [
      {
        id: 'disc-with-duplicate-state',
        name: 'Album with duplicate user state',
        artist: { country: {} },
        rates: [{ id: 'rate-id', rate: 8, cover: 7 }],
        favorites: [{ id: 'favorite-1' }, { id: 'favorite-2' }],
        pendings: [{ id: 'pending-1' }, { id: 'pending-2' }],
      },
      {
        id: 'next-disc',
        name: 'Next album',
        artist: { country: {} },
        rates: [],
        favorites: [],
        pendings: [],
      },
    ] as unknown as Disc[];
    rawResult = [
      { discId: 'disc-with-duplicate-state', averagerate: '8', averageCover: '7', rateCount: '1', commentCount: '2' },
      { discId: 'disc-with-duplicate-state', averagerate: '8', averageCover: '7', rateCount: '1', commentCount: '2' },
      { discId: 'disc-with-duplicate-state', averagerate: '8', averageCover: '7', rateCount: '1', commentCount: '2' },
      { discId: 'disc-with-duplicate-state', averagerate: '8', averageCover: '7', rateCount: '1', commentCount: '2' },
      { discId: 'next-disc', averagerate: '5.5', averageCover: '6.5', rateCount: '5', commentCount: '3' },
    ];

    const result = await service.findAll({} as any, { id: 'user-id' } as User);

    expect(result.data.map(({ id }) => id)).toEqual([
      'disc-with-duplicate-state',
      'next-disc',
    ]);
    expect(result.data[0]).toMatchObject({
      rates: [{ id: 'rate-id', rate: 8, cover: 7 }],
      favorites: [{ id: 'favorite-1' }, { id: 'favorite-2' }],
      pendings: [{ id: 'pending-1' }, { id: 'pending-2' }],
      userRate: { id: 'rate-id', rate: 8, cover: 7 },
      favoriteId: 'favorite-1',
      pendingId: 'pending-1',
      voteCount: 1,
      commentCount: 2,
    });
    // TypeORM groups joined rows by disc primary key for entities, while raw
    // retains the original, ungrouped row sequence.
    expect(result.data[1]).toMatchObject({
      id: 'next-disc',
      averageRate: 5.5,
      averageCover: 6.5,
      voteCount: 5,
      commentCount: 3,
    });
  });
});

describe('DiscCatalogService.findRandom candidate selection', () => {
  let service: DiscCatalogService;
  let queryBuilders: any[];

  beforeEach(() => {
    queryBuilders = [];
    const repository = {
      createQueryBuilder: jest.fn(() => {
        const builder: any = {};
        for (const method of [
          'select', 'leftJoin', 'leftJoinAndSelect', 'addSelect', 'where', 'andWhere', 'orderBy', 'limit',
        ]) {
          builder[method] = jest.fn(() => builder);
        }
        builder.getRawMany = jest.fn().mockResolvedValue([]);
        builder.getRawAndEntities = jest.fn().mockResolvedValue({ entities: [], raw: [] });
        queryBuilders.push(builder);
        return builder;
      }),
    };

    service = new DiscCatalogService(repository as unknown as Repository<Disc>);
  });

  const run = async (filters: Record<string, unknown> = {}) => {
    const result = await service.findRandom(filters as any, { id: 'user-id' } as User);
    return { result, queryBuilder: queryBuilders[0] };
  };

  it('selects only candidate IDs, applies the current-date cutoff, random order and default limit', async () => {
    const beforeQuery = new Date();
    const { result, queryBuilder } = await run();
    const afterQuery = new Date();

    expect(result).toEqual([]);
    expect(queryBuilders).toHaveLength(1);
    expect(queryBuilder.select).toHaveBeenCalledTimes(1);
    expect(queryBuilder.select).toHaveBeenCalledWith('disc.id', 'id');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'disc.releaseDate <= :today',
      expect.objectContaining({ today: expect.any(Date) }),
    );
    const today = queryBuilder.where.mock.calls[0][1].today as Date;
    expect(today.getTime()).toBeGreaterThanOrEqual(beforeQuery.getTime());
    expect(today.getTime()).toBeLessThanOrEqual(afterQuery.getTime());
    expect(queryBuilder.leftJoin).not.toHaveBeenCalled();
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('RANDOM()');
    expect(queryBuilder.limit).toHaveBeenCalledWith(5);
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('passes only the IDs returned by the candidate query to the following lookup', async () => {
    const selectedIds = ['eligible-disc-1', 'eligible-disc-2'];
    queryBuilders = [];
    const repository = {
      createQueryBuilder: jest.fn(() => {
        const builder: any = {};
        for (const method of [
          'select', 'leftJoin', 'leftJoinAndSelect', 'addSelect', 'where', 'andWhere', 'orderBy', 'limit',
        ]) {
          builder[method] = jest.fn(() => builder);
        }
        builder.getRawMany = jest.fn().mockResolvedValue(selectedIds.map((id) => ({ id })));
        builder.getRawAndEntities = jest.fn().mockResolvedValue({ entities: [], raw: [] });
        queryBuilders.push(builder);
        return builder;
      }),
    };
    service = new DiscCatalogService(repository as unknown as Repository<Disc>);

    await service.findRandom({ limit: 2 } as any, { id: 'user-id' } as User);

    expect(queryBuilders).toHaveLength(2);
    expect(queryBuilders[0].select).toHaveBeenCalledWith('disc.id', 'id');
    expect(queryBuilders[1].where).toHaveBeenCalledWith('disc.id IN (:...randomIds)', {
      randomIds: selectedIds,
    });
  });

  it.each([
    ['genre', { genre: 'genre-id' }, 'disc.genreId = :genre', { genre: 'genre-id' }],
    ['year', { year: 1997 }, 'EXTRACT(YEAR FROM disc.releaseDate) = :year', { year: 1997 }],
    ['ep false', { ep: false }, 'disc.ep = :ep', { ep: false }],
    ['ep true', { ep: true }, 'disc.ep = :ep', { ep: true }],
    ['debut false', { debut: false }, 'disc.debut = :debut', { debut: false }],
    ['debut true', { debut: true }, 'disc.debut = :debut', { debut: true }],
  ])('applies the %s filter to candidate IDs', async (_name, input, condition, parameters) => {
    const { queryBuilder } = await run(input as Record<string, unknown>);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(condition, parameters);
  });

  it.each([
    ['country UUID', 'a1234567-89ab-cdef-0123-456789abcdef', 'country.id = :countryFilter'],
    ['country name', 'España', 'country.name = :countryFilter'],
  ])('joins country tables and filters by %s', async (_name, countryFilter, condition) => {
    const { queryBuilder } = await run({ country: countryFilter });

    expect(queryBuilder.leftJoin.mock.calls).toEqual([
      ['disc.artist', 'artist'],
      ['artist.country', 'country'],
    ]);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(condition, { countryFilter });
  });

  it.each([
    ['countryId UUID', 'a1234567-89ab-cdef-0123-456789abcdef', 'country.id = :countryFilter'],
    ['countryId name', 'España', 'country.name = :countryFilter'],
  ])('supports %s when country is absent', async (_name, countryId, condition) => {
    const { queryBuilder } = await run({ countryId });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(condition, { countryFilter: countryId });
  });

  it('uses country before countryId when both are supplied', async () => {
    const { queryBuilder } = await run({
      country: 'España',
      countryId: 'a1234567-89ab-cdef-0123-456789abcdef',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('country.name = :countryFilter', {
      countryFilter: 'España',
    });
    expect(queryBuilder.andWhere.mock.calls).toHaveLength(1);
  });

  it('applies all provided filters together and preserves the requested limit', async () => {
    const { queryBuilder } = await run({
      genre: 'genre-id',
      countryId: 'a1234567-89ab-cdef-0123-456789abcdef',
      year: 2024,
      ep: false,
      debut: true,
      limit: 12,
    });

    expect(queryBuilder.andWhere.mock.calls).toEqual([
      ['disc.genreId = :genre', { genre: 'genre-id' }],
      ['country.id = :countryFilter', { countryFilter: 'a1234567-89ab-cdef-0123-456789abcdef' }],
      ['EXTRACT(YEAR FROM disc.releaseDate) = :year', { year: 2024 }],
      ['disc.ep = :ep', { ep: false }],
      ['disc.debut = :debut', { debut: true }],
    ]);
    expect(queryBuilder.leftJoin.mock.calls).toEqual([
      ['disc.artist', 'artist'],
      ['artist.country', 'country'],
    ]);
    expect(queryBuilder.limit).toHaveBeenCalledWith(12);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('RANDOM()');
  });

  it('preserves the current truthy guard, so year zero adds no year predicate', async () => {
    const { queryBuilder } = await run({ year: 0 });

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });
});

describe('DiscCatalogService.findOptions', () => {
  let service: DiscCatalogService;
  let queryBuilder: any;
  let rawRows: Record<string, unknown>[];

  beforeEach(() => {
    rawRows = [];
    queryBuilder = {};
    for (const method of [
      'leftJoin', 'where', 'andWhere', 'select', 'addSelect', 'groupBy',
      'addGroupBy', 'orderBy', 'limit',
    ]) {
      queryBuilder[method] = jest.fn(() => queryBuilder);
    }
    queryBuilder.getRawMany = jest.fn(() => Promise.resolve(rawRows));

    const repository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    service = new DiscCatalogService(repository as unknown as Repository<Disc>);
  });

  it.each([
    {
      field: 'country',
      ownFilter: { country: 'country-own' },
      select: ['country.id', 'id'],
      addSelect: [['country.name', 'name'], ['country.isoCode', 'isoCode']],
      groupBy: ['country.id'],
      addGroupBy: ['country.name', 'country.isoCode'],
      rows: [{ id: 'country-id', name: 'Country', isoCode: 'XX' }],
      expected: [{ id: 'country-id', name: 'Country', isoCode: 'XX' }],
      joins: [['disc.artist', 'artist'], ['artist.country', 'country'], ['disc.genre', 'genre']],
      excludedPredicate: 'country.id = :country',
      expectedPredicates: [
        ['genre.id = :genre', { genre: 'genre-id' }],
        ['EXTRACT(YEAR FROM disc.releaseDate) = :year', { year: 1998 }],
        ['disc.ep = :ep', { ep: false }],
        ['disc.debut = :debut', { debut: true }],
      ],
    },
    {
      field: 'genre',
      ownFilter: { genre: 'genre-own' },
      select: ['genre.id', 'id'],
      addSelect: [['genre.name', 'name'], ['genre.color', 'color']],
      groupBy: ['genre.id'],
      addGroupBy: ['genre.name', 'genre.color'],
      rows: [{ id: 'genre-id', name: 'Genre', color: '#123456' }],
      expected: [{ id: 'genre-id', name: 'Genre', color: '#123456' }],
      joins: [['disc.artist', 'artist'], ['artist.country', 'country'], ['disc.genre', 'genre']],
      excludedPredicate: 'genre.id = :genre',
      expectedPredicates: [
        ['country.id = :country', { country: 'country-id' }],
        ['EXTRACT(YEAR FROM disc.releaseDate) = :year', { year: 1998 }],
        ['disc.ep = :ep', { ep: false }],
        ['disc.debut = :debut', { debut: true }],
      ],
    },
    {
      field: 'year',
      ownFilter: { year: 2024 },
      select: ['EXTRACT(YEAR FROM disc.releaseDate)', 'year'],
      addSelect: [],
      groupBy: ['EXTRACT(YEAR FROM disc.releaseDate)'],
      addGroupBy: [],
      rows: [{ year: '1998' }, { year: '2001' }],
      expected: [1998, 2001],
      joins: [['disc.artist', 'artist'], ['artist.country', 'country'], ['disc.genre', 'genre']],
      excludedPredicate: 'EXTRACT(YEAR FROM disc.releaseDate) = :year',
      expectedPredicates: [
        ['country.id = :country', { country: 'country-id' }],
        ['genre.id = :genre', { genre: 'genre-id' }],
        ['disc.ep = :ep', { ep: false }],
        ['disc.debut = :debut', { debut: true }],
      ],
    },
    {
      field: 'ep',
      ownFilter: { ep: true },
      select: ['disc.ep', 'ep'],
      addSelect: [],
      groupBy: ['disc.ep'],
      addGroupBy: [],
      rows: [{ ep: false }, { ep: true }],
      expected: [false, true],
      joins: [['disc.artist', 'artist'], ['artist.country', 'country'], ['disc.genre', 'genre']],
      excludedPredicate: 'disc.ep = :ep',
      expectedPredicates: [
        ['country.id = :country', { country: 'country-id' }],
        ['genre.id = :genre', { genre: 'genre-id' }],
        ['EXTRACT(YEAR FROM disc.releaseDate) = :year', { year: 1998 }],
        ['disc.debut = :debut', { debut: true }],
      ],
    },
    {
      field: 'debut',
      ownFilter: { debut: false },
      select: ['disc.debut', 'debut'],
      addSelect: [],
      groupBy: ['disc.debut'],
      addGroupBy: [],
      rows: [{ debut: false }, { debut: true }],
      expected: [false, true],
      joins: [['disc.artist', 'artist'], ['artist.country', 'country'], ['disc.genre', 'genre']],
      excludedPredicate: 'disc.debut = :debut',
      expectedPredicates: [
        ['country.id = :country', { country: 'country-id' }],
        ['genre.id = :genre', { genre: 'genre-id' }],
        ['EXTRACT(YEAR FROM disc.releaseDate) = :year', { year: 1998 }],
        ['disc.ep = :ep', { ep: false }],
      ],
    },
  ])('groups and converts $field options while applying other selected filters only', async (scenario) => {
    rawRows = scenario.rows;
    const result = await service.findOptions({
      field: scenario.field,
      country: 'country-id',
      genre: 'genre-id',
      year: 1998,
      ep: false,
      debut: true,
      ...scenario.ownFilter,
      limit: 7,
    } as any);

    expect(result).toEqual(scenario.expected);
    expect(queryBuilder.leftJoin.mock.calls).toEqual(scenario.joins);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'disc.releaseDate <= :today',
      { today: expect.any(Date) },
    );
    expect(queryBuilder.andWhere.mock.calls).toEqual([
      ...scenario.expectedPredicates,
      ...(scenario.field === 'country' ? [['country.id IS NOT NULL']] : []),
      ...(scenario.field === 'genre' ? [['genre.id IS NOT NULL']] : []),
      ...(scenario.field === 'ep' ? [['disc.ep IS NOT NULL']] : []),
      ...(scenario.field === 'debut' ? [['disc.debut IS NOT NULL']] : []),
    ]);
    expect(queryBuilder.andWhere.mock.calls.map(([predicate]) => predicate))
      .not.toContain(scenario.excludedPredicate);
    expect(queryBuilder.select.mock.calls).toEqual([scenario.select]);
    expect(queryBuilder.addSelect.mock.calls).toEqual(scenario.addSelect);
    expect(queryBuilder.groupBy.mock.calls).toEqual([scenario.groupBy]);
    expect(queryBuilder.addGroupBy.mock.calls).toEqual(
      scenario.addGroupBy.map((column) => [column]),
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('RANDOM()');
    expect(queryBuilder.limit).toHaveBeenCalledWith(7);
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('uses the default limit and groups years without adding a null exclusion', async () => {
    rawRows = [{ year: null }, { year: '2022' }];

    const result = await service.findOptions({ field: 'year' } as any);

    expect(result).toEqual([0, 2022]);
    expect(queryBuilder.limit).toHaveBeenCalledWith(3);
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('RANDOM()');
    expect(queryBuilder.groupBy).toHaveBeenCalledWith(
      'EXTRACT(YEAR FROM disc.releaseDate)',
    );
  });

  it('does not join relations when asking for scalar options without relation filters', async () => {
    await service.findOptions({ field: 'ep' } as any);

    expect(queryBuilder.leftJoin).not.toHaveBeenCalled();
  });
});

describe('DiscCatalogService.findRandom hydration', () => {
  let service: DiscCatalogService;
  let queryBuilders: any[];
  let selectedIds: string[];
  let hydratedDiscs: Disc[];
  let hydrationRaw: Record<string, unknown>[];

  beforeEach(() => {
    queryBuilders = [];
    selectedIds = [];
    hydratedDiscs = [];
    hydrationRaw = [];
    const repository = {
      createQueryBuilder: jest.fn(() => {
        const builder: any = {};
        for (const method of [
          'select', 'leftJoin', 'leftJoinAndSelect', 'addSelect', 'where', 'andWhere', 'orderBy', 'limit',
        ]) {
          builder[method] = jest.fn(() => builder);
        }
        builder.getRawMany = jest.fn().mockImplementation(() =>
          Promise.resolve(selectedIds.map((id) => ({ id }))),
        );
        builder.getRawAndEntities = jest.fn().mockImplementation(() =>
          Promise.resolve({ entities: hydratedDiscs, raw: hydrationRaw }),
        );
        queryBuilders.push(builder);
        return builder;
      }),
    };

    service = new DiscCatalogService(repository as unknown as Repository<Disc>);
  });

  const createDisc = (
    id: string,
    relations: {
      rates?: Array<{ id: string; rate: number | null; cover: number | null }>;
      favorites?: Array<{ id: string }>;
      pendings?: Array<{ id: string }>;
    } = {},
  ) => ({
    id,
    name: `Album ${id}`,
    artist: {
      id: `artist-${id}`,
      name: `Artist ${id}`,
      country: { id: `country-${id}`, name: `Country ${id}` },
    },
    genre: { id: `genre-${id}`, name: `Genre ${id}` },
    rates: relations.rates ?? [],
    favorites: relations.favorites ?? [],
    pendings: relations.pendings ?? [],
  }) as unknown as Disc;

  const setHydration = (
    ids: string[],
    relations: Parameters<typeof createDisc>[1] = {},
    rawOverrides: Record<string, unknown>[] = [],
  ) => {
    selectedIds = ids;
    hydratedDiscs = ids.map((id) => createDisc(id, relations));
    hydrationRaw = rawOverrides.length
      ? rawOverrides.map((row, index) => ({ discId: ids[index], ...row }))
      : ids.map((id) => ({
        discId: id,
        averagerate: null,
        averageCover: null,
        rateCount: '0',
        commentCount: '0',
      }));
  };

  const run = async () => {
    const result = await service.findRandom({} as any, { id: 'user-id' } as User);
    return { result, builders: queryBuilders };
  };

  it('hydrates a single selected ID with one entity result', async () => {
    setHydration(['disc-1']);

    const { result, builders } = await run();

    expect(builders).toHaveLength(2);
    expect(builders[0].getRawMany).toHaveBeenCalledTimes(1);
    expect(builders[1].where).toHaveBeenCalledWith('disc.id IN (:...randomIds)', {
      randomIds: ['disc-1'],
    });
    expect(builders[1].getRawAndEntities).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result.map(({ id }) => id)).toEqual(['disc-1']);
  });

  it('hydrates multiple selected IDs in one query and returns one entity for each ID', async () => {
    setHydration(['disc-1', 'disc-2', 'disc-3']);

    const { result, builders } = await run();
    const entityIds = result.map(({ id }) => id);

    expect(builders).toHaveLength(2);
    expect(builders[1].getRawAndEntities).toHaveBeenCalledTimes(1);
    expect(builders[1].where).toHaveBeenCalledWith('disc.id IN (:...randomIds)', {
      randomIds: ['disc-1', 'disc-2', 'disc-3'],
    });
    expect(entityIds).toHaveLength(3);
    expect(new Set(entityIds)).toEqual(new Set(['disc-1', 'disc-2', 'disc-3']));
  });

  it('keeps random ID order and maps aggregates by disc ID when joined raw rows repeat', async () => {
    selectedIds = ['disc-a', 'disc-b', 'disc-c'];
    hydratedDiscs = [
      createDisc('disc-c', {
        rates: [{ id: 'rate-c', rate: 6, cover: 5 }],
        favorites: [{ id: 'favorite-c' }],
        pendings: [{ id: 'pending-c' }],
      }),
      createDisc('disc-a', {
        rates: [{ id: 'rate-a', rate: 9, cover: 8 }],
        favorites: [{ id: 'favorite-a' }],
        pendings: [{ id: 'pending-a' }],
      }),
      createDisc('disc-b', {
        rates: [{ id: 'rate-b', rate: 7, cover: 6 }],
        favorites: [{ id: 'favorite-b' }],
        pendings: [{ id: 'pending-b' }],
      }),
    ];
    hydrationRaw = [
      { discId: 'disc-c', averagerate: '6', averageCover: '5', rateCount: '2', commentCount: '3' },
      { discId: 'disc-c', averagerate: '6', averageCover: '5', rateCount: '2', commentCount: '3' },
      { discId: 'disc-a', averagerate: '9', averageCover: '8', rateCount: '4', commentCount: '1' },
      { discId: 'disc-a', averagerate: '9', averageCover: '8', rateCount: '4', commentCount: '1' },
      { discId: 'disc-a', averagerate: '9', averageCover: '8', rateCount: '4', commentCount: '1' },
      { discId: 'disc-b', averagerate: '7', averageCover: '6', rateCount: '5', commentCount: '7' },
    ];

    const { result, builders } = await run();

    expect(result.map(({ id }) => id)).toEqual(['disc-a', 'disc-b', 'disc-c']);
    expect(builders[1].addSelect).toHaveBeenCalledWith('disc.id', 'discId');
    expect(result).toMatchObject([
      {
        id: 'disc-a',
        rates: [{ id: 'rate-a', rate: 9, cover: 8 }],
        favorites: [{ id: 'favorite-a' }],
        pendings: [{ id: 'pending-a' }],
        userRate: { id: 'rate-a', rate: 9, cover: 8 },
        favoriteId: 'favorite-a',
        pendingId: 'pending-a',
        averageRate: 9,
        averageCover: 8,
        voteCount: 4,
        commentCount: 1,
      },
      {
        id: 'disc-b',
        rates: [{ id: 'rate-b', rate: 7, cover: 6 }],
        favorites: [{ id: 'favorite-b' }],
        pendings: [{ id: 'pending-b' }],
        userRate: { id: 'rate-b', rate: 7, cover: 6 },
        favoriteId: 'favorite-b',
        pendingId: 'pending-b',
        averageRate: 7,
        averageCover: 6,
        voteCount: 5,
        commentCount: 7,
      },
      {
        id: 'disc-c',
        rates: [{ id: 'rate-c', rate: 6, cover: 5 }],
        favorites: [{ id: 'favorite-c' }],
        pendings: [{ id: 'pending-c' }],
        userRate: { id: 'rate-c', rate: 6, cover: 5 },
        favoriteId: 'favorite-c',
        pendingId: 'pending-c',
        averageRate: 6,
        averageCover: 5,
        voteCount: 2,
        commentCount: 3,
      },
    ]);
    expect(result.every((disc) => !('discId' in disc))).toBe(true);
  });

  it('uses existing null and zero defaults when a selected disc has no raw aggregate row', async () => {
    selectedIds = ['disc-without-raw', 'disc-with-raw'];
    hydratedDiscs = [
      createDisc('disc-with-raw'),
      createDisc('disc-without-raw', {
        rates: [{ id: 'rate-id', rate: 8, cover: null }],
        favorites: [{ id: 'favorite-id' }],
        pendings: [{ id: 'pending-id' }],
      }),
    ];
    hydrationRaw = [{
      discId: 'disc-with-raw',
      averagerate: '4',
      averageCover: '3',
      rateCount: '1',
      commentCount: '2',
    }];

    const { result } = await run();

    expect(result.map(({ id }) => id)).toEqual(['disc-without-raw', 'disc-with-raw']);
    expect(result[0]).toMatchObject({
      rates: [{ id: 'rate-id', rate: 8, cover: null }],
      favorites: [{ id: 'favorite-id' }],
      pendings: [{ id: 'pending-id' }],
      userRate: { id: 'rate-id', rate: 8, cover: null },
      favoriteId: 'favorite-id',
      pendingId: 'pending-id',
      averageRate: null,
      averageCover: null,
      voteCount: 0,
      commentCount: 0,
    });
  });

  it('returns null averages and zero counts when no ratings or comments exist', async () => {
    setHydration(['disc-no-votes'], {}, [{
      averagerate: null,
      averageCover: null,
      rateCount: '0',
      commentCount: '0',
    }]);

    const { result } = await run();

    expect(result[0]).toMatchObject({
      averageRate: null,
      averageCover: null,
      voteCount: 0,
      commentCount: 0,
    });
  });

  it('preserves the current rate and comment aggregate values', async () => {
    setHydration(['disc-with-votes'], {}, [{
      averagerate: '6.666666666666667',
      averageCover: '7.25',
      rateCount: '3',
      commentCount: '4',
    }]);

    const { result } = await run();

    expect(result[0]).toMatchObject({
      averageRate: 6.666666666666667,
      averageCover: 7.25,
      voteCount: 3,
      commentCount: 4,
    });
  });

  it.each([
    [
      'no user state',
      { rates: [], favorites: [], pendings: [] },
      { userRate: null, favoriteId: null, pendingId: null },
    ],
    [
      'rate only',
      { rates: [{ id: 'rate-id', rate: 8.5, cover: null }], favorites: [], pendings: [] },
      { userRate: { id: 'rate-id', rate: 8.5, cover: null }, favoriteId: null, pendingId: null },
    ],
    [
      'favorite only',
      { rates: [], favorites: [{ id: 'favorite-id' }], pendings: [] },
      { userRate: null, favoriteId: 'favorite-id', pendingId: null },
    ],
    [
      'pending only',
      { rates: [], favorites: [], pendings: [{ id: 'pending-id' }] },
      { userRate: null, favoriteId: null, pendingId: 'pending-id' },
    ],
    [
      'all user relations',
      {
        rates: [{ id: 'rate-id', rate: 8.5, cover: 7.25 }],
        favorites: [{ id: 'favorite-id' }],
        pendings: [{ id: 'pending-id' }],
      },
      {
        userRate: { id: 'rate-id', rate: 8.5, cover: 7.25 },
        favoriteId: 'favorite-id',
        pendingId: 'pending-id',
      },
    ],
  ])('hydrates %s for the current user', async (_label, entityRelations, derivedState) => {
    setHydration(['disc-state'], entityRelations as any);

    const { result, builders } = await run();
    const joins = builders[1].leftJoinAndSelect.mock.calls;

    expect(result[0]).toMatchObject({ ...entityRelations, ...derivedState });
    expect(joins).toContainEqual([
      'disc.rates', 'rate', 'rate.userId = :userId', { userId: 'user-id' },
    ]);
    expect(joins).toContainEqual([
      'disc.favorites', 'favorite', 'favorite.userId = :userId', { userId: 'user-id' },
    ]);
    expect(joins).toContainEqual([
      'disc.pendings', 'pending', 'pending.userId = :userId', { userId: 'user-id' },
    ]);
  });

  it('selects artist, country and genre and defines each aggregate once without loading comments', async () => {
    setHydration(['disc-1']);

    const { result, builders } = await run();
    const joins = builders[1].leftJoinAndSelect.mock.calls;
    const aggregateSelects = builders[1].addSelect.mock.calls
      .filter(([definition]: [unknown]) => typeof definition === 'function');
    const aggregateQueries = aggregateSelects.map(([definition, alias]: [any, string]) => {
      const calls: unknown[][] = [];
      const subQuery: any = {};
      for (const method of ['select', 'from', 'where']) {
        subQuery[method] = jest.fn((...args: unknown[]) => {
          calls.push([method, ...args]);
          return subQuery;
        });
      }
      definition(subQuery);
      return { alias, calls };
    });

    expect(joins.map(([relation]) => relation)).toEqual([
      'disc.artist', 'artist.country', 'disc.genre',
      'disc.rates', 'disc.favorites', 'disc.pendings',
    ]);
    expect(joins.some(([relation]) => relation === 'disc.comments')).toBe(false);
    expect(result[0]).not.toHaveProperty('comments');
    expect(aggregateSelects.map(([, alias]) => alias)).toEqual([
      'averagerate', 'averageCover', 'rateCount', 'commentCount',
    ]);
    expect(aggregateSelects).toHaveLength(4);
    expect(aggregateQueries).toEqual([
      {
        alias: 'averagerate',
        calls: [
          ['select', 'AVG(rate.rate)', 'averageRate'],
          ['from', 'rate', 'rate'],
          ['where', 'rate.discId = disc.id'],
        ],
      },
      {
        alias: 'averageCover',
        calls: [
          ['select', 'AVG(rate.cover)', 'averageCover'],
          ['from', 'rate', 'rate'],
          ['where', 'rate.discId = disc.id'],
        ],
      },
      {
        alias: 'rateCount',
        calls: [
          ['select', 'COUNT(rate.id)', 'rateCount'],
          ['from', 'rate', 'rate'],
          ['where', 'rate.discId = disc.id AND rate.rate IS NOT NULL'],
        ],
      },
      {
        alias: 'commentCount',
        calls: [
          ['select', 'COUNT(comment.id)', 'commentCount'],
          ['from', 'comment', 'comment'],
          ['where', 'comment.discId = disc.id'],
        ],
      },
    ]);
  });
});


describe('DiscCatalogService.findOne', () => {
  let service: DiscCatalogService;
  let discRepository: { findOneOrFail: jest.Mock };

  beforeEach(() => {
    discRepository = { findOneOrFail: jest.fn() };
    service = new DiscCatalogService(
      discRepository as unknown as Repository<Disc>,
    );
  });

  it('returns the complete detail payload, including eager relations, unchanged', async () => {
    const disc = {
      id: 'disc-id',
      name: 'Album',
      description: 'Description',
      image: 'https://images.test/album.jpg',
      verified: true,
      ep: false,
      debut: true,
      link: 'https://album.test',
      releaseDate: new Date('2024-01-02T00:00:00.000Z'),
      featured: false,
      pinned: true,
      artist: {
        id: 'artist-id',
        name: 'Artist',
        nameNormalized: 'artist',
        description: null,
        image: null,
        countryId: 'country-id',
        needsReview: false,
        updatedAt: new Date('2024-01-03T00:00:00.000Z'),
        country: { id: 'country-id', name: 'Country', isoCode: 'CT' },
      },
      genre: { id: 'genre-id', name: 'Genre', color: '#123456' },
      favorites: [
        {
          id: 'favorite-id',
          createdAt: new Date('2024-01-04T00:00:00.000Z'),
          editedAt: null,
          user: {
            id: 'user-id',
            username: 'fan',
            isActive: true,
            image: null,
            dashboardConfig: null,
            mobileDashboardConfig: null,
            dashboardButtonsEnabled: false,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            notes: null,
            lastLogin: null,
          },
        },
        {
          id: 'favorite-other-user-id',
          createdAt: new Date('2024-01-07T00:00:00.000Z'),
          editedAt: null,
          user: {
            id: 'other-user-id',
            username: 'another-fan',
            isActive: true,
            image: null,
            dashboardConfig: null,
            mobileDashboardConfig: null,
            dashboardButtonsEnabled: false,
            createdAt: new Date('2024-01-02T00:00:00.000Z'),
            notes: null,
            lastLogin: null,
          },
        },
      ],
      pendings: [
        {
          id: 'pending-id',
          createdAt: new Date('2024-01-05T00:00:00.000Z'),
          editedAt: null,
          user: {
            id: 'user-id',
            username: 'fan',
            isActive: true,
            image: null,
            dashboardConfig: null,
            mobileDashboardConfig: null,
            dashboardButtonsEnabled: false,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            notes: null,
            lastLogin: null,
          },
        },
        {
          id: 'pending-other-user-id',
          createdAt: new Date('2024-01-08T00:00:00.000Z'),
          editedAt: null,
          user: {
            id: 'other-user-id',
            username: 'another-fan',
            isActive: true,
            image: null,
            dashboardConfig: null,
            mobileDashboardConfig: null,
            dashboardButtonsEnabled: false,
            createdAt: new Date('2024-01-02T00:00:00.000Z'),
            notes: null,
            lastLogin: null,
          },
        },
      ],
      comments: [
        {
          id: 'comment-id',
          comment: 'Great',
          isDeleted: false,
          createdAt: new Date('2024-01-06T00:00:00.000Z'),
          editedAt: null,
          user: {
            id: 'user-id',
            username: 'fan',
            isActive: true,
            image: null,
            dashboardConfig: null,
            mobileDashboardConfig: null,
            dashboardButtonsEnabled: false,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            notes: null,
            lastLogin: null,
          },
        },
        {
          id: 'comment-other-user-id',
          comment: 'Another listener agrees',
          isDeleted: false,
          createdAt: new Date('2024-01-09T00:00:00.000Z'),
          editedAt: null,
          user: {
            id: 'other-user-id',
            username: 'another-fan',
            isActive: true,
            image: null,
            dashboardConfig: null,
            mobileDashboardConfig: null,
            dashboardButtonsEnabled: false,
            createdAt: new Date('2024-01-02T00:00:00.000Z'),
            notes: null,
            lastLogin: null,
          },
        },
      ],
    } as unknown as Disc;
    discRepository.findOneOrFail.mockResolvedValue(disc);

    await expect(service.findOne(disc.id)).resolves.toEqual(disc);
    expect(discRepository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: disc.id },
      relations: {
        artist: { country: true },
        genre: true,
        favorites: { user: true },
        pendings: { user: true },
        comments: { user: true },
      },
    });
    expect(discRepository.findOneOrFail).toHaveBeenCalledTimes(1);
  });

  it('preserves null and empty optional relations in the detail payload', async () => {
    const disc = {
      id: 'disc-id',
      name: 'Album',
      artist: null,
      genre: null,
      favorites: [],
      pendings: [],
      comments: [],
    } as unknown as Disc;
    discRepository.findOneOrFail.mockResolvedValue(disc);

    await expect(service.findOne(disc.id)).resolves.toEqual(disc);
    expect(discRepository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: disc.id },
      relations: {
        artist: { country: true },
        genre: true,
        favorites: { user: true },
        pendings: { user: true },
        comments: { user: true },
      },
    });
  });

  it('maps an absent disc to the current 404 status and message', async () => {
    discRepository.findOneOrFail.mockRejectedValue(new Error('missing'));

    try {
      await service.findOne('missing-id');
      throw new Error('Expected findOne to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
      expect((error as NotFoundException).getResponse()).toEqual({
        message: 'Disc with id missing-id not found',
        error: 'Not Found',
        statusCode: 404,
      });
    }
    expect(discRepository.findOneOrFail).toHaveBeenCalledTimes(1);
  });

  it('currently maps repository failures to the same 404 detail error', async () => {
    discRepository.findOneOrFail.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(service.findOne('disc-id')).rejects.toMatchObject({
      status: 404,
      response: {
        message: 'Disc with id disc-id not found',
        error: 'Not Found',
        statusCode: 404,
      },
    });
  });
});
