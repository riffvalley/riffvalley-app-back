# Runbook de migraciones PostgreSQL

## Garantías de despliegue

- PostgreSQL se migra manualmente, en una operación separada del deploy. Mantén `migrationsRun: false`, `synchronize: false`, `Procfile` sin fase `release`, y NestJS sin ejecución de migraciones durante el arranque.
- Heroku Automatic Deploys publica código únicamente; no dispara `db:migrate`. El comando manual debe ejecutarse explícitamente en un one-off dyno y con autorización de producción.
- `migration:roles` solo ejecuta la cadena específica de roles. No se usa para migraciones futuras.
- No repitas una migración tras un error. Detén el procedimiento y consulta el estado con `db:status` en modo de lectura.

## Crear y revisar en desarrollo

1.  Revisa `package.json`, `src/data-source.ts`, `src/app.module.ts`, `Procfile`, entidades relacionadas y migraciones existentes. Comprueba `git status` para preservar cambios ajenos.
2.  Verifica `STAGE`, host, puerto, base y usuario sin mostrar contraseñas. Configura explícitamente valores locales para impedir que dotenv redirija la conexión a una base persistente.
3.  Crea una migración vacía para SQL manual o backfill:

        yarn migration:create src/migrations/AddArtistSearchIndex

    Para generar diferencias a partir de entidades, apunta a PostgreSQL local verificado y aislado:

        STAGE=dev DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=rv_migrations_test DB_USERNAME=postgres DB_PASSWORD='<password-local>' yarn migration:generate src/migrations/AddArtistSearchIndex

4.  Revisa `up()` y `down()` completos: pérdida de datos, locks, constraints, defaults, backfills e índices. Las migraciones publicadas/aplicadas son inmutables.
5.  Prueba el flujo sobre una base PostgreSQL desechable o aislada, con fixtures representativos. Sincroniza antes el artefacto compilado:

        yarn build
        STAGE=dev DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=rv_migrations_test DB_USERNAME=postgres DB_PASSWORD='<password-local>' yarn db:status
        STAGE=dev DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=rv_migrations_test DB_USERNAME=postgres DB_PASSWORD='<password-local>' yarn db:migrate
        STAGE=dev DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=rv_migrations_test DB_USERNAME=postgres DB_PASSWORD='<password-local>' yarn db:check

    Verifica además esquema, datos, ledger y comportamiento del código. Si no hay PostgreSQL aislado, no cambies una base persistente para sustituir esta prueba.

## Consultar pendientes sin escribir

`yarn db:status` carga el datasource y migraciones JavaScript de `dist`, pregunta si existe la tabla ledger y lee nombres por `SELECT`. Si el ledger no existe, informa que todas están pendientes y no lo crea. `yarn db:check` da código distinto de cero si falta el ledger o quedan pendientes. Ambos comandos desactivan `installExtensions` durante la inicialización. No uses `typeorm migration:show` como consulta de solo lectura: en TypeORM 0.3.26, `showMigrations()` crea la tabla ledger si falta.

Los comandos requieren `yarn build` y las variables `DB_HOST`, `DB_NAME`, `DB_USERNAME` y `DB_PASSWORD`; `DB_PORT` es opcional. El datasource carga `.env`; confirma y sobrescribe el destino antes de invocarlos. En producción `STAGE=prod` selecciona SSL y el artefacto compilado.

### Heroku `spammusic-back`

Estos ejemplos consultan exclusivamente; no ejecutan migraciones:

    heroku run --app spammusic-back -- yarn db:status
    heroku run --app spammusic-back -- yarn db:check

Confirma la app, release, base adjunta y variables del datasource antes de la consulta. El dyno debe usar el slug desplegado, con `dist/data-source.js` y `dist/migrations/*.js`.

## Despliegue y ejecución manual

Secuencia mínima de producción:

1.  Revisa la lista ordenada de pendientes con `yarn db:status` y confirma que el release candidato incluye exactamente esas migraciones.
2.  Comprueba compatibilidad del código desplegado con los esquemas antes y después del cambio. Despliega primero código compatible cuando se use una transición expand/contract.
3.  Captura un backup Heroku antes de tocar datos y confirma que terminó correctamente:

        heroku pg:backups:capture --app spammusic-back
        heroku pg:backups --app spammusic-back

    Conserva el identificador del backup, confirma que corresponde a la base objetivo y que es reciente para la ventana. No restaures como parte de este paso.

4.  Consulta el estado en el release nuevo. Copia los nombres ordenados exactos de la lista pendiente y revisa locks, transacciones, duración, escrituras activas y necesidad de maintenance.
5.  Solicita autorización explícita para app, base, release y lista ordenada exacta. `db:migrate` con `STAGE=prod` falla cerrado si la confirmación no coincide con `DB_NAME` y con todas las pendientes:

        heroku run --app spammusic-back -- yarn db:migrate --confirm '<DB_NAME>:<Migracion1,Migracion2>'

Sustituye placeholders con valores verificados. No pegues credenciales en la terminal ni en el repositorio. El comando aplica todas las migraciones enumeradas, en el orden TypeORM, mediante `DataSource.runMigrations()`; no usa `ts-node`. Si detecta la cadena específica de roles pendiente, se detiene: esa cadena solo se gestiona con su `yarn migration:roles` y preflight propios.

6.  Tras éxito, comprueba ledger y pendientes:

        heroku run --app spammusic-back -- yarn db:status
        heroku run --app spammusic-back -- yarn db:check

    Consulta el esquema y valida invariantes/conteos de datos con SQL de solo lectura. Después verifica salud, logs y endpoints de API. Registra comprobaciones no realizadas como tales.

Ante cualquier error, detente. No repitas automáticamente el comando ni ejecutes `migration:revert`, rollback o restauración. Comprueba ledger y estado parcial con consultas de solo lectura; restauración y rollback requieren autorización específica.

## Cambios incompatibles y mantenimiento

Si la migración es incompatible con el release desplegado, no arranques una versión que consulte un esquema incompatible. Prepara una secuencia coordinada: detener tráfico y escritores, habilitar maintenance cuando corresponda, parar dynos y jobs que escriben, aplicar la migración manual autorizada, arrancar solo código compatible, verificar API y datos y reabrir tráfico. Maintenance mode no detiene por sí solo Scheduler ni los escritores ya activos. No automatices esta secuencia en un release hook ni en Automatic Deploys.

No ejecutes migraciones destructivas, restauraciones ni rollbacks sin aprobación explícita y un plan de recuperación revisado.
