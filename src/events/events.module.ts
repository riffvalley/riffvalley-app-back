import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Artist } from '../artists/entities/artist.entity';
import { Event } from './entities/event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, Artist]), AuthModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
