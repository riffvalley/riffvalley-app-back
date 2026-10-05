import { DataSource } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Pending } from '../entities/pending.entity';

const describePostgres =
  process.env.D33_POSTGRES_TEST === '1' ? describe : describe.skip;

const USER_ID = '00000000-0000-4000-8000-000000000011';
const CASCADE_USER_ID = '00000000-0000-4000-8000-000000000012';
const DISC_ID = '00000000-0000-4000-8000-000000000013';
const PENDING_ID = '00000000-0000-4000-8000-000000000014';
const CASCADE_PENDING_ID = '00000000-0000-4000-8000-000000000015';

describePostgres('Pending ↔ User relation with PostgreSQL fixtures', () => {
  let dataSource: DataSource;
  let queryRunner: ReturnType<DataSource['createQueryRunner']>;

  beforeAll(async () => {
    require('dotenv').config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('Pending/User PostgreSQL tests require STAGE=dev');
    }

    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: String(process.env.DB_PASSWORD),
      ssl: false,
      synchronize: false,
      logging: false,
      entities: ['src/**/*.entity.ts'],
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    await queryRunner.query(`
      CREATE TEMP TABLE users (
        id uuid PRIMARY KEY,
        email text NOT NULL DEFAULT 'pending-owner@example.test',
        password text NOT NULL DEFAULT 'test-password-hash',
        roles text[] NOT NULL DEFAULT ARRAY['user'],
        username text NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        image text,
        "dashboardConfig" jsonb,
        "mobileDashboardConfig" jsonb,
        "dashboardButtonsEnabled" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        notes text,
        "lastLogin" timestamp
      );
      CREATE TEMP TABLE pending (
        id uuid PRIMARY KEY,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "editedAt" timestamp,
        "userId" uuid NOT NULL REFERENCES users(id),
        "discId" uuid NOT NULL
      );
    `);
  });

  afterAll(async () => {
    if (queryRunner?.isReleased === false) await queryRunner.release();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    await queryRunner.query('TRUNCATE pending, users');
  });

  it('persists Pending.user and loads Pending → User through the owning relation', async () => {
    const manager = queryRunner.manager;
    const user = manager.create(User, { id: USER_ID, username: 'pending-owner' });
    await manager.save(user);

    const pending = manager.create(Pending, {
      id: PENDING_ID,
      user,
      disc: { id: DISC_ID } as Disc,
    });
    await manager.save(pending);

    const persisted = await queryRunner.query(
      'SELECT "userId" FROM pending WHERE id = $1',
      [PENDING_ID],
    );
    expect(persisted).toEqual([{ userId: USER_ID }]);

    const loaded = await manager.findOneOrFail(Pending, {
      where: { id: PENDING_ID },
    });
    expect(loaded.user).toMatchObject({ id: USER_ID, username: 'pending-owner' });
  });

  it('cascades and loads User → Pending through the declared inverse relation', async () => {
    const user = queryRunner.manager.create(User, {
      id: CASCADE_USER_ID,
      username: 'cascade-owner',
      pending: [
        queryRunner.manager.create(Pending, {
          id: CASCADE_PENDING_ID,
          disc: { id: DISC_ID } as Disc,
        }),
      ],
    } as any);
    await queryRunner.manager.save(user);

    const persisted = await queryRunner.query(
      'SELECT "userId" FROM pending WHERE id = $1',
      [CASCADE_PENDING_ID],
    );
    expect(persisted).toEqual([{ userId: CASCADE_USER_ID }]);

    const loaded = await queryRunner.manager.findOneOrFail(User, {
      where: { id: CASCADE_USER_ID },
      relations: { pending: true },
    });
    expect(loaded.pending).toHaveLength(1);
    expect(loaded.pending[0]).toMatchObject({
      id: CASCADE_PENDING_ID,
      user: { id: CASCADE_USER_ID, username: 'cascade-owner' },
    });
  });
});
