import { typeOrmOptions } from '../typeorm-options';

const environmentKeys = [
  'STAGE',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USERNAME',
  'DB_PASSWORD',
] as const;

const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('typeOrmOptions', () => {
  it('preserves the PostgreSQL and production SSL configuration', () => {
    process.env.STAGE = 'prod';
    process.env.DB_HOST = 'database.example';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'riff_valley';
    process.env.DB_USERNAME = 'riff';
    process.env.DB_PASSWORD = 'secret';

    expect(typeOrmOptions()).toEqual({
      ssl: true,
      extra: { ssl: { rejectUnauthorized: false } },
      type: 'postgres',
      host: 'database.example',
      port: 5432,
      database: 'riff_valley',
      username: 'riff',
      password: 'secret',
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
    });
  });

  it('keeps SSL disabled outside production and converts the port to a number', () => {
    process.env.STAGE = 'dev';
    process.env.DB_PORT = '3000';

    expect(typeOrmOptions()).toMatchObject({
      ssl: false,
      extra: { ssl: null },
      type: 'postgres',
      port: 3000,
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
    });
  });
});
