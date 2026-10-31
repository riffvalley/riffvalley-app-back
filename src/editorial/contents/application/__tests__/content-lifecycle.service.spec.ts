import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { Content, ContentType } from '../../entities/content.entity';
import { UpdateContentDto } from '../../dto/update-content.dto';
import { ContentLifecycleService } from '../content-lifecycle.service';
import { List, ListType } from 'src/editorial/lists/entities/list.entity';
import { Asignation } from 'src/editorial/lists/asignations/entities/asignations.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import { User } from 'src/identity/auth/entities/user.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { ContentQueryService } from '../content-query.service';
import { Video } from 'src/editorial/videos/entities/video.entity';
import { Article } from 'src/editorial/articles/entities/article.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Point } from 'src/editorial/reunions/points/entities/point.entity';

describe('ContentLifecycleService', () => {
  type TransactionState = {
    pendingWrites: unknown[];
    committedWrites: unknown[];
  };

  class TransactionalTestEntityManager extends EntityManager {
    transactionCalls = 0;
    readonly repositoryTargets: EntityTarget<ObjectLiteral>[] = [];

    constructor(
      dataSource: DataSource,
      private readonly state: TransactionState,
      private readonly callbackManager?: EntityManager,
    ) {
      super(dataSource);
    }

    getRepository<Entity extends ObjectLiteral>(
      target: EntityTarget<Entity>,
    ): Repository<Entity> {
      this.repositoryTargets.push(target);
      return super.getRepository(target);
    }

    get pendingWrites(): unknown[] {
      return this.state.pendingWrites;
    }

    get committedWrites(): unknown[] {
      return this.state.committedWrites;
    }

    override transaction<Result>(
      runInTransaction: (manager: EntityManager) => Promise<Result>,
    ): Promise<Result>;
    override transaction<Result>(
      isolationLevel: IsolationLevel,
      runInTransaction: (manager: EntityManager) => Promise<Result>,
    ): Promise<Result>;
    override async transaction<Result>(
      isolationLevelOrCallback:
        | IsolationLevel
        | ((manager: EntityManager) => Promise<Result>),
      callback?: (manager: EntityManager) => Promise<Result>,
    ): Promise<Result> {
      this.transactionCalls += 1;
      this.pendingWrites.length = 0;
      const runInTransaction =
        typeof isolationLevelOrCallback === 'function'
          ? isolationLevelOrCallback
          : callback;
      if (!runInTransaction) throw new Error('Transaction callback required');
      try {
        const result = await runInTransaction(this.callbackManager ?? this);
        this.committedWrites.push(...this.pendingWrites);
        return result;
      } catch (error) {
        this.pendingWrites.length = 0;
        throw error;
      }
    }
  }

  const makeContent = (overrides: Partial<Content> = {}): Content =>
    Object.assign(new Content(), {
      id: 'content-id',
      type: ContentType.BEST,
      name: 'Monthly list',
      ready: true,
      publicationDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
      list: Object.assign(new List(), { id: 'list-id' }),
      ...overrides,
    });

  const makeFixture = async (content = makeContent()) => {
    const dataSource = new DataSource({ type: 'postgres' });
    const state: TransactionState = { pendingWrites: [], committedWrites: [] };
    const transactionManager = new TransactionalTestEntityManager(
      dataSource,
      state,
    );
    const manager = new TransactionalTestEntityManager(
      dataSource,
      state,
      transactionManager,
    );
    const contentRepository = manager.getRepository(Content);
    const userRepository = manager.getRepository(User);
    const reunionRepository = manager.getRepository(Reunion);
    const listRepository = manager.getRepository(List);
    const contentTxRepository = transactionManager.getRepository(Content);
    const reunionTxRepository = transactionManager.getRepository(Reunion);
    const listTxRepository = transactionManager.getRepository(List);

    const contentFindOne = jest
      .spyOn(contentRepository, 'findOne')
      .mockResolvedValue(content);
    const contentTxFindOne = jest
      .spyOn(contentTxRepository, 'findOne')
      .mockResolvedValue(content);
    const contentSave = jest
      .spyOn(contentRepository, 'save')
      .mockImplementation(async () => {
        manager.pendingWrites.push(content);
        return content;
      });
    const contentRemove = jest
      .spyOn(contentRepository, 'remove')
      .mockImplementation(async (value) => {
        manager.pendingWrites.push(value);
        return value;
      });
    const contentTxSave = jest
      .spyOn(contentTxRepository, 'save')
      .mockImplementation(async () => {
        manager.pendingWrites.push(content);
        return content;
      });
    const contentTxRemove = jest
      .spyOn(contentTxRepository, 'remove')
      .mockImplementation(async (value) => {
        manager.pendingWrites.push(value);
        return value;
      });
    const userFindOne = jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue(Object.assign(new User(), { id: 'author-id' }));
    const reunionFindOne = jest
      .spyOn(reunionRepository, 'findOne')
      .mockResolvedValue(
        Object.assign(new Reunion(), {
          id: 'reunion-id',
          titulo: 'Old title',
          fecha: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
    const reunionTxFindOne = jest
      .spyOn(reunionTxRepository, 'findOne')
      .mockResolvedValue(
        Object.assign(new Reunion(), {
          id: 'reunion-id',
          titulo: 'Old title',
          fecha: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
    const reunionTxSave = jest
      .spyOn(reunionTxRepository, 'save')
      .mockImplementation(async (value) => {
        manager.pendingWrites.push(value);
        return Object.assign(new Reunion(), value);
      });
    const reunionTxDelete = jest
      .spyOn(reunionTxRepository, 'delete')
      .mockImplementation(async (id) => {
        manager.pendingWrites.push({ deleteReunion: id });
        return { affected: 1, raw: [] };
      });

    const list = Object.assign(new List(), {
      id: 'list-id',
      type: ListType.MONTH,
      releaseDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
    });
    const listTxFindOne = jest
      .spyOn(listTxRepository, 'findOne')
      .mockResolvedValue(list);
    const listTxSave = jest
      .spyOn(listTxRepository, 'save')
      .mockImplementation(async (value) => {
        manager.pendingWrites.push(value);
        return Object.assign(new List(), value);
      });
    const transaction = manager;

    const listsService: jest.Mocked<Pick<ListsService, 'removeList'>> = {
      removeList: jest.fn().mockResolvedValue(list),
    };
    const contentQueryService: jest.Mocked<
      Pick<ContentQueryService, 'findOne'>
    > = {
      findOne: jest.fn().mockResolvedValue(content),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ContentLifecycleService,
        { provide: getRepositoryToken(Content), useValue: contentRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Reunion), useValue: reunionRepository },
        { provide: getRepositoryToken(List), useValue: listRepository },
        { provide: ListsService, useValue: listsService },
        { provide: ContentQueryService, useValue: contentQueryService },
      ],
    }).compile();

    return {
      service: testingModule.get(ContentLifecycleService),
      content,
      list,
      contentRepository: {
        findOne: contentFindOne,
        save: contentSave,
        remove: contentRemove,
      },
      userRepository: { findOne: userFindOne },
      reunionRepository: { findOne: reunionFindOne },
      listRepository,
      listsService,
      contentQueryService,
      txContentRepository: {
        save: contentTxSave,
        remove: contentTxRemove,
        findOne: contentTxFindOne,
      },
      txListRepository: { findOne: listTxFindOne, save: listTxSave },
      txReunionRepository: {
        findOne: reunionTxFindOne,
        save: reunionTxSave,
        delete: reunionTxDelete,
      },
      userFindOne,
      manager: transactionManager,
      transaction,
      committedWrites: manager.committedWrites,
      testingModule,
    };
  };

  it('updates Content and List in one manager transaction, preserving explicit null dates', async () => {
    const fixture = await makeFixture();
    const update: UpdateContentDto = {
      publicationDate: '2026-11-01T00:00:00.000Z',
      closeDate: null,
      listDate: null,
    };
    const result = await fixture.service.update('content-id', update);

    expect(result).toBe(fixture.content);
    expect(fixture.transaction.transactionCalls).toBe(1);
    expect(fixture.contentQueryService.findOne).toHaveBeenCalledWith(
      'content-id',
    );
    expect(fixture.manager.repositoryTargets).toContain(Content);
    expect(fixture.manager.repositoryTargets).toContain(List);
    expect(fixture.txContentRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.txListRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.list.releaseDate).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(fixture.list.closeDate).toBeNull();
    expect(fixture.list.listDate).toBeNull();
    expect(fixture.content.ready).toBe(false);
    await fixture.testingModule.close();
  });

  it('preserves omitted dates and null-versus-omitted reunion behavior', async () => {
    const fixture = await makeFixture();
    await fixture.service.update('content-id', { name: 'Renamed' });

    expect(fixture.transaction.transactionCalls).toBe(0);
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
    await fixture.service.update('content-id', { reunionId: null });
    expect(fixture.content.reunionId).toBeNull();
    expect(fixture.reunionRepository.findOne).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it.each([ContentType.RADAR, ContentType.BEST, ContentType.REUNION])(
    'rejects cleared or invalid publicationDate for %s before writes',
    async (type) => {
      const fixture = await makeFixture(makeContent({ type }));
      for (const publicationDate of [null, '', 'not-a-date']) {
        const update: UpdateContentDto = { publicationDate };
        await expect(
          fixture.service.update('content-id', update),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(fixture.contentRepository.save).not.toHaveBeenCalled();
      expect(fixture.transaction.transactionCalls).toBe(0);
      await fixture.testingModule.close();
    },
  );

  it('rejects changing Content to BEST when its current publication date is absent', async () => {
    const fixture = await makeFixture(
      makeContent({ type: ContentType.ARTICLE, publicationDate: undefined }),
    );
    const update: UpdateContentDto = { type: ContentType.BEST };
    await expect(
      fixture.service.update('content-id', update),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('validates author and Reunion references with the existing 404 errors', async () => {
    const fixture = await makeFixture();
    fixture.userFindOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.update('content-id', { authorId: 'missing-user' }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'User with id missing-user not found',
    });

    fixture.reunionRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.update('content-id', { reunionId: 'missing-reunion' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('synchronizes Content and Reunion in the same manager and rolls back on the second write', async () => {
    const content = makeContent({
      type: ContentType.REUNION,
      reunionId: 'reunion-id',
      name: 'New title',
    });
    const fixture = await makeFixture(content);
    fixture.txReunionRepository.findOne.mockResolvedValueOnce(
      Object.assign(new Reunion(), {
        id: 'reunion-id',
        titulo: 'Old title',
        fecha: new Date('2026-10-01T00:00:00.000Z'),
      }),
    );
    fixture.txReunionRepository.save.mockImplementationOnce(async () => {
      throw new Error('reunion save failed');
    });

    await expect(
      fixture.service.update('content-id', { name: 'New title' }),
    ).rejects.toThrow('reunion save failed');
    expect(fixture.manager.repositoryTargets).toContain(Content);
    expect(fixture.manager.repositoryTargets).toContain(Reunion);
    expect(fixture.committedWrites).toEqual([]);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('uses one manager to synchronize both List and Reunion', async () => {
    const fixture = await makeFixture(
      makeContent({ reunionId: 'reunion-id', name: 'Monthly list' }),
    );
    const update: UpdateContentDto = {
      name: 'Updated monthly list',
      publicationDate: '2026-11-01T00:00:00.000Z',
    };
    await fixture.service.update('content-id', update);

    expect(fixture.transaction.transactionCalls).toBe(1);
    expect(fixture.manager.repositoryTargets).toContain(Content);
    expect(fixture.manager.repositoryTargets).toContain(List);
    expect(fixture.manager.repositoryTargets).toContain(Reunion);
    await fixture.testingModule.close();
  });

  it('rolls back Content when the paired List save fails', async () => {
    const fixture = await makeFixture();
    const listError = new Error('list save failed');
    fixture.txListRepository.save.mockRejectedValueOnce(listError);

    await expect(
      fixture.service.update('content-id', {
        closeDate: '2026-11-05T00:00:00.000Z',
      }),
    ).rejects.toBe(listError);

    expect(fixture.transaction.transactionCalls).toBe(1);
    expect(fixture.txContentRepository.save).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.committedWrites).toEqual([]);
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('returns 404 and rolls back if the synchronized List is missing', async () => {
    const fixture = await makeFixture();
    fixture.txListRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      fixture.service.update('content-id', {
        listDate: '2026-11-03T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'List with id list-id not found',
    });

    expect(fixture.committedWrites).toEqual([]);
    await fixture.testingModule.close();
  });

  it('removes Content and List in one transaction with the loaded List relation', async () => {
    const content = makeContent();
    const fixture = await makeFixture(content);
    await fixture.service.remove('content-id');

    expect(fixture.contentRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'content-id' },
      relations: ['list', 'reunion', 'riffValleyPlaylist', 'article', 'video'],
    });
    expect(fixture.transaction.transactionCalls).toBe(1);
    expect(fixture.txContentRepository.remove).toHaveBeenCalledWith(content);
    expect(fixture.listsService.removeList).toHaveBeenCalledWith(
      'list-id',
      fixture.manager,
    );
    expect(fixture.txReunionRepository.delete).not.toHaveBeenCalled();
    expect(fixture.contentRepository.remove).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('removes Reunion Content and Reunion in one transaction without a List', async () => {
    const content = makeContent({
      type: ContentType.REUNION,
      list: undefined,
      reunion: Object.assign(new Reunion(), { id: 'reunion-id' }),
    });
    const fixture = await makeFixture(content);

    await fixture.service.remove('content-id');

    expect(fixture.transaction.transactionCalls).toBe(1);
    expect(fixture.txContentRepository.remove).toHaveBeenCalledWith(content);
    expect(fixture.txReunionRepository.delete).toHaveBeenCalledWith(
      'reunion-id',
    );
    expect(fixture.listsService.removeList).not.toHaveBeenCalled();
    expect(fixture.committedWrites).toContain(content);
    await fixture.testingModule.close();
  });

  it('removes Video Content while preserving Video, its List, assignments and local tracking', async () => {
    const fixture = await makeFixture(
      makeContent({
        type: ContentType.VIDEO,
        video: Object.assign(new Video(), { id: 'video-id' }),
      }),
    );
    fixture.content.video!.list = fixture.list;
    fixture.list.wpPostId = 912;
    fixture.list.wpPostUrl = 'https://example.test/list/912';
    fixture.list.wpPublishedDiscs = [
      { discId: 'disc-id', artist: 'Band', name: 'Album' },
    ];
    fixture.list.asignations = [
      Object.assign(new Asignation(), {
        id: 'asignation-id',
        list: fixture.list,
      }),
    ];

    await fixture.service.remove('content-id');

    expect(fixture.transaction.transactionCalls).toBe(1);
    expect(fixture.txContentRepository.remove).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.listsService.removeList).not.toHaveBeenCalled();
    expect(fixture.content.video).toMatchObject({
      id: 'video-id',
      list: { id: 'list-id' },
    });
    expect(fixture.list).toMatchObject({
      id: 'list-id',
      wpPostId: 912,
      wpPostUrl: 'https://example.test/list/912',
      wpPublishedDiscs: [{ discId: 'disc-id', artist: 'Band', name: 'Album' }],
      asignations: [{ id: 'asignation-id' }],
    });
    expect(fixture.committedWrites).toEqual([fixture.content]);
    await fixture.testingModule.close();
  });

  it('removes Video Content without a List directly and leaves Video untouched', async () => {
    const video = Object.assign(new Video(), { id: 'video-id' });
    const fixture = await makeFixture(
      makeContent({
        type: ContentType.VIDEO,
        list: undefined,
        video,
      }),
    );

    await fixture.service.remove('content-id');

    expect(fixture.transaction.transactionCalls).toBe(0);
    expect(fixture.contentRepository.remove).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.listsService.removeList).not.toHaveBeenCalled();
    expect(fixture.content.video).toBe(video);
    await fixture.testingModule.close();
  });

  it.each([ContentType.RADAR, ContentType.BEST])(
    'continues removing the List with Content type %s',
    async (type) => {
      const fixture = await makeFixture(makeContent({ type }));

      await fixture.service.remove('content-id');

      expect(fixture.transaction.transactionCalls).toBe(1);
      expect(fixture.listsService.removeList).toHaveBeenCalledWith(
        'list-id',
        fixture.manager,
      );
      expect(fixture.txContentRepository.remove).toHaveBeenCalledWith(
        fixture.content,
      );
      await fixture.testingModule.close();
    },
  );

  it('removes Article Content while leaving Article untouched', async () => {
    const article = Object.assign(new Article(), { id: 'article-id' });
    const fixture = await makeFixture(
      makeContent({
        type: ContentType.ARTICLE,
        list: undefined,
        reunion: undefined,
        article,
      }),
    );

    await fixture.service.remove('content-id');

    expect(fixture.contentRepository.remove).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.content.article).toBe(article);
    expect(fixture.listsService.removeList).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('removes Photos Content without requesting external resource cleanup', async () => {
    const fixture = await makeFixture(
      makeContent({
        type: ContentType.PHOTOS,
        list: undefined,
        reunion: undefined,
      }),
    );

    await fixture.service.remove('content-id');

    expect(fixture.contentRepository.remove).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.transaction.transactionCalls).toBe(0);
    expect(fixture.listsService.removeList).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('removes Playlist Content while leaving Playlist untouched', async () => {
    const playlist = Object.assign(new RiffValleyPlaylist(), {
      id: 'playlist-id',
    });
    const fixture = await makeFixture(
      makeContent({
        type: ContentType.RIFF_VALLEY_PLAYLIST,
        list: undefined,
        reunion: undefined,
        riffValleyPlaylist: playlist,
      }),
    );

    await fixture.service.remove('content-id');

    expect(fixture.contentRepository.remove).toHaveBeenCalledWith(
      fixture.content,
    );
    expect(fixture.content.riffValleyPlaylist).toBe(playlist);
    expect(fixture.listsService.removeList).not.toHaveBeenCalled();
    await fixture.testingModule.close();
  });

  it('rolls back removal when the List or Reunion write fails', async () => {
    const listFixture = await makeFixture();
    const listError = new Error('list delete failed');
    listFixture.listsService.removeList.mockRejectedValueOnce(listError);
    await expect(listFixture.service.remove('content-id')).rejects.toBe(
      listError,
    );
    expect(listFixture.committedWrites).toEqual([]);

    const point = Object.assign(new Point(), { id: 'point-id' });
    const reunion = Object.assign(new Reunion(), {
      id: 'reunion-id',
      points: [point],
    });
    const reunionFixture = await makeFixture(
      makeContent({
        type: ContentType.REUNION,
        list: undefined,
        reunion,
      }),
    );
    const reunionError = new Error('reunion delete failed');
    reunionFixture.txReunionRepository.delete.mockRejectedValueOnce(
      reunionError,
    );
    await expect(reunionFixture.service.remove('content-id')).rejects.toBe(
      reunionError,
    );
    expect(reunionFixture.transaction.transactionCalls).toBe(1);
    expect(reunionFixture.txContentRepository.remove).toHaveBeenCalledWith(
      reunionFixture.content,
    );
    expect(reunionFixture.txReunionRepository.delete).toHaveBeenCalledWith(
      'reunion-id',
    );
    expect(reunionFixture.transaction.pendingWrites).toEqual([]);
    expect(reunionFixture.committedWrites).toEqual([]);
    expect(reunionFixture.content.reunion).toBe(reunion);
    expect(reunion.points).toEqual([point]);
    expect(reunionFixture.contentRepository.remove).not.toHaveBeenCalled();
    await listFixture.testingModule.close();
    await reunionFixture.testingModule.close();
  });

  it('returns 404 for missing Content and removes unrelated Content without a transaction', async () => {
    const missingFixture = await makeFixture();
    missingFixture.contentRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      missingFixture.service.remove('missing-id'),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Content with id missing-id not found',
    });

    const plainContent = makeContent({ list: undefined, reunion: undefined });
    const plainFixture = await makeFixture(plainContent);
    await plainFixture.service.remove('content-id');
    expect(plainFixture.transaction.transactionCalls).toBe(0);
    expect(plainFixture.contentRepository.remove).toHaveBeenCalledWith(
      plainContent,
    );
    await missingFixture.testingModule.close();
    await plainFixture.testingModule.close();
  });
});
