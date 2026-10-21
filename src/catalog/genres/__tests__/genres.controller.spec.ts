import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateGenreDto } from '../dto/create-genre.dto';
import { CreateGenresBatchDto } from '../dto/create-genres-batch.dto';
import { GenresQueryDto } from '../dto/genres-query.dto';
import { UpdateGenreDto } from '../dto/update-genre.dto';
import { GenresController } from '../genres.controller';
import { GenresService } from '../genres.service';
import { META_MINIMUM_ROLE } from '../../../identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from '../../../identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { User } from '../../../identity/auth/entities/user.entity';

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
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [GenresController],
      providers: [
        { provide: GenresService, useValue: service },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: jest.fn() })
      .compile();
    controller = moduleRef.get(GenresController);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  const handler = (method: keyof typeof GenresController.prototype) =>
    GenresController.prototype[method];

  const batchValidationPipe = () =>
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    });

  const queryValidationPipe = () =>
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    });

  it('maps POST /api/genres to create with CreateGenreDto and returns the service value unchanged', async () => {
    const dto = { name: 'Rock', color: '#123456' } as CreateGenreDto;
    const response = { id: 'genre-id', ...dto };
    service.create.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, GenresController)).toBe('genres');
    expect(Reflect.getMetadata(PATH_METADATA, handler('create'))).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('create'))).toBe(1);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        GenresController.prototype,
        'create',
      ),
    ).toEqual([CreateGenreDto]);
    await expect(controller.create(dto)).resolves.toBe(response);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('validates nested genres and preserves the batch success response', async () => {
    const body = {
      genres: [
        { name: 'Rock', color: '#123456' },
        { name: 'Jazz', color: '#abcdef' },
      ],
    };
    const response = {
      message: '2 genres have been successfully created.',
      data: body.genres,
    };
    service.bulkCreate.mockResolvedValue(response);

    const transformedBody = (await batchValidationPipe().transform(body, {
      type: 'body',
      metatype: CreateGenresBatchDto,
    })) as CreateGenresBatchDto;

    expect(Reflect.getMetadata(PATH_METADATA, handler('bulkCreate'))).toBe(
      'bultCreateGenre',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('bulkCreate'))).toBe(1);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        GenresController.prototype,
        'bulkCreate',
      ),
    ).toEqual([CreateGenresBatchDto]);
    expect(transformedBody).toBeInstanceOf(CreateGenresBatchDto);
    expect(transformedBody.genres[0]).toBeInstanceOf(CreateGenreDto);
    await expect(controller.bulkCreate(transformedBody)).resolves.toBe(
      response,
    );
    expect(service.bulkCreate).toHaveBeenCalledWith(transformedBody);
    expect(service.bulkCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps an empty batch valid and preserves its zero-count response', async () => {
    const body = { genres: [] };
    const response = {
      message: '0 genres have been successfully created.',
      data: [],
    };
    service.bulkCreate.mockResolvedValue(response);

    const transformedBody = await batchValidationPipe().transform(body, {
      type: 'body',
      metatype: CreateGenresBatchDto,
    });

    await expect(
      controller.bulkCreate(transformedBody as CreateGenresBatchDto),
    ).resolves.toBe(response);
  });

  it('rejects one invalid nested genre with HTTP 400 before calling the service', async () => {
    await expect(
      batchValidationPipe().transform(
        {
          genres: [
            { name: 'Rock', color: '#123456' },
            { name: '', color: '#abcdef' },
          ],
        },
        { type: 'body', metatype: CreateGenresBatchDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(service.bulkCreate).not.toHaveBeenCalled();
  });

  it('rejects multiple invalid nested genres with HTTP 400', async () => {
    await expect(
      batchValidationPipe().transform(
        {
          genres: [
            { name: null, color: '#123456' },
            { name: 'Jazz', color: null },
          ],
        },
        { type: 'body', metatype: CreateGenresBatchDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(service.bulkCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['missing name', { genres: [{ color: '#123456' }] }],
    ['missing color', { genres: [{ name: 'Rock' }] }],
    ['empty name', { genres: [{ name: '', color: '#123456' }] }],
    ['empty color', { genres: [{ name: 'Rock', color: '' }] }],
    ['non-array genres', { genres: 'Rock' }],
  ])('rejects %s with HTTP 400', async (_case, body) => {
    await expect(
      batchValidationPipe().transform(body, {
        type: 'body',
        metatype: CreateGenresBatchDto,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(service.bulkCreate).not.toHaveBeenCalled();
  });

  it('rejects incorrect field and item types with HTTP 400', async () => {
    await expect(
      batchValidationPipe().transform(
        { genres: [{ name: null, color: '#123456' }] },
        { type: 'body', metatype: CreateGenresBatchDto },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      batchValidationPipe().transform(
        { genres: [null] },
        { type: 'body', metatype: CreateGenresBatchDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(service.bulkCreate).not.toHaveBeenCalled();
  });

  it('maps GET /api/genres to findAll with GenresQueryDto and returns the complete pagination envelope', async () => {
    const query = { limit: 5, offset: 10 } as GenresQueryDto;
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
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        GenresController.prototype,
        'findAll',
      ),
    ).toEqual([GenresQueryDto]);
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
      new ParseUUIDPipe().transform('invalid', {
        type: 'param',
        metatype: String,
        data: 'id',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps PATCH /api/genres/:id with UpdateGenreDto and returns the service response unchanged', async () => {
    const id = 'c5dce76c-04b2-4b2b-8ca4-bb7365e86783';
    const dto = { color: '#abcdef' } as UpdateGenreDto;
    const response = { id, name: 'Rock', color: '#abcdef' };
    service.update.mockResolvedValue(response);

    expect(Reflect.getMetadata(PATH_METADATA, handler('update'))).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('update'))).toBe(4);
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        GenresController.prototype,
        'update',
      ),
    ).toEqual([String, UpdateGenreDto]);
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

  it('protects writes at riffvalley while keeping catalog reads public', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, GenresController),
    ).toBeUndefined();
    for (const method of ['findAll', 'findOne'] as const) {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, handler(method)),
      ).toBeUndefined();
    }
    for (const method of [
      'create',
      'bulkCreate',
      'update',
      'remove',
    ] as const) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler(method))).toContain(
        UserRoleGuard,
      );
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler(method))).toBe(
        ValidRoles.riffvalley,
      );
    }
  });

  it('propagates service errors without wrapping them', async () => {
    const error = new Error('service failure');
    service.update.mockRejectedValue(error);
    await expect(controller.update('id', {} as UpdateGenreDto)).rejects.toBe(
      error,
    );
  });

  it('confirms CreateGenreDto declares color optional in TypeScript but validates an absent color as required', async () => {
    const dto: CreateGenreDto = { name: 'Rock' };
    expect(dto.color).toBeUndefined();

    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        { name: 'Rock' },
        { type: 'body', metatype: CreateGenreDto },
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        message: expect.arrayContaining([expect.stringContaining('color')]),
      }),
    });
  });

  it('preserves omitted pagination defaults and valid query results', async () => {
    const response = {
      totalItems: 12,
      totalPages: 2,
      currentPage: 1,
      limit: 10,
      data: [{ id: 'genre-id', name: 'Rock', color: '#123456' }],
    };
    service.findAll.mockResolvedValue(response);

    const omittedQuery = (await queryValidationPipe().transform(
      {},
      {
        type: 'query',
        metatype: GenresQueryDto,
      },
    )) as GenresQueryDto;
    expect(omittedQuery.limit).toBeUndefined();
    expect(omittedQuery.offset).toBeUndefined();
    await expect(controller.findAll(omittedQuery)).resolves.toBe(response);
    expect(service.findAll).toHaveBeenLastCalledWith(omittedQuery);

    const validQuery = (await queryValidationPipe().transform(
      { limit: '150', offset: '0', query: 'rock' },
      { type: 'query', metatype: GenresQueryDto },
    )) as GenresQueryDto;
    expect(validQuery).toMatchObject({ limit: 150, offset: 0, query: 'rock' });
    await expect(controller.findAll(validQuery)).resolves.toBe(response);
    expect(service.findAll).toHaveBeenLastCalledWith(validQuery);

    await expect(
      queryValidationPipe().transform(
        {
          limit: String(Number.MAX_SAFE_INTEGER),
          offset: String(Number.MAX_SAFE_INTEGER),
        },
        { type: 'query', metatype: GenresQueryDto },
      ),
    ).resolves.toMatchObject({
      limit: Number.MAX_SAFE_INTEGER,
      offset: Number.MAX_SAFE_INTEGER,
    });
  });

  it.each([
    ['zero limit', { limit: '0', offset: '0' }],
    ['negative limit', { limit: '-1', offset: '0' }],
    ['negative offset', { limit: '5', offset: '-1' }],
    ['decimal limit', { limit: '1.5', offset: '0' }],
    ['decimal offset', { limit: '5', offset: '1.5' }],
    ['limit suffix', { limit: '5tail', offset: '0' }],
    ['offset suffix', { limit: '5', offset: '2tail' }],
    ['empty limit', { limit: '', offset: '0' }],
    ['empty offset', { limit: '5', offset: '' }],
    ['non-numeric limit', { limit: 'many', offset: '0' }],
    ['non-numeric offset', { limit: '5', offset: 'none' }],
    ['unsafe limit', { limit: '9007199254740992', offset: '0' }],
    ['unsafe offset', { limit: '5', offset: '9007199254740992' }],
  ])(
    'rejects %s with HTTP 400 before calling the service',
    async (_case, query) => {
      await expect(
        queryValidationPipe().transform(query, {
          type: 'query',
          metatype: GenresQueryDto,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(service.findAll).not.toHaveBeenCalled();
    },
  );
});
