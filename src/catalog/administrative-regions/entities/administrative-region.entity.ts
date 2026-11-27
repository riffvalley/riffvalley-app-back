import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Country } from '../../countries/entities/country.entity';
import { Locality } from '../../venues/entities/locality.entity';

@Entity('administrative_regions')
@Index(
  'UQ_administrative_regions_country_name_normalized',
  ['countryId', 'nameNormalized'],
  { unique: true },
)
@Index('UQ_administrative_regions_country_code', ['countryId', 'code'], {
  unique: true,
})
export class AdministrativeRegion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 150 })
  name: string;

  @Column({ name: 'name_normalized', type: 'varchar', length: 180 })
  nameNormalized: string;

  @Column('varchar', { length: 32, nullable: true })
  code: string | null;

  @Column({ name: 'country_id', type: 'uuid' })
  countryId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Country, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'country_id' })
  country: Country;

  @OneToMany(() => Locality, (locality) => locality.administrativeRegion)
  localities: Locality[];
}
