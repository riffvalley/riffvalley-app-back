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

type HomeInsightsGeographyRow = {
  totalRatedDiscs: number | string;
  mappedDiscs: number | string;
  countryCount: number | string;
  isoCode: string | null;
  countryName: string | null;
  discCount: number | string | null;
};

describe('RatesStatsService geography and home insights', () => {
  const user = Object.assign(new User(), { id: 'user-1' });
  let queryBuilders: StatsQueryBuilderMock[];
  let service: RatesStatsService;
  let geographyQuery: jest.Mock<
    Promise<HomeInsightsGeographyRow[]>,
    [string, unknown[]]
  >;

  const createService = (
    artistRows: RawRow[],
    geographyRows: HomeInsightsGeographyRow[],
  ) => {
    queryBuilders = [makeQueryBuilder(artistRows)];
    const dataSource = new DataSource({
      type: 'postgres',
      database: 'rates-stats-test',
    });
    geographyQuery = jest
      .fn<Promise<HomeInsightsGeographyRow[]>, [string, unknown[]]>()
      .mockResolvedValue(geographyRows);
    const rateRepository = Object.assign(
      new Repository<Rate>(Rate, new EntityManager(dataSource)),
      {
        createQueryBuilder: jest
          .fn<StatsQueryBuilderMock, [string]>()
          .mockReturnValue(queryBuilders[0]),
        query: geographyQuery,
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

  const row = (
    isoCode: string | null,
    countryName: string | null,
    discCount: number | string | null,
    totals = { totalRatedDiscs: 78, mappedDiscs: 78, countryCount: 12 },
  ): HomeInsightsGeographyRow => ({
    ...totals,
    isoCode,
    countryName,
    discCount,
  });

  const twelveCountries = (): HomeInsightsGeographyRow[] =>
    [
      ['US', 'United States', 12],
      ['GB', 'United Kingdom', 11],
      ['ES', 'Spain', 10],
      ['FR', 'France', 9],
      ['DE', 'Germany', 8],
      ['JP', 'Japan', 7],
      ['SE', 'Sweden', 6],
      ['CA', 'Canada', 5],
      ['BR', 'Brazil', 4],
      ['AU', 'Australia', 3],
      ['IT', 'Italy', 2],
      ['NO', 'Norway', 1],
    ].map(([isoCode, name, count]) =>
      row(String(isoCode), String(name), Number(count)),
    );

  it('returns the original empty home-insights shape and zero artist insights', async () => {
    createService(
      [],
      [
        row(null, null, null, {
          totalRatedDiscs: 0,
          mappedDiscs: 0,
          countryCount: 0,
        }),
      ],
    );

    await expect(service.getHomeInsights(user)).resolves.toEqual({
      topArtists: [],
      countries: [],
    });
    expect(queryBuilders[0].where).toHaveBeenCalledWith(
      'rate.userId = :userId',
      { userId: user.id },
    );
    expect(queryBuilders[0].andWhere).toHaveBeenCalledWith(
      'rate.rate IS NOT NULL',
    );
    expect(geographyQuery.mock.calls[0][1]).toEqual([user.id, 10]);
  });

  it('preserves the existing topArtists payload and ranking limit', async () => {
    const artistRows = [
      {
        id: 'a',
        name: 'Alpha',
        image: null,
        averageRate: '9.25',
        ratingCount: '2',
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: 'artist-' + index,
        name: 'Artist ' + index,
        image: 'image-' + index,
        averageRate: '8.5',
        ratingCount: String(1),
      })),
    ];
    createService(artistRows, [
      row('DE', 'Germany', 3, {
        totalRatedDiscs: 3,
        mappedDiscs: 3,
        countryCount: 1,
      }),
    ]);

    const result = await service.getHomeInsights(user);

    expect(result.countries).toEqual([
      {
        isoCode: 'DE',
        name: 'Germany',
        count: 3,
        percentage: 100,
      },
    ]);
    expect(result.topArtists).toHaveLength(7);
    expect(result.topArtists[0]).toEqual({
      id: 'a',
      name: 'Alpha',
      image: '',
      averageRate: 9.25,
      ratingCount: 2,
    });
    expect(queryBuilders[0].limit).toHaveBeenCalledWith(7);
  });

  it('returns only ten aggregated countries for Top 10 with SQL limit and precise percentages', async () => {
    createService([], twelveCountries().slice(0, 10));

    const result = await service.getGeographyTop(user);

    expect(result.countries).toHaveLength(10);
    expect(result.countries[0]).toEqual({
      isoCode: 'US',
      name: 'United States',
      count: 12,
      percentage: 15.38,
    });
    const [sql, parameters] = geographyQuery.mock.calls[0];
    expect(parameters).toEqual([user.id, 10]);
    expect(sql).toContain('GROUP BY "isoCode"');
    expect(sql).toContain('ORDER BY "discCount" DESC, "isoCode" ASC');
    expect(sql).toContain('LIMIT $2');
    expect(sql).toContain('COUNT(DISTINCT "discId")');
    expect(sql).toContain('rate."userId" = $1');
    expect(sql).toContain('rate.rate IS NOT NULL');
    expect(sql).toContain('UPPER(country."isoCode")');
    expect(sql).not.toContain('rate.rate > 0');
    expect(sql).not.toContain('rate_vote_events');
  });

  it('returns the complete world distribution and aggregate totals', async () => {
    createService([], twelveCountries());

    const result = await service.getGeographyWorld(user);

    expect(result).toEqual({
      totalRatedDiscs: 78,
      mappedDiscs: 78,
      unmappedDiscs: 0,
      countryCount: 12,
      countries: expect.arrayContaining([
        expect.objectContaining({
          isoCode: 'US',
          name: 'United States',
          count: 12,
        }),
        expect.objectContaining({ isoCode: 'NO', count: 1 }),
      ]),
    });
    expect(result.countries).toHaveLength(12);
    const [sql, parameters] = geographyQuery.mock.calls[0];
    expect(parameters).toEqual([user.id]);
    expect(sql).not.toContain('LIMIT $2');
  });

  it('reports null and invalid country codes as unmapped without name-based matching', async () => {
    const totals = { totalRatedDiscs: 5, mappedDiscs: 3, countryCount: 2 };
    createService(
      [],
      [
        row('SE', 'Sweden', 2, totals),
        row('JP', 'Japan', 1, totals),
        row(null, null, null, totals),
      ],
    );

    const result = await service.getGeographyWorld(user);

    expect(result).toMatchObject({
      totalRatedDiscs: 5,
      mappedDiscs: 3,
      unmappedDiscs: 2,
      countryCount: 2,
    });
    expect(result.countries.map(({ isoCode }) => isoCode)).toEqual([
      'SE',
      'JP',
    ]);
  });

  it('uses the same SQL aggregation for Top 10 and World', async () => {
    createService([], twelveCountries().slice(0, 10));
    const top = await service.getGeographyTop(user);
    const topSql = geographyQuery.mock.calls[0][0];

    geographyQuery.mockResolvedValueOnce(twelveCountries());
    const world = await service.getGeographyWorld(user);
    const worldSql = geographyQuery.mock.calls[1][0];

    expect(top.countries.slice(0, 10).map(({ isoCode }) => isoCode)).toEqual(
      world.countries.slice(0, 10).map(({ isoCode }) => isoCode),
    );
    expect(topSql).toContain('WITH rated_discs AS');
    expect(worldSql).toContain('WITH rated_discs AS');
    expect(topSql).toContain('LIMIT $2');
    expect(worldSql).not.toContain('LIMIT $2');
  });

  it('keeps unmapped discs in total counts and guards optional artist/country joins', async () => {
    const totals = { totalRatedDiscs: 5, mappedDiscs: 3, countryCount: 2 };
    createService(
      [],
      [
        row('SE', 'Sweden', 2, totals),
        row('JP', 'Japan', 1, totals),
        row(null, null, null, totals),
      ],
    );

    const result = await service.getGeographyWorld(user);
    const sql = geographyQuery.mock.calls[0][0];

    expect(result.totalRatedDiscs).toBe(5);
    expect(result.mappedDiscs + result.unmappedDiscs).toBe(
      result.totalRatedDiscs,
    );
    expect(sql).toContain('LEFT JOIN artist');
    expect(sql).toContain('LEFT JOIN country');
    expect(sql).toContain('COUNT(DISTINCT "discId")');
  });
});
