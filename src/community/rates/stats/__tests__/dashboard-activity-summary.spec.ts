import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from '../../../../identity/users/users.service';
import { Rate } from '../../entities/rate.entity';
import { RatesStatsService } from '../rates-stats.service';

describe('RatesStatsService.getDashboardActivitySummary', () => {
  let moduleRef: TestingModule;
  let query: jest.Mock<Promise<unknown>, [string, unknown[]]>;
  let service: RatesStatsService;

  beforeEach(async () => {
    query = jest.fn<Promise<unknown>, [string, unknown[]]>();
    moduleRef = await Test.createTestingModule({
      providers: [
        RatesStatsService,
        { provide: getRepositoryToken(Rate), useValue: { query } },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(RatesStatsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('aggregates current distinct rated discs and uses Madrid set-event days for streak and active days', async () => {
    query.mockResolvedValue([
      { totalRatedDiscs: '486', currentStreak: '6', monthActiveDays: '12' },
    ]);

    await expect(
      service.getDashboardActivitySummary('session-user'),
    ).resolves.toEqual({
      totalRatedDiscs: 486,
      currentStreak: 6,
      monthActiveDays: 12,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual(['session-user']);
    expect(sql).toContain('COUNT(DISTINCT rate."discId")');
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(sql).toContain('SELECT DISTINCT');
    expect(sql).toContain('rate_vote_event_capture');
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY activity_day DESC)');
    expect(sql).not.toContain("event.event_type IN ('set', 'change')");
  });

  it('preserves unknown values when event capture does not cover the required period', async () => {
    query.mockResolvedValue([
      { totalRatedDiscs: 0, currentStreak: null, monthActiveDays: null },
    ]);

    await expect(
      service.getDashboardActivitySummary('new-user'),
    ).resolves.toEqual({
      totalRatedDiscs: 0,
      currentStreak: null,
      monthActiveDays: null,
    });
  });

  it('propagates database errors and rejects an unexpected empty aggregate result', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.getDashboardActivitySummary('user-id'),
    ).rejects.toThrow('database unavailable');

    query.mockResolvedValue([]);
    await expect(
      service.getDashboardActivitySummary('user-id'),
    ).rejects.toThrow('Dashboard activity summary query returned no row');
  });
});
