#!/usr/bin/env bash
set -euo pipefail

# ========================
# restore_heroku_to_local.sh
# ========================
# Requisitos:
# - Docker y tu docker-compose corriendo (servicio DB = "db" en red de compose).
# - Opción descarga/streaming: Heroku CLI logueada (heroku login).
#
# Modos de uso:
#   1) Con dump local:
#      ./restore_heroku_to_local.sh --dump ./latest.dump --network spammusic-back_default --db spammusic --pgpass Codeorange01
#
#   2) Descargar backup desde Heroku y restaurar:
#      ./restore_heroku_to_local.sh --download <HEROKU_APP> --network spammusic-back_default --db spammusic --pgpass Codeorange01
#
#   3) Streaming directo (sin archivo):
#      ./restore_heroku_to_local.sh --stream <HEROKU_APP> --network spammusic-back_default --db spammusic --pgpass Codeorange01
#
# Flags:
#   --network   nombre de la red de docker compose (p.ej. spammusic-back_default) [obligatorio]
#   --db        nombre de la base de datos destino (p.ej. spammusic)              [obligatorio]
#   --pgpass    contraseña del usuario postgres local                             [obligatorio]
#   --dump      ruta al archivo .dump (modo dump local)
#   --download  nombre de la app de Heroku (descarga y usa latest.dump)
#   --stream    nombre de la app de Heroku (streaming pg_dump -> pg_restore)
#
# Notas:
# - Usa cliente Postgres del contenedor oficial (postgres:17).
# - Mata conexiones, DROP DATABASE, CREATE DATABASE y restaura con --no-owner --clean --if-exists
# - Si usas otro usuario distinto a 'postgres' en local, ajusta PGUSER abajo.

# ==============================================================================
# PROCESO DE RESTAURACIÓN DE BASE DE DATOS
# ==============================================================================
# Para evitar errores de conexión activa al restaurar desde Heroku:
#
#   PASO 1: Detener la app (libera la conexión a la DB)
#      docker stop spammusic-back-app-1
#
#   PASO 2: Ejecutar este script (Modo Streaming)
#      ./restore_heroku_to_local.sh \
#        --stream spammusic-back \
#        --network spammusic-back_default \
#        --db SpamMusicDB \
#        --pgpass Codeorange01
#      *(Ignorar errores de "transaction_timeout" o roles desconocidos)*
#
#   PASO 3: Volver a encender la app
#      docker start spammusic-back-app-1
#
#   PASO 4: Verificar
#      Ir a http://localhost:3000/api/genres
# ==============================================================================

PGUSER="postgres"
MODE=""
DUMP_PATH=""
HEROKU_APP=""
NETWORK=""
DBNAME=""
PGPASS=""

# --------- Parseo simple de argumentos ---------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump)      MODE="dump";     DUMP_PATH="${2:?}"; shift 2;;
    --download)  MODE="download"; HEROKU_APP="${2:?}"; shift 2;;
    --stream)    MODE="stream";   HEROKU_APP="${2:?}"; shift 2;;
    --network)   NETWORK="${2:?}"; shift 2;;
    --db)        DBNAME="${2:?}"; shift 2;;
    --pgpass)    PGPASS="${2:?}"; shift 2;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0;;
    *)
      echo "Argumento desconocido: $1"; exit 1;;
  esac
done

# --------- Validaciones ---------
if [[ -z "${MODE}" || -z "${NETWORK}" || -z "${DBNAME}" || -z "${PGPASS}" ]]; then
  echo "Faltan argumentos. Usa --help para ver ejemplos."; exit 1;
fi

if [[ "${MODE}" == "dump" && -z "${DUMP_PATH}" ]]; then
  echo "--dump requiere ruta a archivo .dump"; exit 1;
fi
if [[ "${MODE}" != "dump" && -z "${HEROKU_APP}" ]]; then
  echo "--download/--stream requieren nombre de app Heroku"; exit 1;
