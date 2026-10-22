import { MigrationInterface, QueryRunner } from 'typeorm';

type UserRolesRow = {
  id: string;
  roles: string[] | null;
};

type UserRoleRow = {
  id: string;
  role: string;
};

type HistoricalSnapshotRow = {
  user_id: string;
  original_roles: string[];
  migrated_roles: string[];
};

type UserSnapshotRow = {
  user_id: string;
  original_roles: string[];
  migrated_role: string;
};

type SourceColumn = {
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  column_comment: string | null;
};

type SourceConstraint = {
  name: string;
  definition: string;
};

type SourceIndex = {
  definition: string;
};

type SchemaSnapshot = {
  original_roles_default: string | null;
  original_roles_nullable: boolean;
  original_roles_comment: string | null;
  original_constraints: SourceConstraint[];
  original_indexes: SourceIndex[];
};

function affectedRows(result: unknown): number | undefined {
  if (Array.isArray(result)) {
    if (result.length === 2 && typeof result[1] === 'number') {
      return result[1];
    }
    return result.length;
  }

  if (result && typeof result === 'object' && 'affected' in result) {
    const affected = (result as { affected?: unknown }).affected;
    return typeof affected === 'number' ? affected : undefined;
  }

  return undefined;
}

const MIGRATION_TIMESTAMP = '1791920000000';
const SNAPSHOT_TABLE = `user_roles_single_snapshot_${MIGRATION_TIMESTAMP}`;
const SCHEMA_SNAPSHOT_TABLE = `user_roles_single_schema_snapshot_${MIGRATION_TIMESTAMP}`;
const HISTORICAL_SNAPSHOT_TABLE = 'user_roles_migration_snapshot_1791910000000';
const ROLE_CONSTRAINT = 'CHK_users_role_canonical_1791920000000';

const CANONICAL_ROLES = ['user', 'collaborator', 'riffvalley', 'superadmin'];
const ROLE_LEVEL: Record<string, number> = {
  user: 0,
  collaborator: 1,
  riffvalley: 2,
  superadmin: 3,
};
const LEGACY_ROLE_RENAMES: Record<string, string> = {
  babyUser: 'user',
  riffValley: 'riffvalley',
  superUser: 'superadmin',
};
const RECOGNIZED_SOURCE_ROLES = new Set([
  ...CANONICAL_ROLES,
  ...Object.keys(LEGACY_ROLE_RENAMES),
  'admin',
]);

/**
 * Converts the historical roles array to one canonical role.
 */
