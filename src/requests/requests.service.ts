import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscRequest, RequestStatus } from './entities/disc-request.entity';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { User } from '../auth/entities/user.entity';
import { Artist } from '../artists/entities/artist.entity';
import { Disc } from '../discs/entities/disc.entity';
import { Genre } from '../genres/entities/genre.entity';
import { Country } from '../countries/entities/country.entity';

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
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
    const request = this.requestRepo.create({
      ...dto,
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
      throw new BadRequestException('No se pueden modificar peticiones ya aprobadas');
    }

    const { genreId, countryId, ...rest } = dto;

    Object.assign(request, rest);

    if (genreId !== undefined) {
      request.genre = genreId ? ({ id: genreId } as Genre) : null;
    }
    if (countryId !== undefined) {
      request.country = countryId ? ({ id: countryId } as Country) : null;
    }

    return this.requestRepo.save(request);
  }

  async approve(id: string): Promise<Disc> {
    const request = await this.findOne(id);

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Esta petición ya fue procesada');
    }

    // Buscar o crear artista
    let artist = await this.artistRepo.findOne({
      where: { nameNormalized: request.artistName.toLowerCase() },
    });

    if (!artist) {
      artist = this.artistRepo.create({
        name: request.artistName,
        nameNormalized: request.artistName.toLowerCase(),
        ...(request.country ? { countryId: request.country.id } : {}),
      });
      await this.artistRepo.save(artist);
      this.logger.log(`Artista creado: "${request.artistName}"`);
    }

    // Crear disco
    const disc = this.discRepo.create({
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
    await this.discRepo.save(disc);
    this.logger.log(`Disco creado desde petición: "${request.discName}"`);

    request.status = RequestStatus.APPROVED;
    await this.requestRepo.save(request);

    return disc;
  }

  async reject(id: string, adminNotes?: string): Promise<DiscRequest> {
    const request = await this.findOne(id);
    request.status = RequestStatus.REJECTED;
    if (adminNotes) request.adminNotes = adminNotes;
    return this.requestRepo.save(request);
  }
}
