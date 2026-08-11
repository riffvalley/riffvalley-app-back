import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { CreateSyncedPlaylistDto } from './dto/create-synced-playlist.dto';
import { SyncPlaylistArtistDto } from './dto/sync-playlist-artist.dto';
import { SpotifyConnection } from './entities/spotify-connection.entity';
import { TokenCryptoService } from './token-crypto.service';
import {
  Spotify,
  SpotifyStatus,
  SpotifyType,
} from 'src/spotify/entities/spotify.entity';
import { Artist } from 'src/artists/entities/artist.entity';
import {
  PlaylistArtistSyncStatus,
  PlaylistTrackRecord,
  SpotifyPlaylistArtist,
} from './entities/spotify-playlist-artist.entity';

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SETLIST_API_URL = 'https://api.setlist.fm/rest/1.0';
const SPOTIFY_SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
  'user-read-private',
];
const RIFF_VALLEY_CONNECTION_KEY = 'riff-valley';

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

interface SpotifyProfile {
  id: string;
  display_name: string | null;
}

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { name: string }[];
  external_urls: { spotify: string };
}

interface SetlistSong {
  name?: string;
  tape?: boolean;
}

interface Setlist {
  id?: string;
  eventDate?: string;
  url?: string;
  sets?: { set?: { song?: SetlistSong[] }[] };
}

export interface TopSong {
  name: string;
  plays: number;
}

@Injectable()
export class FestivalPlaylistsService {
  constructor(
    @InjectRepository(SpotifyConnection)
    private readonly connectionRepository: Repository<SpotifyConnection>,
    @InjectRepository(Spotify)
    private readonly spotifyRepository: Repository<Spotify>,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(SpotifyPlaylistArtist)
    private readonly playlistArtistRepository: Repository<SpotifyPlaylistArtist>,
    private readonly configService: ConfigService,
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  async startSpotifyConnection() {
    const clientId = this.requiredConfig('SPOTIFY_CLIENT_ID');
    const redirectUri = this.requiredConfig('SPOTIFY_REDIRECT_URI');
    const state = randomBytes(32).toString('base64url');

    let connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    if (!connection) {
      connection = this.connectionRepository.create({
        connectionKey: RIFF_VALLEY_CONNECTION_KEY,
      });
    }
    connection.oauthStateHash = this.tokenCrypto.hash(state);
    connection.oauthStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.connectionRepository.save(connection);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES.join(' '),
      state,
    });

