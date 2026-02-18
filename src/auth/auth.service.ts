import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserAccessLog } from './entities/user-access-log.entity';
import { Repository } from 'typeorm';

import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { ILike, IsNull } from 'typeorm';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAccessLog)
    private readonly userAccessLogRepository: Repository<UserAccessLog>,
    private readonly jwtService: JwtService,
  ) { }
  async create(createUserDto: CreateUserDto) {
    try {
      const { password, ...userData } = createUserDto;

      const user = this.userRepository.create({
        ...userData,
        password: bcrypt.hashSync(password, 10),
      });

      await this.userRepository.save(user);

      delete user.password;

      return {
        ...user,
        token: this.getJwtToken({
          username: user.username,
          id: user.id,
          roles: user.roles,
        }),
      };
    } catch (e) {
      this.handleDBerrors(e);
    }
  }

  async login(loginUserDto: LoginUserDto) {
    const { password, username } = loginUserDto;

    const user = await this.userRepository.findOne({
      where: { username: ILike(username) }, // 👈 búsqueda case-insensitive
      select: {
        username: true,
        password: true,
        id: true,
        roles: true,
        image: true,
      },
    });

    if (!user) throw new UnauthorizedException('Credentials are not valid!');
    if (!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('Credentials are not valid!');

    await Promise.all([
      this.userRepository.update(user.id, { lastLogin: new Date() }),
      this.userAccessLogRepository.query(
        `INSERT INTO user_access_log ("userId", date) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING`,
        [user.id],
      ),
    ]);

    const { password: _pw, ...safeUser } = user;

    return {
      ...safeUser,
      token: this.getJwtToken({
        username: user.username,
        id: user.id,
        roles: user.roles,
      }),
    };
  }

  async findAll() {
    try {
      const users = await this.userRepository.find({
        select: ['id', 'username', 'email', 'roles', 'createdAt', 'notes'],
        order: { createdAt: 'DESC' },
      });

      // Opcional: si no quieres devolver la contraseña u otros datos sensibles
      return users.map((user) => {
        delete user.password;
        return user;
      });
    } catch (error) {
      this.handleDBerrors(error);
    }
  }

  async findAllRv() {
    try {
      const users = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.username', 'user.email', 'user.roles', 'user.image'])
        .where(':role = ANY(user.roles)', { role: 'riffValley' }) // replace 'admin' with your role
        .getMany();

      // Opcional: si no quieres devolver la contraseña u otros datos sensibles
      return users.map((user) => {
        delete user.password;
        return user;
      });
    } catch (error) {
      this.handleDBerrors(error);
    }
  }

  async findUsersByRole(role: string) {
    try {
      const users = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.username', 'user.email', 'user.roles', 'user.image'])
        .where(':role = ANY(user.roles)', { role })
        .getMany();

      return users.map((user) => {
        delete user.password;
        return user;
      });
    } catch (error) {
      this.handleDBerrors(error);
    }
  }

  async findSuperUsers() {
    return this.findUsersByRole('superUser');
  }

  async findAllAdminStats(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0, notVotedDays, accessDays, inactiveDays = 7 } = paginationDto;

    const VOTE_EXPR =
      'MAX(GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt")))';

    const userFields = [
      'user.id AS id',
      'user.username AS username',
      'user.email AS email',
      'user.image AS image',
      '"user"."createdAt" AS "createdAt"',
      '"user"."lastLogin" AS "lastLogin"',
      `${VOTE_EXPR} AS "lastVoteDate"`,
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
      usersQuery.having(`${VOTE_EXPR} < :cutoff OR ${VOTE_EXPR} IS NULL`, {
        cutoff,
      });
    }

    let totalItemsPromise: Promise<number>;
    if (notVotedDays) {
      const cutoff = new Date(Date.now() - notVotedDays * 24 * 60 * 60 * 1000);
      totalItemsPromise = this.userRepository
        .createQueryBuilder('user')
        .leftJoin('rate', 'rate', 'rate."userId" = user.id')
        .groupBy('user.id')
        .having(`${VOTE_EXPR} < :cutoff OR ${VOTE_EXPR} IS NULL`, { cutoff })
        .getCount();
    } else {
      totalItemsPromise = this.userRepository.count();
    }

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

    const [data, totalItems, lastLoginPerDay, neverAccessed, usersPerDay, lastVotePerDay, inactiveVotersPerDay] =
      await Promise.all([
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

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      users: {
        totalItems,
        totalPages,
        currentPage,
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


  async findOne(id: string): Promise<User> {
    try {
      const unit = await this.userRepository.findOneByOrFail({ id });
      return unit;
    } catch (error) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
  }

  async updateUserSuperAdmin(
    id: string,
    updateData: Partial<User>,
  ): Promise<User> {
    const user = await this.findOne(id);

    if (updateData.password) {
      updateData.password = bcrypt.hashSync(updateData.password, 10);
    }

    Object.assign(user, updateData);
    return this.userRepository.save(user);
  }

  async updateUser(updateData: Partial<User>, user: User): Promise<User> {
    if (updateData.password) {
      updateData.password = bcrypt.hashSync(updateData.password, 10);
    }

    Object.assign(user, updateData);
    return this.userRepository.save(user);
  }

  async remove(id: string) {
    const user = await this.userRepository.delete({ id });
    return user;
  }

  private getJwtToken(payload: JwtPayload) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  private handleDBerrors(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
  }
}
