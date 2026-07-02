import { Artist } from '../../artists/entities/artist.entity';
import { Location } from '../../locations/entities/location.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EventType {
  CONCERT = 'concert',
  FESTIVAL = 'festival',
}

@Entity()
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 200 })
  name: string;

  @Column({ type: 'enum', enum: EventType, default: EventType.CONCERT })
  type: EventType;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  price: number;

  @Column('text', { nullable: true })
  description: string;

  @Column('text', { nullable: true })
  image: string;

  @Column('varchar', { length: 500, nullable: true })
  ticketLink: string;

  @Column({ nullable: true })
  locationId: string;

  @ManyToOne(() => Location, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @ManyToMany(() => Artist, { eager: true })
  @JoinTable({ name: 'event_artists' })
  artists: Artist[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
