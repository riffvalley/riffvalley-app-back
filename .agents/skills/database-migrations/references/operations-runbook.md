# Runbook de migraciones PostgreSQL

## Garantías de despliegue

- PostgreSQL se migra manualmente, en una operación separada del deploy. `migrationsRun: false` y `synchronize: false`; el `Procfile` no tiene fase `release` de migraciones y NestJS no migra durante el arranque.
- Heroku Automatic Deploys publica código únicamente; no ejecuta migraciones. La aplicación de cambios de esquema requiere un comando manual autorizado.
- `migration:roles` es un runner histórico de la cadena de roles. No lo uses para migraciones futuras.
- Antes de conectar, confirma app y base destino. No muestres contraseñas, `DATABASE_URL` ni otras credenciales.

## Desarrollo local

Revisa `package.json`, `src/data-source.ts`, `src/app.module.ts`, `Procfile`, entidades y migraciones existentes. Comprueba `git status` y que `STAGE`, host, puerto y base apuntan a PostgreSQL local aislado.

Para crear un archivo vacío:

    yarn migration:create src/migrations/AddArtistSearchIndex

Para generar diferencias a partir de entidades, configura el datasource con una base local aislada y verificada:

    STAGE=dev DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=rv_migrations_test DB_USERNAME=postgres DB_PASSWORD='<password-local>' yarn migration:generate src/migrations/AddArtistSearchIndex

Revisa `up()` y `down()`, incluidos pérdida de datos, locks, constraints, defaults y backfills. Las migraciones aplicadas/publicadas son inmutables. Prueba en una base desechable o aislada. Los comandos generales usan los artefactos compilados, así que ejecuta antes `yarn build` y luego `yarn db:status`, `yarn db:migrate` y `yarn db:check` con el destino local verificado. Comprueba también el esquema, datos, ledger y comportamiento del código. No sustituyas PostgreSQL aislado por una base persistente.

## Qué muestra `db:status`

El comando informa:

- `Ledger`: nombre de la tabla de migraciones o indica que no existe.
- `Migraciones compiladas`: total de migraciones JavaScript que carga TypeORM desde `dist`.
- `Aplicadas`: número de nombres leídos del ledger.
- `Pendientes`: número de migraciones cargadas que no aparecen en el ledger.
- Una línea `- <nombre>` por cada pendiente, en el orden de ejecución de TypeORM (timestamp ascendente).

No muestra `DB_NAME`, host, release ni los nombres de cada migración ya aplicada. La consulta de estado es de solo lectura: comprueba si existe el ledger y, si existe, selecciona sus nombres. Si falta, no lo crea y considera pendientes todas las migraciones compiladas. En ese caso, detente: `db:migrate` podría crear la tabla ledger al intentar aplicar migraciones, y el ledger ausente requiere reconciliación antes de escribir. TypeORM 0.3.26 `showMigrations()` también puede crear el ledger; no lo uses como sustituto de esta consulta.

`db:check` termina correctamente si existe el ledger y no hay pendientes; falla si falta el ledger o queda alguna pendiente. `db:migrate` vuelve a consultar las pendientes antes de actuar. Si no hay pendientes, informa que no hizo cambios. En `STAGE=prod` requiere `--confirm` con la base y la lista completa en orden exacto.

## Heroku `spammusic-back`

Los comandos siguientes se ejecutan desde un one-off dyno del release actual:

    heroku run --app spammusic-back -- yarn db:status

`db:status` no proporciona el nombre de la base. Obtén únicamente la variable no secreta que usa el datasource:

    heroku config:get DB_NAME --app spammusic-back

    heroku pg:info DATABASE --app spammusic-back

`heroku pg:info DATABASE` identifica el attachment PostgreSQL. El runner usa `DB_NAME` (obtenido por separado), y `pg:backups:capture DATABASE` selecciona explícitamente ese attachment; no omitas el argumento porque Heroku usa `DATABASE_URL` por defecto. Debes confirmar que el attachment respaldado es la misma base configurada para TypeORM; si la correspondencia no es demostrable con la configuración disponible, detente. Revisa también el release desplegado:

    heroku releases --app spammusic-back

No uses `heroku config` ni consultes/imprimas `DATABASE_URL`. Si `DB_NAME` falta, está vacío o no coincide con el destino esperado, detente; no sustituyas `DATABASE`, `DATABASE_URL` ni otro valor por inferencia.

### Construir la confirmación

La sintaxis que acepta el runner es:

    --confirm '<DB_NAME>:<Migracion1,Migracion2>'

`<DB_NAME>` debe coincidir exactamente con la base configurada. Después de los dos puntos van todos los nombres que `db:status` listó como pendientes, separados por comas y en el mismo orden. Copia los nombres literalmente; no uses nombres de archivo si difieren de las líneas de estado, no omitas migraciones y no reordenes la lista. El runner compara el nombre de base y la lista completa ordenada contra una consulta nueva al ledger.

