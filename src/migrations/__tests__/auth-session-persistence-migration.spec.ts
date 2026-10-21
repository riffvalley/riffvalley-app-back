import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateAuthSessionPersistence1791950000000 migration definition', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1791950000000-CreateAuthSessionPersistence.ts'),
    'utf8',
  );

  it('creates only the approved hash-only session tables and constraints', () => {
    expect(migrationSource).not.toContain('transaction = true');
    expect(migrationSource).toContain('CREATE TABLE "auth_sessions"');
    expect(migrationSource).toContain('CREATE TABLE "auth_refresh_tokens"');
    expect(migrationSource.match(/CREATE TABLE/g)).toHaveLength(2);
    expect(migrationSource).not.toMatch(/ALTER TABLE/i);
    expect(migrationSource).toContain('"token_hash" bytea NOT NULL');
    expect(migrationSource).toContain("\"client_type\" IN ('app', 'wiki')");
    expect(migrationSource).toContain('"expires_at" > "created_at"');
    expect(migrationSource).toContain(
      'UNIQUE INDEX "UQ_auth_refresh_tokens_token_hash"',
    );
    expect(migrationSource).toContain(
      '"session_id") WHERE "consumed_at" IS NULL',
    );
    expect(migrationSource).toContain('ON DELETE CASCADE');
    expect(migrationSource).toContain('ON DELETE SET NULL');
    expect(migrationSource).not.toMatch(/"refresh_token"|"token"\s+text/i);
    expect(migrationSource).not.toMatch(
      /ALTER TABLE\s+"users"|UPDATE\s+"users"|DELETE\s+FROM\s+"users"/i,
    );
    expect(migrationSource).not.toContain(
      'CREATE TABLE "auth_refresh_operations"',
    );
  });

  it('refuses rollback when session data exists and can drop only the empty new tables', () => {
    expect(migrationSource).toContain(
      'SELECT EXISTS (SELECT 1 FROM "auth_sessions")',
    );
    expect(migrationSource).toContain(
      'OR EXISTS (SELECT 1 FROM "auth_refresh_tokens")',
    );
    expect(migrationSource).toContain('Rollback de sesiones cancelado');
    expect(migrationSource).toContain('DROP TABLE "auth_refresh_tokens"');
    expect(migrationSource).toContain('DROP TABLE "auth_sessions"');
  });
});
