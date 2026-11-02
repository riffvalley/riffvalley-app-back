import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';
import { EntityManager } from 'typeorm';
import { normalizeGeography } from '../../geography/helpers/normalize-geography';
import { ImportConflictsService } from '../../import/conflicts/import-conflicts.service';
import {
  ImportConflictAnalysis,
  ImportConflictRow,
} from '../../import/conflicts/import-conflicts.types';
import { ImportEntityResolversService } from '../../import/resolution/import-entity-resolvers.service';
import { ImportRowReceiptsService } from '../../import/receipts/import-row-receipts.service';
import {
  ImportReceiptJsonValue,
  ImportReceiptResult,
} from '../../import/receipts/entities/import-row-receipt.entity';
import { Tour } from '../../tours/entities/tour.entity';
import { EventArtist } from '../entities/event-artist.entity';
import { Event, EventType } from '../entities/event.entity';
import { ImportEventsBatchDto } from '../dto/import-batch.dto';
import { ImportEventRowDto } from '../dto/import-event-row.dto';

type RowStatus = 'created' | 'conflict' | 'invalid' | 'failed';

interface ImportRowResult {
  rowId: string | null;
  status: RowStatus;
  eventId?: string;
  tourId?: string;
  code?: string;
  message?: string;
  conflicts?: ImportConflictAnalysis['conflicts'];
  candidates?: Array<{ id: string; name: string }>;
  replayed?: boolean;
  localityId?: string;
  venueId?: string;
  artistIds?: Array<string | null>;
}

interface PreparedRow {
  row: ImportEventRowDto;
  countryId: string;
  locality: Awaited<
    ReturnType<ImportEntityResolversService['prepareLocalities']>
  >[number];
  artists: Array<{
    name: string;
    artistId?: string | null;
    resolution: Awaited<
      ReturnType<ImportEntityResolversService['inspectArtists']>
    >[number];
  }>;
}

class RowRejectedError extends Error {
  constructor(readonly result: ImportRowResult) {
    super(result.code ?? result.status);
  }
}

function validCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
}

function rowValidationMessage(errors: ValidationError[]): string {
  return errors
    .flatMap((error) => [
      ...Object.values(error.constraints ?? {}),
      ...rowValidationMessage(error.children ?? [])
        .split('; ')
        .filter(Boolean),
    ])
    .join('; ');
}

function parseImportResult(value: ImportReceiptResult): ImportRowResult | null {
  if (
    value.status !== 'created' ||
    typeof value.rowId !== 'string' ||
    typeof value.eventId !== 'string'
  )
    return null;
  return {
    rowId: value.rowId,
    status: 'created',
    eventId: value.eventId,
    ...(typeof value.tourId === 'string' ? { tourId: value.tourId } : {}),
    ...(typeof value.localityId === 'string'
      ? { localityId: value.localityId }
      : {}),
    ...(typeof value.venueId === 'string' ? { venueId: value.venueId } : {}),
    ...(Array.isArray(value.artistIds) &&
    value.artistIds.every((id) => typeof id === 'string')
      ? {
          artistIds: value.artistIds.filter(
            (id): id is string => typeof id === 'string',
          ),
        }
      : {}),
  };
}

@Injectable()
export class EventsImportBatchService {
  private readonly logger = new Logger(EventsImportBatchService.name);

  constructor(
    private readonly resolvers: ImportEntityResolversService,
    private readonly conflictsService: ImportConflictsService,
    private readonly receipts: ImportRowReceiptsService,
  ) {}

