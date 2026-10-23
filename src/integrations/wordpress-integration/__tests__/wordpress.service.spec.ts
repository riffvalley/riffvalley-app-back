import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WordpressIntegrationModule } from '../wordpress-integration.module';
import { WordpressService, WordpressWriteError } from '../wordpress.service';

const defaultWordpressConfig = {
  WP_USER: '',
  WP_APP_PASSWORD: '',
  WP_API_URL: 'https://riffvalley.es/wp-json/wp/v2',
};

function createConfigService(
  overrides: Partial<typeof defaultWordpressConfig> = {},
): ConfigService {
  return new ConfigService({ ...defaultWordpressConfig, ...overrides });
}

describe('WordpressService public reads', () => {
  const originalFetch = global.fetch;
  let service: WordpressService;

  beforeEach(() => {
    const config = createConfigService();
    service = new WordpressService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('resolves the exported client through the integration module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WordpressIntegrationModule],
    }).compile();

    expect(moduleRef.get(WordpressService)).toBeInstanceOf(WordpressService);
    await moduleRef.close();
  });

  it('reads the six latest posts anonymously and returns the provider payload', async () => {
    const posts = [{ id: 12, title: { rendered: 'Post' }, _embedded: {} }];
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(posts),
    });
    global.fetch = fetch;

    await expect(service.getPublicPosts()).resolves.toBe(posts);
    expect(fetch).toHaveBeenCalledWith(
      'https://riffvalley.es/wp-json/wp/v2/posts?_embed&per_page=6',
    );
  });

  it('returns null for a non-successful public response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(service.getPublicPosts()).resolves.toBeNull();
  });

  it.each([401, 503])(
    'logs and returns null for public HTTP status %s without adding authentication',
    async (status) => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      const fetch = jest.fn().mockResolvedValue({ ok: false, status });
      global.fetch = fetch;

      await expect(service.getPublicPosts()).resolves.toBeNull();

      expect(fetch).toHaveBeenCalledWith(
        'https://riffvalley.es/wp-json/wp/v2/posts?_embed&per_page=6',
      );
      expect(loggerError).toHaveBeenCalledWith(
        `Failed to fetch WordPress posts: ${status}`,
      );
    },
  );

  it('propagates public network and JSON parsing errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(service.getPublicPosts()).rejects.toThrow('offline');

    const parseError = new SyntaxError('invalid JSON');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(parseError),
    });
    await expect(service.getPublicPosts()).rejects.toBe(parseError);
  });

  it('passes through an unexpected successful public JSON shape without validation', async () => {
    const unexpected = { message: 'not a posts array' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(unexpected),
    });

    await expect(service.getPublicPosts()).resolves.toBe(unexpected);
  });

  it('returns an empty array unchanged for an empty public response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });

    await expect(service.getPublicPosts()).resolves.toEqual([]);
  });

  it('keeps Basic Auth on authenticated post reads', async () => {
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'app-password',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        content: { raw: '<p>Existing</p>' },
        status: 'publish',
      }),
    });

    await expect(service.getPost(41)).resolves.toEqual({
      content: '<p>Existing</p>',
      status: 'publish',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://wp.test/wp-json/wp/v2/posts/41?context=edit',
      {
        headers: {
          Authorization: `Basic ${Buffer.from('publisher:app-password').toString('base64')}`,
        },
      },
    );
  });

  it('preserves authenticated post creation and content update requests', async () => {
    const post = {
      id: 8,
      link: 'https://wp.test/posts/8',
      title: { rendered: 'List title' },
      status: 'draft',
    };
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'app-password',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(post),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(post),
      });
    global.fetch = fetch;

    await expect(
      service.createPost(
        'List title',
        '<p>Body</p>',
        'draft',
        { rank_math_title: 'SEO title' },
        [72],
        [219],
        'list-title',
      ),
    ).resolves.toBe(post);
    await expect(service.updatePostContent(8, '<p>Updated</p>')).resolves.toBe(
      post,
    );

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://wp.test/wp-json/wp/v2/posts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('publisher:app-password').toString('base64')}`,
        }),
        body: JSON.stringify({
          title: 'List title',
          content: '<p>Body</p>',
          status: 'draft',
          meta: { rank_math_title: 'SEO title' },
          categories: [72],
          tags: [219],
          slug: 'list-title',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://wp.test/wp-json/wp/v2/posts/8',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: '<p>Updated</p>' }),
      }),
    );
  });

  it('keeps authenticated post, author, and tag lookup mappings', async () => {
    const post = {
      id: 9,
      link: 'https://wp.test/posts/9',
      title: { rendered: 'Existing' },
      status: 'publish',
    };
    const author = { id: 4, name: 'Editor', link: 'https://wp.test/editor' };
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'app-password',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([post]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([author]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([{ id: 12, name: '2026' }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 13, name: 'octubre' }),
      });
    global.fetch = fetch;

    await expect(service.findPostBySlug('existing')).resolves.toEqual(post);
    await expect(service.findAuthorBySlug('editor')).resolves.toEqual(author);
    await expect(service.getOrCreateTag('2026')).resolves.toBe(12);
    await expect(service.getOrCreateTag('octubre')).resolves.toBe(13);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://wp.test/wp-json/wp/v2/posts?slug=existing&status=any',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'https://wp.test/wp-json/wp/v2/tags?search=octubre&per_page=5',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      'https://wp.test/wp-json/wp/v2/tags',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'octubre' }),
      }),
    );
  });

  it('returns null for an authenticated post 404', async () => {
    const fetch = jest.fn().mockResolvedValue({ status: 404, ok: false });
    global.fetch = fetch;

    await expect(service.getPost(41)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      'https://riffvalley.es/wp-json/wp/v2/posts/41?context=edit',
      {
        headers: {
          Authorization: `Basic ${Buffer.from(':').toString('base64')}`,
        },
      },
    );
  });

  it('returns an empty lookup as null and passes through incomplete edit data', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ content: {}, status: 'publish' }),
      });
    global.fetch = fetch;

    await expect(service.findPostBySlug('missing')).resolves.toBeNull();
    await expect(service.getPost(41)).resolves.toEqual({
      content: undefined,
      status: 'publish',
    });
  });

  it.each([401, 503])(
    'logs and translates authenticated post status %s into a WordPress API error',
    async (status) => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      global.fetch = jest.fn().mockResolvedValue({
        status,
        ok: false,
        text: jest.fn().mockResolvedValue('request rejected'),
      });

      await expect(service.getPost(41)).rejects.toThrow(
        `WordPress API error: ${status}`,
      );
      expect(loggerError).toHaveBeenCalledWith(
        `Failed to fetch WP post 41: ${status}`,
      );
    },
  );

  it('logs only WordPress error codes and sanitized messages for write and edit failures', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'wp-app-password-secret',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);
    const authorizationSecret = Buffer.from(
      'publisher:wp-app-password-secret',
    ).toString('base64');
    const responseBody = JSON.stringify({
      code: 'rest_cannot_edit',
      message: `Authorization: Basic ${authorizationSecret}; access_token=wp-access-secret; refresh_token=wp-refresh-secret; client_secret=wp-client-secret; Password=wp-password-secret; Request rejected`,
      data: { debug: 'full-provider-body-secret' },
    });
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue(responseBody),
      }),
    );

    await expect(service.createPost('Title', 'Body')).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.updatePostContent(41, 'Body')).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.getPost(41)).rejects.toThrow(
      'WordPress API error: 401',
    );
    await expect(service.findPostBySlug('private-list')).rejects.toThrow(
      'WordPress API error: 401',
    );

    const logMessages = loggerError.mock.calls.map(([message]) =>
      String(message),
    );
    expect(logMessages).toHaveLength(4);
    expect(logMessages[0]).toContain('Failed to create WP post: 401');
    expect(logMessages[1]).toContain('Failed to update WP post 41: 401');
    expect(logMessages[2]).toContain('Failed to fetch WP post 41: 401');
    expect(logMessages[3]).toContain(
      'Failed to find WordPress post by slug private-list: 401',
    );
    for (const message of logMessages) {
      expect(message).toContain('code=rest_cannot_edit');
      expect(message).toContain('Request rejected');
    }

    const combinedLogs = logMessages.join('\n');
    for (const secret of [
      authorizationSecret,
      'wp-app-password-secret',
      'wp-access-secret',
      'wp-refresh-secret',
      'wp-client-secret',
      'wp-password-secret',
      'full-provider-body-secret',
    ]) {
      expect(combinedLogs).not.toContain(secret);
    }
  });

  it('translates private create and update HTTP errors while preserving network errors', async () => {
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'app-password',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('forbidden'),
    });

    await expect(service.createPost('Title', 'Body')).rejects.toThrow(
      'WordPress API error: 401',
    );
    await expect(service.updatePostContent(41, 'Body')).rejects.toThrow(
      'WordPress API error: 401',
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://wp.test/wp-json/wp/v2/posts',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('publisher:app-password').toString('base64')}`,
        }),
      }),
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('temporarily unavailable'),
    });
    await expect(service.createPost('Title', 'Body')).rejects.toThrow(
      'WordPress API error: 503',
    );
    await expect(service.updatePostContent(41, 'Body')).rejects.toThrow(
      'WordPress API error: 503',
    );

    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(service.createPost('Title', 'Body')).rejects.toThrow(
      'offline',
    );
  });

  it('classifies rejected versus uncertain WordPress write outcomes', async () => {
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'app-password',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('forbidden'),
    });
    await expect(service.createPost('Title', 'Body')).rejects.toMatchObject({
      name: 'WordpressWriteError',
      outcome: 'rejected',
      status: 401,
    } satisfies Partial<WordpressWriteError>);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('temporary failure'),
    });
    await expect(service.updatePostContent(41, 'Body')).rejects.toMatchObject({
      name: 'WordpressWriteError',
      outcome: 'unknown',
      status: 503,
    } satisfies Partial<WordpressWriteError>);

    global.fetch = jest.fn().mockRejectedValue(new Error('socket closed'));
    await expect(service.updatePostContent(41, 'Body')).rejects.toMatchObject({
      name: 'WordpressWriteError',
      outcome: 'unknown',
      message: 'socket closed',
    } satisfies Partial<WordpressWriteError>);
  });

  it('does not treat an unsuccessful slug lookup as proof that no post exists', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('temporarily unavailable'),
    });

    await expect(service.findPostBySlug('stable-list-slug')).rejects.toThrow(
      'WordPress API error: 503',
    );
  });

  it('propagates private post lookup authentication failures instead of reporting absence', async () => {
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'app-password',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('unauthorized'),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: jest.fn(),
      });
    global.fetch = fetch;

    await expect(service.findPostBySlug('private-list')).rejects.toThrow(
      'WordPress API error: 401',
    );
    await expect(
      service.findAuthorBySlug('private-author'),
    ).resolves.toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://wp.test/wp-json/wp/v2/posts?slug=private-list&status=any',
      {
        headers: {
          Authorization: `Basic ${Buffer.from('publisher:app-password').toString('base64')}`,
        },
      },
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://wp.test/wp-json/wp/v2/users?slug=private-author',
      {
        headers: {
          Authorization: `Basic ${Buffer.from('publisher:app-password').toString('base64')}`,
        },
      },
    );
  });

  it('currently treats an authenticated tag-search failure as no match and attempts tag creation', async () => {
    const config = createConfigService({
      WP_USER: 'publisher',
      WP_APP_PASSWORD: 'app-password',
      WP_API_URL: 'https://wp.test/wp-json/wp/v2',
    });
    service = new WordpressService(config);
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue([]),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ code: 'rest_cannot_create' }),
      });
    global.fetch = fetch;

    await expect(service.getOrCreateTag('2026')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://wp.test/wp-json/wp/v2/tags',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('publisher:app-password').toString('base64')}`,
        }),
      }),
    );
  });
});
