import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from '../genres/entities/genre.entity';
import { Country } from '../countries/entities/country.entity';

@Controller('catalog')
export class CatalogController {
  constructor(
    @InjectRepository(Genre)
    private readonly genreRepo: Repository<Genre>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
  ) {}

  @Get()
  async getCatalog() {
    const [genres, countries] = await Promise.all([
      this.genreRepo.find({ order: { name: 'ASC' } }),
      this.countryRepo.find({ order: { name: 'ASC' } }),
    ]);
    return { genres, countries };
  }
}
