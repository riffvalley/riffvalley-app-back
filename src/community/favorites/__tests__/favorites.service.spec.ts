import {
  DataSource,
  DeepPartial,
  DeleteResult,
  EntityManager,
  FindOneOptions,
  getMetadataArgsStorage,
  Repository,
} from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { User } from 'src/identity/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Pending } from 'src/community/pendings/entities/pending.entity';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { CreateFavoriteDto } from '../dto/create-favorites.dto';
import { Favorite } from '../entities/favorite.entity';
import { FavoritesService } from '../favorites.service';

type QueryBuilderMock = {
  select: jest.Mock<QueryBuilderMock, [string, string?]>;
  from: jest.Mock<QueryBuilderMock, [string, string]>;
  leftJoinAndSelect: jest.Mock<QueryBuilderMock, [string, string]>;
  leftJoin: jest.Mock<
    QueryBuilderMock,
    [string | typeof Pending, string, string?, Record<string, string>?]
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
    Promise<{
      entities: Favorite[];
      raw: Array<Record<string, string | null>>;
    }>,
    []
  >;
  getCount: jest.Mock<Promise<number>, []>;
};

function createRepositoryMock<T extends object>(
  overrides: T,
): Repository<Favorite> & T {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'favorites-test',
  });
  const repository = new Repository<Favorite>(
    Favorite,
    new EntityManager(dataSource),
  );
  return Object.assign(repository, overrides);
}

