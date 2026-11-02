import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Artist } from '../../artists/entities/artist.entity';
import { Event } from './event.entity';
import { Tour } from '../../tours/entities/tour.entity';

@Entity('event_artists')
@Index('UQ_event_artists_event_position', ['eventId', 'position'], {
  unique: true,
})
@Index('IDX_event_artists_artist', ['artistId'])
@Index(
  'IDX_event_artists_tour_event_position',
  ['tourId', 'eventId', 'position'],
  { where: '"tour_id" IS NOT NULL' },
)
@Check('CHK_event_artists_position_positive', '"position" >= 1')
@Check('CHK_event_artists_name_nonempty', 'length(btrim("name")) > 0')
export class EventArtist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'artist_id', type: 'uuid', nullable: true })
  artistId: string | null;

  @Column({ name: 'tour_id', type: 'uuid', nullable: true })
  tourId: string | null;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('integer')
  position: number;

  @ManyToOne(() => Event, (event) => event.lineup, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @ManyToOne(() => Artist, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'artist_id' })
  artist: Artist | null;

  @ManyToOne(() => Tour, (tour) => tour.eventArtists, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tour_id' })
  tour: Tour | null;
}
