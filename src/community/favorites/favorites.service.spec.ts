import { getMetadataArgsStorage } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Pending } from 'src/community/pendings/entities/pending.entity';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { CreateFavoriteDto } from './dto/create-favorites.dto';
import { Favorite } from './entities/favorite.entity';
import { FavoritesService } from './favorites.service';

describe('FavoritesService characterization', () => {
  it('creates a favorite linked to the authenticated user and the located Disc', async () => {
    const user = { id: 'user-id' } as User;
    const disc = { id: 'disc-id' } as Disc;
    const favorite = { user, disc } as Favorite;
    const favoriteRepository = {
      manager: { findOne: jest.fn().mockResolvedValue(disc) },
      create: jest.fn().mockReturnValue(favorite),
      save: jest.fn().mockResolvedValue(favorite),
    };
    const service = new FavoritesService(favoriteRepository as any);

    await expect(
      service.create({ discId: disc.id } as CreateFavoriteDto, user),
    ).resolves.toBe(favorite);
    expect(favoriteRepository.manager.findOne).toHaveBeenCalledWith(Disc, {
      where: { id: disc.id },
    });
    expect(favoriteRepository.create).toHaveBeenCalledWith({ user, disc });
    expect(favoriteRepository.save).toHaveBeenCalledWith(favorite);
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
    const countQuery = createQueryBuilder({ count: 2 });
    const favoriteRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(firstQuery)
        .mockReturnValueOnce(countQuery),
    };
    const service = new FavoritesService(favoriteRepository as any);

    await expect(
      service.findAllByUser({ limit: 10, offset: 0 } as PaginationDto, {
        id: 'user-id',
      } as User),
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
            artist: { ...populatedFavorite.disc.artist, country: populatedFavorite.disc.artist.country },
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
    expect(firstQuery.addSelect).toHaveBeenCalledWith(expect.any(Function), 'commentCount');
    expect(firstQuery.addSelect).toHaveBeenCalledWith(expect.any(Function), 'averageRate');
    expect(firstQuery.addSelect).toHaveBeenCalledWith(expect.any(Function), 'averageCover');
    expect(countQuery.getCount).toHaveBeenCalled();
  });

  it('preserves Favorite relations and the inverse eager Disc.favorites metadata', () => {
    const relations = getMetadataArgsStorage().relations;
    const relation = (target: Function, propertyName: string) =>
      relations.find((entry) => entry.target === target && entry.propertyName === propertyName);

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

function createQueryBuilder(result: { entities?: Favorite[]; raw?: unknown[]; count?: number }) {
  const builder: any = {};
  const chainMethods = [
    'leftJoinAndSelect',
    'leftJoin',
    'addSelect',
    'where',
    'andWhere',
    'take',
    'skip',
    'orderBy',
    'addOrderBy',
  ];
  for (const method of chainMethods) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getRawAndEntities = jest.fn().mockResolvedValue({
    entities: result.entities,
    raw: result.raw,
  });
  builder.getCount = jest.fn().mockResolvedValue(result.count);
  return builder;
}
