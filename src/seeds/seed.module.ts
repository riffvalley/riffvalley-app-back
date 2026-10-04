import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { User } from 'src/auth/entities/user.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Genre, Country])],
  providers: [SeedService],
})
export class SeedModule {}
