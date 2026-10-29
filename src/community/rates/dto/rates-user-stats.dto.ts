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

export interface RatesStatsMonthlyActivityDto {
  /** Local calendar month, YYYY-MM. */
  month: string;
  /** Eligible activity assignments/events in this month. */
  activityCount: number;
  /** Highest current personal score among eligible discs with a current score. */
  topDisc: RatesStatsDiscDto | null;
}

export interface RatesStatsGenreActivityDto {
  genre: string;
  /** Eligible activity assignments attributed to this current genre. */
  activityCount: number;
  topDisc: RatesStatsDiscDto | null;
}

export interface RatesStatsDailyActivityDto {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Eligible activity assignments/events on this date. */
  activityCount: number;
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
  /** Source used to count eligible activity assignments/events. */
  activityBasis: RatesStatsActivityBasis;
  /** Coverage of activity records for this period. */
  activityCoverage: RatesStatsActivityCoverage;
  /** Rate rows (2025–26 estimate) or set events (2027 onward); not unique discs. */
  activityCount: number;
  /** Eligible discs with a current valid personal score. */
  scoredDiscs: number;
  /** Current personal score mean, in Rate points; null when no scores exist. */
  mean: number | null;
  /** Current personal score median, in Rate points; null when no scores exist. */
  median: number | null;
  activityByGenre: RatesStatsGenreActivityDto[];
  activityByMonth: RatesStatsMonthlyActivityDto[];
  scoreDistribution: RatesStatsScoreDistributionDto[];
  topDiscOverall: RatesStatsDiscDto | null;
  mostControversial: RatesStatsControversialDiscDto[];
  activityByDay: RatesStatsDailyActivityDto[];
  /** Eligible activity assignments on discs with no current genre. */
  activityWithoutGenre: number;
}
