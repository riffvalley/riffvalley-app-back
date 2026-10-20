import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { ReunionController } from '../reunions.controller';
import { UpdateReunionDto } from '../dto/update-reunion.dto';

describe('ReunionController', () => {
  const reunionService = {
    createReunion: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateReunion: jest.fn(),
    deleteReunion: jest.fn(),
  };
  const controller = new ReunionController(reunionService as any);

  beforeEach(() => jest.clearAllMocks());

  it('preserves route paths, methods, public reads, and protected mutations', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ReunionController)).toBe(
      'reunions',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, ReunionController.prototype.create),
    ).toBe('/');
    expect(
      Reflect.getMetadata(METHOD_METADATA, ReunionController.prototype.create),
    ).toBe(1);
    expect(
      Reflect.getMetadata(PATH_METADATA, ReunionController.prototype.findAll),
    ).toBe('/');
    expect(
      Reflect.getMetadata(METHOD_METADATA, ReunionController.prototype.findAll),
    ).toBe(0);
    expect(
      Reflect.getMetadata(PATH_METADATA, ReunionController.prototype.findOne),
    ).toBe(':id');
    expect(
      Reflect.getMetadata(METHOD_METADATA, ReunionController.prototype.findOne),
    ).toBe(0);
    expect(
      Reflect.getMetadata(PATH_METADATA, ReunionController.prototype.update),
    ).toBe(':id');
    expect(
      Reflect.getMetadata(METHOD_METADATA, ReunionController.prototype.update),
    ).toBe(4);
    expect(
      Reflect.getMetadata(PATH_METADATA, ReunionController.prototype.remove),
    ).toBe(':id');
    expect(
      Reflect.getMetadata(METHOD_METADATA, ReunionController.prototype.remove),
    ).toBe(3);

    for (const method of ['create', 'update', 'remove']) {
      const handler = ReunionController.prototype[method];
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeDefined();
    }
    for (const method of ['findAll', 'findOne']) {
      expect(
        Reflect.getMetadata(
          META_MINIMUM_ROLE,
          ReunionController.prototype[method],
        ),
      ).toBeUndefined();
    }
  });

  it('delegates CRUD calls and returns service responses unchanged', async () => {
    const reunion = { id: 'reunion-id' };
    const dto = { titulo: 'Weekly reunion' };
    reunionService.createReunion.mockResolvedValueOnce(reunion);
    reunionService.findAll.mockResolvedValueOnce([reunion]);
    reunionService.findOne.mockResolvedValueOnce(reunion);
    reunionService.updateReunion.mockResolvedValueOnce(reunion);
    reunionService.deleteReunion.mockResolvedValueOnce(undefined);

    await expect(controller.create(dto as any)).resolves.toBe(reunion);
    await expect(controller.findAll()).resolves.toEqual([reunion]);
    await expect(controller.findOne('reunion-id')).resolves.toBe(reunion);
    await expect(controller.update('reunion-id', dto)).resolves.toBe(reunion);
    await expect(controller.remove('reunion-id')).resolves.toBeUndefined();

    expect(reunionService.createReunion).toHaveBeenCalledWith(dto);
    expect(reunionService.findOne).toHaveBeenCalledWith('reunion-id');
    expect(reunionService.updateReunion).toHaveBeenCalledWith(
      'reunion-id',
      dto,
    );
    expect(reunionService.deleteReunion).toHaveBeenCalledWith('reunion-id');
  });

  it('validates partial PATCH fields with UpdateReunionDto at runtime', async () => {
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      ReunionController.prototype,
      'update',
    ) as unknown[];
    expect(parameterTypes[1]).toBe(UpdateReunionDto);

    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const body = { titulo: 'Renamed reunion' };
    const validated = await pipe.transform(body, {
      type: 'body',
      metatype: parameterTypes[1] as any,
      data: undefined,
    });
    expect(validated).toBeInstanceOf(UpdateReunionDto);
    expect(validated).toMatchObject(body);
    reunionService.updateReunion.mockResolvedValueOnce({
      id: 'reunion-id',
      ...body,
    });
    await expect(
      controller.update('reunion-id', validated as UpdateReunionDto),
    ).resolves.toMatchObject(body);
    expect(reunionService.updateReunion).toHaveBeenCalledWith(
      'reunion-id',
      validated,
    );

    for (const invalidBody of [
      { fecha: 'not-a-date' },
      { fecha: null },
      { titulo: null },
      { unexpected: true },
    ]) {
      await expect(
        pipe.transform(invalidBody, {
          type: 'body',
          metatype: parameterTypes[1] as any,
          data: undefined,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
