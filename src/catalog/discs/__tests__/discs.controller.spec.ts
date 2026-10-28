import {
  BadRequestException,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRoleGuard } from '../../../identity/auth/guards/user-role/user-role.guard';
import { META_MINIMUM_ROLE } from '../../../identity/authorization/decorators/role-protected.decorator';
import { User } from '../../../identity/auth/entities/user.entity';
import { PaginationDto } from '../../../shared/dto/pagination.dto';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { OptionsQueryDto } from '../dto/options-query.dto';
import { RandomQueryDto } from '../dto/random-query.dto';
import { UpdateDiscDto } from '../dto/update-discs.dto';
import { TopStatsQueryDto } from '../dto/top-stats-query.dto';
import { TopDiscOptionsQueryDto } from '../dto/top-disc-options-query.dto';
import { DiscsController } from '../discs.controller';
import { DiscsService } from '../discs.service';
import { DiscListService } from '../list/disc-list.service';
import { DiscListQueryDto } from '../list/dto/disc-list-contracts.dto';

type ServiceMock = {
  create: jest.Mock<Promise<unknown>, Parameters<DiscsService['create']>>;
  createWithArtist: jest.Mock<
    Promise<unknown>,
    Parameters<DiscsService['createWithArtist']>
  >;
  findAll: jest.Mock<Promise<unknown>, Parameters<DiscsService['findAll']>>;
  findRandom: jest.Mock<
    Promise<unknown>,
    Parameters<DiscsService['findRandom']>
  >;
  findOptions: jest.Mock<
    Promise<unknown>,
    Parameters<DiscsService['findOptions']>
  >;
  findOne: jest.Mock<Promise<unknown>, Parameters<DiscsService['findOne']>>;
  getSpotifyTracks: jest.Mock<
    Promise<unknown>,
    Parameters<DiscsService['getSpotifyTracks']>
  >;
  getTopDiscs: jest.Mock<
    Promise<unknown>,
    Parameters<DiscsService['getTopDiscs']>
  >;
  getLegacyTopDiscs: jest.Mock<
    Promise<unknown>,
    Parameters<DiscsService['getLegacyTopDiscs']>
  >;
  getTopDiscOptions: jest.Mock<
    Promise<unknown>,
    Parameters<DiscsService['getTopDiscOptions']>
  >;
  update: jest.Mock<Promise<unknown>, Parameters<DiscsService['update']>>;
  remove: jest.Mock<Promise<unknown>, Parameters<DiscsService['remove']>>;
};

type DiscListServiceMock = {
  findAll: jest.Mock<Promise<unknown>, Parameters<DiscListService['findAll']>>;
};

