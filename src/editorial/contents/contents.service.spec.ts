import { Content, ContentType } from './entities/content.entity';
import { ContentsService } from './contents.service';
import { List, ListType } from 'src/editorial/lists/entities/list.entity';

describe('ContentsService List synchronization', () => {
  const makeContent = (overrides: Partial<Content> = {}) =>
    ({
      id: 'content-id',
      type: ContentType.BEST,
      name: 'Monthly list',
      publicationDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
      list: { id: 'list-id' } as List,
      ...overrides,
    }) as Content;

  const makeList = () => ({
    id: 'list-id',
    type: ListType.MONTH,
    releaseDate: new Date('2026-10-01T00:00:00.000Z'),
    closeDate: new Date('2026-10-05T00:00:00.000Z'),
    listDate: new Date('2026-10-03T00:00:00.000Z'),
  });

  const makeService = (content = makeContent()) => {
    const list = makeList();
    const txContentRepository = {
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn().mockResolvedValue(content),
    };
    const txListRepository = {
      findOne: jest.fn().mockResolvedValue(list),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === Content ? txContentRepository : txListRepository,
      ),
    };
    const transaction = jest.fn(async (callback) => callback(manager));
    const contentRepository = {
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
      findOne: jest.fn().mockResolvedValue(content),
      remove: jest.fn().mockResolvedValue(content),
      manager: { transaction },
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'author-id' }),
    };
    const reunionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const listsService = {
      createWeeklyList: jest.fn().mockResolvedValue(list),
      createMonthlyList: jest.fn().mockResolvedValue(list),
      removeList: jest.fn().mockResolvedValue(list),
    };
    const service = new ContentsService(
      contentRepository as any,
      userRepository as any,
      reunionRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      listsService as any,
    );

    return {
      service,
      content,
      list,
      contentRepository,
      txContentRepository,
      txListRepository,
      userRepository,
      reunionRepository,
      listsService,
      manager,
      transaction,
    };
  };

  it('saves Content and its List in the same transaction for date updates', async () => {
    const {
      service,
      content,
      list,
      txContentRepository,
      txListRepository,
      manager,
      transaction,
    } = makeService();
    jest.spyOn(service, 'findOne').mockResolvedValue(content);

    await service.update('content-id', {
      publicationDate: '2026-11-01T00:00:00.000Z',
      closeDate: null,
      listDate: null,
    } as any);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(Content);
    expect(manager.getRepository).toHaveBeenCalledWith(List);
    expect(txContentRepository.save).toHaveBeenCalledTimes(1);
    expect(txListRepository.save).toHaveBeenCalledTimes(1);
    expect(list.releaseDate).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(list.closeDate).toBeNull();
    expect(list.listDate).toBeNull();
  });

  it('preserves omitted date values and does not open a pair transaction', async () => {
    const { service, content, list, contentRepository, transaction } =
      makeService();
    jest.spyOn(service, 'findOne').mockResolvedValue(content);

    await service.update('content-id', { name: 'Renamed' } as any);

    expect(transaction).not.toHaveBeenCalled();
    expect(contentRepository.save).toHaveBeenCalledWith(content);
    expect(list.releaseDate).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(list.closeDate).toEqual(new Date('2026-10-05T00:00:00.000Z'));
    expect(list.listDate).toEqual(new Date('2026-10-03T00:00:00.000Z'));
  });

  it('creates RADAR Content and its List using the same manager', async () => {
    const {
      service,
      contentRepository,
      txContentRepository,
      listsService,
      manager,
      transaction,
    } = makeService();

    const result = await service.create({
      type: ContentType.RADAR,
      name: 'Radar semanal',
      authorId: 'author-id',
      publicationDate: '2026-10-01T00:00:00.000Z',
    } as any);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).toHaveBeenCalledTimes(2);
    expect(contentRepository.save).not.toHaveBeenCalled();
    expect(listsService.createWeeklyList).toHaveBeenCalledWith(
      new Date('2026-10-01T00:00:00.000Z'),
      undefined,
      undefined,
      manager,
    );
    expect(result.list).toMatchObject({ id: 'list-id' });
  });

  it('rolls back the Content/List deletion pair when List removal fails', async () => {
    const content = makeContent();
    const { service, txContentRepository, listsService, manager, transaction } =
      makeService(content);
    const listError = new Error('list delete failed');
    listsService.removeList.mockRejectedValue(listError);

    await expect(service.remove('content-id')).rejects.toBe(listError);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.remove).toHaveBeenCalledWith(content);
    expect(listsService.removeList).toHaveBeenCalledWith('list-id', manager);
  });

  it('deletes Content and its List together when both operations succeed', async () => {
    const content = makeContent();
    const { service, txContentRepository, listsService, manager, transaction } =
      makeService(content);

    await service.remove('content-id');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.remove).toHaveBeenCalledWith(content);
    expect(listsService.removeList).toHaveBeenCalledWith('list-id', manager);
  });
});
