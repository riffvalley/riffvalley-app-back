import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpotifyProtectedTracks1786403000000
  implements MigrationInterface
{
  name = 'AddSpotifyProtectedTracks1786403000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spotify" ADD "protected_track_uris" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spotify" DROP COLUMN "protected_track_uris"`,
    );
  }
}
