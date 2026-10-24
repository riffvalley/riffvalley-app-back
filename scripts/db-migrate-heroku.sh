#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP="spammusic-back"
readonly DATABASE_ATTACHMENT="DATABASE"
readonly EXPECTED_PENDING_CSV="CreateUserAppDailyActivity1791990000000,CreateRateVoteEvents1792000000000"
readonly LEGACY_LEDGER_ONLY_MIGRATION="UpdateListStatusEnum1766066905027"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_tools() {
  command -v heroku >/dev/null 2>&1 || fail 'No se encontró Heroku CLI.'
  command -v node >/dev/null 2>&1 || fail 'Se necesita Node.js para leer las respuestas JSON.'
  command -v psql >/dev/null 2>&1 || fail 'Se necesita psql para verificar el attachment PostgreSQL con una consulta de solo lectura.'

  heroku auth:whoami >/dev/null || fail 'Heroku CLI no está autenticada.'

  local app_json
  app_json="$(heroku apps:info --app "$APP" --json)" || fail "No se pudo consultar la aplicación $APP."
  printf '%s' "$app_json" | node -e '
    let response;
    try {
      response = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    } catch {
      process.exit(1);
    }
    if (
      !response ||
      typeof response !== "object" ||
      Array.isArray(response) ||
      !response.app ||
      typeof response.app !== "object" ||
      Array.isArray(response.app) ||
      response.app.name !== process.argv[1]
    ) {
      process.exit(1);
    }
  ' "$APP" || fail "La aplicación devuelta por Heroku no es $APP."
}

parse_status_output() {
  node -e '
    const lines = require("node:fs").readFileSync(0, "utf8").split(/\r?\n/);
    for (const line of lines) {
      let status;
      try {
        status = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        status &&
        status.formatVersion === 1 &&
        status.stage === "prod" &&
        typeof status.database === "string" &&
        status.database.length > 0 &&
        typeof status.ledgerExists === "boolean" &&
        typeof status.ledgerTable === "string" &&
        Number.isInteger(status.compiledMigrations) &&
        Number.isInteger(status.appliedCount) &&
        Array.isArray(status.pending) &&
        status.pending.every((name) => typeof name === "string" && name.length > 0) &&
        new Set(status.pending).size === status.pending.length
      ) {
        process.stdout.write(JSON.stringify(status));
        process.exit(0);
      }
    }
    process.exit(1);
  '
}

parse_attachment_status() {
  node -e '
    const lines = require("node:fs").readFileSync(0, "utf8").split(/\r?\n/);
    const results = [];
    for (const line of lines) {
      let value;
      try {
        value = JSON.parse(line.trim());
      } catch {
        continue;
      }
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 4 &&
        typeof value.database === "string" &&
        value.database.length > 0 &&
        Number.isSafeInteger(value.ledgerRows) &&
        Number.isSafeInteger(value.distinctNames) &&
        Number.isSafeInteger(value.knownLegacyOrphanCount)
      ) {
        results.push(value);
      }
    }
    if (results.length !== 1) process.exit(1);
    process.stdout.write(JSON.stringify(results[0]));
  '
}

fetch_attachment_status() {
  local output
  output="$(heroku pg:psql "$DATABASE_ATTACHMENT" --app "$APP" --command "SELECT json_build_object('database', current_database(), 'ledgerRows', (SELECT count(*) FROM migrations), 'distinctNames', (SELECT count(DISTINCT name) FROM migrations), 'knownLegacyOrphanCount', (SELECT count(*) FROM migrations WHERE name = '$LEGACY_LEDGER_ONLY_MIGRATION'))::text;")" || return 1
  ATTACHMENT_STATUS_JSON="$(printf '%s\n' "$output" | parse_attachment_status)" || return 1
}

validate_migration_inventory() {
  local status_json="$1"
  local attachment_json="$2"
  local phase="$3"
  node -e '
    const [statusText, attachmentText, phase, expectedPendingCsv] = process.argv.slice(1);
    const status = JSON.parse(statusText);
    const attachment = JSON.parse(attachmentText);
    const expectedPending = expectedPendingCsv.split(",");
    const expected = phase === "post" ? [] : expectedPending;
    const matchedCompiled = status.compiledMigrations - status.pending.length;
    const matchedLedger = attachment.distinctNames - attachment.knownLegacyOrphanCount;
    if (
      status.pending.length !== expected.length ||
      status.pending.some((name, index) => name !== expected[index]) ||
      status.database !== attachment.database ||
      status.appliedCount !== attachment.ledgerRows ||
      attachment.ledgerRows !== attachment.distinctNames ||
      attachment.knownLegacyOrphanCount !== 1 ||
      matchedCompiled !== matchedLedger
    ) {
      process.exit(1);
    }
  ' "$status_json" "$attachment_json" "$phase" "$EXPECTED_PENDING_CSV"
}

same_attachment_snapshot() {
  node -e '
    const [before, after] = process.argv.slice(1).map((value) => JSON.parse(value));
    for (const key of ["database", "ledgerRows", "distinctNames", "knownLegacyOrphanCount"]) {
      if (before[key] !== after[key]) process.exit(1);
    }
  ' "$1" "$2"
}

