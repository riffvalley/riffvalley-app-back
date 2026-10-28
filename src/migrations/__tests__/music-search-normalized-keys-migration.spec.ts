import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AddMusicSearchNormalizedKeys1792020000000 migration definition', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1792020000000-AddMusicSearchNormalizedKeys.ts'),
    'utf8',
  );

  it('adds only nullable derived columns and does not backfill or index them', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE "artist" ADD COLUMN "search_name_normalized" text',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "disc" ADD COLUMN "search_name_normalized" text',
    );
    expect(migrationSource).not.toMatch(/UPDATE|CREATE INDEX|NOT NULL/i);
    expect(migrationSource).not.toMatch(
      /name_normalized"\s*=|DROP COLUMN "name_normalized"/i,
    );
  });

  it('reverses only the new derived columns', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE "disc" DROP COLUMN "search_name_normalized"',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "artist" DROP COLUMN "search_name_normalized"',
    );
    expect(migrationSource).not.toMatch(/DROP TABLE|DELETE FROM/i);
  });
});
