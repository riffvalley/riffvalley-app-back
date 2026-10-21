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
const migrationList = 'RemoveFreeFromList1791930000000,RemoveEditorialLinks1791940000000,CreateAuthSessionPersistence1791950000000,AddRefreshOperationFingerprint1791960000000,AddSessionCleanupIndex1791970000000';
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
    case "\${FAKE_APP_INFO_MODE:-valid}" in
      valid)
        printf '{"app":{"name":"%s"}}\n' "$FAKE_APP_NAME"
        ;;
      invalid)
        printf '{"app":}\n'
        ;;
      missing)
        printf '{"app":{}}\n'
        ;;
      *)
        printf 'unexpected app info mode\n' >&2
        exit 97
        ;;
    esac
    ;;
  releases)
    printf '=== spammusic-back Releases\n v999 Deploy\n'
    ;;
  config:get)
    printf '%s\n' "$FAKE_DB_NAME"
    ;;
  pg:psql)
    case "\${FAKE_ATTACHMENT_MODE:-valid}" in
      valid)
        count=0
        [[ ! -f "$FAKE_STATUS_COUNT" ]] || count="$(cat "$FAKE_STATUS_COUNT")"
        ledger_rows=91
        distinct_names=91
        orphan_count=1
        if [[ "$count" -ge 3 ]]; then
          ledger_rows=96
          distinct_names=96
          if [[ "\${FAKE_POST_PENDING:-0}" == 1 ]]; then
            ledger_rows=95
            distinct_names=95
          fi
        fi
        distinct_names="\${FAKE_LEDGER_DISTINCT_NAMES:-$distinct_names}"
        orphan_count="\${FAKE_LEGACY_ORPHAN_COUNT:-$orphan_count}"
        printf '{"database":"%s","ledgerRows":%s,"distinctNames":%s,"knownLegacyOrphanCount":%s}\n' "$FAKE_PG_CURRENT_DATABASE" "$ledger_rows" "$distinct_names" "$orphan_count"
        ;;
      missing)
        printf '{"ledgerRows":91,"distinctNames":91,"knownLegacyOrphanCount":1}\n'
        ;;
      invalid)
        printf 'not-json\n'
        ;;
      ambiguous)
        printf '{"database":"%s","ledgerRows":91,"distinctNames":91,"knownLegacyOrphanCount":1}\n' "$FAKE_PG_CURRENT_DATABASE"
        printf '{"database":"%s","ledgerRows":91,"distinctNames":91,"knownLegacyOrphanCount":1}\n' "$FAKE_PG_CURRENT_DATABASE"
        ;;
      *)
        printf 'unexpected attachment mode\n' >&2
        exit 96
        ;;
    esac
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
        pending='["RemoveFreeFromList1791930000000","RemoveEditorialLinks1791940000000","CreateAuthSessionPersistence1791950000000","AddRefreshOperationFingerprint1791960000000","AddSessionCleanupIndex1791970000000"]'
        if [[ "\${FAKE_NO_PENDING:-0}" == 1 ]]; then
          pending='[]'
        elif [[ "\${FAKE_EXTRA_PENDING:-0}" == 1 ]]; then
          pending='["Unexpected1700000000000","RemoveFreeFromList1791930000000","RemoveEditorialLinks1791940000000","CreateAuthSessionPersistence1791950000000","AddRefreshOperationFingerprint1791960000000","AddSessionCleanupIndex1791970000000"]'
        elif [[ "\${FAKE_CHANGE_LIST:-0}" == 1 && "$count" -ge 2 ]]; then
          pending='["Changed1700000000002"]'
        elif [[ "\${FAKE_POST_PENDING:-0}" == 1 && "$count" -ge 3 ]]; then
          pending='["StillPending1791980000000"]'
        elif [[ "$count" -ge 3 ]]; then
          pending='[]'
        fi
        applied_count=91
        [[ "$count" -lt 3 ]] || applied_count=96
        if [[ "\${FAKE_CHANGE_LIST:-0}" == 1 && "$count" -ge 2 ]]; then
          applied_count=95
        elif [[ "\${FAKE_POST_PENDING:-0}" == 1 && "$count" -ge 3 ]]; then
          applied_count=95
        fi
        printf '{"formatVersion":1,"stage":"prod","database":"%s","ledgerExists":true,"ledgerTable":"migrations","compiledMigrations":95,"appliedCount":%s,"pending":%s}\n' "$FAKE_STATUS_DATABASE" "$applied_count" "$pending"
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
    FAKE_PG_CURRENT_DATABASE: database,
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

test('a different current_database() from the attachment is rejected before backup', () => {
  const result = runScenario({ FAKE_PG_CURRENT_DATABASE: 'different_database' });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /destino PostgreSQL o el inventario/);
  assert.equal(countCalls(result.calls, 'pg:psql'), 1);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('missing or unverifiable attachment identity stops before backup', () => {
  for (const mode of ['missing', 'invalid', 'ambiguous']) {
    const result = runScenario({ FAKE_ATTACHMENT_MODE: mode });

    assert.notEqual(result.status, 0, mode);
    assert.match(result.output, /No se pudo verificar mediante SELECT/);
    assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
    assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
  }
});

test('an unexpected pending migration is rejected before backup', () => {
  const result = runScenario({ FAKE_EXTRA_PENDING: '1' });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /inventario de migraciones no coincide/);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
});

test('duplicate or unrecognized ledger inventory is rejected before backup', () => {
  for (const overrides of [
    { FAKE_LEDGER_DISTINCT_NAMES: '90' },
    { FAKE_LEGACY_ORPHAN_COUNT: '0' },
  ]) {
    const result = runScenario(overrides);

    assert.notEqual(result.status, 0);
    assert.match(result.output, /inventario de migraciones no coincide/);
    assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
    assert.equal(countCalls(result.calls, 'yarn db:migrate'), 0);
  }
});

test('a wrong Heroku application is rejected before database operations', () => {
  const result = runScenario({ FAKE_APP_NAME: 'wrong-app' });

  assert.notEqual(result.status, 0);
  assert.equal(countCalls(result.calls, 'yarn db:status'), 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
});

test('invalid Heroku app JSON is rejected before database operations', () => {
  const result = runScenario({ FAKE_APP_INFO_MODE: 'invalid' });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /La aplicación devuelta por Heroku no es spammusic-back/);
  assert.equal(countCalls(result.calls, 'yarn db:status'), 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
});

test('missing Heroku app identity is rejected before database operations', () => {
  const result = runScenario({ FAKE_APP_INFO_MODE: 'missing' });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /La aplicación devuelta por Heroku no es spammusic-back/);
  assert.equal(countCalls(result.calls, 'yarn db:status'), 0);
  assert.equal(countCalls(result.calls, 'pg:backups:capture'), 0);
});

test('valid nested Heroku app info allows the exact ordered simulation', () => {
  const result = runScenario();

  assert.equal(result.status, 0, result.output);
  assert.equal(countCalls(result.calls, 'yarn db:migrate'), 1);
  assert.ok(
    result.calls.some((call) =>
      call.includes(`yarn db:migrate --confirm ${database}:${migrationList}`),
    ),
  );
  assert.equal(countCalls(result.calls, 'yarn db:status --json'), 3);
  assert.equal(countCalls(result.calls, 'pg:psql'), 3);
  assert.equal(countCalls(result.calls, 'yarn db:check'), 1);
  assert.match(result.output, /Migraciones y ledger verificados/);
});
