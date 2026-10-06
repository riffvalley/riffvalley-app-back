import { Module } from '@nestjs/common';
import { PendingsService } from './pendings.service';
import { PendingsController } from './pendings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pending } from './entities/pending.entity';
import { AuthModule } from 'src/auth/auth.module';
import { Disc } from 'src/catalog/discs/entities/disc.entity';

@Module({
  controllers: [PendingsController], // Controladores que gestionan las rutas
  providers: [PendingsService], // Servicios que contienen la lógica de negocio
  imports: [TypeOrmModule.forFeature([Pending, Disc]), AuthModule], // Registro de la entidad Rate en TypeORM
})
export class PendingsModule {}
