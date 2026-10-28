import { Module } from '@nestjs/common';
import { PendingsService } from './pendings.service';
import { PendingsController } from './pendings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pending } from './entities/pending.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { PendingsDiscListReader } from './disc-list/pendings-disc-list.reader';

@Module({
  controllers: [PendingsController], // Controladores que gestionan las rutas
  providers: [PendingsService, PendingsDiscListReader], // Servicios que contienen la lógica de negocio
  imports: [TypeOrmModule.forFeature([Pending, Disc]), AuthorizationModule], // Registro de la entidad Rate en TypeORM
  exports: [PendingsDiscListReader],
})
export class PendingsModule {}
