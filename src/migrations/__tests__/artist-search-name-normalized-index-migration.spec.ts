import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AddArtistSearchNameNormalizedIndex1792060000000 migration', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../1792060000000-AddArtistSearchNameNormalizedIndex.ts',
    ),
    'utf8',
  );

  it('adds a partial B-tree index for exact current artist-name lookups', () => {
    expect(source).toContain(
      'CREATE INDEX "IDX_artist_search_name_normalized" ON "artist" ("search_name_normalized") WHERE "search_name_normalized" IS NOT NULL',
    );
    expect(source).not.toMatch(/UNIQUE|UPDATE|DELETE/i);
  });

  it('drops only the index when reverted', () => {
    expect(source).toContain('DROP INDEX "IDX_artist_search_name_normalized"');
    expect(source).not.toMatch(/DROP TABLE|DROP COLUMN/i);
  });
});
