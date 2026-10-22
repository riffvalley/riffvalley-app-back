import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Rate } from '../../community/rates/entities/rate.entity';
import { PaginationDto } from '../../platform/common/dtos/pagination.dto';
import { User } from '../auth/entities/user.entity';
import { UserAccessLog } from '../auth/entities/user-access-log.entity';
import { UserAppDailyActivity } from './entities/user-app-daily-activity.entity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAccessLog)
    private readonly userAccessLogRepository: Repository<UserAccessLog>,
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    @InjectRepository(UserAppDailyActivity)
    private readonly appDailyActivityRepository: Repository<UserAppDailyActivity>,
  ) {}

  async recordAppDailyActivity(userId: string): Promise<void> {
    await this.appDailyActivityRepository.query(
      `INSERT INTO "user_app_daily_activity" ("user_id", "activity_date")
       VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date)
       ON CONFLICT ("user_id", "activity_date") DO NOTHING`,
      [userId],
    );
  }

  async getAllActivity(paginationDto: PaginationDto) {
    const { limit = 20, offset = 0 } = paginationDto;
    const [data, totalItems] = await this.rateRepository.findAndCount({
      relations: ['disc', 'user'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      limit,
      data: data.map(({ user, disc, ...rate }) => ({
        ...rate,
        user: { id: user.id, username: user.username, image: user.image },
        disc: { id: disc.id, name: disc.name },
      })),
    };
  }

  async getUserActivity(id: string) {
    const [votes, logins] = await Promise.all([
      this.rateRepository.find({
        where: { user: { id } },
        relations: ['disc'],
        order: { createdAt: 'DESC' },
        select: {
          id: true,
          rate: true,
          cover: true,
          createdAt: true,
          editedAt: true,
        },
      }),
      this.userAccessLogRepository.find({
        where: { userId: id },
        order: { date: 'DESC' },
        select: { date: true },
      }),
    ]);
    return { votes, logins };
  }

  async findAllAdminStats(paginationDto: PaginationDto) {
    const {
      limit = 10,
      offset = 0,
      notVotedDays,
      accessDays,
      inactiveDays = 7,
    } = paginationDto;
    const voteExpression =
      'MAX(GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt")))';
    const userFields = [
      'user.id AS id',
      'user.username AS username',
      'user.email AS email',
      'user.image AS image',
      '"user"."createdAt" AS "createdAt"',
      '"user"."lastLogin" AS "lastLogin"',
      `${voteExpression} AS "lastVoteDate"`,
    ];
    const usersQuery = this.userRepository
      .createQueryBuilder('user')
      .select(userFields)
      .leftJoin('rate', 'rate', 'rate."userId" = user.id')
      .groupBy('user.id')
      .orderBy('"user"."lastLogin"', 'DESC', 'NULLS LAST')
      .addOrderBy('"lastVoteDate"', 'DESC', 'NULLS LAST')
      .limit(limit)
      .offset(offset);

    if (notVotedDays) {
      const cutoff = new Date(Date.now() - notVotedDays * 24 * 60 * 60 * 1000);
      usersQuery.having(
        `${voteExpression} < :cutoff OR ${voteExpression} IS NULL`,
        { cutoff },
      );
    }

    const totalItemsPromise = notVotedDays
      ? this.userRepository
          .createQueryBuilder('user')
          .leftJoin('rate', 'rate', 'rate."userId" = user.id')
          .groupBy('user.id')
          .having(`${voteExpression} < :cutoff OR ${voteExpression} IS NULL`, {
            cutoff: new Date(Date.now() - notVotedDays * 24 * 60 * 60 * 1000),
          })
          .getCount()
      : this.userRepository.count();

    const lastLoginQuery = this.userAccessLogRepository
      .createQueryBuilder('log')
      .select('log.date', 'date')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('log.date')
      .orderBy('log.date', 'DESC');
    if (accessDays) {
      const since = new Date(Date.now() - accessDays * 24 * 60 * 60 * 1000);
      lastLoginQuery.andWhere('log.date >= :since', { since });
    }

    const inactiveVotersPerDayQuery = this.userRepository.query(`
      WITH user_last_votes AS (
        SELECT
          DATE(u."createdAt") AS joined,
          MAX(GREATEST(r."createdAt", COALESCE(r."editedAt", r."createdAt")))::date AS last_vote
        FROM users u
        LEFT JOIN rate r ON r."userId" = u.id
        GROUP BY u.id, u."createdAt"
      ),
      date_series AS (
        SELECT generate_series(
          (SELECT MIN(joined) FROM user_last_votes),
          CURRENT_DATE,
          '1 day'::interval
        )::date AS day
      )
      SELECT
        d.day AS date,
        COUNT(CASE WHEN ulv.last_vote IS NULL OR ulv.last_vote < d.day - ${inactiveDays} THEN 1 END)::int AS count
      FROM date_series d
      JOIN user_last_votes ulv ON ulv.joined <= d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `);
    const lastVotePerDayQuery = this.userRepository.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', last_vote), 'YYYY-MM') AS date,
        COUNT(*)::int AS count
      FROM (
        SELECT MAX(GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt"))) AS last_vote
        FROM users
        LEFT JOIN rate ON rate."userId" = users.id
        GROUP BY users.id
        HAVING MAX(GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt"))) IS NOT NULL
      ) sub
      GROUP BY DATE_TRUNC('month', last_vote)
      ORDER BY date DESC
    `);

    const [
      data,
      totalItems,
      lastLoginPerDay,
      neverAccessed,
      usersPerDay,
      lastVotePerDay,
      inactiveVotersPerDay,
    ] = await Promise.all([
      usersQuery.getRawMany(),
      totalItemsPromise,
      lastLoginQuery.getRawMany(),
      this.userRepository.count({ where: { lastLogin: IsNull() } }),
      this.userRepository
        .createQueryBuilder('user')
        .select('DATE("user"."createdAt")', 'date')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy('DATE("user"."createdAt")')
        .orderBy('date', 'DESC')
        .getRawMany(),
      lastVotePerDayQuery,
      inactiveVotersPerDayQuery,
    ]);

    return {
      users: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: Math.floor(offset / limit) + 1,
        limit,
        data,
      },
      usersPerDay,
      lastLoginPerDay,
      neverAccessed,
      lastVotePerDay,
      inactiveVotersPerDay,
    };
  }
}
