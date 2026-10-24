import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  InstagramMediaType,
  InstagramPost,
} from '../entities/instagram-post.entity';
import { InstagramService } from '../instagram.service';
import { InstagramTokenStorageService } from '../instagram-token-storage.service';

describe('InstagramService', () => {
  let repository: jest.Mocked<
    Pick<Repository<InstagramPost>, 'upsert' | 'findAndCount'>
  >;
  let tokenStorage: InstagramTokenStorageService;
  let persistAccessToken: jest.SpyInstance<Promise<void>, [string]>;
  let originalEnv: NodeJS.ProcessEnv;
  let fetchMock: jest.Mock;

  const response = (
    body: unknown,
    ok = true,
    status = 200,
    text = '',
  ): Response => {
    const result = new Response(JSON.stringify(body), { status });
    if (result.ok !== ok) Object.defineProperty(result, 'ok', { value: ok });
    jest.spyOn(result, 'json').mockResolvedValue(body);
    jest.spyOn(result, 'text').mockResolvedValue(text);
    return result;
  };

  const createService = () => new InstagramService(repository, tokenStorage);

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.IG_BUSINESS_ACCOUNT_ID;
    delete process.env.IG_HEROKU_API_TOKEN;
    delete process.env.IG_HEROKU_APP_NAME;
    process.env.IG_ACCESS_TOKEN = 'test-access-token';
    process.env.IG_BUSINESS_ACCOUNT_ID = 'business-account';
    process.env.IG_GRAPH_API_VERSION = 'v21.0';

    repository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    tokenStorage = new InstagramTokenStorageService();
    persistAccessToken = jest
      .spyOn(tokenStorage, 'persistAccessToken')
      .mockResolvedValue(undefined);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('syncPosts', () => {
    it('requests selected Graph fields, follows pages, and upserts normalized posts', async () => {
      fetchMock
        .mockResolvedValueOnce(
          response({
            data: [
              {
                id: 'media-1',
                media_type: InstagramMediaType.CAROUSEL_ALBUM,
                media_product_type: 'FEED',
                media_url: 'https://signed.example/old',
                thumbnail_url: 'https://signed.example/thumb-old',
                permalink: 'https://instagram.com/p/one',
                timestamp: '2026-10-10T12:00:00+0000',
                children: {
                  data: [
                    {
                      id: 'child-1',
                      media_url: 'https://signed.example/child',
                      media_type: 'IMAGE',
                    },
                  ],
                },
              },
            ],
            paging: { next: 'https://graph.instagram.com/next-page' },
          }),
        )
        .mockResolvedValueOnce(
          response({
            data: [
              {
                id: 'media-2',
                media_type: InstagramMediaType.IMAGE,
                permalink: 'https://instagram.com/p/two',
                timestamp: '2026-10-11T12:00:00+0000',
              },
            ],
          }),
        );

      await createService().syncPosts();

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          'https://graph.instagram.com/v21.0/business-account/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type}&limit=50&access_token=test-access-token',
        ),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://graph.instagram.com/next-page',
      );
      expect(repository.upsert).toHaveBeenNthCalledWith(
        1,
        {
          igMediaId: 'media-1',
          caption: null,
          mediaType: InstagramMediaType.CAROUSEL_ALBUM,
          mediaProductType: 'FEED',
          mediaUrl: 'https://signed.example/old',
          thumbnailUrl: 'https://signed.example/thumb-old',
          children: [
            {
              id: 'child-1',
              mediaUrl: 'https://signed.example/child',
              mediaType: 'IMAGE',
            },
          ],
          permalink: 'https://instagram.com/p/one',
          igTimestamp: new Date('2026-10-10T12:00:00+0000'),
        },
        ['igMediaId'],
      );
      expect(repository.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          igMediaId: 'media-2',
          caption: null,
          mediaProductType: null,
          mediaUrl: null,
          thumbnailUrl: null,
          children: null,
        }),
        ['igMediaId'],
      );
    });

    it('refreshes cached signed media URLs by upserting the latest Graph values', async () => {
      fetchMock.mockResolvedValueOnce(
        response({
          data: [
            {
              id: 'existing-media',
              media_type: InstagramMediaType.VIDEO,
              media_url: 'https://signed.example/new',
              thumbnail_url: 'https://signed.example/new-thumb',
              permalink: 'https://instagram.com/p/existing',
              timestamp: '2026-01-02T00:00:00+0000',
            },
          ],
        }),
      );

      await createService().syncPosts();

      expect(repository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          igMediaId: 'existing-media',
          mediaUrl: 'https://signed.example/new',
          thumbnailUrl: 'https://signed.example/new-thumb',
        }),
        ['igMediaId'],
      );
    });

    it('skips the request when token or business account configuration is missing', async () => {
      delete process.env.IG_ACCESS_TOKEN;
      await createService().syncPosts();
      expect(fetchMock).not.toHaveBeenCalled();

      process.env.IG_ACCESS_TOKEN = 'test-access-token';
      delete process.env.IG_BUSINESS_ACCOUNT_ID;
      await createService().syncPosts();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stops on a Graph authentication error without upserting', async () => {
      fetchMock.mockResolvedValueOnce(
        response(
          { error: { message: 'Invalid OAuth access token' } },
          false,
          400,
        ),
      );

      await createService().syncPosts();

      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('logs the HTTP status and safe Graph error details without tokens', async () => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      fetchMock.mockResolvedValueOnce(
        response(
          {
            error: {
              message: 'Invalid OAuth access token',
              type: 'OAuthException',
              code: 190,
              fbtrace_id: 'trace-123',
              access_token: 'leaked-response-token',
            },
            access_token: 'another-response-token',
          },
          false,
          401,
        ),
      );

      await createService().syncPosts();

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).toContain('HTTP 401');
      expect(logged).toContain('Invalid OAuth access token');
      expect(logged).toContain('OAuthException');
      expect(logged).toContain('190');
      expect(logged).toContain('trace-123');
      expect(logged).not.toContain('test-access-token');
      expect(logged).not.toContain('leaked-response-token');
      expect(logged).not.toContain('another-response-token');
    });

    it('redacts access tokens and credential parameters from sync exceptions', async () => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      fetchMock.mockRejectedValueOnce(
        new Error(
          'request failed https://graph.instagram.com/media?access_token=test-access-token&client_secret=client-secret-value',
        ),
      );

      await createService().syncPosts();

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).toContain('Instagram sync failed');
      expect(logged).toContain('request failed');
      expect(logged).not.toContain('test-access-token');
      expect(logged).not.toContain('client-secret-value');
    });
  });

  describe('refreshAccessToken', () => {
    it('updates the in-memory token before delegating persistence after a successful Graph response', async () => {
      const operations: string[] = [];
      let service!: InstagramService;
      fetchMock.mockImplementationOnce(async (url: string) => {
        operations.push('refresh');
        expect(url).toBe(
          'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=test-access-token',
        );
        return response({ access_token: 'refreshed-token' });
      });
      persistAccessToken.mockImplementation(async (token) => {
        operations.push(
          `persist:${token}:${Reflect.get(service, 'accessToken') as string}`,
        );
      });
      service = createService();

      await service.refreshAccessToken();

      expect(operations).toEqual([
        'refresh',
        'persist:refreshed-token:refreshed-token',
      ]);
      expect(Reflect.get(service, 'accessToken')).toBe('refreshed-token');
      expect(tokenStorage.persistAccessToken).toHaveBeenCalledWith(
        'refreshed-token',
      );
    });

    it('does not persist when Meta rejects the refresh token', async () => {
      fetchMock.mockResolvedValueOnce(
        response({ error: { message: 'Invalid token' } }, false, 400),
      );

      await createService().refreshAccessToken();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(tokenStorage.persistAccessToken).not.toHaveBeenCalled();
    });

    it('logs safe Graph refresh details and the HTTP status without tokens', async () => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      fetchMock.mockResolvedValueOnce(
        response(
          {
            error: {
              message: 'Invalid token for IG_ACCESS_TOKEN=test-access-token',
              type: 'OAuthException',
              code: 190,
            },
            access_token: 'response-secret-token',
          },
          false,
          400,
        ),
      );

      await createService().refreshAccessToken();

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).toContain('HTTP 400');
      expect(logged).toContain('Invalid token');
      expect(logged).toContain('OAuthException');
      expect(logged).not.toContain('test-access-token');
      expect(logged).not.toContain('response-secret-token');
    });

    it('redacts access tokens and credentials from refresh exceptions', async () => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      fetchMock.mockRejectedValueOnce(
        new Error(
          'request failed https://graph.instagram.com/refresh?access_token=test-access-token Authorization: Bearer heroku-api-secret',
        ),
      );

      await createService().refreshAccessToken();

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).toContain('Instagram token refresh failed');
      expect(logged).not.toContain('test-access-token');
      expect(logged).not.toContain('heroku-api-secret');
    });

    it('does not call Meta when no token is configured', async () => {
      delete process.env.IG_ACCESS_TOKEN;

      await createService().refreshAccessToken();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(tokenStorage.persistAccessToken).not.toHaveBeenCalled();
    });
  });

  it('preserves descending cache pagination response', async () => {
    const posts = [
      { igMediaId: 'newest' },
      { igMediaId: 'older' },
    ] as InstagramPost[];
    repository.findAndCount.mockResolvedValue([posts, 5]);

    const result = await createService().findPosts({ limit: 2, offset: 2 });

    expect(repository.findAndCount).toHaveBeenCalledWith({
      order: { igTimestamp: 'DESC' },
      take: 2,
      skip: 2,
    });
    expect(result).toEqual({ data: posts, totalItems: 5, hasMore: true });
  });
});
