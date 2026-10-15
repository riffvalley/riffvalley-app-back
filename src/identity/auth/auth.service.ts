import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto, UpdateUserDto } from './dto/update-user.dto';
import {
  isValidRole,
  roleMeetsMinimum,
  ValidRoles,
} from './interfaces/valid-roles';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserAccessLog } from './entities/user-access-log.entity';
import { Rate } from '../../community/rates/entities/rate.entity';
import { Repository } from 'typeorm';

import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { ILike, IsNull } from 'typeorm';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAccessLog)
    private readonly userAccessLogRepository: Repository<UserAccessLog>,
    @InjectRepository(Rate)
    private readonly rateRepository: Repository<Rate>,
    private readonly jwtService: JwtService,
  ) {}
  async create(createUserDto: CreateUserDto) {
    this.assertAllowedFields(createUserDto, [
      'email',
      'password',
      'username',
      'image',
      'dashboardConfig',
      'mobileDashboardConfig',
      'dashboardButtonsEnabled',
    ]);
    try {
      const {
        password,
        email,
        username,
        image,
        dashboardConfig,
        mobileDashboardConfig,
        dashboardButtonsEnabled,
      } = createUserDto;

      const user = this.userRepository.create({
        email,
        username,
        image,
        dashboardConfig,
        mobileDashboardConfig,
        dashboardButtonsEnabled,
        role: ValidRoles.user,
        password: bcrypt.hashSync(password, 10),
      });

      await this.userRepository.save(user);

      delete user.password;

      return {
        ...user,
        token: this.getJwtToken({
          username: user.username,
          id: user.id,
          role: user.role,
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
        role: true,
        image: true,
        dashboardConfig: true,
        mobileDashboardConfig: true,
        dashboardButtonsEnabled: true,
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
        role: user.role,
      }),
    };
  }

  async findAll() {
    try {
      const users = await this.userRepository.find({
        select: [
          'id',
          'username',
          'email',
          'role',
          'createdAt',
          'notes',
          'isActive',
        ],
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
        .select([
          'user.id',
          'user.username',
          'user.email',
          'user.role',
          'user.image',
        ])
        .where('user.role IN (:...roleValues)', {
          roleValues: Object.values(ValidRoles).filter((role) =>
            roleMeetsMinimum(role, ValidRoles.riffvalley),
          ),
        })
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
    if (!isValidRole(role)) {
      throw new BadRequestException('Role is not valid');
    }

    try {
      const users = await this.userRepository
        .createQueryBuilder('user')
        .select([
          'user.id',
          'user.username',
          'user.email',
          'user.role',
          'user.image',
        ])
        .where('user.role = :role', { role })
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
    return this.findUsersByRole(ValidRoles.superadmin);
  }

  async findAllAdminStats(paginationDto: PaginationDto) {
    const {
      limit = 10,
      offset = 0,
      notVotedDays,
      accessDays,
      inactiveDays = 7,
    } = paginationDto;

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
    updateData: AdminUpdateUserDto,
    actor: User,
  ): Promise<User> {
    this.assertAllowedFields(updateData, [
      'email',
      'password',
      'username',
      'image',
      'dashboardConfig',
      'mobileDashboardConfig',
      'dashboardButtonsEnabled',
      'role',
      'notes',
      'createdAt',
    ]);
    await this.assertSuperadmin(actor.id);
    this.validateAssignedRole(updateData.role);
    const user = await this.findOne(id);

    Object.assign(user, this.adminUpdateFields(updateData));
    return this.userRepository.save(user);
  }

  async updateUser(updateData: UpdateUserDto, actor: User): Promise<User> {
    this.assertAllowedFields(updateData, [
      'email',
      'password',
      'username',
      'image',
      'dashboardConfig',
      'mobileDashboardConfig',
      'dashboardButtonsEnabled',
    ]);
    const user = await this.findOne(actor.id);
    Object.assign(user, this.profileUpdateFields(updateData));
    return this.userRepository.save(user);
  }

  async remove(id: string, actor: User) {
    await this.assertSuperadmin(actor.id);
    const user = await this.findOne(id);
    return this.userRepository.remove(user);
  }

  async setActive(id: string, isActive: boolean, actor: User): Promise<User> {
    await this.assertSuperadmin(actor.id);
    const user = await this.findOne(id);
    user.isActive = isActive;
    return this.userRepository.save(user);
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

  private getJwtToken(payload: JwtPayload) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  private profileUpdateFields(
    updateData: UpdateUserDto | AdminUpdateUserDto,
  ): Partial<User> {
    const fields: Partial<User> = {};
    const allowedFields: (keyof UpdateUserDto)[] = [
      'email',
      'password',
      'username',
      'image',
      'dashboardConfig',
      'mobileDashboardConfig',
      'dashboardButtonsEnabled',
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        (fields as any)[field] = updateData[field];
      }
    }

    if (fields.password) fields.password = bcrypt.hashSync(fields.password, 10);
    return fields;
  }

  private adminUpdateFields(updateData: AdminUpdateUserDto): Partial<User> {
    const fields = this.profileUpdateFields(updateData);
    if (updateData.role !== undefined) fields.role = updateData.role;
    if (updateData.notes !== undefined) fields.notes = updateData.notes;
    if (updateData.createdAt !== undefined)
      fields.createdAt = new Date(updateData.createdAt);
    return fields;
  }

  private validateAssignedRole(role: unknown) {
    if (role !== undefined && !isValidRole(role)) {
      throw new BadRequestException('Role is not valid');
    }
  }

  private assertAllowedFields(
    value: object,
    allowedFields: readonly string[],
  ): void {
    const disallowedFields = Object.keys(value).filter(
      (field) => !allowedFields.includes(field),
    );

    if (disallowedFields.length > 0) {
      throw new BadRequestException(
        `Fields are not allowed: ${disallowedFields.join(', ')}`,
      );
    }
  }

  private async assertSuperadmin(actorId: string): Promise<void> {
    const actor = await this.userRepository.findOne({
      where: { id: actorId },
      select: { id: true, role: true, isActive: true },
    });

    if (!actor?.isActive || actor.role !== ValidRoles.superadmin) {
      throw new ForbiddenException('Only superadmin can manage users');
    }
  }

  private handleDBerrors(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
  }
}
