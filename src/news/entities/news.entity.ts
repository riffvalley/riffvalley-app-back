import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NewsStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum NewsType {
  VERSION = 'version',
  NEW_FEATURE = 'new_feature',
  TEAM_NOTES = 'team_notes',
}

@Entity()
export class News {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 200 })
  title: string;

  @Column('text')
  body: string;

  @Column('text', { nullable: true })
  image: string;

  @Column({ type: 'date', nullable: true })
  publishDate: Date | null;

  @Column({
    type: 'enum',
    enum: NewsType,
  })
  type: NewsType;

  @Column({
    type: 'enum',
    enum: NewsStatus,
    default: NewsStatus.DRAFT,
  })
  status: NewsStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
