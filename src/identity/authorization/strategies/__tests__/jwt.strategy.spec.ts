import { UnauthorizedException } from '@nestjs/common';
import { User } from '../../../auth/entities/user.entity';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { ValidRoles } from '../../interfaces/valid-roles';
import { JwtStrategy } from '../jwt.strategy';

describe('JwtStrategy', () => {
  const usersService = {
    findById: jest.fn<Promise<User | null>, [string]>(),
  };
  const configService = {
    get: jest.fn().mockReturnValue('test-secret-only'),
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(usersService as never, configService as never);
  });

  it('looks up the JWT subject by id and accepts an active current user', async () => {
    const user = {
      id: 'user-1',
      username: 'listener',
      isActive: true,
      credentialVersion: 0,
    } as User;
    usersService.findById.mockResolvedValue(user);
    const payload: JwtPayload = {
      id: user.id,
      username: user.username,
      role: ValidRoles.user,
    };

    await expect(strategy.validate(payload)).resolves.toBe(user);
    expect(usersService.findById).toHaveBeenCalledWith('user-1');
  });

  it('preserves the signed client attribution on the authenticated user', async () => {
    const user = {
      id: 'user-1',
      username: 'listener',
      isActive: true,
      credentialVersion: 0,
    } as User;
    usersService.findById.mockResolvedValue(user);

    const authenticatedUser = await strategy.validate({
      id: user.id,
      username: user.username,
      role: ValidRoles.user,
      clientType: 'app',
    });

    expect(authenticatedUser).toMatchObject({ id: user.id, clientType: 'app' });
    expect(Object.keys(authenticatedUser)).not.toContain('clientType');
  });

  it('accepts legacy JWTs until the account credential version is changed', async () => {
    const user = { id: 'user-1', isActive: true, credentialVersion: 0 } as User;
    usersService.findById.mockResolvedValue(user);

    await expect(
      strategy.validate({
        id: user.id,
        username: 'listener',
        role: ValidRoles.user,
      }),
    ).resolves.toBe(user);

    user.credentialVersion = 1;
    await expect(
      strategy.validate({
        id: user.id,
        username: 'listener',
        role: ValidRoles.user,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a stale versioned JWT immediately using the existing user lookup', async () => {
    const user = { id: 'user-1', isActive: true, credentialVersion: 3 } as User;
    usersService.findById.mockResolvedValue(user);

    await expect(
      strategy.validate({
        id: user.id,
        username: 'listener',
        role: ValidRoles.user,
        credentialVersion: 2,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findById).toHaveBeenCalledTimes(1);
  });

  it('rejects a JWT whose user has been deleted', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({
        id: 'deleted-user',
        username: 'listener',
        role: ValidRoles.user,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a JWT whose current database user is inactive', async () => {
    usersService.findById.mockResolvedValue({ isActive: false } as User);

    await expect(
      strategy.validate({
        id: 'inactive-user',
        username: 'listener',
        role: ValidRoles.superadmin,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      strategy.validate({
        id: 'inactive-user',
        username: 'listener',
        role: ValidRoles.superadmin,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
