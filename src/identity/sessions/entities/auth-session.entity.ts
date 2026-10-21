import { User } from '../../auth/entities/user.entity';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

export type SessionClientType = 'app' | 'wiki';

@Entity('auth_sessions')
@Check('CHK_auth_sessions_client_type', "\"client_type\" IN ('app', 'wiki')")
@Check(
  'CHK_auth_sessions_expiration_after_creation',
  '"expires_at" > "created_at"',
)
@Index('IDX_auth_sessions_user_client_revoked', [
  'user',
  'clientType',
  'revokedAt',
])
@Index('IDX_auth_sessions_expires_at', ['expiresAt'])
@Index('IDX_auth_sessions_revoked_at', ['revokedAt'], {
  where: '"revoked_at" IS NOT NULL',
})
export class AuthSession {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_auth_sessions',
  })
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_auth_sessions_user',
  })
  user: User;

  @RelationId((session: AuthSession) => session.user)
  userId: string;

  @Column('text', { name: 'client_type' })
  clientType: SessionClientType;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt: Date;

  @Column('timestamptz', { name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column('timestamptz', { name: 'last_activity_at', default: () => 'now()' })
  lastActivityAt: Date;
}
