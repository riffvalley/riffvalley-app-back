import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from '../artists/entities/artist.entity';
import { VenuesModule } from '../venues/venues.module';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { EventArtist } from './entities/event-artist.entity';
import { Event } from './entities/event.entity';
import { Tour } from '../tours/entities/tour.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventArtist, Artist, Tour]),
    VenuesModule,
    AuthorizationModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
