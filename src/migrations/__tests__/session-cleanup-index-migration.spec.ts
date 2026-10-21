import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AddSessionCleanupIndex1791970000000 migration definition', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1791970000000-AddSessionCleanupIndex.ts'),
    'utf8',
  );

  it('adds only the partial revoked-session index used by bounded cleanup', () => {
    expect(migrationSource).toContain(
      "name = 'AddSessionCleanupIndex1791970000000'",
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "IDX_auth_sessions_revoked_at" ON "auth_sessions" ("revoked_at") WHERE "revoked_at" IS NOT NULL',
    );
    expect(migrationSource).not.toMatch(/CREATE TABLE|DROP TABLE|DELETE FROM/i);
  });

  it('reverses only the added index', () => {
    expect(migrationSource).toContain(
      'DROP INDEX "IDX_auth_sessions_revoked_at"',
    );
    expect(migrationSource).not.toMatch(/DROP TABLE|DELETE FROM/i);
  });
});
