import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Locality } from './locality.entity';

export const VENUE_TYPES = [
  'concert_hall',
  'arena',
  'stadium',
  'theater',
  'outdoor',
  'festival_ground',
  'bar_pub',
  'other',
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const VENUE_STATUSES = ['active', 'closed', 'temporary'] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];

@Entity('venues')
@Index('UQ_venues_locality_name_normalized', ['localityId', 'nameNormalized'], {
  unique: true,
  where: '"is_generic" = false',
})
@Index('UQ_venues_generic_locality', ['localityId'], {
  unique: true,
  where: '"is_generic" = true',
})
@Index('IDX_venues_name_normalized', ['nameNormalized'])
@Index('IDX_venues_type_status', ['type', 'status'])
@Check('CHK_venues_capacity_positive', '"capacity" IS NULL OR "capacity" > 0')
@Check(
  'CHK_venues_type',
  `"type" IN ('concert_hall', 'arena', 'stadium', 'theater', 'outdoor', 'festival_ground', 'bar_pub', 'other')`,
)
@Check('CHK_venues_status', `"status" IN ('active', 'closed', 'temporary')`)
@Check(
  'CHK_venues_generic_without_physical_coordinates',
  'NOT "is_generic" OR ("latitude" IS NULL AND "longitude" IS NULL)',
)
@Check(
  'CHK_venues_coordinates_pair',
  '("latitude" IS NULL) = ("longitude" IS NULL)',
)
@Check(
  'CHK_venues_latitude_range',
  '"latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90)',
)
@Check(
  'CHK_venues_longitude_range',
  '"longitude" IS NULL OR ("longitude" BETWEEN -180 AND 180)',
)
export class Venue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 180 })
  name: string;

  @Column({ name: 'name_normalized', type: 'varchar', length: 220 })
  nameNormalized: string;

  @Column('varchar', { length: 32 })
  type: VenueType;

  @Column('varchar', { length: 16, default: 'active' })
  status: VenueStatus;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('integer', { nullable: true })
  capacity: number | null;

  @Column('varchar', { length: 2048, nullable: true })
  website: string | null;

  @Column('text', { nullable: true })
  image: string | null;

  @Column('text', { nullable: true })
  accessibility: string | null;

  @Column('varchar', { length: 255, nullable: true })
  address: string | null;

  @Column({ name: 'locality_id', type: 'uuid' })
  localityId: string;

  @Column({ name: 'is_generic', type: 'boolean', default: false })
  isGeneric: boolean;

  @Column('double precision', { nullable: true })
  latitude: number | null;

  @Column('double precision', { nullable: true })
  longitude: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Locality, (locality) => locality.venues, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'locality_id' })
  locality: Locality;
}
