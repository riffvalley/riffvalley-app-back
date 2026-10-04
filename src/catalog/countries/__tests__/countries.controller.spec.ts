import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import { CreateCountryDto } from '../dto/create-country.dto';
import { UpdateCountryDto } from '../dto/update-country.dto';
import { PaginationDto } from '../../../common/dtos/pagination.dto';
import { CountriesController } from '../countries.controller';
import { CountriesService } from '../countries.service';
import { META_ROLES } from '../../../auth/decorators/role-protected.decorator';

describe('CountriesController contract characterization', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  let controller: CountriesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CountriesController(service as unknown as CountriesService);
  });

  const handler = (method: keyof typeof CountriesController.prototype) =>
    CountriesController.prototype[method] as Function;

  const routeArgs = (method: keyof typeof CountriesController.prototype) =>
    Reflect.getMetadata(ROUTE_ARGS_METADATA, CountriesController, method as string);

  it('maps POST /api/countries to create with CreateCountryDto and returns the service value unchanged', async () => {
    const dto = { name: 'Spain' } as CreateCountryDto;
    const response = { id: 'country-id', name: 'Spain', isoCode: 'ES' };
    service.create.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, CountriesController)).toBe('countries');
    expect(Reflect.getMetadata(PATH_METADATA, handler('create'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('create'))).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata('design:paramtypes', CountriesController.prototype, 'create')).toEqual([
      CreateCountryDto,
    ]);
    expect(routeArgs('create')).toMatchObject({ '3:0': { index: 0, data: undefined } });
    await expect(controller.create(dto)).resolves.toBe(response);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('maps GET /api/countries to findAll with PaginationDto and returns the complete pagination envelope', async () => {
    const query = { limit: 5, offset: 10 } as PaginationDto;
    const response = {
      totalItems: 11,
      totalPages: 3,
      currentPage: 3,
      limit: 5,
      data: [{ id: 'country-id', name: 'Spain', isoCode: 'ES' }],
    };
    service.findAll.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('findAll'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('findAll'))).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('design:paramtypes', CountriesController.prototype, 'findAll')).toEqual([
      PaginationDto,
    ]);
    expect(routeArgs('findAll')).toMatchObject({ '4:0': { index: 0, data: undefined } });
    await expect(controller.findAll(query)).resolves.toBe(response);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  it('maps GET /api/countries/:id with ParseUUIDPipe and returns the Country from the service', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { id, name: 'Spain', isoCode: 'ES' };
    service.findOne.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('findOne'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('findOne'))).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('design:paramtypes', CountriesController.prototype, 'findOne')).toEqual([
      String,
    ]);
    expect(routeArgs('findOne')).toMatchObject({ '5:0': { index: 0, data: 'id' } });
    await expect(controller.findOne(id)).resolves.toBe(response);
    expect(service.findOne).toHaveBeenCalledWith(id);
    expect(service.findOne).toHaveBeenCalledTimes(1);

    const parameterMetadata = Object.values(routeArgs('findOne') as Record<string, any>);
    expect(parameterMetadata[0].pipes[0]).toBe(ParseUUIDPipe);
  });

  it('maps PATCH /api/countries/:id with UpdateCountryDto and returns the service value unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const dto = { name: 'España' } as UpdateCountryDto;
    const response = { id, name: 'España', isoCode: 'ES' };
    service.update.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('update'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('update'))).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata('design:paramtypes', CountriesController.prototype, 'update')).toEqual([
      String,
      UpdateCountryDto,
    ]);
    expect(routeArgs('update')).toMatchObject({
      '5:0': { index: 0, data: 'id' },
      '3:1': { index: 1, data: undefined },
    });
    await expect(controller.update(id, dto)).resolves.toBe(response);
    expect(service.update).toHaveBeenCalledWith(id, dto);
    expect(service.update).toHaveBeenCalledTimes(1);
    const updateArgs = Object.values(routeArgs('update') as Record<string, any>);
    expect(updateArgs.find((argument) => argument.index === 0)?.pipes[0]).toBe(ParseUUIDPipe);
  });

  it('maps DELETE /api/countries/:id and returns the DeleteResult unchanged, including affected = 0', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { raw: [], affected: 0 };
    service.remove.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('remove'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('remove'))).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata('design:paramtypes', CountriesController.prototype, 'remove')).toEqual([
      String,
    ]);
    expect(routeArgs('remove')).toMatchObject({ '5:0': { index: 0, data: 'id' } });
    await expect(controller.remove(id)).resolves.toBe(response);
    expect(service.remove).toHaveBeenCalledWith(id);
    expect(service.remove).toHaveBeenCalledTimes(1);
    const removeArgs = Object.values(routeArgs('remove') as Record<string, any>);
    expect(removeArgs[0].pipes[0]).toBe(ParseUUIDPipe);
  });

  it('has no explicit @Auth() guard metadata on the controller or any current route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CountriesController)).toBeUndefined();
    expect(Reflect.getMetadata(META_ROLES, CountriesController)).toBeUndefined();
    for (const method of ['create', 'findAll', 'findOne', 'update', 'remove'] as const) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler(method))).toBeUndefined();
      expect(Reflect.getMetadata(META_ROLES, handler(method))).toBeUndefined();
    }
  });

  it.each(['create', 'findAll', 'findOne', 'update', 'remove'] as const)(
    'propagates service errors from %s without wrapping them', async (method) => {
      const error = new Error('service failure');
      const call = {
        create: () => controller.create({ name: 'Spain' } as CreateCountryDto),
        findAll: () => controller.findAll({} as PaginationDto),
        findOne: () => controller.findOne('country-id'),
        update: () => controller.update('country-id', { name: 'Spain' }),
        remove: () => controller.remove('country-id'),
      }[method];
      service[method].mockRejectedValue(error);

      await expect(call()).rejects.toBe(error);
    },
  );
});
