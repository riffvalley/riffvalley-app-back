import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpotifyInvalidGrantError,
  SpotifyOAuthApiService,
} from './spotify-oauth-api.service';

describe('SpotifyOAuthApiService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: SpotifyOAuthApiService;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const config = {
      get: (key: string) =>
        ({
          SPOTIFY_CLIENT_ID: 'client-id',
          SPOTIFY_CLIENT_SECRET: 'client-secret',
          SPOTIFY_REDIRECT_URI: 'https://app.test/callback',
        })[key],
    } as unknown as ConfigService;
    service = new SpotifyOAuthApiService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('preserva la URL de autorización, scopes, redirect y state', () => {
    const url = service.getAuthorizationUrl(
      ['playlist-modify-private', 'user-read-private'],
      'opaque-state',
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://accounts.spotify.com/authorize',
    );
    expect(parsed.searchParams.get('client_id')).toBe('client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.test/callback',
    );
    expect(parsed.searchParams.get('scope')).toBe(
      'playlist-modify-private user-read-private',
    );
    expect(parsed.searchParams.get('state')).toBe('opaque-state');
  });

  it('intercambia authorization code y refresh token con el contrato actual', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
      }),
    });
    await service.exchangeAuthorizationCode('code');
    await service.refreshAccessToken('refresh');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'code',
          redirect_uri: 'https://app.test/callback',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: 'refresh',
        }),
      }),
    );
  });

  it('mantiene el tratamiento especial de invalid_grant y otros errores OAuth', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'expired',
      }),
    });
    await expect(service.refreshAccessToken('expired')).rejects.toBeInstanceOf(
      SpotifyInvalidGrantError,
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'server_error' }),
    });
    await expect(service.refreshAccessToken('refresh')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('envía requests de cuenta con bearer, content type y errores Spotify actuales', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => '{"id":"user-id"}',
    });
    await expect(service.request('/me', 'access')).resolves.toEqual({
      id: 'user-id',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer access',
          Accept: 'application/json',
        },
      }),
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'too many requests',
    });
    await expect(service.request('/me', 'access')).rejects.toThrow(
      'Spotify respondió con 429: too many requests',
    );
  });
});
