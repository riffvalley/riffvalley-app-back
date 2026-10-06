import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDiscWithArtistDto } from './create-disc-with-artist.dto';

describe('CreateDiscWithArtistDto', () => {
  const transformAndValidate = async (payload: object) => {
    const dto = plainToInstance(CreateDiscWithArtistDto, payload);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  };

  it('accepts the minimal valid disc and artist names with optional fields absent', async () => {
    const { dto, errors } = await transformAndValidate({
      discName: 'Album',
      artistName: 'Artist',
    });

    expect(errors).toEqual([]);
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
    const { dto, errors } = await transformAndValidate(payload);

    expect(errors).toEqual([]);
    expect(dto).toEqual(expect.objectContaining(payload));
  });
});
