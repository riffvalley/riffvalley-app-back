import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DataSource,
  DeepPartial,
  DeleteResult,
  EntityManager,
  FindOneOptions,
  getMetadataArgsStorage,
  Repository,
} from 'typeorm';
import { Disc } from '../../../catalog/discs/entities/disc.entity';
import { User } from '../../../identity/auth/entities/user.entity';
import { PaginationDto } from '../../../platform/common/dtos/pagination.dto';
import { CreateRateDto } from '../dto/create-rates.dto';
import { UpdateRateDto } from '../dto/update-rates.dto';
import { Rate } from '../entities/rate.entity';
import { RatesService } from '../rates.service';

type RateQueryBuilderMock = {
  leftJoinAndSelect: jest.Mock<RateQueryBuilderMock, [string, string]>;
  leftJoin: jest.Mock<
    RateQueryBuilderMock,
    [unknown, string, string?, Record<string, string>?]
  >;
  addSelect: jest.Mock<
    RateQueryBuilderMock,
    [string | ((query: SubQueryBuilderMock) => SubQueryBuilderMock), string?]
  >;
  where: jest.Mock<RateQueryBuilderMock, [string, Record<string, string>?]>;
  andWhere: jest.Mock<RateQueryBuilderMock, [string, Record<string, string>?]>;
  take: jest.Mock<RateQueryBuilderMock, [number]>;
  skip: jest.Mock<RateQueryBuilderMock, [number]>;
  orderBy: jest.Mock<
    RateQueryBuilderMock,
    [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
  >;
  addOrderBy: jest.Mock<
    RateQueryBuilderMock,
    [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
  >;
  getRawAndEntities: jest.Mock<
    Promise<{ entities: Rate[]; raw: Array<Record<string, string | null>> }>,
    []
  >;
  getCount: jest.Mock<Promise<number>, []>;
};

type SubQueryBuilderMock = {
  select: jest.Mock<SubQueryBuilderMock, [string, string?]>;
  from: jest.Mock<SubQueryBuilderMock, [string, string]>;
  where: jest.Mock<SubQueryBuilderMock, [string]>;
};

function createRepositoryMock<T extends object>(
  overrides: T,
): Repository<Rate> & T {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'rates-test',
  });
  const repository = new Repository<Rate>(Rate, new EntityManager(dataSource));
  return Object.assign(repository, overrides);
}

function createDisc(id = 'disc-1'): Disc {
  return Object.assign(new Disc(), { id });
}

function createUser(id = 'user-1'): User {
  return Object.assign(new User(), { id });
}

function createRateDto(values: Partial<CreateRateDto>): CreateRateDto {
  return Object.assign(new CreateRateDto(), values);
}

function createUpdateRateDto(values: Partial<UpdateRateDto>): UpdateRateDto {
  return Object.assign(new UpdateRateDto(), values);
}

