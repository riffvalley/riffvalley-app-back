import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVenueCatalog1792070000000 implements MigrationInterface {
  name = 'CreateVenueCatalog1792070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "administrative_regions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(150) NOT NULL,
        "name_normalized" character varying(180) NOT NULL,
        "code" character varying(32),
        "country_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_administrative_regions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_administrative_regions_country" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_administrative_regions_country_name_normalized"
      ON "administrative_regions" ("country_id", "name_normalized")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_administrative_regions_country_code"
      ON "administrative_regions" ("country_id", "code")
    `);
    await queryRunner.query(`
      CREATE TABLE "localities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(150) NOT NULL,
        "name_normalized" character varying(180) NOT NULL,
        "administrative_region_id" uuid NOT NULL,
        "province" character varying(150),
        "province_normalized" character varying(180) NOT NULL DEFAULT '',
        "latitude" double precision,
        "longitude" double precision,
        "osm_type" character varying(16),
        "osm_id" character varying(32),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_localities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_localities_administrative_region" FOREIGN KEY ("administrative_region_id") REFERENCES "administrative_regions"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_localities_coordinates_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
        CONSTRAINT "CHK_localities_latitude_range" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
        CONSTRAINT "CHK_localities_longitude_range" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
        CONSTRAINT "CHK_localities_osm_reference_pair" CHECK (("osm_type" IS NULL) = ("osm_id" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_localities_geographic_identity"
      ON "localities" ("administrative_region_id", "province_normalized", "name_normalized")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_localities_osm_reference"
      ON "localities" ("osm_type", "osm_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "venues" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(180) NOT NULL,
        "name_normalized" character varying(220) NOT NULL,
        "type" character varying(32) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'active',
        "description" text,
        "capacity" integer,
        "website" character varying(2048),
        "image" text,
        "accessibility" text,
        "address" character varying(255),
        "locality_id" uuid NOT NULL,
        "latitude" double precision,
        "longitude" double precision,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_venues" PRIMARY KEY ("id"),
        CONSTRAINT "FK_venues_locality" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_venues_type" CHECK ("type" IN ('concert_hall', 'arena', 'stadium', 'theater', 'outdoor', 'festival_ground', 'bar_pub', 'other')),
        CONSTRAINT "CHK_venues_status" CHECK ("status" IN ('active', 'closed', 'temporary')),
        CONSTRAINT "CHK_venues_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0),
        CONSTRAINT "CHK_venues_coordinates_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
        CONSTRAINT "CHK_venues_latitude_range" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
        CONSTRAINT "CHK_venues_longitude_range" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_venues_locality_name_normalized"
      ON "venues" ("locality_id", "name_normalized")
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_venues_name_normalized" ON "venues" ("name_normalized")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_venues_type_status" ON "venues" ("type", "status")`,
    );
    await queryRunner.query(`
      CREATE TABLE "locality_geocoding_rate_limit" (
        "id" smallint NOT NULL,
        "last_request_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_locality_geocoding_rate_limit" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_locality_geocoding_rate_limit_singleton" CHECK ("id" = 1)
      )
    `);
    await queryRunner.query(
      `INSERT INTO "locality_geocoding_rate_limit" ("id", "last_request_at") VALUES (1, NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "locality_geocoding_rate_limit"');
    await queryRunner.query('DROP INDEX "IDX_venues_type_status"');
    await queryRunner.query('DROP INDEX "IDX_venues_name_normalized"');
    await queryRunner.query('DROP INDEX "UQ_venues_locality_name_normalized"');
    await queryRunner.query('DROP TABLE "venues"');
    await queryRunner.query('DROP INDEX "UQ_localities_osm_reference"');
    await queryRunner.query('DROP INDEX "UQ_localities_geographic_identity"');
    await queryRunner.query('DROP TABLE "localities"');
    await queryRunner.query(
      'DROP INDEX "UQ_administrative_regions_country_code"',
    );
    await queryRunner.query(
      'DROP INDEX "UQ_administrative_regions_country_name_normalized"',
    );
    await queryRunner.query('DROP TABLE "administrative_regions"');
  }
}
