import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateSavedDiscFilters1792030000000 migration', () => {
  const migrationSource = readFileSync(
    resolve(__dirname, '../1792030000000-CreateSavedDiscFilters.ts'),
    'utf8',
  );

  it('creates an indexed per-user table with PostgreSQL JSONB and cascading ownership', () => {
    expect(migrationSource).toContain('CREATE TABLE "saved_disc_filters"');
    expect(migrationSource).toContain('"filters" jsonb NOT NULL');
    expect(migrationSource).toContain('"name" character varying(60) NOT NULL');
    expect(migrationSource.replace(/\s+/g, ' ')).toContain(
      'FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "IDX_saved_disc_filters_user_id_created_at"',
    );
    expect(migrationSource).toContain(
      'ON "saved_disc_filters" ("user_id", "created_at", "id")',
    );
  });

  it('drops only the new index and table on rollback', () => {
    expect(migrationSource).toContain(
      'DROP INDEX "IDX_saved_disc_filters_user_id_created_at"',
    );
    expect(migrationSource).toContain('DROP TABLE "saved_disc_filters"');
    expect(migrationSource).not.toMatch(/ALTER TABLE "users"|DELETE FROM/i);
  });
});
