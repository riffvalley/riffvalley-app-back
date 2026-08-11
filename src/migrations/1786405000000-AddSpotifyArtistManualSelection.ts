import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpotifyArtistManualSelection1786405000000
  implements MigrationInterface
{
  name = 'AddSpotifyArtistManualSelection1786405000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spotify_playlist_artists" ADD "selection_mode" character varying(20) NOT NULL DEFAULT 'setlist'`,
    );
    await queryRunner.query(
      `ALTER TABLE "spotify_playlist_artists" ADD "spotify_artist_id" character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spotify_playlist_artists" DROP COLUMN "spotify_artist_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "spotify_playlist_artists" DROP COLUMN "selection_mode"`,
    );
  }
}
