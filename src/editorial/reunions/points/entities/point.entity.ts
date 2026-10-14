import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';

@Entity('points') // Nombre de la tabla en plural
export class Point {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text', nullable: true }) // Cambia jsonb a text
  content: string; // Ahora almacenará HTML en lugar de JSON

  @ManyToOne(() => Reunion, (reunion) => reunion.points, {
    onDelete: 'CASCADE',
  })
  reunion: Reunion; // Relación muchos a uno con la entidad Reunion

  @CreateDateColumn()
  createdAt: Date; // Fecha de creación automática

  @Column('boolean', { nullable: true })
  done: boolean = false;
}
