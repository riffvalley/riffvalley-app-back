import { applyDecorators, UseGuards } from '@nestjs/common';
import { ValidRoles } from '../interfaces/valid-roles';
import { RoleProtected } from './role-protected.decorator';
import { AuthGuard } from '@nestjs/passport';
import { UserRoleGuard } from '../guards/user-role/user-role.guard';

export function Auth(minimumRole?: ValidRoles) {
  return applyDecorators(
    RoleProtected(minimumRole),
    UseGuards(AuthGuard(), UserRoleGuard),
  );
}
