import {
  DataSource,
  DeepPartial,
  DeleteResult,
  EntityManager,
  FindOneOptions,
  Repository,
} from 'typeorm';
import { User } from '../../../identity/auth/entities/user.entity';
import { Disc } from '../../../catalog/discs/entities/disc.entity';
import { Favorite } from '../../../community/favorites/entities/favorite.entity';
import { CreatePendingDto } from '../dto/create-pendings.dto';
import { Pending } from '../entities/pending.entity';
import { PendingsService } from '../pendings.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

type QueryBuilderMock = {
  select: jest.Mock<QueryBuilderMock, [string, string?]>;
  from: jest.Mock<QueryBuilderMock, [string, string]>;
  leftJoinAndSelect: jest.Mock<
    QueryBuilderMock,
    [string, string, string?, Record<string, string>?]
  >;
  leftJoin: jest.Mock<
    QueryBuilderMock,
    [string, string, string?, Record<string, string>?]
  >;
  addSelect: jest.Mock<
    QueryBuilderMock,
    [string | ((subQuery: QueryBuilderMock) => QueryBuilderMock), string?]
  >;
  where: jest.Mock<QueryBuilderMock, [string, Record<string, string>?]>;
  andWhere: jest.Mock<QueryBuilderMock, [string, Record<string, string>?]>;
  take: jest.Mock<QueryBuilderMock, [number]>;
  skip: jest.Mock<QueryBuilderMock, [number]>;
  orderBy: jest.Mock<
    QueryBuilderMock,
    [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
  >;
  addOrderBy: jest.Mock<
    QueryBuilderMock,
    [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
  >;
  getRawAndEntities: jest.Mock<
    Promise<{ entities: Pending[]; raw: Array<Record<string, string | null>> }>,
    []
  >;
  getCount: jest.Mock<Promise<number>, []>;
};

type FavoriteFixture = Favorite & { userId: string };

function createFavoriteFixture(id: string, userId: string): FavoriteFixture {
  return Object.assign(new Favorite(), { id, userId });
}

function createRepositoryMock<T extends object>(
  overrides: T,
): Repository<Pending> & T {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'pendings-test',
  });
  const repository = new Repository<Pending>(
    Pending,
    new EntityManager(dataSource),
  );
  return Object.assign(repository, overrides);
}

function createPersonalRepositoryMock() {
  return createRepositoryMock({
    findOne: jest.fn<Promise<Pending | null>, [FindOneOptions<Pending>]>(),
    findOneOrFail: jest.fn<Promise<Pending>, [FindOneOptions<Pending>]>(),
    delete: jest
      .fn<Promise<DeleteResult>, Parameters<Repository<Pending>['delete']>>()
      .mockResolvedValue({ affected: 1, raw: [] }),
  });
}

