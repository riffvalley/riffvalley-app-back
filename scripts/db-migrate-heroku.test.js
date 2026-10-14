const assert = require('node:assert/strict');
const {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const script = path.resolve(__dirname, 'db-migrate-heroku.sh');
const database = 'riffvalley_test';
const migrationList = 'AddOne1700000000000,AddTwo1700000000001';
const destinationAck = `DESTINO ${database}`;
const authorization = `AUTORIZO MIGRAR spammusic-back ${database} ${migrationList} COMPATIBLE_O_VENTANA_COORDINADA`;
const backupAck = `BACKUP COMPLETED b123 ${database}`;
const authorizedInput = `${destinationAck}\n${authorization}\nb123\n${backupAck}\n`;

function fakeHerokuSource() {
  return String.raw`#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$FAKE_LOG"
case "\${1-}" in
  auth:whoami)
    printf 'developer@example.invalid\n'
    ;;
  apps:info)
    printf '{"name":"%s"}\n' "$FAKE_APP_NAME"
    ;;
  releases)
    printf '=== spammusic-back Releases\n v999 Deploy\n'
    ;;
  config:get)
    printf '%s\n' "$FAKE_DB_NAME"
    ;;
  pg:info)
    printf '=== DATABASE\nDatabase: %s\n' "$FAKE_PG_DATABASE"
    ;;
  pg:backups:capture)
    if [[ "\${FAKE_BACKUP_FAIL:-0}" == 1 ]]; then
      printf 'backup failed\n' >&2
      exit 12
    fi
    printf 'Backup completed. ID: b123\n'
    ;;
  pg:backups:info)
    printf 'Backup: %s\nStatus: %s\nDatabase: %s\n' "$2" "$FAKE_BACKUP_STATUS" "$FAKE_PG_DATABASE"
    ;;
  run)
    case "$*" in
      *'yarn db:status --json'*)
        count=0
        [[ ! -f "$FAKE_STATUS_COUNT" ]] || count="$(cat "$FAKE_STATUS_COUNT")"
        count=$((count + 1))
        printf '%s\n' "$count" > "$FAKE_STATUS_COUNT"
        pending='["AddOne1700000000000","AddTwo1700000000001"]'
        if [[ "\${FAKE_NO_PENDING:-0}" == 1 ]]; then
          pending='[]'
        elif [[ "\${FAKE_CHANGE_LIST:-0}" == 1 && "$count" -ge 2 ]]; then
          pending='["Changed1700000000002"]'
        elif [[ "\${FAKE_POST_PENDING:-0}" == 1 && "$count" -ge 3 ]]; then
          pending='["StillPending1700000000003"]'
        elif [[ "$count" -ge 3 ]]; then
          pending='[]'
        fi
        printf '{"formatVersion":1,"stage":"prod","database":"%s","ledgerExists":true,"ledgerTable":"migrations","compiledMigrations":2,"appliedCount":0,"pending":%s}\n' "$FAKE_STATUS_DATABASE" "$pending"
        ;;
      *'yarn db:migrate --confirm'*)
        if [[ "\${FAKE_MIGRATE_FAIL:-0}" == 1 ]]; then
          printf 'migration failed\n' >&2
          exit 13
        fi
        printf 'Applied: AddOne1700000000000\nApplied: AddTwo1700000000001\n'
        ;;
      *'yarn db:check'*)
        if [[ "\${FAKE_CHECK_FAIL:-0}" == 1 ]]; then
          printf 'db:check failed\n' >&2
          exit 14
        fi
        printf 'La base no tiene migraciones pendientes.\n'
        ;;
      *)
        printf 'unexpected remote command\n' >&2
        exit 99
        ;;
    esac
    ;;
  *)
    printf 'unexpected heroku command\n' >&2
    exit 98
    ;;
esac
`.replaceAll('\\${', '${');
}

function runScenario(overrides = {}, input = authorizedInput) {
  const tempDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'db-migrate-heroku-test-'),
  );
  const binDirectory = path.join(tempDirectory, 'bin');
  mkdirSync(binDirectory);
  const fakeHeroku = path.join(binDirectory, 'heroku');
  writeFileSync(fakeHeroku, fakeHerokuSource());
  chmodSync(fakeHeroku, 0o755);
  const callLog = path.join(tempDirectory, 'calls.log');
  const env = {
    ...process.env,
    PATH: `${binDirectory}:${process.env.PATH}`,
    FAKE_LOG: callLog,
    FAKE_STATUS_COUNT: path.join(tempDirectory, 'status-count'),
    FAKE_APP_NAME: 'spammusic-back',
    FAKE_DB_NAME: database,
    FAKE_STATUS_DATABASE: database,
    FAKE_PG_DATABASE: database,
    FAKE_BACKUP_STATUS: 'Completed',
    ...overrides,
  };
  delete env.NODE_TEST_CONTEXT;

  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 1024 * 1024,
    timeout: 10000,
  });
  const callLogText = readFileSync(callLog, 'utf8');
  const calls = callLogText.trim().split('\n').filter(Boolean);
  rmSync(tempDirectory, { recursive: true, force: true });
  return { ...result, calls, output: `${result.stdout}${result.stderr}` };
}

