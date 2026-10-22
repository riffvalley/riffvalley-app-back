import { SpotifyPlaylistArtistSyncService } from '../spotify-playlist-artist-sync.service';
import { SpotifyPlaylistManagementService } from '../../management/spotify-playlist-management.service';
import { SpotifyPlaylistAuthorizationService } from '../../spotify-authorization/spotify-playlist-authorization.service';
import { FestivalSetlistService } from '../../setlist/festival-setlist.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepPartial, Repository } from 'typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import {
  PlaylistArtistSelectionMode,
  PlaylistArtistSyncStatus,
  PlaylistTrackRecord,
  RiffValleyPlaylistArtist,
} from '../../entities/riff-valley-playlist-artist.entity';
import {
  SpotifyAccountApiService,
  SpotifyTrack,
} from 'src/integrations/spotify-integration/api';

type FestivalSetlistServiceMock = jest.Mocked<
  Pick<FestivalSetlistService, 'getTopSongs'>
>;
type RiffValleyPlaylistRepositoryMock = jest.Mocked<
  Pick<Repository<RiffValleyPlaylist>, 'update'>
> & {
  save: jest.MockedFunction<
    (entity: DeepPartial<RiffValleyPlaylist>) => Promise<RiffValleyPlaylist>
  >;
};
type ArtistRepositoryMock = jest.Mocked<Pick<Repository<Artist>, 'findOneBy'>>;
type PlaylistArtistRepositoryMock = jest.Mocked<
  Pick<Repository<RiffValleyPlaylistArtist>, 'findOne' | 'find'>
> & {
  create: jest.MockedFunction<
    (
      entityLike: DeepPartial<RiffValleyPlaylistArtist>,
    ) => RiffValleyPlaylistArtist
  >;
  save: jest.MockedFunction<
    (
      entity: DeepPartial<RiffValleyPlaylistArtist>,
    ) => Promise<RiffValleyPlaylistArtist>
  >;
  remove: jest.MockedFunction<
    (entity: RiffValleyPlaylistArtist) => Promise<RiffValleyPlaylistArtist>
  >;
};
type SpotifyAccountApiMock = jest.Mocked<
  Pick<
    SpotifyAccountApiService,
    | 'getPlaylistTrackUris'
    | 'searchTracks'
    | 'getTracks'
    | 'addPlaylistItems'
    | 'removePlaylistItems'
  >
>;
type SpotifyAuthorizationServiceMock = jest.Mocked<
  Pick<SpotifyPlaylistAuthorizationService, 'getValidAccessToken'>
>;
type SpotifyPlaylistManagementServiceMock = jest.Mocked<
  Pick<
    SpotifyPlaylistManagementService,
    'getFestivalPlaylist' | 'getGenrePlaylist'
  >
>;

const playlistRecord = (
  value: Partial<RiffValleyPlaylist>,
): RiffValleyPlaylist => value as RiffValleyPlaylist;

const spotifyTrack = (
  id: string,
  name: string,
  artistName = 'Ghost',
): SpotifyTrack => ({
  id,
  name,
  uri: `spotify:track:${id}`,
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  artists: [{ id: 'artist-id', name: artistName }],
});
const artistRecord = (name: string): Artist =>
  Object.assign(new Artist(), {
    id: 'artist-id',
    name,
    nameNormalized: name.toLowerCase(),
    description: '',
    image: '',
    countryId: '',
    needsReview: false,
    updatedAt: new Date(),
    country: new Country(),
    disc: [],
  });
