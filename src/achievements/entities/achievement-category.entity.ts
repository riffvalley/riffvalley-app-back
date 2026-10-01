import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Achievement } from './achievement.entity';

// Catálogo de categorías: organización semántica/presentación y filtrado
// del catálogo de logros. NUNCA participa en el cálculo del evaluator
// (eso depende solo de metricType + genre + criteria, ver AchievementsEvaluatorService).
@Entity()
export class AchievementCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  code: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { nullable: true })
  icon: string;

  @Column('int', { default: 0 })
  sortOrder: number;

  @Column('bool', { default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Achievement, (achievement) => achievement.category)
  achievements: Achievement[];
}
