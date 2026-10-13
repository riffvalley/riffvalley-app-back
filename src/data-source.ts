// src/data-source.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const isProd = process.env.STAGE === 'prod';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: +(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  username: process.env.DB_USERNAME,
  password: String(process.env.DB_PASSWORD),

  synchronize: false,
  migrationsRun: false,
  logging: !isProd,

  entities: [isProd ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [isProd ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],

  ssl: isProd,
  extra: isProd ? { ssl: { rejectUnauthorized: false } } : undefined,
});

export default dataSource;
