import { ImportConflictsService } from '../import-conflicts.service';

describe('ImportConflictsService', () => {
  it('queries only relevant localities and date ranges without filtering unresolved artist candidates or invoking writes', async () => {
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repository = {
      createQueryBuilder: jest.fn(() => builder),
      save: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const service = new ImportConflictsService(repository as never);
    await service.inspect([
      {
        rowId: 'r1',
        type: 'concert',
        name: null,
        artists: [
          { name: 'Metallica', status: 'existing', artistId: 'artist-id' },
        ],
        startDate: '2027-05-15',
        endDate: null,
        locality: { status: 'existing', localityId: 'madrid' },
      },
      {
        rowId: 'r2',
        type: 'festival',
        name: 'Fest',
        artists: [],
        startDate: '2027-05-12',
        endDate: '2027-05-18',
        locality: { status: 'existing', localityId: 'madrid' },
      },
      {
        rowId: 'r3',
        type: 'concert',
        artists: [],
        startDate: '2027-05-12',
        locality: {
          status: 'created',
          provisionalIdentity: {
            administrativeRegionId: 'region-id',
            city: 'Santander',
          },
        },
      },
    ]);
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('event');
    expect(builder.where).toHaveBeenCalledWith(
      'venue.localityId IN (:...localityIds)',
      { localityIds: ['madrid'] },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'event.startDate <= :toDate',
      { toDate: '2027-05-18' },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'COALESCE(event.endDate, event.startDate) >= :fromDate',
      { fromDate: '2027-05-12' },
    );
    expect(builder.andWhere).toHaveBeenCalledWith('event.type IN (:...types)', {
      types: ['concert', 'festival'],
    });
    expect(builder.andWhere).toHaveBeenCalledTimes(3);
    expect(builder.getMany).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('skips PostgreSQL when all locality identities are provisional', async () => {
    const repository = { createQueryBuilder: jest.fn() };
    const service = new ImportConflictsService(repository as never);
    const results = await service.inspect([
      {
        rowId: 'new-row',
        type: 'concert',
        artists: [],
        startDate: '2027-05-15',
        locality: {
          status: 'created',
          provisionalIdentity: {
            administrativeRegionId: 'region-id',
            city: 'Santander',
          },
        },
      },
    ]);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    expect(results).toEqual([{ rowId: 'new-row', conflicts: [] }]);
  });

  it('loads candidates in bounded locality groups using each group date range', async () => {
    const builders: Array<{
      where: jest.Mock;
      andWhere: jest.Mock;
      getMany: jest.Mock;
    }> = [];
    const repository = {
      createQueryBuilder: jest.fn(() => {
        const builder = {
          innerJoinAndSelect: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        };
        builders.push(builder);
        return builder;
      }),
    };
    const service = new ImportConflictsService(repository as never);
    const rows = Array.from({ length: 26 }, (_value, index) => ({
      rowId: `row-${index}`,
      type: 'concert' as const,
      artists: [],
      startDate: `2027-05-${String(index + 1).padStart(2, '0')}`,
      locality: {
        status: 'existing' as const,
        localityId: `locality-${index}`,
      },
    }));

    await service.inspect(rows);

    expect(repository.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(builders[0].where).toHaveBeenCalledWith(
      'venue.localityId IN (:...localityIds)',
      { localityIds: rows.slice(0, 25).map((row) => row.locality.localityId) },
    );
    expect(builders[0].andWhere).toHaveBeenCalledWith(
      'event.startDate <= :toDate',
      { toDate: '2027-05-25' },
    );
    expect(builders[1].where).toHaveBeenCalledWith(
      'venue.localityId IN (:...localityIds)',
      { localityIds: ['locality-25'] },
    );
    expect(builders[1].andWhere).toHaveBeenCalledWith(
      'event.startDate <= :toDate',
      { toDate: '2027-05-26' },
    );
    expect(builders[0].andWhere).toHaveBeenCalledWith(
      'COALESCE(event.endDate, event.startDate) >= :fromDate',
      { fromDate: '2027-05-01' },
    );
    expect(builders[1].andWhere).toHaveBeenCalledWith(
      'COALESCE(event.endDate, event.startDate) >= :fromDate',
      { fromDate: '2027-05-26' },
    );
  });

  it('deduplicates a multi-day festival candidate returned by adjacent query groups', async () => {
    const festival = {
      id: 'existing-festival',
      type: 'festival',
      name: 'Shared Festival',
      startDate: '2027-05-01',
      endDate: '2027-06-30',
      venue: { localityId: 'locality-id' },
      lineup: [],
    };
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([festival]),
    };
    const repository = { createQueryBuilder: jest.fn(() => builder) };
    const service = new ImportConflictsService(repository as never);
    const rows = Array.from({ length: 26 }, (_value, index) => ({
      rowId: `festival-row-${index}`,
      type: 'festival' as const,
      name: 'Shared Festival',
      artists: [],
      startDate: `2027-05-${String(index + 2).padStart(2, '0')}`,
      locality: { status: 'existing' as const, localityId: 'locality-id' },
    }));

    const results = await service.inspect(rows);

    expect(builder.getMany).toHaveBeenCalledTimes(2);
    expect(results.every((result) => result.conflicts.length === 1)).toBe(true);
    expect(
      results.every(
        (result) =>
          result.conflicts[0].existingEventIds[0] === 'existing-festival',
      ),
    ).toBe(true);
  });
});