fi

# --------- Funciones auxiliares ---------
run_psql() {
  docker run --rm --network "${NETWORK}" -e PGPASSWORD="${PGPASS}" postgres:17 \
    psql -h db -U "${PGUSER}" -d postgres -v ON_ERROR_STOP=1 -c "$1"
}

recreate_db() {
  echo ">> Terminando conexiones a '${DBNAME}'…"
  run_psql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DBNAME}';" || true
  echo ">> DROP DATABASE ${DBNAME}…"
  # DBNAME va entre comillas dobles como identificador SQL: sin ellas, Postgres
  # pliega el nombre a minúsculas y esto acaba operando sobre una BD distinta
  # (p.ej. "SpamMusicDB" -> spammusicdb) dejando la BD real intacta pero
  # luego corrompida a medias por el restore --clean posterior.
  run_psql "DROP DATABASE IF EXISTS \"${DBNAME}\";"
  echo ">> CREATE DATABASE ${DBNAME}…"
  run_psql "CREATE DATABASE \"${DBNAME}\";"
}

restore_from_dump() {
  local dump_file="$1"
  echo ">> Restaurando desde ${dump_file}…"
  # AÑADIDO --no-acl
  docker run --rm --network "${NETWORK}" -e PGPASSWORD="${PGPASS}" -v "$(cd "$(dirname "$dump_file")"; pwd)":/backup postgres:17 \
    pg_restore -h db -U "${PGUSER}" -d "${DBNAME}" -Fc --no-owner --no-acl --clean --if-exists "/backup/$(basename "$dump_file")"
}

download_from_heroku() {
  echo ">> Capturando backup en Heroku (${HEROKU_APP})…"
  heroku pg:backups:capture -a "${HEROKU_APP}"
  echo ">> Descargando último backup…"
  heroku pg:backups:download -a "${HEROKU_APP}" -o latest.dump
  echo ">> Archivo descargado: $(ls -lh latest.dump)"
  DUMP_PATH="./latest.dump"
}

stream_from_heroku() {
  echo ">> Obteniendo DATABASE_URL de Heroku (${HEROKU_APP})…"
  local URL
  URL="$(heroku config:get DATABASE_URL -a "${HEROKU_APP}")"
  if [[ -z "${URL}" ]]; then echo "No se pudo obtener DATABASE_URL"; exit 1; fi

  echo ">> Streaming pg_dump -> pg_restore (sin archivo intermedio)…"
  # AÑADIDO --no-acl
  docker run --rm --network "${NETWORK}" -e PGPASSWORD="${PGPASS}" postgres:17 bash -lc \
    "PGUSER='${PGUSER}'; pg_dump -Fc '${URL}' | pg_restore -h db -U '${PGUSER}' -d '${DBNAME}' --no-owner --no-acl --clean --if-exists"
  }

post_check() {
  echo ">> Tablas en ${DBNAME}:"
  docker run --rm --network "${NETWORK}" -e PGPASSWORD="${PGPASS}" postgres:17 \
    psql -h db -U "${PGUSER}" -d "${DBNAME}" -c '\dt+' || true
}

# --------- Flujo principal ---------
echo "==> Modo: ${MODE} | Red: ${NETWORK} | DB: ${DBNAME} | Usuario: ${PGUSER}"

recreate_db

case "${MODE}" in
  dump)
    # Sanity check del archivo
    if [[ ! -f "${DUMP_PATH}" ]]; then echo "No existe ${DUMP_PATH}"; exit 1; fi
    file "${DUMP_PATH}" | grep -qi 'PostgreSQL custom database dump' || {
      echo "Advertencia: el archivo no parece un dump custom de PostgreSQL"; }
    restore_from_dump "${DUMP_PATH}"
    ;;
  download)
    download_from_heroku
    restore_from_dump "${DUMP_PATH}"
    ;;
  stream)
    stream_from_heroku
    ;;
esac

post_check
echo "==> Listo."
