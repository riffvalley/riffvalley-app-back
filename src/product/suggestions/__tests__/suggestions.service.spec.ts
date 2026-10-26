import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Suggestion } from '../entities/suggestion.entity';
import { SuggestionsService } from '../suggestions.service';
import { VersionItem } from '../../versions/entities/version-item.entity';

describe('SuggestionsService sidebar summary read', () => {
  it('selects only IDs in progress and does not load suggestion entities', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      database: 'suggestions-sidebar-summary-test',
    });
    const repository = new Repository<Suggestion>(
      Suggestion,
      new EntityManager(dataSource),
    );
    const select = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const getRawMany = jest
      .fn()
      .mockResolvedValue([{ id: 'suggestion-1' }, { id: 'suggestion-2' }]);
    const queryBuilder = Object.assign(
      Object.create(null) as SelectQueryBuilder<Suggestion>,
      { select, where, getRawMany },
    );
    jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(queryBuilder);
    const find = jest.spyOn(repository, 'find');
    const versionItemRepository = new Repository<VersionItem>(
      VersionItem,
      new EntityManager(dataSource),
    );
    const service = new SuggestionsService(repository, versionItemRepository);

    await expect(service.listInProgressSuggestionIds()).resolves.toEqual([
      'suggestion-1',
      'suggestion-2',
    ]);
    expect(select).toHaveBeenCalledWith('suggestion.id', 'id');
    expect(where).toHaveBeenCalledWith('suggestion.status = :status', {
      status: 'in_progress',
    });
    expect(getRawMany).toHaveBeenCalledTimes(1);
    expect(find).not.toHaveBeenCalled();
  });

  it('propagates query failures', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      database: 'suggestions-sidebar-summary-failure-test',
    });
    const repository = new Repository<Suggestion>(
      Suggestion,
      new EntityManager(dataSource),
    );
    const queryBuilder = Object.assign(
      Object.create(null) as SelectQueryBuilder<Suggestion>,
      {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockRejectedValue(new Error('suggestions query failed')),
      },
    );
    jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(queryBuilder);
    const versionItemRepository = new Repository<VersionItem>(
      VersionItem,
      new EntityManager(dataSource),
    );
    const service = new SuggestionsService(repository, versionItemRepository);

    await expect(service.listInProgressSuggestionIds()).rejects.toThrow(
      'suggestions query failed',
    );
  });
});
