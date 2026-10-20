import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  QueryFailedError,
} from 'typeorm';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { FindArticlesQueryDto } from './dto/find-articles-query.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { Article, ArticleStatus, ArticleType } from './entities/article.entity';
import { ContentsService } from '../contents/contents.service';
import { Content } from '../contents/entities/content.entity';

describe('ArticlesController validation', () => {
  const articleId = 'c17ee051-1a9b-4f33-a2b4-67f1a2508a4c';
  const userId = '96066b47-c254-4592-a526-8954c8601496';
  const publicationDate = '2026-10-15T12:00:00.000Z';
  const articleUserConstraints = [
    ['userId', 'FK_636f17dadfea1ffb4a412296a28'],
    ['editorId', 'FK_021ce4f1155af87f1a27d9ec54a'],
    ['coauthorId', 'FK_29740ddc0b7f0af9ed816db0f7a'],
  ] as const;
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  let persistedArticle: Article;
  let service: ArticlesService;
  let controller: ArticlesController;
  let repository: {
    create: jest.Mock<DeepPartial<Article>, [DeepPartial<Article>]>;
    merge: jest.Mock<Article, [Article, DeepPartial<Article>]>;
    save: jest.Mock<Promise<Article>, [DeepPartial<Article>]>;
    find: jest.Mock<Promise<Article[]>, [FindManyOptions<Article>?]>;
    findOne: jest.Mock<Promise<Article | null>, [FindOneOptions<Article>]>;
  };

  function article(overrides: Partial<Article> = {}): Article {
    return {
      id: articleId,
      name: 'Album review',
      type: ArticleType.REVIEW,
      status: ArticleStatus.NOT_STARTED,
      link: undefined,
      updateDate: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      content: null,
      user: undefined,
      editor: undefined,
      coauthor: undefined,
      ...overrides,
    } as Article;
  }

  async function create(payload: Record<string, unknown>) {
    const dto = await validationPipe.transform(payload, {
      type: 'body',
      metatype: CreateArticleDto,
    });
    return controller.create(dto as CreateArticleDto);
  }

  async function update(payload: Record<string, unknown>) {
    const dto = await validationPipe.transform(payload, {
      type: 'body',
      metatype: UpdateArticleDto,
    });
    return controller.update(articleId, dto as UpdateArticleDto);
  }

  async function list(payload: Record<string, unknown> = {}) {
    const query = await validationPipe.transform(payload, {
      type: 'query',
      metatype: FindArticlesQueryDto,
    });
    return controller.findAll(query as FindArticlesQueryDto);
  }

  async function expectBadRequest(action: Promise<unknown>) {
    let error: unknown;
    try {
      await action;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
  }

  async function expectNotFound(action: Promise<unknown>) {
    let error: unknown;
    try {
      await action;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
    return error as NotFoundException;
  }

  function foreignKeyError(
    table: string,
    constraint: string,
  ): QueryFailedError {
    return new QueryFailedError(
      'INSERT INTO article',
      [userId],
      Object.assign(new Error('private SQL and constraint detail'), {
        code: '23503',
        table,
        constraint,
      }),
    );
  }

  beforeEach(async () => {
    persistedArticle = article();
    repository = {
      create: jest.fn<DeepPartial<Article>, [DeepPartial<Article>]>(
        (values) => ({ ...values }),
      ),
      merge: jest.fn<Article, [Article, DeepPartial<Article>]>(
        (entity: Article, partial: DeepPartial<Article>) =>
          Object.assign(entity, partial),
      ),
      save: jest.fn<Promise<Article>, [DeepPartial<Article>]>(
        async (entity) => {
          persistedArticle = {
            ...entity,
            id: entity.id ?? articleId,
          } as Article;
          return persistedArticle;
        },
      ),
      find: jest.fn<Promise<Article[]>, [FindManyOptions<Article>?]>(
        async () => [],
      ),
      findOne: jest.fn<Promise<Article | null>, [FindOneOptions<Article>]>(
        async () => persistedArticle,
      ),
    };
    const contentsService: Pick<ContentsService, 'findOneByArticleId'> = {
      findOneByArticleId: jest.fn<Promise<Content | null>, [string]>(
        async () => null,
      ),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: getRepositoryToken(Article), useValue: repository },
        { provide: ContentsService, useValue: contentsService },
      ],
    }).compile();
    service = moduleRef.get(ArticlesService);
    controller = new ArticlesController(service);
  });

  describe('POST /articles', () => {
    it.each([
      [ArticleStatus.NOT_STARTED, {}],
      [ArticleStatus.IN_PROGRESS, {}],
      [ArticleStatus.EDITING, { userId }],
      [ArticleStatus.READY, { userId }],
      [ArticleStatus.PUBLISHED, { updateDate: publicationDate }],
    ])(
      'accepts %s when its required fields are present',
      async (status, extra) => {
        const response = await create({
          name: 'Album review',
          status,
          type: ArticleType.REVIEW,
          ...extra,
        });

        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(response).toMatchObject({
          id: articleId,
          name: 'Album review',
          status,
          type: ArticleType.REVIEW,
        });
        if ('userId' in extra) {
          expect(response.user).toEqual({ id: userId });
        }
        if ('updateDate' in extra) {
          expect(response.updateDate).toEqual(new Date(publicationDate));
        }
      },
    );

    it.each([[ArticleStatus.EDITING], [ArticleStatus.READY]])(
      'rejects %s without an assigned user with HTTP 400',
      async (status) => {
        await expectBadRequest(
          create({
            name: 'Album review',
            status,
            type: ArticleType.REVIEW,
          }),
        );

        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it('rejects published without an update date with HTTP 400', async () => {
      await expectBadRequest(
        create({
          name: 'Album review',
          status: ArticleStatus.PUBLISHED,
          type: ArticleType.REVIEW,
        }),
      );

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects statuses outside the enum through the Nest ValidationPipe', async () => {
      await expectBadRequest(
        create({
          name: 'Album review',
          status: 'archived',
          type: ArticleType.REVIEW,
        }),
      );

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('keeps the user relation optional', async () => {
      await create({
        name: 'Album review',
        status: ArticleStatus.NOT_STARTED,
        type: ArticleType.REVIEW,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ user: undefined }),
      );
    });

    it('preserves the successful assigned-user response', async () => {
      const response = await create({
        name: 'Album review',
        status: ArticleStatus.IN_PROGRESS,
        type: ArticleType.REVIEW,
        userId,
      });

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(response.user).toEqual({ id: userId });
    });

    it.each(articleUserConstraints)(
      'returns 404 when saving an article with missing %s',
      async (field, constraint) => {
        repository.save.mockRejectedValue(
          foreignKeyError('article', constraint),
        );

        const error = await expectNotFound(
          create({
            name: 'Album review',
            status: ArticleStatus.NOT_STARTED,
            type: ArticleType.REVIEW,
            [field]: userId,
          }),
        );

        expect(error.getResponse()).toEqual({
          message: 'One or more assigned users were not found',
          error: 'Not Found',
          statusCode: 404,
        });
        expect(JSON.stringify(error.getResponse())).not.toContain(
          'private SQL',
        );
      },
    );
  });

  describe('PATCH /articles/:id', () => {
    it.each([
      [
        ArticleStatus.NOT_STARTED,
        ArticleStatus.IN_PROGRESS,
        undefined,
        undefined,
      ],
      [
        ArticleStatus.IN_PROGRESS,
        ArticleStatus.EDITING,
        { id: userId },
        undefined,
      ],
      [ArticleStatus.EDITING, ArticleStatus.READY, { id: userId }, undefined],
      [
        ArticleStatus.READY,
        ArticleStatus.PUBLISHED,
        undefined,
        publicationDate,
      ],
      [
        ArticleStatus.PUBLISHED,
        ArticleStatus.NOT_STARTED,
        undefined,
        undefined,
      ],
    ])(
      'preserves the allowed transition %s -> %s',
      async (from, to, assignedUser, updateDate) => {
        persistedArticle = article({
          status: from,
          user: assignedUser as Article['user'],
        });

        const response = await update({
          status: to,
          ...(updateDate ? { updateDate } : {}),
        });

        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(to);
        if (to === ArticleStatus.PUBLISHED) {
          expect(response.updateDate).toEqual(new Date(publicationDate));
        }
      },
    );

    it.each([[ArticleStatus.EDITING], [ArticleStatus.READY]])(
      'rejects transition to %s without an assigned user',
      async (status) => {
        persistedArticle = article({ status: ArticleStatus.NOT_STARTED });

        await expectBadRequest(update({ status }));
        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it('rejects transition to published without an update date', async () => {
      persistedArticle = article({ status: ArticleStatus.READY });

      await expectBadRequest(update({ status: ArticleStatus.PUBLISHED }));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('does not revalidate an unchanged published status', async () => {
      persistedArticle = article({
        status: ArticleStatus.PUBLISHED,
        updateDate: null,
      });

      const response = await update({ status: ArticleStatus.PUBLISHED });

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(ArticleStatus.PUBLISHED);
      expect(response.updateDate).toBeNull();
    });

    it('rejects statuses outside the enum through the Nest ValidationPipe', async () => {
      await expectBadRequest(update({ status: 'archived' }));
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('preserves an update assigning an existing user', async () => {
      const response = await update({ userId });

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(response.user).toEqual({ id: userId });
    });

    it.each(articleUserConstraints)(
      'returns 404 when updating an article with missing %s',
      async (field, constraint) => {
        repository.save.mockRejectedValue(
          foreignKeyError('article', constraint),
        );

        const error = await expectNotFound(update({ [field]: userId }));

        expect(error.getResponse()).toEqual({
          message: 'One or more assigned users were not found',
          error: 'Not Found',
          statusCode: 404,
        });
      },
    );

    it.each(['create', 'update'] as const)(
      'propagates a foreign-key error from another relation during %s',
      async (operation) => {
        const error = foreignKeyError(
          'content',
          'FK_ae4cf5971a967551d3953fa4045',
        );
        repository.save.mockRejectedValue(error);

        const action =
          operation === 'create'
            ? create({
                name: 'Album review',
                status: ArticleStatus.NOT_STARTED,
                type: ArticleType.REVIEW,
                userId,
              })
            : update({ userId });

        await expect(action).rejects.toBe(error);
      },
    );

    it.each(['create', 'update'] as const)(
      'propagates unexpected persistence errors unchanged during %s',
      async (operation) => {
        const error = new Error('database connection lost');
        repository.save.mockRejectedValue(error);

        const action =
          operation === 'create'
            ? create({
                name: 'Album review',
                status: ArticleStatus.NOT_STARTED,
                type: ArticleType.REVIEW,
                userId,
              })
            : update({ userId });

        await expect(action).rejects.toBe(error);
      },
    );
  });

  describe('GET /articles', () => {
    it('returns the service result unchanged when no filters are provided', async () => {
      const rows = [article()];
      repository.find = jest.fn().mockResolvedValue(rows);

      const response = await list();

      expect(response).toBe(rows);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
    });

    it.each([
      [{ limit: '25' }, { take: 25, skip: 0 }],
      [{ offset: '10' }, { take: 50, skip: 10 }],
      [{ q: 'review' }, { take: 50, skip: 0 }],
      [{ status: ArticleStatus.READY }, { take: 50, skip: 0 }],
      [{ userId }, { take: 50, skip: 0 }],
      [
        {
          limit: '25',
          offset: '10',
          q: 'review',
          status: ArticleStatus.READY,
          userId,
        },
        { take: 25, skip: 10 },
      ],
    ])(
      'accepts valid query %o and forwards transformed values',
      async (query, paging) => {
        await list(query);

        expect(repository.find).toHaveBeenCalledWith(
          expect.objectContaining(paging),
        );
      },
    );

    it('applies the text and status filters together', async () => {
      await list({ q: 'review', status: ArticleStatus.READY });

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ArticleStatus.READY,
            name: expect.any(Object),
          }),
        }),
      );
    });

    it('applies userId to author, editor, and coauthor branches', async () => {
      await list({ userId });

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            { user: { id: userId } },
            { editor: { id: userId } },
            { coauthor: { id: userId } },
          ],
        }),
      );
    });

    it('combines text, status, and user filters without changing their semantics', async () => {
      await list({ q: 'review', status: ArticleStatus.READY, userId });

      const [options] = repository.find.mock.calls[0];
      expect(options.where).toEqual([
        expect.objectContaining({
          status: ArticleStatus.READY,
          name: expect.any(Object),
          user: { id: userId },
        }),
        expect.objectContaining({
          status: ArticleStatus.READY,
          name: expect.any(Object),
          editor: { id: userId },
        }),
        expect.objectContaining({
          status: ArticleStatus.READY,
          name: expect.any(Object),
          coauthor: { id: userId },
        }),
      ]);
    });

    it('preserves the legacy empty-string behavior', async () => {
      await list({ limit: '', offset: '', q: '', status: '', userId: '' });

      const [options] = repository.find.mock.calls[0];
      expect(options).toEqual(
        expect.objectContaining({ where: {}, take: 0, skip: 0 }),
      );
    });

    it('preserves the existing clamp for negative and oversized pagination', async () => {
      await list({ limit: '-4', offset: '-8' });
      expect(repository.find).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 0, skip: 0 }),
      );

      await list({ limit: '250', offset: '9' });
      expect(repository.find).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 200, skip: 9 }),
      );
    });

    it.each([
      { limit: 'abc' },
      { limit: '1.5' },
      { limit: '1e2' },
      { offset: '0x10' },
      { offset: '9007199254740992' },
      { q: ['review'] },
      { status: 'archived' },
      { userId: 'not-a-uuid' },
    ])(
      'rejects invalid query %o with HTTP 400 before calling the service',
      async (query) => {
        const findAll = jest.spyOn(service, 'findAll');

        await expectBadRequest(list(query));

        expect(findAll).not.toHaveBeenCalled();
        expect(repository.find).not.toHaveBeenCalled();
      },
    );
  });
});