fetch_status() {
  local output
  output="$(heroku run --app "$APP" --no-tty --exit-code -- pnpm run db:status --json)" || return 1
  STATUS_JSON="$(printf '%s\n' "$output" | parse_status_output)" || return 1
  node -e '
    const status = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const invalidName = status.pending.some(
      (name) =>
        name.trim() !== name ||
        name.includes(":") ||
        name.includes(",") ||
        name.includes("\n") ||
        name.includes("\r"),
    );
    if (invalidName) process.exit(1);
  ' <<<"$STATUS_JSON"
}

json_database() {
  node -e 'const s = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.stdout.write(s.database);' <<<"$1"
}

json_pending_csv() {
  node -e 'const s = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.stdout.write(s.pending.join(","));' <<<"$1"
}

json_pending_count() {
  node -e 'const s = JSON.parse(require("node:fs").readFileSync(0, "utf8")); process.stdout.write(String(s.pending.length));' <<<"$1"
}

json_ledger_exists() {
  node -e 'const s = JSON.parse(require("node:fs").readFileSync(0, "utf8")); if (s.ledgerExists) process.exit(0); process.exit(1);' <<<"$1"
}

same_pending_snapshot() {
  node -e '
    const [before, after] = process.argv.slice(1).map((value) => JSON.parse(value));
    if (before.database !== after.database) process.exit(1);
    if (before.ledgerTable !== after.ledgerTable) process.exit(1);
    if (before.compiledMigrations !== after.compiledMigrations) process.exit(1);
    if (before.appliedCount !== after.appliedCount) process.exit(1);
    if (before.pending.length !== after.pending.length) process.exit(1);
    if (before.pending.some((name, index) => name !== after.pending[index])) process.exit(1);
  ' "$1" "$2"
}

show_status() {
  node -e '
    const status = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    console.log(`Ledger: ${status.ledgerExists ? status.ledgerTable : `${status.ledgerTable} (no existe)`}`);
    console.log(`Migraciones compiladas: ${status.compiledMigrations}`);
    console.log(`Aplicadas: ${status.appliedCount}`);
    console.log(`Pendientes: ${status.pending.length}`);
    for (const name of status.pending) console.log(`  - ${name}`);
  ' <<<"$1"
}

prompt_exact() {
  local message="$1"
  local expected="$2"
  local answer
  if ! read -r -p "$message" answer; then
    fail 'No se recibió confirmación interactiva.'
  fi
  [[ "$answer" == "$expected" ]] || fail 'Confirmación no válida; no se ejecutaron más operaciones.'
}

require_tools

printf 'Aplicación verificada: %s\n' "$APP"
printf 'Release actual (revisión manual):\n'
heroku releases --app "$APP" || fail 'No se pudo consultar el release actual.'

if ! fetch_status; then
  fail 'No se pudo consultar db:status --json en Heroku.'
fi
STATUS_INITIAL="$STATUS_JSON"
if ! json_ledger_exists "$STATUS_INITIAL"; then
  fail 'El ledger no existe; detente y reconcilia su estado antes de migrar.'
fi

pending_count="$(json_pending_count "$STATUS_INITIAL")"
if [[ "$pending_count" == "0" ]]; then
  printf 'No hay migraciones pendientes. No se creó backup ni se ejecutaron migraciones.\n'
  heroku run --app "$APP" --no-tty --exit-code -- pnpm run db:check || fail 'db:check no confirmó un ledger al día.'
  exit 0
fi

database_name="$(heroku config:get DB_NAME --app "$APP")" || fail 'No se pudo consultar DB_NAME.'
[[ -n "$database_name" && "$database_name" != *$'\n'* ]] || fail 'DB_NAME está vacío o es ambiguo.'
[[ "$database_name" != *:* ]] || fail 'DB_NAME contiene un separador no compatible con la confirmación de db:migrate.'
[[ "$(json_database "$STATUS_INITIAL")" == "$database_name" ]] || fail 'DB_NAME no coincide exactamente con la base que usa TypeORM.'

printf 'Destino del runner (DB_NAME): %s\n' "$database_name"
printf 'Attachment que se respaldará: %s\n' "$DATABASE_ATTACHMENT"
if ! fetch_attachment_status; then
  fail 'No se pudo verificar mediante SELECT la identidad del attachment y su ledger.'
fi
ATTACHMENT_STATUS_INITIAL="$ATTACHMENT_STATUS_JSON"
if ! validate_migration_inventory "$STATUS_INITIAL" "$ATTACHMENT_STATUS_INITIAL" pre; then
  fail 'El destino PostgreSQL o el inventario de migraciones no coincide con el estado esperado.'
fi
attachment_database="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).database);' "$ATTACHMENT_STATUS_INITIAL")"
printf 'Base del attachment verificada por SELECT current_database(): %s\n' "$attachment_database"
printf 'Ledger: %s filas distintas; registro histórico conocido fuera del código compilado: %s.\n' "$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).ledgerRows));' "$ATTACHMENT_STATUS_INITIAL")" "$LEGACY_LEDGER_ONLY_MIGRATION"
printf 'Migraciones pendientes, en orden:\n'
show_status "$STATUS_INITIAL"

