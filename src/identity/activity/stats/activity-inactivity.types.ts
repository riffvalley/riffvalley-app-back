import { ValidRoles } from '../../authorization/interfaces/valid-roles';
import {
  ActivityInactivitySortField,
  ActivityInactivitySortOrder,
} from './dto/activity-inactivity-query.dto';

export type ActivityInactivityBucket =
  | '0_2_days'
  | '3_6_days'
  | '7_13_days'
  | '14_29_days'
  | '30_59_days'
  | '60_plus_days';

export type ActivityInactivityGroup =
  | ActivityInactivityBucket
  | 'never_voted'
  | 'insufficient_history';

export type ActivityInactivityUser = {
  userId: string;
  username: string;
  role: ValidRoles;
  isActive: boolean;
  lastVoteAt: string | null;
  daysSinceLastVote: number | null;
  inactivityGroup: ActivityInactivityGroup;
  lastPresenceAt: string | null;
  lastRatingModifiedAt: string | null;
  currentRatings: number;
};

export type ActivityInactivityResponse = {
  asOf: string;
  timezone: 'Europe/Madrid';
  totalUsers: number;
  groups: Record<ActivityInactivityGroup, number>;
  coverage: {
    status: 'partial' | 'unavailable';
    captureStartedAt: string | null;
    captureDataSince: string | null;
    interpretation: string;
  };
  limit: number;
  offset: number;
  sortBy: ActivityInactivitySortField;
  sortOrder: ActivityInactivitySortOrder;
  data: ActivityInactivityUser[];
};
