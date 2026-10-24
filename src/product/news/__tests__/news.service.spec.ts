import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News, NewsStatus, NewsType } from '../entities/news.entity';
import { NewsService } from '../news.service';
import { TelegramService } from 'src/integrations/telegram-integration/telegram.service';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';
import type { ChannelPost } from 'src/integrations/telegram-integration/telegram.service';
import type { ChannelPostsReadResult } from 'src/integrations/telegram-integration/telegram.service';
import type { WpPublicPost } from 'src/integrations/wordpress-integration/types/wordpress.types';
import type { WordpressPostsReadResult } from 'src/integrations/wordpress-integration/wordpress.service';

type NewsRepositoryMock = jest.Mocked<
  Pick<
    Repository<News>,
    'find' | 'create' | 'save' | 'preload' | 'findOneBy' | 'delete'
  >
>;
type TelegramServiceMock = jest.Mocked<
  Pick<TelegramService, 'getChannelPosts' | 'getChannelPostsWithStatus'>
>;
type WordpressServiceMock = jest.Mocked<
  Pick<WordpressService, 'getPublicPosts' | 'getPublicPostsWithStatus'>
>;

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

function newsPost(id: string, date: string): News {
  return {
    id,
    title: `App ${id}`,
    body: `Body ${id}`,
    image: `https://img.test/${id}.jpg`,
    publishDate: null,
    type: NewsType.VERSION,
    status: NewsStatus.PUBLISHED,
    createdAt: new Date(date),
    updatedAt: new Date(date),
  };
}

function wordpressPost(title: string, date: string): WpPublicPost {
  return {
    title: { rendered: title },
    link: `https://riffvalley.es/${title.toLowerCase().replaceAll(' ', '-')}`,
    date,
    _embedded: {
      'wp:featuredmedia': [{ source_url: `https://img.test/${title}.jpg` }],
    },
  };
}

function telegramPost(id: string, date: string): ChannelPost {
  return {
    id,
    text: `Telegram ${id}`,
    image: `https://img.test/${id}.jpg`,
    images: [`https://img.test/${id}.jpg`],
    date,
    link: `https://t.me/conciertosrockmetal/${id}`,
  };
}

