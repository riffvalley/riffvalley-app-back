import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('spotify_connections')
export class SpotifyConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'connection_key',
    type: 'varchar',
    length: 50,
    unique: true,
  })
  connectionKey: string;

  @Column({ name: 'spotify_user_id', type: 'text', nullable: true })
  spotifyUserId: string | null;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName: string | null;

  @Column({ name: 'access_token', type: 'text', nullable: true, select: false })
  accessToken: string | null;

  @Column({
    name: 'refresh_token',
    type: 'text',
    nullable: true,
    select: false,
  })
  refreshToken: string | null;

  @Column({ type: 'text', nullable: true })
  scope: string | null;

  @Column({
    name: 'expires_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  expiresAt: Date | null;

  @Column({
    name: 'authorized_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  authorizedAt: Date | null;

  @Column({
    name: 'refresh_token_expires_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  refreshTokenExpiresAt: Date | null;

  @Column({
    name: 'authorization_invalidated_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  authorizationInvalidatedAt: Date | null;

  @Column({
    name: 'reauthorization_reminder_sent_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  reauthorizationReminderSentAt: Date | null;

  @Column({
    name: 'oauth_state_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  oauthStateHash: string | null;

  @Column({
    name: 'oauth_state_expires_at',
    type: 'timestamp with time zone',
    nullable: true,
    select: false,
  })
  oauthStateExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
