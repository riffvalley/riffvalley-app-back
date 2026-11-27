import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLocalityAliases1792080000000 implements MigrationInterface {
  name = 'CreateLocalityAliases1792080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "locality_aliases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "locality_id" uuid NOT NULL,
        "name" character varying(150) NOT NULL,
        "normalized_name" character varying(180) NOT NULL,
        "language" character varying(16),
        "kind" character varying(16) NOT NULL DEFAULT 'alternate',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_locality_aliases" PRIMARY KEY ("id"),
        CONSTRAINT "FK_locality_aliases_locality" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_locality_aliases_kind" CHECK ("kind" IN ('linguistic', 'alternate'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_locality_aliases_locality_name" ON "locality_aliases" ("locality_id", "normalized_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_locality_aliases_normalized_name" ON "locality_aliases" ("normalized_name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "IDX_locality_aliases_normalized_name"',
    );
    await queryRunner.query('DROP INDEX "UQ_locality_aliases_locality_name"');
    await queryRunner.query('DROP TABLE "locality_aliases"');
  }
}
