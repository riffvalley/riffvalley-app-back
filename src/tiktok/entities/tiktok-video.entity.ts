import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tiktok_video')
export class TiktokVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('varchar', { length: 100 })
  tiktokVideoId: string;

  @Column('text', { nullable: true })
  title: string | null;

  @Column('text', { nullable: true })
  videoDescription: string | null;

  @Column('text', { nullable: true })
  coverImageUrl: string | null;

  @Column('text', { nullable: true })
  embedLink: string | null;

  @Column('text', { nullable: true })
  embedHtml: string | null;

  @Column('int', { nullable: true })
  duration: number | null;

  @Column('int', { nullable: true })
  viewCount: number | null;

  @Column('int', { nullable: true })
  likeCount: number | null;

  @Column('int', { nullable: true })
  commentCount: number | null;

  @Column('int', { nullable: true })
  shareCount: number | null;

  @Column({ type: 'timestamp' })
  tiktokCreateTime: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
