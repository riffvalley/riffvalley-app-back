import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Version } from './version.entity';
import { User } from '../../auth/entities/user.entity';

export enum ChangeType {
  FEAT = 'feat',
  FIX = 'fix',
  DOCS = 'docs',
  STYLE = 'style',
  REFACTOR = 'refactor',
  PERF = 'perf',
  TEST = 'test',
  BUILD = 'build',
  CI = 'ci',
  CHORE = 'chore',
  REVERT = 'revert',
}

export enum DevState {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  DONE = 'done',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  SUGGESTION = 'suggestion'
}

@Entity()
export class VersionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ChangeType })
  type: ChangeType;

  @Column('text')
  description: string;

  @Column('varchar', { length: 100, nullable: true })
  scope?: string;

  @Column({ type: 'enum', enum: Priority, default: Priority.MEDIUM })
  priority: Priority;

  @Column({ type: 'varchar', length: 200, nullable: false })
  branch: string;

  @Index()
  @Column({ type: 'enum', enum: DevState, default: DevState.TODO })
  state: DevState;

  @ManyToOne(() => Version, (version) => version.items, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  version: Version;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'backUserId' })
  backUser?: User;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'frontUserId' })
  frontUser?: User;
}
