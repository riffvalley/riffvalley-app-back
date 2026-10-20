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
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, DeepPartial, EntityManager } from 'typeorm';
import { User } from 'src/identity/auth/entities/user.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import { ContentQueryService } from '../application/content-query.service';
import { ContentLifecycleService } from '../application/content-lifecycle.service';
import { CreateContentDto } from '../dto/create-content.dto';
import { UpdateContentDto } from '../dto/update-content.dto';

describe('ContentsService creation facade compatibility', () => {
  const makeCreateDto = (
    values: Pick<CreateContentDto, 'type' | 'name' | 'authorId'> &
      Partial<Omit<CreateContentDto, 'type' | 'name' | 'authorId'>> & {
        publicationDate?: string | null;
      },
  ): CreateContentDto => {
    const dto = new CreateContentDto();
    Object.assign(dto, values);
    if (values.publicationDate === null) {
      Object.defineProperty(dto, 'publicationDate', { value: null });
    }
    return dto;
  };

  const makeContent = (overrides: Partial<Content> = {}) =>
    Object.assign(new Content(), {
      id: 'content-id',
      type: ContentType.BEST,
      name: 'Monthly list',
      publicationDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
      list: Object.assign(new List(), { id: 'list-id' }),
      ...overrides,
    });

  const makeList = () =>
    Object.assign(new List(), {
      id: 'list-id',
      type: ListType.MONTH,
      releaseDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
    });

  const makeService = async (content = makeContent()) => {
    const dataSource = new DataSource({ type: 'postgres' });
    const transactionManager = new EntityManager(dataSource);
    const list = makeList();
    const committedWrites: unknown[] = [];
    let pendingWrites: unknown[] = [];
    const txContentRepository = transactionManager.getRepository(Content);
    const txContentSave = jest
      .spyOn(txContentRepository, 'save')
      .mockImplementation(async (value) => {
        pendingWrites.push(value);
        return Object.assign(new Content(), value);
      });
    const txContentRemove = jest
      .spyOn(txContentRepository, 'remove')
      .mockImplementation(async (value) => {
        pendingWrites.push(value);
        return value;
      });
    const txListRepository = transactionManager.getRepository(List);
    const txListFindOne = jest
      .spyOn(txListRepository, 'findOne')
      .mockResolvedValue(list);
    const txListSave = jest
      .spyOn(txListRepository, 'save')
      .mockImplementation(async (value) => {
        pendingWrites.push(value);
        return Object.assign(new List(), value);
      });
    const txReunionRepository = transactionManager.getRepository(Reunion);
    const txReunionCreate = jest
      .spyOn(txReunionRepository, 'create')
      .mockImplementation((value) => Object.assign(new Reunion(), value));
    const txReunionSave = jest
      .spyOn(txReunionRepository, 'save')
      .mockImplementation(async (value) => {
        pendingWrites.push(value);
        return Object.assign(new Reunion(), value, { id: 'reunion-id' });
      });
    const txReunionFindOne = jest
      .spyOn(txReunionRepository, 'findOne')
      .mockResolvedValue(
        Object.assign(new Reunion(), { id: 'reunion-id', titulo: 'Old title' }),
      );
    const txReunionDelete = jest
      .spyOn(txReunionRepository, 'delete')
      .mockImplementation(async (id) => {
        pendingWrites.push({ deleteReunion: id });
        return { raw: [], affected: 1 };
      });
    const txPointRepository = transactionManager.getRepository(Point);
    const txPointSave = jest.fn(async (value: DeepPartial<Point>[]) => {
      pendingWrites.push(value);
      return value.map((point) => Object.assign(new Point(), point));
    });
    Object.defineProperty(txPointRepository, 'save', { value: txPointSave });
    const txRiffValleyPlaylistRepository =
      transactionManager.getRepository(RiffValleyPlaylist);
    const txRiffValleyPlaylistCreate = jest
      .spyOn(txRiffValleyPlaylistRepository, 'create')
      .mockImplementation((value) =>
        Object.assign(new RiffValleyPlaylist(), value),
      );
    const txRiffValleyPlaylistSave = jest
      .spyOn(txRiffValleyPlaylistRepository, 'save')
      .mockImplementation(async (value) => {
        pendingWrites.push(value);
        return Object.assign(new RiffValleyPlaylist(), value);
      });
    const txArticleRepository = transactionManager.getRepository(Article);
    const txArticleCreate = jest
      .spyOn(txArticleRepository, 'create')
      .mockImplementation((value) => Object.assign(new Article(), value));
    const txArticleSave = jest
      .spyOn(txArticleRepository, 'save')
      .mockImplementation(async (value) => {
        pendingWrites.push(value);
        return Object.assign(new Article(), value);
      });
    const txVideoRepository = transactionManager.getRepository(Video);
    const txVideoCreate = jest
      .spyOn(txVideoRepository, 'create')
      .mockImplementation((value) => Object.assign(new Video(), value));
    const txVideoSave = jest
      .spyOn(txVideoRepository, 'save')
      .mockImplementation(async (value) => {
        pendingWrites.push(value);
        return Object.assign(new Video(), value);
      });
    const transaction = jest.fn(
      async <Result>(
        callback: (manager: EntityManager) => Promise<Result>,
      ): Promise<Result> => {
        pendingWrites = [];
        try {
          const result = await callback(transactionManager);
          committedWrites.push(...pendingWrites);
          return result;
        } catch (error) {
          pendingWrites = [];
          throw error;
        }
      },
    );
    Object.defineProperty(dataSource.manager, 'transaction', {
      value: transaction,
    });
    const contentRepository = dataSource.getRepository(Content);
    const contentCreate = jest
      .spyOn(contentRepository, 'create')
      .mockImplementation((value) => Object.assign(new Content(), value));
    const contentSave = jest
      .spyOn(contentRepository, 'save')
      .mockImplementation(async (value) => Object.assign(new Content(), value));
    const contentFindOne = jest
      .spyOn(contentRepository, 'findOne')
      .mockResolvedValue(content);
    const contentRemove = jest
      .spyOn(contentRepository, 'remove')
      .mockResolvedValue(content);
    const userRepository = dataSource.getRepository(User);
    const author = Object.assign(new User(), { id: 'author-id' });
    const userFindOne = jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue(author);
    const reunionRepository = dataSource.getRepository(Reunion);
    const reunionFindOne = jest
      .spyOn(reunionRepository, 'findOne')
      .mockResolvedValue(null);
    const reunionCreate = jest
      .spyOn(reunionRepository, 'create')
      .mockImplementation((value) => Object.assign(new Reunion(), value));
    const reunionSave = jest
      .spyOn(reunionRepository, 'save')
      .mockResolvedValue(Object.assign(new Reunion(), { id: 'reunion-id' }));
    const reunionDelete = jest
      .spyOn(reunionRepository, 'delete')
      .mockResolvedValue({ raw: [], affected: 1 });
    const pointRepository = dataSource.getRepository(Point);
    const pointSave = jest.spyOn(pointRepository, 'save');
    const riffValleyPlaylistRepository =
      dataSource.getRepository(RiffValleyPlaylist);
    const riffValleyPlaylistFindOne = jest
      .spyOn(riffValleyPlaylistRepository, 'findOne')
      .mockResolvedValue(
        Object.assign(new RiffValleyPlaylist(), {
          id: 'playlist-id',
          status: 'editing',
          updateDate: null,
        }),
      );
    const riffValleyPlaylistCreate = jest
      .spyOn(riffValleyPlaylistRepository, 'create')
      .mockImplementation((value) =>
        Object.assign(new RiffValleyPlaylist(), value),
      );
    const riffValleyPlaylistSave = jest
      .spyOn(riffValleyPlaylistRepository, 'save')
      .mockResolvedValue(
        Object.assign(new RiffValleyPlaylist(), { id: 'playlist-id' }),
      );
    const articleRepository = dataSource.getRepository(Article);
    const articleFindOne = jest
      .spyOn(articleRepository, 'findOne')
      .mockResolvedValue(
        Object.assign(new Article(), {
          id: 'article-id',
          status: 'editing',
          updateDate: null,
        }),
      );
    const articleCreate = jest
      .spyOn(articleRepository, 'create')
      .mockImplementation((value) => Object.assign(new Article(), value));
    const articleSave = jest
      .spyOn(articleRepository, 'save')
      .mockResolvedValue(Object.assign(new Article(), { id: 'article-id' }));
    const videoRepository = dataSource.getRepository(Video);
    const videoFindOne = jest
      .spyOn(videoRepository, 'findOne')
      .mockResolvedValue(
        Object.assign(new Video(), {
          id: 'video-id',
          status: VideoStatus.EDITING,
          updateDate: null,
        }),
      );
    const videoCreate = jest
      .spyOn(videoRepository, 'create')
      .mockImplementation((value) => Object.assign(new Video(), value));
    const videoSave = jest
      .spyOn(videoRepository, 'save')
      .mockResolvedValue(Object.assign(new Video(), { id: 'video-id' }));
    const listsService: jest.Mocked<
      Pick<
        ListsService,
        'createWeeklyList' | 'createMonthlyList' | 'removeList'
      >
    > = {
      createWeeklyList: jest.fn().mockResolvedValue(list),
      createMonthlyList: jest.fn().mockResolvedValue(list),
      removeList: jest.fn().mockResolvedValue(list),
    };
    const queryService: jest.Mocked<
      Pick<
        ContentQueryService,
        | 'findAll'
        | 'findOne'
        | 'findByMonth'
        | 'findOneByRiffValleyPlaylistId'
        | 'findOneByArticleId'
        | 'findOneByVideoId'
        | 'getDefaultAuthorId'
      >
    > = {
      findAll: jest.fn(),
      findOne: jest.fn().mockResolvedValue(content),
      findByMonth: jest.fn(),
      findOneByRiffValleyPlaylistId: jest.fn(),
      findOneByArticleId: jest.fn(),
      findOneByVideoId: jest.fn(),
      getDefaultAuthorId: jest.fn(),
    };
    const lifecycleService: jest.Mocked<
      Pick<ContentLifecycleService, 'update' | 'remove'>
    > = {
      update: jest.fn(),
      remove: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ContentsService,
        ContentCreationService,
        { provide: ContentQueryService, useValue: queryService },
        { provide: ContentLifecycleService, useValue: lifecycleService },
        { provide: ListsService, useValue: listsService },
        { provide: getRepositoryToken(Content), useValue: contentRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Reunion), useValue: reunionRepository },
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: riffValleyPlaylistRepository,
        },
        { provide: getRepositoryToken(Article), useValue: articleRepository },
        { provide: getRepositoryToken(Video), useValue: videoRepository },
      ],
    }).compile();
    const service = module.get(ContentsService);
    const creationService = module.get(ContentCreationService);

    return {
      module,
      dataSource,
      service,
      creationService,
      lifecycleService,
      content,
      list,
      contentRepository,
      txContentRepository,
      txContentSave,
      txContentRemove,
      txListRepository,
      txListFindOne,
      txListSave,
      txReunionRepository,
      txReunionCreate,
      txReunionSave,
      txReunionFindOne,
      txReunionDelete,
      txPointRepository,
      txPointSave,
      txRiffValleyPlaylistRepository,
      txRiffValleyPlaylistCreate,
      txRiffValleyPlaylistSave,
      txArticleRepository,
      txArticleCreate,
      txArticleSave,
      txVideoRepository,
      txVideoCreate,
      txVideoSave,
      committedWrites,
      userRepository,
      author,
      reunionRepository,
      pointRepository,
      riffValleyPlaylistRepository,
      articleRepository,
      videoRepository,
      listsService,
      queryService,
      manager: transactionManager,
      transaction,
      contentCreate,
      contentSave,
      contentFindOne,
      contentRemove,
      userFindOne,
      reunionFindOne,
      reunionCreate,
      reunionSave,
      reunionDelete,
      pointSave,
      riffValleyPlaylistFindOne,
      riffValleyPlaylistCreate,
      riffValleyPlaylistSave,
      articleFindOne,
      articleCreate,
      articleSave,
      videoFindOne,
      videoCreate,
      videoSave,
    };
  };

  type ServiceFixture = Awaited<ReturnType<typeof makeService>>;

  const mockCompanionSaveResult = (
    fixture: ServiceFixture,
    type: ContentType,
    id: string,
  ): Article | Video | RiffValleyPlaylist | Reunion => {
    switch (type) {
      case ContentType.ARTICLE: {
        const saved = Object.assign(new Article(), { id });
        fixture.txArticleSave.mockResolvedValueOnce(saved);
        return saved;
      }
      case ContentType.VIDEO: {
        const saved = Object.assign(new Video(), { id });
        fixture.txVideoSave.mockResolvedValueOnce(saved);
        return saved;
      }
      case ContentType.RIFF_VALLEY_PLAYLIST: {
        const saved = Object.assign(new RiffValleyPlaylist(), { id });
        fixture.txRiffValleyPlaylistSave.mockResolvedValueOnce(saved);
        return saved;
      }
      case ContentType.REUNION: {
        const saved = Object.assign(new Reunion(), { id });
        fixture.txReunionSave.mockResolvedValueOnce(saved);
        return saved;
      }
      default:
        throw new Error(`Unsupported companion type: ${type}`);
    }
  };

  const rejectTransactionalSave = (
    fixture: ServiceFixture,
    repositoryName: string,
    error: Error,
  ) => {
    switch (repositoryName) {
      case 'txArticleRepository':
        fixture.txArticleSave.mockRejectedValueOnce(error);
        break;
      case 'txVideoRepository':
        fixture.txVideoSave.mockRejectedValueOnce(error);
        break;
      case 'txRiffValleyPlaylistRepository':
        fixture.txRiffValleyPlaylistSave.mockRejectedValueOnce(error);
        break;
      case 'txReunionRepository':
        fixture.txReunionSave.mockRejectedValueOnce(error);
        break;
      case 'txPointRepository':
        fixture.txPointSave.mockRejectedValueOnce(error);
        break;
      case 'txContentRepository':
        fixture.txContentSave.mockRejectedValueOnce(error);
        break;
      default:
        throw new Error(`Unknown transaction repository: ${repositoryName}`);
    }
  };

  it('creates RADAR Content and its List using the same manager', async () => {
    const {
      service,
      contentRepository,
      txContentRepository,
      listsService,
      manager,
      transaction,
    } = await makeService();

    const result = await service.create(
      makeCreateDto({
        type: ContentType.RADAR,
        name: 'Radar semanal',
        authorId: 'author-id',
        publicationDate: '2026-10-01T00:00:00.000Z',
      }),
    );

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
        await makeService();

      for (const publicationDate of [undefined, null, 'not-a-date']) {
        await expect(
          service.create(
            makeCreateDto({
              type,
              name: 'Editorial content',
              authorId: 'author-id',
              publicationDate,
            }),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }

      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(contentRepository.create).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('creates BEST with the supplied date and creates its List transactionally', async () => {
    const { service, listsService, txContentRepository, manager, transaction } =
      await makeService();
    const publicationDate = '2026-11-15T12:00:00.000Z';

    await service.create(
      makeCreateDto({
        type: ContentType.BEST,
        name: 'Mejores de noviembre',
        authorId: 'author-id',
        publicationDate,
      }),
    );

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
      const fixture = await makeService();
      const repository = fixture[repositoryName];

      const result = await fixture.service.create(
        makeCreateDto({
          type,
          name: 'Linked editorial content',
          authorId: 'author-id',
          [field]: id,
        }),
      );

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
      const fixture = await makeService();
      const updateDate = new Date('2026-10-19T12:00:00.000Z');
      if (repositoryName === 'articleRepository') {
        fixture.articleFindOne.mockResolvedValueOnce(
          Object.assign(new Article(), {
            id: 'linked-id',
            status: 'published',
            updateDate,
          }),
        );
      } else if (repositoryName === 'videoRepository') {
        fixture.videoFindOne.mockResolvedValueOnce(
          Object.assign(new Video(), {
            id: 'linked-id',
            status: 'published',
            updateDate,
          }),
        );
      } else {
        fixture.riffValleyPlaylistFindOne.mockResolvedValueOnce(
          Object.assign(new RiffValleyPlaylist(), {
            id: 'linked-id',
            status: 'published',
            updateDate,
          }),
        );
      }

      const result = await fixture.service.create(
        makeCreateDto({
          type,
          name: 'Published linked content',
          authorId: 'author-id',
          [field]: 'linked-id',
        }),
      );

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
      const fixture = await makeService();
      if (repositoryName === 'articleRepository') {
        fixture.articleFindOne.mockResolvedValueOnce(null);
      } else if (repositoryName === 'videoRepository') {
        fixture.videoFindOne.mockResolvedValueOnce(null);
      } else {
        fixture.riffValleyPlaylistFindOne.mockResolvedValueOnce(null);
      }

      const error = await fixture.service
        .create(
          makeCreateDto({
            type,
            name: 'Linked editorial content',
            authorId: 'author-id',
            [field]: 'missing-id',
          }),
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NotFoundException);
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
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
    const fixture = await makeService();
    const databaseError = new Error('repository unavailable');
    fixture.articleFindOne.mockRejectedValueOnce(databaseError);

    await expect(
      fixture.service.create(
        makeCreateDto({
          type: ContentType.ARTICLE,
          name: 'Linked editorial content',
          authorId: 'author-id',
          articleId: 'article-id',
        }),
      ),
    ).rejects.toBe(databaseError);

    expect(fixture.contentRepository.create).not.toHaveBeenCalled();
    expect(fixture.contentRepository.save).not.toHaveBeenCalled();
  });

  it('reuses an explicitly supplied Reunion for a REUNION Content', async () => {
    const fixture = await makeService();
    const existingReunion = Object.assign(new Reunion(), {
      id: 'existing-reunion-id',
    });
    fixture.reunionFindOne.mockResolvedValueOnce(existingReunion);

    const result = await fixture.service.create(
      makeCreateDto({
        type: ContentType.REUNION,
        name: 'Existing reunion content',
        authorId: 'author-id',
        reunionId: existingReunion.id,
        publicationDate: '2026-10-21T18:00:00.000Z',
      }),
    );

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
    const fixture = await makeService();

    const error = await fixture.service
      .create(
        makeCreateDto({
          type: ContentType.REUNION,
          name: 'Missing reunion content',
          authorId: 'author-id',
          reunionId: 'missing-reunion-id',
          publicationDate: '2026-10-21T18:00:00.000Z',
        }),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    if (!(error instanceof NotFoundException)) {
      throw error;
    }
    expect(error.getStatus()).toBe(404);
    expect(error.message).toBe('Reunion with id missing-reunion-id not found');
    expect(fixture.contentRepository.create).not.toHaveBeenCalled();
    expect(fixture.reunionRepository.save).not.toHaveBeenCalled();
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
  });

  it('still creates a Reunion and its default points when no reunionId is supplied', async () => {
    const fixture = await makeService();

    const result = await fixture.service.create(
      makeCreateDto({
        type: ContentType.REUNION,
        name: 'New weekly reunion',
        authorId: 'author-id',
        publicationDate: '2026-10-21T18:00:00.000Z',
      }),
    );

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
      const fixture = await makeService();
      const savedCompanion = mockCompanionSaveResult(
        fixture,
        type,
        `${type}-id`,
      );

      const result = await fixture.service.create(
        makeCreateDto({
          type,
          name: 'Atomic editorial content',
          authorId: 'author-id',
          publicationDate:
            type === ContentType.REUNION
              ? '2026-10-21T18:00:00.000Z'
              : undefined,
        }),
      );

      expect(fixture.transaction).toHaveBeenCalledTimes(1);
      const saveMock =
        repositoryName === 'txArticleRepository'
          ? fixture.txArticleSave
          : repositoryName === 'txVideoRepository'
            ? fixture.txVideoSave
            : repositoryName === 'txRiffValleyPlaylistRepository'
              ? fixture.txRiffValleyPlaylistSave
              : fixture.txReunionSave;
      expect(saveMock).toHaveBeenCalledTimes(1);
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
      const fixture = await makeService();
      const writeError = new Error(`${repositoryName} write failed`);
      rejectTransactionalSave(fixture, repositoryName, writeError);

      await expect(
        fixture.service.create(
          makeCreateDto({
            type,
            name: 'Atomic editorial content',
            authorId: 'author-id',
            publicationDate:
              type === ContentType.REUNION
                ? '2026-10-21T18:00:00.000Z'
                : undefined,
          }),
        ),
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
  describe('ContentsService automatic Video creation', () => {
    it('continues creating an editing Video with the Content author and a date', async () => {
      const fixture = await makeService();
      const author = fixture.author;
      const savedVideo = Object.assign(new Video(), { id: 'video-id' });
      fixture.txVideoSave.mockResolvedValueOnce(savedVideo);

      const result = await fixture.service.create(
        makeCreateDto({
          type: ContentType.VIDEO,
          name: 'Video from Content',
          authorId: 'author-id',
        }),
      );

      expect(fixture.txVideoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Video from Content',
          status: VideoStatus.EDITING,
          type: VideoType.CUSTOM,
          updateDate: expect.any(Date),
          user: author,
        }),
      );
      expect(fixture.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.txVideoSave).toHaveBeenCalledTimes(1);
      expect(result.video).toBe(savedVideo);
      expect(fixture.txContentSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('ContentsService query facade', () => {
    it('forwards update and remove to ContentLifecycleService', async () => {
      const fixture = await makeService();
      const result = makeContent();
      fixture.lifecycleService.update.mockResolvedValue(result);
      const updateDto = Object.assign(new UpdateContentDto(), {
        name: 'Updated',
      });

      await expect(
        fixture.service.update('content-id', updateDto),
      ).resolves.toBe(result);
      await expect(
        fixture.service.remove('content-id'),
      ).resolves.toBeUndefined();
      expect(fixture.lifecycleService.update).toHaveBeenCalledWith(
        'content-id',
        updateDto,
      );
      expect(fixture.lifecycleService.remove).toHaveBeenCalledWith(
        'content-id',
      );
    });

    it('forwards content creation to ContentCreationService', async () => {
      const fixture = await makeService();
      const result = makeContent({ id: 'new-content' });
      jest.spyOn(fixture.creationService, 'create').mockResolvedValue(result);
      const dto = makeCreateDto({
        type: ContentType.ARTICLE,
        name: 'Article',
        authorId: 'author-id',
      });

      await expect(fixture.service.create(dto)).resolves.toBe(result);
      expect(fixture.creationService.create).toHaveBeenCalledWith(dto);
    });

    it('forwards all public query signatures to ContentQueryService', async () => {
      const fixture = await makeService();
      const content = makeContent();
      fixture.queryService.findAll.mockResolvedValue([content]);
      fixture.queryService.findOne.mockResolvedValue(content);
      fixture.queryService.findByMonth.mockResolvedValue([content]);
      fixture.queryService.findOneByRiffValleyPlaylistId.mockResolvedValue(
        content,
      );
      fixture.queryService.findOneByArticleId.mockResolvedValue(content);
      fixture.queryService.findOneByVideoId.mockResolvedValue(content);
      fixture.queryService.getDefaultAuthorId.mockResolvedValue('author-id');

      await expect(fixture.service.findAll(true, false)).resolves.toEqual([
        content,
      ]);
      await expect(fixture.service.findOne('content-id')).resolves.toBe(
        content,
      );
      await expect(fixture.service.findByMonth(2026, 10)).resolves.toEqual([
        content,
      ]);
      await expect(
        fixture.service.findOneByRiffValleyPlaylistId('playlist-id'),
      ).resolves.toBe(content);
      await expect(
        fixture.service.findOneByArticleId('article-id'),
      ).resolves.toBe(content);
      await expect(fixture.service.findOneByVideoId('video-id')).resolves.toBe(
        content,
      );
      await expect(fixture.service.getDefaultAuthorId()).resolves.toBe(
        'author-id',
      );

      expect(fixture.queryService.findAll).toHaveBeenCalledWith(true, false);
      expect(fixture.queryService.findOne).toHaveBeenCalledWith('content-id');
      expect(fixture.queryService.findByMonth).toHaveBeenCalledWith(2026, 10);
      expect(
        fixture.queryService.findOneByRiffValleyPlaylistId,
      ).toHaveBeenCalledWith('playlist-id');
      expect(fixture.queryService.findOneByArticleId).toHaveBeenCalledWith(
        'article-id',
      );
      expect(fixture.queryService.findOneByVideoId).toHaveBeenCalledWith(
        'video-id',
      );
      expect(fixture.queryService.getDefaultAuthorId).toHaveBeenCalledTimes(1);
    });
  });
});
