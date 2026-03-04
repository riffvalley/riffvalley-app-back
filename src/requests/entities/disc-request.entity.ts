import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Genre } from '../../genres/entities/genre.entity';
import { Country } from '../../countries/entities/country.entity';

export enum RequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('disc_request')
export class DiscRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  discName: string;

  @Column('varchar', { length: 100 })
  artistName: string;

  @Column({ type: 'date', nullable: true })
  releaseDate: Date | null;

  @Column('boolean', { default: false })
  ep: boolean;

  @Column('boolean', { default: false })
  debut: boolean;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { nullable: true })
  image: string;

  @Column('varchar', { length: 255, nullable: true })
  link: string;

  @Column({ type: 'enum', enum: RequestStatus, default: RequestStatus.PENDING })
  status: RequestStatus;

  @Column('text', { nullable: true })
  adminNotes: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.requests, { eager: true })
  user: User;

  @ManyToOne(() => Genre, { eager: true, nullable: true })
  genre: Genre;

  @ManyToOne(() => Country, { eager: true, nullable: true })
  country: Country;
}
