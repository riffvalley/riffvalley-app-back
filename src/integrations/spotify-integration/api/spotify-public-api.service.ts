import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  SpotifyAlbumGroup,
  SpotifyApiAlbum,
  SpotifyApiAlbumTrack,
  SpotifyApiArtist,
  SpotifyApiPage,
  SpotifyApiSearchResponse,
  SpotifyApiTopTracksResponse,
  SpotifyApiTrack,
  SpotifyApiTracksResponse,
} from './spotify-public-api.types';
import { SpotifyClientCredentialsService } from './spotify-client-credentials.service';

export interface SpotifyAlbumSummary {
  spotifyId: string;
  name: string;
  listenUrl: string | null;
  coverUrl: string | null;
}

export interface SpotifyAlbumTrack {
  id: string;
  name: string;
  number: number;
  durationMs: number;
  previewUrl: string | null;
}

export interface SpotifyAlbumDetails extends SpotifyAlbumSummary {
  artistNames: string[];
  releaseDate: string | null;
  totalTracks: number;
  tracks: SpotifyAlbumTrack[];
}

export interface SpotifyArtistProfile {
  spotifyId: string;
  name: string;
  listenUrl: string | null;
  imageUrl: string | null;
  genres: string[];
  followers: number | null;
  popularity: number | null;
}

export interface SpotifyArtistCandidate {
  spotifyId: string;
  name: string;
  listenUrl: string | null;
  imageUrl: string | null;
  genres: string[];
}

export interface SpotifyArtistAlbum {
  id: string;
  name: string;
  albumType: string;
  releaseDate: string | null;
  listenUrl: string | null;
  coverUrl: string | null;
}

export interface SpotifyArtistAlbums {
  spotifyId: string;
  items: SpotifyArtistAlbum[];
}

export interface SpotifyArtistTopTrack {
  id: string;
  name: string;
  listenUrl: string | null;
  previewUrl: string | null;
  albumName: string | null;
  albumImageUrl: string | null;
  durationMs: number | null;
}

export interface SpotifyAlbumPopularTrack {
  trackId: string | null;
}

@Injectable()
export class SpotifyPublicApiService {
  private readonly logger = new Logger(SpotifyPublicApiService.name);
  constructor(
    private readonly clientCredentials: SpotifyClientCredentialsService,
  ) {}

  private async request(path: string, timeoutMs?: number): Promise<Response> {
    return this.clientCredentials.request(path, timeoutMs);
  }

