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

`db:status` lista migraciones aplicadas y pendientes; `db:migrate` aplica las pendientes manualmente; `db:check` falla si falta el ledger o quedan pendientes. Confirma las variables de `.env` antes de conectar.

### Producción en Heroku

El despliegue automático de Heroku nunca ejecuta migraciones. En `spammusic-back`, consulta primero las pendientes y prepara un backup antes de modificar la base:

```sh
heroku run --app spammusic-back -- yarn db:status
heroku pg:backups:capture --app spammusic-back
heroku pg:backups --app spammusic-back
```

Verifica la app, base, release, backup completado y lista ordenada de migraciones. La producción requiere ejecución y confirmación manuales; autoriza explícitamente la base y todas las pendientes observadas:

```sh
heroku run --app spammusic-back -- yarn db:migrate --confirm '<DB_NAME>:<Migracion1,Migracion2>'
heroku run --app spammusic-back -- yarn db:status
heroku run --app spammusic-back -- yarn db:check
```

Después, valida el esquema y los datos afectados, el ledger y el funcionamiento de la API. Ante un error, detente y no repitas la migración automáticamente.

Si hay cambios incompatibles de esquema, coordina el código y la migración: despliega primero una versión compatible o prepara una ventana de mantenimiento, deteniendo tráfico y procesos que escriban antes de migrar y reabriendo el servicio tras validarlo.

Para preflight, recuperación y procedimientos detallados, consulta el [runbook de migraciones](.agents/skills/database-migrations/references/operations-runbook.md).
