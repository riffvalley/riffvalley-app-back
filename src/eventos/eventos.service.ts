import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Evento } from './entities/evento.entity';
import { Artist } from '../artists/entities/artist.entity';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';

@Injectable()
export class EventosService {
  private readonly logger = new Logger('EventosService');

  constructor(
    @InjectRepository(Evento)
    private readonly eventoRepository: Repository<Evento>,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
  ) {}

  async create(dto: CreateEventoDto) {
    const { artistIds, localizacionId, ...rest } = dto;
    try {
      const artists = artistIds?.length
        ? await this.artistRepository.findBy({ id: In(artistIds) })
        : [];

      const evento = this.eventoRepository.create({
        ...rest,
        localizacion: localizacionId ? { id: localizacionId } : undefined,
        artists,
      });
      return await this.eventoRepository.save(evento);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll() {
    return this.eventoRepository.find({
      relations: ['localizacion', 'localizacion.country', 'artists'],
      order: { startDate: 'ASC' },
    });
  }

  async findOne(id: string) {
    const evento = await this.eventoRepository.findOne({
      where: { id },
      relations: ['localizacion', 'localizacion.country', 'artists'],
    });
    if (!evento) throw new NotFoundException(`Evento with id ${id} not found`);
    return evento;
  }

  async update(id: string, dto: UpdateEventoDto) {
    const { artistIds, localizacionId, ...rest } = dto;

    const evento = await this.eventoRepository.preload({
      id,
      ...rest,
      localizacion: localizacionId !== undefined
        ? (localizacionId ? { id: localizacionId } : null)
        : undefined,
    });
    if (!evento) throw new NotFoundException(`Evento with id ${id} not found`);

    if (artistIds !== undefined) {
      evento.artists = artistIds.length
        ? await this.artistRepository.findBy({ id: In(artistIds) })
        : [];
    }

    try {
      return await this.eventoRepository.save(evento);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const evento = await this.findOne(id);
    return this.eventoRepository.remove(evento);
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('Database error', error);
  }
}
