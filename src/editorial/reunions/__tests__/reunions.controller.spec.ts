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
import { ReunionController } from '../reunions.controller';
import { CreateReunionDto } from '../dto/create-reunion.dto';
import { UpdateReunionDto } from '../dto/update-reunion.dto';
import { ReunionService } from '../reunions.service';
import { Reunion } from '../entities/reunion.entity';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { ReunionsStreamService } from '../realtime/reunions-stream.service';

const isGuardType = (value: unknown): value is Type<CanActivate> =>
  typeof value === 'function';

const guardsFor = (handlers: Array<(...args: never[]) => unknown>) =>
  handlers.flatMap((handler) => {
    const metadata: unknown = Reflect.getMetadata(GUARDS_METADATA, handler);
    return Array.isArray(metadata) ? metadata.filter(isGuardType) : [];
  });

describe('ReunionController', () => {
  const reunionService: jest.Mocked<
    Pick<
      ReunionService,
      | 'createReunion'
      | 'findAll'
      | 'findOne'
      | 'updateReunion'
      | 'deleteReunion'
    >
  > = {
    createReunion: jest.fn<Promise<Reunion>, [CreateReunionDto]>(),
    findAll: jest.fn<Promise<Reunion[]>, []>(),
    findOne: jest.fn<Promise<Reunion>, [string]>(),
    updateReunion: jest.fn<Promise<Reunion>, [string, UpdateReunionDto]>(),
    deleteReunion: jest.fn<Promise<void>, [string]>(),
  };
  let controller: ReunionController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const guardProviders = guardsFor([
      ReunionController.prototype.create,
      ReunionController.prototype.openStream,
      ReunionController.prototype.update,
      ReunionController.prototype.remove,
    ]).map((guard) => ({
      provide: guard,
      useValue: { canActivate: () => true },
    }));
    const testingModule = Test.createTestingModule({
      controllers: [ReunionController],
      providers: [
        { provide: ReunionService, useValue: reunionService },
        { provide: ReunionsStreamService, useValue: { open: jest.fn() } },
        ...guardProviders,
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true });
    const moduleRef = await testingModule.compile();
    controller = moduleRef.get(ReunionController);
  });

  it('preserves route paths, methods, public reads, and protected mutations', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ReunionController)).toBe(
      'reunions',
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        ReunionController.prototype.openStream,
      ),
    ).toBe('events');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        ReunionController.prototype.openStream,
      ),
    ).toBe(0);
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

    for (const handler of [
      ReunionController.prototype.create,
      ReunionController.prototype.openStream,
      ReunionController.prototype.update,
      ReunionController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeDefined();
    }
    for (const handler of [
      ReunionController.prototype.findAll,
      ReunionController.prototype.findOne,
    ]) {
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
    }
    expect(
      Object.getOwnPropertyNames(ReunionController.prototype).indexOf(
        'openStream',
      ),
    ).toBeLessThan(
      Object.getOwnPropertyNames(ReunionController.prototype).indexOf(
        'findOne',
      ),
    );
  });

  it('delegates CRUD calls and returns service responses unchanged', async () => {
    const reunion: Reunion = {
      id: 'reunion-id',
      titulo: 'Weekly reunion',
      fecha: new Date('2026-10-21T18:00:00.000Z'),
      description: undefined,
      points: [],
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    };
    const dto: CreateReunionDto = {
      titulo: reunion.titulo,
      fecha: reunion.fecha,
    };
    const updateDto: UpdateReunionDto = { titulo: reunion.titulo };
    reunionService.createReunion.mockResolvedValueOnce(reunion);
    reunionService.findAll.mockResolvedValueOnce([reunion]);
    reunionService.findOne.mockResolvedValueOnce(reunion);
    reunionService.updateReunion.mockResolvedValueOnce(reunion);
    reunionService.deleteReunion.mockResolvedValueOnce(undefined);

    await expect(controller.create(dto)).resolves.toBe(reunion);
    await expect(controller.findAll()).resolves.toEqual([reunion]);
    await expect(controller.findOne('reunion-id')).resolves.toBe(reunion);
    await expect(controller.update('reunion-id', updateDto)).resolves.toBe(
      reunion,
    );
    await expect(controller.remove('reunion-id')).resolves.toBeUndefined();

    expect(reunionService.createReunion).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({
        actor: { kind: 'system', displayName: 'Proceso automático' },
      }),
    );
    expect(reunionService.findOne).toHaveBeenCalledWith('reunion-id');
    expect(reunionService.updateReunion).toHaveBeenCalledWith(
      'reunion-id',
      updateDto,
      expect.objectContaining({
        actor: { kind: 'system', displayName: 'Proceso automático' },
      }),
    );
    expect(reunionService.deleteReunion).toHaveBeenCalledWith(
      'reunion-id',
      expect.objectContaining({
        actor: { kind: 'system', displayName: 'Proceso automático' },
      }),
    );
  });

  it('validates partial PATCH fields with UpdateReunionDto at runtime', async () => {
    const parameterTypes: unknown = Reflect.getMetadata(
      'design:paramtypes',
      ReunionController.prototype,
      'update',
    );
    const reflectedDto = Array.isArray(parameterTypes)
      ? parameterTypes[1]
      : undefined;
    expect(reflectedDto).toBe(UpdateReunionDto);

    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const body = { titulo: 'Renamed reunion' };
    const validated = await pipe.transform(body, {
      type: 'body',
      metatype: UpdateReunionDto,
      data: undefined,
    });
    expect(validated).toBeInstanceOf(UpdateReunionDto);
    expect(validated).toMatchObject(body);
    if (!(validated instanceof UpdateReunionDto)) {
      throw new Error('ValidationPipe did not transform the Reunion DTO');
    }
    reunionService.updateReunion.mockResolvedValueOnce({
      id: 'reunion-id',
      titulo: body.titulo,
      fecha: new Date('2026-10-21T18:00:00.000Z'),
      points: [],
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    });
    await expect(
      controller.update('reunion-id', validated),
    ).resolves.toMatchObject(body);
    expect(reunionService.updateReunion).toHaveBeenCalledWith(
      'reunion-id',
      validated,
      expect.objectContaining({
        actor: { kind: 'system', displayName: 'Proceso automático' },
      }),
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
          metatype: UpdateReunionDto,
          data: undefined,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
