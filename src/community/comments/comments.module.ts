import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { Disc } from 'src/catalog/discs/entities/disc.entity';

@Module({
  controllers: [CommentsController], // Controladores que gestionan las rutas
  providers: [CommentsService], // Servicios que contienen la lógica de negocio
  imports: [TypeOrmModule.forFeature([Comment, Disc]), AuthorizationModule], // Registro de la entidad Comment en TypeORM
})
export class CommentsModule {}
