import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePointDto } from '../points/dto/create-points.dto';
import { CreateReunionDto } from '../dto/create-reunion.dto';
import { UpdatePointDto } from '../points/dto/update-point.dto';
import { UpdateReunionDto } from '../dto/update-reunion.dto';

describe('Reunions and Points create DTOs', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const transformBody = <T extends object>(
    value: Record<string, unknown>,
    metatype: new () => T,
  ) =>
    pipe.transform(value, {
      type: 'body',
      metatype,
      data: undefined,
    }) as Promise<T>;

  it('requires a Reunion title and valid transformed Date', async () => {
    const valid = await transformBody(
      {
        titulo: 'Weekly reunion',
        fecha: '2026-10-21T18:00:00.000Z',
        description: 'Agenda',
      },
      CreateReunionDto,
    );
    expect(valid.fecha).toEqual(new Date('2026-10-21T18:00:00.000Z'));

    for (const body of [
      { titulo: 'Missing date' },
      { titulo: 'Invalid date', fecha: 'not-a-date' },
      { titulo: '', fecha: '2026-10-21T18:00:00.000Z' },
    ]) {
      await expect(
        transformBody(body, CreateReunionDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('requires a Point title and Reunion UUID while preserving optional fields', async () => {
    const valid = await transformBody(
      {
        titulo: 'Assign weekly radar',
        reunionId: '4d6db8d1-8c4c-4ba6-9d7c-00c5e9bf0f61',
        content: '',
        done: false,
      },
      CreatePointDto,
    );
    expect(valid).toMatchObject({
      titulo: 'Assign weekly radar',
      reunionId: '4d6db8d1-8c4c-4ba6-9d7c-00c5e9bf0f61',
      content: '',
      done: false,
    });

    for (const body of [
      { reunionId: '4d6db8d1-8c4c-4ba6-9d7c-00c5e9bf0f61' },
      { titulo: 'Task' },
      { titulo: 'Task', reunionId: 'invalid-id' },
    ]) {
      await expect(transformBody(body, CreatePointDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('rejects undeclared fields on create bodies', async () => {
    await expect(
      transformBody(
        {
          titulo: 'Weekly reunion',
          fecha: '2026-10-21T18:00:00.000Z',
          internal: true,
        },
        CreateReunionDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transformBody(
        {
          titulo: 'Task',
          reunionId: '4d6db8d1-8c4c-4ba6-9d7c-00c5e9bf0f61',
          internal: true,
        },
        CreatePointDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows partial Reunion updates while validating provided fields', async () => {
    await expect(
      transformBody({ titulo: 'Only the title' }, UpdateReunionDto),
    ).resolves.toBeInstanceOf(UpdateReunionDto);
    await expect(
      transformBody({ fecha: '2026-10-21T18:00:00.000Z' }, UpdateReunionDto),
    ).resolves.toMatchObject({
      fecha: new Date('2026-10-21T18:00:00.000Z'),
    });
    await expect(
      transformBody({ fecha: null }, UpdateReunionDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows partial Point updates and validates a supplied Reunion UUID', async () => {
    await expect(
      transformBody({ titulo: 'Only the title' }, UpdatePointDto),
    ).resolves.toBeInstanceOf(UpdatePointDto);
    await expect(
      transformBody(
        { reunionId: '4d6db8d1-8c4c-4ba6-9d7c-00c5e9bf0f61' },
        UpdatePointDto,
      ),
    ).resolves.toMatchObject({
      reunionId: '4d6db8d1-8c4c-4ba6-9d7c-00c5e9bf0f61',
    });
    for (const body of [{ reunionId: 'invalid' }, { reunionId: null }]) {
      await expect(transformBody(body, UpdatePointDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
