import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpotifyApiAlbum,
  SpotifyApiSearchResponse,
  SpotifyClientCredentialsTokenResponse,
} from './spotify-public-api.types';

@Injectable()
export class SpotifyClientCredentialsService {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {}

  async request(path: string, timeoutMs?: number): Promise<Response> {
    const token = await this.getAccessToken(false, timeoutMs);
    const options: RequestInit = {
      headers: { Authorization: `Bearer ${token}` },
    };
    if (timeoutMs !== undefined)
      options.signal = AbortSignal.timeout(timeoutMs);
    return fetch(`https://api.spotify.com/v1${path}`, options);
  }

  async searchAlbumsByRawQuery(
    query: string,
  ): Promise<SpotifyApiSearchResponse<SpotifyApiAlbum> | null> {
    const token = await this.getOptionalAccessToken();
    if (!token) return null;
    const response = await fetch(this.albumSearchUrl(query), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Spotify search failed: ${response.status}`);
    }
    return response.json();
  }

  albumSearchUrl(query: string): string {
    return `https://api.spotify.com/v1/search?q=${query}&type=album&limit=1`;
  }

  getOptionalAccessToken(): Promise<string | null> {
    return this.getAccessToken(true);
  }

  private async getAccessToken(
    optional: boolean,
    timeoutMs?: number,
  ): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt)
      return this.accessToken;

    const clientId = this.configService.get<string>('SPOTIFY_CLIENT_ID', '');
    const clientSecret = this.configService.get<string>(
      'SPOTIFY_CLIENT_SECRET',
      '',
    );
    if (optional && (!clientId || !clientSecret)) return null;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );
    const options: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    };
    if (timeoutMs !== undefined)
      options.signal = AbortSignal.timeout(timeoutMs);
    const response = await fetch(
      'https://accounts.spotify.com/api/token',
      options,
    );
    if (!response.ok)
      throw new Error(`Spotify auth failed: ${response.status}`);

    const data =
      (await response.json()) as SpotifyClientCredentialsTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }
}
