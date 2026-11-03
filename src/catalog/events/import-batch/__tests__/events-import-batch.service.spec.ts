import { EventArtist } from '../../entities/event-artist.entity';
import { Event } from '../../entities/event.entity';
import { ImportEventsBatchDto } from '../../dto/import-batch.dto';
import { EventsImportBatchService } from '../events-import-batch.service';
import { ImportEntityResolversService } from '../../../import/resolution/import-entity-resolvers.service';
import { ImportConflictsService } from '../../../import/conflicts/import-conflicts.service';
import { ImportRowReceiptsService } from '../../../import/receipts/import-row-receipts.service';
import { ImportReceiptResult } from '../../../import/receipts/entities/import-row-receipt.entity';
import { EntityManager } from 'typeorm';

function makeHarness(existingTour = false) {
  let eventCounter = 0;
  const locality = { id: 'locality-id' };
  const venue = { id: 'venue-id', localityId: locality.id };
  const tour = {
    id: '77777777-7777-4777-8777-777777777777',
    name: 'European Tour 2027',
  };
  const createdEvents: Array<Record<string, unknown>> = [];
  const savedLineups: Array<Array<Record<string, unknown>>> = [];
  const eventRepository = {
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      const created = { ...value, id: `event-${++eventCounter}` };
      createdEvents.push(created);
      return created;
    }),
  };
  const lineupRepository = {
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn(async (values: Array<Record<string, unknown>>) => {
      savedLineups.push(values);
      return values;
    }),
  };
  const manager = Object.assign(
    Object.create(EntityManager.prototype) as EntityManager,
    {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: typeof Event | typeof EventArtist) =>
        entity === Event ? eventRepository : lineupRepository,
      ),
    },
  );
  let tourCreated = false;
  const resolverMocks = Object.assign(
    Object.create(
      ImportEntityResolversService.prototype,
    ) as ImportEntityResolversService,
    {
      inspectArtists: jest.fn(async (names: string[]) =>
        names.map(() => ({ status: 'created' as const })),
      ),
      prepareLocalities: jest.fn(async (inputs: Array<{ city: string }>) =>
        inputs.map((input) => ({
          input,
          resolution: { status: 'existing' as const, entity: locality },
        })),
      ),
      inspectTour: jest.fn(async () =>
        existingTour
          ? {
              status: 'conflict' as const,
              code: 'TOUR_CONFIRMATION_REQUIRED',
              entity: tour,
            }
          : { status: 'created' as const },
      ),
      materializeLocality: jest.fn(async () => ({
        status: 'existing' as const,
        entity: locality,
      })),
      materializeArtist: jest.fn(async (name: string) => ({
        status: 'created' as const,
        entity: { id: `artist-${name}`, name },
      })),
      materializeTour: jest.fn(
        async (_name: string, confirmedTourId: string | null) => {
          if (confirmedTourId === tour.id)
            return { status: 'existing' as const, entity: tour };
          if (confirmedTourId)
            return {
              status: 'conflict' as const,
              code: 'TOUR_CONFIRMATION_STALE',
            };
          if (tourCreated)
            return {
              status: 'conflict' as const,
              code: 'TOUR_CONFIRMATION_REQUIRED',
              entity: tour,
            };
          tourCreated = true;
          return { status: 'created' as const, entity: tour };
        },
      ),
      materializeVenue: jest.fn(async () => ({
        status: 'existing' as const,
        entity: venue,
      })),
    },
  );
  const conflictMocks = Object.assign(
    Object.create(ImportConflictsService.prototype) as ImportConflictsService,
    {
      inspect: jest.fn(async (rows: Array<{ rowId: string }>) =>
        rows.map((row) => ({ rowId: row.rowId, conflicts: [] })),
      ),
    },
  );
  const receiptMocks = Object.assign(
    Object.create(
      ImportRowReceiptsService.prototype,
    ) as ImportRowReceiptsService,
    {
      lookupMany: jest.fn(
        async (...args: Parameters<ImportRowReceiptsService['lookupMany']>) => {
          void args;
          return new Map<
            string,
            { result: ImportReceiptResult } | { conflict: true }
          >();
        },
      ),
      execute: jest.fn(
        async (
          _identity: unknown,
          _content: unknown,
          operation: (
            entityManager: EntityManager,
          ) => Promise<ImportReceiptResult>,
        ) => ({ replayed: false, result: await operation(manager) }),
      ),
    },
  );
  const service = new EventsImportBatchService(
    resolverMocks,
    conflictMocks,
    receiptMocks,
  );
  return {
    service,
    resolverMocks,
    conflictMocks,
    receiptMocks,
    createdEvents,
    savedLineups,
    tour,
  };
}

