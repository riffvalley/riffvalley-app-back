import { Injectable } from '@nestjs/common';
import { CreateSyncedPlaylistDto } from './dto/create-synced-playlist.dto';
import { LinkSpotifyPlaylistDto } from './dto/link-spotify-playlist.dto';
import { SyncPlaylistArtistDto } from './dto/sync-playlist-artist.dto';
import { UpdateSyncedPlaylistDto } from './dto/update-synced-playlist.dto';
import { SpotifyPlaylistAuthorizationService } from './spotify-authorization/spotify-playlist-authorization.service';
import { FestivalSetlistService } from './setlist/festival-setlist.service';
import { SpotifyPlaylistManagementService } from './management/spotify-playlist-management.service';
import { SpotifyPlaylistArtistSyncService } from './artist-sync/spotify-playlist-artist-sync.service';
import { SpotifyPlaylistTrackMaintenanceService } from './track-maintenance/spotify-playlist-track-maintenance.service';
export type {
  TopSong,
  TopSongsResult,
} from './setlist/festival-setlist.service';

@Injectable()
export class SpotifyPlaylistsService {
  constructor(
    private readonly spotifyAuthorizationService: SpotifyPlaylistAuthorizationService,
    private readonly setlistService: FestivalSetlistService,
    private readonly playlistManagementService: SpotifyPlaylistManagementService,
    private readonly playlistArtistSyncService: SpotifyPlaylistArtistSyncService,
    private readonly playlistTrackMaintenanceService: SpotifyPlaylistTrackMaintenanceService,
  ) {}

  startSpotifyConnection() {
    return this.spotifyAuthorizationService.startSpotifyConnection();
  }

  completeSpotifyConnection(code: string, state: string) {
    return this.spotifyAuthorizationService.completeSpotifyConnection(
      code,
      state,
    );
  }

  getSpotifyConnection() {
    return this.spotifyAuthorizationService.getSpotifyConnection();
  }

  disconnectSpotify() {
    return this.spotifyAuthorizationService.disconnectSpotify();
  }

  getTopSongs(artist: string, limit = 10, recentSetlists = 10) {
    return this.setlistService.getTopSongs(artist, limit, recentSetlists);
  }

  createFestivalPlaylist(dto: CreateSyncedPlaylistDto) {
    return this.playlistManagementService.createFestivalPlaylist(dto);
  }

  createGenrePlaylist(dto: CreateSyncedPlaylistDto) {
    return this.playlistManagementService.createGenrePlaylist(dto);
  }

  linkExistingFestivalPlaylist(riffValleyPlaylistId: string) {
    return this.playlistManagementService.linkExistingFestivalPlaylist(
      riffValleyPlaylistId,
    );
  }

  createLinkedFestivalPlaylist(dto: LinkSpotifyPlaylistDto) {
    return this.playlistManagementService.createLinkedFestivalPlaylist(dto);
  }

  linkExistingGenrePlaylist(riffValleyPlaylistId: string) {
    return this.playlistManagementService.linkExistingGenrePlaylist(
      riffValleyPlaylistId,
    );
  }

  createLinkedGenrePlaylist(dto: LinkSpotifyPlaylistDto) {
    return this.playlistManagementService.createLinkedGenrePlaylist(dto);
  }

  updateFestivalPlaylist(
    riffValleyPlaylistId: string,
    dto: UpdateSyncedPlaylistDto,
  ) {
    return this.playlistManagementService.updateFestivalPlaylist(
      riffValleyPlaylistId,
      dto,
    );
  }

  updateGenrePlaylist(
    riffValleyPlaylistId: string,
    dto: UpdateSyncedPlaylistDto,
  ) {
    return this.playlistManagementService.updateGenrePlaylist(
      riffValleyPlaylistId,
      dto,
    );
  }

  updateFestivalPlaylistImage(riffValleyPlaylistId: string, image: Buffer) {
    return this.playlistManagementService.updateFestivalPlaylistImage(
      riffValleyPlaylistId,
      image,
    );
  }

  updateGenrePlaylistImage(riffValleyPlaylistId: string, image: Buffer) {
    return this.playlistManagementService.updateGenrePlaylistImage(
      riffValleyPlaylistId,
      image,
    );
  }

  getFestivalPlaylist(riffValleyPlaylistId: string) {
    return this.playlistManagementService.getFestivalPlaylist(
      riffValleyPlaylistId,
    );
  }

  getGenrePlaylist(riffValleyPlaylistId: string) {
    return this.playlistManagementService.getGenrePlaylist(
      riffValleyPlaylistId,
    );
  }

  addArtist(riffValleyPlaylistId: string, dto: SyncPlaylistArtistDto) {
    return this.playlistArtistSyncService.addArtist(riffValleyPlaylistId, dto);
  }

  searchGenreArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    query?: string,
  ) {
    return this.playlistArtistSyncService.searchGenreArtistTracks(
      riffValleyPlaylistId,
      artistId,
      query,
    );
  }

  searchFestivalArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    query?: string,
  ) {
    return this.playlistArtistSyncService.searchFestivalArtistTracks(
      riffValleyPlaylistId,
      artistId,
      query,
    );
  }

  addGenreArtist(
    riffValleyPlaylistId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    return this.playlistArtistSyncService.addGenreArtist(
      riffValleyPlaylistId,
      artistId,
      spotifyTrackIds,
    );
  }

  replaceGenreArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    return this.playlistArtistSyncService.replaceGenreArtistTracks(
      riffValleyPlaylistId,
      artistId,
      spotifyTrackIds,
    );
  }

  replaceFailedFestivalArtistTracks(
    riffValleyPlaylistId: string,
    artistId: string,
    spotifyTrackIds: string[],
  ) {
    return this.playlistArtistSyncService.replaceFailedFestivalArtistTracks(
      riffValleyPlaylistId,
      artistId,
      spotifyTrackIds,
    );
  }

  removeGenreArtist(riffValleyPlaylistId: string, artistId: string) {
    return this.playlistArtistSyncService.removeGenreArtist(
      riffValleyPlaylistId,
      artistId,
    );
  }

  removeArtist(riffValleyPlaylistId: string, artistId: string) {
    return this.playlistArtistSyncService.removeArtist(
      riffValleyPlaylistId,
      artistId,
    );
  }

  clearGenrePlaylist(riffValleyPlaylistId: string) {
    return this.playlistTrackMaintenanceService.clearGenrePlaylist(
      riffValleyPlaylistId,
    );
  }

  shuffleGenrePlaylist(riffValleyPlaylistId: string) {
    return this.playlistTrackMaintenanceService.shuffleGenrePlaylist(
      riffValleyPlaylistId,
    );
  }

  clearFestivalPlaylist(riffValleyPlaylistId: string) {
    return this.playlistTrackMaintenanceService.clearFestivalPlaylist(
      riffValleyPlaylistId,
    );
  }
}