export class MigrateUsersToSingleRole1791920000000
  implements MigrationInterface
{
  name = `MigrateUsersToSingleRole${MIGRATION_TIMESTAMP}`;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE');

    const columns = await this.getRoleColumns(queryRunner);
    const sourceColumn = columns.find(
      ({ column_name }) => column_name === 'roles',
    );
    const singularColumn = columns.find(
      ({ column_name }) => column_name === 'role',
    );

    if (!sourceColumn || singularColumn) {
      throw new Error(
        'Migración de rol único cancelada: se esperaba solo la columna users.roles',
      );
    }
    if (
      sourceColumn.data_type !== 'ARRAY' ||
      sourceColumn.udt_name !== '_text'
    ) {
      throw new Error(
        `Migración de rol único cancelada: users.roles debe ser text[] (actual: ${sourceColumn.data_type}/${sourceColumn.udt_name})`,
      );
    }

    if (
      (await queryRunner.hasTable(SNAPSHOT_TABLE)) ||
      (await queryRunner.hasTable(SCHEMA_SNAPSHOT_TABLE))
    ) {
      throw new Error(
        'Migración de rol único cancelada: ya existe un snapshot de esta migración',
      );
    }

    const schemaSnapshot = await this.captureSchema(queryRunner, sourceColumn);
    const users = (await queryRunner.query(
      'SELECT "id"::text AS "id", "roles" FROM "users" ORDER BY "id" FOR UPDATE',
    )) as UserRolesRow[];
    const historicalSnapshots = await this.readHistoricalSnapshots(queryRunner);

    const plans: Array<{
      id: string;
      originalRoles: string[];
      role: string;
    }> = [];
    const blockers: string[] = [];

    for (const user of users) {
      try {
        plans.push({
          id: user.id,
          originalRoles: user.roles as string[],
          role: this.resolveRole(user, historicalSnapshots),
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
        `Migración de rol único cancelada: ${blockers.length} cuenta(s) requieren revisión: ${sample}${more}`,
      );
    }

    await this.createSnapshots(queryRunner, plans, schemaSnapshot);
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "role" text');

    for (const plan of plans) {
      const result = (await queryRunner.query(
        'UPDATE "users" SET "role" = $1 WHERE "id"::text = $2 RETURNING "id"::text AS "id"',
        [plan.role, plan.id],
      )) as unknown;

      if (affectedRows(result) !== 1) {
        throw new Error(
          `Migración de rol único cancelada: no se actualizó exactamente una fila (${plan.id})`,
        );
      }
    }

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'`,
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL',
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "${ROLE_CONSTRAINT}" CHECK ("role" IN ('user', 'collaborator', 'riffvalley', 'superadmin'))`,
    );
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "roles"');

    await this.verifyPostMigration(queryRunner, users, plans);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE');

    if (
      !(await queryRunner.hasTable(SNAPSHOT_TABLE)) ||
      !(await queryRunner.hasTable(SCHEMA_SNAPSHOT_TABLE))
    ) {
      throw new Error(
        `Rollback de rol único cancelado: faltan snapshots de ${MIGRATION_TIMESTAMP}`,
      );
    }

    const columns = await this.getRoleColumns(queryRunner);
    if (
      columns.some(({ column_name }) => column_name === 'roles') ||
      !columns.some(({ column_name }) => column_name === 'role')
    ) {
      throw new Error(
        'Rollback de rol único cancelado: se esperaba solo la columna users.role',
      );
    }

    const snapshots = (await queryRunner.query(
      `SELECT "user_id", "original_roles", "migrated_role" FROM "${SNAPSHOT_TABLE}" ORDER BY "user_id" FOR UPDATE`,
    )) as UserSnapshotRow[];
    const currentUsers = (await queryRunner.query(
      'SELECT "id"::text AS "id", "role" FROM "users" ORDER BY "id" FOR UPDATE',
    )) as UserRoleRow[];
    this.verifyRollbackPreconditions(currentUsers, snapshots);

    const schemaRows = (await queryRunner.query(
      `SELECT "original_roles_default", "original_roles_nullable", "original_roles_comment", "original_constraints", "original_indexes" FROM "${SCHEMA_SNAPSHOT_TABLE}" WHERE "singleton" = true FOR UPDATE`,
    )) as SchemaSnapshot[];
    if (schemaRows.length !== 1) {
      throw new Error(
        'Rollback de rol único cancelado: metadata de schema ausente o duplicada',
      );
    }
    const schemaSnapshot = schemaRows[0];

    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "roles" text[]');
    for (const snapshot of snapshots) {
      const result = await queryRunner.query(
        'UPDATE "users" SET "roles" = $1::text[] WHERE "id"::text = $2 RETURNING "id"::text AS "id"',
        [snapshot.original_roles, snapshot.user_id],
      );
      if (affectedRows(result) !== 1) {
        throw new Error(
          `Rollback de rol único cancelado: no se restauró exactamente una fila (${snapshot.user_id})`,
        );
      }
    }

    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "role"');
    if (schemaSnapshot.original_roles_default !== null) {
      await queryRunner.query(
        `ALTER TABLE "users" ALTER COLUMN "roles" SET DEFAULT ${schemaSnapshot.original_roles_default}`,
      );
    }
    if (!schemaSnapshot.original_roles_nullable) {
      await queryRunner.query(
        'ALTER TABLE "users" ALTER COLUMN "roles" SET NOT NULL',
      );
    }

    for (const constraint of schemaSnapshot.original_constraints) {
      const constraintName = queryRunner.connection.driver.escape(
        constraint.name,
      );
      await queryRunner.query(
        `ALTER TABLE "users" ADD CONSTRAINT ${constraintName} ${constraint.definition}`,
      );
    }
    for (const index of schemaSnapshot.original_indexes) {
      await queryRunner.query(index.definition);
    }
    if (schemaSnapshot.original_roles_comment !== null) {
      await queryRunner.query(
        `COMMENT ON COLUMN "users"."roles" IS ${this.escapeLiteral(schemaSnapshot.original_roles_comment)}`,
      );
    }

    await queryRunner.query(`DROP TABLE "${SNAPSHOT_TABLE}"`);
    await queryRunner.query(`DROP TABLE "${SCHEMA_SNAPSHOT_TABLE}"`);
  }

  private async getRoleColumns(
    queryRunner: QueryRunner,
  ): Promise<Array<SourceColumn & { column_name: string }>> {
    return queryRunner.query(
      `SELECT "column_name", "data_type", "udt_name", "is_nullable", "column_default", col_description(format('%I.%I', table_schema, table_name)::regclass, ordinal_position) AS "column_comment" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('roles', 'role') ORDER BY ordinal_position`,
    );
  }

  private async captureSchema(
    queryRunner: QueryRunner,
    sourceColumn: SourceColumn,
  ): Promise<SchemaSnapshot> {
    const constraints = (await queryRunner.query(
      `SELECT con.conname AS "name", pg_get_constraintdef(con.oid, true) AS "definition" FROM pg_constraint con JOIN pg_attribute attr ON attr.attrelid = con.conrelid AND attr.attname = 'roles' WHERE con.conrelid = to_regclass(format('%I.%I', current_schema(), 'users')) AND attr.attnum = ANY(con.conkey) ORDER BY con.conname`,
    )) as SourceConstraint[];
    const indexes = (await queryRunner.query(
      `SELECT pg_get_indexdef(idx.indexrelid) AS "definition" FROM pg_index idx JOIN pg_attribute attr ON attr.attrelid = idx.indrelid AND attr.attname = 'roles' WHERE idx.indrelid = to_regclass(format('%I.%I', current_schema(), 'users')) AND attr.attnum = ANY(idx.indkey) AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = idx.indexrelid) ORDER BY idx.indexrelid`,
    )) as SourceIndex[];

    return {
      original_roles_default: sourceColumn.column_default,
      original_roles_nullable: sourceColumn.is_nullable === 'YES',
      original_roles_comment: sourceColumn.column_comment,
      original_constraints: constraints,
      original_indexes: indexes,
    };
  }

  private async readHistoricalSnapshots(
    queryRunner: QueryRunner,
  ): Promise<Map<string, HistoricalSnapshotRow>> {
    if (!(await queryRunner.hasTable(HISTORICAL_SNAPSHOT_TABLE))) {
      return new Map();
    }

    const rows = (await queryRunner.query(
      `SELECT "user_id"::text AS "user_id", "original_roles", "migrated_roles" FROM "${HISTORICAL_SNAPSHOT_TABLE}" ORDER BY "user_id"`,
    )) as HistoricalSnapshotRow[];
    return new Map(rows.map((row) => [row.user_id, row]));
  }

  private resolveRole(
    user: UserRolesRow,
    historicalSnapshots: Map<string, HistoricalSnapshotRow>,
  ): string {
    const { id, roles } = user;
    if (!Array.isArray(roles)) {
      throw new Error(`cuenta ${id}: roles es NULL o no es un array`);
    }
    if (roles.length === 0) {
      throw new Error(`cuenta ${id}: roles está vacío`);
    }

    const seen = new Set<string>();
    for (const role of roles) {
      if (typeof role !== 'string') {
        throw new Error(
          `cuenta ${id}: roles contiene un valor NULL o no textual`,
        );
      }
      if (seen.has(role)) {
        throw new Error(`cuenta ${id}: rol duplicado ${role}`);
      }
      if (!RECOGNIZED_SOURCE_ROLES.has(role)) {
        throw new Error(`cuenta ${id}: rol desconocido ${role}`);
      }
      seen.add(role);
    }

    const isSingleUser = roles.length === 1 && roles[0] === 'user';
    let sourceRole: string | undefined;
    if (isSingleUser) {
      const historical = historicalSnapshots.get(id);
      if (
        !historical ||
        !this.arraysEqual(historical.migrated_roles, roles) ||
        !this.isUnambiguousBabyUserSource(historical.original_roles)
      ) {
        throw new Error(
          `cuenta ${id}: ['user'] sin evidencia snapshot de origen babyUser`,
        );
      }
      sourceRole = 'user';
    }

    const candidates: string[] = [];
    for (const role of roles) {
      if (role === 'admin' || role === 'user') continue;
      candidates.push(LEGACY_ROLE_RENAMES[role] ?? role);
    }
    if (sourceRole) candidates.push(sourceRole);

    if (candidates.length === 0) {
      throw new Error(
        `cuenta ${id}: admin/antiguo user sin un rol superviviente inequívoco`,
      );
    }

    const candidateSet = new Set(candidates);
    if (candidateSet.size !== candidates.length) {
      throw new Error(
        `cuenta ${id}: la normalización produciría roles duplicados (${candidates.join(', ')})`,
      );
    }

    return candidates.reduce((highest, candidate) =>
      ROLE_LEVEL[candidate] > ROLE_LEVEL[highest] ? candidate : highest,
    );
  }

  private async createSnapshots(
    queryRunner: QueryRunner,
    plans: Array<{ id: string; originalRoles: string[]; role: string }>,
    schemaSnapshot: SchemaSnapshot,
  ): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "${SNAPSHOT_TABLE}" ("user_id" text PRIMARY KEY, "original_roles" text[] NOT NULL, "migrated_role" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "${SCHEMA_SNAPSHOT_TABLE}" ("singleton" boolean PRIMARY KEY DEFAULT true CHECK ("singleton"), "original_roles_default" text, "original_roles_nullable" boolean NOT NULL, "original_roles_comment" text, "original_constraints" jsonb NOT NULL, "original_indexes" jsonb NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "${SCHEMA_SNAPSHOT_TABLE}" ("singleton", "original_roles_default", "original_roles_nullable", "original_roles_comment", "original_constraints", "original_indexes") VALUES (true, $1, $2, $3, $4::jsonb, $5::jsonb)`,
      [
        schemaSnapshot.original_roles_default,
        schemaSnapshot.original_roles_nullable,
        schemaSnapshot.original_roles_comment,
        JSON.stringify(schemaSnapshot.original_constraints),
        JSON.stringify(schemaSnapshot.original_indexes),
      ],
    );

    for (const plan of plans) {
      await queryRunner.query(
        `INSERT INTO "${SNAPSHOT_TABLE}" ("user_id", "original_roles", "migrated_role") VALUES ($1, $2::text[], $3)`,
        [plan.id, plan.originalRoles, plan.role],
      );
    }
  }

  private async verifyPostMigration(
    queryRunner: QueryRunner,
    usersBefore: UserRolesRow[],
    plans: Array<{ id: string; role: string }>,
  ): Promise<void> {
    const columns = await this.getRoleColumns(queryRunner);
    const roleColumn = columns.find(
      ({ column_name }) => column_name === 'role',
    );
    if (
      !roleColumn ||
      roleColumn.data_type !== 'text' ||
      roleColumn.is_nullable !== 'NO' ||
      roleColumn.column_default !== "'user'::text" ||
      columns.some(({ column_name }) => column_name === 'roles')
    ) {
      throw new Error(
        'Migración de rol único cancelada: el esquema final no cumple role text NOT NULL DEFAULT user sin roles',
      );
    }

    const usersAfter = (await queryRunner.query(
      'SELECT "id"::text AS "id", "role" FROM "users" ORDER BY "id" FOR UPDATE',
    )) as UserRoleRow[];
    if (usersBefore.length !== usersAfter.length) {
      throw new Error(
        `Migración de rol único cancelada: cambió el número de usuarios (${usersBefore.length} → ${usersAfter.length})`,
      );
    }

    const rolesById = new Map(plans.map((plan) => [plan.id, plan.role]));
    const idsBefore = new Set(usersBefore.map(({ id }) => id));
    for (const user of usersAfter) {
      const expectedRole = rolesById.get(user.id);
      if (!idsBefore.has(user.id) || expectedRole !== user.role) {
        throw new Error(
          `Migración de rol único cancelada: ID o rol inesperado en ${user.id}`,
        );
      }
      if (!CANONICAL_ROLES.includes(user.role)) {
        throw new Error(
          `Migración de rol único cancelada: rol no canónico ${user.role} en ${user.id}`,
        );
      }
    }
  }

  private verifyRollbackPreconditions(
    currentUsers: UserRoleRow[],
    snapshots: UserSnapshotRow[],
  ): void {
    if (currentUsers.length !== snapshots.length) {
      throw new Error(
        `Rollback de rol único cancelado: cambió el número de usuarios (${snapshots.length} → ${currentUsers.length})`,
      );
    }

    const snapshotById = new Map(snapshots.map((row) => [row.user_id, row]));
    for (const user of currentUsers) {
      const snapshot = snapshotById.get(user.id);
      if (!snapshot) {
        throw new Error(
          `Rollback de rol único cancelado: apareció el usuario ${user.id} después de migrar`,
        );
      }
      if (snapshot.migrated_role !== user.role) {
        throw new Error(
          `Rollback de rol único cancelado: cambió el rol del usuario ${user.id} después de migrar`,
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

  private isUnambiguousBabyUserSource(roles: string[] | null): boolean {
    return (
      Array.isArray(roles) &&
      roles.includes('babyUser') &&
      roles.every((role) => role === 'babyUser' || role === 'admin') &&
      new Set(roles).size === roles.length
    );
  }

  private escapeLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
