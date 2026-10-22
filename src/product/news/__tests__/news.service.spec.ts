import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from '../entities/news.entity';
import { NewsService } from '../news.service';
import { TelegramService } from 'src/integrations/telegram-integration/telegram.service';
import { WordpressService } from 'src/integrations/wordpress-integration/wordpress.service';

type NewsRepositoryMock = jest.Mocked<Pick<Repository<News>, 'find'>>;
type TelegramServiceMock = jest.Mocked<
  Pick<TelegramService, 'getChannelPosts'>
>;
type WordpressServiceMock = jest.Mocked<
  Pick<WordpressService, 'getPublicPosts'>
>;

describe('NewsService WordPress feed', () => {
  let service: NewsService;
  let testingModule: TestingModule;
  let wordpressService: WordpressServiceMock;
  let telegramService: TelegramServiceMock;

  beforeEach(async () => {
    const newsRepository: NewsRepositoryMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    wordpressService = { getPublicPosts: jest.fn() };
    telegramService = { getChannelPosts: jest.fn().mockResolvedValue([]) };

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

  it('keeps WordPress posts in the composed public feed response', async () => {
    wordpressService.getPublicPosts.mockResolvedValue([
      {
        title: { rendered: 'Latest' },
        link: 'https://riffvalley.es/latest',
        date: '2026-10-13T10:00:00.000Z',
        _embedded: {
          'wp:featuredmedia': [{ source_url: 'https://img.test/latest' }],
        },
      },
    ]);

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