describe('DiscsController baseline', () => {
  let controller: DiscsController;
  let moduleRef: TestingModule;
  let discsService: ServiceMock;
  let discListService: DiscListServiceMock;

  beforeEach(async () => {
    discsService = {
      create: jest.fn(),
      createWithArtist: jest.fn(),
      findAll: jest.fn(),
      findRandom: jest.fn(),
      findOptions: jest.fn(),
      findOne: jest.fn(),
      getSpotifyTracks: jest.fn(),
      getTopDiscs: jest.fn(),
      getLegacyTopDiscs: jest.fn(),
      getTopDiscOptions: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    discListService = { findAll: jest.fn() };
    moduleRef = await Test.createTestingModule({
      controllers: [DiscsController],
      providers: [
        { provide: DiscsService, useValue: discsService },
        { provide: DiscListService, useValue: discListService },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();
    controller = moduleRef.get(DiscsController);
  });

  afterEach(async () => moduleRef.close());

  it('registers the authenticated DiscList route before the dynamic ID route', async () => {
    const handler = DiscsController.prototype.findDiscList;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('list');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2);

    const methods = Object.getOwnPropertyNames(DiscsController.prototype);
    expect(methods.indexOf('findDiscList')).toBeLessThan(
      methods.indexOf('findOne'),
    );

    const dto = Object.assign(new DiscListQueryDto(), { mode: 'all' });
    const user = Object.assign(new User(), { id: 'authenticated-user' });
    const response = {
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      limit: 20,
      data: [],
    };
    discListService.findAll.mockResolvedValue(response);

    await expect(controller.findDiscList(dto, user)).resolves.toBe(response);
    expect(discListService.findAll).toHaveBeenCalledWith(dto, user);
    expect(discListService.findAll).toHaveBeenCalledTimes(1);
  });

  it('exposes authenticated GET routes for official TopDiscs and the legacy alias', () => {
    const officialHandler = DiscsController.prototype.getTopDiscs;
    const legacyHandler = DiscsController.prototype.findLegacyTopDiscs;

    expect(Reflect.getMetadata(PATH_METADATA, DiscsController)).toBe('discs');
    expect(Reflect.getMetadata(PATH_METADATA, officialHandler)).toBe(
      'topDiscs',
    );
    expect(Reflect.getMetadata(PATH_METADATA, legacyHandler)).toBe('homeDiscs');
    expect(Reflect.getMetadata(METHOD_METADATA, officialHandler)).toBe(0);
    expect(Reflect.getMetadata(METHOD_METADATA, legacyHandler)).toBe(0);
    expect(Reflect.getMetadata(GUARDS_METADATA, officialHandler)).toHaveLength(
      2,
    );
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, officialHandler)).toBe(
      undefined,
    );
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, legacyHandler)).toBe(
      Reflect.getMetadata(META_MINIMUM_ROLE, officialHandler),
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, legacyHandler)).toEqual(
      Reflect.getMetadata(GUARDS_METADATA, officialHandler),
    );
  });

  it('exposes the authenticated options route before the dynamic disc ID route', async () => {
    const handler = DiscsController.prototype.getTopDiscOptions;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'topDiscs/options',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2);

    const dto = new TopDiscOptionsQueryDto();
    const response = { countries: [], genres: [] };
    discsService.getTopDiscOptions.mockResolvedValue(response);

    await expect(controller.getTopDiscOptions(dto)).resolves.toBe(response);
    expect(discsService.getTopDiscOptions).toHaveBeenCalledWith(dto);
  });

  it('delegates GET /discs/topDiscs with the existing DTO, user and genre filter', async () => {
    const dto = Object.assign(new TopStatsQueryDto(), {
      dateRange: [new Date('2024-01-01'), new Date('2024-12-31')],
      country: 'country-name',
      countryId: 'country-id',
      genreId: 'genre-id',
      statsDateRange: [new Date('2024-01-01'), new Date('2024-12-31')],
    });
    const user = Object.assign(new User(), { id: 'user-id' });
    const response = {
      discs: [{ id: 'ranked-disc', weightedScore: '4.5' }],
      totalDiscs: 2,
      totalVotes: 4,
      topUsersByRates: [],
      topUsersByCover: [],
      ratingDistribution: [],
    };
    discsService.getTopDiscs.mockResolvedValue(response);

    await expect(controller.getTopDiscs(dto, user)).resolves.toBe(response);
    expect(discsService.getTopDiscs).toHaveBeenCalledWith(
      dto,
      user,
      'genre-id',
    );
    expect(discsService.getTopDiscs).toHaveBeenCalledTimes(1);
  });

  it('delegates GET /discs/homeDiscs independently from official TopDiscs', async () => {
    const dto = Object.assign(new TopStatsQueryDto(), {
      dateRange: [new Date('2024-01-01'), new Date('2024-12-31')],
      genreId: 'genre-id',
      countryId: 'country-id',
    });
    const user = Object.assign(new User(), { id: 'user-id' });
    const response = {
      discs: [{ id: 'ranked-disc', weightedScore: '4.5' }],
      totalDiscs: 2,
      totalVotes: 4,
      topUsersByRates: [],
      topUsersByCover: [],
      ratingDistribution: [],
    };
    discsService.getLegacyTopDiscs.mockResolvedValue(response);

    await expect(controller.findLegacyTopDiscs(dto, user)).resolves.toBe(
      response,
    );
    expect(discsService.getLegacyTopDiscs).toHaveBeenCalledWith(
      dto,
      user,
      'genre-id',
    );
    expect(discsService.getLegacyTopDiscs).toHaveBeenCalledTimes(1);
    expect(discsService.getTopDiscs).not.toHaveBeenCalled();
  });

  it('delegates relation IDs on POST /discs and returns its response unchanged', async () => {
    const dto = Object.assign(new CreateDiscDto(), {
      name: 'Album',
      artistId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320241',
      genreId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320242',
    });
    const response = {
      id: 'disc-id',
      name: 'Album',
      verified: false,
    };
    discsService.create.mockResolvedValue(response);

    await expect(controller.create(dto)).resolves.toBe(response);
    expect(discsService.create).toHaveBeenCalledWith(dto);
    expect(discsService.create).toHaveBeenCalledTimes(1);
  });

  it('delegates POST /discs/with-artist and returns the detail response unchanged', async () => {
    const dto = Object.assign(new CreateDiscWithArtistDto(), {
      discName: 'Album',
      artistName: 'Artist',
    });
    const response = {
      id: 'disc-id',
      name: 'Album',
      artist: { id: 'artist-id', country: { id: 'country-id' } },
    };
    discsService.createWithArtist.mockResolvedValue(response);

    await expect(controller.createWithArtist(dto)).resolves.toBe(response);
    expect(discsService.createWithArtist).toHaveBeenCalledWith(dto);
    expect(discsService.createWithArtist).toHaveBeenCalledTimes(1);
  });

  it('propagates the current ambiguity error from POST /discs/with-artist', async () => {
    const dto = Object.assign(new CreateDiscWithArtistDto(), {
      discName: 'Album',
      artistName: 'Duplicate',
    });
    const error = new BadRequestException(
      'Hay 2 artistas con el nombre "Duplicate". Especifica countryId para desambiguar.',
    );
    discsService.createWithArtist.mockRejectedValue(error);

    await expect(controller.createWithArtist(dto)).rejects.toBe(error);
    expect(error.getStatus()).toBe(400);
    expect(discsService.createWithArtist).toHaveBeenCalledWith(dto);
  });

  it('delegates query and authenticated user and returns the service response unchanged', async () => {
    const pagination = Object.assign(new PaginationDto(), {
      limit: 0,
      query: 'album',
    });
    const user = Object.assign(new User(), { id: 'user-id' });
    const response = { totalItems: 0, data: [] };
    discsService.findAll.mockResolvedValue(response);

    await expect(controller.findAll(pagination, user)).resolves.toBe(response);
    expect(discsService.findAll).toHaveBeenCalledWith(pagination, user);
  });

  it('delegates the path id and returns the service response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const disc = { id: 'disc-id', name: 'Album' };
    discsService.findOne.mockResolvedValue(disc);

    await expect(controller.findOne(id)).resolves.toBe(disc);
    expect(discsService.findOne).toHaveBeenCalledWith(id);
  });

  it('delegates GET /discs/:id/spotify-tracks and returns the track payload unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const payload = [{ id: 'spotify-track', name: 'Track' }];
    discsService.getSpotifyTracks.mockResolvedValue(payload);

    await expect(controller.getSpotifyTracks(id)).resolves.toBe(payload);
    expect(discsService.getSpotifyTracks).toHaveBeenCalledWith(id);
    expect(discsService.getSpotifyTracks).toHaveBeenCalledTimes(1);
  });

  it('keeps the detail not-found exception for GET /discs/:id', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const notFound = new NotFoundException(`Disc with id ${id} not found`);
    discsService.findOne.mockRejectedValue(notFound);

    await expect(controller.findOne(id)).rejects.toBe(notFound);
    expect(notFound.getStatus()).toBe(404);
    expect(discsService.findOne).toHaveBeenCalledWith(id);
  });

  it('delegates PATCH /discs/:id and returns the saved response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const dto = Object.assign(new UpdateDiscDto(), { name: 'Updated album' });
    const response = {
      id,
      name: 'Updated album',
      artist: { id: 'artist-id', country: { id: 'country-id' } },
      genre: { id: 'genre-id' },
      favorites: [{ id: 'favorite-id' }],
    };
    discsService.update.mockResolvedValue(response);

    await expect(controller.update(id, dto)).resolves.toBe(response);
    expect(discsService.update).toHaveBeenCalledWith(id, dto);
    expect(discsService.update).toHaveBeenCalledTimes(1);
  });

  it('delegates DELETE /discs/:id and returns the service response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { message: `Disc with id ${id} has been removed` };
    discsService.remove.mockResolvedValue(response);

    await expect(controller.remove(id)).resolves.toBe(response);
    expect(discsService.remove).toHaveBeenCalledWith(id);
    expect(discsService.remove).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-UUID detail path parameter with a 400 validation error', async () => {
    const pipe = new ParseUUIDPipe();

    await expect(
      pipe.transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'id',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('delegates random catalog queries with the authenticated user', async () => {
    const dto = Object.assign(new RandomQueryDto(), { limit: 3 });
    const user = Object.assign(new User(), { id: 'user-id' });
    const response = [{ id: 'disc-id' }];
    discsService.findRandom.mockResolvedValue(response);

    await expect(controller.findRandom(dto, user)).resolves.toBe(response);
    expect(discsService.findRandom).toHaveBeenCalledWith(dto, user);
  });

  it('delegates catalog option queries and returns their response unchanged', async () => {
    const dto = Object.assign(new OptionsQueryDto(), {
      field: 'genre' as const,
    });
    const response = [{ id: 'genre-id', name: 'Genre' }];
    discsService.findOptions.mockResolvedValue(response);

    await expect(controller.findOptions(dto)).resolves.toBe(response);
    expect(discsService.findOptions).toHaveBeenCalledWith(dto);
  });
});
