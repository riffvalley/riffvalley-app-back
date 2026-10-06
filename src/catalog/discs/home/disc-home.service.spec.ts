import { DiscHomeService } from './disc-home.service';

const USER_ID = '00000000-0000-4000-8000-000000000001';

function makeService(responses: (sql: string) => unknown[]) {
  const query = jest.fn(async (sql: string) => responses(sql));
  const service = new DiscHomeService(
    { query } as any,
  );
  return { service, query };
}

function classifyQuery(sql: string) {
  if (sql.includes('AS "globalAvgRate"')) return 'global';
  if (sql.includes('AS "weightedScore"')) return 'discs';
  if (sql.includes('AS "totalDiscs"')) return 'totals';
  if (sql.includes('AS "rateCount"')) return 'rates';
  if (sql.includes('AS "coverCount"')) return 'covers';
  if (sql.includes('AS "rateValue"')) return 'distribution';
  throw new Error(`Unexpected Home SQL query: ${sql}`);
}

describe('findTopRatedOrFeaturedAndStats response', () => {
  it('passes the D30 filters and binds to both Home queries with the existing order and types', async () => {
    const today = new Date('2026-10-04T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(today);
    const queries: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('AVG(avgRates)')) {
        return [{ globalAvgRate: '4.25', medianVotes: '3' }];
      }
      return [];
    });
    const service = new DiscHomeService({ query } as any);

    try {
      await service.findTopRatedOrFeaturedAndStats(
        {
          dateRange: ['2020-01-01', '2024-12-31'],
          country: '123e4567-e89b-12d3-a456-426614174000',
          countryId: 'ignored-country-id',
        } as any,
        { id: USER_ID } as any,
        'genre-23',
      );

      const globalQuery = queries.find(({ sql }) => sql.includes('AVG(avgRates)'))!;
      const mainQuery = queries.find(({ sql }) => sql.includes('AS "weightedScore"'))!;
      expect(globalQuery.sql).toContain(
        'WHERE d."releaseDate" BETWEEN $1 AND $2 AND d."releaseDate" <= $3 AND d."genreId" = $4 AND c.id = $5',
      );
      expect(mainQuery.sql).toContain(
        'WHERE d."releaseDate" BETWEEN $2 AND $3 AND d."releaseDate" <= $4 AND d."genreId" = $5 AND c.id = $6',
      );
      expect(globalQuery.params).toEqual([
        new Date('2020-01-01'),
        new Date('2024-12-31'),
        today,
        'genre-23',
        '123e4567-e89b-12d3-a456-426614174000',
      ]);
      expect(mainQuery.params).toEqual([
        USER_ID,
        new Date('2020-01-01'),
        new Date('2024-12-31'),
        today,
        'genre-23',
        '123e4567-e89b-12d3-a456-426614174000',
      ]);
      expect(globalQuery.params.slice(0, 3).every((value) => value instanceof Date)).toBe(true);
      expect(typeof globalQuery.params[3]).toBe('string');
      expect(typeof globalQuery.params[4]).toBe('string');
      expect(mainQuery.params[0]).toBe(USER_ID);
      expect(mainQuery.params.slice(1).map((value) => typeof value)).toEqual([
        'object',
        'object',
        'object',
        'string',
        'string',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('combines every result into the complete established envelope for multiple discs', async () => {
    const discRows = [
      {
        id: 'disc-1',
        name: 'Album One',
        releaseDate: new Date('2024-03-01T00:00:00.000Z'),
        description: 'First',
        image: 'one.jpg',
        verified: true,
        ep: false,
        debut: true,
        link: null,
        featured: true,
        pinned: false,
        artistId: 'artist-1',
        genreId: 'genre-1',
        artistName: 'Artist One',
        countryId: 'country-1',
        countryName: 'Country One',
        countryIsoCode: 'C1',
        genreName: 'Rock',
        genreColor: '#123456',
        voteCount: '2',
        averageRate: '4.25',
        averageCover: '3.50',
        userRateId: 'rate-1',
        userFavoriteId: 'favorite-1',
        pendingId: 'pending-1',
        userRate: '4.5',
        userCover: '3.5',
        commentCount: '7',
        weightedScore: '4.1',
      },
      {
        id: 'disc-2',
        name: 'Album Two',
        releaseDate: null,
        description: null,
        image: null,
        verified: false,
        ep: false,
        debut: false,
        link: null,
        featured: false,
        pinned: true,
        artistId: null,
        genreId: null,
        artistName: null,
        countryId: null,
        countryName: null,
        countryIsoCode: null,
        genreName: null,
        genreColor: null,
        voteCount: '0',
        averageRate: null,
        averageCover: null,
        userRateId: null,
        userFavoriteId: null,
        pendingId: null,
        userRate: null,
        userCover: null,
        commentCount: null,
        weightedScore: '0',
      },
    ];
    const rawResults: Record<string, unknown[]> = {
      global: [{ globalAvgRate: '3.75', medianVotes: 2 }],
      discs: discRows,
      totals: [{ totalDiscs: '18', totalVotes: '42' }],
      rates: [{ userId: USER_ID, username: 'Ada', rateCount: '9' }],
      covers: [{ userId: USER_ID, username: 'Ada', coverCount: '6' }],
      distribution: [
        { rateValue: '3.5', count: '4' },
        { rateValue: '4.5', count: '2' },
      ],
    };
    const { service, query } = makeService((sql) => rawResults[classifyQuery(sql)]);

    const response = await service.findTopRatedOrFeaturedAndStats(
      {} as any,
      { id: USER_ID } as any,
    );

    expect(Object.keys(response)).toEqual([
      'discs',
      'totalDiscs',
      'totalVotes',
      'topUsersByRates',
      'topUsersByCover',
      'ratingDistribution',
    ]);
    expect(response).toEqual({
      discs: [
        {
          ...discRows[0],
          artist: {
            name: 'Artist One',
            country: { id: 'country-1', name: 'Country One', isoCode: 'C1' },
          },
          genre: { name: 'Rock', color: '#123456' },
          userRate: { id: 'rate-1', rate: 4.5, cover: 3.5 },
          favoriteId: 'favorite-1',
          pendingId: 'pending-1',
          averageRate: 4.25,
          averageCover: 3.5,
          voteCount: 2,
          commentCount: 7,
        },
        {
          ...discRows[1],
          artist: {
            name: null,
            country: { id: null, name: null, isoCode: null },
          },
          genre: { name: null, color: null },
          userRate: null,
          favoriteId: null,
          pendingId: null,
          averageRate: 0,
          averageCover: 0,
          voteCount: 0,
          commentCount: 0,
        },
      ],
      totalDiscs: 18,
      totalVotes: 42,
      topUsersByRates: [
        { user: { id: USER_ID, username: 'Ada' }, rateCount: 9 },
      ],
      topUsersByCover: [
        { user: { id: USER_ID, username: 'Ada' }, totalCover: 6 },
      ],
      ratingDistribution: [
        { rate: 3.5, count: 4 },
        { rate: 4.5, count: 2 },
      ],
    });
    expect(typeof response.totalDiscs).toBe('number');
    expect(typeof response.totalVotes).toBe('number');
    expect(typeof response.ratingDistribution[0].rate).toBe('number');
    expect(typeof response.ratingDistribution[0].count).toBe('number');
    expect(query).toHaveBeenCalledTimes(6);

    // Aliases from the old disc row remain observable through its spread.
    expect(response.discs[0]).toHaveProperty('weightedScore', '4.1');
    expect(response.discs[0]).toHaveProperty('artistName', 'Artist One');
    // Aliases belonging to extracted statistics are mapped to payload names.
    expect(response.topUsersByRates[0]).not.toHaveProperty('userId');
    expect(response.topUsersByCover[0]).not.toHaveProperty('coverCount');
    expect(response.ratingDistribution[0]).not.toHaveProperty('rateValue');
    expect(response).not.toHaveProperty('globalAvgRate');
    expect(response).not.toHaveProperty('medianVotes');
    expect(response.discs[0]).not.toHaveProperty('comments');
    const discQuery = query.mock.calls.find(([sql]) =>
      sql.includes('AS "weightedScore"'),
    )?.[0] as string;
    expect(discQuery).toContain(
      '(SELECT COUNT(c.id) FROM comment c WHERE c."discId" = d.id) AS "commentCount"',
    );
    expect(discQuery).not.toMatch(/JOIN\s+comment\b/i);
  });

  it('returns empty arrays and zero totals when every query has no rows', async () => {
    const { service } = makeService(() => []);

    await expect(
      service.findTopRatedOrFeaturedAndStats({} as any, { id: USER_ID } as any),
    ).resolves.toEqual({
      discs: [],
      totalDiscs: 0,
      totalVotes: 0,
      topUsersByRates: [],
      topUsersByCover: [],
      ratingDistribution: [],
    });
  });

  it('keeps partial subresults independent and applies the existing statistic defaults', async () => {
    const partialDisc = {
      id: 'disc-3',
      name: 'Only Album',
      artistName: 'Artist',
      countryId: null,
      countryName: null,
      countryIsoCode: null,
      genreName: 'Jazz',
      genreColor: 'black',
      userRateId: null,
      userFavoriteId: null,
      pendingId: null,
      userRate: null,
      userCover: null,
      averageRate: '0',
      averageCover: null,
      voteCount: '0',
      commentCount: '0',
      weightedScore: '0',
    };
    const { service } = makeService((sql) => {
      switch (classifyQuery(sql)) {
        case 'global': return [{ globalAvgRate: null, medianVotes: null }];
        case 'discs': return [partialDisc];
        case 'totals': return [{ totalDiscs: null, totalVotes: '0' }];
        case 'rates': return [{ userId: USER_ID, username: 'Bea', rateCount: '1' }];
        default: return [];
      }
    });

    const response = await service.findTopRatedOrFeaturedAndStats(
      {} as any,
      { id: USER_ID } as any,
    );

    expect(response).toEqual({
      discs: [
        {
          ...partialDisc,
          artist: { name: 'Artist', country: { id: null, name: null, isoCode: null } },
          genre: { name: 'Jazz', color: 'black' },
          userRate: null,
          favoriteId: null,
          pendingId: null,
          averageRate: 0,
          averageCover: 0,
          voteCount: 0,
          commentCount: 0,
        },
      ],
      totalDiscs: 0,
      totalVotes: 0,
      topUsersByRates: [
        { user: { id: USER_ID, username: 'Bea' }, rateCount: 1 },
      ],
      topUsersByCover: [],
      ratingDistribution: [],
    });
  });
});
