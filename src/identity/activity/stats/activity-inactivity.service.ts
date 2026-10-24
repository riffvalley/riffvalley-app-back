import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import {
  ActivityInactivityQueryDto,
  ActivityInactivitySortField,
} from './dto/activity-inactivity-query.dto';
import {
  ActivityInactivityGroup,
  ActivityInactivityResponse,
  ActivityInactivityUser,
} from './activity-inactivity.types';

type InactivityRow = {
  asOf: string;
  totalUsers: number;
  groups: Record<ActivityInactivityGroup, number>;
  captureStartedAt: string | null;
  captureDataSince: string | null;
  data: ActivityInactivityUser[] | null;
};

const GROUPS: ActivityInactivityGroup[] = [
  '0_2_days',
  '3_6_days',
  '7_13_days',
  '14_29_days',
  '30_59_days',
  '60_plus_days',
  'never_voted',
  'insufficient_history',
];

const SORT_SQL: Record<ActivityInactivitySortField, string> = {
  lastVoteAt: 'classified.last_vote_at',
  daysSinceLastVote: 'classified.days_since_last_vote',
  username: 'classified.username',
  lastPresenceAt: 'classified.last_presence_at',
  lastRatingModifiedAt: 'classified.last_rating_modified_at',
  currentRatings: 'classified.current_ratings',
};

