# P.1 — Preflight PostgreSQL de producción y secuencia de corte

> **Cierre final (2026-10-14):** Backend de Riff Valley desplegado en `spammusic-back`, release `v309`; frontend adaptado y desplegado en Netlify según comprobación manual del usuario. PostgreSQL migrado de `users.roles` a `users.role`. Se conservaron 198 usuarios: 190 `user`, 3 `riffvalley`, 5 `superadmin` y 0 `collaborator`. Ledger: 91 migraciones; snapshots presentes: `user_roles_migration_snapshot_1791910000000`, `user_roles_single_snapshot_1791920000000` y `user_roles_single_schema_snapshot_1791920000000`. Backup `b008` conservado. Maintenance quedó desactivado y `web.1` operativo. Se verificaron esquema, conteos/distribución, ledger, snapshots, arranque y endpoints públicos/protegidos. El usuario confirma además una comprobación básica de autenticación, incluido el rol recibido en la web. No se ejecutaron pruebas completas de permisos con cuentas editoriales y administrativas; quedan como observación adicional, no como fase obligatoria. P.1–P.3.2 son fotografías históricas; los resultados posteriores están registrados en P.3.5 y P.3.6.

> **Aclaraciones P.2a/P.2b (2026-10-13):** La lista inicial de P.1 se basó en basenames, no en las identidades TypeORM. P.2b comparó los 90 nombres efectivos del código con el ledger de producción mediante SQL `READ ONLY`: solo están pendientes `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000`. Las dos identidades históricas ajenas están aplicadas. P.2b también retiró la fase `release` automática del `Procfile` y desactivó `migrationsRun` en el arranque Nest. Véanse las secciones P.2a/P.2b al final. No se desplegó ni se modificó producción.

**Fecha:** 2026-10-13
**Entorno consultado:** aplicación Heroku `spammusic-back`; add-on PostgreSQL conectado como `DATABASE`; consultas SQL ejecutadas en transacción `READ ONLY`.
**Resultado:** preflight completado. No se modificaron Heroku ni PostgreSQL, no se activó mantenimiento, no se detuvieron dynos, no se ejecutaron migraciones y no se generaron backups.

## Estado observado

- Aplicación `spammusic-back`, región EU, stack `heroku-24`; release actual observado: `v308`.
- Add-on PostgreSQL `postgresql-lively-94498`, plan `Essential-0`, PostgreSQL `16.14`, estado disponible. Uso observado: 26.1 MB de 1 GB; 31 tablas. Continuous Protection figura activa; rollback del add-on no está soportado.
- Formación observada: un dyno `web.1` Basic, ejecutando `yarn start:prod`. No se observó un dyno worker. Mantenimiento estaba desactivado.
- Está conectado el add-on Heroku Scheduler Standard. La CLI no expuso sus definiciones de trabajos; hay que revisarlas en el dashboard y pausarlas durante P.2. Los crons `@Cron()` del backend viven dentro del proceso web y se detienen al escalar `web` a cero.
- La información de la CLI no identifica la rama GitHub asociada al despliegue. El contexto de trabajo indica despliegue automático desde `main`; verificar en Deploy del dashboard antes del corte. La app no aparece acoplada a un Heroku Pipeline.

### PostgreSQL y usuarios

La sesión SQL usó `default_transaction_read_only=on`, `BEGIN READ ONLY` y `ROLLBACK`; no se inicializó TypeORM.

- `public.users`: 198 filas. Existe `roles text[] NOT NULL DEFAULT '{user}'`; no existe `role`.
- Distribución observada de arrays: `babyUser` 190; `riffValley` 1; `riffValley,user,superUser` 1; `user,riffValley` 2; `user,riffValley,superUser` 2; `user,superUser,riffValley` 2.
- No se encontraron arrays nulos/vacíos, miembros nulos, roles desconocidos, duplicados ni el array exacto `['user']`. Según el mapeo ya aprobado, el resultado esperado sería `user` 190, `riffvalley` 3 y `superadmin` 5.
- Existe `public.migrations` con 89 entradas. De las 90 migraciones timestamped presentes en el código consultado, están pendientes las dos migraciones de roles (`MigrateCanonicalUserRoles1791910000000`, `MigrateUsersToSingleRole1791920000000`) y dos ajenas: `SyncEntities1758355724537` y `AddBranchToVersionItem1758607100250`.
- Tres entradas del ledger no tienen archivo de migración correspondiente en el código actual: `AddArtistNameNormalized1699999999999`, `AddBranchToVersionItem1690000000000` y `UpdateListStatusEnum1766066905027`. Son discrepancias preexistentes que requieren revisión antes de decidir cualquier ejecución del migrador general.
- El runner dedicado `yarn migration:roles` solo carga archivos de migración timestamped reales y aborta si detecta migraciones ajenas pendientes. Con el ledger observado, abortará de forma segura hasta resolver explícitamente esas dos migraciones ajenas. No se debe sustituir por `migration:run:prod`.

## Backups

PGBackups está disponible. Se observaron cinco backups completados; el más reciente es `b006`, del 2026-10-05, tamaño 3.64 MB. No hay registros de restauración ni programación de backups. El plan Essential conserva cinco backups y una nueva captura al superar ese límite puede eliminar el más antiguo; descargar y conservar fuera de Heroku el backup que se quiera retener antes de capturar el backup de P.2.

Comandos para P.2 (no ejecutados en P.1):

```bash
heroku pg:backups --app spammusic-back
heroku pg:backups:capture --app spammusic-back
heroku pg:backups:info b007 --app spammusic-back
heroku pg:backups:download b007 --app spammusic-back --output /ruta/segura/spammusic-back-pre-roles.dump
pg_restore --list /ruta/segura/spammusic-back-pre-roles.dump
sha256sum /ruta/segura/spammusic-back-pre-roles.dump
```

Usar el ID devuelto por `capture`, no asumir `b007`. P.2 debe comprobar que figura `Completed`, que el archivo no está vacío, conservar checksum y lista de contenido, y ensayar la restauración en una base aislada antes de autorizar el corte. Para rollback, detener todos los escritores, verificar dos veces que el destino es la base `DATABASE` de `spammusic-back` y restaurar el backup seleccionado:

```bash
heroku pg:backups:restore <BACKUP_ID> DATABASE --app spammusic-back --confirm spammusic-back
```

La restauración sobre `DATABASE` reemplaza los datos del destino; solo procede ante decisión explícita de recuperación y tras confirmar que no hay escrituras posteriores al backup que deban conservarse. En P.1 no se descargó ni restauró ningún backup.

## Bloqueo del despliegue automático

**Estado histórico de P.1:** el `Procfile` de la rama y `origin/main` contenía:

```procfile
release: yarn migration:run:prod
web: yarn start:prod
```

Al desplegar un merge a `main`, Heroku ejecuta `release: yarn migration:run:prod` en un dyno de release antes de arrancar los dynos web del nuevo release. Ese comando aplica todas las migraciones pendientes del datasource; no usa el runner acotado a roles. Mantenimiento bloquea tráfico de router pero no detiene dynos, trabajos internos ni la fase release. Escalar `web` a cero tampoco impide la fase release del despliegue. Por tanto, un merge tal como está el `Procfile` puede ejecutar automáticamente las dos migraciones ajenas y las de roles antes del preflight/postflight manual. La secuencia actual **no es segura**.

### Secuencia inicial de P.1 (sustituida por la secuencia P.2b)

1. Reconfirmar que Deploy enlaza esta app a `main`, registrar el release actual y revisar los trabajos configurados en Heroku Scheduler. Revisar también la lista de procesos y conexiones de PostgreSQL.
2. Revisar por separado las dos migraciones ajenas pendientes y las tres discrepancias del ledger. No continuar hasta que el plan de migración aprobado deje al runner de roles con únicamente las dos migraciones de roles pendientes.
3. Resolver mediante un cambio puntual, revisado y aprobado en el artefacto que se desplegará, la ejecución automática del migrador general en la fase release. La opción operativa más acotada es que ese release no ejecute migraciones automáticamente; documentar y desplegar ese cambio antes del corte. P.1 no modifica el `Procfile` ni la configuración de despliegue.
4. Capturar y verificar el backup inmediato de P.2; si es necesario preservar el backup más antiguo, descargarlo antes de la nueva captura. Completar el ensayo de restauración aislada.
5. Activar mantenimiento y guardar la formación actual. Pausar los trabajos de Heroku Scheduler; escalar `web` y cualquier proceso escritor a cero. Confirmar con `heroku ps` y sesiones SQL que no quedan escritores ni migraciones concurrentes. Mantenimiento por sí solo no detiene procesos internos.

   ```bash
   heroku maintenance:on --app spammusic-back
   heroku ps --app spammusic-back
   heroku ps:scale web=0 --app spammusic-back
   heroku ps --app spammusic-back
   heroku pg:psql --app spammusic-back
   ```

   En `pg:psql`, revisar `pg_stat_activity` en lectura y salir con `\q`. Pausar los jobs desde el dashboard de Scheduler; el add-on no mostró sus definiciones en CLI. Si `pg:psql` no está disponible en la máquina operadora, instalar/usar un cliente PostgreSQL aprobado antes del corte, sin volcar la URL de conexión.

