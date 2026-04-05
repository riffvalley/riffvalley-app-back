import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { VersionItem } from '../../versions/entities/version-item.entity';

export enum SuggestionStatus {
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  REJECTED = 'rejected',
}

export enum SuggestionPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('suggestion')
export class Suggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 200 })
  title: string;

  @Column('text')
  description: string;

  @Column({ type: 'enum', enum: SuggestionStatus, default: SuggestionStatus.IN_PROGRESS })
  status: SuggestionStatus;

  @Column({ type: 'enum', enum: SuggestionPriority, default: SuggestionPriority.MEDIUM })
  priority: SuggestionPriority;

  @Column('text', { nullable: true })
  rejectionReason: string | null;

  @Column({ nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ nullable: true })
  versionItemId: string | null;

  @ManyToOne(() => VersionItem, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'versionItemId' })
  versionItem: VersionItem | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
