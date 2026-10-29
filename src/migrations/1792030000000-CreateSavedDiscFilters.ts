import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSavedDiscFilters1792030000000 implements MigrationInterface {
  name = 'CreateSavedDiscFilters1792030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "saved_disc_filters" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" character varying(60) NOT NULL,
        "filters" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_saved_disc_filters" PRIMARY KEY ("id"),
        CONSTRAINT "FK_saved_disc_filters_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_saved_disc_filters_user_id_created_at"
      ON "saved_disc_filters" ("user_id", "created_at", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "IDX_saved_disc_filters_user_id_created_at"',
    );
    await queryRunner.query('DROP TABLE "saved_disc_filters"');
  }
}
