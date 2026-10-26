import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { HistoricalRatesStatsService } from '../historical-rates-stats.service';

describe('HistoricalRatesStatsService', () => {
  let moduleRef: TestingModule;
  let query: jest.Mock<Promise<unknown>, [string, unknown[]]>;
  let service: HistoricalRatesStatsService;

  const row = (overrides: Record<string, unknown> = {}) => ({
    captureStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    totalRatedDiscs: 0,
    today: '2026-10-26',
    captureDay: '2026-01-01',
    firstCoveredDay: '2026-01-02',
    monthStart: '2026-10-01',
    yearStart: '2026-01-01',
    monthRatedDiscIds: [],
    yearRatedDiscIds: [],
    monthRatedDiscCount: 0,
    yearRatedDiscCount: 0,
    monthMissingDiscEvents: 0,
    yearMissingDiscEvents: 0,
    historyMissingDiscEvents: 0,
    monthActiveDays: 0,
    streakDays: 0,
    streakMayExtendBeforeCapture: false,
    monthActiveDaysCovered: true,
    streakCovered: true,
    monthCovered: true,
    yearCovered: false,
    historyCovered: false,
    ...overrides,
  });

  beforeEach(async () => {
    query = jest.fn<Promise<unknown>, [string, unknown[]]>();
    moduleRef = await Test.createTestingModule({
      providers: [
        HistoricalRatesStatsService,
        { provide: getRepositoryToken(RateVoteEvent), useValue: { query } },
      ],
    }).compile();
    service = moduleRef.get(HistoricalRatesStatsService);
  });

  afterEach(async () => moduleRef.close());

  it('deduplicates repeated set events and returns distinct disc ids for covered periods', async () => {
    query.mockResolvedValue([
      row({
        monthRatedDiscIds: ['disc-a', 'disc-b'],
        yearRatedDiscIds: ['disc-a', 'disc-b', 'disc-c'],
        monthRatedDiscCount: 2,
        yearRatedDiscCount: 3,
        yearCovered: true,
        monthActiveDays: '2',
        streakDays: '2',
      }),
    ]);
    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      month: {
        ratedDiscs: 2,
        ratedDiscIds: ['disc-a', 'disc-b'],
        activeDays: 2,
        coverage: 'complete',
      },
      year: {
        ratedDiscs: 3,
        ratedDiscIds: ['disc-a', 'disc-b', 'disc-c'],
        coverage: 'complete',
      },
      currentStreak: 2,
    });
  });

  it('marks pre-capture and missing-disc periods unknown instead of returning zero', async () => {
    query.mockResolvedValue([
      row({
        monthCovered: true,
        yearCovered: false,
        monthMissingDiscEvents: '1',
        historyMissingDiscEvents: '2',
        monthActiveDays: 12,
        monthActiveDaysCovered: true,
      }),
    ]);

    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      month: {
        ratedDiscs: null,
        ratedDiscIds: null,
        activeDays: 12,
        coverage: 'partial_missing_disc_ids',
      },
      year: {
        ratedDiscs: null,
        ratedDiscIds: null,
        coverage: 'before_capture',
      },
      history: {
        ratedDiscs: null,
        ratedDiscIds: null,
        coverage: 'partial_missing_disc_ids',
      },
    });
  });

  it('returns known zero for a fully covered period with no events', async () => {
    query.mockResolvedValue([row({ yearCovered: true })]);

    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      month: {
        ratedDiscs: 0,
        ratedDiscIds: [],
        activeDays: 0,
        coverage: 'complete',
      },
      year: { ratedDiscs: 0, ratedDiscIds: [], coverage: 'complete' },
      currentStreak: 0,
    });
  });

  it('does not infer first discoveries or a streak that may reach before complete day coverage', async () => {
    query.mockResolvedValue([
      row({
        streakMayExtendBeforeCapture: true,
        streakDays: '4',
      }),
    ]);

    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      discoveries: {
        value: null,
        coverage: 'unknown',
        reason: 'incomplete_lifetime_ledger',
      },
      currentStreak: null,
    });
  });

  it('uses Madrid local calendar boundaries and propagates SQL failures', async () => {
    query.mockResolvedValue([row({ monthRatedDiscIds: ['disc-a'] })]);
    await service.getUserHistoricalStats('user-id');
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual(['user-id']);
    expect(sql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(sql).toContain("INTERVAL '1 month'");
    expect(sql).toContain("INTERVAL '1 year'");
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain('SELECT DISTINCT disc_id FROM month_sets');
    expect(sql).toContain('COUNT(DISTINCT disc_id)');
    expect(sql).toContain('SELECT DISTINCT activity_day');
    expect(sql).toContain('COUNT(DISTINCT rate."discId")');
    expect(sql).not.toMatch(/,\s*FROM context/);
    expect(sql).not.toContain("event.event_type IN ('set', 'change')");

    query.mockRejectedValue(new Error('database unavailable'));
    await expect(service.getUserHistoricalStats('user-id')).rejects.toThrow(
      'database unavailable',
    );
  });

  it('returns unknown when the singleton capture marker is unavailable', async () => {
    query.mockResolvedValue([
      row({ captureStartedAt: null, totalRatedDiscs: '8' }),
    ]);
    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      totalRatedDiscs: 8,
      month: {
        ratedDiscs: null,
        ratedDiscIds: null,
        activeDays: null,
        coverage: 'unknown',
      },
      year: { ratedDiscs: null, ratedDiscIds: null, coverage: 'unknown' },
      history: { ratedDiscs: null, ratedDiscIds: null, coverage: 'unknown' },
      currentStreak: null,
    });
  });
});
