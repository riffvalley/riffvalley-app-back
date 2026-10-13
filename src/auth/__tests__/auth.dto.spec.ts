import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUpdateUserDto, UpdateUserDto } from '../dto/update-user.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { ValidRoles } from '../interfaces/valid-roles';

const validationOptions = { whitelist: true, forbidNonWhitelisted: true };

describe('Auth DTO role boundaries', () => {
  it.each(['role', 'roles'])('rejects registration field %s', async (field) => {
    const dto = plainToInstance(CreateUserDto, {
      email: 'new@example.test',
      username: 'new-user',
      password: 'Password1',
      [field]:
        field === 'roles' ? [ValidRoles.superadmin] : ValidRoles.superadmin,
    });

    const errors = await validate(dto, validationOptions);
    expect(errors.map(({ property }) => property)).toContain(field);
  });

  it.each(['role', 'roles', 'isActive', 'id', 'notes', 'createdAt'])(
    'rejects %s on a profile update',
    async (field) => {
      const dto = plainToInstance(UpdateUserDto, {
        [field]: field === 'roles' ? [ValidRoles.superadmin] : 'forged',
      });
      const errors = await validate(dto, validationOptions);
      expect(errors.map(({ property }) => property)).toContain(field);
    },
  );

  it.each(Object.values(ValidRoles))(
    'accepts canonical administrative role %s',
    async (role) => {
      const dto = plainToInstance(AdminUpdateUserDto, { role });
      await expect(validate(dto, validationOptions)).resolves.toHaveLength(0);
    },
  );

  it.each([
    ['legacy value', 'superUser'],
    ['unknown value', 'owner'],
    ['array value', [ValidRoles.superadmin]],
    ['null value', null],
  ])('rejects administrative role %s', async (_label, role) => {
    const dto = plainToInstance(AdminUpdateUserDto, { role });
    const errors = await validate(dto, validationOptions);
    expect(errors.map(({ property }) => property)).toContain('role');
  });
});
