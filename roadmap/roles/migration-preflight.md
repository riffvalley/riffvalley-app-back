# Preflight y migración de roles — nuevo diseño de rol único

**Estado histórico:** R.13a/R.13b y R.15a registran preflights y pruebas locales de 2026-10-13; las notas originales de esta página no describen el estado remoto final. La migración de producción y su postflight se completaron después; el registro autoritativo está en [cierre de despliegue](production-deployment.md). El runner `migration:roles` fue retirado por BC-ROLES-MIG-1 tras confirmar los ledgers activos. Los comandos de ese runner que aparecen en este documento son evidencia histórica y no están disponibles. Las menciones antiguas a Heroku sin modificar, release phase o migraciones pendientes también son históricas y quedan supersedidas.

### R.15c — Arranque del backend local (2026-10-13)

- **Permisos:** Node se ejecuta como `tottibero` (UID 1000), mientras `dist` y los archivos activos `combined-2026-10-13.log` y `error-2026-10-13.log` pertenecían a `nobody:nogroup` (UID 65534), coherente con artefactos creados desde el contenedor anterior. Se cambió el propietario del árbol `dist` y de esos dos logs a `tottibero:tottibero`, conservando contenido y modos; no se borraron archivos ni se amplió el acceso con `777`.
- **Inyección:** `AuthModule` era propietario del repositorio TypeORM de `User`, pero no registraba ni exportaba `UserRoleGuard`. Al usar `@Auth()`, Nest instancia el guard en el contexto del módulo del controlador. Se registró una única instancia de clase como provider en `AuthModule` y se exportó; los módulos protegidos que no importaban AuthModule ahora lo importan: Countries, Genres, Articles, Videos, Riff Valley Playlists, Reunions, Contents, Versions y Points. No se duplicó el guard ni se cambió la jerarquía.
- **Resultado:** `yarn --ignore-engines tsc --noEmit` pasa. `yarn --ignore-engines start:dev` compiló sin errores, Nest inicializó todos los módulos y el servidor escuchó en el puerto 3000; `GET http://127.0.0.1:3000/api/countries` devolvió HTTP 200. No se ejecutó el runner de migraciones ni se accedió a rutas de escritura. La primera prueba de conexión dentro del sandbox falló con `connect EPERM`; el arranque y la petición se repitieron con acceso de red local autorizado.
- **Pruebas:** 7 de 8 suites focalizadas pasan (197 tests); falla `src/versions/versions.controller.spec.ts` porque su `RootTestModule` no proporciona `VersionRepository` al construir `VersionsService`. Es el fallo previo ya documentado en R.14c/R.14f y no se modificó en esta tarea. Prettier y `git diff --check` pasan en los cambios de esta tarea.
- El backend nuevo queda iniciado y la API antigua continúa detenida. No se usaron credenciales reales. La verificación de Docker no fue accesible desde el usuario local por permisos de `/var/run/docker.sock`; el proceso local de Nest anterior no estaba presente antes del arranque. F.5.1 no se declara completada: falta ejecutar las pruebas conjuntas acordadas con el frontend.

## R.13a — Preflight del entorno local (2026-10-13)

### Alcance y método

Se revisaron las instrucciones del repositorio, el roadmap vigente, el contrato, el inventario, `src/data-source.ts`, `src/app.module.ts`, los scripts de migración, la implementación de `1791910000000-MigrateCanonicalUserRoles.ts` y las convenciones del directorio `src/migrations`. No se modificó código ni se ejecutó una migración.

La conexión usó únicamente el `.env` local (`STAGE=dev`, `DB_HOST=localhost`). Las consultas a PostgreSQL se ejecutaron entre `BEGIN READ ONLY` y `ROLLBACK`; el servidor confirmó `transaction_read_only=on`. No se consultaron identificadores, emails, credenciales ni datos personales.

### Esquema y ledger local

| Comprobación en `public`                  | Resultado observado                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `users.roles`                             | Presente; `text[]` (`udt_name=_text`), `NOT NULL`, default `'{user}'::text[]`. |
| `users.role`                              | Ausente.                                                                       |
| `migrations`                              | Presente; columnas `id integer`, `timestamp bigint`, `name varchar`; 89 filas. |
| `1791910000000-MigrateCanonicalUserRoles` | No aparece en el ledger local (cero filas por nombre/timestamp).               |

Esto confirma únicamente el estado de `SpamMusicDB` local en la fecha del preflight. No demuestra que la migración esté sin aplicar en todos los entornos; no se accedió a producción ni a otros entornos remotos.

### Datos locales agregados

La distribución actual observada contiene estas seis combinaciones, con el orden almacenado:

| `users.roles`                         | Cuentas |
| ------------------------------------- | ------: |
| `['babyUser']`                        |     190 |
| `['user', 'riffValley']`              |       2 |
| `['user', 'riffValley', 'superUser']` |       2 |
| `['user', 'superUser', 'riffValley']` |       2 |
| `['riffValley']`                      |       1 |
| `['riffValley', 'user', 'superUser']` |       1 |

| Comprobación                                                    | Resultado local |
| --------------------------------------------------------------- | --------------: |
| Usuarios                                                        |             198 |
| Arrays nulos / vacíos / con duplicados                          |       0 / 0 / 0 |
| Arrays con valores desconocidos o elementos `NULL`              |               0 |
| Arrays exactamente `['user']`                                   |               0 |
| Cuentas que contienen el `user` antiguo                         |               7 |
| Cuentas con `admin`                                             |               0 |
| Arrays formados solo por valores canónicos del contrato vigente |               0 |

La interpretación aprobada para las combinaciones observadas es inequívoca con las reglas del contrato: las 190 cuentas `babyUser` tienen destino `user`; las dos combinaciones `user + riffValley` conservan el origen privilegiado `riffValley` y tienen destino `riffvalley`; las cinco combinaciones con `riffValley + superUser` tienen destino `superadmin`; y la cuenta `riffValley` aislada tiene destino `riffvalley`. El antiguo `user` no aporta permisos ni se convierte en `collaborator`. La consulta no encontró `['user']` exacto en este entorno; si aparece en otro entorno, no inferir su origen por el valor o por una fecha aproximada: distinguir el usuario antiguo de uno creado por R.6 solo con evidencia verificable de procedencia, o detener esa fila para resolución explícita.

### Estado de migraciones y estrategia recomendada

`1791910000000-MigrateCanonicalUserRoles.ts` es la migración R.5b histórica del modelo de arrays: actualiza el contenido de `users.roles`, crea un snapshot de arrays y su `down()` restaura esos arrays. No cambia el esquema a `users.role` singular. El ledger local indica que no fue aplicada aquí, pero otros ledgers no están disponibles en este preflight.

