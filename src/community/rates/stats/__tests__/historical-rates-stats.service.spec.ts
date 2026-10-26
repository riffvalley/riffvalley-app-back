import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { HistoricalRatesStatsService } from '../historical-rates-stats.service';

describe('HistoricalRatesStatsService', () => {
  let moduleRef: TestingModule;
  let query: jest.Mock<Promise<unknown>, [string, unknown[]]>;
  let service: HistoricalRatesStatsService;

  const row = (overrides: Record<string, unknown> = {}) => ({
    totalRatedDiscs: 0,
    totalRatedDiscIds: [],
    monthRatedDiscIds: [],
    yearRatedDiscIds: [],
    monthRatedDiscCount: 0,
    yearRatedDiscCount: 0,
    historyMissingDiscEvents: 0,
    monthActiveDays: 0,
    yearActiveDays: 0,
    totalActiveDays: 0,
    streakDays: 0,
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

  it('returns numeric zeroes for a user with no activity, without capture coverage gating', async () => {
    query.mockResolvedValue([row()]);

    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      totalRatedDiscs: 0,
      totalRatedDiscIds: [],
      totalActiveDays: 0,
      month: { ratedDiscs: 0, ratedDiscIds: [], activeDays: 0 },
      year: { ratedDiscs: 0, ratedDiscIds: [], activeDays: 0 },
      currentStreak: 0,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual(['user-id']);
    expect(sql).not.toContain('rate_vote_event_capture');
    expect(sql).not.toContain('started_at');
  });

  it('deduplicates repeated set events by disc and activity day', async () => {
    query.mockResolvedValue([
      row({
        monthRatedDiscIds: ['disc-a', 'disc-b'],
        yearRatedDiscIds: ['disc-a', 'disc-b', 'disc-c'],
        monthRatedDiscCount: 2,
        yearRatedDiscCount: 3,
        monthActiveDays: '2',
        yearActiveDays: '3',
        totalActiveDays: '4',
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
      },
      year: {
        ratedDiscs: 3,
        ratedDiscIds: ['disc-a', 'disc-b', 'disc-c'],
        activeDays: 3,
      },
      totalActiveDays: 4,
      currentStreak: 2,
    });

    const sql = query.mock.calls[0][0];
    expect(sql).toContain('SELECT DISTINCT disc_id FROM month_sets');
    expect(sql).toContain('SELECT DISTINCT disc_id FROM year_sets');
    expect(sql).toContain('SELECT DISTINCT activity_day FROM valid_sets');
    expect(sql).toContain('(SELECT COUNT(*) FROM month_disc_ids)::int');
  });

  it('counts only set events, uses Madrid month/year boundaries, and propagates SQL failures', async () => {
    query.mockResolvedValue([row()]);
    await service.getUserHistoricalStats('user-id');
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual(['user-id']);
    expect(sql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(sql).toContain("INTERVAL '1 month'");
    expect(sql).toContain("INTERVAL '1 year'");
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).not.toContain("event.event_type = 'change'");
    expect(sql).toContain('COUNT(DISTINCT rate."discId")');
    expect(sql).toContain('rate.rate IS NOT NULL');
    expect(sql).toContain(
      'COUNT(*) FROM activity_days)::int AS "totalActiveDays"',
    );
    expect(sql).toContain(
      'context.year_start AND activity_day <= context.today',
    );
    expect(sql).not.toMatch(/,\s*FROM context/);

    query.mockRejectedValue(new Error('database unavailable'));
    await expect(service.getUserHistoricalStats('user-id')).rejects.toThrow(
      'database unavailable',
    );
  });

  it('counts activity days for set events with missing disc ids without attributing a disc', async () => {
    query.mockResolvedValue([
      row({
        monthRatedDiscIds: ['disc-a'],
        yearRatedDiscIds: ['disc-a'],
        monthRatedDiscCount: 1,
        yearRatedDiscCount: 1,
        monthActiveDays: 2,
        yearActiveDays: 5,
        totalActiveDays: 7,
        historyMissingDiscEvents: 1,
      }),
    ]);

    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      month: { ratedDiscs: 1, ratedDiscIds: ['disc-a'], activeDays: 2 },
      year: { ratedDiscs: 1, ratedDiscIds: ['disc-a'], activeDays: 5 },
      totalActiveDays: 7,
      history: { coverage: 'partial_missing_disc_ids' },
    });

    const sql = query.mock.calls[0][0];
    expect(sql).toContain('WHERE disc_id IS NOT NULL');
    expect(sql).toContain('FROM activity_days');
    expect(sql).not.toContain('COALESCE(disc_id');
  });

  it('updates the returned aggregates when a subsequent read includes a new set event', async () => {
    query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([
      row({
        monthRatedDiscIds: ['disc-new'],
        yearRatedDiscIds: ['disc-new'],
        monthRatedDiscCount: 1,
        yearRatedDiscCount: 1,
        monthActiveDays: 1,
        yearActiveDays: 1,
        totalActiveDays: 1,
        streakDays: 1,
      }),
    ]);

    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({ month: { ratedDiscs: 0, activeDays: 0 } });
    await expect(
      service.getUserHistoricalStats('user-id'),
    ).resolves.toMatchObject({
      month: { ratedDiscs: 1, ratedDiscIds: ['disc-new'], activeDays: 1 },
      year: { ratedDiscs: 1, ratedDiscIds: ['disc-new'] },
    });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
