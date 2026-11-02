import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { EventArtist } from '../../events/entities/event-artist.entity';

@Entity('tours')
@Index('UQ_tours_normalized_name', ['normalizedName'], { unique: true })
export class Tour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 180 })
  name: string;

  @Column('varchar', { name: 'normalized_name', length: 360 })
  normalizedName: string;

  @Column('text', { nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Event, (event) => event.tour)
  events: Event[];

  @OneToMany(() => EventArtist, (eventArtist) => eventArtist.tour)
  eventArtists: EventArtist[];
}
