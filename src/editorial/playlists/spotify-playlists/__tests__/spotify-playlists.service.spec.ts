import { SpotifyPlaylistsService } from '../spotify-playlists.service';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { FestivalSetlistService } from '../setlist/festival-setlist.service';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';
import { SpotifyPlaylistArtistSyncService } from '../artist-sync/spotify-playlist-artist-sync.service';
import { SpotifyPlaylistTrackMaintenanceService } from '../track-maintenance/spotify-playlist-track-maintenance.service';
import { Repository } from 'typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';

describe('SpotifyPlaylistsService', () => {
  let service: SpotifyPlaylistsService;
  let riffValleyPlaylistRepository: any;
  let playlistArtistRepository: any;
  let spotifyAccountApi: any;
  let spotifyAuthorizationService: any;
  let setlistService: jest.Mocked<Pick<FestivalSetlistService, 'getTopSongs'>>;
  let playlistManagementService: SpotifyPlaylistManagementService;
  let playlistArtistSyncService: SpotifyPlaylistArtistSyncService;
  let playlistTrackMaintenanceService: SpotifyPlaylistTrackMaintenanceService;

  beforeEach(() => {
    riffValleyPlaylistRepository = {
      create: jest.fn((value) => ({ id: 'playlist-local', ...value })),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    playlistArtistRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => ({ id: 'association-id', ...value })),
      save: jest.fn(async (value) => value),
      delete: jest.fn(),
      remove: jest.fn(),
    };
    spotifyAccountApi = {
      getProfile: jest.fn(),
      createPlaylist: jest.fn(),
      getPlaylist: jest.fn(),
      updatePlaylist: jest.fn(),
      uploadPlaylistImage: jest.fn(),
      getPlaylistImages: jest.fn(),
      getPlaylistTrackUris: jest.fn().mockResolvedValue([]),
      searchTracks: jest.fn().mockResolvedValue([]),
      getTracks: jest.fn().mockResolvedValue([]),
      addPlaylistItems: jest.fn().mockResolvedValue(undefined),
      removePlaylistItems: jest.fn().mockResolvedValue(undefined),
      replacePlaylistTrackUris: jest.fn().mockResolvedValue(undefined),
    };
    spotifyAuthorizationService = {
      startSpotifyConnection: jest.fn(),
      completeSpotifyConnection: jest.fn(),
      getSpotifyConnection: jest.fn(),
      checkSpotifyAuthorizationLifetime: jest.fn(),
      disconnectSpotify: jest.fn(),
      getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    setlistService = {
      getTopSongs: jest.fn<
        ReturnType<FestivalSetlistService['getTopSongs']>,
        Parameters<FestivalSetlistService['getTopSongs']>
      >(),
    };
    playlistManagementService = new SpotifyPlaylistManagementService(
      riffValleyPlaylistRepository,
      spotifyAccountApi,
      spotifyAuthorizationService as SpotifyPlaylistAuthorizationService,
    );
    playlistArtistSyncService = new SpotifyPlaylistArtistSyncService(
      riffValleyPlaylistRepository,
      { findOneBy: jest.fn() } as unknown as Repository<Artist>,
      playlistArtistRepository,
      spotifyAccountApi,
      spotifyAuthorizationService as SpotifyPlaylistAuthorizationService,
      setlistService as unknown as FestivalSetlistService,
      playlistManagementService,
    );
    playlistTrackMaintenanceService =
      new SpotifyPlaylistTrackMaintenanceService(
        riffValleyPlaylistRepository,
        playlistArtistRepository,
        spotifyAccountApi,
        spotifyAuthorizationService as SpotifyPlaylistAuthorizationService,
        playlistManagementService,
      );
    service = new SpotifyPlaylistsService(
      spotifyAuthorizationService as SpotifyPlaylistAuthorizationService,
      setlistService as unknown as FestivalSetlistService,
      playlistManagementService,
      playlistArtistSyncService,
      playlistTrackMaintenanceService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('conserva la fachada pública del ciclo de autorización y delega sus operaciones', async () => {
    const result = {
      authorizationUrl: 'https://accounts.spotify.com/authorize',
    };
    spotifyAuthorizationService.startSpotifyConnection.mockResolvedValue(
      result,
    );
    spotifyAuthorizationService.completeSpotifyConnection.mockResolvedValue({
      connected: true,
    });
    spotifyAuthorizationService.getSpotifyConnection.mockResolvedValue({
      connected: false,
    });
    spotifyAuthorizationService.checkSpotifyAuthorizationLifetime.mockResolvedValue(
      undefined,
    );
    spotifyAuthorizationService.disconnectSpotify.mockResolvedValue({
      connected: false,
    });

    await expect(service.startSpotifyConnection()).resolves.toBe(result);
    await expect(
      service.completeSpotifyConnection('code', 'state'),
    ).resolves.toEqual({ connected: true });
    await expect(service.getSpotifyConnection()).resolves.toEqual({
      connected: false,
    });
    await expect(
      service.checkSpotifyAuthorizationLifetime(),
    ).resolves.toBeUndefined();
    await expect(service.disconnectSpotify()).resolves.toEqual({
      connected: false,
    });

    expect(
      spotifyAuthorizationService.startSpotifyConnection,
    ).toHaveBeenCalledTimes(1);
    expect(
      spotifyAuthorizationService.completeSpotifyConnection,
    ).toHaveBeenCalledWith('code', 'state');
    expect(
      spotifyAuthorizationService.getSpotifyConnection,
    ).toHaveBeenCalledTimes(1);
    expect(
      spotifyAuthorizationService.checkSpotifyAuthorizationLifetime,
    ).toHaveBeenCalledTimes(1);
    expect(spotifyAuthorizationService.disconnectSpotify).toHaveBeenCalledTimes(
      1,
    );
  });

  it('preserves authorization errors through the facade', async () => {
    const authorizationError = new Error('OAuth state expired');
    spotifyAuthorizationService.completeSpotifyConnection.mockRejectedValue(
      authorizationError,
    );

    await expect(
      service.completeSpotifyConnection('code', 'expired-state'),
    ).rejects.toBe(authorizationError);
  });

  it('delega getTopSongs conservando parámetros, respuesta y errores', async () => {
    const result = {
      artist: 'Test Artist',
      setlistsAnalyzed: 2,
      songs: [{ name: 'Hit', plays: 2 }],
      sources: ['https://setlist.fm/recent'],
    };
    setlistService.getTopSongs.mockResolvedValue(result);

    await expect(service.getTopSongs('Test Artist', 4, 6)).resolves.toBe(
      result,
    );
    expect(setlistService.getTopSongs).toHaveBeenCalledWith(
      'Test Artist',
      4,
      6,
    );

    const error = new Error('setlist.fm request failed');
    setlistService.getTopSongs.mockRejectedValue(error);
    await expect(service.getTopSongs('Test Artist')).rejects.toBe(error);
  });

  it('conserva las firmas de administración en la fachada y propaga respuestas y errores', async () => {
    const result = { id: 'playlist-local' } as any;
    const managementError = new Error('Spotify management failed');
    const create = jest
      .spyOn(playlistManagementService, 'createFestivalPlaylist')
      .mockResolvedValue(result);
    const createGenre = jest
      .spyOn(playlistManagementService, 'createGenrePlaylist')
      .mockResolvedValue(result);
    const linkExistingFestival = jest
      .spyOn(playlistManagementService, 'linkExistingFestivalPlaylist')
      .mockResolvedValue(result);
    const linkExistingGenre = jest
      .spyOn(playlistManagementService, 'linkExistingGenrePlaylist')
      .mockResolvedValue(result);
    const createLinkedFestival = jest
      .spyOn(playlistManagementService, 'createLinkedFestivalPlaylist')
      .mockResolvedValue(result);
    const link = jest
      .spyOn(playlistManagementService, 'createLinkedGenrePlaylist')
      .mockResolvedValue(result);
    const updateFestival = jest
      .spyOn(playlistManagementService, 'updateFestivalPlaylist')
      .mockResolvedValue(result);
    const updateGenre = jest
      .spyOn(playlistManagementService, 'updateGenrePlaylist')
      .mockResolvedValue(result);
    const updateFestivalImage = jest
      .spyOn(playlistManagementService, 'updateFestivalPlaylistImage')
      .mockResolvedValue(result);
    const update = jest
      .spyOn(playlistManagementService, 'updateGenrePlaylistImage')
      .mockRejectedValue(managementError);
    const readFestival = jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(result);
    const read = jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(result);

    const dto = { name: 'Festival', public: false };
    const linkDto = { spotifyUrl: 'spotify-url' };
    const updateDto = { name: 'Actualizada' };
    const image = Buffer.from('image');
    await expect(service.createFestivalPlaylist(dto)).resolves.toBe(result);
    await expect(service.createGenrePlaylist(dto)).resolves.toBe(result);
    await expect(
      service.linkExistingFestivalPlaylist('festival-id'),
    ).resolves.toBe(result);
    await expect(service.linkExistingGenrePlaylist('genre-id')).resolves.toBe(
      result,
    );
    await expect(service.createLinkedFestivalPlaylist(linkDto)).resolves.toBe(
      result,
    );
    await expect(service.createLinkedGenrePlaylist(linkDto)).resolves.toBe(
      result,
    );
    await expect(
      service.updateFestivalPlaylist('festival-id', updateDto),
    ).resolves.toBe(result);
    await expect(
      service.updateGenrePlaylist('genre-id', updateDto),
    ).resolves.toBe(result);
    await expect(
      service.updateFestivalPlaylistImage('festival-id', image),
    ).resolves.toBe(result);
    await expect(service.getGenrePlaylist('playlist-local')).resolves.toBe(
      result,
    );
    await expect(service.getFestivalPlaylist('festival-id')).resolves.toBe(
      result,
    );
    await expect(
      service.updateGenrePlaylistImage('genre-id', image),
    ).rejects.toBe(managementError);

    expect(create).toHaveBeenCalledWith(dto);
    expect(createGenre).toHaveBeenCalledWith(dto);
    expect(linkExistingFestival).toHaveBeenCalledWith('festival-id');
    expect(linkExistingGenre).toHaveBeenCalledWith('genre-id');
    expect(createLinkedFestival).toHaveBeenCalledWith(linkDto);
    expect(link).toHaveBeenCalledWith(linkDto);
    expect(updateFestival).toHaveBeenCalledWith('festival-id', updateDto);
    expect(updateGenre).toHaveBeenCalledWith('genre-id', updateDto);
    expect(updateFestivalImage).toHaveBeenCalledWith('festival-id', image);
    expect(readFestival).toHaveBeenCalledWith('festival-id');
    expect(read).toHaveBeenCalledWith('playlist-local');
    expect(update).toHaveBeenCalledWith('genre-id', image);
  });

  it('delega cada operación pública de artistas sin traducir sus respuestas ni errores', async () => {
    const result = { id: 'playlist-local' } as unknown as never;
    const methods = [
      'addArtist',
      'searchGenreArtistTracks',
      'searchFestivalArtistTracks',
      'addGenreArtist',
      'replaceGenreArtistTracks',
      'replaceFailedFestivalArtistTracks',
      'removeGenreArtist',
      'removeArtist',
    ] as const;
    const delegates = Object.fromEntries(
      methods.map((method) => [
        method,
        jest.spyOn(playlistArtistSyncService, method).mockResolvedValue(result),
      ]),
    ) as Record<(typeof methods)[number], jest.SpyInstance>;
    const error = new Error('artist synchronization failed');
    delegates.removeArtist.mockRejectedValue(error);
    const syncDto = {
      artistId: 'artist-id',
      tracksPerArtist: 4,
      recentSetlists: 6,
    };
    const trackIds = ['track-one', 'track-two'];

    await expect(service.addArtist('festival-id', syncDto)).resolves.toBe(
      result,
    );
    await expect(
      service.searchGenreArtistTracks('genre-id', 'artist-id', 'query'),
    ).resolves.toBe(result);
    await expect(
      service.searchFestivalArtistTracks('festival-id', 'artist-id'),
    ).resolves.toBe(result);
    await expect(
      service.addGenreArtist('genre-id', 'artist-id', trackIds),
    ).resolves.toBe(result);
    await expect(
      service.replaceGenreArtistTracks('genre-id', 'artist-id', trackIds),
    ).resolves.toBe(result);
    await expect(
      service.replaceFailedFestivalArtistTracks(
        'festival-id',
        'artist-id',
        trackIds,
      ),
    ).resolves.toBe(result);
    await expect(
      service.removeGenreArtist('genre-id', 'artist-id'),
    ).resolves.toBe(result);
    await expect(service.removeArtist('festival-id', 'artist-id')).rejects.toBe(
      error,
    );

    expect(delegates.addArtist).toHaveBeenCalledWith('festival-id', syncDto);
    expect(delegates.searchGenreArtistTracks).toHaveBeenCalledWith(
      'genre-id',
      'artist-id',
      'query',
    );
    expect(delegates.searchFestivalArtistTracks).toHaveBeenCalledWith(
      'festival-id',
      'artist-id',
      undefined,
    );
    expect(delegates.addGenreArtist).toHaveBeenCalledWith(
      'genre-id',
      'artist-id',
      trackIds,
    );
    expect(delegates.replaceGenreArtistTracks).toHaveBeenCalledWith(
      'genre-id',
      'artist-id',
      trackIds,
    );
    expect(delegates.replaceFailedFestivalArtistTracks).toHaveBeenCalledWith(
      'festival-id',
      'artist-id',
      trackIds,
    );
    expect(delegates.removeGenreArtist).toHaveBeenCalledWith(
      'genre-id',
      'artist-id',
    );
    expect(delegates.removeArtist).toHaveBeenCalledWith(
      'festival-id',
      'artist-id',
    );
  });

  it('delega clear Festival/Género y shuffle conservando los resultados y errores', async () => {
    const playlist = Object.assign(new RiffValleyPlaylist(), {
      id: 'playlist-local',
    });
    const clearFestival = jest
      .spyOn(playlistTrackMaintenanceService, 'clearFestivalPlaylist')
      .mockResolvedValue(playlist);
    const clearGenre = jest
      .spyOn(playlistTrackMaintenanceService, 'clearGenrePlaylist')
      .mockResolvedValue(playlist);
    const shuffle = jest
      .spyOn(playlistTrackMaintenanceService, 'shuffleGenrePlaylist')
      .mockResolvedValue(playlist);
    const error = new Error('maintenance failed');
    clearGenre.mockRejectedValueOnce(error);

    await expect(service.clearFestivalPlaylist('festival-id')).resolves.toBe(
      playlist,
    );
    await expect(service.clearGenrePlaylist('genre-id')).rejects.toBe(error);
    await expect(service.shuffleGenrePlaylist('genre-id')).resolves.toBe(
      playlist,
    );

    expect(clearFestival).toHaveBeenCalledWith('festival-id');
    expect(clearGenre).toHaveBeenCalledWith('genre-id');
    expect(shuffle).toHaveBeenCalledWith('genre-id');
  });
});
