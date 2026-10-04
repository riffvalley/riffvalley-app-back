import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto } from '../../../common/dtos/pagination.dto';
import { Artist } from '../entities/artist.entity';

@Injectable()
export class ArtistCatalogService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
  ) {}

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const [artists, totalItems] = await this.artistRepository.findAndCount({
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
      data: artists,
    };
  }

  async findOne(id: string): Promise<Artist> {
    try {
      const artist = await this.artistRepository.findOneByOrFail({ id });
      return artist;
    } catch (error) {
      throw new NotFoundException(`Artist with id ${id} not found`);
    }
  }
}
