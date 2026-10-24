import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import {
  ActivityDateRangeQueryDto,
  ActivitySummaryQueryDto,
  ActivityUsersQueryDto,
} from './dto/activity-date-range-query.dto';
import {
  ActivityCoverage,
  ActivityDashboardBaseAggregates,
  ActivityDashboardResponse,
  ActivityDashboardRanges,
  ActivityMetricComparison,
  ActivitySummaryResponse,
  ActivityUserDetailResponse,
  ActivityUserStatistics,
  ActivityUsersResponse,
} from './activity-statistics.types';

const MADRID_TZ = 'Europe/Madrid';

type DateRange = { from: string; to: string };

type UserStatisticsRow = ActivityUserStatistics & {
  totalItems: number;
  activityDataSince: string | null;
  voteDataSince: string | null;
};

type UserDetailRow = ActivityUserDetailResponse;

type SummaryRow = {
  from: string;
  to: string;
  activityDataSince: string | null;
  voteDataSince: string | null;
  periods: ActivitySummaryResponse['periods'];
  series: ActivitySummaryResponse['series'];
};

type DashboardBaseRow = ActivityDashboardBaseAggregates;

type DashboardReturningCounts = {
  current: number | null;
  previous: number | null;
};

type DashboardReturningRow = {
  currentReturningUsers: number | null;
  previousReturningUsers: number | null;
};

type DashboardBaseOptions = {
  includeCurrentRatings?: boolean;
  includeSeries?: boolean;
};