  async importBatch(editorId: string, dto: ImportEventsBatchDto) {
    const validRows: ImportEventRowDto[] = [];
    const results = new Map<number, ImportRowResult>();
    const seenRowIds = new Map<string, number[]>();

    dto.rows.forEach((value, index) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        results.set(index, {
          rowId: null,
          status: 'invalid',
          code: 'ROW_VALIDATION_FAILED',
          message: 'Each row must be an object',
        });
        return;
      }
      const row = plainToInstance(ImportEventRowDto, value);
      if (typeof row.rowId === 'string' && row.rowId.length) {
        const positions = seenRowIds.get(row.rowId) ?? [];
        positions.push(index);
        seenRowIds.set(row.rowId, positions);
      }
      const errors = validateSync(row, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      });
      if (errors.length) {
        const rawRowId = 'rowId' in value ? value.rowId : null;
        results.set(index, {
          rowId: typeof rawRowId === 'string' ? rawRowId : null,
          status: 'invalid',
          code: 'ROW_VALIDATION_FAILED',
          message: rowValidationMessage(errors),
        });
        return;
      }
      if (
        !validCalendarDate(row.startDate) ||
        (row.endDate != null && !validCalendarDate(row.endDate)) ||
        (row.endDate != null && row.endDate < row.startDate)
      ) {
        results.set(index, {
          rowId: row.rowId,
          status: 'invalid',
          code: 'EVENT_DATE_INVALID',
          message:
            'Dates must be valid calendar dates and endDate cannot precede startDate',
        });
        return;
      }
      if (
        (row.type === 'festival' || row.type === 'tour') &&
        !row.name?.trim()
      ) {
        results.set(index, {
          rowId: row.rowId,
          status: 'invalid',
          code:
            row.type === 'tour'
              ? 'TOUR_NAME_INVALID'
              : 'FESTIVAL_NAME_REQUIRED',
          message: 'This row type requires a non-empty name',
        });
        return;
      }
      if (row.type !== 'tour' && row.tourId) {
        results.set(index, {
          rowId: row.rowId,
          status: 'invalid',
          code: 'TOUR_ID_NOT_ALLOWED',
          message: 'tourId is only valid for rows of type tour',
        });
        return;
      }
      validRows.push(row);
    });

    for (const [rowId, positions] of seenRowIds) {
      if (positions.length < 2) continue;
      for (const index of positions) {
        results.set(index, {
          rowId,
          status: 'invalid',
          code: 'ROW_ID_DUPLICATE_IN_BATCH',
          message: 'Each rowId must be unique within a batch',
        });
      }
    }

    const uniqueRows = validRows
      .map((row) => ({
        row,
        originalIndex: seenRowIds.get(row.rowId)?.[0] ?? -1,
      }))
      .filter(({ row }) => (seenRowIds.get(row.rowId)?.length ?? 0) === 1);
    let receiptOutcomes: Awaited<
      ReturnType<ImportRowReceiptsService['lookupMany']>
    >;
    try {
      receiptOutcomes = await this.receipts.lookupMany(
        editorId,
        dto.batchId,
        uniqueRows.map(({ row }) => ({
          rowId: row.rowId,
          content: this.receiptContent(row, dto.countryId),
        })),
      );
    } catch (error) {
      this.logPreflightFailure('receipt lookup', error);
      this.markFailed(uniqueRows, results);
      return this.buildResponse(dto, results);
    }
    for (const { row, originalIndex } of uniqueRows) {
      const outcome = receiptOutcomes.get(row.rowId);
      if (!outcome) continue;
      if ('conflict' in outcome) {
        results.set(originalIndex, {
          rowId: row.rowId,
          status: 'conflict',
          code: 'IMPORT_IDEMPOTENCY_CONFLICT',
          message:
            'This row identity was already used with different content or is currently processing',
        });
      } else {
        const parsed = parseImportResult(outcome.result);
        results.set(
          originalIndex,
          parsed
            ? { ...parsed, replayed: true }
            : {
                rowId: row.rowId,
                status: 'failed',
                code: 'IMPORT_RECEIPT_INVALID',
                message: 'The stored result could not be replayed',
              },
        );
      }
    }
    const processableRows = uniqueRows.filter(
      ({ originalIndex }) => !results.has(originalIndex),
    );
    const artistNames = processableRows.flatMap(({ row }) =>
      (row.lineup ?? []).map((artist) => artist.name),
    );
    const selectedArtistIds = processableRows.flatMap(({ row }) =>
      (row.lineup ?? []).map((artist) => artist.artistId),
    );
    let artistResolutions: Awaited<
      ReturnType<ImportEntityResolversService['inspectArtists']>
    >;
    let localityResolutions: Awaited<
      ReturnType<ImportEntityResolversService['prepareLocalities']>
    >;
    try {
      artistResolutions = await this.resolvers.inspectArtists(
        artistNames,
        selectedArtistIds,
      );
      localityResolutions = await this.resolvers.prepareLocalities(
        processableRows.map(({ row }) => ({
          city: row.city,
          province: row.province,
          countryId: dto.countryId,
          administrativeRegionId: row.administrativeRegionId,
        })),
      );
    } catch (error) {
      this.logPreflightFailure('entity inspection', error);
      this.markFailed(processableRows, results);
      return this.buildResponse(dto, results);
    }
    let artistIndex = 0;
    const preparedByIndex = new Map<number, PreparedRow>();
    let localityIndex = 0;

    processableRows.forEach(({ row, originalIndex: index }) => {
      const artistResults = (row.lineup ?? []).map((artist) => {
        const resolution = artistResolutions[artistIndex++];
        if (
          artist.artistId &&
          (resolution.status !== 'existing' ||
            resolution.entity?.id !== artist.artistId)
        ) {
          results.set(index, {
            rowId: row.rowId,
            status: 'invalid',
            code:
              resolution.status === 'ambiguous'
                ? 'ARTIST_AMBIGUOUS'
                : 'ARTIST_ID_NAME_MISMATCH',
            message:
              'The selected artistId does not uniquely match the supplied artist name',
            candidates: resolution.candidates,
          });
        } else if (resolution.status === 'ambiguous') {
          results.set(index, {
            rowId: row.rowId,
            status: 'invalid',
            code: resolution.code ?? 'ARTIST_AMBIGUOUS',
            message: 'Artist identity is ambiguous',
            candidates: resolution.candidates,
          });
        }
        return { ...artist, resolution };
      });
      const locality = localityResolutions[localityIndex++];
      if (
        locality.resolution.status === 'ambiguous' ||
        locality.resolution.status === 'invalid'
      ) {
        results.set(index, {
          rowId: row.rowId,
          status: 'invalid',
          code: locality.resolution.code ?? 'LOCALITY_INVALID',
          message:
            locality.resolution.status === 'ambiguous'
              ? 'Locality identity is ambiguous'
              : 'Locality could not be resolved with the supplied geographic context',
          candidates: locality.resolution.candidates,
        });
      }
      preparedByIndex.set(index, {
        row,
        countryId: dto.countryId,
        locality,
        artists: artistResults,
      });
    });

    const eligible = [...preparedByIndex.entries()].filter(
      ([index]) => !results.has(index),
    );
    const tourNames = eligible
      .map(([, prepared]) => prepared.row)
      .filter((row) => row.type === 'tour')
      .map((row) => row.name as string);
    const uniqueTours = new Map<string, string>();
    for (const name of tourNames)
      uniqueTours.set(normalizeGeography(name), name);
    const tourEntries = [...uniqueTours.entries()];
    const tourByKey = new Map<
      string,
      Awaited<ReturnType<ImportEntityResolversService['inspectTour']>>
    >();
    try {
      const tourInspections = await Promise.all(
        tourEntries.map(([, name]) => this.resolvers.inspectTour(name)),
      );
      tourEntries.forEach(([key], index) =>
        tourByKey.set(key, tourInspections[index]),
      );
    } catch (error) {
      this.logPreflightFailure('tour inspection', error);
      for (const [index, prepared] of eligible) {
        if (prepared.row.type === 'tour')
          results.set(index, {
            rowId: prepared.row.rowId,
            status: 'failed',
            code: 'IMPORT_PREFLIGHT_FAILED',
            message:
              'The row could not be checked; retry with the same content',
          });
      }
    }

    for (const [index, prepared] of eligible) {
      if (results.has(index)) continue;
      if (prepared.row.type !== 'tour') continue;
      const inspection = tourByKey.get(
        normalizeGeography(prepared.row.name as string),
      );
      if (inspection?.status === 'invalid') {
        results.set(index, {
          rowId: prepared.row.rowId,
          status: 'invalid',
          code: inspection.code ?? 'TOUR_NAME_INVALID',
          message: 'Tour name is invalid',
        });
      } else if (inspection?.status === 'conflict') {
        if (!prepared.row.tourId) {
          results.set(index, {
            rowId: prepared.row.rowId,
            status: 'conflict',
            code: 'TOUR_CONFIRMATION_REQUIRED',
            message:
              'An existing tour with this normalized name requires explicit tourId confirmation',
            candidates: inspection.entity
              ? [{ id: inspection.entity.id, name: inspection.entity.name }]
              : [],
          });
        } else if (prepared.row.tourId !== inspection.entity?.id) {
          results.set(index, {
            rowId: prepared.row.rowId,
            status: 'invalid',
            code: 'TOUR_ID_NAME_MISMATCH',
            message:
              'tourId does not identify the tour with this normalized name',
          });
        }
      } else if (prepared.row.tourId) {
        results.set(index, {
          rowId: prepared.row.rowId,
          status: 'invalid',
          code: 'TOUR_CONFIRMATION_STALE',
          message:
            'The supplied tourId does not match an existing tour for this name',
        });
      }
    }

    const conflictRows = [...preparedByIndex.entries()]
      .filter(([index]) => !results.has(index))
      .map(([, prepared]) => this.toConflictRow(prepared));
    let conflictAnalysis: ImportConflictAnalysis[] = [];
    try {
      conflictAnalysis = conflictRows.length
        ? await this.conflictsService.inspect(conflictRows)
        : [];
    } catch (error) {
      this.logPreflightFailure('conflict inspection', error);
      for (const [index, prepared] of preparedByIndex) {
        if (results.has(index)) continue;
        results.set(index, {
          rowId: prepared.row.rowId,
          status: 'failed',
          code: 'IMPORT_PREFLIGHT_FAILED',
          message: 'The row could not be checked; retry with the same content',
        });
      }
    }
    const conflictsByRowId = new Map(
      conflictAnalysis.map((analysis) => [analysis.rowId, analysis]),
    );
    for (const [index, prepared] of preparedByIndex) {
      if (results.has(index)) continue;
      const analysis = conflictsByRowId.get(prepared.row.rowId);
      if (analysis?.conflicts.length) {
        const first = analysis.conflicts[0];
        results.set(index, {
          rowId: prepared.row.rowId,
          status: 'conflict',
          code: first.code,
          message: first.message,
          conflicts: analysis.conflicts,
        });
      }
    }

    const batchTours = new Map<string, string>();
    for (const [index, prepared] of preparedByIndex) {
      if (results.has(index)) continue;
      try {
        const execution = await this.receipts.execute(
          { editorId, batchId: dto.batchId, rowId: prepared.row.rowId },
          this.receiptContent(prepared.row, prepared.countryId),
          async (manager) => {
            const persisted = await this.persistRow(
              manager,
              prepared,
              batchTours,
            );
            return persisted;
          },
        );
        const parsedResult = parseImportResult(execution.result);
        if (!parsedResult)
          throw new Error('Stored import result has an invalid shape');
        const rowResult = { ...parsedResult, replayed: execution.replayed };
        results.set(index, rowResult);
        if (
          rowResult.status === 'created' &&
          rowResult.tourId &&
          prepared.row.type === 'tour'
        ) {
          batchTours.set(
            normalizeGeography(prepared.row.name as string),
            rowResult.tourId,
          );
        }
      } catch (error) {
        if (error instanceof RowRejectedError) {
          results.set(index, error.result);
          continue;
        }
        const code = this.isReceiptConflict(error)
          ? 'IMPORT_IDEMPOTENCY_CONFLICT'
          : 'IMPORT_ROW_FAILED';
        if (code === 'IMPORT_ROW_FAILED')
          this.logger.error(
            `Import row ${prepared.row.rowId} failed`,
            error instanceof Error ? error.stack : undefined,
          );
        results.set(index, {
          rowId: prepared.row.rowId,
          status:
            code === 'IMPORT_IDEMPOTENCY_CONFLICT' ? 'conflict' : 'failed',
          code,
          message:
            code === 'IMPORT_IDEMPOTENCY_CONFLICT'
              ? 'This row identity was already used with different content or is currently processing'
              : 'The row could not be persisted; retry with the same content',
        });
      }
    }

    return this.buildResponse(dto, results);
  }

  private buildResponse(
    dto: ImportEventsBatchDto,
    results: Map<number, ImportRowResult>,
  ) {
    return {
      batchId: dto.batchId,
      results: dto.rows.map(
        (_row, index) =>
          results.get(index) ?? {
            rowId: null,
            status: 'failed' as const,
            code: 'IMPORT_ROW_FAILED',
            message: 'No result was produced for this row',
          },
      ),
    };
  }

  private markFailed(
    rows: Array<{ row: ImportEventRowDto; originalIndex: number }>,
    results: Map<number, ImportRowResult>,
  ): void {
    for (const { row, originalIndex } of rows) {
      if (results.has(originalIndex)) continue;
      results.set(originalIndex, {
        rowId: row.rowId,
        status: 'failed',
        code: 'IMPORT_PREFLIGHT_FAILED',
        message: 'The row could not be checked; retry with the same content',
      });
    }
  }

  private logPreflightFailure(phase: string, error: unknown): void {
    this.logger.error(
      `Import batch ${phase} failed`,
      error instanceof Error ? error.stack : undefined,
    );
  }

  private receiptContent(
    row: ImportEventRowDto,
    countryId: string,
  ): ImportReceiptJsonValue {
    return {
      rowId: row.rowId,
      type: row.type,
      name: row.name ?? null,
      lineup: (row.lineup ?? []).map((artist) => ({
        name: artist.name,
        artistId: artist.artistId ?? null,
      })),
      startDate: row.startDate,
      endDate: row.endDate ?? null,
      city: row.city,
      province: row.province ?? null,
      administrativeRegionId: row.administrativeRegionId ?? null,
      countryId,
      venue: row.venue ?? null,
      tourId: row.tourId ?? null,
      price: row.price ?? null,
      otherInfo: row.otherInfo ?? null,
    };
  }

  private toConflictRow(prepared: PreparedRow): ImportConflictRow {
    const { row, locality, artists } = prepared;
    return {
      rowId: row.rowId,
      type: row.type,
      name: row.type === 'tour' ? null : row.name,
      artists: artists.map(({ name, resolution }) => ({
        name,
        status: resolution.status,
        artistId: resolution.entity?.id ?? null,
      })),
      startDate: row.startDate,
      endDate: row.endDate ?? null,
      locality:
        locality.resolution.status === 'existing'
          ? { status: 'existing', localityId: locality.resolution.entity?.id }
          : {
              status: locality.resolution.status,
              provisionalIdentity: {
                administrativeRegionId: row.administrativeRegionId ?? '',
                city: row.city,
                province: row.province,
              },
            },
    };
  }

  private async persistRow(
    manager: EntityManager,
    prepared: PreparedRow,
    batchTours: Map<string, string>,
  ): Promise<ImportReceiptResult> {
    const { row, locality, artists } = prepared;
    const localityResult = await this.resolvers.materializeLocality(
      {
        city: row.city,
        province: row.province,
        countryId: prepared.countryId,
        administrativeRegionId: row.administrativeRegionId,
      },
      manager,
      locality,
    );
    if (
      !localityResult.entity ||
      !['existing', 'created'].includes(localityResult.status)
    )
      throw new RowRejectedError({
        rowId: row.rowId,
        status: 'invalid',
        code: localityResult.code ?? 'LOCALITY_RESOLUTION_FAILED',
        message: 'Locality could not be materialized',
      });

    // Serializes all event conflict checks within the locality, without a batch-wide lock.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 731908))',
      [`event-import:${localityResult.entity.id}`],
    );

    const materializedArtists: Array<{ id: string | null; name: string }> = [];
    for (const artist of artists) {
      const artistResult = await this.resolvers.materializeArtist(
        artist.name,
        manager,
      );
      if (
        !artistResult.entity ||
        !['existing', 'created'].includes(artistResult.status)
      )
        throw new RowRejectedError({
          rowId: row.rowId,
          status: 'invalid',
          code: artistResult.code ?? 'ARTIST_RESOLUTION_FAILED',
          message: 'Artist could not be resolved',
        });
      if (artist.artistId && artist.artistId !== artistResult.entity.id)
        throw new RowRejectedError({
          rowId: row.rowId,
          status: 'invalid',
          code: 'ARTIST_ID_NAME_MISMATCH',
          message: 'artistId does not match the resolved artist name',
        });
      materializedArtists.push({
        id: artistResult.entity.id,
        name: artist.name,
      });
    }

    let tour: Tour | null = null;
    if (row.type === 'tour') {
      const key = normalizeGeography(row.name as string);
      const batchTourId = batchTours.get(key) ?? null;
      const tourResult = await this.resolvers.materializeTour(
        row.name as string,
        row.tourId ?? batchTourId,
        manager,
        { createdTours: new Map() },
      );
      if (
        !tourResult.entity ||
        !['existing', 'created'].includes(tourResult.status)
      )
        throw new RowRejectedError({
          rowId: row.rowId,
          status: tourResult.status === 'conflict' ? 'conflict' : 'invalid',
          code: tourResult.code ?? 'TOUR_RESOLUTION_FAILED',
          message:
            tourResult.status === 'conflict'
              ? 'The tour changed during import and requires explicit confirmation'
              : 'Tour could not be resolved',
          candidates: tourResult.entity
            ? [{ id: tourResult.entity.id, name: tourResult.entity.name }]
            : [],
        });
      tour = tourResult.entity;
    }

    const venueResult = await this.resolvers.materializeVenue(
      row.venue,
      localityResult.entity.id,
      manager,
    );
    if (
      !venueResult.entity ||
      !['existing', 'created'].includes(venueResult.status)
    )
      throw new RowRejectedError({
        rowId: row.rowId,
        status: 'invalid',
        code: venueResult.code ?? 'VENUE_RESOLUTION_FAILED',
        message: 'Venue could not be resolved',
      });

    const revalidated = await this.conflictsService.inspect(
      [
        {
          rowId: row.rowId,
          type: row.type,
          name: row.type === 'tour' ? null : row.name,
          artists: materializedArtists.map((artist) => ({
            name: artist.name,
            status: 'existing',
            artistId: artist.id,
          })),
          startDate: row.startDate,
          endDate: row.endDate ?? null,
          locality: {
            status: 'existing',
            localityId: localityResult.entity.id,
          },
        },
      ],
      manager,
    );
    const currentConflicts = revalidated[0]?.conflicts ?? [];
    if (currentConflicts.length) {
      const first = currentConflicts[0];
      throw new RowRejectedError({
        rowId: row.rowId,
        status: 'conflict',
        code: first.code,
        message: first.message,
        conflicts: currentConflicts,
      });
    }

    const eventRepository = manager.getRepository(Event);
    const event = await eventRepository.save(
      eventRepository.create({
        type: row.type === 'festival' ? EventType.FESTIVAL : EventType.CONCERT,
        name: row.type === 'tour' ? null : row.name?.trim() || null,
        startDate: row.startDate,
        endDate: row.endDate ?? null,
        venueId: venueResult.entity.id,
        tourId: tour?.id ?? null,
        price: row.price ?? null,
        otherInfo: row.otherInfo ?? null,
      }),
    );
    if (materializedArtists.length) {
      const lineupRepository = manager.getRepository(EventArtist);
      await lineupRepository.save(
        materializedArtists.map((artist, position) =>
          lineupRepository.create({
            eventId: event.id,
            artistId: artist.id,
            name: artist.name,
            position: position + 1,
            tourId: null,
          }),
        ),
      );
    }
    return {
      rowId: row.rowId,
      status: 'created',
      eventId: event.id,
      ...(tour ? { tourId: tour.id } : {}),
      localityId: localityResult.entity.id,
      venueId: venueResult.entity.id,
      artistIds: materializedArtists.flatMap((artist) =>
        artist.id ? [artist.id] : [],
      ),
    };
  }

  private isReceiptConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('getStatus' in error))
      return false;
    return typeof error.getStatus === 'function' && error.getStatus() === 409;
  }
}
