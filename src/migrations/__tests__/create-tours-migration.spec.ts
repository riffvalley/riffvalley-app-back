import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateTours1792100000000 migration', () => {
  const source = readFileSync(
    resolve(__dirname, '../1792100000000-CreateTours.ts'),
    'utf8',
  ).replace(/\s+/gu, ' ');

  it('creates tours and adds a nullable restrictive Event foreign key', () => {
    expect(source).toContain('CREATE TABLE "tours"');
    expect(source).toContain('"name" character varying(180) NOT NULL');
    expect(source).toContain('"description" text');
    expect(source).toContain('ALTER TABLE "events" ADD "tour_id" uuid');
    expect(source).toContain('REFERENCES "tours"("id") ON DELETE RESTRICT');
    expect(source).toContain(
      'CHK_events_tour_is_concert" CHECK ("tour_id" IS NULL OR "type" = \'concert\')',
    );
    expect(source).toContain(
      'IDX_events_tour_start_date" ON "events" ("tour_id", "start_date")',
    );
    expect(source).not.toContain('UNIQUE');
    expect(source).not.toContain('ON DELETE CASCADE');
  });

  it('rolls back only the tour relation and table', () => {
    const down = source.slice(source.indexOf('public async down'));
    expect(down).toContain('DROP COLUMN "tour_id"');
    expect(down).toContain('DROP TABLE "tours"');
    expect(down).not.toContain('DELETE FROM "events"');
    expect(down).not.toContain('event_artists');
  });
});
