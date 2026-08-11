import { Artist } from 'src/artists/entities/artist.entity';
import { Spotify } from 'src/spotify/entities/spotify.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum PlaylistArtistSyncStatus {
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed',
}

export interface PlaylistTrackRecord {
  spotifyTrackId: string;
  uri: string;
  name: string;
  url: string;
  plays: number;
}

@Entity('spotify_playlist_artists')
@Unique('UQ_spotify_playlist_artist', ['spotifyId', 'artistId'])
export class SpotifyPlaylistArtist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'spotify_id', type: 'uuid' })
  spotifyId: string;

  @ManyToOne(() => Spotify, (spotify) => spotify.playlistArtists, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'spotify_id' })
  spotify: Spotify;

  @Column({ name: 'artist_id', type: 'uuid' })
  artistId: string;

  @ManyToOne(() => Artist, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'artist_id' })
  artist: Artist;

  @Column({ type: 'varchar', length: 20 })
  status: PlaylistArtistSyncStatus;

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
