import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { PaginationDto } from '../../common/dtos/pagination.dto';

@Injectable()
export class CountriesService {
  private readonly logger = new Logger('CountriesService');

  constructor(
    @InjectRepository(Country)
    private readonly unitRepository: Repository<Country>,
  ) {}

  async create(createCountryDto: CreateCountryDto) {
    try {
      const unit = this.unitRepository.create(createCountryDto);
      await this.unitRepository.save(unit);
      return unit;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const [units, totalItems] = await this.unitRepository.findAndCount({
      take: limit,
      skip: offset,
    });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: units,
    };
  }

  async findOne(id: string): Promise<Country> {
    try {
      const unit = await this.unitRepository.findOneByOrFail({ id });
      return unit;
    } catch (error) {
      throw new NotFoundException(`Country with id ${id} not found`);
    }
  }

  async update(id: string, updateCountryDto: UpdateCountryDto) {
    const unit = await this.unitRepository.preload({
      id: id,
      ...updateCountryDto,
    });

    if (!unit) throw new NotFoundException(`Country with id ${id} not found`);

    try {
      await this.unitRepository.save(unit);
      return unit;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const unit = await this.unitRepository.delete({ id });
    return unit;
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException(
      'An unexpected error occurred',
      error,
    );
  }
}
