import { ImportConflictsService } from '../import-conflicts.service';

describe('ImportConflictsService', () => {
  it('queries only relevant localities and the batch date range without invoking writes', async () => {
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
    expect(builder.andWhere).toHaveBeenCalledWith(
      '(event.type = :festivalType OR lineup.artistId IS NULL OR lineup.artistId IN (:...artistIds))',
      { festivalType: 'festival', artistIds: ['artist-id'] },
    );
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
});
