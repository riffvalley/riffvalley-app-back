import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTiktokConnections1786500000000
  implements MigrationInterface
{
  name = 'CreateTiktokConnections1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tiktok_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "connection_key" character varying(50) NOT NULL,
        "open_id" text,
        "display_name" text,
        "access_token" text,
        "refresh_token" text,
        "scope" text,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "authorized_at" TIMESTAMP WITH TIME ZONE,
        "refresh_token_expires_at" TIMESTAMP WITH TIME ZONE,
        "authorization_invalidated_at" TIMESTAMP WITH TIME ZONE,
        "reauthorization_reminder_sent_at" TIMESTAMP WITH TIME ZONE,
        "oauth_state_hash" text,
        "oauth_state_expires_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tiktok_connections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tiktok_connections_key" UNIQUE ("connection_key"),
        CONSTRAINT "UQ_tiktok_connections_oauth_state" UNIQUE ("oauth_state_hash"),
        CONSTRAINT "CK_tiktok_connections_riff_valley"
          CHECK ("connection_key" = 'riff-valley')
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tiktok_connections"`);
  }
}
