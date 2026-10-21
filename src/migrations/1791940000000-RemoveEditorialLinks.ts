import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveEditorialLinks1791940000000 implements MigrationInterface {
  name = 'RemoveEditorialLinks1791940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Link has one outgoing FK to List (ON DELETE CASCADE). No entity points
    // to Link, so dropping the table removes that FK without CASCADE.
    await queryRunner.query(`DROP TABLE IF EXISTS "link"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This restores the empty schema only; rows removed by up cannot be recovered.
    await queryRunner.query(`
      CREATE TABLE "link" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "link" character varying NOT NULL,
        "name" character varying NOT NULL,
        "listId" uuid,
        CONSTRAINT "PK_26206fb7186da72fbb9eaa3fac9" PRIMARY KEY ("id"),
        CONSTRAINT "FK_4ec3e5ecac5ece3fb28388ccb1b"
          FOREIGN KEY ("listId") REFERENCES "list"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }
}