Antes de ejecutar, crea un backup del attachment `DATABASE` y comprueba en la lista que su estado sea `Completed`:

    heroku pg:backups:capture DATABASE --app spammusic-back
    heroku pg:backups --app spammusic-back

Conserva el ID del backup. Confirma su estado y base asociada:

    heroku pg:backups:info BACKUP_ID --app spammusic-back

No continúes hasta confirmar que terminó correctamente y corresponde a la base objetivo. Después de verificar DB_NAME, release, compatibilidad y pendientes, solicita autorización explícita para esa app/base y esa lista exacta. Ejecuta solo entonces:

    heroku run --app spammusic-back -- yarn db:migrate --confirm '<DB_NAME>:<Migracion1,Migracion2>'

Sustituye placeholders con valores obtenidos y revisados; no pegues secretos. El runner rechaza una base o una lista/orden distintos de lo que observó. La cadena específica de roles, si apareciera pendiente, se detiene en `db:migrate` y conserva su procedimiento histórico específico; no la incluyas en esta ejecución general.

### Ejemplo ficticio completo

Los nombres, recuentos, base e ID de backup de este ejemplo son **inventados**. La salida real debe copiarse del one-off dyno de `spammusic-back`.

Consulta inicial:

    heroku run --app spammusic-back -- yarn db:status

Salida ilustrativa (abreviada):

    Ledger: migrations
    Migraciones compiladas: 92
    Aplicadas: 90
    Pendientes: 2
      - AddArtistSearchIndex1760000000000
      - AddArtistStatus1760000001000

Antes de ejecutar el ejemplo, captura el backup y revisa que aparezca como completado:

    heroku pg:backups:capture DATABASE --app spammusic-back
    heroku pg:backups --app spammusic-back
    heroku pg:backups:info b019 --app spammusic-back

Supongamos que `heroku config:get DB_NAME --app spammusic-back` devuelve `riffvalley_demo_prod`, `pg:info DATABASE` identifica el attachment respaldado como el de TypeORM y `pg:backups:info b019` confirma que el backup terminó correctamente. La lista se mantiene en el orden mostrado, por lo que la confirmación exacta es:

    riffvalley_demo_prod:AddArtistSearchIndex1760000000000,AddArtistStatus1760000001000

Tras confirmar autorización, ejecutarías:

    heroku run --app spammusic-back -- yarn db:migrate --confirm 'riffvalley_demo_prod:AddArtistSearchIndex1760000000000,AddArtistStatus1760000001000'

Verificación posterior:

    heroku run --app spammusic-back -- yarn db:status
    heroku run --app spammusic-back -- yarn db:check

El resultado esperado es `Pendientes: 0` y `db:check` sin error. Comprueba además las columnas/constraints afectadas, datos e invariantes y endpoints de la API. `db:status` no valida por sí solo el contenido del esquema ni el funcionamiento de la aplicación.

## Casos especiales y recuperación

- **No hay pendientes:** si `db:status` informa `Pendientes: 0`, no captures un backup solo para migrar ni ejecutes `db:migrate`. Ejecuta `heroku run --app spammusic-back -- yarn db:check` para confirmar que el ledger está presente y al día.
- **La lista cambia entre consulta y ejecución:** `db:migrate` vuelve a leer el ledger. Si cambió un nombre, cantidad u orden, falla la comparación de `--confirm` antes de ejecutar. Detente, consulta otra vez `db:status`, revisa el release y la nueva lista, confirma el backup y solicita autorización para el conjunto actualizado. No reutilices la confirmación antigua.
- **Confirmación rechazada:** compara `DB_NAME` de `heroku config:get` y todas las líneas pendientes en orden. Comprueba que no haya espacios/comas añadidos o migraciones omitidas. No fuerces el runner; si los datos no coinciden, detente y revisa app, release y configuración.
- **Migración falla:** detente. No repitas `db:migrate`, no ejecutes `migration:revert` y no restaures automáticamente. Inspecciona `db:status` y el ledger mediante consultas de solo lectura; determina el estado parcial y prepara recuperación con autorización explícita.
- **Cambio incompatible con el código desplegado:** no arranques el backend contra un esquema incompatible. Prefiere una secuencia expand/contract y despliega primero código compatible. Si no es posible, coordina una ventana: maintenance cuando corresponda, detén tráfico y procesos escritores, aplica solo la migración autorizada, arranca código compatible y valida API/datos antes de reabrir tráfico. Maintenance no detiene por sí solo Scheduler ni jobs ya iniciados.

No ejecutes migraciones destructivas, restauraciones ni rollbacks automáticamente. Para el preflight detallado y recuperación, conserva los resultados y decisiones en el registro operativo del proyecto.
