import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlbumOfTheWeekToDisc1785262000000
  implements MigrationInterface
{
  name = 'AddAlbumOfTheWeekToDisc1785262000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "disc" ADD "albumOfTheWeek" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "disc" ADD "albumOfTheWeekAt" TIMESTAMP`,
    );
    // A lo sumo un disco por semana (albumOfTheWeekAt = viernes de esa
    // semana), no un único disco en todo el histórico.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_disc_album_of_the_week_unique" ON "disc" ("albumOfTheWeekAt") WHERE "albumOfTheWeek" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_disc_album_of_the_week_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disc" DROP COLUMN "albumOfTheWeekAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "disc" DROP COLUMN "albumOfTheWeek"`,
    );
  }
}