@Injectable()
export class ActivityStatisticsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findUsers(
    query: ActivityUsersQueryDto,
  ): Promise<ActivityUsersResponse> {
    const range = this.resolveRange(query);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const rows = (await this.userRepository.query(
      `
      WITH context AS (
        SELECT
          $1::date AS from_date,
          $2::date AS to_date,
          (CURRENT_TIMESTAMP AT TIME ZONE '${MADRID_TZ}')::date AS today,
          (SELECT MIN(activity_date) + 1 FROM user_app_daily_activity) AS activity_data_since,
          (
            SELECT (started_at AT TIME ZONE '${MADRID_TZ}')::date + 1
            FROM rate_vote_event_capture WHERE id = 1
          ) AS vote_data_since
      ), activity_by_user AS (
        SELECT
          activity.user_id,
          MAX(activity.activity_date) AS last_active_date,
          COUNT(*) FILTER (
            WHERE activity.activity_date >= context.today - 6
              AND activity.activity_date <= context.today
          )::int AS active_days_7,
          COUNT(*) FILTER (
            WHERE activity.activity_date >= context.today - 29
              AND activity.activity_date <= context.today
          )::int AS active_days_30
        FROM user_app_daily_activity activity
        CROSS JOIN context
        GROUP BY activity.user_id
      ), current_votes AS (
        SELECT rate."userId" AS user_id,
          COUNT(DISTINCT rate."discId") FILTER (WHERE rate.rate IS NOT NULL)::int AS current_votes
        FROM rate
        GROUP BY rate."userId"
      ), event_by_user AS (
        SELECT event.user_id,
          COUNT(*)::int AS vote_actions_recorded,
          MAX(event.occurred_at) AS last_vote_at,
          COUNT(*) FILTER (
            WHERE (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date
              BETWEEN context.today - 6 AND context.today
          )::int AS vote_actions_7,
          COUNT(*) FILTER (
            WHERE (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date
              BETWEEN context.today - 29 AND context.today
          )::int AS vote_actions_30
        FROM rate_vote_events event
        CROSS JOIN context
        GROUP BY event.user_id
      ), vote_daily AS (
        SELECT event.user_id,
          (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date AS activity_day,
          COUNT(*)::int AS action_count
        FROM rate_vote_events event
        CROSS JOIN context
        WHERE event.occurred_at >= (context.from_date::timestamp AT TIME ZONE '${MADRID_TZ}')
          AND event.occurred_at < ((context.to_date + 1)::timestamp AT TIME ZONE '${MADRID_TZ}')
          AND (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date >= context.vote_data_since
        GROUP BY event.user_id, activity_day
      ), vote_daily_by_user AS (
        SELECT user_id,
          jsonb_agg(
            jsonb_build_object('date', activity_day::text, 'count', action_count)
            ORDER BY activity_day
          ) AS votes_by_day
        FROM vote_daily
        GROUP BY user_id
      )
      SELECT
        app_user.id::text AS "userId",
        app_user.username AS username,
        activity.last_active_date::text AS "lastActiveDate",
        CASE WHEN context.activity_data_since IS NULL
          OR context.today - 6 < context.activity_data_since THEN NULL
          ELSE COALESCE(activity.active_days_7, 0) END AS "activeDays7",
        CASE WHEN context.activity_data_since IS NULL
          OR context.today - 29 < context.activity_data_since THEN NULL
          ELSE COALESCE(activity.active_days_30, 0) END AS "activeDays30",
        COALESCE(current_votes.current_votes, 0)::int AS "currentVotes",
        CASE WHEN context.vote_data_since IS NULL
          OR context.today - 6 < context.vote_data_since THEN NULL
          ELSE COALESCE(events.vote_actions_7, 0) END AS "voteActions7",
        CASE WHEN context.vote_data_since IS NULL
          OR context.today - 29 < context.vote_data_since THEN NULL
          ELSE COALESCE(events.vote_actions_30, 0) END AS "voteActions30",
        to_char(events.last_vote_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastVoteAt",
        COALESCE(vote_daily_by_user.votes_by_day, '[]'::jsonb) AS "votesByDay",
        COALESCE(events.vote_actions_recorded, 0)::int AS "voteActionsRecorded",
        context.activity_data_since::text AS "activityDataSince",
        context.vote_data_since::text AS "voteDataSince",
        (SELECT COUNT(*)::int FROM users) AS "totalItems"
      FROM users app_user
      CROSS JOIN context
      LEFT JOIN activity_by_user activity ON activity.user_id = app_user.id
      LEFT JOIN current_votes ON current_votes.user_id = app_user.id
      LEFT JOIN event_by_user events ON events.user_id = app_user.id
      LEFT JOIN vote_daily_by_user ON vote_daily_by_user.user_id = app_user.id
      ORDER BY activity.last_active_date DESC NULLS LAST, app_user.username ASC
      LIMIT $3 OFFSET $4
      `,
      [range.from, range.to, limit, offset],
    )) as UserStatisticsRow[];

    return {
      totalItems: rows[0]?.totalItems ?? (await this.userRepository.count()),
      limit,
      offset,
      from: range.from,
      to: range.to,
      timezone: MADRID_TZ,
      activityDataSince: rows[0]?.activityDataSince ?? null,
      voteDataSince: rows[0]?.voteDataSince ?? null,
      data: rows.map((user) => ({
        userId: user.userId,
        username: user.username,
        lastActiveDate: user.lastActiveDate,
        activeDays7: user.activeDays7,
        activeDays30: user.activeDays30,
        currentVotes: user.currentVotes,
        voteActions7: user.voteActions7,
        voteActions30: user.voteActions30,
        voteActionsRecorded: user.voteActionsRecorded,
        lastVoteAt: user.lastVoteAt,
        votesByDay: user.votesByDay,
      })),
    };
  }

  async getSummary(
    query: ActivitySummaryQueryDto,
  ): Promise<ActivitySummaryResponse> {
    const range = this.resolveSummaryRange(query);
    const rows = (await this.userRepository.query(
      `
      WITH context AS (
        SELECT
          $1::date AS from_date,
          $2::date AS to_date,
          (CURRENT_TIMESTAMP AT TIME ZONE '${MADRID_TZ}')::date AS today,
          (SELECT MIN(activity_date) + 1 FROM user_app_daily_activity) AS activity_data_since,
          (
            SELECT (started_at AT TIME ZONE '${MADRID_TZ}')::date + 1
            FROM rate_vote_event_capture WHERE id = 1
          ) AS vote_data_since
      ), calendar AS (
        SELECT generate_series(context.from_date, context.to_date, '1 day'::interval)::date AS day
        FROM context
      ), activity_daily AS (
        SELECT activity.activity_date AS day, COUNT(*)::int AS active_users
        FROM user_app_daily_activity activity
        CROSS JOIN context
        WHERE activity.activity_date BETWEEN context.from_date AND context.to_date
        GROUP BY activity.activity_date
      ), vote_daily AS (
        SELECT (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date AS day,
          COUNT(*)::int AS vote_actions,
          COUNT(DISTINCT event.user_id)::int AS voting_users
        FROM rate_vote_events event
        CROSS JOIN context
        WHERE event.occurred_at >= (context.from_date::timestamp AT TIME ZONE '${MADRID_TZ}')
          AND event.occurred_at < ((context.to_date + 1)::timestamp AT TIME ZONE '${MADRID_TZ}')
          AND (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date >= context.vote_data_since
        GROUP BY day
      ), series AS (
        SELECT jsonb_agg(jsonb_build_object(
          'date', calendar.day::text,
          'activeUsers', CASE
            WHEN context.activity_data_since IS NULL OR calendar.day < context.activity_data_since THEN NULL
            ELSE COALESCE(activity_daily.active_users, 0)
          END,
          'voteActions', CASE
            WHEN context.vote_data_since IS NULL OR calendar.day < context.vote_data_since THEN NULL
            ELSE COALESCE(vote_daily.vote_actions, 0)
          END,
          'votingUsers', CASE
            WHEN context.vote_data_since IS NULL OR calendar.day < context.vote_data_since THEN NULL
            ELSE COALESCE(vote_daily.voting_users, 0)
          END
        ) ORDER BY calendar.day) AS data
        FROM calendar
        CROSS JOIN context
        LEFT JOIN activity_daily ON activity_daily.day = calendar.day
        LEFT JOIN vote_daily ON vote_daily.day = calendar.day
      )
      SELECT
        context.from_date::text AS "from",
        context.to_date::text AS "to",
        context.activity_data_since::text AS "activityDataSince",
        context.vote_data_since::text AS "voteDataSince",
        jsonb_build_object(
          'activeUsers7', CASE WHEN context.activity_data_since IS NULL OR context.today - 6 < context.activity_data_since THEN NULL ELSE (
            SELECT COUNT(DISTINCT activity.user_id)::int FROM user_app_daily_activity activity
            WHERE activity.activity_date BETWEEN context.today - 6 AND context.today
          ) END,
          'activeUsers30', CASE WHEN context.activity_data_since IS NULL OR context.today - 29 < context.activity_data_since THEN NULL ELSE (
            SELECT COUNT(DISTINCT activity.user_id)::int FROM user_app_daily_activity activity
            WHERE activity.activity_date BETWEEN context.today - 29 AND context.today
          ) END,
          'voteActions7', CASE WHEN context.vote_data_since IS NULL OR context.today - 6 < context.vote_data_since THEN NULL ELSE (
            SELECT COUNT(*)::int FROM rate_vote_events event
            WHERE event.occurred_at >= ((context.today - 6)::timestamp AT TIME ZONE '${MADRID_TZ}')
              AND event.occurred_at < ((context.today + 1)::timestamp AT TIME ZONE '${MADRID_TZ}')
          ) END,
          'voteActions30', CASE WHEN context.vote_data_since IS NULL OR context.today - 29 < context.vote_data_since THEN NULL ELSE (
            SELECT COUNT(*)::int FROM rate_vote_events event
            WHERE event.occurred_at >= ((context.today - 29)::timestamp AT TIME ZONE '${MADRID_TZ}')
              AND event.occurred_at < ((context.today + 1)::timestamp AT TIME ZONE '${MADRID_TZ}')
          ) END,
          'votingUsers7', CASE WHEN context.vote_data_since IS NULL OR context.today - 6 < context.vote_data_since THEN NULL ELSE (
            SELECT COUNT(DISTINCT event.user_id)::int FROM rate_vote_events event
            WHERE event.occurred_at >= ((context.today - 6)::timestamp AT TIME ZONE '${MADRID_TZ}')
              AND event.occurred_at < ((context.today + 1)::timestamp AT TIME ZONE '${MADRID_TZ}')
          ) END,
          'votingUsers30', CASE WHEN context.vote_data_since IS NULL OR context.today - 29 < context.vote_data_since THEN NULL ELSE (
            SELECT COUNT(DISTINCT event.user_id)::int FROM rate_vote_events event
            WHERE event.occurred_at >= ((context.today - 29)::timestamp AT TIME ZONE '${MADRID_TZ}')
              AND event.occurred_at < ((context.today + 1)::timestamp AT TIME ZONE '${MADRID_TZ}')
          ) END
        ) AS periods,
        (SELECT data FROM series) AS series
      FROM context
      `,
      [range.from, range.to],
    )) as SummaryRow[];
    const summary = rows[0];
    const dashboardRanges = resolveDashboardRanges(range);
    const [current, previous, baseline] = await Promise.all([
      this.getDashboardBaseAggregates(dashboardRanges.current),
      this.getDashboardBaseAggregates(dashboardRanges.previous, {
        includeCurrentRatings: false,
      }),
      this.getDashboardBaseAggregates(dashboardRanges.baseline, {
        includeCurrentRatings: false,
        includeSeries: false,
      }),
    ]);
    const returningUsers = await this.getDashboardReturningCounts(
      dashboardRanges,
      current.activityDataSince,
    );

    return {
      from: summary.from,
      to: summary.to,
      timezone: MADRID_TZ,
      activityDataSince: summary.activityDataSince,
      voteDataSince: summary.voteDataSince,
      periods: summary.periods,
      series: summary.series ?? [],
      dashboard: buildDashboardResponse(
        dashboardRanges,
        current,
        previous,
        baseline,
        returningUsers,
        new Date().toISOString(),
      ),
    };
  }

  /**
   * Internal base aggregates for I1-E03c. This is deliberately not returned
   * from the HTTP endpoint until comparisons and derived metrics are ready.
   */
  async getDashboardBaseAggregates(
    range: DateRange,
    options: DashboardBaseOptions = {},
  ): Promise<ActivityDashboardBaseAggregates> {
    const currentRatingsCte =
      options.includeCurrentRatings !== false
        ? `current_ratings AS (
          SELECT COUNT(*) FILTER (WHERE rate.rate IS NOT NULL)::int AS total
          FROM rate
        )`
        : 'current_ratings AS (SELECT NULL::int AS total)';
    const calendarCte =
      options.includeSeries === false
        ? ''
        : `calendar AS (
            SELECT generate_series(
              context.from_date,
              context.to_date,
              '1 day'::interval
            )::date AS day
            FROM context
          ),`;
    const seriesCte =
      options.includeSeries !== false
        ? `series AS (
          SELECT jsonb_agg(jsonb_build_object(
            'date', calendar.day::text,
            'dayIndex', calendar.day - context.from_date + 1,
            'activeUsers', CASE
              WHEN context.activity_data_since IS NULL
                OR calendar.day < context.activity_data_since THEN NULL
              ELSE COALESCE(activity_daily.active_users, 0)
            END,
            'newVotes', CASE
              WHEN context.vote_data_since IS NULL
                OR calendar.day < context.vote_data_since THEN NULL
              ELSE COALESCE(vote_daily.new_votes, 0)
            END
          ) ORDER BY calendar.day) AS data
          FROM calendar
          CROSS JOIN context
          LEFT JOIN activity_daily ON activity_daily.day = calendar.day
          LEFT JOIN vote_daily ON vote_daily.day = calendar.day
        )`
        : "series AS (SELECT '[]'::jsonb AS data)";
    const rows = (await this.userRepository.query(
      `
      WITH context AS (
        SELECT
          $1::date AS from_date,
          $2::date AS to_date,
          (SELECT MIN(activity_date) + 1 FROM user_app_daily_activity) AS activity_data_since,
          (
            SELECT (started_at AT TIME ZONE '${MADRID_TZ}')::date + 1
            FROM rate_vote_event_capture WHERE id = 1
          ) AS vote_data_since
      ), ${calendarCte}
      activity_in_range AS (
        SELECT
          activity.user_id,
          activity.activity_date AS day
        FROM user_app_daily_activity activity
        CROSS JOIN context
        WHERE activity.activity_date BETWEEN context.from_date AND context.to_date
      ), activity_aggregates AS (
        SELECT
          activity.day,
          GROUPING(activity.day)::int AS is_period,
          COUNT(DISTINCT activity.user_id)::int AS active_users
        FROM activity_in_range activity
        GROUP BY GROUPING SETS ((activity.day), ())
      ), activity_daily AS (
        SELECT day, active_users
        FROM activity_aggregates
        WHERE is_period = 0
      ), activity_period AS (
        SELECT active_users
        FROM activity_aggregates
        WHERE is_period = 1
      ), vote_set_in_range AS (
        SELECT
          event.user_id,
          (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date AS day
        FROM rate_vote_events event
        CROSS JOIN context
        WHERE event.event_type = 'set'
          AND event.occurred_at >= (
            context.from_date::timestamp AT TIME ZONE '${MADRID_TZ}'
          )
          AND event.occurred_at < (
            (context.to_date + 1)::timestamp AT TIME ZONE '${MADRID_TZ}'
          )
          AND (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date
            >= context.vote_data_since
      ), vote_aggregates AS (
        SELECT
          vote_event.day,
          GROUPING(vote_event.day)::int AS is_period,
          COUNT(*)::int AS new_votes,
          COUNT(DISTINCT vote_event.user_id)::int AS voting_users
        FROM vote_set_in_range vote_event
        GROUP BY GROUPING SETS ((vote_event.day), ())
      ), vote_daily AS (
        SELECT day, new_votes
        FROM vote_aggregates
        WHERE is_period = 0
      ), vote_period AS (
        SELECT new_votes, voting_users
        FROM vote_aggregates
        WHERE is_period = 1
      ), ${currentRatingsCte}, ${seriesCte}
      SELECT
        context.from_date::text AS "from",
        context.to_date::text AS "to",
        context.activity_data_since::text AS "activityDataSince",
        context.vote_data_since::text AS "voteDataSince",
        CASE
          WHEN context.activity_data_since IS NULL
            OR context.from_date < context.activity_data_since THEN NULL
          ELSE activity_period.active_users
        END AS "activeUsers",
        CASE
          WHEN context.vote_data_since IS NULL
            OR context.from_date < context.vote_data_since THEN NULL
          ELSE vote_period.new_votes
        END AS "newVotes",
        CASE
          WHEN context.vote_data_since IS NULL
            OR context.from_date < context.vote_data_since THEN NULL
          ELSE vote_period.voting_users
        END AS "votingUsers",
        current_ratings.total AS "currentRatings",
        COALESCE(series.data, '[]'::jsonb) AS series
      FROM context
      CROSS JOIN activity_period
      CROSS JOIN vote_period
      CROSS JOIN current_ratings
      CROSS JOIN series
      `,
      [range.from, range.to],
    )) as DashboardBaseRow[];
    const aggregates = rows[0];

    return {
      from: aggregates.from,
      to: aggregates.to,
      activityDataSince: aggregates.activityDataSince,
      voteDataSince: aggregates.voteDataSince,
      activeUsers: aggregates.activeUsers,
      newVotes: aggregates.newVotes,
      votingUsers: aggregates.votingUsers,
      currentRatings: aggregates.currentRatings,
      series: aggregates.series ?? [],
    };
  }

  private async getDashboardReturningCounts(
    ranges: ActivityDashboardRanges,
    activityDataSince: string | null,
  ): Promise<DashboardReturningCounts> {
    const rows = (await this.userRepository.query(
      `
      WITH period_ranges AS (
        SELECT 'current'::text AS period, $1::date AS from_date, $2::date AS to_date
        UNION ALL
        SELECT 'previous', $3::date, $4::date
        UNION ALL
        SELECT 'baseline', $5::date, $6::date
      ), activity_in_span AS (
        SELECT activity.user_id, activity.activity_date
        FROM user_app_daily_activity activity
        WHERE activity.activity_date BETWEEN $5::date AND $2::date
      ), active_by_period AS (
        SELECT period_ranges.period, activity.user_id
        FROM period_ranges
        JOIN activity_in_span activity
          ON activity.activity_date BETWEEN period_ranges.from_date AND period_ranges.to_date
        GROUP BY period_ranges.period, activity.user_id
      )
      SELECT
        CASE
          WHEN $7::date IS NULL OR $1::date < $7::date OR $3::date < $7::date THEN NULL
          ELSE (
            SELECT COUNT(*)::int
            FROM active_by_period current_active
            JOIN active_by_period previous_active USING (user_id)
            WHERE current_active.period = 'current'
              AND previous_active.period = 'previous'
          )
        END AS "currentReturningUsers",
        CASE
          WHEN $7::date IS NULL OR $3::date < $7::date OR $5::date < $7::date THEN NULL
          ELSE (
            SELECT COUNT(*)::int
            FROM active_by_period previous_active
            JOIN active_by_period baseline_active USING (user_id)
            WHERE previous_active.period = 'previous'
              AND baseline_active.period = 'baseline'
          )
        END AS "previousReturningUsers"
      `,
      [
        ranges.current.from,
        ranges.current.to,
        ranges.previous.from,
        ranges.previous.to,
        ranges.baseline.from,
        ranges.baseline.to,
        activityDataSince,
      ],
    )) as DashboardReturningRow[];
    const row = rows[0];
    return {
      current: row.currentReturningUsers,
      previous: row.previousReturningUsers,
    };
  }

  async getUserDetail(
    userId: string,
    query: ActivityDateRangeQueryDto,
  ): Promise<ActivityUserDetailResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const range = this.resolveRange(query);
    const rows = (await this.userRepository.query(
      `
      WITH context AS (
        SELECT
          $2::date AS from_date,
          $3::date AS to_date,
          (CURRENT_TIMESTAMP AT TIME ZONE '${MADRID_TZ}')::date AS today,
          (SELECT MIN(activity_date) + 1 FROM user_app_daily_activity) AS activity_data_since,
          (
            SELECT (started_at AT TIME ZONE '${MADRID_TZ}')::date + 1
            FROM rate_vote_event_capture WHERE id = 1
          ) AS vote_data_since
      ), activity AS (
        SELECT
          MAX(activity_date) AS last_active_date,
          COUNT(*) FILTER (WHERE activity_date BETWEEN context.today - 6 AND context.today)::int AS active_days_7,
          COUNT(*) FILTER (WHERE activity_date BETWEEN context.today - 29 AND context.today)::int AS active_days_30
        FROM user_app_daily_activity
        CROSS JOIN context
        WHERE user_id = $1::uuid
      ), vote_summary AS (
        SELECT COUNT(*)::int AS vote_actions_recorded,
          MAX(occurred_at) AS last_vote_at,
          COUNT(*) FILTER (
            WHERE (occurred_at AT TIME ZONE '${MADRID_TZ}')::date BETWEEN context.today - 6 AND context.today
          )::int AS vote_actions_7,
          COUNT(*) FILTER (
            WHERE (occurred_at AT TIME ZONE '${MADRID_TZ}')::date BETWEEN context.today - 29 AND context.today
          )::int AS vote_actions_30
        FROM rate_vote_events
        CROSS JOIN context
        WHERE user_id = $1::uuid
      ), activity_dates AS (
        SELECT COALESCE(jsonb_agg(activity_date::text ORDER BY activity_date), '[]'::jsonb) AS dates
        FROM user_app_daily_activity, context
        WHERE user_id = $1::uuid AND activity_date BETWEEN context.from_date AND context.to_date
      ), vote_daily AS (
        SELECT (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date AS day,
          COUNT(*)::int AS action_count
        FROM rate_vote_events event
        CROSS JOIN context
        WHERE event.user_id = $1::uuid
          AND event.occurred_at >= (context.from_date::timestamp AT TIME ZONE '${MADRID_TZ}')
          AND event.occurred_at < ((context.to_date + 1)::timestamp AT TIME ZONE '${MADRID_TZ}')
          AND (event.occurred_at AT TIME ZONE '${MADRID_TZ}')::date >= context.vote_data_since
        GROUP BY day
      ), vote_dates AS (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('date', day::text, 'count', action_count) ORDER BY day
        ), '[]'::jsonb) AS dates
        FROM vote_daily
      ), current_votes AS (
        SELECT COUNT(DISTINCT "discId") FILTER (WHERE rate IS NOT NULL)::int AS count
        FROM rate WHERE "userId" = $1::uuid
      )
      SELECT
        $1::text AS "userId",
        activity.last_active_date::text AS "lastActiveDate",
        CASE WHEN context.activity_data_since IS NULL OR context.today - 6 < context.activity_data_since THEN NULL ELSE COALESCE(activity.active_days_7, 0) END AS "activeDays7",
        CASE WHEN context.activity_data_since IS NULL OR context.today - 29 < context.activity_data_since THEN NULL ELSE COALESCE(activity.active_days_30, 0) END AS "activeDays30",
        activity_dates.dates AS "activeDates",
        context.activity_data_since::text AS "activityDataSince",
        COALESCE(current_votes.count, 0)::int AS "currentVotes",
        CASE WHEN context.vote_data_since IS NULL OR context.today - 6 < context.vote_data_since THEN NULL ELSE COALESCE(vote_summary.vote_actions_7, 0) END AS "voteActions7",
        CASE WHEN context.vote_data_since IS NULL OR context.today - 29 < context.vote_data_since THEN NULL ELSE COALESCE(vote_summary.vote_actions_30, 0) END AS "voteActions30",
        COALESCE(vote_summary.vote_actions_recorded, 0)::int AS "voteActionsRecorded",
        to_char(vote_summary.last_vote_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastVoteAt",
        context.vote_data_since::text AS "voteDataSince",
        vote_dates.dates AS "votesByDay"
      FROM context
      CROSS JOIN activity
      CROSS JOIN vote_summary
      CROSS JOIN activity_dates
      CROSS JOIN vote_dates
      CROSS JOIN current_votes
      `,
      [userId, range.from, range.to],
    )) as UserDetailRow[];
    return rows[0];
  }

  private resolveRange(query: ActivityDateRangeQueryDto): DateRange {
    const today = madridDate(new Date());
    const to = query.to ?? today;
    const from = query.from ?? addDays(to, -29);
    if (from > to) {
      throw new BadRequestException('from must be on or before to');
    }
    return { from, to };
  }

  private resolveSummaryRange(query: ActivitySummaryQueryDto): DateRange {
    if (query.period !== undefined) {
      if (query.from !== undefined || query.to !== undefined) {
        throw new BadRequestException(
          'period cannot be combined with from or to',
        );
      }
      const to = madridDate(new Date());
      return { from: addDays(to, -(query.period - 1)), to };
    }

    // Keep the legacy one-sided from/to behavior for callers that omit period.
    return this.resolveRange(query);
  }
}

function madridDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function resolveDashboardRanges(current: DateRange): ActivityDashboardRanges {
  const days =
    (Date.parse(`${current.to}T00:00:00.000Z`) -
      Date.parse(`${current.from}T00:00:00.000Z`)) /
      86_400_000 +
    1;
  const previous = {
    from: addDays(current.from, -days),
    to: addDays(current.from, -1),
  };
  const baseline = {
    from: addDays(previous.from, -days),
    to: addDays(previous.from, -1),
  };

  return { current, previous, baseline };
}

function coverageFor(
  range: DateRange,
  dataSince: string | null,
): ActivityCoverage {
  if (dataSince === null) return { status: 'unavailable', dataSince: null };
  return {
    status: range.from >= dataSince ? 'complete' : 'incomplete',
    dataSince,
  };
}

function combinedCoverage(
  first: ActivityCoverage,
  second: ActivityCoverage,
): ActivityCoverage {
  if (first.status === 'unavailable' || second.status === 'unavailable') {
    return { status: 'unavailable', dataSince: null };
  }
  return {
    status:
      first.status === 'incomplete' || second.status === 'incomplete'
        ? 'incomplete'
        : 'complete',
    dataSince:
      first.dataSince && second.dataSince
        ? first.dataSince >= second.dataSince
          ? first.dataSince
          : second.dataSince
        : null,
  };
}

