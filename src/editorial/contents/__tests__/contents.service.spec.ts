import { Content, ContentType } from '../entities/content.entity';
import { ContentsService } from '../contents.service';
import { List, ListType } from 'src/editorial/lists/entities/list.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { Point } from 'src/editorial/reunions/points/entities/point.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Article } from 'src/editorial/articles/entities/article.entity';
import {
  Video,
  VideoStatus,
  VideoType,
} from 'src/editorial/videos/entities/video.entity';
import { ContentCreationService } from '../application/content-creation.service';

describe('ContentsService creation facade compatibility', () => {
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
    const committedWrites: unknown[] = [];
    let pendingWrites: unknown[] = [];
    const txContentRepository = {
      save: jest.fn().mockImplementation(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
      remove: jest.fn().mockImplementation(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
    };
    const txListRepository = {
      findOne: jest.fn().mockResolvedValue(list),
      save: jest.fn().mockImplementation(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
    };
    const makeTransactionalRepository = () => ({
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
    });
    const txReunionRepository: any = makeTransactionalRepository();
    txReunionRepository.save.mockImplementation(async (value: any) => {
      pendingWrites.push(value);
      return { ...value, id: 'reunion-id' };
    });
    txReunionRepository.findOne = jest
      .fn()
      .mockResolvedValue({ id: 'reunion-id', titulo: 'Old title' });
    txReunionRepository.delete = jest.fn().mockImplementation(async (id) => {
      pendingWrites.push({ deleteReunion: id });
      return { affected: 1 };
    });
    const txPointRepository = makeTransactionalRepository();
    const txRiffValleyPlaylistRepository = makeTransactionalRepository();
    const txArticleRepository = makeTransactionalRepository();
    const txVideoRepository = makeTransactionalRepository();
    const transactionalRepositories = new Map<Function, any>([
      [Content, txContentRepository],
      [List, txListRepository],
      [Reunion, txReunionRepository],
      [Point, txPointRepository],
      [RiffValleyPlaylist, txRiffValleyPlaylistRepository],
      [Article, txArticleRepository],
      [Video, txVideoRepository],
    ]);
    const manager = {
      getRepository: jest.fn((entity) => transactionalRepositories.get(entity)),
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
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue({ id: 'reunion-id' }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const pointRepository = {
      save: jest.fn().mockResolvedValue([]),
    };
    const riffValleyPlaylistRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'playlist-id',
        status: 'editing',
        updateDate: null,
      }),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue({ id: 'playlist-id' }),
    };
    const articleRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'article-id',
        status: 'editing',
        updateDate: null,
      }),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue({ id: 'article-id' }),
    };
    const videoRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'video-id',
        status: VideoStatus.EDITING,
        updateDate: null,
      }),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue({ id: 'video-id' }),
    };
    const listsService = {
      createWeeklyList: jest.fn().mockResolvedValue(list),
      createMonthlyList: jest.fn().mockResolvedValue(list),
      removeList: jest.fn().mockResolvedValue(list),
    };
    const queryService = {
      findAll: jest.fn(),
      findOne: jest.fn().mockResolvedValue(content),
      findByMonth: jest.fn(),
      findOneByRiffValleyPlaylistId: jest.fn(),
      findOneByArticleId: jest.fn(),
      findOneByVideoId: jest.fn(),
      getDefaultAuthorId: jest.fn(),
    };
    const creationService = new ContentCreationService(
      contentRepository as any,
      userRepository as any,
      reunionRepository as any,
      riffValleyPlaylistRepository as any,
      articleRepository as any,
      videoRepository as any,
      listsService as any,
    );
    const lifecycleService = {
      update: jest.fn(),
      remove: jest.fn(),
    };
    const service = new ContentsService(
      queryService as any,
      creationService,
      lifecycleService as any,
    );

    return {
      service,
      creationService,
      lifecycleService,
      content,
      list,
      contentRepository,
      txContentRepository,
      txListRepository,
      txReunionRepository,
      txPointRepository,
      txRiffValleyPlaylistRepository,
      txArticleRepository,
      txVideoRepository,
      committedWrites,
      userRepository,
      reunionRepository,
      pointRepository,
      riffValleyPlaylistRepository,
      articleRepository,
      videoRepository,
      listsService,
      queryService,
      manager,
      transaction,
    };
  };

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

  it.each([ContentType.RADAR, ContentType.BEST, ContentType.REUNION])(
    'rejects %s creation without a valid publicationDate before persistence',
    async (type) => {
      const { service, contentRepository, userRepository, transaction } =
        makeService();

      for (const publicationDate of [undefined, null, 'not-a-date']) {
        await expect(
          service.create({
            type,
            name: 'Editorial content',
            authorId: 'author-id',
            publicationDate,
          } as any),
        ).rejects.toBeInstanceOf(BadRequestException);
      }

      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(contentRepository.create).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('creates BEST with the supplied date and creates its List transactionally', async () => {
    const { service, listsService, txContentRepository, manager, transaction } =
      makeService();
    const publicationDate = '2026-11-15T12:00:00.000Z';

    await service.create({
      type: ContentType.BEST,
      name: 'Mejores de noviembre',
      authorId: 'author-id',
      publicationDate,
    } as any);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).toHaveBeenCalledTimes(2);
    expect(listsService.createMonthlyList).toHaveBeenCalledWith(
      new Date(publicationDate),
      undefined,
      undefined,
      manager,
    );
  });

  it.each([
    [
      'articleId',
      ContentType.ARTICLE,
      'articleRepository',
      'article',
      'article-id',
    ],
    ['videoId', ContentType.VIDEO, 'videoRepository', 'video', 'video-id'],
    [
      'riffValleyPlaylistId',
      ContentType.RIFF_VALLEY_PLAYLIST,
      'riffValleyPlaylistRepository',
      'riffValleyPlaylist',
      'playlist-id',
    ],
  ] as const)(
    'creates Content with an existing %s reference without creating a companion',
    async (field, type, repositoryName, relation, id) => {
      const fixture = makeService();
      const repository = fixture[repositoryName];

      const result = await fixture.service.create({
        type,
        name: 'Linked editorial content',
        authorId: 'author-id',
        [field]: id,
      } as any);

      expect(repository.findOne).toHaveBeenCalledTimes(1);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id } });
      expect(fixture.contentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ [relation]: { id } }),
      );
      expect(fixture.txContentRepository.save).toHaveBeenCalledTimes(1);
      expect(fixture.articleRepository.save).not.toHaveBeenCalled();
      expect(fixture.videoRepository.save).not.toHaveBeenCalled();
      expect(fixture.riffValleyPlaylistRepository.save).not.toHaveBeenCalled();
      expect(fixture.txArticleRepository.save).not.toHaveBeenCalled();
      expect(fixture.txVideoRepository.save).not.toHaveBeenCalled();
      expect(
        fixture.txRiffValleyPlaylistRepository.save,
      ).not.toHaveBeenCalled();
      expect(result[relation]).toEqual({ id });
    },
  );

  it.each([
    ['articleId', ContentType.ARTICLE, 'articleRepository'],
    ['videoId', ContentType.VIDEO, 'videoRepository'],
    [
      'riffValleyPlaylistId',
      ContentType.RIFF_VALLEY_PLAYLIST,
      'riffValleyPlaylistRepository',
    ],
  ] as const)(
    'preserves initial publication-date sync from an existing published %s',
    async (field, type, repositoryName) => {
      const fixture = makeService();
      const updateDate = new Date('2026-10-19T12:00:00.000Z');
      fixture[repositoryName].findOne.mockResolvedValueOnce({
        id: 'linked-id',
        status: 'published',
        updateDate,
      } as any);

      const result = await fixture.service.create({
        type,
        name: 'Published linked content',
        authorId: 'author-id',
        [field]: 'linked-id',
      } as any);

      expect(result.publicationDate).toEqual(updateDate);
      expect(fixture.contentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ publicationDate: updateDate }),
      );
    },
  );

  it.each([
    ['articleId', ContentType.ARTICLE, 'articleRepository', 'Article'],
    ['videoId', ContentType.VIDEO, 'videoRepository', 'Video'],
    [
      'riffValleyPlaylistId',
      ContentType.RIFF_VALLEY_PLAYLIST,
      'riffValleyPlaylistRepository',
      'RiffValleyPlaylist',
    ],
  ] as const)(
    'returns 404 for a missing %s before creating or saving Content',
    async (field, type, repositoryName, entityName) => {
      const fixture = makeService();
      const repository = fixture[repositoryName];
      repository.findOne.mockResolvedValueOnce(null);

      const error = await fixture.service
        .create({
          type,
          name: 'Linked editorial content',
          authorId: 'author-id',
          [field]: 'missing-id',
        } as any)
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.message).toBe(`${entityName} with id missing-id not found`);

      expect(fixture.contentRepository.create).not.toHaveBeenCalled();
      expect(fixture.contentRepository.save).not.toHaveBeenCalled();
      expect(fixture.transaction).not.toHaveBeenCalled();
      expect(fixture.articleRepository.save).not.toHaveBeenCalled();
      expect(fixture.videoRepository.save).not.toHaveBeenCalled();
      expect(fixture.riffValleyPlaylistRepository.save).not.toHaveBeenCalled();
      expect(fixture.reunionRepository.save).not.toHaveBeenCalled();
      expect(fixture.pointRepository.save).not.toHaveBeenCalled();
    },
  );

  it('propagates repository lookup failures instead of translating arbitrary errors to 404', async () => {
    const fixture = makeService();
    const databaseError = new Error('repository unavailable');
    fixture.articleRepository.findOne.mockRejectedValueOnce(databaseError);

    await expect(
      fixture.service.create({
        type: ContentType.ARTICLE,
        name: 'Linked editorial content',
        authorId: 'author-id',
        articleId: 'article-id',
      } as any),
    ).rejects.toBe(databaseError);

    expect(fixture.contentRepository.create).not.toHaveBeenCalled();
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
  });

  it('reuses an explicitly supplied Reunion for a REUNION Content', async () => {
    const fixture = makeService();
    const existingReunion = { id: 'existing-reunion-id' };
    fixture.reunionRepository.findOne.mockResolvedValueOnce(
      existingReunion as any,
    );

    const result = await fixture.service.create({
      type: ContentType.REUNION,
      name: 'Existing reunion content',
      authorId: 'author-id',
      reunionId: existingReunion.id,
      publicationDate: '2026-10-21T18:00:00.000Z',
    } as any);

    expect(result.reunion).toBe(existingReunion);
    expect(result.reunionId).toBe(existingReunion.id);
    expect(fixture.reunionRepository.create).not.toHaveBeenCalled();
    expect(fixture.reunionRepository.save).not.toHaveBeenCalled();
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
    expect(fixture.txReunionRepository.save).not.toHaveBeenCalled();
    expect(fixture.txPointRepository.save).not.toHaveBeenCalled();
    expect(fixture.txContentRepository.save).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for a missing Reunion before creating REUNION Content', async () => {
    const fixture = makeService();

    const error = await fixture.service
      .create({
        type: ContentType.REUNION,
        name: 'Missing reunion content',
        authorId: 'author-id',
        reunionId: 'missing-reunion-id',
        publicationDate: '2026-10-21T18:00:00.000Z',
      } as any)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getStatus()).toBe(404);
    expect(error.message).toBe('Reunion with id missing-reunion-id not found');
    expect(fixture.contentRepository.create).not.toHaveBeenCalled();
    expect(fixture.reunionRepository.save).not.toHaveBeenCalled();
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
  });

  it('still creates a Reunion and its default points when no reunionId is supplied', async () => {
    const fixture = makeService();

    const result = await fixture.service.create({
      type: ContentType.REUNION,
      name: 'New weekly reunion',
      authorId: 'author-id',
      publicationDate: '2026-10-21T18:00:00.000Z',
    } as any);

    expect(fixture.txReunionRepository.create).toHaveBeenCalledWith({
      titulo: 'New weekly reunion',
      fecha: new Date('2026-10-21T18:00:00.000Z'),
    });
    expect(fixture.txReunionRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.txPointRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ titulo: 'Asignar Radar semanal' }),
      expect.objectContaining({ titulo: 'Crónicas y artículos pendientes' }),
    ]);
    expect(result.reunionId).toBe('reunion-id');
  });

  it.each([
    [ContentType.ARTICLE, 'txArticleRepository', 'article'],
    [ContentType.VIDEO, 'txVideoRepository', 'video'],
    [
      ContentType.RIFF_VALLEY_PLAYLIST,
      'txRiffValleyPlaylistRepository',
      'riffValleyPlaylist',
    ],
    [ContentType.REUNION, 'txReunionRepository', 'reunion'],
  ] as const)(
    'persists the new %s companion with Content in one transaction',
    async (type, repositoryName, relation) => {
      const fixture = makeService();
      const savedCompanion = { id: `${type}-id` };
      (fixture[repositoryName] as any).save.mockResolvedValueOnce(
        savedCompanion,
      );

      const result = await fixture.service.create({
        type,
        name: 'Atomic editorial content',
        authorId: 'author-id',
        publicationDate:
          type === ContentType.REUNION ? '2026-10-21T18:00:00.000Z' : undefined,
      } as any);

      expect(fixture.transaction).toHaveBeenCalledTimes(1);
      expect((fixture[repositoryName] as any).save).toHaveBeenCalledTimes(1);
      expect(fixture.txContentRepository.save).toHaveBeenCalledTimes(1);
      expect(result[relation]).toBe(savedCompanion);
      expect(fixture.txContentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ [relation]: savedCompanion }),
      );
      if (type === ContentType.REUNION) {
        expect(fixture.txPointRepository.save).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each([
    [ContentType.ARTICLE, 'txArticleRepository'],
    [ContentType.ARTICLE, 'txContentRepository'],
    [ContentType.VIDEO, 'txVideoRepository'],
    [ContentType.VIDEO, 'txContentRepository'],
    [ContentType.RIFF_VALLEY_PLAYLIST, 'txRiffValleyPlaylistRepository'],
    [ContentType.RIFF_VALLEY_PLAYLIST, 'txContentRepository'],
    [ContentType.REUNION, 'txReunionRepository'],
    [ContentType.REUNION, 'txPointRepository'],
    [ContentType.REUNION, 'txContentRepository'],
  ] as const)(
    'discards all pending %s writes when %s fails',
    async (type, repositoryName) => {
      const fixture = makeService();
      const writeError = new Error(`${repositoryName} write failed`);
      (fixture[repositoryName] as any).save.mockRejectedValueOnce(writeError);

      await expect(
        fixture.service.create({
          type,
          name: 'Atomic editorial content',
          authorId: 'author-id',
          publicationDate:
            type === ContentType.REUNION
              ? '2026-10-21T18:00:00.000Z'
              : undefined,
        } as any),
      ).rejects.toBe(writeError);

      expect(fixture.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.committedWrites).toEqual([]);
      expect(fixture.contentRepository.save).not.toHaveBeenCalled();
      expect(fixture.articleRepository.save).not.toHaveBeenCalled();
      expect(fixture.videoRepository.save).not.toHaveBeenCalled();
      expect(fixture.riffValleyPlaylistRepository.save).not.toHaveBeenCalled();
      expect(fixture.reunionRepository.save).not.toHaveBeenCalled();
      expect(fixture.pointRepository.save).not.toHaveBeenCalled();
    },
  );
});

