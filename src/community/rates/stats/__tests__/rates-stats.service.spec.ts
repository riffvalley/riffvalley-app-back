import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../../../../identity/auth/entities/user.entity';
import { UsersService } from '../../../../identity/users/users.service';
import { Rate } from '../../entities/rate.entity';
import { RatesStatsService } from '../rates-stats.service';

type RawRow = Record<string, string | number | null>;

type StatsQueryBuilderMock = {
  innerJoin: jest.Mock<StatsQueryBuilderMock, [string, string]>;
  select: jest.Mock<StatsQueryBuilderMock, [string, string?]>;
  addSelect: jest.Mock<StatsQueryBuilderMock, [string, string?]>;
  where: jest.Mock<StatsQueryBuilderMock, [string, Record<string, string>]>;
  andWhere: jest.Mock<StatsQueryBuilderMock, [string]>;
  groupBy: jest.Mock<StatsQueryBuilderMock, [string]>;
  addGroupBy: jest.Mock<StatsQueryBuilderMock, [string]>;
  orderBy: jest.Mock<StatsQueryBuilderMock, [string, string]>;
  addOrderBy: jest.Mock<StatsQueryBuilderMock, [string, string]>;
  limit: jest.Mock<StatsQueryBuilderMock, [number]>;
  getRawMany: jest.Mock<Promise<RawRow[]>, []>;
};

const makeQueryBuilder = (rows: RawRow[]): StatsQueryBuilderMock => {
  const builder: StatsQueryBuilderMock = {
    innerJoin: jest.fn<StatsQueryBuilderMock, [string, string]>(),
    select: jest.fn<StatsQueryBuilderMock, [string, string?]>(),
    addSelect: jest.fn<StatsQueryBuilderMock, [string, string?]>(),
    where: jest.fn<StatsQueryBuilderMock, [string, Record<string, string>]>(),
    andWhere: jest.fn<StatsQueryBuilderMock, [string]>(),
    groupBy: jest.fn<StatsQueryBuilderMock, [string]>(),
    addGroupBy: jest.fn<StatsQueryBuilderMock, [string]>(),
    orderBy: jest.fn<StatsQueryBuilderMock, [string, string]>(),
    addOrderBy: jest.fn<StatsQueryBuilderMock, [string, string]>(),
    limit: jest.fn<StatsQueryBuilderMock, [number]>(),
    getRawMany: jest.fn<Promise<RawRow[]>, []>().mockResolvedValue(rows),
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
    builder.limit,
  ]) {
    method.mockReturnValue(builder);
  }
  return builder;
};

describe('RatesStatsService.getHomeInsights', () => {
  const user = Object.assign(new User(), { id: 'user-1' });
  let queryBuilders: StatsQueryBuilderMock[];
  let service: RatesStatsService;

  const createService = (artistRows: RawRow[], countryRows: RawRow[]) => {
    queryBuilders = [
      makeQueryBuilder(artistRows),
      makeQueryBuilder(countryRows),
    ];
    const dataSource = new DataSource({
      type: 'postgres',
      database: 'rates-stats-test',
    });
    const rateRepository = Object.assign(
      new Repository<Rate>(Rate, new EntityManager(dataSource)),
      {
        createQueryBuilder: jest
          .fn<StatsQueryBuilderMock, [string]>()
          .mockReturnValueOnce(queryBuilders[0])
          .mockReturnValueOnce(queryBuilders[1]),
      },
    );
    const usersService = {
      countUsers: jest.fn<Promise<number>, []>().mockResolvedValue(0),
    } satisfies Pick<UsersService, 'countUsers'>;
    service = new RatesStatsService(rateRepository, usersService as never);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty arrays when the user has no numeric ratings', async () => {
    createService([], []);

    await expect(service.getHomeInsights(user)).resolves.toEqual({
      topArtists: [],
      countries: [],
    });
    for (const query of queryBuilders) {
      expect(query.where).toHaveBeenCalledWith('rate.userId = :userId', {
        userId: user.id,
      });
      expect(query.andWhere).toHaveBeenCalledWith('rate.rate IS NOT NULL');
    }
  });

  it('calculates, orders, limits and normalizes top artists', async () => {
    const artistRows = [
      {
        id: 'a',
        name: 'Alpha',
        image: null,
        averageRate: '9.25',
        ratingCount: '2',
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `artist-${index}`,
        name: `Artist ${index}`,
        image: `image-${index}`,
        averageRate: '8.5',
        ratingCount: String(1),
      })),
    ];
    createService(artistRows, []);

    const result = await service.getHomeInsights(user);

    expect(result.topArtists).toHaveLength(7);
    expect(result.topArtists[0]).toEqual({
      id: 'a',
      name: 'Alpha',
      image: '',
      averageRate: 9.25,
      ratingCount: 2,
    });
    const query = queryBuilders[0];
    expect(query.orderBy).toHaveBeenCalledWith('AVG(rate.rate)', 'DESC');
    expect(query.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'COUNT(rate.id)',
      'DESC',
    );
    expect(query.addOrderBy).toHaveBeenNthCalledWith(2, 'artist.name', 'ASC');
    expect(query.limit).toHaveBeenCalledWith(7);
  });

  it('calculates country counts and percentages over all countries before returning the top ten', async () => {
    const countries = Array.from({ length: 12 }, (_, index) => ({
      isoCode: `C${index}`,
      name: `Country ${index}`,
      count: String(12 - index),
    }));
    createService([], countries);

    const result = await service.getHomeInsights(user);

    expect(result.countries).toHaveLength(10);
    expect(result.countries[0]).toEqual({
      isoCode: 'C0',
      name: 'Country 0',
      count: 12,
      percentage: Math.round((12 / 78) * 100),
    });
    expect(result.countries[9]).toMatchObject({ isoCode: 'C9', count: 3 });
    expect(queryBuilders[1].orderBy).toHaveBeenCalledWith(
      'COUNT(rate.id)',
      'DESC',
    );
    expect(queryBuilders[1].andWhere).toHaveBeenCalledWith(
      'country.isoCode IS NOT NULL',
    );
    expect(queryBuilders[1].limit).not.toHaveBeenCalled();
  });

  it('aggregates all of a user’s ratings without applying a 1000 row pagination cap', async () => {
    createService(
      [
        {
          id: 'artist',
          name: 'Artist',
          image: 'image',
          averageRate: '7.5',
          ratingCount: '1205',
        },
      ],
      [{ isoCode: 'ES', name: 'España', count: '1205' }],
    );

    const result = await service.getHomeInsights(user);

    expect(result.topArtists[0].ratingCount).toBe(1205);
    expect(result.countries[0].count).toBe(1205);
    expect(queryBuilders[0].limit).toHaveBeenCalledWith(7); // limits grouped artists, not rating rows
    expect(queryBuilders[1].limit).not.toHaveBeenCalled();
  });
});
