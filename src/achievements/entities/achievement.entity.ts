import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Genre } from '../../genres/entities/genre.entity';
import { AchievementMetricType } from '../enums/achievement-metric-type.enum';
import { UserAchievement } from './user-achievement.entity';

@Entity()
export class Achievement {
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

  @Column({ type: 'enum', enum: AchievementMetricType })
  metricType: AchievementMetricType;

  // Solo lo que NO es clasificación (umbrales, modo, etc.). El género vive
  // en la relación `genre` de abajo, nunca duplicado aquí.
  @Column('jsonb')
  criteria: Record<string, unknown>;

  // Clasificación semántica opcional. RESTRICT: un género con logros
  // asociados no puede borrarse (evita dejar un DISTINCT_ARTISTS_IN_GENRE
  // huérfano y con apariencia de logro genérico).
  @ManyToOne(() => Genre, { nullable: true, eager: true, onDelete: 'RESTRICT' })
  genre: Genre | null;

  @Column('int', { default: 0 })
  points: number;

  @Column('bool', { default: false })
  secret: boolean;

  // Soft-delete: los logros ya obtenidos por usuarios nunca se borran
  // físicamente, solo se desactivan (dejan de evaluarse / salir en el catálogo activo).
  @Column('bool', { default: true })
  active: boolean;

  @Column('int', { default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(
    () => UserAchievement,
    (userAchievement) => userAchievement.achievement,
  )
  userAchievements: UserAchievement[];
}
