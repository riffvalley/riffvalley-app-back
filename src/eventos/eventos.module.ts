import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Artist } from '../artists/entities/artist.entity';
import { Evento } from './entities/evento.entity';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Evento, Artist]), AuthModule],
  controllers: [EventosController],
  providers: [EventosService],
})
export class EventosModule {}
