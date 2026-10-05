import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from './entities/genre.entity';
import { CreateGenreDto } from './dto/create-genre.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { PaginationDto } from '../../common/dtos/pagination.dto';

@Injectable()
export class GenresService {
  private readonly logger = new Logger('GenresService');

  constructor(
    @InjectRepository(Genre)
    private readonly unitRepository: Repository<Genre>,
  ) {}

  async create(createGenreDto: CreateGenreDto) {
    try {
      const unit = this.unitRepository.create(createGenreDto);
      await this.unitRepository.save(unit);
      return unit;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async bulkCreate(payload: { genres: { name: string; color: string }[] }) {
    const { genres } = payload;

    if (!Array.isArray(genres)) {
      throw new BadRequestException(
        'The genres property must be an array of objects with name and color properties',
      );
    }

    try {
      const genreEntities = genres.map((genre) =>
        this.unitRepository.create({ name: genre.name, color: genre.color }),
      );

      await this.unitRepository.save(genreEntities);
      this.logger.log(
        `${genres.length} genres have been successfully created.`,
      );
      return {
        message: `${genres.length} genres have been successfully created.`,
        data: genreEntities,
      };
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const [units, totalItems] = await this.unitRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        name: 'ASC',
      },
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

  async findOne(id: string): Promise<Genre> {
    try {
      const unit = await this.unitRepository.findOneByOrFail({ id });
      return unit;
    } catch (error) {
      throw new NotFoundException(`Genre with id ${id} not found`);
    }
  }

  async update(id: string, updateGenreDto: UpdateGenreDto) {
    const unit = await this.unitRepository.preload({
      id: id,
      ...updateGenreDto,
    });

    if (!unit) throw new NotFoundException(`Genre with id ${id} not found`);

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
