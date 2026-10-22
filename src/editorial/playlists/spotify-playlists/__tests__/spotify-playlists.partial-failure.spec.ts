import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SpotifyPlaylistsService } from '../spotify-playlists.service';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';
import { SpotifyPlaylistArtistSyncService } from '../artist-sync/spotify-playlist-artist-sync.service';
import { SpotifyPlaylistTrackMaintenanceService } from '../track-maintenance/spotify-playlist-track-maintenance.service';
import { FestivalSetlistService } from '../setlist/festival-setlist.service';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { SyncPlaylistArtistDto } from '../dto/sync-playlist-artist.dto';
import { UpdateSyncedPlaylistDto } from '../dto/update-synced-playlist.dto';
import {
  SpotifyTrack,
  SpotifyImage,
} from 'src/integrations/spotify-integration/api';
import { Repository, DeepPartial, UpdateResult } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { SpotifyAccountApiService } from 'src/integrations/spotify-integration/api';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import {
  RiffValleyPlaylistArtist,
  PlaylistArtistSelectionMode,
  PlaylistArtistSyncStatus,
  PlaylistTrackRecord,
} from '../entities/riff-valley-playlist-artist.entity';
import { CreateSyncedPlaylistDto } from '../dto/create-synced-playlist.dto';
import {
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';

type PlaylistRepository = jest.Mocked<
  Pick<Repository<RiffValleyPlaylist>, 'find' | 'findOne' | 'update'>
> & {
  create: jest.Mock<RiffValleyPlaylist, [DeepPartial<RiffValleyPlaylist>]>;
  save: jest.Mock<
    Promise<RiffValleyPlaylist>,
    [DeepPartial<RiffValleyPlaylist>]
  >;
};
type ArtistRepository = jest.Mocked<Pick<Repository<Artist>, 'findOneBy'>>;
type PlaylistArtistRepository = jest.Mocked<
  Pick<
    Repository<RiffValleyPlaylistArtist>,
    'find' | 'findOne' | 'delete' | 'remove'
  >
> & {
  create: jest.Mock<
    RiffValleyPlaylistArtist,
    [DeepPartial<RiffValleyPlaylistArtist>]
  >;
  save: jest.Mock<
    Promise<RiffValleyPlaylistArtist>,
    [DeepPartial<RiffValleyPlaylistArtist>]
  >;
};
type SpotifyAccountApi = jest.Mocked<
  Pick<
    SpotifyAccountApiService,
    | 'createPlaylist'
    | 'removePlaylistFromLibrary'
    | 'updatePlaylist'
    | 'uploadPlaylistImage'
    | 'getPlaylistImages'
    | 'getPlaylistTrackUris'
    | 'searchTracks'
    | 'getTracks'
    | 'addPlaylistItems'
    | 'removePlaylistItems'
  >
>;
type SpotifyAuthorization = jest.Mocked<
  Pick<
    SpotifyPlaylistAuthorizationService,
    | 'startSpotifyConnection'
    | 'completeSpotifyConnection'
    | 'getSpotifyConnection'
    | 'disconnectSpotify'
    | 'getValidAccessToken'
  >
>;

type FestivalSetlistServiceMock = jest.Mocked<
  Pick<FestivalSetlistService, 'getTopSongs'>
>;

const syncPlaylistArtistDto = (artistId: string): SyncPlaylistArtistDto =>
  Object.assign(new SyncPlaylistArtistDto(), { artistId });

const spotifyTrack = (id: string, name: string): SpotifyTrack => ({
  id,
  name,
  uri: `spotify:track:${id}`,
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  artists: [{ id: 'artist-id', name: 'Band' }],
});

const createPlaylistDto = (): CreateSyncedPlaylistDto =>
  Object.assign(new CreateSyncedPlaylistDto(), {
    name: 'Playlist',
    public: false,
  });
const spotifyImage = (url: string): SpotifyImage => ({
  url,
  height: null,
  width: null,
});
const updateResult = (): UpdateResult => ({
  affected: 1,
  raw: [],
  generatedMaps: [],
});

const artistFixture = (): Artist =>
  Object.assign(new Artist(), {
    id: 'artist-id',
    name: 'Band',
    nameNormalized: 'band',
    description: '',
    image: '',
    countryId: null,
    needsReview: false,
    updatedAt: new Date(0),
    country: null,
    disc: [],
  });

const playlistArtistFixture = (
  overrides: Partial<RiffValleyPlaylistArtist> = {},
): RiffValleyPlaylistArtist =>
  Object.assign(new RiffValleyPlaylistArtist(), {
    id: 'association-id',
    riffValleyPlaylistId: 'playlist-local',
    riffValleyPlaylist: null,
    artistId: 'artist-id',
    artist: artistFixture(),
    status: PlaylistArtistSyncStatus.SYNCING,
    selectionMode: PlaylistArtistSelectionMode.SETLIST,
    spotifyArtistId: null,
    setlistsAnalyzed: 0,
    tracks: [],
    lastError: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  });

const savedPlaylistArtistFixture = (
  value: DeepPartial<RiffValleyPlaylistArtist>,
): RiffValleyPlaylistArtist => Object.assign(playlistArtistFixture(), value);

const playlistTrackFixture = (uri: string): PlaylistTrackRecord => ({
  spotifyTrackId: uri.replace('spotify:track:', ''),
  uri,
  name: 'Track',
  url: `https://open.spotify.com/track/${uri.replace('spotify:track:', '')}`,
  plays: 1,
});

describe('SpotifyPlaylistsService partial Spotify/PostgreSQL failures', () => {
  let service: SpotifyPlaylistsService;
  let testingModule: TestingModule;
  let playlistRepository: PlaylistRepository;
  let artistRepository: ArtistRepository;
  let playlistArtistRepository: PlaylistArtistRepository;
  let spotifyAccountApi: SpotifyAccountApi;
  let spotifyAuthorizationService: SpotifyAuthorization;
  let setlistService: FestivalSetlistServiceMock;
  let playlistManagementService: SpotifyPlaylistManagementService;
  const playlist = Object.assign(new RiffValleyPlaylist(), {
    id: 'playlist-local',
    spotifyPlaylistId: 'playlist-remote',
    protectedTrackUris: [],
    imageUrl: 'https://image.test/old.jpg',
    name: 'Playlist',
    status: RiffValleyPlaylistStatus.IN_PROGRESS,
    link: 'https://open.spotify.com/playlist/playlist-remote',
    description: null,
    isPublic: false,
    type: RiffValleyPlaylistType.FESTIVAL,
    updateDate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    user: null,
    content: null,
    playlistArtists: [],
  });

  beforeEach(async () => {
    playlistRepository = {
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
    artistRepository = { findOneBy: jest.fn() };
    playlistArtistRepository = {
      create: jest.fn((value: DeepPartial<RiffValleyPlaylistArtist>) =>
        Object.assign(new RiffValleyPlaylistArtist(), {
          id: 'association-id',
          ...value,
        }),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value: DeepPartial<RiffValleyPlaylistArtist>) =>
        savedPlaylistArtistFixture(value),
      ),
      delete: jest.fn(),
      remove: jest.fn(),
    };
    spotifyAccountApi = {
      createPlaylist: jest.fn(),
      removePlaylistFromLibrary: jest.fn(),
      updatePlaylist: jest.fn(),
      uploadPlaylistImage: jest.fn(),
      getPlaylistImages: jest.fn(),
      getPlaylistTrackUris: jest.fn().mockResolvedValue([]),
      searchTracks: jest.fn(),
      getTracks: jest.fn(),
      addPlaylistItems: jest.fn(),
      removePlaylistItems: jest.fn(),
    };
    spotifyAuthorizationService = {
      startSpotifyConnection: jest.fn(),
      completeSpotifyConnection: jest.fn(),
      getSpotifyConnection: jest.fn(),
      disconnectSpotify: jest.fn(),
      getValidAccessToken: jest.fn(),
    };
    setlistService = {
      getTopSongs: jest.fn<
        ReturnType<FestivalSetlistService['getTopSongs']>,
        Parameters<FestivalSetlistService['getTopSongs']>
      >(),
    };
    testingModule = await Test.createTestingModule({
      providers: [
        SpotifyPlaylistsService,
        SpotifyPlaylistManagementService,
        SpotifyPlaylistArtistSyncService,
        SpotifyPlaylistTrackMaintenanceService,
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: playlistRepository,
        },
        { provide: getRepositoryToken(Artist), useValue: artistRepository },
        {
          provide: getRepositoryToken(RiffValleyPlaylistArtist),
          useValue: playlistArtistRepository,
        },
        { provide: SpotifyAccountApiService, useValue: spotifyAccountApi },
        {
          provide: SpotifyPlaylistAuthorizationService,
          useValue: spotifyAuthorizationService,
        },
        { provide: FestivalSetlistService, useValue: setlistService },
      ],
    }).compile();
    service = testingModule.get(SpotifyPlaylistsService);
    playlistManagementService = testingModule.get(
      SpotifyPlaylistManagementService,
    );
    jest
      .spyOn(spotifyAuthorizationService, 'getValidAccessToken')
      .mockResolvedValue('token');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testingModule.close();
  });

  it.each([
    ['festival', 'createFestivalPlaylist'],
    ['genre', 'createGenrePlaylist'],
  ] as const)(
    'compensates only the newly created remote %s playlist when the local insert fails',
    async (kind, method) => {
      const events: string[] = [];
      const databaseError = new Error('local insert failed');
      spotifyAccountApi.createPlaylist.mockImplementation(async () => {
        events.push('spotify:create');
        return {
          id: 'playlist-remote',
          name: 'Playlist',
          external_urls: { spotify: 'https://open.spotify.com/playlist/id' },
        };
      });
      playlistRepository.save.mockImplementation(async () => {
        events.push('postgres:save');
        throw databaseError;
      });
      playlistRepository.findOne.mockImplementation(async () => {
        events.push('postgres:confirm-absent');
        return null;
      });
      spotifyAccountApi.removePlaylistFromLibrary.mockImplementation(
        async (_token, playlistId) => {
          events.push(`spotify:remove-new:${playlistId}`);
        },
      );

      const create = service[method].bind(service);
      const creation = create(createPlaylistDto());
      await expect(creation).rejects.toThrow(InternalServerErrorException);
      await expect(creation).rejects.toThrow(
        'https://open.spotify.com/playlist/id',
      );

      expect(events).toEqual([
        'spotify:create',
        'postgres:save',
        'postgres:confirm-absent',
        'spotify:remove-new:playlist-remote',
      ]);
      expect(playlistRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          spotifyPlaylistId: 'playlist-remote',
          type: kind === 'festival' ? 'festival' : 'genero',
        }),
      );
      expect(playlistRepository.save).toHaveBeenCalledTimes(1);
      expect(spotifyAccountApi.removePlaylistFromLibrary).toHaveBeenCalledWith(
        'token',
        'playlist-remote',
      );
    },
  );

  it('does not compensate if the local insert committed despite returning an error', async () => {
    const savedPlaylist = Object.assign(new RiffValleyPlaylist(), playlist, {
      type: RiffValleyPlaylistType.FESTIVAL,
    });
    spotifyAccountApi.createPlaylist.mockResolvedValue({
      id: 'playlist-remote',
      name: 'Playlist',
      external_urls: { spotify: 'https://open.spotify.com/playlist/id' },
    });
    playlistRepository.save.mockRejectedValue(
      new Error('commit response lost'),
    );
    playlistRepository.findOne.mockResolvedValue(savedPlaylist);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(savedPlaylist);

    await expect(
      service.createFestivalPlaylist(createPlaylistDto()),
    ).resolves.toBe(savedPlaylist);

    expect(spotifyAccountApi.removePlaylistFromLibrary).not.toHaveBeenCalled();
  });

  it('returns an explicit recovery link if removing the new remote playlist fails', async () => {
    spotifyAccountApi.createPlaylist.mockResolvedValue({
      id: 'playlist-remote',
      name: 'Playlist',
      external_urls: { spotify: 'https://open.spotify.com/playlist/id' },
    });
    playlistRepository.save.mockRejectedValue(
      new Error('database unavailable'),
    );
    playlistRepository.findOne.mockResolvedValue(null);
    spotifyAccountApi.removePlaylistFromLibrary.mockRejectedValue(
      new BadGatewayException('Spotify library update failed'),
    );

    const create = service.createFestivalPlaylist(createPlaylistDto());
    await expect(create).rejects.toThrow(InternalServerErrorException);
    await expect(create).rejects.toThrow(
      'https://open.spotify.com/playlist/id',
    );
    expect(spotifyAccountApi.removePlaylistFromLibrary).toHaveBeenCalledTimes(
      1,
    );
  });

  it('does not write a local playlist when Spotify creation fails', async () => {
    const spotifyError = new BadGatewayException('Spotify unavailable');
    spotifyAccountApi.createPlaylist.mockRejectedValue(spotifyError);

    await expect(
      service.createFestivalPlaylist(createPlaylistDto()),
    ).rejects.toBe(spotifyError);

    expect(playlistRepository.create).not.toHaveBeenCalled();
    expect(playlistRepository.save).not.toHaveBeenCalled();
  });

  it.each([
    ['festival', 'updateFestivalPlaylist'],
    ['genre', 'updateGenrePlaylist'],
  ] as const)(
    'does not update PostgreSQL if the remote %s metadata update fails',
    async (_kind, method) => {
      const spotifyError = new BadGatewayException('Spotify update failed');
      jest
        .spyOn(playlistManagementService, 'getFestivalPlaylist')
        .mockResolvedValue(playlist);
      jest
        .spyOn(playlistManagementService, 'getGenrePlaylist')
        .mockResolvedValue(playlist);
      spotifyAccountApi.updatePlaylist.mockRejectedValue(spotifyError);

      const update = service[method].bind(service);
      await expect(
        update(
          'playlist-local',
          Object.assign(new UpdateSyncedPlaylistDto(), { name: 'Updated' }),
        ),
      ).rejects.toBe(spotifyError);

      expect(spotifyAccountApi.updatePlaylist).toHaveBeenCalledWith(
        'token',
        'playlist-remote',
        { name: 'Updated' },
      );
      expect(playlistRepository.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['festival', 'updateFestivalPlaylist'],
    ['genre', 'updateGenrePlaylist'],
  ] as const)(
    'converges remote %s metadata when the same update is retried after a local failure',
    async (_kind, method) => {
      const databaseError = new Error('local update failed');
      jest
        .spyOn(playlistManagementService, 'getFestivalPlaylist')
        .mockResolvedValue(playlist);
      jest
        .spyOn(playlistManagementService, 'getGenrePlaylist')
        .mockResolvedValue(playlist);
      playlistRepository.update
        .mockRejectedValueOnce(databaseError)
        .mockResolvedValueOnce(undefined);

      const update = service[method].bind(service);
      const dto = Object.assign(new UpdateSyncedPlaylistDto(), {
        name: 'Updated',
      });
      await expect(update('playlist-local', dto)).rejects.toBe(databaseError);
      await update('playlist-local', dto);

      expect(spotifyAccountApi.updatePlaylist).toHaveBeenCalledTimes(2);
      expect(playlistRepository.update).toHaveBeenCalledTimes(2);
      expect(playlistRepository.update).toHaveBeenLastCalledWith(
        'playlist-local',
        expect.objectContaining({ name: 'Updated' }),
      );
    },
  );

  it.each([
    ['festival', 'updateFestivalPlaylist'],
    ['genre', 'updateGenrePlaylist'],
  ] as const)(
    'leaves remote %s metadata changed if the local update fails',
    async (_kind, method) => {
      const events: string[] = [];
      const databaseError = new Error('local update failed');
      jest
        .spyOn(playlistManagementService, 'getFestivalPlaylist')
        .mockResolvedValue(playlist);
      jest
        .spyOn(playlistManagementService, 'getGenrePlaylist')
        .mockResolvedValue(playlist);
      spotifyAccountApi.updatePlaylist.mockImplementation(async () => {
        events.push('spotify:update');
      });
      playlistRepository.update.mockImplementation(async () => {
        events.push('postgres:update');
        throw databaseError;
      });

      const update = service[method].bind(service);
      await expect(
        update(
          'playlist-local',
          Object.assign(new UpdateSyncedPlaylistDto(), { name: 'Updated' }),
        ),
      ).rejects.toBe(databaseError);

      expect(events).toEqual(['spotify:update', 'postgres:update']);
    },
  );

  it.each([
    ['festival', 'updateFestivalPlaylist'],
    ['genre', 'updateGenrePlaylist'],
  ] as const)(
    'converges remote %s metadata after Spotify writes the name but its response times out',
    async (_kind, method) => {
      const events: string[] = [];
      const remoteTimeout = new BadGatewayException(
        'Spotify timed out after writing the name',
      );
      let remoteName = 'Before';
      jest
        .spyOn(playlistManagementService, 'getFestivalPlaylist')
        .mockResolvedValue(playlist);
      jest
        .spyOn(playlistManagementService, 'getGenrePlaylist')
        .mockResolvedValue(playlist);
      spotifyAccountApi.updatePlaylist.mockImplementation(
        async (
          _token: string,
          _playlistId: string,
          update: { name?: string },
        ) => {
          events.push('spotify:update');
          if (update.name !== undefined) remoteName = update.name;
          if (
            events.filter((event) => event === 'spotify:update').length === 1
          ) {
            throw remoteTimeout;
          }
        },
      );
      playlistRepository.update.mockImplementation(async (_id, values) => {
        events.push('postgres:update');
        expect(values).toEqual(
          expect.objectContaining({
            name: 'Updated',
            updateDate: expect.any(Date),
          }),
        );
        return updateResult();
      });

      const update = service[method].bind(service);
      const dto = Object.assign(new UpdateSyncedPlaylistDto(), {
        name: 'Updated',
      });
      await expect(update('playlist-local', dto)).rejects.toBe(remoteTimeout);
      expect(remoteName).toBe('Updated');
      expect(playlistRepository.update).not.toHaveBeenCalled();

      await update('playlist-local', dto);

      expect(remoteName).toBe('Updated');
      expect(events).toEqual([
        'spotify:update',
        'spotify:update',
        'postgres:update',
      ]);
      expect(spotifyAccountApi.updatePlaylist).toHaveBeenCalledTimes(2);
      expect(playlistRepository.update).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the prior local cover URL if Spotify accepts the image but reading metadata fails', async () => {
    const events: string[] = [];
    const spotifyError = new BadGatewayException('image metadata unavailable');
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    spotifyAccountApi.uploadPlaylistImage.mockImplementation(async () => {
      events.push('spotify:upload');
    });
    spotifyAccountApi.getPlaylistImages.mockImplementation(async () => {
      events.push('spotify:read-images');
      throw spotifyError;
    });

    await expect(
      service.updateFestivalPlaylistImage('playlist-local', image),
    ).rejects.toBe(spotifyError);

    expect(events).toEqual(['spotify:upload', 'spotify:read-images']);
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('leaves the remote cover changed if the local cover update fails', async () => {
    const events: string[] = [];
    const databaseError = new Error('local image update failed');
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    spotifyAccountApi.uploadPlaylistImage.mockImplementation(async () => {
      events.push('spotify:upload');
    });
    spotifyAccountApi.getPlaylistImages.mockImplementation(async () => {
      events.push('spotify:read-images');
      return [spotifyImage('https://image.test/new.jpg')];
    });
    playlistRepository.update.mockImplementation(async () => {
      events.push('postgres:update-image');
      throw databaseError;
    });

    await expect(
      service.updateFestivalPlaylistImage('playlist-local', image),
    ).rejects.toBe(databaseError);

    expect(events).toEqual([
      'spotify:upload',
      'spotify:read-images',
      'postgres:update-image',
    ]);
  });

  it('converges the cover metadata when the identical image is retried', async () => {
    const databaseError = new Error('local image update failed');
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    spotifyAccountApi.getPlaylistImages.mockResolvedValue([
      spotifyImage('https://image.test/new.jpg'),
    ]);
    playlistRepository.update
      .mockRejectedValueOnce(databaseError)
      .mockResolvedValueOnce(updateResult());

    await expect(
      service.updateFestivalPlaylistImage('playlist-local', image),
    ).rejects.toBe(databaseError);
    await service.updateFestivalPlaylistImage('playlist-local', image);

    expect(spotifyAccountApi.uploadPlaylistImage).toHaveBeenCalledTimes(2);
    expect(spotifyAccountApi.uploadPlaylistImage).toHaveBeenNthCalledWith(
      2,
      'token',
      'playlist-remote',
      image.toString('base64'),
    );
    expect(playlistRepository.update).toHaveBeenLastCalledWith(
      'playlist-local',
      expect.objectContaining({ imageUrl: 'https://image.test/new.jpg' }),
    );
  });

  it('records FAILED with no tracks when automatic track addition fails remotely', async () => {
    const association = playlistArtistFixture({
      id: 'association-id',
      status: PlaylistArtistSyncStatus.SYNCING,
      tracks: [],
      lastError: null,
    });
    const spotifyError = new BadGatewayException('Spotify add failed');
    playlistArtistRepository.create.mockReturnValue(association);
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    playlistArtistRepository.save.mockImplementation(async (value) =>
      savedPlaylistArtistFixture(value),
    );
    artistRepository.findOneBy.mockResolvedValue(artistFixture());
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    jest.spyOn(setlistService, 'getTopSongs').mockResolvedValue({
      artist: 'Band',
      setlistsAnalyzed: 1,
      songs: [{ name: 'Song', plays: 1 }],
      sources: [],
    });
    spotifyAccountApi.searchTracks.mockResolvedValue([
      spotifyTrack('track-id', 'Song'),
    ]);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([]);
    spotifyAccountApi.addPlaylistItems.mockRejectedValue(spotifyError);

    await expect(
      service.addArtist('playlist-local', syncPlaylistArtistDto('artist-id')),
    ).rejects.toBe(spotifyError);

    expect(playlistArtistRepository.save).toHaveBeenCalledTimes(2);
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        tracks: [],
        lastError: 'Spotify add failed',
      }),
    );
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('keeps a FAILED association with selected tracks when Spotify add succeeds but the final local save fails', async () => {
    const events: string[] = [];
    const association = playlistArtistFixture({
      id: 'association-id',
      status: PlaylistArtistSyncStatus.SYNCING,
      tracks: [],
      lastError: null,
    });
    const databaseError = new Error('association save failed');
    let failedSyncedSave = false;
    playlistArtistRepository.create.mockReturnValue(association);
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    playlistArtistRepository.save.mockImplementation(async (value) => {
      events.push(`postgres:association:${value.status}`);
      if (value.status === 'synced' && !failedSyncedSave) {
        failedSyncedSave = true;
        throw databaseError;
      }
      return savedPlaylistArtistFixture(value);
    });
    artistRepository.findOneBy.mockResolvedValue(artistFixture());
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    jest.spyOn(setlistService, 'getTopSongs').mockResolvedValue({
      artist: 'Band',
      setlistsAnalyzed: 1,
      songs: [{ name: 'Song', plays: 1 }],
      sources: [],
    });
    spotifyAccountApi.searchTracks.mockResolvedValue([
      spotifyTrack('track-id', 'Song'),
    ]);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([]);
    spotifyAccountApi.addPlaylistItems.mockImplementation(async () => {
      events.push('spotify:add');
    });

    await expect(
      service.addArtist('playlist-local', syncPlaylistArtistDto('artist-id')),
    ).rejects.toBe(databaseError);

    expect(events).toEqual([
      'postgres:association:syncing',
      'spotify:add',
      'postgres:association:synced',
      'postgres:association:failed',
    ]);
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        tracks: [expect.objectContaining({ uri: 'spotify:track:track-id' })],
        lastError: 'association save failed',
      }),
    );
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('can retry automatic addition without duplicating a track written before a Spotify timeout', async () => {
    const association = playlistArtistFixture({
      id: 'association-id',
      status: PlaylistArtistSyncStatus.FAILED,
      tracks: [],
      lastError: null,
    });
    const remoteUris: string[] = [];
    let addCalls = 0;
    playlistArtistRepository.create.mockReturnValue(association);
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    playlistArtistRepository.save.mockImplementation(async (value) =>
      savedPlaylistArtistFixture(value),
    );
    artistRepository.findOneBy.mockResolvedValue(artistFixture());
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    jest.spyOn(setlistService, 'getTopSongs').mockResolvedValue({
      artist: 'Band',
      setlistsAnalyzed: 1,
      songs: [{ name: 'Song', plays: 1 }],
      sources: [],
    });
    spotifyAccountApi.searchTracks.mockResolvedValue([
      spotifyTrack('track-id', 'Song'),
    ]);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockImplementation(
      async () => remoteUris,
    );
    spotifyAccountApi.addPlaylistItems.mockImplementation(
      async (_token, _id, uris) => {
        addCalls += 1;
        remoteUris.push(...uris);
        if (addCalls === 1) {
          throw new BadGatewayException('Spotify timed out after writing');
        }
      },
    );

    await expect(
      service.addArtist('playlist-local', syncPlaylistArtistDto('artist-id')),
    ).rejects.toThrow('Spotify timed out after writing');
    expect(association).toEqual(
      expect.objectContaining({
        status: 'failed',
        tracks: [],
      }),
    );
    expect(remoteUris).toEqual(['spotify:track:track-id']);

    await service.addArtist(
      'playlist-local',
      syncPlaylistArtistDto('artist-id'),
    );

    expect(addCalls).toBe(1);
    expect(association).toEqual(
      expect.objectContaining({
        status: 'synced',
        tracks: [expect.objectContaining({ uri: 'spotify:track:track-id' })],
      }),
    );
  });

  it('leaves old local genre tracks and FAILED status when adding replacements succeeds but removing old tracks fails', async () => {
    const events: string[] = [];
    const association = playlistArtistFixture({
      id: 'association-id',
      riffValleyPlaylistId: 'playlist-local',
      artistId: 'artist-id',
      status: PlaylistArtistSyncStatus.SYNCED,
      tracks: [playlistTrackFixture('spotify:track:old')],
      lastError: null,
    });
    const spotifyError = new BadGatewayException('Spotify remove failed');
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    playlistArtistRepository.save.mockImplementation(async (value) => {
      events.push(`postgres:association:${value.status}`);
      return savedPlaylistArtistFixture(value);
    });
    artistRepository.findOneBy.mockResolvedValue(artistFixture());
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(playlist);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([
      'spotify:track:old',
    ]);
    spotifyAccountApi.getTracks.mockResolvedValue([
      {
        id: 'new',
        name: 'New song',
        uri: 'spotify:track:new',
        external_urls: { spotify: 'https://open.spotify.com/track/new' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
      {
        id: 'second',
        name: 'Second song',
        uri: 'spotify:track:second',
        external_urls: { spotify: 'https://open.spotify.com/track/second' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
    ]);
    spotifyAccountApi.addPlaylistItems.mockImplementation(async () => {
      events.push('spotify:add-new');
    });
    spotifyAccountApi.removePlaylistItems.mockImplementation(async () => {
      events.push('spotify:remove-old');
      throw spotifyError;
    });

    await expect(
      service.replaceGenreArtistTracks('playlist-local', 'artist-id', [
        'new',
        'second',
      ]),
    ).rejects.toBe(spotifyError);

    expect(events).toEqual([
      'postgres:association:syncing',
      'spotify:add-new',
      'spotify:remove-old',
      'postgres:association:failed',
    ]);
    expect(association).toEqual(
      expect.objectContaining({
        status: 'failed',
        tracks: [expect.objectContaining({ uri: 'spotify:track:old' })],
        lastError: 'Spotify remove failed',
      }),
    );
  });

  it('retries a genre replacement after Spotify removed old tracks before timing out', async () => {
    const association = playlistArtistFixture({
      id: 'association-id',
      riffValleyPlaylistId: 'playlist-local',
      artistId: 'artist-id',
      status: PlaylistArtistSyncStatus.SYNCED,
      tracks: [playlistTrackFixture('spotify:track:old')],
      lastError: null,
    });
    const remoteUris = ['spotify:track:old'];
    let removalApplied = false;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    playlistArtistRepository.save.mockImplementation(async (value) =>
      savedPlaylistArtistFixture(value),
    );
    artistRepository.findOneBy.mockResolvedValue(artistFixture());
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(playlist);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockImplementation(async () => [
      ...remoteUris,
    ]);
    spotifyAccountApi.getTracks.mockResolvedValue([
      {
        id: 'new',
        name: 'New song',
        uri: 'spotify:track:new',
        external_urls: { spotify: 'https://open.spotify.com/track/new' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
      {
        id: 'second',
        name: 'Second song',
        uri: 'spotify:track:second',
        external_urls: { spotify: 'https://open.spotify.com/track/second' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
    ]);
    spotifyAccountApi.addPlaylistItems.mockImplementation(
      async (_token, _id, uris: string[]) => {
        remoteUris.push(...uris);
      },
    );
    spotifyAccountApi.removePlaylistItems.mockImplementation(
      async (_token, _id, uris: string[]) => {
        const removed = new Set(uris);
        for (let index = remoteUris.length - 1; index >= 0; index -= 1) {
          if (removed.has(remoteUris[index])) remoteUris.splice(index, 1);
        }
        if (!removalApplied) {
          removalApplied = true;
          throw new BadGatewayException(
            'Spotify timed out after removing old tracks',
          );
        }
      },
    );

    await expect(
      service.replaceGenreArtistTracks('playlist-local', 'artist-id', [
        'new',
        'second',
      ]),
    ).rejects.toThrow('Spotify timed out after removing old tracks');
    expect(remoteUris).toEqual(['spotify:track:new', 'spotify:track:second']);
    expect(association.status).toBe('failed');

    await service.replaceGenreArtistTracks('playlist-local', 'artist-id', [
      'new',
      'second',
    ]);

    expect(remoteUris).toEqual(['spotify:track:new', 'spotify:track:second']);
    expect(spotifyAccountApi.addPlaylistItems).toHaveBeenCalledTimes(1);
    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenCalledTimes(1);
    expect(association).toEqual(
      expect.objectContaining({
        status: 'synced',
        tracks: [
          expect.objectContaining({ uri: 'spotify:track:new' }),
          expect.objectContaining({ uri: 'spotify:track:second' }),
        ],
      }),
    );
  });

  it('recovers a genre addition after Spotify added tracks before timing out', async () => {
    const association = playlistArtistFixture({
      id: 'association-id',
      riffValleyPlaylistId: 'playlist-local',
      artistId: 'artist-id',
      status: PlaylistArtistSyncStatus.SYNCING,
      tracks: [],
      lastError: null,
    });
    const remoteUris: string[] = [];
    let addApplied = false;
    playlistArtistRepository.create.mockReturnValue(association);
    playlistArtistRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    playlistArtistRepository.save.mockImplementation(async (value) =>
      savedPlaylistArtistFixture(value),
    );
    artistRepository.findOneBy.mockResolvedValue(artistFixture());
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(playlist);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockImplementation(async () => [
      ...remoteUris,
    ]);
    spotifyAccountApi.getTracks.mockResolvedValue([
      {
        id: 'first',
        name: 'First song',
        uri: 'spotify:track:first',
        external_urls: { spotify: 'https://open.spotify.com/track/first' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
      {
        id: 'second',
        name: 'Second song',
        uri: 'spotify:track:second',
        external_urls: { spotify: 'https://open.spotify.com/track/second' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
    ]);
    spotifyAccountApi.addPlaylistItems.mockImplementation(
      async (_token, _id, uris: string[]) => {
        remoteUris.push(...uris);
        if (!addApplied) {
          addApplied = true;
          throw new BadGatewayException(
            'Spotify timed out after adding tracks',
          );
        }
      },
    );

    await expect(
      service.addGenreArtist('playlist-local', 'artist-id', [
        'first',
        'second',
      ]),
    ).rejects.toThrow('Spotify timed out after adding tracks');
    expect(remoteUris).toEqual(['spotify:track:first', 'spotify:track:second']);

    await service.replaceGenreArtistTracks('playlist-local', 'artist-id', [
      'first',
      'second',
    ]);

    expect(remoteUris).toEqual(['spotify:track:first', 'spotify:track:second']);
    expect(spotifyAccountApi.addPlaylistItems).toHaveBeenCalledTimes(1);
    expect(association).toEqual(
      expect.objectContaining({
        status: 'synced',
        tracks: [
          expect.objectContaining({ uri: 'spotify:track:first' }),
          expect.objectContaining({ uri: 'spotify:track:second' }),
        ],
      }),
    );
  });

  it('records FAILED with replacement tracks if Spotify completes a genre swap but PostgreSQL save fails', async () => {
    const events: string[] = [];
    const association = playlistArtistFixture({
      id: 'association-id',
      riffValleyPlaylistId: 'playlist-local',
      artistId: 'artist-id',
      status: PlaylistArtistSyncStatus.SYNCED,
      tracks: [playlistTrackFixture('spotify:track:old')],
      lastError: null,
    });
    const databaseError = new Error('replacement save failed');
    let failedSyncedSave = false;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    playlistArtistRepository.save.mockImplementation(async (value) => {
      events.push(`postgres:association:${value.status}`);
      if (value.status === 'synced' && !failedSyncedSave) {
        failedSyncedSave = true;
        throw databaseError;
      }
      return savedPlaylistArtistFixture(value);
    });
    artistRepository.findOneBy.mockResolvedValue(artistFixture());
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(playlist);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([
      'spotify:track:old',
    ]);
    spotifyAccountApi.getTracks.mockResolvedValue([
      {
        id: 'new',
        name: 'New song',
        uri: 'spotify:track:new',
        external_urls: { spotify: 'https://open.spotify.com/track/new' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
      {
        id: 'second',
        name: 'Second song',
        uri: 'spotify:track:second',
        external_urls: { spotify: 'https://open.spotify.com/track/second' },
        artists: [{ id: 'spotify-artist', name: 'Band' }],
      },
    ]);
    spotifyAccountApi.addPlaylistItems.mockImplementation(async () => {
      events.push('spotify:add-new');
    });
    spotifyAccountApi.removePlaylistItems.mockImplementation(async () => {
      events.push('spotify:remove-old');
    });

    await expect(
      service.replaceGenreArtistTracks('playlist-local', 'artist-id', [
        'new',
        'second',
      ]),
    ).rejects.toBe(databaseError);

    expect(events).toEqual([
      'postgres:association:syncing',
      'spotify:add-new',
      'spotify:remove-old',
      'postgres:association:synced',
      'postgres:association:failed',
    ]);
    expect(association).toEqual(
      expect.objectContaining({
        status: 'failed',
        tracks: [
          expect.objectContaining({ uri: 'spotify:track:new' }),
          expect.objectContaining({ uri: 'spotify:track:second' }),
        ],
        lastError: 'replacement save failed',
      }),
    );
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('keeps the remote clear partial and skips local deletion until retry', async () => {
    let remainingUris = Array.from(
      { length: 205 },
      (_, index) => `spotify:track:${index}`,
    );
    let removeCalls = 0;
    const initialUris = [...remainingUris];
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    spotifyAccountApi.getPlaylistTrackUris.mockImplementation(async () => [
      ...remainingUris,
    ]);
    spotifyAccountApi.removePlaylistItems.mockImplementation(
      async (_token, _playlistId, batch: string[]) => {
        removeCalls += 1;
        const removedUris = new Set(batch);
        remainingUris = remainingUris.filter((uri) => !removedUris.has(uri));
        if (removeCalls === 2) {
          throw new BadGatewayException('second batch timed out after removal');
        }
      },
    );

    await expect(
      service.clearFestivalPlaylist('playlist-local'),
    ).rejects.toThrow('second batch timed out after removal');

    expect(spotifyAccountApi.removePlaylistItems.mock.calls[0][2]).toEqual(
      initialUris.slice(0, 100),
    );
    expect(spotifyAccountApi.removePlaylistItems.mock.calls[1][2]).toEqual(
      initialUris.slice(100, 200),
    );
    expect(remainingUris).toEqual(initialUris.slice(200));
    expect(playlistArtistRepository.delete).not.toHaveBeenCalled();
    expect(playlistRepository.update).not.toHaveBeenCalled();

    await service.clearFestivalPlaylist('playlist-local');

    expect(remainingUris).toEqual([]);
    expect(playlistArtistRepository.delete).toHaveBeenCalledTimes(1);
    expect(playlistRepository.update).toHaveBeenCalledWith(
      'playlist-local',
      expect.objectContaining({
        protectedTrackUris: [],
        updateDate: expect.any(Date),
      }),
    );
  });

  it('leaves remote tracks cleared and local associations intact if PostgreSQL delete fails', async () => {
    const databaseError = new Error('association delete failed');
    const remoteUris = ['spotify:track:one'];
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    spotifyAccountApi.getPlaylistTrackUris.mockImplementation(async () => [
      ...remoteUris,
    ]);
    spotifyAccountApi.removePlaylistItems.mockImplementation(
      async (_token, _playlistId, batch: string[]) => {
        const removed = new Set(batch);
        for (let index = remoteUris.length - 1; index >= 0; index -= 1) {
          if (removed.has(remoteUris[index])) remoteUris.splice(index, 1);
        }
      },
    );
    playlistArtistRepository.delete
      .mockRejectedValueOnce(databaseError)
      .mockResolvedValueOnce(undefined);

    await expect(service.clearFestivalPlaylist('playlist-local')).rejects.toBe(
      databaseError,
    );

    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenCalledWith(
      'token',
      'playlist-remote',
      ['spotify:track:one'],
    );
    expect(playlistArtistRepository.delete).toHaveBeenCalledWith({
      riffValleyPlaylistId: 'playlist-local',
    });
    expect(playlistRepository.update).not.toHaveBeenCalled();

    await service.clearFestivalPlaylist('playlist-local');

    expect(remoteUris).toEqual([]);
    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenCalledTimes(1);
    expect(playlistArtistRepository.delete).toHaveBeenCalledTimes(2);
    expect(playlistRepository.update).toHaveBeenCalledWith(
      'playlist-local',
      expect.objectContaining({ protectedTrackUris: [] }),
    );
  });

  it('retries local playlist cleanup if PostgreSQL update fails after associations were deleted', async () => {
    const databaseError = new Error('protected URI cleanup failed');
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([]);
    playlistArtistRepository.delete.mockResolvedValue(undefined);
    playlistRepository.update
      .mockRejectedValueOnce(databaseError)
      .mockResolvedValueOnce(undefined);

    await expect(service.clearFestivalPlaylist('playlist-local')).rejects.toBe(
      databaseError,
    );
    await service.clearFestivalPlaylist('playlist-local');

    expect(spotifyAccountApi.removePlaylistItems).not.toHaveBeenCalled();
    expect(playlistArtistRepository.delete).toHaveBeenCalledTimes(2);
    expect(playlistRepository.update).toHaveBeenCalledTimes(2);
    expect(playlistRepository.update).toHaveBeenLastCalledWith(
      'playlist-local',
      expect.objectContaining({ protectedTrackUris: [] }),
    );
  });
});
