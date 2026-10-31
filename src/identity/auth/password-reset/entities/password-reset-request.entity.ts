import { User } from '../../../auth/entities/user.entity';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  RelationId,
} from 'typeorm';

export type PasswordResetRequestStatus =
  | 'pending_delivery'
  | 'active'
  | 'consumed'
  | 'invalidated'
  | 'failed';

@Entity('auth_password_reset_requests')
@Check(
  'CHK_auth_password_reset_requests_status',
  `"status" IN ('pending_delivery', 'active', 'consumed', 'invalidated', 'failed')`,
)
@Check(
  'CHK_auth_password_reset_requests_hash_length',
  'octet_length("token_hash") = 32',
)
@Index('UQ_auth_password_reset_requests_token_hash', ['tokenHash'], {
  unique: true,
})
@Index('IDX_auth_password_reset_requests_user_status', ['user', 'status'])
@Index('IDX_auth_password_reset_requests_expires_at', ['expiresAt'])
@Index('UQ_auth_password_reset_requests_current_per_user', ['user'], {
  unique: true,
  where: `"status" IN ('pending_delivery', 'active')`,
})
export class PasswordResetRequest {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_auth_password_reset_requests_user',
  })
  user: User;

  @RelationId((request: PasswordResetRequest) => request.user)
  userId: string;

  @Column('bytea', { name: 'token_hash' })
  tokenHash: Buffer;

  @Column('text', { name: 'status', default: 'pending_delivery' })
  status: PasswordResetRequestStatus;

  @CreateDateColumn({
    name: 'requested_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  requestedAt: Date;

  @Column('timestamptz', { name: 'activated_at', nullable: true })
  activatedAt: Date | null;

  @Column('timestamptz', { name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @Column('timestamptz', { name: 'consumed_at', nullable: true })
  consumedAt: Date | null;

  @Column('timestamptz', { name: 'invalidated_at', nullable: true })
  invalidatedAt: Date | null;
}
