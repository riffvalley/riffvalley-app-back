import { ValidationPipe } from '@nestjs/common';
import { UpdateDiscDto } from './update-discs.dto';

describe('UpdateDiscDto characterization', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transformAndValidate = (payload: object) =>
    validationPipe.transform(payload, {
      type: 'body',
      metatype: UpdateDiscDto,
    });

  it('preserves optionality, nullable scalars, and false boolean values', async () => {
    const dto = (await transformAndValidate({
      description: null,
      artistId: null,
      genreId: null,
      releaseDate: null,
      verified: false,
      ep: null,
      debut: false,
      featured: false,
      pinned: false,
    })) as UpdateDiscDto;

    expect(dto).toMatchObject({
      description: null,
      artistId: null,
      genreId: null,
      releaseDate: null,
      verified: false,
      ep: null,
      debut: false,
      featured: false,
      pinned: false,
    });
  });

  it('accepts an empty partial update and a valid date-only release date', async () => {
    await expect(transformAndValidate({})).resolves.toEqual({});
    const dto = (await transformAndValidate({
      releaseDate: '2024-02-29',
      ep: true,
    })) as UpdateDiscDto;

    expect(dto.releaseDate).toEqual(new Date('2024-02-29T00:00:00.000Z'));
    expect(dto.ep).toBe(true);
    expect(dto.name).toBeUndefined();
  });

  it.each([
    ['an impossible calendar date', { releaseDate: '2026-02-31' }],
    ['an Invalid Date instance', { releaseDate: new Date(NaN) }],
    ['an invalid ep flag', { ep: 'false' }],
    ['an invalid debut flag', { debut: 0 }],
    ['an invalid featured flag', { featured: 'true' }],
  ])(
    'rejects %s before the update service can use it',
    async (_caseName, payload) => {
      await expect(transformAndValidate(payload)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});
