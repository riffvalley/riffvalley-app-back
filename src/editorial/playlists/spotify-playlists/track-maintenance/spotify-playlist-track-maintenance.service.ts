import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { SpotifyAccountApiService } from 'src/integrations/spotify-integration/api';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { RiffValleyPlaylistArtist } from '../entities/riff-valley-playlist-artist.entity';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';

@Injectable()
export class SpotifyPlaylistTrackMaintenanceService {
  private readonly logger = new Logger(
    SpotifyPlaylistTrackMaintenanceService.name,
  );

  constructor(
    @InjectRepository(RiffValleyPlaylist)
    private readonly riffValleyPlaylistRepository: Repository<RiffValleyPlaylist>,
    @InjectRepository(RiffValleyPlaylistArtist)
    private readonly playlistArtistRepository: Repository<RiffValleyPlaylistArtist>,
    private readonly spotifyAccountApi: SpotifyAccountApiService,
    private readonly spotifyAuthorizationService: SpotifyPlaylistAuthorizationService,
    private readonly playlistManagementService: SpotifyPlaylistManagementService,
  ) {}

  async clearGenrePlaylist(riffValleyPlaylistId: string) {
    await this.playlistManagementService.getGenrePlaylist(riffValleyPlaylistId);
    return this.clearFestivalPlaylist(riffValleyPlaylistId);
  }

  async shuffleGenrePlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist =
      await this.playlistManagementService.getGenrePlaylist(
        riffValleyPlaylistId,
      );
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
    return this.playlistManagementService.getGenrePlaylist(
      riffValleyPlaylistId,
    );
  }

  async clearFestivalPlaylist(riffValleyPlaylistId: string) {
    const riffValleyPlaylist =
      await this.playlistManagementService.getFestivalPlaylist(
        riffValleyPlaylistId,
      );
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
    return this.playlistManagementService.getFestivalPlaylist(
      riffValleyPlaylistId,
    );
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

  private getSpotifyPlaylistTrackUrisInOrder(
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

  private getValidAccessToken(requiredScopes: string[] = []): Promise<string> {
    return this.spotifyAuthorizationService.getValidAccessToken(requiredScopes);
  }

  private errorMessage(error: unknown): string {
    return (
      error instanceof Error ? error.message : 'Error de sincronización'
    ).slice(0, 1000);
  }
}
