import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpotifyAccountApiService } from 'src/integrations/spotify-integration';
import type { SpotifyTrack } from 'src/integrations/spotify-integration';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { SyncPlaylistArtistDto } from '../dto/sync-playlist-artist.dto';
import {
  PlaylistArtistSelectionMode,
  PlaylistArtistSyncStatus,
  PlaylistTrackRecord,
  RiffValleyPlaylistArtist,
} from '../entities/riff-valley-playlist-artist.entity';
import { normalizeName } from '../helpers/normalize-name';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { FestivalSetlistService } from '../setlist/festival-setlist.service';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';

@Injectable()
export class SpotifyPlaylistArtistSyncService {
  constructor(
    @InjectRepository(RiffValleyPlaylist)
    private readonly riffValleyPlaylistRepository: Repository<RiffValleyPlaylist>,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(RiffValleyPlaylistArtist)
    private readonly playlistArtistRepository: Repository<RiffValleyPlaylistArtist>,
    private readonly spotifyAccountApi: SpotifyAccountApiService,
    private readonly spotifyAuthorizationService: SpotifyPlaylistAuthorizationService,
    private readonly setlistService: FestivalSetlistService,
    private readonly playlistManagementService: SpotifyPlaylistManagementService,
  ) {}

  async addArtist(riffValleyPlaylistId: string, dto: SyncPlaylistArtistDto) {
    const [riffValleyPlaylist, artist] = await Promise.all([
      this.playlistManagementService.getFestivalPlaylist(riffValleyPlaylistId),
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
      const top = await this.setlistService.getTopSongs(
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
      return this.playlistManagementService.getFestivalPlaylist(
        riffValleyPlaylistId,
      );
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
    await this.playlistManagementService.getGenrePlaylist(riffValleyPlaylistId);
    return this.searchArtistTracks(artistId, query);
  }

  async searchFestivalArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    query?: string,
  ) {
    await this.playlistManagementService.getFestivalPlaylist(
      riffValleyPlaylistId,
    );
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
    await this.playlistManagementService.getGenrePlaylist(riffValleyPlaylistId);
    return this.removeArtist(riffValleyPlaylistId, artistId);
  }

  async removeArtist(riffValleyPlaylistId: string, artistId: string) {
    const riffValleyPlaylist =
      await this.playlistManagementService.getFestivalPlaylist(
        riffValleyPlaylistId,
      );
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
      return this.playlistManagementService.getFestivalPlaylist(
        riffValleyPlaylistId,
      );
    } catch (error) {
      association.status = PlaylistArtistSyncStatus.FAILED;
      association.lastError = this.errorMessage(error);
      await this.playlistArtistRepository.save(association);
      throw error;
    }
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
        ? this.playlistManagementService.getGenrePlaylist(riffValleyPlaylistId)
        : this.playlistManagementService.getFestivalPlaylist(
            riffValleyPlaylistId,
          ),
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
          remoteUriSet.has(uri) &&
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

      const normalizedArtist = normalizeName(artist.name);
      const spotifyArtist = (selectedTracks as SpotifyTrack[])
        .flatMap((track) => track.artists)
        .find((item) => normalizeName(item.name) === normalizedArtist);
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
        ? this.playlistManagementService.getGenrePlaylist(riffValleyPlaylistId)
        : this.playlistManagementService.getFestivalPlaylist(
            riffValleyPlaylistId,
          );
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
    const normalizedArtist = normalizeName(artist);
    return (
      items.find((track) =>
        track.artists.some(
          (item) => normalizeName(item.name) === normalizedArtist,
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

  private getSpotifyPlaylistTrackUris(
    accessToken: string,
    spotifyPlaylistId: string,
  ): Promise<string[]> {
    return this.spotifyAccountApi.getPlaylistTrackUris(
      accessToken,
      spotifyPlaylistId,
      true,
    );
  }

  private getValidAccessToken(requiredScopes: string[] = []): Promise<string> {
    return this.spotifyAuthorizationService.getValidAccessToken(requiredScopes);
  }

  private errorMessage(error: unknown): string {
    return (
      error instanceof Error ? error.message : 'Error de sincronización'
    ).slice(0, 1000);
  }
}