@Injectable()
export class ActivityInactivityService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getInactivity(
    query: ActivityInactivityQueryDto,
  ): Promise<ActivityInactivityResponse> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'daysSinceLastVote';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderColumn = SORT_SQL[sortBy];
    const orderDirection = sortOrder.toUpperCase();
    const groupsJson = GROUPS.map(
      (group) =>
        `'${group}', COUNT(*) FILTER (WHERE inactivity_group = '${group}')::int`,
    ).join(',\n          ');

    const rows = (await this.userRepository.query(
      `
      WITH params AS (
        SELECT
          COALESCE($1::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date) AS as_of,
          $2::text AS role_filter,
          $3::boolean AS active_filter,
          $4::int AS page_limit,
          $5::int AS page_offset
      ), capture AS (
        SELECT started_at FROM rate_vote_event_capture WHERE id = 1
      ), vote_evidence AS (
        SELECT event.user_id,
          MAX(event.occurred_at) FILTER (
            WHERE event.event_type = 'set'
              AND event.occurred_at < ((params.as_of + 1)::timestamp AT TIME ZONE 'Europe/Madrid')
          ) AS last_vote_at,
          BOOL_OR(event.event_type IN ('set', 'change')) AS has_vote_event
        FROM rate_vote_events event
        CROSS JOIN params
        GROUP BY event.user_id, params.as_of
      ), current_ratings AS (
        SELECT rate."userId" AS user_id,
          COUNT(*) FILTER (WHERE rate.rate IS NOT NULL)::int AS current_ratings,
          MAX(rate."editedAt") FILTER (WHERE rate.rate IS NOT NULL) AS last_rating_modified_at
        FROM rate
        GROUP BY rate."userId"
      ), presence_by_user AS (
        SELECT activity.user_id, MAX(activity.activity_date)::text AS last_presence_at
        FROM user_app_daily_activity activity
        GROUP BY activity.user_id
      ), classified AS (
        SELECT
          app_user.id::text AS user_id,
          app_user.username,
          app_user.role,
          app_user."isActive" AS is_active,
          vote_evidence.last_vote_at,
          CASE WHEN vote_evidence.last_vote_at IS NULL THEN NULL
            ELSE params.as_of - (vote_evidence.last_vote_at AT TIME ZONE 'Europe/Madrid')::date
          END AS days_since_last_vote,
          CASE
            WHEN vote_evidence.last_vote_at IS NOT NULL AND params.as_of - (vote_evidence.last_vote_at AT TIME ZONE 'Europe/Madrid')::date <= 2 THEN '0_2_days'
            WHEN vote_evidence.last_vote_at IS NOT NULL AND params.as_of - (vote_evidence.last_vote_at AT TIME ZONE 'Europe/Madrid')::date <= 6 THEN '3_6_days'
            WHEN vote_evidence.last_vote_at IS NOT NULL AND params.as_of - (vote_evidence.last_vote_at AT TIME ZONE 'Europe/Madrid')::date <= 13 THEN '7_13_days'
            WHEN vote_evidence.last_vote_at IS NOT NULL AND params.as_of - (vote_evidence.last_vote_at AT TIME ZONE 'Europe/Madrid')::date <= 29 THEN '14_29_days'
            WHEN vote_evidence.last_vote_at IS NOT NULL AND params.as_of - (vote_evidence.last_vote_at AT TIME ZONE 'Europe/Madrid')::date <= 59 THEN '30_59_days'
            WHEN vote_evidence.last_vote_at IS NOT NULL THEN '60_plus_days'
            WHEN vote_evidence.has_vote_event THEN 'insufficient_history'
            WHEN capture.started_at IS NOT NULL
              AND app_user."createdAt" >= (capture.started_at AT TIME ZONE current_setting('TimeZone'))
              AND app_user."createdAt" < ((params.as_of + 1)::timestamp AT TIME ZONE 'Europe/Madrid' AT TIME ZONE current_setting('TimeZone'))
              THEN 'never_voted'
            ELSE 'insufficient_history'
          END AS inactivity_group,
          presence.last_presence_at,
          ratings.last_rating_modified_at,
          COALESCE(ratings.current_ratings, 0)::int AS current_ratings
        FROM users app_user
        CROSS JOIN params
        LEFT JOIN capture ON true
        LEFT JOIN vote_evidence ON vote_evidence.user_id = app_user.id
        LEFT JOIN current_ratings ratings ON ratings.user_id = app_user.id
        LEFT JOIN presence_by_user presence ON presence.user_id = app_user.id
        WHERE (params.role_filter IS NULL OR app_user.role = params.role_filter)
          AND (params.active_filter IS NULL OR app_user."isActive" = params.active_filter)
      ), summary AS (
        SELECT COUNT(*)::int AS total_users,
          jsonb_build_object(${groupsJson}) AS groups
        FROM classified
      ), page AS (
        SELECT classified.*
        FROM classified
        ORDER BY ${orderColumn} ${orderDirection} NULLS LAST,
          classified.username ASC,
          classified.user_id ASC
        LIMIT (SELECT page_limit FROM params)
        OFFSET (SELECT page_offset FROM params)
      )
      SELECT
        (SELECT as_of::text FROM params) AS "asOf",
        summary.total_users AS "totalUsers",
        summary.groups AS groups,
        (SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM capture) AS "captureStartedAt",
        (SELECT (started_at AT TIME ZONE 'Europe/Madrid')::date::text FROM capture) AS "captureDataSince",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'userId', page.user_id,
          'username', page.username,
          'role', page.role,
          'isActive', page.is_active,
          'lastVoteAt', to_char(page.last_vote_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'daysSinceLastVote', page.days_since_last_vote,
          'inactivityGroup', page.inactivity_group,
          'lastPresenceAt', page.last_presence_at,
          'lastRatingModifiedAt', to_char(page.last_rating_modified_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
          'currentRatings', page.current_ratings
        ) ORDER BY ${orderColumn} ${orderDirection} NULLS LAST, page.username ASC, page.user_id ASC) FROM page), '[]'::jsonb) AS data
      FROM summary
      `,
      [
        query.asOf ?? null,
        query.role ?? null,
        query.isActive ?? null,
        limit,
        offset,
      ],
    )) as InactivityRow[];

    const row = rows[0];
    const coverageStatus = row.captureStartedAt ? 'partial' : 'unavailable';
    return {
      asOf: row.asOf,
      timezone: 'Europe/Madrid',
      totalUsers: row.totalUsers,
      groups: row.groups,
      coverage: {
        status: coverageStatus,
        captureStartedAt: row.captureStartedAt,
        captureDataSince: row.captureDataSince,
        interpretation:
          'set events are reliable from captureStartedAt. Users without any vote event are never_voted only when createdAt is at or after that instant and before the end of asOf; earlier accounts, contradictory vote events, and accounts created after asOf are insufficient_history.',
      },
      limit,
      offset,
      sortBy,
      sortOrder,
      data: row.data ?? [],
    };
  }
}
