import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Content, ContentType } from '../../entities/content.entity';
import { ContentLifecycleService } from '../content-lifecycle.service';
import { List, ListType } from 'src/editorial/lists/entities/list.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import { User } from 'src/identity/auth/entities/user.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';

describe('ContentLifecycleService', () => {
  const makeContent = (overrides: Partial<Content> = {}) =>
    ({
      id: 'content-id',
      type: ContentType.BEST,
      name: 'Monthly list',
      ready: true,
      publicationDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
      list: { id: 'list-id' } as List,
      ...overrides,
    }) as Content;

  const makeFixture = (content = makeContent()) => {
    const list = {
      id: 'list-id',
      type: ListType.MONTH,
      releaseDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
    };
    let pendingWrites: unknown[] = [];
    const committedWrites: unknown[] = [];
    const txContentRepository = {
      save: jest.fn(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
      remove: jest.fn(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
      findOne: jest.fn().mockResolvedValue(content),
    };
    const txListRepository = {
      findOne: jest.fn().mockResolvedValue(list),
      save: jest.fn(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
    };
    const txReunionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'reunion-id',
        titulo: 'Old title',
        fecha: new Date('2026-10-01T00:00:00.000Z'),
      }),
      save: jest.fn(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
      delete: jest.fn(async (id) => {
        pendingWrites.push({ deleteReunion: id });
        return { affected: 1 };
      }),
    };
    const repositories = new Map<Function, any>([
      [Content, txContentRepository],
      [List, txListRepository],
      [Reunion, txReunionRepository],
    ]);
    const manager = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
    };
    const transaction = jest.fn(async (callback) => {
      pendingWrites = [];
      try {
        const result = await callback(manager);
        committedWrites.push(...pendingWrites);
        return result;
      } catch (error) {
        pendingWrites = [];
        throw error;
      }
    });
    const contentRepository = {
      findOne: jest.fn().mockResolvedValue(content),
      save: jest.fn().mockResolvedValue(content),
      remove: jest.fn().mockResolvedValue(content),
      manager: { transaction },
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'author-id' } as User),
    };
    const reunionRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'reunion-id' } as Reunion),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const listRepository = {
      findOne: jest.fn().mockResolvedValue(list),
      save: jest.fn(),
    };
    const listsService = {
      removeList: jest.fn().mockResolvedValue(list),
    };
    const contentQueryService = {
      findOne: jest.fn().mockResolvedValue(content),
    };
    const service = new ContentLifecycleService(
      contentRepository as any,
      userRepository as any,
      reunionRepository as any,
      listRepository as any,
      listsService as unknown as ListsService,
      contentQueryService as any,
    );

    return {
      service,
      content,
      list,
      contentRepository,
      userRepository,
      reunionRepository,
      listRepository,
      listsService,
      contentQueryService,
      txContentRepository,
      txListRepository,
      txReunionRepository,
      manager,
      transaction,
      committedWrites,
    };
  };

  it('updates Content and List in one manager transaction, preserving explicit null dates', async () => {
    const fixture = makeFixture();
    const result = await fixture.service.update('content-id', {
      publicationDate: '2026-11-01T00:00:00.000Z',
      closeDate: null,
      listDate: null,
    } as any);

    expect(result).toBe(fixture.content);
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.contentQueryService.findOne).toHaveBeenCalledWith(
      'content-id',
    );
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Content);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(List);
    expect(fixture.txContentRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.txListRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.list.releaseDate).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(fixture.list.closeDate).toBeNull();
    expect(fixture.list.listDate).toBeNull();
    expect(fixture.content.ready).toBe(false);
  });

  it('preserves omitted dates and null-versus-omitted reunion behavior', async () => {
    const fixture = makeFixture();
    await fixture.service.update('content-id', { name: 'Renamed' } as any);

    expect(fixture.transaction).not.toHaveBeenCalled();
    expect(fixture.contentRepository.save).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.list.releaseDate).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(fixture.list.closeDate).toEqual(
      new Date('2026-10-05T00:00:00.000Z'),
    );

    fixture.content.reunionId = 'reunion-id';
    await fixture.service.update('content-id', { reunionId: null } as any);
    expect(fixture.content.reunionId).toBeNull();
    expect(fixture.reunionRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([ContentType.RADAR, ContentType.BEST, ContentType.REUNION])(
    'rejects cleared or invalid publicationDate for %s before writes',
    async (type) => {
      const fixture = makeFixture(makeContent({ type }));
      for (const publicationDate of [null, '', 'not-a-date']) {
        await expect(
          fixture.service.update('content-id', { publicationDate } as any),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(fixture.contentRepository.save).not.toHaveBeenCalled();
      expect(fixture.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects changing Content to BEST when its current publication date is absent', async () => {
    const fixture = makeFixture(
      makeContent({ type: ContentType.ARTICLE, publicationDate: null }),
    );
    await expect(
      fixture.service.update('content-id', { type: ContentType.BEST } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
  });

  it('validates author and Reunion references with the existing 404 errors', async () => {
    const fixture = makeFixture();
    fixture.userRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.update('content-id', { authorId: 'missing-user' } as any),
    ).rejects.toMatchObject({
      status: 404,
      message: 'User with id missing-user not found',
    });

    fixture.reunionRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.update('content-id', {
        reunionId: 'missing-reunion',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
  });

  it('synchronizes Content and Reunion in the same manager and rolls back on the second write', async () => {
    const content = makeContent({
      type: ContentType.REUNION,
      reunionId: 'reunion-id',
      name: 'New title',
    });
    const fixture = makeFixture(content);
    const reunion = {
      id: 'reunion-id',
      titulo: 'Old title',
      fecha: new Date('2026-10-01T00:00:00.000Z'),
    };
    fixture.txReunionRepository.findOne.mockResolvedValueOnce(reunion);
    fixture.txReunionRepository.save.mockImplementationOnce(async (value) => {
      throw new Error('reunion save failed');
    });

    await expect(
      fixture.service.update('content-id', { name: 'New title' } as any),
    ).rejects.toThrow('reunion save failed');
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Content);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Reunion);
    expect(fixture.committedWrites).toEqual([]);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
  });

  it('uses one manager to synchronize both List and Reunion', async () => {
    const fixture = makeFixture(
      makeContent({ reunionId: 'reunion-id', name: 'Monthly list' }),
    );
    await fixture.service.update('content-id', {
      name: 'Updated monthly list',
      publicationDate: '2026-11-01T00:00:00.000Z',
    } as any);

    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Content);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(List);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Reunion);
  });

  it('rolls back Content when the paired List save fails', async () => {
    const fixture = makeFixture();
    const listError = new Error('list save failed');
    fixture.txListRepository.save.mockRejectedValueOnce(listError);

    await expect(
      fixture.service.update('content-id', {
        closeDate: '2026-11-05T00:00:00.000Z',
      } as any),
    ).rejects.toBe(listError);

    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.txContentRepository.save).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.committedWrites).toEqual([]);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
  });

  it('returns 404 and rolls back if the synchronized List is missing', async () => {
    const fixture = makeFixture();
    fixture.txListRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      fixture.service.update('content-id', {
        listDate: '2026-11-03T00:00:00.000Z',
      } as any),
    ).rejects.toMatchObject({
      status: 404,
      message: 'List with id list-id not found',
    });

    expect(fixture.committedWrites).toEqual([]);
  });

  it('removes Content, List and Reunion in one transaction with the loaded cascade relations', async () => {
    const content = makeContent({ reunion: { id: 'reunion-id' } as Reunion });
    const fixture = makeFixture(content);
    await fixture.service.remove('content-id');

    expect(fixture.contentRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'content-id' },
      relations: ['list', 'reunion', 'riffValleyPlaylist', 'article', 'video'],
    });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.txContentRepository.remove).toHaveBeenCalledWith(content);
    expect(fixture.listsService.removeList).toHaveBeenCalledWith(
      'list-id',
      fixture.manager,
    );
    expect(fixture.txReunionRepository.delete).toHaveBeenCalledWith(
      'reunion-id',
    );
    expect(fixture.contentRepository.remove).not.toHaveBeenCalled();
  });

  it('rolls back removal when the List or Reunion write fails', async () => {
    const listFixture = makeFixture();
    const listError = new Error('list delete failed');
    listFixture.listsService.removeList.mockRejectedValueOnce(listError);
    await expect(listFixture.service.remove('content-id')).rejects.toBe(
      listError,
    );
    expect(listFixture.committedWrites).toEqual([]);

    const reunionFixture = makeFixture(
      makeContent({ reunion: { id: 'reunion-id' } as Reunion }),
    );
    const reunionError = new Error('reunion delete failed');
    reunionFixture.txReunionRepository.delete.mockRejectedValueOnce(
      reunionError,
    );
    await expect(reunionFixture.service.remove('content-id')).rejects.toBe(
      reunionError,
    );
    expect(reunionFixture.committedWrites).toEqual([]);
    expect(reunionFixture.contentRepository.remove).not.toHaveBeenCalled();
  });

  it('returns 404 for missing Content and removes unrelated Content without a transaction', async () => {
    const missingFixture = makeFixture();
    missingFixture.contentRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      missingFixture.service.remove('missing-id'),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Content with id missing-id not found',
    });

    const plainContent = makeContent({ list: null, reunion: null });
    const plainFixture = makeFixture(plainContent);
    await plainFixture.service.remove('content-id');
    expect(plainFixture.transaction).not.toHaveBeenCalled();
    expect(plainFixture.contentRepository.remove).toHaveBeenCalledWith(
      plainContent,
    );
  });
});
