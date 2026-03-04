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

export enum SpotifyStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  EDITING = 'editing',
  READY = 'ready',
  PUBLISHED = 'published',
}

export enum SpotifyType {
  FESTIVAL = 'festival',
  ESPECIAL = 'especial',
  GENERO = 'genero',
  OTRAS = 'otras',
}

@Entity('spotify')
export class Spotify {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'enum', enum: SpotifyStatus })
  status: SpotifyStatus;

  @Column({ type: 'varchar', length: 500 })
  link: string;

  @Column({ type: 'enum', enum: SpotifyType })
  type: SpotifyType;

  @Column({ type: 'timestamp with time zone', name: 'fecha_actualizacion' })
  updateDate: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToOne(() => Content, (content) => content.spotify)
  content: Content;

  @ManyToOne(() => User, (user) => user.spotify, { nullable: true, onDelete: 'SET NULL' })
  user: User;
}
