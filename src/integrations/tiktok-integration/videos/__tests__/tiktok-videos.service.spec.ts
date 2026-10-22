import { Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TiktokApiService } from '../../api/tiktok-api.service';
import { TiktokVideo } from '../../entities/tiktok-video.entity';
import { TiktokVideosService } from '../tiktok-videos.service';

describe('TiktokVideosService', () => {
  let service: TiktokVideosService;
  let moduleRef: TestingModule;
  let videoRepository: {
    upsert: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
  };
  let tiktokApi: { fetchVideoPage: jest.Mock };

  beforeEach(async () => {
    videoRepository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
    };
    tiktokApi = { fetchVideoPage: jest.fn() };
    moduleRef = await Test.createTestingModule({
      providers: [
        TiktokVideosService,
        {
          provide: getRepositoryToken(TiktokVideo),
          useValue: videoRepository,
        },
        { provide: TiktokApiService, useValue: tiktokApi },
      ],
    }).compile();
    service = moduleRef.get(TiktokVideosService);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await moduleRef.close();
  });

  it('fetches pages in cursor order and maps provider fields before sequential upserts', async () => {
    tiktokApi.fetchVideoPage
      .mockResolvedValueOnce({
        ok: true,
        body: {
          data: {
            videos: [
              {
                id: 'video-1',
                title: 'Title',
                video_description: 'Description',
                cover_image_url: 'https://cdn.test/cover.jpg',
                share_url: 'https://tiktok.test/video-1',
                embed_link: 'https://tiktok.test/embed-1',
                embed_html: '<blockquote>video 1</blockquote>',
                duration: 23,
                like_count: 2,
                comment_count: 3,
                share_count: 4,
                view_count: 10,
                create_time: 1_700_000_000,
              },
            ],
            cursor: 123,
            has_more: true,
          },
          error: { code: 'ok', message: '', log_id: '' },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        body: {
          data: { videos: [{ id: 'video-2' }], has_more: false },
          error: { code: 'ok', message: '', log_id: '' },
        },
      });

    await service.syncVideos('access-token');

    expect(tiktokApi.fetchVideoPage.mock.calls).toEqual([
      ['access-token', undefined],
      ['access-token', 123],
    ]);
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      1,
      {
        tiktokVideoId: 'video-1',
        title: 'Title',
        videoDescription: 'Description',
        coverImageUrl: 'https://cdn.test/cover.jpg',
        permalink: 'https://tiktok.test/video-1',
        embedLink: 'https://tiktok.test/embed-1',
        embedHtml: '<blockquote>video 1</blockquote>',
        duration: 23,
        viewCount: 10,
        likeCount: 2,
        commentCount: 3,
        shareCount: 4,
        tiktokCreateTime: new Date(1_700_000_000 * 1000),
      },
      ['tiktokVideoId'],
    );
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tiktokVideoId: 'video-2',
        title: null,
        videoDescription: null,
        tiktokCreateTime: new Date(0),
      }),
      ['tiktokVideoId'],
    );
  });

  it('passes repeated provider IDs to separate upserts using the existing conflict key', async () => {
    tiktokApi.fetchVideoPage.mockResolvedValue({
      ok: true,
      body: {
        data: {
          videos: [
            { id: 'duplicate-id', title: 'Earlier' },
            { id: 'duplicate-id', title: 'Later' },
          ],
          has_more: false,
        },
        error: { code: 'ok', message: '', log_id: '' },
      },
    });

    await service.syncVideos('access-token');

    expect(videoRepository.upsert).toHaveBeenCalledTimes(2);
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tiktokVideoId: 'duplicate-id',
        title: 'Earlier',
      }),
      ['tiktokVideoId'],
    );
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tiktokVideoId: 'duplicate-id',
        title: 'Later',
      }),
      ['tiktokVideoId'],
    );
  });

  it('stops pagination on HTTP or provider errors without writing rows', async () => {
    tiktokApi.fetchVideoPage
      .mockResolvedValueOnce({
        ok: false,
        body: {
          error: { code: 'ok', message: '', log_id: '' },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        body: {
          data: { videos: [{ id: 'unwritten' }], has_more: false },
          error: {
            code: 'scope_not_authorized',
            message: 'Missing scope',
            log_id: 'log',
          },
        },
      });

    await service.syncVideos('access-token');
    await service.syncVideos('access-token');

    expect(videoRepository.upsert).not.toHaveBeenCalled();
    expect(tiktokApi.fetchVideoPage).toHaveBeenCalledTimes(2);
  });

  it('absorbs a persistence failure after earlier writes and skips remaining rows/pages', async () => {
    tiktokApi.fetchVideoPage.mockResolvedValueOnce({
      ok: true,
      body: {
        data: {
          videos: [{ id: 'saved' }, { id: 'failed' }, { id: 'skipped' }],
          has_more: true,
          cursor: 1,
        },
        error: { code: 'ok', message: '', log_id: '' },
      },
    });
    videoRepository.upsert
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('database write failed'));

    await expect(service.syncVideos('access-token')).resolves.toBeUndefined();
    expect(videoRepository.upsert).toHaveBeenCalledTimes(2);
    expect(videoRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tiktokVideoId: 'saved' }),
      ['tiktokVideoId'],
    );
    expect(tiktokApi.fetchVideoPage).toHaveBeenCalledTimes(1);
  });

  it('caps pagination at 20 pages', async () => {
    tiktokApi.fetchVideoPage.mockImplementation(async () => ({
      ok: true,
      body: {
        data: { videos: [], has_more: true, cursor: 1 },
        error: { code: 'ok', message: '', log_id: '' },
      },
    }));

    await service.syncVideos('access-token');

    expect(tiktokApi.fetchVideoPage).toHaveBeenCalledTimes(20);
  });

  it('keeps the local list ordering, pagination and summary projection', async () => {
    const row = {
      id: 'internal-id',
      tiktokVideoId: 'provider-id',
      title: 'Title',
      videoDescription: 'Description',
      coverImageUrl: 'https://cdn.test/cover.jpg',
      permalink: 'https://tiktok.test/video',
      embedLink: 'https://tiktok.test/embed',
      embedHtml: '<blockquote>full html</blockquote>',
      duration: 23,
      viewCount: 10,
      likeCount: 2,
      commentCount: 1,
      shareCount: 0,
      tiktokCreateTime: new Date('2026-10-01T00:00:00Z'),
    } as TiktokVideo;
    videoRepository.findAndCount.mockResolvedValue([[row], 2]);

    await expect(service.findVideos({ limit: 1, offset: 1 })).resolves.toEqual({
      data: [
        {
          id: 'provider-id',
          title: 'Title',
          coverImageUrl: 'https://cdn.test/cover.jpg',
          permalink: 'https://tiktok.test/video',
          embedLink: 'https://tiktok.test/embed',
          duration: 23,
          viewCount: 10,
          likeCount: 2,
          commentCount: 1,
          shareCount: 0,
          createTime: row.tiktokCreateTime,
        },
      ],
      totalItems: 2,
      hasMore: false,
    });
    expect(videoRepository.findAndCount).toHaveBeenCalledWith({
      order: { tiktokCreateTime: 'DESC' },
      take: 1,
      skip: 1,
    });
  });

  it('returns detail projection and preserves the missing-video error', async () => {
    const row = {
      tiktokVideoId: 'provider-id',
      title: 'Title',
      videoDescription: 'Description',
      coverImageUrl: null,
      permalink: null,
      embedLink: null,
      embedHtml: '<blockquote>full html</blockquote>',
      duration: null,
      viewCount: null,
      likeCount: null,
      commentCount: null,
      shareCount: null,
      tiktokCreateTime: new Date('2026-10-01T00:00:00Z'),
    } as TiktokVideo;
    videoRepository.findOne
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(null);

    await expect(service.findVideoDetail('provider-id')).resolves.toMatchObject(
      {
        id: 'provider-id',
        videoDescription: 'Description',
        embedHtml: '<blockquote>full html</blockquote>',
      },
    );
    expect(videoRepository.findOne).toHaveBeenCalledWith({
      where: { tiktokVideoId: 'provider-id' },
    });
    await expect(service.findVideoDetail('missing-id')).rejects.toThrow(
      new NotFoundException('Vídeo de TikTok no encontrado'),
    );
  });
});