function compareMetric(
  current: number | null,
  previous: number | null,
  coverage: ActivityMetricComparison['coverage'],
  explicitReason?: ActivityMetricComparison['reason'],
): ActivityMetricComparison {
  const delta =
    current !== null && previous !== null ? current - previous : null;
  const changePercent =
    delta !== null && previous !== 0 ? (delta / previous) * 100 : null;
  const requiredCoverage = [
    coverage.current,
    coverage.previous,
    ...(coverage.baseline ? [coverage.baseline] : []),
  ];
  const hasInsufficientCoverage = requiredCoverage.some(
    (item) => item.status !== 'complete',
  );
  const reason = hasInsufficientCoverage
    ? 'unavailable'
    : (explicitReason ??
      (current === null || previous === null
        ? 'unavailable'
        : previous === 0
          ? 'zero_denominator'
          : undefined));

  return {
    current,
    previous,
    delta,
    changePercent,
    coverage,
    ...(reason ? { reason } : {}),
  };
}

type RatioResult = {
  value: number | null;
  reason?: 'zero_denominator' | 'unavailable';
};

function ratio(
  numerator: number | null,
  denominator: number | null,
  multiplier: number,
  coverage: ActivityCoverage,
): RatioResult {
  if (
    coverage.status !== 'complete' ||
    numerator === null ||
    denominator === null
  ) {
    return { value: null, reason: 'unavailable' };
  }
  if (denominator === 0) {
    return { value: null, reason: 'zero_denominator' };
  }
  return { value: (numerator / denominator) * multiplier };
}

