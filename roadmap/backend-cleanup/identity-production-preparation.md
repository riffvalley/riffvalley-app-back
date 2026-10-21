# Identity — Preparación del despliegue intermedio

**Estado al 2026-10-21: BLOQUEADO.** Las consultas autorizadas de solo lectura confirmaron app, release, dynos, PostgreSQL, extensión UUID, ledger y backups existentes. No se desplegó código, no se ejecutaron migraciones ni se modificaron recursos. Siguen sin confirmarse el SHA completo/mecanismo de deploy, el registry de migraciones compilado por el release activo, el principal exacto que usa TypeORM y la recuperación probada. El checkout conserva cambios locales sin separar; este documento no autoriza operaciones.

## Alcance y cambios locales

La referencia local `HEAD` es `fa17b1c61e632d60c92bd224d9213a1b2c86faaf` (`refactor(identity): complete BC-ID-3A through 3E`), igual a `origin/refactor/community`. Las refs locales `main` y `origin/main` apuntan a `09a4192a1b43af1c61e47b9b38537d8bbcea4e8d`, ancestro de HEAD; no se hizo fetch para comprobar que la rama remota no haya avanzado. El release Heroku v317 se describe como `Deploy 09a4192`, coincidente por prefijo con main; el activo v318 se describe como `Deploy a0f2b083`. Heroku no devuelve un campo commit en `releases:info` y ese prefijo no existe en el object database local, así que no se pudo resolver su SHA completo ni demostrar que su árbol coincide con main o con el checkout. La referencia local `heroku/main` apunta a `826f7dc` y no se tomó como evidencia de producción.

El árbol no está limpio ni tiene un changeset de despliegue separado. Los cambios no confirmados que corresponden a BC-ID-5A–5D son `src/identity/sessions/**`, las migraciones `179195`–`179197` y sus tests; los hunks de BC-ID-6A están en `src/identity/auth/auth.module.ts`, `auth.service.ts` y los specs respectivos. La documentación relacionada está en `identity.md`, `README.md` y los documentos de modelo/seguridad/rollout/ADR; este runbook es una adición de preparación. No hay cambios de frontend, Wiki, `.env.template`, `Procfile` ni `.impeccable/config.json` en el árbol de trabajo.

La comparación de rama `main...HEAD` da **125 archivos, 7.382 inserciones y 8.939 eliminaciones**: incluye además BC-COMM, Communications, BC-ID-0–3E, Catalog, Editorial, Integrations, Product y los cambios de baselines. Esos commits están en el historial de la rama y entrarían en una PR contra el `main` local; son ajenos a esta PR de BC-ID-5A–5D/6A. Los cambios versionados/no versionados descritos arriba son solo el delta de trabajo, no el alcance completo de la rama. No se hizo staging ni se separaron los commits; la PR queda bloqueada hasta preparar una rama base acotada y preservar este trabajo local.

No hay cambio de `Procfile`, de `.env.template` ni de configuración de arranque identificado en el conjunto inspeccionado. Los nombres de configuración que lee el modo interno (`AUTH_SESSION_MODE_ENABLED`, `AUTH_SESSION_APP_ORIGIN`, `AUTH_SESSION_WIKI_ORIGIN`) no tienen valores comprobados aquí. No se leyeron valores de entorno.

## Comprobaciones remotas de solo lectura

Heroku CLI estaba autenticada y confirmó que `spammusic-back` está en región `eu`, stack `heroku-24`, con el release **v318** activo (`Deploy a0f2b083`, 2026-10-21 10:36:41 UTC). El app reportó `maintenance=false`, una formación `web: 1` con tamaño `Basic` y estado `up`; la feature `preboot` está desactivada. No hay coupling a un pipeline (`pipeline_coupling=null`). Las consultas no imprimieron variables secretas, URLs de base ni identidades de colaboradores.

El app tiene un attachment `DATABASE` disponible en el plan PostgreSQL `essential-0`; el `DB_NAME` lógico coincide con `current_database()` y no se publica aquí. PostgreSQL reporta versión **16.14**, 26.5 MB de 1 GB y 34 tablas al consultar `pg:info`. `uuid-ossp` versión 1.1 y `uuid_generate_v4()` existen. Consultas dentro de `BEGIN READ ONLY` observaron que el rol usado por `heroku pg:psql DATABASE` tiene privilegios catalogados `CREATE` en la base y esquema `public`, `USAGE` en ese esquema, `REFERENCES` sobre `users` y `EXECUTE` sobre `uuid_generate_v4()`.

La aplicación TypeORM, sin embargo, configura conexión mediante `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME` y `DB_PASSWORD`, no directamente con el attachment `DATABASE`. No se leyeron valores de configuración. Por eso los privilegios del rol de `pg:psql` son evidencia positiva para el attachment, pero no prueban que el principal de `yarn db:migrate` sea idéntico; ese vínculo queda pendiente.

