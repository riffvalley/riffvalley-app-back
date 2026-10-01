import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpotifyApiService } from './spotify-api.service';

describe('SpotifyApiService album operations', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: SpotifyApiService;

  const response = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });

  const queueToken = () => {
    fetchMock.mockResolvedValueOnce(
      response({ access_token: 'backend-only-token', expires_in: 3600 }),
    );
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'SPOTIFY_CLIENT_ID'
          ? 'backend-client-id'
          : 'backend-client-secret',
      ),
    } as unknown as ConfigService;
    service = new SpotifyApiService(configService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('resuelve un álbum y devuelve un resumen de Riff Valley', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        albums: {
          items: [
            {
              id: 'spotify-album-id',
              name: 'Álbum',
              external_urls: { spotify: 'https://open.spotify.com/album/id' },
              images: [{ url: 'https://images.spotify.test/cover.jpg' }],
              album_type: 'album',
              provider_only_field: 'ignored',
            },
          ],
        },
      }),
    );

    await expect(service.resolveAlbum('Banda', 'Álbum & Uno')).resolves.toEqual(
      {
        spotifyId: 'spotify-album-id',
        name: 'Álbum',
        listenUrl: 'https://open.spotify.com/album/id',
        coverUrl: 'https://images.spotify.test/cover.jpg',
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent('album:Álbum & Uno artist:Banda')}&type=album&limit=1`,
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: { Authorization: 'Bearer backend-only-token' },
    });
  });

  it('indica que no se encontró el álbum', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(response({ albums: { items: [] } }));

    await expect(
      service.resolveAlbum('Banda', 'Desconocido'),
    ).resolves.toBeNull();
  });

  it('mapea el detalle, las pistas, sus duraciones y previews', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        id: 'spotify-album-id',
        name: 'Álbum',
        artists: [{ name: 'Banda' }, { name: 'Invitado' }],
        images: [{ url: 'https://images.spotify.test/cover.jpg' }],
        release_date: '2026-09-30',
        total_tracks: 2,
        external_urls: { spotify: 'https://open.spotify.com/album/id' },
        tracks: {
          items: [
            {
              id: 'track-1',
              name: 'Primera',
              track_number: 1,
              duration_ms: 61000,
              preview_url: 'https://preview.spotify.test/track-1.mp3',
            },
            {
              id: 'track-2',
              name: 'Segunda',
              track_number: 2,
              duration_ms: 3600000,
              preview_url: null,
            },
          ],
        },
      }),
    );

    await expect(service.getAlbumDetails('spotify-album-id')).resolves.toEqual({
      spotifyId: 'spotify-album-id',
      name: 'Álbum',
      artistNames: ['Banda', 'Invitado'],
      coverUrl: 'https://images.spotify.test/cover.jpg',
      releaseDate: '2026-09-30',
      totalTracks: 2,
      listenUrl: 'https://open.spotify.com/album/id',
      tracks: [
        {
          id: 'track-1',
          name: 'Primera',
          number: 1,
          durationMs: 61000,
          previewUrl: 'https://preview.spotify.test/track-1.mp3',
        },
        {
          id: 'track-2',
          name: 'Segunda',
          number: 2,
          durationMs: 3600000,
          previewUrl: null,
        },
      ],
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.spotify.com/v1/albums/spotify-album-id',
    );
  });

  it('devuelve el ID del track con mayor popularidad', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({ items: [{ id: 'track-1' }, { id: 'track-2' }] }),
    );
    fetchMock.mockResolvedValueOnce(
      response({
        tracks: [
          { id: 'track-1', popularity: 37 },
          { id: 'track-2', popularity: 82 },
        ],
      }),
    );

    await expect(
      service.getMostPopularAlbumTrack('spotify-album-id'),
    ).resolves.toEqual({ trackId: 'track-2' });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.spotify.com/v1/albums/spotify-album-id/tracks?limit=50',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://api.spotify.com/v1/tracks?ids=track-1%2Ctrack-2',
    );
  });

  it('devuelve trackId null si el álbum no tiene tracks', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(response({ items: [] }));

    await expect(
      service.getMostPopularAlbumTrack('spotify-album-id'),
    ).resolves.toEqual({ trackId: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('conserva el primer track cuando hay empate de popularidad', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({ items: [{ id: 'track-first' }, { id: 'track-second' }] }),
    );
    fetchMock.mockResolvedValueOnce(
      response({
        tracks: [
          { id: 'track-first', popularity: 70 },
          { id: 'track-second', popularity: 70 },
        ],
      }),
    );

    await expect(
      service.getMostPopularAlbumTrack('spotify-album-id'),
    ).resolves.toEqual({ trackId: 'track-first' });
  });

  it('ignora IDs y popularidades incompletos', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        items: [
          { id: 'track-without-popularity' },
          { id: null },
          {},
          { id: 'track-valid' },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      response({
        tracks: [
          { id: 'track-without-popularity' },
          null,
          { popularity: 99 },
          { id: 'track-valid', popularity: 61 },
        ],
      }),
    );

    await expect(
      service.getMostPopularAlbumTrack('spotify-album-id'),
    ).resolves.toEqual({ trackId: 'track-valid' });
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://api.spotify.com/v1/tracks?ids=track-without-popularity%2Ctrack-valid',
    );
  });

  it('traduce un error del proveedor al consultar tracks', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(response({ items: [{ id: 'track-1' }] }));
    fetchMock.mockResolvedValueOnce(
      response({ error: 'provider-private-error' }, 503),
    );

    const thrown = await service
      .getMostPopularAlbumTrack('spotify-album-id')
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(BadGatewayException);
    expect((thrown as BadGatewayException).getStatus()).toBe(502);
    expect((thrown as BadGatewayException).message).not.toContain(
      'provider-private-error',
    );
  });

  it('devuelve nulos o valores vacíos cuando faltan datos opcionales', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        id: 'spotify-album-id',
        name: 'Álbum sin extras',
        tracks: {
          items: [
            {
              id: 'track-1',
              name: 'Pista',
              track_number: 1,
              duration_ms: 42000,
            },
          ],
        },
      }),
    );

    await expect(service.getAlbumDetails('spotify-album-id')).resolves.toEqual({
      spotifyId: 'spotify-album-id',
      name: 'Álbum sin extras',
      artistNames: [],
      coverUrl: null,
      releaseDate: null,
      totalTracks: 1,
      listenUrl: null,
      tracks: [
        {
          id: 'track-1',
          name: 'Pista',
          number: 1,
          durationMs: 42000,
          previewUrl: null,
        },
      ],
    });
  });

  it('traduce los errores del proveedor sin exponer su respuesta', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({ error: 'provider-private-error' }, 429),
    );

    const thrown = await service
      .resolveAlbum('Banda', 'Álbum')
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(BadGatewayException);
    expect((thrown as BadGatewayException).message).not.toContain(
      'provider-private-error',
    );
    expect((thrown as BadGatewayException).getStatus()).toBe(502);
  });

  it('encuentra un artista y devuelve su perfil de Riff Valley', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        artists: {
          items: [
            {
              id: 'spotify-artist-id',
              name: 'Banda',
              external_urls: { spotify: 'https://open.spotify.com/artist/id' },
              images: [{ url: 'https://images.spotify.test/artist.jpg' }],
              genres: ['rock', 'metal'],
              followers: { total: 12345 },
              popularity: 76,
              provider_only_field: 'ignored',
            },
          ],
        },
      }),
    );

    await expect(service.findArtist('Banda & Más')).resolves.toEqual({
      spotifyId: 'spotify-artist-id',
      name: 'Banda',
      listenUrl: 'https://open.spotify.com/artist/id',
      imageUrl: 'https://images.spotify.test/artist.jpg',
      genres: ['rock', 'metal'],
      followers: 12345,
      popularity: 76,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent('Banda & Más')}&type=artist&limit=1`,
    );
  });

  it('devuelve null si no encuentra artista y normaliza géneros vacíos', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(response({ artists: { items: [] } }));
    await expect(service.findArtist('Desconocido')).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(
      response({
        artists: {
          items: [{ id: 'artist-id', name: 'Sin géneros', images: [] }],
        },
      }),
    );
    await expect(service.findArtist('Sin géneros')).resolves.toMatchObject({
      spotifyId: 'artist-id',
      genres: [],
      imageUrl: null,
      followers: null,
      popularity: null,
    });
  });

  it('busca varias coincidencias y devuelve solo los datos de selector', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        artists: {
          items: [
            {
              id: 'artist-1',
              name: 'Banda',
              external_urls: { spotify: 'https://open.spotify.com/artist/1' },
              images: [{ url: 'https://images.spotify.test/1.jpg' }],
              genres: ['rock'],
              popularity: 90,
            },
            {
              id: 'artist-2',
              name: 'Banda tributo',
              external_urls: { spotify: 'https://open.spotify.com/artist/2' },
              images: [],
              genres: ['metal'],
            },
          ],
        },
      }),
    );

    await expect(service.findArtistCandidates('Banda')).resolves.toEqual([
      {
        spotifyId: 'artist-1',
        name: 'Banda',
        listenUrl: 'https://open.spotify.com/artist/1',
        imageUrl: 'https://images.spotify.test/1.jpg',
        genres: ['rock'],
      },
      {
        spotifyId: 'artist-2',
        name: 'Banda tributo',
        listenUrl: 'https://open.spotify.com/artist/2',
        imageUrl: null,
        genres: ['metal'],
      },
    ]);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent('Banda')}&type=artist&limit=5`,
    );
  });

  it('devuelve un único candidato sin imagen ni géneros cuando falta información', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        artists: {
          items: [{ id: 'artist-1', name: 'Artista sin metadatos' }],
        },
      }),
    );

    await expect(
      service.findArtistCandidates('Artista sin metadatos'),
    ).resolves.toEqual([
      {
        spotifyId: 'artist-1',
        name: 'Artista sin metadatos',
        listenUrl: null,
        imageUrl: null,
        genres: [],
      },
    ]);
  });

  it('devuelve una lista vacía cuando no hay coincidencias', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(response({ artists: { items: [] } }));

    await expect(
      service.findArtistCandidates('Desconocido'),
    ).resolves.toEqual([]);
  });

  it('limita los candidatos a cinco aunque el proveedor devuelva más', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        artists: {
          items: Array.from({ length: 8 }, (_, index) => ({
            id: `artist-${index + 1}`,
            name: `Artista ${index + 1}`,
          })),
        },
      }),
    );

    await expect(
      service.findArtistCandidates('Artista'),
    ).resolves.toHaveLength(5);
  });

  it('traduce errores del proveedor al buscar candidatos de artista', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({ error: 'provider-private-error' }, 503),
    );

    const thrown = await service
      .findArtistCandidates('Banda')
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(BadGatewayException);
    expect((thrown as BadGatewayException).getStatus()).toBe(502);
    expect((thrown as BadGatewayException).message).not.toContain(
      'provider-private-error',
    );
  });

  it('devuelve los top tracks con preview opcional', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({
        tracks: [
          {
            id: 'track-1',
            name: 'Tema uno',
            external_urls: { spotify: 'https://open.spotify.com/track/1' },
            preview_url: 'https://preview.spotify.test/1.mp3',
            album: {
              name: 'Disco uno',
              images: [{ url: 'https://images.spotify.test/album-1.jpg' }],
            },
            duration_ms: 183000,
          },
          {
            id: 'track-2',
            name: 'Tema dos',
            external_urls: { spotify: 'https://open.spotify.com/track/2' },
            preview_url: null,
            album: { name: 'Disco dos', images: [] },
            duration_ms: 204000,
          },
        ],
      }),
    );

    await expect(service.getArtistTopTracks('artist-id')).resolves.toEqual([
      {
        id: 'track-1',
        name: 'Tema uno',
        listenUrl: 'https://open.spotify.com/track/1',
        previewUrl: 'https://preview.spotify.test/1.mp3',
        albumName: 'Disco uno',
        albumImageUrl: 'https://images.spotify.test/album-1.jpg',
        durationMs: 183000,
      },
      {
        id: 'track-2',
        name: 'Tema dos',
        listenUrl: 'https://open.spotify.com/track/2',
        previewUrl: null,
        albumName: 'Disco dos',
        albumImageUrl: null,
        durationMs: 204000,
      },
    ]);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.spotify.com/v1/artists/artist-id/top-tracks?market=ES',
    );
  });

  it('normaliza datos opcionales ausentes y devuelve una lista vacía sin top tracks', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(response({ tracks: [] }));

    await expect(service.getArtistTopTracks('artist-id')).resolves.toEqual([]);

    fetchMock.mockResolvedValueOnce(
      response({
        tracks: [
          {
            id: 'track-without-extras',
            name: 'Sin datos opcionales',
          },
        ],
      }),
    );
    await expect(service.getArtistTopTracks('artist-id')).resolves.toEqual([
      {
        id: 'track-without-extras',
        name: 'Sin datos opcionales',
        listenUrl: null,
        previewUrl: null,
        albumName: null,
        albumImageUrl: null,
        durationMs: null,
      },
    ]);
  });

  it('devuelve una lista vacía si Spotify no proporciona imágenes', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({ id: 'artist-id', name: 'Sin imágenes', images: [] }),
    );
    await expect(
      service.getArtistImageCandidates('artist-id'),
    ).resolves.toEqual([]);
  });

  it('traduce errores al consultar operaciones de artista', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({ error: 'provider-private-error' }, 503),
    );

    const thrown = await service
      .findArtist('Banda')
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(BadGatewayException);
    expect((thrown as BadGatewayException).message).not.toContain(
      'provider-private-error',
    );
    expect((thrown as BadGatewayException).getStatus()).toBe(502);
  });

  it('traduce errores del proveedor al consultar top tracks', async () => {
    queueToken();
    fetchMock.mockResolvedValueOnce(
      response({ error: 'provider-private-error' }, 503),
    );

    const thrown = await service
      .getArtistTopTracks('artist-id')
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(BadGatewayException);
    expect((thrown as BadGatewayException).getStatus()).toBe(502);
    expect((thrown as BadGatewayException).message).not.toContain(
      'provider-private-error',
    );
  });
});