**Decisión conservadora aplicada en R.13b:** mantener la migración histórica inmutable y añadir `1791920000000-MigrateUsersToSingleRole.ts`. La nueva migración produce `users.role text NOT NULL DEFAULT 'user'`, una constraint para los cuatro roles canónicos y elimina `users.roles`. Se añadió un runner operativo explícito que admite tanto la cadena pendiente como la histórica ya registrada; no altera la configuración ni el comportamiento de consultas de la aplicación. No sustituir la migración histórica mientras los ledgers remotos sigan desconocidos.

### R.13b — Implementación y prueba efímera (2026-10-13)

- La migración nueva bloquea `users` con `SHARE ROW EXCLUSIVE`, valida todas las filas antes de cambios, toma locks de fila, conserva cada array original y el rol destino en `user_roles_single_snapshot_1791920000000`, y guarda default, nulabilidad, comentario, constraints e índices de `roles` en `user_roles_single_schema_snapshot_1791920000000`. Comprueba el conjunto de IDs y cantidad antes/después. `up()` y `down()` son transaccionales por el modo `each` del runner, y `down()` aborta ante altas/bajas/cambios de rol posteriores.
- `babyUser` se convierte en `user`; `riffValley` en `riffvalley`; `superUser` en `superadmin`. Para un resultado histórico singular `['user']`, exige el snapshot R.5b que pruebe origen `babyUser` (con `admin` opcional, que no concede nivel); el valor antiguo `user` nunca se convierte por sí solo. `admin` se descarta y no concede privilegios. Se elige el nivel canónico máximo solo entre supervivientes inequívocos. No se asigna `collaborator` automáticamente. Nulos, vacíos, elementos `NULL`, desconocidos, duplicados, colisiones y filas sin destino seguro abortan toda la transacción.
- El rollback del snapshot R.13b restaura exactamente los arrays presentes al entrar en esta migración, incluido su orden, y recupera default, nulabilidad, comentario, constraints e índices. El snapshot de R.13b se conserva mientras el cambio está aplicado; `down()` lo elimina solamente después de una restauración verificada. El snapshot histórico R.5b permanece para el rollback de esa migración.
- La prueba usó PostgreSQL 16 en un contenedor efímero local, base aislada `role_migration_test`; no conectó a la base persistente ni ejecutó escrituras reales. Resultado: 19/19 pruebas pasan, incluyendo ambas rutas (migración histórica pendiente y ya registrada), las seis combinaciones locales, preflight fail-closed, rechazo de migraciones ajenas pendientes y de un ledger ausente, DDL final, rollback exacto, fallo transaccional tras iniciar cambios y negativa de rollback tras escrituras posteriores.

### Compatibilidad con TypeORM 0.3.26 y ejecución operativa

La ejecución normal de TypeORM con modo `all` rechaza migraciones que definen `transaction = true`; con `each`, la migración histórica puede iniciar su transacción, pero TypeORM 0.3.26 devuelve `[rows, affected]` para ese `UPDATE` sin `RETURNING`, mientras `1791910000000` espera `result.rowCount`. Se comprobó que la llamada directa falla. Para preservar el contenido potencialmente ya aplicado, `scripts/run-roles-migration-chain.ts` crea un `MigrationExecutor`, fija `transaction = 'each'` únicamente para esa ejecución y adapta esa forma de resultado solamente para el SQL exacto `UPDATE "users" SET "roles" = $1::text[] WHERE "id" = $2`. La migración histórica y el QueryRunner de la aplicación permanecen sin cambios.

Ejecutar `yarn migration:roles` (o `yarn --ignore-engines migration:roles` con Node 22 en el entorno actual), no la ruta TypeORM estándar, para esta cadena. El runner carga el datasource CLI existente y se detiene antes de transformar datos si detecta cualquier otra migración pendiente, una migración singular aplicada sin la histórica, o snapshots ausentes para migraciones registradas. La prueba confirma que resuelve la cadena legacy completa bajo `each` y registra ambas migraciones en el ledger. No inserta ledger “fake” ni marca una migración como aplicada sin ejecutar su `up()`.

La configuración global no se cambió. CLI (`src/data-source.ts`) carga el glob de migraciones y `synchronize: false`; el arranque de la aplicación mantiene `migrationsRun: true`, pero `TypeOrmModule.forRoot` no registra glob/lista de migraciones. R.15a debe verificar los artefactos concretos y ledger, detener instancias de aplicación para evitar carreras, usar un único `yarn migration:roles` revisado y validar el resultado antes de abrir tráfico. No asumir que el arranque de la app usa el mismo conjunto o modo del runner.

### R.15a — Preparación operativa (2026-10-13)

#### Comprobación local de solo lectura

Se cargó exclusivamente el `.env` local y se verificó antes de conectar `STAGE=dev`, `DB_HOST=localhost`, base `SpamMusicDB` y puerto `5432`. La conexión fue a loopback; todas las consultas estuvieron dentro de `BEGIN READ ONLY` (`transaction_read_only=on`) y terminaron con `ROLLBACK`. No se seleccionaron identificadores ni datos personales.

