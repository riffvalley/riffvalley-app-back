import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../../../identity/auth/entities/user.entity';
import { DiscsCalendarQueryDto } from '../dto/discs-calendar-query.dto';
import { DiscsListQueryDto } from '../dto/discs-list-query.dto';
import { TopStatsQueryDto } from '../dto/top-stats-query.dto';
import { TopDiscOptionsQueryDto } from '../dto/top-disc-options-query.dto';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration/api';
import { DiscCatalogService } from '../catalog/disc-catalog.service';
import { DiscCalendarService } from '../calendar/disc-calendar.service';
import { DiscEnrichmentService } from '../enrichment/disc-enrichment.service';
import { DiscTopService } from '../top/disc-top.service';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { OptionsQueryDto } from '../dto/options-query.dto';
import { RandomQueryDto } from '../dto/random-query.dto';
import { UpdateDiscDto } from '../dto/update-discs.dto';
import { DiscsService } from '../discs.service';
import { DiscSpotifyService } from '../spotify/disc-spotify.service';
import { DiscWriteService } from '../write/disc-write.service';

type AsyncMethod<Method extends (...args: never[]) => unknown> = jest.Mock<
  Promise<unknown>,
  Parameters<Method>
>;

type ServiceMocks = {
  spotifyApiService: {
    resolveAlbum: AsyncMethod<SpotifyPublicApiService['resolveAlbum']>;
    getAlbumDetails: AsyncMethod<SpotifyPublicApiService['getAlbumDetails']>;
  };
  discCatalogService: {
    findAll: AsyncMethod<DiscCatalogService['findAll']>;
    findRandom: AsyncMethod<DiscCatalogService['findRandom']>;
    findOptions: AsyncMethod<DiscCatalogService['findOptions']>;
    findOne: AsyncMethod<DiscCatalogService['findOne']>;
  };
  discCalendarService: {
    findAllByDate: AsyncMethod<DiscCalendarService['findAllByDate']>;
    findAllByDatePublic: AsyncMethod<
      DiscCalendarService['findAllByDatePublic']
    >;
    getPublicFilters: AsyncMethod<DiscCalendarService['getPublicFilters']>;
    findWeekly: AsyncMethod<DiscCalendarService['findWeekly']>;
  };
  discEnrichmentService: {
    findWeeklyWithoutImage: AsyncMethod<
      DiscEnrichmentService['findWeeklyWithoutImage']
    >;
    updateImage: AsyncMethod<DiscEnrichmentService['updateImage']>;
  };
  discWriteService: {
    create: AsyncMethod<DiscWriteService['create']>;
    createWithArtist: AsyncMethod<DiscWriteService['createWithArtist']>;
    update: AsyncMethod<DiscWriteService['update']>;
    remove: AsyncMethod<DiscWriteService['remove']>;
  };
  discSpotifyService: {
    getSpotifyTracks: AsyncMethod<DiscSpotifyService['getSpotifyTracks']>;
  };
  discTopService: {
    getTopDiscs: AsyncMethod<DiscTopService['getTopDiscs']>;
    getLegacyTopDiscs: AsyncMethod<DiscTopService['getLegacyTopDiscs']>;
    getTopDiscOptions: AsyncMethod<DiscTopService['getTopDiscOptions']>;
  };
};

function createServiceMocks(): ServiceMocks {
  return {
    spotifyApiService: {
      resolveAlbum: jest.fn(),
      getAlbumDetails: jest.fn(),
    },
    discCatalogService: {
      findAll: jest.fn(),
      findRandom: jest.fn(),
      findOptions: jest.fn(),
      findOne: jest.fn(),
    },
    discCalendarService: {
      findAllByDate: jest.fn(),
      findAllByDatePublic: jest.fn(),
      getPublicFilters: jest.fn(),
      findWeekly: jest.fn(),
    },
    discEnrichmentService: {
      findWeeklyWithoutImage: jest.fn(),
      updateImage: jest.fn(),
    },
    discWriteService: {
      create: jest.fn(),
      createWithArtist: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    },
    discSpotifyService: { getSpotifyTracks: jest.fn() },
    discTopService: {
      getTopDiscs: jest.fn(),
      getLegacyTopDiscs: jest.fn(),
      getTopDiscOptions: jest.fn(),
    },
  };
}

