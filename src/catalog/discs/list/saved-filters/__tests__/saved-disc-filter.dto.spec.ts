import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateSavedDiscFilterDto,
  UpdateSavedDiscFilterDto,
} from '../dto/saved-disc-filter.dto';

const GENRE_ID = '00000000-0000-4000-8000-000000000001';
const COUNTRY_ID = '00000000-0000-4000-8000-000000000002';

function payload(filters: Record<string, unknown> = {}) {
  return {
    name: ' Metal extremo ',
    filters: {
      genreIds: [GENRE_ID],
      countryId: COUNTRY_ID,
      yearFrom: 1990,
      yearTo: 2026,
      ...filters,
    },
  };
}

describe('saved DiscList filter DTOs', () => {
  it('accepts full and partial criteria, including independently open years', async () => {
    const full = plainToInstance(CreateSavedDiscFilterDto, payload());
    const partial = plainToInstance(
      CreateSavedDiscFilterDto,
      payload({ genreIds: [], countryId: null, yearFrom: null, yearTo: 2025 }),
    );

    await expect(validate(full)).resolves.toHaveLength(0);
    await expect(validate(partial)).resolves.toHaveLength(0);
  });

  it('rejects invalid and duplicate UUIDs and an inverted year range', async () => {
    const dto = plainToInstance(
      CreateSavedDiscFilterDto,
      payload({
        genreIds: [GENRE_ID, GENRE_ID.toUpperCase()],
        countryId: 'not-a-uuid',
        yearFrom: 2027,
        yearTo: 2026,
      }),
    );
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['filters']),
    );
    expect(JSON.stringify(errors)).toContain(
      "All genreIds's elements must be unique",
    );
    expect(JSON.stringify(errors)).toContain('countryId must be a UUID');
    expect(JSON.stringify(errors)).toContain(
      'yearFrom must be less than or equal to yearTo',
    );

    const malformedGenre = plainToInstance(
      CreateSavedDiscFilterDto,
      payload({ genreIds: [null] }),
    );
    await expect(validate(malformedGenre)).resolves.not.toHaveLength(0);
  });

  it('rejects unknown properties and names that are empty or longer than 60 characters', async () => {
    const withUnknown = plainToInstance(CreateSavedDiscFilterDto, {
      ...payload(),
      userId: COUNTRY_ID,
      filters: { ...payload().filters, query: 'ignored' },
    });
    const errors = await validate(withUnknown, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const emptyName = plainToInstance(CreateSavedDiscFilterDto, payload());
    emptyName.name = '   ';
    const longName = plainToInstance(CreateSavedDiscFilterDto, payload());
    longName.name = 'x'.repeat(61);

    expect(JSON.stringify(errors)).toContain('should not exist');
    await expect(validate(emptyName)).resolves.not.toHaveLength(0);
    await expect(validate(longName)).resolves.not.toHaveLength(0);
  });

  it('allows a partial patch and rejects an empty patch payload', async () => {
    const patch = plainToInstance(UpdateSavedDiscFilterDto, {
      name: 'Nuevo nombre',
    });
    const empty = plainToInstance(UpdateSavedDiscFilterDto, {});
    await expect(validate(patch)).resolves.toHaveLength(0);
    await expect(validate(empty)).resolves.toHaveLength(0);
  });
});
