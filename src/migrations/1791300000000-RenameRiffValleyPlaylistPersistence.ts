import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames only local Riff Valley playlist persistence identifiers. PostgreSQL
 * performs these renames in place, preserving row IDs, values and FK behavior.
 * The spotify_playlist_id column remains named for the remote Spotify ID.
 */
export class RenameRiffValleyPlaylistPersistence1791300000000
  implements MigrationInterface
{
  name = 'RenameRiffValleyPlaylistPersistence1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spotify" RENAME TO "riff_valley_playlists"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlists" RENAME CONSTRAINT "PK_8f15f9b9026ec86cad486e3d56d" TO "PK_riff_valley_playlists"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlists" RENAME CONSTRAINT "UQ_spotify_playlist_id" TO "UQ_riff_valley_playlists_spotify_playlist_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlists" RENAME CONSTRAINT "FK_c95472afea04c05258cd3ce595d" TO "FK_riff_valley_playlists_user"`,
    );

    await queryRunner.query(
      `ALTER TABLE "content" RENAME COLUMN "spotifyId" TO "riffValleyPlaylistId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" RENAME CONSTRAINT "FK_07e8d421f792de1e393e78735d1" TO "FK_content_riff_valley_playlist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" RENAME CONSTRAINT "UQ_07e8d421f792de1e393e78735d1" TO "REL_742c2259013425196f5558b5cf"`,
    );

    await queryRunner.query(
      `ALTER TABLE "spotify_playlist_artists" RENAME TO "riff_valley_playlist_artists"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME COLUMN "spotify_id" TO "riff_valley_playlist_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "PK_spotify_playlist_artists" TO "PK_riff_valley_playlist_artists"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "UQ_spotify_playlist_artist" TO "UQ_riff_valley_playlist_artist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "FK_spotify_playlist_artists_spotify" TO "FK_riff_valley_playlist_artists_playlist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "FK_spotify_playlist_artists_artist" TO "FK_riff_valley_playlist_artists_artist"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_spotify_playlist_artists_artist" RENAME TO "IDX_riff_valley_playlist_artists_artist"`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."spotify_status_enum" RENAME TO "riff_valley_playlist_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."spotify_type_enum" RENAME TO "riff_valley_playlist_type_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."riff_valley_playlist_type_enum" RENAME TO "spotify_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."riff_valley_playlist_status_enum" RENAME TO "spotify_status_enum"`,
    );

    await queryRunner.query(
      `ALTER INDEX "IDX_riff_valley_playlist_artists_artist" RENAME TO "IDX_spotify_playlist_artists_artist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "FK_riff_valley_playlist_artists_artist" TO "FK_spotify_playlist_artists_artist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "FK_riff_valley_playlist_artists_playlist" TO "FK_spotify_playlist_artists_spotify"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "UQ_riff_valley_playlist_artist" TO "UQ_spotify_playlist_artist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME CONSTRAINT "PK_riff_valley_playlist_artists" TO "PK_spotify_playlist_artists"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME COLUMN "riff_valley_playlist_id" TO "spotify_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlist_artists" RENAME TO "spotify_playlist_artists"`,
    );

    await queryRunner.query(
      `ALTER TABLE "content" RENAME CONSTRAINT "REL_742c2259013425196f5558b5cf" TO "UQ_07e8d421f792de1e393e78735d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" RENAME CONSTRAINT "FK_content_riff_valley_playlist" TO "FK_07e8d421f792de1e393e78735d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" RENAME COLUMN "riffValleyPlaylistId" TO "spotifyId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlists" RENAME CONSTRAINT "FK_riff_valley_playlists_user" TO "FK_c95472afea04c05258cd3ce595d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlists" RENAME CONSTRAINT "UQ_riff_valley_playlists_spotify_playlist_id" TO "UQ_spotify_playlist_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlists" RENAME CONSTRAINT "PK_riff_valley_playlists" TO "PK_8f15f9b9026ec86cad486e3d56d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "riff_valley_playlists" RENAME TO "spotify"`,
    );
  }
}
