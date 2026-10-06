import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { CreateGenreDto } from '../dto/create-genre.dto';
import { UpdateGenreDto } from '../dto/update-genre.dto';
import { PaginationDto } from '../../../common/dtos/pagination.dto';
import { GenresController } from '../genres.controller';
import { GenresService } from '../genres.service';

describe('GenresController contract characterization', () => {
  const service = {
    create: jest.fn(),
    bulkCreate: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  let controller: GenresController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new GenresController(service as unknown as GenresService);
  });

  const handler = (method: keyof typeof GenresController.prototype) =>
    GenresController.prototype[method] as Function;

  it('maps POST /api/genres to create with CreateGenreDto and returns the service value unchanged', async () => {
    const dto = { name: 'Rock', color: '#123456' } as CreateGenreDto;
    const response = { id: 'genre-id', ...dto };
    service.create.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, GenresController)).toBe('genres');
    expect(Reflect.getMetadata(PATH_METADATA, handler('create'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('create'))).toBe(1);
    expect(Reflect.getMetadata('design:paramtypes', GenresController.prototype, 'create')).toEqual([
      CreateGenreDto,
    ]);
    await expect(controller.create(dto)).resolves.toBe(response);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('preserves POST /api/genres/bultCreateGenre and its untyped { genres: [...] } body', async () => {
    const body = { genres: [{ name: 'Rock', color: '#123456' }] };
    const response = { message: '1 genres have been successfully created.', data: body.genres };
    service.bulkCreate.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('bulkCreate'))).toBe('bultCreateGenre');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('bulkCreate'))).toBe(1);
    expect(Reflect.getMetadata('design:paramtypes', GenresController.prototype, 'bulkCreate')).toEqual([
      Object,
    ]);
    await expect(controller.bulkCreate(body)).resolves.toBe(response);
    expect(service.bulkCreate).toHaveBeenCalledWith(body);
    expect(service.bulkCreate).toHaveBeenCalledTimes(1);
  });

  it('maps GET /api/genres to findAll with PaginationDto and returns the complete pagination envelope', async () => {
    const query = { limit: 5, offset: 10 } as PaginationDto;
    const response = {
      totalItems: 11,
      totalPages: 3,
      currentPage: 3,
      limit: 5,
      data: [{ id: 'genre-id', name: 'Rock', color: '#123456' }],
    };
    service.findAll.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('findAll'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('findAll'))).toBe(0);
    expect(Reflect.getMetadata('design:paramtypes', GenresController.prototype, 'findAll')).toEqual([
      PaginationDto,
    ]);
    await expect(controller.findAll(query)).resolves.toBe(response);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('maps GET /api/genres/:id with ParseUUIDPipe and propagates the service response', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { id, name: 'Rock', color: '#123456' };
    service.findOne.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('findOne'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('findOne'))).toBe(0);
    await expect(controller.findOne(id)).resolves.toBe(response);
    expect(service.findOne).toHaveBeenCalledWith(id);
    await expect(
      new ParseUUIDPipe().transform('invalid', { type: 'param', metatype: String, data: 'id' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps PATCH /api/genres/:id with UpdateGenreDto and returns the service response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const dto = { color: '#abcdef' } as UpdateGenreDto;
    const response = { id, name: 'Rock', color: '#abcdef' };
    service.update.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('update'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('update'))).toBe(4);
    expect(Reflect.getMetadata('design:paramtypes', GenresController.prototype, 'update')).toEqual([
      String,
      UpdateGenreDto,
    ]);
    await expect(controller.update(id, dto)).resolves.toBe(response);
    expect(service.update).toHaveBeenCalledWith(id, dto);
  });

  it('maps DELETE /api/genres/:id and returns the TypeORM DeleteResult unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const response = { raw: [], affected: 0 };
    service.remove.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('remove'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('remove'))).toBe(3);
    await expect(controller.remove(id)).resolves.toBe(response);
    expect(service.remove).toHaveBeenCalledWith(id);
  });

  it('has no explicit auth metadata on the controller or any current route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GenresController)).toBeUndefined();
    for (const method of ['create', 'bulkCreate', 'findAll', 'findOne', 'update', 'remove'] as const) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler(method))).toBeUndefined();
    }
  });

  it('propagates service errors without wrapping them', async () => {
    const error = new Error('service failure');
    service.update.mockRejectedValue(error);
    await expect(controller.update('id', {} as UpdateGenreDto)).rejects.toBe(error);
  });

  it('confirms CreateGenreDto declares color optional in TypeScript but validates an absent color as required', async () => {
    const dto: CreateGenreDto = { name: 'Rock' };
    expect(dto.color).toBeUndefined();

    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(
      pipe.transform({ name: 'Rock' }, { type: 'body', metatype: CreateGenreDto }),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ message: expect.arrayContaining([expect.stringContaining('color')]) }),
    });
  });

  it('confirms PaginationDto transforms query numbers, rejects limit zero, and permits a negative offset', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(
      pipe.transform({ limit: '0', offset: '-5' }, { type: 'query', metatype: PaginationDto }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      pipe.transform({ limit: '5', offset: '-5' }, { type: 'query', metatype: PaginationDto }),
    ).resolves.toMatchObject({ limit: 5, offset: -5 });
  });
});
