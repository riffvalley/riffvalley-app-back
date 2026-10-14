#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP="spammusic-back"
readonly DATABASE_ATTACHMENT="DATABASE"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_tools() {
  command -v heroku >/dev/null 2>&1 || fail 'No se encontró Heroku CLI.'
  command -v node >/dev/null 2>&1 || fail 'Se necesita Node.js para leer las respuestas JSON.'

  heroku auth:whoami >/dev/null || fail 'Heroku CLI no está autenticada.'

  local app_json
  app_json="$(heroku apps:info --app "$APP" --json)" || fail "No se pudo consultar la aplicación $APP."
  printf '%s' "$app_json" | node -e '
    const app = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    if (app.name !== process.argv[1]) process.exit(1);
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

fetch_status() {
  local output
  output="$(heroku run --app "$APP" --no-tty --exit-code -- yarn db:status --json)" || return 1
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
  heroku run --app "$APP" --no-tty --exit-code -- yarn db:check || fail 'db:check no confirmó un ledger al día.'
  exit 0
fi

database_name="$(heroku config:get DB_NAME --app "$APP")" || fail 'No se pudo consultar DB_NAME.'
[[ -n "$database_name" && "$database_name" != *$'\n'* ]] || fail 'DB_NAME está vacío o es ambiguo.'
[[ "$database_name" != *:* ]] || fail 'DB_NAME contiene un separador no compatible con la confirmación de db:migrate.'
[[ "$(json_database "$STATUS_INITIAL")" == "$database_name" ]] || fail 'DB_NAME no coincide exactamente con la base que usa TypeORM.'

printf 'Destino del runner (DB_NAME): %s\n' "$database_name"
printf 'Attachment que se respaldará: %s\n' "$DATABASE_ATTACHMENT"
printf 'Identidad del attachment (revisión manual; no se muestran URLs):\n'
pg_info="$(heroku pg:info "$DATABASE_ATTACHMENT" --app "$APP")" || fail 'No se pudo consultar el attachment PostgreSQL.'
printf '%s\n' "$pg_info"
printf 'Migraciones pendientes, en orden:\n'
show_status "$STATUS_INITIAL"

destination_ack="DESTINO $database_name"
prompt_exact "Verifica que Database en pg:info coincida exactamente con DB_NAME. Escribe '$destination_ack': " "$destination_ack"

pending_csv="$(json_pending_csv "$STATUS_INITIAL")"
for role_migration in MigrateCanonicalUserRoles1791910000000 MigrateUsersToSingleRole1791920000000; do
  case ",$pending_csv," in
    *",$role_migration,"*) fail 'La cadena histórica de roles no se ejecuta con db:migrate-heroku.sh.' ;;
  esac
done

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

printf 'Revalidación correcta. Ejecutando db:migrate una única vez.\n'
if migration_output="$(heroku run --app "$APP" --no-tty --exit-code -- yarn db:migrate --confirm "$confirmation")"; then
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
  if ! json_ledger_exists "$STATUS_AFTER" || [[ "$(json_pending_count "$STATUS_AFTER")" != "0" ]]; then
    printf 'db:status detectó un ledger ausente o migraciones pendientes.\n' >&2
    verification_ok=0
  fi
else
  printf 'No se pudo verificar db:status después de la migración.\n' >&2
  verification_ok=0
fi

if check_output="$(heroku run --app "$APP" --no-tty --exit-code -- yarn db:check)"; then
  printf '%s\n' "$check_output"
else
  check_exit=$?
  printf '%s\n' "$check_output" >&2
  printf 'db:check terminó con código %s.\n' "$check_exit" >&2
  verification_ok=0
fi

[[ "$verification_ok" == "1" ]] || fail 'La verificación posterior no se completó correctamente; no se repetirá la migración.'
printf 'Migraciones y ledger verificados. Comprueba esquema, datos e API según el runbook.\n'
