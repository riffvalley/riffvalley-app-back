export type RatesStatsActivityBasis = 'rate_created_at_estimate' | 'set_events';

export type RatesStatsActivityCoverage = 'unknown' | 'partial' | 'complete';

export interface RatesStatsDiscDto {
  id: string;
  name: string;
  image: string | null;
  /** Current personal score on the 0–10 Rate scale. */
  rate: number;
  artist: { name: string } | null;
  genre: { name: string; color: string | null } | null;
}

export interface RatesStatsControversialDiscDto {
  id: string;
  name: string;
  image: string | null;
  /** Current personal score on the 0–10 Rate scale. */
  userRate: number;
  /** Current community mean on the 0–10 Rate scale. */
  communityAverage: number;
  /** userRate minus communityAverage, in Rate points. */
  diff: number;
  artist: { name: string } | null;
  genre: { name: string; color: string | null } | null;
}

export interface RatesStatsRatedDiscDto {
  id: string;
  name: string;
  /** Current personal score on the 0–10 Rate scale. */
  rate: number;
  artist: { name: string } | null;
  genre: { name: string; color: string | null } | null;
}

export interface RatesStatsDailyDiscDto {
  discId: string;
  title: string;
  artist: string | null;
  /** Current personal score; null when no valid current score exists (possible from 2027). */
  rate: number | null;
  /** Local civil date on which the disc had eligible activity. */
  date: string;
}

export interface RatesStatsMonthlyActivityDto {
  /** Local calendar month, YYYY-MM. */
  month: string;
  /** 2025–26: distinct currently scored discs; 2027 onward: eligible set events. */
  activityCount: number;
  /** Highest current personal score among eligible discs with a current score. */
  topDisc: RatesStatsDiscDto | null;
}

export interface RatesStatsGenreActivityDto {
  genre: string;
  /** 2025–26: currently scored discs; 2027 onward: eligible set events. */
  activityCount: number;
  topDisc: RatesStatsDiscDto | null;
}

export interface RatesStatsDailyActivityDto {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** 2025–26: currently scored discs; 2027 onward: distinct discs with eligible set activity. */
  activityCount: number;
  discs: RatesStatsDailyDiscDto[];
}

export interface RatesStatsScoreDistributionDto {
  /** Integer buckets n represent [n, n+1); bucket 10 represents exactly 10. */
  score: number;
  /** Number of eligible discs with a current score in this bucket. */
  scoredDiscCount: number;
}

export interface RatesUserStatsResponseDto {
  year: number;
  timeZone: string;
  /** Source used to identify discs with eligible annual activity. */
  activityBasis: RatesStatsActivityBasis;
  /** Coverage of activity records for this period. */
  activityCoverage: RatesStatsActivityCoverage;
  /** 2025–26: current scored discs; 2027 onward: distinct eligible annual discs. */
  activityCount: number;
  /** Eligible discs with a current valid personal score. */
  scoredDiscs: number;
  /** Current personal score mean, in Rate points; null when no scores exist. */
  mean: number | null;
  /** Current personal score median, in Rate points; null when no scores exist. */
  median: number | null;
  /** Population standard deviation of current valid personal scores, in Rate points. */
  standardDeviation: number | null;
  activityByGenre: RatesStatsGenreActivityDto[];
  activityByMonth: RatesStatsMonthlyActivityDto[];
  scoreDistribution: RatesStatsScoreDistributionDto[];
  topDiscOverall: RatesStatsDiscDto | null;
  mostControversial: RatesStatsControversialDiscDto[];
  activityByDay: RatesStatsDailyActivityDto[];
  /** 2025–26: scored discs without a current genre; 2027 onward: set events without one. */
  activityWithoutGenre: number;
}
