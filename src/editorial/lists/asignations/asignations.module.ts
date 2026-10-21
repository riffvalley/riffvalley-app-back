import { Module } from '@nestjs/common';
import { AsignationsService } from './asignations.service';
import { AsignationsController } from './asignations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asignation } from './entities/asignations.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { List } from 'src/editorial/lists/entities/list.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { ListsModule } from 'src/editorial/lists/list.module';

@Module({
  controllers: [AsignationsController], // Controladores que gestionan las rutas
  providers: [AsignationsService], // Servicios que contienen la lógica de negocio
  imports: [
    TypeOrmModule.forFeature([Asignation, Disc, List, User]),
    AuthorizationModule,
    ListsModule,
  ], // Registro de la entidad Asignation en TypeORM
})
export class AsignationsModule {}
