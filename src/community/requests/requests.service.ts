import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DiscRequest, RequestStatus } from './entities/disc-request.entity';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { User } from '../../identity/auth/entities/user.entity';
import { Artist } from '../../catalog/artists/entities/artist.entity';
import { Disc } from '../../catalog/discs/entities/disc.entity';
import { Genre } from '../../catalog/genres/entities/genre.entity';
import { Country } from '../../catalog/countries/entities/country.entity';
import { normalizeForSearch } from '../../catalog/artists/helpers/normalize-for-search';

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(DiscRequest)
    private readonly requestRepo: Repository<DiscRequest>,
    @InjectRepository(Artist)
    private readonly artistRepo: Repository<Artist>,
    @InjectRepository(Disc)
    private readonly discRepo: Repository<Disc>,
    @InjectRepository(Genre)
    private readonly genreRepo: Repository<Genre>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
  ) {}

  async create(dto: CreateRequestDto, user: User): Promise<DiscRequest> {
    await Promise.all([
      this.assertGenreExists(dto.genreId),
      this.assertCountryExists(dto.countryId),
    ]);
    const { releaseDate, ...requestFields } = dto;
    const request = this.requestRepo.create({
      ...requestFields,
      ...(releaseDate !== undefined
        ? { releaseDate: releaseDate === null ? null : new Date(releaseDate) }
        : {}),
      user,
      genre: dto.genreId ? ({ id: dto.genreId } as Genre) : null,
      country: dto.countryId ? ({ id: dto.countryId } as Country) : null,
    });
    return this.requestRepo.save(request);
  }

  findAll(): Promise<DiscRequest[]> {
    return this.requestRepo.find({ order: { createdAt: 'DESC' } });
  }

  findByUser(user: User): Promise<DiscRequest[]> {
    return this.requestRepo.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<DiscRequest> {
    const request = await this.requestRepo.findOneBy({ id });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    return request;
  }

  async update(id: string, dto: UpdateRequestDto): Promise<DiscRequest> {
    const request = await this.findOne(id);

    if (request.status === RequestStatus.APPROVED) {
      throw new BadRequestException(
        'No se pueden modificar peticiones ya aprobadas',
      );
    }

    const { genreId, countryId, releaseDate, ...rest } = dto;
    await Promise.all([
      genreId === undefined ? undefined : this.assertGenreExists(genreId),
      countryId === undefined ? undefined : this.assertCountryExists(countryId),
    ]);

    Object.assign(request, rest);

    if (genreId !== undefined) {
      request.genre = genreId ? ({ id: genreId } as Genre) : null;
    }
    if (countryId !== undefined) {
      request.country = countryId ? ({ id: countryId } as Country) : null;
    }
    if (releaseDate !== undefined) {
      request.releaseDate = releaseDate === null ? null : new Date(releaseDate);
    }

    return this.requestRepo.save(request);
  }

  async approve(id: string): Promise<Disc> {
    return this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(DiscRequest);
      const artistRepo = manager.getRepository(Artist);
      const discRepo = manager.getRepository(Disc);
      const request = await requestRepo.findOneBy({ id });

      if (!request) throw new NotFoundException(`Request ${id} not found`);
      if (request.status !== RequestStatus.PENDING) {
        throw new BadRequestException('Esta petición ya fue procesada');
      }

      // Buscar o crear artista
      const normalizedArtistName = normalizeForSearch(request.artistName);
      let artist = await artistRepo.findOne({
        where: { nameNormalized: normalizedArtistName },
      });

      if (!artist) {
        artist = artistRepo.create({
          name: request.artistName,
          nameNormalized: normalizedArtistName,
          ...(request.country ? { countryId: request.country.id } : {}),
        });
        await artistRepo.save(artist);
        this.logger.log(`Artista creado: "${request.artistName}"`);
      }

      // Crear disco
      const disc = discRepo.create({
        name: request.discName,
        releaseDate: request.releaseDate,
        ep: request.ep,
        debut: request.debut,
        description: request.description,
        image: request.image,
        link: request.link,
        artist,
        ...(request.genre ? { genre: request.genre } : {}),
      });
      await discRepo.save(disc);
      this.logger.log(`Disco creado desde petición: "${request.discName}"`);

      request.status = RequestStatus.APPROVED;
      await requestRepo.save(request);

      return disc;
    });
  }

  async reject(id: string, adminNotes?: string): Promise<DiscRequest> {
    const request = await this.findOne(id);
    request.status = RequestStatus.REJECTED;
    if (adminNotes) request.adminNotes = adminNotes;
    return this.requestRepo.save(request);
  }

  async reopen(id: string): Promise<DiscRequest> {
    const request = await this.findOne(id);

    if (request.status === RequestStatus.APPROVED) {
      throw new BadRequestException(
        'No se puede reabrir una petición ya aprobada',
      );
    }

    if (request.status === RequestStatus.PENDING) {
      throw new BadRequestException('La petición ya está pendiente');
    }

    request.status = RequestStatus.PENDING;
    request.adminNotes = null;
    return this.requestRepo.save(request);
  }

  private async assertGenreExists(
    genreId: string | null | undefined,
  ): Promise<void> {
    if (!genreId) return;
    const genre = await this.genreRepo.findOneBy({ id: genreId });
    if (!genre)
      throw new NotFoundException(`No se encontró el género ${genreId}`);
  }

  private async assertCountryExists(
    countryId: string | null | undefined,
  ): Promise<void> {
    if (!countryId) return;
    const country = await this.countryRepo.findOneBy({ id: countryId });
    if (!country)
      throw new NotFoundException(`No se encontró el país ${countryId}`);
  }
}
