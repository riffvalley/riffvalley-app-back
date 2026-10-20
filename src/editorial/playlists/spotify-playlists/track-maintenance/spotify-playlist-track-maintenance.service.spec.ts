import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeleteResult, Repository, UpdateResult } from 'typeorm';
import { SpotifyAccountApiService } from 'src/integrations/spotify-integration';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { RiffValleyPlaylistArtist } from '../entities/riff-valley-playlist-artist.entity';
import { SpotifyPlaylistManagementService } from '../management/spotify-playlist-management.service';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { SpotifyPlaylistTrackMaintenanceService } from './spotify-playlist-track-maintenance.service';

const makePlaylist = (
  type: RiffValleyPlaylistType,
  id = 'playlist-local',
): RiffValleyPlaylist =>
  Object.assign(new RiffValleyPlaylist(), {
    id,
    name: 'Festival playlist',
    status: RiffValleyPlaylistStatus.IN_PROGRESS,
    link: 'https://open.spotify.com/playlist/playlist-remote',
    spotifyPlaylistId: 'playlist-remote',
    description: null,
    isPublic: false,
    imageUrl: null,
    protectedTrackUris: ['spotify:track:protected'],
    type,
    updateDate: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    content: undefined,
    user: undefined,
    playlistArtists: [],
  });

