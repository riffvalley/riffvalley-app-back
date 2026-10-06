import { RatesHistoryService } from './rates-history.service';

describe('Rates history characterization', () => {
  const createdAt = new Date('2025-04-02T10:15:00.000Z');
  const updatedAt = new Date('2025-04-03T11:30:00.000Z');

  function createRepository(rates: any[], counts: number[] = [0, 0]) {
    const queryBuilder: any = {};
    for (const method of [
      'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'take',
    ]) {
      queryBuilder[method] = jest.fn(() => queryBuilder);
    }
    queryBuilder.clone = jest.fn(() => queryBuilder);
    queryBuilder.getMany = jest.fn().mockResolvedValue(rates);
    queryBuilder.getCount = jest.fn()
      .mockResolvedValueOnce(counts[0])
      .mockResolvedValueOnce(counts[1]);

    return {
      repository: { createQueryBuilder: jest.fn(() => queryBuilder) },
      queryBuilder,
    };
  }

  it('keeps created and updated events, nullable scores, artistless discs, JSON shape and event counts', async () => {
    const rate = {
      id: 'rate-1',
      createdAt,
      editedAt: updatedAt,
      rate: null,
      cover: 0,
      disc: { id: 'disc-1', name: 'Record', artist: null },
    };
    const { repository, queryBuilder } = createRepository([rate], [1, 1]);
    const service = new RatesHistoryService(repository as any);

    const result = await service.findUserActionHistoryPaginatedQB('user-1', {});

    expect(result).toEqual({
      userId: 'user-1',
      type: 'both',
      order: 'DESC',
      totalItems: 2,
      totalPages: 1,
      currentPage: 1,
      limit: 20,
      data: [
        {
          rateId: 'rate-1', action: 'updated', timestamp: updatedAt,
          dayLabel: '3-4', rate: null, cover: 0,
          disc: { id: 'disc-1', name: 'Record', artist: undefined },
        },
        {
          rateId: 'rate-1', action: 'created', timestamp: createdAt,
          dayLabel: '2-4', rate: null, cover: 0,
          disc: { id: 'disc-1', name: 'Record', artist: undefined },
        },
      ],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(rate.rate IS NOT NULL OR rate.cover IS NOT NULL)',
    );
    expect(JSON.parse(JSON.stringify(result)).data[0]).toEqual({
      rateId: 'rate-1', action: 'updated', timestamp: updatedAt.toISOString(),
      dayLabel: '3-4', rate: null, cover: 0,
      disc: { id: 'disc-1', name: 'Record' },
    });
    expect(queryBuilder.getCount).toHaveBeenCalledTimes(2);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('rate.editedAt', 'DESC', 'NULLS LAST');
    expect(queryBuilder.take).toHaveBeenCalledWith(60);
  });

  it('applies a complete inclusive event range to candidates and both event counts', async () => {
    const start = updatedAt;
    const end = updatedAt;
    const { repository, queryBuilder } = createRepository([
      { id: 'rate-1', createdAt, editedAt: updatedAt, rate: 8, cover: null, disc: { id: 'disc-1' } },
    ], [0, 1]);
    const service = new RatesHistoryService(repository as any);

    const result = await service.findUserActionHistoryPaginatedQB('user-1', {
      type: 'rate', order: 'ASC', limit: 5, offset: 0, dateRange: [start, end],
    });

    expect(result).toMatchObject({
      type: 'rate', order: 'ASC', totalItems: 1, totalPages: 1, currentPage: 1,
      limit: 5, data: [{ action: 'updated', rate: 8, cover: null }],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('rate.rate IS NOT NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(rate.createdAt BETWEEN :start AND :end OR (rate.editedAt IS NOT NULL AND rate.editedAt > rate.createdAt AND rate.editedAt BETWEEN :start AND :end))',
      { start, end },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('rate.createdAt BETWEEN :start AND :end', { start, end });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('rate.editedAt BETWEEN :start AND :end', { start, end });
    expect(queryBuilder.take).toHaveBeenCalledWith(15);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('rate.editedAt', 'ASC', 'NULLS FIRST');
  });

  it('uses the cover predicate and preserves stable insertion order for equal timestamps while paging events', async () => {
    const tiedAt = new Date('2025-04-02T10:15:00.000Z');
    const rates = [
      { id: 'rate-1', createdAt: tiedAt, editedAt: tiedAt, rate: null, cover: 1, disc: { id: 'disc-1' } },
      { id: 'rate-2', createdAt: tiedAt, editedAt: null, rate: 5, cover: 2, disc: { id: 'disc-2' } },
    ];
    const { repository, queryBuilder } = createRepository(rates, [2, 0]);
    const service = new RatesHistoryService(repository as any);

    const result = await service.findUserActionHistoryPaginatedQB('user-1', {
      type: 'cover', order: 'ASC', limit: 1, offset: 1,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('rate.cover IS NOT NULL');
    expect(result.data.map((event) => [event.rateId, event.action])).toEqual([
      ['rate-2', 'created'],
    ]);
    expect(result).toMatchObject({ totalItems: 2, totalPages: 2, currentPage: 2, limit: 1 });
    expect(queryBuilder.take).toHaveBeenCalledWith(3);
    expect(queryBuilder.getCount).toHaveBeenCalledTimes(2);
  });
});
