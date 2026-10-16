import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Content, ContentType } from '../../entities/content.entity';
import { ContentCreationService } from '../content-creation.service';
import { Article } from 'src/editorial/articles/entities/article.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { List } from 'src/editorial/lists/entities/list.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { Point } from 'src/editorial/reunions/points/entities/point.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Video } from 'src/editorial/videos/entities/video.entity';

describe('ContentCreationService', () => {
  const makeFixture = () => {
    const pendingWrites: unknown[] = [];
    const committedWrites: unknown[] = [];
    const content = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn(async (value) => {
        pendingWrites.push(value);
        return value;
      }),
    };
    const companion = () => ({
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn(async (value) => {
        pendingWrites.push(value);
        return Array.isArray(value) ? value : { ...value, id: 'saved-id' };
      }),
    });
    const contentTx = companion();
    const articleTx = companion();
    const videoTx = companion();
    const playlistTx = companion();
    const reunionTx = companion();
    const pointTx = companion();
    const repositories = new Map<Function, any>([
      [Content, contentTx],
      [Article, articleTx],
      [Video, videoTx],
      [RiffValleyPlaylist, playlistTx],
      [Reunion, reunionTx],
      [Point, pointTx],
    ]);
    const manager = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
    };
    const transaction = jest.fn(async (callback) => {
      pendingWrites.length = 0;
      try {
        const result = await callback(manager);
        committedWrites.push(...pendingWrites);
        return result;
      } catch (error) {
        pendingWrites.length = 0;
        throw error;
      }
    });
    const author = { id: 'author-id' };
    const contentRepository = {
      ...content,
      manager: { transaction },
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(author),
    };
    const reunionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const playlistRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'playlist-id', status: 'editing' }),
    };
    const articleRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'article-id', status: 'editing' }),
    };
    const videoRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'video-id', status: 'editing' }),
    };
    const listsService = {
      createWeeklyList: jest.fn().mockResolvedValue({ id: 'list-id' }),
      createMonthlyList: jest.fn().mockResolvedValue({ id: 'list-id' }),
    };
    const service = new ContentCreationService(
      contentRepository as any,
      userRepository as any,
      reunionRepository as any,
      playlistRepository as any,
      articleRepository as any,
      videoRepository as any,
      listsService as any,
    );

    return {
      service,
      contentRepository,
      userRepository,
      reunionRepository,
      playlistRepository,
      articleRepository,
      videoRepository,
      listsService,
      contentTx,
      articleTx,
      videoTx,
      playlistTx,
      reunionTx,
      pointTx,
      manager,
      transaction,
      committedWrites,
      author,
    };
  };

  it.each([
    [ContentType.ARTICLE, 'articleTx', 'article'],
    [ContentType.VIDEO, 'videoTx', 'video'],
    [ContentType.RIFF_VALLEY_PLAYLIST, 'playlistTx', 'riffValleyPlaylist'],
  ] as const)(
    'creates an editing %s companion and Content atomically',
    async (type, repoKey, relation) => {
      const fixture = makeFixture();
      const result = await fixture.service.create({
        type,
        name: 'Editorial item',
        authorId: 'author-id',
      } as any);

      expect(fixture.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.manager.getRepository).toHaveBeenCalledWith(Content);
      expect(fixture.manager.getRepository).toHaveBeenCalledWith(
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
    },
  );

  it('creates RADAR and BEST lists through the Content transaction manager', async () => {
    for (const type of [ContentType.RADAR, ContentType.BEST]) {
      const fixture = makeFixture();
      const publicationDate = '2026-10-01T00:00:00.000Z';
      await fixture.service.create({
        type,
        name: 'Dated editorial item',
        authorId: 'author-id',
        publicationDate,
      } as any);

      expect(fixture.transaction).toHaveBeenCalledTimes(1);
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
    }
  });

  it.each([ContentType.RADAR, ContentType.BEST, ContentType.REUNION])(
    'requires a valid publication date for %s before lookups or writes',
    async (type) => {
      const fixture = makeFixture();
      await expect(
        fixture.service.create({
          type,
          name: 'Dated',
          authorId: 'author-id',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.userRepository.findOne).not.toHaveBeenCalled();
      expect(fixture.contentRepository.create).not.toHaveBeenCalled();
      expect(fixture.transaction).not.toHaveBeenCalled();
    },
  );

  it('reuses valid existing associations and reports missing references as 404', async () => {
    const fixture = makeFixture();
    const existing = { id: 'existing-reunion-id' };
    fixture.reunionRepository.findOne.mockResolvedValueOnce(existing);
    const result = await fixture.service.create({
      type: ContentType.REUNION,
      name: 'Existing reunion',
      authorId: 'author-id',
      reunionId: existing.id,
      publicationDate: '2026-10-01T00:00:00.000Z',
    } as any);
    expect(result.reunion).toBe(existing);
    expect(fixture.reunionTx.save).not.toHaveBeenCalled();
    expect(fixture.pointTx.save).not.toHaveBeenCalled();

    fixture.articleRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.create({
        type: ContentType.ARTICLE,
        name: 'Missing article',
        authorId: 'author-id',
        articleId: 'missing-id',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
  });

  it('automatically creates a Reunion with default Points in the same manager', async () => {
    const fixture = makeFixture();
    const result = await fixture.service.create({
      type: ContentType.REUNION,
      name: 'Weekly reunion',
      authorId: 'author-id',
      publicationDate: '2026-10-21T18:00:00.000Z',
    } as any);

    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Reunion);
    expect(fixture.manager.getRepository).toHaveBeenCalledWith(Point);
    expect(fixture.reunionTx.save).toHaveBeenCalledTimes(1);
    expect(fixture.pointTx.save).toHaveBeenCalledWith([
      expect.objectContaining({ titulo: 'Asignar Radar semanal' }),
      expect.objectContaining({ titulo: 'Crónicas y artículos pendientes' }),
    ]);
    expect(result.reunionId).toBe('saved-id');
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
      const fixture = makeFixture();
      const error = new Error('secondary write failed');
      fixture[repoKey].save.mockRejectedValueOnce(error);
      await expect(
        fixture.service.create({
          type,
          name: 'Atomic content',
          authorId: 'author-id',
          publicationDate:
            type === ContentType.REUNION
              ? '2026-10-21T18:00:00.000Z'
              : undefined,
        } as any),
      ).rejects.toBe(error);
      expect(fixture.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.committedWrites).toEqual([]);
    },
  );
});
