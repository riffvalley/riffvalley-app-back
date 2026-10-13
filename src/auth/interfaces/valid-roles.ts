export enum ValidRoles {
  user = 'user',
  collaborator = 'collaborator',
  riffvalley = 'riffvalley',
  superadmin = 'superadmin',
}

const ROLE_LEVEL: Record<ValidRoles, number> = {
  [ValidRoles.user]: 0,
  [ValidRoles.collaborator]: 1,
  [ValidRoles.riffvalley]: 2,
  [ValidRoles.superadmin]: 3,
};

export function isValidRole(role: unknown): role is ValidRoles {
  return (
    typeof role === 'string' &&
    Object.prototype.hasOwnProperty.call(ROLE_LEVEL, role)
  );
}

export function roleMeetsMinimum(
  role: unknown,
  minimumRole: ValidRoles,
): role is ValidRoles {
  return isValidRole(role) && ROLE_LEVEL[role] >= ROLE_LEVEL[minimumRole];
}