`heroku releases` entrega descripciones abreviadas, no el SHA completo; `heroku builds` no está disponible en la CLI instalada. `pipeline_coupling` es nulo, no hay workflow de deploy Heroku en `.github/workflows`, y el remote Heroku local solo demuestra que existe una URL Git configurada, no qué rama o automatismo desplegó v318. **El mecanismo/rama que dispara el deploy sigue sin verificarse** y debe confirmarse en la configuración de despliegue autorizada antes de preparar PR/release.

La configuración del código no anuncia migración automática al arranque/deploy: `Procfile` contiene únicamente `web: yarn start:prod`; TypeORM tiene `synchronize:false` y `migrationsRun:false`; no hay proceso `release` ni workflow de migración en el repo. `scripts/db-migrate-heroku.sh` es el procedimiento manual documentado y llama `heroku run` para `db:status`, `db:migrate` y `db:check`. El comando manual inicia un dyno efímero; no modifica la cantidad configurada de dynos, pero su uso/coste debe confirmarse según el plan. El app sí tiene un addon Heroku Scheduler; sus jobs configurados no se inspeccionaron y no se puede excluir una tarea externa que invoque migraciones hasta revisarlos. No ejecuté el helper ni inicié one-off dynos.

Un deploy con un único dyno web y Preboot apagado puede causar una interrupción breve durante el reemplazo/reinicio; disponibilidad sin interrupción no queda garantizada por esta inspección. No se activó mantenimiento ni Preboot. Las migraciones 179193/179194 también pueden tomar locks sobre `list` y `link`, y la eliminación de columna/tabla descarta datos. No hay evidencia para cuantificar duración o impacto; su aplicación no debe mezclarse silenciosamente con Identity.

## Compatibilidad y modo inactivo

La inspección de código y los tests disponibles confirma:

- `AuthController` no llama a `loginWithSession`; no se añadieron rutas ni decoradores HTTP. La operación está disponible solo como método interno de `AuthService`.
- El gate exige `AUTH_SESSION_MODE_ENABLED === 'true'`, el modo `refresh-v1` y un `Origin` HTTPS exacto igual a una de las configuraciones separadas de App o Wiki. El cliente no se decide por un campo libre del body. En la ruta actual no hay entrada HTTP para solicitar ese método. El gate no tiene valor activador por defecto en código ni está añadido a `.env.template`.
- `POST /api/auth/login` conserva `JwtModule` con `expiresIn: '8h'` y la emisión legacy. `POST /api/auth/register`, su DTO/controlador y su flujo legacy no se conectan a Sessions.
- No hay middleware/controlador que emita cookies; el modo HTTP de refresh sigue pendiente. La respuesta legacy no añade `Set-Cookie`.
- `Authorization` y `JwtStrategy` no importan Sessions ni consultan `auth_sessions`. Las solicitudes autenticadas continúan cargando el usuario vigente y comprobando estado/rol por las rutas existentes.
- `AppModule` y `data-source.ts` mantienen `synchronize: false` y `migrationsRun: false`; el `Procfile` arranca `yarn start:prod`, sin hook de migración. `SessionsModule` se registra para el wiring interno, pero la carga de TypeORM metadata/repositorios no consulta las tablas al arrancar. Las lecturas/escrituras de sesiones ocurren dentro de llamadas explícitas de servicio, no durante el login legacy ni cada request autenticado.

La suite completa y los specs de Auth respaldan el contrato legacy. No se realizó un boot E2E contra una base sin las tablas: la independencia de arranque se concluye del wiring/configuración, no de una prueba de despliegue. No se revisaron valores efectivos de variables de configuración.

### Archivos objetivo y checks de PR

- **BC-ID-5A–5D:** `src/identity/sessions/**`, `src/migrations/1791950000000-CreateAuthSessionPersistence.ts`, `1791960000000-AddRefreshOperationFingerprint.ts`, `1791970000000-AddSessionCleanupIndex.ts` y los tests asociados bajo `src/identity/sessions/**/__tests__` y `src/migrations/__tests__`.
- **BC-ID-6A:** solo los cambios locales de composición en `src/identity/auth/auth.module.ts`, `auth.service.ts` y `src/identity/auth/__tests__/auth.module.spec.ts`/`auth.service.spec.ts`. El controller no cambió en este delta.
- **Documentación de soporte:** `roadmap/backend-cleanup/identity.md`, `README.md`, los diseños de sesiones/seguridad/contratos/ADR y este runbook. `identity.md` es acumulativo y necesita revisión de alcance antes de incluirlo entero.
- **Fuera de la PR de Identity:** commits ya presentes en la rama contra main para Community, Communications, Catalog, Editorial, Integrations, Product y BC-ID-3; archivos de baselines modificados por commits previos. Las migraciones `179193`/`179194` ya están en main, no son parte del delta local de Identity y no deben entrar en un changeset Identity.

