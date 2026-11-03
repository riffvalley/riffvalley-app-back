import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Event, EventType } from '../../events/entities/event.entity';
import { EventArtist } from '../../events/entities/event-artist.entity';
import { analyzeImportConflicts } from './helpers/analyze-import-conflicts';
import {
  ExistingImportEventCandidate,
  ImportConflictAnalysis,
  ImportConflictRow,
} from './import-conflicts.types';

@Injectable()
export class ImportConflictsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  async inspect(
    rows: ImportConflictRow[],
    manager?: EntityManager,
  ): Promise<ImportConflictAnalysis[]> {
    const localities = [
      ...new Set(
        rows
          .map((row) => row.locality.localityId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const persistedCandidates = localities.length
      ? await this.findCandidates(rows, localities, manager)
      : [];
    return analyzeImportConflicts(rows, persistedCandidates);
  }

  private async findCandidates(
    rows: ImportConflictRow[],
    localityIds: string[],
    manager?: EntityManager,
  ): Promise<ExistingImportEventCandidate[]> {
    if (!rows.length) return [];
    const artistIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.artists
            .filter((artist) => artist.status === 'existing')
            .map((artist) => artist.artistId)
            .filter((artistId): artistId is string => Boolean(artistId)),
        ),
      ),
    ];
    const from = rows.reduce(
      (date, row) => (row.startDate < date ? row.startDate : date),
      rows[0].startDate,
    );
    const to = rows.reduce((date, row) => {
      const endDate = row.endDate ?? row.startDate;
      return endDate > date ? endDate : date;
    }, rows[0].endDate ?? rows[0].startDate);
    const repository = manager?.getRepository(Event) ?? this.eventRepository;
    const events = await repository
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.venue', 'venue')
      .leftJoinAndSelect('event.lineup', 'lineup')
      .select([
        'event.id',
        'event.type',
        'event.name',
        'event.startDate',
        'event.endDate',
        'venue.id',
        'venue.localityId',
        'lineup.id',
        'lineup.artistId',
        'lineup.name',
        'lineup.position',
      ])
      .where('venue.localityId IN (:...localityIds)', { localityIds })
      .andWhere('event.startDate <= :toDate', { toDate: to })
      .andWhere('COALESCE(event.endDate, event.startDate) >= :fromDate', {
        fromDate: from,
      })
      .andWhere('event.type IN (:...types)', {
        types: [EventType.CONCERT, EventType.FESTIVAL],
      })
      .andWhere(
        artistIds.length
          ? '(event.type = :festivalType OR lineup.artistId IS NULL OR lineup.artistId IN (:...artistIds))'
          : '(event.type = :festivalType OR lineup.artistId IS NULL)',
        {
          festivalType: EventType.FESTIVAL,
          ...(artistIds.length ? { artistIds } : {}),
        },
      )
      .orderBy('event.id', 'ASC')
      .addOrderBy('lineup.position', 'ASC')
      .getMany();

    return events.map((event) => ({
      id: event.id,
      type: event.type,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      localityId: event.venue?.localityId ?? '',
      lineup: (event.lineup ?? []).map((artist: EventArtist) => ({
        artistId: artist.artistId,
        name: artist.name,
      })),
    }));
  }
}
