import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event } from './entities/event.entity';
import { Artist } from '../artists/entities/artist.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger('EventsService');

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
  ) {}

  async create(dto: CreateEventDto) {
    const { artistIds, locationId, ...rest } = dto;
    try {
      const artists = artistIds?.length
        ? await this.artistRepository.findBy({ id: In(artistIds) })
        : [];

      const event = this.eventRepository.create({
        ...rest,
        location: locationId ? { id: locationId } : undefined,
        artists,
      });
      return await this.eventRepository.save(event);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll() {
    return this.eventRepository.find({
      relations: ['location', 'location.country', 'artists'],
      order: { startDate: 'ASC' },
    });
  }

  async findOne(id: string) {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['location', 'location.country', 'artists'],
    });
    if (!event) throw new NotFoundException(`Event with id ${id} not found`);
    return event;
  }

  async update(id: string, dto: UpdateEventDto) {
    const { artistIds, locationId, ...rest } = dto;

    const event = await this.eventRepository.preload({
      id,
      ...rest,
      location: locationId !== undefined
        ? (locationId ? { id: locationId } : null)
        : undefined,
    });
    if (!event) throw new NotFoundException(`Event with id ${id} not found`);

    if (artistIds !== undefined) {
      event.artists = artistIds.length
        ? await this.artistRepository.findBy({ id: In(artistIds) })
        : [];
    }

    try {
      return await this.eventRepository.save(event);
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async remove(id: string) {
    const event = await this.findOne(id);
    return this.eventRepository.remove(event);
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException('Database error', error);
  }
}
