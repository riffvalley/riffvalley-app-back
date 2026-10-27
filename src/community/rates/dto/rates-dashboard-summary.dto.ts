export interface RatesDashboardPeriodDto {
  start: string;
  endExclusive: string;
  timezone: 'Europe/Madrid';
}

export interface RatesDashboardGenreDto {
  id: string;
  name: string;
  activeRates: number;
}

export interface RatesDashboardDiscDto {
  rateId: string;
  discId: string;
  discName: string;
  artist: { id: string; name: string } | null;
  coverImage: string | null;
  rate: number;
}

export interface RatesDashboardRecentRateDto {
  id: string;
  discId: string;
  discName: string;
  artist: { id: string; name: string } | null;
  coverImage: string | null;
  rate: number | null;
  cover: number | null;
  lastActivityAt: string;
}

export interface RatesDashboardSummaryDto {
  period: RatesDashboardPeriodDto;
  metrics: {
    activeRates: number;
    averageMusicalRate: number | null;
    distinctGenres: number;
    bestRatedDisc: RatesDashboardDiscDto | null;
    dominantGenre: RatesDashboardGenreDto | null;
    weekOverWeek: {
      currentRates: number;
      previousRates: number;
      difference: number;
      percentageChange: number | null;
    };
  };
  recentRates: RatesDashboardRecentRateDto[];
}
