import { Artist } from '../../artists/entities/artist.entity';
import { Rate } from '../../rates/entities/rate.entity';
import { Genre } from '../../genres/entities/genre.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Asignation } from '../../asignations/entities/asignations.entity';
import { Favorite } from '../../favorites/entities/favorite.entity';
import { Pending } from '../../pendings/entities/pending.entity';
import { Comment } from '../../comments/entities/comment.entity';

@Entity()
export class Disc {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { nullable: true })
  image: string;

  @Column('boolean', { nullable: true })
  verified: boolean = false;

  @Column('boolean', { nullable: true })
  ep: boolean = false;

  @Column('boolean', { nullable: true })
  debut: boolean = false;

  @Column('varchar', { length: 255, nullable: true })
  link: string;

  @Column({ type: 'date', nullable: true })
  releaseDate: Date | null;

  @Column('boolean', { nullable: true })
  featured: boolean = false;

  @ManyToOne(() => Artist, (artist) => artist.disc, { eager: true })
  artist: Artist;

  @ManyToOne(() => Genre, (genre) => genre.disc, { eager: true })
  genre: Genre;

  @OneToMany(() => Rate, (rate) => rate.disc)
  rates: Rate[];

  @OneToMany(() => Favorite, (favorite) => favorite.disc, { eager: true })
  favorites: Favorite[];

  @OneToMany(() => Pending, (pending) => pending.disc, { eager: true })
  pendings: Pending[];

  @OneToMany(() => Asignation, (asignation) => asignation.disc)
  asignations: Asignation[];

  @OneToMany(() => Comment, (comment) => comment.disc, { eager: true })
  comments: Comment[];
}
