import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Content } from 'src/contents/entities/content.entity';
import { ContentType } from 'src/contents/entities/content.entity';
import { RiffValleyPlaylistArtist } from 'src/festival-playlists/entities/riff-valley-playlist-artist.entity';
import { RiffValleyPlaylist } from './riff-valley-playlist.entity';

describe('RiffValleyPlaylist ORM metadata', () => {
  const metadata = getMetadataArgsStorage();

  it('maps the local domain to its physical table and enum names', () => {
    expect(metadata.tables.find((table) => table.target === RiffValleyPlaylist)?.name).toBe(
      'riff_valley_playlists',
    );
    expect(metadata.columns).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        propertyName: 'status',
        options: expect.objectContaining({ enumName: 'riff_valley_playlist_status_enum' }),
      }),
    );
    expect(metadata.columns).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        propertyName: 'type',
        options: expect.objectContaining({ enumName: 'riff_valley_playlist_type_enum' }),
      }),
    );
    expect(metadata.columns).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        propertyName: 'spotifyPlaylistId',
        options: expect.objectContaining({ name: 'spotify_playlist_id', nullable: true }),
      }),
    );
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        name: 'UQ_riff_valley_playlists_spotify_playlist_id',
      }),
    );
  });

  it('links Content through the renamed physical FK while preserving its relation ID', () => {
    expect(metadata.relations).toContainEqual(
      expect.objectContaining({
        target: Content,
        propertyName: 'riffValleyPlaylist',
      }),
    );
    expect(metadata.joinColumns).toContainEqual(
      expect.objectContaining({
        target: Content,
        propertyName: 'riffValleyPlaylist',
        name: 'riffValleyPlaylistId',
        foreignKeyConstraintName: 'FK_content_riff_valley_playlist',
      }),
    );
    expect(metadata.relations).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        propertyName: 'content',
      }),
    );
    expect(metadata.columns).toContainEqual(
      expect.objectContaining({
        target: Content,
        propertyName: 'type',
        options: expect.objectContaining({ enumName: 'content_type_enum', enum: ContentType }),
      }),
    );
    expect(metadata.relationIds).toContainEqual(
      expect.objectContaining({
        target: Content,
        propertyName: 'riffValleyPlaylistId',
      }),
    );
  });

  it('uses playlist domain names for User and artist association persistence', () => {
    expect(metadata.relations).toContainEqual(
      expect.objectContaining({
        target: User,
        propertyName: 'riffValleyPlaylists',
      }),
    );
    expect(metadata.relations).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        propertyName: 'user',
        options: expect.objectContaining({ nullable: true, onDelete: 'SET NULL' }),
      }),
    );
    expect(metadata.joinColumns).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        propertyName: 'user',
        name: 'userId',
        foreignKeyConstraintName: 'FK_riff_valley_playlists_user',
      }),
    );
    expect(metadata.relations).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylist,
        propertyName: 'playlistArtists',
      }),
    );
    expect(metadata.relations).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylistArtist,
        propertyName: 'riffValleyPlaylist',
      }),
    );
    expect(metadata.columns).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylistArtist,
        propertyName: 'riffValleyPlaylistId',
        options: expect.objectContaining({ name: 'riff_valley_playlist_id' }),
      }),
    );
    expect(metadata.tables.find((table) => table.target === RiffValleyPlaylistArtist)?.name).toBe(
      'riff_valley_playlist_artists',
    );
    expect(metadata.joinColumns).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylistArtist,
        propertyName: 'riffValleyPlaylist',
        name: 'riff_valley_playlist_id',
        foreignKeyConstraintName: 'FK_riff_valley_playlist_artists_playlist',
      }),
    );
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylistArtist,
        name: 'UQ_riff_valley_playlist_artist',
      }),
    );
    expect(metadata.indices).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylistArtist,
        name: 'IDX_riff_valley_playlist_artists_artist',
      }),
    );
    expect(metadata.columns).toContainEqual(
      expect.objectContaining({
        target: RiffValleyPlaylistArtist,
        propertyName: 'id',
        options: expect.objectContaining({
          primaryKeyConstraintName: 'PK_riff_valley_playlist_artists',
        }),
      }),
    );
  });

  it('builds TypeORM table, key, enum and index metadata matching the migrated schema', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      entities: ['src/**/*.entity.ts'],
    });
    await (dataSource as any).buildMetadatas();

    const playlist = dataSource.entityMetadatas.find(
      (entity) => entity.target === RiffValleyPlaylist,
    );
    const content = dataSource.entityMetadatas.find(
      (entity) => entity.target === Content,
    );
    const association = dataSource.entityMetadatas.find(
      (entity) => entity.target === RiffValleyPlaylistArtist,
    );

    expect(playlist.tableName).toBe('riff_valley_playlists');
    expect(playlist.primaryColumns[0].primaryKeyConstraintName).toBe(
      'PK_riff_valley_playlists',
    );
    expect(playlist.columns.find((column) => column.propertyName === 'status')).toMatchObject({
      databaseName: 'status',
      enumName: 'riff_valley_playlist_status_enum',
      enum: ['not_started', 'in_progress', 'editing', 'ready', 'published'],
    });
    expect(playlist.columns.find((column) => column.propertyName === 'type')).toMatchObject({
      enumName: 'riff_valley_playlist_type_enum',
      enum: ['festival', 'especial', 'genero', 'otras'],
    });
    expect(playlist.foreignKeys).toContainEqual(
      expect.objectContaining({
        name: 'FK_riff_valley_playlists_user',
        onDelete: 'SET NULL',
      }),
    );
    expect(playlist.uniques.map((unique) => unique.name)).toContain(
      'UQ_riff_valley_playlists_spotify_playlist_id',
    );

    expect(content.columns.map((column) => column.databaseName)).toContain(
      'riffValleyPlaylistId',
    );
    expect(content.foreignKeys).toContainEqual(
      expect.objectContaining({
        name: 'FK_content_riff_valley_playlist',
        referencedTablePath: 'riff_valley_playlists',
        onDelete: 'NO ACTION',
      }),
    );
    expect(content.uniques.map((unique) => unique.name)).toContain(
      'REL_742c2259013425196f5558b5cf',
    );
    expect(content.columns.find((column) => column.propertyName === 'type').enumName).toBe(
      'content_type_enum',
    );

    expect(association.tableName).toBe('riff_valley_playlist_artists');
    expect(association.columns.map((column) => column.databaseName)).toContain(
      'riff_valley_playlist_id',
    );
    expect(association.foreignKeys.map((foreignKey) => foreignKey.name)).toEqual(
      expect.arrayContaining([
        'FK_riff_valley_playlist_artists_playlist',
        'FK_riff_valley_playlist_artists_artist',
      ]),
    );
    expect(association.uniques.map((unique) => unique.name)).toContain(
      'UQ_riff_valley_playlist_artist',
    );
    expect(association.indices.map((index) => index.name)).toContain(
      'IDX_riff_valley_playlist_artists_artist',
    );
  });
});
