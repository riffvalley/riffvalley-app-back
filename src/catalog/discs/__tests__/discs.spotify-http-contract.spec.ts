import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { DiscsController } from '../discs.controller';
import { DiscsService } from '../discs.service';

describe('DiscsController Spotify album contracts', () => {
  let app;
  let moduleRef: TestingModule;
  const discsService = {
    resolveSpotifyAlbum: jest.fn(),
    getSpotifyAlbumDetails: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      controllers: [DiscsController],
      providers: [{ provide: DiscsService, useValue: discsService }],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('preserves album search and details under /api/discs', async () => {
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
});
