import { ConfigService } from '@nestjs/config';
import { SpotifyClientCredentialsService } from './spotify-client-credentials.service';

describe('SpotifyClientCredentialsService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: SpotifyClientCredentialsService;
  let now: jest.SpyInstance;

  const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const config = {
      get: jest.fn((key: string) =>
        ({
          SPOTIFY_CLIENT_ID: 'client-id',
          SPOTIFY_CLIENT_SECRET: 'client-secret',
        })[key],
      ),
    };
    service = new SpotifyClientCredentialsService(
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    now.mockRestore();
  });

  it('reuses a valid cached token for public API requests', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ access_token: 'token', expires_in: 3600 }))
      .mockResolvedValueOnce(response({} as unknown))
      .mockResolvedValueOnce(response({} as unknown));

    await service.request('/artists/artist-id');
    await service.request('/artists/artist-id/top-tracks');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({
        method: 'POST',
        body: 'grant_type=client_credentials',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        }),
      }),
    ]);
    expect(fetchMock.mock.calls.slice(1)).toEqual([
      [
        'https://api.spotify.com/v1/artists/artist-id',
        { headers: { Authorization: 'Bearer token' } },
      ],
      [
        'https://api.spotify.com/v1/artists/artist-id/top-tracks',
        { headers: { Authorization: 'Bearer token' } },
      ],
    ]);
  });

  it('obtains a new token once the cached token reaches its expiry window', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ access_token: 'first', expires_in: 3600 }))
      .mockResolvedValueOnce(response({} as unknown))
      .mockResolvedValueOnce(response({ access_token: 'second', expires_in: 3600 }))
      .mockResolvedValueOnce(response({} as unknown));

    await service.request('/artists/first');
    now.mockReturnValue(1_000 + 3_540_000);
    await service.request('/artists/second');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://accounts.spotify.com/api/token',
    );
    expect(fetchMock.mock.calls[3][1]).toEqual({
      headers: { Authorization: 'Bearer second' },
    });
  });

  it('returns null for optional lookups when Client Credentials are absent', async () => {
    const noCredentials = new SpotifyClientCredentialsService({
      get: jest.fn(() => ''),
    } as unknown as ConfigService);

    await expect(noCredentials.getOptionalAccessToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
