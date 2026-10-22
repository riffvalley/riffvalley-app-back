import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ILike } from 'typeorm';
import { UsersService } from '../users.service';
import { User } from '../../auth/entities/user.entity';
import { CreateUserDto } from '../../auth/dto/create-user.dto';
import {
  AdminUpdateUserDto,
  UpdateUserDto,
} from '../../auth/dto/update-user.dto';
import { ValidRoles } from '../../auth/interfaces/valid-roles';

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
  addSelect = jest.fn(() => this);
  leftJoin = jest.fn(() => this);
  groupBy = jest.fn(() => this);
  orderBy = jest.fn(() => this);
  addOrderBy = jest.fn(() => this);
  limit = jest.fn(() => this);
  offset = jest.fn(() => this);
  having = jest.fn(() => this);
  andWhere = jest.fn(() => this);
  getMany = jest.fn<Promise<User[]>, []>();
  getRawMany = jest.fn<Promise<unknown[]>, []>();
  getCount = jest.fn<Promise<number>, []>();
}

type UserRepositoryMock = {
  create: jest.MockedFunction<(user: Partial<User>) => User>;
  save: jest.MockedFunction<(user: User) => Promise<User>>;
  find: jest.MockedFunction<(options: object) => Promise<User[]>>;
  findOne: jest.MockedFunction<(options: object) => Promise<User | null>>;
  findOneBy: jest.MockedFunction<
    (where: { id: string }) => Promise<User | null>
  >;
  findOneByOrFail: jest.MockedFunction<
    (where: { id: string }) => Promise<User>
  >;
  update: jest.MockedFunction<
    (id: string, values: Partial<User>) => Promise<void>
  >;
  remove: jest.MockedFunction<(user: User) => Promise<User>>;
  count: jest.MockedFunction<(options?: object) => Promise<number>>;
  query: jest.MockedFunction<(query: string) => Promise<unknown[]>>;
  createQueryBuilder: jest.MockedFunction<() => UserQueryBuilderMock>;
};

function makeUser(values: Partial<User>): User {
  return Object.assign(new User(), values);
}

describe('UsersService account and user flows', () => {
  let service: UsersService;
  let userRepository: UserRepositoryMock;
  beforeEach(() => {
    userRepository = {
      create: jest.fn((user) => makeUser(user)),
      save: jest.fn(async (user) => user),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      findOneByOrFail: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn(async (user) => user),
      count: jest.fn().mockResolvedValue(0),
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => new UserQueryBuilderMock()),
    };
    service = new UsersService(userRepository as never);
  });

  it('creates a user account with the default singular role and no password field', async () => {
    const result = await service.createAccount({
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
  });

  it('returns the administrative user projection in creation order without hashes', async () => {
    const users = [makeUser({ id: 'user-1', username: 'listener' })];
    userRepository.find.mockResolvedValue(users);

    await expect(service.findAll()).resolves.toEqual(users);
    expect(userRepository.find).toHaveBeenCalledWith({
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
  });

  it.each(['role', 'roles', 'isActive', 'notes'])(
    'rejects client supplied %s during registration',
    async (field) => {
      await expect(
        service.createAccount(
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

    await service.updateUser({ username: 'after' }, 'user-1');

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
          'user-1',
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
      'user-1',
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
      'admin-1',
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
        'admin-1',
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
        'admin-1',
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
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it('looks up authentication credentials and only returns the selected identity fields', async () => {
    const user = makeUser({ id: 'user-1', username: 'Listener' });
    userRepository.findOne.mockResolvedValue(user);

    await expect(service.findCredentialsByUsername('listener')).resolves.toBe(
      user,
    );
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { username: ILike('listener') },
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
  });

  it('returns null for a missing identity and reports whether an alias is taken', async () => {
    userRepository.findOneBy.mockResolvedValue(null);
    userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeUser({ username: 'listener' }));

    await expect(service.findById('missing')).resolves.toBeNull();
    await expect(service.isUsernameTaken('available')).resolves.toBe(false);
    await expect(service.isUsernameTaken('listener')).resolves.toBe(true);
    expect(userRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { username: 'available' },
    });
  });

  it('selects role and dashboard preferences explicitly for session restoration', async () => {
    const profile = makeUser({
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.user,
      isActive: true,
      dashboardConfig: null,
      mobileDashboardConfig: [{ id: 'news', enabled: false }],
      dashboardButtonsEnabled: false,
    });
    userRepository.findOne.mockResolvedValue(profile);

    await expect(service.findSessionProfileById('user-1')).resolves.toBe(
      profile,
    );
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        image: true,
        dashboardConfig: true,
        mobileDashboardConfig: true,
        dashboardButtonsEnabled: true,
      },
    });
  });

  it('provides the minimal current id, role, and active state for authorization callers', async () => {
    const identity = {
      id: 'user-1',
      role: ValidRoles.collaborator,
      isActive: true,
    };
    userRepository.findOne.mockResolvedValue(makeUser(identity));

    await expect(service.findIdentityById('user-1')).resolves.toEqual(identity);
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, role: true, isActive: true },
    });
  });

  it('exposes the account count through the Users ownership boundary', async () => {
    userRepository.count.mockResolvedValue(12);

    await expect(service.countUsers()).resolves.toBe(12);
    expect(userRepository.count).toHaveBeenCalledTimes(1);
  });

  it('maps missing account lookups to the existing not found response', async () => {
    userRepository.findOneByOrFail.mockRejectedValue(new Error('missing'));

    await expect(service.findOne('missing')).rejects.toMatchObject({
      status: 404,
      message: 'User with id missing not found',
    });
  });

  it('activates, deactivates and removes a user after validating the persisted superadmin', async () => {
    userRepository.findOne.mockResolvedValue(
      makeUser({ id: 'admin-1', role: ValidRoles.superadmin, isActive: true }),
    );
    const targetUser = makeUser({ id: 'target-1', isActive: true });
    userRepository.findOneByOrFail.mockResolvedValue(targetUser);

    const deactivated = await service.setActive('target-1', false, 'admin-1');
    expect(deactivated.isActive).toBe(false);
    expect(userRepository.save).toHaveBeenCalledWith(targetUser);

    userRepository.findOneByOrFail.mockResolvedValue(targetUser);
    const activated = await service.setActive('target-1', true, 'admin-1');
    expect(activated.isActive).toBe(true);

    userRepository.findOneByOrFail.mockResolvedValue(targetUser);
    await expect(service.remove('target-1', 'admin-1')).resolves.toBe(
      targetUser,
    );
    expect(userRepository.remove).toHaveBeenCalledWith(targetUser);
  });

  it('translates unique persistence errors and propagates other database failures', async () => {
    const duplicate = Object.assign(new Error('duplicate'), {
      code: '23505',
      detail: 'username already exists',
    });
    userRepository.save.mockRejectedValueOnce(duplicate);
    await expect(
      service.createAccount({
        email: 'new@example.test',
        username: 'taken',
        password: 'Password1',
        image: '',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'username already exists',
    });

    const databaseFailure = new Error('database unavailable');
    userRepository.save.mockRejectedValueOnce(databaseFailure);
    await expect(
      service.createAccount({
        email: 'new@example.test',
        username: 'new-user',
        password: 'Password1',
        image: '',
      }),
    ).rejects.toBe(databaseFailure);
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
          'actor-1',
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
      service.setActive('target-1', false, 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('target-1', 'admin-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
