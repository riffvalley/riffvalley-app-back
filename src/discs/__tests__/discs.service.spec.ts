import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Artist } from '../../artists/entities/artist.entity';
import { User } from '../../auth/entities/user.entity';
import { SpotifyApiService } from '../../wordpress/spotify-api.service';
import { Disc } from '../entities/disc.entity';
import { DiscCatalogService } from '../catalog/disc-catalog.service';
import { DiscCalendarService } from '../calendar/disc-calendar.service';
import { DiscsService } from '../discs.service';

describe('DiscsService Spotify album operations', () => {
  const spotifyApiService = {
    resolveAlbum: jest.fn(),
    getAlbumDetails: jest.fn(),
  };

  const service = new DiscsService(
    {} as any,
    {} as any,
    spotifyApiService as any,
    {} as any,
    {} as any,
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

describe('DiscsService baseline', () => {
  let service: DiscsService;
  let discRepository: { findOneByOrFail: jest.Mock };
  let spotifyApiService: { getAlbumTracks: jest.Mock };

  beforeEach(() => {
    discRepository = { findOneByOrFail: jest.fn() };
    spotifyApiService = { getAlbumTracks: jest.fn() };

    service = new DiscsService(
      discRepository as unknown as Repository<Disc>,
      {} as Repository<Artist>,
      spotifyApiService as unknown as SpotifyApiService,
      {} as any,
      {} as any,
    );
  });

  it('can be instantiated with its repositories and service dependencies', () => {
    expect(service).toBeInstanceOf(DiscsService);
  });

  it('delegates catalog methods and returns their results unchanged', async () => {
    const catalog = {
      findAll: jest.fn().mockResolvedValue({ data: ['all'] }),
      findRandom: jest.fn().mockResolvedValue(['random']),
      findOptions: jest.fn().mockResolvedValue(['options']),
    };
    service = new DiscsService(
      discRepository as unknown as Repository<Disc>,
      {} as Repository<Artist>,
      spotifyApiService as unknown as SpotifyApiService,
      catalog as unknown as DiscCatalogService,
      {} as any,
    );
    const pagination = { limit: 2 } as any;
    const randomDto = { limit: 3 } as any;
    const optionsDto = { field: 'genre' } as any;
    const user = { id: 'user-id' } as User;

    await expect(service.findAll(pagination, user)).resolves.toEqual({ data: ['all'] });
    await expect(service.findRandom(randomDto, user)).resolves.toEqual(['random']);
    await expect(service.findOptions(optionsDto)).resolves.toEqual(['options']);
    expect(catalog.findAll).toHaveBeenCalledWith(pagination, user);
    expect(catalog.findRandom).toHaveBeenCalledWith(randomDto, user);
    expect(catalog.findOptions).toHaveBeenCalledWith(optionsDto);
  });

  it('finds a disc by id', async () => {
    const disc = { id: 'disc-id', name: 'Album' } as Disc;
    discRepository.findOneByOrFail.mockResolvedValue(disc);

    await expect(service.findOne(disc.id)).resolves.toBe(disc);
    expect(discRepository.findOneByOrFail).toHaveBeenCalledWith({ id: disc.id });
  });

  it('represents a missing disc as a not-found error', async () => {
    discRepository.findOneByOrFail.mockRejectedValue(new Error('missing'));

    await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('passes a found disc name and artist name to Spotify', async () => {
    discRepository.findOneByOrFail.mockResolvedValue({
      id: 'disc-id',
      name: 'Album',
      artist: { name: 'Artist' },
    });
    spotifyApiService.getAlbumTracks.mockResolvedValue([]);

    await expect(service.getSpotifyTracks('disc-id')).resolves.toEqual([]);
    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith(
      'Artist',
      'Album',
    );
  });

  it('uses empty artist name when a found disc has no artist', async () => {
    discRepository.findOneByOrFail.mockResolvedValue({
      id: 'disc-id',
      name: 'Album',
      artist: null,
    });
    spotifyApiService.getAlbumTracks.mockResolvedValue([]);

    await service.getSpotifyTracks('disc-id');

    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith('', 'Album');
  });
});



describe('DiscsService calendar facade', () => {
  it('delegates both calendar methods and returns their results unchanged', async () => {
    const authenticatedResult = { data: [{ releaseDate: '2025-01-01' }] };
    const publicResult = { data: [{ releaseDate: '2025-01-02' }] };
    const weeklyResult = [{ week: 2, label: '10-16 may', discs: [] }];
    const calendar = {
      findAllByDate: jest.fn().mockResolvedValue(authenticatedResult),
      findAllByDatePublic: jest.fn().mockResolvedValue(publicResult),
      getPublicFilters: jest.fn(),
      findWeekly: jest.fn().mockResolvedValue(weeklyResult),
    };
    const service = new DiscsService(
      {} as any,
      {} as any,
      {} as any,
      {} as DiscCatalogService,
      calendar as unknown as DiscCalendarService,
    );
    const pagination = { limit: 2, offset: 4 } as any;
    const user = { id: 'user-id' } as User;

    await expect(service.findAllByDate(pagination, user)).resolves.toBe(authenticatedResult);
    await expect(service.findAllByDatePublic(pagination)).resolves.toBe(publicResult);
    await expect(service.findWeekly(5, 2024, 2)).resolves.toBe(weeklyResult);
    expect(calendar.findAllByDate).toHaveBeenCalledWith(pagination, user);
    expect(calendar.findAllByDatePublic).toHaveBeenCalledWith(pagination);
    expect(calendar.findWeekly).toHaveBeenCalledWith(5, 2024, 2);

    const filterResult = { genres: [], countries: [] };
    calendar.getPublicFilters.mockResolvedValue(filterResult);
    await expect(service.getPublicFilters()).resolves.toBe(filterResult);
    expect(calendar.getPublicFilters).toHaveBeenCalledTimes(1);
  });
});
