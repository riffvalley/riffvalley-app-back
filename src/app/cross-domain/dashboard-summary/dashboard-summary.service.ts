import { Injectable } from '@nestjs/common';
import { DiscCatalogService } from '../../../catalog/discs/catalog/disc-catalog.service';
import { User } from '../../../identity/auth/entities/user.entity';
import { HistoricalRatesStatsService } from '../../../community/rates/stats/historical-rates-stats.service';
import { DashboardSummaryResponse } from './dto/dashboard-summary-response';

@Injectable()
export class DashboardSummaryService {
  constructor(
    private readonly historicalRatesStatsService: HistoricalRatesStatsService,
    private readonly discCatalogService: DiscCatalogService,
  ) {}

  async getSummary(user: User): Promise<DashboardSummaryResponse> {
    const [personal, totalDiscs] = await Promise.all([
      this.historicalRatesStatsService.getUserHistoricalStats(user.id),
      this.discCatalogService.countCatalogDiscs(),
    ]);

    const monthDiscIds = personal.month.ratedDiscIds;
    const yearDiscIds = personal.year.ratedDiscIds;
    const genreCounts =
      monthDiscIds.length > 0 || yearDiscIds.length > 0
        ? await this.discCatalogService.countCurrentGenresForDiscSets(
            monthDiscIds,
            yearDiscIds,
          )
        : { month: 0, year: 0 };

    return {
      personal: {
        totalRatedDiscs: personal.totalRatedDiscs,
        currentStreak: personal.currentStreak,
        year: {
          ratedDiscs: personal.year.ratedDiscs,
          exploredGenres: genreCounts.year,
        },
        month: {
          ratedDiscs: personal.month.ratedDiscs,
          exploredGenres: genreCounts.month,
          activeDays: personal.month.activeDays,
        },
      },
      catalog: { totalDiscs },
    };
  }
}
