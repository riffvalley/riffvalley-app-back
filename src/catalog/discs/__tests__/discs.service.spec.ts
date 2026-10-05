import { NotFoundException } from '@nestjs/common';
import { User } from '../../../auth/entities/user.entity';
import { SpotifyPublicApiService } from 'src/spotify-integration';
import { DiscCatalogService } from '../catalog/disc-catalog.service';
import { DiscCalendarService } from '../calendar/disc-calendar.service';
import { DiscEnrichmentService } from '../enrichment/disc-enrichment.service';
import { DiscsService } from '../discs.service';
import { DiscWriteService } from '../write/disc-write.service';
import { DiscSpotifyService } from '../spotify/disc-spotify.service';

describe('DiscsService Spotify album operations', () => {
  const spotifyApiService = {
    resolveAlbum: jest.fn(),
    getAlbumDetails: jest.fn(),
  };
  const discSpotifyService = { getSpotifyTracks: jest.fn() };

  const service = new DiscsService(
    spotifyApiService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    discSpotifyService as any,
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

  it('delega la consulta de tracks Spotify y devuelve el payload sin cambios', async () => {
    const payload = [{ id: 'track-id', name: 'Track' }];
    discSpotifyService.getSpotifyTracks.mockResolvedValue(payload);

    await expect(service.getSpotifyTracks('disc-id')).resolves.toBe(payload);
    expect(discSpotifyService.getSpotifyTracks).toHaveBeenCalledWith('disc-id');
  });
});

describe('DiscsService baseline', () => {
  let service: DiscsService;
  let discSpotifyService: { getSpotifyTracks: jest.Mock };
  let discWriteService: {
    create: jest.Mock;
    createWithArtist: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    discSpotifyService = { getSpotifyTracks: jest.fn() };
    discWriteService = {
      create: jest.fn(),
      createWithArtist: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    service = new DiscsService(
      {} as unknown as SpotifyPublicApiService,
      {} as any,
      {} as any,
      {} as any,
      discWriteService as unknown as DiscWriteService,
      discSpotifyService as unknown as DiscSpotifyService,
      {} as any,
    );
  });

  it('can be instantiated with its repositories and service dependencies', () => {
    expect(service).toBeInstanceOf(DiscsService);
  });

  it('delegates the home ranking operation and returns its payload unchanged', async () => {
    const payload = {
      discs: [],
      totalDiscs: 2,
      totalVotes: 4,
      topUsersByRates: [],
      topUsersByCover: [],
      ratingDistribution: [],
    };
    const home = {
      findTopRatedOrFeaturedAndStats: jest.fn().mockResolvedValue(payload),
    };
    service = new DiscsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      home as any,
    );
    const pagination = { dateRange: ['2020-01-01', '2024-12-31'] } as any;
    const user = { id: 'user-id' } as User;

    await expect(
      service.findTopRatedOrFeaturedAndStats(pagination, user, 'genre-id'),
    ).resolves.toBe(payload);
    expect(home.findTopRatedOrFeaturedAndStats).toHaveBeenCalledWith(
      pagination,
      user,
      'genre-id',
    );
  });

  it('delegates all public write operations and returns their results unchanged', async () => {
    const createDto = { name: 'Album' } as any;
    const createWithArtistDto = {
      discName: 'Album',
      artistName: 'Artist',
    } as any;
    const updateDto = { name: 'Updated album' } as any;
    const createdDisc = { id: 'created-id' };
    const createdWithArtist = { id: 'created-with-artist-id' };
    const updatedDisc = { id: 'updated-id' };
    const removedDisc = { message: 'removed' };
    discWriteService.create.mockResolvedValue(createdDisc);
    discWriteService.createWithArtist.mockResolvedValue(createdWithArtist);
    discWriteService.update.mockResolvedValue(updatedDisc);
    discWriteService.remove.mockResolvedValue(removedDisc);

    await expect(service.create(createDto)).resolves.toBe(createdDisc);
    await expect(service.createWithArtist(createWithArtistDto)).resolves.toBe(
      createdWithArtist,
    );
    await expect(service.update('disc-id', updateDto)).resolves.toBe(
      updatedDisc,
    );
    await expect(service.remove('disc-id')).resolves.toBe(removedDisc);

    expect(discWriteService.create).toHaveBeenCalledWith(createDto);
    expect(discWriteService.createWithArtist).toHaveBeenCalledWith(
      createWithArtistDto,
    );
    expect(discWriteService.update).toHaveBeenCalledWith('disc-id', updateDto);
    expect(discWriteService.remove).toHaveBeenCalledWith('disc-id');
  });

  it('delegates catalog methods and returns their results unchanged', async () => {
    const catalog = {
      findAll: jest.fn().mockResolvedValue({ data: ['all'] }),
      findRandom: jest.fn().mockResolvedValue(['random']),
      findOptions: jest.fn().mockResolvedValue(['options']),
      findOne: jest.fn().mockResolvedValue({ id: 'disc-id', name: 'Album' }),
    };
    service = new DiscsService(
      {} as unknown as SpotifyPublicApiService,
      catalog as unknown as DiscCatalogService,
      {} as any,
      {} as any,
      discWriteService as unknown as DiscWriteService,
      discSpotifyService as unknown as DiscSpotifyService,
      {} as any,
    );
    const pagination = { limit: 2 } as any;
    const randomDto = { limit: 3 } as any;
    const optionsDto = { field: 'genre' } as any;
    const discId = 'disc-id';
    const detail = { id: discId, name: 'Album' };
    catalog.findOne.mockResolvedValue(detail);
    const user = { id: 'user-id' } as User;

    await expect(service.findAll(pagination, user)).resolves.toEqual({
      data: ['all'],
    });
    await expect(service.findRandom(randomDto, user)).resolves.toEqual([
      'random',
    ]);
    await expect(service.findOptions(optionsDto)).resolves.toEqual(['options']);
    await expect(service.findOne(discId)).resolves.toBe(detail);
    expect(catalog.findAll).toHaveBeenCalledWith(pagination, user);
    expect(catalog.findRandom).toHaveBeenCalledWith(randomDto, user);
    expect(catalog.findOptions).toHaveBeenCalledWith(optionsDto);
    expect(catalog.findOne).toHaveBeenCalledWith(discId);
  });
});

describe('DiscsService enrichment facade', () => {
  it('delegates image candidate lookup and image update unchanged', async () => {
    const candidates = [{ id: 'disc-id', artistName: 'Artist', name: 'Album' }];
    const enrichment = {
      findWeeklyWithoutImage: jest.fn().mockResolvedValue(candidates),
      updateImage: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DiscsService(
      {} as any,
      {} as any,
      {} as any,
      enrichment as unknown as DiscEnrichmentService,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.findWeeklyWithoutImage(5, 2024, 3)).resolves.toBe(
      candidates,
    );
    await expect(
      service.updateImage('disc-id', 'https://image.test/album.jpg'),
    ).resolves.toBeUndefined();
    expect(enrichment.findWeeklyWithoutImage).toHaveBeenCalledWith(5, 2024, 3);
    expect(enrichment.updateImage).toHaveBeenCalledWith(
      'disc-id',
      'https://image.test/album.jpg',
    );
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
      calendar as unknown as DiscCalendarService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const pagination = { limit: 2, offset: 4 } as any;
    const user = { id: 'user-id' } as User;

    await expect(service.findAllByDate(pagination, user)).resolves.toBe(
      authenticatedResult,
    );
    await expect(service.findAllByDatePublic(pagination)).resolves.toBe(
      publicResult,
    );
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
