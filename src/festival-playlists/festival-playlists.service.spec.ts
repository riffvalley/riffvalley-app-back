import { ConfigService } from '@nestjs/config';
import { FestivalPlaylistsService } from './festival-playlists.service';

describe('FestivalPlaylistsService', () => {
  let service: FestivalPlaylistsService;
  let spotifyRepository: any;
  let artistRepository: any;
  let playlistArtistRepository: any;

  beforeEach(() => {
    const repository = {} as any;
    spotifyRepository = {
      create: jest.fn((value) => ({ id: 'playlist-local', ...value })),
      save: jest.fn(),
    };
    artistRepository = { findOneBy: jest.fn() };
    playlistArtistRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => ({ id: 'association-id', ...value })),
      save: jest.fn(async (value) => value),
      remove: jest.fn(),
    };
    const config = {
      get: jest.fn((name: string) =>
        name === 'SETLISTFM_API_KEY' ? 'setlist-key' : undefined,
      ),
    } as unknown as ConfigService;
    service = new FestivalPlaylistsService(
      repository,
      spotifyRepository,
      artistRepository,
      playlistArtistRepository,
      config,
      {} as any,
    );
  });

  afterEach(() => jest.restoreAllMocks());

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
  });
});
