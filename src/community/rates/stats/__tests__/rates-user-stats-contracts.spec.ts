import { ValidationPipe } from '@nestjs/common';
import { RatesStatsQueryDto } from '../../dto/rates-stats-query.dto';
import {
  RatesStatsActivityBasis,
  RatesUserStatsResponseDto,
} from '../../dto/rates-user-stats.dto';

async function validateStatsQuery(
  query: Record<string, unknown>,
): Promise<RatesStatsQueryDto> {
  const result: unknown = await new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }).transform(query, {
    type: 'query',
    metatype: RatesStatsQueryDto,
  });
  if (!(result instanceof RatesStatsQueryDto)) {
    throw new Error('ValidationPipe did not return the statistics query DTO');
  }
  return result;
}

const currentYear = new Date().getUTCFullYear();

describe('Rates annual statistics contracts', () => {
  it('validates both required annual parameters and defaults the zone explicitly to UTC', async () => {
    await expect(
      validateStatsQuery({ year: String(currentYear) }),
    ).resolves.toMatchObject({
      year: String(currentYear),
      timeZone: 'UTC',
    });
    await expect(
      validateStatsQuery({
        year: String(currentYear),
        timeZone: 'Europe/Madrid',
      }),
    ).resolves.toMatchObject({ timeZone: 'Europe/Madrid' });
  });

  it.each([
    {},
    { year: '' },
    { year: '2026.5' },
    { year: '-2026' },
    { year: '2026-01-01' },
    { year: 'year2026' },
    { year: currentYear },
    { year: '02026' },
  ])('rejects a missing or non-canonical year: %o', async (query) => {
    await expect(validateStatsQuery(query)).rejects.toThrow();
  });

  it('rejects years before 2025 and after the current year', async () => {
    await expect(validateStatsQuery({ year: '2024' })).rejects.toThrow();
    await expect(
      validateStatsQuery({ year: String(currentYear + 1) }),
    ).rejects.toThrow();
  });

  it('accepts the current year and rejects an invalid IANA zone', async () => {
    await expect(
      validateStatsQuery({ year: String(currentYear), timeZone: 'UTC' }),
    ).resolves.toBeInstanceOf(RatesStatsQueryDto);
    await expect(
      validateStatsQuery({ year: String(currentYear), timeZone: 'Not/AZone' }),
    ).rejects.toThrow();
  });

  it('uses the selected zone to determine the current year', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-01T00:30:00.000Z'));
    try {
      await expect(
        validateStatsQuery({ year: '2026', timeZone: 'America/Adak' }),
      ).resolves.toBeInstanceOf(RatesStatsQueryDto);
      await expect(
        validateStatsQuery({ year: '2027', timeZone: 'America/Adak' }),
      ).rejects.toThrow();
      await expect(
        validateStatsQuery({ year: '2027', timeZone: 'Pacific/Kiritimati' }),
      ).resolves.toBeInstanceOf(RatesStatsQueryDto);
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes the new response basis without year-over-year fields', () => {
    const basis: RatesStatsActivityBasis = 'rate_created_at_estimate';
    type Assert<T extends true> = T;
    type DoesNotContain<
      Shape,
      Key extends PropertyKey,
    > = Key extends keyof Shape ? false : true;
    const noYearOverYear: Assert<
      DoesNotContain<RatesUserStatsResponseDto, 'yearOverYear'>
    > = true;

    expect(basis).toBe('rate_created_at_estimate');
    expect(noYearOverYear).toBe(true);
  });
});
