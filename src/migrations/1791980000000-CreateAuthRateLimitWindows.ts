import { MigrationInterface, QueryRunner } from 'typeorm';

type ActiveRateLimitWindows = { has_active_windows: boolean };

export class CreateAuthRateLimitWindows1791980000000
  implements MigrationInterface
{
  name = 'CreateAuthRateLimitWindows1791980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_rate_limit_windows" (
        "scope" character varying(40) NOT NULL,
        "subject_hash" bytea NOT NULL,
        "window_started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attempt_count" integer NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_auth_rate_limit_windows"
          PRIMARY KEY ("scope", "subject_hash", "window_started_at"),
        CONSTRAINT "CHK_auth_rate_limit_windows_hash_length"
          CHECK (octet_length("subject_hash") = 32),
        CONSTRAINT "CHK_auth_rate_limit_windows_attempt_count"
          CHECK ("attempt_count" > 0),
        CONSTRAINT "CHK_auth_rate_limit_windows_expiry"
          CHECK ("expires_at" > "window_started_at")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_rate_limit_windows_expires_at"
      ON "auth_rate_limit_windows" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const activeWindows = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM "auth_rate_limit_windows"
        WHERE "expires_at" > clock_timestamp()
      ) AS "has_active_windows"
    `)) as ActiveRateLimitWindows[];
    if (activeWindows[0]?.has_active_windows) {
      throw new Error(
        'Rollback de rate limits cancelado: existen ventanas activas; esperar su expiración evita reiniciar límites vigentes.',
      );
    }

    await queryRunner.query(
      'DROP INDEX "IDX_auth_rate_limit_windows_expires_at"',
    );
    await queryRunner.query('DROP TABLE "auth_rate_limit_windows"');
  }
}
