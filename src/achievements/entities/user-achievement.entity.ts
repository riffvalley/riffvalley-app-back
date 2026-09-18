import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Achievement } from './achievement.entity';

@Entity()
@Unique(['user', 'achievement'])
export class UserAchievement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Achievement, { eager: true, onDelete: 'CASCADE' })
  achievement: Achievement;

  // null = en progreso, no desbloqueado. Una vez seteado, nunca se revierte
  // aunque el progreso caiga después (ver AchievementsEvaluatorService).
  @Column({ type: 'timestamp', nullable: true })
  unlockedAt: Date | null;

  @Column('int', { default: 0 })
  progressValue: number;

  @Column('jsonb', { nullable: true })
  progressMeta: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
