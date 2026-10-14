import * as bcrypt from 'bcrypt';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { ValidRoles } from '../interfaces/valid-roles';

describe('AuthService role and user flows', () => {
  let service: AuthService;
  let userRepository: any;
  let accessLogRepository: any;
  let jwtService: any;

  beforeEach(() => {
    userRepository = {
      create: jest.fn((user) => user),
      save: jest.fn(async (user) => user),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneByOrFail: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    accessLogRepository = { query: jest.fn().mockResolvedValue(undefined) };
    jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
    service = new AuthService(
      userRepository,
      accessLogRepository,
      {} as any,
      jwtService,
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
        service.create({
          email: 'new@example.test',
          username: 'new-user',
          password: 'Password1',
          [field]:
            field === 'roles' ? [ValidRoles.superadmin] : ValidRoles.superadmin,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(userRepository.create).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    },
  );

  it('returns the persisted singular role in login response and JWT', async () => {
    const storedPassword = bcrypt.hashSync('Password1', 4);
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      username: 'listener',
      password: storedPassword,
      role: ValidRoles.riffvalley,
      isActive: true,
    });

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

  it('filters usersRv at the riffvalley minimum, including inherited superadmin', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    userRepository.createQueryBuilder.mockReturnValue(query);

    await service.findAllRv();

    expect(query.where).toHaveBeenCalledWith('user.role IN (:...roleValues)', {
      roleValues: [ValidRoles.riffvalley, ValidRoles.superadmin],
    });
  });

  it('filters a requested canonical role exactly and rejects unknown or array filters', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    userRepository.createQueryBuilder.mockReturnValue(query);

    await service.findUsersByRole(ValidRoles.collaborator);
    expect(query.where).toHaveBeenCalledWith('user.role = :role', {
      role: ValidRoles.collaborator,
    });

    await expect(service.findUsersByRole('superUser')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.findUsersByRole([ValidRoles.riffvalley] as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('returns superusers using the preserved path query and the exact role', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    userRepository.createQueryBuilder.mockReturnValue(query);

    await service.findSuperUsers();

    expect(query.where).toHaveBeenCalledWith('user.role = :role', {
      role: ValidRoles.superadmin,
    });
  });

  it('applies an allowed profile update and rejects privilege or admin fields', async () => {
    const currentUser = {
      id: 'user-1',
      username: 'before',
      role: ValidRoles.user,
      isActive: true,
    };
    userRepository.findOneByOrFail.mockResolvedValue(currentUser);

    await service.updateUser({ username: 'after' }, { id: 'user-1' } as any);

    expect(currentUser).toMatchObject({
      id: 'user-1',
      username: 'after',
      role: ValidRoles.user,
      isActive: true,
    });

    for (const field of ['role', 'roles', 'isActive', 'id', 'notes']) {
      await expect(
        service.updateUser(
          {
            [field]:
              field === 'roles'
                ? [ValidRoles.superadmin]
                : ValidRoles.superadmin,
          } as any,
          { id: 'user-1' } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it.each(Object.values(ValidRoles))(
    'allows a persisted superadmin to assign the canonical role %s',
    async (role) => {
      userRepository.findOne.mockResolvedValue({
        id: 'admin-1',
        role: ValidRoles.superadmin,
        isActive: true,
      });
      userRepository.findOneByOrFail.mockResolvedValue({
        id: 'target-1',
        role: ValidRoles.user,
      });

      const updated = await service.updateUserSuperAdmin('target-1', { role }, {
        id: 'admin-1',
      } as any);

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
    userRepository.findOne.mockResolvedValue({
      id: 'admin-1',
      role: ValidRoles.superadmin,
      isActive: true,
    });
    userRepository.findOneByOrFail.mockResolvedValue({
      id: 'target-1',
      role: ValidRoles.user,
    });

    await expect(
      service.updateUserSuperAdmin(
        'target-1',
        { role } as any,
        { id: 'admin-1' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects legacy roles arrays in administrative updates', async () => {
    await expect(
      service.updateUserSuperAdmin(
        'target-1',
        { roles: [ValidRoles.superadmin] } as any,
        { id: 'admin-1' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([ValidRoles.user, ValidRoles.collaborator, ValidRoles.riffvalley])(
    'denies admin role assignment to persisted %s despite a forged JWT role',
    async (persistedRole) => {
      userRepository.findOne.mockResolvedValue({
        id: 'actor-1',
        role: persistedRole,
        isActive: true,
      });

      await expect(
        service.updateUserSuperAdmin(
          'target-1',
          { role: ValidRoles.superadmin },
          { id: 'actor-1', role: ValidRoles.superadmin } as any,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userRepository.findOneByOrFail).not.toHaveBeenCalled();
    },
  );

  it('denies inactive or non-canonical persisted actors for activation and deletion', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
      isActive: true,
    });

    await expect(
      service.setActive('target-1', false, { id: 'admin-1' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.remove('target-1', { id: 'admin-1' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
