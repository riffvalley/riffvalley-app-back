import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Point } from 'src/points/entities/point.entity';

@Entity('reunions')
export class Reunion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  titulo: string;

  @Column({ name: 'date', type: 'timestamp' })
  fecha: Date;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @OneToMany(() => Point, (point) => point.reunion, { cascade: true })
  points: Point[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
