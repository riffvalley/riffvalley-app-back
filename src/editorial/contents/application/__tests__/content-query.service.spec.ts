import { NotFoundException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { User } from 'src/identity/auth/entities/user.entity';
import { ContentsModule } from '../../contents.module';
import { Content, ContentType } from '../../entities/content.entity';
import { ContentQueryService } from '../content-query.service';

describe('ContentQueryService', () => {
  const makeFixture = async () => {
    const dataSource = new DataSource({ type: 'postgres' });
    const contentRepo = dataSource.getRepository(Content);
    const userRepo = dataSource.getRepository(User);
    const content = Object.assign(new Content(), {
      id: 'content-id',
      type: ContentType.ARTICLE,
    });
    const contentFind = jest
      .spyOn(contentRepo, 'find')
      .mockResolvedValue([content]);
    const contentFindOne = jest
      .spyOn(contentRepo, 'findOne')
      .mockResolvedValue(content);
    const userFindOne = jest.spyOn(userRepo, 'findOne');
    const module = await Test.createTestingModule({
      providers: [
        ContentQueryService,
        { provide: getRepositoryToken(Content), useValue: contentRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    return {
      service: module.get(ContentQueryService),
      module,
      dataSource,
      contentRepo,
      userRepo,
      content,
      contentFind,
      contentFindOne,
      userFindOne,
    };
  };

  it.each([
    [undefined, undefined, {}],
    [true, undefined, { ready: true }],
    [undefined, false, { backlog: false }],
    [true, false, { ready: true, backlog: false }],
  ] as const)(
    'findAll applies filters %# and retains relation/order options',
    async (ready, backlog, where) => {
      const fixture = await makeFixture();

      await expect(fixture.service.findAll(ready, backlog)).resolves.toEqual([
        fixture.content,
      ]);
      expect(fixture.contentFind).toHaveBeenCalledWith({
        where,
        relations: [
          'author',
          'list',
          'list.asignations',
          'riffValleyPlaylist',
          'riffValleyPlaylist.user',
          'article',
          'article.user',
          'article.editor',
          'video',
          'video.user',
          'video.editor',
        ],
        order: { publicationDate: 'DESC' },
      });
      await fixture.module.close();
    },
  );

  it('findOne loads the existing relations and preserves its 404', async () => {
    const fixture = await makeFixture();
    fixture.contentFindOne
      .mockResolvedValueOnce(fixture.content)
      .mockResolvedValueOnce(null);

    await expect(fixture.service.findOne('content-id')).resolves.toBe(
      fixture.content,
    );
    expect(fixture.contentFindOne).toHaveBeenNthCalledWith(1, {
      where: { id: 'content-id' },
      relations: [
        'author',
        'list',
        'riffValleyPlaylist',
        'riffValleyPlaylist.user',
        'article',
        'article.user',
        'article.editor',
        'video',
        'video.user',
        'video.editor',
      ],
    });
    await expect(fixture.service.findOne('missing-id')).rejects.toEqual(
      new NotFoundException('Content with id missing-id not found'),
    );
    await fixture.module.close();
  });

  it('findByMonth preserves joins, inclusive seven-day range, and DESC order', async () => {
    const fixture = await makeFixture();
    const builder = new SelectQueryBuilder<Content>(fixture.dataSource);
    const leftJoinAndSelect = jest
      .spyOn(builder, 'leftJoinAndSelect')
      .mockReturnValue(builder);
    const where = jest.spyOn(builder, 'where').mockReturnValue(builder);
    const andWhere = jest.spyOn(builder, 'andWhere').mockReturnValue(builder);
    const orderBy = jest.spyOn(builder, 'orderBy').mockReturnValue(builder);
    jest.spyOn(builder, 'getMany').mockResolvedValue([fixture.content]);
    const createQueryBuilder = jest
      .spyOn(fixture.contentRepo, 'createQueryBuilder')
      .mockReturnValue(builder);

    await expect(fixture.service.findByMonth(2026, 10)).resolves.toEqual([
      fixture.content,
    ]);
    expect(createQueryBuilder).toHaveBeenCalledWith('content');
    expect(leftJoinAndSelect.mock.calls).toEqual([
      ['content.author', 'author'],
      ['content.list', 'list'],
      ['list.asignations', 'asignations'],
      ['content.riffValleyPlaylist', 'riffValleyPlaylist'],
      ['riffValleyPlaylist.user', 'riffValleyPlaylistUser'],
      ['content.article', 'article'],
      ['article.user', 'articleUser'],
      ['article.editor', 'articleEditor'],
      ['content.video', 'video'],
      ['video.user', 'videoUser'],
      ['video.editor', 'videoEditor'],
    ]);
    const start = new Date(2026, 9, 1);
    start.setDate(start.getDate() - 7);
    const end = new Date(2026, 9, 31);
    end.setDate(end.getDate() + 7);
    expect(where).toHaveBeenCalledWith(
      'content.publicationDate >= :startDate',
      { startDate: start },
    );
    expect(andWhere).toHaveBeenCalledWith(
      'content.publicationDate <= :endDate',
      { endDate: end },
    );
    expect(orderBy).toHaveBeenCalledWith('content.publicationDate', 'DESC');
    await fixture.module.close();
  });

  it.each([
    [
      'findOneByRiffValleyPlaylistId',
      'playlist-id',
      { riffValleyPlaylist: { id: 'playlist-id' } },
      (service: ContentQueryService, id: string) =>
        service.findOneByRiffValleyPlaylistId(id),
    ],
    [
      'findOneByArticleId',
      'article-id',
      { article: { id: 'article-id' } },
      (service: ContentQueryService, id: string) =>
        service.findOneByArticleId(id),
    ],
    [
      'findOneByVideoId',
      'video-id',
      { video: { id: 'video-id' } },
      (service: ContentQueryService, id: string) =>
        service.findOneByVideoId(id),
    ],
  ] as const)(
    '%s returns null and queries by the matching relation',
    async (_method, id, where, invoke) => {
      const fixture = await makeFixture();
      fixture.contentFindOne.mockResolvedValue(null);

      await expect(invoke(fixture.service, id)).resolves.toBeNull();
      expect(fixture.contentFindOne).toHaveBeenCalledWith({ where });
      await fixture.module.close();
    },
  );

  it('selects the first UUID ordered user as default and preserves the missing-user error', async () => {
    const fixture = await makeFixture();
    fixture.userFindOne
      .mockResolvedValueOnce(Object.assign(new User(), { id: 'author-id' }))
      .mockResolvedValueOnce(null);

    await expect(fixture.service.getDefaultAuthorId()).resolves.toBe(
      'author-id',
    );
    expect(fixture.userFindOne).toHaveBeenNthCalledWith(1, {
      select: ['id'],
      where: {},
      order: { id: 'ASC' },
    });
    await expect(fixture.service.getDefaultAuthorId()).rejects.toEqual(
      new NotFoundException('No default user found'),
    );
    await fixture.module.close();
  });

  it('is registered once as an internal Contents provider', () => {
    const providers: unknown = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    );
    const exports: unknown = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ContentsModule,
    );
    const providerList = Array.isArray(providers) ? providers : [];
    const exportList = Array.isArray(exports) ? exports : [];

    expect(
      providerList.filter(
        (provider: unknown) => provider === ContentQueryService,
      ),
    ).toHaveLength(1);
    expect(exportList).not.toContain(ContentQueryService);
  });

  it('resolves through Nest DI with only Content and User repositories', async () => {
    const fixture = await makeFixture();

    expect(fixture.module.get(ContentQueryService)).toBeInstanceOf(
      ContentQueryService,
    );
    await fixture.module.close();
  });
});