describe('SpotifyPlaylistTrackMaintenanceService', () => {
  let moduleRef: TestingModule;
  let service: SpotifyPlaylistTrackMaintenanceService;
  let playlistRepository: jest.Mocked<
    Pick<Repository<RiffValleyPlaylist>, 'update'>
  >;
  let playlistArtistRepository: jest.Mocked<
    Pick<Repository<RiffValleyPlaylistArtist>, 'delete'>
  >;
  let spotifyAccountApi: jest.Mocked<
    Pick<
      SpotifyAccountApiService,
      | 'getPlaylistTrackUris'
      | 'removePlaylistItems'
      | 'replacePlaylistTrackUris'
    >
  >;
  let spotifyAuthorizationService: jest.Mocked<
    Pick<SpotifyPlaylistAuthorizationService, 'getValidAccessToken'>
  >;
  let playlistManagementService: jest.Mocked<
    Pick<
      SpotifyPlaylistManagementService,
      'getFestivalPlaylist' | 'getGenrePlaylist'
    >
  >;

  beforeEach(async () => {
    playlistRepository = {
      update: jest
        .fn<
          ReturnType<Repository<RiffValleyPlaylist>['update']>,
          Parameters<Repository<RiffValleyPlaylist>['update']>
        >()
        .mockResolvedValue({
          affected: 1,
          generatedMaps: [],
          raw: [],
        } satisfies UpdateResult),
    };
    playlistArtistRepository = {
      delete: jest
        .fn<
          ReturnType<Repository<RiffValleyPlaylistArtist>['delete']>,
          Parameters<Repository<RiffValleyPlaylistArtist>['delete']>
        >()
        .mockResolvedValue({ affected: 1, raw: [] } satisfies DeleteResult),
    };
    spotifyAccountApi = {
      getPlaylistTrackUris: jest
        .fn<
          ReturnType<SpotifyAccountApiService['getPlaylistTrackUris']>,
          Parameters<SpotifyAccountApiService['getPlaylistTrackUris']>
        >()
        .mockResolvedValue([]),
      removePlaylistItems: jest
        .fn<
          ReturnType<SpotifyAccountApiService['removePlaylistItems']>,
          Parameters<SpotifyAccountApiService['removePlaylistItems']>
        >()
        .mockResolvedValue(undefined),
      replacePlaylistTrackUris: jest
        .fn<
          ReturnType<SpotifyAccountApiService['replacePlaylistTrackUris']>,
          Parameters<SpotifyAccountApiService['replacePlaylistTrackUris']>
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
    playlistManagementService = {
      getFestivalPlaylist: jest
        .fn<
          ReturnType<SpotifyPlaylistManagementService['getFestivalPlaylist']>,
          Parameters<SpotifyPlaylistManagementService['getFestivalPlaylist']>
        >()
        .mockResolvedValue(makePlaylist(RiffValleyPlaylistType.FESTIVAL)),
      getGenrePlaylist: jest
        .fn<
          ReturnType<SpotifyPlaylistManagementService['getGenrePlaylist']>,
          Parameters<SpotifyPlaylistManagementService['getGenrePlaylist']>
        >()
        .mockResolvedValue(
          makePlaylist(RiffValleyPlaylistType.GENERO, 'genre-local'),
        ),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        SpotifyPlaylistTrackMaintenanceService,
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: playlistRepository,
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
        {
          provide: SpotifyPlaylistManagementService,
          useValue: playlistManagementService,
        },
      ],
    }).compile();
    service = moduleRef.get(SpotifyPlaylistTrackMaintenanceService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('clears all Spotify batches before deleting associations and protected URIs', async () => {
    const remoteUris = Array.from(
      { length: 205 },
      (_, index) => `spotify:track:${index}`,
    );
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue(remoteUris);

    await service.clearFestivalPlaylist('festival-id');

    expect(spotifyAccountApi.getPlaylistTrackUris).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      true,
    );
    expect(
      spotifyAuthorizationService.getValidAccessToken,
    ).toHaveBeenCalledWith([]);
    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenNthCalledWith(
      1,
      'access-token',
      'playlist-remote',
      remoteUris.slice(0, 100),
    );
    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenNthCalledWith(
      3,
      'access-token',
      'playlist-remote',
      remoteUris.slice(200),
    );
    expect(playlistArtistRepository.delete).toHaveBeenCalledWith({
      riffValleyPlaylistId: 'festival-id',
    });
    expect(playlistRepository.update).toHaveBeenCalledWith(
      'playlist-local',
      expect.objectContaining({
        protectedTrackUris: [],
        updateDate: expect.any(Date),
      }),
    );
  });

  it('checks genre ownership/type before clearing through the festival clear workflow', async () => {
    const genrePlaylist = makePlaylist(
      RiffValleyPlaylistType.GENERO,
      'genre-local',
    );
    playlistManagementService.getGenrePlaylist.mockResolvedValue(genrePlaylist);
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([]);

    await service.clearGenrePlaylist('genre-local');

    expect(playlistManagementService.getGenrePlaylist).toHaveBeenCalledWith(
      'genre-local',
    );
    expect(playlistManagementService.getFestivalPlaylist).toHaveBeenCalledWith(
      'genre-local',
    );
  });

  it('preserves local state after a later Spotify batch fails and retries from the remote remainder', async () => {
    let remainingUris = Array.from(
      { length: 205 },
      (_, index) => `spotify:track:${index}`,
    );
    let removeCalls = 0;
    const initialUris = [...remainingUris];
    spotifyAccountApi.getPlaylistTrackUris.mockImplementation(async () => [
      ...remainingUris,
    ]);
    spotifyAccountApi.removePlaylistItems.mockImplementation(
      async (_token, _playlistId, batch) => {
        removeCalls += 1;
        const removedUris = new Set(batch);
        remainingUris = remainingUris.filter((uri) => !removedUris.has(uri));
        if (removeCalls === 2) {
          throw new Error('second batch timed out after removal');
        }
      },
    );

    await expect(service.clearFestivalPlaylist('festival-id')).rejects.toThrow(
      'second batch timed out after removal',
    );
    expect(remainingUris).toEqual(initialUris.slice(200));
    expect(playlistArtistRepository.delete).not.toHaveBeenCalled();
    expect(playlistRepository.update).not.toHaveBeenCalled();

    await service.clearFestivalPlaylist('festival-id');

    expect(remainingUris).toEqual([]);
    expect(spotifyAccountApi.getPlaylistTrackUris).toHaveBeenCalledTimes(2);
    expect(playlistArtistRepository.delete).toHaveBeenCalledTimes(1);
    expect(playlistRepository.update).toHaveBeenCalledTimes(1);
  });

  it('retries local cleanup after a database failure without re-adding remote tracks', async () => {
    const databaseError = new Error('association delete failed');
    spotifyAccountApi.getPlaylistTrackUris
      .mockResolvedValueOnce(['spotify:track:one'])
      .mockResolvedValueOnce([]);
    playlistArtistRepository.delete
      .mockRejectedValueOnce(databaseError)
      .mockResolvedValueOnce({ affected: 1, raw: [] });

    await expect(service.clearFestivalPlaylist('festival-id')).rejects.toBe(
      databaseError,
    );
    await service.clearFestivalPlaylist('festival-id');

    expect(spotifyAccountApi.removePlaylistItems).toHaveBeenCalledTimes(1);
    expect(playlistArtistRepository.delete).toHaveBeenCalledTimes(2);
    expect(playlistRepository.update).toHaveBeenCalledTimes(1);
  });

  it('shuffles ordered URIs while preserving duplicates and persists only after Spotify succeeds', async () => {
    const originalUris = [
      'spotify:track:one',
      'spotify:track:two',
      'spotify:track:two',
      'spotify:track:three',
    ];
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue(originalUris);

    await service.shuffleGenrePlaylist('genre-id');

    expect(spotifyAccountApi.getPlaylistTrackUris).toHaveBeenCalledWith(
      'access-token',
      'playlist-remote',
      false,
    );
    const shuffledUris =
      spotifyAccountApi.replacePlaylistTrackUris.mock.calls[0][2];
    expect(shuffledUris).not.toEqual(originalUris);
    expect([...shuffledUris].sort()).toEqual([...originalUris].sort());
    expect(playlistRepository.update).toHaveBeenCalledWith(
      'genre-local',
      expect.objectContaining({ updateDate: expect.any(Date) }),
    );
  });

  it('restores the original shuffle order and propagates the first Spotify error', async () => {
    const originalUris = ['spotify:track:one', 'spotify:track:two'];
    const spotifyError = new Error('Spotify replacement failed');
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue(originalUris);
    spotifyAccountApi.replacePlaylistTrackUris
      .mockRejectedValueOnce(spotifyError)
      .mockResolvedValueOnce(undefined);

    await expect(service.shuffleGenrePlaylist('genre-id')).rejects.toBe(
      spotifyError,
    );

    expect(spotifyAccountApi.replacePlaylistTrackUris).toHaveBeenCalledTimes(2);
    expect(spotifyAccountApi.replacePlaylistTrackUris.mock.calls[1][2]).toEqual(
      originalUris,
    );
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('does not persist when both shuffle and rollback fail', async () => {
    const spotifyError = new Error('primary Spotify failure');
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([
      'spotify:track:one',
      'spotify:track:two',
    ]);
    spotifyAccountApi.replacePlaylistTrackUris
      .mockRejectedValueOnce(spotifyError)
      .mockRejectedValueOnce(new Error('rollback failed'));

    await expect(service.shuffleGenrePlaylist('genre-id')).rejects.toBe(
      spotifyError,
    );
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('rejects shuffle when fewer than two tracks exist', async () => {
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([
      'spotify:track:only',
    ]);

    await expect(
      service.shuffleGenrePlaylist('genre-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(spotifyAccountApi.replacePlaylistTrackUris).not.toHaveBeenCalled();
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });
});