describe('NewsService feeds', () => {
  let service: NewsService;
  let testingModule: TestingModule;
  let newsRepository: NewsRepositoryMock;
  let wordpressService: WordpressServiceMock;
  let telegramService: TelegramServiceMock;

  beforeEach(async () => {
    newsRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      save: jest.fn(),
      preload: jest.fn(),
      findOneBy: jest.fn(),
      delete: jest.fn(),
    };
    wordpressService = {
      getPublicPosts: jest.fn(),
      getPublicPostsWithStatus: jest
        .fn()
        .mockResolvedValue({ posts: [], successful: true }),
    };
    telegramService = {
      getChannelPosts: jest.fn().mockResolvedValue([]),
      getChannelPostsWithStatus: jest
        .fn()
        .mockResolvedValue({ posts: [], successful: true }),
    };

    testingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        { provide: getRepositoryToken(News), useValue: newsRepository },
        { provide: TelegramService, useValue: telegramService },
        { provide: WordpressService, useValue: wordpressService },
      ],
    }).compile();
    service = testingModule.get(NewsService);
  });

  afterEach(async () => {
    await testingModule.close();
    jest.restoreAllMocks();
  });

  it('keeps the public feed mapping and caches provider posts for ten minutes', async () => {
    const providerPosts = [
      {
        title: { rendered: 'News title' },
        link: 'https://riffvalley.es/news',
        date: '2026-10-13T10:00:00.000Z',
        _embedded: {
          'wp:featuredmedia': [{ source_url: 'https://img.test/a' }],
        },
      },
    ];
    wordpressService.getPublicPosts.mockResolvedValue(providerPosts);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    const expected = {
      posts: [
        {
          id: 'wp-0',
          title: 'News title',
          link: 'https://riffvalley.es/news',
          image: 'https://img.test/a',
          date: '2026-10-13T10:00:00.000Z',
          source: 'riffvalley.es',
          type: null,
          body: null,
        },
      ],
    };

    await expect(
      service.getSourceFeed({ source: 'riffvalley.es' }),
    ).resolves.toEqual(expected);
    await expect(
      service.getSourceFeed({ source: 'riffvalley.es' }),
    ).resolves.toEqual(expected);
    expect(wordpressService.getPublicPosts).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, 'now').mockReturnValue(1_600_001);
    await service.getSourceFeed({ source: 'riffvalley.es' });
    expect(wordpressService.getPublicPosts).toHaveBeenCalledTimes(2);
  });

  it('returns an empty WordPress feed when the provider request fails', async () => {
    wordpressService.getPublicPosts.mockRejectedValue(new Error('offline'));
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      service.getSourceFeed({ source: 'riffvalley.es' }),
    ).resolves.toEqual({
      posts: [],
    });
    expect(logger).toHaveBeenCalledWith(
      'Error fetching WordPress posts: offline',
    );
  });

  it('refreshes both the WordPress read cache and aggregate feed after invalidation', async () => {
    wordpressService.getPublicPostsWithStatus
      .mockResolvedValueOnce({
        posts: [wordpressPost('Old post', '2026-10-14T09:00:00.000Z')],
        successful: true,
      })
      .mockResolvedValueOnce({
        posts: [wordpressPost('New post', '2026-10-15T09:00:00.000Z')],
        successful: true,
      });

    await service.getFeed();
    service.invalidateWordPressAndNewsFeedCaches();

    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'New post' })],
    });
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('does not let a WordPress read started before invalidation repopulate either cache', async () => {
    const oldPosts = deferred<WordpressPostsReadResult>();
    wordpressService.getPublicPostsWithStatus
      .mockReturnValueOnce(oldPosts.promise)
      .mockResolvedValueOnce({
        posts: [
          wordpressPost('Post after publish', '2026-10-15T09:00:00.000Z'),
        ],
        successful: true,
      });

    const pendingFeed = service.getFeed();
    service.invalidateWordPressAndNewsFeedCaches();

    await expect(pendingFeed).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'Post after publish' })],
    });
    oldPosts.resolve({
      posts: [wordpressPost('Obsolete response', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });

    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'Post after publish' })],
    });
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('does not use stale News posts after a confirmed WordPress publication invalidates the caches', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    wordpressService.getPublicPostsWithStatus
      .mockResolvedValueOnce({
        posts: [
          wordpressPost('Before publication', '2026-10-14T09:00:00.000Z'),
        ],
        successful: true,
      })
      .mockResolvedValueOnce({ posts: [], successful: false });

    await service.getFeed();
    now.mockReturnValue(700_001);
    service.invalidateWordPressAndNewsFeedCaches();

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('keeps WordPress posts in the composed public feed response', async () => {
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [
        {
          title: { rendered: 'Latest' },
          link: 'https://riffvalley.es/latest',
          date: '2026-10-13T10:00:00.000Z',
          _embedded: {
            'wp:featuredmedia': [{ source_url: 'https://img.test/latest' }],
          },
        },
      ],
      successful: true,
    });

    await expect(service.getFeed()).resolves.toEqual({
      posts: [
        {
          id: 'wp-0',
          title: 'Latest',
          link: 'https://riffvalley.es/latest',
          image: 'https://img.test/latest',
          date: '2026-10-13T10:00:00.000Z',
          source: 'riffvalley.es',
          type: null,
          body: null,
        },
      ],
    });
    await expect(service.getFeedGeneration()).resolves.toMatchObject({
      complete: true,
    });
  });

  it('invalidates after creating a published news item', async () => {
    const createdNews = newsPost('created', '2026-10-15T09:00:00.000Z');
    newsRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdNews]);
    newsRepository.create.mockReturnValue(createdNews);
    newsRepository.save.mockResolvedValue(createdNews);

    await service.getFeed();
    await service.create({
      title: createdNews.title,
      body: createdNews.body,
      type: createdNews.type,
      status: NewsStatus.PUBLISHED,
    });

    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ id: 'created' })],
    });
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
  });

  it('invalidates when a published item is edited or published from draft', async () => {
    const originalNews = newsPost('edited', '2026-10-15T09:00:00.000Z');
    const editedNews = { ...originalNews, title: 'Edited title' };
    newsRepository.find.mockResolvedValue([]);
    newsRepository.findOneBy.mockResolvedValue(originalNews);
    newsRepository.preload.mockResolvedValue(editedNews);
    newsRepository.save.mockResolvedValue(editedNews);

    await service.getFeed();
    await service.update('edited', { title: editedNews.title });
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(2);

    const draftNews = { ...originalNews, status: NewsStatus.DRAFT };
    const publishedNews = { ...draftNews, status: NewsStatus.PUBLISHED };
    newsRepository.findOneBy.mockResolvedValue(draftNews);
    newsRepository.preload.mockResolvedValue(publishedNews);

    await service.update('edited', { status: NewsStatus.PUBLISHED });
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(3);
  });

  it('invalidates after deleting a published news item', async () => {
    const deletedNews = newsPost('deleted', '2026-10-15T09:00:00.000Z');
    newsRepository.find
      .mockResolvedValueOnce([deletedNews])
      .mockResolvedValue([]);
    newsRepository.findOneBy.mockResolvedValue(deletedNews);
    newsRepository.delete.mockResolvedValue({ affected: 1, raw: [] });

    await service.getFeed();
    await service.remove('deleted');

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
  });

  it('keeps a cached feed for irrelevant draft edits and failed writes', async () => {
    const draftNews = {
      ...newsPost('draft', '2026-10-15T09:00:00.000Z'),
      status: NewsStatus.DRAFT,
    };
    newsRepository.find.mockResolvedValue([]);
    newsRepository.findOneBy.mockResolvedValue(draftNews);
    newsRepository.preload.mockResolvedValue({
      ...draftNews,
      title: 'Draft changed',
    });
    newsRepository.save.mockResolvedValue({
      ...draftNews,
      title: 'Draft changed',
    });

    await service.getFeed();
    await service.update('draft', { title: 'Draft changed' });
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(1);

    const publishedNews = newsPost('published', '2026-10-15T09:00:00.000Z');
    newsRepository.findOneBy.mockResolvedValue(publishedNews);
    newsRepository.preload.mockResolvedValue({
      ...publishedNews,
      title: 'Failed',
    });
    newsRepository.save.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.update('published', { title: 'Failed' }),
    ).rejects.toThrow('An unexpected error occurred');
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(1);
  });

  it('restarts a concurrent generation after a published mutation invalidates it', async () => {
    const obsoleteQuery = deferred<News[]>();
    const freshNews = newsPost('fresh', '2026-10-16T09:00:00.000Z');
    const createdNews = newsPost(
      'created-during-load',
      '2026-10-17T09:00:00.000Z',
    );
    newsRepository.find
      .mockReturnValueOnce(obsoleteQuery.promise)
      .mockResolvedValueOnce([freshNews, createdNews]);
    newsRepository.create.mockReturnValue(createdNews);
    newsRepository.save.mockResolvedValue(createdNews);

    const pendingFeed = service.getFeed();
    await service.create({
      title: createdNews.title,
      body: createdNews.body,
      type: createdNews.type,
      status: NewsStatus.PUBLISHED,
    });
    obsoleteQuery.resolve([]);

    await expect(pendingFeed).resolves.toMatchObject({
      posts: expect.arrayContaining([
        expect.objectContaining({ id: 'fresh' }),
        expect.objectContaining({ id: 'created-during-load' }),
      ]),
    });
    expect(newsRepository.find).toHaveBeenCalledTimes(2);

    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
  });

  it('does not recover a pre-mutation stale feed after a relevant update', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const previousNews = newsPost('previous', '2026-10-15T09:00:00.000Z');
    const currentNews = { ...previousNews, title: 'Current after update' };
    newsRepository.find
      .mockResolvedValueOnce([previousNews])
      .mockResolvedValue([]);
    newsRepository.findOneBy.mockResolvedValue(previousNews);
    newsRepository.preload.mockResolvedValue(currentNews);
    newsRepository.save.mockResolvedValue(currentNews);

    await service.getFeed();
    await service.update('previous', { title: currentNews.title });
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: false,
    });

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
  });

  it('propagates a TypeORM failure from feed generation', async () => {
    newsRepository.find.mockRejectedValue(new Error('database unavailable'));

    await expect(service.getFeed()).rejects.toThrow('database unavailable');
  });

  it('queries published app news and composes concurrent sources in date order with a six-post limit', async () => {
    const appNews = deferred<News[]>();
    const wordpressPosts = deferred<WordpressPostsReadResult>();
    const telegramPosts = deferred<ChannelPostsReadResult>();
    newsRepository.find.mockReturnValue(appNews.promise);
    wordpressService.getPublicPostsWithStatus.mockReturnValue(
      wordpressPosts.promise,
    );
    telegramService.getChannelPostsWithStatus.mockReturnValue(
      telegramPosts.promise,
    );

    const feedPromise = service.getFeedGeneration();

    expect(newsRepository.find).toHaveBeenCalledWith({
      where: { status: NewsStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
      take: 2,
    });
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledWith(
      'conciertosrockmetal',
      6,
    );

    appNews.resolve([
      newsPost('app-new', '2026-10-15T12:00:00.000Z'),
      newsPost('app-old', '2026-10-12T12:00:00.000Z'),
    ]);
    wordpressPosts.resolve({
      posts: [
        wordpressPost('WP New', '2026-10-16T12:00:00.000Z'),
        wordpressPost('WP Old', '2026-10-11T12:00:00.000Z'),
        wordpressPost('WP Beyond Limit', '2026-10-10T12:00:00.000Z'),
      ],
      successful: true,
    });
    telegramPosts.resolve({
      posts: [
        telegramPost('tg-new', '2026-10-17T12:00:00.000Z'),
        telegramPost('tg-old', '2026-10-14T12:00:00.000Z'),
        telegramPost('tg-beyond-limit', '2026-10-09T12:00:00.000Z'),
      ],
      successful: true,
    });

    await expect(feedPromise).resolves.toEqual({
      posts: [
        {
          id: 'tg-0',
          title: 'Telegram tg-new',
          link: 'https://t.me/conciertosrockmetal/tg-new',
          image: 'https://img.test/tg-new.jpg',
          date: '2026-10-17T12:00:00.000Z',
          source: 'telegram',
          type: null,
          body: null,
        },
        {
          id: 'wp-0',
          title: 'WP New',
          link: 'https://riffvalley.es/wp-new',
          image: 'https://img.test/WP New.jpg',
          date: '2026-10-16T12:00:00.000Z',
          source: 'riffvalley.es',
          type: null,
          body: null,
        },
        {
          id: 'app-new',
          title: 'App app-new',
          link: null,
          image: 'https://img.test/app-new.jpg',
          date: '2026-10-15T12:00:00.000Z',
          source: 'app',
          type: NewsType.VERSION,
          body: 'Body app-new',
        },
        {
          id: 'tg-1',
          title: 'Telegram tg-old',
          link: 'https://t.me/conciertosrockmetal/tg-old',
          image: 'https://img.test/tg-old.jpg',
          date: '2026-10-14T12:00:00.000Z',
          source: 'telegram',
          type: null,
          body: null,
        },
        {
          id: 'app-old',
          title: 'App app-old',
          link: null,
          image: 'https://img.test/app-old.jpg',
          date: '2026-10-12T12:00:00.000Z',
          source: 'app',
          type: NewsType.VERSION,
          body: 'Body app-old',
        },
        {
          id: 'wp-1',
          title: 'WP Old',
          link: 'https://riffvalley.es/wp-old',
          image: 'https://img.test/WP Old.jpg',
          date: '2026-10-11T12:00:00.000Z',
          source: 'riffvalley.es',
          type: null,
          body: null,
        },
      ],
      complete: true,
    });
    expect((await feedPromise).posts).toHaveLength(6);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(1);
  });

  it('returns the unchanged empty public payload when all sources are legitimately empty', async () => {
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: true,
    });

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    await expect(service.getFeedGeneration()).resolves.toEqual({
      posts: [],
      complete: true,
    });
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('keeps successful sources in a partial feed when WordPress returns a non-success result', async () => {
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: false,
    });
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [telegramPost('tg-1', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });

    await expect(service.getFeed()).resolves.toEqual({
      posts: [
        {
          id: 'tg-0',
          title: 'Telegram tg-1',
          link: 'https://t.me/conciertosrockmetal/tg-1',
          image: 'https://img.test/tg-1.jpg',
          date: '2026-10-14T09:00:00.000Z',
          source: 'telegram',
          type: null,
          body: null,
        },
      ],
    });
    await expect(service.getFeedGeneration()).resolves.toMatchObject({
      complete: false,
    });
  });

  it('logs and degrades a rejected WordPress request while preserving Telegram results', async () => {
    wordpressService.getPublicPostsWithStatus.mockRejectedValue(
      new Error('timeout'),
    );
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [telegramPost('tg-1', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ source: 'telegram', id: 'tg-0' })],
    });
    expect(logger).toHaveBeenCalledWith(
      'Error fetching WordPress posts: timeout',
    );
  });

  it('marks a Telegram failure incomplete while retaining WordPress posts publicly', async () => {
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [wordpressPost('WP available', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: false,
    });

    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ source: 'riffvalley.es' })],
    });
    await expect(service.getFeedGeneration()).resolves.toMatchObject({
      complete: false,
    });
  });

  it('marks simultaneous external failures incomplete while preserving the empty public payload', async () => {
    wordpressService.getPublicPostsWithStatus.mockRejectedValue(
      new Error('connection refused'),
    );
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: false,
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    await expect(service.getFeedGeneration()).resolves.toMatchObject({
      posts: [],
      complete: false,
    });
  });

  it('stores a complete generation and returns the same public payload on a cache hit', async () => {
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [wordpressPost('Cached item', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });

    const firstResponse = await service.getFeed();
    firstResponse.posts[0].title = 'Mutated by caller';

    await expect(service.getFeed()).resolves.toEqual({
      posts: [
        {
          id: 'wp-0',
          title: 'Cached item',
          link: 'https://riffvalley.es/cached-item',
          image: 'https://img.test/Cached item.jpg',
          date: '2026-10-14T09:00:00.000Z',
          source: 'riffvalley.es',
          type: null,
          body: null,
        },
      ],
    });
    expect(newsRepository.find).toHaveBeenCalledTimes(1);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(firstResponse).not.toHaveProperty('complete');
  });

  it('caches a legitimately empty feed until its ten-minute TTL expires', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    now.mockReturnValue(699_999);
    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    now.mockReturnValue(700_000);
    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    expect(newsRepository.find).toHaveBeenCalledTimes(1);

    now.mockReturnValue(700_001);
    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('shares one complete generation between concurrent cache misses', async () => {
    const appNews = deferred<News[]>();
    const wordpressPosts = deferred<WordpressPostsReadResult>();
    const telegramPosts = deferred<ChannelPostsReadResult>();
    newsRepository.find.mockReturnValue(appNews.promise);
    wordpressService.getPublicPostsWithStatus.mockReturnValue(
      wordpressPosts.promise,
    );
    telegramService.getChannelPostsWithStatus.mockReturnValue(
      telegramPosts.promise,
    );

    const firstRequest = service.getFeed();
    const secondRequest = service.getFeed();

    expect(newsRepository.find).toHaveBeenCalledTimes(1);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(1);

    appNews.resolve([]);
    wordpressPosts.resolve({ posts: [], successful: true });
    telegramPosts.resolve({ posts: [], successful: true });

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      { posts: [] },
      { posts: [] },
    ]);
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(1);
  });

  it('shares one renewal between concurrent requests after the TTL expires', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(200_000);
    await service.getFeed();

    const appNews = deferred<News[]>();
    const wordpressPosts = deferred<WordpressPostsReadResult>();
    const telegramPosts = deferred<ChannelPostsReadResult>();
    newsRepository.find.mockReturnValue(appNews.promise);
    wordpressService.getPublicPostsWithStatus.mockReturnValue(
      wordpressPosts.promise,
    );
    telegramService.getChannelPostsWithStatus.mockReturnValue(
      telegramPosts.promise,
    );
    now.mockReturnValue(800_001);

    const firstRequest = service.getFeed();
    const secondRequest = service.getFeed();

    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);

    appNews.resolve([]);
    wordpressPosts.resolve({ posts: [], successful: true });
    telegramPosts.resolve({ posts: [], successful: true });
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      { posts: [] },
      { posts: [] },
    ]);
  });

  it('returns the same partial result to concurrent callers without caching it', async () => {
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: false,
    });
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [telegramPost('tg-partial', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      service.getFeed(),
      service.getFeed(),
    ]);

    expect(firstResponse).toEqual(secondResponse);
    expect(firstResponse.posts).toEqual([
      expect.objectContaining({ id: 'tg-0', source: 'telegram' }),
    ]);
    expect(newsRepository.find).toHaveBeenCalledTimes(1);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(1);

    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: true,
    });
    await service.getFeed();
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('does not cache a partial WordPress failure and allows a later complete retry', async () => {
    wordpressService.getPublicPostsWithStatus
      .mockResolvedValueOnce({ posts: [], successful: false })
      .mockResolvedValue({
        posts: [wordpressPost('Recovered', '2026-10-14T09:00:00.000Z')],
        successful: true,
      });

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'Recovered' })],
    });
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('does not cache a partial Telegram failure while preserving WordPress posts', async () => {
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [wordpressPost('WordPress available', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });
    telegramService.getChannelPostsWithStatus
      .mockResolvedValueOnce({ posts: [], successful: false })
      .mockResolvedValue({ posts: [], successful: true });

    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'WordPress available' })],
    });
    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'WordPress available' })],
    });
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('does not cache simultaneous external failures as a legitimately empty feed', async () => {
    wordpressService.getPublicPostsWithStatus
      .mockResolvedValueOnce({ posts: [], successful: false })
      .mockResolvedValue({ posts: [], successful: true });
    telegramService.getChannelPostsWithStatus
      .mockResolvedValueOnce({ posts: [], successful: false })
      .mockResolvedValue({ posts: [], successful: true });

    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('propagates a TypeORM failure and can generate and cache on the next attempt', async () => {
    newsRepository.find
      .mockRejectedValueOnce(new Error('temporary database failure'))
      .mockResolvedValue([]);

    await expect(service.getFeed()).rejects.toThrow(
      'temporary database failure',
    );
    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    await service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(1);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('serves a complete fallback for a partial refresh without mutating its stored value', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [wordpressPost('Last complete feed', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });
    const originalFeed = await service.getFeed();
    originalFeed.posts[0].title = 'Changed by caller';

    now.mockReturnValue(700_001);
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: false,
    });
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [telegramPost('partial', '2026-10-15T09:00:00.000Z')],
      successful: true,
    });

    const fallback = await service.getFeed();
    expect(fallback.posts).toEqual([
      expect.objectContaining({ title: 'Last complete feed' }),
    ]);
    fallback.posts[0].title = 'Changed stale response';

    now.mockReturnValue(800_000);
    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'Last complete feed' })],
    });
    expect(newsRepository.find).toHaveBeenCalledTimes(3);
  });

  it('does not extend the original thirty-minute maximum across failed refreshes', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [wordpressPost('Last complete feed', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });
    await service.getFeed();

    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: false,
    });
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [telegramPost('partial', '2026-10-15T09:00:00.000Z')],
      successful: true,
    });

    now.mockReturnValue(700_001);
    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'Last complete feed' })],
    });
    now.mockReturnValue(1_899_999);
    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [expect.objectContaining({ title: 'Last complete feed' })],
    });
    now.mockReturnValue(1_900_001);
    await expect(service.getFeed()).resolves.toMatchObject({
      posts: [
        expect.objectContaining({ id: 'tg-0', title: 'Telegram partial' }),
      ],
    });

    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: true,
    });
    telegramService.getChannelPostsWithStatus.mockResolvedValue({
      posts: [],
      successful: true,
    });
    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    await expect(service.getFeed()).resolves.toEqual({ posts: [] });
    expect(newsRepository.find).toHaveBeenCalledTimes(5);
  });

  it('shares an expired-feed partial refresh and returns the same recoverable fallback to all callers', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [wordpressPost('Last complete feed', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });
    await service.getFeed();

    const appNews = deferred<News[]>();
    const wordpressPosts = deferred<WordpressPostsReadResult>();
    const telegramPosts = deferred<ChannelPostsReadResult>();
    newsRepository.find.mockReturnValue(appNews.promise);
    wordpressService.getPublicPostsWithStatus.mockReturnValue(
      wordpressPosts.promise,
    );
    telegramService.getChannelPostsWithStatus.mockReturnValue(
      telegramPosts.promise,
    );
    now.mockReturnValue(700_001);

    const firstRequest = service.getFeed();
    const secondRequest = service.getFeed();
    expect(newsRepository.find).toHaveBeenCalledTimes(2);

    appNews.resolve([]);
    wordpressPosts.resolve({ posts: [], successful: false });
    telegramPosts.resolve({ posts: [], successful: true });
    const [firstResponse, secondResponse] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);

    expect(firstResponse).toEqual(secondResponse);
    expect(firstResponse.posts).toEqual([
      expect.objectContaining({ title: 'Last complete feed' }),
    ]);
    expect(wordpressService.getPublicPostsWithStatus).toHaveBeenCalledTimes(2);
    expect(telegramService.getChannelPostsWithStatus).toHaveBeenCalledTimes(2);
  });

  it('propagates TypeORM failures rather than serving stale feed data', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    wordpressService.getPublicPostsWithStatus.mockResolvedValue({
      posts: [wordpressPost('Last complete feed', '2026-10-14T09:00:00.000Z')],
      successful: true,
    });
    await service.getFeed();

    now.mockReturnValue(700_001);
    newsRepository.find.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(service.getFeed()).rejects.toThrow('database unavailable');
    expect(newsRepository.find).toHaveBeenCalledTimes(2);
  });

  it('releases a timed-out cache load so a later request can retry', async () => {
    jest.useFakeTimers();
    try {
      const appNews = deferred<News[]>();
      const wordpressPosts = deferred<WordpressPostsReadResult>();
      const telegramPosts = deferred<ChannelPostsReadResult>();
      newsRepository.find
        .mockReturnValueOnce(appNews.promise)
        .mockResolvedValue([]);
      wordpressService.getPublicPostsWithStatus
        .mockReturnValueOnce(wordpressPosts.promise)
        .mockResolvedValue({ posts: [], successful: true });
      telegramService.getChannelPostsWithStatus
        .mockReturnValueOnce(telegramPosts.promise)
        .mockResolvedValue({ posts: [], successful: true });

      const pendingRequest = service.getFeed();
      const timeoutExpectation = expect(pendingRequest).rejects.toThrow(
        'News feed generation timed out',
      );
      await jest.advanceTimersByTimeAsync(30_000);
      await timeoutExpectation;

      appNews.resolve([]);
      wordpressPosts.resolve({ posts: [], successful: true });
      telegramPosts.resolve({ posts: [], successful: true });
      await expect(service.getFeed()).resolves.toEqual({ posts: [] });
      expect(newsRepository.find).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('serves a valid stale feed on timeout and ignores a late generation result', async () => {
    jest.useFakeTimers().setSystemTime(new Date(100_000));
    try {
      const initialFeed = [newsPost('initial', '2026-10-14T09:00:00.000Z')];
      newsRepository.find.mockResolvedValueOnce(initialFeed);
      await service.getFeed();
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);

      const lateAppNews = deferred<News[]>();
      newsRepository.find
        .mockReturnValueOnce(lateAppNews.promise)
        .mockResolvedValueOnce([
          newsPost('current', '2026-10-15T09:00:00.000Z'),
        ]);
      const timedOutRequest = service.getFeed();
      const timeoutExpectation = expect(timedOutRequest).resolves.toMatchObject(
        {
          posts: [expect.objectContaining({ id: 'initial' })],
        },
      );
      await jest.advanceTimersByTimeAsync(30_000);
      await timeoutExpectation;

      lateAppNews.resolve([newsPost('late', '2026-10-16T09:00:00.000Z')]);
      await Promise.resolve();
      await Promise.resolve();

      await expect(service.getFeed()).resolves.toMatchObject({
        posts: [expect.objectContaining({ id: 'current' })],
      });
      expect(newsRepository.find).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('continues mapping Telegram service results in the source feed', async () => {
    telegramService.getChannelPosts.mockResolvedValue([
      {
        id: '101',
        text: 'Channel announcement',
        link: 'https://t.me/conciertosrockmetal/101',
        image: 'https://cdn.test/announcement.jpg',
        images: ['https://cdn.test/announcement.jpg'],
        date: '2026-10-14T09:00:00.000Z',
      },
    ]);

    await expect(
      service.getSourceFeed({ source: 'telegram', limit: 4 }),
    ).resolves.toEqual({
      posts: [
        {
          id: 'tg-0',
          title: 'Channel announcement',
          link: 'https://t.me/conciertosrockmetal/101',
          image: 'https://cdn.test/announcement.jpg',
          date: '2026-10-14T09:00:00.000Z',
          source: 'telegram',
          type: null,
          body: null,
        },
      ],
    });
    expect(telegramService.getChannelPosts).toHaveBeenCalledWith(
      'conciertosrockmetal',
      4,
    );
  });

  it('does not cache a non-successful public response', async () => {
    wordpressService.getPublicPosts.mockResolvedValue(null);
    await service.getSourceFeed({ source: 'riffvalley.es' });
    await service.getSourceFeed({ source: 'riffvalley.es' });
    expect(wordpressService.getPublicPosts).toHaveBeenCalledTimes(2);
  });
});
