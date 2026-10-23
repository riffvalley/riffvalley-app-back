import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Disc } from '../../entities/disc.entity';
import { DiscLinkMaintenanceService } from '../disc-link-maintenance.service';
import { SpotifyClientCredentialsService } from 'src/integrations/spotify-integration/api/spotify-client-credentials.service';
import {
  SpotifyApiAlbum,
  SpotifyApiSearchResponse,
} from 'src/integrations/spotify-integration/api/spotify-public-api.types';

describe('DiscLinkMaintenanceService Spotify transport characterization', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let service: DiscLinkMaintenanceService;
  let disc: Disc;
  let discRepo: Repository<Disc>;
  let queryBuilder: Record<string, jest.Mock>;
  let spotifyClient: SpotifyClientCredentialsService;
  let bandcampSearch: jest.Mock<
    Promise<{ status: 'not-found' }>,
    [artistName: string, albumName: string]
  >;

  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status });

  const spotifyResult = (
    items: SpotifyApiAlbum[],
  ): SpotifyApiSearchResponse<SpotifyApiAlbum> => ({ albums: { items } });
  const album = (artistName: string): SpotifyApiAlbum => ({
    id: 'remote-id',
    name: 'Remote Album',
    album_type: 'album',
    external_urls: { spotify: 'https://open.spotify.com/album/remote-id' },
    images: [{ url: 'https://images.test/cover.jpg' }],
    artists: [
      {
        id: 'artist-id',
        name: artistName,
        external_urls: { spotify: 'https://open.spotify.com/artist/artist-id' },
      },
    ],
  });
  const bandcampHtml = `
    <ul class="result-items">
      <li class="searchresult">
        <a href="https://artist.bandcamp.com/album/record?from=search">
          <img src="https://img.test/cover_3.jpg">
        </a>
        <div class="heading">Record Name</div>
        <div class="subhead">by Artist Name</div>
      </li>
    </ul>`;

  beforeEach(() => {
    fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    global.fetch = fetchMock;
    disc = Object.assign(new Disc(), {
      name: 'Álbum & Uno',
      artist: { name: 'Bánda’ Norte' },
      releaseDate: new Date('2020-01-01T00:00:00.000Z'),
      link: null,
      image: null,
      verified: false,
    });
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([disc]),
    };
    discRepo = Object.assign(emptyRepository(), {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn().mockResolvedValue(disc),
    });
    spotifyClient = new SpotifyClientCredentialsService(
      new ConfigService({
        SPOTIFY_CLIENT_ID: 'client-id',
        SPOTIFY_CLIENT_SECRET: 'client-secret',
      }),
    );
    service = new DiscLinkMaintenanceService(discRepo, spotifyClient);
    bandcampSearch = jest
      .fn<Promise<{ status: 'not-found' }>, [string, string]>()
      .mockResolvedValue({ status: 'not-found' });
    Object.defineProperty(service, 'searchBandcamp', {
      configurable: true,
      value: bandcampSearch,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const useRealBandcampSearch = () => {
    const searchBandcamp =
      Object.getPrototypeOf(service).searchBandcamp.bind(service);
    Object.defineProperty(service, 'searchBandcamp', {
      configurable: true,
      value: searchBandcamp,
    });
  };

  it('usa Client Credentials y conserva la búsqueda estricta, endpoint, filtros y respuesta', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(spotifyResult([album("Banda' Norte")])),
      );

    await service.checkMissingSpotifyLinks();

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
    expect(discRepo.createQueryBuilder).toHaveBeenCalledWith('disc');
    expect(queryBuilder.leftJoinAndSelect.mock.calls).toEqual([
      ['disc.artist', 'artist'],
      ['disc.genre', 'genre'],
    ]);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'disc.releaseDate <= :today',
      { today: expect.any(Date) },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(disc.link IS NULL OR disc.link = :empty OR disc.link = :notFound OR disc.link = :error)',
      {
        empty: '',
        notFound: 'No se encontró el álbum',
        error: 'Error al realizar la búsqueda',
      },
    );
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

    await service.checkMissingSpotifyLinks();

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

    await service.checkMissingSpotifyLinks();

    expect(disc.link).toBe('No se encontró el álbum');
    expect(discRepo.save).toHaveBeenCalledWith(disc);
  });

  it('cuenta una respuesta vacía válida como no coincidencia, no como error', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])))
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])));

    await service.runDailyLinkMaintenance();

    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify finalizado: enlaces guardados=0, búsquedas sin coincidencia=1, errores de consulta=0',
    );
    expect(disc.link).toBe('No se encontró el álbum');
  });

  it('intenta Bandcamp y guarda su resultado si falla la búsqueda estricta de Spotify', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    useRealBandcampSearch();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(new Response(bandcampHtml));

    await service.runDailyLinkMaintenance();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(disc.link).toBe('https://artist.bandcamp.com/album/record');
    expect(disc.verified).toBe(true);
    expect(discRepo.save).toHaveBeenCalledWith(disc);
    expect(loggerLog.mock.calls.map(([message]) => message)).toEqual([
      'check-spotify iniciado: 1 discos pendientes',
      'check-spotify finalizado: enlaces guardados=1, búsquedas sin coincidencia=0, errores de consulta=1',
    ]);
  });

  it.each([400, 503])(
    'cuenta el error HTTP %i de Bandcamp y continúa con la búsqueda Spotify alternativa',
    async (status) => {
      const loggerLog = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation();
      useRealBandcampSearch();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ access_token: 'token', expires_in: 3600 }),
        )
        .mockResolvedValueOnce(jsonResponse(spotifyResult([])))
        .mockResolvedValueOnce(
          new Response('Bandcamp error', { status, statusText: 'Unavailable' }),
        )
        .mockResolvedValueOnce(
          jsonResponse(spotifyResult([album("Banda' Norte")])),
        );

      await service.runDailyLinkMaintenance();

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(disc.link).toBe('https://open.spotify.com/album/remote-id');
      expect(disc.verified).toBe(true);
      expect(loggerLog).toHaveBeenCalledWith(
        'check-spotify finalizado: enlaces guardados=1, búsquedas sin coincidencia=0, errores de consulta=1',
      );
    },
  );

  it('cuenta un error de conexión de Bandcamp y conserva el fallback Spotify', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    useRealBandcampSearch();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])))
      .mockRejectedValueOnce(new Error('Bandcamp connection failed'))
      .mockResolvedValueOnce(
        jsonResponse(spotifyResult([album("Banda' Norte")])),
      );

    await service.runDailyLinkMaintenance();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(disc.link).toBe('https://open.spotify.com/album/remote-id');
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify finalizado: enlaces guardados=1, búsquedas sin coincidencia=0, errores de consulta=1',
    );
  });

  it('mantiene el error de búsqueda ante fallo al obtener el token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    await service.checkMissingSpotifyLinks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(discRepo.save).not.toHaveBeenCalled();
  });

  it('emite solo el resumen diario con contadores reales tras fallos por disco', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation();
    const secondDisc = Object.assign(new Disc(), {
      ...disc,
      name: 'Fallo de búsqueda',
      artist: { name: 'Otra banda' },
      link: null,
    });
    const thirdDisc = Object.assign(new Disc(), {
      ...disc,
      name: 'Fallback correcto',
      artist: { name: 'Banda fallback' },
      link: null,
    });
    queryBuilder.getMany.mockResolvedValue([disc, secondDisc, thirdDisc]);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(spotifyResult([album('Bánda’ Norte')])),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])))
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])))
      .mockResolvedValueOnce(jsonResponse(spotifyResult([])));

    await service.runDailyLinkMaintenance();

    expect(loggerLog).toHaveBeenCalledTimes(2);
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify iniciado: 3 discos pendientes',
    );
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify finalizado: enlaces guardados=1, búsquedas sin coincidencia=2, errores de consulta=1',
    );
    expect(loggerError).not.toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalled();
    expect(disc.link).toBe('https://open.spotify.com/album/remote-id');
    expect(secondDisc.link).toBe('No se encontró el álbum');
    expect(thirdDisc.link).toBe('No se encontró el álbum');
    expect(loggerLog.mock.calls.map(([message]) => message)).toEqual([
      'check-spotify iniciado: 3 discos pendientes',
      'check-spotify finalizado: enlaces guardados=1, búsquedas sin coincidencia=2, errores de consulta=1',
    ]);
  });

  it('emite un resumen cero cuando no hay discos que actualizar', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    queryBuilder.getMany.mockResolvedValue([]);

    await service.runDailyLinkMaintenance();

    expect(loggerLog).toHaveBeenCalledTimes(2);
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify iniciado: 0 discos pendientes',
    );
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify finalizado: enlaces guardados=0, búsquedas sin coincidencia=0, errores de consulta=0',
    );
    expect(loggerError).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emite inicio y un resumen con el error de token', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    fetchMock.mockRejectedValueOnce(new Error('Spotify auth failed: 503'));

    await service.runDailyLinkMaintenance();

    expect(loggerLog).toHaveBeenCalledTimes(2);
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify iniciado: 1 discos pendientes',
    );
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify finalizado: enlaces guardados=0, búsquedas sin coincidencia=0, errores de consulta=1',
    );
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('emite un único resumen con un error si falla la consulta de discos diarios', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    queryBuilder.getMany.mockRejectedValue(new Error('database unavailable'));

    await service.runDailyLinkMaintenance();

    expect(loggerLog).toHaveBeenCalledTimes(1);
    expect(loggerLog).toHaveBeenCalledWith(
      'check-spotify finalizado: enlaces guardados=0, búsquedas sin coincidencia=0, errores de consulta=1',
    );
    expect(loggerError).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantiene el logging actual al invocarse manualmente sin opciones', async () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(spotifyResult([album('Bánda’ Norte')])),
      );

    await service.checkMissingSpotifyLinks();

    expect(loggerLog).toHaveBeenCalledWith(
      'Starting daily check for missing Spotify links...',
    );
    expect(loggerLog).toHaveBeenCalledWith(
      'Updated Spotify link for: Bánda’ Norte - Álbum & Uno',
    );
    expect(loggerLog).toHaveBeenCalledWith(
      'Daily check completed. Updated links for 1 discs.',
    );
    expect(loggerLog).not.toHaveBeenCalledWith(
      'Importación diaria completada: 1 correctos, 0 fallidos',
    );
  });

  it('conserva el parseo del primer resultado de álbum de Bandcamp', async () => {
    const html = `
      <ul class="result-items">
        <li class="searchresult">
          <a href="https://artist.bandcamp.com/album/record?from=search">
            <img src="https://img.test/cover_3.jpg">
          </a>
          <div class="heading">Record Name</div>
          <div class="subhead">by Artist Name</div>
        </li>
      </ul>`;
    fetchMock.mockResolvedValueOnce(new Response(html));
    const searchBandcamp =
      Object.getPrototypeOf(service).searchBandcamp.bind(service);

    await expect(searchBandcamp('Artist Name', 'Record Name')).resolves.toEqual(
      {
        status: 'found',
        link: 'https://artist.bandcamp.com/album/record',
        image: 'https://img.test/cover_10.jpg',
        albumName: 'Record Name',
        artistName: 'Artist Name',
      },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bandcamp.com/search?q=Artist%20Name%20Record%20Name&item_type=a',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});

function emptyRepository(): Repository<Disc> {
  return Object.create(Repository.prototype) as Repository<Disc>;
}
