# Auditoría de `src/roles-migration/`

**Estado:** BC-ROLES-MIG-1 completada (2026-10-22). Se comprobaron los destinos activos, se retiró el runner y su infraestructura, y se conservaron las dos migraciones TypeORM. No se ejecutaron migraciones ni se modificaron datos.

## Inventario

| Archivo | Responsabilidad |
|---|---|
| `src/roles-migration/run-roles-migration-chain.ts` | Archivo retirado. Era el runner TypeORM de la cadena histórica, con validación de ledger/snapshots y adaptación de resultado para la migración legacy. |

No había módulos Nest ni servicios de dominio. El directorio se eliminó.

## Uso y referencias actuales

- Se retiraron el comando `migration:roles` de `package.json` y el puente `scripts/run-roles-migration-chain.ts`.
- Se retiraron `src/migrations/__tests__/roles-migration-discovery.spec.ts` y los casos de integración que dependían del runner en `src/migrations/1791920000000-MigrateUsersToSingleRole.spec.ts`. Se conservan las pruebas independientes de ambas migraciones.
- Se retiró el guard específico de roles de `scripts/db-migrations.js` y el bloqueo equivalente de `scripts/db-migrate-heroku.sh`; el flujo general de `db:migrate` y el asistente siguen en su lugar.
- README, skill de migraciones y Backend Architecture ya no presentan el runner como procedimiento vigente. Los roadmaps de Roles conservan el registro histórico de su ejecución.
- La búsqueda previa no encontró invocaciones automáticas en `.github`, `Procfile` ni scripts de inicio; CI no dependía del runner.

## Estado de la migración y dependencia

La cadena consta de `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000000`. Se confirmó el estado actual con consultas de solo lectura:

| Destino activo | Identificación | Ledger de roles | Esquema |
|---|---|---|---|
| Desarrollo local | `.env`: `STAGE=dev`, `localhost:5432/SpamMusicDB`; contenedor `spammusicdb` activo | Ambas identidades presentes (timestamps `1791910000000` y `1791920000000`) | `users.role text NOT NULL DEFAULT 'user'`; no existe `users.roles`; snapshots de las dos migraciones presentes |
| Producción | App Heroku `spammusic-back`, release activo v342, attachment PostgreSQL `DATABASE` | Ambas identidades presentes (timestamps `1791910000000` y `1791920000000`) | La consulta confirmó ledger; el despliegue de producción del 2026-10-14 y la comprobación del 2026-10-21 documentan el esquema final |

Las dos consultas terminaron con `ROLLBACK`. No se encontró una configuración de otros destinos en `.env.template`, README ni los procedimientos de despliegue revisados.

No queda un proceso de aplicación o despliegue que necesite el runner. Los destinos configurados y activos fueron comprobados; ambos ledger registran las dos migraciones. `db:migrate` y el asistente de Heroku conservan sus procedimientos generales.

## Recomendación

**Decisión ejecutada: eliminar `src/roles-migration/` y la infraestructura exclusiva del runner.** Los ledgers activos confirmados no dependen ya de esa herramienta.

Archivos y referencias retirados o actualizados:

1. `src/roles-migration/run-roles-migration-chain.ts` y el comando `migration:roles` de `package.json`.
2. El puente `scripts/run-roles-migration-chain.ts`, la suite específica `src/migrations/__tests__/roles-migration-discovery.spec.ts` y los casos de cadena que importan el runner desde `src/migrations/1791920000000-MigrateUsersToSingleRole.spec.ts`.
3. El bloqueo específico de `scripts/db-migrations.js`, su constante/export y los casos asociados en `src/migrations/__tests__/db-migrations.spec.ts`; además, el bucle de rechazo de la cadena en `scripts/db-migrate-heroku.sh`.
4. Las referencias ejecutables en README, skill de migraciones y Backend Architecture. Los roadmaps de Roles conservan los comandos como evidencia histórica de operaciones ya completadas.

Se conservaron las migraciones históricas `src/migrations/1791910000000-MigrateCanonicalUserRoles.ts` y `src/migrations/1791920000000-MigrateUsersToSingleRole.ts`, así como las pruebas independientes de su lógica. También se conservaron los casos de integración que ejercitan directamente las migraciones individuales; se retiraron los casos que solo cubrían la cadena del runner.

**Riesgo residual:** un destino futuro restaurado desde un backup anterior o no inventariado podría reintroducir la cadena pendiente. No hay destinos activos sin confirmar en el inventario observado; cualquier destino nuevo debe usar el flujo de migraciones general revisado antes de conectarse.

## Verificación y límites

**Verificaciones ejecutadas:** Jest focalizado aprobó 27 tests en las suites de `db-migrations` y la migración histórica; la suite opt-in de `1791920000000` quedó omitida (15 tests) al no estar definida `ROLE_MIGRATION_TEST_URL`. La suite aislada del asistente Heroku aprobó. Pasaron `quality:structure` (41 módulos, 9 hallazgos ya baselined, 0 nuevos), `quality:types` (5 hallazgos ya baselined, 0 nuevos), `quality:typecheck` (0 errores), build, lint focal de la migración conservada, `bash -n` y `git diff --check`. La búsqueda de referencias ejecutables al runner en package/scripts/src/skills/README/Backend Architecture no devolvió coincidencias.

`quality:lint` global reportó 6 nuevos diagnósticos de Prettier en `src/identity/auth/__tests__/auth-session-login.http.spec.ts`, que ya estaba modificado antes de esta tarea; se dejó intacto. La invocación directa de ESLint sobre `scripts/db-migrations.js` y `src/migrations/__tests__/db-migrations.spec.ts` también mostró 6 infracciones `no-var-requires` históricas en esas rutas; el gate global las mantiene en baseline. No se modificó `.impeccable/config.json` ni ningún baseline.
