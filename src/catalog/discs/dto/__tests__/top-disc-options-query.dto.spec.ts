import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { TopDiscOptionsQueryDto } from '../top-disc-options-query.dto';

describe('TopDiscOptionsQueryDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  function validate(query: Record<string, unknown>) {
    return validationPipe.transform(query, {
      type: 'query',
      metatype: TopDiscOptionsQueryDto,
    });
  }

  it('accepts Todos and transforms an inclusive pair of ISO calendar dates', async () => {
    const all = await validate({});
    const ranged = await validate({
      dateRange: ['2026-10-01', '2026-10-31'],
      countryId: 'a1234567-89ab-4cde-8123-456789abcdef',
      genreId: 'b1234567-89ab-4cde-8123-456789abcdef',
      country: 'España',
    });

    expect(all).toBeInstanceOf(TopDiscOptionsQueryDto);
    expect(ranged).toBeInstanceOf(TopDiscOptionsQueryDto);
    expect(ranged.dateRange?.map((date) => date.toISOString())).toEqual([
      '2026-10-01T00:00:00.000Z',
      '2026-10-31T00:00:00.000Z',
    ]);
  });

  it.each([
    ['malformed date', { dateRange: ['not-a-date', '2026-10-31'] }],
    ['impossible calendar date', { dateRange: ['2026-02-31', '2026-03-31'] }],
    ['incomplete date range', { dateRange: ['2026-10-01'] }],
    [
      'oversized date range',
      {
        dateRange: ['2026-10-01', '2026-10-02', '2026-10-03'],
      },
    ],
    ['invalid country ID', { countryId: 'not-a-uuid' }],
    ['invalid genre ID', { genreId: 'not-a-uuid' }],
  ])('rejects %s with HTTP 400 validation', async (_label, query) => {
    await expect(validate(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts inverted and future ranges for the query to resolve as empty or cap at today', async () => {
    await expect(
      validate({ dateRange: ['2026-12-31', '2026-10-01'] }),
    ).resolves.toBeInstanceOf(TopDiscOptionsQueryDto);
    await expect(
      validate({ dateRange: ['2026-10-01', '2099-12-31'] }),
    ).resolves.toBeInstanceOf(TopDiscOptionsQueryDto);
  });

  it('rejects unknown query parameters', async () => {
    await expect(validate({ limit: 10 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
