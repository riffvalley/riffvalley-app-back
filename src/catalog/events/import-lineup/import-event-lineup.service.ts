import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { compareNormalizedMusicNames } from '../../shared/music-name/normalize-music-name';
import { EventArtist } from '../entities/event-artist.entity';
import { Event, EventType } from '../entities/event.entity';
import { Venue } from '../../venues/entities/venue.entity';
import { ImportEventLineupDto } from '../dto/import-lineup.dto';
import { ImportConflictsService } from '../../import/conflicts/import-conflicts.service';
import { ImportConflictRow } from '../../import/conflicts/import-conflicts.types';
import { ImportEntityResolversService } from '../../import/resolution/import-entity-resolvers.service';
import { ImportRowReceiptsService } from '../../import/receipts/import-row-receipts.service';
import {
  ImportReceiptJsonValue,
  ImportReceiptResult,
} from '../../import/receipts/entities/import-row-receipt.entity';
import { EntityManager } from 'typeorm';

export interface LineupArtistResult {
  artistId: string;
  name: string;
  position?: number;
}

export interface LineupExpansionResult {
  status: 'updated';
  eventId: string;
  addedArtists: LineupArtistResult[];
  existingArtists: LineupArtistResult[];
}

@Injectable()
export class ImportEventLineupService {
  constructor(
    private readonly resolvers: ImportEntityResolversService,
    private readonly conflicts: ImportConflictsService,
    private readonly receipts: ImportRowReceiptsService,
  ) {}

  async expand(
    editorId: string,
    eventId: string,
    dto: ImportEventLineupDto,
  ): Promise<LineupExpansionResult> {
    if (dto.sourceRow.rowId !== dto.rowId)
      throw this.staleConflict('The source row identity does not match rowId');

    const content = this.receiptContent(eventId, dto);
    const execution = await this.receipts.execute(
      {
        editorId,
        batchId: dto.batchId,
        rowId: dto.rowId,
        operation: 'expand-lineup',
      },
      content,
      (manager) => this.apply(manager, eventId, dto),
    );
    return this.decodeResult(execution.result);
  }

