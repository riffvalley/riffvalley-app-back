import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { AdminUpdateUserDto, UpdateUserDto } from '../dto/update-user.dto';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ValidRoles } from '../interfaces/valid-roles';

class UserQueryBuilderMock {
  select = jest.fn((columns: string[] | string) => {
    void columns;
    return this;
  });
  where = jest.fn((condition: string, parameters?: Record<string, unknown>) => {
    void condition;
    void parameters;
    return this;
  });
  getMany = jest.fn<Promise<User[]>, []>();
}

type UserRepositoryMock = {
  create: jest.MockedFunction<(user: Partial<User>) => User>;
  save: jest.MockedFunction<(user: User) => Promise<User>>;
  findOne: jest.MockedFunction<(options: object) => Promise<User | null>>;
  findOneByOrFail: jest.MockedFunction<
    (where: { id: string }) => Promise<User>
  >;
  update: jest.MockedFunction<
    (id: string, values: Partial<User>) => Promise<void>
  >;
  createQueryBuilder: jest.MockedFunction<() => UserQueryBuilderMock>;
};

type AccessLogRepositoryMock = {
  query: jest.MockedFunction<
    (query: string, parameters: readonly unknown[]) => Promise<unknown>
  >;
};

function makeUser(values: Partial<User>): User {
  return Object.assign(new User(), values);
}

