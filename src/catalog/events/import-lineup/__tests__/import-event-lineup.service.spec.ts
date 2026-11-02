import { EntityManager } from 'typeorm';
import { EventArtist } from '../../entities/event-artist.entity';
import { Event, EventType } from '../../entities/event.entity';
import { Venue } from '../../../venues/entities/venue.entity';
import { ImportEventLineupDto } from '../../dto/import-lineup.dto';
import { ImportConflictsService } from '../../../import/conflicts/import-conflicts.service';
import { ImportEntityResolversService } from '../../../import/resolution/import-entity-resolvers.service';
import { ImportResolution } from '../../../import/resolution/import-entity-resolvers.service';
import { Artist } from '../../../artists/entities/artist.entity';
import { ImportRowReceiptsService } from '../../../import/receipts/import-row-receipts.service';
import { ImportEventLineupService } from '../import-event-lineup.service';

const ids = {
  event: '11111111-1111-4111-8111-111111111111',
  batch: '22222222-2222-4222-8222-222222222222',
  row: '33333333-3333-4333-8333-333333333333',
  metallica: '44444444-4444-4444-8444-444444444444',
  gojira: '55555555-5555-4555-8555-555555555555',
  locality: '66666666-6666-4666-8666-666666666666',
  country: '77777777-7777-4777-8777-777777777777',
};

function makeHarness(
  options: { festival?: boolean; alreadyHasGojira?: boolean } = {},
) {
  const event = {
    id: ids.event,
    type: options.festival ? EventType.FESTIVAL : EventType.CONCERT,
    name: options.festival ? 'Z! Live' : null,
    startDate: '2027-05-15',
    endDate: options.festival ? '2027-05-16' : null,
    venueId: 'venue-id',
    tourId: options.festival ? null : 'tour-id',
    price: '35€',
    otherInfo: 'Doors 19:00',
  };
  const currentLineup = [
    {
      id: 'event-artist-metallica',
      eventId: ids.event,
      artistId: ids.metallica,
      tourId: options.festival ? 'tour-metallica' : null,
      name: 'Metallica',
      position: 1,
    },
    ...(options.alreadyHasGojira
      ? [
          {
            id: 'event-artist-gojira',
            eventId: ids.event,
            artistId: ids.gojira,
            tourId: options.festival ? 'tour-gojira' : null,
            name: 'Gojira',
            position: 2,
          },
        ]
      : []),
  ];
  const saved: Array<Record<string, unknown>> = [];
  const eventRepository = {
    findOne: jest.fn(async () => event),
    save: jest.fn(),
  };
  const venueRepository = {
    findOneBy: jest.fn(async () => ({
      id: 'venue-id',
      localityId: ids.locality,
    })),
  };
  const lineupRepository = {
    find: jest.fn(async () => currentLineup),
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      saved.push(value);
      return value;
    }),
  };
  const manager = Object.assign(
    Object.create(EntityManager.prototype) as EntityManager,
    {
      query: jest.fn(async () => []),
      getRepository: jest.fn(
        (entity: typeof Event | typeof EventArtist | typeof Venue) => {
          if (entity === Event) return eventRepository;
          if (entity === EventArtist) return lineupRepository;
          return venueRepository;
        },
      ),
    },
  );
  const resolvers = Object.assign(
    Object.create(
      ImportEntityResolversService.prototype,
    ) as ImportEntityResolversService,
    {
      inspectLocality: jest.fn(async () => ({
        status: 'existing' as const,
        entity: { id: ids.locality },
      })),
      inspectArtists: jest.fn(
        async (
          names: string[],
        ): Promise<Array<ImportResolution<Pick<Artist, 'id' | 'name'>>>> =>
          names.map((name) =>
            name === 'New Artist'
              ? { status: 'created' }
              : {
                  status: 'existing',
                  entity: {
                    id: name === 'Metallica' ? ids.metallica : ids.gojira,
                    name,
                  },
                },
          ),
      ),
      materializeArtist: jest.fn(async (name: string) => ({
        status:
          name === 'New Artist' ? ('created' as const) : ('existing' as const),
        entity: {
          id:
            name === 'New Artist'
              ? '88888888-8888-4888-8888-888888888888'
              : name === 'Metallica'
                ? ids.metallica
                : ids.gojira,
          name,
        },
      })),
    },
  );
  const targetConflict = {
    rowId: ids.row,
    kind: 'participation' as const,
    code: options.festival
      ? ('FESTIVAL_DUPLICATE' as const)
      : ('CONCERT_ARTIST_DATE_LOCALITY_CONFLICT' as const),
    severity: 'blocking' as const,
    message: 'Duplicate target event',
    relatedRowIds: [],
    existingEventIds: [ids.event],
    matchingArtists: [{ artistId: ids.metallica, name: 'Metallica' }],
    addableArtists: options.alreadyHasGojira
      ? []
      : [{ artistId: ids.gojira, name: 'Gojira' }],
    candidateEventIds: [ids.event],
  };
  const conflicts = Object.assign(
    Object.create(ImportConflictsService.prototype) as ImportConflictsService,
    {
      inspect: jest.fn(async () => [
        { rowId: ids.row, conflicts: [targetConflict] },
      ]),
    },
  );
  const receipts = Object.assign(
    Object.create(
      ImportRowReceiptsService.prototype,
    ) as ImportRowReceiptsService,
    {
      execute: jest.fn(
        async (
          _identity: unknown,
          _content: unknown,
          callback: (transactionManager: EntityManager) => Promise<{
            [key: string]: string | number | boolean | null | Array<unknown>;
          }>,
        ) => ({ replayed: false, result: await callback(manager) }),
      ),
    },
  );
  return {
    service: new ImportEventLineupService(resolvers, conflicts, receipts),
    eventRepository,
    lineupRepository,
    manager,
    resolvers,
    conflicts,
    receipts,
    saved,
  };
}

