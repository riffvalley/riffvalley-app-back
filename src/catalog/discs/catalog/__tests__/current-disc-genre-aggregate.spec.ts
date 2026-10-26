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
    query.mockResolvedValue([{ monthCount: '2', yearCount: '4' }]);
    await expect(
      service.countCurrentGenresForDiscSets(['a', 'b', 'b'], ['a', 'b', 'c']),
    ).resolves.toEqual({ month: 2, year: 4 });
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('COUNT(DISTINCT disc."genreId")');
    expect(sql).toContain('INNER JOIN disc');
    expect(sql).toContain('disc."genreId" IS NOT NULL');
    expect(parameters).toEqual([
      ['a', 'b', 'b'],
      ['a', 'b', 'c'],
    ]);
  });

  it('returns zero without querying when both sets are empty', async () => {
    await expect(
      service.countCurrentGenresForDiscSets([], []),
    ).resolves.toEqual({
      month: 0,
      year: 0,
    });
    expect(query).not.toHaveBeenCalled();
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
