import { SetMetadata } from '@nestjs/common';
import { ValidRoles } from '../interfaces/valid-roles';

export const META_MINIMUM_ROLE = 'minimumRole';

export const RoleProtected = (minimumRole?: ValidRoles) => {
  return SetMetadata(META_MINIMUM_ROLE, minimumRole);
};
