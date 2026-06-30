import { Country } from '../../countries/entities/country.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum LocationType {
  VENUE = 'venue',
  CITY = 'city',
}

@Entity()
export class Localizacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 200 })
  name: string;

  @Column({ type: 'enum', enum: LocationType, default: LocationType.VENUE })
  type: LocationType;

  @Column('varchar', { length: 300, nullable: true })
  address: string;

  @Column('varchar', { length: 100 })
  city: string;

  @Column({ nullable: true })
  countryId: string;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  longitude: number;

  @ManyToOne(() => Country, { eager: true, nullable: true })
  @JoinColumn({ name: 'countryId' })
  country: Country;
}