Los checks locales registrados para el código de sesión son `yarn verify` y la suite opt-in PostgreSQL aislada (`sessions.postgres.integration.spec.ts`, PostgreSQL 17.10); ambos pasaron en la revisión previa. Para la PR aislada se deben repetir sobre el árbol final: `yarn verify`, la suite opt-in PG con base temporal autorizada, revisión de la lista de migraciones en el build y `git diff --check`. No se hicieron cambios de código/tests en esta revisión de bloqueos.

## Migraciones

El orden esperado es el timestamp TypeORM ascendente:

| Migración | Cambio | Reversión y notas operativas |
|---|---|---|
| `1791950000000-CreateAuthSessionPersistence` | Crea únicamente `auth_sessions` y `auth_refresh_tokens`, relaciones, checks, unicidad e índices. Usa `uuid_generate_v4()` como default. No crea extensión PostgreSQL. | `down` se niega a eliminar tablas si existen filas; vacío, elimina las tablas nuevas. |
| `1791960000000-AddRefreshOperationFingerprint` | Añade `operation_key_hash` nullable `bytea` para reconocer conflictos de operación sin almacenar un bearer recuperable. | `down` se niega cuando hay fingerprints presentes. |
| `1791970000000-AddSessionCleanupIndex` | Añade índice parcial de `revoked_at` para limpieza acotada. | El `down` elimina solo ese índice. |

Los nombres/clases siguen el patrón timestamp del runner TypeORM; las operaciones son aditivas y no alteran `User`, contraseñas, Auth, Activity o Community. El runner desplegado no se ejecuta al arrancar: `scripts/db-migrations.js` configura `installExtensions: false`; por tanto, el procedimiento **no debe depender** de que TypeORM instale `uuid-ossp`. Antes de migrar se debe comprobar de manera read-only que la extensión y `uuid_generate_v4()` existen. Si falta la extensión, detenerse: su instalación/provisión requiere al propietario/permisos adecuados y una autorización separada. El permiso `CREATE` de la base es una señal, no prueba suficiente de autorización para instalar una extensión confiable.

El runner usa `runMigrations({ transaction: 'all' })`. Los índices son `CREATE INDEX` ordinarios, no concurrentes; mantienen locks durante la transacción. El esquema nuevo aún no recibe tráfico, pero la primera migración incluye FKs a `users` y puede competir brevemente con escrituras sobre dicha tabla. Coordinar una ventana de baja actividad y observar tiempos/locks; no prometer duración sin medición. La migración aditiva permite que el código legacy anterior siga funcionando después de aplicarla. Un rollback de release no revierte el esquema, y no se debe ejecutar `down` como reacción automática.

### Ledger y cola pendiente observada

La consulta remota read-only halló el ledger `public.migrations` con 91 filas y último timestamp/nombre `1791920000000 / MigrateUsersToSingleRole1791920000000`. No están aplicadas `179193` ni `179194`. Ambas migraciones existen ya en `main`:

- `1791930000000-RemoveFreeFromList` elimina `list.free` y descarta sus valores; su `down` solo recrea el default, no recupera datos.
- `1791940000000-RemoveEditorialLinks` elimina la tabla `link` y sus filas; su `down` crea una tabla vacía.

Si el release compatible incorpora el inventario que hoy está en `main` más las migraciones de Identity, el helper verá cinco pendientes ordenadas: `179193`, `179194`, `179195`, `179196`, `179197`. No se ejecutó `db:status` porque invoca un one-off dyno; tampoco se pudo resolver el SHA completo del release v318 para conocer su directorio `dist`. Por ello la lista de cinco es el delta esperado respecto del inventario fuente revisado, no una afirmación sobre el registry compilado del release activo. Debe confirmarse antes de cualquier migración.

El helper valida y ejecuta la lista **completa** de pendientes mediante `runMigrations`; no permite escoger solo 179195–179197. Por tanto, una operación de Identity incluiría las eliminaciones de 179193/179194 si aún están pendientes. Esto viola el alcance de un despliegue Identity y tiene riesgo de pérdida de datos; la migración queda bloqueada hasta que esas dos migraciones se resuelvan en un cambio separado, aprobado y con aceptación de pérdida, o se compruebe que ya fueron aplicadas. No saltarlas ni ejecutarlas incidentalmente.

La revisión no establece un camino seguro para ejecutar 179193/179194 selectivamente desde el release v318: se desconoce su SHA/registry y el helper solo corre todas las pendientes. Se requiere primero identificar un release compatible cuyo inventario contenga exactamente las migraciones aprobadas para ese cambio separado, o definir otro procedimiento con revisión y autorización propias. No usar SQL manual ni un release anterior por suposición.