describe('PendingsService.findAllByUser favorite state', () => {
  const userId = 'current-user-id';
  let service: PendingsService;
  let dataQuery: QueryBuilderMock;
  let countQuery: QueryBuilderMock;

  const createQuery = (): QueryBuilderMock => {
    const query: QueryBuilderMock = {
      select: jest.fn<QueryBuilderMock, [string, string?]>(),
      from: jest.fn<QueryBuilderMock, [string, string]>(),
      leftJoinAndSelect: jest.fn<
        QueryBuilderMock,
        [string, string, string?, Record<string, string>?]
      >(),
      leftJoin: jest.fn<
        QueryBuilderMock,
        [string, string, string?, Record<string, string>?]
      >(),
      addSelect: jest.fn<
        QueryBuilderMock,
        [string | ((subQuery: QueryBuilderMock) => QueryBuilderMock), string?]
      >(),
      where: jest.fn<QueryBuilderMock, [string, Record<string, string>?]>(),
      andWhere: jest.fn<QueryBuilderMock, [string, Record<string, string>?]>(),
      take: jest.fn<QueryBuilderMock, [number]>(),
      skip: jest.fn<QueryBuilderMock, [number]>(),
      orderBy: jest.fn<
        QueryBuilderMock,
        [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
      >(),
      addOrderBy: jest.fn<
        QueryBuilderMock,
        [string, 'ASC' | 'DESC', ('NULLS FIRST' | 'NULLS LAST')?]
      >(),
      getRawAndEntities: jest.fn<
        Promise<{
          entities: Pending[];
          raw: Array<Record<string, string | null>>;
        }>,
        []
      >(),
      getCount: jest.fn<Promise<number>, []>(),
    };
    for (const method of [
      query.select,
      query.from,
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
  };

  const run = async (
    favorites: FavoriteFixture[],
    rawValues = {
      rateCount: '0',
      commentCount: '2',
      rateId: null,
      userRate: null,
      userCover: null,
      averageRate: null,
      averageCover: null,
    },
  ) => {
    const pending = Object.assign(new Pending(), {
      id: 'pending-id',
      disc: Object.assign(new Disc(), {
        id: 'disc-id',
        name: 'Album',
        artist: { id: 'artist-id', name: 'Artist', country: null },
        genre: null,
        favorites,
      }),
    });

    dataQuery.getRawAndEntities.mockResolvedValue({
      entities: [pending],
      raw: [rawValues],
    });
    countQuery.getCount.mockResolvedValue(1);

    const result = await service.findAllByUser(
      {},
      Object.assign(new User(), { id: userId }),
    );
    return { result, pending };
  };

  beforeEach(() => {
    dataQuery = createQuery();
    countQuery = createQuery();
    const repository = createRepositoryMock({
      createQueryBuilder: jest
        .fn<QueryBuilderMock, [string]>()
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery),
    });
    service = new PendingsService(repository);
  });

  const favoriteCases: Array<[string, FavoriteFixture[], string | null]> = [
    ['favorite absent', [], null],
    [
      'one current-user favorite',
      [createFavoriteFixture('favorite-current', userId)],
      'favorite-current',
    ],
    [
      'multiple current-user favorite rows',
      [
        createFavoriteFixture('favorite-first', userId),
        createFavoriteFixture('favorite-second', userId),
      ],
      'favorite-first',
    ],
  ];

  it.each(favoriteCases)(
    'preserves the favorites array and derives favoriteId when %s',
    async (_label, favorites, favoriteId) => {
      const { result, pending } = await run(favorites);

      expect(result.data[0]).toMatchObject({
        ...pending,
        disc: {
          ...pending.disc,
          userPending: pending.id,
          favoriteId,
          voteCount: null,
          commentCount: 2,
          userRate: null,
          averageRate: null,
          averageCover: null,
        },
      });
      expect(result.data[0].disc.favorites).toEqual(favorites);
      expect(result.data[0].disc.userPending).toBe(pending.id);
      expect(result.data[0].disc).not.toHaveProperty('pendings');
      expect(result.data[0].disc).not.toHaveProperty('comments');
      expect(
        dataQuery.leftJoinAndSelect.mock.calls.some(
          ([relation]) =>
            relation === 'disc.pendings' || relation === 'disc.comments',
        ),
      ).toBe(false);
      expect(dataQuery.leftJoinAndSelect).toHaveBeenCalledWith(
        'disc.favorites',
        'favorite',
        'favorite.userId = :userId',
        { userId },
      );
    },
  );

  it('preserves the populated Rate, Favorite and aggregate fields in the enriched page', async () => {
    const favorite = createFavoriteFixture('favorite-id', userId);
    const commentSubquery = createQuery();
    dataQuery.addSelect.mockImplementation((selection, alias) => {
      if (typeof selection === 'function' && alias === 'commentCount') {
        selection(commentSubquery);
      }
      return dataQuery;
    });
    const { result, pending } = await run([favorite], {
      rateCount: '4',
      commentCount: '3',
      rateId: 'rate-id',
      userRate: '8.5',
      userCover: '7.25',
      averageRate: '6.75',
      averageCover: '5.5',
    });

    expect(result).toMatchObject({
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      limit: 10,
      data: [
        {
          ...pending,
          disc: {
            userPending: pending.id,
            userRate: { id: 'rate-id', rate: '8.5', cover: '7.25' },
            favoriteId: favorite.id,
            voteCount: 4,
            commentCount: 3,
            averageRate: 6.75,
            averageCover: 5.5,
          },
        },
      ],
    });
    expect(dataQuery.leftJoin).toHaveBeenCalledWith(
      'rate',
      'rate',
      'rate.discId = disc.id AND rate.userId = :userId',
      { userId },
    );
    expect(dataQuery.addSelect).toHaveBeenCalledWith(
      expect.any(Function),
      'rateCount',
    );
    expect(dataQuery.addSelect).toHaveBeenCalledWith(
      expect.any(Function),
      'commentCount',
    );
    expect(commentSubquery.from).toHaveBeenCalledWith('comment', 'comment');
    expect(commentSubquery.where).toHaveBeenCalledWith(
      'comment.discId = disc.id',
    );
    expect(dataQuery.addSelect).toHaveBeenCalledWith(
      expect.any(Function),
      'averageRate',
    );
    expect(dataQuery.addSelect).toHaveBeenCalledWith(
      expect.any(Function),
      'averageCover',
    );
  });
});

describe('PendingsService.create Disc payload', () => {
  it('preserves the eager Disc.pendings collection in the nested create response', async () => {
    const pendings = [
      Object.assign(new Pending(), {
        id: 'pending-other-user',
        user: Object.assign(new User(), { id: 'other-user-id' }),
      }),
    ];
    const disc = Object.assign(new Disc(), {
      id: 'disc-id',
      name: 'Album',
      pendings,
    });
    const user = Object.assign(new User(), { id: 'current-user-id' });
    const pending = Object.assign(new Pending(), {
      id: 'pending-created',
      disc,
      user,
    });
    const repository = createRepositoryMock({
      manager: {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, { where: { id: string } }]>()
          .mockResolvedValue(disc),
      },
      create: jest
        .fn<Pending, [DeepPartial<Pending>]>()
        .mockReturnValue(pending),
      save: jest.fn<Promise<Pending>, [Pending]>().mockResolvedValue(pending),
    });
    const service = new PendingsService(repository);

    await expect(
      service.create({ discId: disc.id } as CreatePendingDto, user),
    ).resolves.toEqual(pending);
    expect(repository.manager.findOne).toHaveBeenCalledWith(Disc, {
      where: { id: disc.id },
    });
    expect(pending.disc.pendings).toEqual(pendings);
  });
});

describe('PendingsService domain errors', () => {
  it('returns 404 for a missing Disc, keeps duplicates at 400, and masks unexpected errors as 500', async () => {
    const user = Object.assign(new User(), { id: 'user-id' });
    const missingDiscRepository = createRepositoryMock({
      manager: {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, { where: { id: string } }]>()
          .mockResolvedValue(null),
      },
    });
    const missingDiscService = new PendingsService(missingDiscRepository);
    await expect(
      missingDiscService.create(
        { discId: 'missing-disc' } as CreatePendingDto,
        user,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const disc = Object.assign(new Disc(), { id: 'disc-id' });
    const repository = createRepositoryMock({
      manager: {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, { where: { id: string } }]>()
          .mockResolvedValue(disc),
      },
      create: jest
        .fn<DeepPartial<Pending>, [DeepPartial<Pending>]>()
        .mockReturnValue({}),
      save: jest
        .fn<Promise<Pending>, [Pending]>()
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key value' })
        .mockRejectedValueOnce(new Error('private database details')),
    });
    const service = new PendingsService(repository);
    await expect(
      service.create({ discId: disc.id } as CreatePendingDto, user),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create({ discId: disc.id } as CreatePendingDto, user),
    ).rejects.toMatchObject({
      status: 500,
      response: { message: 'An unexpected error occurred' },
    });
  });
});

describe('PendingsService personal resource access', () => {
  const owner = { id: 'owner-id' } as User;
  let repository: ReturnType<typeof createPersonalRepositoryMock>;
  let service: PendingsService;

  beforeEach(() => {
    repository = createPersonalRepositoryMock();
    service = new PendingsService(repository);
  });

  it('allows the owner to read and delete their pending', async () => {
    const pending = { id: 'pending-id', user: owner } as Pending;
    repository.findOneOrFail.mockResolvedValue(pending);
    repository.findOne.mockResolvedValue(pending);

    await expect(service.findOne(pending.id, owner)).resolves.toBe(pending);
    await expect(service.remove(pending.id, owner)).resolves.toEqual({
      message: `Pending with id ${pending.id} has been removed`,
    });
    expect(repository.delete).toHaveBeenCalledWith({ id: pending.id });
  });

  it.each([
    ['read', () => service.findOne('pending-id', { id: 'other-id' } as User)],
    ['delete', () => service.remove('pending-id', { id: 'other-id' } as User)],
  ])(
    'returns 403 and does not delete when a non-owner tries to %s',
    async (_action, action) => {
      const pending = { id: 'pending-id', user: owner } as Pending;
      repository.findOneOrFail.mockResolvedValue(pending);
      repository.findOne.mockResolvedValue(pending);

      await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.delete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['read', () => service.findOne('missing-id', owner)],
    ['delete', () => service.remove('missing-id', owner)],
  ])(
    'returns 404 when a pending to %s does not exist',
    async (_action, action) => {
      repository.findOneOrFail.mockRejectedValue(new Error('missing'));
      repository.findOne.mockResolvedValue(null);

      await expect(action()).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    },
  );
});
