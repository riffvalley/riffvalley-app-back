import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
} from 'typeorm';
import { Content } from 'src/contents/entities/content.entity';
import { User } from 'src/auth/entities/user.entity';
import { List } from 'src/lists/entities/list.entity';

export enum VideoStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  EDITING = 'editing',
  READY = 'ready',
  PUBLISHED = 'published',
}

export enum VideoType {
  BEST = 'best',
  CUSTOM = 'custom',
}

@Entity('video')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'enum', enum: VideoStatus })
  status: VideoStatus;

  @Column({ type: 'enum', enum: VideoType })
  type: VideoType;

  @Column({
    type: 'timestamp with time zone',
    name: 'fecha_actualizacion',
    nullable: true,
  })
  updateDate: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToOne(() => Content, (content) => content.video)
  content: Content;

  @ManyToOne(() => User, (user) => user.videos, { nullable: true })
  user: User;

  @ManyToOne(() => User, { nullable: true })
  editor: User;

  @ManyToOne(() => List, { nullable: true })
  list: List;
}
