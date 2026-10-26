import { Injectable } from '@nestjs/common';
import { DiscCatalogService } from '../../../catalog/discs/catalog/disc-catalog.service';
import { User } from '../../../identity/auth/entities/user.entity';
import { RatesStatsService } from '../../../community/rates/stats/rates-stats.service';
import { DashboardSummaryResponse } from './dto/dashboard-summary-response';

@Injectable()
export class DashboardSummaryService {
  constructor(
    private readonly ratesStatsService: RatesStatsService,
    private readonly discCatalogService: DiscCatalogService,
  ) {}

  async getSummary(user: User): Promise<DashboardSummaryResponse> {
    const [personal, totalDiscs] = await Promise.all([
      this.ratesStatsService.getDashboardActivitySummary(user.id),
      this.discCatalogService.countCatalogDiscs(),
    ]);

    return {
      personal: {
        totalRatedDiscs: personal.totalRatedDiscs,
        currentStreak: personal.currentStreak,
        year: { ratedDiscs: null, exploredGenres: null },
        month: {
          ratedDiscs: null,
          exploredGenres: null,
          activeDays: personal.monthActiveDays,
        },
      },
      catalog: { totalDiscs },
    };
  }
}