function buildDashboardResponse(
  ranges: ActivityDashboardRanges,
  current: ActivityDashboardBaseAggregates,
  previous: ActivityDashboardBaseAggregates,
  baseline: ActivityDashboardBaseAggregates,
  returningUsers: DashboardReturningCounts,
  asOf: string,
): ActivityDashboardResponse {
  const currentActivityCoverage = coverageFor(
    ranges.current,
    current.activityDataSince,
  );
  const previousActivityCoverage = coverageFor(
    ranges.previous,
    current.activityDataSince,
  );
  const baselineActivityCoverage = coverageFor(
    ranges.baseline,
    current.activityDataSince,
  );
  const currentVoteCoverage = coverageFor(
    ranges.current,
    current.voteDataSince,
  );
  const previousVoteCoverage = coverageFor(
    ranges.previous,
    current.voteDataSince,
  );
  const currentDerivedCoverage = combinedCoverage(
    currentActivityCoverage,
    currentVoteCoverage,
  );
  const previousDerivedCoverage = combinedCoverage(
    previousActivityCoverage,
    previousVoteCoverage,
  );
  const currentReturningCoverage = combinedCoverage(
    currentActivityCoverage,
    previousActivityCoverage,
  );
  const previousReturningCoverage = combinedCoverage(
    previousActivityCoverage,
    baselineActivityCoverage,
  );
  const activeUsers = compareMetric(current.activeUsers, previous.activeUsers, {
    current: currentActivityCoverage,
    previous: previousActivityCoverage,
  });
  const newVotes = compareMetric(current.newVotes, previous.newVotes, {
    current: currentVoteCoverage,
    previous: previousVoteCoverage,
  });
  const votingUsers = compareMetric(current.votingUsers, previous.votingUsers, {
    current: currentVoteCoverage,
    previous: previousVoteCoverage,
  });
  const currentParticipation = ratio(
    current.votingUsers,
    current.activeUsers,
    100,
    currentDerivedCoverage,
  );
  const previousParticipation = ratio(
    previous.votingUsers,
    previous.activeUsers,
    100,
    previousDerivedCoverage,
  );
  const currentVotesPerActiveUser = ratio(
    current.newVotes,
    current.activeUsers,
    1,
    currentDerivedCoverage,
  );
  const previousVotesPerActiveUser = ratio(
    previous.newVotes,
    previous.activeUsers,
    1,
    previousDerivedCoverage,
  );
  const currentRetention = ratio(
    returningUsers.current,
    previous.activeUsers,
    100,
    currentReturningCoverage,
  );
  const previousRetention = ratio(
    returningUsers.previous,
    baseline.activeUsers,
    100,
    previousReturningCoverage,
  );
  const currentRatingsAvailable = current.currentRatings !== null;

  return {
    periods: ranges,
    timezone: MADRID_TZ,
    asOf,
    activityDataSince: current.activityDataSince,
    voteDataSince: current.voteDataSince,
    activeUsers,
    newVotes,
    votingUsers,
    participationRate: compareMetric(
      currentParticipation.value,
      previousParticipation.value,
      {
        current: currentDerivedCoverage,
        previous: previousDerivedCoverage,
      },
      currentParticipation.reason ?? previousParticipation.reason,
    ),
    votesPerActiveUser: compareMetric(
      currentVotesPerActiveUser.value,
      previousVotesPerActiveUser.value,
      {
        current: currentDerivedCoverage,
        previous: previousDerivedCoverage,
      },
      currentVotesPerActiveUser.reason ?? previousVotesPerActiveUser.reason,
    ),
    returningUsers: compareMetric(
      returningUsers.current,
      returningUsers.previous,
      {
        current: currentReturningCoverage,
        previous: previousReturningCoverage,
        baseline: baselineActivityCoverage,
      },
    ),
    retentionRate: compareMetric(
      currentRetention.value,
      previousRetention.value,
      {
        current: currentReturningCoverage,
        previous: previousReturningCoverage,
        baseline: baselineActivityCoverage,
      },
      currentRetention.reason ?? previousRetention.reason,
    ),
    currentRatings: {
      current: current.currentRatings,
      previous: null,
      delta: null,
      changePercent: null,
      coverage: {
        current: {
          status: currentRatingsAvailable ? 'complete' : 'unavailable',
          dataSince: null,
        },
        previous: { status: 'unavailable', dataSince: null },
      },
      reason: 'unavailable',
    },
    series: {
      current: current.series,
      previous: previous.series,
    },
  };
}
