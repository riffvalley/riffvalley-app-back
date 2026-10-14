import { FindOperator } from 'typeorm';
import { ListType } from './entities/list.entity';
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
