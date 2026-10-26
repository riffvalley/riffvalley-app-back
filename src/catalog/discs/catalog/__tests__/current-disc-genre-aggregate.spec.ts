import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Disc } from '../../entities/disc.entity';
import { DiscCatalogService } from '../disc-catalog.service';

describe('DiscCatalogService current genre aggregates', () => {
  let moduleRef: TestingModule;
  let query: jest.Mock<Promise<unknown>, [string, unknown[]]>;
  let service: DiscCatalogService;

  beforeEach(async () => {
    query = jest.fn<Promise<unknown>, [string, unknown[]]>();
    moduleRef = await Test.createTestingModule({
      providers: [
        DiscCatalogService,
        { provide: getRepositoryToken(Disc), useValue: { query } },
      ],
    }).compile();
    service = moduleRef.get(DiscCatalogService);
  });

  afterEach(async () => moduleRef.close());

  it('counts distinct current genre ids once for each supplied disc set', async () => {
    query.mockResolvedValue([
      { monthCount: '2', yearCount: '4', totalRatedCount: '3' },
    ]);
    await expect(
      service.countCurrentGenresForDiscSets(
        ['a', 'b', 'b'],
        ['a', 'b', 'c'],
        ['a', 'c', 'd'],
      ),
    ).resolves.toEqual({ month: 2, year: 4, totalRated: 3 });
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('COUNT(DISTINCT disc."genreId")');
    expect(sql).toContain('INNER JOIN disc');
    expect(sql).toContain('disc."genreId" IS NOT NULL');
    expect(parameters).toEqual([
      ['a', 'b', 'b'],
      ['a', 'b', 'c'],
      ['a', 'c', 'd'],
    ]);
    expect(sql).toContain('total_rated_discs AS');
  });

  it('returns zero without querying when both sets are empty', async () => {
    await expect(
      service.countCurrentGenresForDiscSets([], []),
    ).resolves.toEqual({
      month: 0,
      year: 0,
      totalRated: 0,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('counts distinct Madrid calendar release dates for current month and year', async () => {
    query.mockResolvedValue([{ monthCount: '2', yearCount: '5' }]);

    await expect(service.countDiscsByReleasePeriod()).resolves.toEqual({
      thisMonth: 2,
      thisYear: 5,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toBeUndefined();
    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid'");
    expect(sql).toContain("date_trunc('month'");
    expect(sql).toContain("date_trunc('year'");
    expect(sql).toContain('disc."releaseDate" >= madrid_calendar.month_start');
    expect(sql).toContain(
      'disc."releaseDate" < (madrid_calendar.month_start + INTERVAL \'1 month\')::date',
    );
    expect(sql).toContain('disc."releaseDate" IS NOT NULL');
    expect(sql).toContain('COUNT(DISTINCT disc.id) FILTER');
    expect(sql).toContain("INTERVAL '1 year'");
    expect(sql).not.toContain('createdAt');
  });

  it('propagates release-period errors and rejects a missing aggregate row', async () => {
    query.mockRejectedValue(new Error('catalog unavailable'));
    await expect(service.countDiscsByReleasePeriod()).rejects.toThrow(
      'catalog unavailable',
    );
    query.mockResolvedValue([]);
    await expect(service.countDiscsByReleasePeriod()).rejects.toThrow(
      'Release period aggregate query returned no row',
    );
  });

  it('propagates query errors and rejects an unexpected empty aggregate result', async () => {
    query.mockRejectedValue(new Error('catalog unavailable'));
    await expect(
      service.countCurrentGenresForDiscSets(['a'], ['a']),
    ).rejects.toThrow('catalog unavailable');
    query.mockResolvedValue([]);
    await expect(
      service.countCurrentGenresForDiscSets(['a'], ['a']),
    ).rejects.toThrow('Current genre aggregate query returned no row');
  });
});
