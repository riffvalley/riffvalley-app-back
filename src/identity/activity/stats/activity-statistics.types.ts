export interface ActivityDailyCount {
  date: string;
  count: number;
}

export interface ActivityUserStatistics {
  userId: string;
  username: string;
  lastActiveDate: string | null;
  activeDays7: number | null;
  activeDays30: number | null;
  currentVotes: number;
  voteActions7: number | null;
  voteActions30: number | null;
  voteActionsRecorded: number;
  lastVoteAt: string | null;
  votesByDay: ActivityDailyCount[];
}

export interface ActivityUsersResponse {
  totalItems: number;
  limit: number;
  offset: number;
  from: string;
  to: string;
  timezone: 'Europe/Madrid';
  activityDataSince: string | null;
  voteDataSince: string | null;
  data: ActivityUserStatistics[];
}

export interface ActivitySummaryPeriod {
  activeUsers7: number | null;
  activeUsers30: number | null;
  voteActions7: number | null;
  voteActions30: number | null;
  votingUsers7: number | null;
  votingUsers30: number | null;
}

export interface ActivitySummaryDay {
  date: string;
  activeUsers: number | null;
  voteActions: number | null;
  votingUsers: number | null;
}

export interface ActivitySummaryResponse {
  from: string;
  to: string;
  timezone: 'Europe/Madrid';
  activityDataSince: string | null;
  voteDataSince: string | null;
  periods: ActivitySummaryPeriod;
  series: ActivitySummaryDay[];
  dashboard: ActivityDashboardResponse;
}

export type ActivityCoverageStatus = 'complete' | 'incomplete' | 'unavailable';

export type ActivityCoverage = {
  status: ActivityCoverageStatus;
  dataSince: string | null;
};

export type ActivityDashboardRanges = {
  current: { from: string; to: string };
  previous: { from: string; to: string };
  baseline: { from: string; to: string };
};

export type ActivityMetricComparison = {
  current: number | null;
  previous: number | null;
  delta: number | null;
  changePercent: number | null;
  coverage: {
    current: ActivityCoverage;
    previous: ActivityCoverage;
    baseline?: ActivityCoverage;
  };
  reason?: 'zero_denominator' | 'unavailable';
};

/** Current Rate row count; historical snapshots do not exist. */
export type ActivityCurrentRatings = {
  current: number | null;
  previous: null;
  delta: null;
  changePercent: null;
  coverage: {
    current: ActivityCoverage;
    previous: ActivityCoverage;
  };
  reason?: 'unavailable';
};

export type ActivityDashboardDay = {
  date: string;
  dayIndex: number;
  activeUsers: number | null;
  newVotes: number | null;
};

/** Raw, coverage-aware aggregates used by I1-E03c to build comparisons. */
export type ActivityDashboardBaseAggregates = {
  from: string;
  to: string;
  activityDataSince: string | null;
  voteDataSince: string | null;
  activeUsers: number | null;
  newVotes: number | null;
  votingUsers: number | null;
  currentRatings: number | null;
  series: ActivityDashboardDay[];
};

/** Contract for the additive `dashboard` block planned for GET /activity/summary. */
export type ActivityDashboardResponse = {
  periods: ActivityDashboardRanges;
  timezone: 'Europe/Madrid';
  asOf: string;
  activityDataSince: string | null;
  voteDataSince: string | null;
  activeUsers: ActivityMetricComparison;
  /** Counts only `rate_vote_events` with `event_type = 'set'`; never `change`. */
  newVotes: ActivityMetricComparison;
  /** Distinct users with at least one `set` event in the period. */
  votingUsers: ActivityMetricComparison;
  participationRate: ActivityMetricComparison;
  votesPerActiveUser: ActivityMetricComparison;
  returningUsers: ActivityMetricComparison;
  retentionRate: ActivityMetricComparison;
  currentRatings: ActivityCurrentRatings;
  series: {
    current: ActivityDashboardDay[];
    previous: ActivityDashboardDay[];
  };
};

export interface ActivityUserDetailResponse {
  userId: string;
  lastActiveDate: string | null;
  activeDays7: number | null;
  activeDays30: number | null;
  activeDates: string[];
  activityDataSince: string | null;
  currentVotes: number;
  voteActions7: number | null;
  voteActions30: number | null;
  voteActionsRecorded: number;
  lastVoteAt: string | null;
  voteDataSince: string | null;
  votesByDay: ActivityDailyCount[];
}
