import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSuggestion1774800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "suggestion_status_enum" AS ENUM ('in_progress', 'done', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "suggestion_priority_enum" AS ENUM ('low', 'medium', 'high')
    `);
    await queryRunner.query(`
      CREATE TABLE "suggestion" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title"           varchar(200) NOT NULL,
        "description"     text NOT NULL,
        "status"          "suggestion_status_enum" NOT NULL DEFAULT 'in_progress',
        "priority"        "suggestion_priority_enum" NOT NULL DEFAULT 'medium',
        "rejectionReason" text,
        "userId"          uuid,
        "versionItemId"   uuid,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_suggestion" PRIMARY KEY ("id"),
        CONSTRAINT "FK_suggestion_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_suggestion_version_item"
          FOREIGN KEY ("versionItemId") REFERENCES "version_item"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "suggestion"`);
    await queryRunner.query(`DROP TYPE "suggestion_priority_enum"`);
    await queryRunner.query(`DROP TYPE "suggestion_status_enum"`);
  }
}
