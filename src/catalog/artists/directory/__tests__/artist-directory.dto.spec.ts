import 'reflect-metadata';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArtistDirectoryQueryDto } from '../dto/artist-directory-query.dto';

describe('ArtistDirectoryQueryDto', () => {
  it('accepts an optional UUID genre filter', async () => {
    const dto = plainToInstance(ArtistDirectoryQueryDto, {
      genreId: 'e6d53d47-71e5-4cbe-9abf-99ff4dcff9fd',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an invalid genre ID', async () => {
    const dto = plainToInstance(ArtistDirectoryQueryDto, {
      genreId: 'not-a-uuid',
    });
    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'genreId' }),
      ]),
    );
  });

  it('accepts the query without a genre filter', async () => {
    const dto = plainToInstance(ArtistDirectoryQueryDto, {});
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
