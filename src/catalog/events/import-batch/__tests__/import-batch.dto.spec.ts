import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ImportEventsBatchDto } from '../../dto/import-batch.dto';

function validateBatch(rows: unknown[]) {
  const dto = plainToInstance(ImportEventsBatchDto, {
    batchId: '11111111-1111-4111-8111-111111111111',
    countryId: '22222222-2222-4222-8222-222222222222',
    rows,
  });
  return validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
}

describe('ImportEventsBatchDto', () => {
  it('accepts the maximum of 50 rows', () => {
    expect(validateBatch(Array.from({ length: 50 }, () => ({})))).toHaveLength(
      0,
    );
  });

  it('rejects requests with more than 50 rows', () => {
    expect(
      validateBatch(Array.from({ length: 51 }, () => ({}))),
    ).not.toHaveLength(0);
  });
});
