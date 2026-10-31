import { PasswordResetRequest } from './password-reset-request.entity';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  RelationId,
} from 'typeorm';

export type PasswordResetOutboxStatus =
  | 'queued'
  | 'leased'
  | 'delivered'
  | 'failed'
  | 'cancelled';

@Entity('auth_password_reset_outbox')
@Check(
  'CHK_auth_password_reset_outbox_status',
  `"status" IN ('queued', 'leased', 'delivered', 'failed', 'cancelled')`,
)
@Check('CHK_auth_password_reset_outbox_attempt_count', '"attempt_count" >= 0')
@Index('UQ_auth_password_reset_outbox_request', ['request'], { unique: true })
@Index('IDX_auth_password_reset_outbox_ready', ['status', 'availableAt'])
export class PasswordResetOutbox {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @OneToOne(() => PasswordResetRequest, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'request_id',
    foreignKeyConstraintName: 'FK_auth_password_reset_outbox_request',
  })
  request: PasswordResetRequest;

  @RelationId((outbox: PasswordResetOutbox) => outbox.request)
  requestId: string;

  @Column('text', { name: 'status', default: 'queued' })
  status: PasswordResetOutboxStatus;

  @Column('integer', { name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column('timestamptz', {
    name: 'available_at',
    default: () => 'now()',
  })
  availableAt: Date;

  @Column('timestamptz', { name: 'locked_until', nullable: true })
  lockedUntil: Date | null;

  @Column('timestamptz', { name: 'delivered_at', nullable: true })
  deliveredAt: Date | null;

  @Column('timestamptz', { name: 'failed_at', nullable: true })
  failedAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;
}
