import { ConfigService } from '@nestjs/config';
import { FestivalPlaylistsService } from './festival-playlists.service';

const SPOTIFY_SCOPES_FOR_TEST =
  'playlist-modify-private playlist-modify-public ugc-image-upload user-read-private';

describe('FestivalPlaylistsService', () => {
  let service: FestivalPlaylistsService;
  let connectionRepository: any;
  let spotifyRepository: any;
  let artistRepository: any;
  let playlistArtistRepository: any;
  let mailService: any;
  let tokenCrypto: any;

  beforeEach(() => {
    connectionRepository = { findOne: jest.fn() };
    spotifyRepository = {
      create: jest.fn((value) => ({ id: 'playlist-local', ...value })),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    artistRepository = { findOneBy: jest.fn() };
    playlistArtistRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => ({ id: 'association-id', ...value })),
      save: jest.fn(async (value) => value),
      delete: jest.fn(),
      remove: jest.fn(),
    };
    mailService = { sendSpotifyReauthorizationReminder: jest.fn() };
    tokenCrypto = {
      decrypt: jest.fn((value) => value),
      encrypt: jest.fn((value) => value),
    };
    const config = {
      get: jest.fn((name: string) => {
        const values: Record<string, string> = {
          SETLISTFM_API_KEY: 'setlist-key',
          SPOTIFY_CLIENT_ID: 'client-id',
          SPOTIFY_CLIENT_SECRET: 'client-secret',
        };
        return values[name];
      }),
    } as unknown as ConfigService;
    service = new FestivalPlaylistsService(
      connectionRepository,
      spotifyRepository,
      artistRepository,
      playlistArtistRepository,
      config,
      tokenCrypto,
      mailService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('avisa cuando la autorización de Spotify caduca pronto', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    connectionRepository.findOne.mockResolvedValue({
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: expiresAt,
      authorizationInvalidatedAt: null,
      scope: SPOTIFY_SCOPES_FOR_TEST,
    });

    await expect(service.getSpotifyConnection()).resolves.toEqual(
      expect.objectContaining({
        connected: true,
        authorizationStatus: 'expiring_soon',
        reauthorizationRequired: false,
        daysUntilReauthorization: 7,
      }),
    );
  });

  it('exige reautorizar cuando el refresh token ha caducado', async () => {
    connectionRepository.findOne.mockResolvedValue({
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() - 60 * 1000),
      authorizationInvalidatedAt: null,
      scope: SPOTIFY_SCOPES_FOR_TEST,
    });

    await expect(service.getSpotifyConnection()).resolves.toEqual(
      expect.objectContaining({
        connected: false,
        authorizationStatus: 'reauthorization_required',
        reauthorizationRequired: true,
        reauthorizationReason: 'refresh_token_expired',
        daysUntilReauthorization: 0,
      }),
    );
  });

  it('envía una sola vez el recordatorio diario de reautorización', async () => {
    const connection = {
      spotifyUserId: 'spotify-user',
      displayName: 'Riff Valley',
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reauthorizationReminderSentAt: null,
    };
    connectionRepository.findOne.mockResolvedValue(connection);
    connectionRepository.save = jest.fn();
    mailService.sendSpotifyReauthorizationReminder.mockResolvedValue(true);

    await service.checkSpotifyAuthorizationLifetime();

    expect(mailService.sendSpotifyReauthorizationReminder).toHaveBeenCalledWith(
      'Riff Valley',
      connection.refreshTokenExpiresAt,
      7,
    );
    expect(connection.reauthorizationReminderSentAt).toBeInstanceOf(Date);
    expect(connectionRepository.save).toHaveBeenCalledWith(connection);
  });

  it('marca la conexión para reautorizar cuando Spotify devuelve invalid_grant', async () => {
    const connection = {
      accessToken: 'old-access-token',
      refreshToken: 'refresh-token',
      spotifyUserId: 'spotify-user',
      expiresAt: new Date(Date.now() - 60 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      authorizationInvalidatedAt: null,
      scope: SPOTIFY_SCOPES_FOR_TEST,
    };
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(connection),
    };
    connectionRepository.createQueryBuilder = jest
      .fn()
      .mockReturnValue(queryBuilder);
    connectionRepository.save = jest.fn();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    } as Response);

    await expect((service as any).getValidAccessToken()).rejects.toThrow(
      'Spotify ha invalidado la autorización',
    );
    expect(connection).toEqual(
      expect.objectContaining({
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        authorizationInvalidatedAt: expect.any(Date),
      }),
    );
    expect(connectionRepository.save).toHaveBeenCalledWith(connection);
  });

  it('cuenta cada canción una vez por concierto y excluye las pistas de cinta', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        // Vienen desordenados para comprobar que se usan primero los conciertos recientes.
        setlist: [
          {
            eventDate: '01-01-2024',
            url: 'https://setlist.fm/old',
            sets: { set: [{ song: [{ name: 'Old song' }] }] },
          },
          {
            eventDate: '02-08-2026',
            url: 'https://setlist.fm/newest',
            sets: {
              set: [
                {
                  song: [
                    { name: 'Hit' },
                    { name: 'Hit' },
                    { name: 'Intro', tape: true },
                  ],
                },
              ],
            },
          },
          {
            eventDate: '01-08-2026',
            url: 'https://setlist.fm/recent',
            sets: { set: [{ song: [{ name: 'Hit' }, { name: 'Second' }] }] },
          },
        ],
      }),
    } as Response);

    const result = await service.getTopSongs('Test Artist', 10, 2);

    expect(result.setlistsAnalyzed).toBe(2);
    expect(result.songs).toEqual([
      { name: 'Hit', plays: 2 },
      { name: 'Second', plays: 1 },
    ]);
    expect(result.sources).toEqual([
      'https://setlist.fm/newest',
      'https://setlist.fm/recent',
    ]);
  });

  it('crea a la vez la playlist real de Spotify y su registro local', async () => {
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValue({
        id: 'playlist-remote',
        name: 'Festival',
        external_urls: { spotify: 'https://open.spotify.com/playlist/remote' },
      });
    jest
      .spyOn(service, 'getFestivalPlaylist')
      .mockResolvedValue({ id: 'playlist-local' } as any);

    await service.createFestivalPlaylist({
      name: 'Festival',
      description: 'Descripción',
      public: false,
    });

    expect(spotifyRequest).toHaveBeenCalledWith(
      '/me/playlists',
      'access-token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(spotifyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        spotifyPlaylistId: 'playlist-remote',
        link: 'https://open.spotify.com/playlist/remote',
      }),
    );
  });

  it('actualiza los detalles tanto en Spotify como en el registro local', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
    } as any;
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValue(undefined);

    await service.updateFestivalPlaylist(playlist.id, {
      name: 'Festival actualizado',
      description: '',
      public: true,
    });

    expect(spotifyRequest).toHaveBeenCalledWith(
      '/playlists/playlist-remote',
      'access-token',
      {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Festival actualizado',
          description: '',
          public: true,
        }),
      },
    );
    expect(spotifyRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({
        name: 'Festival actualizado',
        description: '',
        isPublic: true,
        updateDate: expect.any(Date),
      }),
    );
  });

  it('vincula un registro antiguo y protege sus pistas preexistentes', async () => {
    const legacyPlaylist = {
      id: 'playlist-local',
      name: 'Nombre antiguo',
      type: 'festival',
      link: 'https://open.spotify.com/playlist/playlistremote?si=test',
      spotifyPlaylistId: null,
    } as any;
    spotifyRepository.findOne
      .mockResolvedValueOnce(legacyPlaylist)
      .mockResolvedValueOnce(null);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUris')
      .mockResolvedValue(['spotify:track:existing']);
    jest
      .spyOn(service as any, 'spotifyRequest')
      .mockImplementation((path: string) => {
        if (path === '/me') {
          return Promise.resolve({ id: 'riff-valley', display_name: 'RV' });
        }
        return Promise.resolve({
          id: 'playlistremote',
          name: 'Festival existente',
          description: 'Descripción remota',
          public: true,
          owner: { id: 'riff-valley', display_name: 'Riff Valley' },
          external_urls: {
            spotify: 'https://open.spotify.com/playlist/playlistremote',
          },
          images: [{ url: 'https://image.test/cover.jpg' }],
        });
      });
    jest
      .spyOn(service, 'getFestivalPlaylist')
      .mockResolvedValue({ id: legacyPlaylist.id } as any);

    await service.linkExistingFestivalPlaylist(legacyPlaylist.id);

    expect(spotifyRepository.update).toHaveBeenCalledWith(
      legacyPlaylist.id,
      expect.objectContaining({
        name: 'Festival existente',
        spotifyPlaylistId: 'playlistremote',
        description: 'Descripción remota',
        isPublic: true,
        imageUrl: 'https://image.test/cover.jpg',
        protectedTrackUris: ['spotify:track:existing'],
      }),
    );
  });

  it('crea un registro local pegando la URL de una playlist existente', async () => {
    spotifyRepository.findOne.mockResolvedValue(null);
    spotifyRepository.find.mockResolvedValue([]);
    jest.spyOn(service as any, 'getOwnedSpotifyPlaylist').mockResolvedValue({
      remotePlaylist: {
        id: 'playlistremote',
        name: 'Festival importado',
        description: 'Descripción remota',
        public: false,
        owner: { id: 'riff-valley', display_name: 'Riff Valley' },
        external_urls: {
          spotify: 'https://open.spotify.com/playlist/playlistremote',
        },
        images: [{ url: 'https://image.test/imported.jpg' }],
      },
      protectedTrackUris: ['spotify:track:existing'],
    });
    jest
      .spyOn(service, 'getFestivalPlaylist')
      .mockResolvedValue({ id: 'playlist-local' } as any);

    await service.createLinkedFestivalPlaylist({
      spotifyUrl: 'https://open.spotify.com/playlist/playlistremote?si=example',
    });

    expect(spotifyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Festival importado',
        spotifyPlaylistId: 'playlistremote',
        link: 'https://open.spotify.com/playlist/playlistremote',
        imageUrl: 'https://image.test/imported.jpg',
        protectedTrackUris: ['spotify:track:existing'],
        status: 'in_progress',
        type: 'festival',
      }),
    );
  });

  it('sube una portada JPEG y guarda la URL devuelta por Spotify', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      imageUrl: null,
    } as any;
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    const getToken = jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { url: 'https://image-cdn.test/cover.jpg', width: 640, height: 640 },
      ]);

    await service.updateFestivalPlaylistImage(playlist.id, image);

    expect(getToken).toHaveBeenCalledWith(['ugc-image-upload']);
    expect(spotifyRequest).toHaveBeenNthCalledWith(
      1,
      '/playlists/playlist-remote/images',
      'access-token',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: image.toString('base64'),
      },
    );
    expect(spotifyRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({
        imageUrl: 'https://image-cdn.test/cover.jpg',
        updateDate: expect.any(Date),
      }),
    );
  });

  it('informa cuando la conexión necesita autorizar la subida de imágenes', async () => {
    connectionRepository.findOne.mockResolvedValue({
      spotifyUserId: 'spotify-user',
      expiresAt: new Date(),
      scope: 'playlist-modify-private playlist-modify-public user-read-private',
    });

    await expect(service.getSpotifyConnection()).resolves.toEqual(
      expect.objectContaining({
        connected: true,
        canUploadImages: false,
        missingScopes: ['ugc-image-upload'],
      }),
    );
  });

  it('añade inmediatamente a Spotify las pistas resueltas de un artista', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      updateDate: new Date(),
    } as any;
    artistRepository.findOneBy.mockResolvedValue({
      id: 'artist-id',
      name: 'Ghost',
    });
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    jest.spyOn(service, 'getTopSongs').mockResolvedValue({
      artist: 'Ghost',
      setlistsAnalyzed: 10,
      songs: [{ name: 'Square Hammer', plays: 8 }],
      sources: [],
    });
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest.spyOn(service as any, 'findSpotifyTrack').mockResolvedValue({
      id: 'track-id',
      name: 'Square Hammer',
      uri: 'spotify:track:track-id',
      external_urls: { spotify: 'https://open.spotify.com/track/track-id' },
      artists: [{ name: 'Ghost' }],
    });
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValue({});

    await service.addArtist(playlist.id, {
      artistId: 'artist-id',
      tracksPerArtist: 10,
      recentSetlists: 10,
    });

    expect(spotifyRequest).toHaveBeenCalledWith(
      '/playlists/playlist-remote/items',
      'access-token',
      {
        method: 'POST',
        body: JSON.stringify({ uris: ['spotify:track:track-id'] }),
      },
    );
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'synced',
        tracks: [expect.objectContaining({ spotifyTrackId: 'track-id' })],
      }),
    );
    expect(spotifyRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({ updateDate: expect.any(Date) }),
    );
    expect(spotifyRepository.save).not.toHaveBeenCalled();
  });

  it('no duplica una pista que ya existe en la playlist real', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
    } as any;
    artistRepository.findOneBy.mockResolvedValue({
      id: 'artist-id',
      name: 'Ghost',
    });
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    jest.spyOn(service, 'getTopSongs').mockResolvedValue({
      artist: 'Ghost',
      setlistsAnalyzed: 10,
      songs: [{ name: 'Square Hammer', plays: 8 }],
      sources: [],
    });
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest.spyOn(service as any, 'findSpotifyTrack').mockResolvedValue({
      id: 'track-id',
      name: 'Square Hammer',
      uri: 'spotify:track:track-id',
      external_urls: { spotify: 'https://open.spotify.com/track/track-id' },
      artists: [{ name: 'Ghost' }],
    });
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUris')
      .mockResolvedValue(['spotify:track:track-id']);
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValue({});

    await service.addArtist(playlist.id, {
      artistId: 'artist-id',
      tracksPerArtist: 10,
      recentSetlists: 10,
    });

    expect(spotifyRequest).not.toHaveBeenCalledWith(
      '/playlists/playlist-remote/items',
      'access-token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'synced',
        tracks: [expect.objectContaining({ spotifyTrackId: 'track-id' })],
      }),
    );
  });

  it('vacía Spotify por lotes y elimina todo el estado musical local', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      protectedTrackUris: ['spotify:track:protected'],
    } as any;
    const remoteUris = Array.from(
      { length: 205 },
      (_, index) => `spotify:track:${index}`,
    );
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUris')
      .mockResolvedValue(remoteUris);
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValue({});

    await service.clearFestivalPlaylist(playlist.id);

    const deleteCalls = spotifyRequest.mock.calls.filter(
      ([path, , init]) =>
        path === '/playlists/playlist-remote/items' &&
        (init as RequestInit).method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(3);
    expect(
      JSON.parse((deleteCalls[0][2] as RequestInit).body as string).items,
    ).toHaveLength(100);
    expect(
      JSON.parse((deleteCalls[2][2] as RequestInit).body as string).items,
    ).toHaveLength(5);
    expect(playlistArtistRepository.delete).toHaveBeenCalledWith({
      spotifyId: playlist.id,
    });
    expect(spotifyRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({
        protectedTrackUris: [],
        updateDate: expect.any(Date),
      }),
    );
  });

  it('al quitar un artista conserva las pistas compartidas por otro', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      updateDate: new Date(),
    } as any;
    const association = {
      id: 'association-one',
      tracks: [
        { uri: 'spotify:track:only-this-artist' },
        { uri: 'spotify:track:shared' },
      ],
    } as any;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([
      association,
      { id: 'association-two', tracks: [{ uri: 'spotify:track:shared' }] },
    ]);
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValue({});

    await service.removeArtist(playlist.id, 'artist-id');

    expect(spotifyRequest).toHaveBeenCalledWith(
      '/playlists/playlist-remote/items',
      'access-token',
      {
        method: 'DELETE',
        body: JSON.stringify({
          items: [{ uri: 'spotify:track:only-this-artist' }],
        }),
      },
    );
    expect(playlistArtistRepository.remove).toHaveBeenCalledWith(association);
    expect(spotifyRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({ updateDate: expect.any(Date) }),
    );
    expect(spotifyRepository.save).not.toHaveBeenCalled();
  });

  it('al quitar un artista conserva las pistas anteriores a la vinculación', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      protectedTrackUris: ['spotify:track:preexisting'],
    } as any;
    const association = {
      id: 'association-one',
      tracks: [{ uri: 'spotify:track:preexisting' }],
    } as any;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockResolvedValue({});

    await service.removeArtist(playlist.id, 'artist-id');

    expect(spotifyRequest).not.toHaveBeenCalled();
    expect(playlistArtistRepository.remove).toHaveBeenCalledWith(association);
  });

  it('guarda exactamente dos canciones elegidas para un artista de género', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
      protectedTrackUris: [],
    } as any;
    artistRepository.findOneBy.mockResolvedValue({
      id: 'artist-id',
      name: 'Igorrr',
    });
    playlistArtistRepository.findOne.mockResolvedValue(null);
    playlistArtistRepository.find.mockResolvedValue([]);
    jest.spyOn(service, 'getGenrePlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUris')
      .mockResolvedValue([]);
    const selectedTracks = ['track-one', 'track-two'].map((id, index) => ({
      id,
      name: `Song ${index + 1}`,
      uri: `spotify:track:${id}`,
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
      artists: [{ id: 'spotify-artist', name: 'Igorrr' }],
      album: {
        name: 'Album',
        images: [{ url: 'https://image', height: 300, width: 300 }],
      },
      duration_ms: 180000,
    }));
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockImplementation(async (path: string) =>
        path.startsWith('/tracks?') ? { tracks: selectedTracks } : {},
      );

    await service.addGenreArtist(playlist.id, 'artist-id', [
      'track-one',
      'track-two',
    ]);

    expect(spotifyRequest).toHaveBeenCalledWith(
      '/playlists/playlist-remote/items',
      'access-token',
      {
        method: 'POST',
        body: JSON.stringify({
          uris: ['spotify:track:track-one', 'spotify:track:track-two'],
        }),
      },
    );
    expect(playlistArtistRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectionMode: 'manual',
        spotifyArtistId: 'spotify-artist',
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
    } as any;
    const association = {
      id: 'association-one',
      spotifyId: playlist.id,
      artistId: 'artist-id',
      spotifyArtistId: null,
      status: 'failed',
      tracks: [],
    } as any;
    artistRepository.findOneBy.mockResolvedValue({
      id: 'artist-id',
      name: 'Igorrr',
    });
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([association]);
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUris')
      .mockResolvedValue([]);
    const spotifyTrack = {
      id: 'track-one',
      name: 'Song one',
      uri: 'spotify:track:track-one',
      external_urls: { spotify: 'https://open.spotify.com/track/track-one' },
      artists: [{ id: 'spotify-artist', name: 'Igorrr' }],
      album: { name: 'Album', images: [] },
      duration_ms: 180000,
    };
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockImplementation(async (path: string) =>
        path.startsWith('/tracks?') ? { tracks: [spotifyTrack] } : {},
      );

    await service.replaceFailedFestivalArtistTracks(playlist.id, 'artist-id', [
      'track-one',
    ]);

    expect(spotifyRequest).toHaveBeenCalledWith(
      '/playlists/playlist-remote/items',
      'access-token',
      {
        method: 'POST',
        body: JSON.stringify({ uris: ['spotify:track:track-one'] }),
      },
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
    } as any;
    playlistArtistRepository.findOne.mockResolvedValue(association);
    artistRepository.findOneBy.mockResolvedValue({
      id: 'artist-id',
      name: 'Igorrr',
    });
    jest.spyOn(service, 'getFestivalPlaylist').mockResolvedValue({
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
    } as any);

    await expect(
      service.replaceFailedFestivalArtistTracks(
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
    } as any;
    const association = {
      id: 'association-one',
      spotifyId: playlist.id,
      artistId: 'artist-id',
      spotifyArtistId: null,
      tracks: [
        { uri: 'spotify:track:old-only' },
        { uri: 'spotify:track:shared' },
      ],
    } as any;
    artistRepository.findOneBy.mockResolvedValue({
      id: 'artist-id',
      name: 'Igorrr',
    });
    playlistArtistRepository.findOne.mockResolvedValue(association);
    playlistArtistRepository.find.mockResolvedValue([
      association,
      {
        id: 'association-two',
        tracks: [{ uri: 'spotify:track:shared' }],
      },
    ]);
    jest.spyOn(service, 'getGenrePlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUris')
      .mockResolvedValue(['spotify:track:old-only', 'spotify:track:shared']);
    const selectedTracks = ['new-one', 'new-two'].map((id) => ({
      id,
      name: id,
      uri: `spotify:track:${id}`,
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
      artists: [{ id: 'spotify-artist', name: 'Igorrr' }],
    }));
    const spotifyRequest = jest
      .spyOn(service as any, 'spotifyRequest')
      .mockImplementation(async (path: string) =>
        path.startsWith('/tracks?') ? { tracks: selectedTracks } : {},
      );

    await service.replaceGenreArtistTracks(playlist.id, 'artist-id', [
      'new-one',
      'new-two',
    ]);

    expect(spotifyRequest).toHaveBeenCalledWith(
      '/playlists/playlist-remote/items',
      'access-token',
      {
        method: 'DELETE',
        body: JSON.stringify({
          items: [{ uri: 'spotify:track:old-only' }],
        }),
      },
    );
    expect(spotifyRequest).not.toHaveBeenCalledWith(
      '/playlists/playlist-remote/items',
      'access-token',
      expect.objectContaining({
        body: expect.stringContaining('spotify:track:shared'),
      }),
    );
  });

  it('mezcla todas las canciones de una playlist de género y conserva sus duplicados', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
    } as any;
    const originalUris = [
      'spotify:track:one',
      'spotify:track:two',
      'spotify:track:two',
      'spotify:track:three',
    ];
    jest.spyOn(service, 'getGenrePlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUrisInOrder')
      .mockResolvedValue(originalUris);
    const replaceTracks = jest
      .spyOn(service as any, 'replaceSpotifyPlaylistTrackUris')
      .mockResolvedValue(undefined);

    await service.shuffleGenrePlaylist(playlist.id);

    const shuffledUris = replaceTracks.mock.calls[0][2] as string[];
    expect(shuffledUris).not.toEqual(originalUris);
    expect([...shuffledUris].sort()).toEqual([...originalUris].sort());
    expect(replaceTracks).toHaveBeenCalledTimes(1);
    expect(spotifyRepository.update).toHaveBeenCalledWith(
      playlist.id,
      expect.objectContaining({ updateDate: expect.any(Date) }),
    );
  });

  it('restaura el orden original si Spotify falla durante la mezcla', async () => {
    const playlist = {
      id: 'playlist-local',
      spotifyPlaylistId: 'playlist-remote',
    } as any;
    const originalUris = ['spotify:track:one', 'spotify:track:two'];
    jest.spyOn(service, 'getGenrePlaylist').mockResolvedValue(playlist);
    jest
      .spyOn(service as any, 'getValidAccessToken')
      .mockResolvedValue('access-token');
    jest
      .spyOn(service as any, 'getSpotifyPlaylistTrackUrisInOrder')
      .mockResolvedValue(originalUris);
    const replaceTracks = jest
      .spyOn(service as any, 'replaceSpotifyPlaylistTrackUris')
      .mockRejectedValueOnce(new Error('Spotify error'))
      .mockResolvedValueOnce(undefined);

    await expect(service.shuffleGenrePlaylist(playlist.id)).rejects.toThrow(
      'Spotify error',
    );

    expect(replaceTracks).toHaveBeenCalledTimes(2);
    expect(replaceTracks.mock.calls[1][2]).toEqual(originalUris);
    expect(spotifyRepository.update).not.toHaveBeenCalled();
  });
});
