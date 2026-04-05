import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateArtistDto } from './dto/create-artist.dto';
import { UpdateArtistDto } from './dto/update-artist.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artist } from './entities/artist.entity';
import { Disc } from '../discs/entities/disc.entity';
import { NationalRelease } from '../national-releases/entities/national-release.entity';
import { Country } from 'src/countries/entities/country.entity';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { normalizeForSearch } from '../common/utils/normalize';

@Injectable()
export class ArtistsService {
  private readonly logger = new Logger('ArtistService');

  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
    @InjectRepository(NationalRelease)
    private readonly nationalReleaseRepository: Repository<NationalRelease>,
  ) {}

  async create(dto: CreateArtistDto) {
    try {
      const artist = this.artistRepository.create({
        ...dto,
        nameNormalized: normalizeForSearch(dto.name),
      });
      return await this.artistRepository.save(artist);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 15, offset = 0, query } = paginationDto;

    const qb = this.artistRepository
      .createQueryBuilder('artist')
      .leftJoinAndSelect('artist.country', 'country')
      .orderBy('artist.name', 'ASC')
      .take(limit)
      .skip(offset);

    if (query) {
      qb.where('artist.name_normalized LIKE :q', {
        q: `%${normalizeForSearch(query)}%`,
      });
    }

    const [artists, totalItems] = await qb.getManyAndCount();

    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      data: artists,
    };
  }

  async findOne(id: string): Promise<Artist> {
    try {
      const artist = await this.artistRepository.findOneByOrFail({
        id,
      });
      return artist;
    } catch (error) {
      throw new NotFoundException(`Artist with id ${id} not found`);
    }
  }

  async findByName(name: string): Promise<Artist[]> {
    if (!name) {
      throw new BadRequestException('Name parameter is required');
    }

    const q = `%${normalizeForSearch(name)}%`;

    try {
      const artists = await this.artistRepository
        .createQueryBuilder('artist')
        .where('artist.name_normalized LIKE :q', { q })
        .getMany();
      return artists;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async update(id: string, updateArtistDto: UpdateArtistDto) {
    const { countryId, name, ...rest } = updateArtistDto;

    const artist = await this.artistRepository.preload({
      id,
      ...rest,
      ...(name !== undefined ? { name } : {}), // <-- actualiza name si viene
      ...(name !== undefined
        ? { nameNormalized: normalizeForSearch(name) }
        : {}),
      country: countryId ? { id: countryId } : undefined,
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
    const artist = await this.artistRepository.delete({
      id,
    });
    return artist;
  }

  async removeArtistsWithoutDiscs(): Promise<Artist[]> {
    // Primero, obtén todos los artistas sin discos
    const artistsWithoutDiscs = await this.artistRepository
      .createQueryBuilder('artist')
      .leftJoinAndSelect('artist.disc', 'disc')
      .where('disc.id IS NULL')
      .getMany();

    // Si no hay artistas sin discos, devolvemos un array vacío o puedes manejar la lógica que prefieras
    if (!artistsWithoutDiscs.length) {
      return [];
    }

    // Guardamos una copia de los artistas para devolverlos antes de eliminarlos
    const deletedArtists = [...artistsWithoutDiscs];

    // Removemos los artistas en bloque
    await this.artistRepository.remove(artistsWithoutDiscs);

    // Devolvemos la lista de los artistas que fueron borrados
    return deletedArtists;
  }

  async findOneWithDetails(id: string) {
    const artist = await this.artistRepository.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!artist) throw new NotFoundException(`Artist with id ${id} not found`);

    const [discs, nationalReleases] = await Promise.all([
      this.discRepository
        .createQueryBuilder('disc')
        .leftJoinAndSelect('disc.genre', 'genre')
        .addSelect((sub) =>
          sub.select('COUNT(rate.id)', 'rateCount')
            .from('rate', 'rate')
            .where('rate.discId = disc.id AND rate.rate IS NOT NULL'),
          'rateCount',
        )
        .addSelect((sub) =>
          sub.select('AVG(rate.rate)', 'averageRate')
            .from('rate', 'rate')
            .where('rate.discId = disc.id AND rate.rate IS NOT NULL'),
          'averageRate',
        )
        .where('disc.artistId = :id', { id })
        .orderBy('disc.releaseDate', 'DESC')
        .getRawAndEntities(),

      this.nationalReleaseRepository
        .createQueryBuilder('nr')
        .where('LOWER(nr.artistName) = LOWER(:name)', { name: artist.name })
        .orderBy('nr.releaseDay', 'DESC')
        .getMany(),
    ]);

    const processedDiscs = discs.entities.map((disc, i) => ({
      id: disc.id,
      name: disc.name,
      releaseDate: disc.releaseDate,
      ep: disc.ep,
      debut: disc.debut,
      image: disc.image,
      link: disc.link,
      genre: disc.genre ? { id: disc.genre.id, name: disc.genre.name, color: disc.genre.color } : null,
      rateCount: parseInt(discs.raw[i].rateCount, 10) || 0,
      averageRate: discs.raw[i].averageRate != null ? parseFloat(discs.raw[i].averageRate) : null,
    }));

    return {
      id: artist.id,
      name: artist.name,
      description: artist.description,
      image: artist.image,
      country: artist.country ?? null,
      discs: processedDiscs,
      nationalReleases: nationalReleases.map((nr) => ({
        id: nr.id,
        discName: nr.discName,
        discType: nr.discType,
        genre: nr.genre,
        releaseDay: nr.releaseDay,
        approved: nr.approved,
        link: nr.link,
        discId: nr.discId,
      })),
    };
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('ayuda', error);
  }
}
