export const LOCAL_BOOTSTRAP_TARGET = {
  container: 'spammusicdb',
  database: 'SpamMusicDB',
  dockerImage: 'postgres:17',
  host: 'localhost',
  port: '5432',
  postgresPort: 5432,
} as const;

export type DockerInspection = {
  name: string;
  image: string;
  status: string;
  ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
  networks: Record<string, { IPAddress: string }>;
};

export function validateBootstrapEnvironment(
  environment: Record<string, string | undefined>,
): void {
  const expected: Record<string, string> = {
    STAGE: 'dev',
    DB_HOST: LOCAL_BOOTSTRAP_TARGET.host,
    DB_PORT: LOCAL_BOOTSTRAP_TARGET.port,
    DB_NAME: LOCAL_BOOTSTRAP_TARGET.database,
  };

  for (const [name, value] of Object.entries(expected)) {
    if (environment[name] !== value) {
      throw new Error(`${name} debe ser exactamente ${value}.`);
    }
  }
  if (!environment.DB_USERNAME) {
    throw new Error('DB_USERNAME es obligatorio para el bootstrap local.');
  }
  if (!environment.DB_PASSWORD) {
    throw new Error('DB_PASSWORD es obligatorio para el bootstrap local.');
  }
  if (environment.DATABASE_URL) {
    throw new Error('No se admite DATABASE_URL en el bootstrap local.');
  }
}

export function validateDockerInspection(
  inspection: DockerInspection,
): string[] {
  const portBindings = inspection.ports['5432/tcp'] ?? [];
  const hasOnlyExpectedBinding =
    Object.keys(inspection.ports).length === 1 &&
    portBindings.length > 0 &&
    portBindings.every(
      (binding) =>
        ['127.0.0.1', '0.0.0.0', '::1', '::'].includes(binding.HostIp) &&
        binding.HostPort === LOCAL_BOOTSTRAP_TARGET.port,
    );
  const addresses = Object.values(inspection.networks)
    .map(({ IPAddress }) => IPAddress)
    .filter(Boolean);

  if (
    inspection.name !== `/${LOCAL_BOOTSTRAP_TARGET.container}` ||
    inspection.image !== LOCAL_BOOTSTRAP_TARGET.dockerImage ||
    inspection.status !== 'running' ||
    !hasOnlyExpectedBinding ||
    addresses.length === 0
  ) {
    throw new Error(
      'El contenedor no coincide exactamente con el PostgreSQL local esperado; no se modificó la base.',
    );
  }

  return addresses;
}

export function validateResetConfirmation(
  confirmation: string,
  database: string,
): void {
  if (confirmation !== `REINICIAR ${database}`) {
    throw new Error('Confirmación incorrecta; no se modificó el esquema.');
  }
}