describe('ContentsService automatic Video creation', () => {
  it('continues creating an editing Video with the Content author and a date', async () => {
    const author = { id: 'author-id' };
    const savedVideo = { id: 'video-id' };
    const videoRepository = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn().mockResolvedValue(savedVideo),
    };
    const contentRepository = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn().mockImplementation(async (content) => content),
    };
    const transaction = jest.fn(async (callback) =>
      callback({
        getRepository: (entity) =>
          entity === Video ? videoRepository : contentRepository,
      }),
    );
    contentRepository['manager' as any] = { transaction } as any;
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(author),
    };
    const creationService = new ContentCreationService(
      contentRepository as any,
      userRepository as any,
      {} as any,
      {} as any,
      {} as any,
      videoRepository as any,
      {} as any,
    );
    const service = new ContentsService({} as any, creationService, {} as any);

    const result = await service.create({
      type: ContentType.VIDEO,
      name: 'Video from Content',
      authorId: author.id,
    });

    expect(videoRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Video from Content',
        status: VideoStatus.EDITING,
        type: VideoType.CUSTOM,
        updateDate: expect.any(Date),
        user: author,
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(videoRepository.save).toHaveBeenCalledTimes(1);
    expect(result.video).toBe(savedVideo);
    expect(contentRepository.save).toHaveBeenCalledTimes(1);
  });
});

