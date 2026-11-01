import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { AsignationsController } from '../asignations.controller';
import { AsignationsService } from '../asignations.service';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { CreateAsignationDto } from '../dto/create-asignations.dto';
import { UpdateAsignationDto } from '../dto/update-asignations.dto';
import { User } from 'src/identity/auth/entities/user.entity';

jest.mock('sanitize-html', () => jest.fn((value: string) => value));

describe('AsignationsController position validation', () => {
  type DtoConstructor<T> = new (...args: never[]) => T;

  const listId = '5e87fa93-7b8d-48f9-983b-01dca7a54c11';
  const asignationId = 'c17ee051-1a9b-4f33-a2b4-67f1a2508a4c';
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const service: jest.Mocked<
    Pick<AsignationsService, 'create' | 'update' | 'remove'>
  > = {
    create: jest.fn<
      ReturnType<AsignationsService['create']>,
      Parameters<AsignationsService['create']>
    >(),
    update: jest.fn<
      ReturnType<AsignationsService['update']>,
      Parameters<AsignationsService['update']>
    >(),
    remove: jest.fn<
      ReturnType<AsignationsService['remove']>,
      Parameters<AsignationsService['remove']>
    >(),
  };
  let controller: AsignationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AsignationsController],
      providers: [{ provide: AsignationsService, useValue: service }],
    })
      .overrideGuard(AuthGuard())
      .useValue({ canActivate: () => true })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AsignationsController);
  });

  async function body<T>(
    payload: object,
    metatype: DtoConstructor<T>,
  ): Promise<T> {
    const transformed: unknown = await validationPipe.transform(payload, {
      type: 'body',
      metatype,
    });
    if (!(transformed instanceof metatype)) {
      throw new Error('ValidationPipe did not transform the DTO');
    }
    return transformed;
  }

  async function create(payload: Record<string, unknown>) {
    const dto = await body(payload, CreateAsignationDto);
    return controller.create(dto);
  }

  async function update(payload: Record<string, unknown>) {
    const dto = await body(payload, UpdateAsignationDto);
    return controller.update(asignationId, dto);
  }

  it('preserves integer values, including negatives, on create and partial update', async () => {
    await create({ listId, position: 3 });
    await update({ position: -1 });

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ position: 3 }),
      undefined,
    );
    expect(service.update).toHaveBeenCalledWith(
      asignationId,
      { position: -1 },
      undefined,
    );
  });

  it('preserves optional and nullable behavior', async () => {
    await create({ listId });
    await create({ listId, position: null });
    await update({});
    await update({ position: null });

    expect(service.create).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({ position: expect.anything() }),
      undefined,
    );
    expect(service.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ position: null }),
      undefined,
    );
    expect(service.update).toHaveBeenNthCalledWith(
      1,
      asignationId,
      {},
      undefined,
    );
    expect(service.update).toHaveBeenNthCalledWith(
      2,
      asignationId,
      { position: null },
      undefined,
    );
  });

  it('rejects actorId in the public body rather than trusting a caller identity', async () => {
    await expect(
      create({ listId, actorId: 'caller-controlled-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('passes the authenticated actor and only a valid UUID source header', () => {
    const user = Object.assign(new User(), {
      id: 'actor-id',
      username: 'Editora',
    });
    controller.create(new CreateAsignationDto(), user, 'not-a-uuid');
    expect(service.create).toHaveBeenCalledWith(new CreateAsignationDto(), {
      actor: { kind: 'user', id: 'actor-id', displayName: 'Editora' },
    });

    controller.update(
      asignationId,
      new UpdateAsignationDto(),
      user,
      '29975434-5c45-4a8f-a197-bcb73e215830',
    );
    expect(service.update).toHaveBeenCalledWith(
      asignationId,
      expect.any(Object),
      {
        actor: { kind: 'user', id: 'actor-id', displayName: 'Editora' },
        sourceId: '29975434-5c45-4a8f-a197-bcb73e215830',
      },
    );

    controller.remove(
      asignationId,
      user,
      '29975434-5c45-4a8f-a197-bcb73e215830',
    );
    expect(service.remove).toHaveBeenCalledWith(asignationId, {
      actor: { kind: 'user', id: 'actor-id', displayName: 'Editora' },
      sourceId: '29975434-5c45-4a8f-a197-bcb73e215830',
    });
  });

  it.each([
    ['string', '3'],
    ['boolean', true],
    ['object', { value: 3 }],
    ['array', [3]],
    ['decimal', 1.5],
    ['above the PostgreSQL integer range', 2147483648],
    ['below the PostgreSQL integer range', -2147483649],
  ])(
    'rejects %s position on create with HTTP 400 before calling the service',
    async (_label, position) => {
      await expect(create({ listId, position })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(service.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['string', '3'],
    ['boolean', true],
    ['object', { value: 3 }],
    ['array', [3]],
    ['decimal', 1.5],
    ['above the PostgreSQL integer range', 2147483648],
    ['below the PostgreSQL integer range', -2147483649],
  ])(
    'rejects %s position on partial update before calling the service',
    async (_label, position) => {
      await expect(update({ position })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(service.update).not.toHaveBeenCalled();
    },
  );
});
