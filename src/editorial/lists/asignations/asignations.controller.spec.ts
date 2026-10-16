import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AsignationsController } from './asignations.controller';
import { AsignationsService } from './asignations.service';
import { CreateAsignationDto } from './dto/create-asignations.dto';
import { UpdateAsignationDto } from './dto/update-asignations.dto';

jest.mock('sanitize-html', () => jest.fn((value: string) => value));

describe('AsignationsController position validation', () => {
  const listId = '5e87fa93-7b8d-48f9-983b-01dca7a54c11';
  const asignationId = 'c17ee051-1a9b-4f33-a2b4-67f1a2508a4c';
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const service = {
    create: jest.fn(),
    update: jest.fn(),
  };
  const controller = new AsignationsController(
    service as unknown as AsignationsService,
  );

  beforeEach(() => jest.clearAllMocks());

  async function body<T>(
    payload: object,
    metatype: new (...args: any[]) => T,
  ): Promise<T> {
    return (await validationPipe.transform(payload, {
      type: 'body',
      metatype,
    })) as T;
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
    );
    expect(service.update).toHaveBeenCalledWith(asignationId, {
      position: -1,
    });
  });

  it('preserves optional and nullable behavior', async () => {
    await create({ listId });
    await create({ listId, position: null });
    await update({});
    await update({ position: null });

    expect(service.create).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({ position: expect.anything() }),
    );
    expect(service.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ position: null }),
    );
    expect(service.update).toHaveBeenNthCalledWith(1, asignationId, {});
    expect(service.update).toHaveBeenNthCalledWith(2, asignationId, {
      position: null,
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
