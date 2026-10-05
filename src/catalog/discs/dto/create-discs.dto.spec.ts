import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDiscDto } from './create-discs.dto';

describe('CreateDiscDto', () => {
  const transformAndValidate = async (payload: object) => {
    const dto = plainToInstance(CreateDiscDto, payload, {
      enableImplicitConversion: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  };

  it('accepts the minimal valid payload and adds no DTO defaults', async () => {
    const { dto, errors } = await transformAndValidate({ name: 'Album' });

    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ name: 'Album' });
    expect(dto.verified).toBeUndefined();
    expect(dto.ep).toBeUndefined();
    expect(dto.debut).toBeUndefined();
    expect(dto.featured).toBeUndefined();
    expect(dto.pinned).toBeUndefined();
  });

  it('accepts every declared DTO field and converts the optional release date', async () => {
    const { dto, errors } = await transformAndValidate({
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
    });

    expect(errors).toEqual([]);
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
    const { errors } = await transformAndValidate({ name: '', unexpected: true });

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['name', 'unexpected']),
    );
  });

  it('currently accepts an invalid optional release date after implicit conversion', async () => {
    const { dto, errors } = await transformAndValidate({
      name: 'Album',
      releaseDate: 'not-a-date',
    });

    expect(errors).toEqual([]);
    expect(dto.releaseDate).toBeInstanceOf(Date);
    expect(Number.isNaN(dto.releaseDate?.getTime())).toBe(true);
  });
});
