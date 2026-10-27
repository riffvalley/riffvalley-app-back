export interface CommunityDashboardRankingsResponse {
  year: number;
  topUsersByRates: {
    user: { id: string; username: string };
    rateCount: number;
  }[];
  topUsersByCover: {
    user: { id: string; username: string };
    totalCover: number;
  }[];
}

export interface CommunityDashboardRatesStatsResponse {
  year: number;
  summary: {
    ratedDiscs: number;
    participatingUsers: number;
    averageRating: number | null;
  };
  ratingDistribution: {
    label: string;
    min: number;
    max: number;
    minInclusive: boolean;
    maxInclusive: boolean;
    count: number;
  }[];
  currentStreaks: { user: { id: string; username: string }; days: number }[];
  topGenres: { id: string; name: string; ratedDiscs: number }[];
}