  private async get<T>(path: string): Promise<T | null> {
    const res = await this.request(path);
    if (!res.ok) {
      this.logger.warn(`Spotify API ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  }

  private async getRequired<T>(
    path: string,
    notFoundMessage = 'Álbum no encontrado en Spotify',
    timeoutMs?: number,
  ): Promise<T> {
    try {
      const res = await this.request(path, timeoutMs);

      if (res.status === 404) {
        throw new NotFoundException(notFoundMessage);
      }

      if (!res.ok) {
        this.logger.warn(`Spotify API ${path} → ${res.status}`);
        throw new BadGatewayException('No se pudo consultar Spotify');
      }

      return (await res.json()) as T;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }

      this.logger.error(`Spotify API request failed: ${path}`, error);
      throw new BadGatewayException('No se pudo consultar Spotify');
    }
  }

  async findArtist(artistName: string): Promise<SpotifyArtistProfile | null> {
    const data = await this.getRequired<
      SpotifyApiSearchResponse<SpotifyApiArtist>
    >(this.artistSearchPath(artistName), 'Artista no encontrado en Spotify');
    const artist = data?.artists?.items?.[0];
    if (!artist) return null;
    return this.toArtistProfile(artist);
  }

  async findArtistCandidates(
    artistName: string,
    timeoutMs = 5000,
  ): Promise<SpotifyArtistCandidate[]> {
    const data = await this.getRequired<
      SpotifyApiSearchResponse<SpotifyApiArtist>
    >(
      this.artistSearchPath(artistName, 5),
      'Artista no encontrado en Spotify',
      timeoutMs,
    );
    const artists = Array.isArray(data?.artists?.items)
      ? data.artists.items.slice(0, 5)
      : [];

    return artists.map((artist) => {
      const profile = this.toArtistProfile(artist);
      return {
        spotifyId: profile.spotifyId,
        name: profile.name,
        listenUrl: profile.listenUrl,
        imageUrl: profile.imageUrl,
        genres: profile.genres,
      };
    });
  }

  async getArtistTopTracks(
    spotifyArtistId: string,
  ): Promise<SpotifyArtistTopTrack[]> {
    const data = await this.getRequired<SpotifyApiTopTracksResponse>(
      `/artists/${encodeURIComponent(spotifyArtistId)}/top-tracks?market=ES`,
      'Artista no encontrado en Spotify',
    );
    if (!Array.isArray(data?.tracks)) {
      throw new BadGatewayException(
        'Respuesta de canciones no válida de Spotify',
      );
    }

    return data.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      listenUrl: track.external_urls?.spotify ?? null,
      previewUrl: track.preview_url ?? null,
      albumName: track.album?.name ?? null,
      albumImageUrl: Array.isArray(track.album?.images)
        ? (track.album.images.find((image) => typeof image?.url === 'string')
            ?.url ?? null)
        : null,
      durationMs: track.duration_ms ?? null,
    }));
  }

  async getArtistAlbums(
    spotifyArtistId: string,
    includeGroups: SpotifyAlbumGroup[],
    limit: number,
  ): Promise<SpotifyArtistAlbums> {
    const query = new URLSearchParams({
      include_groups: includeGroups.join(','),
      market: 'ES',
      limit: String(limit),
    });
    const data = await this.getRequired<SpotifyApiPage<SpotifyApiAlbum>>(
      `/artists/${encodeURIComponent(spotifyArtistId)}/albums?${query.toString()}`,
      'Artista no encontrado en Spotify',
    );

    if (!Array.isArray(data?.items)) {
      throw new BadGatewayException(
        'Respuesta de álbumes no válida de Spotify',
      );
    }

    return {
      spotifyId: spotifyArtistId,
      items: data.items.map((album) => {
        if (
          typeof album?.id !== 'string' ||
          typeof album?.name !== 'string' ||
          typeof album?.album_type !== 'string'
        ) {
          throw new BadGatewayException(
            'Respuesta de álbumes no válida de Spotify',
          );
        }

        return {
          id: album.id,
          name: album.name,
          albumType: album.album_type,
          releaseDate:
            typeof album.release_date === 'string' ? album.release_date : null,
          listenUrl:
            typeof album.external_urls?.spotify === 'string'
              ? album.external_urls.spotify
              : null,
          coverUrl: Array.isArray(album.images)
            ? (album.images.find((image) => typeof image?.url === 'string')
                ?.url ?? null)
            : null,
        };
      }),
    };
  }

  async getArtistImageCandidates(spotifyArtistId: string): Promise<string[]> {
    const artist = await this.getRequired<SpotifyApiArtist>(
      `/artists/${encodeURIComponent(spotifyArtistId)}`,
      'Artista no encontrado en Spotify',
    );
    return Array.isArray(artist?.images)
      ? artist.images
          .map((image) => image?.url)
          .filter(
            (url: unknown): url is string =>
              typeof url === 'string' && url.length > 0,
          )
      : [];
  }

  private toArtistProfile(artist: SpotifyApiArtist): SpotifyArtistProfile {
    if (!artist?.id || !artist?.name) {
      throw new BadGatewayException(
        'Respuesta de artista no válida de Spotify',
      );
    }
    return {
      spotifyId: artist.id,
      name: artist.name,
      listenUrl: artist.external_urls?.spotify ?? null,
      imageUrl: Array.isArray(artist.images)
        ? (artist.images.find((image) => typeof image?.url === 'string')?.url ??
          null)
        : null,
      genres: Array.isArray(artist.genres)
        ? artist.genres.filter(
            (genre: unknown): genre is string => typeof genre === 'string',
          )
        : [],
      followers:
        typeof artist.followers?.total === 'number'
          ? artist.followers.total
          : null,
      popularity:
        typeof artist.popularity === 'number' ? artist.popularity : null,
    };
  }

  async resolveAlbum(
    artistName: string,
    albumName: string,
  ): Promise<SpotifyAlbumSummary | null> {
    const search = await this.getRequired<
      SpotifyApiSearchResponse<SpotifyApiAlbum>
    >(this.albumSearchPath(artistName, albumName));
    const album = search?.albums?.items?.[0];
    if (!album) return null;
    if (!album.id) {
      throw new BadGatewayException('Respuesta de álbum no válida de Spotify');
    }

    return {
      spotifyId: album.id,
      name: album.name ?? albumName,
      listenUrl: album.external_urls?.spotify ?? null,
      coverUrl: album.images?.[0]?.url ?? null,
    };
  }

  async getAlbumDetails(spotifyAlbumId: string): Promise<SpotifyAlbumDetails> {
    const album = await this.getRequired<SpotifyApiAlbum>(
      `/albums/${encodeURIComponent(spotifyAlbumId)}`,
    );
    if (!album?.id || !album?.name) {
      throw new BadGatewayException('Respuesta de álbum no válida de Spotify');
    }

    const tracks: SpotifyApiAlbumTrack[] = Array.isArray(album.tracks?.items)
      ? album.tracks.items
      : [];

    return {
      spotifyId: album.id,
      name: album.name,
      artistNames: Array.isArray(album.artists)
        ? album.artists
            .map((artist) => artist?.name)
            .filter((name: unknown): name is string => typeof name === 'string')
        : [],
      coverUrl: album.images?.[0]?.url ?? null,
      releaseDate: album.release_date ?? null,
      totalTracks: album.total_tracks ?? tracks.length,
      listenUrl: album.external_urls?.spotify ?? null,
      tracks: tracks.map((track) => ({
        id: track.id,
        name: track.name,
        number: track.track_number,
        durationMs: track.duration_ms,
        previewUrl: track.preview_url ?? null,
      })),
    };
  }

  async getMostPopularAlbumTrack(
    spotifyAlbumId: string,
  ): Promise<SpotifyAlbumPopularTrack> {
    const albumTracks = await this.getRequired<SpotifyApiPage<SpotifyApiTrack>>(
      `/albums/${encodeURIComponent(spotifyAlbumId)}/tracks?limit=50`,
    );
    const trackIds: string[] = Array.isArray(albumTracks?.items)
      ? albumTracks.items
          .map((track) => track?.id)
          .filter(
            (id: unknown): id is string =>
              typeof id === 'string' && id.length > 0,
          )
      : [];

    if (!trackIds.length) return { trackId: null };

    const tracksData = await this.getRequired<SpotifyApiTracksResponse>(
      `/tracks?ids=${encodeURIComponent(trackIds.join(','))}`,
    );
    if (!Array.isArray(tracksData?.tracks)) {
      throw new BadGatewayException(
        'Respuesta de canciones no válida de Spotify',
      );
    }

    let mostPopular: { id: string; popularity: number } | null = null;
    for (const track of tracksData.tracks) {
      if (
        typeof track?.id !== 'string' ||
        track.id.length === 0 ||
        typeof track.popularity !== 'number' ||
        !Number.isFinite(track.popularity)
      ) {
        continue;
      }
      // Strict `>` preserves the first track in provider order on a tie,
      // matching the frontend's reduce-based selection.
      if (!mostPopular || track.popularity > mostPopular.popularity) {
        mostPopular = { id: track.id, popularity: track.popularity };
      }
    }

    return { trackId: mostPopular?.id ?? null };
  }

  private albumSearchPath(artistName: string, albumName: string): string {
    const query = encodeURIComponent(`album:${albumName} artist:${artistName}`);
    return `/search?q=${query}&type=album&limit=1`;
  }

  // Álbum + tracklist de Spotify para el endpoint que alimenta el <select>
  // del front para elegir la canción a mano y el caso de uso de Lists.
  async getAlbumTracks(
    artistName: string,
    albumName: string,
  ): Promise<{ id: string; name: string; trackNumber: number }[]> {
    const albumSearch = await this.get<
      SpotifyApiSearchResponse<SpotifyApiAlbum>
    >(this.albumSearchPath(artistName, albumName));
    const album = albumSearch?.albums?.items?.[0];
    if (!album) return [];

    const tracksData = await this.get<SpotifyApiPage<SpotifyApiAlbumTrack>>(
      `/albums/${album.id}/tracks?limit=50`,
    );
    const items: SpotifyApiAlbumTrack[] = tracksData?.items ?? [];
    return items.map((t) => ({
      id: t.id,
      name: t.name,
      trackNumber: t.track_number,
    }));
  }

  async getArtistSingles(artistName: string): Promise<string[]> {
    const artistSearch = await this.get<
      SpotifyApiSearchResponse<SpotifyApiArtist>
    >(this.artistSearchPath(artistName));
    const artist = artistSearch?.artists?.items?.[0];
    if (!artist) return [];

    const singlesData = await this.get<SpotifyApiPage<SpotifyApiAlbum>>(
      `/artists/${artist.id}/albums?include_groups=single&market=ES&limit=50`,
    );
    return (singlesData?.items ?? []).map((single) => single.name);
  }

  private artistSearchPath(artistName: string, limit = 1): string {
    return `/search?q=artist:${encodeURIComponent(artistName)}&type=artist&limit=${limit}`;
  }
}
