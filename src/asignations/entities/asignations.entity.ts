import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/discs/entities/disc.entity';
import { List } from 'src/lists/entities/list.entity';

@Entity()
export class Asignation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('boolean', { nullable: true })
  done: boolean = false;

  @ManyToOne(() => User, (user) => user.asignations, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  user: User;

  @ManyToOne(() => Disc, (disc) => disc.asignations, {
    onDelete: 'CASCADE',
    eager: true,
    nullable: true,
  })
  disc: Disc;

  @ManyToOne(() => List, (list) => list.asignations, { onDelete: 'CASCADE' })
  list: List;

  @Column('int', { nullable: true })
  position: number;

  @Column('text', { nullable: true })
  description: string;
}
