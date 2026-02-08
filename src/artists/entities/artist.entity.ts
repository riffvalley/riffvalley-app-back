import { Country } from '../../countries/entities/country.entity';
import { Disc } from '../../discs/entities/disc.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Artist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column({ name: 'name_normalized', type: 'text' })
  nameNormalized: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { nullable: true })
  image: string;

  @Column({ nullable: true })
  countryId: string;

  @ManyToOne(() => Country, (country) => country.artist, {
    eager: true,
    nullable: true,
  })
  @JoinColumn({ name: 'countryId' })
  country: Country;

  @OneToMany(() => Disc, (disc) => disc.artist)
  disc: Disc[];
}
