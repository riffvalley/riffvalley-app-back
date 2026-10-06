import { Injectable } from '@nestjs/common';
import { SpotifyOAuthApiService } from './spotify-oauth-api.service';

export interface SpotifyProfile {
  id: string;
  display_name: string | null;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { id: string; name: string }[];
  external_urls: { spotify: string };
  duration_ms?: number;
  album?: { name: string; images?: SpotifyImage[] };
}

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyPlaylistDetails {
  id: string;
  name: string;
  description: string | null;
  public: boolean | null;
  owner: { id: string; display_name: string | null };
  external_urls: { spotify: string };
  images?: SpotifyImage[];
}

interface SpotifyPlaylistItemsPage {
  items?: Array<{
    item?: { uri?: string } | null;
    track?: { uri?: string } | null;
  }>;
  next?: string | null;
}

@Injectable()
export class SpotifyAccountApiService {
  constructor(private readonly api: SpotifyOAuthApiService) {}

  getProfile(accessToken: string): Promise<SpotifyProfile> {
    return this.api.request('/me', accessToken);
  }

  createPlaylist(
    accessToken: string,
    payload: { name: string; description: string; public: boolean },
  ): Promise<{ id: string; name: string; external_urls: { spotify: string } }> {
    return this.api.request('/me/playlists', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getPlaylist(
    accessToken: string,
    playlistId: string,
  ): Promise<SpotifyPlaylistDetails> {
    return this.api.request(`/playlists/${playlistId}`, accessToken);
  }

  updatePlaylist(
    accessToken: string,
    playlistId: string,
    payload: { name?: string; description?: string; public?: boolean },
  ): Promise<void> {
    return this.api.request(`/playlists/${playlistId}`, accessToken, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  uploadPlaylistImage(
    accessToken: string,
    playlistId: string,
    base64Image: string,
  ): Promise<void> {
    return this.api.request(`/playlists/${playlistId}/images`, accessToken, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: base64Image,
    });
  }

  getPlaylistImages(
    accessToken: string,
    playlistId: string,
  ): Promise<SpotifyImage[]> {
    return this.api.request(`/playlists/${playlistId}/images`, accessToken);
  }

  async getPlaylistTrackUris(
    accessToken: string,
    playlistId: string,
    unique: boolean,
  ): Promise<string[]> {
    const uris: string[] = [];
    let offset = 0;
    while (true) {
      const page = await this.api.request<SpotifyPlaylistItemsPage>(
        `/playlists/${playlistId}/items?limit=50&offset=${offset}`,
        accessToken,
      );
      const items = page.items ?? [];
      for (const entry of items) {
        const uri = entry.item?.uri ?? entry.track?.uri;
        if (uri) uris.push(uri);
      }
      if (!page.next || !items.length) break;
      offset += items.length;
    }
    return unique ? [...new Set(uris)] : uris;
  }

  async searchTracks(
    accessToken: string,
    query: string,
    limit: number,
  ): Promise<SpotifyTrack[]> {
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: String(limit),
    });
    const response = await this.api.request<{
      tracks?: { items?: SpotifyTrack[] };
    }>(`/search?${params}`, accessToken);
    return response.tracks?.items ?? [];
  }

  async getTracks(
    accessToken: string,
    ids: string[],
  ): Promise<Array<SpotifyTrack | null>> {
    const params = new URLSearchParams({ ids: ids.join(',') });
    const response = await this.api.request<{
      tracks?: Array<SpotifyTrack | null>;
    }>(`/tracks?${params}`, accessToken);
    return response.tracks ?? [];
  }

  addPlaylistItems(
    accessToken: string,
    playlistId: string,
    uris: string[],
  ): Promise<void> {
    return this.api.request(`/playlists/${playlistId}/items`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ uris }),
    });
  }

  removePlaylistItems(
    accessToken: string,
    playlistId: string,
    uris: string[],
  ): Promise<void> {
    return this.api.request(`/playlists/${playlistId}/items`, accessToken, {
      method: 'DELETE',
      body: JSON.stringify({ items: uris.map((uri) => ({ uri })) }),
    });
  }

  async replacePlaylistTrackUris(
    accessToken: string,
    playlistId: string,
    uris: string[],
  ): Promise<void> {
    await this.api.request(`/playlists/${playlistId}/items`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ uris: uris.slice(0, 100) }),
    });
    for (let index = 100; index < uris.length; index += 100) {
      await this.addPlaylistItems(
        accessToken,
        playlistId,
        uris.slice(index, index + 100),
      );
    }
  }
}
