import { Asignation } from 'src/asignations/entities/asignations.entity';
import { Comment } from 'src/comments/entities/comment.entity';
import { Favorite } from 'src/favorites/entities/favorite.entity';
import { Pending } from 'src/pendings/entities/pending.entity';
import { Rate } from 'src/rates/entities/rate.entity';
import { Spotify } from 'src/spotify/entities/spotify.entity';
import { Article } from 'src/articles/entities/article.entity';
import { Video } from 'src/videos/entities/video.entity';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column('text', { unique: true, select: false })
  email: string;

  @Column('text', { select: false })
  password: string;

  @Column('text', { unique: true })
  username: string;

  @Column('bool', {
    default: true,
  })
  isActive: boolean;

  @Column('text', {
    array: true,
    select: false,
    default: ['user'],
  })
  roles: string[];

  @Column('text', { nullable: true })
  image: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column('text', { nullable: true })
  notes: string;

  @OneToMany(() => Rate, (rate) => rate.user, { cascade: true })
  rate: Rate;

  @OneToMany(() => Favorite, (favorite) => favorite.user, { cascade: true })
  favorite: Favorite;

  @OneToMany(() => Pending, (pending) => pending.user, { cascade: true })
  pending: Pending;

  @OneToMany(() => Comment, (comment) => comment.user, { cascade: true })
  comments: Comment[];

  @OneToMany(() => Asignation, (asignation) => asignation.user, {
    cascade: true,
  })
  asignations: Asignation[];

  @OneToMany(() => Spotify, (spotify) => spotify.user, { cascade: true })
  spotify: Spotify[];

  @OneToMany(() => Article, (article) => article.user, { cascade: true })
  articles: Article[];

  @OneToMany(() => Video, (video) => video.user, { cascade: true })
  videos: Video[];

  @BeforeInsert()
  checkFieldsBeforeInsert() {
    if (this.email) {
      this.email = this.email.toLowerCase().trim();
    }
  }

  @BeforeUpdate()
  checkFieldsBeforeUpdate() {
    this.checkFieldsBeforeInsert();
  }
}
