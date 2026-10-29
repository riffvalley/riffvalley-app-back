import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Raw, Repository } from 'typeorm';
import { Artist } from '../../artists/entities/artist.entity';
import { Genre } from '../../genres/entities/genre.entity';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { UpdateDiscDto } from '../dto/update-discs.dto';
import { Disc } from '../entities/disc.entity';
import { normalizeArtistName } from './helpers/normalize-artist-name';
import { normalizeForSearch } from '../../artists/helpers/normalize-for-search';
import { getMusicNameSearchKeys } from '../../shared/music-name/music-name-search';
import { normalizeMusicName } from 'src/catalog/shared/music-name/normalize-music-name';

@Injectable()
export class DiscWriteService {
  private readonly logger = new Logger('DiscsService');

  constructor(
    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,
  ) {}

  async create(createDiscDto: CreateDiscDto) {
    try {
      const { artistId, genreId, ...discFields } = createDiscDto;
      const disc = this.discRepository.create({
        ...discFields,
        searchNameNormalized: normalizeMusicName(discFields.name),
        ...(artistId && { artist: { id: artistId } as Artist }),
        ...(genreId && { genre: { id: genreId } as Genre }),
      });
      await this.discRepository.save(disc);
      delete (disc as Partial<Disc>).searchNameNormalized;
      // Keep the POST response shape unchanged while persisting the relations.
      delete (disc as Partial<Disc>).artist;
      delete (disc as Partial<Disc>).genre;
      return disc;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async createWithArtist(dto: CreateDiscWithArtistDto): Promise<Disc> {
    return this.discRepository.manager.transaction(async (manager) => {
      const artistRepository = manager.getRepository(Artist);
      const discRepository = manager.getRepository(Disc);
      const artist = await this.resolveArtist(
        dto.artistName,
        artistRepository,
        dto.countryId,
      );

      const disc = discRepository.create({
        name: dto.discName,
        searchNameNormalized: normalizeMusicName(dto.discName),
        artist,
        ...(dto.genreId && { genre: { id: dto.genreId } as Genre }),
        ...(dto.releaseDate && { releaseDate: new Date(dto.releaseDate) }),
        ep: dto.ep ?? false,
        debut: dto.debut ?? false,
        link: dto.link,
        image: dto.image,
        description: dto.description,
      });

      const savedDisc = await discRepository.save(disc);
      delete (savedDisc as Partial<Disc>).searchNameNormalized;
      return savedDisc;
    });
  }

  async update(id: string, updateDiscDto: UpdateDiscDto) {
    // Sacamos genreId aparte
    const { genreId, artistId, ...restDto } = updateDiscDto;

    // Cargamos un parcial de disc con preload
    const disc = await this.discRepository.preload({
      id,
      ...restDto,
      ...(restDto.name !== undefined
        ? { searchNameNormalized: normalizeMusicName(restDto.name) }
        : {}),
    });

    if (!disc) throw new NotFoundException(`Disc with id ${id} not found`);

    disc.searchNameNormalized = normalizeMusicName(disc.name);

    try {
      if (genreId) {
        disc.genre = { id: genreId } as Genre;
      }

      if (artistId) {
        disc.artist = { id: artistId } as Artist;
      }

      await this.discRepository.save(disc);
      delete (disc as Partial<Disc>).searchNameNormalized;
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
    artistRepository: Repository<Artist>,
    countryId?: string,
  ): Promise<Artist> {
    const exactMatches = await artistRepository.find({
      where: {
        name: Raw((nameColumn) => `LOWER(${nameColumn}) = LOWER(:artistName)`, {
          artistName,
        }),
      },
    });

    const searchKeys = getMusicNameSearchKeys(artistName);
    const legacySearchKeys = [
      ...new Set(
        searchKeys
          .map((key) => normalizeForSearch(key.normalize('NFKC')))
          .filter(Boolean),
      ),
    ];
    const candidateConditions: FindOptionsWhere<Artist>[] = [];
    if (searchKeys.length > 0) {
      candidateConditions.push({ searchNameNormalized: In(searchKeys) });
    }
    if (legacySearchKeys.length > 0) {
      candidateConditions.push({
        searchNameNormalized: IsNull(),
        nameNormalized: In(legacySearchKeys),
      });
    }
    const normalizedCandidates =
      candidateConditions.length > 0
        ? await artistRepository.find({ where: candidateConditions })
        : [];
    const exactArtistIds = new Set(exactMatches.map((artist) => artist.id));
    const unconfirmedCandidates = normalizedCandidates.filter(
      (artist) => !exactArtistIds.has(artist.id),
    );

    if (unconfirmedCandidates.length > 0) {
      throw new BadRequestException(
        `Hay artistas compatibles con "${artistName}" tras normalizar el nombre, pero esa coincidencia no confirma su identidad. Revisa el artista antes de crear el disco.`,
      );
    }

    if (exactMatches.length === 0) {
      const createdArtist = await artistRepository.save(
        artistRepository.create({
          name: artistName,
          nameNormalized: normalizeArtistName(artistName),
          searchNameNormalized: normalizeMusicName(artistName),
          ...(countryId && { countryId }),
        }),
      );
      delete (createdArtist as Partial<Artist>).searchNameNormalized;
      return createdArtist;
    }

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    // Más de un artista con el mismo nombre → necesitamos countryId para desambiguar
    if (!countryId) {
      throw new BadRequestException(
        `Hay ${exactMatches.length} artistas con el nombre "${artistName}". Especifica countryId para desambiguar.`,
      );
    }

    const match = exactMatches.find((artist) => artist.countryId === countryId);
    if (match) return match;

    // Ningún artista exacto tiene ese país: conservar el flujo de alta.
    const createdArtist = await artistRepository.save(
      artistRepository.create({
        name: artistName,
        nameNormalized: normalizeArtistName(artistName),
        searchNameNormalized: normalizeMusicName(artistName),
        countryId,
      }),
    );
    delete (createdArtist as Partial<Artist>).searchNameNormalized;
    return createdArtist;
  }

  private handleDbExceptions(error: unknown) {
    if (isPostgresUniqueViolation(error)) {
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}

function isPostgresUniqueViolation(
  error: unknown,
): error is { code: '23505'; detail?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    (!('detail' in error) ||
      error.detail === undefined ||
      typeof error.detail === 'string')
  );
}
