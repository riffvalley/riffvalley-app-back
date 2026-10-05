import { ConfigService } from '@nestjs/config';
import { ContentSchedulerService } from './content-scheduler.service';
import { SpotifyClientCredentialsService } from 'src/spotify-integration/api/spotify-client-credentials.service';

describe('ContentSchedulerService Spotify transport characterization', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let scheduler: ContentSchedulerService;
  let disc: any;
  let discRepo: any;
  let spotifyClient: SpotifyClientCredentialsService;
  let bandcampSearch: jest.Mock;

  const jsonResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(body),
  });

  const spotifyResult = (items: any[]) => ({ albums: { items } });
  const album = (artistName: string) => ({
    external_urls: { spotify: 'https://open.spotify.com/album/remote-id' },
    images: [{ url: 'https://images.test/cover.jpg' }],
    artists: [{ name: artistName }],
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    disc = {
      name: 'Álbum & Uno',
      artist: { name: 'Bánda’ Norte' },
      releaseDate: new Date('2020-01-01T00:00:00.000Z'),
      link: null,
      image: null,
      verified: false,
    };
    discRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([disc]),
      })),
      save: jest.fn().mockResolvedValue(disc),
    };
    spotifyClient = new SpotifyClientCredentialsService({
      get: (key: string) =>
        ({
          SPOTIFY_CLIENT_ID: 'client-id',
          SPOTIFY_CLIENT_SECRET: 'client-secret',
        })[key],
    } as unknown as ConfigService);
    scheduler = new ContentSchedulerService(
      { findOne: jest.fn() } as any,
      {} as any,
      discRepo,
      spotifyClient,
    );
    bandcampSearch = jest.fn().mockResolvedValue(null);
    (scheduler as any).searchBandcamp = bandcampSearch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('usa Client Credentials y conserva la búsqueda estricta, endpoint, filtros y respuesta', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(spotifyResult([album("Banda' Norte")])),
      );

    await scheduler.checkMissingSpotifyLinks();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({
        method: 'POST',
        body: 'grant_type=client_credentials',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.spotify.com/v1/search?q=${encodeURIComponent("album:Album & Uno artist:Banda' Norte")}&type=album&limit=1`,
      { headers: { Authorization: 'Bearer token' } },
    );
    expect(disc).toEqual(
      expect.objectContaining({
        link: 'https://open.spotify.com/album/remote-id',
        image: 'https://images.test/cover.jpg',
        verified: true,
      }),
    );
    expect(bandcampSearch).not.toHaveBeenCalled();
  });

  it('mantiene el fallback Bandcamp antes de la búsqueda amplia y valida el artista', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])))
      .mockResolvedValueOnce(
        jsonResponse(spotifyResult([album("Banda' Norte")])),
      );

    await scheduler.checkMissingSpotifyLinks();

    expect(bandcampSearch).toHaveBeenCalledWith('Bánda’ Norte', 'Álbum & Uno');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `https://api.spotify.com/v1/search?q=${encodeURIComponent("Banda' Norte Album & Uno")}&type=album&limit=1`,
      { headers: { Authorization: 'Bearer token' } },
    );
    expect(disc.link).toBe('https://open.spotify.com/album/remote-id');
    expect(disc.verified).toBe(true);
  });

  it('mantiene la marca sin resultado cuando fallan Spotify estricto, Bandcamp y Spotify amplio', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])))
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])));

    await scheduler.checkMissingSpotifyLinks();

    expect(disc.link).toBe('No se encontró el álbum');
    expect(discRepo.save).toHaveBeenCalledWith(disc);
  });

  it('mantiene el error de búsqueda ante fallo al obtener el token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    await scheduler.checkMissingSpotifyLinks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(discRepo.save).not.toHaveBeenCalled();
  });
});
