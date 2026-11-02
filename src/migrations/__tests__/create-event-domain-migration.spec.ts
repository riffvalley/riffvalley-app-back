import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateEventDomain1792090000000 migration', () => {
  const source = readFileSync(
    resolve(__dirname, '../1792090000000-CreateEventDomain.ts'),
    'utf8',
  ).replace(/\s+/gu, ' ');

  it('adds separate partial uniqueness for generic and physical venues', () => {
    expect(source).toContain('ADD "is_generic" boolean NOT NULL DEFAULT false');
    expect(source).toContain(
      'UQ_venues_locality_name_normalized" ON "venues" ("locality_id", "name_normalized") WHERE "is_generic" = false',
    );
    expect(source).toContain(
      'UQ_venues_generic_locality" ON "venues" ("locality_id") WHERE "is_generic" = true',
    );
    expect(source).toContain('CHK_venues_generic_without_physical_coordinates');
  });

  it('creates calendar-date events, ordered event artists and restrictive venue references', () => {
    expect(source).toContain(
      "CREATE TYPE \"events_type_enum\" AS ENUM ('concert', 'festival')",
    );
    expect(source).toContain('"start_date" date NOT NULL');
    expect(source).toContain('"end_date" date');
    expect(source).toContain('REFERENCES "venues"("id") ON DELETE RESTRICT');
    expect(source).toContain('REFERENCES "events"("id") ON DELETE CASCADE');
    expect(source).toContain('REFERENCES "artist"("id") ON DELETE SET NULL');
    expect(source).toContain('UQ_event_artists_event_position');
    expect(source).toContain('CHK_event_artists_name_nonempty');
  });
});
