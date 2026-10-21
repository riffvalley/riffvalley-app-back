import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateAuthRateLimitWindows1791980000000 migration', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1791980000000-CreateAuthRateLimitWindows.ts'),
    'utf8',
  );

  it('creates only hashed, expiring attempt windows with bounded lookup support', () => {
    expect(migrationSource).toContain(
      "name = 'CreateAuthRateLimitWindows1791980000000'",
    );
    expect(migrationSource).toContain('"subject_hash" bytea NOT NULL');
    expect(migrationSource).toContain('octet_length("subject_hash") = 32');
    expect(migrationSource).toContain('"attempt_count" integer NOT NULL');
    expect(migrationSource).toContain(
      '"expires_at" TIMESTAMP WITH TIME ZONE NOT NULL',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "IDX_auth_rate_limit_windows_expires_at"',
    );
    expect(migrationSource).not.toMatch(
      /password|token|cookie|ip_address|username/i,
    );
  });

  it('drops only the additive rate limit table and index on rollback', () => {
    expect(migrationSource).toContain('has_active_windows');
    expect(migrationSource).toContain('Rollback de rate limits cancelado');
    expect(migrationSource).toContain(
      'DROP INDEX "IDX_auth_rate_limit_windows_expires_at"',
    );
    expect(migrationSource).toContain('DROP TABLE "auth_rate_limit_windows"');
    expect(migrationSource).not.toMatch(/DELETE FROM|ALTER TABLE "users"/i);
  });
});
