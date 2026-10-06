import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ParseUUIDPipe } from '@nestjs/common';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { CreateArtistDto } from '../dto/create-artist.dto';
import { UpdateArtistDto } from '../dto/update-artist.dto';
import { ArtistsController } from '../artists.controller';
import { ArtistsService } from '../artists.service';

describe('ArtistsController contract characterization', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAllForManagement: jest.fn(),
    findOne: jest.fn(),
    findOneWithDetails: jest.fn(),
    findByName: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    removeOrphanArtists: jest.fn(),
  };
  let controller: ArtistsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ArtistsController(service as unknown as ArtistsService);
  });

  const route = (method: keyof typeof ArtistsController.prototype) =>
    ArtistsController.prototype[method] as Function;

  it('maps POST /artists to create and passes the CreateArtistDto unchanged', async () => {
    const dto = { name: 'Artist', countryId: 'country-id' } as CreateArtistDto;
    const response = { id: 'artist-id', ...dto };
    service.create.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, ArtistsController)).toBe('artists');
    expect(Reflect.getMetadata(PATH_METADATA, route('create'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, route('create'))).toBe(1);
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

  it('maps GET /artists/management and applies the current defaults and parsing', async () => {
    const response = { totalItems: 0, data: [] };
    service.findAllForManagement.mockResolvedValue(response);
    expect(Reflect.getMetadata(PATH_METADATA, route('findAllForManagement'))).toBe('management');
    expect(Reflect.getMetadata(METHOD_METADATA, route('findAllForManagement'))).toBe(0);

    await expect(controller.findAllForManagement()).resolves.toBe(response);
    expect(service.findAllForManagement).toHaveBeenLastCalledWith(
      undefined, 15, 0, undefined, undefined,
    );
    await controller.findAllForManagement('  Bjo +  ', '7tail', '-2', 'genre-id', 'true');
    expect(service.findAllForManagement).toHaveBeenLastCalledWith(
      '  Bjo +  ', 7, -2, 'genre-id', true,
    );
    await controller.findAllForManagement('', '0', '0', '', 'false');
    expect(service.findAllForManagement).toHaveBeenLastCalledWith('', 0, 0, '', false);
    await controller.findAllForManagement(undefined, undefined, undefined, undefined, 'TRUE');
    expect(service.findAllForManagement).toHaveBeenLastCalledWith(
      undefined, 15, 0, undefined, false,
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
    await expect(new ParseUUIDPipe().transform('invalid', {
      type: 'param', metatype: String, data: 'id',
    })).rejects.toMatchObject({ status: 400 });
  });

  it('maps GET /artists/:id/details and returns the service payload unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { id, country: null, discs: [], nationalReleases: [] };
    service.findOneWithDetails.mockResolvedValue(response);
    expect(Reflect.getMetadata(PATH_METADATA, route('findOneWithDetails'))).toBe(':id/details');
    expect(Reflect.getMetadata(METHOD_METADATA, route('findOneWithDetails'))).toBe(0);
    await expect(controller.findOneWithDetails(id)).resolves.toBe(response);
    expect(service.findOneWithDetails).toHaveBeenCalledTimes(1);
    expect(service.findOneWithDetails).toHaveBeenCalledWith(id);
  });

  it('maps GET /artists/search/by-name and forwards the name query', async () => {
    const response = [{ id: 'artist-id', discs: [] }];
    service.findByName.mockResolvedValue(response);
    expect(Reflect.getMetadata(PATH_METADATA, route('findByName'))).toBe('/search/by-name');
    expect(Reflect.getMetadata(METHOD_METADATA, route('findByName'))).toBe(0);
    await expect(controller.findByName('Artist + Name')).resolves.toBe(response);
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
    await expect(controller.update(id, dto)).resolves.toBe(response);
    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith(id, dto);
  });

  it('maps DELETE /artists/:id and restricts it to admin and riffValley', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { affected: 1 };
    service.remove.mockResolvedValue(response);
    const handler = route('remove');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(3);
    expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([
      ValidRoles.admin, ValidRoles.riffValley,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2);
    await expect(controller.remove(id)).resolves.toBe(response);
    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(service.remove).toHaveBeenCalledWith(id);
  });

  it('maps DELETE /artists/orphans/all and restricts it to admin and riffValley', async () => {
    const response = { deleted: 2, artists: ['A', 'B'] };
    service.removeOrphanArtists.mockResolvedValue(response);
    const handler = route('removeOrphans');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('orphans/all');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(3);
    expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([
      ValidRoles.admin, ValidRoles.riffValley,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2);
    await expect(controller.removeOrphans()).resolves.toBe(response);
    expect(service.removeOrphanArtists).toHaveBeenCalledTimes(1);
    expect(service.removeOrphanArtists).toHaveBeenCalledWith();
  });

  it('leaves every other route without explicit auth metadata and propagates service errors', async () => {
    const methods = [
      'create', 'findAll', 'findAllForManagement', 'findOne',
      'findOneWithDetails', 'findByName', 'update',
    ] as const;
    for (const method of methods) {
      expect(Reflect.getMetadata(META_ROLES, route(method))).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, route(method))).toBeUndefined();
    }
    const error = new Error('service failure');
    service.findByName.mockRejectedValue(error);
    await expect(controller.findByName('x')).rejects.toBe(error);
  });
});
