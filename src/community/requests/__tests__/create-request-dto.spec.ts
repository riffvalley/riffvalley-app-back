import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateRequestDto } from '../dto/create-request.dto';

describe('CreateRequestDto current validation contract', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  function transformBody(value: Record<string, unknown>) {
    return validationPipe.transform(value, {
      type: 'body',
      metatype: CreateRequestDto,
      data: undefined,
    });
  }

  it('accepts omitted/null optional fields and null Catalog references', async () => {
    const dto = await transformBody({
      discName: 'Record',
      artistName: 'Band',
      releaseDate: null,
      genreId: null,
      countryId: null,
    });

    expect(dto).toMatchObject({
      discName: 'Record',
      artistName: 'Band',
      genreId: null,
      countryId: null,
    });
    expect(dto.releaseDate).toBeNull();

    const omittedDate = await transformBody({
      discName: 'Record',
      artistName: 'Band',
    });
    expect(omittedDate.releaseDate).toBeUndefined();
  });

  it('converts valid ISO date input and accepts UUID v4 Catalog references', async () => {
    const dto = await transformBody({
      discName: 'Record',
      artistName: 'Band',
      releaseDate: '2025-04-02',
      genreId: '123e4567-e89b-42d3-a456-426614174000',
      countryId: '123e4567-e89b-42d3-a456-426614174001',
    });

    expect(dto.releaseDate).toBeInstanceOf(Date);
    expect(dto.releaseDate?.toISOString()).toBe('2025-04-02T00:00:00.000Z');
    expect(dto.genreId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(dto.countryId).toBe('123e4567-e89b-42d3-a456-426614174001');

    const timestampDto = await transformBody({
      discName: 'Record',
      artistName: 'Band',
      releaseDate: '2025-04-02T10:30:00.000Z',
    });
    expect(timestampDto.releaseDate?.toISOString()).toBe(
      '2025-04-02T10:30:00.000Z',
    );
  });

  it('does not reject an invalid releaseDate format at the validation boundary', async () => {
    const dto = await transformBody({
      discName: 'Record',
      artistName: 'Band',
      releaseDate: 'not-a-date',
    });

    expect(dto.releaseDate).toBeInstanceOf(Date);
    expect(Number.isNaN(dto.releaseDate?.getTime())).toBe(true);
  });

  it.each(['', 'not-a-uuid', '123e4567-e89b-12d3-a456-426614174000'])(
    'rejects supplied genreId/countryId value %p because only UUID v4 is accepted',
    async (id) => {
      await expect(
        transformBody({
          discName: 'Record',
          artistName: 'Band',
          genreId: id,
          countryId: id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
