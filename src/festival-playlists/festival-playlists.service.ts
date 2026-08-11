import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { CreateSyncedPlaylistDto } from './dto/create-synced-playlist.dto';
import { LinkSpotifyPlaylistDto } from './dto/link-spotify-playlist.dto';
import { SyncPlaylistArtistDto } from './dto/sync-playlist-artist.dto';
import { UpdateSyncedPlaylistDto } from './dto/update-synced-playlist.dto';
import { SpotifyConnection } from './entities/spotify-connection.entity';
import { TokenCryptoService } from './token-crypto.service';
import {
  Spotify,
  SpotifyStatus,
  SpotifyType,
} from 'src/spotify/entities/spotify.entity';
import { Artist } from 'src/artists/entities/artist.entity';
import {
  PlaylistArtistSelectionMode,
  PlaylistArtistSyncStatus,
  PlaylistTrackRecord,
  SpotifyPlaylistArtist,
} from './entities/spotify-playlist-artist.entity';
import { MailService } from 'src/mail/mail.service';

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SETLIST_API_URL = 'https://api.setlist.fm/rest/1.0';
const SPOTIFY_SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
  'ugc-image-upload',
  'user-read-private',
];
const RIFF_VALLEY_CONNECTION_KEY = 'riff-valley';
const SPOTIFY_REFRESH_TOKEN_LIFETIME_MONTHS = 6;
const SPOTIFY_REAUTHORIZATION_WARNING_DAYS = 14;

class SpotifyInvalidGrantError extends Error {}

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
  artists: { id: string; name: string }[];
  external_urls: { spotify: string };
  duration_ms?: number;
  album?: {
    name: string;
    images?: SpotifyImage[];
  };
}

interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

interface SpotifyPlaylistDetails {
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
  private readonly logger = new Logger(FestivalPlaylistsService.name);

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
    private readonly mailService: MailService,
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
    connection.authorizedAt = new Date();
    connection.refreshTokenExpiresAt = this.addUtcMonths(
      connection.authorizedAt,
      SPOTIFY_REFRESH_TOKEN_LIFETIME_MONTHS,
    );
    connection.authorizationInvalidatedAt = null;
    connection.reauthorizationReminderSentAt = null;
    await this.connectionRepository.save(connection);

