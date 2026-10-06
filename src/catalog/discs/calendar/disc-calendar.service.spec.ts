import { Repository } from 'typeorm';
import { User } from '../../../auth/entities/user.entity';
import { Country } from '../../countries/entities/country.entity';
import { Genre } from '../../genres/entities/genre.entity';
import { Disc } from '../entities/disc.entity';
import { DiscCalendarService } from './disc-calendar.service';

describe('DiscCalendarService authenticated calendar query', () => {
  const user = { id: 'user-id' } as User;
  const selectedDiscs: any[] = [];
  let service: DiscCalendarService;
  let queryBuilder: Record<string, jest.Mock>;
  let queryCalls: Array<{ sql: string; parameters?: Record<string, unknown> }>;
  let nationalReleaseQuery: jest.Mock;

  beforeEach(() => {
    queryCalls = [];
    nationalReleaseQuery = jest.fn().mockResolvedValue([]);
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn((sql: string, parameters?: Record<string, unknown>) => {
        queryCalls.push({ sql, parameters });
        return queryBuilder;
      }),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([selectedDiscs, 0]),
    };

    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      manager: { query: nationalReleaseQuery },
    };

    service = new DiscCalendarService(
      repository as unknown as Repository<Disc>,
      {} as Repository<Genre>,
      {} as Repository<Country>,
    );
  });

  const runCalendarQuery = (filters: Record<string, unknown> = {}) =>
    service.findAllByDate(filters as any, user);

  it.each([
    ['query', { query: 'needle' }, '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)', { search: '%needle%' }],
    ['genre', { genre: 'genre-id' }, 'disc.genreId = :genre', { genre: 'genre-id' }],
    ['country name', { country: 'Spain' }, 'country.name = :countryFilter', { countryFilter: 'Spain' }],
    ['country UUID', { countryId: '123e4567-e89b-42d3-a456-426614174000' }, 'country.id = :countryFilter', { countryFilter: '123e4567-e89b-42d3-a456-426614174000' }],
  ])('applies the isolated %s filter', async (_name, filters, expectedSql, expectedParameters) => {
    await runCalendarQuery(filters);

    expect(queryCalls).toContainEqual({ sql: expectedSql, parameters: expectedParameters });
    expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it('prefers country over countryId when both are supplied', async () => {
    await runCalendarQuery({ country: 'Spain', countryId: 'country-id' });

    expect(queryCalls).toContainEqual({
      sql: 'country.name = :countryFilter',
      parameters: { countryFilter: 'Spain' },
    });
    expect(queryCalls).toHaveLength(1);
  });

  it('combines search, genre, country and inclusive date range predicates', async () => {
    const startDate = new Date('2024-01-01T00:00:00.000Z');
    const endDate = new Date('2024-01-31T23:59:59.999Z');
    await runCalendarQuery({ query: 'needle', genre: 'genre-id', countryId: 'country-id', dateRange: [startDate, endDate] });

    expect(queryCalls).toEqual([
      { sql: '(disc.name ILIKE :search OR artist.name_normalized ILIKE :search)', parameters: { search: '%needle%' } },
      { sql: 'disc.genreId = :genre', parameters: { genre: 'genre-id' } },
      { sql: 'country.name = :countryFilter', parameters: { countryFilter: 'country-id' } },
      { sql: 'disc.releaseDate BETWEEN :startDate AND :endDate', parameters: { startDate, endDate } },
    ]);
  });

  it('ignores a dateRange with more than two values', async () => {
    await runCalendarQuery({
      dateRange: [new Date('2024-01-01'), new Date('2024-01-31'), new Date('2024-02-01')],
    });

    expect(queryCalls).toEqual([]);
  });

  it('uses the calendar order, page defaults and an explicit page unchanged', async () => {
    await runCalendarQuery();

    expect(queryBuilder.take).toHaveBeenLastCalledWith(10);
    expect(queryBuilder.skip).toHaveBeenLastCalledWith(0);
    expect(queryBuilder.orderBy).toHaveBeenLastCalledWith('disc.releaseDate', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenLastCalledWith('artist.name', 'ASC');

    jest.clearAllMocks();
    await runCalendarQuery({ limit: 2, offset: 4 });

    expect(queryBuilder.take).toHaveBeenCalledWith(2);
    expect(queryBuilder.skip).toHaveBeenCalledWith(4);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('disc.releaseDate', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('artist.name', 'ASC');
  });

  it('passes page data and total through the same getManyAndCount operation', async () => {
    const disc = {
      id: 'disc-id',
      releaseDate: new Date('2024-01-15T00:00:00.000Z'),
      artist: { country: null },
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [],
    };
    queryBuilder.getManyAndCount.mockResolvedValue([[disc], 3]);

    const result = await runCalendarQuery({ genre: 'genre-id', limit: 1, offset: 1 });

    expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
    expect(queryBuilder.take).toHaveBeenCalledWith(1);
    expect(queryBuilder.skip).toHaveBeenCalledWith(1);
    expect(queryCalls).toContainEqual({ sql: 'disc.genreId = :genre', parameters: { genre: 'genre-id' } });
    expect(result.totalItems).toBe(3);
    expect(result.totalPages).toBe(3);
    expect(result.currentPage).toBe(2);
    expect(result.data).toHaveLength(1);
  });

  it('preserves an empty assignment array and null national release when neither exists', async () => {
    const disc = {
      id: 'disc-without-assignment-or-national-release',
      releaseDate: new Date('2024-01-15T00:00:00.000Z'),
      artist: { country: null },
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [],
    };
    queryBuilder.getManyAndCount.mockResolvedValue([[disc], 1]);

    const result = await runCalendarQuery();
    const mappedDisc = result.data[0].discs[0];

    expect(mappedDisc.asignations).toEqual([]);
    expect(mappedDisc.nationalReleaseId).toBeNull();
    expect(nationalReleaseQuery).toHaveBeenCalledTimes(1);
    expect(nationalReleaseQuery).toHaveBeenCalledWith(
      'SELECT "discId", id FROM national_release WHERE "discId" = ANY($1)',
      [[disc.id]],
    );
  });

  it('preserves a single assignment and associates a national release by disc id', async () => {
    const user = { id: 'assigned-user', username: 'reviewer' };
    const list = { id: 'assigned-list', name: 'January' };
    const assignment = {
      id: 'assignment-1',
      done: true,
      user,
      list,
    };
    const disc = {
      id: 'disc-with-one-assignment',
      releaseDate: new Date('2024-01-15T00:00:00.000Z'),
      artist: { country: null },
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [assignment],
    };
    queryBuilder.getManyAndCount.mockResolvedValue([[disc], 1]);
    nationalReleaseQuery.mockResolvedValue([
      { discId: disc.id, id: 'national-release-1' },
    ]);

    const result = await runCalendarQuery();
    const mappedDisc = result.data[0].discs[0];

    expect(mappedDisc.asignations).toEqual([
      { id: assignment.id, done: true, user, list },
    ]);
    expect(mappedDisc.nationalReleaseId).toBe('national-release-1');
    expect(nationalReleaseQuery).toHaveBeenCalledTimes(1);
  });

  it('loads multiple assignments for the paginated discs with one batch read and no per-disc queries', async () => {
    const firstUser = { id: 'user-1', username: 'one' };
    const secondUser = { id: 'user-2', username: 'two' };
    const firstList = { id: 'list-1', name: 'List one' };
    const secondList = { id: 'list-2', name: 'List two' };
    const firstDisc = {
      id: 'page-disc-1',
      releaseDate: new Date('2024-01-15T00:00:00.000Z'),
      artist: { country: null },
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [
        { id: 'assignment-1', done: false, user: firstUser, list: firstList },
        { id: 'assignment-2', done: true, user: secondUser, list: secondList },
      ],
    };
    const secondDisc = {
      id: 'page-disc-2',
      releaseDate: new Date('2024-01-16T00:00:00.000Z'),
      artist: { country: null },
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [],
    };
    queryBuilder.getManyAndCount.mockResolvedValue([[firstDisc, secondDisc], 7]);
    nationalReleaseQuery.mockResolvedValue([
      { discId: secondDisc.id, id: 'national-release-2' },
    ]);

    const result = await runCalendarQuery({ limit: 2, offset: 4 });
    const mappedDiscs = result.data.flatMap((group) => group.discs);

    expect(mappedDiscs.find((disc) => disc.id === firstDisc.id).asignations).toEqual([
      { id: 'assignment-1', done: false, user: firstUser, list: firstList },
      { id: 'assignment-2', done: true, user: secondUser, list: secondList },
    ]);
    expect(mappedDiscs.find((disc) => disc.id === secondDisc.id).asignations).toEqual([]);
    expect(mappedDiscs.find((disc) => disc.id === firstDisc.id).nationalReleaseId).toBeNull();
    expect(mappedDiscs.find((disc) => disc.id === secondDisc.id).nationalReleaseId).toBe('national-release-2');
    expect(queryBuilder.take).toHaveBeenCalledWith(2);
    expect(queryBuilder.skip).toHaveBeenCalledWith(4);
    expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
    expect(nationalReleaseQuery).toHaveBeenCalledTimes(1);
    expect(nationalReleaseQuery).toHaveBeenCalledWith(
      'SELECT "discId", id FROM national_release WHERE "discId" = ANY($1)',
      [[firstDisc.id, secondDisc.id]],
    );
    expect(queryBuilder.leftJoinAndSelect.mock.calls).toEqual(
      expect.arrayContaining([
        ['disc.asignations', 'asignation'],
        ['asignation.user', 'asignationUser'],
        ['asignation.list', 'asignationList'],
      ]),
    );
  });

  it('does not query national releases for an empty page', async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([[], 3]);

    const result = await runCalendarQuery({ limit: 2, offset: 4 });

    expect(result.data).toEqual([]);
    expect(nationalReleaseQuery).not.toHaveBeenCalled();
  });

  it('preserves the full authenticated calendar payload grouped by date and disc order', async () => {
    const rate = { id: 'rate-b', userId: user.id, rate: 5 };
    const favorite = { id: 'favorite-b', userId: user.id };
    const pending = { id: 'pending-b', userId: user.id };
    const assignmentA = {
      id: 'assignment-a',
      done: false,
      user: { id: 'assigned-user-a', username: 'reviewer-a' },
      list: { id: 'list-a', name: 'January' },
      description: 'not part of the mapped assignment shape',
    };
    const assignmentC = {
      id: 'assignment-c',
      done: true,
      user: { id: 'assigned-user-c', username: 'reviewer-c' },
      list: { id: 'list-c', name: 'February' },
    };
    const artistA = { id: 'artist-a', name: 'Artist A', country: null };
    const artistB = {
      id: 'artist-b',
      name: 'Artist B',
      country: { id: 'country-b', name: 'Spain', isoCode: 'ES' },
    };
    const artistC = { id: 'artist-c', name: 'Artist C', country: null };
    const discA = {
      id: 'disc-a',
      name: 'Album A',
      releaseDate: new Date('2024-05-02T00:00:00.000Z'),
      artist: artistA,
      genre: null,
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [assignmentA],
    };
    const discB = {
      id: 'disc-b',
      name: 'Album B',
      releaseDate: new Date('2024-05-02T00:00:00.000Z'),
      artist: artistB,
      genre: { id: 'genre-b', name: 'Rock' },
      rates: [rate],
      favorites: [favorite],
      pendings: [pending],
      asignations: [],
    };
    const discC = {
      id: 'disc-c',
      name: 'Album C',
      releaseDate: new Date('2024-05-03T00:00:00.000Z'),
      artist: artistC,
      genre: { id: 'genre-c', name: 'Metal' },
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [assignmentC],
    };
    queryBuilder.getManyAndCount.mockResolvedValue([[discA, discB, discC], 9]);
    // Deliberately return auxiliary rows in a different order than the discs.
    nationalReleaseQuery.mockResolvedValue([
      { discId: discC.id, id: 'national-release-c' },
      { discId: discA.id, id: 'national-release-a' },
    ]);

    const result = await runCalendarQuery({ limit: 4, offset: 4 });

    expect(result).toEqual({
      totalItems: 9,
      totalPages: 3,
      currentPage: 2,
      limit: 4,
      data: [
        {
          releaseDate: '2024-05-02',
          discs: [
            {
              ...discA,
              artist: { ...artistA, country: { name: null } },
              userRate: null,
              favoriteId: null,
              pendingId: null,
              nationalReleaseId: 'national-release-a',
              asignations: [
                {
                  id: assignmentA.id,
                  done: assignmentA.done,
                  user: assignmentA.user,
                  list: assignmentA.list,
                },
              ],
            },
            {
              ...discB,
              userRate: rate,
              favoriteId: favorite.id,
              pendingId: pending.id,
              nationalReleaseId: null,
              asignations: [],
            },
          ],
        },
        {
          releaseDate: '2024-05-03',
          discs: [
            {
              ...discC,
              artist: { ...artistC, country: { name: null } },
              userRate: null,
              favoriteId: null,
              pendingId: null,
              nationalReleaseId: 'national-release-c',
              asignations: [
                {
                  id: assignmentC.id,
                  done: assignmentC.done,
                  user: assignmentC.user,
                  list: assignmentC.list,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('preserves the current epoch-date grouping for a disc with a null release date', async () => {
    const disc = {
      id: 'disc-with-null-release-date',
      releaseDate: null,
      artist: { id: 'artist-id', name: 'Artist', country: null },
      genre: null,
      rates: [],
      favorites: [],
      pendings: [],
      asignations: [],
    };
    queryBuilder.getManyAndCount.mockResolvedValue([[disc], 1]);

    const result = await runCalendarQuery();

    expect(result.data[0].releaseDate).toBe('1970-01-01');
    expect(result.data[0].discs[0].id).toBe(disc.id);
  });

  it('does not add the findAll releaseDate cutoff to the calendar query', async () => {
    await runCalendarQuery();

    expect(queryCalls).toEqual([]);
    expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
  });
});

describe('DiscCalendarService public calendar query', () => {
  const countryUuid = '123e4567-e89b-42d3-a456-426614174000';
  let service: DiscCalendarService;
  let queryBuilder: Record<string, jest.Mock>;
  let joins: Array<[string, string]>;
  let queryCalls: Array<{ sql: string; parameters?: Record<string, unknown> }>;
  let selectedDiscs: any[];

  beforeEach(() => {
    joins = [];
    queryCalls = [];
    selectedDiscs = [];
    queryBuilder = {
      leftJoinAndSelect: jest.fn((relation: string, alias: string) => {
        joins.push([relation, alias]);
        return queryBuilder;
      }),
      andWhere: jest.fn((sql: string, parameters?: Record<string, unknown>) => {
        queryCalls.push({ sql, parameters });
        return queryBuilder;
      }),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockImplementation(async () => [selectedDiscs, 0]),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    service = new DiscCalendarService(
      repository as unknown as Repository<Disc>,
      {} as Repository<Genre>,
      {} as Repository<Country>,
    );
  });

  const runPublicCalendarQuery = (filters: Record<string, unknown> = {}) =>
    service.findAllByDatePublic(filters as any);

  it.each([
    ['genre', { genre: 'genre-id' }, 'disc.genreId = :genre', { genre: 'genre-id' }],
    ['country name', { country: 'Spain' }, 'country.name = :countryFilter', { countryFilter: 'Spain' }],
    ['countryId name', { countryId: 'Spain' }, 'country.name = :countryFilter', { countryFilter: 'Spain' }],
    ['country UUID', { country: countryUuid }, 'country.id = :countryFilter', { countryFilter: countryUuid }],
    ['countryId UUID', { countryId: countryUuid }, 'country.id = :countryFilter', { countryFilter: countryUuid }],
  ])('applies the isolated %s filter', async (_name, filters, sql, parameters) => {
    await runPublicCalendarQuery(filters);

    expect(queryCalls).toEqual([{ sql, parameters }]);
    expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it('prefers country over countryId when both are supplied', async () => {
    await runPublicCalendarQuery({ country: 'Spain', countryId: countryUuid });

    expect(queryCalls).toEqual([{
      sql: 'country.name = :countryFilter',
      parameters: { countryFilter: 'Spain' },
    }]);
  });

  it('combines genre, country UUID and inclusive date bounds', async () => {
    const startDate = new Date('2024-01-01T00:00:00.000Z');
    const endDate = new Date('2024-01-31T23:59:59.999Z');

    await runPublicCalendarQuery({
      genre: 'genre-id',
      countryId: countryUuid,
      dateRange: [startDate, endDate],
    });

    expect(queryCalls).toEqual([
      { sql: 'disc.genreId = :genre', parameters: { genre: 'genre-id' } },
      { sql: 'country.id = :countryFilter', parameters: { countryFilter: countryUuid } },
      {
        sql: 'disc.releaseDate BETWEEN :startDate AND :endDate',
        parameters: { startDate, endDate },
      },
    ]);
  });

  it('ignores a dateRange unless it has exactly two values', async () => {
    await runPublicCalendarQuery({
      dateRange: [new Date('2024-01-01'), new Date('2024-01-31'), new Date('2024-02-01')],
    });

    expect(queryCalls).toEqual([]);
  });

  it('keeps only the artist, country and genre joins needed by public filters and mapping', async () => {
    await runPublicCalendarQuery();

    expect(joins).toEqual([
      ['disc.artist', 'artist'],
      ['artist.country', 'country'],
      ['disc.genre', 'genre'],
    ]);
  });

  it('orders by release date and artist, and applies default and explicit pagination', async () => {
    await runPublicCalendarQuery();

    expect(queryBuilder.orderBy).toHaveBeenLastCalledWith('disc.releaseDate', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenLastCalledWith('artist.name', 'ASC');
    expect(queryBuilder.take).toHaveBeenLastCalledWith(10);
    expect(queryBuilder.skip).toHaveBeenLastCalledWith(0);

    await runPublicCalendarQuery({ limit: 2, offset: 4 });

    expect(queryBuilder.take).toHaveBeenLastCalledWith(2);
    expect(queryBuilder.skip).toHaveBeenLastCalledWith(4);
  });

  it('returns the requested page and count from one filtered query without user state or a today cutoff', async () => {
    selectedDiscs = [
      {
        id: 'page-disc-a',
        name: 'Album A',
        image: null,
        releaseDate: new Date('2024-01-15T00:00:00.000Z'),
        ep: false,
        debut: false,
        link: null,
        genre: { id: 'genre-id', name: 'Rock' },
        artist: {
          id: 'artist-a',
          name: 'Artist A',
          image: null,
          country: { id: countryUuid, name: 'Spain' },
        },
      },
      {
        id: 'page-disc-b',
        name: 'Album B',
        image: null,
        releaseDate: new Date('2024-01-16T00:00:00.000Z'),
        ep: false,
        debut: false,
        link: null,
        genre: { id: 'genre-id', name: 'Rock' },
        artist: { id: 'artist-b', name: 'Artist B', image: null, country: null },
      },
    ];
    queryBuilder.getManyAndCount.mockResolvedValue([selectedDiscs, 5]);

    const result = await runPublicCalendarQuery({
      genre: 'genre-id',
      countryId: countryUuid,
      dateRange: [new Date('2024-01-01'), new Date('2024-01-31')],
      limit: 2,
      offset: 2,
      query: 'ignored by the public calendar',
    });

    expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
    expect(queryCalls).toHaveLength(3);
    expect(queryCalls.map(({ sql }) => sql)).toEqual([
      'disc.genreId = :genre',
      'country.id = :countryFilter',
      'disc.releaseDate BETWEEN :startDate AND :endDate',
    ]);
    expect(joins.map(([, alias]) => alias)).not.toEqual(
      expect.arrayContaining(['rate', 'favorite', 'pending', 'asignation', 'comment']),
    );
    expect(result).toMatchObject({
      totalItems: 5,
      totalPages: 3,
      currentPage: 2,
      limit: 2,
    });
    expect(result.data.flatMap((group) => group.discs.map((disc) => disc.id))).toEqual([
      'page-disc-a',
      'page-disc-b',
    ]);
  });

  it('preserves the complete public payload, date grouping and order without exposing entity or user internals', async () => {
    const firstDateDisc = {
      id: 'disc-a',
      name: 'Album A',
      image: null,
      releaseDate: new Date('2025-04-11T00:00:00.000Z'),
      ep: false,
      debut: true,
      link: null,
      description: 'internal description',
      verified: true,
      featured: true,
      pinned: true,
      genre: { id: 'genre-rock', name: 'Rock', color: '#123456' },
      artist: {
        id: 'artist-a',
        name: 'Artist A',
        image: 'artist-a.jpg',
        description: 'internal artist description',
        nameNormalized: 'artist a',
        needsReview: true,
        countryId: countryUuid,
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        country: {
          id: countryUuid,
          name: 'Spain',
          isoCode: 'ES',
          artist: [{ id: 'other-artist' }],
        },
      },
      rates: [{ id: 'rate-internal' }],
      favorites: [{ id: 'favorite-internal' }],
      pendings: [{ id: 'pending-internal' }],
      comments: [{ id: 'comment-internal' }],
      asignations: [{ id: 'asignation-internal' }],
    };
    const secondDateSameDayDisc = {
      id: 'disc-b',
      name: 'Album B',
      image: 'album-b.jpg',
      releaseDate: new Date('2025-04-11T00:00:00.000Z'),
      ep: true,
      debut: false,
      link: 'https://example.test/album-b',
      genre: null,
      artist: {
        id: 'artist-b',
        name: 'Artist B',
        image: null,
        country: null,
      },
    };
    const laterDateDisc = {
      id: 'disc-c',
      name: 'Album C',
      image: 'album-c.jpg',
      releaseDate: new Date('2025-04-12T00:00:00.000Z'),
      ep: false,
      debut: false,
      link: null,
      genre: { id: 'genre-jazz', name: 'Jazz', color: null },
      artist: {
        id: 'artist-c',
        name: 'Artist C',
        image: 'artist-c.jpg',
        country: { id: 'country-us', name: 'United States' },
      },
    };
    selectedDiscs = [firstDateDisc, secondDateSameDayDisc, laterDateDisc];
    queryBuilder.getManyAndCount.mockResolvedValue([selectedDiscs, 3]);

    const result = await runPublicCalendarQuery({ limit: 10, offset: 0 });

    expect(result).toEqual({
      totalItems: 3,
      totalPages: 1,
      currentPage: 1,
      limit: 10,
      data: [
        {
          releaseDate: '2025-04-11',
          discs: [
            {
              id: 'disc-a',
              name: 'Album A',
              image: null,
              releaseDate: firstDateDisc.releaseDate,
              ep: false,
              debut: true,
              link: null,
              genre: { id: 'genre-rock', name: 'Rock', color: '#123456' },
              artist: {
                id: 'artist-a',
                name: 'Artist A',
                image: 'artist-a.jpg',
                country: { id: countryUuid, name: 'Spain' },
              },
            },
            {
              id: 'disc-b',
              name: 'Album B',
              image: 'album-b.jpg',
              releaseDate: secondDateSameDayDisc.releaseDate,
              ep: true,
              debut: false,
              link: 'https://example.test/album-b',
              genre: null,
              artist: {
                id: 'artist-b',
                name: 'Artist B',
                image: null,
                country: null,
              },
            },
          ],
        },
        {
          releaseDate: '2025-04-12',
          discs: [
            {
              id: 'disc-c',
              name: 'Album C',
              image: 'album-c.jpg',
              releaseDate: laterDateDisc.releaseDate,
              ep: false,
              debut: false,
              link: null,
              genre: { id: 'genre-jazz', name: 'Jazz', color: null },
              artist: {
                id: 'artist-c',
                name: 'Artist C',
                image: 'artist-c.jpg',
                country: { id: 'country-us', name: 'United States' },
              },
            },
          ],
        },
      ],
    });
  });

  it('returns an empty data array when the public calendar has no discs', async () => {
    selectedDiscs = [];
    queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await expect(runPublicCalendarQuery()).resolves.toEqual({
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      limit: 10,
      data: [],
    });
  });

  it('preserves the current epoch grouping when a public disc has a null release date', async () => {
    selectedDiscs = [{
      id: 'disc-without-release-date',
      name: 'Undated album',
      image: null,
      releaseDate: null,
      ep: false,
      debut: false,
      link: null,
      genre: null,
      artist: { id: 'artist-id', name: 'Artist', image: null, country: null },
    }];
    queryBuilder.getManyAndCount.mockResolvedValue([selectedDiscs, 1]);

    const result = await runPublicCalendarQuery();

    expect(result.data).toEqual([{
      releaseDate: '1970-01-01',
      discs: [{
        id: 'disc-without-release-date',
        name: 'Undated album',
        image: null,
        releaseDate: null,
        ep: false,
        debut: false,
        link: null,
        genre: null,
        artist: {
          id: 'artist-id',
          name: 'Artist',
          image: null,
          country: null,
        },
      }],
    }]);
  });
});

describe('DiscCalendarService public calendar filters', () => {
  let service: DiscCalendarService;
  let genreQueryBuilder: Record<string, jest.Mock>;
  let countryQueryBuilder: Record<string, jest.Mock>;
  let genreRepository: { createQueryBuilder: jest.Mock };
  let countryRepository: { createQueryBuilder: jest.Mock };

  beforeEach(() => {
    genreQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    countryQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    genreRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(genreQueryBuilder),
    };
    countryRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(countryQueryBuilder),
    };
    service = new DiscCalendarService(
      {} as any,
      genreRepository as unknown as Repository<Genre>,
      countryRepository as unknown as Repository<Country>,
    );
  });

  it('returns empty genre and country sets when no associated entities exist', async () => {
    await expect(service.getPublicFilters()).resolves.toEqual({
      genres: [],
      countries: [],
    });
    expect(genreQueryBuilder.getMany).toHaveBeenCalledTimes(1);
    expect(countryQueryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('selects distinct genres associated with at least one disc in name order', async () => {
    const genres = [
      { id: 'genre-a', name: 'Ambient', color: '#111111' },
      { id: 'genre-b', name: 'Rock', color: '#222222' },
    ];
    genreQueryBuilder.getMany.mockResolvedValue(genres);

    await expect(service.getPublicFilters()).resolves.toMatchObject({ genres });

    expect(genreRepository.createQueryBuilder).toHaveBeenCalledWith('genre');
    expect(genreQueryBuilder.innerJoin).toHaveBeenCalledTimes(1);
    expect(genreQueryBuilder.innerJoin).toHaveBeenCalledWith('genre.disc', 'disc');
    expect(genreQueryBuilder.select).toHaveBeenCalledWith([
      'genre.id',
      'genre.name',
      'genre.color',
    ]);
    expect(genreQueryBuilder.distinct).toHaveBeenCalledWith(true);
    expect(genreQueryBuilder.orderBy).toHaveBeenCalledWith('genre.name', 'ASC');
  });

  it('selects distinct countries with artists and discs in name order', async () => {
    const countries = [
      { id: 'country-a', name: 'Canada', isoCode: 'CA' },
      { id: 'country-b', name: 'Spain', isoCode: 'ES' },
    ];
    countryQueryBuilder.getMany.mockResolvedValue(countries);

    await expect(service.getPublicFilters()).resolves.toMatchObject({ countries });

    expect(countryRepository.createQueryBuilder).toHaveBeenCalledWith('country');
    expect(countryQueryBuilder.innerJoin.mock.calls).toEqual([
      ['country.artist', 'artist'],
      ['artist.disc', 'disc'],
    ]);
    expect(countryQueryBuilder.select).toHaveBeenCalledWith([
      'country.id',
      'country.name',
      'country.isoCode',
    ]);
    expect(countryQueryBuilder.distinct).toHaveBeenCalledWith(true);
    expect(countryQueryBuilder.orderBy).toHaveBeenCalledWith('country.name', 'ASC');
  });

  it('requests DISTINCT for both queries to collapse repeated associations', async () => {
    const genres = [{ id: 'genre-a', name: 'Ambient', color: '#111111' }];
    const countries = [{ id: 'country-a', name: 'Canada', isoCode: 'CA' }];
    genreQueryBuilder.getMany.mockResolvedValue(genres);
    countryQueryBuilder.getMany.mockResolvedValue(countries);

    await expect(service.getPublicFilters()).resolves.toEqual({ genres, countries });

    expect(genreQueryBuilder.distinct).toHaveBeenCalledWith(true);
    expect(countryQueryBuilder.distinct).toHaveBeenCalledWith(true);
  });
});

describe('DiscCalendarService weekly monthly query', () => {
  let service: DiscCalendarService;
  let queryBuilder: Record<string, jest.Mock>;
  let joins: Array<[string, string]>;
  let whereCalls: Array<{ sql: string; parameters: Record<string, unknown> }>;

  beforeEach(() => {
    joins = [];
    whereCalls = [];
    queryBuilder = {
      leftJoinAndSelect: jest.fn((relation: string, alias: string) => {
        joins.push([relation, alias]);
        return queryBuilder;
      }),
      select: jest.fn().mockReturnThis(),
      where: jest.fn((sql: string, parameters: Record<string, unknown>) => {
        whereCalls.push({ sql, parameters });
        return queryBuilder;
      }),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const discRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    service = new DiscCalendarService(
      discRepository as unknown as Repository<Disc>,
      {} as Repository<Genre>,
      {} as Repository<Country>,
    );
  });

  it.each([
    ['normal month', 7, 2025, new Date(2025, 6, 1), new Date(2025, 6, 31, 23, 59, 59, 999)],
    ['leap February', 2, 2024, new Date(2024, 1, 1), new Date(2024, 1, 29, 23, 59, 59, 999)],
  ])('queries the exact inclusive month range for a %s', async (_name, month, year, start, end) => {
    await service.findWeekly(month as number, year as number);

    expect(whereCalls).toEqual([{
      sql: 'disc.releaseDate BETWEEN :start AND :end',
      parameters: { start, end },
    }]);
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('uses month boundaries that exclude dates before and after the month', async () => {
    await service.findWeekly(2, 2024);

    const { start, end } = whereCalls[0].parameters as { start: Date; end: Date };
    const dayBefore = new Date(2024, 0, 31, 23, 59, 59, 999);
    const dayAfter = new Date(2024, 2, 1);

    expect(dayBefore.getTime()).toBeLessThan(start.getTime());
    expect(dayAfter.getTime()).toBeGreaterThan(end.getTime());
    expect(start).toEqual(new Date(2024, 1, 1));
    expect(end).toEqual(new Date(2024, 1, 29, 23, 59, 59, 999));
  });

  it('keeps artist, country and genre joins with only fields consumed by findWeekly', async () => {
    await service.findWeekly(6, 2025);

    expect(joins).toEqual([
      ['disc.artist', 'artist'],
      ['artist.country', 'country'],
      ['disc.genre', 'genre'],
    ]);
    expect(queryBuilder.select).toHaveBeenCalledWith([
      'disc.id',
      'disc.name',
      'disc.image',
      'disc.ep',
      'disc.debut',
      'disc.link',
      'disc.releaseDate',
      'artist.id',
      'artist.name',
      'country.id',
      'country.name',
      'country.isoCode',
      'genre.id',
      'genre.name',
      'genre.color',
    ]);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('disc.releaseDate', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('artist.name', 'ASC');
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('keeps the database query monthly when an optional week is requested', async () => {
    await service.findWeekly(6, 2025, 2);

    expect(whereCalls).toEqual([{
      sql: 'disc.releaseDate BETWEEN :start AND :end',
      parameters: {
        start: new Date(2025, 5, 1),
        end: new Date(2025, 5, 30, 23, 59, 59, 999),
      },
    }]);
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });
});

describe('DiscCalendarService weekly grouping and mapping', () => {
  let service: DiscCalendarService;
  let queryBuilder: Record<string, jest.Mock>;
  let selectedDiscs: any[];

  beforeEach(() => {
    selectedDiscs = [];
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => selectedDiscs),
    };
    const discRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    service = new DiscCalendarService(
      discRepository as unknown as Repository<Disc>,
      {} as Repository<Genre>,
      {} as Repository<Country>,
    );
  });

  it('returns every monthly week with exact labels, payload, stable group order and empty weeks', async () => {
    selectedDiscs = [
      {
        id: 'disc-alpha',
        name: 'Album Alpha',
        releaseDate: new Date('2024-05-01T00:00:00.000Z'),
        artist: { name: 'Alpha', country: { name: 'Spain', isoCode: 'ES' } },
        genre: { name: 'Rock', color: '#aa0000' },
        image: 'alpha.jpg',
        ep: true,
        debut: false,
        link: 'https://example.test/alpha',
      },
      {
        id: 'disc-beta',
        name: 'Album Beta',
        releaseDate: new Date('2024-05-01T00:00:00.000Z'),
        artist: { name: 'Beta', country: null },
        genre: null,
        image: null,
        ep: false,
        debut: true,
        link: null,
      },
      {
        id: 'disc-no-relations',
        name: 'Album Without Relations',
        releaseDate: new Date('2024-05-10T00:00:00.000Z'),
        artist: null,
        genre: null,
        image: undefined,
        ep: null,
        debut: undefined,
        link: undefined,
      },
    ];

    await expect(service.findWeekly(5, 2024)).resolves.toEqual([
      {
        week: 1,
        label: '1-9 may',
        startDate: '2024-05-01',
        endDate: '2024-05-09',
        discs: [
          {
            artistName: 'Alpha',
            countryCode: 'ES',
            countryName: 'Spain',
            name: 'Album Alpha',
            genre: 'Rock',
            genreColor: '#aa0000',
            link: 'https://example.test/alpha',
            ep: true,
            debut: false,
            image: 'alpha.jpg',
            releaseDate: '2024-05-01',
          },
          {
            artistName: 'Beta',
            countryCode: null,
            countryName: null,
            name: 'Album Beta',
            genre: '',
            genreColor: null,
            link: null,
            ep: false,
            debut: true,
            image: null,
            releaseDate: '2024-05-01',
          },
        ],
      },
      {
        week: 2,
        label: '10-16 may',
        startDate: '2024-05-10',
        endDate: '2024-05-16',
        discs: [{
          artistName: '',
          countryCode: null,
          countryName: null,
          name: 'Album Without Relations',
          genre: '',
          genreColor: null,
          link: null,
          ep: false,
          debut: false,
          image: null,
          releaseDate: '2024-05-10',
        }],
      },
      {
        week: 3,
        label: '17-23 may',
        startDate: '2024-05-17',
        endDate: '2024-05-23',
        discs: [],
      },
      {
        week: 4,
        label: '24-30 may',
        startDate: '2024-05-24',
        endDate: '2024-05-30',
        discs: [],
      },
      {
        week: 5,
        label: '31-31 may',
        startDate: '2024-05-31',
        endDate: '2024-05-31',
        discs: [],
      },
    ]);
  });

  it('assigns each exact range boundary to one and only one weekly group', async () => {
    const days = [1, 9, 10, 16, 17, 23, 24, 30, 31];
    selectedDiscs = days.map((day) => ({
      id: `disc-${day}`,
      name: `Album day ${day}`,
      releaseDate: new Date(Date.UTC(2024, 4, day)),
      artist: null,
      genre: null,
    }));

    const weeks = await service.findWeekly(5, 2024);
    const assignedNames = weeks.flatMap((week) => week.discs.map((disc) => disc.name));

    expect(weeks.map(({ week, label }) => [week, label])).toEqual([
      [1, '1-9 may'],
      [2, '10-16 may'],
      [3, '17-23 may'],
      [4, '24-30 may'],
      [5, '31-31 may'],
    ]);
    expect(assignedNames).toEqual(days.map((day) => `Album day ${day}`));
    expect(new Set(assignedNames).size).toBe(days.length);
  });

  it('returns only the requested week while retaining its label and payload', async () => {
    selectedDiscs = [
      {
        id: 'before-week',
        name: 'Outside selected week',
        releaseDate: new Date('2024-05-09T00:00:00.000Z'),
        artist: null,
        genre: null,
      },
      {
        id: 'selected-week',
        name: 'Selected week album',
        releaseDate: new Date('2024-05-12T00:00:00.000Z'),
        artist: { name: 'Band', country: { name: 'Canada', isoCode: 'CA' } },
        genre: { name: 'Jazz', color: null },
        image: 'jazz.jpg',
        ep: false,
        debut: false,
        link: null,
      },
      {
        id: 'after-week',
        name: 'Outside selected week later',
        releaseDate: new Date('2024-05-17T00:00:00.000Z'),
        artist: null,
        genre: null,
      },
    ];

    await expect(service.findWeekly(5, 2024, 2)).resolves.toEqual([{
      week: 2,
      label: '10-16 may',
      startDate: '2024-05-10',
      endDate: '2024-05-16',
      discs: [{
        artistName: 'Band',
        countryCode: 'CA',
        countryName: 'Canada',
        name: 'Selected week album',
        genre: 'Jazz',
        genreColor: null,
        link: null,
        ep: false,
        debut: false,
        image: 'jazz.jpg',
        releaseDate: '2024-05-12',
      }],
    }]);
  });

  it('returns an empty array for a nonexistent week', async () => {
    await expect(service.findWeekly(5, 2024, 99)).resolves.toEqual([]);
  });
});