async function createTestingModule(
  mocks: ServiceMocks,
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      DiscsService,
      { provide: SpotifyPublicApiService, useValue: mocks.spotifyApiService },
      { provide: DiscCatalogService, useValue: mocks.discCatalogService },
      { provide: DiscCalendarService, useValue: mocks.discCalendarService },
      { provide: DiscEnrichmentService, useValue: mocks.discEnrichmentService },
      { provide: DiscWriteService, useValue: mocks.discWriteService },
      { provide: DiscSpotifyService, useValue: mocks.discSpotifyService },
      { provide: DiscTopService, useValue: mocks.discTopService },
    ],
  }).compile();
}

describe('DiscsService Spotify album operations', () => {
  let moduleRef: TestingModule;
  let service: DiscsService;
  let mocks: ServiceMocks;

  beforeEach(async () => {
    mocks = createServiceMocks();
    moduleRef = await createTestingModule(mocks);
    service = moduleRef.get(DiscsService);
  });

  afterEach(async () => moduleRef.close());

  it('resuelve un álbum por nombre y artista', async () => {
    const album = {
      spotifyId: 'spotify-album-id',
      name: 'Álbum',
      listenUrl: 'https://open.spotify.com/album/id',
      coverUrl: 'https://images.spotify.test/cover.jpg',
    };
    mocks.spotifyApiService.resolveAlbum.mockResolvedValue(album);

    await expect(service.resolveSpotifyAlbum('Álbum', 'Banda')).resolves.toBe(
      album,
    );
    expect(mocks.spotifyApiService.resolveAlbum).toHaveBeenCalledWith(
      'Banda',
      'Álbum',
    );
  });

  it('responde como no encontrado cuando Spotify no encuentra el álbum', async () => {
    mocks.spotifyApiService.resolveAlbum.mockResolvedValue(null);

    await expect(
      service.resolveSpotifyAlbum('Desconocido', 'Banda'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('obtiene el detalle por ID Spotify', async () => {
    const details = { spotifyId: 'spotify-album-id', tracks: [] };
    mocks.spotifyApiService.getAlbumDetails.mockResolvedValue(details);

    await expect(
      service.getSpotifyAlbumDetails('spotify-album-id'),
    ).resolves.toBe(details);
    expect(mocks.spotifyApiService.getAlbumDetails).toHaveBeenCalledWith(
      'spotify-album-id',
    );
  });

  it('delega la consulta de tracks Spotify y devuelve el payload sin cambios', async () => {
    const payload = [{ id: 'track-id', name: 'Track' }];
    mocks.discSpotifyService.getSpotifyTracks.mockResolvedValue(payload);

    await expect(service.getSpotifyTracks('disc-id')).resolves.toBe(payload);
    expect(mocks.discSpotifyService.getSpotifyTracks).toHaveBeenCalledWith(
      'disc-id',
    );
  });
});

describe('DiscsService facade', () => {
  let moduleRef: TestingModule;
  let service: DiscsService;
  let mocks: ServiceMocks;

  beforeEach(async () => {
    mocks = createServiceMocks();
    moduleRef = await createTestingModule(mocks);
    service = moduleRef.get(DiscsService);
  });

  afterEach(async () => moduleRef.close());

  it('can be instantiated with its providers', () => {
    expect(service).toBeInstanceOf(DiscsService);
  });

  it('delegates the TopDiscs ranking operation and returns its payload unchanged', async () => {
    const payload = {
      discs: [],
      totalDiscs: 2,
      totalVotes: 4,
      topUsersByRates: [],
      topUsersByCover: [],
      ratingDistribution: [],
    };
    mocks.discTopService.getTopDiscs.mockResolvedValue(payload);
    const pagination = new TopStatsQueryDto();
    pagination.dateRange = [new Date('2020-01-01'), new Date('2024-12-31')];
    const user = Object.assign(new User(), { id: 'user-id' });

    await expect(
      service.getTopDiscs(pagination, user, 'genre-id'),
    ).resolves.toBe(payload);
    expect(mocks.discTopService.getTopDiscs).toHaveBeenCalledWith(
      pagination,
      user,
      'genre-id',
    );
  });

  it('delegates dynamic TopDiscs options and returns the payload unchanged', async () => {
    const payload = { countries: [], genres: [] };
    const query = new TopDiscOptionsQueryDto();
    mocks.discTopService.getTopDiscOptions.mockResolvedValue(payload);

    await expect(service.getTopDiscOptions(query)).resolves.toBe(payload);
    expect(mocks.discTopService.getTopDiscOptions).toHaveBeenCalledWith(query);
  });

  it('delegates the legacy TopDiscs ranking independently', async () => {
    const payload = {
      discs: [],
      totalDiscs: 2,
      totalVotes: 4,
      topUsersByRates: [],
      topUsersByCover: [],
      ratingDistribution: [],
    };
    mocks.discTopService.getLegacyTopDiscs.mockResolvedValue(payload);
    const pagination = new TopStatsQueryDto();
    const user = Object.assign(new User(), { id: 'user-id' });

    await expect(
      service.getLegacyTopDiscs(pagination, user, 'genre-id'),
    ).resolves.toBe(payload);
    expect(mocks.discTopService.getLegacyTopDiscs).toHaveBeenCalledWith(
      pagination,
      user,
      'genre-id',
    );
    expect(mocks.discTopService.getTopDiscs).not.toHaveBeenCalled();
  });

  it('delegates all public write operations and returns their results unchanged', async () => {
    const createDto = Object.assign(new CreateDiscDto(), { name: 'Album' });
    const createWithArtistDto = Object.assign(new CreateDiscWithArtistDto(), {
      discName: 'Album',
      artistName: 'Artist',
    });
    const updateDto = Object.assign(new UpdateDiscDto(), {
      name: 'Updated album',
    });
    const createdDisc = { id: 'created-id' };
    const createdWithArtist = { id: 'created-with-artist-id' };
    const updatedDisc = { id: 'updated-id' };
    const removedDisc = { message: 'removed' };
    mocks.discWriteService.create.mockResolvedValue(createdDisc);
    mocks.discWriteService.createWithArtist.mockResolvedValue(
      createdWithArtist,
    );
    mocks.discWriteService.update.mockResolvedValue(updatedDisc);
    mocks.discWriteService.remove.mockResolvedValue(removedDisc);

    await expect(service.create(createDto)).resolves.toBe(createdDisc);
    await expect(service.createWithArtist(createWithArtistDto)).resolves.toBe(
      createdWithArtist,
    );
    await expect(service.update('disc-id', updateDto)).resolves.toBe(
      updatedDisc,
    );
    await expect(service.remove('disc-id')).resolves.toBe(removedDisc);

    expect(mocks.discWriteService.create).toHaveBeenCalledWith(createDto);
    expect(mocks.discWriteService.createWithArtist).toHaveBeenCalledWith(
      createWithArtistDto,
    );
    expect(mocks.discWriteService.update).toHaveBeenCalledWith(
      'disc-id',
      updateDto,
    );
    expect(mocks.discWriteService.remove).toHaveBeenCalledWith('disc-id');
  });

  it('delegates catalog methods and returns their results unchanged', async () => {
    const allResult = { data: ['all'] };
    const randomResult = ['random'];
    const optionsResult = ['options'];
    const discId = 'disc-id';
    const detail = { id: discId, name: 'Album' };
    mocks.discCatalogService.findAll.mockResolvedValue(allResult);
    mocks.discCatalogService.findRandom.mockResolvedValue(randomResult);
    mocks.discCatalogService.findOptions.mockResolvedValue(optionsResult);
    mocks.discCatalogService.findOne.mockResolvedValue(detail);
    const pagination = Object.assign(new DiscsListQueryDto(), { limit: 2 });
    const randomDto = Object.assign(new RandomQueryDto(), { limit: 3 });
    const optionsDto = Object.assign(new OptionsQueryDto(), { field: 'genre' });
    const user = Object.assign(new User(), { id: 'user-id' });

    await expect(service.findAll(pagination, user)).resolves.toBe(allResult);
    await expect(service.findRandom(randomDto, user)).resolves.toBe(
      randomResult,
    );
    await expect(service.findOptions(optionsDto)).resolves.toBe(optionsResult);
    await expect(service.findOne(discId)).resolves.toBe(detail);
    expect(mocks.discCatalogService.findAll).toHaveBeenCalledWith(
      pagination,
      user,
    );
    expect(mocks.discCatalogService.findRandom).toHaveBeenCalledWith(
      randomDto,
      user,
    );
    expect(mocks.discCatalogService.findOptions).toHaveBeenCalledWith(
      optionsDto,
    );
    expect(mocks.discCatalogService.findOne).toHaveBeenCalledWith(discId);
  });

  it('delegates image candidate lookup and image update unchanged', async () => {
    const candidates = [{ id: 'disc-id', artistName: 'Artist', name: 'Album' }];
    mocks.discEnrichmentService.findWeeklyWithoutImage.mockResolvedValue(
      candidates,
    );
    mocks.discEnrichmentService.updateImage.mockResolvedValue(undefined);

    await expect(service.findWeeklyWithoutImage(5, 2024, 3)).resolves.toBe(
      candidates,
    );
    await expect(
      service.updateImage('disc-id', 'https://image.test/album.jpg'),
    ).resolves.toBeUndefined();
    expect(
      mocks.discEnrichmentService.findWeeklyWithoutImage,
    ).toHaveBeenCalledWith(5, 2024, 3);
    expect(mocks.discEnrichmentService.updateImage).toHaveBeenCalledWith(
      'disc-id',
      'https://image.test/album.jpg',
    );
  });

  it('delegates calendar methods and returns their results unchanged', async () => {
    const authenticatedResult = { data: [{ releaseDate: '2025-01-01' }] };
    const publicResult = { data: [{ releaseDate: '2025-01-02' }] };
    const weeklyResult = [{ week: 2, label: '10-16 may', discs: [] }];
    mocks.discCalendarService.findAllByDate.mockResolvedValue(
      authenticatedResult,
    );
    mocks.discCalendarService.findAllByDatePublic.mockResolvedValue(
      publicResult,
    );
    mocks.discCalendarService.findWeekly.mockResolvedValue(weeklyResult);
    const pagination = Object.assign(new DiscsCalendarQueryDto(), {
      limit: 2,
      offset: 4,
    });
    const user = Object.assign(new User(), { id: 'user-id' });

    await expect(service.findAllByDate(pagination, user)).resolves.toBe(
      authenticatedResult,
    );
    await expect(service.findAllByDatePublic(pagination)).resolves.toBe(
      publicResult,
    );
    await expect(service.findWeekly(5, 2024, 2)).resolves.toBe(weeklyResult);
    expect(mocks.discCalendarService.findAllByDate).toHaveBeenCalledWith(
      pagination,
      user,
    );
    expect(mocks.discCalendarService.findAllByDatePublic).toHaveBeenCalledWith(
      pagination,
    );
    expect(mocks.discCalendarService.findWeekly).toHaveBeenCalledWith(
      5,
      2024,
      2,
    );

    const filterResult = { genres: [], countries: [] };
    mocks.discCalendarService.getPublicFilters.mockResolvedValue(filterResult);
    await expect(service.getPublicFilters()).resolves.toBe(filterResult);
    expect(mocks.discCalendarService.getPublicFilters).toHaveBeenCalledTimes(1);
  });
});
