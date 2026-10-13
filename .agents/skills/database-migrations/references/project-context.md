# Configuración real del backend

Reconfirma estos datos en el repositorio cada vez que uses la skill. Se observaron al crearla y pueden cambiar.

## Archivos y salvaguardas

- `src/app.module.ts` crea TypeORM con `synchronize: false` y `migrationsRun: false`. Estas opciones deben permanecer así.
- `src/data-source.ts` usa explícitamente `synchronize: false` y `migrationsRun: false`. Usa `STAGE=prod` para escoger `dist/**/*.entity.js` y `dist/migrations/*.js`; en desarrollo usa `src/**/*.entity.ts` y `src/migrations/*.ts`.
- `Procfile` contiene únicamente `web: yarn start:prod`; no debe añadirse una fase `release` para migraciones.
- NestJS no debe inicializar un runner de migraciones. Heroku Automatic Deploys despliega código y no debe ser conectado a ningún paso que aplique esquema.
- Hay notas históricas en `roadmap/roles-migration-preflight.md` que mencionan `migrationsRun: true` y un Procfile distinto. Son evidencia histórica, no configuración vigente. Contrasta siempre los archivos ejecutables citados arriba y comunica la discrepancia si afecta la tarea; no la “corrijas” dentro de una tarea de skill/análisis.

## Paquete y comandos existentes

El proyecto declara Yarn Classic 1.22.22 y Node 20.x. Usa Yarn, aunque instrucciones antiguas de `AGENTS.md` muestren comandos npm.

- `yarn migration:create src/migrations/<Nombre>` crea una migración vacía.
- `yarn migration:generate src/migrations/<Nombre>` genera diferencias de entidades contra la base indicada por `src/data-source.ts`; solo debe apuntar a una base aislada y verificada.
- `yarn migration:run` ejecuta todas las pendientes con el datasource TypeScript.
- `yarn migration:run:prod` ejecuta todas las pendientes con el datasource compilado `dist/data-source.js`.
- `yarn db:status` lista las migraciones cargadas desde `dist/migrations/*.js`, las aplicadas según el ledger existente y las pendientes. No crea el ledger ni instala extensiones.
- `yarn db:check` usa la misma consulta y termina con error si falta el ledger o quedan pendientes.
- `yarn db:migrate` aplica las pendientes usando `DataSource.runMigrations()` y valida el ledger al terminar. Con `STAGE=prod` exige `--confirm <DB_NAME>:<lista ordenada exacta>`; la lista confirmada debe coincidir con todas las pendientes observadas.
- Si la cadena específica `MigrateCanonicalUserRoles1791910000000` / `MigrateUsersToSingleRole1791920000000` aparece pendiente, `db:migrate` se detiene y deriva a `yarn migration:roles` tras su preflight. Este guard no modifica el runner ni automatiza esa migración.
- Los tres `db:*` requieren `yarn build` antes y ejecutan JavaScript compilado, sin `ts-node`. Su inspección de ledger evita los métodos `showMigrations()`/`getExecutedMigrations()` de TypeORM 0.3.26 porque crean la tabla si no existe.
- `yarn migration:revert` revierte la última migración con el datasource TypeScript. No usar automáticamente; en producción requiere autorización específica y un plan de recuperación.
- `yarn migration:roles` ejecuta únicamente la cadena de migración de roles y comprueba condiciones particulares de esa cadena. No es un comando general para futuras migraciones.
- `migration:roles` aplica una cadena de roles y validaciones particulares; no es el runner general y su filtro no se generaliza.

## Conexión y ledger

`src/data-source.ts` toma `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME` y `DB_PASSWORD`; carga `.env` mediante dotenv y activa SSL cuando `STAGE=prod`. Los comandos `db:*` exigen host, base, usuario y contraseña antes de conectar. Confirma que host/base correspondan al destino y no asumas que `DATABASE_URL` por sí sola configura ese datasource.

No se configura otro nombre de ledger en el datasource, por lo que TypeORM usa su tabla predeterminada `migrations` (en el esquema efectivo de la conexión, normalmente `public`). `db:status` consulta si existe y lee solo los nombres ordenados por ID; si falta, informa todas como pendientes sin crear la tabla. Nunca reconstruyas el ledger para “arreglar” discrepancias. El comando no escribe en esquema ni datos; la inicialización desactiva `installExtensions`.

La consulta mínima del ledger, una vez confirmado esquema y tabla, es:

    SELECT id, timestamp, name
    FROM public.migrations
    ORDER BY timestamp, id;

En una consulta SQL directa, envuélvela en `BEGIN READ ONLY` y `ROLLBACK`. No consultes filas de negocio para averiguar el estado del ledger.
