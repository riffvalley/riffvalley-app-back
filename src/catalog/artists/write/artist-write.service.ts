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
import { normalizeMusicName } from 'src/catalog/shared/music-name/normalize-music-name';

function isDuplicateKeyError(
  error: unknown,
): error is { code: '23505'; detail: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'detail' in error &&
    typeof error.detail === 'string'
  );
}

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
        searchNameNormalized: normalizeMusicName(dto.name),
        needsReview: true,
      });
      const savedArtist = await this.artistRepository.save(artist);
      delete (savedArtist as Partial<Artist>).searchNameNormalized;
      return savedArtist;
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
      ...(name !== undefined
        ? { searchNameNormalized: normalizeMusicName(name) }
        : {}),
      country: countryId ? { id: countryId } : undefined,
      needsReview: false,
    });

    if (!artist) throw new NotFoundException(`Artist with id ${id} not found`);

    artist.searchNameNormalized = normalizeMusicName(artist.name);

    try {
      await this.artistRepository.save(artist);
      delete (artist as Partial<Artist>).searchNameNormalized;
      return artist;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    return this.artistRepository.delete({ id });
  }

  private handleDbExceptions(error: unknown) {
    if (isDuplicateKeyError(error)) {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('ayuda', error);
  }
}