function request(festival = false, artist = 'Gojira'): ImportEventLineupDto {
  return {
    batchId: ids.batch,
    rowId: ids.row,
    sourceRow: {
      rowId: ids.row,
      type: festival ? 'festival' : 'concert',
      name: festival ? 'Z! Live' : null,
      lineup: [
        { name: 'Metallica', artistId: ids.metallica },
        { name: 'Gojira', artistId: ids.gojira },
      ],
      startDate: '2027-05-15',
      endDate: festival ? '2027-05-16' : null,
      city: 'Madrid',
      countryId: ids.country,
    },
    artists: [
      {
        name: artist,
        artistId: artist === 'Metallica' ? ids.metallica : ids.gojira,
      },
    ],
  };
}

describe('ImportEventLineupService', () => {
  it('adds an artist after the current lineup without changing Event or existing EventArtist rows', async () => {
    const harness = makeHarness();
    const result = await harness.service.expand(
      'editor-id',
      ids.event,
      request(),
    );

    expect(result).toEqual({
      status: 'updated',
      eventId: ids.event,
      addedArtists: [{ artistId: ids.gojira, name: 'Gojira', position: 2 }],
      existingArtists: [],
    });
    expect(harness.saved).toEqual([
      {
        eventId: ids.event,
        artistId: ids.gojira,
        tourId: null,
        name: 'Gojira',
        position: 2,
      },
    ]);
    expect(harness.eventRepository.save).not.toHaveBeenCalled();
    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`event-import:${ids.locality}`],
    );
    expect(harness.resolvers.materializeArtist).toHaveBeenCalledWith(
      'Gojira',
      harness.manager,
    );
  });

  it('creates an unambiguous new artist and appends multiple artists in request order', async () => {
    const harness = makeHarness();
    const freshArtistId = '88888888-8888-4888-8888-888888888888';
    harness.conflicts.inspect.mockImplementation(async () => [
      {
        rowId: ids.row,
        conflicts: [
          {
            rowId: ids.row,
            kind: 'participation',
            code: 'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
            severity: 'blocking',
            message: 'Duplicate target event',
            relatedRowIds: [],
            existingEventIds: [ids.event],
            matchingArtists: [{ artistId: ids.metallica, name: 'Metallica' }],
            addableArtists: [
              { artistId: ids.gojira, name: 'Gojira' },
              { artistId: freshArtistId, name: 'New Artist' },
            ],
            candidateEventIds: [ids.event],
          },
        ],
      },
    ]);
    const dto = request();
    dto.sourceRow.lineup?.push({ name: 'New Artist' });
    dto.artists.push({ name: 'New Artist' });

    const result = await harness.service.expand('editor-id', ids.event, dto);
    expect(result.addedArtists).toEqual([
      { artistId: ids.gojira, name: 'Gojira', position: 2 },
      { artistId: freshArtistId, name: 'New Artist', position: 3 },
    ]);
    expect(harness.saved.map((row) => row.name)).toEqual([
      'Gojira',
      'New Artist',
    ]);
    expect(harness.resolvers.materializeArtist).toHaveBeenCalledWith(
      'New Artist',
      harness.manager,
    );
  });

  it('reports an already present artist and does not create a duplicate relation', async () => {
    const harness = makeHarness({ alreadyHasGojira: true });
    const result = await harness.service.expand(
      'editor-id',
      ids.event,
      request(),
    );
    expect(result.addedArtists).toEqual([]);
    expect(result.existingArtists).toEqual([
      { artistId: ids.gojira, name: 'Gojira', position: 2 },
    ]);
    expect(harness.lineupRepository.save).not.toHaveBeenCalled();
  });

  it('supports festival expansion while preserving existing performance tours', async () => {
    const harness = makeHarness({ festival: true });
    const result = await harness.service.expand(
      'editor-id',
      ids.event,
      request(true),
    );
    expect(result.addedArtists).toEqual([
      { artistId: ids.gojira, name: 'Gojira', position: 2 },
    ]);
    expect(harness.saved[0]).toMatchObject({ tourId: null, position: 2 });
    expect(harness.saved[0]).not.toHaveProperty('tour');
  });

  it('rejects a stale conflict before writing a lineup row', async () => {
    const harness = makeHarness();
    harness.conflicts.inspect.mockResolvedValue([
      { rowId: ids.row, conflicts: [] },
    ]);
    await expect(
      harness.service.expand('editor-id', ids.event, request()),
    ).rejects.toMatchObject({
      response: { code: 'IMPORT_CONFLICT_STALE' },
    });
    expect(harness.lineupRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous artist identity without inserting EventArtist', async () => {
    const harness = makeHarness();
    harness.resolvers.inspectArtists.mockResolvedValue([
      {
        status: 'ambiguous',
        candidates: [
          { id: ids.gojira, name: 'Gojira' },
          { id: ids.metallica, name: 'Gojira' },
        ],
      },
    ]);
    const dto = request();
    dto.artists[0].artistId = null;
    await expect(
      harness.service.expand('editor-id', ids.event, dto),
    ).rejects.toMatchObject({
      response: { code: 'IMPORT_ARTIST_AMBIGUOUS' },
    });
    expect(harness.resolvers.materializeArtist).not.toHaveBeenCalled();
    expect(harness.lineupRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an incompatible participation on another event', async () => {
    const harness = makeHarness();
    harness.conflicts.inspect.mockResolvedValue([
      {
        rowId: ids.row,
        conflicts: [
          {
            rowId: ids.row,
            kind: 'participation',
            code: 'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT',
            severity: 'blocking',
            message: 'Incompatible concert',
            relatedRowIds: [],
            existingEventIds: [ids.event, 'another-event-id'],
            matchingArtists: [{ artistId: ids.metallica, name: 'Metallica' }],
            addableArtists: [{ artistId: ids.gojira, name: 'Gojira' }],
            candidateEventIds: [ids.event, 'another-event-id'],
          },
        ],
      },
    ]);
    await expect(
      harness.service.expand('editor-id', ids.event, request()),
    ).rejects.toMatchObject({
      response: { code: 'IMPORT_PARTICIPATION_INCOMPATIBLE' },
    });
    expect(harness.lineupRepository.save).not.toHaveBeenCalled();
  });
});
