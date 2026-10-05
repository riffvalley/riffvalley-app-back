import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { RiffValleyPlaylist } from 'src/riff-valley-playlists/entities/riff-valley-playlist.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PlaylistArtistSyncStatus {
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed',
}

export enum PlaylistArtistSelectionMode {
  SETLIST = 'setlist',
  MANUAL = 'manual',
}

export interface PlaylistTrackRecord {
  spotifyTrackId: string;
  uri: string;
  name: string;
  url: string;
  plays: number;
  artists?: Array<{ id: string; name: string }>;
  album?: string;
  imageUrl?: string | null;
  durationMs?: number;
}

@Entity('riff_valley_playlist_artists')
@Index('IDX_riff_valley_playlist_artists_artist', ['artistId'])
@Unique('UQ_riff_valley_playlist_artist', ['riffValleyPlaylistId', 'artistId'])
export class RiffValleyPlaylistArtist {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_riff_valley_playlist_artists',
  })
  id: string;

  @Column({ name: 'riff_valley_playlist_id', type: 'uuid' })
  riffValleyPlaylistId: string;

  @ManyToOne(() => RiffValleyPlaylist, (playlist) => playlist.playlistArtists, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'riff_valley_playlist_id',
    foreignKeyConstraintName: 'FK_riff_valley_playlist_artists_playlist',
  })
  riffValleyPlaylist: RiffValleyPlaylist;

  @Column({ name: 'artist_id', type: 'uuid' })
  artistId: string;

  @ManyToOne(() => Artist, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'artist_id',
    foreignKeyConstraintName: 'FK_riff_valley_playlist_artists_artist',
  })
  artist: Artist;

  @Column({ type: 'varchar', length: 20 })
  status: PlaylistArtistSyncStatus;

  @Column({
    name: 'selection_mode',
    type: 'varchar',
    length: 20,
    default: PlaylistArtistSelectionMode.SETLIST,
  })
  selectionMode: PlaylistArtistSelectionMode;

  @Column({
    name: 'spotify_artist_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  spotifyArtistId: string | null;

  @Column({ name: 'setlists_analyzed', type: 'int', default: 0 })
  setlistsAnalyzed: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tracks: PlaylistTrackRecord[];

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
