import { MigrationInterface, QueryRunner } from 'typeorm';

type ExistingSessionRows = {
  has_rows: boolean;
};

export class CreateAuthSessionPersistence1791950000000
  implements MigrationInterface
{
  name = 'CreateAuthSessionPersistence1791950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "client_type" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "last_activity_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_auth_sessions_client_type"
          CHECK ("client_type" IN ('app', 'wiki')),
        CONSTRAINT "CHK_auth_sessions_expiration_after_creation"
          CHECK ("expires_at" > "created_at"),
        CONSTRAINT "FK_auth_sessions_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_sessions_user_client_revoked" ON "auth_sessions" ("user_id", "client_type", "revoked_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_sessions_expires_at" ON "auth_sessions" ("expires_at")',
    );

    await queryRunner.query(`
      CREATE TABLE "auth_refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" uuid NOT NULL,
        "token_hash" bytea NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "replaced_by_id" uuid,
        CONSTRAINT "PK_auth_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_refresh_tokens_replaced_by" UNIQUE ("replaced_by_id"),
        CONSTRAINT "FK_auth_refresh_tokens_session"
          FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_auth_refresh_tokens_successor"
          FOREIGN KEY ("replaced_by_id") REFERENCES "auth_refresh_tokens"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_auth_refresh_tokens_token_hash" ON "auth_refresh_tokens" ("token_hash")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_refresh_tokens_session_consumed" ON "auth_refresh_tokens" ("session_id", "consumed_at")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_auth_refresh_tokens_one_unconsumed_per_session" ON "auth_refresh_tokens" ("session_id") WHERE "consumed_at" IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT EXISTS (SELECT 1 FROM "auth_sessions")
        OR EXISTS (SELECT 1 FROM "auth_refresh_tokens") AS "has_rows"
    `)) as ExistingSessionRows[];

    if (rows[0]?.has_rows) {
      throw new Error(
        'Rollback de sesiones cancelado: las tablas contienen sesiones; eliminar datos de sesión requiere una decisión explícita.',
      );
    }

    await queryRunner.query('DROP TABLE "auth_refresh_tokens"');
    await queryRunner.query('DROP TABLE "auth_sessions"');
  }
}
