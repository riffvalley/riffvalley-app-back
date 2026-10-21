import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateRequestDto } from '../dto/create-request.dto';
import { UpdateRequestDto } from '../dto/update-request.dto';

describe('Request DTO validation', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  function transformCreateBody(value: Record<string, unknown>) {
    return validationPipe.transform(value, {
      type: 'body',
      metatype: CreateRequestDto,
      data: undefined,
    });
  }

  function transformUpdateBody(value: Record<string, unknown>) {
    return validationPipe.transform(value, {
      type: 'body',
      metatype: UpdateRequestDto,
      data: undefined,
    });
  }

  const requestFields = { discName: 'Record', artistName: 'Band' };

  it('accepts an omitted/null releaseDate and omitted/null Catalog references', async () => {
    const omitted = await transformCreateBody(requestFields);
    expect(omitted.releaseDate).toBeUndefined();

    const cleared = await transformCreateBody({
      ...requestFields,
      releaseDate: null,
      genreId: null,
      countryId: null,
    });
    expect(cleared).toMatchObject({
      releaseDate: null,
      genreId: null,
      countryId: null,
    });
  });

  it.each([
    ['date-only', '2025-04-02'],
    ['ISO timestamp', '2025-04-02T10:30:00.000Z'],
    ['ISO timestamp with offset', '2025-04-02T10:30:00+02:00'],
  ])('accepts a valid %s releaseDate', async (_label, releaseDate) => {
    const dto = await transformCreateBody({ ...requestFields, releaseDate });
    expect(dto.releaseDate).toBe(releaseDate);
  });

  it.each([
    '',
    'not-a-date',
    '2025-02-30',
    '2025-02-30T10:30:00Z',
    '2025-13-01',
    '2025-W14-3',
    '2025-092',
    '2025-04-02 10:30:00',
    '2025-04-02T25:61:61Z',
  ])(
    'rejects invalid creation releaseDate %p with HTTP 400',
    async (releaseDate) => {
      await expect(
        transformCreateBody({ ...requestFields, releaseDate }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('keeps PATCH omission, null clearing, and valid date values distinct', async () => {
    const omitted = await transformUpdateBody({});
    expect(omitted.releaseDate).toBeUndefined();

    const cleared = await transformUpdateBody({ releaseDate: null });
    expect(cleared.releaseDate).toBeNull();

    const updated = await transformUpdateBody({ releaseDate: '2025-04-02' });
    expect(updated.releaseDate).toBe('2025-04-02');
  });

  it.each(['', '2025-02-30', 'not-a-date'])(
    'rejects invalid PATCH releaseDate %p with HTTP 400',
    async (releaseDate) => {
      await expect(transformUpdateBody({ releaseDate })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('accepts omitted and null Catalog references on create and PATCH', async () => {
    await expect(transformCreateBody(requestFields)).resolves.toBeDefined();
    await expect(
      transformCreateBody({ ...requestFields, genreId: null, countryId: null }),
    ).resolves.toBeDefined();
    await expect(transformUpdateBody({})).resolves.toBeDefined();
    await expect(
      transformUpdateBody({ genreId: null, countryId: null }),
    ).resolves.toBeDefined();
  });

  it.each(['', 'not-a-uuid', '123e4567-e89b-12d3-a456-426614174000'])(
    'rejects non-v4 Catalog reference %p with HTTP 400',
    async (id) => {
      await expect(
        transformCreateBody({ ...requestFields, genreId: id, countryId: id }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        transformUpdateBody({ genreId: id, countryId: id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
