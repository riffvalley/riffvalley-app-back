import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpotifyPlaylistImage1786402000000
  implements MigrationInterface
{
  name = 'AddSpotifyPlaylistImage1786402000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spotify" ADD "image_url" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "spotify" DROP COLUMN "image_url"`);
  }
}
