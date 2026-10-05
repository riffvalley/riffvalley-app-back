import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { SpotifyApiService } from 'src/wordpress/spotify-api.service';
import { DiscsService } from 'src/catalog/discs/discs.service';
import { DiscsController } from 'src/catalog/discs/discs.controller';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { SpotifyArtistsController } from './spotify-artists.controller';
import { SpotifyAlbumsController } from './spotify-albums.controller';

describe('SpotifyArtistsController contracts', () => {
  let app;
  let moduleRef: TestingModule;
  const discsService = {
    resolveSpotifyAlbum: jest.fn(),
    getSpotifyAlbumDetails: jest.fn(),
  };
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
        DiscsController,
      ],
      providers: [
        { provide: SpotifyApiService, useValue: spotifyApiService },
        { provide: DiscsService, useValue: discsService },
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

  it('preserva los contratos HTTP de búsqueda y detalle de álbum bajo /api/discs', async () => {
    const summary = {
      spotifyId: 'album-id',
      name: 'Disco',
      listenUrl: null,
      coverUrl: null,
    };
    const details = {
      ...summary,
      artistNames: ['Banda'],
      releaseDate: '2025-01',
      totalTracks: 1,
      tracks: [
        {
          id: 'track-id',
          name: 'Tema',
          number: 1,
          durationMs: 120000,
          previewUrl: null,
        },
      ],
    };
    discsService.resolveSpotifyAlbum.mockResolvedValue(summary);
    discsService.getSpotifyAlbumDetails.mockResolvedValue(details);

    await request(app.getHttpServer())
      .get('/api/discs/spotify/album')
      .query({ albumName: 'Disco', artistName: 'Banda' })
      .expect(200, summary);
    expect(discsService.resolveSpotifyAlbum).toHaveBeenCalledWith(
      'Disco',
      'Banda',
    );

    await request(app.getHttpServer())
      .get('/api/discs/spotify/album/album-id')
      .expect(200, details);
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
