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
    const user = { id: 'user-1', username: 'listener', isActive: true } as User;
    usersService.findById.mockResolvedValue(user);
    const payload: JwtPayload = {
      id: user.id,
      username: user.username,
      role: ValidRoles.user,
    };

    await expect(strategy.validate(payload)).resolves.toBe(user);
    expect(usersService.findById).toHaveBeenCalledWith('user-1');
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
