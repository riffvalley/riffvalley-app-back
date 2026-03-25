import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Disc } from '../../discs/entities/disc.entity';

export enum DiscType {
  SINGLE = 'single',
  EP = 'ep',
  ALBUM = 'album',
}

@Entity('national_release')
export class NationalRelease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  artistName: string;

  @Column('varchar', { length: 100 })
  discName: string;

  @Column({ type: 'enum', enum: DiscType })
  discType: DiscType;

  @Column('varchar', { length: 100 })
  genre: string;

  @Column({ type: 'date' })
  releaseDay: Date;

  @Column({ type: 'date', nullable: true })
  publishAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  link: string | null;

  @Column({ type: 'boolean', default: false })
  approved: boolean;

  @Column({ type: 'uuid', nullable: true })
  discId: string | null;

  @ManyToOne(() => Disc, { nullable: true, eager: false })
  @JoinColumn({ name: 'discId' })
  disc: Disc | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
