import { QueryRunner } from 'typeorm';
import { AddCategoryToSuggestion1792060000000 } from '../1792060000000-AddCategoryToSuggestion';

describe('AddCategoryToSuggestion migration', () => {
  it('adds only a nullable category column without backfilling existing rows', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = Object.assign(Object.create(null) as QueryRunner, {
      query,
    });

    await new AddCategoryToSuggestion1792060000000().up(queryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain(
      'ADD COLUMN "category" character varying(20)',
    );
    expect(query.mock.calls[0]?.[0]).not.toMatch(/NOT NULL|DEFAULT|UPDATE/i);
  });

  it('removes only the added column when reverted', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = Object.assign(Object.create(null) as QueryRunner, {
      query,
    });

    await new AddCategoryToSuggestion1792060000000().down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "suggestion" DROP COLUMN "category"',
    );
  });
});
