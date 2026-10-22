import { SpotifyPlaylistsService } from '../spotify-playlists.service';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { FestivalSetlistService } from '../setlist/festival-setlist.service';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';
import { SpotifyPlaylistArtistSyncService } from '../artist-sync/spotify-playlist-artist-sync.service';
import { SpotifyPlaylistTrackMaintenanceService } from '../track-maintenance/spotify-playlist-track-maintenance.service';
import { DeepPartial, Repository } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { SpotifyAccountApiService } from 'src/integrations/spotify-integration/api';
import { RiffValleyPlaylistArtist } from '../entities/riff-valley-playlist-artist.entity';

function playlistFixture(): RiffValleyPlaylist {
  return Object.assign(new RiffValleyPlaylist(), {
    id: 'playlist-local',
    name: 'Playlist local',
    status: RiffValleyPlaylistStatus.IN_PROGRESS,
    link: 'https://open.spotify.com/playlist/playlist-local',
    spotifyPlaylistId: 'playlist-remote',
    description: null,
    isPublic: false,
    imageUrl: null,
    protectedTrackUris: [],
    type: RiffValleyPlaylistType.FESTIVAL,
    updateDate: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    user: undefined,
    content: undefined,
    playlistArtists: [],
  });
}

describe('SpotifyPlaylistsService', () => {
  let service: SpotifyPlaylistsService;
  let module: TestingModule;
  let spotifyAuthorizationService: jest.Mocked<
    Pick<
      SpotifyPlaylistAuthorizationService,
      | 'startSpotifyConnection'
      | 'completeSpotifyConnection'
      | 'getSpotifyConnection'
      | 'disconnectSpotify'
      | 'getValidAccessToken'
    >
  >;
  let setlistService: jest.Mocked<Pick<FestivalSetlistService, 'getTopSongs'>>;
  let playlistManagementService: SpotifyPlaylistManagementService;
  let playlistArtistSyncService: SpotifyPlaylistArtistSyncService;
  let playlistTrackMaintenanceService: SpotifyPlaylistTrackMaintenanceService;

  beforeEach(async () => {
    const riffValleyPlaylistRepository: Pick<
      Repository<RiffValleyPlaylist>,
      'find' | 'findOne' | 'update'
    > & {
      create: (value: DeepPartial<RiffValleyPlaylist>) => RiffValleyPlaylist;
      save: (
        value: DeepPartial<RiffValleyPlaylist>,
      ) => Promise<RiffValleyPlaylist>;
    } = {
      create: jest.fn((value: DeepPartial<RiffValleyPlaylist>) =>
        Object.assign(new RiffValleyPlaylist(), {
          id: 'playlist-local',
          ...value,
        }),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const playlistArtistRepository: Pick<
      Repository<RiffValleyPlaylistArtist>,
      'findOne' | 'find' | 'delete' | 'remove'
    > & {
      create: (
        value: DeepPartial<RiffValleyPlaylistArtist>,
      ) => RiffValleyPlaylistArtist;
      save: (
        value: DeepPartial<RiffValleyPlaylistArtist>,
      ) => Promise<RiffValleyPlaylistArtist>;
    } = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value: DeepPartial<RiffValleyPlaylistArtist>) =>
        Object.assign(new RiffValleyPlaylistArtist(), {
          id: 'association-id',
          ...value,
        }),
      ),
      save: jest.fn(async (value: DeepPartial<RiffValleyPlaylistArtist>) =>
        Object.assign(new RiffValleyPlaylistArtist(), value),
      ),
      delete: jest.fn(),
      remove: jest.fn(),
    };
    const spotifyAccountApi: jest.Mocked<
      Pick<
        SpotifyAccountApiService,
        | 'getProfile'
        | 'createPlaylist'
        | 'getPlaylist'
        | 'updatePlaylist'
        | 'uploadPlaylistImage'
        | 'getPlaylistImages'
        | 'getPlaylistTrackUris'
        | 'searchTracks'
        | 'getTracks'
        | 'addPlaylistItems'
        | 'removePlaylistItems'
        | 'replacePlaylistTrackUris'
      >
    > = {
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
      disconnectSpotify: jest.fn(),
      getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    setlistService = {
      getTopSongs: jest.fn<
        ReturnType<FestivalSetlistService['getTopSongs']>,
        Parameters<FestivalSetlistService['getTopSongs']>
      >(),
    };
    module = await Test.createTestingModule({
      providers: [
        SpotifyPlaylistsService,
        SpotifyPlaylistAuthorizationService,
        FestivalSetlistService,
        SpotifyPlaylistManagementService,
        SpotifyPlaylistArtistSyncService,
        SpotifyPlaylistTrackMaintenanceService,
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: riffValleyPlaylistRepository,
        },
        {
          provide: getRepositoryToken(RiffValleyPlaylistArtist),
          useValue: playlistArtistRepository,
        },
        {
          provide: getRepositoryToken(Artist),
          useValue: { findOneBy: jest.fn() },
        },
        { provide: SpotifyAccountApiService, useValue: spotifyAccountApi },
        {
          provide: SpotifyPlaylistAuthorizationService,
          useValue: spotifyAuthorizationService,
        },
        { provide: FestivalSetlistService, useValue: setlistService },
      ],
    }).compile();
    service = module.get(SpotifyPlaylistsService);
    playlistManagementService = module.get(SpotifyPlaylistManagementService);
    playlistArtistSyncService = module.get(SpotifyPlaylistArtistSyncService);
    playlistTrackMaintenanceService = module.get(
      SpotifyPlaylistTrackMaintenanceService,
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await module.close();
  });

  it('conserva la fachada pública del ciclo de autorización y delega sus operaciones', async () => {
    const result = {
      authorizationUrl: 'https://accounts.spotify.com/authorize',
    };
    spotifyAuthorizationService.startSpotifyConnection.mockResolvedValue(
      result,
    );
    spotifyAuthorizationService.completeSpotifyConnection.mockResolvedValue({
      connected: true,
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      refreshTokenExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });
    spotifyAuthorizationService.getSpotifyConnection.mockResolvedValue({
      connected: false,
      spotifyUserId: null,
      displayName: null,
      canUploadImages: false,
      missingScopes: [],
      authorizationStatus: 'disconnected',
      reauthorizationRequired: false,
      reauthorizationReason: null,
      authorizedAt: null,
      refreshTokenExpiresAt: null,
      daysUntilReauthorization: null,
    });
    spotifyAuthorizationService.disconnectSpotify.mockResolvedValue({
      connected: false,
    });

    await expect(service.startSpotifyConnection()).resolves.toBe(result);
    await expect(
      service.completeSpotifyConnection('code', 'state'),
    ).resolves.toMatchObject({
      connected: true,
      spotifyUserId: 'spotify-user',
    });
    await expect(service.getSpotifyConnection()).resolves.toMatchObject({
      connected: false,
      authorizationStatus: 'disconnected',
    });
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
    const result = playlistFixture();
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
    const result = playlistFixture();
    const genreSearchResult = {
      artist: { id: 'artist-id', name: 'Test Artist' },
      query: 'query',
      tracks: [],
    };
    const festivalSearchResult = {
      ...genreSearchResult,
      query: '',
    };
    const delegates = {
      addArtist: jest
        .spyOn(playlistArtistSyncService, 'addArtist')
        .mockResolvedValue(result),
      searchGenreArtistTracks: jest
        .spyOn(playlistArtistSyncService, 'searchGenreArtistTracks')
        .mockResolvedValue(genreSearchResult),
      searchFestivalArtistTracks: jest
        .spyOn(playlistArtistSyncService, 'searchFestivalArtistTracks')
        .mockResolvedValue(festivalSearchResult),
      addGenreArtist: jest
        .spyOn(playlistArtistSyncService, 'addGenreArtist')
        .mockResolvedValue(result),
      replaceGenreArtistTracks: jest
        .spyOn(playlistArtistSyncService, 'replaceGenreArtistTracks')
        .mockResolvedValue(result),
      replaceFailedFestivalArtistTracks: jest
        .spyOn(playlistArtistSyncService, 'replaceFailedFestivalArtistTracks')
        .mockResolvedValue(result),
      removeGenreArtist: jest
        .spyOn(playlistArtistSyncService, 'removeGenreArtist')
        .mockResolvedValue(result),
      removeArtist: jest
        .spyOn(playlistArtistSyncService, 'removeArtist')
        .mockResolvedValue(result),
    };
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
    ).resolves.toBe(genreSearchResult);
    await expect(
      service.searchFestivalArtistTracks('festival-id', 'artist-id'),
    ).resolves.toBe(festivalSearchResult);
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
