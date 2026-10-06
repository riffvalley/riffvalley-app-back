import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Disc } from '../../catalog/discs/entities/disc.entity';
import { CreatePendingDto } from './dto/create-pendings.dto';
import { Pending } from './entities/pending.entity';
import { PendingsService } from './pendings.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

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

  const run = async (
    favorites: { id: string; userId: string }[],
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
      raw: [rawValues],
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

  it('preserves the populated Rate, Favorite and aggregate fields in the enriched page', async () => {
    const favorite = { id: 'favorite-id', userId };
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
    expect(dataQuery.addSelect).toHaveBeenCalledWith(expect.any(Function), 'rateCount');
    expect(dataQuery.addSelect).toHaveBeenCalledWith(expect.any(Function), 'commentCount');
    expect(dataQuery.addSelect).toHaveBeenCalledWith(expect.any(Function), 'averageRate');
    expect(dataQuery.addSelect).toHaveBeenCalledWith(expect.any(Function), 'averageCover');
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

describe('PendingsService domain errors', () => {
  it('returns 404 for a missing Disc, keeps duplicates at 400, and masks unexpected errors as 500', async () => {
    const user = { id: 'user-id' } as User;
    const missingDiscService = new PendingsService({
      manager: { findOne: jest.fn().mockResolvedValue(null) },
    } as unknown as Repository<Pending>);
    await expect(missingDiscService.create({ discId: 'missing-disc' } as CreatePendingDto, user))
      .rejects.toMatchObject({ status: 404 });

    const disc = { id: 'disc-id' } as Disc;
    const repository: any = {
      manager: { findOne: jest.fn().mockResolvedValue(disc) },
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockRejectedValueOnce({ code: '23505', detail: 'duplicate key value' })
        .mockRejectedValueOnce(new Error('private database details')),
    };
    const service = new PendingsService(repository);
    await expect(service.create({ discId: disc.id } as CreatePendingDto, user))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.create({ discId: disc.id } as CreatePendingDto, user))
      .rejects.toMatchObject({
        status: 500,
        response: { message: 'An unexpected error occurred' },
      });
  });
});

describe('PendingsService personal resource access', () => {
  const owner = { id: 'owner-id' } as User;
  let repository: any;
  let service: PendingsService;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new PendingsService(repository as unknown as Repository<Pending>);
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
  ])('returns 403 and does not delete when a non-owner tries to %s', async (_action, action) => {
    const pending = { id: 'pending-id', user: owner } as Pending;
    repository.findOneOrFail.mockResolvedValue(pending);
    repository.findOne.mockResolvedValue(pending);

    await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['read', () => service.findOne('missing-id', owner)],
    ['delete', () => service.remove('missing-id', owner)],
  ])('returns 404 when a pending to %s does not exist', async (_action, action) => {
    repository.findOneOrFail.mockRejectedValue(new Error('missing'));
    repository.findOne.mockResolvedValue(null);

    await expect(action()).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
