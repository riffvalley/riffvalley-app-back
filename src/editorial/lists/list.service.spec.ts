import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { List, ListType, PublishedDiscRecord } from './entities/list.entity';
import {
  Content,
  ContentType,
} from 'src/editorial/contents/entities/content.entity';
import {
  WordpressService,
  WordpressWriteError,
} from 'src/integrations/wordpress-integration/wordpress.service';
import {
  ListsService,
  getMonthlyReferenceStart,
  getWeeklyOpenCutoff,
} from './list.service';

type Row = { closeDate: Date | null; releaseDate: Date | null; listDate: Date };

// Evalúa en memoria las condiciones `where` (array = OR) que genera el servicio.
function matches(where: any, row: Row): boolean {
  const conditions = Array.isArray(where) ? where : [where];
  return conditions.some((cond: any) =>
    Object.entries(cond).every(([field, expected]) => {
      if (field === 'type') return true;
      const value = (row as any)[field] as Date | null;
      if (!(expected instanceof FindOperator)) return value === expected;
      const op = expected as FindOperator<any>;
      switch (op.type) {
        case 'isNull':
          return value === null;
        case 'moreThanOrEqual':
          return value !== null && value >= op.value;
        case 'lessThan':
          return value !== null && value < op.value;
        case 'between':
          return value !== null && value >= op.value[0] && value <= op.value[1];
        default:
          throw new Error(`Operador no soportado: ${op.type}`);
      }
    }),
  );
}

