import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../../../../identity/auth/entities/user.entity';
import { DashboardSummaryService } from '../dashboard-summary.service';
import { DashboardSummaryResponse } from '../dto/dashboard-summary-response';
import { HistoricalRatesStatsService } from '../../../../community/rates/stats/historical-rates-stats.service';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { DashboardSummaryController } from '../dashboard-summary.controller';
import { CrossDomainModule } from '../../cross-domain.module';
import { RatesModule } from '../../../../community/rates/rates.module';
import { DiscModule } from '../../../../catalog/discs/discs.module';
import { DiscCatalogService } from '../../../../catalog/discs/catalog/disc-catalog.service';
import { UserRoleGuard } from '../../../../identity/authorization/guards/user-role/user-role.guard';
import { META_MINIMUM_ROLE } from '../../../../identity/authorization/decorators/role-protected.decorator';

describe('DashboardSummaryController and module boundaries', () => {
  let moduleRef: TestingModule;
  let dashboardSummaryService: {
    getSummary: jest.Mock<Promise<DashboardSummaryResponse>, [User]>;
  };

  beforeEach(async () => {
    dashboardSummaryService = {
      getSummary: jest.fn<Promise<DashboardSummaryResponse>, [User]>(),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: DashboardSummaryService,
          useValue: dashboardSummaryService,
        },
      ],
    }).compile();
  });

  afterEach(async () => moduleRef.close());

  it('exposes authenticated GET /app/dashboard-summary without accepting a user id', () => {
    const handler = DashboardSummaryController.prototype.getSummary;
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      DashboardSummaryController,
    );

    expect(Reflect.getMetadata(PATH_METADATA, DashboardSummaryController)).toBe(
      'app',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'dashboard-summary',
    );
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, DashboardSummaryController),
    ).toBeUndefined();
    expect(guards).toContain(UserRoleGuard);
    expect(DashboardSummaryController.prototype.getSummary.length).toBe(1);

    const routeArguments: Record<string, { index: number }> =
      Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        DashboardSummaryController,
        'getSummary',
      ) as Record<string, { index: number }>;
    expect(Object.values(routeArguments)).toEqual(
      expect.arrayContaining([expect.objectContaining({ index: 0 })]),
    );
  });

  it('passes the authenticated session user to the summary service', async () => {
    const response: DashboardSummaryResponse = {
      personal: {
        totalRatedDiscs: 0,
        currentStreak: 0,
        year: { ratedDiscs: 0, exploredGenres: 0 },
        month: { ratedDiscs: 0, exploredGenres: 0, activeDays: 0 },
      },
      catalog: { totalDiscs: 7201 },
    };
    dashboardSummaryService.getSummary.mockResolvedValue(response);
    const controller = new DashboardSummaryController(
      moduleRef.get(DashboardSummaryService),
    );
    const sessionUser = Object.assign(new User(), {
      id: 'validated-session-id',
    });

    await expect(controller.getSummary(sessionUser)).resolves.toBe(response);
    expect(dashboardSummaryService.getSummary).toHaveBeenCalledWith(
      sessionUser,
    );
  });

  it('composes exported Catalog and Rates services through their domain modules', () => {
    const summaryImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CrossDomainModule,
    ) as unknown[];

    expect(summaryImports).toContain(RatesModule);
    expect(summaryImports).toContain(DiscModule);

    const ratesExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      RatesModule,
    ) as unknown[];
    const catalogExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      DiscModule,
    ) as unknown[];
    expect(ratesExports).toContain(HistoricalRatesStatsService);
    expect(catalogExports).toContain(DiscCatalogService);
  });
});
