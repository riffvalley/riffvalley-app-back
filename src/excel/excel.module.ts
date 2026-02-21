import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExcelService } from './excel.service';
import { ExcelController } from './excel.controller';
import { Genre } from '../genres/entities/genre.entity';
import { Country } from '../countries/entities/country.entity';
import { Disc } from '../discs/entities/disc.entity';
import { Artist } from '../artists/entities/artist.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Genre, Country, Disc, Artist])],
  controllers: [ExcelController],
  providers: [ExcelService],
  exports: [ExcelService],
})
export class ExcelModule { }
