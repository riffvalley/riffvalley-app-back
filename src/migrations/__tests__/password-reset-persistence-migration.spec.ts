import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreatePasswordResetPersistence1792050000000 migration', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1792050000000-CreatePasswordResetPersistence.ts'),
    'utf8',
  );

  it('adds versioned credentials and hash-only reset/outbox persistence', () => {
    expect(migrationSource).toContain(
      "name = 'CreatePasswordResetPersistence1792050000000'",
    );
    expect(migrationSource).toContain(
      '"credential_version" integer NOT NULL DEFAULT 0',
    );
    expect(migrationSource).toContain(
      'CREATE TABLE "auth_password_reset_requests"',
    );
    expect(migrationSource).toContain(
      'CREATE TABLE "auth_password_reset_outbox"',
    );
    expect(migrationSource).toContain('"token_hash" bytea NOT NULL');
    expect(migrationSource).toContain(
      "'pending_delivery', 'active', 'consumed', 'invalidated', 'failed'",
    );
    expect(migrationSource).toContain(
      "WHERE \"status\" IN ('pending_delivery', 'active')",
    );
    expect(migrationSource).toContain('ON DELETE CASCADE');
    expect(migrationSource).not.toMatch(
      /"(?:token|reset_token|email|password)"\s+(?:text|bytea)/i,
    );
    expect(migrationSource).not.toMatch(/transaction\s*=\s*true/i);
  });

  it('refuses rollback after a reset or credential version change', () => {
    expect(migrationSource).toContain('has_incremented_credential_versions');
    expect(migrationSource).toContain(
      'Rollback de recuperación de contraseña cancelado',
    );
    expect(migrationSource).toContain(
      'DROP TABLE "auth_password_reset_outbox"',
    );
    expect(migrationSource).toContain(
      'DROP TABLE "auth_password_reset_requests"',
    );
    expect(migrationSource).toContain('DROP COLUMN "credential_version"');
  });
});
