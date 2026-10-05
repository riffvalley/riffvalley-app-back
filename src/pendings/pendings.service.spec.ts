import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Disc } from '../catalog/discs/entities/disc.entity';
import { CreatePendingDto } from './dto/create-pendings.dto';
import { Pending } from './entities/pending.entity';
import { PendingsService } from './pendings.service';

describe('PendingsService.findAllByUser favorite state', () => {
  const userId = 'current-user-id';
  let service: PendingsService;
  let dataQuery: Record<string, jest.Mock>;
  let countQuery: Record<string, jest.Mock>;

  const createQuery = () => {
    const query: Record<string, jest.Mock> = {};
    for (const method of [
      'leftJoinAndSelect',
      'leftJoin',
      'addSelect',
      'where',
      'andWhere',
      'take',
      'skip',
      'orderBy',
      'addOrderBy',
    ]) {
      query[method] = jest.fn().mockReturnValue(query);
    }
    query.getRawAndEntities = jest.fn();
    query.getCount = jest.fn();
    return query;
  };

  const run = async (favorites: { id: string; userId: string }[]) => {
    const pending = {
      id: 'pending-id',
      disc: {
        id: 'disc-id',
        name: 'Album',
        artist: { id: 'artist-id', name: 'Artist', country: null },
        genre: null,
        favorites,
      },
    } as unknown as Pending;

    dataQuery.getRawAndEntities.mockResolvedValue({
      entities: [pending],
      raw: [{
        rateCount: '0',
        commentCount: '2',
        rateId: null,
        userRate: null,
        userCover: null,
        averageRate: null,
        averageCover: null,
      }],
    });
    countQuery.getCount.mockResolvedValue(1);

    const result = await service.findAllByUser({}, { id: userId } as User);
    return { result, pending };
  };

  beforeEach(() => {
    dataQuery = createQuery();
    countQuery = createQuery();
    const repository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery),
    };
    service = new PendingsService(repository as unknown as Repository<Pending>);
  });

  it.each([
    ['favorite absent', [], null],
    ['one current-user favorite', [{ id: 'favorite-current', userId }], 'favorite-current'],
    [
      'multiple current-user favorite rows',
      [
        { id: 'favorite-first', userId },
        { id: 'favorite-second', userId },
      ],
      'favorite-first',
    ],
  ])('preserves the favorites array and derives favoriteId when %s', async (_label, favorites, favoriteId) => {
    const { result, pending } = await run(favorites as { id: string; userId: string }[]);

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
  });
});

describe('PendingsService.create Disc payload', () => {
  it('preserves the eager Disc.pendings collection in the nested create response', async () => {
    const pendings = [
      { id: 'pending-other-user', user: { id: 'other-user-id' } },
    ];
    const disc = { id: 'disc-id', name: 'Album', pendings } as unknown as Disc;
    const user = { id: 'current-user-id' } as User;
    const pending = { id: 'pending-created', disc, user } as Pending;
    const repository = {
      manager: { findOne: jest.fn().mockResolvedValue(disc) },
      create: jest.fn().mockReturnValue(pending),
      save: jest.fn().mockResolvedValue(pending),
    };
    const service = new PendingsService(repository as unknown as Repository<Pending>);

    await expect(
      service.create({ discId: disc.id } as CreatePendingDto, user),
    ).resolves.toEqual(pending);
    expect(repository.manager.findOne).toHaveBeenCalledWith(Disc, {
      where: { id: disc.id },
    });
    expect(pending.disc.pendings).toEqual(pendings);
  });
});
