import { Disc } from '../../discs/entities/disc.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Genre {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 50 })
  name: string;

  @Column('varchar', { nullable: true })
  color: string;

  @OneToMany(() => Disc, (disc) => disc.genre)
  disc: Disc[];
}
