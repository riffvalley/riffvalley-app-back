import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Locality } from './locality.entity';

export type LocalityAliasKind = 'linguistic' | 'alternate';

@Entity('locality_aliases')
@Index('UQ_locality_aliases_locality_name', ['localityId', 'normalizedName'], {
  unique: true,
})
@Index('IDX_locality_aliases_normalized_name', ['normalizedName'])
@Check('CHK_locality_aliases_kind', `"kind" IN ('linguistic', 'alternate')`)
export class LocalityAlias {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'locality_id', type: 'uuid' })
  localityId: string;

  @Column('varchar', { length: 150 })
  name: string;

  @Column({ name: 'normalized_name', type: 'varchar', length: 180 })
  normalizedName: string;

  @Column('varchar', { length: 16, nullable: true })
  language: string | null;

  @Column('varchar', { length: 16, default: 'alternate' })
  kind: LocalityAliasKind;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Locality, (locality) => locality.aliases, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'locality_id' })
  locality: Locality;
}
