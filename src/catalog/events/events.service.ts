import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm';
import { Artist } from '../artists/entities/artist.entity';
import { Venue } from '../venues/entities/venue.entity';
import { VenuesService } from '../venues/venues.service';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsQueryDto } from './dto/events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventArtistTourDto } from './dto/update-event-artist-tour.dto';
import { EventArtist } from './entities/event-artist.entity';
import { Tour } from '../tours/entities/tour.entity';
import { Event, EventType } from './entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly venuesService: VenuesService,
  ) {}

  async create(dto: CreateEventDto): Promise<Event> {
    this.validateDates(dto.startDate, dto.endDate);
    return this.eventRepository.manager.transaction(async (manager) => {
      const venue = await this.resolveVenue(
        dto.venueId,
        dto.localityId,
        manager.getRepository(Venue),
      );
      const lineup = dto.lineup ?? [];
      await this.validateTour(
        dto.tourId,
        dto.type,
        manager.getRepository(Tour),
      );
      await this.validateLineupTours(
        lineup,
        dto.type,
        manager.getRepository(Tour),
      );
      await this.validateArtists(
        lineup.map((item) => item.artistId ?? null),
        manager.getRepository(Artist),
      );
      const eventRepository = manager.getRepository(Event);
      const event = await eventRepository.save(
        eventRepository.create({
          type: dto.type,
          name: dto.name ?? null,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          venueId: venue.id,
          tourId: dto.tourId ?? null,
          price: dto.price ?? null,
          otherInfo: dto.otherInfo ?? null,
        }),
      );
      await this.replaceLineup(
        event.id,
        lineup,
        manager.getRepository(EventArtist),
      );
      return this.findOneWithManager(event.id, manager.getRepository(Event));
    });
  }

  async findAll(query: EventsQueryDto) {
    this.validateDateRange(query.dateFrom, query.dateTo);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const filteredEvents = this.eventRepository
      .createQueryBuilder('event')
      .leftJoin('event.venue', 'venue')
      .leftJoin('venue.locality', 'locality')
      .leftJoin('locality.administrativeRegion', 'administrativeRegion');
    this.applyFilters(filteredEvents, query);

    const [page, totalItems] = await Promise.all([
      filteredEvents
        .clone()
        .select('event.id', 'id')
        .orderBy('event.startDate', 'ASC')
        .addOrderBy('event.id', 'ASC')
        .limit(limit)
        .offset(offset)
        .getRawMany<{ id: string }>(),
      filteredEvents.clone().getCount(),
    ]);

    const eventIds = page.map(({ id }) => id);
    const data = eventIds.length
      ? await this.eventRepository
          .createQueryBuilder('event')
          .leftJoinAndSelect('event.venue', 'venue')
          .leftJoinAndSelect('venue.locality', 'locality')
          .leftJoinAndSelect(
            'locality.administrativeRegion',
            'administrativeRegion',
          )
          .leftJoinAndSelect('administrativeRegion.country', 'country')
          .leftJoinAndSelect('event.lineup', 'lineup')
          .leftJoinAndSelect('lineup.artist', 'artist')
          .where('event.id IN (:...eventIds)', { eventIds })
          .orderBy('event.startDate', 'ASC')
          .addOrderBy('event.id', 'ASC')
          .addOrderBy('lineup.position', 'ASC')
          .getMany()
      : [];
    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      data,
    };
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: {
        venue: { locality: { administrativeRegion: { country: true } } },
        lineup: { artist: true },
      },
      order: { lineup: { position: 'ASC' } },
    });
    if (!event) throw new NotFoundException(`Event with id ${id} not found`);
    return event;
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    return this.eventRepository.manager.transaction(async (manager) => {
      const eventRepository = manager.getRepository(Event);
      const event = await eventRepository.findOneBy({ id });
      if (!event) throw new NotFoundException(`Event with id ${id} not found`);
      const previousType = event.type;
      if (dto.startDate !== undefined || dto.endDate !== undefined)
        this.validateDates(
          dto.startDate ?? event.startDate,
          dto.endDate === undefined ? event.endDate : dto.endDate,
        );
      if (dto.venueId !== undefined || dto.localityId !== undefined) {
        const venue = await this.resolveVenue(
          dto.venueId,
          dto.localityId,
          manager.getRepository(Venue),
          event.venueId,
        );
        event.venueId = venue.id;
      }
      if (dto.type !== undefined) event.type = dto.type;
      if (dto.name !== undefined) event.name = dto.name;
      if (dto.startDate !== undefined) event.startDate = dto.startDate;
      if (dto.endDate !== undefined) event.endDate = dto.endDate;
      if (dto.price !== undefined) event.price = dto.price;
      if (dto.otherInfo !== undefined) event.otherInfo = dto.otherInfo;

      const updatedTourId =
        dto.tourId === undefined ? event.tourId : dto.tourId;
      const updatedType = dto.type ?? event.type;
      await this.validateTour(
        updatedTourId,
        updatedType,
        manager.getRepository(Tour),
      );
      if (
        updatedType === EventType.CONCERT &&
        previousType !== EventType.CONCERT &&
        dto.lineup === undefined &&
        (await manager.getRepository(EventArtist).existsBy({
          eventId: id,
          tourId: Not(IsNull()),
        }))
      ) {
        throw new BadRequestException(
          'Remove festival performance tour associations before changing the event to a concert',
        );
      }
      event.tourId = updatedTourId ?? null;

      if (dto.lineup !== undefined) {
        await this.validateLineupTours(
          dto.lineup,
          updatedType,
          manager.getRepository(Tour),
        );
        await this.validateArtists(
          dto.lineup.map((item) => item.artistId ?? null),
          manager.getRepository(Artist),
        );
        await manager.getRepository(EventArtist).delete({ eventId: id });
      }
      await eventRepository.save(event);
      if (dto.lineup !== undefined)
        await this.insertLineup(
          id,
          dto.lineup,
          manager.getRepository(EventArtist),
        );
      return this.findOneWithManager(id, eventRepository);
    });
  }

  async updateArtistTour(
    eventId: string,
    eventArtistId: string,
    dto: UpdateEventArtistTourDto,
  ): Promise<EventArtist> {
    return this.eventRepository.manager.transaction(async (manager) => {
      const eventRepository = manager.getRepository(Event);
      const event = await eventRepository.findOne({
        where: { id: eventId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event)
        throw new NotFoundException(`Event with id ${eventId} not found`);
      if (event.type !== EventType.FESTIVAL)
        throw new BadRequestException(
          'Festival performance tour associations require a festival event',
        );

      const eventArtistRepository = manager.getRepository(EventArtist);
      const performance = await eventArtistRepository.findOne({
        where: { id: eventArtistId, eventId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!performance)
        throw new NotFoundException(
          `EventArtist with id ${eventArtistId} not found for event ${eventId}`,
        );

      if (dto.tourId !== null) {
        const tourRepository = manager.getRepository(Tour);
        if (!(await tourRepository.existsBy({ id: dto.tourId })))
          throw new BadRequestException(
            `Tour with id ${dto.tourId} does not exist`,
          );
      }

      performance.tourId = dto.tourId;
      return eventArtistRepository.save(performance);
    });
  }

  async remove(id: string): Promise<{ affected: number }> {
    return this.eventRepository.manager.transaction(async (manager) => {
      const eventRepository = manager.getRepository(Event);
      if (!(await eventRepository.existsBy({ id })))
        throw new NotFoundException(`Event with id ${id} not found`);
      await manager.getRepository(EventArtist).delete({ eventId: id });
      const result = await eventRepository.delete({ id });
      return { affected: result.affected ?? 0 };
    });
  }

  private async resolveVenue(
    venueId: string | null | undefined,
    localityId: string | null | undefined,
    venueRepository: Repository<Venue>,
    existingVenueId?: string,
  ): Promise<Venue> {
    if (venueId && localityId) {
      const venue = await venueRepository.findOneBy({ id: venueId });
      if (!venue) throw new BadRequestException('Venue does not exist');
      if (venue.localityId !== localityId)
        throw new BadRequestException(
          'Venue and locality refer to different locations',
        );
      return venue;
    }
    if (venueId) {
      const venue = await venueRepository.findOneBy({ id: venueId });
      if (!venue) throw new BadRequestException('Venue does not exist');
      return venue;
    }
    if (localityId)
      return this.venuesService.getOrCreateGenericVenue(
        localityId,
        venueRepository.manager,
      );
    if (existingVenueId) {
      const venue = await venueRepository.findOneBy({ id: existingVenueId });
      if (!venue) throw new NotFoundException('Event venue no longer exists');
      return venue;
    }
    throw new BadRequestException(
      'An existing venueId or localityId is required',
    );
  }

  private async validateArtists(
    artistIds: Array<string | null>,
    artistRepository: Repository<Artist>,
  ): Promise<void> {
    const ids = [
      ...new Set(artistIds.filter((id): id is string => id !== null)),
    ];
    if (!ids.length) return;
    const found = await artistRepository.find({
      where: { id: In(ids) },
      select: { id: true },
    });
    if (found.length !== ids.length)
      throw new BadRequestException('One or more artistId values do not exist');
  }

  private async replaceLineup(
    eventId: string,
    lineup: CreateEventDto['lineup'],
    repository: Repository<EventArtist>,
  ): Promise<void> {
    await repository.delete({ eventId });
    await this.insertLineup(eventId, lineup, repository);
  }

  private async insertLineup(
    eventId: string,
    lineup: CreateEventDto['lineup'],
    repository: Repository<EventArtist>,
  ): Promise<void> {
    if (!lineup?.length) return;
    await repository.save(
      lineup.map((item, index) =>
        repository.create({
          eventId,
          artistId: item.artistId ?? null,
          tourId: item.tourId ?? null,
          name: item.name,
          position: index + 1,
        }),
      ),
    );
  }

  private async findOneWithManager(
    id: string,
    repository: Repository<Event>,
  ): Promise<Event> {
    const event = await repository.findOne({
      where: { id },
      relations: {
        venue: { locality: { administrativeRegion: { country: true } } },
        lineup: { artist: true },
      },
      order: { lineup: { position: 'ASC' } },
    });
    if (!event) throw new NotFoundException(`Event with id ${id} not found`);
    return event;
  }

  private validateDates(startDate: string, endDate?: string | null): void {
    if (!startDate) throw new BadRequestException('startDate is required');
    if (endDate && endDate < startDate)
      throw new BadRequestException('endDate must be on or after startDate');
  }

  private validateDateRange(dateFrom?: string, dateTo?: string): void {
    if (dateFrom && dateTo && dateTo < dateFrom)
      throw new BadRequestException('dateTo must be on or after dateFrom');
  }

  private applyFilters(
    builder: SelectQueryBuilder<Event>,
    query: EventsQueryDto,
  ): void {
    if (query.type)
      builder.andWhere('event.type = :type', { type: query.type });
    if (query.dateFrom)
      builder.andWhere('event.startDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    if (query.dateTo)
      builder.andWhere('event.startDate <= :dateTo', { dateTo: query.dateTo });
    if (query.venueId)
      builder.andWhere('event.venueId = :venueId', { venueId: query.venueId });
    if (query.administrativeRegionId)
      builder.andWhere('administrativeRegion.id = :administrativeRegionId', {
        administrativeRegionId: query.administrativeRegionId,
      });
    if (query.tourId)
      builder.andWhere('event.tourId = :tourId', { tourId: query.tourId });
  }

  private async validateTour(
    tourId: string | null | undefined,
    type: EventType,
    tourRepository: Repository<Tour>,
  ): Promise<void> {
    if (!tourId) return;
    if (type !== EventType.CONCERT)
      throw new BadRequestException('Festivals cannot belong to a tour');
    if (!(await tourRepository.existsBy({ id: tourId })))
      throw new BadRequestException(`Tour with id ${tourId} does not exist`);
  }

  private async validateLineupTours(
    lineup: CreateEventDto['lineup'],
    type: EventType,
    tourRepository: Repository<Tour>,
  ): Promise<void> {
    const tourIds = [
      ...new Set(
        (lineup ?? [])
          .map((item) => item.tourId ?? null)
          .filter((tourId): tourId is string => tourId !== null),
      ),
    ];
    if (!tourIds.length) return;
    if (type !== EventType.FESTIVAL)
      throw new BadRequestException(
        'Lineup tour associations are only allowed for festivals',
      );
    const found = await tourRepository.find({
      where: { id: In(tourIds) },
      select: { id: true },
    });
    if (found.length !== tourIds.length)
      throw new BadRequestException(
        'One or more lineup tourId values do not exist',
      );
  }
}
