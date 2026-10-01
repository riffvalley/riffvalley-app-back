import { NotFoundException } from '@nestjs/common';
import { DiscsService } from './discs.service';

describe('DiscsService Spotify album operations', () => {
  const spotifyApiService = {
    resolveAlbum: jest.fn(),
    getAlbumDetails: jest.fn(),
  };

  const service = new DiscsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    spotifyApiService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('resuelve un álbum por nombre y artista', async () => {
    const album = {
      spotifyId: 'spotify-album-id',
      name: 'Álbum',
      listenUrl: 'https://open.spotify.com/album/id',
      coverUrl: 'https://images.spotify.test/cover.jpg',
    };
    spotifyApiService.resolveAlbum.mockResolvedValue(album);

    await expect(service.resolveSpotifyAlbum('Álbum', 'Banda')).resolves.toBe(
      album,
    );
    expect(spotifyApiService.resolveAlbum).toHaveBeenCalledWith(
      'Banda',
      'Álbum',
    );
  });

  it('responde como no encontrado cuando Spotify no encuentra el álbum', async () => {
    spotifyApiService.resolveAlbum.mockResolvedValue(null);

    await expect(
      service.resolveSpotifyAlbum('Desconocido', 'Banda'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('obtiene el detalle por ID Spotify', async () => {
    const details = { spotifyId: 'spotify-album-id', tracks: [] };
    spotifyApiService.getAlbumDetails.mockResolvedValue(details);

    await expect(
      service.getSpotifyAlbumDetails('spotify-album-id'),
    ).resolves.toBe(details);
    expect(spotifyApiService.getAlbumDetails).toHaveBeenCalledWith(
      'spotify-album-id',
    );
  });
});
