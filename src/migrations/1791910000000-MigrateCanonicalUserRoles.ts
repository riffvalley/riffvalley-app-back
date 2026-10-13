import { MigrationInterface, QueryRunner } from 'typeorm';

type UserRolesRow = {
  id: string;
  roles: string[] | null;
};

type SnapshotRow = {
  user_id: string;
  original_roles: string[];
  migrated_roles: string[];
};

const CANONICAL_ROLES = new Set([
  'user',
  'collaborator',
  'riffvalley',
  'superadmin',
]);
const RECOGNIZED_ROLES = new Set([
  ...CANONICAL_ROLES,
  'babyUser',
  'admin',
  'superUser',
  'riffValley',
]);
const ROLE_RENAMES: Record<string, string> = {
  babyUser: 'user',
  riffValley: 'riffvalley',
  superUser: 'superadmin',
};
const PRIVILEGED_ROLE_SOURCES: Record<string, string[]> = {
  riffvalley: ['riffvalley', 'riffValley'],
  superadmin: ['superadmin', 'superUser'],
};
// Every role-gated allowlist in the approved R.2 matrix uses only these two
// privileged roles. `user` and `collaborator` are never inferred as grants.
const LEGACY_ROLES = new Set(['babyUser', 'admin', 'superUser', 'riffValley']);
const OLD_USER_SURVIVORS = new Set(['riffValley', 'superUser']);
const SNAPSHOT_TABLE = 'user_roles_migration_snapshot_1791910000000';

/**
 * Converts the persisted roles array to the R.2 canonical contract.
 *
 * Run transactionally. The snapshot intentionally stores only the user UUID
 * and original/converted role arrays so `down` can restore exact values.
 */
