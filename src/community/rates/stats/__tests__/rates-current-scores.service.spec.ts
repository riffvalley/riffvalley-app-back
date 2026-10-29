import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesCurrentScoresService } from '../rates-current-scores.service';

interface AggregateRow {
  aggregation: 'summary' | 'bucket';
  score: number | string | null;
  scoredDiscCount: number | string;
  mean: string | number | null;
  median: string | number | null;
  standardDeviation: string | number | null;
}

function createRows(options: {
  scoredDiscs: number;
  mean: string | null;
  median: string | null;
  standardDeviation?: string | null;
  buckets?: number[];
}): AggregateRow[] {
  const counts = options.buckets ?? Array.from({ length: 11 }, () => 0);
  return [
    {
      aggregation: 'summary',
      score: null,
      scoredDiscCount: options.scoredDiscs,
      mean: options.mean,
      median: options.median,
      standardDeviation: options.standardDeviation ?? null,
    },
    ...counts.map(
      (scoredDiscCount, score): AggregateRow => ({
        aggregation: 'bucket',
        score,
        scoredDiscCount,
        mean: null,
        median: null,
        standardDeviation: null,
      }),
    ),
  ];
}

function createService(
  rows: AggregateRow[] = createRows({
    scoredDiscs: 0,
    mean: null,
    median: null,
    standardDeviation: null,
  }),
): {
  service: RatesCurrentScoresService;
  rateQuery: jest.Mock<Promise<AggregateRow[]>, [string, unknown[]?]>;
  eventQuery: jest.Mock<Promise<AggregateRow[]>, [string, unknown[]?]>;
} {
  const manager = new EntityManager(
    new DataSource({ type: 'postgres', database: 'current-score-stats' }),
  );
  const rateRepository = new Repository<Rate>(Rate, manager);
  const eventRepository = new Repository<RateVoteEvent>(RateVoteEvent, manager);
  const rateQuery = jest
    .fn<Promise<AggregateRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  const eventQuery = jest
    .fn<Promise<AggregateRow[]>, [string, unknown[]?]>()
    .mockResolvedValue(rows);
  Object.assign(rateRepository, { query: rateQuery });
  Object.assign(eventRepository, { query: eventQuery });
  return {
    service: new RatesCurrentScoresService(rateRepository, eventRepository),
    rateQuery,
    eventQuery,
  };
}

describe('RatesCurrentScoresService', () => {
  it.each([
    { year: 2025, repo: 'rate' },
    { year: 2026, repo: 'rate' },
    { year: 2027, repo: 'event' },
  ])('selects the $year population source', async ({ year, repo }) => {
    const { service, rateQuery, eventQuery } = createService();

    await service.aggregateForUser('user-id', year);

    expect(repo === 'rate' ? rateQuery : eventQuery).toHaveBeenCalledTimes(1);
    expect(repo === 'rate' ? eventQuery : rateQuery).not.toHaveBeenCalled();
  });

  it('uses the historical cohort and the established deterministic Rate winner before validating its note', async () => {
    const { service, rateQuery } = createService(
      createRows({
        scoredDiscs: 1,
        mean: '0.00',
        median: '0.00',
        standardDeviation: '0.00',
        buckets: [1, ...Array(10).fill(0)],
      }),
    );

    const result = await service.aggregateForUser('user-id', 2026);
    const sql = rateQuery.mock.calls[0][0];

    expect(result.mean).toBe(0);
    expect(result.median).toBe(0);
    expect(sql).toContain('disc."releaseDate" >= $2::date');
    expect(sql).toContain('rate."createdAt"');
    expect(sql).toContain(
      'ORDER BY "editedAt" DESC NULLS LAST, "createdAt" DESC, "rateId" DESC',
    );
    expect(sql).toContain('WHERE current_position = 1');
    expect(sql).toContain('"currentRate" IS NOT NULL');
    expect(sql).toContain('STDDEV_POP(score) AS "standardDeviation"');
    expect(rateQuery.mock.calls[0][1]).toEqual([
      'user-id',
      '2026-01-01',
      '2027-01-01',
      '2026-01-01 00:00:00',
      '2027-01-01 00:00:00',
      '2025-12-31T23:00:00.000Z',
      '2026-12-31T23:00:00.000Z',
    ]);
  });

  it('deduplicates modern eligible set events before joining current Rates and never reads event values as scores', async () => {
    const { service, eventQuery } = createService();

    await service.aggregateForUser('user-id', 2027, 'Europe/Madrid');
    const [sql, parameters] = eventQuery.mock.calls[0];

    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('event.previous_value IS NULL');
    expect(sql).toContain('event.new_value IS NOT NULL');
    expect(sql).toContain('MAX("occurredAt") AS "eligibleAt"');
    expect(sql).toContain('GROUP BY "discId"');
    expect(sql).toContain(
      'INNER JOIN rate ON rate."discId" = eligible_discs."discId"',
    );
    expect(sql).toContain('WHERE rate."userId" = $6');
    expect(sql).toContain(
      'ORDER BY rate."editedAt" DESC NULLS LAST, rate."createdAt" DESC, rate.id DESC',
    );
    expect(sql).not.toContain('event.new_value AS');
    expect(parameters).toHaveLength(6);
    expect(parameters?.[5]).toBe('user-id');
  });

  it('returns null statistics with all eleven ordered zero buckets when no valid current scores exist', async () => {
    const { service } = createService();

    await expect(service.aggregateForUser('user-id', 2025)).resolves.toEqual({
      year: 2025,
      scoredDiscs: 0,
      mean: null,
      median: null,
      standardDeviation: null,
      scoreDistribution: Array.from({ length: 11 }, (_, score) => ({
        score,
        scoredDiscCount: 0,
      })),
    });
  });

  it('uses the sole current score for both mean and median', async () => {
    const buckets = Array.from({ length: 11 }, (_, score) =>
      score === 8 ? 1 : 0,
    );
    const { service } = createService(
      createRows({
        scoredDiscs: 1,
        mean: '8.25',
        median: '8.25',
        standardDeviation: '0',
        buckets,
      }),
    );

    await expect(
      service.aggregateForUser('user-id', 2025),
    ).resolves.toMatchObject({
      scoredDiscs: 1,
      mean: 8.25,
      median: 8.25,
      standardDeviation: 0,
    });
  });

  it('preserves decimal mean and median and assigns the exact boundaries to floor buckets', async () => {
    const buckets = [1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1];
    const { service } = createService(
      createRows({
        scoredDiscs: 4,
        mean: '4.63',
        median: '4.50',
        standardDeviation: '3.54',
        buckets,
      }),
    );

    const result = await service.aggregateForUser('user-id', 2027);

    expect(result).toMatchObject({
      scoredDiscs: 4,
      mean: 4.63,
      median: 4.5,
      standardDeviation: 3.54,
      scoreDistribution: buckets.map((scoredDiscCount, score) => ({
        score,
        scoredDiscCount,
      })),
    });
  });

  it('rejects inconsistent bucket totals instead of returning contradictory metrics', async () => {
    const { service } = createService(
      createRows({
        scoredDiscs: 2,
        mean: '5',
        median: '5',
        buckets: [1, ...Array(10).fill(0)],
      }),
    );

    await expect(service.aggregateForUser('user-id', 2025)).rejects.toThrow(
      'Current score buckets do not match the scored disc count.',
    );
  });
});
