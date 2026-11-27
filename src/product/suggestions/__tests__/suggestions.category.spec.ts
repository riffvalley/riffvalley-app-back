import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { User } from '../../../identity/auth/entities/user.entity';
import {
  Suggestion,
  SuggestionCategory,
  SuggestionType,
  SuggestionStatus,
} from '../entities/suggestion.entity';
import { SuggestionsService } from '../suggestions.service';
import { VersionItem } from '../../versions/entities/version-item.entity';

describe('SuggestionsService category behavior', () => {
  it('persists the selected category for a categorized suggestion or bug', async () => {
    const { service, repository } = createSuggestionsService();
    const suggestion = Object.assign(new Suggestion(), {
      id: 'suggestion-1',
      category: SuggestionCategory.EVENTS,
    });
    jest.spyOn(repository, 'create').mockReturnValue(suggestion);
    jest.spyOn(repository, 'save').mockResolvedValue(suggestion);
    const user = Object.assign(new User(), { id: 'user-1' });

    await expect(
      service.create(
        {
          title: 'Festival filter',
          description: 'Add a festival filter',
          type: SuggestionType.BUG,
          category: SuggestionCategory.EVENTS,
        },
        user,
      ),
    ).resolves.toMatchObject({
      id: 'suggestion-1',
      category: SuggestionCategory.EVENTS,
    });
    expect(repository.create).toHaveBeenCalledWith({
      title: 'Festival filter',
      description: 'Add a festival filter',
      type: SuggestionType.BUG,
      category: SuggestionCategory.EVENTS,
      user,
    });
    expect(repository.save).toHaveBeenCalledWith(suggestion);
  });

  it('persists an administrative category correction', async () => {
    const { service, repository } = createSuggestionsService();
    const suggestion = Object.assign(new Suggestion(), {
      id: 'suggestion-2',
      category: SuggestionCategory.ALBUMS,
    });
    jest.spyOn(service, 'findOne').mockResolvedValue(suggestion);
    jest.spyOn(repository, 'save').mockResolvedValue(suggestion);

    await service.update('suggestion-2', {
      category: SuggestionCategory.RANKINGS,
    });

    expect(suggestion.category).toBe(SuggestionCategory.RANKINGS);
    expect(repository.save).toHaveBeenCalledWith(suggestion);
  });

  it('filters rows by category and keeps state counts independent of status', async () => {
    const { service, repository, countQuery } = createSuggestionsService();
    jest.spyOn(repository, 'find').mockResolvedValue([]);
    countQuery.getRawMany.mockResolvedValue([
      { status: SuggestionStatus.IN_PROGRESS, count: '2' },
      { status: SuggestionStatus.REJECTED, count: '1' },
    ]);

    await expect(
      service.findAll({
        type: SuggestionType.BUG,
        status: SuggestionStatus.REJECTED,
        category: SuggestionCategory.ALBUMS,
      }),
    ).resolves.toEqual({
      data: [],
      counts: { in_progress: 2, done: 0, rejected: 1 },
    });

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: SuggestionType.BUG,
          status: SuggestionStatus.REJECTED,
          category: SuggestionCategory.ALBUMS,
        },
      }),
    );
    expect(countQuery.where).toHaveBeenCalledWith(
      's.type = :type AND s.category = :category',
      { type: SuggestionType.BUG, category: SuggestionCategory.ALBUMS },
    );
    expect(countQuery.where.mock.calls[0]?.[0]).not.toContain('status');
  });

  it('filters historical rows with category=uncategorized and includes that filter in counts', async () => {
    const { service, repository, countQuery } = createSuggestionsService();
    jest.spyOn(repository, 'find').mockResolvedValue([]);

    await service.findAll({ category: 'uncategorized' });

    const findOptions = jest.mocked(repository.find).mock.calls[0]?.[0];
    expect(findOptions?.where).toEqual(
      expect.objectContaining({ category: expect.any(Object) }),
    );
    expect(countQuery.where).toHaveBeenCalledWith('s.category IS NULL', {});
  });

  it('returns category-filtered personal rows and counts for the authenticated user', async () => {
    const { service, repository, countQuery } = createSuggestionsService();
    jest.spyOn(repository, 'find').mockResolvedValue([]);
    countQuery.getRawMany.mockResolvedValue([
      { status: SuggestionStatus.DONE, count: '4' },
    ]);
    const user = Object.assign(new User(), { id: 'user-1' });

    await expect(
      service.findByUser(user, {
        type: SuggestionType.SUGGESTION,
        category: SuggestionCategory.EVENTS,
      }),
    ).resolves.toEqual({
      data: [],
      counts: { in_progress: 0, done: 4, rejected: 0 },
    });

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          type: SuggestionType.SUGGESTION,
          category: SuggestionCategory.EVENTS,
        }),
      }),
    );
    expect(countQuery.where).toHaveBeenCalledWith(
      's.type = :type AND s.userId = :userId AND s.category = :category',
      {
        type: SuggestionType.SUGGESTION,
        userId: 'user-1',
        category: SuggestionCategory.EVENTS,
      },
    );
  });
});

function createSuggestionsService() {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'suggestions-category-test',
  });
  const repository = new Repository<Suggestion>(
    Suggestion,
    new EntityManager(dataSource),
  );
  const countQuery = Object.assign(
    Object.create(null) as SelectQueryBuilder<Suggestion>,
    {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    },
  );
  jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(countQuery);
  const versionItemRepository = new Repository<VersionItem>(
    VersionItem,
    new EntityManager(dataSource),
  );

  return {
    service: new SuggestionsService(repository, versionItemRepository),
    repository,
    countQuery,
  };
}
