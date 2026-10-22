import { ValidRoles } from './valid-roles';

export interface JwtPayload {
  username: string;
  id: string;
  role: ValidRoles;
  clientType?: 'app' | 'wiki';
}
