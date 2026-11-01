import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DeepPartial,
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Content, ContentType } from '../../entities/content.entity';
import { ContentCreationService } from '../content-creation.service';
import { CreateContentDto } from '../../dto/create-content.dto';
import { Article } from 'src/editorial/articles/entities/article.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { Point } from 'src/editorial/reunions/points/entities/point.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Video } from 'src/editorial/videos/entities/video.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { List } from 'src/editorial/lists/entities/list.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import { ContentCalendarEventPublisher } from '../../realtime/content-calendar-event-publisher.service';
import { ReunionsEventPublisher } from 'src/editorial/reunions/realtime/reunions-event-publisher.service';

describe('ContentCreationService', () => {
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

  const makeEntity = <Entity extends object>(
    EntityClass: new () => Entity,
    values: DeepPartial<Entity>,
  ): Entity => Object.assign(new EntityClass(), values);

  const makeFixture = async () => {
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
    const playlistRepository = manager.getRepository(RiffValleyPlaylist);
    const articleRepository = manager.getRepository(Article);
    const videoRepository = manager.getRepository(Video);
    const contentTxRepository = transactionManager.getRepository(Content);
    const reunionTxRepository = transactionManager.getRepository(Reunion);
    const playlistTxRepository =
      transactionManager.getRepository(RiffValleyPlaylist);
    const articleTxRepository = transactionManager.getRepository(Article);
    const videoTxRepository = transactionManager.getRepository(Video);
    const pointTxRepository = transactionManager.getRepository(Point);

    const createSpy = <Entity extends object>(
      repository: Repository<Entity>,
      EntityClass: new () => Entity,
    ) =>
      jest
        .spyOn(repository, 'create')
        .mockImplementation((values) => makeEntity(EntityClass, values));
    createSpy(contentRepository, Content);
    createSpy(articleTxRepository, Article);
    createSpy(videoTxRepository, Video);
    createSpy(playlistTxRepository, RiffValleyPlaylist);
    createSpy(reunionTxRepository, Reunion);
    createSpy(pointTxRepository, Point);

    const saveSpy = <Entity extends object>(
      repository: Repository<Entity>,
      EntityClass: new () => Entity,
    ) =>
      jest.spyOn(repository, 'save').mockImplementation(async (value) => {
        manager.pendingWrites.push(value);
        return Object.assign(new EntityClass(), value, { id: 'saved-id' });
      });
    const contentSave = saveSpy(contentTxRepository, Content);
    const articleSave = saveSpy(articleTxRepository, Article);
    const videoSave = saveSpy(videoTxRepository, Video);
    const playlistSave = saveSpy(playlistTxRepository, RiffValleyPlaylist);
    const reunionSave = saveSpy(reunionTxRepository, Reunion);
    const pointSave = jest
      .spyOn(pointTxRepository, 'save')
      .mockImplementation(async () => new Point());
    const transaction = manager;

    const author = makeEntity(User, { id: 'author-id' });
    const userFindOne = jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue(author);
    const reunionFindOne = jest
      .spyOn(reunionRepository, 'findOne')
      .mockResolvedValue(null);
    const articleFindOne = jest
      .spyOn(articleRepository, 'findOne')
      .mockResolvedValue(makeEntity(Article, { id: 'article-id' }));
    jest
      .spyOn(playlistRepository, 'findOne')
      .mockResolvedValue(makeEntity(RiffValleyPlaylist, { id: 'playlist-id' }));
    jest
      .spyOn(videoRepository, 'findOne')
      .mockResolvedValue(makeEntity(Video, { id: 'video-id' }));

    const list = makeEntity(List, { id: 'list-id' });
    const listsService: jest.Mocked<
      Pick<ListsService, 'createWeeklyList' | 'createMonthlyList'>
    > = {
      createWeeklyList: jest.fn().mockResolvedValue(list),
      createMonthlyList: jest.fn().mockResolvedValue(list),
    };
    const eventPublisher = {
      publishChangeSafely: jest.fn(),
    };
    const reunionsEventPublisher = { publishChangeSafely: jest.fn() };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ContentCreationService,
        { provide: getRepositoryToken(Content), useValue: contentRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Reunion), useValue: reunionRepository },
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: playlistRepository,
        },
        { provide: getRepositoryToken(Article), useValue: articleRepository },
        { provide: getRepositoryToken(Video), useValue: videoRepository },
        { provide: ListsService, useValue: listsService },
        { provide: ContentCalendarEventPublisher, useValue: eventPublisher },
        { provide: ReunionsEventPublisher, useValue: reunionsEventPublisher },
      ],
    }).compile();

    return {
      service: testingModule.get(ContentCreationService),
      contentRepository,
      userRepository,
      userFindOne,
      reunionRepository,
      reunionFindOne,
      articleFindOne,
      playlistRepository,
      articleRepository,
      videoRepository,
      listsService,
      eventPublisher,
      reunionsEventPublisher,
      contentTx: { save: contentSave },
      articleTx: { save: articleSave },
      videoTx: { save: videoSave },
      playlistTx: { save: playlistSave },
      reunionTx: { save: reunionSave },
      pointTx: { save: pointSave },
      manager: transactionManager,
      transaction,
      committedWrites: manager.committedWrites,
      author,
      testingModule,
    };
  };

  it.each([
    [ContentType.ARTICLE, 'articleTx', 'article'],
    [ContentType.VIDEO, 'videoTx', 'video'],
    [ContentType.RIFF_VALLEY_PLAYLIST, 'playlistTx', 'riffValleyPlaylist'],
  ] as const)(
    'creates an editing %s companion and Content atomically',
    async (type, repoKey, relation) => {
      const fixture = await makeFixture();
      const input: CreateContentDto = {
        type,
        name: 'Editorial item',
        authorId: 'author-id',
      };
      const result = await fixture.service.create(input);

      expect(fixture.transaction.transactionCalls).toBe(1);
      expect(fixture.manager.repositoryTargets).toContain(Content);
      expect(fixture.manager.repositoryTargets).toContain(
        type === ContentType.ARTICLE
          ? Article
          : type === ContentType.VIDEO
            ? Video
            : RiffValleyPlaylist,
      );
      expect(fixture[repoKey].save).toHaveBeenCalledTimes(1);
      expect(fixture.contentTx.save).toHaveBeenCalledWith(
        expect.objectContaining({
          [relation]: expect.objectContaining({ id: 'saved-id' }),
        }),
      );
      expect(result[relation]).toEqual(
        expect.objectContaining({ id: 'saved-id' }),
      );
      expect(fixture.eventPublisher.publishChangeSafely).toHaveBeenCalledTimes(
        1,
      );
    },
  );

  it('publishes only after the Content creation transaction commits', async () => {
    const fixture = await makeFixture();
    fixture.eventPublisher.publishChangeSafely.mockImplementation(() => {
      expect(fixture.committedWrites).toHaveLength(1);
    });

    await fixture.service.create({
      type: ContentType.PHOTOS,
      name: 'Photos',
      authorId: 'author-id',
    });

    expect(fixture.eventPublisher.publishChangeSafely).toHaveBeenCalledTimes(1);
  });

  it('does not publish when an auxiliary save fails and the transaction rolls back', async () => {
    const fixture = await makeFixture();
    fixture.articleTx.save.mockRejectedValue(new Error('article save failed'));

    await expect(
      fixture.service.create({
        type: ContentType.ARTICLE,
        name: 'Article',
        authorId: 'author-id',
      }),
    ).rejects.toThrow('article save failed');

    expect(fixture.committedWrites).toHaveLength(0);
    expect(fixture.eventPublisher.publishChangeSafely).not.toHaveBeenCalled();
  });

  it('creates RADAR and BEST lists through the Content transaction manager', async () => {
    for (const type of [ContentType.RADAR, ContentType.BEST]) {
      const fixture = await makeFixture();
      const publicationDate = '2026-10-01T00:00:00.000Z';
      const input: CreateContentDto = {
        type,
        name: 'Dated editorial item',
        authorId: 'author-id',
        publicationDate,
      };
      await fixture.service.create(input);

      expect(fixture.transaction.transactionCalls).toBe(1);
      expect(
        type === ContentType.RADAR
          ? fixture.listsService.createWeeklyList
          : fixture.listsService.createMonthlyList,
      ).toHaveBeenCalledWith(
        new Date(publicationDate),
        undefined,
        undefined,
        fixture.manager,
      );
      expect(fixture.contentTx.save).toHaveBeenCalledTimes(2);
      await fixture.testingModule.close();
    }
  });

  it.each([ContentType.RADAR, ContentType.BEST, ContentType.REUNION])(
    'requires a valid publication date for %s before lookups or writes',
    async (type) => {
      const fixture = await makeFixture();
      const input: CreateContentDto = {
        type,
        name: 'Dated',
        authorId: 'author-id',
      };
      await expect(fixture.service.create(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fixture.userFindOne).not.toHaveBeenCalled();
      expect(fixture.contentRepository.create).not.toHaveBeenCalled();
      expect(fixture.transaction.transactionCalls).toBe(0);
      await fixture.testingModule.close();
    },
  );

  it('reuses valid existing associations and reports missing references as 404', async () => {
    const fixture = await makeFixture();
    const existing = makeEntity(Reunion, { id: 'existing-reunion-id' });
    fixture.reunionFindOne.mockResolvedValueOnce(existing);
    const result = await fixture.service.create({
      type: ContentType.REUNION,
      name: 'Existing reunion',
      authorId: 'author-id',
      reunionId: existing.id,
      publicationDate: '2026-10-01T00:00:00.000Z',
    });
    expect(result.reunion).toBe(existing);
    expect(fixture.reunionTx.save).not.toHaveBeenCalled();
    expect(fixture.pointTx.save).not.toHaveBeenCalled();
    expect(
      fixture.reunionsEventPublisher.publishChangeSafely,
    ).not.toHaveBeenCalled();

    fixture.articleFindOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.create({
        type: ContentType.ARTICLE,
        name: 'Missing article',
        authorId: 'author-id',
        articleId: 'missing-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.transaction.transactionCalls).toBe(1);
    await fixture.testingModule.close();
  });

  it('automatically creates a Reunion with default Points in the same manager', async () => {
    const fixture = await makeFixture();
    const result = await fixture.service.create({
      type: ContentType.REUNION,
      name: 'Weekly reunion',
      authorId: 'author-id',
      publicationDate: '2026-10-21T18:00:00.000Z',
    });

    expect(fixture.manager.repositoryTargets).toContain(Reunion);
    expect(fixture.manager.repositoryTargets).toContain(Point);
    expect(fixture.reunionTx.save).toHaveBeenCalledTimes(1);
    expect(fixture.pointTx.save).toHaveBeenCalledWith([
      expect.objectContaining({
        titulo: 'Asignar Radar semanal',
        reunion: expect.objectContaining({ id: 'saved-id' }),
      }),
      expect.objectContaining({
        titulo: 'Crónicas y artículos pendientes',
        reunion: expect.objectContaining({ id: 'saved-id' }),
      }),
    ]);
    expect(fixture.contentTx.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reunion: expect.objectContaining({ id: 'saved-id' }),
        reunionId: 'saved-id',
      }),
    );
    expect(result).toMatchObject({
      reunion: expect.objectContaining({ id: 'saved-id' }),
      reunionId: 'saved-id',
    });
    expect(
      fixture.reunionsEventPublisher.publishChangeSafely,
    ).toHaveBeenCalledTimes(1);
    await fixture.testingModule.close();
  });

  it.each([
    [ContentType.ARTICLE, 'articleTx'],
    [ContentType.VIDEO, 'videoTx'],
    [ContentType.RIFF_VALLEY_PLAYLIST, 'playlistTx'],
    [ContentType.REUNION, 'reunionTx'],
    [ContentType.REUNION, 'pointTx'],
    [ContentType.REUNION, 'contentTx'],
  ] as const)(
    'rolls back %s creation when the %s write fails',
    async (type, repoKey) => {
      const fixture = await makeFixture();
      const error = new Error('secondary write failed');
      fixture[repoKey].save.mockRejectedValueOnce(error);
      const input: CreateContentDto = {
        type,
        name: 'Atomic content',
        authorId: 'author-id',
        publicationDate:
          type === ContentType.REUNION ? '2026-10-21T18:00:00.000Z' : undefined,
      };
      await expect(fixture.service.create(input)).rejects.toBe(error);
      expect(fixture.transaction.transactionCalls).toBe(1);
      expect(fixture.committedWrites).toEqual([]);
      expect(
        fixture.reunionsEventPublisher.publishChangeSafely,
      ).not.toHaveBeenCalled();
      await fixture.testingModule.close();
    },
  );
});
