import { Inject, Injectable } from '@nestjs/common';
import { DiscCatalogService } from '../../catalog/discs/catalog/disc-catalog.service';
import { CommunityDashboardRatesService } from '../rates/stats/community-dashboard-rates.service';
import {
  CommunityDashboardRankingsResponse,
  CommunityDashboardStatsResponse,
} from './dto/community-dashboard-responses';

@Injectable()
export class CommunityDashboardService {
  constructor(
    @Inject(CommunityDashboardRatesService)
    private readonly ratesDashboard: Pick<
      CommunityDashboardRatesService,
      'getRankings' | 'getStats'
    >,
    @Inject(DiscCatalogService)
    private readonly discCatalog: Pick<
      DiscCatalogService,
      'countDiscsReleasedInYear'
    >,
  ) {}

  getRankings(year: number): Promise<CommunityDashboardRankingsResponse> {
    return this.ratesDashboard.getRankings(year);
  }

  async getStats(year: number): Promise<CommunityDashboardStatsResponse> {
    const [stats, releasedDiscs] = await Promise.all([
      this.ratesDashboard.getStats(year),
      this.discCatalog.countDiscsReleasedInYear(year),
    ]);
    return { ...stats, summary: { ...stats.summary, releasedDiscs } };
  }
}
