import { ArtistDirectoryService } from '../artist-directory.service';

describe('ArtistDirectoryService', () => {
  const artistRepository = { query: jest.fn() };
  let service: ArtistDirectoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    artistRepository.query
      .mockResolvedValueOnce([{ totalItems: 2 }])
      .mockResolvedValueOnce([
        { id: 'artist-1', name: 'A Band', genre: 'Metal', genreColor: '#123' },
        { id: 'artist-2', name: 'Ä Band', genre: null, genreColor: null },
      ]);
    service = new ArtistDirectoryService(artistRepository);
  });

  it('defaults to A, counts before pagination, and projects only directory fields', async () => {
    await expect(service.findDirectory({})).resolves.toEqual({
      totalItems: 2,
      totalPages: 1,
      currentPage: 1,
      limit: 20,
      data: [
        {
          id: 'artist-1',
          name: 'A Band',
          genre: 'Metal',
          genreColor: '#123',
        },
        { id: 'artist-2', name: 'Ä Band', genre: null, genreColor: null },
      ],
    });
    const [countSql, countParameters] = artistRepository.query.mock
      .calls[0] as [string, unknown[]];
    const [pageSql, pageParameters] = artistRepository.query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(countSql).toContain('COUNT(*)::int');
    expect(countSql).toContain('= $1');
    expect(countParameters).toEqual(['A']);
    expect(pageSql).toContain('DESC NULLS LAST, disc.id ASC');
    expect(pageSql).toContain('disc."artistId" = artist.id');
    expect(pageSql).toContain('ORDER BY');
    expect(pageSql).toContain('artist.id ASC');
    expect(pageParameters).toEqual(['A', 20, 0]);
    expect(artistRepository.query).toHaveBeenCalledTimes(2);
  });

  it.each('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))(
    'applies letter %s in SQL before both counting and paging',
    async (letter) => {
      await service.findDirectory({ letter, limit: 4, offset: 8 });
      const [countSql, countParameters] = artistRepository.query.mock
        .calls[0] as [string, unknown[]];
      const [pageSql, pageParameters] = artistRepository.query.mock
        .calls[1] as [string, unknown[]];
      expect(countSql).toContain('CASE WHEN');
      expect(countParameters).toEqual([letter]);
      expect(pageSql).toContain('CASE WHEN');
      expect(pageParameters).toEqual([letter, 4, 8]);
    },
  );

  it('filters the special category and makes textual search independent of letter', async () => {
    await service.findDirectory({ letter: '#', limit: 15, offset: 30 });
    const [specialCount, specialParameters] = artistRepository.query.mock
      .calls[0] as [string, unknown[]];
    expect(specialCount).toContain("ELSE '#' END = $1");
    expect(specialParameters).toEqual(['#']);

    jest.clearAllMocks();
    artistRepository.query
      .mockResolvedValueOnce([{ totalItems: '1' }])
      .mockResolvedValueOnce([
        { id: 'artist-1', name: 'The Cure', genre: null, genreColor: null },
      ]);
    await expect(
      service.findDirectory({
        letter: 'Z',
        q: 'The Cure',
        limit: 1,
        offset: 0,
      }),
    ).resolves.toMatchObject({ totalItems: 1, data: [{ name: 'The Cure' }] });
    const [searchSql, searchParameters] = artistRepository.query.mock
      .calls[0] as [string, unknown[]];
    expect(searchSql).toContain('LIKE ANY($1::text[])');
    expect(searchSql).not.toContain('CASE WHEN');
    expect(searchParameters).toEqual([['%the cure%', '%cure%'], '%the cure%']);
  });

  it('combines genre with letter or text search before counting and pagination', async () => {
    await service.findDirectory({
      letter: 'T',
      genreId: 'genre-id',
      limit: 4,
      offset: 8,
    });
    let [countSql, countParameters] = artistRepository.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    let [pageSql, pageParameters] = artistRepository.query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(countSql).toContain('EXISTS (SELECT 1 FROM disc genre_disc');
    expect(countSql).toContain('= $2');
    expect(countParameters).toEqual(['T', 'genre-id']);
    expect(pageSql).toContain('EXISTS (SELECT 1 FROM disc genre_disc');
    expect(pageParameters).toEqual(['T', 'genre-id', 4, 8]);

    artistRepository.query
      .mockReset()
      .mockResolvedValueOnce([{ totalItems: 1 }])
      .mockResolvedValueOnce([
        { id: 'artist-1', name: 'The Cure', genre: 'Rock', genreColor: '#123' },
      ]);
    await service.findDirectory({
      letter: 'Z',
      q: 'The Cure',
      genreId: 'genre-id',
      limit: 1,
      offset: 0,
    });
    [countSql, countParameters] = artistRepository.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    [pageSql, pageParameters] = artistRepository.query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(countSql).toContain('LIKE ANY($1::text[])');
    expect(countSql).toContain('EXISTS (SELECT 1 FROM disc genre_disc');
    expect(countParameters).toEqual([
      ['%the cure%', '%cure%'],
      '%the cure%',
      'genre-id',
    ]);
    expect(pageParameters).toEqual([
      ['%the cure%', '%cure%'],
      '%the cure%',
      'genre-id',
      1,
      0,
    ]);
  });

  it('does not apply a genre predicate when genreId is omitted', async () => {
    await service.findDirectory({ letter: 'A' });
    const [countSql] = artistRepository.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(countSql).not.toContain('genre_disc');
  });

  it('preserves out-of-range counts and stable page metadata', async () => {
    artistRepository.query
      .mockReset()
      .mockResolvedValueOnce([{ totalItems: 41 }])
      .mockResolvedValueOnce([]);
    await expect(
      service.findDirectory({ letter: 'B', limit: 10, offset: 50 }),
    ).resolves.toEqual({
      totalItems: 41,
      totalPages: 5,
      currentPage: 6,
      limit: 10,
      data: [],
    });
    expect(artistRepository.query).toHaveBeenCalledTimes(2);
  });
});
