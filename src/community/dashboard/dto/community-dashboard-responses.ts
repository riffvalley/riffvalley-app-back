import type {
  CommunityDashboardRankingsResponse,
  CommunityDashboardRatesStatsResponse,
} from '../../rates/stats/community-dashboard-rates.types';

export type { CommunityDashboardRankingsResponse };

export interface CommunityDashboardStatsResponse
  extends Omit<CommunityDashboardRatesStatsResponse, 'summary'> {
  summary: CommunityDashboardRatesStatsResponse['summary'] & {
    releasedDiscs: number;
  };
}