export class MigrateCanonicalUserRoles1791910000000
  implements MigrationInterface
{
  name = 'MigrateCanonicalUserRoles1791910000000';
  transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE');
    const users = (await queryRunner.query(
      'SELECT "id", "roles" FROM "users" ORDER BY "id" FOR UPDATE',
    )) as UserRolesRow[];

    const plans: Array<{
      id: string;
      originalRoles: string[];
      migratedRoles: string[];
    }> = [];
    const blockers: string[] = [];

    for (const user of users) {
      try {
        const migratedRoles = this.mapRoles(user.id, user.roles);
        plans.push({
          id: user.id,
          originalRoles: user.roles as string[],
          migratedRoles,
        });
      } catch (error) {
        blockers.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (blockers.length > 0) {
      const sample = blockers.slice(0, 20).join('; ');
      const more =
        blockers.length > 20 ? `; y ${blockers.length - 20} más` : '';
      throw new Error(
        `Migración de roles cancelada: ${blockers.length} cuenta(s) requieren revisión: ${sample}${more}`,
      );
    }

    if (await queryRunner.hasTable(SNAPSHOT_TABLE)) {
      throw new Error(
        `Migración de roles cancelada: ya existe ${SNAPSHOT_TABLE}; revisar estado antes de reintentar`,
      );
    }

    const changedPlans = plans.filter(
      ({ originalRoles, migratedRoles }) =>
        !this.arraysEqual(originalRoles, migratedRoles),
    );

    await queryRunner.query(
      `CREATE TABLE "${SNAPSHOT_TABLE}" ("user_id" uuid PRIMARY KEY, "original_roles" text[] NOT NULL, "migrated_roles" text[] NOT NULL)`,
    );

    for (const plan of changedPlans) {
      await queryRunner.query(
        `INSERT INTO "${SNAPSHOT_TABLE}" ("user_id", "original_roles", "migrated_roles") VALUES ($1, $2::text[], $3::text[])`,
        [plan.id, plan.originalRoles, plan.migratedRoles],
      );
    }

    for (const plan of changedPlans) {
      const result = (await queryRunner.query(
        'UPDATE "users" SET "roles" = $1::text[] WHERE "id" = $2',
        [plan.migratedRoles, plan.id],
      )) as { rowCount?: number };

      if (result?.rowCount !== 1) {
        throw new Error(
          `Migración de roles cancelada: no se pudo actualizar exactamente una fila para la cuenta ${plan.id}`,
        );
      }
    }

    const usersAfter = (await queryRunner.query(
      'SELECT "id", "roles" FROM "users" ORDER BY "id" FOR UPDATE',
    )) as UserRolesRow[];
    this.verifyPostMigration(users, usersAfter, plans);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(SNAPSHOT_TABLE))) {
      throw new Error(
        `Rollback de roles cancelado: falta el snapshot ${SNAPSHOT_TABLE}; restaurar desde el backup verificado`,
      );
    }

    await queryRunner.query('LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE');
    const snapshots = (await queryRunner.query(
      `SELECT "user_id", "original_roles", "migrated_roles" FROM "${SNAPSHOT_TABLE}" ORDER BY "user_id" FOR UPDATE`,
    )) as SnapshotRow[];
    const ids = snapshots.map(({ user_id }) => user_id);
    const currentUsers = ids.length
      ? ((await queryRunner.query(
          'SELECT "id", "roles" FROM "users" WHERE "id" = ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',
          [ids],
        )) as UserRolesRow[])
      : [];
    const currentById = new Map(currentUsers.map((user) => [user.id, user]));
    const blockers: string[] = [];

    for (const snapshot of snapshots) {
      const current = currentById.get(snapshot.user_id);
      if (!current) {
        blockers.push(`falta la cuenta ${snapshot.user_id}`);
      } else if (!this.arraysEqual(current.roles, snapshot.migrated_roles)) {
        blockers.push(
          `cambiaron los roles de la cuenta ${snapshot.user_id} después de migrar`,
        );
      }
    }

    if (blockers.length > 0) {
      throw new Error(
        `Rollback de roles cancelado para evitar sobrescribir cambios: ${blockers.slice(0, 20).join('; ')}`,
      );
    }

    for (const snapshot of snapshots) {
      const result = (await queryRunner.query(
        'UPDATE "users" SET "roles" = $1::text[] WHERE "id" = $2',
        [snapshot.original_roles, snapshot.user_id],
      )) as { rowCount?: number };

      if (result?.rowCount !== 1) {
        throw new Error(
          `Rollback de roles cancelado: no se pudo restaurar exactamente una fila para la cuenta ${snapshot.user_id}`,
        );
      }
    }

    await queryRunner.query(`DROP TABLE "${SNAPSHOT_TABLE}"`);
  }

  private mapRoles(userId: string, roles: string[] | null): string[] {
    if (!Array.isArray(roles)) {
      throw new Error(`cuenta ${userId}: roles es NULL o no es un array`);
    }
    if (roles.length === 0) {
      throw new Error(`cuenta ${userId}: roles está vacío`);
    }

    const seen = new Set<string>();
    for (const role of roles) {
      if (seen.has(role)) {
        throw new Error(`cuenta ${userId}: rol duplicado ${role}`);
      }
      seen.add(role);

      if (!RECOGNIZED_ROLES.has(role)) {
        throw new Error(`cuenta ${userId}: rol desconocido ${role}`);
      }
    }

    // `user` in the source array is the legacy value. Resolve it against the
    // original row before mapping babyUser to the canonical `user` value.
    if (seen.has('user')) {
      if (roles.some((role) => role !== 'user' && CANONICAL_ROLES.has(role))) {
        throw new Error(
          `cuenta ${userId}: mezcla ambigua de user legacy con roles canónicos`,
        );
      }
      if (!roles.some((role) => OLD_USER_SURVIVORS.has(role))) {
        throw new Error(
          `cuenta ${userId}: antiguo user sin riffValley/superUser superviviente`,
        );
      }
    }

    const migratedRoles = roles
      .filter((role) => role !== 'admin' && role !== 'user')
      .map((role) => ROLE_RENAMES[role] ?? role);

    const mappedSeen = new Set<string>();
    for (const role of migratedRoles) {
      if (mappedSeen.has(role)) {
        throw new Error(
          `cuenta ${userId}: la normalización produciría el duplicado ${role}`,
        );
      }
      mappedSeen.add(role);
    }

    if (seen.has('admin') && migratedRoles.length === 0) {
      throw new Error(
        `cuenta ${userId}: admin quedaría sin otro rol canónico válido`,
      );
    }
    if (migratedRoles.length === 0) {
      throw new Error(`cuenta ${userId}: la conversión dejaría roles vacío`);
    }

    for (const role of migratedRoles) {
      if (!CANONICAL_ROLES.has(role)) {
        throw new Error(
          `cuenta ${userId}: la conversión produciría el rol no canónico ${role}`,
        );
      }
      if (role === 'user' && !seen.has('babyUser')) {
        throw new Error(
          `cuenta ${userId}: user canónico sin origen babyUser inequívoco`,
        );
      }
      if (role === 'collaborator' && !seen.has('collaborator')) {
        throw new Error(
          `cuenta ${userId}: la conversión no puede asignar collaborator`,
        );
      }
      const approvedSources = PRIVILEGED_ROLE_SOURCES[role];
      if (
        approvedSources &&
        !roles.some((source) => approvedSources.includes(source))
      ) {
        throw new Error(
          `cuenta ${userId}: ${role} no procede de un rol autorizado por R.2`,
        );
      }
    }

    return migratedRoles;
  }

  private verifyPostMigration(
    usersBefore: UserRolesRow[],
    usersAfter: UserRolesRow[],
    plans: Array<{ id: string; migratedRoles: string[] }>,
  ): void {
    if (usersBefore.length !== usersAfter.length) {
      throw new Error(
        `Migración de roles cancelada: cambió el número de cuentas (${usersBefore.length} → ${usersAfter.length})`,
      );
    }

    const beforeIds = new Set(usersBefore.map(({ id }) => id));
    const usersBeforeById = new Map(usersBefore.map((user) => [user.id, user]));
    const plansById = new Map(plans.map((plan) => [plan.id, plan]));

    for (const user of usersAfter) {
      if (!beforeIds.has(user.id)) {
        throw new Error(
          `Migración de roles cancelada: apareció una cuenta no examinada (${user.id})`,
        );
      }
      if (!Array.isArray(user.roles) || user.roles.length === 0) {
        throw new Error(
          `Migración de roles cancelada: la cuenta ${user.id} no conserva roles válidos`,
        );
      }

      const plan = plansById.get(user.id);
      if (!plan || !this.arraysEqual(user.roles, plan.migratedRoles)) {
        throw new Error(
          `Migración de roles cancelada: resultado inesperado para la cuenta ${user.id}`,
        );
      }

      for (const role of user.roles) {
        if (!CANONICAL_ROLES.has(role) || LEGACY_ROLES.has(role)) {
          throw new Error(
            `Migración de roles cancelada: rol no permitido ${role} en la cuenta ${user.id}`,
          );
        }
      }

      const original = usersBeforeById.get(user.id)?.roles;
      if (
        user.roles.includes('collaborator') &&
        !original?.includes('collaborator')
      ) {
        throw new Error(
          `Migración de roles cancelada: se asignó collaborator a la cuenta ${user.id}`,
        );
      }
    }
  }

  private arraysEqual(left: string[] | null, right: string[] | null): boolean {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
}
