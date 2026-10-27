import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Disc } from '../../entities/disc.entity';
import { RatesRandomSelectionService } from '../../../../community/rates/random-selection/rates-random-selection.service';
import { DiscCatalogService } from '../disc-catalog.service';

describe('DiscCatalogService community dashboard release count', () => {
  let moduleRef: TestingModule;
  let query: jest.Mock<
    Promise<{ count: number | string }[]>,
    [string, unknown[]]
  >;

  beforeEach(async () => {
    query = jest.fn<Promise<{ count: number | string }[]>, [string, unknown[]]>(
      async () => [{ count: '12' }],
    );
    moduleRef = await Test.createTestingModule({
      providers: [
        DiscCatalogService,
        { provide: getRepositoryToken(Disc), useValue: { query } },
        { provide: RatesRandomSelectionService, useValue: {} },
      ],
    }).compile();
  });

  afterEach(async () => moduleRef.close());

  it('counts releaseDate calendar-year rows in Catalog without using createdAt', async () => {
    const service = moduleRef.get(DiscCatalogService);

    await expect(service.countDiscsReleasedInYear(2027)).resolves.toBe(12);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(DISTINCT disc.id)'),
      [2027],
    );
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('disc."releaseDate" >= make_date($1::int, 1, 1)');
    expect(sql).toContain('disc."releaseDate" < make_date($1::int + 1, 1, 1)');
    expect(sql).not.toContain('createdAt');
  });
});
