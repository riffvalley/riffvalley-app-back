#!/usr/bin/env bash
set -Eeuo pipefail

project='con-b04f-validation'
compose=(docker compose -p "$project" -f docker-compose.con-b04f.yml)

existing_containers="$("${compose[@]}" ps -aq)"
existing_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$project")"
if [[ -n "$existing_containers" || -n "$existing_volumes" ]]; then
  printf 'Refusing to reuse existing Docker resources for project %s.\n' "$project" >&2
  exit 2
fi

cleanup() {
  "${compose[@]}" down --volumes --remove-orphans
}
trap cleanup EXIT

"${compose[@]}" build runner
"${compose[@]}" up -d postgres geocoder-mock
"${compose[@]}" run --rm runner pnpm run verify
"${compose[@]}" run --rm -e STAGE=dev -e DB_HOST=127.0.0.1 -e DB_PORT=55472 -e DB_NAME=con_b04a_con_b04f_receipts -e DB_USERNAME=con_b04f_runner -e DB_PASSWORD=con_b04f_local_only -e DATABASE_URL= -e CON_B04A_PG_INTEGRATION=1 runner pnpm exec jest --config ./package.json --runInBand --testTimeout=120000 src/catalog/import/receipts/__tests__/import-row-receipts.postgres.integration.spec.ts
"${compose[@]}" run --rm --no-deps -e STAGE=dev -e DB_HOST=127.0.0.1 -e DB_PORT=55472 -e DB_NAME=con_b04f_events -e DB_USERNAME=con_b04f_runner -e DB_PASSWORD=con_b04f_local_only -e DATABASE_URL= -e CON_B04F_DB_NAME=con_b04f_events -e CON_B04F_PG_INTEGRATION=1 runner pnpm exec jest --config ./package.json --runInBand --testTimeout=120000 src/migrations/__tests__/concert-import-postgres.integration.spec.ts
"${compose[@]}" run --rm --no-deps -e STAGE=dev -e DB_HOST=127.0.0.1 -e DB_PORT=55472 -e DB_NAME=con_b04f_events -e DB_USERNAME=con_b04f_runner -e DB_PASSWORD=con_b04f_local_only -e DATABASE_URL= -e CON_B04F_DB_NAME=con_b04f_events -e CON_B04F_PG_INTEGRATION=1 -e GEOCODING_PROVIDER_URL=http://127.0.0.1:55473 runner pnpm exec jest --config ./package.json --runInBand --testTimeout=300000 src/catalog/events/import-batch/__tests__/events-import.postgres.integration.spec.ts