**Dependencia de orden detectada:** el helper ejecuta `yarn db:migrate` dentro de un one-off dyno de la release activa, y `db-migrations.js` carga migraciones compiladas desde `dist`. Por eso el release activo debe contener primero las migraciones. La secuencia compatible es desplegar un release con el modo HTTP apagado, comprobar la lista completa pendiente, aplicar solo cuando esa lista haya sido aprobada y hacer smoke tests. El paso de código previo no cambia el contrato ni requiere tablas al arrancar. No es posible ejecutar migraciones nuevas desde un release antiguo que no las contiene.

### Evidencia PostgreSQL local

Se ejecutó la suite opt-in contra un contenedor desechable `postgres:17`, con base recién creada, almacenamiento `tmpfs` y puerto loopback. `SELECT version()` reportó PostgreSQL **17.10**. Resultado: `sessions.postgres.integration.spec.ts`, **13/13 aprobadas**, incluyendo orden y ejecución de las tres migraciones de sesiones, constraints/índices, rotaciones concurrentes, transacciones y rollback. No se usaron bases ni credenciales remotas en esa suite. La comprobación read-only de producción confirmó extensión UUID y función; el principal exacto de TypeORM sigue pendiente.

## Validaciones del checkout

`yarn verify` terminó con código 0. Calidad estructural, tipado seguro, lint sin autofix, typecheck y build pasaron sin nuevos hallazgos; typecheck reportó cero errores. Suites unitarias: **194 aprobadas**, 11 suites omitidas; tests: **1.830 aprobados**, 65 omitidos; 2 snapshots aprobados. Los omitidos no se cuentan como ejecutados. La suite de PostgreSQL se ejecutó aparte y aprobó 13/13.

El gate produjo informes de deuda histórica dentro de sus baselines (no modificados): 76 infracciones estructurales, 68 de tipado y 892 ESLint; ninguna nueva ni obsoleta. `git diff --check` pasó para el diff versionado al momento de la revisión. Antes de empaquetar, repetirlo después de cualquier edición y revisar también los archivos no versionados.

## Bloqueos previos a PR y despliegue

1. **Release y disparador:** obtener el SHA completo/artefacto de v318 y confirmar en configuración autorizada qué rama o mecanismo lo desplegó. No se pudo derivar de releases, pipeline (nulo), remote Git ni workflows locales.
2. **Separación de PR:** crear una base de trabajo acotada a BC-ID-5A–5D/6A y preservar los cambios locales. La PR contra `main` desde la rama actual incluiría 125 archivos y alcance Community/Communications/Catalog/Editorial/Integrations/Product/BC-ID-3 ajeno. No hacer staging/commit en este paso.
3. **Migraciones previas ajenas:** reconciliar `179193` y `179194` por separado. Están ausentes del ledger y contienen pérdida de datos; el helper no filtra migraciones. Aún no se ha identificado un release desde el que correr solo esas dos. No ejecutar el helper de Identity mientras se incluyan entre los pendientes.
4. **Lista exacta del release:** consultar `db:status --json` con el release que se pretende usar y comprobar que el ledger existe y que, una vez resueltas las migraciones previas ajenas, solo queden 179195–179197. El estado del ledger fue leído por SQL, pero no el inventory TypeORM compilado del release activo, porque eso requiere un one-off dyno.
5. **Permisos:** los privilegios del rol `heroku pg:psql` están confirmados por catálogo, pero el proceso TypeORM usa `DB_*` y no se verificó que sea el mismo principal. Confirmar la correspondencia de manera segura sin imprimir secretos antes de migrar.
6. **Backup y recuperación:** existe backup `b009` `Completed` del attachment `DATABASE` a las 08:04 UTC del 2026-10-21, anterior al release v318 y no específico de estas migraciones. El helper soporta captura/verificación de un backup nuevo antes de migrar; la CLI ofrece restauración, pero `heroku pg:backups` no registra restores y no se hizo un ensayo de restauración. Definir/validar la recuperación aislada y capturar un backup fresco bajo autorización.
7. **Disponibilidad y recursos:** con un dyno web Basic y Preboot desactivado, no se puede garantizar cero interrupción durante deploy. Acordar aceptación de posible desconexión breve o una ventana compatible; no activar mantenimiento ni ampliar recursos en este plan. Un one-off dyno del helper es efímero, pero su uso/coste debe ser aceptado.

Se resolvieron la autenticación CLI, identidad del app/attachment, versión de PostgreSQL, UUID extension/function, estado actual de mantenimiento/Preboot y existencia de un backup completado. No bastan para declarar listo el despliegue.

Por estas razones el estado permanece **BLOQUEADO**, aunque las verificaciones locales pasaron.

## Runbook condicionado de despliegue y recuperación

