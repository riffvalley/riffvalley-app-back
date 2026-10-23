import { ConfigService } from '@nestjs/config';
import { BadGatewayException, Logger } from '@nestjs/common';
import {
  TiktokApiService,
  TiktokInvalidGrantError,
} from '../tiktok-api.service';

describe('TiktokApiService', () => {
  const originalFetch = global.fetch;
  const config = {
    TIKTOK_CLIENT_KEY: 'test-client-key',
    TIKTOK_CLIENT_SECRET: 'test-client-secret',
  };
  let service: TiktokApiService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  const providerResponse = (
    body: unknown,
    ok = true,
    status = ok ? 200 : 400,
  ): Response => new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    const configService = new ConfigService();
    configService.set('TIKTOK_CLIENT_KEY', config.TIKTOK_CLIENT_KEY);
    configService.set('TIKTOK_CLIENT_SECRET', config.TIKTOK_CLIENT_SECRET);
    service = new TiktokApiService(configService);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('posts authorization code exchange fields and returns the provider body unchanged', async () => {
    const token = {
      access_token: 'access-token',
      expires_in: 3600,
      open_id: 'provider-open-id',
      refresh_token: 'refresh-token',
      refresh_expires_in: 31536000,
      scope: 'user.info.basic,video.list',
      token_type: 'Bearer',
    };
    fetchMock.mockResolvedValue(providerResponse(token));

    await expect(
      service.exchangeAuthorizationCode(
        'auth-code',
        'https://api.test/tiktok/callback',
      ),
    ).resolves.toEqual(token);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/oauth/token/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'auth-code',
          redirect_uri: 'https://api.test/tiktok/callback',
          client_key: config.TIKTOK_CLIENT_KEY,
          client_secret: config.TIKTOK_CLIENT_SECRET,
        }),
      },
    );
  });

  it('posts refresh credentials and leaves successful incomplete responses unchecked', async () => {
    fetchMock.mockResolvedValue(providerResponse({ expires_in: 3600 }));

    await expect(service.refreshAccessToken('refresh-token')).resolves.toEqual({
      expires_in: 3600,
    });
    const requestBody = fetchMock.mock.calls[0][1]?.body;
    if (!(requestBody instanceof URLSearchParams)) {
      throw new Error('TikTok token request body must be URL-encoded');
    }
    expect(Object.fromEntries(requestBody.entries())).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
      client_key: config.TIKTOK_CLIENT_KEY,
      client_secret: config.TIKTOK_CLIENT_SECRET,
    });
  });

  it('maps invalid_grant to the existing specialized error', async () => {
    fetchMock.mockResolvedValue(
      providerResponse(
        { error: 'invalid_grant', error_description: 'Refresh token expired' },
        false,
        400,
      ),
    );

    await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow(
      new TiktokInvalidGrantError('Refresh token expired'),
    );
  });

  it('maps other OAuth failures and unreadable error JSON to BadGateway', async () => {
    fetchMock.mockResolvedValueOnce(
      providerResponse(
        { error: 'server_error', error_description: 'Try later' },
        false,
        503,
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response('invalid JSON', { status: 502 }),
    );

    await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow(
      new BadGatewayException('TikTok OAuth respondió con 503: Try later'),
    );
    await expect(service.refreshAccessToken('refresh-token')).rejects.toThrow(
      new BadGatewayException('TikTok OAuth respondió con 502'),
    );
  });

  it('fetches the profile with bearer auth and maps an ok response', async () => {
    fetchMock.mockResolvedValue(
      providerResponse({
        data: { user: { open_id: 'open-id', display_name: 'Riff Valley' } },
        error: { code: 'ok', message: '', log_id: '' },
      }),
    );

    await expect(service.fetchUserInfo('access-token')).resolves.toEqual({
      open_id: 'open-id',
      display_name: 'Riff Valley',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
      { headers: { Authorization: 'Bearer access-token' } },
    );
  });

  it('logs and returns null for an unsuccessful profile response or invalid JSON', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(
      providerResponse(
        {
          error: {
            code: 'invalid_token',
            message:
              'Profile unavailable; access_token=provider-access-secret; Authorization: Bearer provider-bearer-secret',
            log_id: 'log',
          },
          data: { secret: 'full-response-secret' },
        },
        false,
        401,
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response('invalid JSON'));

    await expect(service.fetchUserInfo('access-token')).resolves.toBeNull();
    await expect(service.fetchUserInfo('access-token')).resolves.toBeNull();
    expect(loggerSpy).toHaveBeenCalledTimes(2);
    const logOutput = loggerSpy.mock.calls.map(([message]) => String(message));
    expect(logOutput[0]).toContain('HTTP 401');
    expect(logOutput[0]).toContain('code=invalid_token');
    expect(logOutput[0]).toContain('message=Profile unavailable');
    expect(logOutput[0]).toContain('log_id=log');
    expect(logOutput[0]).not.toContain('provider-access-secret');
    expect(logOutput[0]).not.toContain('provider-bearer-secret');
    expect(logOutput[0]).not.toContain('full-response-secret');
    expect(logOutput[1]).toContain('HTTP 200');
    expect(logOutput[1]).toContain('details unavailable');
  });

  it('requests video pages with provider fields, bearer auth and the current cursor', async () => {
    const body = {
      data: { videos: [{ id: 'video-1' }], cursor: 123, has_more: true },
      error: { code: 'ok', message: '', log_id: '' },
    };
    fetchMock.mockResolvedValue(providerResponse(body));

    await expect(service.fetchVideoPage('access-token', 456)).resolves.toEqual({
      ok: true,
      status: 200,
      body,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/open\.tiktokapis\.com\/v2\/video\/list\/\?fields=id,title,video_description,duration,cover_image_url,share_url,embed_link,embed_html,like_count,comment_count,share_count,view_count,create_time$/,
      ),
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 20, cursor: 456 }),
      },
    );
  });

  it('returns provider error bodies unchanged and propagates unreadable video JSON', async () => {
    const body = {
      error: {
        code: 'scope_not_authorized',
        message: 'Missing scope',
        log_id: 'log',
      },
    };
    fetchMock.mockResolvedValueOnce(providerResponse(body, false, 403));
    fetchMock.mockResolvedValueOnce(
      new Response('invalid JSON', { status: 502 }),
    );

    await expect(service.fetchVideoPage('access-token')).resolves.toEqual({
      ok: false,
      status: 403,
      body,
    });
    await expect(service.fetchVideoPage('access-token')).rejects.toThrow(
      'invalid JSON',
    );
  });
});