const playlistTrackRecord = (uri: string): PlaylistTrackRecord => ({
  spotifyTrackId: uri.split(':').at(-1) ?? uri,
  uri,
  name: 'Shared track',
  url: 'https://open.spotify.com/track/shared',
  plays: 1,
});
const playlistArtistRecord = (
  id: string,
  tracks: PlaylistTrackRecord[],
): RiffValleyPlaylistArtist => ({
  id,
  riffValleyPlaylistId: 'playlist-local',
  riffValleyPlaylist: playlistRecord({ id: 'playlist-local' }),
  artistId: 'artist-id',
  artist: artistRecord('Ghost'),
  status: PlaylistArtistSyncStatus.SYNCED,
  selectionMode: PlaylistArtistSelectionMode.MANUAL,
  spotifyArtistId: null,
  tracks,
  setlistsAnalyzed: 0,
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('SpotifyPlaylistArtistSyncService', () => {
  let artistSyncService: SpotifyPlaylistArtistSyncService;
  let testingModule: TestingModule;
  let riffValleyPlaylistRepository: RiffValleyPlaylistRepositoryMock;
  let artistRepository: ArtistRepositoryMock;
  let playlistArtistRepository: PlaylistArtistRepositoryMock;
  let spotifyAccountApi: SpotifyAccountApiMock;
  let spotifyAuthorizationService: SpotifyAuthorizationServiceMock;
  let setlistService: FestivalSetlistServiceMock;
  let playlistManagementService: SpotifyPlaylistManagementServiceMock;

  beforeEach(async () => {
    riffValleyPlaylistRepository = {
      update: jest
        .fn<
          ReturnType<Repository<RiffValleyPlaylist>['update']>,
          Parameters<Repository<RiffValleyPlaylist>['update']>
        >()
        .mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] }),
      save: jest
        .fn<
          Promise<RiffValleyPlaylist>,
          [entity: DeepPartial<RiffValleyPlaylist>]
        >()
        .mockResolvedValue(new RiffValleyPlaylist()),
    };
    artistRepository = {
      findOneBy: jest.fn<
        ReturnType<Repository<Artist>['findOneBy']>,
        Parameters<Repository<Artist>['findOneBy']>
      >(),
    };
    playlistArtistRepository = {
      findOne: jest.fn<
        ReturnType<Repository<RiffValleyPlaylistArtist>['findOne']>,
        Parameters<Repository<RiffValleyPlaylistArtist>['findOne']>
      >(),
      find: jest.fn<
        ReturnType<Repository<RiffValleyPlaylistArtist>['find']>,
        Parameters<Repository<RiffValleyPlaylistArtist>['find']>
      >(),
      create: jest
        .fn<
          RiffValleyPlaylistArtist,
          [entityLike: DeepPartial<RiffValleyPlaylistArtist>]
        >()
        .mockImplementation((value) =>
          Object.assign(new RiffValleyPlaylistArtist(), {
            id: 'association-id',
            ...value,
          }),
        ),
      save: jest
        .fn<
          Promise<RiffValleyPlaylistArtist>,
          [entity: DeepPartial<RiffValleyPlaylistArtist>]
        >()
        .mockResolvedValue(new RiffValleyPlaylistArtist()),
      remove: jest
        .fn<
          Promise<RiffValleyPlaylistArtist>,
          [entity: RiffValleyPlaylistArtist]
        >()
        .mockResolvedValue(new RiffValleyPlaylistArtist()),
    };
    spotifyAccountApi = {
      getPlaylistTrackUris: jest
        .fn<
          ReturnType<SpotifyAccountApiService['getPlaylistTrackUris']>,
          Parameters<SpotifyAccountApiService['getPlaylistTrackUris']>
        >()
        .mockResolvedValue([]),
      searchTracks: jest
        .fn<
          ReturnType<SpotifyAccountApiService['searchTracks']>,
          Parameters<SpotifyAccountApiService['searchTracks']>
        >()
        .mockResolvedValue([]),
      getTracks: jest
        .fn<
          ReturnType<SpotifyAccountApiService['getTracks']>,
          Parameters<SpotifyAccountApiService['getTracks']>
        >()
        .mockResolvedValue([]),
      addPlaylistItems: jest
        .fn<
          ReturnType<SpotifyAccountApiService['addPlaylistItems']>,
          Parameters<SpotifyAccountApiService['addPlaylistItems']>
        >()
        .mockResolvedValue(undefined),
      removePlaylistItems: jest
        .fn<
          ReturnType<SpotifyAccountApiService['removePlaylistItems']>,
          Parameters<SpotifyAccountApiService['removePlaylistItems']>
        >()
        .mockResolvedValue(undefined),
    };
    spotifyAuthorizationService = {
      getValidAccessToken: jest
        .fn<
          ReturnType<
            SpotifyPlaylistAuthorizationService['getValidAccessToken']
          >,
          Parameters<SpotifyPlaylistAuthorizationService['getValidAccessToken']>
        >()
        .mockResolvedValue('access-token'),
    };
    setlistService = {
      getTopSongs: jest.fn<
        ReturnType<FestivalSetlistService['getTopSongs']>,
        Parameters<FestivalSetlistService['getTopSongs']>
      >(),
    };
    playlistManagementService = {
      getFestivalPlaylist: jest.fn<
        ReturnType<SpotifyPlaylistManagementService['getFestivalPlaylist']>,
        Parameters<SpotifyPlaylistManagementService['getFestivalPlaylist']>
      >(),
      getGenrePlaylist: jest.fn<
        ReturnType<SpotifyPlaylistManagementService['getGenrePlaylist']>,
        Parameters<SpotifyPlaylistManagementService['getGenrePlaylist']>
      >(),
    };
    testingModule = await Test.createTestingModule({
      providers: [
        SpotifyPlaylistArtistSyncService,
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: riffValleyPlaylistRepository,
        },
        {
          provide: getRepositoryToken(Artist),
          useValue: artistRepository,
        },
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
        {
          provide: SpotifyPlaylistManagementService,
          useValue: playlistManagementService,
        },
      ],
    }).compile();
    artistSyncService = testingModule.get(SpotifyPlaylistArtistSyncService);
  });

  afterEach(async () => {
    await testingModule.close();
    jest.restoreAllMocks();
  });

  it('añade inmediatamente a Spotify las pistas resueltas de un artista', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      updateDate: new Date(),
    } as RiffValleyPlaylist;
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Ghost'));
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    jest.spyOn(setlistService, 'getTopSongs').mockResolvedValue({
      artist: 'Ghost',
      setlistsAnalyzed: 10,
      songs: [{ name: 'Square Hammer', plays: 8 }],
      sources: [],
    });
    jest
      .spyOn(spotifyAuthorizationService, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    spotifyAccountApi.searchTracks.mockResolvedValue([
      spotifyTrack('track-id', 'Square Hammer'),
    ]);
    spotifyAccountApi.addPlaylistItems.mockResolvedValue(undefined);

    await artistSyncService.addArtist(playlist.id, {
      artistId: 'artist-id',
      tracksPerArtist: 10,
      recentSetlists: 10,
    });

    expect(spotifyAccountApi.addPlaylistItems).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      ['spotify:track:track-id'],
    );
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'synced',
        tracks: [expect.objectContaining({ spotifyTrackId: 'track-id' })],
      }),
    );
    expect(riffValleyPlaylistRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({ updateDate: expect.any(Date) }),
    );
    expect(riffValleyPlaylistRepository.save).not.toHaveBeenCalled();
  });

  it('no duplica una pista que ya existe en la playlist real', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
    } as RiffValleyPlaylist;
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Ghost'));
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    jest.spyOn(setlistService, 'getTopSongs').mockResolvedValue({
      artist: 'Ghost',
      setlistsAnalyzed: 10,
      songs: [{ name: 'Square Hammer', plays: 8 }],
      sources: [],
    });
    jest
      .spyOn(spotifyAuthorizationService, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    spotifyAccountApi.searchTracks.mockResolvedValue([
      spotifyTrack('track-id', 'Square Hammer'),
    ]);
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([
      'spotify:track:track-id',
    ]);
    spotifyAccountApi.addPlaylistItems.mockResolvedValue(undefined);

    await artistSyncService.addArtist(playlist.id, {
      artistId: 'artist-id',
      tracksPerArtist: 10,
      recentSetlists: 10,
    });

    expect(spotifyAccountApi.addPlaylistItems).not.toHaveBeenCalled();
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'synced',
        tracks: [expect.objectContaining({ spotifyTrackId: 'track-id' })],
      }),
    );
  });

  it('busca tracks con consulta normalizada y serializa el mismo payload de búsqueda', async () => {
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Björk'));
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(playlistRecord({ id: 'genre-id' }));
    spotifyAccountApi.searchTracks.mockResolvedValue([
      {
        id: 'track-id',
        name: 'Jóga',
        uri: 'spotify:track:joga',
        external_urls: { spotify: 'https://open.spotify.com/track/joga' },
        artists: [{ id: 'artist-id', name: 'Björk' }],
        album: {
          name: 'Homogenic',
          images: [{ url: 'https://image.test', height: 300, width: 300 }],
        },
        duration_ms: 240000,
      },
    ]);

    await expect(
      artistSyncService.searchGenreArtistTracks(
        'genre-id',
        'artist-id',
        '  Jóga  ',
      ),
    ).resolves.toEqual({
      artist: { id: 'artist-id', name: 'Björk' },
      query: 'Jóga',
      tracks: [
        expect.objectContaining({
          spotifyTrackId: 'track-id',
          imageUrl: 'https://image.test',
        }),
      ],
    });
    expect(spotifyAccountApi.searchTracks).toHaveBeenCalledWith(
      'access-token',
      'track:Jóga artist:Björk',
      20,
    );
  });

  it('mantiene el matching normalizado, la consulta secuencial y el orden/deduplicación por URI', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
    } as RiffValleyPlaylist;
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Björk'));
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    setlistService.getTopSongs.mockResolvedValue({
      artist: 'Björk',
      setlistsAnalyzed: 3,
      songs: [
        { name: 'Song one', plays: 3 },
        { name: 'Song two', plays: 2 },
        { name: 'Song three', plays: 1 },
      ],
      sources: [],
    });
    const track = (id: string, uri: string, artistName: string) => ({
      id,
      name: id,
      uri,
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
      artists: [{ id: `artist-${id}`, name: artistName }],
    });
    spotifyAccountApi.searchTracks
      .mockResolvedValueOnce([
        track('wrong', 'spotify:track:wrong', 'Björk tribute'),
        track('first', 'spotify:track:first', 'Bjork'),
      ])
      .mockResolvedValueOnce([
        track('duplicate', 'spotify:track:first', 'BJÖRK'),
      ])
      .mockResolvedValueOnce([
        track('second', 'spotify:track:second', 'Bjork'),
      ]);

    await artistSyncService.addArtist('playlist-local', {
      artistId: 'artist-id',
      tracksPerArtist: 3,
      recentSetlists: 3,
    });

    expect(
      spotifyAccountApi.searchTracks.mock.calls.map((call) => call[1]),
    ).toEqual([
      'track:Song one artist:Björk',
      'track:Song two artist:Björk',
      'track:Song three artist:Björk',
    ]);
    expect(spotifyAccountApi.addPlaylistItems).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      ['spotify:track:first', 'spotify:track:second'],
    );
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'synced',
        setlistsAnalyzed: 3,
        tracks: [
          expect.objectContaining({ spotifyTrackId: 'first', plays: 3 }),
          expect.objectContaining({ spotifyTrackId: 'second', plays: 1 }),
        ],
      }),
    );
  });

  it('al quitar un artista conserva las pistas compartidas por otro', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      updateDate: new Date(),
    } as RiffValleyPlaylist;
    const association = {
      id: 'association-one',
      tracks: [
        { uri: 'spotify:track:only-this-artist' },
        { uri: 'spotify:track:shared' },
      ],
    } as RiffValleyPlaylistArtist;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([
      association,
      {
        ...playlistArtistRecord('association-two', [
          playlistTrackRecord('spotify:track:shared'),
        ]),
      },
    ]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    jest
      .spyOn(spotifyAuthorizationService, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    spotifyAccountApi.removePlaylistItems.mockResolvedValue(undefined);

    await artistSyncService.removeArtist(playlist.id, 'artist-id');

    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      ['spotify:track:only-this-artist'],
    );
    expect(playlistArtistRepository.remove).toHaveBeenCalledWith(association);
    expect(riffValleyPlaylistRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({ updateDate: expect.any(Date) }),
    );
    expect(riffValleyPlaylistRepository.save).not.toHaveBeenCalled();
  });

  it('al quitar un artista conserva las pistas anteriores a la vinculación', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      protectedTrackUris: ['spotify:track:preexisting'],
    } as RiffValleyPlaylist;
    const association = {
      id: 'association-one',
      tracks: [{ uri: 'spotify:track:preexisting' }],
    } as RiffValleyPlaylistArtist;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    spotifyAccountApi.removePlaylistItems.mockResolvedValue(undefined);

    await artistSyncService.removeArtist(playlist.id, 'artist-id');

    expect(spotifyAccountApi.removePlaylistItems).not.toHaveBeenCalled();
    expect(playlistArtistRepository.remove).toHaveBeenCalledWith(association);
  });

  it('guarda exactamente dos canciones elegidas para un artista de género', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      protectedTrackUris: [],
    } as RiffValleyPlaylist;
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Igorrr'));
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(playlist);
    jest
      .spyOn(spotifyAuthorizationService, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([]);
    const selectedTracks = ['track-one', 'track-two'].map((id, index) => ({
      id,
      name: `Song ${index + 1}`,
      uri: `spotify:track:${id}`,
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
      artists: [{ id: 'riffValleyPlaylist-artist', name: 'Igorrr' }],
      album: {
        name: 'Album',
        images: [{ url: 'https://image', height: 300, width: 300 }],
      },
      duration_ms: 180000,
    }));
    spotifyAccountApi.getTracks.mockResolvedValue(selectedTracks);
    spotifyAccountApi.addPlaylistItems.mockResolvedValue(undefined);

    await artistSyncService.addGenreArtist(playlist.id, 'artist-id', [
      'track-one',
      'track-two',
    ]);

    expect(spotifyAccountApi.getTracks).toHaveBeenCalledWith('access-token', [
      'track-one',
      'track-two',
    ]);
    expect(spotifyAccountApi.addPlaylistItems).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      ['spotify:track:track-one', 'spotify:track:track-two'],
    );
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectionMode: 'manual',
        spotifyArtistId: 'riffValleyPlaylist-artist',
        status: 'synced',
        tracks: [
          expect.objectContaining({ spotifyTrackId: 'track-one' }),
          expect.objectContaining({ spotifyTrackId: 'track-two' }),
        ],
      }),
    );
  });

  it('permite recuperar un artista fallido de festival con una sola canción', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      protectedTrackUris: [],
    } as RiffValleyPlaylist;
    const association = {
      id: 'association-one',
      riffValleyPlaylistId: playlist.id,
      artistId: 'artist-id',
      spotifyArtistId: null,
      status: 'failed',
      tracks: [],
    } as RiffValleyPlaylistArtist;
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Igorrr'));
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue(playlist);
    jest
      .spyOn(spotifyAuthorizationService, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([]);
    const spotifyTrack = {
      id: 'track-one',
      name: 'Song one',
      uri: 'spotify:track:track-one',
      external_urls: { spotify: 'https://open.spotify.com/track/track-one' },
      artists: [{ id: 'riffValleyPlaylist-artist', name: 'Igorrr' }],
      album: { name: 'Album', images: [] },
      duration_ms: 180000,
    };
    spotifyAccountApi.getTracks.mockResolvedValue([spotifyTrack]);
    spotifyAccountApi.addPlaylistItems.mockResolvedValue(undefined);

    await artistSyncService.replaceFailedFestivalArtistTracks(
      playlist.id,
      'artist-id',
      ['track-one'],
    );

    expect(spotifyAccountApi.addPlaylistItems).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      ['spotify:track:track-one'],
    );
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectionMode: 'manual',
        status: 'synced',
        lastError: null,
        tracks: [expect.objectContaining({ spotifyTrackId: 'track-one' })],
      }),
    );
  });

  it('rechaza más de diez canciones manuales para un artista de festival', async () => {
    const association = {
      id: 'association-one',
      status: 'failed',
      tracks: [],
    } as RiffValleyPlaylistArtist;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Igorrr'));
    jest
      .spyOn(playlistManagementService, 'getFestivalPlaylist')
      .mockResolvedValue({
        id: 'playlist-local',
        spotifyPlaylistId: 'playlist-remote',
      } as RiffValleyPlaylist);

    await expect(
      artistSyncService.replaceFailedFestivalArtistTracks(
        'playlist-local',
        'artist-id',
        Array.from({ length: 11 }, (_, index) => `track-${index}`),
      ),
    ).rejects.toThrow('entre una y diez canciones');
  });

  it('al cambiar canciones manuales conserva una pista compartida', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      protectedTrackUris: [],
    } as RiffValleyPlaylist;
    const association = {
      id: 'association-one',
      riffValleyPlaylistId: playlist.id,
      artistId: 'artist-id',
      spotifyArtistId: null,
      tracks: [
        { uri: 'spotify:track:old-only' },
        { uri: 'spotify:track:shared' },
      ],
    } as RiffValleyPlaylistArtist;
    artistRepository.findOneBy.mockResolvedValue(artistRecord('Igorrr'));
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([
      association,
      {
        ...playlistArtistRecord('association-two', [
          playlistTrackRecord('spotify:track:shared'),
        ]),
      },
    ]);
    jest
      .spyOn(playlistManagementService, 'getGenrePlaylist')
      .mockResolvedValue(playlist);
    jest
      .spyOn(spotifyAuthorizationService, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest;
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([
      'spotify:track:old-only',
      'spotify:track:shared',
    ]);
    const selectedTracks = ['new-one', 'new-two'].map((id) => ({
      id,
      name: id,
      uri: `spotify:track:${id}`,
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
      artists: [{ id: 'riffValleyPlaylist-artist', name: 'Igorrr' }],
    }));
    spotifyAccountApi.getTracks.mockResolvedValue(selectedTracks);
    spotifyAccountApi.removePlaylistItems.mockResolvedValue(undefined);

    await artistSyncService.replaceGenreArtistTracks(playlist.id, 'artist-id', [
      'new-one',
      'new-two',
    ]);

    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      ['spotify:track:old-only'],
    );
  });
});
