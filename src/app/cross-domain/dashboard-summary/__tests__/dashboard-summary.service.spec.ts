import { Test, TestingModule } from '@nestjs/testing';
import { DiscCatalogService } from '../../../../catalog/discs/catalog/disc-catalog.service';
import { User } from '../../../../identity/auth/entities/user.entity';
import {
  HistoricalRatesStats,
  HistoricalRatesStatsService,
} from '../../../../community/rates/stats/historical-rates-stats.service';
import { DashboardSummaryService } from '../dashboard-summary.service';

describe('DashboardSummaryService', () => {
  let moduleRef: TestingModule;
  let service: DashboardSummaryService;
  let ratesStatsService: jest.Mocked<
    Pick<HistoricalRatesStatsService, 'getUserHistoricalStats'>
  >;
  let discCatalogService: jest.Mocked<
    Pick<
      DiscCatalogService,
      'countCatalogDiscs' | 'countCurrentGenresForDiscSets'
    >
  >;

  const stats = (
    overrides: Partial<HistoricalRatesStats> = {},
  ): HistoricalRatesStats => ({
    timezone: 'Europe/Madrid',
    totalRatedDiscs: 0,
    currentStreak: 0,
    month: {
      ratedDiscs: 0,
      ratedDiscIds: [],
      activeDays: 0,
      coverage: 'complete',
    },
    year: { ratedDiscs: 0, ratedDiscIds: [], coverage: 'complete' },
    history: {
      ratedDiscs: null,
      ratedDiscIds: null,
      coverage: 'before_capture',
    },
    discoveries: {
      value: null,
      coverage: 'unknown',
      reason: 'incomplete_lifetime_ledger',
    },
    ...overrides,
  });

  beforeEach(async () => {
    ratesStatsService = {
      getUserHistoricalStats: jest.fn().mockResolvedValue(stats()),
    };
    discCatalogService = {
      countCatalogDiscs: jest.fn().mockResolvedValue(7201),
      countCurrentGenresForDiscSets: jest
        .fn()
        .mockResolvedValue({ month: 0, year: 0 }),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        DashboardSummaryService,
        {
          provide: HistoricalRatesStatsService,
          useValue: ratesStatsService,
        },
        { provide: DiscCatalogService, useValue: discCatalogService },
      ],
    }).compile();
    service = moduleRef.get(DashboardSummaryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('returns covered zeroes for a user without votes and preserves the exact HTTP shape', async () => {
    await expect(
      service.getSummary(Object.assign(new User(), { id: 'session-user' })),
    ).resolves.toEqual({
      personal: {
        totalRatedDiscs: 0,
        currentStreak: 0,
        year: { ratedDiscs: 0, exploredGenres: 0 },
        month: { ratedDiscs: 0, exploredGenres: 0, activeDays: 0 },
      },
      catalog: { totalDiscs: 7201 },
    });
    expect(ratesStatsService.getUserHistoricalStats).toHaveBeenCalledWith(
      'session-user',
    );
    expect(ratesStatsService.getUserHistoricalStats).toHaveBeenCalledTimes(1);
    expect(discCatalogService.countCatalogDiscs).toHaveBeenCalledTimes(1);
    expect(
      discCatalogService.countCurrentGenresForDiscSets,
    ).not.toHaveBeenCalled();
  });

  it('composes monthly and annual rates with one Catalog genre aggregate', async () => {
    ratesStatsService.getUserHistoricalStats.mockResolvedValue(
      stats({
        totalRatedDiscs: 486,
        currentStreak: 6,
        year: {
          ratedDiscs: 94,
          ratedDiscIds: ['disc-a', 'disc-b', 'disc-c'],
          coverage: 'complete',
        },
        month: {
          ratedDiscs: 12,
          ratedDiscIds: ['disc-a', 'disc-b'],
          activeDays: 8,
          coverage: 'complete',
        },
      }),
    );
    discCatalogService.countCurrentGenresForDiscSets.mockResolvedValue({
      month: 7,
      year: 13,
    });

    await expect(
      service.getSummary(Object.assign(new User(), { id: 'session-user' })),
    ).resolves.toEqual({
      personal: {
        totalRatedDiscs: 486,
        currentStreak: 6,
        year: { ratedDiscs: 94, exploredGenres: 13 },
        month: { ratedDiscs: 12, exploredGenres: 7, activeDays: 8 },
      },
      catalog: { totalDiscs: 7201 },
    });
    expect(
      discCatalogService.countCurrentGenresForDiscSets,
    ).toHaveBeenCalledTimes(1);
    expect(
      discCatalogService.countCurrentGenresForDiscSets,
    ).toHaveBeenCalledWith(
      ['disc-a', 'disc-b'],
      ['disc-a', 'disc-b', 'disc-c'],
    );
  });

  it('preserves unknown disc metrics while retaining separately covered days and streak', async () => {
    ratesStatsService.getUserHistoricalStats.mockResolvedValue(
      stats({
        totalRatedDiscs: 2,
        currentStreak: 3,
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
      }),
    );

    await expect(
      service.getSummary(Object.assign(new User(), { id: 'session-user' })),
    ).resolves.toEqual({
      personal: {
        totalRatedDiscs: 2,
        currentStreak: 3,
        year: { ratedDiscs: null, exploredGenres: null },
        month: {
          ratedDiscs: null,
          exploredGenres: null,
          activeDays: 12,
        },
      },
      catalog: { totalDiscs: 7201 },
    });
    expect(
      discCatalogService.countCurrentGenresForDiscSets,
    ).not.toHaveBeenCalled();
  });

  it('propagates Rates and Catalog failures rather than returning zeroes', async () => {
    ratesStatsService.getUserHistoricalStats.mockRejectedValue(
      new Error('rates read failed'),
    );
    await expect(
      service.getSummary(Object.assign(new User(), { id: 'user-id' })),
    ).rejects.toThrow('rates read failed');

    ratesStatsService.getUserHistoricalStats.mockResolvedValue(stats());
    discCatalogService.countCatalogDiscs.mockRejectedValue(
      new Error('catalog read failed'),
    );
    await expect(
      service.getSummary(Object.assign(new User(), { id: 'user-id' })),
    ).rejects.toThrow('catalog read failed');

    discCatalogService.countCatalogDiscs.mockResolvedValue(7201);
    ratesStatsService.getUserHistoricalStats.mockResolvedValue(
      stats({
        month: {
          ratedDiscs: 1,
          ratedDiscIds: ['disc-a'],
          activeDays: 1,
          coverage: 'complete',
        },
      }),
    );
    discCatalogService.countCurrentGenresForDiscSets.mockRejectedValue(
      new Error('genre aggregate failed'),
    );
    await expect(
      service.getSummary(Object.assign(new User(), { id: 'user-id' })),
    ).rejects.toThrow('genre aggregate failed');
  });
});
