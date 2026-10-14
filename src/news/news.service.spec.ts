import { NewsService } from './news.service';

describe('NewsService WordPress feed', () => {
  let service: NewsService;
  let wordpressService: { getPublicPosts: jest.Mock };
  let telegramService: { getChannelPosts: jest.Mock };

  beforeEach(() => {
    wordpressService = { getPublicPosts: jest.fn() };
    const newsRepository = { find: jest.fn().mockResolvedValue([]) };
    telegramService = { getChannelPosts: jest.fn().mockResolvedValue([]) };
    service = new NewsService(
      newsRepository as any,
      telegramService as any,
      wordpressService as any,
    );
  });

  afterEach(() => jest.restoreAllMocks());

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
    const logger = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();

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
