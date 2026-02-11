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

export enum ArticleStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  EDITING = 'editing',
  READY = 'ready',
  PUBLISHED = 'published',
}

export enum ArticleType {
  CRONICA = 'cronica',
  FESTIVAL = 'festival',
  REVIEW = 'review',
  ENTREVISTA = 'entrevista',
  ARTICULO = 'articulo',
}

@Entity('article')
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'enum', enum: ArticleStatus })
  status: ArticleStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  link?: string;

  @Column({ type: 'enum', enum: ArticleType })
  type: ArticleType;

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

  @OneToOne(() => Content, (content) => content.article)
  content: Content;

  @ManyToOne(() => User, (user) => user.articles, { nullable: true })
  user: User;

  @ManyToOne(() => User, { nullable: true })
  editor: User;
}
