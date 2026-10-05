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
import {
  SpotifyInvalidGrantError,
  SpotifyOAuthApiService,
  SpotifyAccountApiService,
  SpotifyConnection,
  SpotifyPlaylistDetails,
  TokenCryptoService,
} from 'src/spotify-integration';
import type {
  SpotifyOAuthTokenResponse,
  SpotifyTrack,
} from 'src/spotify-integration';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import {
  PlaylistArtistSelectionMode,
  PlaylistArtistSyncStatus,
  PlaylistTrackRecord,
  RiffValleyPlaylistArtist,
} from './entities/riff-valley-playlist-artist.entity';
import { MailService } from 'src/mail/mail.service';

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
    @InjectRepository(RiffValleyPlaylist)
    private readonly riffValleyPlaylistRepository: Repository<RiffValleyPlaylist>,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(RiffValleyPlaylistArtist)
    private readonly playlistArtistRepository: Repository<RiffValleyPlaylistArtist>,
    private readonly configService: ConfigService,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly mailService: MailService,
    private readonly spotifyOAuthApi: SpotifyOAuthApiService,
    private readonly spotifyAccountApi: SpotifyAccountApiService,
  ) {}

  async startSpotifyConnection() {
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

    return {
      authorizationUrl: this.spotifyOAuthApi.getAuthorizationUrl(
        SPOTIFY_SCOPES,
        state,
      ),
    };
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

    const token = await this.spotifyOAuthApi.exchangeAuthorizationCode(code);
    const profile = await this.spotifyAccountApi.getProfile(token.access_token);

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
    const playlist = await this.spotifyAccountApi.createPlaylist(accessToken, {
      name: dto.name,
      description,
      public: dto.public,
    });

    const riffValleyPlaylist = this.riffValleyPlaylistRepository.create({
      name: playlist.name,
      link: playlist.external_urls.spotify,
      spotifyPlaylistId: playlist.id,
      description,
      isPublic: dto.public,
      protectedTrackUris: [],
      status: RiffValleyPlaylistStatus.IN_PROGRESS,
      type: RiffValleyPlaylistType.FESTIVAL,
      updateDate: new Date(),
    });
    await this.riffValleyPlaylistRepository.save(riffValleyPlaylist);

    return this.getFestivalPlaylist(riffValleyPlaylist.id);
  }

  async createGenrePlaylist(dto: CreateSyncedPlaylistDto) {
    const accessToken = await this.getValidAccessToken();
    const description =
      dto.description ??
      'Playlist de género seleccionada manualmente por Riff Valley';
    const playlist = await this.spotifyAccountApi.createPlaylist(accessToken, {
      name: dto.name,
      description,
      public: dto.public,
    });

    const riffValleyPlaylist = this.riffValleyPlaylistRepository.create({
      name: playlist.name,
      link: playlist.external_urls.spotify,
      spotifyPlaylistId: playlist.id,
      description,
      isPublic: dto.public,
      protectedTrackUris: [],
      status: RiffValleyPlaylistStatus.IN_PROGRESS,
      type: RiffValleyPlaylistType.GENERO,
      updateDate: new Date(),
    });
    await this.riffValleyPlaylistRepository.save(riffValleyPlaylist);

    return this.getGenrePlaylist(riffValleyPlaylist.id);
  }

  async linkExistingFestivalPlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist = await this.riffValleyPlaylistRepository.findOne({
      where: { id: riffValleyPlaylistId },
      relations: ['user', 'playlistArtists', 'playlistArtists.artist'],
    });
    if (!riffValleyPlaylist) throw new NotFoundException('Playlist not found');
    if (riffValleyPlaylist.type !== RiffValleyPlaylistType.FESTIVAL) {
      throw new BadRequestException(
        'Sólo se pueden vincular playlists de tipo festival',
      );
    }

    const remotePlaylistId = this.spotifyPlaylistIdFromLink(
      riffValleyPlaylist.link,
    );
    if (riffValleyPlaylist.spotifyPlaylistId) {
      if (riffValleyPlaylist.spotifyPlaylistId === remotePlaylistId)
        return riffValleyPlaylist;
      throw new ConflictException(
        'La playlist local ya está vinculada con otra playlist de Spotify',
      );
    }

    const duplicate = await this.riffValleyPlaylistRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate && duplicate.id !== riffValleyPlaylist.id) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con otro registro local',
      );
    }

    const { remotePlaylist, protectedTrackUris } =
      await this.getOwnedSpotifyPlaylist(remotePlaylistId);
    await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(riffValleyPlaylist.id);
  }

  async createLinkedFestivalPlaylist(dto: LinkSpotifyPlaylistDto) {
    const remotePlaylistId = this.spotifyPlaylistIdFromLink(dto.spotifyUrl);
    const duplicate = await this.riffValleyPlaylistRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con un registro local',
      );
    }

    const festivalPlaylists = await this.riffValleyPlaylistRepository.find({
      where: { type: RiffValleyPlaylistType.FESTIVAL },
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
    const riffValleyPlaylist = this.riffValleyPlaylistRepository.create({
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      status: RiffValleyPlaylistStatus.IN_PROGRESS,
      type: RiffValleyPlaylistType.FESTIVAL,
      updateDate: new Date(),
    });
    await this.riffValleyPlaylistRepository.save(riffValleyPlaylist);
    return this.getFestivalPlaylist(riffValleyPlaylist.id);
  }

  async linkExistingGenrePlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist = await this.riffValleyPlaylistRepository.findOne({
      where: { id: riffValleyPlaylistId },
      relations: ['user', 'playlistArtists', 'playlistArtists.artist'],
    });
    if (!riffValleyPlaylist) throw new NotFoundException('Playlist not found');
    this.assertGenrePlaylistType(riffValleyPlaylist);

    const remotePlaylistId = this.spotifyPlaylistIdFromLink(
      riffValleyPlaylist.link,
    );
    if (riffValleyPlaylist.spotifyPlaylistId) {
      if (riffValleyPlaylist.spotifyPlaylistId === remotePlaylistId)
        return riffValleyPlaylist;
      throw new ConflictException(
        'La playlist local ya está vinculada con otra playlist de Spotify',
      );
    }

    const duplicate = await this.riffValleyPlaylistRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate && duplicate.id !== riffValleyPlaylist.id) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con otro registro local',
      );
    }

    const { remotePlaylist, protectedTrackUris } =
      await this.getOwnedSpotifyPlaylist(remotePlaylistId);
    await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      updateDate: new Date(),
    });
    return this.getGenrePlaylist(riffValleyPlaylist.id);
  }

  async createLinkedGenrePlaylist(dto: LinkSpotifyPlaylistDto) {
    const remotePlaylistId = this.spotifyPlaylistIdFromLink(dto.spotifyUrl);
    const duplicate = await this.riffValleyPlaylistRepository.findOne({
      where: { spotifyPlaylistId: remotePlaylistId },
    });
    if (duplicate) {
      throw new ConflictException(
        'Esa playlist de Spotify ya está vinculada con un registro local',
      );
    }

    const genrePlaylists = await this.riffValleyPlaylistRepository.find({
      where: [
        { type: RiffValleyPlaylistType.GENERO },
        { type: RiffValleyPlaylistType.ESPECIAL },
        { type: RiffValleyPlaylistType.OTRAS },
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
    const riffValleyPlaylist = this.riffValleyPlaylistRepository.create({
      name: remotePlaylist.name,
      link: remotePlaylist.external_urls.spotify,
      spotifyPlaylistId: remotePlaylist.id,
      description: remotePlaylist.description ?? null,
      isPublic: Boolean(remotePlaylist.public),
      imageUrl: remotePlaylist.images?.[0]?.url ?? null,
      protectedTrackUris,
      status: RiffValleyPlaylistStatus.IN_PROGRESS,
      type: RiffValleyPlaylistType.GENERO,
      updateDate: new Date(),
    });
    await this.riffValleyPlaylistRepository.save(riffValleyPlaylist);
    return this.getGenrePlaylist(riffValleyPlaylist.id);
  }

  async updateFestivalPlaylist(
    riffValleyPlaylistId: string,
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

    const riffValleyPlaylist =
      await this.getFestivalPlaylist(riffValleyPlaylistId);
    const accessToken = await this.getValidAccessToken();
    await this.spotifyAccountApi.updatePlaylist(
      accessToken,
      riffValleyPlaylist.spotifyPlaylistId,
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.public !== undefined ? { public: dto.public } : {}),
      },
    );

    await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.public !== undefined ? { isPublic: dto.public } : {}),
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(riffValleyPlaylistId);
  }

  async updateGenrePlaylist(
    riffValleyPlaylistId: string,
    dto: UpdateSyncedPlaylistDto,
  ) {
    await this.getGenrePlaylist(riffValleyPlaylistId);
    return this.updateFestivalPlaylist(riffValleyPlaylistId, dto);
  }

  async updateFestivalPlaylistImage(
    riffValleyPlaylistId: string,
    image: Buffer,
  ) {
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

    const riffValleyPlaylist =
      await this.getFestivalPlaylist(riffValleyPlaylistId);
    const accessToken = await this.getValidAccessToken(['ugc-image-upload']);
    await this.spotifyAccountApi.uploadPlaylistImage(
      accessToken,
      riffValleyPlaylist.spotifyPlaylistId,
      encodedImage,
    );
    const images = await this.spotifyAccountApi.getPlaylistImages(
      accessToken,
      riffValleyPlaylist.spotifyPlaylistId,
    );
    await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
      imageUrl: images[0]?.url ?? riffValleyPlaylist.imageUrl,
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(riffValleyPlaylistId);
  }

  async updateGenrePlaylistImage(riffValleyPlaylistId: string, image: Buffer) {
    await this.getGenrePlaylist(riffValleyPlaylistId);
    return this.updateFestivalPlaylistImage(riffValleyPlaylistId, image);
  }

  async getFestivalPlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist = await this.riffValleyPlaylistRepository.findOne({
      where: { id: riffValleyPlaylistId },
      relations: ['user', 'playlistArtists', 'playlistArtists.artist'],
    });
    if (!riffValleyPlaylist) throw new NotFoundException('Playlist not found');
    if (!riffValleyPlaylist.spotifyPlaylistId) {
      throw new BadRequestException(
        'La playlist no está vinculada con Spotify',
      );
    }
    return riffValleyPlaylist;
  }

  async getGenrePlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist =
      await this.getFestivalPlaylist(riffValleyPlaylistId);
    this.assertGenrePlaylistType(riffValleyPlaylist);
    return riffValleyPlaylist;
  }

  async addArtist(riffValleyPlaylistId: string, dto: SyncPlaylistArtistDto) {
    const [riffValleyPlaylist, artist] = await Promise.all([
      this.getFestivalPlaylist(riffValleyPlaylistId),
      this.artistRepository.findOneBy({ id: dto.artistId }),
    ]);
    if (!artist) throw new NotFoundException('Artist not found');

    let association = await this.playlistArtistRepository.findOne({
      where: { riffValleyPlaylistId, artistId: artist.id },
    });
    if (association?.status === PlaylistArtistSyncStatus.SYNCED) {
      throw new ConflictException(
        'El artista ya está sincronizado en la playlist',
      );
    }
    if (!association) {
      association = this.playlistArtistRepository.create({
        riffValleyPlaylistId,
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
        where: { riffValleyPlaylistId },
      });
      const remoteUris = await this.getSpotifyPlaylistTrackUris(
        accessToken,
        riffValleyPlaylist.spotifyPlaylistId,
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
        await this.spotifyAccountApi.addPlaylistItems(
          accessToken,
          riffValleyPlaylist.spotifyPlaylistId,
          urisToAdd,
        );
      }

      association.tracks = tracks;
      association.setlistsAnalyzed = top.setlistsAnalyzed;
      association.status = PlaylistArtistSyncStatus.SYNCED;
      association.lastError = null;
      await this.playlistArtistRepository.save(association);
      await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
        updateDate: new Date(),
      });
      return this.getFestivalPlaylist(riffValleyPlaylistId);
    } catch (error) {
      association.status = PlaylistArtistSyncStatus.FAILED;
      association.lastError = this.errorMessage(error);
      await this.playlistArtistRepository.save(association);
      throw error;
    }
  }

  async searchGenreArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    query?: string,
  ) {
    await this.getGenrePlaylist(riffValleyPlaylistId);
    return this.searchArtistTracks(artistId, query);
  }

  async searchFestivalArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    query?: string,
  ) {
    await this.getFestivalPlaylist(riffValleyPlaylistId);
    const association = await this.playlistArtistRepository.findOne({
      where: { riffValleyPlaylistId, artistId },
    });
    if (!association) {
      throw new NotFoundException('Artist is not in this playlist');
    }
    if (association.status !== PlaylistArtistSyncStatus.FAILED) {
      throw new BadRequestException(
        'Solo se pueden elegir canciones manualmente para artistas con error',
      );
    }
    return this.searchArtistTracks(artistId, query);
  }

  private async searchArtistTracks(artistId: string, query?: string) {
    const artist = await this.artistRepository.findOneBy({ id: artistId });
    if (!artist) throw new NotFoundException('Artist not found');

    const accessToken = await this.getValidAccessToken();
    const search = query?.trim()
      ? `track:${query.trim()} artist:${artist.name}`
      : `artist:${artist.name}`;
    const tracks = await this.spotifyAccountApi.searchTracks(
      accessToken,
      search,
      20,
    );

    return {
      artist: { id: artist.id, name: artist.name },
      query: query?.trim() ?? '',
      tracks: tracks.map((track) => this.toPlaylistTrackRecord(track)),
    };
  }

  async addGenreArtist(
    riffValleyPlaylistId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    const existing = await this.playlistArtistRepository.findOne({
      where: { riffValleyPlaylistId, artistId },
    });
    if (existing) {
      throw new ConflictException(
        'El artista ya está asociado; utiliza la edición para cambiar sus canciones',
      );
    }
    return this.saveManualArtistTracks(
      riffValleyPlaylistId,
      artistId,
      spotifyTrackIds,
      'genre',
    );
  }

  async replaceGenreArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    const existing = await this.playlistArtistRepository.findOne({
      where: { riffValleyPlaylistId, artistId },
    });
    if (!existing) {
      throw new NotFoundException('Artist is not in this playlist');
    }
    return this.saveManualArtistTracks(
      riffValleyPlaylistId,
      artistId,
      spotifyTrackIds,
      'genre',
      existing,
    );
  }

  async replaceFailedFestivalArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    const existing = await this.playlistArtistRepository.findOne({
      where: { riffValleyPlaylistId, artistId },
    });
    if (!existing) {
      throw new NotFoundException('Artist is not in this playlist');
    }
    if (existing.status !== PlaylistArtistSyncStatus.FAILED) {
      throw new BadRequestException(
        'Solo se pueden elegir canciones manualmente para artistas con error',
      );
    }
    return this.saveManualArtistTracks(
      riffValleyPlaylistId,
      artistId,
      spotifyTrackIds,
      'festival',
      existing,
    );
  }

  async removeGenreArtist(riffValleyPlaylistId: string, artistId: string) {
    await this.getGenrePlaylist(riffValleyPlaylistId);
    return this.removeArtist(riffValleyPlaylistId, artistId);
  }

  async clearGenrePlaylist(riffValleyPlaylistId: string) {
    await this.getGenrePlaylist(riffValleyPlaylistId);
    return this.clearFestivalPlaylist(riffValleyPlaylistId);
  }

  async shuffleGenrePlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist =
      await this.getGenrePlaylist(riffValleyPlaylistId);
    const accessToken = await this.getValidAccessToken();
    const originalUris = await this.getSpotifyPlaylistTrackUrisInOrder(
      accessToken,
      riffValleyPlaylist.spotifyPlaylistId,
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
        riffValleyPlaylist.spotifyPlaylistId,
        shuffledUris,
      );
    } catch (error) {
      try {
        await this.replaceSpotifyPlaylistTrackUris(
          accessToken,
          riffValleyPlaylist.spotifyPlaylistId,
          originalUris,
        );
      } catch (rollbackError) {
        this.logger.error(
          `No se pudo restaurar el orden de la playlist ${riffValleyPlaylist.spotifyPlaylistId}: ${this.errorMessage(rollbackError)}`,
        );
      }
      throw error;
    }

    await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
      updateDate: new Date(),
    });
    return this.getGenrePlaylist(riffValleyPlaylistId);
  }

  private async saveManualArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    spotifyTrackIds: string[],
    playlistType: 'festival' | 'genre',
    current?: RiffValleyPlaylistArtist,
  ) {
    const [riffValleyPlaylist, artist] = await Promise.all([
      playlistType === 'genre'
        ? this.getGenrePlaylist(riffValleyPlaylistId)
        : this.getFestivalPlaylist(riffValleyPlaylistId),
      this.artistRepository.findOneBy({ id: artistId }),
    ]);
    if (!artist) throw new NotFoundException('Artist not found');
    const uniqueTrackCount = new Set(spotifyTrackIds).size;
    const invalidGenreSelection =
      playlistType === 'genre' &&
      (spotifyTrackIds.length !== 2 || uniqueTrackCount !== 2);
    const invalidFestivalSelection =
      playlistType === 'festival' &&
      (spotifyTrackIds.length < 1 ||
        spotifyTrackIds.length > 10 ||
        uniqueTrackCount !== spotifyTrackIds.length);
    if (invalidGenreSelection) {
      throw new BadRequestException(
        'Debes seleccionar exactamente dos canciones distintas',
      );
    }
    if (invalidFestivalSelection) {
      throw new BadRequestException(
        'Debes seleccionar entre una y diez canciones distintas',
      );
    }

    let association = current;
    if (!association) {
      association = this.playlistArtistRepository.create({
        riffValleyPlaylistId,
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
      const response = await this.spotifyAccountApi.getTracks(
        accessToken,
        spotifyTrackIds,
      );
      const fetchedTracks = response.filter((track): track is SpotifyTrack =>
        Boolean(track),
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
        where: { riffValleyPlaylistId },
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
        riffValleyPlaylist.spotifyPlaylistId,
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
          !(riffValleyPlaylist.protectedTrackUris ?? []).includes(uri),
      );

      if (urisToAdd.length) {
        await this.spotifyAccountApi.addPlaylistItems(
          accessToken,
          riffValleyPlaylist.spotifyPlaylistId,
          urisToAdd,
        );
      }
      if (urisToRemove.length) {
        await this.spotifyAccountApi.removePlaylistItems(
          accessToken,
          riffValleyPlaylist.spotifyPlaylistId,
          urisToRemove,
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
      await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
        updateDate: new Date(),
      });
      return playlistType === 'genre'
        ? this.getGenrePlaylist(riffValleyPlaylistId)
        : this.getFestivalPlaylist(riffValleyPlaylistId);
    } catch (error) {
      association.status = PlaylistArtistSyncStatus.FAILED;
      association.lastError = this.errorMessage(error);
      await this.playlistArtistRepository.save(association);
      throw error;
    }
  }

  async clearFestivalPlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist =
      await this.getFestivalPlaylist(riffValleyPlaylistId);
    const accessToken = await this.getValidAccessToken();
    const remoteUris = await this.getSpotifyPlaylistTrackUris(
      accessToken,
      riffValleyPlaylist.spotifyPlaylistId,
    );

    for (let index = 0; index < remoteUris.length; index += 100) {
      const batch = remoteUris.slice(index, index + 100);
      await this.spotifyAccountApi.removePlaylistItems(
        accessToken,
        riffValleyPlaylist.spotifyPlaylistId,
        batch,
      );
    }

    await this.playlistArtistRepository.delete({ riffValleyPlaylistId });
    await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
      protectedTrackUris: [],
      updateDate: new Date(),
    });
    return this.getFestivalPlaylist(riffValleyPlaylistId);
  }

  async removeArtist(riffValleyPlaylistId: string, artistId: string) {
    const riffValleyPlaylist =
      await this.getFestivalPlaylist(riffValleyPlaylistId);
    const association = await this.playlistArtistRepository.findOne({
      where: { riffValleyPlaylistId, artistId },
    });
    if (!association)
      throw new NotFoundException('Artist is not in this playlist');

    try {
      const others = await this.playlistArtistRepository.find({
        where: { riffValleyPlaylistId },
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
          !(riffValleyPlaylist.protectedTrackUris ?? []).includes(uri),
      );
      if (urisToRemove.length) {
        const accessToken = await this.getValidAccessToken();
        await this.spotifyAccountApi.removePlaylistItems(
          accessToken,
          riffValleyPlaylist.spotifyPlaylistId,
          urisToRemove,
        );
      }
      await this.playlistArtistRepository.remove(association);
      await this.riffValleyPlaylistRepository.update(riffValleyPlaylist.id, {
        updateDate: new Date(),
      });
      return this.getFestivalPlaylist(riffValleyPlaylistId);
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
    const items = await this.spotifyAccountApi.searchTracks(
      accessToken,
      query,
      10,
    );
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

  private assertGenrePlaylistType(
    riffValleyPlaylist: RiffValleyPlaylist,
  ): void {
    if (
      ![
        RiffValleyPlaylistType.GENERO,
        RiffValleyPlaylistType.ESPECIAL,
        RiffValleyPlaylistType.OTRAS,
      ].includes(riffValleyPlaylist.type)
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
      this.spotifyAccountApi.getPlaylist(accessToken, spotifyPlaylistId),
      this.spotifyAccountApi.getProfile(accessToken),
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
    return this.spotifyAccountApi.getPlaylistTrackUris(
      accessToken,
      spotifyPlaylistId,
      true,
    );
  }

  private async getSpotifyPlaylistTrackUrisInOrder(
    accessToken: string,
    spotifyPlaylistId: string,
  ): Promise<string[]> {
    return this.spotifyAccountApi.getPlaylistTrackUris(
      accessToken,
      spotifyPlaylistId,
      false,
    );
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
    await this.spotifyAccountApi.replacePlaylistTrackUris(
      accessToken,
      spotifyPlaylistId,
      uris,
    );
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

    let refreshed: SpotifyOAuthTokenResponse;
    try {
      refreshed = await this.spotifyOAuthApi.refreshAccessToken(
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
