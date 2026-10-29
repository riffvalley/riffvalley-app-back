import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface SavedDiscFilterCriteria {
  genreIds: string[];
  countryId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

@Entity('saved_disc_filters')
@Index('IDX_saved_disc_filters_user_id_created_at', [
  'userId',
  'createdAt',
  'id',
])
export class SavedDiscFilter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('varchar', { length: 60 })
  name: string;

  @Column('jsonb')
  filters: SavedDiscFilterCriteria;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
