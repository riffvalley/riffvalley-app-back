import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameSpotifyContentTypeToRiffValleyPlaylist1791220000000
  implements MigrationInterface
{
  name = 'RenameSpotifyContentTypeToRiffValleyPlaylist1791220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."content_type_enum" RENAME VALUE 'spotify' TO 'riff_valley_playlist'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."content_type_enum" RENAME VALUE 'riff_valley_playlist' TO 'spotify'`,
    );
  }
}
