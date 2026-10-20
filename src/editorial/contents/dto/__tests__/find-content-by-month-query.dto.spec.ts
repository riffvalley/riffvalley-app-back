import { ValidationPipe } from '@nestjs/common';
import { FindContentByMonthQueryDto } from '../find-content-by-month-query.dto';

describe('FindContentByMonthQueryDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const validate = (query: object) =>
    validationPipe.transform(query, {
      type: 'query',
      metatype: FindContentByMonthQueryDto,
    });

  it.each([
    ['January', '2026', '1', 2026, 1],
    ['December', '2026', '12', 2026, 12],
  ])(
    'accepts a complete %s period',
    async (_label, year, month, expectedYear, expectedMonth) => {
      await expect(validate({ year, month })).resolves.toMatchObject({
        year: expectedYear,
        month: expectedMonth,
      });
    },
  );

  it.each([
    ['missing year', { month: '1' }],
    ['missing month', { year: '2026' }],
    ['missing both values', {}],
    ['year with a numeric prefix', { year: '2026x', month: '1' }],
    ['month with a numeric prefix', { year: '2026', month: '1x' }],
    ['fractional year', { year: '2026.5', month: '1' }],
    ['fractional month', { year: '2026', month: '1.5' }],
    ['year below supported calendar range', { year: '99', month: '1' }],
    ['year beyond supported Date range', { year: '275760', month: '1' }],
    ['month zero', { year: '2026', month: '0' }],
    ['month above December', { year: '2026', month: '13' }],
  ])('rejects %s', async (_label, query) => {
    await expect(validate(query)).rejects.toMatchObject({
      status: 400,
    });
  });
});
