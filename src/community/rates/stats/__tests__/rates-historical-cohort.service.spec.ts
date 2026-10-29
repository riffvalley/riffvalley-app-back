import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RatesHistoricalCohortService } from '../rates-historical-cohort.service';

interface QueryRow {
  rateId: string;
  discId: string;
  releaseDate: string;
  createdAtLocal: string;
  currentRate: number | string | null;
  currentScorePosition: number | string;
}

function createService(rows: QueryRow[] = []) {
  const repository = new Repository<Rate>(
    Rate,
    new EntityManager(
      new DataSource({ type: 'postgres', database: 'rates-historical-cohort' }),
    ),
  );
  const query = jest
    .fn<Promise<QueryRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  Object.assign(repository, { query });
  return { service: new RatesHistoricalCohortService(repository), query };
}

describe('RatesHistoricalCohortService', () => {
  it.each([
    [
      2025,
      '2025-01-01 00:00:00',
      '2026-01-01 00:00:00',
      '2024-12-31T23:00:00.000Z',
      '2025-12-31T23:00:00.000Z',
    ],
    [
      2026,
      '2026-01-01 00:00:00',
      '2027-01-01 00:00:00',
      '2025-12-31T23:00:00.000Z',
      '2026-12-31T23:00:00.000Z',
    ],
  ])(
    'uses Madrid local half-open boundaries for %i',
    async (year, start, end, startInstant, endInstant) => {
      const { service, query } = createService();

      await service.selectForUser('session-user-id', year);

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, parameters] = query.mock.calls[0];
      expect(sql).toContain('rate."userId" = $1');
      expect(sql).toContain('disc."releaseDate" >= $2::date');
      expect(sql).toContain('disc."releaseDate" < $3::date');
      expect(sql).toContain(
        `pg_typeof(rate."createdAt") = 'timestamp with time zone'::regtype`,
      );
      expect(sql).toContain(
        'rate."createdAt" >= $4::timestamp without time zone',
      );
      expect(sql).toContain(
        'rate."createdAt" < $5::timestamp without time zone',
      );
      expect(sql).toContain('rate."createdAt" >= $6::timestamptz');
      expect(sql).toContain('rate."createdAt" < $7::timestamptz');
      expect(parameters).toEqual([
        'session-user-id',
        `${year}-01-01`,
        `${year + 1}-01-01`,
        start,
        end,
        startInstant,
        endInstant,
      ]);
      expect(sql).not.toContain('editedAt" >=');
    },
  );

  it('keeps every historical Rate row and creates one scored disc per eligible disc', async () => {
    const { service } = createService([
      {
        rateId: 'rate-null',
        discId: 'disc-null',
        releaseDate: '2025-03-12',
        createdAtLocal: '2025-03-12 10:00:00',
        currentRate: null,
        currentScorePosition: 1,
      },
      {
        rateId: 'rate-old-duplicate',
        discId: 'disc-duplicate',
        releaseDate: '2025-04-10',
        createdAtLocal: '2025-04-10 10:00:00',
        currentRate: '7.25',
        currentScorePosition: 2,
      },
      {
        rateId: 'rate-current-duplicate',
        discId: 'disc-duplicate',
        releaseDate: '2025-04-10',
        createdAtLocal: '2025-04-10 10:05:00',
        currentRate: '8.50',
        currentScorePosition: 1,
      },
      {
        rateId: 'rate-out-of-range',
        discId: 'disc-invalid-score',
        releaseDate: '2025-05-05',
        createdAtLocal: '2025-05-05 10:00:00',
        currentRate: '10.01',
        currentScorePosition: 1,
      },
      {
        rateId: 'rate-nan-score',
        discId: 'disc-nan-score',
        releaseDate: '2025-05-06',
        createdAtLocal: '2025-05-06 10:00:00',
        currentRate: 'NaN',
        currentScorePosition: 1,
      },
    ]);

    const result = await service.selectForUser('session-user-id', 2025);

    expect(result.historicalAssignments).toHaveLength(5);
    expect(result.historicalAssignments[0]).toMatchObject({
      rateId: 'rate-null',
      currentRate: null,
    });
    expect(result.currentScoredDiscs).toEqual([
      {
        rateId: 'rate-current-duplicate',
        discId: 'disc-duplicate',
        releaseDate: '2025-04-10',
        currentRate: 8.5,
      },
    ]);
  });

  it('returns empty cohorts when there are no eligible rows', async () => {
    const { service } = createService();

    await expect(
      service.selectForUser('session-user-id', 2026),
    ).resolves.toEqual({
      year: 2026,
      historicalAssignments: [],
      currentScoredDiscs: [],
    });
  });

  it.each([2024, 2027])('rejects year %i without querying', async (year) => {
    const { service, query } = createService();

    await expect(
      service.selectForUser('session-user-id', year),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
