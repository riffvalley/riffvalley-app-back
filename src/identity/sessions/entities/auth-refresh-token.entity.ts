import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  Unique,
} from 'typeorm';
import { AuthSession } from './auth-session.entity';

@Entity('auth_refresh_tokens')
@Index('UQ_auth_refresh_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_auth_refresh_tokens_session_consumed', ['session', 'consumedAt'])
@Index('UQ_auth_refresh_tokens_one_unconsumed_per_session', ['session'], {
  unique: true,
  where: '"consumed_at" IS NULL',
})
@Unique('UQ_auth_refresh_tokens_replaced_by', ['replacedBy'])
export class AuthRefreshToken {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_auth_refresh_tokens',
  })
  id: string;

  @ManyToOne(() => AuthSession, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'session_id',
    foreignKeyConstraintName: 'FK_auth_refresh_tokens_session',
  })
  session: AuthSession;

  @RelationId((refreshToken: AuthRefreshToken) => refreshToken.session)
  sessionId: string;

  @Column('bytea', { name: 'token_hash' })
  tokenHash: Buffer;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column('timestamptz', { name: 'consumed_at', nullable: true })
  consumedAt: Date | null;

  @Column('bytea', { name: 'operation_key_hash', nullable: true })
  operationKeyHash: Buffer | null;

  @ManyToOne(() => AuthRefreshToken, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'replaced_by_id',
    foreignKeyConstraintName: 'FK_auth_refresh_tokens_successor',
  })
  replacedBy: AuthRefreshToken | null;

  @RelationId((refreshToken: AuthRefreshToken) => refreshToken.replacedBy)
  replacedById: string | null;
}
