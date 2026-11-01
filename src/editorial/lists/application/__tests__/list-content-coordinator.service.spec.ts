import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UpdateListDto } from '../../dto/update-list.dto';
import { List, ListType } from '../../entities/list.entity';
import {
  Content,
  ContentType,
} from 'src/editorial/contents/entities/content.entity';
import { ListContentCoordinator } from '../list-content-coordinator.service';
import { ContentCalendarEventPublisher } from 'src/editorial/contents/realtime/content-calendar-event-publisher.service';

type TrackedList = List & { deleted?: boolean };
type TrackedContent = Content & { deleted?: boolean };
type DateField = 'listDate' | 'releaseDate' | 'closeDate';

function updateWithDate(field: DateField, value: string | null): UpdateListDto {
  const update = new UpdateListDto();
  update[field] = value;
  return update;
}

function updateList(values: Partial<UpdateListDto>): UpdateListDto {
  return Object.assign(new UpdateListDto(), values);
}

describe('ListContentCoordinator List/Content writes', () => {
  const linkedContent = (): TrackedContent =>
    Object.assign(new Content(), {
      id: 'content-id',
      type: ContentType.BEST,
      name: 'Editorial content',
      publicationDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
      deleted: undefined,
    });

  const makeTransactionalService = (
    overrides: {
      listSaveError?: Error;
      contentSaveError?: Error;
      listRemoveError?: Error;
      contentRemoveError?: Error;
      hasContent?: boolean;
      contentType?: ContentType;
      listType?: ListType;
      listDates?: Partial<Record<DateField, Date | null>>;
    } = {},
  ) => {
    const list: TrackedList = Object.assign(new List(), {
      id: 'list-id',
      type: overrides.listType ?? ListType.WEEK,
      name: 'Radar',
      releaseDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
      deleted: undefined,
    });
    Object.assign(list, overrides.listDates);
    const content = linkedContent();
    content.type = overrides.contentType ?? content.type;
    const listSnapshot = { ...list };
    const contentSnapshot = { ...content };

    const rootManager = new DataSource({ type: 'postgres' }).manager;
    const manager = new DataSource({ type: 'postgres' }).manager;
    const listRepository = new Repository(List, rootManager);
    const contentRepository = new Repository(Content, rootManager);
    const txListRepository = new Repository(List, manager);
    const txContentRepository = new Repository(Content, manager);

    const listPreload = jest
      .spyOn(listRepository, 'preload')
      .mockImplementation(async (values) =>
        Object.assign(new List(), list, values),
      );
    const listSave = jest
      .spyOn(listRepository, 'save')
      .mockImplementation(async (value) => Object.assign(new List(), value));
    const rootListFindOne = jest
      .spyOn(listRepository, 'findOne')
      .mockResolvedValue(list);
    const listRemove = jest
      .spyOn(listRepository, 'remove')
      .mockResolvedValue(list);
    const rootContentFindOne = jest
      .spyOn(contentRepository, 'findOne')
      .mockResolvedValue(overrides.hasContent === false ? null : content);
    const rootContentSave = jest
      .spyOn(contentRepository, 'save')
      .mockImplementation(async (value) => Object.assign(new Content(), value));
    const rootContentRemove = jest
      .spyOn(contentRepository, 'remove')
      .mockResolvedValue(content);

    const txListPreload = jest
      .spyOn(txListRepository, 'preload')
      .mockImplementation(async (values) =>
        Object.assign(new List(), list, values),
      );
    const txListSave = jest
      .spyOn(txListRepository, 'save')
      .mockImplementation(async (value) => {
        if (overrides.listSaveError) throw overrides.listSaveError;
        Object.assign(list, value);
        return list;
      });
    const txListFindOne = jest
      .spyOn(txListRepository, 'findOne')
      .mockResolvedValue(list);
    const txListFindOneBy = jest
      .spyOn(txListRepository, 'findOneBy')
      .mockResolvedValue(list);
    const txListRemove = jest
      .spyOn(txListRepository, 'remove')
      .mockImplementation(async () => {
        if (overrides.listRemoveError) throw overrides.listRemoveError;
        list.deleted = true;
        return list;
      });
    const txContentFindOne = jest
      .spyOn(txContentRepository, 'findOne')
      .mockResolvedValue(content);
    const txContentSave = jest
      .spyOn(txContentRepository, 'save')
      .mockImplementation(async (value) => {
        if (overrides.contentSaveError) throw overrides.contentSaveError;
        Object.assign(content, value);
        return content;
      });
    const txContentRemove = jest
      .spyOn(txContentRepository, 'remove')
      .mockImplementation(async () => {
        if (overrides.contentRemoveError) throw overrides.contentRemoveError;
        content.deleted = true;
        return content;
      });

    const overLimitGroups: Array<{ position: number }> = [];
    const query = jest
      .spyOn(manager, 'query')
      .mockImplementation(async (sql) =>
        sql.includes('SELECT position FROM asignation') ? overLimitGroups : [],
      );
    const getRepository = jest
      .spyOn(manager, 'getRepository')
      .mockImplementation((target) =>
        target === List ? txListRepository : txContentRepository,
      );
    const transaction = jest.spyOn(rootManager, 'transaction');
    transaction.mockImplementation(async (isolationOrCallback, callback) => {
      const runInTransaction =
        typeof isolationOrCallback === 'function'
          ? isolationOrCallback
          : callback;
      if (!runInTransaction) throw new Error('Transaction callback required');
      try {
        return await runInTransaction(manager);
      } catch (error) {
        Object.assign(list, listSnapshot);
        Object.assign(content, contentSnapshot);
        list.deleted = listSnapshot.deleted;
        content.deleted = contentSnapshot.deleted;
        throw error;
      }
    });

    const eventPublisher = new ContentCalendarEventPublisher();
    jest.spyOn(eventPublisher, 'publishChangeSafely');
    const service = new ListContentCoordinator(
      listRepository,
      contentRepository,
      eventPublisher,
    );

    return {
      service,
      eventPublisher,
      list,
      content,
      listRepository,
      contentRepository,
      txListRepository,
      txContentRepository,
      manager,
      overLimitGroups,
      transaction,
      query,
      getRepository,
      listPreload,
      listSave,
      rootListFindOne,
      listRemove,
      rootContentFindOne,
      rootContentSave,
      rootContentRemove,
      txListPreload,
      txListSave,
      txListFindOne,
      txListFindOneBy,
      txListRemove,
      txContentFindOne,
      txContentSave,
      txContentRemove,
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
      eventPublisher,
    } = makeTransactionalService();

    await service.update(
      'list-id',
      updateList({
        releaseDate: '2026-11-01T00:00:00.000Z',
        closeDate: null,
        listDate: null,
      }),
    );

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
    expect(eventPublisher.publishChangeSafely).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing when a List update does not change linked Content', async () => {
    const { service, eventPublisher } = makeTransactionalService();

    await service.update(
      'list-id',
      updateWithDate('releaseDate', '2026-10-01T00:00:00.000Z'),
    );

    expect(eventPublisher.publishChangeSafely).not.toHaveBeenCalled();
  });

  it('leaves all synchronized dates unchanged when date fields are omitted', async () => {
    const { service, content, transaction, contentRepository } =
      makeTransactionalService();

    await service.update('list-id', { name: 'Renamed' });

    expect(transaction).not.toHaveBeenCalled();
    expect(content.publicationDate).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(content.closeDate).toEqual(new Date('2026-10-05T00:00:00.000Z'));
    expect(content.listDate).toEqual(new Date('2026-10-03T00:00:00.000Z'));
    expect(contentRepository.save).not.toHaveBeenCalled();
  });

  it('preserves omitted dates and avoids a transaction when no Content is linked', async () => {
    const { service, listRepository, contentRepository, transaction } =
      makeTransactionalService({ hasContent: false });

    await service.update('list-id', { name: 'Renamed' });

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

    await service.update('list-id', { type: ListType.WEEK });

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
      service.update('list-id', { type: ListType.WEEK }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('preserves the required RADAR publication date when releaseDate is null', async () => {
    const { service, listRepository, transaction } = makeTransactionalService({
      contentType: ContentType.RADAR,
    });

    await expect(
      service.update('list-id', updateWithDate('releaseDate', null)),
    ).rejects.toMatchObject({ status: 400 });

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('preserves the required REUNION publication date when releaseDate is null', async () => {
    const { service, listRepository, transaction } = makeTransactionalService({
      contentType: ContentType.REUNION,
    });

    await expect(
      service.update('list-id', updateWithDate('releaseDate', null)),
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
        service.update('list-id', updateWithDate('releaseDate', null)),
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

    await service.update('list-id', { name: 'Special list' });

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
        service.update(
          'list-id',
          updateWithDate(field, '2026-10-01T00:00:00.000Z'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(listRepository.save).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('rolls the paired update back when saving List fails', async () => {
    const error = new Error('list write failed');
    const { service, txContentRepository, transaction } =
      makeTransactionalService({ listSaveError: error });

    await expect(
      service.update('list-id', updateWithDate('closeDate', null)),
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
    } = makeTransactionalService({ contentSaveError: error });

    await expect(
      service.update('list-id', updateWithDate('closeDate', null)),
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
    const {
      service,
      content,
      list,
      txContentRepository,
      transaction,
      eventPublisher,
    } = makeTransactionalService({ listRemoveError: error });

    await expect(service.removeList('list-id')).rejects.toBe(error);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.remove).toHaveBeenCalledTimes(1);
    expect(content.deleted).toBeUndefined();
    expect(list.deleted).toBeUndefined();
    expect(eventPublisher.publishChangeSafely).not.toHaveBeenCalled();
  });

  it('commits the related Content and List deletion through one manager', async () => {
    const { service, content, list, transaction, eventPublisher } =
      makeTransactionalService();

    await service.removeList('list-id');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(content.deleted).toBe(true);
    expect(list.deleted).toBe(true);
    expect(eventPublisher.publishChangeSafely).toHaveBeenCalledTimes(1);
  });

  it('deletes an unlinked List directly without opening a transaction', async () => {
    const { service, listRepository, transaction, eventPublisher } =
      makeTransactionalService({ hasContent: false });

    await service.removeList('list-id');

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.remove).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishChangeSafely).not.toHaveBeenCalled();
  });

  it('uses a manager supplied by the caller without opening a nested transaction', async () => {
    const {
      service,
      transaction,
      manager,
      txContentRepository,
      txListRepository,
      eventPublisher,
    } = makeTransactionalService();

    await service.removeList('list-id', manager);

    expect(transaction).not.toHaveBeenCalled();
    expect(txContentRepository.remove).toHaveBeenCalledTimes(1);
    expect(txListRepository.remove).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishChangeSafely).not.toHaveBeenCalled();
  });

  it('does not delete List when deleting linked Content fails', async () => {
    const error = new Error('content delete failed');
    const { service, txContentRepository, txListRepository, transaction } =
      makeTransactionalService({ contentRemoveError: error });

    await expect(service.removeList('list-id')).rejects.toBe(error);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.remove).toHaveBeenCalledTimes(1);
    expect(txListRepository.remove).not.toHaveBeenCalled();
  });
});
