import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProcessManualDataDto } from './process-manual-data.dto';

describe('ProcessManualDataDto', () => {
  it('allows identifiable album field errors to reach per-entry result classification', async () => {
    const dto = plainToInstance(ProcessManualDataDto, {
      date: 'October 4, 2026',
      albums: [{ line: '', genreId: 'not-a-uuid' }, { ep: 'not-a-boolean' }],
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
  });
});
