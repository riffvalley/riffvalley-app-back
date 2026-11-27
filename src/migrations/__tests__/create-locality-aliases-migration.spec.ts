import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateLocalityAliases1792080000000 migration', () => {
  const source = readFileSync(
    resolve(__dirname, '../1792080000000-CreateLocalityAliases.ts'),
    'utf8',
  );

  it('creates indexed aliases with locality ownership and duplicate protection', () => {
    const normalized = source.replace(/\s+/gu, ' ');
    expect(normalized).toContain('CREATE TABLE "locality_aliases"');
    expect(normalized).toContain(
      'REFERENCES "localities"("id") ON DELETE CASCADE',
    );
    expect(normalized).toContain(
      'UQ_locality_aliases_locality_name" ON "locality_aliases" ("locality_id", "normalized_name")',
    );
    expect(normalized).toContain(
      'IDX_locality_aliases_normalized_name" ON "locality_aliases" ("normalized_name")',
    );
    expect(normalized).toContain(
      "CHECK (\"kind\" IN ('linguistic', 'alternate'))",
    );
  });

  it('rolls back only alias objects and never edits locality data', () => {
    const down = source.slice(source.indexOf('public async down'));
    expect(down).toContain('DROP TABLE "locality_aliases"');
    expect(down).not.toMatch(/DELETE FROM "localities"|UPDATE "localities"/i);
    expect(down).not.toContain('DROP TABLE "localities"');
  });
});