6. Hacer merge a `main` solo después de confirmar los pasos anteriores. Esperar a que termine el build/release automático y verificar su release. No puede haber otro deploy entre este punto y la migración: `heroku run` utiliza el release vigente.
7. Manteniendo web a cero, Scheduler pausado y mantenimiento activado, ejecutar una sola vez el runner del release ya desplegado:

   ```bash
   heroku run --app spammusic-back --no-tty --exit-code -- yarn --ignore-engines migration:roles
   ```

   Antes de ejecutarlo, reconfirmar el destino local de configuración del release mediante el nombre de app y el `DATABASE` attachment, sin imprimir URL ni credenciales. El runner debe informar solo las dos migraciones de roles. Si falla, no repetir ni iniciar la API; inspeccionar esquema y ledger con SQL de solo lectura.

8. Hacer postflight SQL de solo lectura: `users.role text NOT NULL DEFAULT 'user'`, constraint de cuatro roles canónicos, ausencia de `users.roles`, 198 usuarios e IDs conservados, distribución `190/3/5`, ambas entradas de roles en ledger y snapshots presentes. Investigar cualquier diferencia antes de arrancar web. Iniciar cada bloque de consultas con `BEGIN READ ONLY;` y cerrar con `ROLLBACK;`.
9. Arrancar `web` con la formación registrada (actualmente una unidad Basic), manteniendo mantenimiento hasta confirmar arranque y petición de lectura. Después reanudar los trabajos Scheduler revisados y desactivar mantenimiento. Mantener detenido cualquier backend antiguo.

   ```bash
   heroku ps:scale web=1:basic --app spammusic-back
   heroku ps --app spammusic-back
   # Tras comprobar el arranque y la respuesta HTTP:
   heroku maintenance:off --app spammusic-back
   ```

El runner también se detendrá si las migraciones ajenas continúan pendientes. Un fallo en release phase, una nueva versión durante el corte, una sesión escritora no identificada o un postflight distinto de lo esperado son condiciones de aborto.

## Estado P.1 (observación inicial)

No se cambió Heroku, PostgreSQL, el código funcional, el despliegue ni el frontend. Producción seguía en el esquema legacy `users.roles text[]`; ambas migraciones de roles estaban pendientes. El recuento inicial de cuatro pendientes y las dos migraciones ajenas fue corregido por P.2a/P.2b tras comparar identidades TypeORM. El backup más reciente observado tenía ocho días; P.2b no creó backup. El bloqueo restante incluye la restauración ensayada y la coordinación operativa de corte.

## P.2a — Reconciliación documental de migraciones ajenas (2026-10-13)

### Evidencia de solo lectura

Se inspeccionaron las migraciones fuente, `src/data-source.ts`, el datasource de producción compilado que invoca `migration:run:prod`, el `Procfile` y el ledger/esquema de PostgreSQL de producción. La conexión SQL se limitó a `BEGIN READ ONLY` y `ROLLBACK`; solo se consultaron metadatos y agregados. No se ejecutaron migraciones ni se modificaron la base o Heroku.

TypeORM 0.3.26 identifica cada migración con `migration.name` (si está definido) o el nombre de su clase, y usa ese mismo nombre al comparar con `public.migrations`. No utiliza el nombre del archivo como identidad. En el código actual, las dos migraciones que P.1 había llamado pendientes tienen nombres de archivo nuevos, pero instancias con identidades históricas ya presentes en el ledger:

| Archivo / timestamp del archivo                             | Identidad TypeORM y timestamp efectivo                   | Finalidad, cambios y dependencias                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidencia en producción y evaluación                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1758355724537-SyncEntities.ts` / `1758355724537`           | `AddArtistNameNormalized1699999999999` / `1699999999999` | Añade `artist.name_normalized text`, la rellena con `regexp_replace(lower(unaccent(name)), '\\s+', ' ', 'g')`, la hace `NOT NULL` y crea el índice GIN trigram `artist_name_normalized_trgm_idx`. Solicita las extensiones `unaccent` y `pg_trgm`. Requiere `artist.name`; `AddStateToVersionItem1758424806274` elimina este índice si existe. `down()` elimina índice y columna, por lo que descarta los valores normalizados; no elimina extensiones. | Ledger: aplicada bajo la identidad antigua (`timestamp=1699999999999`). Existen `artist.name` y `artist.name_normalized text NOT NULL`; ambas extensiones están instaladas; 7.026 artistas y cero valores normalizados nulos. **El índice esperado no existe**. La columna es compatible con el esquema consultado, pero el índice ausente es una deriva que requiere diagnóstico. No reejecutar a ciegas: la migración actual intentaría añadir una columna que ya existe. |
| `1758607100250-AddBranchToVersionItem.ts` / `1758607100250` | `AddBranchToVersionItem1690000000000` / `1690000000000`  | Añade `version_item.branch varchar(200) NOT NULL DEFAULT 'main'` y después quita el default. Requiere que exista `version_item`; en el orden histórico por nombres de archivo, `CreateVersions1758375857176` crea la tabla y `AddStateToVersionItem1758424806274` va antes de esta migración. `down()` elimina la columna y pierde los valores de rama.                                                                                                 | Ledger: aplicada bajo la identidad antigua (`timestamp=1690000000000`). `version_item.branch` existe como `varchar NOT NULL`, sin default; 33 filas, ninguna nula y las 33 con valor distinto de `main`. Es compatible con la definición final esperada. Un `down()` o una recreación de columna perdería información de ramas.                                                                                                                                             |

Los registros de ledger para `CreateVersions1758375857176` y `AddStateToVersionItem1758424806274` también existen; la dependencia de tabla para `branch` está satisfecha. Las dos migraciones no tocan `users` ni tienen dependencia directa de las migraciones de roles. No obstante, el runner dedicado rechaza migraciones ajenas realmente pendientes, así que hay que conciliar su lista con el artefacto antes de usarlo.

La migración `SyncEntities` tiene timestamp de archivo anterior a `CreateVersions` y `AddStateToVersionItem`; `AddStateToVersionItem` borra el índice que crea. La secuencia histórica indicada por los nombres de archivo es `SyncEntities` → `CreateVersions` → `AddStateToVersionItem` → `AddBranchToVersionItem`. Sin embargo, sus timestamps efectivos de clase/instancia son `1699999999999` y `1690000000000`, y el orden/identidad efectivo de TypeORM no coincide con esa secuencia de archivos. No ejecutar ninguna basándose solo en el nombre del archivo. El ledger observado ya registra las dos identidades efectivas, por lo que el código actual debería omitirlas; el artefacto exacto de despliegue y la salida real de su descubrimiento de migraciones deben confirmarse antes de P.2b.

Esta evidencia corrige también la lectura del ledger de P.1: `AddArtistNameNormalized1699999999999` y `AddBranchToVersionItem1690000000000` sí corresponden a `migration.name` en los archivos actuales, aunque sus basenames sean distintos. De las tres entradas citadas entonces como “sin archivo correspondiente”, `UpdateListStatusEnum1766066905027` sigue sin coincidencia conocida por identidad y queda como discrepancia independiente por investigar.

### Decisión y riesgos

- **No ejecutar ni cambiar el ledger** de estas dos migraciones. Según la identidad que consume TypeORM hoy, ya están aplicadas. El dato pendiente es la ausencia del índice de artistas; no se debe inferir que la migración completa es innecesaria ni corregir esa deriva dentro de P.2a.
- **No considerarlas dos migraciones ajenas pendientes confirmadas.** El resultado de P.1 (cuatro pendientes) y el ledger actual son incompatibles con la identidad efectiva del código inspeccionado. Si el release despliega exactamente esas clases, los dos registros ajenos no deberían bloquear `migration:roles`; si el artefacto tiene nombres distintos, la lista puede cambiar. P.2b debe reconciliarlo primero.
- Si un artefacto futuro realmente presenta una de ellas como pendiente, detenerse y evaluar el esquema real, los nombres TypeORM y el historial antes de autorizar ejecución. `SyncEntities` no es reejecutable sobre la columna existente y el índice faltante podría ser deriva o reflejar una ejecución parcial/modificación posterior. `AddBranchToVersionItem` no debe reejecutarse sobre la columna existente; su reversión destruye las 33 asignaciones de rama no `main` observadas.
- Las dos migraciones de roles solo transforman `users`; no hay dependencia de esquema directa con `artist` o `version_item`. Aun así, el release no debe ejecutar una lista ambigua. El orden recomendado es resolver primero la identidad/lista pendiente del artefacto y la deriva del índice; después, con únicamente las dos migraciones de roles pendientes, aplicar el runner acotado en la ventana controlada de P.2. No aplicar migraciones ajenas junto con roles sin una decisión explícita y un preflight específico.

### Release automático y propuesta mínima

El `Procfile` sigue ejecutando `yarn migration:run:prod` como `release`. El script usa el datasource compilado `dist/data-source.js`; el CLI de TypeORM aplica todo lo que su artefacto descubre como pendiente, sin limitarse a roles. Por eso un despliegue puede ejecutar migraciones durante la fase release antes del arranque de web y antes del corte manual. El `release` también puede fallar o aplicar un conjunto distinto si el artefacto y las identidades del ledger no concuerdan.

**Cambio propuesto por P.1/P.2a:** retirar del `Procfile` la línea `release: yarn migration:run:prod` y conservar `web: yarn start:prod`. P.2b aplicó el cambio localmente; no se ha desplegado.

### Condiciones operativas para el corte P.2

1. Confirmar de nuevo el artefacto y el ledger justo antes del corte; la entrada `UpdateListStatusEnum1766066905027` es histórica y ajena, pero no está en las fuentes actuales ni pendiente.
2. Investigar por separado si la ausencia del índice trigram afecta el rendimiento de las búsquedas. No reconstruirlo ni revertir la migración que lo elimina como parte del corte de roles.
3. Completar y verificar un backup fresco y un ensayo de restauración; confirmar Deploy/`main`, Scheduler, procesos y escritores. La secuencia detallada está en P.2b.
4. El runner debe enumerar exactamente las dos migraciones de roles y ninguna ajena. Abortar si difiere y ejecutar solo con web y trabajos Scheduler detenidos, dentro de la ventana controlada.

**Estado P.2a:** análisis documental completado. P.2b resolvió la discrepancia del inventario mediante lectura de producción y preparó cambios locales; no se alteraron producción ni ledger.

## P.2b — Reconciliación y preparación del despliegue controlado (2026-10-13)

### Reconciliación de TypeORM y ledger de producción

Se compararon las identidades efectivas de las migraciones cargadas desde los 90 archivos fuente reales (90 clases con `up()` y timestamp TypeORM) con `public.migrations` en una transacción PostgreSQL `READ ONLY`, cerrada con `ROLLBACK`. El resultado fue: 90 identidades fuente, 89 entradas en el ledger, **solo dos pendientes** y una entrada del ledger sin fuente. Las dos pendientes son `MigrateCanonicalUserRoles1791910000000` (`1791910000000-MigrateCanonicalUserRoles.ts`) y `MigrateUsersToSingleRole1791920000` (`1791920000000-MigrateUsersToSingleRole.ts`). Ninguna aparece aplicada en el ledger. La única entrada ajena pendiente no existe. No se inicializó TypeORM contra producción ni se llamó al ejecutor.

`1758355724537-SyncEntities.ts` se instancia como `AddArtistNameNormalized1699999999999`, y `1758607100250-AddBranchToVersionItem.ts` como `AddBranchToVersionItem1690000000000`. Ambas identidades efectivas, no los timestamps de basename, ya aparecen en el ledger. La entrada `UpdateListStatusEnum1766066905027` también aparece aplicada, pero no existe hoy una identidad fuente que la corresponda; como entrada ledger-only no se vuelve pendiente ni bloquea el runner. Es una brecha histórica de procedencia que debe conservarse documentada, sin marcarla manualmente ni recrear su migración.

El ledger contiene también `CreateVersions1758375857176` y `AddStateToVersionItem1758424806274`, por lo que la tabla `version_item` ya existe antes de que se añadiera `branch`. La lista pendiente de producción se reconcilia con el conjunto esperado por `migration:roles`.

### Anomalías y compatibilidad

- El índice GIN trigram `artist_name_normalized_trgm_idx` sí lo crea `SyncEntities`, pero `AddStateToVersionItem1758424806274.up()` lo elimina y no lo recrea. Esta migración posterior figura aplicada en el ledger. Por tanto, la ausencia observada es consistente con el historial, no prueba una ejecución incompleta de `SyncEntities`. La reversión de `AddState` recrea un índice B-tree con ese nombre, distinto del GIN original; no usar `down()` para restaurar el GIN.
- Las búsquedas actuales de artista usan `artist.name_normalized LIKE '%…%'`; la ausencia de un índice trigram puede ser un asunto de rendimiento. Es independiente de `users.roles` y no bloquea las migraciones de roles. Investigar planes y coste en una tarea propia; no crear ni reconstruir índices durante P.2.
- `UpdateListStatusEnum1766066905027` no tiene clase fuente actual. Al ser una fila ya registrada que no coincide con ninguna migración fuente pendiente, no se ejecuta ni cambia el conjunto pendiente de roles. La discrepancia de procedencia queda abierta, pero no bloquea P.2b ni el runner actual.

### Vías de ejecución automática y cambios locales

El `Procfile` ahora contiene únicamente:

```procfile
web: yarn start:prod
```

Se retiró `release: yarn migration:run:prod`; no se añadió ningún comando automático. También se cambió `migrationsRun` a `false` en `src/app.module.ts`. Antes estaba en `true`, aunque `TypeOrmModule.forRoot` no declaraba una lista/glob de migraciones; TypeORM igualmente podía entrar en `executePendingMigrations()` al inicializar y crear tablas auxiliares del migrador. Desactivarlo elimina esa vía de efectos laterales al arrancar Nest. `synchronize` continúa en `false`.

Los scripts `migration:run`, `migration:run:prod` y `migration:revert` siguen en `package.json` como comandos explícitos/manuales, pero no están invocados por `Procfile`, scripts de inicio ni arranque Nest. `yarn migration:roles` es un comando explícito y dedicado. Los trabajos `@Cron()` solo arrancan con el backend; Heroku Scheduler es externo y debe pausarse manualmente. No se cambió su configuración.

### Verificación estática del runner

`configureRolesMigrationDiscovery` limita la carga a archivos reales, planos, con nombre `13 dígitos-prefijo.ts` en desarrollo o `.js` en producción; excluye `.spec.ts`, `.test.ts` y otros archivos. La inicialización de producción usa `dist/migrations/*.js`, y el runner configura ese glob antes de inicializar. TypeORM compara cada `migration.name` (o nombre de clase) con `migrations.name` en el ledger.

`runRolesMigrationChain` exige ledger existente y presencia de las dos clases esperadas. Obtiene migraciones aplicadas/pendientes, aborta ante cualquier migración ajena pendiente, rechaza la migración singular aplicada sin la histórica y comprueba snapshots cuando una migración de roles ya figura aplicada. Solo después de esas validaciones ejecuta pendientes y no puede ejecutar la entrada ledger-only sin fuente. Las pruebas PostgreSQL aisladas previamente registradas en `roles-migration-preflight.md` cubren rechazo de migración ajena, ledger/snapshots inconsistentes y ambas secuencias históricas. En esta tarea se repitieron pruebas focalizadas de descubrimiento; no se ejecutó `migration:roles` contra producción.

**Verificaciones P.2b:** `yarn --ignore-engines test --runInBand --runTestsByPath src/migrations/__tests__/roles-migration-discovery.spec.ts src/migrations/1791910000000-MigrateCanonicalUserRoles.spec.ts src/migrations/1791920000000-MigrateUsersToSingleRole.spec.ts`: 2 suites pasaron con 25 pruebas; la suite PostgreSQL quedó omitida (19 pruebas) porque `ROLE_MIGRATION_TEST_URL` no estaba definido. Las 19 pruebas aisladas anteriores constan en el preflight local; no se conectaron a la base persistente para repetirlas. `yarn --ignore-engines tsc --noEmit -p tsconfig.build.json` pasó. Prettier pasó para este documento y `src/app.module.ts`; `git diff --check` pasó. No se ejecutó el build ni un runner que pueda escribir en PostgreSQL.

### Secuencia propuesta de ventana

El despliegue automático desde GitHub no permite que un operador intercale manualmente la migración entre el merge y el arranque de web. **No hacer merge con auto-deploy activo.** Procedimiento alternativo mínimo:

1. Antes del corte, comprobar `main`, release/configuración actual, esquema, ledger completo y que solo estén pendientes los dos nombres de roles. Confirmar `artist.name_normalized`, `version_item.branch` y todas las precondiciones de la migración; detenerse si la lista difiere.
2. Capturar un backup fresco de `DATABASE`, comprobar `Completed`, descargar/conservar checksum y ejecutar un restore de ensayo aislado con verificación de usuarios, ledger y claves. No comenzar sin restauración probada.
3. Desactivar temporalmente auto-deploy en Heroku Deploy **antes del merge** y confirmar la opción. Activar mantenimiento; pausar o quitar temporalmente los jobs de Heroku Scheduler y registrar su configuración; escalar `web` y cualquier otro proceso escritor a cero. Confirmar con `heroku ps` y `pg_stat_activity` que no quedan procesos ni escritores activos. Los crons de Nest deben estar detenidos con `web=0`.
4. Integrar el cambio en `main` sin activar un deploy automático. No lanzar build/deploy en esta etapa mientras el sistema antiguo todavía atienda tráfico.
5. Desplegar manualmente `main` desde el dashboard de Heroku con `web=0` y Scheduler pausado. El release nuevo no tiene proceso `release`; revisar el build/release y confirmar que no hubo fase de migración ni arranque de dynos web. Si no se puede desactivar/verificar auto-deploy, **no hacer merge**: primero preparar una ruta de despliegue manual que mantenga la formación en cero.
6. Anotar el ID del release creado, verificarlo con `heroku releases:info`, asegurar que no hay releases posteriores y confirmar el destino `spammusic-back`/attachment `DATABASE` sin imprimir credenciales. Ejecutar una sola vez desde ese release vigente:

   ```bash
   heroku run --app spammusic-back --no-tty --exit-code -- yarn --ignore-engines migration:roles
   ```

   `heroku run` usa el release actual; por eso se congelan deploys y cambios de configuración hasta terminar. El runner debe informar exactamente las dos migraciones de roles. Si difiere o falla, mantener mantenimiento, web a cero y Scheduler pausado; no reintentar.

7. Con SQL `READ ONLY`, verificar `users.role text NOT NULL DEFAULT 'user'`, constraint canónica válida, ausencia de `users.roles`, mismos 198 IDs/filas, distribución `user=190`, `riffvalley=3`, `superadmin=5`, dos entradas objetivo en ledger, cero filas/roles nulos o no canónicos y snapshots íntegros. Abortar ante cualquier diferencia.
8. Escalar `web` a la formación registrada (actualmente `web=1:basic`) manteniendo mantenimiento y Scheduler pausado. Verificar que el backend nuevo arranca y que endpoints públicos/de solo lectura responden; comprobar logs, conexión y ausencia de DDL/migraciones al iniciar.
9. Si API y datos están correctos, reanudar los jobs registrados de Scheduler y confirmar su calendario; desactivar mantenimiento al final. Reactivar auto-deploy solo cuando el release esté estable y exista un proceso de despliegue compatible. Restaurar cualquier formación/job temporal exactamente a su estado registrado.

Un rollback requiere volver a cerrar tráfico y escrituras. No usar el `down()` genérico ni revertir una migración histórica; seguir el plan de recuperación con backup verificado de P.1 y evitar restaurar sobre escrituras posteriores sin decisión explícita.

### Estado P.2b

Preparación completada en P.2b: ledger reconciliado en solo lectura, dos migraciones de roles confirmadas pendientes, anomalías clasificadas, arranque de migraciones automáticas desactivado localmente y procedimiento manual documentado. En esa subtarea no se modificó Heroku o PostgreSQL ni se ejecutó migración, backup o deploy. El requisito de backup fresco con restauración ensayada quedó satisfecho en P.2c; siguen pendientes la confirmación de auto-deploy/Deploy, la pausa verificada de Scheduler y la coordinación de la ventana operativa.

## P.2c — Backup de producción y ensayo de restauración (2026-10-13)

### Preflight de backup

Se confirmó con Heroku CLI que la aplicación objetivo es `spammusic-back` y que su attachment `DATABASE` corresponde al add-on PostgreSQL disponible `postgresql-lively-94498`, plan `Essential-0`, PostgreSQL 16.14. En la captura, la base ocupaba 25.9 MB de 1 GB, con 31 tablas y cero conexiones observadas de un máximo de 20. No se consultaron ni registraron credenciales. La producción continúa en el esquema legacy `users.roles text[]`.

Antes de capturar había cinco backups manuales completados, el límite de retención del plan: `b006`, `b005`, `b004`, `b003` y `b002`. `b002`, del 2025-09-11 y el más antiguo, era el que podía eliminarse al crear una nueva captura; su detalle confirmaba que era manual y no mostraba restauraciones. Se evaluó que no debía conservarse para el corte porque había cuatro capturas posteriores y se iba a generar y ensayar una copia fresca. No había programación de backups. Se confirmó espacio local suficiente para descargar el archivo.

### Captura, descarga y archivo

El 2026-10-13 se ejecutó `heroku pg:backups:capture --app spammusic-back`. PGBackups creó `b007`, con estado `Completed`; la copia comenzó a las 21:11:04 UTC y terminó a las 21:11:16 UTC. El tamaño de la base indicado por PGBackups fue 26.06 MB y el archivo de backup 3.70 MB. Como consecuencia del límite de cinco backups manuales, `b002` dejó de figurar; permanecieron `b003`–`b007`.

Se descargó `b007` fuera del repositorio en:

```text
/tmp/riffvalley-p2c-20261013/spammusic-back-b007-20261013.dump
```

El directorio tiene permisos `0700`; el archivo tiene permisos `0600`, propietario local `tottibero`, tamaño 3,876,796 bytes y SHA-256:

```text
c664bd7e6281a9d9275da8643ad218e89bec5222de6c9e2413d8994e89c91c41
```

`pg_restore --list` leyó correctamente el archivo custom (TOC de 201 entradas) y confirmó entradas de definición y datos para `public.users` y `public.migrations`. No se consultaron ni expusieron registros personales. La ruta está en `/tmp`, por lo que es almacenamiento temporal; antes de la ventana de corte hay que copiar el archivo y su checksum a almacenamiento local aprobado, persistente y de acceso restringido, y volver a validar el checksum.

### Ensayo aislado

Se comprobó que no existía una base con el nombre `riffvalley_roles_restore_b007` y se creó únicamente esa base temporal en el PostgreSQL local 17.10 del contenedor `spammusicdb` (la copia proviene de PostgreSQL 16.14). No se sobrescribió `SpamMusicDB` ni se restauró sobre producción. `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges` terminó con código cero. Las consultas de validación se ejecutaron dentro de una transacción `READ ONLY` y se cerraron con `ROLLBACK`.

Resultados de la copia restaurada:

- `users.roles` existe como `text[] NOT NULL DEFAULT '{user}'`; `users.role` no existe, consistente con el esquema legacy de producción.
- 198 usuarios. No había arrays nulos/vacíos ni elementos `NULL` en los arrays.
- Distribución agregada exacta de arrays: `{babyUser}` 190; `{riffValley}` 1; `{riffValley,user,superUser}` 1; `{user,riffValley}` 2; `{user,riffValley,superUser}` 2; `{user,superUser,riffValley}` 2.
- El ledger contiene 89 entradas, con timestamps entre `1690000000000` y `1791300000000`; ninguna de las dos migraciones de roles objetivo está registrada como aplicada. El fingerprint agregado del ledger fue `6a8dffae953ae84b8049b7198b9f080a`.
- Las 41 restricciones de clave foránea están validadas; cero restricciones sin validar. La restauración completa con `--exit-on-error` también terminó sin errores.

Tras completar las comprobaciones se eliminó solo la base temporal `riffvalley_roles_restore_b007`. La lista posterior contiene únicamente `SpamMusicDB` y `postgres`; ambas quedaron intactas. El archivo descargado se conserva fuera del repositorio en la ruta indicada. La captura solo añadió un backup a PGBackups y, conforme al límite documentado, retiró `b002`; no se ejecutaron migraciones, no se desplegó código ni se modificaron el esquema, los datos, el mantenimiento, los dynos o Scheduler de producción.

### Recuperación y condiciones pendientes

El backup `b007` es el punto de recuperación pre-corte ensayado. Si se decide una recuperación, primero hay que cerrar tráfico y escrituras, confirmar explícitamente que el destino es `DATABASE` de `spammusic-back`, evaluar si hay escrituras posteriores que se perderían y autorizar la sustitución completa de la base. El comando previsto es:

```bash
heroku pg:backups:restore b007 DATABASE --app spammusic-back --confirm spammusic-back
```

Este comando es destructivo para el contenido actual del destino y **no se ejecutó**. El ensayo local valida que el archivo se restaura; no prueba una restauración sobre el add-on de producción.

P.2c queda completada: hay una copia fresca descargada, identificada por checksum y restaurada correctamente en una base aislada; el esquema, los agregados de usuarios, el ledger y las claves foráneas se verificaron. Antes del corte siguen pendientes: mover la copia desde `/tmp` a almacenamiento persistente aprobado y comprobar su checksum; coordinar y desactivar temporalmente auto-deploy antes del merge; confirmar los trabajos configurados en Scheduler y pausarlos para la ventana; y acordar la ventana operativa con mantenimiento, web/procesos escritores detenidos y el runner ejecutado una sola vez desde el release correcto. Producción mantiene las dos migraciones de roles pendientes y el esquema `users.roles[]`; esta tarea no las inició.

## P.2d — Preparación operativa de la ventana (2026-10-13)

### Backup conservado

Se copió el archivo de `b007` desde `/tmp` a almacenamiento persistente existente, fuera de ambos repositorios:

```text
/home/tottibero/backups/riffvalley-p2c-20261013/spammusic-back-b007-20261013.dump
```

La carpeta tiene permisos `0700`; el archivo, `0600`; ambos son propiedad de `tottibero`. Tamaño: 3,876,796 bytes. SHA-256 comprobado en origen y destino: `c664bd7e6281a9d9275da8643ad218e89bec5222de6c9e2413d8994e89c91c41`. La copia original de `/tmp` se conserva; no se sobrescribió ni eliminó ningún backup.

### Estado observado de Heroku

Consultas de lectura realizadas el 2026-10-13 a `spammusic-back`:

- App correcta, región EU, stack `heroku-24`; add-on PostgreSQL conectado como `DATABASE` y add-on `scheduler:standard` conectado como `SCHEDULER`.
- Release actual `v308`; el release de aplicación más reciente visible en el historial era `v307` (commit abreviado `251cdffe`), seguido por cambios de configuración. No usar `releases:info` para inspección: esa salida incluye variables de configuración.
- Formación actual `web=1:Basic`; `web.1` está `up` con comando `yarn start:prod`. No aparecen otros dynos activos en `heroku ps` en esta consulta. Mantenimiento está `off`.
- `pipeline_coupling` aparece `null`; esto no determina si la app tiene conexión directa a GitHub.
- La CLI disponible no muestra el repositorio GitHub enlazado, rama de auto-deploy ni el interruptor de auto-deploy. Por tanto, **el estado real de conexión GitHub, rama y auto-deploy queda sin verificar**. El historial de releases por sí solo no lo prueba.

Antes de cualquier merge, el operador debe abrir `Heroku Dashboard → spammusic-back → Deploy` y comprobar el método de despliegue, repositorio conectado, rama seleccionada y estado de `Automatic deploys`/`Wait for CI`. Registrar la rama y el estado actual. Para impedir despliegues durante la ventana, desactivar `Automatic deploys` en esa sección y verificar visualmente que queda desactivado; después del corte, volver a activarlo solo si estaba activo originalmente y el servicio ya fue validado. La integración de Heroku con GitHub se configura desde Deploy y despliega pushes a la rama seleccionada cuando el auto-deploy está activo ([documentación de GitHub Integration](https://devcenter.heroku.com/articles/github-integration)). No se cambió esta configuración.

### Scheduler y otros escritores

La app tiene `scheduler:standard` como `SCHEDULER`, pero `heroku help scheduler` devuelve que no hay comando Scheduler instalado y `heroku ps` no revela definiciones ni historial. La UI del dashboard no está disponible en esta sesión; no se pueden afirmar nombres de jobs, comandos, frecuencias ni su relación concreta con PostgreSQL. Antes del corte, revisar `Heroku Dashboard → spammusic-back → Resources/Add-ons → Scheduler`; registrar para cada job comando, frecuencia, próxima ejecución y tamaño. Inspeccionar el comando contra el código antes de clasificarlo. Hasta entonces, tratar cada job como capaz de escribir en PostgreSQL.

La documentación de Heroku indica que Scheduler ejecuta jobs en one-off dynos independientes. El panel documenta creación y edición, pero no una función de pausa para jobs ordinarios ([Heroku Scheduler](https://devcenter.heroku.com/articles/scheduler)). Procedimiento previsto: guardar la configuración completa, eliminar temporalmente cada job en el dashboard antes de detener escritores, confirmar que no quedan jobs programados, y recrearlos con los mismos valores solo después de validar la API y los datos. Antes de migrar, comprobar `heroku ps --app spammusic-back` y esperar a que terminen los `scheduler.*` ya iniciados; si alguno sigue activo, detenerlo individualmente con `heroku ps:stop <scheduler.dyno> --app spammusic-back`, confirmar que terminó y revisar de nuevo conexiones PostgreSQL. No borrar jobs sin una copia verificable de su comando y configuración.

Además del add-on externo, la rama de código local contiene tareas Nest `@Cron()` que pueden escribir datos o renovar tokens: sincronización de Instagram y TikTok (cada 10 min por defecto), refresh semanal de token Instagram, revisión diaria de autorización TikTok/Spotify, búsqueda diaria de enlaces Spotify y creación semanal de contenido. La sincronización Instagram hace upsert; hay escrituras en tareas de TikTok y contenido. Se detienen al escalar `web` a cero porque viven en el proceso API. Confirmar que el release a desplegar contiene la configuración ya revisada, sin asumir que el release antiguo ejecuta exactamente las mismas tareas.

### Controles y comandos para la ventana

Estado actual de la formación confirmado: `web=1:Basic`; no hubo worker ni otro dyno de formación visible. La fase `release` ya no está en el `Procfile`, que contiene `web: yarn start:prod`; `src/app.module.ts` fija `migrationsRun: false` y `synchronize: false`. El script de arranque no lanza el runner de migraciones. Las migraciones permanecen como comandos explícitos. Las verificaciones de escala y lifecycle se apoyan en la documentación de [maintenance mode](https://devcenter.heroku.com/articles/maintenance-mode), [scaling](https://devcenter.heroku.com/articles/scaling) y [formación de dynos](https://devcenter.heroku.com/articles/dyno-formation): maintenance no detiene procesos; un deploy conserva la formación configurada. El release candidate debe volver a comprobarse antes del corte.

No ejecutar estos comandos ahora. Durante el corte, ejecutar cada paso por separado y comprobar el resultado antes de continuar:

1. **Preflight y backup:** verificar en modo lectura app, `DATABASE`, esquema/ledger, release, estado de los jobs, hash del backup persistente y que los únicos pendientes siguen siendo `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000`. Confirmar que la copia `b007` aún está en el almacenamiento aprobado y restaurable.
2. **Auto-deploy:** en Deploy, registrar branch/repository/estado originales, desactivar Automatic deploys y confirmar visualmente que está off. Si no se puede desactivar o la rama conectada no es la aprobada, abortar antes de detener procesos o hacer merge.
3. **Cerrar tráfico y escritores:** guardar formación actual; activar mantenimiento y verificarlo:

   ```bash
   heroku maintenance:on --app spammusic-back
   heroku maintenance --app spammusic-back
   ```

   Guardar en el dashboard el comando, frecuencia y demás valores de cada Scheduler job; eliminarlos temporalmente y confirmar la lista vacía. Escalar los procesos de formación a cero (hoy solo se observó `web`):

   ```bash
   heroku ps:scale web=0 --app spammusic-back
   heroku ps --app spammusic-back
   ```

   Si el preflight de la ventana detecta otros tipos de dyno escritores, escalarlos también a cero con sus cantidades confirmadas. Esperar y comprobar que no quedan one-off `scheduler.*`; detener cada uno que permanezca con `heroku ps:stop <scheduler.dyno> --app spammusic-back`. Consultar `pg_stat_activity` mediante `heroku pg:psql DATABASE --app spammusic-back`; continuar solo cuando no queden escritores ni transacciones activas ajenas a la propia consulta.

4. **Merge:** hacer merge a `main` solo después de confirmar backup, auto-deploy off, mantenimiento on, formación en cero, Scheduler vacío y cero escritores. Si no se puede garantizar que el merge no despliega automáticamente, abortar y no hacer merge.
5. **Deploy manual:** desde Deploy, disparar manualmente el branch aprobado mientras la formación permanece en cero. No usar `git push heroku` sin decisión operativa específica. Confirmar build exitoso, release nuevo, ausencia de fase `release`, ausencia de dynos web arrancados y Scheduler todavía vacío. `heroku releases --app spammusic-back` y `heroku ps --app spammusic-back` son las consultas de comprobación; evitar `releases:info`, que lista config vars. Si aparece un dyno nuevo, una fase de migración o un release inesperado, abortar y no correr el runner.
6. **Runner de roles:** anotar el release nuevo y congelar nuevos deploys/cambios. Reconfirmar app/attachment por nombre sin imprimir configuración. Ejecutar una sola vez el runner del release vigente:

   ```bash
   heroku run --app spammusic-back --no-tty --exit-code -- yarn --ignore-engines migration:roles
   ```

   Continuar solo si informa exactamente las dos migraciones de roles; si no, falla o hay duda de qué release ejecutó, mantener mantenimiento y dynos en cero, y abortar sin reintentar.

7. **Postflight:** antes de arrancar procesos, ejecutar SQL de solo lectura y contrastar esquema singular, constraint, ausencia de `users.roles`, 198 usuarios/IDs, distribución `user=190`, `riffvalley=3`, `superadmin=5`, ledger/snapshots e integridad. Cualquier diferencia bloquea el arranque.
8. **Reapertura:** solo tras postflight correcto, recuperar la formación registrada (`web=1:Basic`), verificar dyno/release, conexión y endpoints de API mientras maintenance sigue on. Recrear los Scheduler jobs desde el registro validado y verificar cada comando/frecuencia. Cuando API y jobs estén comprobados, ejecutar `heroku maintenance:off --app spammusic-back` y confirmar `heroku maintenance --app spammusic-back`. Reactivar Automatic deploys únicamente con el servicio estable y la rama acordada.

**Abortar** ante backup ausente/hash distinto, GitHub/branch/auto-deploy sin confirmar, job no inventariado o activo, proceso/escritor que no se logra detener, formación distinta sin explicación, merge que desencadene deploy, release/Procfile inesperado, migración adicional, runner con resultado diferente, error parcial o postflight no idéntico a los criterios. No abrir tráfico ni reintentar el runner en esos casos; conservar web en cero, Scheduler sin jobs y maintenance on hasta decisión operativa.

### Bloqueos y estado P.2d

El backup está conservado y su checksum coincide. Los datos actuales de app, release, mantenimiento y formación fueron consultados; no se modificó Heroku ni se detuvo proceso alguno. P.2d **no queda lista para ejecutar el corte** porque falta comprobar en el dashboard la integración GitHub/branch/auto-deploy y todavía no se han inventariado los Scheduler jobs. Esas revisiones deben completarse antes de la ventana y el merge.

Durante la inspección, `heroku releases:info v308` devolvió variables de configuración sensibles en la salida. No se registraron sus valores en este documento. Por precaución, considerar expuestos los secretos de ese release y rotarlos por el procedimiento habitual antes de autorizar el corte; esto no se ejecutó aquí.

## P.3 — Fase 1: preflight inmediato (2026-10-13)

**Alcance de esta entrada:** solo comprobaciones de lectura y preparación local. No se activó maintenance, no se detuvieron/escalaron dynos, no se cambió Automatic Deploys/Scheduler, no se capturó un backup nuevo, no se hizo merge/push/deploy y no se ejecutó ninguna migración.

### Workspace, Git y versión candidata

- Repositorio: `/home/tottibero/workspaces/riffvalley/riffvalley-app-back`; `origin` es `git@github.com:riffvalley/riffvalley-app-back.git`. Rama actual `refactor/roles`, `HEAD=2634a6b` (`feat(auth): migrate to canonical single roles`), con upstream `origin/refactor/roles` en ese commit.
- El `HEAD` local está dos commits por delante de la referencia local `origin/main`; esa referencia no se actualizó con `fetch` durante el preflight. La rama no se integró en `main`.
- Están versionados en la rama actual el runner, las dos migraciones, el guard, el cambio de `package.json` y el resto del código de roles. Permanecen sin commit los cambios necesarios de `Procfile` y `src/app.module.ts`, además de cambios en `roadmap/roles/roles.md`. `roadmap/roles/production-deployment.md` y `.aws` están sin seguimiento; `.aws` no se inspeccionó ni modificó. Se conservaron todos los cambios y no se preparó un commit.
- El archivo de trabajo `Procfile` contiene solo `web: yarn start:prod`, y `src/app.module.ts` tiene `migrationsRun: false` y `synchronize: false`. Sin embargo, **el `HEAD` versionado todavía contiene** `release: yarn migration:run:prod` y `migrationsRun: true`; se confirmó comparando el diff local con los archivos de `HEAD`. Por tanto, la rama remota aún no contiene ambas salvaguardas. No desplegar ni integrar esa versión hasta que el candidato exacto incluya ambas y esté revisado.

### Heroku, PostgreSQL y backup

Consultas no destructivas a `spammusic-back` confirmaron:

- Release actual `v308`; `heroku releases` muestra el deploy de código más reciente como `v307`. Se evitó `releases:info` porque expone config vars.
- Mantenimiento `off`; formación `web=1:Basic`; `web.1` está `up` y ejecuta `yarn start:prod`. En `heroku ps` no aparecían workers ni dynos one-off activos en el instante de consulta. La consulta SQL posterior contó cero otras consultas activas. Los procesos y la base no se alteraron.
- PostgreSQL conectado como `DATABASE`, estado `Available`, versión `16.14`, uso `26.1 MB / 1 GB`, `0/20` conexiones antes de la consulta. PGBackups lista `b007` como `Completed` y mantiene `b003`–`b007` (cinco copias); no hay restauraciones/copies remotas listadas. Una captura nueva probablemente retiraría `b003`, el backup remoto más antiguo; revisar su necesidad antes de P.3 fase 2. `b007` ya está conservado fuera del repo en `/home/tottibero/backups/riffvalley-p2c-20261013/`, modo `0700` para la carpeta y `0600` para el dump, con SHA-256 `c664bd7e6281a9d9275da8643ad218e89bec5222de6c9e2413d8994e89c91c41`, coincidente con el original. Su ensayo de restauración está documentado en P.2c.
- El usuario confirma que GitHub está conectado y que Automatic Deploys está desactivado. No se cambió la integración. La CLI no revela el repositorio/rama ni permite verificar el toggle; la sesión no pudo abrir el dashboard. Registrar de nuevo estos valores visualmente en `Deploy` antes del corte.

La lectura SQL se ejecutó contra el attachment `DATABASE` usando una transacción `BEGIN READ ONLY`/`ROLLBACK`; el servidor confirmó `transaction_read_only=on`. No se inicializó TypeORM ni se consultaron datos personales:

- `public.users.roles` existe como `text[] NOT NULL DEFAULT '{user}'`; `users.role` no existe.
- 198 usuarios y las mismas seis combinaciones agregadas del backup `b007`: `{babyUser}` 190; `{riffValley}` 1; `{riffValley,user,superUser}` 1; `{user,riffValley}` 2; `{user,riffValley,superUser}` 2; `{user,superUser,riffValley}` 2.
- Arrays nulos/vacíos, miembros `NULL`, roles fuente duplicados/desconocidos, mezclas ambiguas con `user`, resultados vacíos y colisiones al normalizar: todos 0.
- El ledger contiene 89 entradas (`1690000000000`–`1791300000000`). Se compararon las 90 identidades efectivas derivadas estáticamente de los archivos fuente con `migrations.name` en la misma transacción de solo lectura: faltan únicamente `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000000`; la entrada ledger-only sigue siendo `UpdateListStatusEnum1766066905027`. No hay migraciones fuente ajenas pendientes ni cambios respecto al estado agregado de P.2b/P.2c.

### Despliegue y runner: condiciones no demostradas

El buildpack asociado es `heroku/nodejs` Classic. El archivo `package.json` registra `ts-node` y `tsconfig-paths` en `devDependencies`, pero `migration:roles` los requiere en runtime (`node --require ts-node/register --require tsconfig-paths/register ...`). La documentación del buildpack indica que, por defecto, elimina `devDependencies` antes de desplegar el slug, salvo configuración para conservarlas ([Node.js Classic Buildpack Builds](https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds)). No se consultaron config vars y no existe un slug del commit candidato; **no está demostrado que el runner y sus dependencias estén disponibles en el release que se desplegaría**. Comprobarlo de forma no destructiva en el artefacto exacto antes de autorizar la fase 3; si falta alguna dependencia, detenerse y preparar una corrección de empaquetado aprobada antes de la ventana.

`src/data-source.ts` construye la conexión a partir de `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME` y `DB_PASSWORD`; no usa directamente el attachment `DATABASE_URL`. La consulta de esta fase verificó el attachment `DATABASE`, no esos valores de aplicación. Por la restricción de no consultar config vars, **no queda demostrado que el runner vaya a apuntar al mismo Postgres**. Antes de autorizar la fase 4, verificar internamente (sin mostrar ni registrar valores) que el datasource del release candidato corresponde al Postgres `DATABASE` de `spammusic-back`.

El `Procfile` y `migrationsRun` del archivo de trabajo impiden sus respectivas vías automáticas solo cuando formen parte del release candidato. La formación `web=0` se preserva entre releases de Heroku, de modo que web y los crons de Nest no arrancan durante el deploy si se escala a cero antes y no existe otro proceso de arranque; maintenance por sí solo no detiene procesos. La integración GitHub permite el deploy manual de una rama enlazada desde `Deploy` ([GitHub Integration](https://devcenter.heroku.com/articles/github-integration)). Falta comprobar el branch enlazado en el dashboard y la disponibilidad de `ts-node`/`tsconfig-paths` en el slug exacto.

El runner abre el datasource del proceso one-off y compara el ledger contra los dos nombres requeridos; la fase 4 debe apuntar al release actualmente vigente. `heroku run` opera con el release actual, no ofrece un pin del release anterior en el comando registrado. Por eso, entre verificar el nuevo release y ejecutar una sola vez el runner, habrá que congelar despliegues/cambios de configuración, confirmar inmediatamente con `heroku releases` que el release esperado sigue siendo el actual y lanzar `heroku run --app spammusic-back --no-tty --exit-code -- yarn --ignore-engines migration:roles` sin operaciones intermedias. Si no se puede garantizar esa exclusión o confirmar el release, abortar.

### Scheduler, secuencia y comandos de fase 2

Por contexto aportado por el usuario, Scheduler tiene un job previsto a las 05:00. No se pudo inspeccionar su comando, zona horaria, configuración ni si fue pausado; tampoco hubo un dyno `scheduler.*` activo en el `heroku ps` consultado. La hora habitual no garantiza que el job no se ejecute durante la ventana. La fase 2 necesita inventariar el job en el dashboard, conservar sus parámetros y demostrar que no puede iniciar otro one-off; comprobar `heroku ps` de nuevo inmediatamente antes de migrar.

Comandos previstos para ejecutar **solo con autorización expresa de fase 2**, por separado y con control después de cada uno:

```bash
heroku pg:backups --app spammusic-back
heroku pg:backups:capture --app spammusic-back
heroku pg:backups:info <ID_NUEVO> --app spammusic-back
heroku pg:backups:download <ID_NUEVO> --app spammusic-back --output /home/tottibero/backups/riffvalley-p2c-20261013/spammusic-back-pre-cut.dump
sha256sum /home/tottibero/backups/riffvalley-p2c-20261013/spammusic-back-pre-cut.dump
pg_restore --list /home/tottibero/backups/riffvalley-p2c-20261013/spammusic-back-pre-cut.dump
heroku maintenance:on --app spammusic-back
heroku maintenance --app spammusic-back
heroku ps:scale web=0 --app spammusic-back
heroku ps --app spammusic-back
heroku pg:psql DATABASE --app spammusic-back --command "BEGIN READ ONLY; SELECT pid, application_name, state, xact_start FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid(); ROLLBACK;"
```

Antes de la captura, confirmar qué copia puede vencer por retención y que no debe preservarse aparte. Pausar/eliminar en el dashboard el job Scheduler solo después de guardar su configuración, esperar que terminen los procesos ya lanzados, detener cualquier one-off escritor identificado y comprobar que no quedan transacciones/escritores. Si no puede garantizarse la pausa, abortar antes de desplegar/migrar. Las fases 3–5 siguen siendo solo el procedimiento documentado de P.2b: merge controlado, deploy manual con formación cero, runner una vez, postflight, arranque bajo maintenance y reapertura tras validación; no se ejecutaron.

### Decisión de fase 1

El estado de PostgreSQL coincide con P.2b/P.2c y no presenta bloqueos de datos ni migraciones ajenas. Sin embargo, **detener el procedimiento antes de fase 2/3**: las salvaguardas `Procfile`/`migrationsRun` no están versionadas, no se ha demostrado que el slug contenga las dependencias del runner, no se ha comprobado que el datasource de la migración use el attachment objetivo y Scheduler no está inventariado/garantizado en pausa. El usuario confirma Automatic Deploys off, pero no pudo verificarse visualmente en esta sesión. Sigue además pendiente la rotación de secretos registrada en P.2d. No se declara P.3 completada.

## P.3.1 — Runner compilado para el slug de Heroku (2026-10-13)

### Causa y solución

El comando previo de `migration:roles` cargaba `scripts/run-roles-migration-chain.ts` con `ts-node/register` y `tsconfig-paths/register`. Ambos paquetes están en `devDependencies`; el buildpack Node.js Classic poda esas dependencias del slug de runtime por defecto. Por tanto, el runner anterior no tenía garantizado poder arrancar en el dyno temporal.

La implementación se movió a `src/roles-migration/run-roles-migration-chain.ts`, que entra en el build existente de Nest sin ampliar `tsconfig.build.json` ni alterar el `rootDir`. `yarn build` produce `dist/roles-migration/run-roles-migration-chain.js`, `dist/data-source.js` y las migraciones en `dist/migrations/*.js`. El archivo `scripts/run-roles-migration-chain.ts` queda como puente para las importaciones de pruebas existentes. El script manual `migration:roles` ejecuta ahora `node dist/roles-migration/run-roles-migration-chain.js` directamente.

El dyno requiere Node.js 20, el código compilado del runner/datasource/migraciones y dependencias runtime ya declaradas: TypeORM y `pg`; `reflect-metadata` y `dotenv` también están presentes en el árbol de dependencias de producción (`dotenv` llega por `@nestjs/config`). El build usa herramientas de desarrollo durante la compilación; la ejecución no requiere `ts-node`, `tsconfig-paths` ni activar la conservación global de devDependencies. `STAGE=prod` sigue seleccionando únicamente `dist/migrations/*.js`. El runner conserva el filtro de archivos timestamped, los nombres requeridos, el rechazo de migraciones ajenas pendientes y las verificaciones de ledger y snapshots.

### Verificaciones y límites

- `yarn build` fue bloqueado por el Node local 22.23.1 frente a `engines.node=20.x`; `yarn --ignore-engines build` terminó correctamente y ejecutó el `postbuild` existente.
- `yarn --ignore-engines tsc --noEmit --incremental false --project tsconfig.build.json --pretty false` terminó correctamente.
- Las pruebas focalizadas pasan (28 pruebas), incluidas simulaciones aisladas del rechazo de migraciones ajenas pendientes, del ledger singular sin migración histórica y de snapshots ausentes. La suite PostgreSQL de `1791920000000-MigrateUsersToSingleRole.spec.ts` quedó omitida por no estar configurado `ROLE_MIGRATION_TEST_URL`; por ello esta ejecución no repitió una migración real sobre el esquema legacy ni verificó esos estados mediante PostgreSQL.
- Un smoke check de Node cargó el runner compilado sin preloads de TypeScript, encontró 90 migraciones compiladas, confirmó ambas clases de roles y cargó sus módulos sin abrir conexión a base de datos.
- Las simulaciones no abrieron conexiones; ningún runner se ejecutó contra una base persistente. El test de migración legacy con PostgreSQL permaneció omitido.
- El artefacto se verificó en el build local, no en un slug real de Heroku. Sigue pendiente verificar el release exacto antes del corte, su datasource contra el attachment `DATABASE` sin exponer valores, y que el `Procfile`/`migrationsRun: false` estén incluidos en ese release. No se consultó ni modificó Heroku.

### Comando operativo y salvaguardas

Cuando un release revisado contenga el cambio, el comando manual para Heroku será:

```bash
heroku run --app spammusic-back --no-tty --exit-code -- yarn migration:roles
```

Debe ejecutarse solo con `web=0`, Scheduler pausado, escritores detenidos, maintenance activo, release correcto confirmado inmediatamente antes y preflight SQL actualizado. No se ejecutó en P.3.1. El archivo de trabajo `Procfile` sigue conteniendo solo `web: yarn start:prod`; `src/app.module.ts` mantiene `migrationsRun: false` y `synchronize: false`. No hay invocación automática del runner en `start:prod` ni una fase `release`; su única ejecución nueva es explícita mediante `yarn migration:roles`.

P.3.1 deja preparada la compilación local del runner, pero **no autoriza ni completa el corte**. Antes de P.3.2/P.3 posterior siguen pendientes la integración versionada de las salvaguardas, la verificación operativa del destino `DATABASE`, el inventario/pausa verificable de Scheduler, confirmar el despliegue sin reactivar escritores y resolver la rotación de secretos indicada en P.2d. No se desplegó, no se hizo merge ni push y no se ejecutaron migraciones.

## P.3.2 — Verificación operativa final antes del corte (2026-10-13)

**Alcance:** inspecciones locales, Heroku y PostgreSQL de solo lectura. No se cambiaron config vars, Automatic Deploys, Scheduler, dynos, maintenance ni releases; no se hizo backup nuevo, deploy, merge, push o migración.

### Datasource y PostgreSQL

`src/data-source.ts` y `src/app.module.ts` conectan con las variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME` y `DB_PASSWORD`, no con `DATABASE_URL`. Se leyó la configuración de `spammusic-back` dentro de un proceso que solo comparó en memoria sus cinco componentes contra la URL del attachment `DATABASE`; host, puerto, base, usuario y contraseña coincidieron. La salida mostró únicamente los resultados booleanos y la presencia de variables; no mostró ni guardó sus valores.

La consulta de PostgreSQL se ejecutó contra `DATABASE` en transacción `READ ONLY` y terminó con `ROLLBACK`. Confirmó PostgreSQL 16.14 disponible, esquema legacy `public.users.roles text[] NOT NULL DEFAULT '{user}'` y ausencia de `users.role`; 198 usuarios, cero arrays nulos/vacíos y la misma distribución agregada documentada en P.3 fase 1. El ledger conserva 89 filas y ninguna de las dos migraciones de roles está registrada. No se consultaron datos personales ni se modificó el esquema.

### Heroku, release y salvaguardas

Las consultas de lectura confirmaron la app `spammusic-back`, release actual `v308` (el release de código es `v307`, commit `251cdffe`), mantenimiento apagado, `web=1` con `web.1` arriba y el add-on PostgreSQL `postgresql-lively-94498` disponible. `heroku ps` solo mostró `web.1` en el momento de la consulta; no aparecían procesos one-off activos. El release actual no es el candidato nuevo.

El usuario confirma que Automatic Deploys continúa desactivado; la CLI no expone el toggle de la integración GitHub y no se intentó abrir ni cambiar esa configuración. La rama local es `refactor/roles`, en `2634a6b978cbcfd1e367bfe36f7c99d7121c46ca`, idéntica a la referencia local `origin/refactor/roles`. Los cambios de preparación siguen sin commit y no forman parte del release: `Procfile`, `src/app.module.ts`, `package.json`, el puente `scripts/run-roles-migration-chain.ts`, el nuevo `src/roles-migration/run-roles-migration-chain.ts`, la prueba focal y documentación. `roadmap/roles/roles.md` y `.aws` también aparecen con cambios locales; `.aws` no se inspeccionó ni modificó. No se preparó commit ni se publicó nada.

En los archivos de trabajo, `Procfile` contiene solo `web: yarn start:prod`; `synchronize` y `migrationsRun` son `false`; `migration:roles` apunta a `node dist/roles-migration/run-roles-migration-chain.js`. El build de P.3.1 produjo el runner, el datasource y las migraciones en `dist`; no se encontró una invocación de migraciones en build, `start:prod` o arranque Nest. Los scripts generales `migration:run` y `migration:run:prod` siguen disponibles como comandos manuales, pero no se invocan automáticamente. El release que corre producción todavía no contiene estos cambios locales.

### Scheduler y procesos que escriben

La app tiene el add-on `scheduler:standard` (`scheduler-shallow-63777`) conectado. La CLI consultada no tiene plugin Scheduler ni comando `heroku scheduler`; `heroku addons:info` identifica el add-on, pero no lista jobs. El dato previo del usuario indica un job habitual a las 05:00; el número de tareas, comandos, frecuencia/zona horaria, próxima ejecución y posibles jobs adicionales no se pudieron inspeccionar en el dashboard. No se puede concluir que no existan otros jobs ni que el job conocido sea de solo lectura: Scheduler acepta comandos de la app y los ejecuta en one-off dynos, que pueden escribir en PostgreSQL según el comando. `heroku ps` solo descarta que hubiera un one-off activo en el instante de la consulta. El dashboard es la fuente para inventariar y gestionar estos jobs ([documentación de Scheduler](https://devcenter.heroku.com/articles/scheduler)).

La aplicación Nest también registra cron jobs en el dyno web: sincronización/upsert de Instagram y TikTok cada diez minutos por defecto; renovación semanal del token de Instagram; revisiones diarias de autorización Spotify/TikTok; comprobación diaria de enlaces Spotify; creación semanal de contenido; y comprobación diaria de autorización de playlists. Varios realizan escrituras en PostgreSQL o renuevan/persisten tokens. Al escalar `web` a cero dejan de ejecutarse los `@Cron()` de Nest. Maintenance mode por sí solo no detiene dynos ni jobs Scheduler; la documentación de Heroku confirma que los jobs Scheduler siguen pudiendo ejecutarse durante maintenance ([Maintenance Mode](https://devcenter.heroku.com/articles/maintenance-mode)).

**Condición de bloqueo:** antes del corte alguien con acceso al dashboard debe registrar cada comando, frecuencia/zona horaria y tamaño de dyno del Scheduler; guardar esa configuración; retirar temporalmente todos los jobs programados; esperar a que terminen los one-off ya iniciados; y verificar con `heroku ps --app spammusic-back` que no quede ninguno. Si no se pueden inventariar y suspender todos, abortar antes de desplegar o migrar. Al final, recrear los jobs registrados solo después de validar el nuevo backend y los datos.

### Backup y secuencia recomendada

El archivo `/home/tottibero/backups/riffvalley-p2c-20261013/spammusic-back-b007-20261013.dump` sigue disponible fuera del repositorio, con permisos `0600` y tamaño 3,876,796 bytes. Su SHA-256 es `c664bd7e6281a9d9275da8643ad218e89bec5222de6c9e2413d8994e89c91c41`, coincidente con el checksum original documentado en P.2c. No se generó otra copia durante P.3.2.

Secuencia para una ventana posterior, con verificación independiente entre pasos:

1. Completar el inventario/pausa de Scheduler; mantener Automatic Deploys off y verificarlo en Deploy del dashboard. Confirmar el branch, el commit candidato y que todos los cambios requeridos estén incluidos en el release revisado.
2. Confirmar retención de PGBackups, crear y descargar un backup fresco y comparar su checksum antes de cerrar escritores.
3. Activar maintenance; detener los Scheduler jobs ya retirados y esperar one-off; escalar `web` y cualquier otro proceso escritor a cero. Verificar `heroku ps` y sesiones/escritores en PostgreSQL con consultas de lectura.
4. Hacer merge/publicar solo después de revisar el release candidato. Desplegar manualmente, mantener la formación en cero y comprobar release, ausencia de fase `release` y ausencia de procesos nuevos. Abortar ante una discrepancia.
5. Revalidar datasource, esquema y ledger contra el release recién activo. Ejecutar una única vez `heroku run --app spammusic-back --no-tty --exit-code -- yarn migration:roles`; continuar solo si informa exactamente las dos migraciones esperadas. No reintentar ante error o resultado parcial.
6. Confirmar schema, datos, ledger y snapshots mediante postflight SQL de solo lectura. Solo después arrancar `web` bajo maintenance, validar API y logs, recrear Scheduler desde el inventario, y retirar maintenance cuando todo esté comprobado.

### Decisión P.3.2

Datasource/config vars coinciden con `DATABASE`, `b007` conserva su checksum y el código local preparado mantiene las salvaguardas de P.3.1. Sin embargo, **no iniciar el corte todavía**: Scheduler continúa sin inventario comprobable y los cambios requeridos permanecen sin commit ni publicación, mientras producción sigue ejecutando `v307` de código. El estado de Automatic Deploys es confirmación del usuario, no comprobación independiente de CLI. La rotación de secretos ya registrada en P.2d también sigue pendiente. No se desplegó, no se cambió configuración de Heroku/PostgreSQL ni se ejecutaron migraciones.

## P.3.5 — Backup y despliegue manual en Heroku (2026-10-14)

**Resultado: completada.** Se desplegó en `spammusic-back` el commit exacto `826f7dc363b695a0dd9e0bf2018877003e9bb95e` mediante Heroku Git, sin `--force`. El build terminó correctamente y creó el release `v309`. La aplicación permanece en maintenance (`on`) y sin dynos activos (`web=0`). No se ejecutaron migraciones ni se inició el dyno web.

### Preflight y backup fresco

- `main` local y `origin/main` apuntaban a `826f7dc363b695a0dd9e0bf2018877003e9bb95e`. El commit contiene `Procfile` sin fase `release`, `migrationsRun: false`, `synchronize: false` y el script `migration:roles` dirigido al runner JavaScript compilado.
- El remoto Heroku existente corresponde a `spammusic-back`; no se modificó `origin` ni la integración GitHub del dashboard.
- Antes del deploy, Heroku estaba en `v308`; maintenance estaba `on` y no había dynos activos. PostgreSQL `postgresql-lively-94498` estaba disponible.
- Se revisó la retención de cinco backups (`b003`–`b007`) y se capturó `b008`, completado el 2026-10-13 a las 22:06:50 UTC. Heroku retiró automáticamente `b003`; `b007` se conserva.
- `b008` se descargó fuera del repositorio en `/home/tottibero/backups/riffvalley-p2c-20261013/spammusic-back-b008-20261014.dump`; tamaño 3,877,559 bytes, modo `0600`. SHA-256: `f12568e8cab2eba66aa50cd48994a3406cfa93269159f2bdff24dee5eb02bf2c`. `pg_restore --list` confirmó las tablas `public.users` y `public.migrations`.

### Cierre del servicio y PostgreSQL

Se confirmó maintenance `on` y cero dynos antes del envío. Tras el deploy y la comprobación del runner, Heroku continuó mostrando maintenance `on` y ningún dyno activo. La consulta de solo lectura a PostgreSQL confirmó 198 usuarios, 89 filas de ledger y la columna legacy `users.roles` (`text[]`); no existe todavía `users.role`. Las migraciones de roles no se ejecutaron.

Por decisión expresa del usuario, no se inventariaron ni suspendieron los trabajos de Heroku Scheduler. Se acepta el riesgo de que un job programado pueda iniciarse durante la ventana; Scheduler no se modificó.

### Deploy y verificación

- Se verificó con `git ls-remote heroku refs/heads/main` que la rama Heroku apunta al SHA completo `826f7dc363b695a0dd9e0bf2018877003e9bb95e`.
- Se publicó el SHA directamente con `git push heroku 826f7dc363b695a0dd9e0bf2018877003e9bb95e:main`, sin forzar. El build de Heroku 24 completó `yarn build` (`nest build` y copia de assets) y creó `v309`, descrito como `Deploy 826f7dc3`. El build informó que Node 20 está en fin de vida; no impidió el despliegue.
- Heroku detectó únicamente el tipo de proceso `web` desde el `Procfile`, sin fase `release`; por tanto no hubo comando de migración automático.
- Un dyno one-off ejecutó solo una comprobación Node de lectura: confirmó el runner compilado `dist/roles-migration/run-roles-migration-chain.js`, ambas migraciones JavaScript y la resolución de `typeorm` y `pg`. No cargó NestJS ni invocó el runner. El one-off terminó correctamente.
- La verificación final mostró `v309` como release actual, `refs/heads/main` en el SHA autorizado, maintenance `on`, ningún dyno activo y PostgreSQL sin cambios de esquema ni ledger.

P.3.5 queda completada.

## P.3.6 — Migración de roles en PostgreSQL y recuperación del backend (2026-10-14)

**Resultado: completada.** El runner específico finalizó con código `0` y reportó la aplicación de `MigrateCanonicalUserRoles1791910000000` y `MigrateUsersToSingleRole1791920000000`. Se ejecutó una sola vez. El servicio se recuperó y maintenance quedó desactivado tras validar esquema, datos, ledger, snapshots, arranque y endpoints disponibles.

### Preflight inmediato

Antes de ejecutar el runner, la aplicación estaba en `v309`, Heroku Git `main` apuntaba al SHA autorizado `826f7dc363b695a0dd9e0bf2018877003e9bb95e`, maintenance estaba `on`, no había dynos activos y PostgreSQL no mostraba transacciones activas ni sesiones en espera externas. El backup `b008` seguía en estado `Completed`. La base tenía 198 usuarios, `users.roles text[]` y 89 migraciones.

### Resultado de la migración y validación de PostgreSQL

- El runner informó las dos migraciones esperadas. El ledger quedó en 91 entradas e incluye ambas identidades timestamped (`1791910000000` y `1791920000000`).
- `public.users` conserva 198 filas. Existe `role text NOT NULL DEFAULT user`; ya no existe `roles`.
- La constraint `CHK_users_role_canonical_1791920000000` limita `role` a `user`, `collaborator`, `riffvalley` y `superadmin`.
- No se encontraron roles nulos ni inválidos. Distribución: `user` 190, `riffvalley` 3, `superadmin` 5, `collaborator` 0.
- Están presentes los snapshots `user_roles_migration_snapshot_1791910000000`, `user_roles_single_snapshot_1791920000000` y `user_roles_single_schema_snapshot_1791920000000`.
- La consulta de postflight fue `READ ONLY` y terminó con `ROLLBACK`; no se hicieron correcciones manuales.

### Arranque, API y recuperación

Se escaló `web` a `1:Basic` manteniendo maintenance. `web.1` quedó `up`; los logs resumidos confirman el inicio de NestJS, sin errores/fatales ni fallos de conexión a PostgreSQL. Tras comprobar la estabilidad se retiró maintenance. Las solicitudes externas devolvieron `200` en `GET /api/versions/public` y `401` en `GET /api/auth/private` sin credenciales, confirmando acceso público y protección de la ruta administrativa. El estado final de Heroku mostró `web.1` `up` en Basic y maintenance `off`.

Durante esta comprobación operativa no se ejecutaron pruebas completas de autorización con cuentas editoriales o superadmin. El usuario confirma por separado que se comprobó la autenticación básica y que la web recibió el rol. No se modificó Scheduler; permanece el riesgo aceptado por el usuario. No se reactivó Automatic Deploys.
