import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Artist } from '../../artists/entities/artist.entity';
import { Venue } from '../../venues/entities/venue.entity';
import { Tour } from '../../tours/entities/tour.entity';
import { CreateEventDto } from '../dto/create-event.dto';
import { EventLineupItemDto } from '../dto/event-lineup-item.dto';
import { UpdateEventArtistTourDto } from '../dto/update-event-artist-tour.dto';
import { EventsQueryDto } from '../dto/events-query.dto';
import { EventArtist } from '../entities/event-artist.entity';
import { Event, EventType } from '../entities/event.entity';
import { EventsService } from '../events.service';

describe('EventsService', () => {
  const event = {
    type: EventType.CONCERT,
    name: null,
    startDate: '2027-04-15',
    endDate: null,
    venueId: 'venue-id',
    price: 'Desde 35€',
    otherInfo: 'Puertas 19:00',
    tourId: 'tour-id',
    id: 'event-id',
  };
  let service: EventsService;
  let eventRepository: Record<string, jest.Mock>;
  let eventArtistRepository: Record<string, jest.Mock>;
  let artistRepository: Record<string, jest.Mock>;
  let venueRepository: Record<string, jest.Mock>;
  let tourRepository: Record<string, jest.Mock>;
  let venuesService: { getOrCreateGenericVenue: jest.Mock };
  let manager: jest.Mock & { getRepository: jest.Mock };
  let eventManager: jest.Mock & { transaction: jest.Mock };

  beforeEach(() => {
    eventRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'event-id' })),
      findOne: jest.fn(async () => ({ ...event, lineup: [] })),
      findOneBy: jest.fn(async () => ({ ...event })),
      existsBy: jest.fn(async () => true),
      delete: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(),
    };
    eventArtistRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      delete: jest.fn(async () => ({ affected: 1 })),
      existsBy: jest.fn(async () => false),
      findOne: jest.fn(async () => ({
        id: 'event-artist-id',
        eventId: 'festival-id',
        artistId: null,
        name: 'Guest act',
        position: 1,
        tourId: null,
      })),
    };
    artistRepository = {
      find: jest.fn(async () => [{ id: 'artist-id' }]),
    };
    venueRepository = {
      findOneBy: jest.fn(async () => ({
        id: 'venue-id',
        localityId: 'locality-id',
      })),
      manager: null,
    };
    tourRepository = {
      existsBy: jest.fn(async () => true),
      find: jest.fn(async () => [{ id: 'tour-id' }]),
    };
    manager = Object.assign(jest.fn(), {
      getRepository: jest.fn(
        (
          entity:
            | typeof Event
            | typeof EventArtist
            | typeof Artist
            | typeof Venue
            | typeof Tour,
        ) => {
          if (entity === Event) return eventRepository;
          if (entity === EventArtist) return eventArtistRepository;
          if (entity === Artist) return artistRepository;
          if (entity === Venue) return venueRepository;
          return tourRepository;
        },
      ),
    });
    venueRepository.manager = manager;
    eventManager = Object.assign(jest.fn(), {
      transaction: jest.fn(
        (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
      ),
    });
    eventRepository.manager = eventManager;
    venuesService = { getOrCreateGenericVenue: jest.fn() };
    service = new EventsService(
      eventRepository as never,
      venuesService as never,
    );
  });

  it('creates a concert with a venue, free text and ordered known and unknown artists', async () => {
    const dto: CreateEventDto = {
      type: EventType.CONCERT,
      startDate: '2027-04-15',
      venueId: 'venue-id',
      price: 'Desde 35€',
      otherInfo: 'Puertas 19:00',
      lineup: [
        { artistId: 'artist-id', name: 'Architects' },
        { artistId: null, name: 'Banda Desconocida' },
      ],
    };
    await expect(service.create(dto)).resolves.toMatchObject({
      id: 'event-id',
      startDate: '2027-04-15',
    });
    expect(eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: 'venue-id',
        tourId: null,
        price: 'Desde 35€',
      }),
    );
    expect(eventArtistRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        artistId: 'artist-id',
        tourId: null,
        name: 'Architects',
        position: 1,
      }),
      expect.objectContaining({
        artistId: null,
        tourId: null,
        name: 'Banda Desconocida',
        position: 2,
      }),
    ]);
  });

  it('associates only existing tours with concerts and preserves each event lineup independently', async () => {
    await service.create({
      type: EventType.CONCERT,
      startDate: '2027-04-15',
      venueId: 'venue-id',
      tourId: 'tour-id',
      lineup: [{ artistId: 'artist-id', name: 'Architects' }],
    });
    expect(eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tourId: 'tour-id', type: EventType.CONCERT }),
    );
    expect(eventArtistRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        eventId: 'event-id',
        name: 'Architects',
        position: 1,
      }),
    ]);

    await expect(
      service.create({
        type: EventType.FESTIVAL,
        startDate: '2027-08-01',
        venueId: 'venue-id',
        tourId: 'tour-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    tourRepository.existsBy.mockResolvedValueOnce(false);
    await expect(
      service.create({
        type: EventType.CONCERT,
        startDate: '2027-04-15',
        venueId: 'venue-id',
        tourId: 'missing-tour',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores separate lineups for dates in the same tour, even when an artist repeats', async () => {
    let savedEventCount = 0;
    eventRepository.save.mockImplementation(async (value) => ({
      ...value,
      id: `event-${++savedEventCount}`,
    }));
    await service.create({
      type: EventType.CONCERT,
      startDate: '2027-02-12',
      venueId: 'venue-id',
      tourId: 'tour-id',
      lineup: [{ artistId: 'artist-id', name: 'Machine Head' }],
    });
    await service.create({
      type: EventType.CONCERT,
      startDate: '2027-02-14',
      venueId: 'venue-id',
      tourId: 'tour-id',
      lineup: [
        { artistId: 'artist-id', name: 'Machine Head' },
        { artistId: null, name: 'Support' },
      ],
    });
    expect(eventArtistRepository.save).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        eventId: 'event-1',
        artistId: 'artist-id',
        position: 1,
      }),
    ]);
    expect(eventArtistRepository.save).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        eventId: 'event-2',
        artistId: 'artist-id',
        position: 1,
      }),
      expect.objectContaining({
        eventId: 'event-2',
        artistId: null,
        position: 2,
      }),
    ]);
  });

  it('associates individual festival performances with different tours, including an unknown artist', async () => {
    const tourIds = ['tour-1', 'tour-2', 'tour-3', 'tour-4', 'tour-5'];
    const names = [
      'Machine Head',
      'Gojira',
      'Architects',
      'Jinjer',
      'Kvelertak',
    ];
    artistRepository.find.mockResolvedValueOnce(
      names.slice(0, 4).map((_name, index) => ({ id: `artist-${index + 1}` })),
    );
    tourRepository.find.mockResolvedValueOnce(tourIds.map((id) => ({ id })));
    await service.create({
      type: EventType.FESTIVAL,
      startDate: '2027-08-01',
      venueId: 'venue-id',
      lineup: names.map((name, index) => ({
        artistId: index === 4 ? null : `artist-${index + 1}`,
        name,
        tourId: tourIds[index],
      })),
    });
    expect(tourRepository.find).toHaveBeenCalledTimes(1);
    expect(eventArtistRepository.save).toHaveBeenCalledWith(
      names.map((name, index) =>
        expect.objectContaining({
          eventId: 'event-id',
          artistId: index === 4 ? null : `artist-${index + 1}`,
          name,
          tourId: tourIds[index],
          position: index + 1,
        }),
      ),
    );
  });

  it('rejects lineup tour associations on concerts and rejects missing lineup tours', async () => {
    await expect(
      service.create({
        type: EventType.CONCERT,
        startDate: '2027-04-15',
        venueId: 'venue-id',
        lineup: [{ artistId: null, name: 'Support', tourId: 'tour-id' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    tourRepository.find.mockResolvedValueOnce([]);
    await expect(
      service.create({
        type: EventType.FESTIVAL,
        startDate: '2027-08-01',
        venueId: 'venue-id',
        lineup: [{ artistId: null, name: 'Unknown', tourId: 'missing-tour' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventRepository.save).not.toHaveBeenCalled();
  });

  it('associates, changes and unlinks only the requested festival performance transactionally', async () => {
    eventRepository.findOne.mockResolvedValue({
      id: 'festival-id',
      type: EventType.FESTIVAL,
    });
    const performance = {
      id: 'event-artist-id',
      eventId: 'festival-id',
      artistId: null,
      name: 'Guest act',
      position: 1,
      tourId: null,
    };
    eventArtistRepository.findOne.mockResolvedValue(performance);
    for (const tourId of ['tour-one', 'tour-two', null]) {
      await expect(
        service.updateArtistTour('festival-id', 'event-artist-id', {
          tourId,
        } satisfies UpdateEventArtistTourDto),
      ).resolves.toMatchObject({ id: 'event-artist-id', tourId });
      expect(eventArtistRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 'event-artist-id',
          eventId: 'festival-id',
          artistId: null,
          name: 'Guest act',
          position: 1,
          tourId,
        }),
      );
    }
    expect(eventManager.transaction).toHaveBeenCalledTimes(3);
    expect(eventRepository.save).not.toHaveBeenCalled();
    expect(eventArtistRepository.delete).not.toHaveBeenCalled();
  });

  it('rejects missing events, concerts, another festival lineup, and nonexistent tours without saving', async () => {
    eventRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateArtistTour('missing-event', 'event-artist-id', {
        tourId: null,
      }),
    ).rejects.toMatchObject({ status: 404 });

    eventRepository.findOne.mockResolvedValueOnce({
      id: 'concert-id',
      type: EventType.CONCERT,
    });
    await expect(
      service.updateArtistTour('concert-id', 'event-artist-id', {
        tourId: 'tour-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    eventRepository.findOne.mockResolvedValueOnce({
      id: 'festival-id',
      type: EventType.FESTIVAL,
    });
    eventArtistRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateArtistTour('festival-id', 'other-performance', {
        tourId: null,
      }),
    ).rejects.toMatchObject({ status: 404 });

    eventRepository.findOne.mockResolvedValueOnce({
      id: 'festival-id',
      type: EventType.FESTIVAL,
    });
    eventArtistRepository.findOne.mockResolvedValueOnce({
      id: 'event-artist-id',
      eventId: 'festival-id',
      tourId: null,
    });
    tourRepository.existsBy.mockResolvedValueOnce(false);
    await expect(
      service.updateArtistTour('festival-id', 'event-artist-id', {
        tourId: 'missing-tour',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(eventArtistRepository.save).not.toHaveBeenCalled();
  });

  it('requires tourId explicitly and rejects additional payload properties', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        { tourId: null },
        {
          type: 'body',
          metatype: UpdateEventArtistTourDto,
        },
      ),
    ).resolves.toMatchObject({ tourId: null });
    await expect(
      pipe.transform(
        { tourId: 'not-a-uuid' },
        {
          type: 'body',
          metatype: UpdateEventArtistTourDto,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        {},
        {
          type: 'body',
          metatype: UpdateEventArtistTourDto,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        { tourId: null, name: 'Nope' },
        {
          type: 'body',
          metatype: UpdateEventArtistTourDto,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('validates calendar dates and returns filtered, paginated listings', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const valid = {
      type: EventType.CONCERT,
      startDate: '2028-02-29',
      venueId: '71d89784-68a4-412f-823b-520b182e4580',
    };
    const validLineupItem = {
      artistId: '71d89784-68a4-412f-823b-520b182e4580',
      name: 'Machine Head',
      tourId: 'b77ea7bb-83f6-4d1f-b638-5cebf4310136',
    };
    await expect(
      pipe.transform(validLineupItem, {
        type: 'body',
        metatype: EventLineupItemDto,
      }),
    ).resolves.toMatchObject({ tourId: validLineupItem.tourId });
    await expect(
      pipe.transform(
        { ...validLineupItem, tourId: 'invalid' },
        {
          type: 'body',
          metatype: EventLineupItemDto,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(valid, { type: 'body', metatype: CreateEventDto }),
    ).resolves.toMatchObject({ startDate: '2028-02-29' });
    for (const invalid of [
      { ...valid, startDate: '2027-02-29' },
      { ...valid, startDate: '2028-02-29T00:00:00Z' },
    ]) {
      await expect(
        pipe.transform(invalid, { type: 'body', metatype: CreateEventDto }),
      ).rejects.toMatchObject({ status: 400 });
    }

    const builder = {
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ id: 'event-id' }]),
      getCount: jest.fn().mockResolvedValue(21),
      getMany: jest.fn().mockResolvedValue([{ id: 'event-id' }]),
    };
    eventRepository.createQueryBuilder.mockReturnValue(builder);
    await expect(
      service.findAll(
        Object.assign(new EventsQueryDto(), {
          limit: 10,
          offset: 10,
          type: EventType.FESTIVAL,
          dateFrom: '2027-08-01',
          dateTo: '2027-08-31',
          venueId: 'venue-id',
          administrativeRegionId: 'region-id',
          tourId: 'tour-id',
        }),
      ),
    ).resolves.toMatchObject({
      totalItems: 21,
      totalPages: 3,
      currentPage: 2,
      limit: 10,
    });
    expect(builder.andWhere).toHaveBeenCalledTimes(6);
    expect(builder.limit).toHaveBeenCalledWith(10);
    expect(builder.offset).toHaveBeenCalledWith(10);
  });

  it('creates a festival and resolves its locality through the venue domain', async () => {
    venuesService.getOrCreateGenericVenue.mockResolvedValue({
      id: 'generic-venue-id',
      isGeneric: true,
    });
    venueRepository.findOneBy.mockImplementation(async (where) =>
      where.id === 'generic-venue-id' ? { id: 'generic-venue-id' } : null,
    );
    await service.create({
      type: EventType.FESTIVAL,
      startDate: '2027-08-01',
      endDate: '2027-08-03',
      localityId: 'locality-id',
    });
    expect(venuesService.getOrCreateGenericVenue).toHaveBeenCalledWith(
      'locality-id',
      manager,
    );
    expect(eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EventType.FESTIVAL,
        venueId: 'generic-venue-id',
        name: null,
        endDate: '2027-08-03',
      }),
    );
  });

  it('rejects missing locations, contradictory locations, reversed dates and unknown artist IDs before persistence', async () => {
    await expect(
      service.create({ type: EventType.CONCERT, startDate: '2027-04-15' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({
        type: EventType.CONCERT,
        startDate: '2027-04-15',
        endDate: '2027-04-14',
        venueId: 'venue-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    venueRepository.findOneBy.mockResolvedValueOnce({
      id: 'venue-id',
      localityId: 'elsewhere',
    });
    await expect(
      service.create({
        type: EventType.CONCERT,
        startDate: '2027-04-15',
        venueId: 'venue-id',
        localityId: 'locality-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    artistRepository.find.mockResolvedValueOnce([]);
    await expect(
      service.create({
        type: EventType.CONCERT,
        startDate: '2027-04-15',
        venueId: 'venue-id',
        lineup: [{ artistId: 'missing-artist', name: 'Unknown ID' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventRepository.save).not.toHaveBeenCalled();
  });

  it('replaces the lineup and deletes relations before deleting an event', async () => {
    await service.update('event-id', {
      lineup: [{ artistId: null, name: 'New artist' }],
      endDate: null,
    });
    expect(eventArtistRepository.delete).toHaveBeenCalledWith({
      eventId: 'event-id',
    });
    expect(eventArtistRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        artistId: null,
        tourId: null,
        name: 'New artist',
        position: 1,
      }),
    ]);
    expect(eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tourId: 'tour-id' }),
    );
    await service.update('event-id', { tourId: null });
    expect(eventRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ tourId: null }),
    );
    await expect(service.remove('event-id')).resolves.toEqual({ affected: 1 });
    expect(eventArtistRepository.delete).toHaveBeenLastCalledWith({
      eventId: 'event-id',
    });
    expect(eventRepository.delete).toHaveBeenCalledWith({ id: 'event-id' });
  });

  it('preserves lineup on PATCH without lineup and rejects incompatible type transitions until relations are removed', async () => {
    await service.update('event-id', { name: 'Renamed' });
    expect(eventArtistRepository.delete).not.toHaveBeenCalled();

    eventRepository.findOneBy.mockResolvedValueOnce({
      ...event,
      type: EventType.FESTIVAL,
      tourId: null,
    });
    eventArtistRepository.existsBy.mockResolvedValueOnce(true);
    await expect(
      service.update('event-id', { type: EventType.CONCERT }),
    ).rejects.toBeInstanceOf(BadRequestException);

    eventRepository.findOneBy.mockResolvedValueOnce({
      ...event,
      type: EventType.FESTIVAL,
      tourId: null,
    });
    await service.update('event-id', {
      type: EventType.CONCERT,
      lineup: [{ artistId: null, name: 'Cleared act' }],
    });
    expect(eventArtistRepository.delete).toHaveBeenCalledWith({
      eventId: 'event-id',
    });

    await expect(
      service.update('event-id', { type: EventType.FESTIVAL }),
    ).rejects.toBeInstanceOf(BadRequestException);
    eventRepository.findOneBy.mockResolvedValueOnce({
      ...event,
      type: EventType.CONCERT,
      tourId: 'tour-id',
    });
    await service.update('event-id', {
      type: EventType.FESTIVAL,
      tourId: null,
    });
    expect(eventRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: EventType.FESTIVAL, tourId: null }),
    );
  });

  it('persists event type before inserting festival performances in the same PATCH transaction', async () => {
    await service.update('event-id', {
      type: EventType.FESTIVAL,
      tourId: null,
      lineup: [{ artistId: null, name: 'Unknown act', tourId: 'tour-id' }],
    });
    const deleteOrder =
      eventArtistRepository.delete.mock.invocationCallOrder[0];
    const eventSaveOrder = eventRepository.save.mock.invocationCallOrder[0];
    const lineupSaveOrder =
      eventArtistRepository.save.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(eventSaveOrder);
    expect(eventSaveOrder).toBeLessThan(lineupSaveOrder);
    expect(eventArtistRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ tourId: 'tour-id', position: 1 }),
    ]);
  });
});