    return { authorizationUrl: `${SPOTIFY_ACCOUNTS_URL}/authorize?${params}` };
  }

  async completeSpotifyConnection(code: string, state: string) {
    if (!code || !state)
      throw new BadRequestException('Faltan code o state de Spotify');

    const stateHash = this.tokenCrypto.hash(state);
    const connection = await this.connectionRepository
      .createQueryBuilder('connection')
      .addSelect([
        'connection.oauthStateHash',
        'connection.oauthStateExpiresAt',
      ])
      .where('connection.oauthStateHash = :stateHash', { stateHash })
      .getOne();

    if (
      !connection ||
      !connection.oauthStateExpiresAt ||
      connection.oauthStateExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'El estado OAuth no es válido o ha caducado',
      );
    }

    // El state sólo puede consumirse una vez, incluso si Spotify rechaza el código.
    connection.oauthStateHash = null;
    connection.oauthStateExpiresAt = null;
    await this.connectionRepository.save(connection);

    const token = await this.exchangeAuthorizationCode(code);
    const profile = await this.spotifyRequest<SpotifyProfile>(
      '/me',
      token.access_token,
    );

    connection.spotifyUserId = profile.id;
    connection.displayName = profile.display_name;
    connection.accessToken = this.tokenCrypto.encrypt(token.access_token);
    connection.refreshToken = token.refresh_token
      ? this.tokenCrypto.encrypt(token.refresh_token)
      : connection.refreshToken;
    connection.scope = token.scope ?? SPOTIFY_SCOPES.join(' ');
    connection.expiresAt = new Date(Date.now() + token.expires_in * 1000);
    await this.connectionRepository.save(connection);

    return {
      connected: true,
      spotifyUserId: connection.spotifyUserId,
      displayName: connection.displayName,
    };
  }

  async getSpotifyConnection() {
    const connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    return {
      connected: Boolean(connection?.spotifyUserId && connection?.expiresAt),
      spotifyUserId: connection?.spotifyUserId ?? null,
      displayName: connection?.displayName ?? null,
    };
  }

  async disconnectSpotify() {
    await this.connectionRepository.delete({
      connectionKey: RIFF_VALLEY_CONNECTION_KEY,
    });
    return { connected: false };
  }

  async getTopSongs(artist: string, limit = 10, recentSetlists = 10) {
    const apiKey = this.requiredConfig('SETLISTFM_API_KEY');
    const params = new URLSearchParams({ artistName: artist, p: '1' });
    const response = await fetch(
      `${SETLIST_API_URL}/search/setlists?${params}`,
      {
        headers: { Accept: 'application/json', 'x-api-key': apiKey },
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `setlist.fm respondió con ${response.status}`,
      );
    }

    const data = (await response.json()) as { setlist?: Setlist[] };
    const setlists = (data.setlist ?? [])
      .sort(
        (a, b) =>
          this.setlistTimestamp(b.eventDate) -
          this.setlistTimestamp(a.eventDate),
      )
      .filter((setlist) => this.songsFromSetlist(setlist).length > 0)
      .slice(0, recentSetlists);

    if (!setlists.length) {
      throw new NotFoundException(
        `No hay setlists recientes con canciones para ${artist}`,
      );
    }

    const counts = new Map<
      string,
      { name: string; plays: number; firstSeen: number }
    >();
    let position = 0;
    for (const setlist of setlists) {
      // Una canción cuenta una sola vez por concierto aunque aparezca repetida en el setlist.
      const songsInConcert = new Map<string, string>();
      for (const song of this.songsFromSetlist(setlist)) {
        const key = this.normalize(song.name);
        if (key && !song.tape && !songsInConcert.has(key))
          songsInConcert.set(key, song.name.trim());
      }
      for (const [key, name] of songsInConcert) {
        const current = counts.get(key);
        counts.set(
          key,
          current
            ? { ...current, plays: current.plays + 1 }
            : { name, plays: 1, firstSeen: position++ },
        );
      }
    }

    const songs: TopSong[] = [...counts.values()]
      .sort((a, b) => b.plays - a.plays || a.firstSeen - b.firstSeen)
      .slice(0, limit)
      .map(({ name, plays }) => ({ name, plays }));

    return {
      artist,
      setlistsAnalyzed: setlists.length,
      songs,
      sources: setlists.map((setlist) => setlist.url).filter(Boolean),
    };
  }

  async createFestivalPlaylist(dto: CreateSyncedPlaylistDto) {
    const accessToken = await this.getValidAccessToken();
    const description =
      dto.description ??
      'Playlist creada a partir de los repertorios recientes de setlist.fm';
    const playlist = await this.spotifyRequest<{
      id: string;
      name: string;
      external_urls: { spotify: string };
    }>('/me/playlists', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        name: dto.name,
        description,
        public: dto.public,
      }),
    });

    const spotify = this.spotifyRepository.create({
      name: playlist.name,
      link: playlist.external_urls.spotify,
      spotifyPlaylistId: playlist.id,
      description,
      isPublic: dto.public,
      status: SpotifyStatus.IN_PROGRESS,
      type: SpotifyType.FESTIVAL,
      updateDate: new Date(),
    });
    await this.spotifyRepository.save(spotify);

    return this.getFestivalPlaylist(spotify.id);
  }

  async getFestivalPlaylist(spotifyId: string) {
    const spotify = await this.spotifyRepository.findOne({
      where: { id: spotifyId },
      relations: ['user', 'playlistArtists', 'playlistArtists.artist'],
    });
    if (!spotify) throw new NotFoundException('Playlist not found');
    if (!spotify.spotifyPlaylistId) {
      throw new BadRequestException(
        'La playlist no está vinculada con Spotify',
      );
    }
    return spotify;
  }

  async addArtist(spotifyId: string, dto: SyncPlaylistArtistDto) {
    const [spotify, artist] = await Promise.all([
      this.getFestivalPlaylist(spotifyId),
      this.artistRepository.findOneBy({ id: dto.artistId }),
    ]);
    if (!artist) throw new NotFoundException('Artist not found');

    let association = await this.playlistArtistRepository.findOne({
      where: { spotifyId, artistId: artist.id },
    });
    if (association?.status === PlaylistArtistSyncStatus.SYNCED) {
      throw new ConflictException(
        'El artista ya está sincronizado en la playlist',
      );
    }
    if (!association) {
      association = this.playlistArtistRepository.create({
        spotifyId,
        artistId: artist.id,
        artist,
        status: PlaylistArtistSyncStatus.SYNCING,
        tracks: [],
        setlistsAnalyzed: 0,
        lastError: null,
      });
    } else {
      association.status = PlaylistArtistSyncStatus.SYNCING;
      association.lastError = null;
    }
    await this.playlistArtistRepository.save(association);

    try {
      const accessToken = await this.getValidAccessToken();
      const top = await this.getTopSongs(
        artist.name,
        dto.tracksPerArtist,
        dto.recentSetlists,
      );
      const tracks: PlaylistTrackRecord[] = [];
      for (const song of top.songs) {
        const track = await this.findSpotifyTrack(
          accessToken,
          artist.name,
          song.name,
        );
        if (track && !tracks.some((item) => item.uri === track.uri)) {
          tracks.push({
            spotifyTrackId: track.id,
            uri: track.uri,
            name: track.name,
            url: track.external_urls.spotify,
            plays: song.plays,
          });
        }
      }
      if (!tracks.length) {
        throw new NotFoundException(
          `No se encontraron canciones de ${artist.name} en Spotify`,
        );
      }

      const allAssociations = await this.playlistArtistRepository.find({
        where: { spotifyId },
      });
      const existingUris = new Set(
        allAssociations
          .flatMap((item) => item.tracks ?? [])
          .map((track) => track.uri),
      );
      const urisToAdd = [...new Set(tracks.map((track) => track.uri))].filter(
        (uri) => !existingUris.has(uri),
      );
      if (urisToAdd.length) {
        await this.spotifyRequest(
          `/playlists/${spotify.spotifyPlaylistId}/items`,
          accessToken,
          { method: 'POST', body: JSON.stringify({ uris: urisToAdd }) },
        );
      }

      association.tracks = tracks;
      association.setlistsAnalyzed = top.setlistsAnalyzed;
      association.status = PlaylistArtistSyncStatus.SYNCED;
      association.lastError = null;
      await this.playlistArtistRepository.save(association);
      await this.spotifyRepository.update(spotify.id, {
        updateDate: new Date(),
      });
      return this.getFestivalPlaylist(spotifyId);
    } catch (error) {
      association.status = PlaylistArtistSyncStatus.FAILED;
      association.lastError = this.errorMessage(error);
      await this.playlistArtistRepository.save(association);
      throw error;
    }
  }

  async removeArtist(spotifyId: string, artistId: string) {
    const spotify = await this.getFestivalPlaylist(spotifyId);
    const association = await this.playlistArtistRepository.findOne({
      where: { spotifyId, artistId },
    });
    if (!association)
      throw new NotFoundException('Artist is not in this playlist');

    try {
      const others = await this.playlistArtistRepository.find({
        where: { spotifyId },
      });
      const sharedUris = new Set(
        others
          .filter((item) => item.id !== association.id)
          .flatMap((item) => item.tracks ?? [])
          .map((track) => track.uri),
      );
      const urisToRemove = [
        ...new Set((association.tracks ?? []).map((track) => track.uri)),
      ].filter((uri) => !sharedUris.has(uri));
      if (urisToRemove.length) {
        const accessToken = await this.getValidAccessToken();
        await this.spotifyRequest(
          `/playlists/${spotify.spotifyPlaylistId}/items`,
          accessToken,
          {
            method: 'DELETE',
            body: JSON.stringify({
              items: urisToRemove.map((uri) => ({ uri })),
            }),
          },
        );
      }
      await this.playlistArtistRepository.remove(association);
      await this.spotifyRepository.update(spotify.id, {
        updateDate: new Date(),
      });
      return this.getFestivalPlaylist(spotifyId);
    } catch (error) {
      association.status = PlaylistArtistSyncStatus.FAILED;
      association.lastError = this.errorMessage(error);
      await this.playlistArtistRepository.save(association);
      throw error;
    }
  }

  private async findSpotifyTrack(
    accessToken: string,
    artist: string,
    song: string,
  ) {
    const query = `track:${song} artist:${artist}`;
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: '10',
    });
    const data = await this.spotifyRequest<{
      tracks?: { items?: SpotifyTrack[] };
    }>(`/search?${params}`, accessToken);
    const items = data.tracks?.items ?? [];
    const normalizedArtist = this.normalize(artist);
    return (
      items.find((track) =>
        track.artists.some(
          (item) => this.normalize(item.name) === normalizedArtist,
        ),
      ) ??
      items[0] ??
      null
    );
  }

  private async getValidAccessToken(): Promise<string> {
    const connection = await this.connectionRepository
      .createQueryBuilder('connection')
      .addSelect(['connection.accessToken', 'connection.refreshToken'])
      .where('connection.connectionKey = :connectionKey', {
        connectionKey: RIFF_VALLEY_CONNECTION_KEY,
      })
      .getOne();

    if (
      !connection?.accessToken ||
      !connection.refreshToken ||
      !connection.expiresAt
    ) {
      throw new UnauthorizedException(
        'El usuario no ha conectado su cuenta de Spotify',
      );
    }

    if (connection.expiresAt.getTime() > Date.now() + 60_000) {
      return this.tokenCrypto.decrypt(connection.accessToken);
    }

    const refreshed = await this.refreshAccessToken(
      this.tokenCrypto.decrypt(connection.refreshToken),
    );
    connection.accessToken = this.tokenCrypto.encrypt(refreshed.access_token);
    if (refreshed.refresh_token) {
      connection.refreshToken = this.tokenCrypto.encrypt(
        refreshed.refresh_token,
      );
    }
    connection.scope = refreshed.scope ?? connection.scope;
    connection.expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.connectionRepository.save(connection);
    return refreshed.access_token;
  }

  private async exchangeAuthorizationCode(
    code: string,
  ): Promise<SpotifyTokenResponse> {
    return this.spotifyTokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.requiredConfig('SPOTIFY_REDIRECT_URI'),
      }),
    );
  }

  private async refreshAccessToken(
    refreshToken: string,
  ): Promise<SpotifyTokenResponse> {
    return this.spotifyTokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
  }

  private async spotifyTokenRequest(
    body: URLSearchParams,
  ): Promise<SpotifyTokenResponse> {
    const credentials = Buffer.from(
      `${this.requiredConfig('SPOTIFY_CLIENT_ID')}:${this.requiredConfig('SPOTIFY_CLIENT_SECRET')}`,
    ).toString('base64');
    const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) {
      throw new BadGatewayException(
        `Spotify OAuth respondió con ${response.status}`,
      );
    }
    return response.json() as Promise<SpotifyTokenResponse>;
  }

  private async spotifyRequest<T = unknown>(
    path: string,
    accessToken: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
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
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private songsFromSetlist(setlist: Setlist): SetlistSong[] {
    return (setlist.sets?.set ?? [])
      .flatMap((set) => set.song ?? [])
      .filter((song) => song.name);
  }

  private setlistTimestamp(value?: string): number {
    if (!value) return 0;
    const [day, month, year] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private errorMessage(error: unknown): string {
    return (
      error instanceof Error ? error.message : 'Error de sincronización'
    ).slice(0, 1000);
  }

  private requiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value)
      throw new InternalServerErrorException(`${name} no está configurada`);
    return value;
  }
}
