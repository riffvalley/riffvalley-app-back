import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from '../catalog/genres/entities/genre.entity';
import { Country } from '../catalog/countries/entities/country.entity';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Genre, Country])],
  controllers: [CatalogController],
})
export class CommonModule {}
