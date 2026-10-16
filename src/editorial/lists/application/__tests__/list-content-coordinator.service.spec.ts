import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { List, ListType } from '../../entities/list.entity';
import {
  Content,
  ContentType,
} from 'src/editorial/contents/entities/content.entity';
import { ListContentCoordinator } from '../list-content-coordinator.service';

describe('ListContentCoordinator List/Content writes', () => {
  const linkedContent = () => ({
    id: 'content-id',
    type: ContentType.BEST,
    publicationDate: new Date('2026-10-01T00:00:00.000Z'),
    closeDate: new Date('2026-10-05T00:00:00.000Z'),
    listDate: new Date('2026-10-03T00:00:00.000Z'),
  });

  const makeTransactionalService = (
    overrides: {
      listSave?: jest.Mock;
      contentSave?: jest.Mock;
      listRemove?: jest.Mock;
      contentRemove?: jest.Mock;
      hasContent?: boolean;
      contentType?: ContentType;
      listType?: ListType;
      listDates?: Partial<Pick<List, 'releaseDate' | 'listDate' | 'closeDate'>>;
    } = {},
  ) => {
    const list = {
      id: 'list-id',
      type: overrides.listType ?? ListType.WEEK,
      name: 'Radar',
      releaseDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
      ...overrides.listDates,
    };
    const content = linkedContent();
    content.type = overrides.contentType ?? content.type;
    const listRepository: any = {
      preload: jest
        .fn()
        .mockImplementation(async (values) => ({ ...list, ...values })),
      save: jest.fn().mockImplementation(async (value) => value),
      findOne: jest.fn().mockResolvedValue(list),
      remove: jest.fn().mockResolvedValue(list),
    };
    const contentRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue(overrides.hasContent === false ? null : content),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn().mockResolvedValue(content),
    };
    const txListRepository = {
      preload: jest
        .fn()
        .mockImplementation(async (values) => ({ ...list, ...values })),
      save:
        overrides.listSave ??
        jest.fn().mockImplementation(async (value) => {
          Object.assign(list, value);
          return value;
        }),
      findOne: jest.fn().mockResolvedValue(list),
      remove:
        overrides.listRemove ??
        jest.fn().mockImplementation(async () => {
          (list as any).deleted = true;
          return list;
        }),
    };
    const txContentRepository = {
      findOne: jest.fn().mockResolvedValue(content),
      save:
        overrides.contentSave ??
        jest.fn().mockImplementation(async (value) => {
          Object.assign(content, value);
          return value;
        }),
      remove:
        overrides.contentRemove ??
        jest.fn().mockImplementation(async () => {
          (content as any).deleted = true;
          return content;
        }),
    };
    const overLimitGroups: any[] = [];
    const manager = {
      query: jest.fn(async (sql) =>
        sql.includes('SELECT position FROM asignation')
          ? overLimitGroups
          : undefined,
      ),
      getRepository: jest.fn((entity) =>
        entity === List
          ? {
              ...txListRepository,
              findOneBy: jest.fn().mockResolvedValue(list),
            }
          : txContentRepository,
      ),
    };
    const transaction = jest.fn(async (callback) => {
      const listSnapshot = { ...list };
      const contentSnapshot = { ...content };
      try {
        return await callback(manager);
      } catch (error) {
        for (const key of Object.keys(list)) {
          if (!(key in listSnapshot)) delete (list as any)[key];
        }
        for (const key of Object.keys(content)) {
          if (!(key in contentSnapshot)) delete (content as any)[key];
        }
        Object.assign(list, listSnapshot);
        Object.assign(content, contentSnapshot);
        throw error;
      }
    });
    listRepository.manager = { transaction };

    const service = new ListContentCoordinator(
      listRepository as any,
      contentRepository as any,
    );

    return {
      service,
      list,
      content,
      listRepository,
      contentRepository,
      txListRepository,
      txContentRepository,
      manager,
      overLimitGroups,
      transaction,
    };
  };

  it('synchronizes valid dates and explicit nulls in one transaction', async () => {
    const {
      service,
      content,
      txListRepository,
      txContentRepository,
      manager,
      transaction,
    } = makeTransactionalService();

    await service.update('list-id', {
      releaseDate: '2026-11-01T00:00:00.000Z',
      closeDate: null,
      listDate: null,
    } as any);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(List);
    expect(manager.getRepository).toHaveBeenCalledWith(Content);
    expect(txListRepository.save).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).toHaveBeenCalledTimes(1);
    expect(content.publicationDate).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(content.closeDate).toBeNull();
    expect(content.listDate).toBeNull();
  });

  it('leaves all synchronized dates unchanged when date fields are omitted', async () => {
    const { service, content, transaction, contentRepository } =
      makeTransactionalService();

    await service.update('list-id', { name: 'Renamed' } as any);

    expect(transaction).not.toHaveBeenCalled();
    expect(content.publicationDate).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(content.closeDate).toEqual(new Date('2026-10-05T00:00:00.000Z'));
    expect(content.listDate).toEqual(new Date('2026-10-03T00:00:00.000Z'));
    expect(contentRepository.save).not.toHaveBeenCalled();
  });

  it('preserves omitted dates and avoids a transaction when no Content is linked', async () => {
    const { service, list, listRepository, contentRepository, transaction } =
      makeTransactionalService({ hasContent: false });

    await service.update('list-id', { name: 'Renamed' } as any);

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed' }),
    );
    expect(contentRepository.save).not.toHaveBeenCalled();
  });

  it('checks existing Radar groups before changing a non-week list to WEEK', async () => {
    const { service, manager } = makeTransactionalService({
      listType: ListType.MONTH,
      hasContent: false,
    });

    await service.update('list-id', { type: ListType.WEEK } as any);

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['riffvalley:list-type:list-id'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT position FROM asignation'),
      ['list-id'],
    );
  });

  it('rejects changing a list to WEEK when an existing group exceeds four discs', async () => {
    const { service, listRepository, overLimitGroups } =
      makeTransactionalService({ listType: ListType.MONTH, hasContent: false });
    overLimitGroups.push({ position: 2 });

    await expect(
      service.update('list-id', { type: ListType.WEEK } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('preserves the required RADAR publication date when releaseDate is null', async () => {
    const { service, listRepository, transaction } = makeTransactionalService({
      contentType: ContentType.RADAR,
    });

    await expect(
      service.update('list-id', { releaseDate: null } as any),
    ).rejects.toMatchObject({ status: 400 });

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('preserves the required REUNION publication date when releaseDate is null', async () => {
    const { service, listRepository, transaction } = makeTransactionalService({
      contentType: ContentType.REUNION,
    });

    await expect(
      service.update('list-id', { releaseDate: null } as any),
    ).rejects.toMatchObject({ status: 400 });

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it.each([ListType.WEEK, ListType.MONTH])(
    'rejects clearing required %s releaseDate before persistence',
    async (listType) => {
      const { service, listRepository, transaction } = makeTransactionalService(
        { listType, hasContent: false },
      );

      await expect(
        service.update('list-id', { releaseDate: null } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(listRepository.save).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('allows SPECIAL edits without introducing dates and preserves omitted dates', async () => {
    const { service, list, listRepository, transaction } =
      makeTransactionalService({
        listType: ListType.SPECIAL,
        hasContent: false,
        listDates: { releaseDate: null, listDate: null, closeDate: null },
      });

    await service.update('list-id', { name: 'Special list' } as any);

    expect(listRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Special list' }),
    );
    expect(list.releaseDate).toBeNull();
    expect(list.listDate).toBeNull();
    expect(list.closeDate).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['listDate', 'releaseDate', 'closeDate'] as const)(
    'rejects adding %s to a SPECIAL list before persistence',
    async (field) => {
      const { service, listRepository, transaction } = makeTransactionalService(
        {
          listType: ListType.SPECIAL,
          hasContent: false,
          listDates: { releaseDate: null, listDate: null, closeDate: null },
        },
      );

      await expect(
        service.update('list-id', {
          [field]: '2026-10-01T00:00:00.000Z',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(listRepository.save).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('rolls the paired update back when saving List fails', async () => {
    const error = new Error('list write failed');
    const { service, txContentRepository, transaction } =
      makeTransactionalService({
        listSave: jest.fn().mockRejectedValue(error),
      });

    await expect(
      service.update('list-id', { closeDate: null } as any),
    ).rejects.toMatchObject({ status: 500 });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).not.toHaveBeenCalled();
  });

  it('uses the transaction manager for both saves when Content save fails', async () => {
    const error = new Error('content write failed');
    const {
      service,
      list,
      content,
      txListRepository,
      txContentRepository,
      transaction,
    } = makeTransactionalService({
      contentSave: jest.fn().mockRejectedValue(error),
    });

    await expect(
      service.update('list-id', { closeDate: null } as any),
    ).rejects.toMatchObject({ status: 500 });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txListRepository.save).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).toHaveBeenCalledTimes(1);
    expect(list.releaseDate).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(list.closeDate).toEqual(new Date('2026-10-05T00:00:00.000Z'));
    expect(content.publicationDate).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(content.closeDate).toEqual(new Date('2026-10-05T00:00:00.000Z'));
  });

  it('deletes both entities in the transaction and rejects a failed List deletion', async () => {
    const error = new Error('list delete failed');
    const { service, content, list, txContentRepository, transaction } =
      makeTransactionalService({
        listRemove: jest.fn().mockRejectedValue(error),
      });

    await expect(service.removeList('list-id')).rejects.toBe(error);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.remove).toHaveBeenCalledTimes(1);
    expect((content as any).deleted).toBeUndefined();
    expect((list as any).deleted).toBeUndefined();
  });

  it('commits the related Content and List deletion through one manager', async () => {
    const { service, content, list, transaction } = makeTransactionalService();

    await service.removeList('list-id');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect((content as any).deleted).toBe(true);
    expect((list as any).deleted).toBe(true);
  });

  it('deletes an unlinked List directly without opening a transaction', async () => {
    const { service, listRepository, transaction } = makeTransactionalService({
      hasContent: false,
    });

    await service.removeList('list-id');

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.remove).toHaveBeenCalledTimes(1);
  });

  it('uses a manager supplied by the caller without opening a nested transaction', async () => {
    const {
      service,
      transaction,
      manager,
      txContentRepository,
      txListRepository,
    } = makeTransactionalService();

    await service.removeList('list-id', manager as unknown as EntityManager);

    expect(transaction).not.toHaveBeenCalled();
    expect(txContentRepository.remove).toHaveBeenCalledTimes(1);
    expect(txListRepository.remove).toHaveBeenCalledTimes(1);
  });

  it('does not delete List when deleting linked Content fails', async () => {
    const error = new Error('content delete failed');
    const { service, txContentRepository, txListRepository, transaction } =
      makeTransactionalService({
        contentRemove: jest.fn().mockRejectedValue(error),
      });

    await expect(service.removeList('list-id')).rejects.toBe(error);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.remove).toHaveBeenCalledTimes(1);
    expect(txListRepository.remove).not.toHaveBeenCalled();
  });
});
