import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Artist } from '../../artists/entities/artist.entity';
import { Genre } from '../../genres/entities/genre.entity';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { UpdateDiscDto } from '../dto/update-discs.dto';
import { Disc } from '../entities/disc.entity';
import { normalizeArtistName } from './helpers/normalize-artist-name';

@Injectable()
export class DiscWriteService {
  private readonly logger = new Logger('DiscsService');

  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
  ) {}

  async create(createDiscDto: CreateDiscDto) {
    try {
      const disc = this.discRepository.create(createDiscDto);
      await this.discRepository.save(disc);
      return disc;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async createWithArtist(dto: CreateDiscWithArtistDto): Promise<Disc> {
    const artist = await this.resolveArtist(dto.artistName, dto.countryId);

    const disc = this.discRepository.create({
      name: dto.discName,
      artist,
      ...(dto.genreId && { genre: { id: dto.genreId } as Genre }),
      ...(dto.releaseDate && { releaseDate: new Date(dto.releaseDate) }),
      ep: dto.ep ?? false,
      debut: dto.debut ?? false,
      link: dto.link,
      image: dto.image,
      description: dto.description,
    });

    return this.discRepository.save(disc);
  }

  async update(id: string, updateDiscDto: UpdateDiscDto) {
    // Sacamos genreId aparte
    const { genreId, artistId, ...restDto } = updateDiscDto;

    // Cargamos un parcial de disc con preload
    const disc = await this.discRepository.preload({
      id,
      ...restDto,
    });

    if (!disc) throw new NotFoundException(`Disc with id ${id} not found`);

    try {
      if (genreId) {
        disc.genre = { id: genreId } as Genre;
      }

      if (artistId) {
        disc.artist = { id: artistId } as Artist;
      }

      await this.discRepository.save(disc);
      return disc;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const result = await this.discRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Disc with id ${id} not found`);
    }
    return { message: `Disc with id ${id} has been removed` };
  }

  private async resolveArtist(
    artistName: string,
    countryId?: string,
  ): Promise<Artist> {
    const matches = await this.artistRepository.find({
      where: { name: ILike(artistName) },
    });

    if (matches.length === 0) {
      return this.artistRepository.save(
        this.artistRepository.create({
          name: artistName,
          nameNormalized: normalizeArtistName(artistName),
          ...(countryId && { countryId }),
        }),
      );
    }

    if (matches.length === 1) {
      return matches[0];
    }

    // Más de un artista con el mismo nombre → necesitamos countryId para desambiguar
    if (!countryId) {
      throw new BadRequestException(
        `Hay ${matches.length} artistas con el nombre "${artistName}". Especifica countryId para desambiguar.`,
      );
    }

    const match = matches.find((artist) => artist.countryId === countryId);
    if (match) return match;

    // No hay ninguno con ese país → es un artista distinto, se crea
    return this.artistRepository.save(
      this.artistRepository.create({
        name: artistName,
        nameNormalized: normalizeArtistName(artistName),
        countryId,
      }),
    );
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