describe('FavoritesService characterization', () => {
  it('creates a favorite linked to the authenticated user and the located Disc', async () => {
    const user = { id: 'user-id' } as User;
    const disc = { id: 'disc-id' } as Disc;
    const favorite = { user, disc } as Favorite;
    const favoriteRepository = createRepositoryMock({
      manager: {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, { where: { id: string } }]>()
          .mockResolvedValue(disc),
      },
      create: jest
        .fn<Favorite, [DeepPartial<Favorite>]>()
        .mockReturnValue(favorite),
      save: jest
        .fn<Promise<Favorite>, [Favorite]>()
        .mockResolvedValue(favorite),
    });
    const service = new FavoritesService(favoriteRepository);

    await expect(
      service.create({ discId: disc.id } as CreateFavoriteDto, user),
    ).resolves.toBe(favorite);
    expect(favoriteRepository.manager.findOne).toHaveBeenCalledWith(Disc, {
      where: { id: disc.id },
    });
    expect(favoriteRepository.create).toHaveBeenCalledWith({ user, disc });
    expect(favoriteRepository.save).toHaveBeenCalledWith(favorite);
  });

  it('returns 404 for a missing Disc and preserves existing database error statuses', async () => {
    const user = { id: 'user-id' } as User;
    const missingDiscRepository = createRepositoryMock({
      manager: {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, { where: { id: string } }]>()
          .mockResolvedValue(null),
      },
    });
    const missingDiscService = new FavoritesService(missingDiscRepository);
    await expect(
      missingDiscService.create(
        { discId: 'missing-disc' } as CreateFavoriteDto,
        user,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const disc = { id: 'disc-id' } as Disc;
    const repository = createRepositoryMock({
      manager: {
        findOne: jest
          .fn<Promise<Disc | null>, [typeof Disc, { where: { id: string } }]>()
          .mockResolvedValue(disc),
      },
      create: jest
        .fn<DeepPartial<Favorite>, [DeepPartial<Favorite>]>()
        .mockReturnValue({}),
      save: jest
        .fn<Promise<Favorite>, [Favorite]>()
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key value' })
        .mockRejectedValueOnce(new Error('private database details')),
    });
    const service = new FavoritesService(repository);
    await expect(
      service.create({ discId: disc.id } as CreateFavoriteDto, user),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create({ discId: disc.id } as CreateFavoriteDto, user),
    ).rejects.toMatchObject({
      status: 500,
      response: { message: 'An unexpected error occurred' },
    });
  });

  it('returns a representative enriched page and preserves absent interaction fields', async () => {
    const populatedFavorite = {
      id: 'favorite-id',
      disc: {
        id: 'disc-with-data',
        artist: { id: 'artist-id', country: { id: 'country-id' } },
        genre: { id: 'genre-id' },
      },
    } as Favorite;
    const sparseFavorite = {
      id: 'sparse-favorite-id',
      disc: { id: 'disc-without-interactions', artist: { id: 'artist-id' } },
    } as Favorite;
    const firstQuery = createQueryBuilder({
      entities: [populatedFavorite, sparseFavorite],
      raw: [
        {
          rateCount: '3',
          commentCount: '2',
          rateId: 'rate-id',
          userRate: '8.5',
          userCover: '7',
          pendingId: 'pending-id',
          averageRate: '6.25',
          averageCover: '5.5',
        },
        {
          rateCount: '0',
          commentCount: '0',
          rateId: null,
          userRate: null,
          userCover: null,
          pendingId: null,
          averageRate: null,
          averageCover: null,
        },
      ],
    });
    const commentSubquery = createQueryBuilder({});
    firstQuery.addSelect.mockImplementation((selection, alias) => {
      if (typeof selection === 'function' && alias === 'commentCount') {
        selection(commentSubquery);
      }
      return firstQuery;
    });
    const countQuery = createQueryBuilder({ count: 2 });
    const favoriteRepository = createRepositoryMock({
      createQueryBuilder: jest
        .fn<QueryBuilderMock, [string]>()
        .mockReturnValueOnce(firstQuery)
        .mockReturnValueOnce(countQuery),
    });
    const service = new FavoritesService(favoriteRepository);

    await expect(
      service.findAllByUser(
        { limit: 10, offset: 0 } as PaginationDto,
        {
          id: 'user-id',
        } as User,
      ),
    ).resolves.toEqual({
      totalItems: 2,
      totalPages: 1,
      currentPage: 1,
      limit: 10,
      data: [
        {
          ...populatedFavorite,
          disc: {
            ...populatedFavorite.disc,
            artist: {
              ...populatedFavorite.disc.artist,
              country: populatedFavorite.disc.artist.country,
            },
            userFavorite: { id: 'favorite-id' },
            voteCount: 3,
            commentCount: 2,
            userRate: { id: 'rate-id', rate: '8.5', cover: '7' },
            userPending: { id: 'pending-id' },
            averageRate: 6.25,
            averageCover: 5.5,
          },
        },
        {
          ...sparseFavorite,
          disc: {
            ...sparseFavorite.disc,
            artist: { ...sparseFavorite.disc.artist, country: null },
            userFavorite: { id: 'sparse-favorite-id' },
            voteCount: null,
            commentCount: 0,
            userRate: null,
            userPending: null,
            averageRate: null,
            averageCover: null,
          },
        },
      ],
    });

    expect(firstQuery.leftJoin).toHaveBeenCalledWith(
      'rate',
      'rate',
      'rate.discId = disc.id AND rate.userId = :userId',
      { userId: 'user-id' },
    );
    expect(firstQuery.leftJoin).toHaveBeenCalledWith(
      Pending,
      'pending',
      'pending.discId = disc.id AND pending.userId = :userId',
      { userId: 'user-id' },
    );
    expect(firstQuery.addSelect).toHaveBeenCalledWith(
      expect.any(Function),
      'commentCount',
    );
    expect(commentSubquery.from).toHaveBeenCalledWith('comment', 'comment');
    expect(commentSubquery.where).toHaveBeenCalledWith(
      'comment.discId = disc.id',
    );
    expect(firstQuery.addSelect).toHaveBeenCalledWith(
      expect.any(Function),
      'averageRate',
    );
    expect(firstQuery.addSelect).toHaveBeenCalledWith(
      expect.any(Function),
      'averageCover',
    );
    expect(countQuery.getCount).toHaveBeenCalled();
    expect(
      countQuery.leftJoin.mock.calls.map(([relation]) => relation),
    ).toEqual(['favorite.disc', 'disc.artist', 'artist.country', 'disc.genre']);
    expect(countQuery.addSelect).not.toHaveBeenCalled();
  });

  it('preserves Favorite relations and the inverse eager Disc.favorites metadata', () => {
    const relations = getMetadataArgsStorage().relations;
    const relation = (target: Type<unknown>, propertyName: string) =>
      relations.find(
        (entry) =>
          entry.target === target && entry.propertyName === propertyName,
      );

    expect(relation(Favorite, 'user')).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, onDelete: 'CASCADE' },
    });
    expect(relation(Favorite, 'disc')).toMatchObject({
      relationType: 'many-to-one',
      options: { onDelete: 'CASCADE' },
    });
    expect(relation(Favorite, 'disc')?.options.eager).toBeUndefined();
    expect(relation(User, 'favorite')).toMatchObject({
      relationType: 'one-to-many',
      options: { cascade: true },
    });
    expect(relation(Disc, 'favorites')).toMatchObject({
      relationType: 'one-to-many',
      options: { eager: true },
    });
  });
});

