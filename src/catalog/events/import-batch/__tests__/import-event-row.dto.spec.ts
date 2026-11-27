import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ImportEventRowDto } from '../../dto/import-event-row.dto';

const validRow = {
  rowId: '11111111-1111-4111-8111-111111111111',
  type: 'concert',
  startDate: '2027-05-15',
  city: 'Madrid',
};

function validateRow(values: Record<string, unknown>) {
  const row = plainToInstance(ImportEventRowDto, { ...validRow, ...values });
  return validateSync(row, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
}

describe('ImportEventRowDto locality and venue identities', () => {
  it.each(['localityId', 'venueId'])('%s is optional', (field) => {
    expect(validateRow({})).toHaveLength(0);
    expect(
      validateRow({ [field]: '11111111-1111-4111-8111-111111111112' }),
    ).toHaveLength(0);
  });

  it.each(['localityId', 'venueId'])(
    '%s rejects empty, null, and malformed values',
    (field) => {
      for (const value of ['', null, 'not-a-uuid'])
        expect(validateRow({ [field]: value })).not.toHaveLength(0);
    },
  );
});
