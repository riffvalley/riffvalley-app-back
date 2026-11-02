import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { EventArtist } from '../events/entities/event-artist.entity';
import { CreateTourDto } from './dto/create-tour.dto';
import { ToursQueryDto } from './dto/tours-query.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { Tour } from './entities/tour.entity';

type TourParticipationRow = {
  eventId: string;
  participationType: 'concert' | 'festival-performance';
  eventArtistId: string | null;
};

function parseParticipationRows(value: unknown): TourParticipationRow[] {
  if (!Array.isArray(value))
    throw new Error('Unexpected tour participation query result');
  return value.map((row: unknown) => {
    if (typeof row !== 'object' || row === null)
      throw new Error('Unexpected tour participation row');
    const data = row as Record<string, unknown>;
    const eventArtistId = data.eventArtistId;
    if (typeof data.eventId !== 'string')
      throw new Error('Invalid tour participation row');
    if (
      data.participationType !== 'concert' &&
      data.participationType !== 'festival-performance'
    )
      throw new Error('Invalid tour participation row');
    if (eventArtistId !== null && typeof eventArtistId !== 'string')
      throw new Error('Invalid tour participation row');
    return {
      eventId: data.eventId,
      participationType: data.participationType,
      eventArtistId: typeof eventArtistId === 'string' ? eventArtistId : null,
    };
  });
}

function parseCount(value: unknown): number {
  if (
    !Array.isArray(value) ||
    typeof value[0] !== 'object' ||
    value[0] === null
  )
    throw new Error('Unexpected tour participation count result');
  const total = (value[0] as Record<string, unknown>).total;
  const parsed = typeof total === 'number' ? total : Number(total);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error('Invalid tour participation count');
  return parsed;
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23503'
  );
}

@Injectable()
export class ToursService {
  constructor(
    @InjectRepository(Tour)
    private readonly tourRepository: Repository<Tour>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(EventArtist)
    private readonly eventArtistRepository: Repository<EventArtist>,
  ) {}

  async create(dto: CreateTourDto): Promise<Tour> {
    const tour = this.tourRepository.create({
      name: dto.name.trim(),
      description: dto.description ?? null,
    });
    return this.tourRepository.save(tour);
  }

  async findAll(query: ToursQueryDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const [data, totalItems] = await this.tourRepository
      .createQueryBuilder('tour')
      .orderBy('tour.name', 'ASC')
      .addOrderBy('tour.id', 'ASC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();
    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      data,
    };
  }

  async findOne(id: string, query: ToursQueryDto) {
    const tour = await this.tourRepository.findOneBy({ id });
    if (!tour) throw new NotFoundException(`Tour with id ${id} not found`);

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const participationSql = `
      SELECT participation."eventId", participation."participationType", participation."eventArtistId"
      FROM (
        SELECT event.id AS "eventId", 'concert'::text AS "participationType",
               NULL::uuid AS "eventArtistId", event.start_date AS "startDate",
               0 AS position
        FROM events event
        WHERE event.tour_id = $1
        UNION ALL
        SELECT event.id AS "eventId", 'festival-performance'::text AS "participationType",
               event_artist.id AS "eventArtistId", event.start_date AS "startDate",
               event_artist.position AS position
        FROM event_artists event_artist
        INNER JOIN events event ON event.id = event_artist.event_id
        WHERE event_artist.tour_id = $1 AND event.type = 'festival'
      ) participation
      ORDER BY participation."startDate" ASC, participation."eventId" ASC, participation.position ASC
      LIMIT $2 OFFSET $3
    `;
    const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT event.id AS "eventId", NULL::uuid AS "eventArtistId"
        FROM events event
        WHERE event.tour_id = $1
        UNION ALL
        SELECT event.id AS "eventId", event_artist.id AS "eventArtistId"
        FROM event_artists event_artist
        INNER JOIN events event ON event.id = event_artist.event_id
        WHERE event_artist.tour_id = $1 AND event.type = 'festival'
      ) participations
    `;
    const [rawRows, rawCount] = await Promise.all([
      this.eventRepository.query(participationSql, [id, limit, offset]),
      this.eventRepository.query(countSql, [id]),
    ]);
    const rows = parseParticipationRows(rawRows);
    const totalItems = parseCount(rawCount);
    const eventIds = [...new Set(rows.map((row) => row.eventId))];
    const eventArtistIds = rows
      .map((row) => row.eventArtistId)
      .filter(
        (eventArtistId): eventArtistId is string => eventArtistId !== null,
      );
    const [events, performanceArtists] = await Promise.all([
      eventIds.length
        ? this.eventRepository.find({
            where: { id: In(eventIds) },
            relations: {
              venue: { locality: { administrativeRegion: { country: true } } },
              lineup: { artist: true },
            },
            order: { lineup: { position: 'ASC' } },
          })
        : Promise.resolve([]),
      eventArtistIds.length
        ? this.eventArtistRepository.find({
            where: { id: In(eventArtistIds) },
            relations: { artist: true },
          })
        : Promise.resolve([]),
    ]);
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const artistsById = new Map(
      performanceArtists.map((performance) => [performance.id, performance]),
    );
    const data = rows.flatMap((row) => {
      const event = eventsById.get(row.eventId);
      if (!event) return [];
      if (!row.eventArtistId)
        return [
          {
            ...event,
            participationType: row.participationType,
            participatingArtist: null,
          },
        ];
      const performance = artistsById.get(row.eventArtistId);
      if (!performance) return [];
      return [
        {
          ...event,
          participationType: row.participationType,
          participatingArtist: {
            id: performance.id,
            artistId: performance.artistId,
            name: performance.name,
            position: performance.position,
            artist: performance.artist,
          },
        },
      ];
    });

    return {
      tour,
      events: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: Math.floor(offset / limit) + 1,
        limit,
        data,
      },
    };
  }

  async update(id: string, dto: UpdateTourDto): Promise<Tour> {
    const tour = await this.tourRepository.findOneBy({ id });
    if (!tour) throw new NotFoundException(`Tour with id ${id} not found`);
    if (dto.name !== undefined) tour.name = dto.name.trim();
    if (dto.description !== undefined) tour.description = dto.description;
    return this.tourRepository.save(tour);
  }

  async remove(id: string): Promise<{ affected: number }> {
    try {
      return await this.tourRepository.manager.transaction(async (manager) => {
        const tourRepository = manager.getRepository(Tour);
        const tour = await tourRepository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!tour) throw new NotFoundException(`Tour with id ${id} not found`);
        if (
          (await manager.getRepository(Event).existsBy({ tourId: id })) ||
          (await manager.getRepository(EventArtist).existsBy({ tourId: id }))
        )
          throw new ConflictException(
            'Unlink all events and festival performances from the tour before deleting it',
          );
        const result = await tourRepository.delete({ id });
        return { affected: result.affected ?? 0 };
      });
    } catch (error) {
      if (isForeignKeyViolation(error))
        throw new ConflictException(
          'Unlink all events and festival performances from the tour before deleting it',
        );
      throw error;
    }
  }
}