    return {
      connected: true,
      spotifyUserId: connection.spotifyUserId,
      displayName: connection.displayName,
      refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
    };
  }

  async getSpotifyConnection() {
    const connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    const grantedScopes = new Set(
      (connection?.scope ?? '').split(/\s+/).filter(Boolean),
    );
    const missingScopes = SPOTIFY_SCOPES.filter(
      (scope) => !grantedScopes.has(scope),
    );
    const authorization = this.getAuthorizationState(connection);
    return {
      connected:
        authorization.status === 'connected' ||
        authorization.status === 'expiring_soon',
      spotifyUserId: connection?.spotifyUserId ?? null,
      displayName: connection?.displayName ?? null,
      canUploadImages: !missingScopes.includes('ugc-image-upload'),
      missingScopes,
      authorizationStatus: authorization.status,
      reauthorizationRequired:
        authorization.status === 'reauthorization_required',
      reauthorizationReason: authorization.reason,
      authorizedAt: connection?.authorizedAt ?? null,
      refreshTokenExpiresAt: connection?.refreshTokenExpiresAt ?? null,
      daysUntilReauthorization: authorization.daysRemaining,
    };
  }

  @Cron('0 9 * * *', { timeZone: 'Europe/Madrid' })
  async checkSpotifyAuthorizationLifetime(): Promise<void> {
    const connection = await this.connectionRepository.findOne({
      where: { connectionKey: RIFF_VALLEY_CONNECTION_KEY },
    });
    if (
      !connection?.spotifyUserId ||
      !connection.refreshTokenExpiresAt ||
      connection.reauthorizationReminderSentAt
    ) {
      return;
    }

    const daysRemaining = this.daysUntil(connection.refreshTokenExpiresAt);
    if (daysRemaining > SPOTIFY_REAUTHORIZATION_WARNING_DAYS) return;

    try {
      const sent = await this.mailService.sendSpotifyReauthorizationReminder(
        connection.displayName,
        connection.refreshTokenExpiresAt,
        daysRemaining,
      );
      if (!sent) return;
      connection.reauthorizationReminderSentAt = new Date();
      await this.connectionRepository.save(connection);
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el aviso de reautorización de Spotify',
        error instanceof Error ? error.stack : String(error),
      );
    }
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
      protectedTrackUris: [],
      status: SpotifyStatus.IN_PROGRESS,
      type: SpotifyType.FESTIVAL,
      updateDate: new Date(),
    });
    await this.spotifyRepository.save(spotify);

    return this.getFestivalPlaylist(spotify.id);
  }

  async createGenrePlaylist(dto: CreateSyncedPlaylistDto) {
    const accessToken = await this.getValidAccessToken();
    const description =
      dto.description ??
      'Playlist de género seleccionada manualmente por Riff Valley';
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
      protectedTrackUris: [],
      status: SpotifyStatus.IN_PROGRESS,
      type: SpotifyType.GENERO,
      updateDate: new Date(),
    });
    await this.spotifyRepository.save(spotify);

    return this.getGenrePlaylist(spotify.id);
  }

  async linkExistingFestivalPlaylist(spotifyId: string) {
    const spotify = await this.spotifyRepository.findOne({
      where: { id: spotifyId },
      relations: ['user', 'playlistArtists', 'playlistArtists.artist'],
    });
    if (!spotify) throw new NotFoundException('Playlist not found');
    if (spotify.type !== SpotifyType.FESTIVAL) {
      throw new BadRequestException(
        'Sólo se pueden vincular playlists de tipo festival',
      );
    }

    const remotePlaylistId = this.spotifyPlaylistIdFromLink(spotify.link);
    if (spotify.spotifyPlaylistId) {
      if (spotify.spotifyPlaylistId === remotePlaylistId) return spotify;
      throw new ConflictException(
        'La playlist local ya está vinculada con otra playlist de Spotify',
      );
    }

    const duplicate = await this.spotifyRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate && duplicate.id !== spotify.id) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con otro registro local',
      );
    }

    const { remotePlaylist, protectedTrackUris } =
      await this.getOwnedSpotifyPlaylist(remotePlaylistId);
    await this.spotifyRepository.update(spotify.id, {
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(spotify.id);
  }

  async createLinkedFestivalPlaylist(dto: LinkSpotifyPlaylistDto) {
    const remotePlaylistId = this.spotifyPlaylistIdFromLink(dto.spotifyUrl);
    const duplicate = await this.spotifyRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con un registro local',
      );
    }

    const festivalPlaylists = await this.spotifyRepository.find({
      where: { type: SpotifyType.FESTIVAL },
    });
    const legacyMatches = festivalPlaylists.filter((playlist) => {
      if (playlist.spotifyPlaylistId || !playlist.link) return false;
      try {
        return (
          this.spotifyPlaylistIdFromLink(playlist.link) === remotePlaylistId
        );
      } catch {
        return false;
      }
    });
    if (legacyMatches.length > 1) {
      throw new ConflictException(
        'Hay varios registros locales con ese enlace; elige cuál quieres vincular',
      );
    }
    if (legacyMatches.length === 1) {
      return this.linkExistingFestivalPlaylist(legacyMatches[0].id);
    }

    const { remotePlaylist, protectedTrackUris } =
      await this.getOwnedSpotifyPlaylist(remotePlaylistId);
    const spotify = this.spotifyRepository.create({
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      status: SpotifyStatus.IN_PROGRESS,
      type: SpotifyType.FESTIVAL,
      updateDate: new Date(),
    });
    await this.spotifyRepository.save(spotify);
    return this.getFestivalPlaylist(spotify.id);
  }

  async linkExistingGenrePlaylist(spotifyId: string) {
    const spotify = await this.spotifyRepository.findOne({
      where: { id: spotifyId },
      relations: ['user', 'playlistArtists', 'playlistArtists.artist'],
    });
    if (!spotify) throw new NotFoundException('Playlist not found');
    this.assertGenrePlaylistType(spotify);

    const remotePlaylistId = this.spotifyPlaylistIdFromLink(spotify.link);
    if (spotify.spotifyPlaylistId) {
      if (spotify.spotifyPlaylistId === remotePlaylistId) return spotify;
      throw new ConflictException(
        'La playlist local ya está vinculada con otra playlist de Spotify',
      );
    }

    const duplicate = await this.spotifyRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate && duplicate.id !== spotify.id) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con otro registro local',
      );
    }

    const { remotePlaylist, protectedTrackUris } =
      await this.getOwnedSpotifyPlaylist(remotePlaylistId);
    await this.spotifyRepository.update(spotify.id, {
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      updateDate: new Date(),
    });
    return this.getGenrePlaylist(spotify.id);
  }

  async createLinkedGenrePlaylist(dto: LinkSpotifyPlaylistDto) {
    const remotePlaylistId = this.spotifyPlaylistIdFromLink(dto.spotifyUrl);
    const duplicate = await this.spotifyRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con un registro local',
      );
    }

    const genrePlaylists = await this.spotifyRepository.find({
      where: [
        { type: SpotifyType.GENERO },
        { type: SpotifyType.ESPECIAL },
        { type: SpotifyType.OTRAS },
      ],
    });
    const legacyMatches = genrePlaylists.filter((playlist) => {
      if (playlist.spotifyPlaylistId || !playlist.link) return false;
      try {
        return (
          this.spotifyPlaylistIdFromLink(playlist.link) === remotePlaylistId
        );
      } catch {
        return false;
      }
    });
    if (legacyMatches.length > 1) {
      throw new ConflictException(
        'Hay varios registros locales con ese enlace; elige cuál quieres vincular',
      );
    }
    if (legacyMatches.length === 1) {
      return this.linkExistingGenrePlaylist(legacyMatches[0].id);
    }

    const { remotePlaylist, protectedTrackUris } =
      await this.getOwnedSpotifyPlaylist(remotePlaylistId);
    const spotify = this.spotifyRepository.create({
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      status: SpotifyStatus.IN_PROGRESS,
      type: SpotifyType.GENERO,
      updateDate: new Date(),
    });
    await this.spotifyRepository.save(spotify);
    return this.getGenrePlaylist(spotify.id);
  }

  async updateFestivalPlaylist(
    spotifyId: string,
    dto: UpdateSyncedPlaylistDto,
  ) {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.public === undefined
    ) {
      throw new BadRequestException(
        'Indica al menos un campo para actualizar la playlist',
      );
    }

    const spotify = await this.getFestivalPlaylist(spotifyId);
    const accessToken = await this.getValidAccessToken();
    await this.spotifyRequest(
      `/playlists/${spotify.spotifyPlaylistId}`,
      accessToken,
      {
        method: 'PUT',
        body: JSON.stringify({
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.public !== undefined ? { public: dto.public } : {}),
        }),
      },
    );

    await this.spotifyRepository.update(spotify.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.public !== undefined ? { isPublic: dto.public } : {}),
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(spotifyId);
  }

  async updateGenrePlaylist(spotifyId: string, dto: UpdateSyncedPlaylistDto) {
    await this.getGenrePlaylist(spotifyId);
    return this.updateFestivalPlaylist(spotifyId, dto);
  }

  async updateFestivalPlaylistImage(spotifyId: string, image: Buffer) {
    if (
      image.length < 3 ||
      image[0] !== 0xff ||
      image[1] !== 0xd8 ||
      image[2] !== 0xff
    ) {
      throw new BadRequestException('La portada no contiene un JPEG válido');
    }

    const encodedImage = image.toString('base64');
    if (Buffer.byteLength(encodedImage, 'utf8') > 256 * 1024) {
      throw new BadRequestException(
        'La portada codificada no puede superar los 256 KB',
      );
    }

    const spotify = await this.getFestivalPlaylist(spotifyId);
    const accessToken = await this.getValidAccessToken(['ugc-image-upload']);
    await this.spotifyRequest(
      `/playlists/${spotify.spotifyPlaylistId}/images`,
      accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: encodedImage,
      },
    );
    const images = await this.spotifyRequest<SpotifyImage[]>(
      `/playlists/${spotify.spotifyPlaylistId}/images`,
      accessToken,
    );
    await this.spotifyRepository.update(spotify.id, {
      imageUrl: images[0]?.url ?? spotify.imageUrl,
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(spotifyId);
  }

  async updateGenrePlaylistImage(spotifyId: string, image: Buffer) {
    await this.getGenrePlaylist(spotifyId);
    return this.updateFestivalPlaylistImage(spotifyId, image);
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

  async getGenrePlaylist(spotifyId: string) {
    const spotify = await this.getFestivalPlaylist(spotifyId);
    this.assertGenrePlaylistType(spotify);
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
        selectionMode: PlaylistArtistSelectionMode.SETLIST,
        spotifyArtistId: null,
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
      const remoteUris = await this.getSpotifyPlaylistTrackUris(
        accessToken,
        spotify.spotifyPlaylistId,
      );
      const existingUris = new Set([
        ...remoteUris,
        ...allAssociations
          .flatMap((item) => item.tracks ?? [])
          .map((track) => track.uri),
      ]);
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

  async searchGenreArtistTracks(
    spotifyId: string,
    artistId: string,
    query?: string,
  ) {
    await this.getGenrePlaylist(spotifyId);
    const artist = await this.artistRepository.findOneBy({ id: artistId });
    if (!artist) throw new NotFoundException('Artist not found');

    const accessToken = await this.getValidAccessToken();
    const search = query?.trim()
      ? `track:${query.trim()} artist:${artist.name}`
      : `artist:${artist.name}`;
    const params = new URLSearchParams({
      q: search,
      type: 'track',
      limit: '20',
    });
    const data = await this.spotifyRequest<{
      tracks?: { items?: SpotifyTrack[] };
    }>(`/search?${params}`, accessToken);

    return {
      artist: { id: artist.id, name: artist.name },
      query: query?.trim() ?? '',
      tracks: (data.tracks?.items ?? []).map((track) =>
        this.toPlaylistTrackRecord(track),
      ),
    };
  }

  async addGenreArtist(
    spotifyId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    const existing = await this.playlistArtistRepository.findOne({
      where: { spotifyId, artistId },
    });
    if (existing) {
      throw new ConflictException(
        'El artista ya está asociado; utiliza la edición para cambiar sus canciones',
      );
    }
    return this.saveGenreArtistTracks(spotifyId, artistId, spotifyTrackIds);
  }

  async replaceGenreArtistTracks(
    spotifyId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    const existing = await this.playlistArtistRepository.findOne({
      where: { spotifyId, artistId },
    });
    if (!existing) {
      throw new NotFoundException('Artist is not in this playlist');
    }
    return this.saveGenreArtistTracks(
      spotifyId,
      artistId,
      spotifyTrackIds,
      existing,
    );
  }

  async removeGenreArtist(spotifyId: string, artistId: string) {
    await this.getGenrePlaylist(spotifyId);
    return this.removeArtist(spotifyId, artistId);
  }

  async clearGenrePlaylist(spotifyId: string) {
    await this.getGenrePlaylist(spotifyId);
    return this.clearFestivalPlaylist(spotifyId);
  }

  async shuffleGenrePlaylist(spotifyId: string) {
    const spotify = await this.getGenrePlaylist(spotifyId);
    const accessToken = await this.getValidAccessToken();
    const originalUris = await this.getSpotifyPlaylistTrackUrisInOrder(
      accessToken,
      spotify.spotifyPlaylistId,
    );
    if (originalUris.length < 2) {
      throw new BadRequestException(
        'La playlist necesita al menos dos canciones para mezclar el orden',
      );
    }

    const shuffledUris = this.shuffleTrackUris(originalUris);
    try {
      await this.replaceSpotifyPlaylistTrackUris(
        accessToken,
        spotify.spotifyPlaylistId,
        shuffledUris,
      );
    } catch (error) {
      try {
        await this.replaceSpotifyPlaylistTrackUris(
          accessToken,
          spotify.spotifyPlaylistId,
          originalUris,
        );
      } catch (rollbackError) {
        this.logger.error(
          `No se pudo restaurar el orden de la playlist ${spotify.spotifyPlaylistId}: ${this.errorMessage(rollbackError)}`,
        );
      }
      throw error;
    }

    await this.spotifyRepository.update(spotify.id, {
      updateDate: new Date(),
    });
    return this.getGenrePlaylist(spotifyId);
  }

  private async saveGenreArtistTracks(
    spotifyId: string,
    artistId: string,
    spotifyTrackIds: string[],
    current?: SpotifyPlaylistArtist,
  ) {
    const [spotify, artist] = await Promise.all([
      this.getGenrePlaylist(spotifyId),
      this.artistRepository.findOneBy({ id: artistId }),
    ]);
    if (!artist) throw new NotFoundException('Artist not found');
    if (spotifyTrackIds.length !== 2 || new Set(spotifyTrackIds).size !== 2) {
      throw new BadRequestException(
        'Debes seleccionar exactamente dos canciones distintas',
      );
    }

    let association = current;
    if (!association) {
      association = this.playlistArtistRepository.create({
        spotifyId,
        artistId,
        artist,
        status: PlaylistArtistSyncStatus.SYNCING,
        selectionMode: PlaylistArtistSelectionMode.MANUAL,
        spotifyArtistId: null,
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
      const params = new URLSearchParams({ ids: spotifyTrackIds.join(',') });
      const response = await this.spotifyRequest<{
        tracks?: Array<SpotifyTrack | null>;
      }>(`/tracks?${params}`, accessToken);
      const fetchedTracks = (response.tracks ?? []).filter(
        (track): track is SpotifyTrack => Boolean(track),
      );
      const tracksById = new Map(
        fetchedTracks.map((track) => [track.id, track]),
      );
      const selectedTracks = spotifyTrackIds.map((id) => tracksById.get(id));
      if (selectedTracks.some((track) => !track)) {
        throw new NotFoundException(
          'Una de las canciones seleccionadas ya no está disponible en Spotify',
        );
      }
      const tracks = (selectedTracks as SpotifyTrack[]).map((track) =>
        this.toPlaylistTrackRecord(track),
      );

      const allAssociations = await this.playlistArtistRepository.find({
        where: { spotifyId },
      });
      const otherAssociations = allAssociations.filter(
        (item) => item.id !== association.id,
      );
      const sharedUris = new Set(
        otherAssociations
          .flatMap((item) => item.tracks ?? [])
          .map((track) => track.uri),
      );
      const remoteUris = await this.getSpotifyPlaylistTrackUris(
        accessToken,
        spotify.spotifyPlaylistId,
      );
      const remoteUriSet = new Set(remoteUris);
      const newUris = new Set(tracks.map((track) => track.uri));
      const urisToAdd = [...newUris].filter((uri) => !remoteUriSet.has(uri));
      const urisToRemove = [
        ...new Set((association.tracks ?? []).map((track) => track.uri)),
      ].filter(
        (uri) =>
          !newUris.has(uri) &&
          !sharedUris.has(uri) &&
          !(spotify.protectedTrackUris ?? []).includes(uri),
      );

      if (urisToAdd.length) {
        await this.spotifyRequest(
          `/playlists/${spotify.spotifyPlaylistId}/items`,
          accessToken,
          {
            method: 'POST',
            body: JSON.stringify({ uris: urisToAdd }),
          },
        );
      }
      if (urisToRemove.length) {
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

      const normalizedArtist = this.normalize(artist.name);
      const spotifyArtist = (selectedTracks as SpotifyTrack[])
        .flatMap((track) => track.artists)
        .find((item) => this.normalize(item.name) === normalizedArtist);
      association.tracks = tracks;
      association.selectionMode = PlaylistArtistSelectionMode.MANUAL;
      association.spotifyArtistId =
        spotifyArtist?.id ?? association.spotifyArtistId ?? null;
      association.setlistsAnalyzed = 0;
      association.status = PlaylistArtistSyncStatus.SYNCED;
      association.lastError = null;
      await this.playlistArtistRepository.save(association);
      await this.spotifyRepository.update(spotify.id, {
        updateDate: new Date(),
      });
      return this.getGenrePlaylist(spotifyId);
    } catch (error) {
      association.status = PlaylistArtistSyncStatus.FAILED;
      association.lastError = this.errorMessage(error);
      await this.playlistArtistRepository.save(association);
      throw error;
    }
  }

  async clearFestivalPlaylist(spotifyId: string) {
    const spotify = await this.getFestivalPlaylist(spotifyId);
    const accessToken = await this.getValidAccessToken();
    const remoteUris = await this.getSpotifyPlaylistTrackUris(
      accessToken,
      spotify.spotifyPlaylistId,
    );

    for (let index = 0; index < remoteUris.length; index += 100) {
      const batch = remoteUris.slice(index, index + 100);
      await this.spotifyRequest(
        `/playlists/${spotify.spotifyPlaylistId}/items`,
        accessToken,
        {
          method: 'DELETE',
          body: JSON.stringify({
            items: batch.map((uri) => ({ uri })),
          }),
        },
      );
    }

    await this.playlistArtistRepository.delete({ spotifyId });
    await this.spotifyRepository.update(spotify.id, {
      protectedTrackUris: [],
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(spotifyId);
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
      ].filter(
        (uri) =>
          !sharedUris.has(uri) &&
          !(spotify.protectedTrackUris ?? []).includes(uri),
      );
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

  private toPlaylistTrackRecord(track: SpotifyTrack): PlaylistTrackRecord {
    return {
      spotifyTrackId: track.id,
      uri: track.uri,
      name: track.name,
      url: track.external_urls.spotify,
      plays: 0,
      artists: track.artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
      })),
      album: track.album?.name,
      imageUrl: track.album?.images?.[0]?.url ?? null,
      durationMs: track.duration_ms,
    };
  }

  private assertGenrePlaylistType(spotify: Spotify): void {
    if (
      ![SpotifyType.GENERO, SpotifyType.ESPECIAL, SpotifyType.OTRAS].includes(
        spotify.type,
      )
    ) {
      throw new BadRequestException(
        'La playlist no pertenece a la sección de géneros',
      );
    }
  }

  private spotifyPlaylistIdFromLink(link: string): string {
    const uriMatch = link?.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
    if (uriMatch) return uriMatch[1];

    try {
      const url = new URL(link);
      const parts = url.pathname.split('/').filter(Boolean);
      const playlistIndex = parts.indexOf('playlist');
      const id = playlistIndex >= 0 ? parts[playlistIndex + 1] : undefined;
      if (id && /^[A-Za-z0-9]+$/.test(id)) return id;
    } catch {
      // El mensaje común de validación se lanza debajo.
    }
    throw new BadRequestException(
      'El enlace guardado no contiene una playlist válida de Spotify',
    );
  }

  private async getOwnedSpotifyPlaylist(spotifyPlaylistId: string): Promise<{
    remotePlaylist: SpotifyPlaylistDetails;
    protectedTrackUris: string[];
  }> {
    const accessToken = await this.getValidAccessToken();
    const [remotePlaylist, profile] = await Promise.all([
      this.spotifyRequest<SpotifyPlaylistDetails>(
        `/playlists/${spotifyPlaylistId}`,
        accessToken,
      ),
      this.spotifyRequest<SpotifyProfile>('/me', accessToken),
    ]);
    if (remotePlaylist.owner.id !== profile.id) {
      throw new ForbiddenException(
        `La playlist pertenece a ${remotePlaylist.owner.display_name ?? remotePlaylist.owner.id}; debe pertenecer a la cuenta conectada`,
      );
    }
    const protectedTrackUris = await this.getSpotifyPlaylistTrackUris(
      accessToken,
      remotePlaylist.id,
    );
    return { remotePlaylist, protectedTrackUris };
  }

  private async getSpotifyPlaylistTrackUris(
    accessToken: string,
    spotifyPlaylistId: string,
  ): Promise<string[]> {
    const uris = new Set<string>();
    let offset = 0;

    while (true) {
      const page = await this.spotifyRequest<SpotifyPlaylistItemsPage>(
        `/playlists/${spotifyPlaylistId}/items?limit=50&offset=${offset}`,
        accessToken,
      );
      const items = page.items ?? [];
      for (const entry of items) {
        const uri = entry.item?.uri ?? entry.track?.uri;
        if (uri) uris.add(uri);
      }
      if (!page.next || !items.length) break;
      offset += items.length;
    }

    return [...uris];
  }

  private async getSpotifyPlaylistTrackUrisInOrder(
    accessToken: string,
    spotifyPlaylistId: string,
  ): Promise<string[]> {
    const uris: string[] = [];
    let offset = 0;

    while (true) {
      const page = await this.spotifyRequest<SpotifyPlaylistItemsPage>(
        `/playlists/${spotifyPlaylistId}/items?limit=50&offset=${offset}`,
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

    return uris;
  }

  private shuffleTrackUris(originalUris: string[]): string[] {
    const shuffledUris = [...originalUris];
    for (let index = shuffledUris.length - 1; index > 0; index -= 1) {
      const randomIndex = randomInt(index + 1);
      [shuffledUris[index], shuffledUris[randomIndex]] = [
        shuffledUris[randomIndex],
        shuffledUris[index],
      ];
    }

    if (shuffledUris.every((uri, index) => uri === originalUris[index])) {
      shuffledUris.push(shuffledUris.shift()!);
    }
    return shuffledUris;
  }

  private async replaceSpotifyPlaylistTrackUris(
    accessToken: string,
    spotifyPlaylistId: string,
    uris: string[],
  ): Promise<void> {
    await this.spotifyRequest(
      `/playlists/${spotifyPlaylistId}/items`,
      accessToken,
      {
        method: 'PUT',
        body: JSON.stringify({ uris: uris.slice(0, 100) }),
      },
    );

    for (let index = 100; index < uris.length; index += 100) {
      await this.spotifyRequest(
        `/playlists/${spotifyPlaylistId}/items`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ uris: uris.slice(index, index + 100) }),
        },
      );
    }
  }

  private async getValidAccessToken(
    requiredScopes: string[] = [],
  ): Promise<string> {
    const connection = await this.connectionRepository
      .createQueryBuilder('connection')
      .addSelect(['connection.accessToken', 'connection.refreshToken'])
      .where('connection.connectionKey = :connectionKey', {
        connectionKey: RIFF_VALLEY_CONNECTION_KEY,
      })
      .getOne();

    if (connection) {
      const authorization = this.getAuthorizationState(connection);
      if (authorization.status === 'reauthorization_required') {
        throw new UnauthorizedException(
          authorization.reason === 'refresh_token_invalid'
            ? 'Spotify ha invalidado la autorización. Vuelve a autorizar la cuenta'
            : 'La autorización de Spotify ha caducado. Vuelve a autorizar la cuenta',
        );
      }
    }

    if (
      !connection?.accessToken ||
      !connection.refreshToken ||
      !connection.expiresAt
    ) {
      throw new UnauthorizedException(
        'El usuario no ha conectado su cuenta de Spotify',
      );
    }

    const grantedScopes = new Set(
      (connection.scope ?? '').split(/\s+/).filter(Boolean),
    );
    const missingScopes = requiredScopes.filter(
      (scope) => !grantedScopes.has(scope),
    );
    if (missingScopes.length) {
      throw new UnauthorizedException(
        `Faltan permisos de Spotify (${missingScopes.join(', ')}). Reconecta la cuenta`,
      );
    }

    if (connection.expiresAt.getTime() > Date.now() + 60_000) {
      return this.tokenCrypto.decrypt(connection.accessToken);
    }

    let refreshed: SpotifyTokenResponse;
    try {
      refreshed = await this.refreshAccessToken(
        this.tokenCrypto.decrypt(connection.refreshToken),
      );
    } catch (error) {
      if (!(error instanceof SpotifyInvalidGrantError)) throw error;
      connection.accessToken = null;
      connection.refreshToken = null;
      connection.expiresAt = null;
      connection.authorizationInvalidatedAt = new Date();
      await this.connectionRepository.save(connection);
      throw new UnauthorizedException(
        'Spotify ha invalidado la autorización. Vuelve a autorizar la cuenta',
      );
    }
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
    const responseBody = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    } & Partial<SpotifyTokenResponse>;
    if (!response.ok) {
      if (responseBody.error === 'invalid_grant') {
        throw new SpotifyInvalidGrantError(
          responseBody.error_description || 'Spotify invalid_grant',
        );
      }
      throw new BadGatewayException(
        `Spotify OAuth respondió con ${response.status}`,
      );
    }
    return responseBody as SpotifyTokenResponse;
  }

  private getAuthorizationState(connection: SpotifyConnection | null): {
    status:
      | 'disconnected'
      | 'connected'
      | 'expiring_soon'
      | 'reauthorization_required';
    reason: 'refresh_token_expired' | 'refresh_token_invalid' | null;
    daysRemaining: number | null;
  } {
    if (!connection?.spotifyUserId || !connection.expiresAt) {
      if (connection?.authorizationInvalidatedAt) {
        return {
          status: 'reauthorization_required',
          reason: 'refresh_token_invalid',
          daysRemaining: null,
        };
      }
      return { status: 'disconnected', reason: null, daysRemaining: null };
    }

    if (connection.authorizationInvalidatedAt) {
      return {
        status: 'reauthorization_required',
        reason: 'refresh_token_invalid',
        daysRemaining: null,
      };
    }

    const daysRemaining = connection.refreshTokenExpiresAt
      ? this.daysUntil(connection.refreshTokenExpiresAt)
      : null;
    if (daysRemaining !== null && daysRemaining <= 0) {
      return {
        status: 'reauthorization_required',
        reason: 'refresh_token_expired',
        daysRemaining,
      };
    }
    if (
      daysRemaining !== null &&
      daysRemaining <= SPOTIFY_REAUTHORIZATION_WARNING_DAYS
    ) {
      return { status: 'expiring_soon', reason: null, daysRemaining };
    }
    return { status: 'connected', reason: null, daysRemaining };
  }

  private daysUntil(date: Date): number {
    return Math.max(
      0,
      Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
  }

  private addUtcMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const originalDay = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDayOfTargetMonth = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
    return result;
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
    const responseBody = await response.text();
    if (!responseBody) return undefined as T;
    return JSON.parse(responseBody) as T;
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
