import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateDiscWithArtistDto } from '../create-disc-with-artist.dto';

describe('CreateDiscWithArtistDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transformAndValidate = async (payload: object) => {
    const dto = await validationPipe.transform(payload, {
      type: 'body',
      metatype: CreateDiscWithArtistDto,
    });
    return dto as CreateDiscWithArtistDto;
  };

  it('accepts the minimal valid disc and artist names with optional fields absent', async () => {
    const dto = await transformAndValidate({
      discName: 'Album',
      artistName: 'Artist',
    });

    expect(dto.discName).toBe('Album');
    expect(dto.artistName).toBe('Artist');
    expect(dto.genreId).toBeUndefined();
    expect(dto.releaseDate).toBeUndefined();
    expect(dto.countryId).toBeUndefined();
  });

  it('accepts every declared optional field', async () => {
    const payload = {
      discName: 'Album',
      artistName: 'Artist',
      genreId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320242',
      releaseDate: '2002-03-04',
      ep: true,
      debut: false,
      link: 'https://album.test',
      image: 'https://images.test/album.jpg',
      description: 'Album description',
      countryId: 'a6f9cc5f-c3af-4a3d-9eeb-2de532320241',
    };
    const dto = await transformAndValidate(payload);

    expect(dto).toEqual(expect.objectContaining(payload));
  });

  it('accepts valid leap dates and rejects impossible or non-ISO dates', async () => {
    await expect(
      transformAndValidate({
        discName: 'Album',
        artistName: 'Artist',
        releaseDate: '2024-02-29',
      }),
    ).resolves.toMatchObject({ releaseDate: '2024-02-29' });

    for (const releaseDate of [
      '2026-02-31',
      '2026-13-01',
      '2025-02-29',
      'not-a-date',
    ]) {
      await expect(
        transformAndValidate({
          discName: 'Album',
          artistName: 'Artist',
          releaseDate,
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('accepts boolean flags and rejects strings and numbers under implicit conversion', async () => {
    await expect(
      transformAndValidate({
        discName: 'Album',
        artistName: 'Artist',
        ep: false,
        debut: true,
      }),
    ).resolves.toMatchObject({ ep: false, debut: true });

    for (const invalidFlag of [{ ep: 'false' }, { debut: 0 }]) {
      await expect(
        transformAndValidate({
          discName: 'Album',
          artistName: 'Artist',
          ...invalidFlag,
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('keeps absent and null optional fields valid', async () => {
    const absent = await transformAndValidate({
      discName: 'Album',
      artistName: 'Artist',
    });
    expect(absent.releaseDate).toBeUndefined();
    expect(absent.ep).toBeUndefined();

    await expect(
      transformAndValidate({
        discName: 'Album',
        artistName: 'Artist',
        releaseDate: null,
        ep: null,
        debut: null,
      }),
    ).resolves.toMatchObject({ releaseDate: null, ep: null, debut: null });
  });
});
