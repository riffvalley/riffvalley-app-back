import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RatesService } from './rates.service';

describe('RatesService characterization', () => {
  const user = { id: 'user-1' } as any;
  const disc = { id: 'disc-1' } as any;

  it('creates a rate with the authenticated user and resolved disc', async () => {
    const createdRate = { id: 'rate-1', rate: 8, cover: 7, user, disc };
    const repository: any = {
      manager: { findOne: jest.fn().mockResolvedValue(disc) },
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(createdRate),
      save: jest.fn().mockResolvedValue(createdRate),
    };
    const service = new RatesService(repository);

    await expect(service.create({ discId: disc.id, rate: 8, cover: 7 } as any, user))
      .resolves.toBe(createdRate);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { user: { id: user.id }, disc: { id: disc.id } } });
    expect(repository.create).toHaveBeenCalledWith({ rate: 8, cover: 7, user, disc });
    expect(repository.save).toHaveBeenCalledWith(createdRate);
  });

  it('returns 404 for a missing Disc, keeps duplicates at 400, and masks unexpected errors as 500', async () => {
    const missingDiscService = new RatesService({
      manager: { findOne: jest.fn().mockResolvedValue(null) },
    } as any);
    await expect(missingDiscService.create({ discId: 'missing-disc', rate: 8 } as any, user))
      .rejects.toMatchObject({ status: 404 });

    const repository: any = {
      manager: { findOne: jest.fn().mockResolvedValue(disc) },
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockRejectedValueOnce({ code: '23505', detail: 'duplicate key value' })
        .mockRejectedValueOnce(new Error('private database details')),
    };
    const service = new RatesService(repository);
    await expect(service.create({ discId: disc.id, rate: 8 } as any, user))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.create({ discId: disc.id, rate: 8 } as any, user))
      .rejects.toMatchObject({
        status: 500,
        response: { message: 'An unexpected error occurred' },
      });
  });

  it('returns 404 when reading rates for a missing Disc', async () => {
    const service = new RatesService({
      manager: { findOne: jest.fn().mockResolvedValue(null) },
    } as any);

    await expect(service.findRatesByDisc('missing-disc')).rejects.toMatchObject({ status: 404 });
  });

  it('returns the direct per-disc Rate rows with nullable scores and the loaded User relation', async () => {
    const rates = [
      {
        id: 'rate-zero', rate: 0, cover: null, createdAt: new Date('2024-01-01'),
        user: { id: 'user-1', username: 'listener', image: null },
      },
      {
        id: 'rate-cover-only', rate: null, cover: 7.5, createdAt: new Date('2024-01-02'),
        user: { id: 'user-2', username: 'friend', image: 'avatar.png' },
      },
    ];
    const repository: any = {
      manager: { findOne: jest.fn().mockResolvedValue(disc) },
      find: jest.fn().mockResolvedValue(rates),
    };
    const service = new RatesService(repository);

    await expect(service.findRatesByDisc(disc.id)).resolves.toEqual(rates);
    expect(repository.find).toHaveBeenCalledWith({
      where: { disc: { id: disc.id } },
      relations: ['user'],
    });
  });

  it('updates the existing rate for the same user and disc', async () => {
    const existingRate = { id: 'rate-existing' };
    const updatedRate = { id: existingRate.id, rate: 9, cover: null, editedAt: expect.any(Date) };
    const repository: any = {
      manager: { findOne: jest.fn().mockResolvedValue(disc) },
      findOne: jest.fn().mockResolvedValue(existingRate),
      preload: jest.fn().mockReturnValue(updatedRate),
      save: jest.fn().mockResolvedValue(updatedRate),
    };
    const service = new RatesService(repository);

    await expect(service.create({ discId: disc.id, rate: 9, cover: null } as any, user))
      .resolves.toBe(updatedRate);
    expect(repository.preload).toHaveBeenCalledWith({ id: existingRate.id, rate: 9, cover: null, editedAt: expect.any(Date) });
    expect(repository.save).toHaveBeenCalledWith(updatedRate);
  });

  it('returns the paginated enriched rate with personal favorite/pending state and aggregates', async () => {
    const rate = {
      id: 'rate-1', rate: 8.5, cover: 7, user,
      disc: { id: disc.id, name: 'Record', artist: { id: 'artist-1', name: 'Band', country: { id: 'country-1' } }, genre: { id: 'genre-1' } },
    };
    const selectBuilder: any = {};
    for (const method of ['leftJoinAndSelect', 'leftJoin', 'addSelect', 'where', 'take', 'skip', 'orderBy', 'addOrderBy']) {
      selectBuilder[method] = jest.fn((...args: any[]) => {
        if (method === 'addSelect' && typeof args[0] === 'function') args[0]({ select: () => ({ from: () => ({ where: () => ({}) }) }) });
        return selectBuilder;
      });
    }
    selectBuilder.getRawAndEntities = jest.fn().mockResolvedValue({
      entities: [rate],
      raw: [{ rateCount: '3', commentCount: '2', averageRate: '7.25', averageCover: '6.5', favoriteId: 'favorite-1', pendingId: 'pending-1' }],
    });
    const countBuilder: any = {};
    for (const method of ['leftJoin', 'where']) countBuilder[method] = jest.fn(() => countBuilder);
    countBuilder.getCount = jest.fn().mockResolvedValue(1);
    const repository: any = { createQueryBuilder: jest.fn().mockReturnValueOnce(selectBuilder).mockReturnValueOnce(countBuilder) };
    const service = new RatesService(repository);

    await expect(service.findAllByUser({} as any, user)).resolves.toEqual({
      totalItems: 1, totalPages: 1, currentPage: 1, limit: 10,
      data: [{
        ...rate,
        disc: {
          ...rate.disc,
          artist: { ...rate.disc.artist, country: rate.disc.artist.country },
          userRate: { rate: 8.5, cover: 7, id: 'rate-1' },
          voteCount: 3, commentCount: 2, averageRate: 7.25, averageCover: 6.5,
          favoriteId: 'favorite-1', pendingId: 'pending-1',
        },
      }],
    });
    expect(countBuilder.leftJoin.mock.calls.map(([relation]) => relation)).toEqual([
      'rate.disc',
      'disc.artist',
      'artist.country',
      'disc.genre',
    ]);
  });

  it('preserves null and zero values in the enriched rate Disc projection', async () => {
    const rate = {
      id: 'rate-zero', rate: 0, cover: null, user,
      disc: { id: disc.id, name: 'Record', artist: { id: 'artist-1', name: 'Band', country: null }, genre: null },
    };
    const selectBuilder: any = {};
    for (const method of ['leftJoinAndSelect', 'leftJoin', 'addSelect', 'where', 'take', 'skip', 'orderBy', 'addOrderBy']) {
      selectBuilder[method] = jest.fn(() => selectBuilder);
    }
    selectBuilder.getRawAndEntities = jest.fn().mockResolvedValue({
      entities: [rate],
      raw: [{ rateCount: '0', commentCount: '0', averageRate: '0', averageCover: null, favoriteId: null, pendingId: null }],
    });
    const countBuilder: any = {};
    for (const method of ['leftJoin', 'where']) countBuilder[method] = jest.fn(() => countBuilder);
    countBuilder.getCount = jest.fn().mockResolvedValue(1);
    const service = new RatesService({
      createQueryBuilder: jest.fn().mockReturnValueOnce(selectBuilder).mockReturnValueOnce(countBuilder),
    } as any);

    await expect(service.findAllByUser({} as any, user)).resolves.toMatchObject({
      data: [{
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
      }],
    });
  });

  it('allows the owner to update and delete, and forbids both operations for another user', async () => {
    const ownRate = { id: 'rate-1', user };
    const repository: any = {
      findOne: jest.fn().mockResolvedValue(ownRate),
      preload: jest.fn().mockReturnValue(ownRate),
      save: jest.fn().mockResolvedValue(ownRate),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = new RatesService(repository);

    await expect(service.update('rate-1', { rate: 9 } as any, user)).resolves.toBe(ownRate);
    await expect(service.remove('rate-1', user)).resolves.toEqual({ message: 'Rate with id rate-1 has been removed' });

    repository.findOne.mockResolvedValue({ id: 'rate-1', user: { id: 'another-user' } });
    await expect(service.update('rate-1', { rate: 9 } as any, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('rate-1', user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the rate to update or delete does not exist', async () => {
    const repository: any = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new RatesService(repository);

    await expect(service.update('missing-id', { rate: 9 } as any, user)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.remove('missing-id', user)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('RatesService personal resource read access', () => {
  const owner = { id: 'owner-id' } as any;

  it('allows the owner to read their rate by id', async () => {
    const rate = { id: 'rate-id', user: owner };
    const repository: any = { findOneOrFail: jest.fn().mockResolvedValue(rate) };
    const service = new RatesService(repository);

    await expect(service.findOne(rate.id, owner)).resolves.toBe(rate);
    expect(repository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: rate.id },
      relations: ['user'],
    });
  });

  it('returns 403 when another user reads a rate by id', async () => {
    const repository: any = {
      findOneOrFail: jest.fn().mockResolvedValue({ id: 'rate-id', user: owner }),
    };
    const service = new RatesService(repository);

    await expect(
      service.findOne('rate-id', { id: 'other-id' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 when a rate by id does not exist', async () => {
    const repository: any = {
      findOneOrFail: jest.fn().mockRejectedValue(new Error('missing')),
    };
    const service = new RatesService(repository);

    await expect(service.findOne('missing-id', owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
