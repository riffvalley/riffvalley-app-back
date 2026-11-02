import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { Event } from '../events/entities/event.entity';
import { EventArtist } from '../events/entities/event-artist.entity';
import { Tour } from './entities/tour.entity';
import { ToursController } from './tours.controller';
import { ToursService } from './tours.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tour, Event, EventArtist]),
    AuthorizationModule,
  ],
  controllers: [ToursController],
  providers: [ToursService],
})
export class ToursModule {}
