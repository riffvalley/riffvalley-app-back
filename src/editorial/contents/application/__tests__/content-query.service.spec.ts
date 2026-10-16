import { NotFoundException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from 'src/identity/auth/entities/user.entity';
import { ContentsModule } from '../../contents.module';
import { Content, ContentType } from '../../entities/content.entity';
import { ContentQueryService } from '../content-query.service';

describe('ContentQueryService', () => {
  const content = { id: 'content-id', type: ContentType.ARTICLE } as Content;
  let contentRepo: any;
  let userRepo: any;
  let service: ContentQueryService;

  beforeEach(() => {
    contentRepo = { find: jest.fn(), findOne: jest.fn() };
    userRepo = { findOne: jest.fn() };
    service = new ContentQueryService(contentRepo, userRepo);
  });

  it.each([
    [undefined, undefined, {}],
    [true, undefined, { ready: true }],
    [undefined, false, { backlog: false }],
    [true, false, { ready: true, backlog: false }],
  ])(
    'findAll applies filters %# and retains relation/order options',
    async (ready, backlog, where) => {
      contentRepo.find.mockResolvedValue([content]);

      await expect(
        service.findAll(ready as any, backlog as any),
      ).resolves.toEqual([content]);
      expect(contentRepo.find).toHaveBeenCalledWith({
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
    },
  );

  it('findOne loads the existing relations and preserves its 404', async () => {
    contentRepo.findOne
      .mockResolvedValueOnce(content)
      .mockResolvedValueOnce(null);

    await expect(service.findOne('content-id')).resolves.toBe(content);
    expect(contentRepo.findOne).toHaveBeenNthCalledWith(1, {
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
    await expect(service.findOne('missing-id')).rejects.toEqual(
      new NotFoundException('Content with id missing-id not found'),
    );
  });

  it('findByMonth preserves joins, inclusive seven-day range, and DESC order', async () => {
    const builder = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      getMany: jest.fn().mockResolvedValue([content]),
    };
    for (const method of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
    ]) {
      builder[method].mockReturnValue(builder);
    }
    contentRepo.createQueryBuilder = jest.fn().mockReturnValue(builder);

    await expect(service.findByMonth(2026, 10)).resolves.toEqual([content]);
    expect(contentRepo.createQueryBuilder).toHaveBeenCalledWith('content');
    expect(builder.leftJoinAndSelect.mock.calls).toEqual([
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
    expect(builder.where).toHaveBeenCalledWith(
      'content.publicationDate >= :startDate',
      { startDate: start },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'content.publicationDate <= :endDate',
      { endDate: end },
    );
    expect(builder.orderBy).toHaveBeenCalledWith(
      'content.publicationDate',
      'DESC',
    );
  });

  it.each([
    [
      'findOneByRiffValleyPlaylistId',
      'playlist-id',
      { riffValleyPlaylist: { id: 'playlist-id' } },
    ],
    ['findOneByArticleId', 'article-id', { article: { id: 'article-id' } }],
    ['findOneByVideoId', 'video-id', { video: { id: 'video-id' } }],
  ])(
    '%s returns null and queries by the matching relation',
    async (method, id, where) => {
      contentRepo.findOne.mockResolvedValue(null);

      await expect((service as any)[method](id)).resolves.toBeNull();
      expect(contentRepo.findOne).toHaveBeenCalledWith({ where });
    },
  );

  it('selects the first UUID ordered user as default and preserves the missing-user error', async () => {
    userRepo.findOne
      .mockResolvedValueOnce({ id: 'author-id' })
      .mockResolvedValueOnce(null);

    await expect(service.getDefaultAuthorId()).resolves.toBe('author-id');
    expect(userRepo.findOne).toHaveBeenNthCalledWith(1, {
      select: ['id'],
      where: {},
      order: { id: 'ASC' },
    });
    await expect(service.getDefaultAuthorId()).rejects.toEqual(
      new NotFoundException('No default user found'),
    );
  });

  it('is registered once as an internal Contents provider', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ContentsModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ContentsModule,
    ) as unknown[];

    expect(
      providers.filter((provider) => provider === ContentQueryService),
    ).toHaveLength(1);
    expect(exports).not.toContain(ContentQueryService);
  });

  it('resolves through Nest DI with only Content and User repositories', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ContentQueryService,
        { provide: getRepositoryToken(Content), useValue: contentRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    expect(module.get(ContentQueryService)).toBeInstanceOf(ContentQueryService);
    await module.close();
  });
});
