import { AdministrativeRegion } from '../../administrative-regions/entities/administrative-region.entity';
import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Venue } from './venue.entity';
import { LocalityAlias } from './locality-alias.entity';

@Entity('localities')
@Index(
  'UQ_localities_geographic_identity',
  ['administrativeRegionId', 'provinceNormalized', 'nameNormalized'],
  { unique: true },
)
@Index('UQ_localities_osm_reference', ['osmType', 'osmId'], { unique: true })
@Check(
  'CHK_localities_coordinates_pair',
  '("latitude" IS NULL) = ("longitude" IS NULL)',
)
@Check(
  'CHK_localities_latitude_range',
  '"latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90)',
)
@Check(
  'CHK_localities_longitude_range',
  '"longitude" IS NULL OR ("longitude" BETWEEN -180 AND 180)',
)
@Check(
  'CHK_localities_osm_reference_pair',
  '("osm_type" IS NULL) = ("osm_id" IS NULL)',
)
export class Locality {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 150 })
  name: string;

  @Column({ name: 'name_normalized', type: 'varchar', length: 180 })
  nameNormalized: string;

  @Column('varchar', { length: 150, nullable: true })
  province: string | null;

  @Column({
    name: 'province_normalized',
    type: 'varchar',
    length: 180,
    default: '',
  })
  provinceNormalized: string;

  @Column({ name: 'administrative_region_id', type: 'uuid' })
  administrativeRegionId: string;

  @Column('double precision', { nullable: true })
  latitude: number | null;

  @Column('double precision', { nullable: true })
  longitude: number | null;

  @Column({ name: 'osm_type', type: 'varchar', length: 16, nullable: true })
  osmType: string | null;

  @Column({ name: 'osm_id', type: 'varchar', length: 32, nullable: true })
  osmId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => AdministrativeRegion, (region) => region.localities, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'administrative_region_id' })
  administrativeRegion: AdministrativeRegion;

  @OneToMany(() => Venue, (venue) => venue.locality)
  venues: Venue[];

  @OneToMany(() => LocalityAlias, (alias) => alias.locality)
  aliases: LocalityAlias[];
}
