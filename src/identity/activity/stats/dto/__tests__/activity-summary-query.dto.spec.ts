import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivitySummaryQueryDto } from '../activity-date-range-query.dto';

describe('ActivitySummaryQueryDto', () => {
  async function validationErrors(query: Record<string, string>) {
    return validate(plainToInstance(ActivitySummaryQueryDto, query));
  }

  it.each(['7', '30', '90'])('accepts the %s-day preset', async (period) => {
    await expect(validationErrors({ period })).resolves.toHaveLength(0);
  });

  it.each(['1', '14', '365', 'invalid'])(
    'rejects unsupported preset %s',
    async (period) => {
      await expect(validationErrors({ period })).resolves.not.toHaveLength(0);
    },
  );

  it('accepts inclusive Madrid custom dates, including legacy one-sided bounds', async () => {
    await expect(
      validationErrors({ from: '2026-10-01', to: '2026-10-31' }),
    ).resolves.toHaveLength(0);
    await expect(
      validationErrors({ from: '2026-10-01' }),
    ).resolves.toHaveLength(0);
    await expect(validationErrors({ to: '2026-10-31' })).resolves.toHaveLength(
      0,
    );
  });

  it.each([
    { period: '7', from: '2026-10-01' },
    { period: '30', to: '2026-10-31' },
    { period: '90', from: '2026-10-01', to: '2026-10-31' },
  ])('rejects a preset combined with custom bounds: %o', async (query) => {
    await expect(validationErrors(query)).resolves.not.toHaveLength(0);
  });

  it('rejects malformed and impossible calendar dates', async () => {
    await expect(
      validationErrors({ from: '2026-10-1', to: '2026-10-31' }),
    ).resolves.not.toHaveLength(0);
    await expect(
      validationErrors({ from: '2026-02-30', to: '2026-03-01' }),
    ).resolves.not.toHaveLength(0);
  });
});
