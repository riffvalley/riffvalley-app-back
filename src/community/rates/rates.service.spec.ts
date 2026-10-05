import { ForbiddenException } from '@nestjs/common';
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
});
