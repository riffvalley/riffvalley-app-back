import { MigrationInterface, QueryRunner } from 'typeorm';

type ExistingPasswordResetData = {
  has_rows: boolean;
  has_incremented_credential_versions: boolean;
};

export class CreatePasswordResetPersistence1792050000000
  implements MigrationInterface
{
  name = 'CreatePasswordResetPersistence1792050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "credential_version" integer NOT NULL DEFAULT 0,
      ADD CONSTRAINT "CHK_users_credential_version_nonnegative"
        CHECK ("credential_version" >= 0)
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_password_reset_requests" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "token_hash" bytea NOT NULL,
        "status" text NOT NULL DEFAULT 'pending_delivery',
        "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "activated_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "invalidated_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_auth_password_reset_requests" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_auth_password_reset_requests_hash_length"
          CHECK (octet_length("token_hash") = 32),
        CONSTRAINT "CHK_auth_password_reset_requests_status"
          CHECK ("status" IN ('pending_delivery', 'active', 'consumed', 'invalidated', 'failed')),
        CONSTRAINT "FK_auth_password_reset_requests_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_auth_password_reset_requests_token_hash"
      ON "auth_password_reset_requests" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_password_reset_requests_user_status"
      ON "auth_password_reset_requests" ("user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_password_reset_requests_expires_at"
      ON "auth_password_reset_requests" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_auth_password_reset_requests_current_per_user"
      ON "auth_password_reset_requests" ("user_id")
      WHERE "status" IN ('pending_delivery', 'active')
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_password_reset_outbox" (
        "id" uuid NOT NULL,
        "request_id" uuid NOT NULL,
        "status" text NOT NULL DEFAULT 'queued',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "locked_until" TIMESTAMP WITH TIME ZONE,
        "delivered_at" TIMESTAMP WITH TIME ZONE,
        "failed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_password_reset_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_auth_password_reset_outbox_attempt_count"
          CHECK ("attempt_count" >= 0),
        CONSTRAINT "CHK_auth_password_reset_outbox_status"
          CHECK ("status" IN ('queued', 'leased', 'delivered', 'failed', 'cancelled')),
        CONSTRAINT "FK_auth_password_reset_outbox_request"
          FOREIGN KEY ("request_id") REFERENCES "auth_password_reset_requests"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "UQ_auth_password_reset_outbox_request" UNIQUE ("request_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_password_reset_outbox_ready"
      ON "auth_password_reset_outbox" ("status", "available_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT
        EXISTS (SELECT 1 FROM "auth_password_reset_requests")
        OR EXISTS (SELECT 1 FROM "auth_password_reset_outbox") AS has_rows,
        EXISTS (
          SELECT 1 FROM "users" WHERE "credential_version" > 0
        ) AS has_incremented_credential_versions
    `)) as ExistingPasswordResetData[];

    if (rows[0]?.has_rows || rows[0]?.has_incremented_credential_versions) {
      throw new Error(
        'Rollback de recuperación de contraseña cancelado: existen solicitudes/outbox o credenciales rotadas; eliminar estos datos revalidaría credenciales antiguas.',
      );
    }

    await queryRunner.query(
      'DROP INDEX "IDX_auth_password_reset_outbox_ready"',
    );
    await queryRunner.query('DROP TABLE "auth_password_reset_outbox"');
    await queryRunner.query(
      'DROP INDEX "UQ_auth_password_reset_requests_current_per_user"',
    );
    await queryRunner.query(
      'DROP INDEX "IDX_auth_password_reset_requests_expires_at"',
    );
    await queryRunner.query(
      'DROP INDEX "IDX_auth_password_reset_requests_user_status"',
    );
    await queryRunner.query(
      'DROP INDEX "UQ_auth_password_reset_requests_token_hash"',
    );
    await queryRunner.query('DROP TABLE "auth_password_reset_requests"');
    await queryRunner.query(
      'ALTER TABLE "users" DROP CONSTRAINT "CHK_users_credential_version_nonnegative", DROP COLUMN "credential_version"',
    );
  }
}
