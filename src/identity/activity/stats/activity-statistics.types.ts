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
}

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
