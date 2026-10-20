import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateCountryDto } from '../dto/create-country.dto';
import { UpdateCountryDto } from '../dto/update-country.dto';
import { CountriesQueryDto } from '../dto/countries-query.dto';
import { CountriesController } from '../countries.controller';
import { CountriesService } from '../countries.service';
import { META_MINIMUM_ROLE } from '../../../identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from '../../../identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { User } from '../../../identity/auth/entities/user.entity';

type RouteParameterMetadata = {
  index: number;
  pipes?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRouteParameterMetadata(
  value: unknown,
): value is RouteParameterMetadata {
  return (
    isRecord(value) &&
    typeof value.index === 'number' &&
    (!('pipes' in value) || Array.isArray(value.pipes))
  );
}

describe('CountriesController contract characterization', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  let controller: CountriesController;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [CountriesController],
      providers: [
        { provide: CountriesService, useValue: service },
        { provide: UserRoleGuard, useValue: { canActivate: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    controller = moduleRef.get(CountriesController);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  const handler = (method: keyof typeof CountriesController.prototype) =>
    CountriesController.prototype[method];

  const routeArgs = (method: keyof typeof CountriesController.prototype) =>
    Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      CountriesController,
      method as string,
    );

  it('maps POST /api/countries to create with CreateCountryDto and returns the service value unchanged', async () => {
    const dto = { name: 'Spain' } as CreateCountryDto;
    const response = { id: 'country-id', name: 'Spain', isoCode: 'ES' };
    service.create.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, CountriesController)).toBe(
      'countries',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('create'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('create'))).toBe(
      RequestMethod.POST,
    );
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        CountriesController.prototype,
        'create',
      ),
    ).toEqual([CreateCountryDto]);
    expect(routeArgs('create')).toMatchObject({
      '3:0': { index: 0, data: undefined },
    });
    await expect(controller.create(dto)).resolves.toBe(response);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('maps GET /api/countries to findAll with CountriesQueryDto and returns the complete pagination envelope', async () => {
    const query = { limit: 5, offset: 10 } as CountriesQueryDto;
    const response = {
      totalItems: 11,
      totalPages: 3,
      currentPage: 3,
      limit: 5,
      data: [{ id: 'country-id', name: 'Spain', isoCode: 'ES' }],
    };
    service.findAll.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('findAll'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('findAll'))).toBe(
      RequestMethod.GET,
    );
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        CountriesController.prototype,
        'findAll',
      ),
    ).toEqual([CountriesQueryDto]);
    expect(routeArgs('findAll')).toMatchObject({
      '4:0': { index: 0, data: undefined },
    });
    await expect(controller.findAll(query)).resolves.toBe(response);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  it('maps GET /api/countries/:id with ParseUUIDPipe and returns the Country from the service', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { id, name: 'Spain', isoCode: 'ES' };
    service.findOne.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('findOne'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('findOne'))).toBe(
      RequestMethod.GET,
    );
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        CountriesController.prototype,
        'findOne',
      ),
    ).toEqual([String]);
    expect(routeArgs('findOne')).toMatchObject({
      '5:0': { index: 0, data: 'id' },
    });
    await expect(controller.findOne(id)).resolves.toBe(response);
    expect(service.findOne).toHaveBeenCalledWith(id);
    expect(service.findOne).toHaveBeenCalledTimes(1);

    const metadata: unknown = routeArgs('findOne');
    const parameterMetadata = isRecord(metadata)
      ? Object.values(metadata).filter(isRouteParameterMetadata)
      : [];
    expect(parameterMetadata[0]?.pipes?.[0]).toBe(ParseUUIDPipe);
  });

  it('maps PATCH /api/countries/:id with UpdateCountryDto and returns the service value unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const dto = { name: 'España' } as UpdateCountryDto;
    const response = { id, name: 'España', isoCode: 'ES' };
    service.update.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('update'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('update'))).toBe(
      RequestMethod.PATCH,
    );
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        CountriesController.prototype,
        'update',
      ),
    ).toEqual([String, UpdateCountryDto]);
    expect(routeArgs('update')).toMatchObject({
      '5:0': { index: 0, data: 'id' },
      '3:1': { index: 1, data: undefined },
    });
    await expect(controller.update(id, dto)).resolves.toBe(response);
    expect(service.update).toHaveBeenCalledWith(id, dto);
    expect(service.update).toHaveBeenCalledTimes(1);
    const metadata: unknown = routeArgs('update');
    const updateArgs = isRecord(metadata)
      ? Object.values(metadata).filter(isRouteParameterMetadata)
      : [];
    expect(
      updateArgs.find((argument) => argument.index === 0)?.pipes?.[0],
    ).toBe(ParseUUIDPipe);
  });

  it('maps DELETE /api/countries/:id and returns the DeleteResult unchanged, including affected = 0', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { raw: [], affected: 0 };
    service.remove.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('remove'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('remove'))).toBe(
      RequestMethod.DELETE,
    );
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        CountriesController.prototype,
        'remove',
      ),
    ).toEqual([String]);
    expect(routeArgs('remove')).toMatchObject({
      '5:0': { index: 0, data: 'id' },
    });
    await expect(controller.remove(id)).resolves.toBe(response);
    expect(service.remove).toHaveBeenCalledWith(id);
    expect(service.remove).toHaveBeenCalledTimes(1);
    const metadata: unknown = routeArgs('remove');
    const removeArgs = isRecord(metadata)
      ? Object.values(metadata).filter(isRouteParameterMetadata)
      : [];
    expect(removeArgs[0]?.pipes?.[0]).toBe(ParseUUIDPipe);
  });

  it('protects writes at riffvalley while keeping catalog reads public', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CountriesController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, CountriesController),
    ).toBeUndefined();
    for (const method of ['findAll', 'findOne'] as const) {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, handler(method)),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(META_MINIMUM_ROLE, handler(method)),
      ).toBeUndefined();
    }
    for (const method of ['create', 'update', 'remove'] as const) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler(method))).toContain(
        UserRoleGuard,
      );
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler(method))).toBe(
        ValidRoles.riffvalley,
      );
    }
  });

  it.each(['create', 'findAll', 'findOne', 'update', 'remove'] as const)(
    'propagates service errors from %s without wrapping them',
    async (method) => {
      const error = new Error('service failure');
      const call = {
        create: () => controller.create({ name: 'Spain' } as CreateCountryDto),
        findAll: () => controller.findAll({} as CountriesQueryDto),
        findOne: () => controller.findOne('country-id'),
        update: () => controller.update('country-id', { name: 'Spain' }),
        remove: () => controller.remove('country-id'),
      }[method];
      service[method].mockRejectedValue(error);

      await expect(call()).rejects.toBe(error);
    },
  );
});