describe('ContentsService query facade', () => {
  it('forwards update and remove to ContentLifecycleService', async () => {
    const result = { id: 'content-id' } as Content;
    const lifecycleService = {
      update: jest.fn().mockResolvedValue(result),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ContentsService(
      {} as any,
      {} as any,
      lifecycleService as any,
    );
    const updateDto = { name: 'Updated' } as any;

    await expect(service.update('content-id', updateDto)).resolves.toBe(result);
    await expect(service.remove('content-id')).resolves.toBeUndefined();
    expect(lifecycleService.update).toHaveBeenCalledWith(
      'content-id',
      updateDto,
    );
    expect(lifecycleService.remove).toHaveBeenCalledWith('content-id');
  });

  it('forwards content creation to ContentCreationService', async () => {
    const result = { id: 'new-content' } as Content;
    const creationService = { create: jest.fn().mockResolvedValue(result) };
    const service = new ContentsService(
      {} as any,
      creationService as any,
      {} as any,
    );
    const dto = {
      type: ContentType.ARTICLE,
      name: 'Article',
      authorId: 'author-id',
    } as any;

    await expect(service.create(dto)).resolves.toBe(result);
    expect(creationService.create).toHaveBeenCalledWith(dto);
  });

  it('forwards all public query signatures to ContentQueryService', async () => {
    const content = { id: 'content-id' } as Content;
    const queryService = {
      findAll: jest.fn().mockResolvedValue([content]),
      findOne: jest.fn().mockResolvedValue(content),
      findByMonth: jest.fn().mockResolvedValue([content]),
      findOneByRiffValleyPlaylistId: jest.fn().mockResolvedValue(content),
      findOneByArticleId: jest.fn().mockResolvedValue(content),
      findOneByVideoId: jest.fn().mockResolvedValue(content),
      getDefaultAuthorId: jest.fn().mockResolvedValue('author-id'),
    };
    const creationService = { create: jest.fn() };
    const service = new ContentsService(
      queryService as any,
      creationService as any,
      {} as any,
    );

    await expect(service.findAll(true, false)).resolves.toEqual([content]);
    await expect(service.findOne('content-id')).resolves.toBe(content);
    await expect(service.findByMonth(2026, 10)).resolves.toEqual([content]);
    await expect(
      service.findOneByRiffValleyPlaylistId('playlist-id'),
    ).resolves.toBe(content);
    await expect(service.findOneByArticleId('article-id')).resolves.toBe(
      content,
    );
    await expect(service.findOneByVideoId('video-id')).resolves.toBe(content);
    await expect(service.getDefaultAuthorId()).resolves.toBe('author-id');

    expect(queryService.findAll).toHaveBeenCalledWith(true, false);
    expect(queryService.findOne).toHaveBeenCalledWith('content-id');
    expect(queryService.findByMonth).toHaveBeenCalledWith(2026, 10);
    expect(queryService.findOneByRiffValleyPlaylistId).toHaveBeenCalledWith(
      'playlist-id',
    );
    expect(queryService.findOneByArticleId).toHaveBeenCalledWith('article-id');
    expect(queryService.findOneByVideoId).toHaveBeenCalledWith('video-id');
    expect(queryService.getDefaultAuthorId).toHaveBeenCalledTimes(1);
  });
});
