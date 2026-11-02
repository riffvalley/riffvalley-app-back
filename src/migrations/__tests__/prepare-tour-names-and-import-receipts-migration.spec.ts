import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PrepareTourNamesAndImportReceipts1792120000000 migration', () => {
  const source = readFileSync(
    resolve(__dirname, '../1792120000000-PrepareTourNamesAndImportReceipts.ts'),
    'utf8',
  ).replace(/\s+/gu, ' ');

  it('backfills normalized Tour names, rejects collisions, then adds database uniqueness', () => {
    expect(source).toContain('ADD "normalized_name" character varying(360)');
    expect(source).toContain('SELECT "id", "name" FROM "tours" ORDER BY "id"');
    expect(source).toContain('normalizeGeography(tour.name)');
    expect(source).toContain('existing collisions are resolved safely');
    expect(source).toContain(
      'CREATE UNIQUE INDEX "UQ_tours_normalized_name" ON "tours" ("normalized_name")',
    );
    expect(source).not.toContain('UPDATE "tours" SET "name"');
    expect(source).not.toContain('DELETE FROM "tours"');
  });

  it('creates editor-scoped row receipts with content identity and persisted results', () => {
    expect(source).toContain('CREATE TABLE "catalog_import_row_receipts"');
    expect(source).toContain('"editor_id" uuid NOT NULL');
    expect(source).toContain('"batch_id" uuid NOT NULL');
    expect(source).toContain('"row_id" uuid NOT NULL');
    expect(source).toContain('"payload_hash" character varying(64) NOT NULL');
    expect(source).toContain('"result" jsonb');
    expect(source).toContain('("editor_id", "batch_id", "row_id")');
    expect(source).toContain('REFERENCES "users"("id") ON DELETE RESTRICT');
  });

  it('refuses to drop receipt history during rollback', () => {
    const down = source.slice(source.indexOf('public async down'));
    expect(down).toContain('intentionally irreversible');
    expect(down).not.toContain('DROP TABLE');
  });
});
