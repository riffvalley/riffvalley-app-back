import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpotifyTrackIdToAsignation1784928759086
  implements MigrationInterface
{
  name = 'AddSpotifyTrackIdToAsignation1784928759086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "asignation" ADD "spotifyTrackId" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "asignation" DROP COLUMN "spotifyTrackId"`,
    );
  }
}