| Comprobación local                        | Resultado observado                                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users.roles`                             | Presente: `text[]`, `NOT NULL`, default `'{user}'::text[]`.                                                                                                                                           |
| `users.role`                              | Ausente.                                                                                                                                                                                              |
| `migrations`                              | Presente; columnas `id`, `timestamp`, `name`.                                                                                                                                                         |
| `1791910000000-MigrateCanonicalUserRoles` | No registrada.                                                                                                                                                                                        |
| `1791920000000-MigrateUsersToSingleRole`  | No registrada.                                                                                                                                                                                        |
| Distribución de `roles`                   | 190 `['babyUser']`; 2 `['user','riffValley']`; 2 `['user','riffValley','superUser']`; 2 `['user','superUser','riffValley']`; 1 `['riffValley']`; 1 `['riffValley','user','superUser']` (198 cuentas). |
| Casos incompatibles observados            | Cero nulos, arrays vacíos, duplicados, elementos nulos/desconocidos, `['user']` aislado, `admin` o filas sin fuente canónica derivable.                                                               |

Estos resultados describen solo esta base local. No sustituyen una comprobación fresca del entorno que se autorice para el corte. No se ha demostrado un backup restaurable de ningún entorno objetivo.

#### Revisión del runner y compatibilidad de despliegue

- `yarn migration:roles` carga el datasource CLI (`src/data-source.ts`) y el runner ejecuta solo `MigrateCanonicalUserRoles1791910000000` seguido de `MigrateUsersToSingleRole1791920000000`. TypeORM ordena las migraciones por timestamp; el runner rechaza migraciones ajenas pendientes, ledger ausente, migración singular registrada sin la histórica y snapshots faltantes para migraciones ya registradas. No crea un ledger ficticio ni marca migraciones sin ejecutar `up()`.
- Esas comprobaciones cubren los estados inconsistentes conocidos, pero no reconcilian el esquema real con un ledger que ya registra ambas migraciones: si no hay migraciones pendientes, el runner puede devolver “ya aplicadas” sin verificar que `users.role`, la constraint y la ausencia de `users.roles` sigan coincidiendo. El postflight manual del esquema es obligatorio incluso cuando el ledger dice que ambas se ejecutaron. Esta limitación queda documentada; no se modificó el runner al no ser necesaria para preparar el corte local.
- El modo `each` y el adaptador de resultado del `UPDATE` histórico se aplican dentro de la ejecución del runner. No se modifica la configuración global de TypeORM. La suite PostgreSQL efímera ya documentada cubre las dos rutas del ledger, el orden, fallos cerrados, migraciones ajenas y rollback; resultado registrado: 19/19.
- El backend integrado nuevo requiere `users.role`; el esquema local y el backend antiguo corresponden a `users.roles`. No existe una fase de compatibilidad dual aprobada. Las versiones antigua y nueva no pueden recibir tráfico simultáneamente durante el corte: el backend antiguo no sirve después de retirar `roles` y el nuevo no sirve antes de crear `role`.
- `src/app.module.ts` conserva `migrationsRun: true`, pero el `TypeOrmModule.forRoot` actual no registra migraciones. El datasource CLI sí las registra. Con la configuración inspeccionada, el arranque Nest no ejecuta esta cadena; el runner dedicado es quien la carga. No arrancar instancias mientras se migra y verificar el artefacto/configuración exactos del despliegue antes de reabrir tráfico para evitar que una configuración posterior registre migraciones y compita.
- El código contiene tareas programadas Nest (`@Cron` en Contents, Festival Playlists, TikTok e Instagram). Se detienen al detener todas las instancias Nest. No se encontró un runner independiente de esta cadena de roles; la existencia o configuración de schedulers externos, workers y procesos operativos del entorno objetivo no puede confirmarse desde este repositorio local y debe revisarse durante su preflight.

#### Procedimiento para otros entornos

La secuencia se ejecutó únicamente contra `SpamMusicDB` local el 2026-10-13. Para cualquier otro entorno requiere identificación del destino, ventana aprobada y acceso operativo específico; no repetirla contra la base local ya migrada.

1. **Preflight inmediato del destino:** fijar y registrar host, base, versión del artefacto y timestamp; abortar si no es el destino aprobado. Consultar en modo solo lectura esquema de `users`, ledger, presencia y contenido de ambos snapshots, distribución agregada de roles y bloqueos. Exigir el estado previo esperado (`roles` presente, `role` ausente), ledger coherente con una de las rutas admitidas y cero filas ambiguas. Si `1791910000000` ya aparece, comprobar snapshot histórico y procedencia de `['user']`; si aparece `1791920000000`, no repetir el corte: validar snapshots y esquema final.
2. **Backup restaurable:** crear un backup PostgreSQL consistente en formato custom (`pg_dump -Fc`) con retención y permisos del entorno. Calcular checksum, comprobar que `pg_restore --list` puede leerlo y restaurarlo en una base aislada de ensayo. Comparar allí esquema, número de usuarios y consultas agregadas de roles con el origen registrado. No considerar suficiente el snapshot de la migración como sustituto del backup integral.
3. **Congelar escrituras:** detener todas las instancias antiguas de la API, workers, tareas programadas y procesos standalone que escriban en la base; pausar autoscaling, despliegues automáticos y schedulers externos. Confirmar que no quedan sesiones/procesos escritores. Mantener cerrados tráfico y escrituras durante el cambio.
4. **Una ejecución controlada:** desde el artefacto revisado y con variables del destino verificadas, ejecutar una sola vez `yarn migration:roles` (o `yarn --ignore-engines migration:roles` si el runtime operativo aprobado lo requiere). No usar `migration:run`, `migration:run:prod`, `migration:revert` ni arrancar la aplicación como sustitutos. Registrar salida y timestamps de migraciones. Si falla, no reintentar a ciegas: mantener escrituras detenidas e inspeccionar ledger, esquema y snapshots.
5. **Postflight antes del despliegue:** comprobar que ambas migraciones constan en ledger una sola vez; existe `users.role text NOT NULL DEFAULT 'user'`, constraint canónica y no existe `users.roles`; cantidad/conjunto de usuarios y roles concuerdan con el plan; snapshots de datos y esquema están presentes; no hay roles fuera de los cuatro canónicos. Un error o divergencia mantiene el corte cerrado.
6. **Desplegar backend compatible:** desplegar solo el artefacto que lee y escribe `users.role`, con instancias anteriores todavía detenidas. Confirmar que la configuración de arranque no registra una lista distinta de migraciones ni vuelve a ejecutar la cadena. Verificar login, lectura/escritura administrativa de usuario, consultas que filtran por rol y permisos por nivel (`user < collaborator < riffvalley < superadmin`) con cuentas de validación aprobadas.
7. **Reabrir y observar:** reactivar workers, schedulers y tráfico gradualmente. Monitorizar errores SQL de columna, autenticación/401/403, errores de permisos, jobs y escrituras; conservar backup y snapshots durante la ventana de rollback acordada.

#### Detención y recuperación

- **Fallo antes de completar `up()`:** las migraciones son transaccionales con el modo `each`; mantener instancias y escritores detenidos, confirmar que la transacción revirtió y revisar ledger/snapshots. Corregir la causa y repetir solo tras un nuevo preflight que demuestre el estado previo íntegro.
- **`up()` completado, backend nuevo aún sin tráfico:** mantener cerrado el sistema. El runner `yarn migration:roles` solo aplica hacia delante y no existe un runner dedicado de rollback. `down()` está implementado y probado para restaurar arrays, schema, default, nulabilidad, comentario, constraints e índices; aborta si detecta cambios posteriores. No usar `yarn migration:revert` a ciegas: es genérico y puede revertir una migración distinta si el ledger del destino contiene una posterior. Antes de un corte real, ensayar en una base aislada un rollback que verifique el nombre/timestamp exacto y revierta únicamente esta cadena en orden inverso. Si ese rollback no está disponible, no abrir tráfico: restaurar el backup probado en una base recuperada y validar antes de apuntar servicios a ella.
- **Ya se reabrieron escrituras:** detener de nuevo todos los escritores y preservar evidencia. El rollback automático se niega deliberadamente si hubo altas, bajas o cambios de rol; no forzarlo. Decidir entre rollback manual revisado y restauración del backup considerando las escrituras posteriores, y validar el estado restaurado antes de reactivar el backend antiguo.

**Estado previo al corte de R.15a:** preparación documental y comprobación local completadas; en ese momento no se había ejecutado la migración. El resultado de la ejecución local del 2026-10-13 se registra en la sección «Ejecución del corte local». No se accedió a producción ni a otros entornos remotos.

### Verificación operativa local adicional (2026-10-13)

Se repitieron las consultas sobre `SpamMusicDB` desde `.env` con `STAGE=dev`, `DB_HOST=localhost`, puerto `5432`; `transaction_read_only=on` y `ROLLBACK`. PostgreSQL respondió como versión `17.10`, con 198 usuarios y 89 filas en `migrations`. `users.roles` sigue siendo `text[] NOT NULL DEFAULT '{user}'::text[]`, `users.role` no existe y `1791910000000`/`1791920000000` no aparecen en el ledger. Los seis conteos agregados siguen siendo: `babyUser` 190; `riffValley` 1; `riffValley,user,superUser` 1; `user,riffValley` 2; `user,riffValley,superUser` 2; `user,superUser,riffValley` 2. Sin nulos, arrays vacíos o desconocidos ni `admin`/`['user']` aislado.

**Descubrimiento del runner verificado:** `src/data-source.ts` mantiene el glob general `src/migrations/*.ts`, que incluye tres `*.spec.ts` de ese directorio. El punto de entrada de `scripts/run-roles-migration-chain.ts` lo reemplaza, solo para este runner y antes de inicializar, por rutas a archivos con formato de migración timestampada. TypeORM inicializó correctamente y descubrió 90 migraciones; no cargó las tres pruebas. El ledger de `SpamMusicDB` contiene 89 entradas, ninguna de roles. Las únicas migraciones fuente pendientes son `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000000`; no hay migraciones ajenas pendientes. Se observó también una entrada aplicada sin archivo fuente: `UpdateListStatusEnum1766066905027`; no está pendiente, queda fuera de este cambio y no se alteró. La comprobación usó `MigrationExecutor.getAllMigrations()` y `getExecutedMigrations()` dentro de `BEGIN READ ONLY`, confirmó `transaction_read_only=on` y terminó con `ROLLBACK`; no llamó a `executePendingMigrations()`.

Durante la primera inicialización de diagnóstico, el driver de TypeORM también envió `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` antes de abrir la transacción de lectura. Una consulta posterior confirmó que la extensión existe y que siguen siendo 198 usuarios/89 filas de ledger, pero no hay evidencia previa que permita demostrar si el comando fue un no-op. No se quitó la extensión. En la verificación repetida se desactivó `installExtensions` antes de inicializar para evitar ese DDL. No hubo cambios observados en usuarios ni en el ledger.

**Backup completo y restauración de ensayo (2026-10-13):** el host no tiene `pg_dump`, `pg_restore` ni `psql` en el `PATH`; el contenedor `spammusicdb` dispone de esas herramientas, además de `createdb` y `dropdb`, versión 17.10, igual que el servidor. Antes del dump se comprobó que `SpamMusicDB` ocupaba 24 MB y que `/tmp` tenía espacio suficiente. El dump custom se creó en `/tmp/SpamMusicDB-pre-roles-20261013.dump` (3.859.232 bytes, modo `0600`, SHA-256 `36243aafc81098153c051df73d7b5a3e1ed8a4881a838ee780d95eb17731c2e7`). `pg_restore --list` lo leyó correctamente e incluyó definición y datos de `users` y `migrations`. `pg_restore --exit-on-error` restauró todo sin errores en `SpamMusicDB_restorecheck_20261013`, una base nueva distinta de la original. La comparación dio 198 usuarios, las mismas seis agrupaciones de roles, las mismas 13 columnas de `users`, 89 migraciones con el mismo fingerprint `6a8dffae953ae84b8049b7198b9f080a`, cero migraciones objetivo aplicadas, y 41 claves foráneas validadas; no había IDs nulos ni roles nulos/vacíos. La base temporal se eliminó tras completar las comprobaciones. El archivo de backup se conserva fuera del repositorio. El dump corresponde a la base `SpamMusicDB`; no es un backup de roles/globales del clúster.

```bash
# Se ejecutó desde la raíz del repositorio. El archivo se conserva fuera del repo.
BACKUP=/tmp/SpamMusicDB-pre-roles-20261013.dump
umask 077
test ! -e "$BACKUP"
docker exec spammusicdb pg_dump -w -U postgres -Fc -d SpamMusicDB > "$BACKUP"
test -s "$BACKUP"
chmod 600 "$BACKUP"
sha256sum "$BACKUP"
set -o pipefail
docker exec -i spammusicdb pg_restore --list < "$BACKUP" \
  | rg 'TABLE (DATA )?public (users|migrations) |SEQUENCE|SCHEMA - public|DATABASE '

# Ensayo ejecutado en una base aislada; pg_restore terminó con código 0.
RESTORE_DB=SpamMusicDB_restorecheck_20261013
docker exec spammusicdb createdb -U postgres "$RESTORE_DB"
docker exec -i spammusicdb pg_restore --exit-on-error -U postgres -d "$RESTORE_DB" < "$BACKUP"
docker exec spammusicdb psql -X -U postgres -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -P pager=off -c \
  "BEGIN READ ONLY; SELECT count(*) AS users, count(*) FILTER (WHERE id IS NULL) AS null_user_ids, count(*) FILTER (WHERE roles IS NULL OR cardinality(roles)=0) AS empty_or_null_roles FROM users; SELECT roles::text, count(*) FROM users GROUP BY roles ORDER BY roles::text; SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position; SELECT count(*) AS ledger_rows, min(timestamp), max(timestamp), md5(string_agg(timestamp::text || ':' || name, ',' ORDER BY timestamp, name)) AS ledger_fingerprint FROM migrations; SELECT name, count(*) AS applied FROM migrations WHERE name IN ('1791910000000-MigrateCanonicalUserRoles','1791920000000-MigrateUsersToSingleRole') GROUP BY name ORDER BY name; SELECT count(*) FILTER (WHERE contype='f') AS foreign_keys, count(*) FILTER (WHERE NOT convalidated) AS unvalidated_constraints FROM pg_constraint WHERE connamespace='public'::regnamespace; ROLLBACK;"
```

Para repetir la comparación sin exponer campos personales, consultar únicamente conteos/agregados de usuarios, la firma de columnas, el fingerprint del ledger y restricciones. La validación de esta prueba confirmó 198 filas, sin IDs nulos ni roles nulos/vacíos, `roles text[] NOT NULL DEFAULT '{user}'::text[]`, ausencia de `role`, 89 entradas de ledger, 41 claves foráneas validadas y ninguna migración de roles objetivo aplicada.

**Recuperación durante un corte futuro:** usar el backup conservado solo tras decidir el rollback, detener todos los escritores y confirmar que el destino es exactamente `SpamMusicDB`. Los siguientes comandos reemplazan esa base y sus cambios posteriores; no se ejecutaron en esta prueba. Mantener el backup intacto y revisar antes el checksum registrado:

```bash
BACKUP=/tmp/SpamMusicDB-pre-roles-20261013.dump
sha256sum "$BACKUP"
# Tras detener y comprobar todas las conexiones/escritores:
docker exec spammusicdb dropdb -U postgres SpamMusicDB
docker exec spammusicdb createdb -U postgres SpamMusicDB
docker exec -i spammusicdb pg_restore --exit-on-error -U postgres -d SpamMusicDB < "$BACKUP"
docker exec spammusicdb psql -X -U postgres -d SpamMusicDB -v ON_ERROR_STOP=1 -P pager=off -c \
  "BEGIN READ ONLY; SELECT count(*) AS users FROM users; SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('roles','role') ORDER BY column_name; SELECT count(*) AS ledger_rows, md5(string_agg(timestamp::text || ':' || name, ',' ORDER BY timestamp, name)) AS ledger_fingerprint FROM migrations; ROLLBACK;"
```

**Procesos del corte:** Docker mostró `spammusic-back-app-1` ejecutando `npm run start:dev`/Nest `--watch`, con `DB_HOST=db`, `DB_NAME=SpamMusicDB`. Las etiquetas del contenedor conservan una ruta anterior de checkout; el Compose real está ahora en `/home/tottibero/workspaces/riffvalley/riffvalley-app-back/docker-compose.yml`, y `docker compose -p spammusic-back -f <ruta-actual> ps --all app` reconoce ese contenedor. No había sesiones en `pg_stat_activity` en el instante de consulta y no apareció un contenedor separado de workers de SpamMusic. `back-app-1` apunta a `comunidad_bdsm_back`, no a `SpamMusicDB`. El usuario no tiene crontab y los timers de systemd observados son de mantenimiento del sistema, sin jobs de la aplicación. El contenedor de API activo puede aceptar escrituras y debe detenerse aunque no tuviera una sesión abierta en el instante de consulta. Desde este workspace, los comandos para detener y comprobar el contenedor real son:

```bash
docker compose -p spammusic-back -f /home/tottibero/workspaces/riffvalley/riffvalley-app-back/docker-compose.yml stop app
docker compose -p spammusic-back -f /home/tottibero/workspaces/riffvalley/riffvalley-app-back/docker-compose.yml ps app
docker exec spammusicdb psql -U postgres -d SpamMusicDB -X -v ON_ERROR_STOP=1 -c \
  "SELECT pid, application_name, client_addr, state, backend_type FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();"
```

La lista debe quedar sin sesiones del backend/escritores; revisar aparte cualquier scheduler externo del equipo. Antes de ejecutar, completar y probar la restauración del backup. Con esa condición cumplida, ejecutar una sola vez `yarn --ignore-engines migration:roles` (el host usa Node 22.23.1 frente a `engines.node=20.x`). No usar `migration:run` ni iniciar la aplicación para aplicar esta cadena.

**Comandos de postflight utilizados y resultado:**

```bash
docker exec spammusicdb psql -U postgres -d SpamMusicDB -X -v ON_ERROR_STOP=1 -c \
  "SELECT name, count(*) FROM public.migrations WHERE name IN ('MigrateCanonicalUserRoles1791910000000','MigrateUsersToSingleRole1791920000') GROUP BY name ORDER BY name;"
docker exec spammusicdb psql -U postgres -d SpamMusicDB -X -v ON_ERROR_STOP=1 -c \
  "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('roles','role') ORDER BY column_name;"
docker exec spammusicdb psql -U postgres -d SpamMusicDB -X -v ON_ERROR_STOP=1 -c \
  "SELECT role, count(*) FROM public.users GROUP BY role ORDER BY role;"
docker exec spammusicdb psql -U postgres -d SpamMusicDB -X -v ON_ERROR_STOP=1 -c \
  "SELECT to_regclass('public.user_roles_migration_snapshot_1791910000000') AS legacy_snapshot, to_regclass('public.user_roles_single_snapshot_1791920000000') AS data_snapshot, to_regclass('public.user_roles_single_schema_snapshot_1791920000000') AS schema_snapshot, count(*) AS users FROM public.users;"
```

El resultado observado fue 198 usuarios, `users.role text NOT NULL DEFAULT 'user'`, ausencia de `users.roles`, ambas migraciones registradas una vez, snapshots presentes y conteos `user=190`, `riffvalley=3`, `superadmin=5` (sin `collaborator`). El contenedor antiguo monta otro checkout y permanece detenido. El backend compatible de este workspace no pudo arrancar; los errores y el estado de las pruebas aparecen en «Ejecución del corte local».

**Ejecución del corte local (2026-10-13):** el preflight confirmó `STAGE=dev`, `DB_HOST=localhost`, `DB_PORT=5432`, `DB_NAME=SpamMusicDB`, PostgreSQL 17.10, 198 usuarios, `users.roles text[] NOT NULL DEFAULT '{user}'::text[]`, ausencia de `users.role` y 89 filas en el ledger. TypeORM descubrió 90 migraciones sin cargar specs; las únicas pendientes eran `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000`. El ledger incluía una migración histórica aplicada sin fuente (`UpdateListStatusEnum1766066905027`), ya documentada y no pendiente. No había otra migración pendiente ni sesiones activas.

Antes de detener la API se generó `/tmp/SpamMusicDB-roles-cut-20261013-221108.dump`, custom, 3.859.232 bytes, modo `0600`, SHA-256 `a03fa9631509426059aefe7d10ad7eca3e43a3fee4319e7f9db4744f1a88ec24`. `pg_restore --list` reconoció las definiciones y los datos de `users` y `migrations`. Se conservó también `/tmp/SpamMusicDB-pre-roles-20261013.dump`.

Se verificó que `spammusic-back-app-1` era el servicio `app` del proyecto Compose `spammusic-back`, con `DB_HOST=db` y `DB_NAME=SpamMusicDB`; se detuvo con el Compose actual. PostgreSQL no se detuvo ni se eliminó ningún contenedor o volumen. Después de parar la API no había sesiones restantes, transacciones o escrituras activas en `SpamMusicDB`. La revisión previa documentada no encontró cron de usuario ni workers independientes de SpamMusic; los timers del sistema observados eran de mantenimiento. Las tareas Nest se detuvieron con la API.

El guard de datasource volvió a confirmar el destino local y se ejecutó una sola vez `yarn --ignore-engines migration:roles`. Terminó con código 0 e informó ambas migraciones aplicadas: `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000`.

Postflight de solo lectura: 198 usuarios, cero IDs/roles nulos y cero roles no canónicos; distribución `user=190`, `riffvalley=3`, `superadmin=5`, `collaborator=0`. `users.role` es `text NOT NULL DEFAULT 'user'`, la constraint `CHK_users_role_canonical_1791920000000` acepta exactamente los cuatro roles canónicos y está validada; `users.roles` no existe. El ledger tiene 91 entradas y cada migración objetivo aparece una vez. Los snapshots histórico, de roles y de esquema existen (198, 198 y 1 filas). El snapshot singular coincide con los 198 IDs y roles finales de `users` (cero diferencias). El SQL de ambas migraciones limita sus escrituras a `users`, `migrations` y esos snapshots; no se observaron sesiones posteriores activas.

**Backend posterior:** `yarn --ignore-engines start:dev` no logró arrancar porque Nest no puede limpiar `dist/access-requests` y `copy-i18n` no puede crear `dist/src` (`EACCES`). Un intento de arranque directo de `src/main.ts` superó la inicialización inicial, pero Winston no pudo abrir `logs/error-2026-10-13.log` (`EACCES`). Sin cambiar permisos ni archivos, se repitió con los transports de archivo desactivados solo en memoria; Nest llegó a cargar módulos y falló porque `CountriesModule` no puede resolver `UserRepository` requerido por `UserRoleGuard`. No quedó un backend nuevo escuchando; el contenedor antiguo sigue detenido. No se realizó ninguna petición de login ni se usaron credenciales reales. La validación HTTP de Auth y F.5.1 están bloqueadas hasta resolver esos problemas en una tarea autorizada.

**Decisión:** la migración local quedó aplicada y el postflight de PostgreSQL pasa. El estado operativo del backend es bloqueante para las pruebas conjuntas; no se cambió código funcional, permisos, frontend ni infraestructura para corregirlo. No hubo despliegue ni conexión remota.

**Verificación de código:** las pruebas focalizadas con Yarn pasaron (25 pruebas); los 19 casos PostgreSQL de `1791920000000` quedaron omitidos porque `ROLE_MIGRATION_TEST_URL` no estaba definido, para evitar escrituras en bases persistentes. El test unitario nuevo cubre el filtro de nombres y las dos migraciones de roles descubiertas. Pasaron el typecheck integrado, el typecheck directo del runner, Prettier y `git diff --check`.

### Configuración y ejecución de migraciones

- `src/data-source.ts` tiene `synchronize: false` y registra `src/migrations/*.ts` en desarrollo o `dist/migrations/*.js` en producción. Los scripts `migration:run`, `migration:run:prod` y `migration:revert` usan ese datasource (TypeScript en desarrollo y compilado en producción).
- `src/app.module.ts` también tiene `synchronize: false` y `migrationsRun: true`, pero el `TypeOrmModule.forRoot` inspeccionado no declara una lista/glob de migraciones. La opción ejecuta migraciones pendientes que estén registradas al inicializar el datasource; no debe asumirse que la app y el CLI cargan el mismo conjunto. Antes del corte hay que unificar y verificar qué configuración usa el runner y evitar que instancias de aplicación compitan con él.
- Ninguno de los dos datasource fija `migrationsTransactionMode`. TypeORM 0.3.26 usa `all` por defecto en `DataSource.runMigrations()`; el runner dedicado usa `each` por instancia y adapta únicamente la respuesta del SQL histórico afectado. R.15a debe usar el runner dedicado en modo operativo controlado y no el arranque automático de la aplicación.
- Las migraciones existentes siguen la convención TypeORM de clases con timestamp, `MigrationInterface`, `up()` y normalmente `down()`. La migración de roles es la única que declara explícitamente `transaction = true` en el directorio actual.

### Condiciones de seguridad operativa

1. Obtener y comprobar un backup restaurable antes del corte; mantener también un snapshot mínimo con `id`, array original exacto y rol singular planeado. No basta con reconstruir el array mediante renombres inversos.
2. Detener todas las instancias antiguas y las escrituras relacionadas con usuarios/roles; coordinar `migrationsRun: true` para que un único runner aplique exactamente el artefacto revisado.
3. Validar el conjunto completo antes de escribir. Bloquear nulos, arrays vacíos, duplicados o colisiones tras normalización, valores desconocidos, `admin`/antiguo `user` sin superviviente y procedencia ambigua. Mantener el cambio de esquema y datos en una transacción con el bloqueo necesario.
4. Verificar cantidad y conjunto de IDs, un rol canónico por usuario, valor por defecto, `NOT NULL`, constraint, y ausencia de la columna `roles`. Conservar snapshot y backup durante la ventana de rollback.
5. El rollback debe restaurar exactamente arrays, columna, default, nulabilidad y constraints de origen. Si hubo altas, bajas o cambios de rol después de abrir escrituras, abortar el rollback automático y recuperar desde backup con revisión operativa.
6. Desplegar el backend que consulta `role` únicamente después de confirmar el esquema singular. La base local todavía carece de esa columna, así que el backend R.12 no es compatible con el esquema local observado hasta completar el corte. Coordinar la renovación/caducidad de JWT previos (máximo documentado en AuthModule: 8 horas) y desplegar el frontend después del backend; no hay esquema dual aprobado.

### Límites de la evidencia

El preflight original fue de solo lectura y no representa producción ni otros entornos. Las pruebas R.13b escribieron únicamente en un contenedor PostgreSQL efímero local. No se ejecutaron migraciones sobre la base persistente ni se modificaron cuentas reales. R.15a aún requiere comprobar ledger/datos y backup restaurable en cada destino, detener instancias y escrituras, y ejecutar un único runner autorizado.

## Invariantes de clasificación y corte que siguen vigentes

- La migración R.13b sustituye `users.roles text[]` por `users.role text`, `NOT NULL`, default `user` y una constraint que acepta exclusivamente `user`, `collaborator`, `riffvalley` y `superadmin`. Antes de aplicarla en cada entorno, confirmar nullable/default/constraints reales contra el snapshot y el backup.
- Normalizar primero `babyUser`→`user`, `riffValley`→`riffvalley` y `superUser`→`superadmin`. Conservar `collaborator` solo cuando esté explícitamente almacenado. Retirar `admin` y el antiguo `user`; escoger el nivel mayor entre los supervivientes reconocidos. El antiguo `user` solo no tiene conversión y bloquea la transacción.
- El orden de selección es `user < collaborator < riffvalley < superadmin`. Por ejemplo, `babyUser + riffValley` produce `riffvalley`; `riffValley + superUser` produce `superadmin`; `admin + babyUser` produce `user` por el origen `babyUser`, nunca por `admin`. `admin` o el antiguo `user` junto a un superviviente no elevan ese superviviente.
- Bloquear nulos/vacíos, duplicados que no se hayan resuelto explícitamente, strings desconocidos, `admin`/antiguo `user` sin superviviente y cualquier mezcla con procedencia ambigua. Un bloqueo cancela el conjunto completo antes de cualquier escritura.
- R.6 escribió históricamente `roles: ['user']`; R.12 ya adapta el backend para escribir `role: user`. Los arrays `['user']` que aún existan no distinguen por sí solos el valor antiguo de cuentas creadas por R.6. Clasificar por evidencia verificable de origen o pedir resolución explícita; no asumir por el nombre, fecha aproximada o rol restante. El entorno local consultado en R.13a no tiene arrays exactamente `['user']`, pero los demás entornos siguen sin comprobar.
- La migración debe respaldar `id`, arrays originales y valor singular planeado en un snapshot mínimo; verificar IDs, cantidad de filas, roles válidos, constraint/default y eliminación del array. El rollback transaccional restaura la columna y los arrays exactos, además de default y constraints de origen; debe abortar si filas/roles cambiaron después de abrir escrituras.
- El ledger local consultado en R.13a no contiene `1791910000000-MigrateCanonicalUserRoles`, pero los ledgers de otros entornos no se consultaron. Mantenerla inmutable y usar la migración posterior; no reconsiderar sustitución in-place sin evidencia de que no se aplicó en ningún destino y autorización para una tarea específica.
- `src/app.module.ts` activa `migrationsRun: true`; el `TypeOrmModule.forRoot` actual no registra un glob de migraciones, mientras el datasource CLI sí. R.15 debe resolver esa diferencia, detener las instancias antiguas y las escrituras, usar un solo runner controlado, verificar la migración y abrir tráfico únicamente con el backend que usa `role`. No hay diseño dual-schema ni dual-role aprobado.

## Evidencia histórica del preflight multirol (R.5a/R.5b)

El informe siguiente permanece como evidencia del esquema y la base local observados antes de R.6. Sus cifras no describen necesariamente el estado actual y sus resultados propuestos para arrays no son la meta vigente.

### Esquema y operación de migraciones observadas en R.5a

- [User](../../src/identity/auth/entities/user.entity.ts) almacena `roles` como `text[]` de PostgreSQL; la columna tiene `default ['user']`, no es nullable según la entidad y usa `select: false`. La autorización central vuelve a leer el array persistido.
- [data-source.ts](../../src/data-source.ts) tiene `synchronize: false` y carga `src/migrations/*.ts` en desarrollo o `dist/migrations/*.js` cuando `STAGE=prod`. Las migraciones existentes son clases TypeORM con `up` y, normalmente, `down`; no se encontró una migración previa que modifique `users.roles`.
- [app.module.ts](../../src/app.module.ts) configura `migrationsRun: true`: TypeORM puede aplicar migraciones pendientes al inicializar la aplicación. El datasource no fija `migrationsTransactionMode`; la versión instalada usa `all` como modo predeterminado del ejecutor. El modo debe comprobarse de nuevo con la versión/artifact exactos de R.5b.
- `package.json` ofrece `yarn migration:run`, `yarn migration:run:prod` y `yarn migration:revert`. La primera ruta usa el datasource TypeScript y la ruta de producción usa el datasource compilado. R.5c debe elegir un único runner operativo y confirmar que apunta al datasource/artefacto esperado.

### Diagnóstico agregado de la base local en R.5a

Se consultó el `.env` local sin revelar credenciales: `STAGE=dev` y host loopback. La consulta se ejecutó con el driver `pg`, dentro de `BEGIN READ ONLY`, y solo devolvió agregados de `users.roles`; después se cerró con `ROLLBACK`. No se leyeron identificadores, emails ni otros datos personales.

| Roles almacenados, respetando el orden | Cuentas |
| -------------------------------------- | ------: |
| `['babyUser']`                         |     190 |
| `['user', 'riffValley']`               |       2 |
| `['user', 'riffValley', 'superUser']`  |       2 |
| `['user', 'superUser', 'riffValley']`  |       2 |
| `['riffValley']`                       |       1 |
| `['riffValley', 'user', 'superUser']`  |       1 |

| Comprobación                                                        | Resultado local |
| ------------------------------------------------------------------- | --------------: |
| Cuentas                                                             |             198 |
| Membresías `babyUser` / antiguo `user` / `riffValley` / `superUser` | 190 / 7 / 8 / 5 |
| Cuentas con `admin`                                                 |               0 |
| Arrays nulos / vacíos / con duplicados                              |       0 / 0 / 0 |
| Valores de rol desconocidos                                         |               0 |
| Cuentas sin un rol canónico derivable por las reglas aprobadas      |               0 |

Las seis combinaciones observadas son la distribución completa de arrays. En particular, las cinco cuentas triples aparecen en tres órdenes diferentes. Los 190 `babyUser` aislados pasan a `user`; las dos cuentas `user`+`riffValley` pasan a `riffvalley`; las cinco triples pasan a `riffvalley`+`superadmin`, conservando el orden de primera aparición después de quitar el `user` legacy; y la cuenta `riffValley` pasa a `riffvalley`. El resultado local mantiene 198 cuentas, con 190 miembros `user`, 8 `riffvalley` y 5 `superadmin` (las últimas dos membresías se acumulan en cinco cuentas).

### Reglas de transformación propuestas para el diseño anterior

| Valor de origen   | Transformación aprobada                                                                  | Condición del preflight                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `babyUser`        | `user`                                                                                   | Renombre directo; no deriva permisos editoriales ni de colaborador.                                                                                                                                                 |
| `riffValley`      | `riffvalley`                                                                             | Renombre directo.                                                                                                                                                                                                   |
| `superUser`       | `superadmin`                                                                             | Renombre directo.                                                                                                                                                                                                   |
| Antiguo `user`    | Quitar la entrada y conservar los demás roles supervivientes; no asignar `collaborator`. | Si al quitarla la cuenta queda sin rol canónico, detener y revisar esa cuenta. Confirmar que el conjunto examinado precede a cualquier escritura de roles canónicos para no confundir ambos significados de `user`. |
| `admin`           | Quitar, nunca convertir a `superadmin`.                                                  | Verificar cuenta por cuenta que queda otro rol canónico válido. Si no queda, detener esa cuenta para decisión funcional explícita.                                                                                  |
| `collaborator`    | Ninguna asignación automática.                                                           | No derivarlo de `user`, `admin` ni de ningún alias.                                                                                                                                                                 |
| Valor desconocido | No transformar ni borrar automáticamente.                                                | Detener la migración hasta clasificar el origen y aprobar su tratamiento. Esto incluye valores desconocidos mezclados con valores reconocidos.                                                                      |

Antes de actualizar se debe comprobar cada fila cuyo resultado sería vacío o no canónico; la migración debe fallar de forma cerrada si encuentra cuentas ambiguas. Los valores `user` aislados, `admin` sin superviviente, roles desconocidos, arrays vacíos/nulos y mezclas que no puedan clasificarse son bloqueos, no oportunidades para asignar el rol estándar. No hay duplicados en la base local. Si producción presenta alias y valor canónico que colisionan, preservar el orden; la propuesta de R.2 es colapsar repeticiones conservando la primera aparición, pero debe confirmarse antes que el consumidor frontend no dependa de la forma/longitud del array. Hasta esa verificación, no eliminar repeticiones en una cuenta afectada; la coincidencia OR no requiere deduplicarlas.

### Orden observable del array anterior

En el backend, las comprobaciones de autorización usan coincidencia OR/`ANY` y no dependen de posiciones, ordenamiento ni índice cero. Los endpoints de Auth incluyen el array en respuestas y login; el JWT también lo expone. Por ello, el orden y la forma del array son observables aunque no se haya encontrado una dependencia posicional en el backend. La migración debe preservar el orden relativo y sustituir valores in situ; no ordenar el array. La compatibilidad visual del frontend no se verificó en este repositorio y queda para R.8. La posible deduplicación de valores que colisionen durante el mapeo sigue pendiente de confirmar según la tabla de decisiones de R.2.

### Validación, respaldo y rollback de R.5b (histórico)

1. Repetir el preflight de solo lectura en el entorno objetivo inmediatamente antes del cambio, guardar el informe agregado y exigir cero filas bloqueantes. Producción requiere su propia revisión; los conteos locales no se extrapolan.
2. Crear y comprobar un backup restaurable de la base objetivo. La migración R.5b implementa un snapshot restringido con `users.id`, `roles` originales y resultado migrado solo para las filas que cambian. No guarda emails, credenciales ni otros campos. No basta con aplicar renombres inversos: los nombres antiguos y canónicos pueden colisionar semánticamente y el rollback debe restaurar exactamente el estado previo.
3. Ejecutar todos los cambios en una transacción PostgreSQL. Mantener `user_roles_migration_snapshot_1791910000000` hasta cerrar la ventana de rollback. `down()` compara los roles actuales con el resultado migrado antes de restaurar; si una cuenta desapareció o sus roles cambiaron después del despliegue, aborta para no sobrescribir cambios. Tras recuperar los arrays originales elimina el snapshot. Un fallo de `up` o `down` revierte snapshot, cambios y DDL dentro de la transacción. Después de cerrar la ventana, R.5c debe retirar el snapshot mediante una limpieza controlada.
4. Antes y después comparar cantidad de usuarios y conjunto de IDs; confirmar que no se borran cuentas ni se modifican columnas distintas de `roles`. Después, verificar que solo existen `user`, `collaborator`, `riffvalley` y `superadmin`, que no quedan `admin`, `superUser`, `riffValley` o `babyUser`, que no hay arrays vacíos ni desconocidos y que las cuentas afectadas concuerdan con el mapa aprobado.
5. Demostrar ausencia de grants nuevos comparando por cuenta la intersección de roles con cada allowlist de R.2 antes y después. Cada rol nuevo debe derivar únicamente de su alias aprobado (`babyUser`→`user`, `superUser`→`superadmin`, `riffValley`→`riffvalley`); `admin` y el antiguo `user` no generan permisos sustitutos. Revisar por separado pérdidas deliberadas por `admin` o antiguo `user` retirados y bloquearlas cuando contradigan las condiciones aprobadas.

### Coordinación recomendada para el diseño anterior (histórica; revisada en R.13a)

El informe previo identificó un bloqueo para despliegue continuo: el backend que espera roles canónicos no puede autorizar filas que solo tengan `babyUser`, `superUser` o `riffValley`, y una versión antigua no reconoce las nuevas allowlists. No existe una fase dual-read aprobada. El preflight R.13a confirma que la base local aún tiene solo `users.roles`; el backend R.12 espera `users.role`, por lo que el corte de esquema sigue siendo necesario.

La referencia histórica a R.6 pendiente y a diagnósticos de `AuthController` quedó superada: R.12 está completada y el typecheck integrado pasa sin errores. La incompatibilidad actual es entre el backend singular y el esquema local multirol; R.13b/R.15 deben resolverla con un corte coordinado.

La recomendación operativa vigente está en “Condiciones de seguridad operativa” arriba: detener instancias y escrituras, repetir el preflight, usar un único runner y abrir tráfico después de validar el esquema. Si se requiere cero downtime, diseñar y probar una fase transitoria antes de programar el corte; no asumir que ya existe.

Los JWT pueden seguir llevando claims antiguos hasta su expiración efectiva de 8 horas. El guard autoriza desde PostgreSQL, por lo que la migración cambia autorización en la siguiente petición, aunque el frontend aún vea claims anteriores. R.8 debe coordinar refresh/presentación de roles y desplegar el frontend después del backend final; el frontend no se modifica en R.5a.

### Alcance de la evidencia y estado histórico de R.5

- Este preflight confirma la base local consultada el 2026-10-13. No sustituye el preflight de producción y no ejecuta ni crea migraciones.
- La implementación R.5b usa `LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`, prevalida el conjunto completo antes de escribir y declara `transaction = true`. Las pruebas usan un `QueryRunner` simulado; no aplican la migración a ninguna base persistente.
- **R.5b:** implementación y pruebas completadas; ver estado en `roles.md`.
- **R.5c:** ejecutar el preflight en el entorno aprobado, coordinar el corte o la versión transitoria, aplicar la migración con autorización operacional explícita y verificar/retener rollback. Depende de R.5b, de Auth/R.6 integrado y de un backend compilable. R.5 continúa pendiente hasta cerrar este incremento.
