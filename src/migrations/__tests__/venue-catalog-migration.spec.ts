import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateVenueCatalog1792070000000 migration', () => {
  const source = readFileSync(
    resolve(__dirname, '../1792070000000-CreateVenueCatalog.ts'),
    'utf8',
  );

  it('creates locality and venue tables with restrictive relations and geographic constraints', () => {
    const normalized = source.replace(/\s+/gu, ' ');
    expect(source).toContain('CREATE TABLE "administrative_regions"');
    expect(source).toContain('CREATE TABLE "localities"');
    expect(source).toContain('CREATE TABLE "venues"');
    expect(normalized).toContain(
      'REFERENCES "country"("id") ON DELETE RESTRICT',
    );
    expect(normalized).toContain(
      'REFERENCES "administrative_regions"("id") ON DELETE RESTRICT',
    );
    expect(normalized).toContain(
      'REFERENCES "localities"("id") ON DELETE RESTRICT',
    );
    expect(normalized).toContain('"capacity" IS NULL OR "capacity" > 0');
    expect(normalized).toContain('"latitude" BETWEEN -90 AND 90');
    expect(normalized).toContain('"longitude" BETWEEN -180 AND 180');
    expect(source).toContain(
      'UQ_administrative_regions_country_name_normalized',
    );
    expect(source).toContain('UQ_administrative_regions_country_code');
    expect(source).toContain('UQ_localities_geographic_identity');
    expect(source).toContain('UQ_venues_locality_name_normalized');
  });

  it('creates the shared persisted Nominatim throttle and limits allowed venue values', () => {
    expect(source).toContain('CREATE TABLE "locality_geocoding_rate_limit"');
    expect(source).toContain('VALUES (1, NULL)');
    expect(source).toContain(
      "'concert_hall', 'arena', 'stadium', 'theater', 'outdoor', 'festival_ground', 'bar_pub', 'other'",
    );
    expect(source).toContain("'active', 'closed', 'temporary'");
  });

  it('reverts only the objects introduced by this migration in dependency order', () => {
    const down = source.slice(source.indexOf('public async down'));
    expect(down).toContain('DROP TABLE "locality_geocoding_rate_limit"');
    expect(down).toContain('DROP TABLE "venues"');
    expect(down).toContain('DROP TABLE "localities"');
    expect(down).toContain('DROP TABLE "administrative_regions"');
    expect(down).not.toMatch(/DROP TABLE "country"|DELETE FROM/i);
  });
});
