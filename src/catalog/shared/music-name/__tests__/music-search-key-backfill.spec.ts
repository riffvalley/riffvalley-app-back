import {
  hasVerificationIssues,
  parseBackfillArguments,
  parsePendingKeyCounts,
  runMusicSearchKeyBackfill,
  validateBackfillTarget,
  type BackfillQuery,
  type BackfillRecord,
} from '../music-search-key-backfill';

const ARTIST_ROWS: BackfillRecord[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'MØL',
    search_name_normalized: null,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Sólstafir',
    search_name_normalized: null,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Motörhead',
    search_name_normalized: null,
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Björk',
    search_name_normalized: null,
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: '— …',
    search_name_normalized: null,
  },
];

function createQuery(rows = ARTIST_ROWS): jest.MockedFunction<BackfillQuery> {
  const tables: Record<'artist' | 'disc', BackfillRecord[]> = {
    artist: rows.map((row) => ({ ...row })),
    disc: [
      {
        id: '00000000-0000-0000-0000-000000000006',
        name: 'The Secrets of Pandora',
        search_name_normalized: null,
      },
    ],
  };

  return jest.fn(
    async (sql: string, parameters?: unknown[]): Promise<unknown> => {
      if (sql.includes('information_schema.columns')) {
        return ['artist', 'disc'].flatMap((tableName) => [
          {
            table_name: tableName,
            column_name: 'id',
            data_type: 'uuid',
            is_nullable: 'NO',
          },
          {
            table_name: tableName,
            column_name: 'name',
            data_type: 'character varying',
            is_nullable: 'NO',
          },
          {
            table_name: tableName,
            column_name: 'search_name_normalized',
            data_type: 'text',
            is_nullable: 'YES',
          },
        ]);
      }
      const tableName = sql.includes('"artist"') ? 'artist' : 'disc';
      const table = tables[tableName];
      if (sql.startsWith('SELECT')) {
        const cursor = parameters?.[0];
        const limit = Number(parameters?.[1]);
        const candidates = table
          .filter(
            (row) => cursor === null || cursor === undefined || row.id > cursor,
          )
          .filter(
            (row) =>
              !sql.includes('AND "search_name_normalized" IS NULL') ||
              row.search_name_normalized === null,
          )
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, limit);
        return candidates.map((row) => ({ ...row }));
      }
      if (sql.startsWith('UPDATE')) {
        const [key, id, name] = parameters ?? [];
        const row = table.find((item) => item.id === id);
        if (!row || row.name !== name || row.search_name_normalized !== null)
          return [];
        row.search_name_normalized = String(key);
        return [{ id: row.id }];
      }
      throw new Error(`SQL inesperado en el test: ${sql}`);
    },
  ) as jest.MockedFunction<BackfillQuery>;
}