Este runbook describe una secuencia futura. Debe iniciarse solo con autorización expresa para operar sobre la aplicación/base identificadas y después de resolver los bloqueos anteriores. No mostrar URLs de base, credenciales ni valores secretos en terminales compartidos, logs o informes.

### Antes de operar

1. Revisar manualmente el alcance y producir un commit/release candidate con solo BC-ID-5A–5D, BC-ID-6A y documentación aprobada. Comparar el SHA del artefacto con el que se pretende desplegar; conservar fuera del paquete cualquier cambio local ajeno. No desplegar desde un árbol mezclado/no revisado.
2. Confirmar nombre de app y entorno con `heroku apps:info --app spammusic-back --json` y releer el nombre devuelto. Confirmar el release activo mediante `heroku releases --app spammusic-back` y `heroku releases:info <versión> --app spammusic-back`; anotar versión, fecha y SHA. Confirmar en configuración autorizada el mecanismo/rama de deploy y revisar los jobs de Scheduler para descartar una migración externa automática. La revisión humana del helper no sustituye registrar el SHA exacto.
3. Confirmar el attachment `DATABASE` con `heroku pg:info DATABASE --app spammusic-back`, consultar `DB_NAME` sin imprimir otras variables y comprobar que coincide exactamente con `current_database()` y con el `database` del status TypeORM. No usar ni imprimir `DATABASE_URL`.
4. Consultar `yarn db:status --json` en un one-off de la release candidate seleccionada. Confirmar ledger presente, esquema/DB esperados y migraciones pendientes. Antes de permitir una ejecución de Identity, comprobar que 179193/179194 ya están resueltas y que solo quedan 179195–179197. Si aparece cualquier otra migración, detenerse y reconciliarla por separado. El comando inicia un dyno efímero y su uso requiere aceptación operativa.
5. Mediante conexión PostgreSQL aprobada de solo lectura (por ejemplo `heroku pg:psql DATABASE --app spammusic-back`), ejecutar y guardar solo resultados no secretos:

   ```sql
   BEGIN READ ONLY;
   SELECT current_database(), current_setting('server_version');
   SELECT extname, extversion FROM pg_extension WHERE extname = 'uuid-ossp';
   SELECT to_regprocedure('uuid_generate_v4()') IS NOT NULL AS uuid_generate_available;
   SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS database_create_privilege;
   SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage;
   SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS public_create;
   SELECT has_table_privilege(current_user, 'public.users', 'REFERENCES') AS users_references;
   SELECT has_function_privilege(current_user, 'uuid_generate_v4()', 'EXECUTE') AS uuid_execute;
   ROLLBACK;
   ```

   Debe existir `uuid-ossp` y `uuid_generate_v4()`. Los checks de privilegios deben ejecutarse sobre el mismo rol que usa TypeORM. Como la fuente de conexión usa `DB_*` y no se compararon credenciales, los privilegios observados para el attachment no bastan todavía: confirmar la correspondencia sin revelar valores. Si algo falta o no puede verificarse de forma read-only, parar; no improvisar DDL ni instalar la extensión como parte de esta migración.
6. Confirmar plan de recuperación, persona operadora y ventana. Definir cómo restaurar a una base aislada/nueva y validar antes de cualquier cutover. El backup se capturará desde el helper después del despliegue del runner compatible e inmediatamente antes de migrar, y debe verificarse como `Completed` con attachment/base correctos. No tratarlo como recuperable sin verificar metadata y procedimiento aplicable.

### Desplegar el runner compatible y migrar una sola vez

7. Solo después de resolver 179193/179194 y confirmar la lista limpia, desplegar el artefacto revisado que contiene las tres migraciones de Identity compiladas. Confirmar que el release nuevo tiene el SHA aprobado, arranca sin requerir las tablas y mantiene el gate/caller HTTP inactivos. Este es un release de compatibilidad, no la activación de sesiones renovables. Desplegarlo solo después de confirmar el mecanismo de deploy y aceptar el riesgo de breve interrupción con 1 dyno y Preboot apagado.
8. En ese release, ejecutar `bash scripts/db-migrate-heroku.sh`. El script fija `spammusic-back` y attachment `DATABASE`; comprueba autenticación/nombre de app, muestra releases para revisión manual, compara DB_NAME con `db:status`, exige ledger existente, bloquea una cadena histórica específica, solicita confirmación exacta de destino y de compatibilidad/ventana, crea backup, pide ID, comprueba `pg:backups:info`, revalida DB_NAME y snapshot completo de pendientes y ejecuta una sola vez `yarn db:migrate --confirm <DB_NAME>:<lista_ordenada>`.
9. Antes de autorizar el prompt de migración, la lista observada debe contener solo `1791950000000-CreateAuthSessionPersistence`, `1791960000000-AddRefreshOperationFingerprint` y `1791970000000-AddSessionCleanupIndex`, en ese orden. Cualquier lista distinta detiene la ejecución y requiere reconciliación. El helper no comprueba `uuid-ossp` ni permisos: realizar y aprobar el paso 5 antes de invocarlo.
10. El helper hace `db:status --json` y `db:check` tras la migración. Confirmar ambos resultados y revisar esquema, ledger y logs. No volver a ejecutar automáticamente ante timeout o resultado ambiguo: consultar estado primero y determinar si la transacción aplicó o revirtió todo.