function countCalls(calls, fragment) {
  return calls.filter((call) => call.includes(fragment)).length;
}

test('no pending migrations stops before backup and migration', () => {
  const result = runScenario({ FAKE_NO_PENDING: '1' });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /No hay migraciones pendientes/);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:check'), 1);
});

test('cancellation stops before creating a backup', () => {
  const result = runScenario({}, `${destinationAck}\nCANCELAR\n`);

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('backup failure stops before migration', () => {
  const result = runScenario({ FAKE_BACKUP_FAIL: '1' });

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 1);
  assert.equal(countCalls(result.calls, 'pg:backups:info'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('an incomplete backup is not confirmed and migration is not run', () => {
  const result = runScenario(
    { FAKE_BACKUP_STATUS: 'In progress' },
    `${destinationAck}\n${authorization}\nb123\nNO BACKUP\n`,
  );

  assert.notEqual(result.status, 0);
  assert.match(result.output, /Status: In progress/);
  assert.equal(countCalls(result.calls, 'pg:backups:info'), 1);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('a changed migration list stops before migration', () => {
  const result = runScenario({ FAKE_CHANGE_LIST: '1' });

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'yarn db:status --json'), 2);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('a migration error is not retried', () => {
  const result = runScenario({ FAKE_MIGRATE_FAIL: '1' });

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 1);
  assert.equal(countCalls(result.calls, 'yarn db:status --json'), 2);
});

test('post-migration verification errors are reported without another migration', () => {
  const result = runScenario({ FAKE_POST_PENDING: '1', FAKE_CHECK_FAIL: '1' });

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 1);
  assert.equal(countCalls(result.calls, 'yarn db:status --json'), 3);
  assert.equal(countCalls(result.calls, 'yarn db:check'), 1);
});

test('a mismatch between DB_NAME and the TypeORM datasource stops safely', () => {
  const result = runScenario({ FAKE_DB_NAME: 'another_database' });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /DB_NAME no coincide/);
  assert.equal(countCalls(result.calls, 'pg:info'), 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('an ambiguous PostgreSQL attachment cannot be confirmed as the destination', () => {
  const result = runScenario(
    { FAKE_PG_DATABASE: 'different_database' },
    'NO CONFIRMO DESTINO\n',
  );

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('a wrong Heroku application is rejected before database operations', () => {
  const result = runScenario({ FAKE_APP_NAME: 'wrong-app' });

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'yarn db:status'), 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
});

test('successful simulation executes once with the exact ordered confirmation', () => {
  const result = runScenario();

  assert.equal(result.status, 0, result.output);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 1);
  assert.ok(
    result.calls.some((call) =>
      call.includes(`yarn db:migrate --confirm ${database}:${migrationList}`),
    ),
  );
  assert.equal(countCalls(result.calls, 'yarn db:status --json'), 3);
  assert.equal(countCalls(result.calls, 'yarn db:check'), 1);
  assert.match(result.output, /Migraciones y ledger verificados/);
});
