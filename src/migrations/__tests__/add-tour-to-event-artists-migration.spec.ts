import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AddTourToEventArtists1792110000000 migration', () => {
  const source = readFileSync(
    resolve(__dirname, '../1792110000000-AddTourToEventArtists.ts'),
    'utf8',
  ).replace(/\s+/gu, ' ');

  it('adds an optional restrictive Tour relationship and a lookup index', () => {
    expect(source).toContain('ALTER TABLE "event_artists" ADD "tour_id" uuid');
    expect(source).toContain('REFERENCES "tours"("id") ON DELETE RESTRICT');
    expect(source).toContain(
      'IDX_event_artists_tour_event_position" ON "event_artists" ("tour_id", "event_id", "position")',
    );
    expect(source).toContain('WHERE "tour_id" IS NOT NULL');
  });

  it('guards event type compatibility and drops only the new relation on rollback', () => {
    expect(source).toContain('CHK_event_artists_tour_is_festival');
    expect(source).toContain(
      'BEFORE INSERT OR UPDATE OF "event_id", "tour_id" ON "event_artists"',
    );
    const down = source.slice(source.indexOf('public async down'));
    expect(down).toContain('DROP COLUMN "tour_id"');
    expect(down).not.toContain('DELETE FROM');
    expect(down).not.toContain('DROP TABLE "event_artists"');
  });
});
