import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from 'src/identity/auth/entities/user.entity';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ArtistManagementQueryDto } from '../dto/artist-management-query.dto';
import { CreateArtistDto } from '../dto/create-artist.dto';
import { UpdateArtistDto } from '../dto/update-artist.dto';
import { ArtistDirectoryQueryDto } from '../directory/dto/artist-directory-query.dto';
import { ArtistsController } from '../artists.controller';
import { ArtistsService } from '../artists.service';

describe('ArtistsController contract characterization', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAllForManagement: jest.fn(),
    findDirectory: jest.fn(),
    findOne: jest.fn(),
    findOneWithDetails: jest.fn(),
    findByName: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    removeOrphanArtists: jest.fn(),
  };
  let controller: ArtistsController;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [ArtistsController],
      providers: [
        { provide: ArtistsService, useValue: service },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: jest.fn() })
      .compile();
    controller = moduleRef.get(ArtistsController);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  const route = (method: keyof typeof ArtistsController.prototype) =>
    ArtistsController.prototype[method];

  it('maps POST /artists to create and passes the CreateArtistDto unchanged', async () => {
    const dto = { name: 'Artist', countryId: 'country-id' } as CreateArtistDto;
    const response = { id: 'artist-id', ...dto };
    service.create.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, ArtistsController)).toBe(
      'artists',
    );
    expect(Reflect.getMetadata(PATH_METADATA, route('create'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, route('create'))).toBe(1);
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, route('create'))).toBe(
      ValidRoles.riffvalley,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, route('create'))).toContain(
      UserRoleGuard,
    );
    await expect(controller.create(dto)).resolves.toBe(response);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('maps GET /artists and passes the PaginationDto unchanged', async () => {
    const query = { limit: 12, offset: 24 } as PaginationDto;
    const response = { totalItems: 1, data: [{ id: 'artist-id' }] };
    service.findAll.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, route('findAll'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, route('findAll'))).toBe(0);
    await expect(controller.findAll(query)).resolves.toBe(response);
    expect(service.findAll).toHaveBeenCalledTimes(1);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('exposes the directory as a separate public read route', async () => {
    const query = Object.assign(new ArtistDirectoryQueryDto(), {
      letter: 'T',
      q: 'The Cure',
      limit: 20,
      offset: 0,
    });
    const response = { totalItems: 1, data: [{ id: 'artist-id' }] };
    service.findDirectory.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, route('findDirectory'))).toBe(
      'directory',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, route('findDirectory'))).toBe(
      0,
    );
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, route('findDirectory'))).toBe(
      undefined,
    );
    await expect(controller.findDirectory(query)).resolves.toBe(response);
    expect(service.findDirectory).toHaveBeenCalledWith(query);
  });

  it('maps GET /artists/management, validates the query DTO, and keeps valid defaults', async () => {
    const response = { totalItems: 0, data: [] };
    service.findAllForManagement.mockResolvedValue(response);
    expect(
      Reflect.getMetadata(PATH_METADATA, route('findAllForManagement')),
    ).toBe('management');
    expect(
      Reflect.getMetadata(METHOD_METADATA, route('findAllForManagement')),
    ).toBe(0);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        ArtistsController.prototype,
        'findAllForManagement',
      ),
    ).toEqual([ArtistManagementQueryDto]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, route('findAllForManagement')),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, route('findAllForManagement')),
    ).toBeUndefined();

    const validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const transformQuery = (value: object) =>
      validationPipe.transform(value, {
        type: 'query',
        metatype: ArtistManagementQueryDto,
      });

    const omittedQuery = (await transformQuery({})) as ArtistManagementQueryDto;
    await expect(controller.findAllForManagement(omittedQuery)).resolves.toBe(
      response,
    );
    expect(service.findAllForManagement).toHaveBeenLastCalledWith(
      undefined,
      15,
      0,
      undefined,
      undefined,
    );

    const validQuery = (await transformQuery({
      query: '  Bjo +  ',
      limit: '007',
      offset: '2',
      genreId: 'genre-id',
      needsReview: 'true',
    })) as ArtistManagementQueryDto;
    await controller.findAllForManagement(validQuery);
    expect(service.findAllForManagement).toHaveBeenLastCalledWith(
      '  Bjo +  ',
      7,
      2,
      'genre-id',
      true,
    );

    const falseReviewQuery = (await transformQuery({
      limit: '1',
      offset: '0',
      needsReview: 'false',
    })) as ArtistManagementQueryDto;
    await controller.findAllForManagement(falseReviewQuery);
    expect(service.findAllForManagement).toHaveBeenLastCalledWith(
      undefined,
      1,
      0,
      undefined,
      false,
    );

    const callCountBeforeInvalidQuery =
      service.findAllForManagement.mock.calls.length;
    await expect(transformQuery({ limit: '7tail' })).rejects.toMatchObject({
      status: 400,
    });
    expect(service.findAllForManagement).toHaveBeenCalledTimes(
      callCountBeforeInvalidQuery,
    );
  });

  it('maps GET /artists/:id and uses ParseUUIDPipe metadata', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { id, name: 'Artist', country: { id: 'country-id' } };
    service.findOne.mockResolvedValue(response);
    expect(Reflect.getMetadata(PATH_METADATA, route('findOne'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, route('findOne'))).toBe(0);
    await expect(controller.findOne(id)).resolves.toBe(response);
    expect(service.findOne).toHaveBeenCalledTimes(1);
    expect(service.findOne).toHaveBeenCalledWith(id);
    await expect(
      new ParseUUIDPipe().transform('invalid', {
        type: 'param',
        metatype: String,
        data: 'id',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps GET /artists/:id/details and returns the service payload unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { id, country: null, discs: [], nationalReleases: [] };
    service.findOneWithDetails.mockResolvedValue(response);
    expect(
      Reflect.getMetadata(PATH_METADATA, route('findOneWithDetails')),
    ).toBe(':id/details');
    expect(
      Reflect.getMetadata(METHOD_METADATA, route('findOneWithDetails')),
    ).toBe(0);
    await expect(controller.findOneWithDetails(id)).resolves.toBe(response);
    expect(service.findOneWithDetails).toHaveBeenCalledTimes(1);
    expect(service.findOneWithDetails).toHaveBeenCalledWith(id);
  });

  it('maps GET /artists/search/by-name and forwards the name query', async () => {
    const response = [{ id: 'artist-id', discs: [] }];
    service.findByName.mockResolvedValue(response);
    expect(Reflect.getMetadata(PATH_METADATA, route('findByName'))).toBe(
      '/search/by-name',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, route('findByName'))).toBe(0);
    await expect(controller.findByName('Artist + Name')).resolves.toBe(
      response,
    );
    expect(service.findByName).toHaveBeenCalledTimes(1);
    expect(service.findByName).toHaveBeenCalledWith('Artist + Name');
  });

  it('maps PATCH /artists/:id and passes the UpdateArtistDto unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const dto = { name: 'Renamed', countryId: 'country-id' } as UpdateArtistDto;
    const response = { id, ...dto, needsReview: false };
    service.update.mockResolvedValue(response);
    expect(Reflect.getMetadata(PATH_METADATA, route('update'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, route('update'))).toBe(4);
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, route('update'))).toBe(
      ValidRoles.riffvalley,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, route('update'))).toContain(
      UserRoleGuard,
    );
    await expect(controller.update(id, dto)).resolves.toBe(response);
    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith(id, dto);
  });

  it('maps DELETE /artists/:id and restricts it to riffvalley', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { affected: 1 };
    service.remove.mockResolvedValue(response);
    const handler = route('remove');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(3);
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
      ValidRoles.riffvalley,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2);
    await expect(controller.remove(id)).resolves.toBe(response);
    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(service.remove).toHaveBeenCalledWith(id);
  });

  it('maps DELETE /artists/orphans/all and restricts it to riffvalley', async () => {
    const response = { deleted: 2, artists: ['A', 'B'] };
    service.removeOrphanArtists.mockResolvedValue(response);
    const handler = route('removeOrphans');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('orphans/all');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(3);
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
      ValidRoles.riffvalley,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2);
    await expect(controller.removeOrphans()).resolves.toBe(response);
    expect(service.removeOrphanArtists).toHaveBeenCalledTimes(1);
    expect(service.removeOrphanArtists).toHaveBeenCalledWith();
  });

  it('allows persisted superadmin for artist operations through the riffvalley minimum', async () => {
    const repository = {
      findIdentityById: jest.fn().mockResolvedValue({
        role: ValidRoles.superadmin,
        isActive: true,
      }),
    };
    const guard = new UserRoleGuard(new Reflector(), repository as never);

    for (const handler of [
      ArtistsController.prototype.remove,
      ArtistsController.prototype.removeOrphans,
    ]) {
      const context = new ExecutionContextHost(
        [{ user: { id: 'user-id', username: 'admin' } }],
        ArtistsController,
        handler,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
  });

  it('keeps the remaining read routes public and propagates service errors', async () => {
    const methods = [
      'findAll',
      'findAllForManagement',
      'findOne',
      'findOneWithDetails',
      'findByName',
    ] as const;
    for (const method of methods) {
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, route(method)),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(GUARDS_METADATA, route(method)),
      ).toBeUndefined();
    }
    const error = new Error('service failure');
    service.findByName.mockRejectedValue(error);
    await expect(controller.findByName('x')).rejects.toBe(error);
  });
});
