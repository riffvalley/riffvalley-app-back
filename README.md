# Riff Valley App API

## Requisitos

- Node.js `20.18.1` o posterior dentro de la línea 20, o Node.js 22.
- Yarn `1.22.22` (fijado en `packageManager`; puede activarse con Corepack).
- `.nvmrc` conserva Node 20 como versión de referencia local.

1. Clonar proyecto
2. `yarn install --frozen-lockfile`

3. Levantar la base de datos

```
docker-compose up -d
```

4. Subir a git

```
git push heroku main
```

## Migraciones de base de datos

Las migraciones PostgreSQL se gestionan manualmente y son independientes de los despliegues de Heroku. `migrationsRun` y `synchronize` permanecen en `false`; ningún despliegue ni arranque de NestJS aplica migraciones automáticamente.

### Desarrollo local

#### Base vacía de desarrollo

El historial contiene 92 migraciones incrementales y no tiene una migración inicial reproducible desde cero. Algunas migraciones tempranas alteran tablas antes de que migraciones posteriores las creen. No ejecutes `db:migrate` sobre una base vacía ni sincronices entidades y después apliques las 92 migraciones.

Para preparar el esquema actual desde entidades en el PostgreSQL Docker local confirmado (`spammusicdb`, PostgreSQL 17, `localhost:5432`, base `SpamMusicDB`), configura `STAGE=dev`, `DB_HOST=localhost`, `DB_PORT=5432`, `DB_NAME=SpamMusicDB`, `DB_USERNAME` y `DB_PASSWORD`, y deja `DATABASE_URL` sin definir. Después ejecuta:

```sh
DISABLE_SCHEDULED_TASKS=true STAGE=dev yarn db:bootstrap-local
yarn db:bootstrap-local --verify-only
```

El primer comando usa `synchronize(false)` de TypeORM solo en esta herramienta explícita; no cambia `synchronize: false` de la aplicación ni crea o fabrica `public.migrations`. Si `public` contiene relaciones, solicita escribir exactamente `REINICIAR SpamMusicDB` antes de reemplazar ese esquema. Rechaza hosts remotos, bases/nombres de contenedor distintos, destinos no PostgreSQL 17, `DATABASE_URL` y objetos en otros esquemas. El segundo comando comprueba las tablas de entidades sin escribir.

Este procedimiento produce el **esquema vigente según las entidades**, sin ejecuciones históricas registradas: `yarn db:status` seguirá mostrando las 92 migraciones como pendientes. No ejecutes `db:migrate`, `migration:run` ni las migraciones históricas después de este bootstrap. Sirve para desarrollo funcional local; no es una prueba del camino de migración desde una versión anterior. Para validar migraciones hace falta una cadena inicial compatible en una base aislada separada.

`DISABLE_SCHEDULED_TASKS=true` en `STAGE=dev` desactiva únicamente los cron jobs registrados por Nest Schedule. Los endpoints, servicios, guards y autenticación permanecen habilitados; fuera de desarrollo la variable no desactiva los cron jobs.

Esto evita en local las sincronizaciones automáticas de Instagram y TikTok, el refresco programado del token de Instagram, avisos de reautenticación de Spotify/TikTok, el mantenimiento de enlaces Spotify de discos y la programación editorial de contenidos. Los workers no usan este ajuste; la revisión del repositorio no encontró workers adicionales registrados por Nest Schedule.

Crea una migración vacía para escribir SQL o un backfill, o genera una a partir de las entidades. Elige uno de estos comandos; para generar diferencias, configura `STAGE=dev` y comprueba que el datasource apunta a una base local aislada:

```sh
yarn migration:create src/migrations/AddArtistSearchIndex
yarn migration:generate src/migrations/AddArtistSearchIndex
```

Compila antes de consultar, aplicar o comprobar migraciones con los comandos generales:

```sh
yarn build
yarn db:status
yarn db:migrate
yarn db:check
```

`db:status` muestra el ledger, recuentos y nombres de migraciones pendientes en orden; no lista los nombres ya aplicados. `db:migrate` aplica las pendientes manualmente; `db:check` falla si falta el ledger o quedan pendientes. Confirma las variables de `.env` antes de conectar.

### Producción en Heroku

El método recomendado es el asistente interactivo, ejecutado desde este repositorio:

```sh
bash scripts/db-migrate-heroku.sh
```

Requiere Node 20.18.1+ o 22, Heroku CLI autenticada y un release de `spammusic-back` que incluya `db:status --json`. El script comprueba app y release, muestra el attachment PostgreSQL y la lista ordenada, pide autorización, crea y verifica un backup y ejecuta `db:migrate` una sola vez. Confirma en pantalla que `Database` en `pg:info` coincide con `DB_NAME` y que el backup indica `Completed`. Si no hay pendientes, no ejecuta migraciones. No activa maintenance ni cambia dynos.

Las migraciones siguen siendo independientes del despliegue automático de Heroku. Como alternativa, puedes seguir el procedimiento manual:

```sh
heroku run --app spammusic-back -- yarn db:status
heroku config:get DB_NAME --app spammusic-back
heroku pg:info DATABASE --app spammusic-back
```

Si el ledger no existe, detente y no migres. Si `Pendientes: 0`, no ejecutes `db:migrate`; comprueba con `heroku run --app spammusic-back -- yarn db:check`. Si hay pendientes, crea un backup y confirma que terminó correctamente:

```sh
heroku pg:backups:capture DATABASE --app spammusic-back
heroku pg:backups --app spammusic-back
```

Comprueba que el attachment de backup es la misma base que usa el datasource; si no puedes verificar la correspondencia con seguridad, detente. Revisa el release con `heroku releases --app spammusic-back` y el backup con `heroku pg:backups:info BACKUP_ID --app spammusic-back`, sustituyendo `BACKUP_ID` por el identificador obtenido. Usa el valor de `DB_NAME` y copia todos los nombres de `db:status`, en el mismo orden, para formar `DB_NAME:Migracion1,Migracion2`. La producción requiere ejecución y confirmación manuales:

```sh
heroku run --app spammusic-back -- yarn db:migrate --confirm '<DB_NAME>:<Migracion1,Migracion2>'
heroku run --app spammusic-back -- yarn db:status
heroku run --app spammusic-back -- yarn db:check
```

Después, valida el esquema y los datos afectados, el ledger y el funcionamiento de la API. Ante un error, detente y no repitas la migración automáticamente.

Si hay cambios incompatibles de esquema, coordina el código y la migración: despliega primero una versión compatible o prepara una ventana de mantenimiento, deteniendo tráfico y procesos que escriban antes de migrar y reabriendo el servicio tras validarlo.

Para preflight, recuperación y procedimientos detallados, consulta el [runbook de migraciones](.agents/skills/database-migrations/references/operations-runbook.md).
