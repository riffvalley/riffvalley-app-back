import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SpotifyOAuthTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

export class SpotifyInvalidGrantError extends Error {}

@Injectable()
export class SpotifyOAuthApiService {
  constructor(private readonly configService: ConfigService) {}

  getAuthorizationUrl(scopes: string[], state: string): string {
    const clientId = this.requiredConfig('SPOTIFY_CLIENT_ID');
    const redirectUri = this.requiredConfig('SPOTIFY_REDIRECT_URI');
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
    });
    return `https://accounts.spotify.com/authorize?${params}`;
  }

  exchangeAuthorizationCode(code: string): Promise<SpotifyOAuthTokenResponse> {
    return this.tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.requiredConfig('SPOTIFY_REDIRECT_URI'),
      }),
    );
  }

  refreshAccessToken(refreshToken: string): Promise<SpotifyOAuthTokenResponse> {
    return this.tokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
  }

  async request<T = unknown>(
    path: string,
    accessToken: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new BadGatewayException(
        `Spotify respondió con ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
      );
    }
    const responseBody = await response.text();
    if (!responseBody) return undefined as T;
    return JSON.parse(responseBody) as T;
  }

  private async tokenRequest(
    body: URLSearchParams,
  ): Promise<SpotifyOAuthTokenResponse> {
    const credentials = Buffer.from(
      `${this.requiredConfig('SPOTIFY_CLIENT_ID')}:${this.requiredConfig('SPOTIFY_CLIENT_SECRET')}`,
    ).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const responseBody = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    } & Partial<SpotifyOAuthTokenResponse>;
    if (!response.ok) {
      if (responseBody.error === 'invalid_grant')
        throw new SpotifyInvalidGrantError(
          responseBody.error_description || 'Spotify invalid_grant',
        );
      throw new BadGatewayException(
        `Spotify OAuth respondió con ${response.status}`,
      );
    }
    return responseBody as SpotifyOAuthTokenResponse;
  }

  private requiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) throw new Error(`Falta configurar ${name}`);
    return value;
  }
}
