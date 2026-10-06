import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateArtistDto } from '../dto/create-artist.dto';
import { UpdateArtistDto } from '../dto/update-artist.dto';
import { Artist } from '../entities/artist.entity';
import { normalizeForSearch } from '../helpers/normalize-for-search';

@Injectable()
export class ArtistWriteService {
  private readonly logger = new Logger('ArtistService');

  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
  ) {}

  async create(dto: CreateArtistDto) {
    try {
      const artist = this.artistRepository.create({
        ...dto,
        nameNormalized: normalizeForSearch(dto.name),
        needsReview: true,
      });
      return await this.artistRepository.save(artist);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async update(id: string, updateArtistDto: UpdateArtistDto) {
    const { countryId, name, ...rest } = updateArtistDto;

    const artist = await this.artistRepository.preload({
      id,
      ...rest,
      ...(name !== undefined ? { name } : {}),
      ...(name !== undefined
        ? { nameNormalized: normalizeForSearch(name) }
        : {}),
      country: countryId ? { id: countryId } : undefined,
      needsReview: false,
    });

    if (!artist) throw new NotFoundException(`Artist with id ${id} not found`);

    try {
      await this.artistRepository.save(artist);
      return artist;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    return this.artistRepository.delete({ id });
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('ayuda', error);
  }
}
