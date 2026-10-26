import { User } from '../../../identity/auth/entities/user.entity';
import { Disc } from '../../../catalog/discs/entities/disc.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RateVoteEventType = 'set' | 'change';

@Entity('rate_vote_events')
@Index('IDX_rate_vote_events_user_occurred_at', ['userId', 'occurredAt'])
@Index('IDX_rate_vote_events_occurred_at', ['occurredAt'])
export class RateVoteEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @CreateDateColumn({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt: Date;

  @Column('varchar', { name: 'event_type', length: 16 })
  eventType: RateVoteEventType;

  @Column('uuid', { name: 'disc_id', nullable: true })
  discId: string | null;

  @Column('decimal', {
    name: 'previous_value',
    precision: 4,
    scale: 2,
    nullable: true,
  })
  previousValue: number | null;

  @Column('decimal', {
    name: 'new_value',
    precision: 4,
    scale: 2,
    nullable: true,
  })
  newValue: number | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_rate_vote_events_user',
  })
  user: User;

  @ManyToOne(() => Disc, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'disc_id',
    foreignKeyConstraintName: 'FK_rate_vote_events_disc',
  })
  disc: Disc | null;
}
