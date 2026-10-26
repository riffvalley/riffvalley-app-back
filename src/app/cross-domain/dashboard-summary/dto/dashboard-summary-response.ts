export interface DashboardSummaryResponse {
  personal: {
    totalRatedDiscs: number;
    currentStreak: number | null;
    year: {
      ratedDiscs: number | null;
      exploredGenres: number | null;
    };
    month: {
      ratedDiscs: number | null;
      exploredGenres: number | null;
      activeDays: number | null;
    };
  };
  catalog: {
    totalDiscs: number;
  };
}
