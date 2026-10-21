import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AddRefreshOperationFingerprint1791960000000 migration definition', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1791960000000-AddRefreshOperationFingerprint.ts'),
    'utf8',
  );

  it('adds only nullable non-bearer metadata to refresh rows', () => {
    expect(migrationSource).not.toContain('transaction = true');
    expect(migrationSource).toContain(
      "name = 'AddRefreshOperationFingerprint1791960000000'",
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "auth_refresh_tokens" ADD COLUMN "operation_key_hash" bytea',
    );
    expect(migrationSource).not.toMatch(/CREATE TABLE|"operation_id"\s+text/i);
    expect(migrationSource).not.toMatch(
      /"(?:refresh_token|successor_token|response)"\s+(?:text|bytea)/i,
    );
  });

  it('refuses rollback while operation fingerprints remain stored', () => {
    expect(migrationSource).toContain('"operation_key_hash" IS NOT NULL');
    expect(migrationSource).toContain(
      'Rollback de metadata de refresh cancelado',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "auth_refresh_tokens" DROP COLUMN "operation_key_hash"',
    );
  });
});
