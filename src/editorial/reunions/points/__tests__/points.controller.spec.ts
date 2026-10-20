import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { PointController } from '../points.controller';
import { UpdatePointDto } from '../dto/update-point.dto';

describe('PointController', () => {
  const pointService = {
    createPoint: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updatePoint: jest.fn(),
    deletePoint: jest.fn(),
  };
  const controller = new PointController(pointService as any);

  beforeEach(() => jest.clearAllMocks());

  it('preserves route paths, methods, public reads, and protected mutations', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PointController)).toBe('points');
    expect(
      Reflect.getMetadata(PATH_METADATA, PointController.prototype.create),
    ).toBe('/');
    expect(
      Reflect.getMetadata(METHOD_METADATA, PointController.prototype.create),
    ).toBe(1);
    expect(
      Reflect.getMetadata(PATH_METADATA, PointController.prototype.findAll),
    ).toBe('/');
    expect(
      Reflect.getMetadata(METHOD_METADATA, PointController.prototype.findAll),
    ).toBe(0);
    expect(
      Reflect.getMetadata(PATH_METADATA, PointController.prototype.findOne),
    ).toBe(':id');
    expect(
      Reflect.getMetadata(METHOD_METADATA, PointController.prototype.findOne),
    ).toBe(0);
    expect(
      Reflect.getMetadata(PATH_METADATA, PointController.prototype.update),
    ).toBe(':id');
    expect(
      Reflect.getMetadata(METHOD_METADATA, PointController.prototype.update),
    ).toBe(4);
    expect(
      Reflect.getMetadata(PATH_METADATA, PointController.prototype.remove),
    ).toBe(':id');
    expect(
      Reflect.getMetadata(METHOD_METADATA, PointController.prototype.remove),
    ).toBe(3);

    for (const method of ['create', 'update', 'remove']) {
      const handler = PointController.prototype[method];
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeDefined();
    }
    for (const method of ['findAll', 'findOne']) {
      expect(
        Reflect.getMetadata(
          META_MINIMUM_ROLE,
          PointController.prototype[method],
        ),
      ).toBeUndefined();
    }
  });

  it('delegates CRUD calls and returns service responses unchanged', async () => {
    const point = { id: 'point-id' };
    const dto = { titulo: 'Task', reunionId: 'reunion-id' };
    pointService.createPoint.mockResolvedValueOnce(point);
    pointService.findAll.mockResolvedValueOnce([point]);
    pointService.findOne.mockResolvedValueOnce(point);
    pointService.updatePoint.mockResolvedValueOnce(point);
    pointService.deletePoint.mockResolvedValueOnce(undefined);

    await expect(controller.create(dto as any)).resolves.toBe(point);
    await expect(controller.findAll()).resolves.toEqual([point]);
    await expect(controller.findOne('point-id')).resolves.toBe(point);
    await expect(controller.update('point-id', dto)).resolves.toBe(point);
    await expect(controller.remove('point-id')).resolves.toBeUndefined();

    expect(pointService.createPoint).toHaveBeenCalledWith(dto);
    expect(pointService.findOne).toHaveBeenCalledWith('point-id');
    expect(pointService.updatePoint).toHaveBeenCalledWith('point-id', dto);
    expect(pointService.deletePoint).toHaveBeenCalledWith('point-id');
  });

  it('validates partial PATCH fields with UpdatePointDto at runtime', async () => {
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      PointController.prototype,
      'update',
    ) as unknown[];
    expect(parameterTypes[1]).toBe(UpdatePointDto);

    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const body = {
      reunionId: '4d6db8d1-8c4c-4ba6-9d7c-00c5e9bf0f61',
    };
    const validated = await pipe.transform(body, {
      type: 'body',
      metatype: parameterTypes[1] as any,
      data: undefined,
    });
    expect(validated).toBeInstanceOf(UpdatePointDto);
    expect(validated).toMatchObject(body);
    pointService.updatePoint.mockResolvedValueOnce({
      id: 'point-id',
      reunion: { id: body.reunionId },
    });
    await expect(
      controller.update('point-id', validated as UpdatePointDto),
    ).resolves.toMatchObject({ reunion: { id: body.reunionId } });
    expect(pointService.updatePoint).toHaveBeenCalledWith(
      'point-id',
      validated,
    );

    for (const invalidBody of [
      { reunionId: 'not-a-uuid' },
      { reunionId: null },
      { titulo: null },
      { extra: true },
    ]) {
      await expect(
        pipe.transform(invalidBody, {
          type: 'body',
          metatype: parameterTypes[1] as any,
          data: undefined,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      pipe.transform(
        { content: null, done: null },
        {
          type: 'body',
          metatype: parameterTypes[1] as any,
          data: undefined,
        },
      ),
    ).resolves.toMatchObject({ content: null, done: null });
  });
});
