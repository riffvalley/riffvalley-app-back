import { Module } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favorite } from './entities/favorite.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { Disc } from 'src/catalog/discs/entities/disc.entity';

@Module({
  controllers: [FavoritesController], // Controladores que gestionan las rutas
  providers: [FavoritesService], // Servicios que contienen la lógica de negocio
  imports: [TypeOrmModule.forFeature([Favorite, Disc]), AuthorizationModule], // Registro de la entidad Rate en TypeORM
})
export class FavoritesModule {}
