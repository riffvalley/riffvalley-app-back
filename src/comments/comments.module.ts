import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { AuthModule } from 'src/auth/auth.module';
import { Disc } from 'src/discs/entities/disc.entity';
import { AchievementsModule } from 'src/achievements/achievements.module';

@Module({
  controllers: [CommentsController], // Controladores que gestionan las rutas
  providers: [CommentsService], // Servicios que contienen la lógica de negocio
  imports: [
    TypeOrmModule.forFeature([Comment, Disc]),
    AuthModule,
    AchievementsModule,
  ], // Registro de la entidad Comment en TypeORM
})
export class CommentsModule {}
