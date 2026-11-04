import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ScopeImportReceiptsByOperation1792130000000 migration', () => {
  const source = readFileSync(
    resolve(__dirname, '../1792130000000-ScopeImportReceiptsByOperation.ts'),
    'utf8',
  ).replace(/\s+/gu, ' ');

  it('preserves existing creation receipts and separates lineup receipts', () => {
    expect(source).toContain(
      `ADD "operation" character varying(30) NOT NULL DEFAULT 'create-event'`,
    );
    expect(source).toContain(
      'DROP INDEX "UQ_catalog_import_row_receipts_identity"',
    );
    expect(source).toContain('"row_id", "operation"');
    expect(source).toContain(
      'CREATE UNIQUE INDEX "UQ_catalog_import_row_receipts_identity"',
    );
  });

  it('does not discard receipt history on rollback', () => {
    const down = source.slice(source.indexOf('public async down'));
    expect(down).toContain('intentionally irreversible');
    expect(down).not.toContain('DROP TABLE');
  });
});