function batch(rows: unknown[]): ImportEventsBatchDto {
  return {
    batchId: '11111111-1111-4111-8111-111111111111',
    countryId: '22222222-2222-4222-8222-222222222222',
    rows,
  } as ImportEventsBatchDto;
}

function tourRow(rowId: string, startDate: string, tourId?: string) {
  return {
    rowId,
    type: 'tour',
    name: 'European Tour 2027',
    lineup: [{ name: 'Septicflesh' }],
    startDate,
    city: 'Madrid',
    ...(tourId ? { tourId } : {}),
  };
}

describe('EventsImportBatchService', () => {
  it('shares one newly created tour across separate rows and preserves each lineup', async () => {
    const harness = makeHarness();
    const result = await harness.service.importBatch(
      'editor-id',
      batch([
        tourRow('33333333-3333-4333-8333-333333333331', '2027-05-15'),
        tourRow('33333333-3333-4333-8333-333333333332', '2027-05-17'),
        tourRow('33333333-3333-4333-8333-333333333333', '2027-05-19'),
      ]),
    );

    expect(result.results.map((row) => row.status)).toEqual([
      'created',
      'created',
      'created',
    ]);
    expect(harness.createdEvents).toHaveLength(3);
    expect(harness.createdEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'concert',
          name: null,
          tourId: harness.tour.id,
        }),
      ]),
    );
    expect(harness.resolverMocks.materializeTour).toHaveBeenNthCalledWith(
      1,
      'European Tour 2027',
      null,
      expect.anything(),
      expect.anything(),
    );
    expect(harness.resolverMocks.materializeTour).toHaveBeenNthCalledWith(
      2,
      'European Tour 2027',
      harness.tour.id,
      expect.anything(),
      expect.anything(),
    );
    expect(harness.savedLineups).toHaveLength(3);
    expect(harness.savedLineups.map((lineup) => lineup[0].position)).toEqual([
      1, 1, 1,
    ]);
  });

  it('requires explicit confirmation for an existing tour and validates its ID', async () => {
    const harness = makeHarness(true);
    const result = await harness.service.importBatch(
      'editor-id',
      batch([
        tourRow('33333333-3333-4333-8333-333333333341', '2027-05-15'),
        tourRow(
          '33333333-3333-4333-8333-333333333342',
          '2027-05-17',
          harness.tour.id,
        ),
        tourRow(
          '33333333-3333-4333-8333-333333333343',
          '2027-05-19',
          '66666666-6666-4666-8666-666666666666',
        ),
      ]),
    );

    expect(result.results.map((row) => row.status)).toEqual([
      'conflict',
      'created',
      'invalid',
    ]);
    expect(result.results[0].code).toBe('TOUR_CONFIRMATION_REQUIRED');
    expect(result.results[2].code).toBe('TOUR_ID_NAME_MISMATCH');
    expect(harness.createdEvents).toHaveLength(1);
    expect(harness.createdEvents[0]).toEqual(
      expect.objectContaining({ tourId: harness.tour.id, name: null }),
    );
    expect(harness.receiptMocks.execute).toHaveBeenCalledTimes(1);
  });

  it('returns an invalid row while importing independent valid rows in order', async () => {
    const harness = makeHarness();
    const result = await harness.service.importBatch(
      'editor-id',
      batch([
        {
          rowId: 'bad-row',
          type: 'concert',
          startDate: '2027-02-30',
          city: '',
        },
        null,
        {
          rowId: '44444444-4444-4444-8444-444444444444',
          type: 'concert',
          startDate: '2027-06-02',
          city: 'Madrid',
          lineup: [],
        },
      ]),
    );

    expect(result.results.map((row) => row.status)).toEqual([
      'invalid',
      'invalid',
      'created',
    ]);
    expect(result.results[0].rowId).toBe('bad-row');
    expect(harness.createdEvents).toHaveLength(1);
    expect(harness.receiptMocks.execute).toHaveBeenCalledTimes(1);
  });

  it('passes explicit locality and venue UUIDs through inspection, persistence, and receipt identity', async () => {
    const harness = makeHarness();
    const localityId = '11111111-1111-4111-8111-111111111111';
    const venueId = '22222222-2222-4222-8222-222222222222';
    const rowId = '33333333-3333-4333-8333-333333333333';

    await harness.service.importBatch(
      'editor-id',
      batch([
        {
          rowId,
          type: 'concert',
          startDate: '2027-05-15',
          city: 'Madrid',
          localityId,
          venueId,
        },
      ]),
    );

    expect(harness.resolverMocks.prepareLocalities).toHaveBeenCalledWith([
      expect.objectContaining({ localityId, venueId }),
    ]);
    expect(harness.resolverMocks.materializeLocality).toHaveBeenCalledWith(
      expect.objectContaining({ localityId, venueId }),
      expect.anything(),
      expect.anything(),
    );
    expect(harness.resolverMocks.materializeVenue).toHaveBeenCalledWith(
      undefined,
      'locality-id',
      expect.anything(),
      venueId,
      undefined,
    );
    const lookupContent = harness.receiptMocks.lookupMany.mock.calls[0][2][0]
      .content as Record<string, unknown>;
    expect(lookupContent).toMatchObject({ localityId, venueId });
  });

  it('keeps the legacy receipt payload shape when UUIDs are omitted', async () => {
    const harness = makeHarness();

    await harness.service.importBatch(
      'editor-id',
      batch([
        {
          rowId: '33333333-3333-4333-8333-333333333334',
          type: 'concert',
          startDate: '2027-05-15',
          city: 'Madrid',
        },
      ]),
    );

    const lookupContent = harness.receiptMocks.lookupMany.mock.calls[0][2][0]
      .content as Record<string, unknown>;
    expect(lookupContent).not.toHaveProperty('localityId');
    expect(lookupContent).not.toHaveProperty('venueId');
  });

  it('replays a committed row before checking its event for conflicts', async () => {
    const harness = makeHarness();
    harness.receiptMocks.lookupMany.mockResolvedValue(
      new Map([
        [
          '55555555-5555-4555-8555-555555555555',
          {
            result: {
              rowId: '55555555-5555-4555-8555-555555555555',
              status: 'created',
              eventId: 'persisted-event-id',
            },
          },
        ],
      ]),
    );
    const result = await harness.service.importBatch(
      'editor-id',
      batch([
        {
          rowId: '55555555-5555-4555-8555-555555555555',
          type: 'concert',
          startDate: '2027-06-02',
          city: 'Madrid',
          lineup: [],
        },
      ]),
    );

    expect(result.results).toEqual([
      expect.objectContaining({
        status: 'created',
        eventId: 'persisted-event-id',
        replayed: true,
      }),
    ]);
    expect(harness.conflictMocks.inspect).not.toHaveBeenCalled();
    expect(harness.receiptMocks.execute).not.toHaveBeenCalled();
  });
});
