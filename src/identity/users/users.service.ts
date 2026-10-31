import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../auth/entities/user.entity';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { AdminUpdateUserDto, UpdateUserDto } from '../auth/dto/update-user.dto';
import {
  isValidRole,
  roleMeetsMinimum,
  ValidRoles,
} from '../authorization/interfaces/valid-roles';
import { isPasswordValid } from '../auth/passwords/password-policy';

export type UserWithoutPassword = Omit<
  User,
  'password' | 'checkFieldsBeforeInsert' | 'checkFieldsBeforeUpdate'
>;
export type UserIdentity = Pick<User, 'id' | 'role' | 'isActive'>;
export type PasswordResetTarget = Pick<User, 'id' | 'email' | 'isActive'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createAccount(
    createUserDto: CreateUserDto,
  ): Promise<UserWithoutPassword> {
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

      return this.withoutPassword(await this.userRepository.save(user));
    } catch (error) {
      this.handleDBerrors(error);
    }
  }

  async findCredentialsByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username: ILike(username) },
      select: {
        username: true,
        password: true,
        id: true,
        role: true,
        image: true,
        dashboardConfig: true,
        mobileDashboardConfig: true,
        dashboardButtonsEnabled: true,
        credentialVersion: true,
      },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  findPasswordResetTargetByEmail(
    email: string,
  ): Promise<PasswordResetTarget | null> {
    return this.userRepository.findOne({
      where: { email: email.trim().toLocaleLowerCase('en-US') },
      select: { id: true, email: true, isActive: true },
    });
  }

  async lockPasswordResetOwner(
    userId: string,
    manager: EntityManager,
  ): Promise<Pick<User, 'id' | 'isActive' | 'credentialVersion'> | null> {
    const rows = (await manager.query(
      `SELECT id, "isActive", credential_version AS "credentialVersion"
       FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    )) as Array<Pick<User, 'id' | 'isActive' | 'credentialVersion'>>;
    return rows[0] ?? null;
  }

  hashPasswordForReset(password: string): string {
    if (!isPasswordValid(password)) {
      throw new BadRequestException('Password is not valid');
    }
    return bcrypt.hashSync(password, 10);
  }

  async changePasswordForResetInTransaction(
    userId: string,
    passwordHash: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE users
       SET password = $2, credential_version = credential_version + 1
       WHERE id = $1`,
      [userId, passwordHash],
    );
    const rows = (await manager.query('SELECT id FROM users WHERE id = $1', [
      userId,
    ])) as Array<{ id: string }>;
    if (rows.length !== 1) {
      throw new Error('Password reset owner is unavailable');
    }
  }

  findSessionProfileById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        image: true,
        dashboardConfig: true,
        mobileDashboardConfig: true,
        dashboardButtonsEnabled: true,
        credentialVersion: true,
      },
    });
  }

  findIdentityById(id: string): Promise<UserIdentity | null> {
    return this.userRepository.findOne({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
  }

  countUsers(): Promise<number> {
    return this.userRepository.count();
  }

  async recordLogin(id: string): Promise<void> {
    await this.userRepository.update(id, { lastLogin: new Date() });
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    return Boolean(await this.userRepository.findOne({ where: { username } }));
  }

  async findAll(): Promise<User[]> {
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
      return users.map((user) => {
        delete user.password;
        return user;
      });
    } catch (error) {
      this.handleDBerrors(error);
    }
  }

  async findAllRv(): Promise<User[]> {
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
      return users.map((user) => {
        delete user.password;
        return user;
      });
    } catch (error) {
      this.handleDBerrors(error);
    }
  }

  async findUsersByRole(role: string): Promise<User[]> {
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

  findSuperUsers(): Promise<User[]> {
    return this.findUsersByRole(ValidRoles.superadmin);
  }

  async findOne(id: string): Promise<User> {
    try {
      return await this.userRepository.findOneByOrFail({ id });
    } catch {
      throw new NotFoundException(`User with id ${id} not found`);
    }
  }

  async updateUserSuperAdmin(
    id: string,
    updateData: AdminUpdateUserDto,
    actorId: string,
  ): Promise<UserWithoutPassword> {
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
    await this.assertSuperadmin(actorId);
    this.validateAssignedRole(updateData.role);
    const user = await this.findOne(id);
    Object.assign(user, this.adminUpdateFields(updateData));
    return this.withoutPassword(await this.userRepository.save(user));
  }

  async updateUser(
    updateData: UpdateUserDto,
    actorId: string,
  ): Promise<UserWithoutPassword> {
    this.assertAllowedFields(updateData, [
      'email',
      'password',
      'username',
      'image',
      'dashboardConfig',
      'mobileDashboardConfig',
      'dashboardButtonsEnabled',
    ]);
    const user = await this.findOne(actorId);
    Object.assign(user, this.profileUpdateFields(updateData));
    return this.withoutPassword(await this.userRepository.save(user));
  }

  async remove(id: string, actorId: string): Promise<User> {
    await this.assertSuperadmin(actorId);
    return this.userRepository.remove(await this.findOne(id));
  }

  async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
  ): Promise<User> {
    await this.assertSuperadmin(actorId);
    const user = await this.findOne(id);
    user.isActive = isActive;
    return this.userRepository.save(user);
  }

  private withoutPassword(user: User): UserWithoutPassword {
    const safeUser: UserWithoutPassword = { ...user };
    Reflect.deleteProperty(safeUser, 'password');
    return safeUser;
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
        Object.assign(fields, { [field]: updateData[field] });
      }
    }
    if (fields.password) fields.password = bcrypt.hashSync(fields.password, 10);
    return fields;
  }

  private adminUpdateFields(updateData: AdminUpdateUserDto): Partial<User> {
    const fields = this.profileUpdateFields(updateData);
    if (updateData.role !== undefined) fields.role = updateData.role;
    if (updateData.notes !== undefined) fields.notes = updateData.notes;
    if (updateData.createdAt !== undefined) {
      fields.createdAt = new Date(updateData.createdAt);
    }
    return fields;
  }

  private validateAssignedRole(role: unknown): void {
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

  private handleDBerrors(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      const detail =
        'detail' in error && typeof error.detail === 'string'
          ? error.detail
          : undefined;
      throw new BadRequestException(detail);
    }
    throw error;
  }
}
