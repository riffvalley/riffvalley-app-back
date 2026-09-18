import { Module } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favorite } from './entities/favorite.entity';
import { AuthModule } from 'src/auth/auth.module';
import { Disc } from 'src/discs/entities/disc.entity';
import { AchievementsModule } from 'src/achievements/achievements.module';

@Module({
  controllers: [FavoritesController], // Controladores que gestionan las rutas
  providers: [FavoritesService], // Servicios que contienen la lógica de negocio
  imports: [
    TypeOrmModule.forFeature([Favorite, Disc]),
    AuthModule,
    AchievementsModule,
  ], // Registro de la entidad Rate en TypeORM
})
export class FavoritesModule {}
