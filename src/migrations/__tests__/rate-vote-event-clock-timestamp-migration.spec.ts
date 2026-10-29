import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('UseClockTimestampForRateVoteEvents1792040000000 migration', () => {
  const migrationSource = readFileSync(
    resolve(
      __dirname,
      '../1792040000000-UseClockTimestampForRateVoteEvents.ts',
    ),
    'utf8',
  );
  const entitySource = readFileSync(
    resolve(
      __dirname,
      '../../community/rates/entities/rate-vote-event.entity.ts',
    ),
    'utf8',
  );

  it('changes only the default expression and does not update existing events', () => {
    expect(migrationSource).toContain(
      "name = 'UseClockTimestampForRateVoteEvents1792040000000'",
    );
    expect(migrationSource).toContain(
      'ALTER COLUMN "occurred_at" SET DEFAULT clock_timestamp()',
    );
    expect(migrationSource).toContain(
      'ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP',
    );
    expect(migrationSource).not.toMatch(/UPDATE\s+"?rate_vote_events/i);
    expect(migrationSource).not.toMatch(/ADD COLUMN|DROP COLUMN|DROP TABLE/i);
  });

  it('keeps the entity timestamp column as timestamptz with clock_timestamp default', () => {
    expect(entitySource).toContain("type: 'timestamptz'");
    expect(entitySource).toContain("default: () => 'clock_timestamp()'");
  });
});
