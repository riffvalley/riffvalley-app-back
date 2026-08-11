import { Asignation } from 'src/asignations/entities/asignations.entity';
import { Link } from 'src/links/entities/links.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

export enum ListType {
  MONTH = 'month',
  WEEK = 'week',
  SPECIAL = 'special',
  VIDEO = 'video',
}

export enum SpecialListType {
  WEB = 'web',
  APP = 'app',
  NOTICIAS = 'noticias',
  VIDEOS = 'videos',
  RIFF_VALLEY = 'riffValley',
  OTROS = 'otros',
}

export enum ListStatus {
  NEW = 'new',
  ASSIGNED = 'assigned',
  COMPLETED = 'completed',
  REVISED = 'revised',
  WITH_IMAGE = 'withimage',
  SCHEDULED = 'scheduled',
  WEB_PUBLISHED = 'webpublished',
  SOCIAL_MEDIA_PUBLISHED = 'smpublished',
}

export interface PublishedDiscRecord {
  discId: string;
  artist: string;
  name: string;
}

export interface PublishedWeeklyPostRecord {
  position: number;
  wpPostId: number;
  wpPostUrl: string;
  publishedDiscs: PublishedDiscRecord[];
}

@Entity()
export class List {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: ListType,
  })
  type: ListType;

  @Column({
    type: 'enum',
    enum: ListStatus,
    nullable: true,
  })
  status?: ListStatus;

  @Column({
    type: 'enum',
    enum: SpecialListType,
    nullable: true,
  })
  specialType?: SpecialListType;

  @Column({ type: 'boolean', default: false, nullable: true })
  free: boolean;

  @Column({ type: 'timestamp', nullable: true })
  listDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  releaseDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  closeDate?: Date;

  @Column({ type: 'int', nullable: true })
  wpPostId?: number;

  @Column({ type: 'text', nullable: true })
  wpPostUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  wpPublishedDiscs?: PublishedDiscRecord[];

  @Column({ type: 'jsonb', nullable: true })
  wpWeeklyPosts?: PublishedWeeklyPostRecord[];

  @OneToMany(() => Asignation, (asignation) => asignation.list, {
    cascade: true,
    eager: true,
  })
  asignations: Asignation[];

  @OneToMany(() => Link, (link) => link.list, {
    cascade: true,
    eager: true,
  })
  links: Link[];
}
