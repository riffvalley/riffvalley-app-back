import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSyncedPlaylistDto } from '../dto/create-synced-playlist.dto';
import { LinkSpotifyPlaylistDto } from '../dto/link-spotify-playlist.dto';
import { UpdateSyncedPlaylistDto } from '../dto/update-synced-playlist.dto';
import {
  SpotifyAccountApiService,
  SpotifyPlaylistDetails,
} from 'src/integrations/spotify-integration';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';

@Injectable()
export class SpotifyPlaylistManagementService {
  private readonly logger = new Logger(SpotifyPlaylistManagementService.name);

  constructor(
    @InjectRepository(RiffValleyPlaylist)
    private readonly riffValleyPlaylistRepository: Repository<RiffValleyPlaylist>,
    private readonly spotifyAccountApi: SpotifyAccountApiService,
    private readonly spotifyAuthorizationService: SpotifyPlaylistAuthorizationService,
  ) {}

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
    const savedPlaylist = await this.saveCreatedSpotifyPlaylist(
      accessToken,
      riffValleyPlaylist,
    );

    return this.getFestivalPlaylist(savedPlaylist.id);
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
    const savedPlaylist = await this.saveCreatedSpotifyPlaylist(
      accessToken,
      riffValleyPlaylist,
    );

    return this.getGenrePlaylist(savedPlaylist.id);
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

  private async saveCreatedSpotifyPlaylist(
    accessToken: string,
    playlist: RiffValleyPlaylist,
  ): Promise<RiffValleyPlaylist> {
    try {
      return (
        (await this.riffValleyPlaylistRepository.save(playlist)) ?? playlist
      );
    } catch (saveError) {
      let persistedPlaylist: RiffValleyPlaylist | null;
      try {
        persistedPlaylist = await this.riffValleyPlaylistRepository.findOne({
          where: { spotifyPlaylistId: playlist.spotifyPlaylistId },
        });
      } catch (lookupError) {
        const message =
          `No se pudo confirmar si la playlist ${playlist.link} quedó guardada localmente. ` +
          'No se retiró de la biblioteca de Spotify para evitar dejar un registro local apuntando a una playlist retirada. ' +
          'Cuando la base de datos responda, comprueba el vínculo o recupera la playlist usando ese enlace.';
        this.logger.error(message, this.errorStack(lookupError));
        throw new InternalServerErrorException(message);
      }

      if (persistedPlaylist) return persistedPlaylist;

      try {
        await this.spotifyAccountApi.removePlaylistFromLibrary(
          accessToken,
          playlist.spotifyPlaylistId,
        );
      } catch (compensationError) {
        const message =
          `No se pudo guardar localmente ni retirar de la biblioteca de Spotify la playlist recién creada ${playlist.link}. ` +
          'Puedes recuperarla vinculando ese enlace desde la opción de playlists existentes.';
        this.logger.error(message, this.errorStack(compensationError));
        throw new InternalServerErrorException(message);
      }

      const message =
        `No se pudo guardar localmente la playlist recién creada ${playlist.link}. ` +
        'Se retiró de la biblioteca de Spotify, pero el recurso remoto sigue existiendo y puedes recuperarlo vinculando ese enlace.';
      this.logger.error(message, this.errorStack(saveError));
      throw new InternalServerErrorException(message);
    }
  }

  private errorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined;
  }

  private getValidAccessToken(requiredScopes: string[] = []): Promise<string> {
    return this.spotifyAuthorizationService.getValidAccessToken(requiredScopes);
  }
}
