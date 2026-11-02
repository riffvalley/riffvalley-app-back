import { ConflictException, NotFoundException } from '@nestjs/common';
import { Event } from '../../events/entities/event.entity';
import { EventArtist } from '../../events/entities/event-artist.entity';
import { CreateTourDto } from '../dto/create-tour.dto';
import { ToursQueryDto } from '../dto/tours-query.dto';
import { Tour } from '../entities/tour.entity';
import { ToursService } from '../tours.service';

describe('ToursService', () => {
  let service: ToursService;
  let tours: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let eventArtists: Record<string, jest.Mock>;
  let manager: jest.Mock & { getRepository: jest.Mock };

  beforeEach(() => {
    tours = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'tour-id' })),
      findOneBy: jest.fn(async () => ({
        id: 'tour-id',
        name: 'Winter Tour',
        normalizedName: 'winter tour',
      })),
      findOne: jest.fn(async () => ({ id: 'tour-id', name: 'Winter Tour' })),
      delete: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(),
    };
    events = {
      existsBy: jest.fn(async () => false),
      createQueryBuilder: jest.fn(),
      query: jest.fn(),
      find: jest.fn(async () => []),
    };
    eventArtists = { existsBy: jest.fn(async () => false), find: jest.fn() };
    manager = Object.assign(jest.fn(), {
      getRepository: jest.fn(
        (entity: typeof Tour | typeof Event | typeof EventArtist) =>
          entity === Tour ? tours : entity === Event ? events : eventArtists,
      ),
    });
    tours.manager = Object.assign(jest.fn(), {
      transaction: jest.fn(
        (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
      ),
    });
    service = new ToursService(
      tours as never,
      events as never,
      eventArtists as never,
    );
  });

  it('creates and updates a named tour without artists or derived dates', async () => {
    await expect(
      service.create({
        name: '  Machine Head — Gira de invierno  ',
        description: 'Europe',
      }),
    ).resolves.toMatchObject({
      id: 'tour-id',
      name: 'Machine Head — Gira de invierno',
      description: 'Europe',
    });
    expect(tours.create).toHaveBeenCalledWith({
      name: 'Machine Head — Gira de invierno',
      normalizedName: 'machine head — gira de invierno',
      description: 'Europe',
    });

    tours.findOneBy.mockResolvedValueOnce({
      id: 'tour-id',
      name: 'Old name',
      normalizedName: 'old name',
      description: null,
    });
    await expect(
      service.update('tour-id', { name: 'New name', description: 'Updated' }),
    ).resolves.toMatchObject({ name: 'New name', description: 'Updated' });
    expect(tours.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'tour-id',
        name: 'New name',
        normalizedName: 'new name',
      }),
    );
  });

  it('translates PostgreSQL normalized-name collisions to a controlled conflict', async () => {
    tours.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'UQ_tours_normalized_name',
    });
    await expect(
      service.create({ name: 'SEPTICFLESH European Tour 2027' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates normalized names atomically with the visible name', async () => {
    tours.findOneBy.mockResolvedValueOnce({
      id: 'tour-id',
      name: 'Old name',
      normalizedName: 'old name',
      description: null,
    });
    tours.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'UQ_tours_normalized_name',
    });
    await expect(
      service.update('tour-id', { name: '  SEPTICFLESH European Tour 2027 ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tours.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'SEPTICFLESH European Tour 2027',
        normalizedName: 'septicflesh european tour 2027',
      }),
    );
  });

  it('resolves Tour names by exact normalized equality without creating one', async () => {
    tours.findOneBy.mockResolvedValueOnce({
      id: 'tour-id',
      name: 'Septicflesh European Tour 2027',
      normalizedName: 'septicflesh european tour 2027',
    });
    await expect(
      service.findExactByName('  SEPTICFLESH   European Tour 2027  '),
    ).resolves.toMatchObject({ id: 'tour-id' });
    expect(tours.findOneBy).toHaveBeenCalledWith({
      normalizedName: 'septicflesh european tour 2027',
    });
    expect(tours.create).not.toHaveBeenCalled();
    expect(tours.save).not.toHaveBeenCalled();

    tours.findOneBy.mockResolvedValueOnce(null);
    await expect(service.findExactByName('No such tour')).resolves.toBeNull();
  });

  it('lists tours with offset pagination', async () => {
    const builder = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'tour-id' }], 23]),
    };
    tours.createQueryBuilder.mockReturnValue(builder);
    await expect(
      service.findAll(
        Object.assign(new ToursQueryDto(), { limit: 10, offset: 20 }),
      ),
    ).resolves.toMatchObject({
      totalItems: 23,
      totalPages: 3,
      currentPage: 3,
      limit: 10,
    });
    expect(builder.take).toHaveBeenCalledWith(10);
    expect(builder.skip).toHaveBeenCalledWith(20);
  });

  it('returns a paginated chronological mix of concerts and festival performances', async () => {
    tours.findOneBy.mockResolvedValue({ id: 'tour-id', name: 'Winter Tour' });
    events.query
      .mockResolvedValueOnce([
        {
          eventId: 'concert-id',
          participationType: 'concert',
          eventArtistId: null,
        },
        {
          eventId: 'festival-id',
          participationType: 'festival-performance',
          eventArtistId: 'performance-id',
        },
      ])
      .mockResolvedValueOnce([{ total: '31' }]);
    events.find.mockResolvedValue([
      { id: 'concert-id', startDate: '2027-03-01', lineup: [] },
      { id: 'festival-id', startDate: '2027-04-01', lineup: [] },
    ]);
    eventArtists.find.mockResolvedValue([
      {
        id: 'performance-id',
        artistId: null,
        name: 'Guest act',
        position: 2,
        artist: null,
      },
    ]);
    await expect(
      service.findOne(
        'tour-id',
        Object.assign(new ToursQueryDto(), { limit: 10, offset: 10 }),
      ),
    ).resolves.toMatchObject({
      tour: { id: 'tour-id' },
      events: {
        totalItems: 31,
        totalPages: 4,
        currentPage: 2,
        limit: 10,
        data: [
          {
            id: 'concert-id',
            participationType: 'concert',
            participatingArtist: null,
          },
          {
            id: 'festival-id',
            participationType: 'festival-performance',
            participatingArtist: {
              id: 'performance-id',
              artistId: null,
              name: 'Guest act',
              position: 2,
              artist: null,
            },
          },
        ],
      },
    });
    expect(events.query.mock.calls[0][0]).toContain("'festival-performance'");
    expect(events.query.mock.calls[0][0]).toContain('ORDER BY');
    expect(events.query.mock.calls[0][1]).toEqual(['tour-id', 10, 10]);
    expect(eventArtists.find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: { artist: true } }),
    );
  });

  it('rejects deleting a tour with events and allows deletion after unlinking', async () => {
    events.existsBy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.remove('tour-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tours.delete).not.toHaveBeenCalled();
    await expect(service.remove('tour-id')).resolves.toEqual({ affected: 1 });
    expect(tours.delete).toHaveBeenCalledWith({ id: 'tour-id' });
  });

  it('rejects deleting a tour that has only festival performance relationships', async () => {
    eventArtists.existsBy.mockResolvedValueOnce(true);
    await expect(service.remove('tour-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tours.delete).not.toHaveBeenCalled();
  });

  it('reports missing tours for detail and update', async () => {
    tours.findOneBy.mockResolvedValue(null);
    await expect(
      service.findOne('missing', new ToursQueryDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update('missing', { name: 'Any' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts an ordinary creation contract without optional description', async () => {
    const dto: CreateTourDto = { name: 'Independent Tour' };
    await service.create(dto);
    expect(tours.create).toHaveBeenLastCalledWith({
      name: 'Independent Tour',
      normalizedName: 'independent tour',
      description: null,
    });
  });
});
