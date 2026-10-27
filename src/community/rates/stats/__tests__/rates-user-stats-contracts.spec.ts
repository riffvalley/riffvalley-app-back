import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from 'src/identity/auth/entities/user.entity';
import { Rate } from '../../entities/rate.entity';
import { RatesStatsService } from '../rates-stats.service';

type RawStatsRow = Record<string, string | number | null>;

function createBuilder(
  options: {
    count?: number;
    rawMany?: RawStatsRow[];
    rawOne?: RawStatsRow | undefined;
  } = {},
) {
  const builder = {
    innerJoin: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    addGroupBy: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    having: jest.fn(),
    getCount: jest.fn().mockResolvedValue(options.count ?? 0),
    getRawMany: jest.fn().mockResolvedValue(options.rawMany ?? []),
    getRawOne: jest.fn().mockResolvedValue(options.rawOne),
  };
  for (const method of [
    builder.innerJoin,
    builder.select,
    builder.addSelect,
    builder.where,
    builder.andWhere,
    builder.groupBy,
    builder.addGroupBy,
    builder.orderBy,
    builder.addOrderBy,
    builder.having,
  ]) {
    method.mockReturnValue(builder);
  }
  return builder;
}

describe('RatesStatsService restored statistics contracts', () => {
  const user = Object.assign(new User(), { id: 'session-user-id' });

  it('adds disc insights without removing or changing the existing stats fields', async () => {
    const builders = [
      createBuilder({ count: 2 }),
      createBuilder({ rawMany: [{ genre: 'Metal', count: '2' }] }),
      createBuilder({
        rawMany: [
          { month: 'January   ', month_num: '1', week: '1', count: '2' },
        ],
      }),
      createBuilder({ rawOne: { mean: '8.5', median: '8' } }),
      createBuilder({ rawMany: [{ score: '8.5', count: '2' }] }),
      createBuilder({ rawMany: [] }),
    ];
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('PARTITION BY genre.id')) {
        return Promise.resolve([
          {
            genreName: 'Metal',
            monthName: null,
            discId: 'disc-1',
            discName: 'Album',
            discImage: null,
            rate: '9.5',
            artistName: 'Band',
            genreColor: null,
          },
        ]);
      }
      if (sql.includes('PARTITION BY EXTRACT(MONTH')) {
        return Promise.resolve([
          {
            genreName: 'Metal',
            monthName: 'January',
            discId: 'disc-1',
            discName: 'Album',
            discImage: null,
            rate: '9.5',
            artistName: 'Band',
            genreColor: null,
          },
        ]);
      }
      if (sql.includes('communityAverage')) {
        return Promise.resolve([
          {
            genreName: 'Metal',
            monthName: null,
            discId: 'disc-1',
            discName: 'Album',
            discImage: null,
            rate: '9.5',
            artistName: 'Band',
            genreColor: null,
            userRate: '9.5',
            communityAverage: '7.5',
          },
        ]);
      }
      if (sql.includes('TO_CHAR(rate."createdAt", \'YYYY-MM-DD\')')) {
        return Promise.resolve([{ date: '2026-01-03', count: 2 }]);
      }
      if (sql.includes('currentVotes')) {
        return Promise.resolve([
          {
            currentVotes: 2,
            currentMean: '8.5',
            previousVotes: 1,
            previousMean: '7.5',
          },
        ]);
      }
      return Promise.resolve([
        {
          genreName: 'Metal',
          monthName: null,
          discId: 'disc-1',
          discName: 'Album',
          discImage: null,
          rate: '9.5',
          artistName: 'Band',
          genreColor: null,
        },
      ]);
    });
    const repository = Object.assign(
      new Repository<Rate>(
        Rate,
        new EntityManager(
          new DataSource({
            type: 'postgres',
            database: 'rates-stats-contracts',
          }),
        ),
      ),
      {
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(builders[0])
          .mockReturnValueOnce(builders[1])
          .mockReturnValueOnce(builders[2])
          .mockReturnValueOnce(builders[3])
          .mockReturnValueOnce(builders[4])
          .mockReturnValueOnce(builders[5]),
        query,
      },
    );
    const usersService = { countUsers: jest.fn().mockResolvedValue(12) };
    const service = new RatesStatsService(repository, usersService as never);

    const result = await service.getUserStats(user);

    expect(result).toMatchObject({
      totalVotes: 2,
      mean: '8.50',
      median: 8,
      votesByGenre: [
        {
          genre: 'Metal',
          count: 2,
          topDisc: {
            id: 'disc-1',
            rate: 9.5,
            artist: { name: 'Band' },
            genre: { name: 'Metal', color: null },
          },
        },
      ],
      votesByMonth: [
        {
          month: 'January',
          count: 2,
          weeks: [{ week: '1', count: 2 }],
          topDisc: { id: 'disc-1', rate: 9.5 },
        },
      ],
      votesByScore: [
        { score: 0, count: 0 },
        { score: 1, count: 0 },
        { score: 2, count: 0 },
        { score: 3, count: 0 },
        { score: 4, count: 0 },
        { score: 5, count: 0 },
        { score: 6, count: 0 },
        { score: 7, count: 0 },
        { score: 8, count: 2 },
        { score: 9, count: 0 },
        { score: 10, count: 0 },
      ],
      totalUsers: 12,
      rank: 1,
      topDiscOverall: { id: 'disc-1', rate: 9.5 },
      mostControversial: [{ id: 'disc-1', diff: 2 }],
      votesByDay: [{ date: '2026-01-03', count: 2 }],
      yearOverYear: {
        current: { votes: 2, mean: 8.5 },
        previous: { votes: 1, mean: 7.5 },
      },
    });
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining([
        'totalVotes',
        'mean',
        'median',
        'votesByGenre',
        'votesByMonth',
        'votesByScore',
        'totalUsers',
        'rank',
        'topDiscOverall',
        'mostControversial',
        'votesByDay',
        'yearOverYear',
      ]),
    );
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls.every((call) => call[1][0] === user.id)).toBe(true);
  });

  it('returns the existing rated-disc projection and binds session identity and year', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 'disc-1',
        name: 'Album',
        rate: '8.5',
        artistName: 'Band',
        genreName: 'Metal',
        genreColor: '#123456',
      },
    ]);
    const repository = Object.assign(
      new Repository<Rate>(
        Rate,
        new EntityManager(
          new DataSource({
            type: 'postgres',
            database: 'rates-discs-contract',
          }),
        ),
      ),
      { query },
    );
    const service = new RatesStatsService(repository, {
      countUsers: jest.fn(),
    } as never);

    await expect(service.getUserRatedDiscs(user, '2024')).resolves.toEqual([
      {
        id: 'disc-1',
        name: 'Album',
        rate: 8.5,
        artist: { name: 'Band' },
        genre: { name: 'Metal', color: '#123456' },
      },
    ]);
    expect(query.mock.calls[0][1]).toEqual([user.id, '2024']);
    expect(query.mock.calls[0][0]).toContain('rate."userId" = $1');
    expect(query.mock.calls[0][0]).toContain(
      `TO_CHAR(disc."releaseDate", 'YYYY') = $2`,
    );
  });
});
