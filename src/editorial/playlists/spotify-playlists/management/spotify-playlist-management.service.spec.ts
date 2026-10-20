import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { SpotifyPlaylistManagementService } from './spotify-playlist-management.service';
import { SpotifyPlaylistAuthorizationService } from '../spotify-authorization/spotify-playlist-authorization.service';
import { UpdateSyncedPlaylistDto } from '../dto/update-synced-playlist.dto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { SpotifyAccountApiService } from 'src/integrations/spotify-integration';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import {
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';

function playlistFixture(
  overrides: Partial<RiffValleyPlaylist> = {},
): RiffValleyPlaylist {
  return Object.assign(new RiffValleyPlaylist(), {
    id: 'local-id',
    name: 'Playlist local',
    status: RiffValleyPlaylistStatus.IN_PROGRESS,
    link: 'https://open.spotify.com/playlist/spotify-id',
    spotifyPlaylistId: 'spotify-id',
    description: null,
    isPublic: false,
    imageUrl: null,
    protectedTrackUris: [],
    type: RiffValleyPlaylistType.FESTIVAL,
    updateDate: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    content: undefined,
    user: undefined,
    playlistArtists: [],
    ...overrides,
  });
}

describe('SpotifyPlaylistManagementService', () => {
  let service: SpotifyPlaylistManagementService;
  let module: TestingModule;
  let playlistRepository: Pick<
    Repository<RiffValleyPlaylist>,
    'find' | 'findOne' | 'update'
  > & {
    create: jest.Mock<RiffValleyPlaylist, [DeepPartial<RiffValleyPlaylist>]>;
    save: jest.Mock<
      Promise<RiffValleyPlaylist>,
      [DeepPartial<RiffValleyPlaylist>]
    >;
    find: jest.Mock<
      Promise<RiffValleyPlaylist[]>,
      [Parameters<Repository<RiffValleyPlaylist>['find']>[0]]
    >;
    findOne: jest.Mock<
      Promise<RiffValleyPlaylist | null>,
      [Parameters<Repository<RiffValleyPlaylist>['findOne']>[0]]
    >;
    update: jest.MockedFunction<Repository<RiffValleyPlaylist>['update']>;
  };
  let spotifyAccountApi: jest.Mocked<
    Pick<
      SpotifyAccountApiService,
      | 'createPlaylist'
      | 'getPlaylist'
      | 'getProfile'
      | 'getPlaylistTrackUris'
      | 'updatePlaylist'
      | 'uploadPlaylistImage'
      | 'getPlaylistImages'
      | 'removePlaylistFromLibrary'
    >
  >;
  let authorizationService: jest.Mocked<
    Pick<SpotifyPlaylistAuthorizationService, 'getValidAccessToken'>
  >;

  beforeEach(() => {
    playlistRepository = {
      create: jest.fn((value: DeepPartial<RiffValleyPlaylist>) =>
        Object.assign(new RiffValleyPlaylist(), { id: 'local-id', ...value }),
      ),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value: DeepPartial<RiffValleyPlaylist>) =>
        Object.assign(new RiffValleyPlaylist(), value),
      ),
      update: jest.fn(),
    };
    spotifyAccountApi = {
      createPlaylist: jest.fn().mockResolvedValue({
        id: 'spotify-id',
        name: 'Playlist remota',
        external_urls: {
          spotify: 'https://open.spotify.com/playlist/spotify-id',
        },
      }),
      getPlaylist: jest.fn(),
      getProfile: jest.fn(),
      getPlaylistTrackUris: jest.fn().mockResolvedValue(['spotify:track:old']),
      updatePlaylist: jest.fn(),
      uploadPlaylistImage: jest.fn(),
      getPlaylistImages: jest.fn(),
      removePlaylistFromLibrary: jest.fn(),
    };
    authorizationService = {
      getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    return Test.createTestingModule({
      providers: [
        SpotifyPlaylistManagementService,
        {
          provide: getRepositoryToken(RiffValleyPlaylist),
          useValue: playlistRepository,
        },
        { provide: SpotifyAccountApiService, useValue: spotifyAccountApi },
        {
          provide: SpotifyPlaylistAuthorizationService,
          useValue: authorizationService,
        },
      ],
    })
      .compile()
      .then((testingModule) => {
        module = testingModule;
        service = module.get(SpotifyPlaylistManagementService);
      });
  });

  afterEach(async () => module?.close());

  it('crea playlists Festival en Spotify antes de persistir la fila local', async () => {
    const events: string[] = [];
    spotifyAccountApi.createPlaylist.mockImplementation(async () => {
      events.push('spotify:create');
      return {
        id: 'spotify-id',
        name: 'Playlist remota',
        external_urls: {
          spotify: 'https://open.spotify.com/playlist/spotify-id',
        },
      };
    });
    playlistRepository.save.mockImplementation(async (playlist) => {
      events.push('postgres:save');
      return Object.assign(new RiffValleyPlaylist(), playlist);
    });
    playlistRepository.findOne.mockImplementation(async ({ where }) => {
      events.push('postgres:read');
      const conditions = Array.isArray(where) ? where[0] : where;
      return playlistFixture({
        id: 'local-id',
        spotifyPlaylistId: conditions?.spotifyPlaylistId
          ? String(conditions.spotifyPlaylistId)
          : 'spotify-id',
      });
    });

    await service.createFestivalPlaylist({ name: 'Playlist', public: false });

    expect(events).toEqual([
      'spotify:create',
      'postgres:save',
      'postgres:read',
    ]);
    expect(spotifyAccountApi.createPlaylist).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({
        name: 'Playlist',
        description:
          'Playlist creada a partir de los repertorios recientes de setlist.fm',
        public: false,
      }),
    );
    expect(playlistRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        spotifyPlaylistId: 'spotify-id',
        type: 'festival',
        protectedTrackUris: [],
      }),
    );
  });

  it('mantiene la playlist Spotify si el insert fue ambiguo y la fila aparece al consultar', async () => {
    const persisted = playlistFixture({ type: RiffValleyPlaylistType.GENERO });
    playlistRepository.save.mockRejectedValue(
      new Error('commit response lost'),
    );
    playlistRepository.findOne
      .mockResolvedValueOnce(persisted)
      .mockResolvedValueOnce(persisted);

    await expect(
      service.createGenrePlaylist({ name: 'Género', public: false }),
    ).resolves.toBe(persisted);

    expect(spotifyAccountApi.removePlaylistFromLibrary).not.toHaveBeenCalled();
  });

  it('solo compensa la playlist recién creada si el insert falla y se confirma ausencia', async () => {
    playlistRepository.save.mockRejectedValue(new Error('insert failed'));
    playlistRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createFestivalPlaylist({ name: 'Festival', public: false }),
    ).rejects.toThrow('Se retiró de la biblioteca de Spotify');

    expect(spotifyAccountApi.removePlaylistFromLibrary).toHaveBeenCalledWith(
      'access-token',
      'spotify-id',
    );
  });

  it('no compensa si PostgreSQL no permite confirmar el resultado del insert', async () => {
    playlistRepository.save.mockRejectedValue(new Error('insert failed'));
    playlistRepository.findOne.mockRejectedValue(new Error('database offline'));

    await expect(
      service.createFestivalPlaylist({ name: 'Festival', public: false }),
    ).rejects.toThrow('No se retiró de la biblioteca de Spotify');

    expect(spotifyAccountApi.removePlaylistFromLibrary).not.toHaveBeenCalled();
  });

  it('rechaza enlazar playlists que no pertenecen a la cuenta conectada', async () => {
    playlistRepository.findOne.mockResolvedValue(
      playlistFixture({
        link: 'https://open.spotify.com/playlist/spotifyid',
        type: RiffValleyPlaylistType.FESTIVAL,
        spotifyPlaylistId: null,
      }),
    );
    spotifyAccountApi.getPlaylist.mockResolvedValue({
      id: 'spotify-id',
      name: 'Playlist ajena',
      description: null,
      public: false,
      owner: { id: 'other-user', display_name: 'Otra persona' },
      external_urls: {
        spotify: 'https://open.spotify.com/playlist/spotify-id',
      },
    });
    spotifyAccountApi.getProfile.mockResolvedValue({
      id: 'riff-valley',
      display_name: 'Riff Valley',
    });

    await expect(
      service.linkExistingFestivalPlaylist('local-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('enlaza un registro legacy y conserva las pistas remotas como protegidas', async () => {
    const legacyPlaylist = playlistFixture({
      type: RiffValleyPlaylistType.FESTIVAL,
      link: 'https://open.spotify.com/playlist/legacyid',
      spotifyPlaylistId: null,
    });
    playlistRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(legacyPlaylist)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...legacyPlaylist,
        spotifyPlaylistId: 'legacyid',
      });
    playlistRepository.find.mockResolvedValue([legacyPlaylist]);
    spotifyAccountApi.getPlaylist.mockResolvedValue({
      id: 'legacyid',
      name: 'Festival legacy',
      description: 'Descripción',
      public: true,
      owner: { id: 'riff-valley', display_name: 'Riff Valley' },
      external_urls: { spotify: 'https://open.spotify.com/playlist/legacyid' },
      images: [
        { url: 'https://image.test/cover.jpg', height: 300, width: 300 },
      ],
    });
    spotifyAccountApi.getProfile.mockResolvedValue({
      id: 'riff-valley',
      display_name: 'Riff Valley',
    });
    spotifyAccountApi.getPlaylistTrackUris.mockResolvedValue([
      'spotify:track:protected',
    ]);

    await service.createLinkedFestivalPlaylist({
      spotifyUrl: 'https://open.spotify.com/playlist/legacyid?si=old',
    });

    expect(playlistRepository.update).toHaveBeenCalledWith(
      'local-id',
      expect.objectContaining({
        spotifyPlaylistId: 'legacyid',
        protectedTrackUris: ['spotify:track:protected'],
      }),
    );
    expect(playlistRepository.save).not.toHaveBeenCalled();
  });

  it('crea un vínculo local para una playlist existente sin tratarla como recurso nuevo', async () => {
    const linkedPlaylist = playlistFixture({
      spotifyPlaylistId: 'spotifyid',
      type: RiffValleyPlaylistType.FESTIVAL,
    });
    playlistRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linkedPlaylist);
    spotifyAccountApi.getPlaylist.mockResolvedValue({
      id: 'spotifyid',
      name: 'Playlist existente',
      description: null,
      public: false,
      owner: { id: 'riff-valley', display_name: 'Riff Valley' },
      external_urls: { spotify: 'https://open.spotify.com/playlist/spotifyid' },
      images: [],
    });
    spotifyAccountApi.getProfile.mockResolvedValue({
      id: 'riff-valley',
      display_name: 'Riff Valley',
    });

    await expect(
      service.createLinkedFestivalPlaylist({
        spotifyUrl: 'https://open.spotify.com/playlist/spotifyid?si=existing',
      }),
    ).resolves.toBe(linkedPlaylist);

    expect(playlistRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        spotifyPlaylistId: 'spotifyid',
        type: 'festival',
      }),
    );
    expect(spotifyAccountApi.removePlaylistFromLibrary).not.toHaveBeenCalled();
  });

  it('conserva las relaciones incluidas al consultar una playlist enlazada', async () => {
    const playlist = playlistFixture({ type: RiffValleyPlaylistType.GENERO });
    playlistRepository.findOne.mockResolvedValue(playlist);

    await expect(service.getGenrePlaylist('local-id')).resolves.toBe(playlist);

    expect(playlistRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'local-id' },
      relations: ['user', 'playlistArtists', 'playlistArtists.artist'],
    });
  });

  it('mantiene errores de URL duplicada y validación de tipo género', async () => {
    await expect(
      service.createLinkedFestivalPlaylist({ spotifyUrl: 'invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    playlistRepository.findOne.mockResolvedValue(
      playlistFixture({
        type: RiffValleyPlaylistType.FESTIVAL,
        spotifyPlaylistId: 'spotifyid',
      }),
    );
    await expect(service.getGenrePlaylist('local-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    playlistRepository.findOne.mockResolvedValue(
      playlistFixture({ id: 'existing' }),
    );
    await expect(
      service.createLinkedFestivalPlaylist({
        spotifyUrl: 'https://open.spotify.com/playlist/spotifyid',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza primero metadata remota y conserva los mismos campos locales', async () => {
    playlistRepository.findOne.mockResolvedValue(
      playlistFixture({ type: RiffValleyPlaylistType.FESTIVAL }),
    );

    await service.updateFestivalPlaylist('local-id', {
      name: 'Actualizada',
      description: '',
      public: true,
    });

    expect(spotifyAccountApi.updatePlaylist).toHaveBeenCalledWith(
      'access-token',
      'spotify-id',
      { name: 'Actualizada', description: '', public: true },
    );
    expect(
      spotifyAccountApi.updatePlaylist.mock.invocationCallOrder[0],
    ).toBeLessThan(playlistRepository.update.mock.invocationCallOrder[0]);
    expect(playlistRepository.update).toHaveBeenCalledWith(
      'local-id',
      expect.objectContaining({
        name: 'Actualizada',
        description: '',
        isPublic: true,
      }),
    );
  });

  it('rechaza renombrar una playlist no vinculada sin pedir token ni mutar datos', async () => {
    playlistRepository.findOne.mockResolvedValue(
      playlistFixture({
        type: RiffValleyPlaylistType.FESTIVAL,
        spotifyPlaylistId: null,
      }),
    );

    await expect(
      service.updateFestivalPlaylist(
        'local-id',
        Object.assign(new UpdateSyncedPlaylistDto(), { name: 'Actualizada' }),
      ),
    ).rejects.toThrow('La playlist no está vinculada con Spotify');

    expect(authorizationService.getValidAccessToken).not.toHaveBeenCalled();
    expect(spotifyAccountApi.updatePlaylist).not.toHaveBeenCalled();
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('no modifica el nombre local si la autorización de Spotify falla', async () => {
    playlistRepository.findOne.mockResolvedValue(
      playlistFixture({ type: RiffValleyPlaylistType.FESTIVAL }),
    );
    const authorizationError = new UnauthorizedException(
      'Vuelve a autorizar Spotify',
    );
    authorizationService.getValidAccessToken.mockRejectedValue(
      authorizationError,
    );

    await expect(
      service.updateFestivalPlaylist(
        'local-id',
        Object.assign(new UpdateSyncedPlaylistDto(), { name: 'Actualizada' }),
      ),
    ).rejects.toBe(authorizationError);

    expect(spotifyAccountApi.updatePlaylist).not.toHaveBeenCalled();
    expect(playlistRepository.update).not.toHaveBeenCalled();
  });

  it('sube una portada JPEG, consulta la metadata remota y persiste su URL', async () => {
    const playlist = playlistFixture({ imageUrl: null });
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    playlistRepository.findOne.mockResolvedValue(playlist);
    spotifyAccountApi.getPlaylistImages.mockResolvedValue([
      { url: 'https://image.test/cover.jpg', height: 300, width: 300 },
    ]);

    await expect(
      service.updateFestivalPlaylistImage('local-id', image),
    ).resolves.toBe(playlist);

    expect(authorizationService.getValidAccessToken).toHaveBeenCalledWith([
      'ugc-image-upload',
    ]);
    expect(spotifyAccountApi.uploadPlaylistImage).toHaveBeenCalledWith(
      'access-token',
      'spotify-id',
      image.toString('base64'),
    );
    expect(spotifyAccountApi.getPlaylistImages).toHaveBeenCalledWith(
      'access-token',
      'spotify-id',
    );
    expect(playlistRepository.update).toHaveBeenCalledWith(
      'local-id',
      expect.objectContaining({ imageUrl: 'https://image.test/cover.jpg' }),
    );
  });
});