  private async apply(
    manager: EntityManager,
    eventId: string,
    dto: ImportEventLineupDto,
  ): Promise<ImportReceiptResult> {
    const eventRepository = manager.getRepository(Event);
    const event = await eventRepository.findOne({
      where: { id: eventId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!event)
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'The event does not exist',
      });

    const venue = await manager
      .getRepository(Venue)
      .findOneBy({ id: event.venueId });
    if (!venue) throw this.staleConflict('The event venue no longer exists');

    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 731908))',
      [`event-import:${venue.localityId}`],
    );

    const lineupRepository = manager.getRepository(EventArtist);
    const currentLineup = await lineupRepository.find({
      where: { eventId },
      order: { position: 'ASC' },
    });
    const source = dto.sourceRow;
    const expectedType =
      source.type === 'festival' ? EventType.FESTIVAL : EventType.CONCERT;
    if (
      event.type !== expectedType ||
      event.startDate !== source.startDate ||
      (source.type === 'festival' &&
        (event.endDate ?? event.startDate) !==
          (source.endDate ?? source.startDate))
    )
      throw this.staleConflict('The event no longer matches the source row');

    const locality = await this.resolvers.inspectLocality(
      {
        city: source.city,
        province: source.province,
        countryId: source.countryId,
        administrativeRegionId: source.administrativeRegionId,
      },
      manager,
    );
    if (
      locality.status !== 'existing' ||
      locality.entity?.id !== venue.localityId
    )
      throw this.staleConflict(
        'The event locality no longer matches the source row',
      );

    const sourceArtists = source.lineup ?? [];
    const sourceResolutions = await this.resolvers.inspectArtists(
      sourceArtists.map((artist) => artist.name),
      sourceArtists.map((artist) => artist.artistId),
      manager,
    );
    const requestedResolutions = await this.resolvers.inspectArtists(
      dto.artists.map((artist) => artist.name),
      dto.artists.map((artist) => artist.artistId),
      manager,
    );
    const resolvedRequested = [] as Array<{
      artistId: string;
      name: string;
    }>;
    for (const [index, artist] of dto.artists.entries()) {
      const inspected = requestedResolutions[index];
      if (inspected.status === 'ambiguous')
        throw new ConflictException({
          code: 'IMPORT_ARTIST_AMBIGUOUS',
          message: 'An artist identity is ambiguous',
          candidates: inspected.candidates ?? [],
        });
      if (inspected.status === 'invalid')
        throw new ConflictException({
          code: 'IMPORT_ARTIST_INVALID',
          message: 'The selected artist does not match its name',
        });

      const sourceMatch = sourceArtists.some((sourceArtist, sourceIndex) => {
        const sourceResolution = sourceResolutions[sourceIndex];
        if (artist.artistId)
          return (
            sourceArtist.artistId === artist.artistId &&
            compareNormalizedMusicNames(sourceArtist.name, artist.name)
          );
        if (sourceResolution.entity && inspected.entity)
          return sourceResolution.entity.id === inspected.entity.id;
        return compareNormalizedMusicNames(sourceArtist.name, artist.name);
      });
      if (!sourceMatch)
        throw this.staleConflict(
          'A confirmed artist is absent from the source row',
        );

      const materialized = await this.resolvers.materializeArtist(
        artist.name,
        manager,
      );
      if (materialized.status === 'ambiguous')
        throw new ConflictException({
          code: 'IMPORT_ARTIST_AMBIGUOUS',
          message: 'An artist identity is ambiguous',
          candidates: materialized.candidates ?? [],
        });
      if (
        !materialized.entity ||
        !['existing', 'created'].includes(materialized.status)
      )
        throw new ConflictException({
          code: 'IMPORT_ARTIST_INVALID',
          message: 'The selected artist could not be resolved',
        });
      if (artist.artistId && materialized.entity.id !== artist.artistId)
        throw new ConflictException({
          code: 'IMPORT_ARTIST_INVALID',
          message: 'artistId does not match the resolved artist name',
        });
      resolvedRequested.push({
        artistId: materialized.entity.id,
        name: materialized.entity.name,
      });
    }

    const requestBySource = sourceArtists.map((artist, index) => {
      const requested = resolvedRequested.find((candidate) =>
        sourceResolutions[index].entity
          ? sourceResolutions[index].entity?.id === candidate.artistId
          : compareNormalizedMusicNames(artist.name, candidate.name),
      );
      const resolvedId =
        requested?.artistId ?? sourceResolutions[index].entity?.id ?? null;
      return {
        name: artist.name,
        status: resolvedId
          ? ('existing' as const)
          : sourceResolutions[index].status,
        artistId: resolvedId,
      };
    });

    const conflictRow: ImportConflictRow = {
      rowId: dto.rowId,
      type: source.type,
      name: source.type === 'tour' ? null : source.name,
      artists: requestBySource,
      startDate: source.startDate,
      endDate: source.endDate ?? null,
      locality: { status: 'existing', localityId: venue.localityId },
    };
    const analysis = await this.conflicts.inspect([conflictRow], manager);
    const currentConflicts = analysis[0]?.conflicts ?? [];
    const targetConflict = currentConflicts.find((conflict) =>
      conflict.existingEventIds.includes(eventId),
    );
    const expectedConflict =
      source.type === 'festival'
        ? targetConflict?.code === 'FESTIVAL_DUPLICATE'
        : [
            'CONCERT_DUPLICATE',
            'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
          ].includes(targetConflict?.code ?? '');
    if (
      !targetConflict ||
      !expectedConflict ||
      targetConflict.matchingArtists.length === 0
    )
      throw this.staleConflict(
        'The original event conflict is no longer present',
      );

    const incompatible = currentConflicts.some(
      (conflict) =>
        conflict.kind === 'participation' &&
        conflict.existingEventIds.some(
          (candidateId) => candidateId !== eventId,
        ),
    );
    if (incompatible)
      throw new ConflictException({
        code: 'IMPORT_PARTICIPATION_INCOMPATIBLE',
        message: 'A confirmed artist has an incompatible event participation',
        conflicts: currentConflicts,
      });

    const existingByArtist = new Map(
      currentLineup
        .filter(
          (artist): artist is EventArtist & { artistId: string } =>
            artist.artistId !== null,
        )
        .map((artist) => [artist.artistId, artist]),
    );
    const allowedAdditions = new Set(
      targetConflict.addableArtists
        .map((artist) => artist.artistId)
        .filter((artistId): artistId is string => Boolean(artistId)),
    );
    if (
      resolvedRequested.some(
        (artist) =>
          !allowedAdditions.has(artist.artistId) &&
          !existingByArtist.has(artist.artistId),
      )
    )
      throw this.staleConflict('A confirmed artist is no longer addable');

    const addedArtists: LineupArtistResult[] = [];
    const existingArtists: LineupArtistResult[] = [];
    const seen = new Set<string>();
    let position = currentLineup.reduce(
      (maximum, artist) => Math.max(maximum, artist.position),
      0,
    );
    for (const artist of resolvedRequested) {
      if (seen.has(artist.artistId)) {
        const duplicate = existingByArtist.get(artist.artistId);
        const added = addedArtists.find(
          (candidate) => candidate.artistId === artist.artistId,
        );
        existingArtists.push({
          artistId: artist.artistId,
          name: duplicate?.name ?? added?.name ?? artist.name,
          ...(duplicate
            ? { position: duplicate.position }
            : added?.position !== undefined
              ? { position: added.position }
              : {}),
        });
        continue;
      }
      seen.add(artist.artistId);
      const present = existingByArtist.get(artist.artistId);
      if (present) {
        existingArtists.push({
          artistId: artist.artistId,
          name: present.name,
          position: present.position,
        });
        continue;
      }
      position += 1;
      const saved = await lineupRepository.save(
        lineupRepository.create({
          eventId,
          artistId: artist.artistId,
          tourId: null,
          name: artist.name,
          position,
        }),
      );
      addedArtists.push({
        artistId: artist.artistId,
        name: saved.name,
        position: saved.position,
      });
    }

    return {
      status: 'updated',
      eventId,
      addedArtists: addedArtists.map((artist) => ({ ...artist })),
      existingArtists: existingArtists.map((artist) => ({ ...artist })),
    };
  }

  private receiptContent(
    eventId: string,
    dto: ImportEventLineupDto,
  ): ImportReceiptJsonValue {
    return {
      eventId,
      batchId: dto.batchId,
      rowId: dto.rowId,
      sourceRow: {
        rowId: dto.sourceRow.rowId,
        type: dto.sourceRow.type,
        name: dto.sourceRow.name ?? null,
        lineup: (dto.sourceRow.lineup ?? []).map((artist) => ({
          name: artist.name,
          artistId: artist.artistId ?? null,
        })),
        startDate: dto.sourceRow.startDate,
        endDate: dto.sourceRow.endDate ?? null,
        city: dto.sourceRow.city,
        province: dto.sourceRow.province ?? null,
        administrativeRegionId: dto.sourceRow.administrativeRegionId ?? null,
        countryId: dto.sourceRow.countryId,
        tourId: dto.sourceRow.tourId ?? null,
        venue: dto.sourceRow.venue ?? null,
        price: dto.sourceRow.price ?? null,
        otherInfo: dto.sourceRow.otherInfo ?? null,
      },
      artists: dto.artists.map(({ name, artistId }) => ({
        name,
        artistId: artistId ?? null,
      })),
    };
  }

  private staleConflict(message: string): ConflictException {
    return new ConflictException({ code: 'IMPORT_CONFLICT_STALE', message });
  }

  private decodeResult(value: ImportReceiptResult): LineupExpansionResult {
    const status = value.status;
    const eventId = value.eventId;
    const addedArtists = value.addedArtists;
    const existingArtists = value.existingArtists;
    if (
      status !== 'updated' ||
      typeof eventId !== 'string' ||
      !Array.isArray(addedArtists) ||
      !Array.isArray(existingArtists)
    )
      throw new ConflictException({
        code: 'IMPORT_RECEIPT_INVALID',
        message: 'The stored lineup result could not be replayed',
      });
    const decodeArtists = (
      artists: ImportReceiptJsonValue[],
    ): LineupArtistResult[] =>
      artists.flatMap((artist) => {
        if (
          typeof artist !== 'object' ||
          artist === null ||
          Array.isArray(artist) ||
          typeof artist.artistId !== 'string' ||
          typeof artist.name !== 'string'
        )
          return [];
        return [
          {
            artistId: artist.artistId,
            name: artist.name,
            ...(typeof artist.position === 'number'
              ? { position: artist.position }
              : {}),
          },
        ];
      });
    return {
      status,
      eventId,
      addedArtists: decodeArtists(addedArtists),
      existingArtists: decodeArtists(existingArtists),
    };
  }
}