function createQueryBuilder(): RateQueryBuilderMock {
  const query: RateQueryBuilderMock = {
    leftJoinAndSelect: jest.fn<RateQueryBuilderMock, [string, string]>(),
    leftJoin: jest.fn<
      RateQueryBuilderMock,
      [unknown, string, string?, Record<string, string>?]
    >(),
    addSelect: jest.fn<
      RateQueryBuilderMock,
      [string | ((query: SubQueryBuilderMock) => SubQueryBuilderMock), string?]
    >(),
    where: jest.fn<RateQueryBuilderMock, [string, Record<string, string>?]>(),
    andWhere: jest.fn<
      RateQueryBuilderMock,
      [string, Record<string, string>?]
    >(),
    take: jest.fn<RateQueryBuilderMock, [number]>(),
    skip: jest.fn<RateQueryBuilderMock, [number]>(),
    orderBy: jest.fn<
      RateQueryBuilderMock,
      [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
    >(),
    addOrderBy: jest.fn<
      RateQueryBuilderMock,
      [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
    >(),
    getRawAndEntities: jest.fn<
      Promise<{ entities: Rate[]; raw: Array<Record<string, string | null>> }>,
      []
    >(),
    getCount: jest.fn<Promise<number>, []>(),
  };
  for (const method of [
    query.leftJoinAndSelect,
    query.leftJoin,
    query.addSelect,
    query.where,
    query.andWhere,
    query.take,
    query.skip,
    query.orderBy,
    query.addOrderBy,
  ]) {
    method.mockReturnValue(query);
  }
  return query;
}

function createSubQueryBuilder(): SubQueryBuilderMock {
  const query: SubQueryBuilderMock = {
    select: jest.fn<SubQueryBuilderMock, [string, string?]>(),
    from: jest.fn<SubQueryBuilderMock, [string, string]>(),
    where: jest.fn<SubQueryBuilderMock, [string]>(),
  };
  query.select.mockReturnValue(query);
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

describe('RatesService characterization', () => {
  const user = createUser();
  const disc = createDisc();

  it('creates a rate with the authenticated user and resolved disc', async () => {
    const createdRate = Object.assign(new Rate(), {
      id: 'rate-1',
      rate: 8,
      cover: 7,
      user,
      disc,
    });
    const manager = Object.assign(
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'rates-test' }),
      ),
      {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, FindOneOptions<Disc>]>()
          .mockResolvedValue(disc),
      },
    );
    const repository = createRepositoryMock({
      manager,
      findOne: jest
        .fn<Promise<Rate | null>, [FindOneOptions<Rate>]>()
        .mockResolvedValue(null),
      create: jest.fn<Rate, [DeepPartial<Rate>]>().mockReturnValue(createdRate),
      save: jest.fn<Promise<Rate>, [Rate]>().mockResolvedValue(createdRate),
    });
    const service = new RatesService(repository);

    await expect(
      service.create(
        createRateDto({ discId: disc.id, rate: 8, cover: 7 }),
        user,
      ),
    ).resolves.toBe(createdRate);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { user: { id: user.id }, disc: { id: disc.id } },
    });
    expect(repository.create).toHaveBeenCalledWith({
      rate: 8,
      cover: 7,
      user,
      disc,
    });
    expect(repository.save).toHaveBeenCalledWith(createdRate);
  });

  it('returns 404 for a missing Disc, keeps duplicates at 400, and masks unexpected errors as 500', async () => {
    const missingDiscManager = Object.assign(
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'rates-test' }),
      ),
      {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, FindOneOptions<Disc>]>()
          .mockResolvedValue(null),
      },
    );
    const missingDiscService = new RatesService(
      createRepositoryMock({ manager: missingDiscManager }),
    );
    await expect(
      missingDiscService.create(
        createRateDto({ discId: 'missing-disc', rate: 8 }),
        user,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const manager = Object.assign(
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'rates-test' }),
      ),
      {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, FindOneOptions<Disc>]>()
          .mockResolvedValue(disc),
      },
    );
    const repository = createRepositoryMock({
      manager,
      findOne: jest
        .fn<Promise<Rate | null>, [FindOneOptions<Rate>]>()
        .mockResolvedValue(null),
      create: jest.fn<Rate, [DeepPartial<Rate>]>().mockReturnValue(new Rate()),
      save: jest
        .fn<Promise<Rate>, [Rate]>()
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key value' })
        .mockRejectedValueOnce(new Error('private database details')),
    });
    const service = new RatesService(repository);
    await expect(
      service.create(createRateDto({ discId: disc.id, rate: 8 }), user),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(createRateDto({ discId: disc.id, rate: 8 }), user),
    ).rejects.toMatchObject({
      status: 500,
      response: { message: 'An unexpected error occurred' },
    });
  });

  it('returns 404 when reading rates for a missing Disc', async () => {
    const manager = Object.assign(
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'rates-test' }),
      ),
      {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, FindOneOptions<Disc>]>()
          .mockResolvedValue(null),
      },
    );
    const service = new RatesService(createRepositoryMock({ manager }));

    await expect(service.findRatesByDisc('missing-disc')).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it('returns the direct per-disc Rate rows with nullable scores and the loaded User relation', async () => {
    const rates = [
      Object.assign(new Rate(), {
        id: 'rate-zero',
        rate: 0,
        cover: null,
        createdAt: new Date('2024-01-01'),
        user: Object.assign(new User(), {
          id: 'user-1',
          username: 'listener',
          image: null,
        }),
      }),
      Object.assign(new Rate(), {
        id: 'rate-cover-only',
        rate: null,
        cover: 7.5,
        createdAt: new Date('2024-01-02'),
        user: Object.assign(new User(), {
          id: 'user-2',
          username: 'friend',
          image: 'avatar.png',
        }),
      }),
    ];
    const manager = Object.assign(
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'rates-test' }),
      ),
      {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, FindOneOptions<Disc>]>()
          .mockResolvedValue(disc),
      },
    );
    const repository = createRepositoryMock({
      manager,
      find: jest
        .fn<Promise<Rate[]>, Parameters<Repository<Rate>['find']>>()
        .mockResolvedValue(rates),
    });
    const service = new RatesService(repository);

    await expect(service.findRatesByDisc(disc.id)).resolves.toEqual(rates);
    expect(repository.find).toHaveBeenCalledWith({
      where: { disc: { id: disc.id } },
      relations: ['user'],
    });

    const userColumns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === User,
    );
    const selectedUserColumns = userColumns
      .filter((column) => column.options.select !== false)
      .map((column) => column.propertyName);
    const excludedUserColumns = userColumns
      .filter((column) => column.options.select === false)
      .map((column) => column.propertyName);

    expect(selectedUserColumns).toEqual(
      expect.arrayContaining([
        'id',
        'username',
        'isActive',
        'image',
        'dashboardConfig',
        'mobileDashboardConfig',
        'dashboardButtonsEnabled',
        'createdAt',
        'notes',
        'lastLogin',
      ]),
    );
    expect(excludedUserColumns).toEqual(
      expect.arrayContaining(['email', 'password', 'role']),
    );
  });

  it('updates the existing rate for the same user and disc', async () => {
    const existingRate = Object.assign(new Rate(), { id: 'rate-existing' });
    const updatedRate = Object.assign(new Rate(), {
      id: existingRate.id,
      rate: 9,
      cover: null,
      editedAt: expect.any(Date),
    });
    const manager = Object.assign(
      new EntityManager(
        new DataSource({ type: 'postgres', database: 'rates-test' }),
      ),
      {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, FindOneOptions<Disc>]>()
          .mockResolvedValue(disc),
      },
    );
    const repository = createRepositoryMock({
      manager,
      findOne: jest
        .fn<Promise<Rate | null>, [FindOneOptions<Rate>]>()
        .mockResolvedValue(existingRate),
      preload: jest
        .fn<Rate, [DeepPartial<Rate>]>()
        .mockReturnValue(updatedRate),
      save: jest.fn<Promise<Rate>, [Rate]>().mockResolvedValue(updatedRate),
    });
    const service = new RatesService(repository);

    await expect(
      service.create(
        createRateDto({ discId: disc.id, rate: 9, cover: null }),
        user,
      ),
    ).resolves.toBe(updatedRate);
    expect(repository.preload).toHaveBeenCalledWith({
      id: existingRate.id,
      rate: 9,
      cover: null,
      editedAt: expect.any(Date),
    });
    expect(repository.save).toHaveBeenCalledWith(updatedRate);
  });

  it('returns the paginated enriched rate with personal favorite/pending state and aggregates', async () => {
    const rate = Object.assign(new Rate(), {
      id: 'rate-1',
      rate: 8.5,
      cover: 7,
      user,
      disc: Object.assign(new Disc(), {
        id: disc.id,
        name: 'Record',
        artist: { id: 'artist-1', name: 'Band', country: { id: 'country-1' } },
        genre: { id: 'genre-1' },
      }),
    });
    const selectBuilder = createQueryBuilder();
    const commentSubquery = createSubQueryBuilder();
    selectBuilder.addSelect.mockImplementation((selection, alias) => {
      if (typeof selection === 'function') {
        const subquery =
          alias === 'commentCount' ? commentSubquery : createSubQueryBuilder();
        selection(subquery);
      }
      return selectBuilder;
    });
    selectBuilder.getRawAndEntities.mockResolvedValue({
      entities: [rate],
      raw: [
        {
          rateCount: '3',
          commentCount: '2',
          averageRate: '7.25',
          averageCover: '6.5',
          favoriteId: 'favorite-1',
          pendingId: 'pending-1',
        },
      ],
    });
    const countBuilder = createQueryBuilder();
    countBuilder.getCount.mockResolvedValue(1);
    const repository = createRepositoryMock({
      createQueryBuilder: jest
        .fn<RateQueryBuilderMock, [string]>()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(countBuilder),
    });
    const service = new RatesService(repository);

    await expect(
      service.findAllByUser(new PaginationDto(), user),
    ).resolves.toEqual({
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      limit: 10,
      data: [
        {
          ...rate,
          disc: {
            ...rate.disc,
            artist: { ...rate.disc.artist, country: rate.disc.artist.country },
            userRate: { rate: 8.5, cover: 7, id: 'rate-1' },
            voteCount: 3,
            commentCount: 2,
            averageRate: 7.25,
            averageCover: 6.5,
            favoriteId: 'favorite-1',
            pendingId: 'pending-1',
          },
        },
      ],
    });
    expect(
      countBuilder.leftJoin.mock.calls.map(([relation]) => relation),
    ).toEqual(['rate.disc', 'disc.artist', 'artist.country', 'disc.genre']);
    expect(commentSubquery.from).toHaveBeenCalledWith('comment', 'comment');
    expect(commentSubquery.where).toHaveBeenCalledWith(
      'comment.discId = disc.id',
    );
  });

  it('preserves null and zero values in the enriched rate Disc projection', async () => {
    const rate = Object.assign(new Rate(), {
      id: 'rate-zero',
      rate: 0,
      cover: null,
      user,
      disc: Object.assign(new Disc(), {
        id: disc.id,
        name: 'Record',
        artist: { id: 'artist-1', name: 'Band', country: null },
        genre: null,
      }),
    });
    const selectBuilder = createQueryBuilder();
    selectBuilder.getRawAndEntities.mockResolvedValue({
      entities: [rate],
      raw: [
        {
          rateCount: '0',
          commentCount: '0',
          averageRate: '0',
          averageCover: null,
          favoriteId: null,
          pendingId: null,
        },
      ],
    });
    const countBuilder = createQueryBuilder();
    countBuilder.getCount.mockResolvedValue(1);
    const repository = createRepositoryMock({
      createQueryBuilder: jest
        .fn<RateQueryBuilderMock, [string]>()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(countBuilder),
    });
    const service = new RatesService(repository);

    await expect(
      service.findAllByUser(new PaginationDto(), user),
    ).resolves.toMatchObject({
      data: [
        {
          id: rate.id,
          rate: 0,
          cover: null,
          disc: {
            userRate: { rate: 0, cover: null, id: rate.id },
            voteCount: null,
            commentCount: 0,
            averageRate: 0,
            averageCover: null,
            favoriteId: null,
            pendingId: null,
          },
        },
      ],
    });
  });

  it('allows the owner to update and delete, and forbids both operations for another user', async () => {
    const ownRate = Object.assign(new Rate(), { id: 'rate-1', user });
    const repository = createRepositoryMock({
      findOne: jest
        .fn<Promise<Rate | null>, [FindOneOptions<Rate>]>()
        .mockResolvedValue(ownRate),
      preload: jest.fn<Rate, [DeepPartial<Rate>]>().mockReturnValue(ownRate),
      save: jest.fn<Promise<Rate>, [Rate]>().mockResolvedValue(ownRate),
      delete: jest
        .fn<Promise<DeleteResult>, Parameters<Repository<Rate>['delete']>>()
        .mockResolvedValue({ affected: 1, raw: [] }),
    });
    const service = new RatesService(repository);

    await expect(
      service.update('rate-1', createUpdateRateDto({ rate: 9 }), user),
    ).resolves.toBe(ownRate);
    await expect(service.remove('rate-1', user)).resolves.toEqual({
      message: 'Rate with id rate-1 has been removed',
    });

    repository.findOne.mockResolvedValue(
      Object.assign(new Rate(), {
        id: 'rate-1',
        user: createUser('another-user'),
      }),
    );
    await expect(
      service.update('rate-1', createUpdateRateDto({ rate: 9 }), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('rate-1', user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the rate to update or delete does not exist', async () => {
    const repository = createRepositoryMock({
      findOne: jest
        .fn<Promise<Rate | null>, [FindOneOptions<Rate>]>()
        .mockResolvedValue(null),
    });
    const service = new RatesService(repository);

    await expect(
      service.update('missing-id', createUpdateRateDto({ rate: 9 }), user),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.remove('missing-id', user)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('RatesService personal resource read access', () => {
  const owner = createUser('owner-id');

  it('allows the owner to read their rate by id', async () => {
    const rate = Object.assign(new Rate(), { id: 'rate-id', user: owner });
    const repository = createRepositoryMock({
      findOneOrFail: jest
        .fn<Promise<Rate>, [FindOneOptions<Rate>]>()
        .mockResolvedValue(rate),
    });
    const service = new RatesService(repository);

    await expect(service.findOne(rate.id, owner)).resolves.toBe(rate);
    expect(repository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: rate.id },
      relations: ['user'],
    });
  });

  it('returns 403 when another user reads a rate by id', async () => {
    const rate = Object.assign(new Rate(), { id: 'rate-id', user: owner });
    const repository = createRepositoryMock({
      findOneOrFail: jest
        .fn<Promise<Rate>, [FindOneOptions<Rate>]>()
        .mockResolvedValue(rate),
    });
    const service = new RatesService(repository);

    await expect(
      service.findOne('rate-id', createUser('other-id')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 when a rate by id does not exist', async () => {
    const repository = createRepositoryMock({
      findOneOrFail: jest
        .fn<Promise<Rate>, [FindOneOptions<Rate>]>()
        .mockRejectedValue(new Error('missing')),
    });
    const service = new RatesService(repository);

    await expect(service.findOne('missing-id', owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
