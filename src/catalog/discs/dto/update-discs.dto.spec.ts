import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDiscDto } from './update-discs.dto';

describe('UpdateDiscDto characterization', () => {
  it('accepts nullable optional scalars and relation IDs, and false boolean values', async () => {
    const dto = plainToInstance(UpdateDiscDto, {
      description: null,
      artistId: null,
      genreId: null,
      verified: false,
      ep: false,
      debut: false,
      featured: false,
      pinned: false,
    });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
      .resolves.toEqual([]);
  });
});
