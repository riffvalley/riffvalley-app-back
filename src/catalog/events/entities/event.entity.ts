import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Venue } from '../../venues/entities/venue.entity';
import { EventArtist } from './event-artist.entity';
import { Tour } from '../../tours/entities/tour.entity';

export enum EventType {
  CONCERT = 'concert',
  FESTIVAL = 'festival',
}

@Entity('events')
@Index('IDX_events_start_date', ['startDate'])
@Index('IDX_events_type_start_date', ['type', 'startDate'])
@Index('IDX_events_venue_start_date', ['venueId', 'startDate'])
@Index('IDX_events_tour_start_date', ['tourId', 'startDate'])
@Check(
  'CHK_events_end_date_not_before_start',
  '"end_date" IS NULL OR "end_date" >= "start_date"',
)
@Check(
  'CHK_events_tour_is_concert',
  '"tour_id" IS NULL OR "type" = \'concert\'',
)
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: EventType, enumName: 'events_type_enum' })
  type: EventType;

  @Column('varchar', { length: 240, nullable: true })
  name: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ name: 'tour_id', type: 'uuid', nullable: true })
  tourId: string | null;

  @Column('text', { nullable: true })
  price: string | null;

  @Column({ name: 'other_info', type: 'text', nullable: true })
  otherInfo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Venue, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venue_id' })
  venue: Venue;

  @ManyToOne(() => Tour, (tour) => tour.events, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tour_id' })
  tour: Tour | null;

  @OneToMany(() => EventArtist, (eventArtist) => eventArtist.event)
  lineup: EventArtist[];
}