### Desplegar y hacer smoke test

11. Ejecutar comprobaciones no destructivas contra rutas existentes. Con cuenta de smoke-test previamente autorizada, probar `POST /api/auth/login` con credenciales suministradas de forma segura, comprobar el payload legacy y vigencia de aproximadamente 8 h, y comprobar ausencia de `Set-Cookie`; no escribir el bearer en consola/log. Usar el token en una ruta protegida inocua para comprobar JWT, cuenta activa y rol. No probar registro creando usuarios reales: verificar contractualmente su ruta/DTO y, si producto requiere smoke de registro, usar un procedimiento/entorno aislado aprobado. Consultar health/readiness existente si lo hay, sin crear endpoints nuevos.
12. Observar errores de arranque/DB, latencia y locks de migración, y confirmar que operaciones Auth/Authorization legacy y `UserAccessLog` continúan. Registrar SHA, release, backup ID, migraciones aplicadas y resultados redactados, sin tokens, cookies, URLs ni secretos.

### Fallo y recuperación

- Si falla el preflight, no desplegar el runner ni migrar. Si el backup no queda `Completed`, no migrar; el release compatible puede quedar activo con el modo de sesiones HTTP apagado o revertirse según la decisión operativa, porque el código legacy no depende de las tablas.
- Si la migración falla, el runner agrupa las migraciones en transacción `all`; aun así, verificar ledger y esquema en modo de solo lectura antes de decidir. No reintentar automáticamente, no ejecutar `down` y no restaurar encima de producción como primera reacción. Detener el cambio, preservar logs redactados y consultar al responsable de PostgreSQL.
- Si migraciones terminaron correctamente pero falla el deploy/smoke test, revertir solo el release de código a la versión compatible previamente registrada. El esquema aditivo queda aplicado; el código legacy no depende de esas tablas. No asumir que rollback de release restaura la base ni eliminar tablas/índices.
- Si se demuestra corrupción o incompatibilidad de datos y se requiere recuperar desde backup, aprobar explícitamente el alcance. Restaurar primero a una base aislada, comprobar consistencia y acordar el impacto/pérdida de escrituras desde la captura. El cutover/restauración de producción requiere autorización separada y plan específico; este runbook no lo ejecuta ni autoriza.
- Tras estabilizar, no habilitar todavía cookies, refresh HTTP o sesiones públicas. Eso requiere completar BC-ID-6B–6D y confirmar topología, origen, HTTPS/proxy, cookies, CSRF/CORS, rate limits y pruebas de browser.

## Enlaces y dependencias

- [Roadmap Identity](identity.md)
- [Contratos y plan de rollout](identity-session-contracts-and-rollout.md)
- [Modelo de sesiones](identity-sessions-model.md)
- [Seguridad y revocación](identity-session-security.md)
- Runner: `scripts/db-migrate-heroku.sh`, `scripts/db-migrations.js`, `src/data-source.ts`
- Migraciones: `src/migrations/1791950000000-CreateAuthSessionPersistence.ts`, `src/migrations/1791960000000-AddRefreshOperationFingerprint.ts`, `src/migrations/1791970000000-AddSessionCleanupIndex.ts`

## Auditoría predeploy de 179193 y 179194

**Estado de esta auditoría: BLOQUEADO para cualquier ejecución de 179193/179194 o de Identity.** No se ejecutaron consultas de conteo en producción, escrituras SQL, migraciones, despliegues ni cambios de rama. Los datos reales que estas operaciones eliminarían siguen sin determinarse y no existe aprobación para descartarlos.

### Cambios y pérdida potencial

