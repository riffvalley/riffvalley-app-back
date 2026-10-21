import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { META_MINIMUM_ROLE } from '../../decorators/role-protected.decorator';
import { isValidRole, roleMeetsMinimum } from '../../interfaces/valid-roles';
import { UsersService } from '../../../users/users.service';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minimumRole = this.reflector.getAllAndOverride<unknown>(
      META_MINIMUM_ROLE,
      [context.getHandler(), context.getClass()],
    );

    if (minimumRole === undefined) return true;
    if (!isValidRole(minimumRole)) {
      throw new ForbiddenException('Invalid minimum role');
    }

    const req = context
      .switchToHttp()
      .getRequest<{ user?: { id?: string; username?: string } }>();
    const user = req.user;
    if (!user?.id) throw new BadRequestException('User not found');

    const userRep = await this.usersService.findIdentityById(user.id);

    if (!userRep) throw new BadRequestException('User not found');
    if (!userRep.isActive) {
      throw new UnauthorizedException(
        'User is inactive, talk with an administrator',
      );
    }
    if (roleMeetsMinimum(userRep.role, minimumRole)) return true;

    throw new ForbiddenException(`User ${user.username} is not authorized`);
  }
}
