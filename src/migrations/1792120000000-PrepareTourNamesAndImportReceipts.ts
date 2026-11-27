import { MigrationInterface, QueryRunner } from 'typeorm';
import { normalizeGeography } from '../catalog/geography/helpers/normalize-geography';

interface TourNameRow {
  id: string;
  name: string;
}

export class PrepareTourNamesAndImportReceipts1792120000000
  implements MigrationInterface
{
  name = 'PrepareTourNamesAndImportReceipts1792120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tours" ADD "normalized_name" character varying(360)`,
    );
    const tours = (await queryRunner.query(
      `SELECT "id", "name" FROM "tours" ORDER BY "id"`,
    )) as TourNameRow[];
    const normalizedTours = new Map<string, TourNameRow[]>();
    for (const tour of tours) {
      const normalizedName = normalizeGeography(tour.name);
      const matches = normalizedTours.get(normalizedName) ?? [];
      matches.push(tour);
      normalizedTours.set(normalizedName, matches);
      await queryRunner.query(
        `UPDATE "tours" SET "normalized_name" = $1 WHERE "id" = $2`,
        [normalizedName, tour.id],
      );
    }

    const collisions = [...normalizedTours.entries()].filter(
      ([, matches]) => matches.length > 1,
    );
    if (collisions.length > 0) {
      const details = collisions
        .map(([normalizedName, matches]) => {
          const tourDetails = matches
            .map((tour) => `${tour.id} (${JSON.stringify(tour.name)})`)
            .join(', ');
          return `${JSON.stringify(normalizedName)}: ${tourDetails}`;
        })
        .join('; ');
      throw new Error(
        `Cannot enforce normalized Tour uniqueness until existing collisions are resolved safely: ${details}`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "tours" ALTER COLUMN "normalized_name" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_tours_normalized_name" ON "tours" ("normalized_name")`,
    );
    await queryRunner.query(`
      CREATE TABLE "catalog_import_row_receipts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "editor_id" uuid NOT NULL,
        "batch_id" uuid NOT NULL,
        "row_id" uuid NOT NULL,
        "payload_hash" character varying(64) NOT NULL,
        "status" character varying(20) NOT NULL,
        "result" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_catalog_import_row_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_catalog_import_row_receipts_editor" FOREIGN KEY ("editor_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_catalog_import_row_receipts_status"
          CHECK ("status" IN ('processing', 'completed')),
        CONSTRAINT "CHK_catalog_import_row_receipts_payload_hash"
          CHECK ("payload_hash" ~ '^[a-f0-9]{64}$'),
        CONSTRAINT "CHK_catalog_import_row_receipts_result"
          CHECK (("status" = 'processing' AND "result" IS NULL) OR
                 ("status" = 'completed' AND "result" IS NOT NULL AND
                  jsonb_typeof("result") = 'object'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_catalog_import_row_receipts_identity"
       ON "catalog_import_row_receipts" ("editor_id", "batch_id", "row_id")`,
    );
  }

  public async down(): Promise<void> {
    throw new Error(
      'This migration is intentionally irreversible: dropping import receipts could permit duplicate events after retry.',
    );
  }
}