| Migración | Operación exacta | Pérdida y reversión | Consumidores en el código fuente actual de `main` |
|---|---|---|---|
| `1791930000000-RemoveFreeFromList` | `ALTER TABLE "list" DROP COLUMN "free"` | Descarta todos los valores `TRUE`, `FALSE` o `NULL` que existan. `down()` vuelve a crear una columna booleana con default `FALSE`; no restaura los valores previos. | La entidad `List`, DTOs y servicios editoriales de `main` no declaran ni consultan `free`; la búsqueda exacta en `src/editorial/lists` solo encuentra la migración. No se encontró endpoint o proceso backend actual que lo consuma. Código externo, consultas directas y procesos no presentes en este repositorio no quedan descartados. |
| `1791940000000-RemoveEditorialLinks` | `DROP TABLE IF EXISTS "link"` | Elimina todas las filas y la tabla editorial `public.link`. Según el `down()` de la migración, el esquema esperado guarda `id`, `link`, `name` y `listId`; todos los valores y asociaciones se pierden. `down()` recrea la estructura vacía, no sus registros. La migración documenta una FK saliente `listId → list.id` con `ON DELETE CASCADE` y ninguna FK entrante conocida; verificar el catálogo real porque el comentario/código de la migración no sustituye una inspección del esquema. | `main` ya no contiene entidad, repositorio, módulo, controlador ni servicio editorial de `link`. El commit `dd032a389b4001ec65488c786d6f8bf548a502bb` (`refactor(editorial): complete lists cleanup and retire links`, 2026-10-16) retiró esos componentes. Los demás campos o DTOs llamados `link` en Editorial (por ejemplo enlaces externos de discos/Spotify) son conceptos distintos y no prueban uso de `public.link`. Pueden existir clientes, scripts o consumidores externos no visibles aquí. |

El ledger remoto consultado antes de esta auditoría termina en `179192`; las dos migraciones están pendientes. Eso hace probable que las estructuras sigan en el esquema, pero no demuestra su presencia ni que contengan filas/valores. No se utilizaron bases locales como evidencia de producción. El inventario de constraints/foreign keys debe inspeccionarse en el esquema productivo antes de cualquier `DROP TABLE`; no se infiere su ausencia a partir de la entidad local.

### Comparación de versiones y compatibilidad

- **Release v318:** Heroku identifica el release como `Deploy a0f2b083`, pero el SHA completo no está disponible y ese prefijo no se resuelve en los objetos Git locales. Tampoco se obtuvo el registry TypeORM compilado de v318. Por tanto no se puede asegurar si su backend incluye o aún usa los controladores/entidad de Editorial Links, o si corresponde al código actual de `main`. Esta incertidumbre bloquea afirmar que eliminar las estructuras es compatible con el backend desplegado.
- **Release v317:** Heroku lo describe como `Deploy 09a4192`, prefijo coincidente con el `main` local observado anteriormente. Es evidencia parcial del código desplegado en ese release, no una resolución del SHA v318 ni una prueba del contenido exacto del esquema.
- **`main` local:** incluye ambas migraciones y el retiro editorial del commit `dd032a3`; sus modelos/servicios editoriales actuales no usan `list.free` ni `public.link`. Como TypeORM está configurado con `synchronize: false` y las migraciones no corren al arranque, conservar temporalmente columnas/tablas extra es compatible con ese backend. Si se ejecutan las migraciones antes de desplegar código que ya retiró los consumidores, una versión anterior que todavía use dichos campos/rutas puede romperse.
- **Rama actual (`refactor/community`):** parte de la misma línea de trabajo que `main` según las refs locales, pero contiene commits de múltiples dominios y cambios locales de Identity. La compatibilidad de sus archivos fuente con las dos retiradas coincide con la inspección de `main`; eso no identifica el árbol de v318. No se hizo `fetch`, checkout, merge ni comparación contra un SHA remoto adicional.

La secuencia observable de producción también deja incertidumbre: v318 se publicó antes de la actualización local de `main` registrada en esta preparación. El commit de retirada de Editorial Links es anterior, pero no hay prueba que relacione `a0f2b083` con ese commit. **No declarar v318 compatible basándose solo en `main`.**

### Diagnóstico de producción propuesto (solo lectura)

Ejecutar estas consultas, una vez aprobada la inspección read-only y en una conexión que garantice transacción de solo lectura. Devuelven únicamente metadatos y conteos, no nombres de listas, filas ni contenido:

```sql
BEGIN READ ONLY;

-- Presencia y tipo de list.free.
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'list'
  AND column_name = 'free';

-- Distribución de valores, si la columna existe.
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE free IS TRUE) AS true_rows,
       count(*) FILTER (WHERE free IS FALSE) AS false_rows,
       count(*) FILTER (WHERE free IS NULL) AS null_rows
FROM public.list;

-- Presencia y número de filas de la tabla editorial.
SELECT to_regclass('public.link') IS NOT NULL AS link_table_exists;
SELECT count(*) AS link_rows FROM public.link;

-- Dependencias FK entrantes/salientes de public.link, sin datos de aplicación.
SELECT tc.constraint_name, tc.table_schema, tc.table_name,
       ccu.table_schema AS referenced_table_schema,
       ccu.table_name AS referenced_table_name
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_catalog = tc.constraint_catalog
 AND ccu.constraint_schema = tc.constraint_schema
 AND ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ((tc.table_schema = 'public' AND tc.table_name = 'link')
    OR (ccu.table_schema = 'public' AND ccu.table_name = 'link'));

ROLLBACK;
```

