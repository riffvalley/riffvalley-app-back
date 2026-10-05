import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Content } from 'src/contents/entities/content.entity';
import { User } from 'src/auth/entities/user.entity';
import { RiffValleyPlaylistArtist } from 'src/festival-playlists/entities/riff-valley-playlist-artist.entity';

export enum RiffValleyPlaylistStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  EDITING = 'editing',
  READY = 'ready',
  PUBLISHED = 'published',
}

export enum RiffValleyPlaylistType {
  FESTIVAL = 'festival',
  ESPECIAL = 'especial',
  GENERO = 'genero',
  OTRAS = 'otras',
}

@Entity('riff_valley_playlists')
@Unique('UQ_riff_valley_playlists_spotify_playlist_id', ['spotifyPlaylistId'])
export class RiffValleyPlaylist {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_riff_valley_playlists',
  })
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({
    type: 'enum',
    enum: RiffValleyPlaylistStatus,
    enumName: 'riff_valley_playlist_status_enum',
  })
  status: RiffValleyPlaylistStatus;

  @Column({ type: 'varchar', length: 500 })
  link: string;

  @Column({
    name: 'spotify_playlist_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  spotifyPlaylistId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  @Column({
    name: 'protected_track_uris',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  protectedTrackUris: string[];

  @Column({
    type: 'enum',
    enum: RiffValleyPlaylistType,
    enumName: 'riff_valley_playlist_type_enum',
  })
  type: RiffValleyPlaylistType;

  @Column({
    type: 'timestamp with time zone',
    name: 'fecha_actualizacion',
  })
  updateDate: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToOne(() => Content, (content) => content.riffValleyPlaylist)
  content: Content;

  @ManyToOne(() => User, (user) => user.riffValleyPlaylists, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_riff_valley_playlists_user',
  })
  user: User;

  @OneToMany(() => RiffValleyPlaylistArtist, (item) => item.riffValleyPlaylist, {
    cascade: true,
  })
  playlistArtists: RiffValleyPlaylistArtist[];

  /** Se rellena explícitamente en los listados sin cargar toda la relación. */
  playlistArtistsCount?: number;
}
