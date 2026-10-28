import { HomeQueryRunner } from '../loaders/home-query-runner';

export type HomePostgresValue = string | number | boolean | Date | null;

export interface HomePostgresClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(
    sql: string,
    values?: HomePostgresValue[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

const TOP_DISCS_POSTGRES_TEST_TARGET = {
  host: '127.0.0.1',
  port: '55433',
  database: 'riffvalley_topdiscs_test',
  username: 'riffvalley_topdiscs_test',
} as const;

export function requireTopDiscsPostgresTestTarget(optIn: string): void {
  if (
    process.env[optIn] !== '1' ||
    process.env.STAGE !== 'dev' ||
    process.env.DB_HOST !== TOP_DISCS_POSTGRES_TEST_TARGET.host ||
    process.env.DB_PORT !== TOP_DISCS_POSTGRES_TEST_TARGET.port ||
    process.env.DB_NAME !== TOP_DISCS_POSTGRES_TEST_TARGET.database ||
    process.env.DB_USERNAME !== TOP_DISCS_POSTGRES_TEST_TARGET.username ||
    !process.env.DB_PASSWORD ||
    process.env.DATABASE_URL
  ) {
    throw new Error(
      `${optIn} requiere exclusivamente la base PostgreSQL Docker aislada de TopDiscs.`,
    );
  }
}

export async function verifyTopDiscsPostgresTestIdentity(
  client: HomePostgresClient,
): Promise<void> {
  const rows = await client.query(`
    SELECT
      current_database() AS database,
      current_user AS username,
      inet_server_port() AS server_port,
      current_setting('server_version_num') AS server_version_num,
      current_test_role.rolsuper AS is_superuser,
      current_test_role.rolcreatedb AS can_create_database,
      current_test_role.rolcreaterole AS can_create_role,
      has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_objects,
      has_database_privilege(current_user, current_database(), 'TEMP') AS can_create_temp_tables,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_objects,
      (
        SELECT count(*)::integer
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      ) AS public_relation_count
    FROM pg_roles current_test_role
    WHERE current_test_role.rolname = current_user
  `);
  const identity = rows.rows[0];
  if (
    !identity ||
    identity.database !== TOP_DISCS_POSTGRES_TEST_TARGET.database ||
    identity.username !== TOP_DISCS_POSTGRES_TEST_TARGET.username ||
    Number(identity.server_port) !== 5432 ||
    !String(identity.server_version_num).startsWith('17') ||
    identity.is_superuser !== false ||
    identity.can_create_database !== false ||
    identity.can_create_role !== false ||
    identity.can_connect !== true ||
    identity.can_create_objects !== false ||
    identity.can_create_temp_tables !== true ||
    identity.can_create_public_objects !== false ||
    Number(identity.public_relation_count) !== 0
  ) {
    throw new Error(
      'La conexión PostgreSQL no coincide con el destino TopDiscs aislado o supera los permisos mínimos.',
    );
  }
}

export function getHomePostgresValues(values: unknown[]): HomePostgresValue[] {
  return values.map((value) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (value instanceof Date) return value;
    if (value === null) return null;
    throw new TypeError('Unsupported Home PostgreSQL parameter');
  });
}

export function asHomeQueryRunner(client: HomePostgresClient): HomeQueryRunner {
  return {
    query: async (sql, parameters = []) => {
      const result = await client.query(sql, getHomePostgresValues(parameters));
      return result.rows;
    },
  };
}
