import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpotifyAuthorizationLifetime1786404000000
  implements MigrationInterface
{
  name = 'AddSpotifyAuthorizationLifetime1786404000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "spotify_connections"
      ADD COLUMN "authorized_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "refresh_token_expires_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "authorization_invalidated_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "reauthorization_reminder_sent_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      UPDATE "spotify_connections"
      SET
        "authorized_at" = "created_at",
        "refresh_token_expires_at" = "created_at" + INTERVAL '6 months'
      WHERE "refresh_token" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "spotify_connections"
      DROP COLUMN "reauthorization_reminder_sent_at",
      DROP COLUMN "authorization_invalidated_at",
      DROP COLUMN "refresh_token_expires_at",
      DROP COLUMN "authorized_at"
    `);
  }
}
