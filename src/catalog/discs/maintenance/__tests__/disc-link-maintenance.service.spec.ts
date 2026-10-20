import { ConfigService } from '@nestjs/config';
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
    Promise<null>,
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
      .fn<Promise<null>, [string, string]>()
      .mockResolvedValue(null);
    Object.defineProperty(service, 'searchBandcamp', { value: bandcampSearch });
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

  it('mantiene el error de búsqueda ante fallo al obtener el token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    await service.checkMissingSpotifyLinks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(discRepo.save).not.toHaveBeenCalled();
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