destination_ack="DESTINO $database_name"
prompt_exact "Confirma que current_database() del attachment coincide exactamente con DB_NAME. Escribe '$destination_ack': " "$destination_ack"

pending_csv="$(json_pending_csv "$STATUS_INITIAL")"
confirmation="$database_name:$pending_csv"
authorization="AUTORIZO MIGRAR $APP $database_name $pending_csv COMPATIBLE_O_VENTANA_COORDINADA"
printf '\nOperaciones previstas:\n'
printf '1. Crear un backup del attachment %s.\n' "$DATABASE_ATTACHMENT"
printf '2. Revalidar exactamente la base y la lista completa de migraciones.\n'
printf '3. Ejecutar una sola vez db:migrate con --confirm <DB_NAME>:<lista ordenada>.\n'
printf '4. Comprobar db:status y db:check.\n'
printf 'Antes de continuar, confirma compatibilidad con el release y una ventana coordinada si hace falta.\n'
printf 'Al autorizar, declaras que el cambio es compatible o que la ventana coordinada ya está preparada.\n'
prompt_exact "Para autorizar estas operaciones, escribe '$authorization': " "$authorization"

backup_output="$(heroku pg:backups:capture "$DATABASE_ATTACHMENT" --app "$APP")" || {
  printf '%s\n' "$backup_output"
  fail 'Falló la creación del backup; no se ejecutó db:migrate.'
}
printf '%s\n' "$backup_output"

if ! read -r -p 'Escribe el ID exacto del backup recién creado (por ejemplo b123): ' backup_id; then
  fail 'No se recibió un ID de backup.'
fi
case "$backup_id" in
  b[0-9]*) ;;
  *) fail 'El ID de backup no tiene el formato esperado.' ;;
esac
case "${backup_id#b}" in
  *[!0-9]*) fail 'El ID de backup no tiene el formato esperado.' ;;
esac

backup_info="$(heroku pg:backups:info "$backup_id" --app "$APP")" || fail 'No se pudo verificar el backup; no se ejecutó db:migrate.'
printf 'Información del backup %s:\n%s\n' "$backup_id" "$backup_info"
prompt_exact "Si el estado es Completed y corresponde a $DATABASE_ATTACHMENT/$database_name, escribe 'BACKUP COMPLETED $backup_id $database_name': " "BACKUP COMPLETED $backup_id $database_name"

database_name_now="$(heroku config:get DB_NAME --app "$APP")" || fail 'No se pudo revalidar DB_NAME.'
[[ "$database_name_now" == "$database_name" ]] || fail 'DB_NAME cambió; no se ejecutó db:migrate.'
if ! fetch_status; then
  fail 'No se pudo revalidar db:status; no se ejecutó db:migrate.'
fi
if ! json_ledger_exists "$STATUS_JSON" || ! same_pending_snapshot "$STATUS_INITIAL" "$STATUS_JSON"; then
  fail 'Cambió el ledger, la base o la lista/orden de migraciones; no se ejecutó db:migrate.'
fi
if ! fetch_attachment_status || ! validate_migration_inventory "$STATUS_JSON" "$ATTACHMENT_STATUS_JSON" pre || ! same_attachment_snapshot "$ATTACHMENT_STATUS_INITIAL" "$ATTACHMENT_STATUS_JSON"; then
  fail 'Cambió la identidad PostgreSQL o el inventario del ledger; no se ejecutó db:migrate.'
fi

printf 'Revalidación correcta. Ejecutando db:migrate una única vez.\n'
if migration_output="$(heroku run --app "$APP" --no-tty --exit-code -- pnpm run db:migrate --confirm "$confirmation")"; then
  printf '%s\n' "$migration_output"
else
  migration_exit=$?
  printf '%s\n' "$migration_output" >&2
  fail "db:migrate terminó con código $migration_exit. No se reintentará automáticamente."
fi

verification_ok=1
if fetch_status; then
  STATUS_AFTER="$STATUS_JSON"
  show_status "$STATUS_AFTER"
  if ! json_ledger_exists "$STATUS_AFTER" || ! fetch_attachment_status || ! validate_migration_inventory "$STATUS_AFTER" "$ATTACHMENT_STATUS_JSON" post; then
    printf 'db:status detectó un ledger ausente o migraciones pendientes.\n' >&2
    verification_ok=0
  fi
else
  printf 'No se pudo verificar db:status después de la migración.\n' >&2
  verification_ok=0
fi

if check_output="$(heroku run --app "$APP" --no-tty --exit-code -- pnpm run db:check)"; then
  printf '%s\n' "$check_output"
else
  check_exit=$?
  printf '%s\n' "$check_output" >&2
  printf 'db:check terminó con código %s.\n' "$check_exit" >&2
  verification_ok=0
fi

[[ "$verification_ok" == "1" ]] || fail 'La verificación posterior no se completó correctamente; no se repetirá la migración.'
printf 'Migraciones y ledger verificados. Comprueba esquema, datos e API según el runbook.\n'
