import { Test, TestingModule } from '@nestjs/testing';
import { DiscCatalogService } from '../../../../catalog/discs/catalog/disc-catalog.service';
import { User } from '../../../../identity/auth/entities/user.entity';
import { RatesStatsService } from '../../../../community/rates/stats/rates-stats.service';
import { DashboardSummaryService } from '../dashboard-summary.service';

describe('DashboardSummaryService', () => {
  let moduleRef: TestingModule;
  let service: DashboardSummaryService;
  let ratesStatsService: jest.Mocked<
    Pick<RatesStatsService, 'getDashboardActivitySummary'>
  >;
  let discCatalogService: jest.Mocked<
    Pick<DiscCatalogService, 'countCatalogDiscs'>
  >;

  beforeEach(async () => {
    ratesStatsService = {
      getDashboardActivitySummary: jest.fn().mockResolvedValue({
        totalRatedDiscs: 0,
        currentStreak: 0,
        monthActiveDays: 0,
      }),
    };
    discCatalogService = {
      countCatalogDiscs: jest.fn().mockResolvedValue(7201),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        DashboardSummaryService,
        { provide: RatesStatsService, useValue: ratesStatsService },
        { provide: DiscCatalogService, useValue: discCatalogService },
      ],
    }).compile();
    service = moduleRef.get(DashboardSummaryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('composes exact personal and catalog counts and marks unreconstructable periods unknown', async () => {
    ratesStatsService.getDashboardActivitySummary.mockResolvedValue({
      totalRatedDiscs: 486,
      currentStreak: 6,
      monthActiveDays: null,
    });

    await expect(
      service.getSummary(Object.assign(new User(), { id: 'session-user' })),
    ).resolves.toEqual({
      personal: {
        totalRatedDiscs: 486,
        currentStreak: 6,
        year: { ratedDiscs: null, exploredGenres: null },
        month: {
          ratedDiscs: null,
          exploredGenres: null,
          activeDays: null,
        },
      },
      catalog: { totalDiscs: 7201 },
    });
    expect(ratesStatsService.getDashboardActivitySummary).toHaveBeenCalledWith(
      'session-user',
    );
  });

  it('propagates either required read failure rather than returning zeros', async () => {
    ratesStatsService.getDashboardActivitySummary.mockRejectedValue(
      new Error('personal read failed'),
    );
    await expect(
      service.getSummary(Object.assign(new User(), { id: 'user-id' })),
    ).rejects.toThrow('personal read failed');

    ratesStatsService.getDashboardActivitySummary.mockResolvedValue({
      totalRatedDiscs: 0,
      currentStreak: 0,
      monthActiveDays: 0,
    });
    discCatalogService.countCatalogDiscs.mockRejectedValue(
      new Error('catalog read failed'),
    );
    await expect(
      service.getSummary(Object.assign(new User(), { id: 'user-id' })),
    ).rejects.toThrow('catalog read failed');
  });
});
