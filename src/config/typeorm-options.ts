import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function typeOrmOptions(): TypeOrmModuleOptions {
  return {
    ssl: process.env.STAGE === 'prod',
    extra: {
      ssl: process.env.STAGE === 'prod' ? { rejectUnauthorized: false } : null,
    },
    type: 'postgres',
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
  };
}
