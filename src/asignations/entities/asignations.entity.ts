import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/discs/entities/disc.entity';
import { List } from 'src/lists/entities/list.entity';

@Entity()
export class Asignation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('boolean', { nullable: true })
  done: boolean = false;

  @ManyToOne(() => User, (user) => user.asignations, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  user: User;

  @ManyToOne(() => Disc, (disc) => disc.asignations, {
    onDelete: 'CASCADE',
    eager: true,
    nullable: true,
  })
  disc: Disc;

  @ManyToOne(() => List, (list) => list.asignations, { onDelete: 'CASCADE' })
  list: List;

  @Column('int', { nullable: true })
  position: number;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { nullable: true })
  similarBands: string;

  // Id exacto de la pista de Spotify a embeber en el post, elegida a mano
  // (ver GET /discs/:id/spotify-tracks). Si no hay ninguno, se usa la
  // selección automática de siempre (single del artista / 3er track).
  @Column('varchar', { length: 32, nullable: true })
  spotifyTrackId: string;
}