describe('music search key backfill', () => {
  it('requires an explicit mode, exact destination, and bounded batch size', () => {
    expect(() => parseBackfillArguments([])).toThrow('--dry-run');
    expect(() =>
      parseBackfillArguments([
        '--dry-run',
        '--apply',
        '--confirm-target',
        'db',
      ]),
    ).toThrow('exactamente uno');
    expect(() =>
      parseBackfillArguments([
        '--dry-run',
        '--confirm-target',
        'db',
        '--batch-size',
        '0',
      ]),
    ).toThrow('entre 1 y 5000');
    expect(() =>
      parseBackfillArguments([
        '--dry-run',
        '--confirm-target',
        'db',
        '--confirm-target',
        'other-db',
      ]),
    ).toThrow('solo puede indicarse una vez');
    expect(
      parseBackfillArguments(['--dry-run', '--confirm-target', 'db']),
    ).toEqual({
      mode: 'dry-run',
      batchSize: 200,
      confirmTarget: 'db',
      allowProduction: false,
    });
  });

  it('rejects an implicit, remote, or unconfirmed database target', () => {
    const args = {
      confirmTarget: 'music_search_migration_test',
      allowProduction: false,
    };
    expect(() =>
      validateBackfillTarget(
        {
          STAGE: 'dev',
          DB_HOST: '127.0.0.1',
          DB_PORT: '55432',
          DB_NAME: args.confirmTarget,
        },
        args,
      ),
    ).not.toThrow();
    expect(() =>
      validateBackfillTarget(
        {
          STAGE: 'dev',
          DB_HOST: 'db.example.test',
          DB_PORT: '5432',
          DB_NAME: args.confirmTarget,
        },
        args,
      ),
    ).toThrow('PostgreSQL local');
    expect(() =>
      validateBackfillTarget(
        {
          STAGE: 'prod',
          DB_HOST: 'db.example.test',
          DB_PORT: '5432',
          DB_NAME: args.confirmTarget,
        },
        args,
      ),
    ).toThrow('Producción requiere');
    expect(() =>
      validateBackfillTarget(
        {
          STAGE: 'prod',
          DB_HOST: 'db.example.test',
          DB_PORT: '5432',
          DB_NAME: args.confirmTarget,
          DATABASE_URL: 'configurada-por-heroku',
        },
        { ...args, allowProduction: true },
      ),
    ).not.toThrow();
  });

  it('requires reconciled counts for both Catalog tables', () => {
    expect(
      parsePendingKeyCounts([
        { table_name: 'artist', count: 0 },
        { table_name: 'disc', count: '2' },
      ]),
    ).toEqual({ artist: 0, disc: 2 });
    expect(() =>
      parsePendingKeyCounts([{ table_name: 'artist', count: 0 }]),
    ).toThrow('número inesperado de tablas');
  });

  it('dry-run calculates unicode keys in batches and never writes', async () => {
    const query = createQuery();
    const result = await runMusicSearchKeyBackfill(query, 'public', {
      mode: 'dry-run',
      batchSize: 2,
    });

    expect(result.artist.candidates).toBe(5);
    expect(result.artist.emptyNormalized).toBe(1);
    expect(result.artist.batches).toBe(3);
    expect(result.disc.candidates).toBe(1);
    expect(
      query.mock.calls.some(
        ([sql]) => sql.startsWith('UPDATE') && sql.includes('"artist"'),
      ),
    ).toBe(false);
  });

  it('applies only missing keys and is idempotent on rerun', async () => {
    const query = createQuery(ARTIST_ROWS.slice(0, 4));
    const firstRun = await runMusicSearchKeyBackfill(query, 'public', {
      mode: 'apply',
      batchSize: 2,
    });
    const secondRun = await runMusicSearchKeyBackfill(query, 'public', {
      mode: 'apply',
      batchSize: 2,
    });

    expect(firstRun.artist.updated).toBe(4);
    expect(secondRun.artist.updated).toBe(0);
    expect(secondRun.artist.candidates).toBe(0);
    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.startsWith('UPDATE') && sql.includes('SET "name_normalized" ='),
      ),
    ).toBe(false);
  });

  it('resumes after an interrupted batch without revisiting written rows', async () => {
    const query = createQuery(ARTIST_ROWS.slice(0, 4));
    const originalQuery = query.getMockImplementation();
    const report = jest.fn();
    let updateCount = 0;
    let interrupted = false;
    query.mockImplementation(async (sql, parameters): Promise<unknown> => {
      if (sql.startsWith('UPDATE')) updateCount += 1;
      if (sql.startsWith('SELECT') && updateCount === 2 && !interrupted) {
        interrupted = true;
        throw new Error('interrupción simulada');
      }
      if (!originalQuery)
        throw new Error('No hay implementación SQL simulada.');
      return originalQuery(sql, parameters);
    });

    await expect(
      runMusicSearchKeyBackfill(query, 'public', {
        mode: 'apply',
        batchSize: 2,
        report,
      }),
    ).rejects.toThrow('artist, lote 2');
    expect(report).toHaveBeenLastCalledWith(
      'artist',
      expect.objectContaining({ failed: 1 }),
    );
    const resumed = await runMusicSearchKeyBackfill(query, 'public', {
      mode: 'apply',
      batchSize: 2,
    });

    expect(resumed.artist.updated).toBe(2);
    expect(resumed.artist.candidates).toBe(2);
  });

  it('leaves empty normalized names pending for explicit review', async () => {
    const query = createQuery([ARTIST_ROWS[4]]);
    const result = await runMusicSearchKeyBackfill(query, 'public', {
      mode: 'apply',
      batchSize: 10,
    });

    expect(result.artist.emptyNormalized).toBe(1);
    expect(result.artist.updated).toBe(0);
    expect(result.artist.skipped).toBe(1);
    expect(
      query.mock.calls.some(
        ([sql]) => sql.startsWith('UPDATE') && sql.includes('"artist"'),
      ),
    ).toBe(false);
  });

  it('does not overwrite concurrent dual-write and verification reports inconsistent keys', async () => {
    const query = createQuery(ARTIST_ROWS.slice(0, 1));
    const originalQuery = query.getMockImplementation();
    let concurrentWrite = false;
    query.mockImplementation(async (sql, parameters): Promise<unknown> => {
      if (sql.startsWith('UPDATE') && !concurrentWrite) {
        concurrentWrite = true;
        expect(sql).toContain('AND "name" = $3');
        expect(sql).toContain('AND "search_name_normalized" IS NULL');
        return [];
      }
      return originalQuery?.(sql, parameters);
    });

    const applyResult = await runMusicSearchKeyBackfill(query, 'public', {
      mode: 'apply',
      batchSize: 10,
    });
    expect(applyResult.artist.updated).toBe(0);
    expect(applyResult.artist.skippedConcurrent).toBe(1);

    const inconsistentQuery = createQuery([
      {
        id: ARTIST_ROWS[0].id,
        name: 'MØL',
        search_name_normalized: 'wrong-key',
      },
      {
        id: '00000000-0000-0000-0000-000000000009',
        name: 'Björk',
        search_name_normalized: null,
      },
    ]);
    const verifyResult = await runMusicSearchKeyBackfill(
      inconsistentQuery,
      'public',
      {
        mode: 'verify',
        batchSize: 10,
      },
    );
    expect(verifyResult.artist.inconsistent).toBe(1);
    expect(verifyResult.artist.missing).toBe(1);
    expect(hasVerificationIssues(verifyResult)).toBe(true);
    expect(
      inconsistentQuery.mock.calls.some(([sql]) => sql.startsWith('UPDATE')),
    ).toBe(false);
  });

  it('normalizes article variants, including titles containing Unicode spaces', async () => {
    const query = createQuery([]);
    const result = await runMusicSearchKeyBackfill(query, 'public', {
      mode: 'dry-run',
      batchSize: 20,
    });

    expect(result.disc.examples[0]).toMatchObject({
      name: 'The Secrets of Pandora',
      expected: 'the secrets of pandora',
    });
  });
});
