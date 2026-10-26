import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RateVoteEvent } from '../../community/rates/entities/rate-vote-event.entity';

describe('AddDiscAndValuesToRateVoteEvents1792010000000 migration', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1792010000000-AddDiscAndValuesToRateVoteEvents.ts'),
    'utf8',
  );

  it('adds nullable disc and decimal value columns without changing historical rows', () => {
    expect(migrationSource).toContain(
      "name = 'AddDiscAndValuesToRateVoteEvents1792010000000'",
    );
    expect(migrationSource).toContain('ADD COLUMN "disc_id" uuid');
    expect(migrationSource).toContain(
      'ADD COLUMN "previous_value" decimal(4,2)',
    );
    expect(migrationSource).toContain('ADD COLUMN "new_value" decimal(4,2)');
    expect(migrationSource).not.toMatch(/UPDATE\s+"?rate_vote_events/i);
    expect(migrationSource).not.toMatch(/DROP TABLE|CREATE TABLE/i);
  });

  it('preserves events when a Disc is deleted and reverses only added schema', () => {
    expect(migrationSource).toContain('CONSTRAINT "FK_rate_vote_events_disc"');
    expect(migrationSource).toContain('ON DELETE SET NULL');
    expect(migrationSource).toContain(
      'DROP CONSTRAINT "FK_rate_vote_events_disc"',
    );
    expect(migrationSource).toContain('DROP COLUMN "new_value"');
    expect(migrationSource).toContain('DROP COLUMN "previous_value"');
    expect(migrationSource).toContain('DROP COLUMN "disc_id"');
  });

  it('keeps legacy event fields readable as null', () => {
    const legacyEvent = Object.assign(new RateVoteEvent(), {
      userId: 'legacy-user',
      eventType: 'set' as const,
      discId: null,
      previousValue: null,
      newValue: null,
      disc: null,
    });

    expect(legacyEvent).toMatchObject({
      userId: 'legacy-user',
      eventType: 'set',
      discId: null,
      previousValue: null,
      newValue: null,
      disc: null,
    });
  });
});
