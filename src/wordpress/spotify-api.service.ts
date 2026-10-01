import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
export class SpotifyApiService {
  private readonly logger = new Logger('SpotifyApiService');
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('SPOTIFY_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>(
      'SPOTIFY_CLIENT_SECRET',
      '',
    );
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);

    const data: any = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async request(path: string): Promise<Response> {
    const token = await this.getAccessToken();
    return fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private async get(path: string): Promise<any> {
    const res = await this.request(path);
    if (!res.ok) {
      this.logger.warn(`Spotify API ${path} → ${res.status}`);
      return null;
    }
    return res.json();
  }

  private async getRequired(
    path: string,
    notFoundMessage = 'Álbum no encontrado en Spotify',
  ): Promise<any> {
    try {
      const res = await this.request(path);

      if (res.status === 404) {
        throw new NotFoundException(notFoundMessage);
      }

      if (!res.ok) {
        this.logger.warn(`Spotify API ${path} → ${res.status}`);
        throw new BadGatewayException('No se pudo consultar Spotify');
      }

      return await res.json();
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
    const data = await this.getRequired(
      this.artistSearchPath(artistName),
      'Artista no encontrado en Spotify',
    );
    const artist = data?.artists?.items?.[0];
    if (!artist) return null;
    return this.toArtistProfile(artist);
  }

  async findArtistCandidates(
    artistName: string,
  ): Promise<SpotifyArtistCandidate[]> {
    const data = await this.getRequired(
      this.artistSearchPath(artistName, 5),
      'Artista no encontrado en Spotify',
    );
    const artists = Array.isArray(data?.artists?.items)
      ? data.artists.items.slice(0, 5)
      : [];

    return artists.map((artist: any) => {
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
    const data = await this.getRequired(
      `/artists/${encodeURIComponent(spotifyArtistId)}/top-tracks?market=ES`,
      'Artista no encontrado en Spotify',
    );
    if (!Array.isArray(data?.tracks)) {
      throw new BadGatewayException(
        'Respuesta de canciones no válida de Spotify',
      );
    }

    return data.tracks.map((track: any) => ({
      id: track.id,
      name: track.name,
      listenUrl: track.external_urls?.spotify ?? null,
      previewUrl: track.preview_url ?? null,
      albumName: track.album?.name ?? null,
      albumImageUrl: Array.isArray(track.album?.images)
        ? (track.album.images.find(
            (image: any) => typeof image?.url === 'string',
          )?.url ?? null)
        : null,
      durationMs: track.duration_ms ?? null,
    }));
  }

  async getArtistImageCandidates(spotifyArtistId: string): Promise<string[]> {
    const artist = await this.getRequired(
      `/artists/${encodeURIComponent(spotifyArtistId)}`,
      'Artista no encontrado en Spotify',
    );
    return Array.isArray(artist?.images)
      ? artist.images
          .map((image: any) => image?.url)
          .filter(
            (url: unknown): url is string =>
              typeof url === 'string' && url.length > 0,
          )
      : [];
  }

  private toArtistProfile(artist: any): SpotifyArtistProfile {
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
        ? (artist.images.find((image: any) => typeof image?.url === 'string')
            ?.url ?? null)
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
    const search = await this.getRequired(
      this.albumSearchPath(artistName, albumName),
    );
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
    const album = await this.getRequired(
      `/albums/${encodeURIComponent(spotifyAlbumId)}`,
    );
    if (!album?.id || !album?.name) {
      throw new BadGatewayException('Respuesta de álbum no válida de Spotify');
    }

    const tracks: any[] = Array.isArray(album.tracks?.items)
      ? album.tracks.items
      : [];

    return {
      spotifyId: album.id,
      name: album.name,
      artistNames: Array.isArray(album.artists)
        ? album.artists
            .map((artist: any) => artist?.name)
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
    const albumTracks = await this.getRequired(
      `/albums/${encodeURIComponent(spotifyAlbumId)}/tracks?limit=50`,
    );
    const trackIds: string[] = Array.isArray(albumTracks?.items)
      ? albumTracks.items
          .map((track: any) => track?.id)
          .filter(
            (id: unknown): id is string =>
              typeof id === 'string' && id.length > 0,
          )
      : [];

    if (!trackIds.length) return { trackId: null };

    const tracksData = await this.getRequired(
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

  // Álbum + tracklist de Spotify para un disco, reutilizado tanto por la
  // selección automática (findTrackForAlbum) como por el endpoint que
  // alimenta el <select> del front para elegir la canción a mano.
  async getAlbumTracks(
    artistName: string,
    albumName: string,
  ): Promise<{ id: string; name: string; trackNumber: number }[]> {
    const albumSearch = await this.get(
      this.albumSearchPath(artistName, albumName),
    );
    const album = albumSearch?.albums?.items?.[0];
    if (!album) return [];

    const tracksData = await this.get(`/albums/${album.id}/tracks?limit=50`);
    const items: any[] = tracksData?.items ?? [];
    return items.map((t) => ({
      id: t.id,
      name: t.name,
      trackNumber: t.track_number,
    }));
  }

  async findTrackForAlbum(
    artistName: string,
    albumName: string,
  ): Promise<string | null> {
    try {
      // 1. Buscar el álbum y obtener sus tracks
      const albumTracks = await this.getAlbumTracks(artistName, albumName);
      if (!albumTracks.length) return null;

      // 2. Buscar singles del artista
      const artistSearch = await this.get(this.artistSearchPath(artistName));
      const artist = artistSearch?.artists?.items?.[0];

      if (artist) {
        const singlesData = await this.get(
          `/artists/${artist.id}/albums?include_groups=single&market=ES&limit=50`,
        );
        const singleNames: string[] = (singlesData?.items ?? []).map((s: any) =>
          s.name.toLowerCase(),
        );

        // 3. Si algún single coincide con un track del álbum, devolver ese track del álbum
        const matchedTrack = albumTracks.find((t) =>
          singleNames.includes(t.name.toLowerCase()),
        );
        if (matchedTrack) return matchedTrack.id;
      }

      // 4. Sin single → devolver el 3er track (o el último si hay menos de 3)
      return (albumTracks[2] ?? albumTracks[albumTracks.length - 1]).id;
    } catch (err) {
      this.logger.error(`findTrackForAlbum failed: ${err.message}`);
      return null;
    }
  }

  private artistSearchPath(artistName: string, limit = 1): string {
    return `/search?q=artist:${encodeURIComponent(artistName)}&type=artist&limit=${limit}`;
  }
}