Si `public.list` o `public.link` no existen, las consultas de conteo correspondientes deben omitirse tras comprobar `to_regclass`/`information_schema`; no ejecutar una consulta que falle y deje ambigua la sesión. Registrar solo presencia, conteos y dependencias necesarias para la decisión. La auditoría actual **no afirma** que haya cero datos.

### Alternativas y recomendación

1. **Aplicar 179193/179194 por separado tras aprobación de descarte.** Requiere recuperar/confirmar el SHA o artefacto de v318, comprobar compatibilidad del backend que aún puede estar activo, obtener conteos y dependencias, decidir con el propietario de datos que los valores/filas son descartables, comprobar backup recuperable y ventana de locks. No aplicar si hay datos que deban conservarse o dependencias sin explicación. El rollback de TypeORM no recupera el contenido.
2. **Retirada no destructiva por fases, si se confirma que ninguna instancia/esquema relevante las aplicó.** Primero comprobar ledger en todos los entornos mantenidos y consumidores desplegados; separar la retirada de código de la retirada física, mantener la columna/tabla durante una ventana de compatibilidad y archivar/exportar datos si se requieren. La sustitución/edición de migraciones históricas solo sería admisible tras confirmar que nunca se aplicaron en ningún entorno compartido y revisar todos los artefactos/releases; no modificar estos archivos automáticamente ni reescribir historial. Una vez distribuida una migración histórica, preferir una nueva estrategia/migración revisada y versionada.
3. **Posponer los `DROP` y conservar las estructuras.** Es la opción segura por defecto mientras se desconocen datos y consumidores. El código actual de `main` puede tolerar estructuras sobrantes, pero el helper `scripts/db-migrate-heroku.sh` aplica todas las migraciones pendientes y no permite seleccionar solo 179195–179197. Por ello Identity queda bloqueado hasta resolver 179193/179194 o acordar y revisar una forma segura de separar las colas de migración; no omitir migraciones silenciosamente ni usar SQL manual para sortear el runner.

**Recomendación:** mantener ambas migraciones pendientes. Ejecutar primero el diagnóstico de solo lectura y resolver el SHA/artefacto de v318 y consumidores externos. Si los datos existen o su valor es incierto, no descartarlos: acordar retención/archivo y plan por fases. Si se confirma que son descartables, obtener aprobación expresa del responsable de datos antes de cualquier ejecución destructiva. No mezclar su resolución con las migraciones de Identity.

### Aislamiento de la PR de Identity

El diff local `main...HEAD` incluye 125 archivos de Community, Communications, BC-ID-0–3, Catalog, Editorial, Integrations y Product, además de Identity. No abrir una PR desde `refactor/community` contra el `main` local ni incluir automáticamente su historial. Mantener intacto este checkout como fuente de trabajo y, cuando se autorice la preparación, crear un worktree/branch nuevo desde el SHA de `main` confirmado y actualizado; trasladar mediante selección explícita solo los archivos/hunks de BC-ID-5A–5D/6A, migraciones `179195`–`179197` y documentación aprobada. Revisar la dependencia de cada hunk Auth respecto de commits Identity anteriores; incluir únicamente prerequisitos funcionales necesarios y documentados o resolver la dependencia antes de abrir PR. No copiar cambios de baselines ni dominios ajenos. Comparar el diff y el grafo de migraciones del worktree contra su base antes de stage/commit, acciones que no se realizan en esta auditoría.

### Condiciones para desbloquear

1. Obtener SHA completo y artefacto/source revision de v318, y demostrar qué migraciones y consumidores contiene; sin ello, compatibilidad del release activo permanece indeterminada.
2. Confirmar en todos los entornos relevantes ledger de 179193/179194 y presencia de las estructuras; comprobar relaciones del esquema sin leer contenido sensible.
3. Ejecutar y documentar los conteos anteriores de forma read-only; obtener decisión expresa del propietario de datos sobre conservación, archivo o descarte.
4. Revisar y separar consumidores fuera del backend (App, Wiki, jobs de Scheduler, scripts/integraciones directas) antes de retirar datos/esquema.
5. Aprobar una estrategia de migración que no ejecute accidentalmente los `DROP` al aplicar Identity. El helper actual no filtra; la lista exacta pendiente debe comprobarse con el release candidato antes de operar.
6. Confirmar backup reciente y recuperable, principal/permisos TypeORM, procedimiento de error/recuperación y ventana que acepte el riesgo de un dyno web Basic con Preboot apagado.
7. Preparar un changeset Identity aislado desde `main` confirmado; conservar fuera todos los cambios locales ajenos.

Hasta cumplir esas condiciones, el estado de preparación permanece **BLOQUEADO**. Esta auditoría no autoriza el despliegue, no aprueba la pérdida de datos y no inicia BC-ID-6B.