describe('AuthService role and user flows', () => {
  let service: AuthService;
  let userRepository: UserRepositoryMock;
  let accessLogRepository: AccessLogRepositoryMock;
  let jwtService: {
    sign: jest.MockedFunction<(payload: JwtPayload) => string>;
  };

  beforeEach(() => {
    userRepository = {
      create: jest.fn((user) => makeUser(user)),
      save: jest.fn(async (user) => user),
      findOne: jest.fn(),
      findOneByOrFail: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => new UserQueryBuilderMock()),
    };
    accessLogRepository = { query: jest.fn().mockResolvedValue(undefined) };
    jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
    service = new AuthService(
      userRepository as never,
      accessLogRepository as never,
      {} as never,
      jwtService as never,
    );
  });

  it('registers as user and signs a singular role claim', async () => {
    const result = await service.create({
      email: 'new@example.test',
      username: 'new-user',
      password: 'Password1',
      image: 'avatar.png',
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.test',
        username: 'new-user',
        role: ValidRoles.user,
      }),
    );
    expect(result.role).toBe(ValidRoles.user);
    expect(result).toMatchObject({
      email: 'new@example.test',
      username: 'new-user',
      image: 'avatar.png',
    });
    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('password');
    expect(result.token).toBe('signed-token');
    expect(jwtService.sign).toHaveBeenCalledWith({
      username: 'new-user',
      id: undefined,
      role: ValidRoles.user,
    });
  });

  it.each(['role', 'roles', 'isActive', 'notes'])(
    'rejects client supplied %s during registration',
    async (field) => {
      await expect(
        service.create(
          Object.assign(new CreateUserDto(), {
            email: 'new@example.test',
            username: 'new-user',
            password: 'Password1',
            [field]:
              field === 'roles'
                ? [ValidRoles.superadmin]
                : ValidRoles.superadmin,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(userRepository.create).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    },
  );

  it('returns the persisted singular role in login response and JWT', async () => {
    const storedPassword = bcrypt.hashSync('Password1', 4);
    userRepository.findOne.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: storedPassword,
        role: ValidRoles.riffvalley,
        isActive: true,
      }),
    );

    const result = await service.login({
      username: 'listener',
      password: 'Password1',
    });

    expect(userRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ role: true }),
      }),
    );
    expect(result.role).toBe(ValidRoles.riffvalley);
    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('password');
    expect(jwtService.sign).toHaveBeenCalledWith({
      username: 'listener',
      id: 'user-1',
      role: ValidRoles.riffvalley,
    });
  });

  it('rejects an incorrect password with 401 semantics', async () => {
    userRepository.findOne.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
        role: ValidRoles.user,
        isActive: true,
      }),
    );

    await expect(
      service.login({ username: 'listener', password: 'WrongPass1' }),
    ).rejects.toMatchObject({ status: 401 });
    userRepository.findOne.mockResolvedValue(null);
    await expect(
      service.login({ username: 'missing-user', password: 'Password1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('filters usersRv at the riffvalley minimum, including inherited superadmin', async () => {
    const query = new UserQueryBuilderMock();
    query.getMany.mockResolvedValue([]);
    userRepository.createQueryBuilder.mockReturnValue(query);

    await service.findAllRv();

    expect(query.where).toHaveBeenCalledWith('user.role IN (:...roleValues)', {
      roleValues: [ValidRoles.riffvalley, ValidRoles.superadmin],
    });
  });

  it('filters a requested canonical role exactly and rejects unknown or array filters', async () => {
    const query = new UserQueryBuilderMock();
    query.getMany.mockResolvedValue([]);
    userRepository.createQueryBuilder.mockReturnValue(query);

    await service.findUsersByRole(ValidRoles.collaborator);
    expect(query.where).toHaveBeenCalledWith('user.role = :role', {
      role: ValidRoles.collaborator,
    });

    await expect(service.findUsersByRole('superUser')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('returns superusers using the preserved path query and the exact role', async () => {
    const query = new UserQueryBuilderMock();
    query.getMany.mockResolvedValue([]);
    userRepository.createQueryBuilder.mockReturnValue(query);

    await service.findSuperUsers();

    expect(query.where).toHaveBeenCalledWith('user.role = :role', {
      role: ValidRoles.superadmin,
    });
  });

  it('applies an allowed profile update and rejects privilege or admin fields', async () => {
    const currentUser = makeUser({
      id: 'user-1',
      username: 'before',
      role: ValidRoles.user,
      isActive: true,
    });
    userRepository.findOneByOrFail.mockResolvedValue(currentUser);

    await service.updateUser({ username: 'after' }, makeUser({ id: 'user-1' }));

    expect(currentUser).toMatchObject({
      id: 'user-1',
      username: 'after',
      role: ValidRoles.user,
      isActive: true,
    });

    for (const field of ['role', 'roles', 'isActive', 'id', 'notes']) {
      await expect(
        service.updateUser(
          Object.assign(new UpdateUserDto(), {
            [field]:
              field === 'roles'
                ? [ValidRoles.superadmin]
                : ValidRoles.superadmin,
          }),
          makeUser({ id: 'user-1' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('never serializes the updated profile password hash', async () => {
    const currentUser = makeUser({
      id: 'user-1',
      username: 'listener',
      email: 'listener@example.test',
      image: 'avatar.png',
      role: ValidRoles.user,
      isActive: true,
      password: undefined as string | undefined,
    });
    userRepository.findOneByOrFail.mockResolvedValue(currentUser);

    const result = await service.updateUser(
      { password: 'NewPassword1' },
      makeUser({ id: 'user-1' }),
    );
    const response = JSON.parse(JSON.stringify(result)) as Record<
      string,
      unknown
    >;

    expect(currentUser.password).toMatch(/^\$2[aby]\$/);
    expect(response).not.toHaveProperty('password');
    expect(response).toMatchObject({
      id: 'user-1',
      username: 'listener',
      email: 'listener@example.test',
      image: 'avatar.png',
      role: ValidRoles.user,
      isActive: true,
    });
  });

  it('never serializes an admin-updated password hash', async () => {
    const targetUser = makeUser({
      id: 'target-1',
      username: 'listener',
      email: 'listener@example.test',
      role: ValidRoles.user,
      isActive: true,
      password: undefined as string | undefined,
    });
    userRepository.findOne.mockResolvedValue(
      makeUser({
        id: 'admin-1',
        role: ValidRoles.superadmin,
        isActive: true,
      }),
    );
    userRepository.findOneByOrFail.mockResolvedValue(targetUser);

    const result = await service.updateUserSuperAdmin(
      'target-1',
      { password: 'NewPassword1' },
      makeUser({ id: 'admin-1' }),
    );
    const response = JSON.parse(JSON.stringify(result)) as Record<
      string,
      unknown
    >;

    expect(targetUser.password).toMatch(/^\$2[aby]\$/);
    expect(response).not.toHaveProperty('password');
    expect(response).toMatchObject({
      id: 'target-1',
      username: 'listener',
      email: 'listener@example.test',
      role: ValidRoles.user,
      isActive: true,
    });
  });

  it.each(Object.values(ValidRoles))(
    'allows a persisted superadmin to assign the canonical role %s',
    async (role) => {
      userRepository.findOne.mockResolvedValue(
        makeUser({
          id: 'admin-1',
          role: ValidRoles.superadmin,
          isActive: true,
        }),
      );
      userRepository.findOneByOrFail.mockResolvedValue(
        makeUser({
          id: 'target-1',
          role: ValidRoles.user,
        }),
      );

      const updated = await service.updateUserSuperAdmin(
        'target-1',
        Object.assign(new AdminUpdateUserDto(), { role }),
        makeUser({ id: 'admin-1' }),
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        select: { id: true, role: true, isActive: true },
      });
      expect(updated.role).toBe(role);
      expect(updated).not.toHaveProperty('roles');
    },
  );

  it.each([
    ['legacy value', 'superUser'],
    ['unknown value', 'owner'],
    ['array value', [ValidRoles.superadmin]],
    ['null value', null],
  ])('rejects an administrative assignment with a %s', async (_label, role) => {
    userRepository.findOne.mockResolvedValue(
      makeUser({
        id: 'admin-1',
        role: ValidRoles.superadmin,
        isActive: true,
      }),
    );
    userRepository.findOneByOrFail.mockResolvedValue(
      makeUser({
        id: 'target-1',
        role: ValidRoles.user,
      }),
    );

    await expect(
      service.updateUserSuperAdmin(
        'target-1',
        Object.assign(new AdminUpdateUserDto(), { role }),
        makeUser({ id: 'admin-1' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects legacy roles arrays in administrative updates', async () => {
    await expect(
      service.updateUserSuperAdmin(
        'target-1',
        Object.assign(new AdminUpdateUserDto(), {
          roles: [ValidRoles.superadmin],
        }),
        makeUser({ id: 'admin-1' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([ValidRoles.user, ValidRoles.collaborator, ValidRoles.riffvalley])(
    'denies admin role assignment to persisted %s despite a forged JWT role',
    async (persistedRole) => {
      userRepository.findOne.mockResolvedValue(
        makeUser({
          id: 'actor-1',
          role: persistedRole,
          isActive: true,
        }),
      );

      await expect(
        service.updateUserSuperAdmin(
          'target-1',
          { role: ValidRoles.superadmin },
          makeUser({ id: 'actor-1', role: ValidRoles.superadmin }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userRepository.findOneByOrFail).not.toHaveBeenCalled();
    },
  );

  it('denies inactive or non-canonical persisted actors for activation and deletion', async () => {
    const actor = makeUser({
      id: 'admin-1',
      role: ValidRoles.user,
      isActive: true,
    });
    Reflect.set(actor, 'role', 'admin');
    userRepository.findOne.mockResolvedValue(actor);

    await expect(
      service.setActive('target-1', false, makeUser({ id: 'admin-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.remove('target-1', makeUser({ id: 'admin-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
