export interface DashboardSummaryResponse {
  personal: {
    totalRatedDiscs: number;
    totalExploredGenres: number;
    totalActiveDays: number;
    currentStreak: number | null;
    year: {
      ratedDiscs: number | null;
      exploredGenres: number | null;
      activeDays: number;
    };
    month: {
      ratedDiscs: number | null;
      exploredGenres: number | null;
      activeDays: number | null;
    };
  };
  catalog: {
    totalDiscs: number;
    discsThisYear: number;
    discsThisMonth: number;
  };
}
