import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateDiscDto } from '../create-discs.dto';

describe('CreateDiscDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transformAndValidate = (payload: object) =>
    validationPipe.transform(payload, {
      type: 'body',
      metatype: CreateDiscDto,
    });

  it('accepts the minimal valid payload and adds no DTO defaults', async () => {
    const dto = (await transformAndValidate({
      name: 'Album',
    })) as CreateDiscDto;

    expect(dto).toMatchObject({ name: 'Album' });
    expect(dto.verified).toBeUndefined();
    expect(dto.ep).toBeUndefined();
    expect(dto.debut).toBeUndefined();
    expect(dto.featured).toBeUndefined();
    expect(dto.pinned).toBeUndefined();
  });

  it('accepts every declared DTO field and converts the optional release date', async () => {
    const dto = (await transformAndValidate({
      name: 'Album',
      description: 'Description',
      image: 'https://images.test/album.jpg',
      verified: true,
      link: 'https://album.test',
      artistId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320241',
      genreId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320242',
      releaseDate: '2024-03-10',
      ep: true,
      debut: true,
      featured: true,
      pinned: true,
    })) as CreateDiscDto;

    expect(dto).toMatchObject({
      name: 'Album',
      description: 'Description',
      image: 'https://images.test/album.jpg',
      verified: true,
      link: 'https://album.test',
      artistId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320241',
      genreId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320242',
      ep: true,
      debut: true,
      featured: true,
      pinned: true,
    });
    expect(dto.releaseDate).toEqual(new Date('2024-03-10T00:00:00.000Z'));
  });

  it('rejects a missing name and properties outside the DTO', async () => {
    await expect(
      transformAndValidate({ name: '', unexpected: true }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['an impossible day', '2026-02-31'],
    ['a nonexistent month', '2026-13-01'],
    ['an invalid date string', 'not-a-date'],
  ])('rejects %s', async (_caseName, releaseDate) => {
    await expect(
      transformAndValidate({ name: 'Album', releaseDate }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts valid leap day and rejects an invalid leap day', async () => {
    const valid = (await transformAndValidate({
      name: 'Album',
      releaseDate: '2024-02-29',
    })) as CreateDiscDto;
    expect(valid.releaseDate).toEqual(new Date('2024-02-29T00:00:00.000Z'));

    await expect(
      transformAndValidate({ name: 'Album', releaseDate: '2025-02-29' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects Invalid Date and keeps absent and null dates optional', async () => {
    await expect(
      transformAndValidate({ name: 'Album', releaseDate: new Date(NaN) }),
    ).rejects.toMatchObject({ status: 400 });

    const absent = (await transformAndValidate({
      name: 'Album',
    })) as CreateDiscDto;
    const nullable = (await transformAndValidate({
      name: 'Album',
      releaseDate: null,
    })) as CreateDiscDto;
    expect(absent.releaseDate).toBeUndefined();
    expect(nullable.releaseDate).toBeNull();
  });

  it('accepts a valid ISO timestamp and nullable optional flags', async () => {
    const dto = (await transformAndValidate({
      name: 'Album',
      releaseDate: '2024-03-10T12:30:00.000Z',
      ep: null,
      debut: null,
      featured: null,
    })) as CreateDiscDto;

    expect(dto.releaseDate).toEqual(new Date('2024-03-10T12:30:00.000Z'));
    expect(dto.ep).toBeNull();
    expect(dto.debut).toBeNull();
    expect(dto.featured).toBeNull();
  });

  it('accepts boolean flags and rejects strings and numbers without coercion', async () => {
    const dto = (await transformAndValidate({
      name: 'Album',
      ep: true,
      debut: false,
      featured: true,
    })) as CreateDiscDto;
    expect(dto).toMatchObject({ ep: true, debut: false, featured: true });

    for (const invalidValue of ['false', 'true', 0, 1]) {
      for (const flag of ['ep', 'debut', 'featured']) {
        await expect(
          transformAndValidate({ name: 'Album', [flag]: invalidValue }),
        ).rejects.toMatchObject({ status: 400 });
      }
    }
  });
});
