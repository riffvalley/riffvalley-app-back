# Riff Valley App API

1. Clonar proyecto
2. `yarn install `

3. Levantar la base de datos

```
docker-compose up -d
```

4. Subir a git

```
git push heroku main
```

## Migraciones de base de datos

Las migraciones PostgreSQL se gestionan manualmente y son independientes de los despliegues de Heroku. `migrationsRun` y `synchronize` permanecen en `false`; ningún despliegue ni arranque de NestJS aplica migraciones automáticamente. `migration:roles` es un runner histórico específico para la cadena de roles y no debe usarse para migraciones futuras.

### Desarrollo local

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

Requiere Node 20, Heroku CLI autenticada y un release de `spammusic-back` que incluya `db:status --json`. El script comprueba app y release, muestra el attachment PostgreSQL y la lista ordenada, pide autorización, crea y verifica un backup y ejecuta `db:migrate` una sola vez. Confirma en pantalla que `Database` en `pg:info` coincide con `DB_NAME` y que el backup indica `Completed`. Si no hay pendientes, no ejecuta migraciones. No activa maintenance ni cambia dynos.

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
