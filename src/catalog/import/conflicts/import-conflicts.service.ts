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

// A request has at most 100 event rows and up to 100 lineup entries per row.
// Grouping 25 rows keeps the expanded artist parameter list below 2,501 values
// and avoids broad date ranges across unrelated cities or distant dates.
const MAX_ROWS_PER_QUERY = 25;

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
    const repository = manager?.getRepository(Event) ?? this.eventRepository;
    const candidatesById = new Map<string, ExistingImportEventCandidate>();
    const relevantLocalities = new Set(localityIds);
    for (let offset = 0; offset < rows.length; offset += MAX_ROWS_PER_QUERY) {
      const batchRows = rows
        .slice(offset, offset + MAX_ROWS_PER_QUERY)
        .filter((row) =>
          row.locality.localityId
            ? relevantLocalities.has(row.locality.localityId)
            : false,
        );
      if (!batchRows.length) continue;
      const localityBatch = [
        ...new Set(
          batchRows.flatMap((row) =>
            row.locality.localityId ? [row.locality.localityId] : [],
          ),
        ),
      ];
      const from = batchRows.reduce(
        (date, row) => (row.startDate < date ? row.startDate : date),
        batchRows[0].startDate,
      );
      const to = batchRows.reduce((date, row) => {
        const endDate = row.endDate ?? row.startDate;
        return endDate > date ? endDate : date;
      }, batchRows[0].endDate ?? batchRows[0].startDate);
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
        .where('venue.localityId IN (:...localityIds)', {
          localityIds: localityBatch,
        })
        .andWhere('event.startDate <= :toDate', { toDate: to })
        .andWhere('COALESCE(event.endDate, event.startDate) >= :fromDate', {
          fromDate: from,
        })
        .andWhere('event.type IN (:...types)', {
          types: [EventType.CONCERT, EventType.FESTIVAL],
        })
        .orderBy('event.id', 'ASC')
        .addOrderBy('lineup.position', 'ASC')
        .getMany();

      for (const event of events) {
        candidatesById.set(event.id, {
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
        });
      }
    }

    return [...candidatesById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }
}