describe('FavoritesService personal resource access', () => {
  const owner = { id: 'owner-id' } as User;
  let repository: ReturnType<typeof createPersonalRepositoryMock>;
  let service: FavoritesService;

  beforeEach(() => {
    repository = createPersonalRepositoryMock();
    service = new FavoritesService(repository);
  });

  it('allows the owner to read and delete their favorite', async () => {
    const favorite = { id: 'favorite-id', user: owner } as Favorite;
    repository.findOneOrFail.mockResolvedValue(favorite);
    repository.findOne.mockResolvedValue(favorite);

    await expect(service.findOne(favorite.id, owner)).resolves.toBe(favorite);
    await expect(service.remove(favorite.id, owner)).resolves.toEqual({
      message: `Favorite with id ${favorite.id} has been removed`,
    });
    expect(repository.delete).toHaveBeenCalledWith({ id: favorite.id });
  });

  it.each([
    ['read', () => service.findOne('favorite-id', { id: 'other-id' } as User)],
    ['delete', () => service.remove('favorite-id', { id: 'other-id' } as User)],
  ])(
    'returns 403 and does not delete when a non-owner tries to %s',
    async (_action, action) => {
      const favorite = { id: 'favorite-id', user: owner } as Favorite;
      repository.findOneOrFail.mockResolvedValue(favorite);
      repository.findOne.mockResolvedValue(favorite);

      await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.delete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['read', () => service.findOne('missing-id', owner)],
    ['delete', () => service.remove('missing-id', owner)],
  ])(
    'returns 404 when a favorite to %s does not exist',
    async (_action, action) => {
      repository.findOneOrFail.mockRejectedValue(new Error('missing'));
      repository.findOne.mockResolvedValue(null);

      await expect(action()).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    },
  );
});

function createQueryBuilder(result: {
  entities?: Favorite[];
  raw?: Array<Record<string, string | null>>;
  count?: number;
}): QueryBuilderMock {
  const builder: QueryBuilderMock = {
    select: jest.fn<QueryBuilderMock, [string, string?]>(),
    from: jest.fn<QueryBuilderMock, [string, string]>(),
    leftJoinAndSelect: jest.fn<QueryBuilderMock, [string, string]>(),
    leftJoin: jest.fn<
      QueryBuilderMock,
      [string | typeof Pending, string, string?, Record<string, string>?]
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
    getRawAndEntities: jest
      .fn<
        Promise<{
          entities: Favorite[];
          raw: Array<Record<string, string | null>>;
        }>,
        []
      >()
      .mockResolvedValue({
        entities: result.entities ?? [],
        raw: result.raw ?? [],
      }),
    getCount: jest
      .fn<Promise<number>, []>()
      .mockResolvedValue(result.count ?? 0),
  };
  for (const method of [
    builder.select,
    builder.from,
    builder.leftJoinAndSelect,
    builder.leftJoin,
    builder.addSelect,
    builder.where,
    builder.andWhere,
    builder.take,
    builder.skip,
    builder.orderBy,
    builder.addOrderBy,
  ]) {
    method.mockReturnValue(builder);
  }
  return builder;
}

function createPersonalRepositoryMock() {
  return createRepositoryMock({
    findOne: jest.fn<Promise<Favorite | null>, [FindOneOptions<Favorite>]>(),
    findOneOrFail: jest.fn<Promise<Favorite>, [FindOneOptions<Favorite>]>(),
    delete: jest
      .fn<Promise<DeleteResult>, Parameters<Repository<Favorite>['delete']>>()
      .mockResolvedValue({ affected: 1, raw: [] }),
  });
}
import { Type } from '@nestjs/common';
