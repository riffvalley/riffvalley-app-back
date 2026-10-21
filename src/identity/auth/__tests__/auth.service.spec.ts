import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { User } from '../entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ValidRoles } from '../interfaces/valid-roles';
import { UsersService } from '../../users/users.service';

function makeUser(values: Partial<User>): User {
  return Object.assign(new User(), values);
}

describe('AuthService authentication', () => {
  const usersService = {
    createAccount: jest.fn(),
    findCredentialsByUsername: jest.fn(),
    recordLogin: jest.fn(),
  } satisfies Pick<
    UsersService,
    'createAccount' | 'findCredentialsByUsername' | 'recordLogin'
  >;
  const jwtService = {
    sign: jest.fn((payload: JwtPayload) => {
      void payload;
      return 'signed-token';
    }),
  };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.recordLogin.mockResolvedValue(undefined);
    service = new AuthService(usersService as never, jwtService as never);
  });

  it('coordinates public account creation with Users and adds the existing JWT', async () => {
    usersService.createAccount.mockResolvedValue(
      Object.assign(new User(), {
        id: 'user-1',
        username: 'listener',
        role: ValidRoles.user,
      }),
    );

    await expect(
      service.create({
        email: 'listener@example.test',
        username: 'listener',
        password: 'Password1',
        image: '',
      }),
    ).resolves.toMatchObject({
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.user,
      token: 'signed-token',
    });
    expect(usersService.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'listener' }),
    );
    expect(jwtService.sign).toHaveBeenCalledWith({
      username: 'listener',
      id: 'user-1',
      role: ValidRoles.user,
    });
  });

  it('validates credentials through Users and preserves the login payload and claims', async () => {
    usersService.findCredentialsByUsername.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
        role: ValidRoles.riffvalley,
        image: 'avatar.png',
        dashboardConfig: null,
        mobileDashboardConfig: null,
        dashboardButtonsEnabled: false,
      }),
    );

    const response = await service.login({
      username: 'listener',
      password: 'Password1',
    });

    expect(response).toMatchObject({
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.riffvalley,
      image: 'avatar.png',
      token: 'signed-token',
    });
    expect(response).not.toHaveProperty('password');
    expect(usersService.recordLogin).toHaveBeenCalledWith('user-1');
    expect(jwtService.sign).toHaveBeenCalledWith({
      username: 'listener',
      id: 'user-1',
      role: ValidRoles.riffvalley,
    });
  });

  it('returns the same unauthorized response for missing users and wrong passwords', async () => {
    usersService.findCredentialsByUsername.mockResolvedValue(null);
    await expect(
      service.login({ username: 'missing', password: 'Password1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    usersService.findCredentialsByUsername.mockResolvedValue(
      makeUser({
        id: 'user-1',
        username: 'listener',
        password: bcrypt.hashSync('Password1', 4),
      }),
    );
    await expect(
      service.login({ username: 'listener', password: 'WrongPass1' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(usersService.recordLogin).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