describe('ListsService weekly radars', () => {
  // Radar de la semana del 14-09-2026: viernes 18, release sábado 19, cierre domingo 20.
  const radar: Row = {
    listDate: new Date(2026, 8, 18),
    releaseDate: new Date(2026, 8, 19),
    closeDate: new Date(2026, 8, 20),
  };
  const legacyRadar: Row = { ...radar, closeDate: null };

  let rows: Row[];
  let service: ListsService;

  beforeEach(() => {
    rows = [];
    const repo = {
      find: jest.fn(async ({ where }) => rows.filter((r) => matches(where, r))),
    };
    service = new ListsService(repo as any, {} as any, {} as any, {} as any);
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  const at = (day: number, hour = 10) =>
    jest.setSystemTime(new Date(2026, 8, day, hour));

  it.each([
    ['sábado', 19],
    ['domingo', 20],
    ['lunes', 21],
    ['martes', 22],
  ])('mantiene el radar en actuales el %s', async (_name, day) => {
    rows = [radar];
    at(day as number);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(1);
    expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(0);
  });

  it('pasa el radar a pasadas el miércoles', async () => {
    rows = [radar];
    at(23, 0);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(0);
    expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(1);
  });

  it('usa releaseDate como respaldo si closeDate es null', async () => {
    rows = [legacyRadar];
    at(20);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(1);
    at(22);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(0);
    expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(1);
  });

  it('nunca devuelve una lista en actuales y pasadas a la vez', async () => {
    rows = [radar, legacyRadar];
    for (let day = 15; day <= 26; day++) {
      at(day);
      const current = await service.findCurrentWeeklyLists();
      const past = await service.findPastWeeklyListsByMonth(2026, 9);
      expect(current.length + past.length).toBe(rows.length);
    }
  });

  it('getWeeklyOpenCutoff resta 2 días al inicio del día', () => {
    expect(getWeeklyOpenCutoff(new Date(2026, 8, 22, 15))).toEqual(
      new Date(2026, 8, 20),
    );
  });
});

describe('ListsService monthly lists', () => {
  // La lista mensual usa el día 15 del mes como listDate.
  const september: Row = {
    listDate: new Date(2026, 8, 15),
    releaseDate: null,
    closeDate: null,
  };
  const october: Row = { ...september, listDate: new Date(2026, 9, 15) };

  let rows: Row[];
  let service: ListsService;

  beforeEach(() => {
    rows = [];
    const repo = {
      find: jest.fn(async ({ where }) => rows.filter((r) => matches(where, r))),
    };
    service = new ListsService(repo as any, {} as any, {} as any, {} as any);
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  const at = (month: number, day: number) =>
    jest.setSystemTime(new Date(2026, month, day, 10));

  it('septiembre está solo en actuales durante septiembre', async () => {
    rows = [september];
    at(8, 21);
    expect(await service.findCurrentMonthLists()).toHaveLength(1);
    expect(await service.findPastMonthListsByYear(2026)).toHaveLength(0);
  });

  it('septiembre sigue en actuales hasta el 12 de octubre', async () => {
    rows = [september];
    at(9, 1);
    expect(await service.findCurrentMonthLists()).toHaveLength(1);
    at(9, 12);
    expect(await service.findCurrentMonthLists()).toHaveLength(1);
    expect(await service.findPastMonthListsByYear(2026)).toHaveLength(0);
  });

  it('septiembre pasa a anteriores el 13 de octubre', async () => {
    rows = [september];
    at(9, 13);
    expect(await service.findCurrentMonthLists()).toHaveLength(0);
    expect(await service.findPastMonthListsByYear(2026)).toHaveLength(1);
  });

  it('con octubre creada, solo octubre es actual', async () => {
    rows = [september, october];
    at(9, 14);
    const current = await service.findCurrentMonthLists();
    expect(current).toEqual([october]);
    expect(await service.findPastMonthListsByYear(2026)).toEqual([september]);
  });

  it('el 5 de enero la lista de diciembre sigue siendo actual', async () => {
    const december: Row = { ...september, listDate: new Date(2026, 11, 15) };
    rows = [december];
    jest.setSystemTime(new Date(2027, 0, 5, 10));
    expect(await service.findCurrentMonthLists()).toHaveLength(1);
    expect(await service.findPastMonthListsByYear(2026)).toHaveLength(0);
  });

  it('nunca devuelve una lista en actuales y pasadas a la vez', async () => {
    rows = [september, october];
    for (let day = 1; day <= 28; day++) {
      for (const month of [8, 9]) {
        at(month, day);
        const current = await service.findCurrentMonthLists();
        const past = await service.findPastMonthListsByYear(2026);
        expect(current.length + past.length).toBe(rows.length);
      }
    }
  });

  it('getMonthlyReferenceStart usa el mes anterior hasta el día 12', () => {
    expect(getMonthlyReferenceStart(new Date(2026, 9, 12))).toEqual(
      new Date(2026, 8, 1),
    );
    expect(getMonthlyReferenceStart(new Date(2026, 9, 13))).toEqual(
      new Date(2026, 9, 1),
    );
  });
});

describe('ListsService Spotify publishing', () => {
  let service: ListsService;
  let spotifyApiService: {
    getAlbumTracks: jest.Mock;
    getArtistSingles: jest.Mock;
  };
  let wordpressService: {
    findPostBySlug: jest.Mock;
    getOrCreateTag: jest.Mock;
    createPost: jest.Mock;
  };

  beforeEach(() => {
    spotifyApiService = {
      getAlbumTracks: jest.fn().mockResolvedValue([]),
      getArtistSingles: jest.fn().mockResolvedValue([]),
    };
    wordpressService = {
      findPostBySlug: jest.fn().mockResolvedValue(null),
      getOrCreateTag: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
      createPost: jest.fn().mockResolvedValue({
        id: 42,
        link: 'https://riffvalley.test/list',
      }),
    };
  });

  it('prioritizes the manually selected track without querying Spotify', async () => {
    service = new ListsService(
      {} as any,
      {} as any,
      wordpressService as any,
      spotifyApiService as any,
    );
    await expect(
      (service as any).resolveSpotifyTrackId({
        spotifyTrackId: 'manual-track',
        disc: { artist: { name: 'Banda' }, name: 'Disco' },
      }),
    ).resolves.toBe('manual-track');
    expect(spotifyApiService.getAlbumTracks).not.toHaveBeenCalled();
    expect(spotifyApiService.getArtistSingles).not.toHaveBeenCalled();
  });

  it('selects the first album track matching a single without case sensitivity', async () => {
    service = new ListsService(
      {} as any,
      {} as any,
      wordpressService as any,
      spotifyApiService as any,
    );
    spotifyApiService.getAlbumTracks.mockResolvedValue([
      { id: 'track-first-match', name: 'anthem', trackNumber: 1 },
      { id: 'track-second-match', name: 'ANTHEM', trackNumber: 2 },
      { id: 'track-third', name: 'Otra', trackNumber: 3 },
    ]);
    spotifyApiService.getArtistSingles.mockResolvedValue(['Anthem']);

    await expect(
      (service as any).resolveSpotifyTrackId({
        spotifyTrackId: null,
        disc: { artist: { name: 'Banda' }, name: 'Disco' },
      }),
    ).resolves.toBe('track-first-match');
    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith(
      'Banda',
      'Disco',
    );
    expect(spotifyApiService.getArtistSingles).toHaveBeenCalledWith('Banda');
  });

  it('falls back to the third track, or the last when fewer than three exist', async () => {
    service = new ListsService(
      {} as any,
      {} as any,
      wordpressService as any,
      spotifyApiService as any,
    );
    spotifyApiService.getAlbumTracks.mockResolvedValueOnce([
      { id: 'track-1', name: 'Uno', trackNumber: 1 },
      { id: 'track-2', name: 'Dos', trackNumber: 2 },
      { id: 'track-3', name: 'Tres', trackNumber: 3 },
      { id: 'track-4', name: 'Cuatro', trackNumber: 4 },
    ]);
    spotifyApiService.getArtistSingles.mockResolvedValueOnce([]);

    await expect(
      (service as any).resolveSpotifyTrackId({
        spotifyTrackId: null,
        disc: { artist: { name: 'Banda' }, name: 'Disco' },
      }),
    ).resolves.toBe('track-3');

    spotifyApiService.getAlbumTracks.mockResolvedValueOnce([
      { id: 'track-1', name: 'Uno', trackNumber: 1 },
      { id: 'track-2', name: 'Dos', trackNumber: 2 },
    ]);
    spotifyApiService.getArtistSingles.mockResolvedValueOnce(['Otro']);
    await expect(
      (service as any).resolveSpotifyTrackId({
        spotifyTrackId: null,
        disc: { artist: { name: 'Banda' }, name: 'Disco' },
      }),
    ).resolves.toBe('track-2');
  });

  it('returns null without single lookup for an empty album or when provider lookup throws', async () => {
    service = new ListsService(
      {} as any,
      {} as any,
      wordpressService as any,
      spotifyApiService as any,
    );

    await expect(
      (service as any).resolveSpotifyTrackId({
        spotifyTrackId: null,
        disc: { artist: { name: 'Banda' }, name: 'Sin pistas' },
      }),
    ).resolves.toBeNull();
    expect(spotifyApiService.getArtistSingles).not.toHaveBeenCalled();

    spotifyApiService.getAlbumTracks.mockRejectedValueOnce(
      new Error('network down'),
    );
    await expect(
      (service as any).resolveSpotifyTrackId({
        spotifyTrackId: null,
        disc: { artist: { name: 'Banda' }, name: 'Disco' },
      }),
    ).resolves.toBeNull();

    spotifyApiService.getAlbumTracks.mockResolvedValueOnce([
      { id: 'track-1', name: 'Uno', trackNumber: 1 },
      { id: 'track-2', name: 'Dos', trackNumber: 2 },
      { id: 'track-3', name: 'Tres', trackNumber: 3 },
    ]);
    spotifyApiService.getArtistSingles.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );
    await expect(
      (service as any).resolveSpotifyTrackId({
        spotifyTrackId: null,
        disc: { artist: { name: 'Banda' }, name: 'Disco' },
      }),
    ).resolves.toBeNull();
  });

  it('publishes the selected track iframe through the WordPress service', async () => {
    const asignation = {
      id: 'asignation-id',
      position: 1,
      spotifyTrackId: 'manual-track',
      disc: {
        id: 'disc-id',
        name: 'Disco',
        artist: { name: 'Banda' },
        image: null,
      },
    };
    const list = {
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations: [asignation],
    };
    const listRepository = {
      findOneByOrFail: jest.fn().mockResolvedValue(list),
      save: jest.fn().mockResolvedValue(list),
    };
    service = new ListsService(
      listRepository as any,
      {} as any,
      wordpressService as any,
      spotifyApiService as any,
    );

    await expect(
      service.generateBestDiscsWordPressPost('list-id'),
    ).resolves.toMatchObject({
      wpPostId: 42,
      link: 'https://riffvalley.test/list',
    });

    const [, content] = wordpressService.createPost.mock.calls[0];
    expect(content).toContain(
      'https://open.spotify.com/embed/track/manual-track?utm_source=generator',
    );
    expect(spotifyApiService.getAlbumTracks).not.toHaveBeenCalled();
    expect(spotifyApiService.getArtistSingles).not.toHaveBeenCalled();
    expect(listRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ wpPostId: 42 }),
    );
  });

  it('publishes the automatically selected track through the same WordPress content path', async () => {
    const asignation = {
      id: 'asignation-id',
      position: 1,
      spotifyTrackId: null,
      disc: {
        id: 'disc-id',
        name: 'Disco',
        artist: { name: 'Banda' },
        image: null,
      },
    };
    const list = {
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations: [asignation],
    };
    const listRepository = {
      findOneByOrFail: jest.fn().mockResolvedValue(list),
      save: jest.fn().mockResolvedValue(list),
    };
    service = new ListsService(
      listRepository as any,
      {} as any,
      wordpressService as any,
      spotifyApiService as any,
    );
    spotifyApiService.getAlbumTracks.mockResolvedValue([
      { id: 'track-one', name: 'Uno', trackNumber: 1 },
      { id: 'auto-track', name: 'Single del álbum', trackNumber: 2 },
      { id: 'track-three', name: 'Tres', trackNumber: 3 },
    ]);
    spotifyApiService.getArtistSingles.mockResolvedValue(['Single del álbum']);

    await service.generateBestDiscsWordPressPost('list-id');

    const [, content] = wordpressService.createPost.mock.calls[0];
    expect(content).toContain(
      'https://open.spotify.com/embed/track/auto-track?utm_source=generator',
    );
    expect(spotifyApiService.getAlbumTracks).toHaveBeenCalledWith(
      'Banda',
      'Disco',
    );
    expect(spotifyApiService.getArtistSingles).toHaveBeenCalledWith('Banda');
  });
});

describe('ListsService WordPress errors', () => {
  it('propagates authenticated WordPress errors during post lookup', async () => {
    const error = new Error('WordPress API error: 401');
    const list = {
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations: [
        {
          position: 1,
          disc: { id: 'disc-id', name: 'Disco', artist: { name: 'Banda' } },
        },
      ],
    };
    const wordpressService = {
      findPostBySlug: jest.fn().mockRejectedValue(error),
      createPost: jest.fn(),
    };
    const service = new ListsService(
      { findOneByOrFail: jest.fn().mockResolvedValue(list) } as any,
      {} as any,
      wordpressService as any,
      {} as any,
    );

    await expect(
      service.generateBestDiscsWordPressPost('list-id'),
    ).rejects.toBe(error);
    expect(wordpressService.createPost).not.toHaveBeenCalled();
  });
});

describe('ListsService WordPress block reconciliation', () => {
  const discA = '11111111-1111-4111-8111-111111111111';
  const discB = '22222222-2222-4222-8222-222222222222';
  const footer = '<!-- wp:separator {"className":"rv-generated-footer"} -->';

  const asignation = (id: string, position: number) => ({
    id: `asignation-${id}`,
    position,
    spotifyTrackId: null,
    disc: {
      id,
      name: `Album ${id}`,
      artist: { name: `Artist ${id}` },
      image: null,
      debut: false,
      description: null,
    },
    description: null,
    genre: 'Rock',
    similarBands: 'Other band',
    user: null,
  });

  const block = (id: string) =>
    `<!-- wp:group {"className":"rv-disc-${id}"} -->\n<div class="wp-block-group rv-disc-${id}">${id}</div>\n<!-- /wp:group -->`;

  const render = (discs: any[]) =>
    discs.map((disc) => block(disc.disc.id)).join('\n\n');

  const serviceWith = (
    overrides: {
      listRepository?: Record<string, jest.Mock>;
      wordpressService?: Record<string, jest.Mock>;
    } = {},
  ) => {
    const listRepository = {
      save: jest.fn().mockImplementation(async (value) => value),
      ...overrides.listRepository,
    };
    const spotifyApiService = {
      getAlbumTracks: jest.fn().mockResolvedValue([]),
      getArtistSingles: jest.fn().mockResolvedValue([]),
    };
    const wordpressService = {
      updatePostContent: jest.fn().mockResolvedValue({}),
      getPost: jest.fn(),
      findPostBySlug: jest.fn(),
      createPost: jest.fn(),
      getOrCreateTag: jest.fn().mockResolvedValue(1),
      ...overrides.wordpressService,
    };
    return {
      service: new ListsService(
        listRepository as any,
        {} as any,
        wordpressService as unknown as WordpressService,
        spotifyApiService as any,
      ),
      listRepository,
      wordpressService,
    };
  };

  it('publishes blocks once, in editorial order, before the generated footer', async () => {
    const { service, wordpressService } = serviceWith();
    const discs = [asignation(discB, 1), asignation(discA, 2)];

    const result = await (service as any).syncDiscsIntoPost(
      12,
      `intro\n\n${footer}`,
      discs,
      [],
      render,
      false,
    );

    const postedContent = wordpressService.updatePostContent.mock.calls[0][1];
    expect(postedContent.indexOf(discB)).toBeLessThan(
      postedContent.indexOf(discA),
    );
    expect(postedContent.indexOf(discA)).toBeLessThan(
      postedContent.indexOf(footer),
    );
    expect(
      result.publishedDiscs.map((item: PublishedDiscRecord) => item.discId),
    ).toEqual([discB, discA]);
    expect(result.newCount).toBe(2);
  });

  it('treats a completed retry as idempotent when tracking and remote blocks agree', async () => {
    const { service, wordpressService } = serviceWith();
    const discs = [asignation(discA, 1)];
    const content = `intro\n\n${block(discA)}\n\n${footer}`;
    const tracked = [{ discId: discA, artist: 'Artist', name: 'Album' }];

    await (service as any).syncDiscsIntoPost(
      12,
      content,
      discs,
      tracked,
      render,
      false,
    );

    expect(wordpressService.updatePostContent).not.toHaveBeenCalled();
  });

  it('reconciles a remote block when local tracking is absent without appending another copy', async () => {
    const { service, wordpressService } = serviceWith();
    const discs = [asignation(discA, 1)];
    const content = `intro\n\n${block(discA)}\n\n${footer}`;

    const result = await (service as any).syncDiscsIntoPost(
      12,
      content,
      discs,
      [],
      render,
      false,
    );

    expect(result.trackingChanged).toBe(true);
    expect(result.publishedDiscs).toHaveLength(1);
    expect(wordpressService.updatePostContent).not.toHaveBeenCalled();
    expect(
      (content.match(new RegExp(`rv-disc-${discA}`, 'g')) ?? []).length,
    ).toBe(2);
  });

  it('preserves unrelated blocks and content when reconciling a known disc', async () => {
    const { service, wordpressService } = serviceWith();
    const foreignId = '33333333-3333-4333-8333-333333333333';
    const foreignBlock = block(foreignId);
    const content = `intro\n\n${foreignBlock}\n\n${footer}`;

    await (service as any).syncDiscsIntoPost(
      12,
      content,
      [asignation(discA, 1)],
      [],
      render,
      false,
    );

    const postedContent = wordpressService.updatePostContent.mock.calls[0][1];
    expect(postedContent).toContain(foreignBlock);
    expect(postedContent.indexOf(foreignBlock)).toBeLessThan(
      postedContent.indexOf(block(discA)),
    );
  });

  it('stops for manual review when a remote disc identity is duplicated', async () => {
    const { service, wordpressService } = serviceWith();
    const content = `${block(discA)}\n\n${block(discA)}\n\n${footer}`;

    await expect(
      (service as any).syncDiscsIntoPost(
        12,
        content,
        [asignation(discA, 1)],
        [],
        render,
        false,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(wordpressService.updatePostContent).not.toHaveBeenCalled();
  });

  it('does not retry a confirmed remote rejection or modify tracking', async () => {
    const rejection = new WordpressWriteError(
      'WordPress API error: 401',
      'rejected',
      401,
    );
    const { service, listRepository, wordpressService } = serviceWith({
      wordpressService: {
        updatePostContent: jest.fn().mockRejectedValue(rejection),
      },
    });

    await expect(
      (service as any).syncDiscsIntoPost(
        12,
        footer,
        [asignation(discA, 1)],
        [],
        render,
        false,
      ),
    ).rejects.toBe(rejection);
    expect(wordpressService.updatePostContent).toHaveBeenCalledTimes(1);
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('propagates unexpected WordPress errors without rereading or saving', async () => {
    const error = new Error('unexpected integration failure');
    const { service, listRepository, wordpressService } = serviceWith({
      wordpressService: {
        updatePostContent: jest.fn().mockRejectedValue(error),
      },
    });

    await expect(
      (service as any).syncDiscsIntoPost(
        12,
        footer,
        [asignation(discA, 1)],
        [],
        render,
        false,
      ),
    ).rejects.toBe(error);
    expect(wordpressService.getPost).not.toHaveBeenCalled();
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('accepts an uncertain update only after rereading its unique remote marker', async () => {
    let remoteContent = footer;
    const { service, wordpressService } = serviceWith({
      wordpressService: {
        updatePostContent: jest
          .fn()
          .mockImplementation(async (_id, content) => {
            remoteContent = content;
            throw new WordpressWriteError('socket closed', 'unknown');
          }),
        getPost: jest.fn().mockImplementation(async () => ({
          content: remoteContent,
          status: 'draft',
        })),
      },
    });

    const result = await (service as any).syncDiscsIntoPost(
      12,
      footer,
      [asignation(discA, 1)],
      [],
      render,
      false,
    );

    expect(result.publishedDiscs).toHaveLength(1);
    expect(wordpressService.getPost).toHaveBeenCalledWith(12);
  });

  it('returns a safe uncertain-result error without saving when remote confirmation fails', async () => {
    const { service, listRepository, wordpressService } = serviceWith({
      wordpressService: {
        updatePostContent: jest
          .fn()
          .mockRejectedValue(
            new WordpressWriteError('socket closed', 'unknown'),
          ),
        getPost: jest
          .fn()
          .mockResolvedValue({ content: footer, status: 'draft' }),
      },
    });

    await expect(
      (service as any).syncDiscsIntoPost(
        12,
        footer,
        [asignation(discA, 1)],
        [],
        render,
        false,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('does not accept a pre-existing marker as confirmation of an uncertain content update', async () => {
    const remoteBeforeWrite = `intro\n\n${block(discA)}\n\n${footer}`;
    const { service, wordpressService } = serviceWith({
      wordpressService: {
        updatePostContent: jest
          .fn()
          .mockRejectedValue(
            new WordpressWriteError('socket closed', 'unknown'),
          ),
        getPost: jest.fn().mockResolvedValue({
          content: remoteBeforeWrite,
          status: 'draft',
        }),
      },
    });
    const changedAssignment = {
      ...asignation(discA, 1),
      description: '<p>Updated editorial text</p>',
    };

    await expect(
      (service as any).syncDiscsIntoPost(
        12,
        remoteBeforeWrite,
        [changedAssignment],
        [{ discId: discA, artist: 'Artist', name: 'Album' }],
        (discs: any[]) => block(discA) + discs[0].description,
        false,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(wordpressService.getPost).toHaveBeenCalledWith(12);
  });

  it('recovers a post found by stable slug after create returned an uncertain outcome', async () => {
    const list = {
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations: [asignation(discA, 1)],
      wpPostId: null,
      wpPublishedDiscs: null,
    };
    const post = {
      id: 42,
      link: 'https://riffvalley.test/list',
      title: { rendered: 'Mejores discos' },
      status: 'draft',
    };
    const { service, listRepository, wordpressService } = serviceWith({
      listRepository: {
        save: jest.fn().mockImplementation(async (value) => value),
      },
      wordpressService: {
        findPostBySlug: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue(post),
        createPost: jest
          .fn()
          .mockRejectedValue(
            new WordpressWriteError('socket closed', 'unknown'),
          ),
      },
    });
    jest.spyOn(service, 'findOne').mockResolvedValue(list as List);

    await service.generateBestDiscsWordPressPost('list-id');

    expect(wordpressService.findPostBySlug).toHaveBeenCalledWith(
      'mejores-discos-de-octubre-2026',
    );
    expect(wordpressService.createPost).toHaveBeenCalledTimes(1);
    expect(listRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        wpPostId: post.id,
        wpPublishedDiscs: [
          { discId: discA, artist: `Artist ${discA}`, name: `Album ${discA}` },
        ],
      }),
    );
  });

  it('does not duplicate an earlier weekly post when a later position fails and the batch is retried', async () => {
    const originalList = () => ({
      id: 'list-id',
      type: ListType.WEEK,
      releaseDate: new Date('2026-10-09T00:00:00.000Z'),
      listDate: new Date('2026-10-09T00:00:00.000Z'),
      asignations: [asignation(discA, 1), asignation(discB, 2)],
      wpWeeklyPosts: [
        {
          position: 1,
          wpPostId: 101,
          wpPostUrl: 'https://wp.test/one',
          publishedDiscs: [],
        },
        {
          position: 2,
          wpPostId: 202,
          wpPostUrl: 'https://wp.test/two',
          publishedDiscs: [],
        },
      ],
    });
    const remoteContent = new Map<number, string>([
      [101, footer],
      [202, footer],
    ]);
    let failSecondPosition = true;
    const updatePostContent = jest
      .fn()
      .mockImplementation(async (postId: number, content: string) => {
        if (postId === 202 && failSecondPosition) {
          failSecondPosition = false;
          throw new WordpressWriteError(
            'WordPress API error: 401',
            'rejected',
            401,
          );
        }
        remoteContent.set(postId, content);
        return {};
      });
    const { service, listRepository, wordpressService } = serviceWith({
      listRepository: {
        findOneByOrFail: jest
          .fn()
          .mockImplementation(async () => originalList()),
      },
      wordpressService: {
        getPost: jest.fn().mockImplementation(async (postId: number) => ({
          content: remoteContent.get(postId),
          status: 'draft',
        })),
        updatePostContent,
        getOrCreateTag: jest.fn().mockResolvedValue(1),
      },
    });

    await expect(
      service.generateWordPressPosts('list-id'),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(listRepository.save).not.toHaveBeenCalled();

    await service.generateWordPressPosts('list-id');

    expect(listRepository.save).toHaveBeenCalledTimes(1);
    expect(
      remoteContent.get(101)?.match(new RegExp(`rv-disc-${discA}`, 'g')) ?? [],
    ).toHaveLength(2);
    expect(
      remoteContent.get(202)?.match(new RegExp(`rv-disc-${discB}`, 'g')) ?? [],
    ).toHaveLength(2);
    expect(updatePostContent).toHaveBeenCalledTimes(3);
    expect(wordpressService.createPost).not.toHaveBeenCalled();
  });

  it('reconciles by slug after WordPress creation succeeded but local tracking save failed', async () => {
    const makeList = () => ({
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations: [asignation(discA, 1)],
      wpPostId: null,
      wpPublishedDiscs: null,
    });
    const post = {
      id: 42,
      link: 'https://riffvalley.test/list',
      title: { rendered: 'Mejores discos' },
      status: 'draft',
    };
    let remotePostExists = false;
    const { service, listRepository, wordpressService } = serviceWith({
      listRepository: {
        save: jest
          .fn()
          .mockRejectedValueOnce(new Error('database unavailable'))
          .mockImplementation(async (value) => value),
      },
      wordpressService: {
        findPostBySlug: jest
          .fn()
          .mockImplementation(async () => (remotePostExists ? post : null)),
        createPost: jest.fn().mockImplementation(async () => {
          remotePostExists = true;
          return post;
        }),
      },
    });
    jest
      .spyOn(service, 'findOne')
      .mockImplementation(async () => makeList() as List);

    await expect(
      service.generateBestDiscsWordPressPost('list-id'),
    ).rejects.toThrow('database unavailable');
    await service.generateBestDiscsWordPressPost('list-id');

    expect(wordpressService.createPost).toHaveBeenCalledTimes(1);
    expect(wordpressService.findPostBySlug).toHaveBeenCalledTimes(2);
    expect(listRepository.save).toHaveBeenCalledTimes(2);
    expect(listRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ wpPostId: post.id }),
    );
  });

  it('does not create a post again when an uncertain create cannot be found reliably', async () => {
    const list = {
      id: 'list-id',
      type: ListType.MONTH,
      listDate: new Date('2026-10-01T00:00:00.000Z'),
      asignations: [asignation(discA, 1)],
      wpPostId: null,
      wpPublishedDiscs: null,
    };
    const { service, listRepository, wordpressService } = serviceWith({
      wordpressService: {
        findPostBySlug: jest.fn().mockResolvedValue(null),
        createPost: jest
          .fn()
          .mockRejectedValue(
            new WordpressWriteError('socket closed', 'unknown'),
          ),
      },
    });
    jest.spyOn(service, 'findOne').mockResolvedValue(list as List);

    await expect(
      service.generateBestDiscsWordPressPost('list-id'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(wordpressService.createPost).toHaveBeenCalledTimes(1);
    expect(listRepository.save).not.toHaveBeenCalled();
  });
});

describe('ListsService List/Content writes', () => {
  const linkedContent = () => ({
    id: 'content-id',
    type: ContentType.BEST,
    publicationDate: new Date('2026-10-01T00:00:00.000Z'),
    closeDate: new Date('2026-10-05T00:00:00.000Z'),
    listDate: new Date('2026-10-03T00:00:00.000Z'),
  });

  const makeTransactionalService = (
    overrides: {
      listSave?: jest.Mock;
      contentSave?: jest.Mock;
      listRemove?: jest.Mock;
      contentRemove?: jest.Mock;
      hasContent?: boolean;
      contentType?: ContentType;
    } = {},
  ) => {
    const list = {
      id: 'list-id',
      type: ListType.WEEK,
      name: 'Radar',
      releaseDate: new Date('2026-10-01T00:00:00.000Z'),
      closeDate: new Date('2026-10-05T00:00:00.000Z'),
      listDate: new Date('2026-10-03T00:00:00.000Z'),
    };
    const content = linkedContent();
    content.type = overrides.contentType ?? content.type;
    const listRepository: any = {
      preload: jest
        .fn()
        .mockImplementation(async (values) => ({ ...list, ...values })),
      save: jest.fn().mockImplementation(async (value) => value),
      findOne: jest.fn().mockResolvedValue(list),
      remove: jest.fn().mockResolvedValue(list),
    };
    const contentRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue(overrides.hasContent === false ? null : content),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn().mockResolvedValue(content),
    };
    const txListRepository = {
      preload: jest
        .fn()
        .mockImplementation(async (values) => ({ ...list, ...values })),
      save:
        overrides.listSave ??
        jest.fn().mockImplementation(async (value) => {
          Object.assign(list, value);
          return value;
        }),
      findOne: jest.fn().mockResolvedValue(list),
      remove:
        overrides.listRemove ??
        jest.fn().mockImplementation(async () => {
          (list as any).deleted = true;
          return list;
        }),
    };
    const txContentRepository = {
      findOne: jest.fn().mockResolvedValue(content),
      save:
        overrides.contentSave ??
        jest.fn().mockImplementation(async (value) => {
          Object.assign(content, value);
          return value;
        }),
      remove:
        overrides.contentRemove ??
        jest.fn().mockImplementation(async () => {
          (content as any).deleted = true;
          return content;
        }),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === List ? txListRepository : txContentRepository,
      ),
    };
    const transaction = jest.fn(async (callback) => {
      const listSnapshot = { ...list };
      const contentSnapshot = { ...content };
      try {
        return await callback(manager);
      } catch (error) {
        for (const key of Object.keys(list)) {
          if (!(key in listSnapshot)) delete (list as any)[key];
        }
        for (const key of Object.keys(content)) {
          if (!(key in contentSnapshot)) delete (content as any)[key];
        }
        Object.assign(list, listSnapshot);
        Object.assign(content, contentSnapshot);
        throw error;
      }
    });
    listRepository.manager = { transaction };

    const service = new ListsService(
      listRepository as any,
      contentRepository as any,
      {} as any,
      {} as any,
    );

    return {
      service,
      list,
      content,
      listRepository,
      contentRepository,
      txListRepository,
      txContentRepository,
      manager,
      transaction,
    };
  };

  it('synchronizes valid dates and explicit nulls in one transaction', async () => {
    const {
      service,
      content,
      txListRepository,
      txContentRepository,
      manager,
      transaction,
    } = makeTransactionalService();

    await service.update('list-id', {
      releaseDate: '2026-11-01T00:00:00.000Z',
      closeDate: null,
      listDate: null,
    } as any);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(List);
    expect(manager.getRepository).toHaveBeenCalledWith(Content);
    expect(txListRepository.save).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).toHaveBeenCalledTimes(1);
    expect(content.publicationDate).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(content.closeDate).toBeNull();
    expect(content.listDate).toBeNull();
  });

  it('leaves all synchronized dates unchanged when date fields are omitted', async () => {
    const { service, content, transaction, contentRepository } =
      makeTransactionalService();

    await service.update('list-id', { name: 'Renamed' } as any);

    expect(transaction).not.toHaveBeenCalled();
    expect(content.publicationDate).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(content.closeDate).toEqual(new Date('2026-10-05T00:00:00.000Z'));
    expect(content.listDate).toEqual(new Date('2026-10-03T00:00:00.000Z'));
    expect(contentRepository.save).not.toHaveBeenCalled();
  });

  it('preserves omitted dates and avoids a transaction when no Content is linked', async () => {
    const { service, list, listRepository, contentRepository, transaction } =
      makeTransactionalService({ hasContent: false });

    await service.update('list-id', { name: 'Renamed' } as any);

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed' }),
    );
    expect(contentRepository.save).not.toHaveBeenCalled();
  });

  it('preserves the required RADAR publication date when releaseDate is null', async () => {
    const { service, listRepository, transaction } = makeTransactionalService({
      contentType: ContentType.RADAR,
    });

    await expect(
      service.update('list-id', { releaseDate: null } as any),
    ).rejects.toMatchObject({ status: 400 });

    expect(transaction).not.toHaveBeenCalled();
    expect(listRepository.save).not.toHaveBeenCalled();
  });

  it('rolls the paired update back when saving List fails', async () => {
    const error = new Error('list write failed');
    const { service, txContentRepository, transaction } =
      makeTransactionalService({
        listSave: jest.fn().mockRejectedValue(error),
      });

    await expect(
      service.update('list-id', { closeDate: null } as any),
    ).rejects.toMatchObject({ status: 500 });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).not.toHaveBeenCalled();
  });

  it('uses the transaction manager for both saves when Content save fails', async () => {
    const error = new Error('content write failed');
    const {
      service,
      list,
      content,
      txListRepository,
      txContentRepository,
      transaction,
    } = makeTransactionalService({
      contentSave: jest.fn().mockRejectedValue(error),
    });

    await expect(
      service.update('list-id', { releaseDate: null } as any),
    ).rejects.toMatchObject({ status: 500 });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txListRepository.save).toHaveBeenCalledTimes(1);
    expect(txContentRepository.save).toHaveBeenCalledTimes(1);
    expect(list.releaseDate).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(content.publicationDate).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
  });

  it('deletes both entities in the transaction and rejects a failed List deletion', async () => {
    const error = new Error('list delete failed');
    const { service, content, list, txContentRepository, transaction } =
      makeTransactionalService({
        listRemove: jest.fn().mockRejectedValue(error),
      });

    await expect(service.removeList('list-id')).rejects.toBe(error);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txContentRepository.remove).toHaveBeenCalledTimes(1);
    expect((content as any).deleted).toBeUndefined();
    expect((list as any).deleted).toBeUndefined();
  });

  it('commits the related Content and List deletion through one manager', async () => {
    const { service, content, list, transaction } = makeTransactionalService();

    await service.removeList('list-id');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect((content as any).deleted).toBe(true);
    expect((list as any).deleted).toBe(true);
  });
});
