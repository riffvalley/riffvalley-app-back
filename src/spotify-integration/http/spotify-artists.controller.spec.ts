import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { SpotifyPublicApiService } from 'src/spotify-integration';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { SpotifyArtistsController } from './spotify-artists.controller';
import { SpotifyAlbumsController } from './spotify-albums.controller';

describe('SpotifyArtistsController contracts', () => {
  let app;
  let moduleRef: TestingModule;
  const spotifyApiService = {
    findArtist: jest.fn(),
    findArtistCandidates: jest.fn(),
    getArtistTopTracks: jest.fn(),
    getArtistAlbums: jest.fn(),
    getArtistImageCandidates: jest.fn(),
    getMostPopularAlbumTrack: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      controllers: [
        SpotifyArtistsController,
        SpotifyAlbumsController,
      ],
      providers: [
        { provide: SpotifyPublicApiService, useValue: spotifyApiService },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('sirve el perfil normalizado bajo /api/spotify/artists/search', async () => {
    const profile = {
      spotifyId: 'artist-id',
      name: 'Banda',
      listenUrl: 'https://open.spotify.com/artist/artist-id',
      imageUrl: null,
      genres: ['rock'],
      followers: 12,
      popularity: 78,
    };
    spotifyApiService.findArtist.mockResolvedValue(profile);

    await request(app.getHttpServer())
      .get('/api/spotify/artists/search')
      .query({ artistName: 'Banda' })
      .expect(200)
      .expect(profile);

    expect(spotifyApiService.findArtist).toHaveBeenCalledWith('Banda');
  });

  it('devuelve 404 para el artista inexistente y lista vacía sin candidatos', async () => {
    spotifyApiService.findArtist.mockResolvedValue(null);
    spotifyApiService.findArtistCandidates.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/spotify/artists/search')
      .query({ artistName: 'Desconocido' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/spotify/artists/search/multiple')
      .query({ artistName: 'Desconocido' })
      .expect(200, []);
  });

  it('devuelve top tracks con el contrato actual', async () => {
    const tracks = [
      {
        id: 'track-id',
        name: 'Tema',
        listenUrl: null,
        previewUrl: null,
        albumName: 'Disco',
        albumImageUrl: null,
        durationMs: 123000,
      },
    ];
    spotifyApiService.getArtistTopTracks.mockResolvedValue(tracks);

    await request(app.getHttpServer())
      .get('/api/spotify/artists/artist-id/top-tracks')
      .expect(200, tracks);
  });

  it('expone los álbumes normalizados y aplica defaults y validación del query', async () => {
    const result = {
      spotifyId: 'artist-id',
      items: [
        {
          id: 'album-id',
          name: 'Disco',
          albumType: 'album',
          releaseDate: null,
          listenUrl: null,
          coverUrl: null,
        },
      ],
    };
    spotifyApiService.getArtistAlbums.mockResolvedValue(result);

    await request(app.getHttpServer())
      .get('/api/spotify/artists/artist-id/albums')
      .expect(200, result);
    expect(spotifyApiService.getArtistAlbums).toHaveBeenLastCalledWith(
      'artist-id',
      ['album', 'single'],
      1,
    );

    await request(app.getHttpServer())
      .get('/api/spotify/artists/artist-id/albums')
      .query({ include_groups: 'album,single', limit: '5' })
      .expect(200, result);
    expect(spotifyApiService.getArtistAlbums).toHaveBeenLastCalledWith(
      'artist-id',
      ['album', 'single'],
      5,
    );

    await request(app.getHttpServer())
      .get('/api/spotify/artists/artist-id/albums')
      .query({ include_groups: 'album,podcast', limit: '51' })
      .expect(400);
    expect(spotifyApiService.getArtistAlbums).toHaveBeenCalledTimes(2);
  });

  it('preserva 404 para artista inexistente y traduce errores de Spotify a 502', async () => {
    spotifyApiService.getArtistAlbums.mockRejectedValueOnce(
      new NotFoundException('Artista no encontrado en Spotify'),
    );
    await request(app.getHttpServer())
      .get('/api/spotify/artists/missing/albums')
      .expect(404);

    spotifyApiService.getArtistAlbums.mockRejectedValueOnce(
      new BadGatewayException('No se pudo consultar Spotify'),
    );
    await request(app.getHttpServer())
      .get('/api/spotify/artists/artist-id/albums')
      .expect(502);
  });

  it('preserva el contrato de track más popular bajo /api/spotify/albums', async () => {
    spotifyApiService.getMostPopularAlbumTrack.mockResolvedValue({
      trackId: 'track-id',
    });

    await request(app.getHttpServer())
      .get('/api/spotify/albums/album-id/most-popular-track')
      .expect(200, { trackId: 'track-id' });
  });
});
