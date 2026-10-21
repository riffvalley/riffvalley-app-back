import {
  BadRequestException,
  CanActivate,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { PointController } from '../points.controller';
import { CreatePointDto } from '../dto/create-points.dto';
import { UpdatePointDto } from '../dto/update-point.dto';
import { PointService } from '../points.service';
import { Point } from '../entities/point.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';

const isGuardType = (value: unknown): value is Type<CanActivate> =>
  typeof value === 'function';

const guardsFor = (handlers: Array<(...args: never[]) => unknown>) =>
  handlers.flatMap((handler) => {
    const metadata: unknown = Reflect.getMetadata(GUARDS_METADATA, handler);
    return Array.isArray(metadata) ? metadata.filter(isGuardType) : [];
  });

describe('PointController', () => {
  const pointService: jest.Mocked<
    Pick<
      PointService,
      'createPoint' | 'findAll' | 'findOne' | 'updatePoint' | 'deletePoint'
    >
  > = {
    createPoint: jest.fn<Promise<Point>, [CreatePointDto]>(),
    findAll: jest.fn<Promise<Point[]>, []>(),
    findOne: jest.fn<Promise<Point>, [string]>(),
    updatePoint: jest.fn<Promise<Point>, [string, UpdatePointDto]>(),
    deletePoint: jest.fn<Promise<void>, [string]>(),
  };
  let controller: PointController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const guardProviders = guardsFor([
      PointController.prototype.create,
      PointController.prototype.update,
      PointController.prototype.remove,
    ]).map((guard) => ({
      provide: guard,
      useValue: { canActivate: () => true },
    }));
    const testingModule = Test.createTestingModule({
      controllers: [PointController],
      providers: [
        { provide: PointService, useValue: pointService },
        ...guardProviders,
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true });
    const moduleRef = await testingModule.compile();
    controller = moduleRef.get(PointController);
  });

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

    for (const handler of [
      PointController.prototype.create,
      PointController.prototype.update,
      PointController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeDefined();
    }
    for (const handler of [
      PointController.prototype.findAll,
      PointController.prototype.findOne,
    ]) {
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
    }
  });

  it('delegates CRUD calls and returns service responses unchanged', async () => {
    const reunion: Reunion = {
      id: 'reunion-id',
      titulo: 'Weekly reunion',
      fecha: new Date('2026-10-21T18:00:00.000Z'),
      points: [],
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    };
    const point: Point = {
      id: 'point-id',
      titulo: 'Task',
      content: '',
      reunion,
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
      done: false,
    };
    const dto: CreatePointDto = { titulo: 'Task', reunionId: reunion.id };
    const updateDto: UpdatePointDto = { titulo: dto.titulo };
    pointService.createPoint.mockResolvedValueOnce(point);
    pointService.findAll.mockResolvedValueOnce([point]);
    pointService.findOne.mockResolvedValueOnce(point);
    pointService.updatePoint.mockResolvedValueOnce(point);
    pointService.deletePoint.mockResolvedValueOnce(undefined);

    await expect(controller.create(dto)).resolves.toBe(point);
    await expect(controller.findAll()).resolves.toEqual([point]);
    await expect(controller.findOne('point-id')).resolves.toBe(point);
    await expect(controller.update('point-id', updateDto)).resolves.toBe(point);
    await expect(controller.remove('point-id')).resolves.toBeUndefined();

    expect(pointService.createPoint).toHaveBeenCalledWith(dto);
    expect(pointService.findOne).toHaveBeenCalledWith('point-id');
    expect(pointService.updatePoint).toHaveBeenCalledWith(
      'point-id',
      updateDto,
    );
    expect(pointService.deletePoint).toHaveBeenCalledWith('point-id');
  });

  it('validates partial PATCH fields with UpdatePointDto at runtime', async () => {
    const parameterTypes: unknown = Reflect.getMetadata(
      'design:paramtypes',
      PointController.prototype,
      'update',
    );
    const reflectedDto = Array.isArray(parameterTypes)
      ? parameterTypes[1]
      : undefined;
    expect(reflectedDto).toBe(UpdatePointDto);

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
      metatype: UpdatePointDto,
      data: undefined,
    });
    expect(validated).toBeInstanceOf(UpdatePointDto);
    expect(validated).toMatchObject(body);
    if (!(validated instanceof UpdatePointDto)) {
      throw new Error('ValidationPipe did not transform the Point DTO');
    }
    pointService.updatePoint.mockResolvedValueOnce({
      id: 'point-id',
      titulo: 'Task',
      content: '',
      reunion: {
        id: body.reunionId,
        titulo: 'Updated reunion',
        fecha: new Date('2026-10-21T18:00:00.000Z'),
        points: [],
        createdAt: new Date('2026-10-20T00:00:00.000Z'),
        updatedAt: new Date('2026-10-20T00:00:00.000Z'),
      },
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
      done: false,
    });
    await expect(
      controller.update('point-id', validated),
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
          metatype: UpdatePointDto,
          data: undefined,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      pipe.transform(
        { content: null, done: null },
        {
          type: 'body',
          metatype: UpdatePointDto,
          data: undefined,
        },
      ),
    ).resolves.toMatchObject({ content: null, done: null });
  });
});
