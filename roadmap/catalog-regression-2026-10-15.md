# BC-CAT-REG — Regresión integral previa al merge de Catalog

**Fecha:** 2026-10-15

**Resultado:** **BLOCKED**
**Recomendación:** no integrar todavía el conjunto actual de ramas como un único merge. La persistencia, las importaciones parciales y las ocho suites PostgreSQL opt-in ya pasan en el esquema aislado. Siguen pendientes la compatibilidad HTTP real entre repositorios y la compatibilidad del esquema/migraciones de producción; además, la rama backend incluye un cambio amplio fuera de Catalog.

## Resumen ejecutivo

- Backend: build y typecheck aprobados. La suite completa terminó con **132 suites aprobadas, 3 fallidas y 9 omitidas**; **1190 tests aprobados, 3 fallidos y 48 omitidos**.
- Frontend: build/typecheck y sus **20 tests** aprobados. Las pruebas de contratos observadas usan mocks.
- PostgreSQL: esquema de metadata actual verificado (30 tablas, 42 FKs, sin ledger). Tras BC-CAT-REG-4.1, las ocho suites opt-in pasan (29/29 tests); también pasan las 4 pruebas de persistencia/rollback/importación parcial contra las tablas reales.
- Excel: importaciones sintéticas secuenciales de 150 y 300 discos y reimportación de 150, todas con cero fallos; la petición HTTP local más larga tardó **1.258 s**. Esta medición no garantiza rendimiento en Heroku.
- La prueba de escritura limpió sus fixtures y una consulta confirmó 0 filas con el prefijo propio en Artist, Disc, Genre y Country. El bootstrap desde metadata no acredita el esquema de producción ni el historial de migraciones; contratos HTTP cross-repo y comparación con el esquema de producción siguen pendientes. El estado general continúa BLOCKED.
- Las ramas de frontend y backend deben integrarse coordinadamente para el contrato de importación `data.results`.

## Estado Git y alcance

### Backend

- Rama actual: `refactor/editorial`, siguiendo `origin/refactor/editorial`.
- `main` y `origin/main` apuntan localmente a `2b203b8`; `refactor/editorial` está **5 commits por delante y 0 por detrás**. Commits: `be08be6`, `614fcab`, `e019f55`, `f7518cf`, `7a7760b`.
- El diff de rama contra `main` abarca **289 archivos**. Los siete módulos considerados son Artists, Countries, Discs, Genres, Import, Last.fm y Overview; solo 68 rutas están bajo `src/catalog/`. Hay cambios sustanciales en editorial, community, identity, product, configuración y documentación que no pertenecen a esos módulos.
- El árbol local conserva 12 archivos modificados y un archivo nuevo, principalmente pruebas/ajustes de Discs, transacciones de escritura y `roadmap/backend-cleanup.md`. No se descartó ni sobrescribió ninguno.
- Existe `.aws` en el diff de la rama, pero es un archivo vacío (0 bytes). El `.aws` sin seguimiento del frontend también está vacío. La inspección de patrones no encontró claves AWS ni cabeceras de claves privadas. Los patrones de asignación de credenciales solo encontraron literales en specs de prueba; no se imprimieron valores.
- `.env` está ignorado y contiene configuración de conexión; se revisaron solo los nombres de variables y si el nombre de base parecía de pruebas. No se mostró ni usó su contenido.

### Frontend

- Rama: `chore/refactor-integration-dev`, siguiendo `origin/chore/refactor-integration-dev`; 3 commits por delante de `origin/main`: `92cd5ed`, `c9f6ffc`, `1d129e9`.
- El diff comprometido comprende 18 archivos, entre ellos servicios de Catalog/importación, pantallas, tests y roadmaps.
- Se conservan el cambio local en `.impeccable/config.json` y el `.aws` vacío sin seguimiento; no se leyó ni modificó la configuración visual.

## Backend

| Comprobación                          | Resultado           | Detalle                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                                 | Aprobado            | `yarn --ignore-engines build`                                                                                                                                                                                                                                             |
| Typecheck                             | Aprobado            | `yarn --ignore-engines tsc --noEmit`                                                                                                                                                                                                                                      |
| Suite unitaria/integración disponible | Fallida             | 132 suites aprobadas, 3 fallidas, 9 omitidas; 1190 tests aprobados, 3 fallidos, 48 omitidos. La ejecución final permitió listeners locales para separar restricciones de sandbox.                                                                                         |
| Lint                                  | Fallido             | ESLint sin `--fix` reporta 2266 errores en `src`/`test` (2185 potencialmente auto-corregibles). El comando configurado del proyecto activa `--fix`, por eso no se ejecutó; no se alteró código. Los hallazgos no se clasificaron como preexistentes o nuevos uno por uno. |
| Comprobación arquitectónica dedicada  | No disponible       | No se encontró script de arquitectura/dependency checking en `package.json` o `scripts/`.                                                                                                                                                                                 |
| Pruebas PostgreSQL opt-in             | Omitidas/bloqueadas | Véase sección PostgreSQL.                                                                                                                                                                                                                                                 |

### Fallos de tests observados

1. **Discs — test de agregados de `findAll`:** el spec exige que el QueryBuilder llame explícitamente `addSelect('disc.id', 'discId')`; esa llamada no aparece en `findAll`. La expectativa y la query ya estaban en `main`, por lo que el fallo es preexistente y no se atribuye a BC-DIS-1–4 ni al trabajo posterior de Catalog. La explicación y la comparación aislada con `main` están en la sección BC-CAT-REG-1.
2. **Versions — dos specs de inyección de dependencias:** fallan porque el test module no provee `VersionRepository`. Los specs equivalentes, con el mismo contenido, existen en `main`; son fallos preexistentes fuera de Catalog.

Los tests HTTP de las rutas de Discs y Spotify pasan cuando se permite el listener local. En la primera pasada dentro de sandbox fallaron con `EPERM` al escuchar en `0.0.0.0`; esa limitación no se cuenta como regresión.

## Investigación BC-CAT-REG-1 — expectativa de Discs

**Clasificación: fallo preexistente en la suite de `main` (opción 3).** No se modificó el test ni la implementación.

- Reproducción focalizada en la rama actual: `yarn --ignore-engines test --runInBand src/catalog/discs/catalog/disc-catalog.service.spec.ts` — 80 tests pasan y falla únicamente `defines each findAll aggregate once with its current SQL formula and alias`. La expectativa fallida es `builders[0].addSelect` con argumentos `('disc.id', 'discId')`; `findAll` registra cuatro `addSelect`, todos para agregados.
- Comparación de `main` sin cambiar el checkout compartido: se archivó `main` en `/tmp/bc-cat-reg-main-20261015`, se reutilizaron las dependencias instaladas y se ejecutó la misma suite desde esa copia. El mismo test falla con la misma expectativa; 80 tests pasan.
- Evidencia de origen: el `git blame` de la expectativa apunta al commit `a161b203`; ese commit es ancestro de `main`. El código de `findAll` en `main` no incluye la llamada explícita, igual que la rama actual. El helper de mapping también estaba en `main` y acepta tanto `discId` como `disc_id`, así que no requiere exclusivamente ese alias explícito. El contrato HTTP no expone `discId` como campo adicional; el test lo excluye del payload. No se ejecutó PostgreSQL para observar el alias raw que produce el driver.
- Relación con BC-DIS-1–4: esos cambios afectan el mapping de relaciones en escritura, el ranking Home, la validación de DTO y la transacción de creación compuesta. No alteran `DiscCatalogService.findAll`, su test ni el helper de filas raw.
- Tests relacionados en la rama actual: `catalog-raw-rows.spec.ts`, `map-catalog-disc.spec.ts` y `discs.service.spec.ts` — **3 suites y 22 tests aprobados**.
- **Impacto:** no hay evidencia de una regresión funcional de Catalog causada por esta expectativa; el fallo rojo ya forma parte del baseline de `main`. Sigue siendo un fallo de la suite si el CI ejecuta ese test, pero esta investigación no lo corrige ni lo suprime.
- **Bloqueo de publicación:** este fallo concreto no es un bloqueo nuevo atribuible a Catalog. El estado global de la regresión continúa **BLOCKED** por persistencia real de PostgreSQL y la integración real de contratos pendientes; no se declara Catalog listo para producción.

## PostgreSQL y persistencia

- En la inspección inicial, `pg_isready` no encontró respuesta en `/var/run/postgresql:5432` y no se identificó una base desechable configurada. BC-CAT-REG-2 preparó después el entorno descrito en esa sección; no se reutilizó `.env` ni el contenedor preexistente `spammusicdb`.
- **No ejecutado:** ranking Home con Favorites, Pendings y Rates; persistencia real de Artist/Genre al crear Disc; rollback real de Artist + Disc; importaciones parciales Excel y Manual; medición de importación Excel representativa de hasta 300 discos.
- La suite tiene siete specs PostgreSQL opt-in de Home; permanecieron omitidos por no configurar los flags `D31_POSTGRES_TEST` a `D37_POSTGRES_TEST`. Las pruebas de transacción/importación disponibles son unitarias y usan dobles, no una base real.
- No se ejecutaron migraciones ni escrituras contra bases existentes.

### BC-CAT-REG-2 — Preparación de PostgreSQL local

**Estado al cierre de BC-CAT-REG-2:** PostgreSQL estaba disponible y aislado; la preparación del esquema quedó bloqueada. BC-CAT-REG-3 resolvió después ese bloqueo usando la alternativa de metadata TypeORM. No se ejecutaron las suites de integración ni se importaron discos.

#### Entorno

- Imagen local: `postgres:17` (servidor 17.10), contenedor `riffvalley-catalog-test-pg-20261015`.
- Destino: `127.0.0.1:55432`, base `riffvalley_catalog_test_20261015`, usuario `riffvalley_catalog_test`, `STAGE=dev`.
- El puerto está publicado únicamente en loopback. El contenedor usa un volumen Docker anónimo (`/var/lib/postgresql/data`), `--rm` y no monta directorios del repositorio ni datos de producción. El contenedor permanece ejecutándose para la siguiente tarea; al detenerse, Docker elimina el contenedor y su volumen anónimo.
- Se generó una contraseña aleatoria local y se guardó fuera del repositorio en `/tmp/riffvalley-catalog-test-pg.env` con permisos `0600`. El valor no se registró aquí ni se reutilizaron credenciales de `.env`.
- `docker-compose.yml` no se reutilizó: publica `5432`, consume variables de `.env` y monta `./postgres` como almacenamiento persistente. El contenedor preexistente `spammusicdb` ocupa `5432`; no se inspeccionó su contenido ni se modificó.

#### Preparación reproducible

1. Crear un archivo temporal con una contraseña aleatoria y permisos privados:

   ```sh
   node -e "const fs=require('node:fs'); const crypto=require('node:crypto'); const file='/tmp/riffvalley-catalog-test-pg.env'; fs.writeFileSync(file, 'POSTGRES_PASSWORD='+crypto.randomBytes(24).toString('hex')+'\n', {mode:0o600, flag:'wx'})"
   ```

2. Si no existe ya, iniciar el contenedor aislado con una imagen PostgreSQL disponible localmente:

   ```sh
   docker run --detach --rm \
     --name riffvalley-catalog-test-pg-20261015 \
     --env-file /tmp/riffvalley-catalog-test-pg.env \
     --env POSTGRES_USER=riffvalley_catalog_test \
     --env POSTGRES_DB=riffvalley_catalog_test_20261015 \
     --publish 127.0.0.1:55432:5432 \
     --volume /var/lib/postgresql/data \
     postgres:17
   ```

3. Para usar Yarn/TypeORM en siguientes tareas, cargar el archivo local de credencial y exportar únicamente la conexión de pruebas:

   ```sh
   set -a
   . /tmp/riffvalley-catalog-test-pg.env
   set +a
   export STAGE=dev DB_HOST=127.0.0.1 DB_PORT=55432 \
     DB_NAME=riffvalley_catalog_test_20261015 \
     DB_USERNAME=riffvalley_catalog_test DB_PASSWORD="$POSTGRES_PASSWORD"
   ```

   Con el Node actual 22.23.1, Yarn necesita `--ignore-engines`; el paquete declara Node 20.x.

#### Verificaciones

- Docker confirmó el contenedor `running`, imagen PostgreSQL 17 y el único mapeo `127.0.0.1:55432 -> 5432/tcp`; el único montaje es un volumen anónimo Docker, sin bind mounts.
- Una consulta PostgreSQL de solo lectura confirmó `current_database=riffvalley_catalog_test_20261015`, `current_user=riffvalley_catalog_test` y versión `17.10`. El servidor respondió por la publicación local; su dirección interna de contenedor fue `172.17.0.2:5432`.
- `yarn --ignore-engines build`: aprobado. No se modificó código de aplicación.
- `yarn --ignore-engines db:status --json` con `STAGE=dev` y las variables anteriores conectó al nombre de base esperado. Informó `ledgerExists=false`, 90 migraciones compiladas, 0 aplicadas y 90 pendientes. La consulta de solo lectura de tablas públicas confirmó que no existen `migrations`, `disc`, `artist`, `genre`, `country`, `rate`, `favorite` ni `pending`.
- Las siete suites `D31_POSTGRES_TEST`–`D37_POSTGRES_TEST` y la de Pending están detectadas. Crean tablas `TEMP` dentro de sus conexiones; tienen la instancia y los parámetros disponibles, pero se dejaron sin ejecutar según el alcance de esta tarea.

#### Bloqueo de esquema

El runbook de migraciones del proyecto indica detenerse si falta `public.migrations`: `db:status` no crea el ledger y `db:migrate` no debe aplicarse hasta reconciliar ese estado. Además, en la base vacía aparecen pendientes las dos migraciones de la cadena histórica de roles; el `db:migrate` general las rechaza. El runner `migration:roles` requiere un ledger existente y rechaza migraciones ajenas pendientes. Las migraciones existentes son incrementales y presuponen tablas previas; no se encontró una migración inicial que cree el esquema completo. No se ejecutó ningún runner genérico ni se usó `synchronize` para eludir estos controles.

Por tanto, la instancia sirve para las suites opt-in que crean tablas temporales, pero no tiene el esquema persistente necesario para verificar creación/persistencia de Disc, Artist y Genre, rollback, ni importaciones reales. Se necesita definir o localizar un procedimiento de bootstrap de pruebas compatible con las salvaguardas del proyecto antes de ejecutar esas comprobaciones. No se declara el entorno completamente listo.

**Próxima tarea:** ejecutar la regresión PostgreSQL real una vez resuelto el bootstrap del esquema. No se inició en BC-CAT-REG-2.

### BC-CAT-REG-3 — Bootstrap aislado desde metadata TypeORM

**Estado:** esquema de pruebas preparado y verificado; regresión PostgreSQL real todavía pendiente.

#### Origen del esquema y decisión

- No existe un dump estructural, fixture compartido ni migración inicial que cree todas las tablas de una base vacía. Las suites PostgreSQL opt-in (`D31`–`D37` y Pending) crean tablas `TEMP` propias en cada conexión; sirven para probar consultas SQL aisladas y no proporcionan el esquema persistente de escritura/importación.
- Las migraciones de `src/migrations/` son incrementales: por ejemplo, `SyncEntities` solo añade y rellena `artist.name_normalized`, y `AddStateToVersionItem` altera `version_item`; otras migraciones crean tablas añadidas a módulos posteriores. Dependen de tablas, columnas o enums que ya existían.
- La evidencia versionada más temprana es `git show 6834107:src/app.module.ts`, donde `synchronize: true` aparece junto a `autoLoadEntities`. En el commit posterior `58e3290` ya figura `synchronize: false`; las migraciones actuales no sustituyen un bootstrap inicial. **Inferencia:** el esquema base probablemente se creó con la sincronización de entidades al arrancar una versión temprana. No se consultó producción para comprobarlo.
- `public.migrations` es un ledger para identidades de migraciones ejecutadas, no un esquema inicial. `db:status` lo consulta sin crearlo; el runbook exige detenerse si falta. `db:migrate` bloquea la cadena especial de roles y `migration:roles` requiere el ledger. No se insertó ni falsificó ningún registro.
- Se eligió la tercera alternativa: un comando opt-in exclusivo para la base efímera conocida, derivado de las entidades actuales y separado de los runners de migración. `src/data-source.ts` y `src/app.module.ts` mantienen `synchronize: false`, `migrationsRun: false`.

#### Comando y garantías

Con las variables locales ya cargadas según la sección BC-CAT-REG-2:

```sh
export CATALOG_TEST_BOOTSTRAP=1
export CATALOG_TEST_DB_PASSWORD="$POSTGRES_PASSWORD"
yarn --ignore-engines db:bootstrap-catalog-test
yarn --ignore-engines db:bootstrap-catalog-test --verify-only
```

El comando exige el opt-in, `CATALOG_TEST_DB_PASSWORD` (obtenida del archivo temporal de BC-CAT-REG-2) y los valores exactos `STAGE=dev`, `DB_HOST=127.0.0.1`, `DB_PORT=55432`, `DB_NAME=riffvalley_catalog_test_20261015` y `DB_USERNAME=riffvalley_catalog_test`; rechaza `DATABASE_URL`. Antes de importar el datasource asigna `DB_PASSWORD` desde esa variable explícita, sin reutilizar una credencial heredada ni la de `.env`. Antes de DDL inspecciona el contenedor `riffvalley-catalog-test-pg-20261015` y exige imagen `postgres:17`, estado activo, único binding `127.0.0.1:55432`, volumen anónimo y ningún bind mount. Después confirma por SQL nombre de base, usuario/propietario, versión, puerto servidor e IP del contenedor; finalmente exige que `public` no tenga objetos. Un advisory lock evita dos ejecuciones simultáneas del mismo bootstrap.

El comando desactiva extensiones automáticas y la carga/ejecución de migraciones en esa instancia de `DataSource`, instala explícitamente `uuid-ossp` tras validar identidad y base vacía, y llama `dataSource.synchronize(false)` con la metadata de `src/**/*.entity.ts`. Nunca llama al modo destructivo `dropBeforeSync`. El modo `--verify-only` repite las verificaciones de identidad y esquema sin DDL. Si la base contiene objetos al ejecutar el modo de creación, se detiene.

#### Verificación ejecutada

- Bootstrap: completado en `riffvalley_catalog_test_20261015`; creó **30 tablas** de las entidades registradas y **42 claves foráneas**. Incluye `artist`, `country`, `genre`, `disc`, `users`, `rate`, `favorite`, `pending` y `comment`, además de las entidades consumidoras restantes.
- Identidad: conexión efectiva a PostgreSQL 17.10 con el usuario propietario esperado, servidor `172.17.0.2:5432` coincidente con la IP interna inspeccionada del contenedor, publicado exclusivamente en `127.0.0.1:55432`.
- Integridad: la consulta posterior encontró las tablas de metadata, las 42 FKs que declara TypeORM y las relaciones de Catalog/consumidores `Artist→Country`, `Disc→Artist/Genre`, `Rate/Favorite/Pending/Comment→Disc`. `public.migrations` no existe, como se espera porque no se ejecutaron migraciones.
- `--verify-only`: aprobado, sin escritura. TypeORM informa seis queries de sincronización adicionales: cuatro recrean `content_type_enum` y dos reafirman defaults JSONB. El verificador solo acepta esa lista exacta y consulta los catálogos: los valores del enum coinciden en orden con la metadata y ambos defaults son `'[]'::jsonb`. Cualquier otro diff hace fallar el comando.
- `yarn --ignore-engines build`, `yarn --ignore-engines tsc --noEmit -p tsconfig.build.json` y Prettier: aprobados. La omisión de `CATALOG_TEST_BOOTSTRAP=1` y la omisión de `CATALOG_TEST_DB_PASSWORD` (incluso con un `DB_PASSWORD` heredado) se rechazaron antes de inspeccionar Docker o conectar. La verificación de solo lectura se repitió con la credencial explícita del archivo de pruebas y pasó.
- No se ejecutaron las suites PostgreSQL, la persistencia Artist/Disc, rollback ni importaciones de Excel/Manual; tampoco la carga de 150–300 discos.

#### Alcance y diferencias frente a producción

Este esquema sirve para probar la lógica contra PostgreSQL y las entidades que ejecuta el código actual. No demuestra que el historial de migraciones, el ledger o el esquema real de producción sean correctos. Al generarse desde metadata, carece de migraciones aplicadas, de datos/backfills y de objetos que solo se creen en migraciones (por ejemplo, índices o extensiones históricas no declaradas en entidades). El enum y las columnas reflejan el modelo actual del branch, no versiones históricas. No debe usarse para validar el procedimiento de despliegue ni como restauración de producción.

**Seguimiento:** BC-CAT-REG-4 ejecutó después las suites PostgreSQL y escenarios reales de Catalog sobre esta base sintética; la comparación del esquema con migraciones/producción continúa pendiente. No se declara Catalog listo.

### BC-CAT-REG-4 — Regresión real de Catalog contra PostgreSQL

**Estado:** persistencia, rollback e importaciones parciales verificadas; regresión global **BLOCKED** por verificaciones de despliegue/contrato pendientes.

#### Preflight y aislamiento

- Antes de las pruebas de escritura se repitió `yarn --ignore-engines db:bootstrap-catalog-test --verify-only`. Confirmó el contenedor `riffvalley-catalog-test-pg-20261015`, binding local `127.0.0.1:55432`, PostgreSQL 17, base `riffvalley_catalog_test_20261015`, usuario/propietario `riffvalley_catalog_test`, esquema de metadata actual (30 tablas, 42 FKs) y ausencia de `public.migrations`. La contraseña se obtuvo del archivo temporal de BC-CAT-REG-2 mediante `CATALOG_TEST_DB_PASSWORD`; `DATABASE_URL` no estaba activa. No se borró ni recreó el esquema.
- Las suites D31–D37 y Pending usan tablas `TEMP` por conexión; sus `TRUNCATE` afectan solo esas tablas temporales. La nueva suite persistente valida identidad de base/usuario/propietario/puerto antes de escribir y crea fixtures con prefijo UUID. Su cleanup elimina únicamente filas de ese prefijo e IDs asociados.
- Después de la suite persistente se repitió `--verify-only` y una lectura agrupada del prefijo. El esquema siguió pasando; quedaron **0 Artist, 0 Disc, 0 Genre y 0 Country** de las pruebas.

#### Suites PostgreSQL opt-in existentes

Se ejecutaron con Yarn, `--runInBand`, D31–D37 y la suite `pending-user-relation.postgres.spec.ts` (ocho suites; 29 tests; cero omitidos):

| Suite                   | Resultado        | Evidencia / clasificación                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D31 Home global stats   | Aprobada         | SQL ejecutada por PostgreSQL con fixtures `TEMP`.                                                                                                                                                                                                                                                                                               |
| D32 Home ranking        | Corregida en 4.1 | La fila del Disc no se duplica; `voteCount=2`, `averageRate=3` y `averageCover=3`. PostgreSQL `AVG` excluye los covers `NULL`; con el único valor no nulo `3`, el promedio es `3`. La expectativa previa `1.5` era incorrecta. La fórmula auxiliar de `weightedScore` también debe usar la mediana entera efectiva que entrega el loader.       |
| D33 Home personal state | Corregida en 4.1 | La expectativa previa usaba la mediana continua (`PERCENTILE_CONT`) en vez del valor que el loader pasa al ranking. El loader convierte con `parseInt`; sus tests unitarios y PostgreSQL fijan ese comportamiento, y el código coincide con `main`. La expectativa ahora aplica la misma conversión; no se cambió producción ni la ponderación. |
| D34 Home totals         | Aprobada         | SQL ejecutada por PostgreSQL con fixtures `TEMP`.                                                                                                                                                                                                                                                                                               |
| D35 Top users by rates  | Aprobada         | SQL ejecutada por PostgreSQL con fixtures `TEMP`.                                                                                                                                                                                                                                                                                               |
| D36 Top users by cover  | Aprobada         | SQL ejecutada por PostgreSQL con fixtures `TEMP`.                                                                                                                                                                                                                                                                                               |
| D37 Rating distribution | Aprobada         | SQL ejecutada por PostgreSQL con fixtures `TEMP`.                                                                                                                                                                                                                                                                                               |
| Pending ↔ User         | Corregida en 4.1 | El fixture temporal declaraba `roles text[]`, mientras la entidad actual mapea `role text`. La migración `1791920000000-MigrateUsersToSingleRole` del commit `2634a6b` retira el array y agrega la columna singular. Se actualizó solo el fixture temporal; entidad y migraciones permanecen intactas.                                          |

**Resumen histórico de BC-CAT-REG-4:** 5 suites aprobadas, 3 fallidas; 25 tests aprobados, 4 fallidos, 0 omitidos. BC-CAT-REG-4.1 corrigió las dos expectativas obsoletas de ranking y el fixture basado en el contrato anterior de User. Véanse resultados repetidos abajo.

#### Persistencia real, transacciones e importaciones

Se añadió `src/catalog/discs/__tests__/catalog-postgres.integration.spec.ts`, opt-in únicamente con `CATALOG_POSTGRES_INTEGRATION=1`; usa el datasource TypeORM actual con migraciones, sincronización e instalación automática de extensiones desactivadas para el test. La suite pasó **4/4 tests**:

- `DiscWriteService.create` persistió `artistId` y `genreId`; la lectura posterior desde PostgreSQL coincidió con ambos IDs.
- `createWithArtist` creó Artist y Disc juntos; después reutilizó el mismo Artist para otro Disc.
- Al forzar una violación FK de Genre durante Disc, la transacción falló y el Artist recién creado no quedó persistido. Al fallar Disc con un Artist previo, ese Artist permaneció.
- Import Manual: el controller devolvió `data.results`; dos discos se importaron, el repetido se clasificó `duplicate`, una línea mal formada `INVALID_INPUT`, y el título demasiado largo `PERSISTENCE_FAILED`. Un registro posterior se importó y persistió; el Artist nuevo del registro fallido se revirtió. La fecha global inválida se clasificó como error de petición.
- Import Excel: el controller devolvió `data.results`; dos discos se importaron, el repetido se clasificó `duplicate`, la fecha de fila inválida `INVALID_INPUT` y el título demasiado largo `PERSISTENCE_FAILED`. El registro posterior persistió y el Artist del fallo se revirtió. Workbook inválido produjo `InvalidExcelWorkbookError`; los tests focalizados del controller verifican su conversión HTTP.
- Verificación posterior consultó los discos exitosos de ambos formatos. Cleanup borró solo filas propias y la consulta final confirmó cero fixtures remanentes.

El primer intento de esta nueva suite descubrió que el datasource de aplicación cargaba archivos `*.spec.ts` mediante el glob de migraciones al inicializarse desde Jest. La suite se aisló con `migrations: []`, `installExtensions: false`, `migrationsRun: false`, `synchronize: false` y sin logging; no se tocó el datasource habitual ni se ejecutaron migraciones. El intento final pasó.

#### Verificaciones focalizadas de código

- Tests unitarios de DiscWrite, Catalog Import Manual/Excel, controllers y parser Excel: **6 suites, 137 tests aprobados**.
- `yarn --ignore-engines tsc --noEmit -p tsconfig.build.json`: aprobado.
- `yarn --ignore-engines build`: aprobado.
- Prettier del test añadido y `git diff --check`: aprobados.
- No se cambió código de producción ni se retocaron las suites fallidas. No se probaron cargas de 150–300 discos ni integraciones HTTP con el frontend.

#### Bloqueos y siguiente paso

- Las discrepancias de expectativas D32/D33 y el fixture Pending/User quedaron resueltos en BC-CAT-REG-4.1; las ocho suites PostgreSQL opt-in pasaron en la repetición.
- **Compatibilidad real de despliegue:** el esquema probado procede de metadata TypeORM, no de migraciones aplicadas. No demuestra que una base existente de producción tenga las columnas, constraints, enums, extensiones, índices y ledger requeridos. Esa verificación necesita un procedimiento autorizado y aislado; no se accedió a producción/Heroku.
- **Contrato frontend:** `data.results` se verificó en controllers backend reales invocados directamente, mientras las verificaciones del frontend siguen siendo mockeadas. Falta integración HTTP entre procesos/ramas y coordinar el contrato antes de desplegar ambos.
- La medición Excel de 150/300 discos se completó en BC-CAT-REG-5; no se ejecutaron seeds ni migraciones ni se accedió a servicios externos.

**Estado de publicación:** continúa **BLOCKED**. Las suites PostgreSQL opt-in y las pruebas de persistencia pasan, pero la metadata TypeORM no acredita la cadena de migraciones/esquema real de despliegue y aún falta integración HTTP real del contrato entre backend y frontend.

### BC-CAT-REG-4.1 — Discrepancias PostgreSQL

**Estado:** las tres suites inicialmente fallidas quedan resueltas mediante cambios focalizados de tests/fixtures; no se modificó código de producción.

#### Causas y evidencia

1. **D32 (`averageCover`): expectativa obsoleta.** El fixture crea tres rates para el Disc: covers `3`, `NULL` y `NULL`. La consulta agrega con `AVG(r.cover)`, que excluye nulos, así que el resultado es `3`, no `1.5`. Se cambió la expectativa a `3`. La repetición reveló además que el cálculo de `weightedScore` de la expectativa usaba la mediana continua, aunque el servicio recibe la mediana ya convertida por `parseInt`; se alineó el cálculo de la expectativa con ese valor efectivo.
2. **D33 (mediana): expectativa obsoleta, no pérdida nueva de precisión.** `PERCENTILE_CONT(0.5)` produce un valor continuo en SQL; `loadHomeGlobalStats` lo convierte explícitamente a entero con `parseInt(value, 10) || 1` antes de interpolarlo en el SQL de ranking. El test unitario del loader y `home-global-stats.postgres.spec.ts` comprueban esa conversión y el fallback. El loader/servicio coinciden con `main` (`git diff main -- src/catalog/discs/home/loaders/home-global-stats.ts` vacío). No hay evidencia funcional para cambiar la fórmula ni la precisión aceptada por el ranking. La expectativa de D33 ahora calcula con `effectiveMedianVotes`.
3. **Pending/User: fixture obsoleto por migración arquitectónica previa.** La entidad TypeORM actual declara `role` escalar (`text`, `select: false`). El commit `2634a6b` (“feat(auth): migrate to canonical single roles”) incorpora `1791920000000-MigrateUsersToSingleRole`, que elimina el array `roles` y agrega el rol singular. Se sustituyó `roles text[]` por `role text NOT NULL DEFAULT 'user'` solo en la tabla temporal de prueba. No se tocaron User ni migraciones.

#### Cambios y verificaciones

- Cambios exclusivos de test/fixture: `averageCover=3` y cálculo esperado de `weightedScore` con mediana entera efectiva en D32; la misma fórmula efectiva en D33; columna `role` singular en el fixture Pending/User. No se omitieron ni debilitaron casos.
- Preflight de solo lectura `yarn --ignore-engines db:bootstrap-catalog-test --verify-only`: aprobó el contenedor `riffvalley-catalog-test-pg-20261015`, `127.0.0.1:55432`, base `riffvalley_catalog_test_20261015`, usuario/propietario de test, 30 tablas, 42 FKs y seis equivalencias de metadata; `public.migrations` ausente como se espera. No se ejecutaron migraciones.
- Repetición focal: D32 **4/4**, D33 **5/5**, Pending/User **2/2** tests aprobados individualmente.
- Ocho suites opt-in D31–D37 y Pending: **8/8 suites, 29/29 tests aprobados, cero omitidos**. Usaron sus tablas PostgreSQL `TEMP`; no alteraron las tablas persistentes del esquema de test.
- Tests unitarios relacionados (`src/catalog/discs/home` y `src/community/pendings`): **13 suites aprobadas, 53 tests aprobados; 8 suites y 29 tests PostgreSQL omitidos** al ejecutar sin flags de integración.
- `yarn --ignore-engines tsc --noEmit -p tsconfig.build.json`: aprobado. `yarn --ignore-engines build`: aprobado. Prettier en los tres archivos de tests: aprobado. `git diff --check`: aprobado.

#### Límites pendientes

- No se cambió la mediana de producción ni la regla de ponderación; la evidencia respalda conservar el contrato actual.
- Las suites de ranking y Pending utilizan fixtures temporales y verifican SQL/relaciones sobre PostgreSQL real; no sustituyen el esquema productivo.
- La preparación de esquema desde metadata TypeORM no valida migraciones reales ni el estado de una base existente. La integración HTTP real de `data.results` backend/frontend sigue pendiente. El estado de publicación permanece **BLOCKED**.

### BC-CAT-REG-5 — Rendimiento de importación Excel

**Resultado:** las tres importaciones secuenciales finalizaron sin errores inesperados. El servicio importó 150 y 300 discos; la reimportación clasificó los 150 como duplicados. La limpieza verificó cero filas sintéticas remanentes.

#### Método y aislamiento

- Antes de cada pasada de escritura, `yarn --ignore-engines db:bootstrap-catalog-test --verify-only` confirmó el contenedor `riffvalley-catalog-test-pg-20261015`, binding `127.0.0.1:55432`, base `riffvalley_catalog_test_20261015`, usuario/propietario `riffvalley_catalog_test`, 30 tablas y 42 claves foráneas. No había `DATABASE_URL` activa; la contraseña provino únicamente de `/tmp/riffvalley-catalog-test-pg.env`. No se usó `.env`, producción ni Heroku.
- Los workbooks se crearon a partir de `ExcelTemplateService.generateTemplate()` con nombres sintéticos `BC5-<UUID>`, un país y género sintéticos, y artistas nuevos repetidos cada tres discos. Cada disco tenía nombre único y fecha válida. Se comprobó el encabezado real y que la plantilla lleva listas desplegables en filas 2–101; las filas posteriores contienen valores válidos aunque ya no tengan validación desplegable.
- `ExcelWorkbookParser`, `ExcelImportService` y `ExcelController.uploadTemplate` fueron las implementaciones reales. No hubo mocks de persistencia. Las peticiones HTTP usaron el controller, `FileInterceptor` y `data.results` en una aplicación NestJS efímera ligada solo a loopback; se sustituyeron los guards de autenticación para el ensayo y no se probó JWT ni el bootstrap completo de la aplicación.
- Se registró por separado el tiempo dentro de `importDiscs` y el tiempo HTTP desde el envío multipart hasta leer la respuesta JSON. TypeORM SQL logging quedó desactivado para aproximar la configuración productiva; los logs propios del servicio permanecieron activos. No se paralelizaron lotes.

#### Resultados

| Escenario           | Discos | Importados | Duplicados | Fallidos | Tiempo servicio | Tiempo HTTP |
| ------------------- | -----: | ---------: | ---------: | -------: | --------------: | ----------: |
| Primera importación |    150 |        150 |          0 |        0 |       974.11 ms |  1006.68 ms |
| Primera importación |    300 |        300 |          0 |        0 |      1249.71 ms |  1257.71 ms |
| Reimportación       |    150 |          0 |        150 |        0 |       820.76 ms |   826.56 ms |

- **Tiempo medio del servicio por disco:** 6.494 ms para la primera carga de 150; 4.166 ms para la primera de 300; 5.472 ms para la reimportación de 150.
- **Tiempo HTTP medio por disco:** 6.711 ms, 4.192 ms y 5.510 ms, respectivamente.
- Tamaño de los workbooks: 13,096 bytes (150 filas) y 18,519 bytes (300 filas). Cada respuesta conservó `data.results` y devolvió un resultado por fila.
- Persistencia: 150/150 y 300/300 discos guardados con Artist, Country y Genre enlazados correctamente. Se crearon 50 artistas para el lote A y 100 para el B; total sintético comprobado: 150. Tras la reimportación, el lote A seguía con 150 discos, sin grupos duplicados ni artistas huérfanos.
- Conteos exactos de las respuestas: 150 importados/0 duplicados/0 fallidos; 300/0/0; 0 importados/150 duplicados/0 fallidos. No hubo errores inesperados.
- Cleanup limitado a nombres/IDs sintéticos y referencias Country/Genre creadas por esta prueba. Consulta final: **0 Disc, 0 Artist, 0 Genre y 0 Country** de la prueba.
- Suites focalizadas Yarn de plantilla, importador, parser y controller: **4 suites aprobadas, 76 tests aprobados**. No se añadió ni modificó código de aplicación, scripts del repositorio o tests durante BC-CAT-REG-5; por eso no se repitieron build/typecheck.

#### Límites de rendimiento y timeout

- La petición HTTP local de 300 discos terminó en 1.258 s en esta ejecución; no existe un umbral contractual de timeout. Es una señal del coste del flujo en este host y esta base, no una garantía de latencia productiva.
- La comparación con Heroku queda omitida: red, hardware/plan de PostgreSQL, carga concurrente, caché, logging y límites del dyno pueden cambiar la duración. No se accedió a Heroku ni producción.
- La medición HTTP incluyó multipart, controller, servicio y respuesta JSON, pero sustituyó la autenticación y no incluyó el arranque completo de NestJS ni el frontend. La plantilla limita sus dropdowns a 100 filas; los valores de las filas 102–301 eran válidos, aunque la interfaz de Excel no ofrece dropdowns allí.
- No se midieron percentiles, repetición estadística, concurrencia, límites máximos de archivo ni respuesta serializada a través de proxies productivos. No se puede certificar tolerancia al timeout de Heroku a partir de este benchmark.

**Estado de publicación:** continúa **BLOCKED**. El benchmark local no resuelve la integración HTTP backend/frontend ni demuestra compatibilidad del esquema real/migraciones de producción.

## Frontend y contratos

| Comprobación                                   | Resultado                  | Tipo de evidencia                                                                                                         |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                   | Aprobado                   | Incluye `vue-tsc --noEmit` y `vite build`.                                                                                |
| `yarn test`                                    | Aprobado                   | 5 archivos, 20 tests; los tests de servicios/vistas simulan respuestas HTTP.                                              |
| Manual/Excel consume `data.results`            | Aprobado en tests y código | Tests mockeados verifican las respuestas; no es una llamada a backend real.                                               |
| `Genre.color` y `Country.isoCode` aceptan null | Aprobado en test mockeado  | Tipos frontend declaran `string \| null`; el test usa valores null.                                                       |
| Crear/actualizar Discs                         | Inspección estática        | Campos y rutas del cliente corresponden a DTOs backend; no hubo integración HTTP real contra una API con base de pruebas. |

### Dependencia backend/frontend

**Current behavior:** backend devuelve el resultado común de importación en `data.results`; el frontend de la rama activa lee ese arreglo tanto para Manual como Excel y valida su presencia. También tipa como nullable `Genre.color` y `Country.isoCode`.

**Problem:** la rama frontend de `main` aún debe recibir este cambio contractual junto con backend. Si se despliega únicamente el backend con la respuesta común nueva, el frontend anterior puede no representar los resultados; el frontend de esta rama además rechaza la forma Excel legacy.

**Impact:** backend + frontend.

**Options:**

1. Preserve compatibility.
2. Refactor internally.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** coordinar el merge y despliegue de los cambios backend y frontend de importación como una misma entrega; después verificar las respuestas contra una API real. No se recomienda desplegar un solo lado basándose únicamente en mocks.

**Blocks the current task:** Yes. La integración de contratos real sigue pendiente y la compatibilidad entre versiones desplegadas no está demostrada.

## Fallos preexistentes, regresiones y advertencias

- **Preexistentes confirmados:** los dos fallos de specs de `Versions`, presentes sin cambios en `main`; quedan fuera del alcance Catalog.
- **Estado local de Catalog:** la expectativa de alias en la prueba de agregados de Discs sigue fallando en la suite general y está confirmada como baseline de `main` en BC-CAT-REG-1. No es una regresión del cambio de Catalog.
- **Baseline de lint sin determinar:** el lint general informa numerosos problemas en el conjunto actual; no se corrigieron y no se hizo comparación exhaustiva contra `main`, así que no se atribuyen como preexistentes.
- **Advertencias de build frontend:** datos Browserslist desactualizados, selector CSS `.flex-[2]` con sintaxis inesperada y chunks mayores de 500 kB. El build termina correctamente y no se modificaron.

## Riesgos de integración y despliegue

1. La rama backend combina Catalog con una reorganización transversal amplia; un merge completo integraría numerosos cambios ajenos al objetivo. Se recomienda limitar la futura integración al alcance aprobado o tratar la reorganización como otra revisión.
2. La cobertura de contratos actual es de mocks y tipos; falta una prueba backend/frontend real del envelope de importación.
3. El esquema derivado de metadata actual no prueba la compatibilidad de las migraciones ni constraints/índices históricos de producción.
4. El benchmark local de 150/300 discos está disponible, pero no hay medición representativa de Heroku ni distribución bajo carga; no extrapolar los tiempos locales a producción.
5. Node activo es 22.23.1, mientras el backend declara Node 20.x. Se usó `--ignore-engines`; los builds pasaron, pero la verificación no se hizo con la versión objetivo.

## Veredicto

**BLOCKED.** Las verificaciones de persistencia, rollback, importación parcial, ranking y rendimiento local de Excel pasan; las suites opt-in están verdes tras BC-CAT-REG-4.1. Antes de recomendar producción sigue pendiente validar el contrato Manual/Excel mediante integración HTTP real entre backend y frontend, establecer compatibilidad del esquema desplegable con migraciones/estado real sin tocar producción y planificar un merge que no incorpore accidentalmente el diff transversal ajeno a Catalog. El fallo de expectativa `discId` es preexistente y no se atribuye a Catalog.

## BC-CAT-REG-6 — E2E Catalog en Chrome

### Entorno y aislamiento

- Frontend y backend se ejecutaron desde copias temporales en `/tmp`, excluyendo `.env`, `.env.*`, `.aws`, `node_modules` y `.git`. Los builds generados quedaron fuera de los repositorios originales; no se cambiaron fuentes de aplicación.
- NestJS se inició con `STAGE=dev`, `127.0.0.1:3331`, `JWT_SECRET` temporal y conexión explícita a `127.0.0.1:55432`. Se enlazó solo a loopback. Vite se abrió en `localhost:5174` con `VITE_API_BASE_URL=http://127.0.0.1:3331/api`.
- Antes de crear datos y antes de limpiar se ejecutó `yarn --ignore-engines db:bootstrap-catalog-test --verify-only`. Confirmó contenedor `riffvalley-catalog-test-pg-20261015`, PostgreSQL 17, base `riffvalley_catalog_test_20261015`, propietario/usuario `riffvalley_catalog_test`, 30 tablas, 42 claves foráneas, sin `DATABASE_URL` y sin ledger `public.migrations`. No se ejecutaron migraciones.
- Autenticación real: se creó un usuario temporal por `POST /api/auth/register`, se elevó su rol a `superadmin` en esta base aislada y se hizo login desde el formulario Vue. Se creó otro usuario `user` únicamente para probar 403. Los guards/JWT no se sustituyeron.
- Todos los registros de Catalog usaron prefijo `E2E` y fecha `20261015`; la portada visual era un SVG `data:` local. No se usaron datos personales ni álbumes reales.

### Matriz de flujos

| Flujo                                | Acción y evidencia                                                                                                                                                                                      | HTTP/persistencia                                                                                                                                                                                                                                          | Estado                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Login                                | Login en Chrome y llegada al Dashboard con `catalog-e2e-20261015`.                                                                                                                                      | Endpoint real `/auth/login`; el código de Nest usa 201 por defecto para POST, pero la respuesta del navegador no se instrumentó para capturar el estado exacto.                                                                                            | Aprobado funcionalmente; estado HTTP no capturado desde Chrome.                                                              |
| Catálogo: artistas, países y géneros | Chrome abrió Discos, Importación Manual y Artistas. Se vieron el país y el género sintéticos y tres artistas sintéticos; el catálogo se cargó desde el backend.                                         | GET `/catalog`, `/artists`, `/countries` y `/genres`: 200. El JSON real de `/catalog` devolvió `Country.isoCode: null`; no había un Genre con `color: null` en el fixture.                                                                                 | Aprobado; nullable de Country comprobado en vivo, nullable de Genre solo cubierto por tipos/tests mockeados existentes.      |
| Lista, filtro y carga incremental    | Chrome mostró 20 tarjetas en la primera página; tras desplazarse cargó la tarjeta 21. Filtro de país más búsqueda por título dejó una coincidencia. El filtro de género también se seleccionó y aplicó. | GET autenticado `/discs` devolvió registros con `artistId`, `genreId` y `countryId`; 21 discos visibles para el rango seleccionado.                                                                                                                        | Aprobado.                                                                                                                    |
| Detalle de Disc                      | Al abrir el detalle desde una tarjeta apareció el mensaje visible `Error al buscar el álbum en Spotify`.                                                                                                | El modal consulta Spotify para construir su detalle; el backend registró fallo de autenticación de Spotify (400) en este entorno aislado.                                                                                                                  | Fallido por dependencia externa; no se consideró una regresión de persistencia de Catalog.                                   |
| Ranking Home                         | Chrome mostró el disco sintético con nota 9,25, portada 8,75 y 1 voto.                                                                                                                                  | Rate, Favorite y Pending se crearon por HTTP real (cada POST respondió 201); el ranking se renderizó con la Rate.                                                                                                                                          | Aprobado para la fila y métricas observadas.                                                                                 |
| Disc + Artist nuevo y relaciones     | `POST /discs/with-artist` creó Disc y Artist; `POST /discs` creó otro Disc reutilizando ese Artist. Chrome mostró ambas tarjetas y sus relaciones.                                                      | POST de ambos Discs: 201. GET real confirmó `artistId`, `genreId` y `countryId` persistidos; PATCH de imagen sintética: 200.                                                                                                                               | Aprobado por API y comprobación visual de lectura; creación directa desde un formulario genérico no existe en esta interfaz. |
| Validación de formulario Manual      | En Chrome, con fecha y línea vacías, Añadir/Enviar aparecían deshabilitados. Después se enviaron tres líneas.                                                                                           | POST Manual real mostrado por Vue; el estado HTTP no se capturó en DevTools. Los resultados visibles fueron 1 importado, 1 duplicado y 1 fallido (`INVALID_INPUT`).                                                                                        | Aprobado funcionalmente; envelope `data.results` consumido por la vista.                                                     |
| Importación Manual y persistencia    | La vista Artistas mostró `E2E Manual Artist` y su Disc guardado; el detalle del Artist confirmaba Disc sin Country/Genre opcionales.                                                                    | La lectura real del backend confirmó ID de Disc/Artist y `releaseDate=2026-10-16`.                                                                                                                                                                         | Aprobado.                                                                                                                    |
| Importación Excel desde Chrome       | Se intentó seleccionar el workbook sintético desde el input real. El selector de archivos de la extensión no se abrió; no se volvió a intentar ni se eludió la restricción.                             | Sin petición de upload iniciada desde Chrome.                                                                                                                                                                                                              | Omitido visualmente por falta de permiso de Chrome para acceso a archivos locales.                                           |
| Importación Excel por API            | El workbook sintético se envió al endpoint NestJS real con multipart y persistencia PostgreSQL real.                                                                                                    | POST `/catalog/import/excel`: 201; existe `data.results`, no hay `results` legacy en el nivel superior. Filas: `E2E Catalog` 2 `imported`, 3 `duplicate`, 4 `failed/INVALID_INPUT`; el Disc/Artist importado persistió y se observó en Chrome en Artistas. | Aprobado por integración HTTP/API; no acredita el render visual de resultados Excel.                                         |
| 400/401/403                          | Se probaron fecha Manual inválida, archivo Excel inválido, petición sin token y operaciones protegidas con usuario `user`.                                                                              | 400 Manual: mensaje de fecha segura; 400 Excel: `El archivo no contiene un workbook Excel válido.`; 401: `Unauthorized`; 403: usuario no autorizado. Ninguna respuesta contenía stack. POST Manual/Excel y POST Disc con rol `user`: 403.                  | Aprobado por API real.                                                                                                       |

### Capturas, contratos y verificaciones

- Se inspeccionaron visualmente en Chrome la pantalla de login, Discos, Importación Manual, Artistas y Top Discos. El selector de archivos no permitió completar Excel desde Chrome; no se conserva un archivo de captura en el repositorio. La evidencia de Excel es la respuesta real del endpoint y la vista Artistas posterior.
- El contrato real de Excel se confirmó como `{ data: { results: [...] } }`, con `source.sheet` y `source.rowNumber` físicos. El contrato Manual se presentó en la interfaz desde la respuesta real de NestJS como lista de resultados con estado por línea.
- `yarn --ignore-engines build` backend: aprobado en copia temporal. `yarn build` frontend: aprobado en copia temporal; persistieron avisos de Browserslist, CSS `.flex-[2]` y chunk grande ya presentes.
- `yarn test --cache=false src/views/importPage/importResults.test.ts src/services/imports/imports.test.ts`: 12/12 tests aprobados. Estas pruebas son unitarias y usan mocks; no sustituyen la evidencia HTTP anterior. Un primer intento sin `--cache=false` ejecutó los 12 tests, pero terminó con error de escritura de caché (`EROFS`) porque `node_modules` se compartió en solo lectura; la repetición sin caché terminó con exit code 0.
- `yarn --ignore-engines prettier --check roadmap/catalog-regression-2026-10-15.md`: aprobado. La primera invocación sin `--ignore-engines` fue rechazada por el engine declarado Node 20.x frente al Node local 22.23.1; la comprobación final se ejecutó con el override explícito. `git diff --check` y la revisión de whitespace del informe: sin hallazgos.
- No se modificó código de aplicación, pruebas ni configuración del frontend. No se ejecutaron suites adicionales del backend porque esta tarea no introdujo cambios de código.

### Limpieza, riesgos y estado

- Se borraron por IDs exactos los datos sintéticos de esta ejecución: 22 Discs, 3 Artists, 1 Genre, 1 Country, 1 Rate, 1 Favorite, 1 Pending y 2 usuarios de prueba. No se llamó a operaciones masivas de borrado.
- Consulta posterior en PostgreSQL a las filas de esos usuarios, artistas, discos, género, país y relaciones: **0 filas restantes** en todos los grupos.
- La apertura de DiscDetail disparó la búsqueda integrada de Spotify y recibió fallo de autenticación del proveedor en el entorno local. Se detuvieron nuevas acciones en ese modal. Las verificaciones de Catalog restantes no requieren el proveedor.
- La carga Excel desde el navegador sigue siendo un bloqueo de evidencia UI; el endpoint/persistencia real sí está comprobado. También queda sin probar un Disc con `Genre.color: null` real.
- La base fue preparada desde metadata de TypeORM, no desde un esquema inicial productivo. Esta tarea no verifica migraciones ni compatibilidad con el esquema desplegado.
- El frontend no tiene `AGENTS.md` en su raíz ni en el árbol inspeccionado; el backend conserva sus instrucciones existentes. El estado Git del frontend (`chore/refactor-integration-dev`) contiene cambios locales previos en `.impeccable/config.json` y `.aws`, que no se alteraron. El backend permanece en `refactor/editorial` con cambios locales anteriores; no se tocaron ni descartaron.

**Estado de publicación:** **BLOCKED**. La lectura, filtros/paginación, ranking observado, escritura y Manual pasaron con HTTP y PostgreSQL reales; Excel pasó por API real pero no desde la UI de Chrome; DiscDetail depende de Spotify y falló en este entorno. Continúa pendiente la revisión del esquema/migraciones reales y del plan de despliegue. No se declara Catalog listo para producción.

## BC-CAT-REG-6.1 — Diagnóstico del error de Spotify en DiscDetail

### Flujo y causa observada

- Al hacer clic en el título de una tarjeta (`src/components/DiscCardComponent.vue`), se monta `src/components/DiscDetail.vue`. Su `onMounted` llama a `resolveSpotifyAlbum(disc.name, disc.artist.name)` y, si encuentra el álbum, a `getSpotifyAlbumDetails(spotifyId)` (`src/services/spotify/spotifyLookup.ts`). Las rutas son `GET /api/discs/spotify/album?albumName=…&artistName=…` y después `GET /api/discs/spotify/album/:spotifyAlbumId`.
- La evidencia del E2E BC-CAT-REG-6 fue el mensaje visible `Error al buscar el álbum en Spotify` y el log backend `Spotify auth failed: 400` durante la búsqueda `/search`. En `SpotifyClientCredentialsService`, ese texto solo se genera cuando el POST de token a Spotify no tiene respuesta 2xx. Por tanto, el fallo observado ocurre al obtener credenciales OAuth de Spotify antes de consultar el álbum; no es un rechazo JWT del usuario a NestJS. Las dos rutas de álbum no llevan `@Auth()`; el backend hace su propio intercambio Client Credentials con Spotify.
- La evidencia no conserva el cuerpo del error del token ni permite determinar por qué Spotify rechazó la solicitud. Credenciales ausentes, inválidas, revocadas o una configuración distinta son hipótesis posibles, no causas confirmadas. La atribución exacta del 400 queda **desconocida**; no se inspeccionaron valores locales ni configuración productiva y no se volvió a llamar al proveedor.
- Si Spotify falla, `DiscDetail.vue` reemplaza el cuerpo del modal con el error genérico. El botón de cierre sigue visible y la tarjeta/listado subyacente no depende de Spotify. Este modal no presenta los campos principales del Disc desde la base de datos: presenta metadatos, portada y pistas de Spotify. Así, se bloquea todo el contenido del modal opcional, no la vista de catálogo ni la navegación general. El mensaje permite identificar Spotify, pero no ofrece alternativa ni explica que el contenido principal del catálogo sigue disponible.

### Atribución e impacto de producción

- La integración y las rutas de Spotify ya existen en `origin/main`; la configuración documentada usa `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET`. Las fuentes actuales del frontend y el contrato backend inspeccionados también están presentes en `origin/main`. El E2E local demuestra un fallo de configuración/aceptación del token en ese entorno, pero no demuestra una regresión funcional introducida por Catalog ni permite afirmar que producción vaya a fallar.
- El riesgo de producción es condicional: si la configuración efectiva del backend no permite emitir el token, cada apertura del modal termina en el estado de error y el detalle de Spotify queda inutilizable. No se accedió a producción, por lo que la configuración real y la incidencia allí permanecen sin verificar. Este fallo no afecta la persistencia, lectura ni escritura de Catalog; sí afecta la experiencia de esta sección integrada.
- Corrección propuesta si se decide mejorar la resiliencia: tratar Spotify como enriquecimiento opcional, separar su carga/error de la información del Disc y conservar un estado vacío/error recuperable en esa sección. Añadir además una prueba que simule rechazo del endpoint de token y compruebe el contrato 502/mensaje seguro. No se aplicó ningún cambio de aplicación en esta tarea.

### Pruebas y límites

- No hay tests frontend específicos de `DiscDetail` ni de `spotifyLookup` en el repositorio inspeccionado. Los tests backend existentes mockean `fetch`; por diseño no validan credenciales ni hacen solicitudes a Spotify.
- `yarn --ignore-engines test --runInBand src/integrations/spotify-integration/api/spotify-client-credentials.service.spec.ts src/integrations/spotify-integration/api/spotify-public-api.service.spec.ts src/catalog/discs/__tests__/discs.spotify-http-contract.spec.ts`: las suites de credenciales y API pasaron (**33 tests**). La suite HTTP de contrato no pudo completar su test porque el sandbox rechazó que Supertest abriera el listener en `0.0.0.0` (`listen EPERM`); no es un fallo de expectativa ni se reintentó fuera del sandbox. Resultado total: 2 suites aprobadas, 1 suite bloqueada por entorno, 1 test no ejecutado con éxito. El controller test usa un servicio mockeado y tampoco probaría autenticación real con el proveedor.
- No se reprodujo el 400 en esta tarea: hacerlo requeriría llamar al proveedor, expresamente excluido. La evidencia del 400 procede únicamente de la ejecución local documentada en BC-CAT-REG-6.

**Estado de publicación:** permanece **BLOCKED** por los pendientes generales ya descritos. El error de Spotify es un riesgo operativo/UX acotado a DiscDetail; no queda demostrado como regresión de Catalog ni como bloqueo de la persistencia principal. La configuración productiva de Spotify sigue sin verificarse.

## BC-CAT-REG-6.2 — E2E visual Excel en Chrome

**Estado:** **BLOCKED**. La selección del archivo fue rechazada por el control de Chrome; no se envió la importación y no se evalúa el contrato Excel ni su presentación de resultados.

### Entorno y preflight

- Se confirmó por Docker el contenedor `riffvalley-catalog-test-pg-20261015`, imagen `postgres:17`, estado activo y puerto publicado exclusivamente como `127.0.0.1:55432`. Usa volumen Docker, sin bind mount. Una consulta identificó `riffvalley_catalog_test_20261015`, usuario propietario `riffvalley_catalog_test`, PostgreSQL 17.10, 30 tablas públicas, las cuatro tablas de datos Catalog necesarias (`artist`, `country`, `genre`, `disc`) y la tabla `users` usada para autenticación. No había colisiones con el prefijo sintético `BC-CAT-REG-62-`.
- NestJS se ejecutó desde una copia temporal sin `.env` y con variables explícitas de la base de pruebas, sin `DATABASE_URL`; el password se obtuvo del contenedor sin imprimirlo. La copia temporal se enlazó solo a `127.0.0.1:3331`; sus variables de sincronización periódica de Instagram/TikTok se fijaron a una fecha futura. Un `GET /api/genres` de solo lectura respondió **200** con catálogo vacío, confirmando que el backend conectado respondía desde el esquema de pruebas.
- Vue se sirvió en `http://localhost:5174` con `VITE_API_BASE_URL=http://127.0.0.1:3331/api`. `yarn dev` en la copia temporal no pudo encontrar el estado de instalación de Yarn 4; para iniciar Vite se usó el binario ya instalado, sin cambiar código. El primer acceso por `127.0.0.1:5174` provocó un fallo CORS porque ese origen no está en la allowlist; se usó `localhost:5174`, origen ya permitido. El backend permaneció en loopback.
- Se creó un usuario sintético mediante `POST /api/auth/register` (**201**), se elevó únicamente ese usuario a `riffvalley` en la base desechable y se inició sesión desde el formulario real de Chrome. La sesión JWT fue aceptada y abrió la aplicación.

### Workbook y selección desde Chrome

- Se preparó `/tmp/catalog-reg62-upload.xlsx` con ExcelJS, reflejando la estructura de la plantilla backend: hoja visible `Discos`, hoja oculta `Listas`, siete columnas (`Fecha`, `Artista`, `Disco`, `Género`, `País`, `Debut`, `EP`) y validaciones de lista. Incluía cuatro filas sintéticas en orden físico 2–5: una válida, un Disc duplicado presembrado, fecha inválida y otra válida después de la fila inválida.
- El fixture previo (Genre, Country, Artist y Disc) se insertó solo después de verificar la identidad de la base. La verificación previa encontró una fila de cada tipo. El libro se comprobó localmente: nombres de hojas, encabezados, validaciones y valores de las cuatro filas en el orden esperado.
- En Chrome se abrió `/import-discs` con el usuario autorizado. La herramienta conectada permitió abrir el selector del input visible, pero `fileChooser.setFiles('/tmp/catalog-reg62-upload.xlsx')` falló con `Not allowed`. El DOM confirmó que no había archivo seleccionado y el botón «Importar discos» seguía deshabilitado. No se usó una petición HTTP directa ni se llamó al endpoint de importación.
- Captura del estado visible: [excel-selector-blocked.jpg](roadmap/catalog-regression-evidence/excel-selector-blocked.jpg). Muestra la pantalla de importación antes de enviar, sin archivo seleccionado.

### Resultado HTTP, persistencia y limpieza

- **HTTP Excel:** omitido porque Chrome no pudo asociar el archivo. No hay respuesta del endpoint, código 201 de Excel ni evidencia de `{ data: { results: [...] } }` en esta ejecución. El **201** registrado corresponde exclusivamente al registro del usuario de prueba; el `GET /api/genres` de preflight respondió 200.
- **UI de resultados:** omitida. No se pudieron verificar estados imported/duplicate/failed, mensajes, hoja, fila física ni orden en pantalla.
- **Persistencia de importación:** omitida. No se insertaron discos del workbook; por tanto no se afirma que filas válidas se guardaran, que el duplicado se omitiera o que la inválida no creara datos.
- **Limpieza:** se eliminaron por nombres e ID exactos los cuatro fixtures de referencia/duplicado y el usuario sintético. Consultas posteriores dieron **0** Genre, Country, Artist y Disc con el prefijo, **0** usuario de prueba y **0** filas de `user_access_log` para su ID. La sesión se cerró en Chrome. No se borraron otras filas.
- No se modificó código de aplicación en ninguno de los repositorios. La copia temporal backend solo cambió el bind del servidor de pruebas a loopback; las fuentes del repositorio quedaron intactas. La configuración local `.impeccable/config.json` y otros cambios preexistentes se conservaron.

### Bloqueo y alternativa

La documentación de Chrome indica que la extensión necesita permiso de acceso a URLs de archivo. Para habilitarlo en Google Chrome: “To enable file upload, open chrome://extensions, click Details under the ChatGPT browser extension, and enable \"Allow access to file URLs.\" See [here](https://developers.openai.com/codex/app/chrome-extension#upload-files) for details.” Después se puede repetir esta prueba mediante el mismo `filechooser.setFiles` en la interfaz real. Otra alternativa es seleccionar manualmente el workbook con el selector nativo de Chrome mientras la sesión y los servidores locales están activos. Hasta que una de esas opciones permita seleccionar y enviar el archivo, la prueba visual Excel permanece sin aprobar.

**Estado de Catalog:** continúa **BLOCKED**. Esta tarea no completa la integración visual Excel; siguen pendientes el resultado real `201 + data.results` en Chrome y su comprobación de persistencia. Se mantienen asimismo los pendientes generales de esquema y despliegue indicados arriba.

### Entrega manual del workbook — 2026-10-15

- A petición del usuario, se copió el workbook sintético a `~/Downloads/catalog-reg62-upload.xlsx`. SHA-256: `5fb3c772b81b97671d3117c0c7d2af51d9702fb0e573cb4fbc79260af7ebe857`; coincide con el original temporal.
- Se volvió a comprobar el contenedor `riffvalley-catalog-test-pg-20261015`, publicado en `127.0.0.1:55432`, y la identidad `riffvalley_catalog_test_20261015` / `riffvalley_catalog_test`. `DATABASE_URL` estaba ausente y las copias locales de frontend/backend no contienen `.env`.
- Se repusieron cuatro fixtures sintéticos: Country, Genre, Artist y Disc duplicado. Se creó por el endpoint local una cuenta `catalogreg6220261015` y se asignó el rol `riffvalley` para permitir la importación autenticada. El frontend está en `http://localhost:5174` y NestJS en `http://127.0.0.1:3331`; un `GET /api/genres` respondió 200 desde la base de pruebas.
- Chrome autenticó la cuenta sintética y llegó a la página principal. La navegación automatizada a `/import-discs` se quedó sin respuesta verificable; no se seleccionó el archivo ni se envió la importación. El usuario continuará manualmente desde Chrome.
- En la primera carga manual, la UI mostró `0 importados, 0 duplicados omitidos y 4 fallidos`. NestJS registró el archivo de 7862 bytes, la hoja `Discos` y el mismo recuento. Las consultas a PostgreSQL confirmaron que solo permanecían el Artist y Disc duplicado de referencia; no se guardaron discos de esa carga.
- **Causa confirmada: workbook sintético mal construido, no regresión de Catalog.** Al asignar filas con `[undefined, ...values]`, ExcelJS desplazó el contenido una columna: la fecha quedó en B, Artist en C, Disc en D, Genre en E, Country en F, Debut en G y EP en H. El parser real espera esos campos en A–G. Por ello leyó el título del disco como Genre, el Genre como Country y `Si` como país; las filas llegaron a fallar en validación de referencias antes de abrir transacciones. También leyó la fecha como vacía, por lo que la fila de fecha inválida no ejercitó esa validación. Esto explica las cuatro fallidas y la ausencia de persistencia.
- Se generó una copia corregida en `~/Downloads/catalog-reg62-upload-corrected.xlsx`, desplazando las celdas a las columnas esperadas y comprobando su lectura con ExcelJS. El original se conserva. Antes de repetir la carga se esperaba el resultado 2 importados, 1 duplicado y 1 fallo por fecha inválida.
- El usuario repitió la carga desde la interfaz y confirmó visualmente `2 importados, 1 duplicado omitido y 1 fallido`, en orden físico: filas 2 y 5 importadas, fila 3 duplicada con el mensaje de omisión y fila 4 fallida con `INVALID_INPUT` por fecha. NestJS recibió `catalog-reg62-upload-corrected.xlsx` y registró el mismo recuento. La vista consumió los resultados y mostró hoja `Discos`, número físico de fila y mensajes. No se capturó el estado HTTP ni el cuerpo de red, por lo que no se afirma aquí el código 201.
- PostgreSQL confirmó los dos discos importados con sus Artists, Genre y Country; el Disc duplicado quedó en una sola fila. No existían Disc ni Artist para la fila inválida. Se inspeccionaron las dependencias de la cuenta y se eliminaron, en una transacción, los tres discos sintéticos, tres artistas, Genre, Country, el registro de acceso y la cuenta. La verificación posterior dio cero filas para todos esos nombres/IDs.
- El contenedor PostgreSQL desechable quedó intacto. Se detuvieron los servidores locales de NestJS y Vite después de verificar y limpiar.

**Estado:** la prueba visual manual de Excel queda **APROBADA** para el workbook corregido; la primera ejecución queda registrada como inválida por el desplazamiento del fixture. Esta evidencia no captura el estado HTTP ni la inspección directa del cuerpo de red. Catalog continúa **BLOCKED** por las verificaciones generales pendientes de esquema real y despliegue.

## BC-CAT-RELEASE-2 — Auditoría final de integración y publicación

**Resultado:** **BLOCKED**. La auditoría se hizo sobre el estado local del 2026-10-15, sin fetch ni acceso a servicios remotos. Las comparaciones usan las referencias locales `origin/main`; pueden estar desactualizadas. No se hizo checkout, commit, merge, push, despliegue ni conexión a PostgreSQL.

### Estado Git y alcance

| Repositorio | Rama | Relación con `origin/main` local | Estado local |
|---|---|---:|---|
| Backend | `refactor/editorial` | 5 commits propios, 0 commits de `origin/main` pendientes | Cambios sin commit de Catalog, pruebas, script y documentación |
| Frontend | `chore/refactor-integration-dev` | 3 commits propios, 2 commits de `origin/main` pendientes | `.impeccable/config.json` modificado y `.aws` vacío sin seguimiento |

El backend tiene los commits `614fcab` (Artists), `e019e55` (Countries), `f7518cf` (Genres) y `7a7760b` (importaciones/Last.fm), además de `be08be6`, una reorganización por dominios que cambia rutas de módulos y archivos de muchos dominios, no solo Catalog. Por ello, integrar la rama backend completa también integraría una modificación transversal de 289 archivos respecto a `origin/main`. En el diff de commits, el cambio de entidad Disc es solo el traslado de un import de Asignaciones; no cambia sus columnas ni relaciones.

El frontend tiene `92cd5ed` (filtro de Countries), `c9f6ffc` (paginación de Artists) y `1d129e9` (contratos de Catalog/importaciones). El checkout está dos commits por detrás de la referencia local `origin/main`; hay que reconciliarlo antes de proponer la integración.

En el backend el árbol de trabajo contiene modificaciones de producción de Discs (DTOs, escritura transaccional y consulta Home), specs relacionadas, cambios a `package.json`, una spec Pending/User, el bootstrap de esquema sintético y evidencia de regresión sin seguimiento. Las pruebas previas se ejecutaron sobre este estado de trabajo, de modo que el resultado no caracteriza por sí solo los cinco commits ya confirmados. Estos cambios aún no forman un conjunto revisado y separado para integrar. En frontend se conservaron sin tocar las nueve líneas locales de `.impeccable/config.json` y el archivo `.aws` vacío. El commit backend de reorganización también introduce un `.aws` vacío. No se incorporaron valores de credenciales en estos archivos vacíos; `.env` aparece ignorado por Git en ambos repositorios y no se leyó. No se detectaron otros archivos de entorno o credenciales entre los cambios visibles.

**Conclusión Git:** ninguna rama está lista para integrarse completa como una entrega de Catalog. Hace falta decidir el alcance aprobable del refactor backend transversal, seleccionar/revisar explícitamente los cambios de Catalog sin commit, actualizar la base frontend respecto a `main` y volver a auditar los hashes resultantes. No descartar ni limpiar los archivos locales existentes.

### Entidades, migraciones y esquema

- No hay migraciones nuevas ni modificadas en el rango de commits backend frente a `origin/main`, ni en el árbol de trabajo.
- Las entidades de Artists, Countries, Genres e Import no cambian. En Disc solo cambia una ruta de importación debido al traslado de Asignaciones; no hay diferencia de metadata TypeORM. Los cambios sin commit tampoco editan entidades.
- La configuración mantiene `synchronize: false` y `migrationsRun: false`. El `Procfile` solo arranca NestJS; no hay release phase que ejecute migraciones. El README declara que las migraciones de Heroku son manuales e independientes del despliegue.
- Según el diff inspeccionado, Catalog no requiere una migración nueva para incorporar estos cambios de código; se usan las tablas y columnas existentes (`disc`, `artist`, `genre`, `country` y relaciones de usuario/ranking). Esto no demuestra que la base productiva tenga exactamente el esquema esperado: el bootstrap local se generó desde metadata TypeORM y no valida el ledger ni la estructura productiva.
- Antes de publicar, una comprobación remota autorizada y de solo lectura debería contrastar `current_database()`, `information_schema.columns` para esas tablas, `information_schema.table_constraints`/`key_column_usage` para sus FK y `pg_indexes` para índices relevantes; además, `yarn db:status`/`yarn db:check` debe confirmar el ledger actual. No se ejecutaron esas consultas.

### Contratos y permisos

- La rama backend nueva devuelve importaciones Manual como HTTP 201 con `data.results`; Excel devuelve HTTP 201 con `data.results`. La rama frontend espera y valida `response.data.results` en ambas rutas, y sus vistas presentan los estados `imported`, `duplicate` y `failed`. `Genre.color` y `Country.isoCode` aceptan `null` en TypeScript.
- En las ramas auditadas, las rutas de creación y edición de Disc coinciden con el backend: `POST /api/discs` y `PATCH /api/discs/:id` usan `CreateDiscDto`/`UpdateDiscDto`; crear un Disc junto con artista usa `POST /api/discs/with-artist`. Esto se basa en inspección de código y en la evidencia E2E local ya documentada, no en una comprobación de producción.
- Los endpoints Excel (`/api/catalog/import/excel` y su plantilla) requieren mínimo `riffvalley` tanto en la vista como en backend. Hay una discrepancia de autorización pendiente para Manual: el frontend expone `/import` a cualquier usuario autenticado (`requiresRole: "user"`) y llama a `/api/catalog/import/manual`, pero el backend protege ese endpoint con mínimo `superadmin`. La jerarquía de ambos repositorios establece que `riffvalley` no satisface `superadmin`; por tanto, la vista Manual puede mostrarse y terminar en 403. La prueba visual manual del workbook cubrió Excel y no resolvió este caso. Hace falta decidir y verificar el rol funcional autorizado antes de afirmar compatibilidad completa.
- La versión frontend anterior espera el contrato legacy de importación, mientras la rama frontend actual exige `data.results`; desplegar un solo lado puede dejar la importación incompatible durante la transición. Se necesita publicación coordinada o compatibilidad temporal explícita.

### CI/CD y despliegue observado

- **Backend:** `Procfile` configura `web: yarn start:prod`. El README prescribe `git push heroku main`; no hay workflow de GitHub ni release phase versionada que publique automáticamente desde `main`. No se consultó el estado remoto de Heroku, el buildpack ni las variables configuradas. El datasource exige configuración PostgreSQL y secretos de aplicación; sus valores no se inspeccionaron ni documentaron aquí.
- **Migraciones:** el comando de producción del repositorio es `bash scripts/db-migrate-heroku.sh`. El runbook verifica el app/release y attachment, crea y verifica backup antes de ejecutar migraciones aprobadas. Este cambio no añade migraciones, pero antes de publicar hay que comprobar el ledger con el procedimiento de solo lectura y detenerse si la base no coincide con el esquema esperado.
- **Frontend:** `netlify.toml` solo declara fallback SPA. El workflow `.github/workflows/release.yml` corre por push a `main`, instala dependencias y crea una release GitHub con semantic-release; no ejecuta build ni publica a Netlify. No existe configuración versionada que pruebe qué rama o commit tiene conectado Netlify, cuáles son sus variables de build o cómo se revierte un deploy. Hay que confirmar esos datos en el panel de despliegue antes de la ventana; no se accedió a ese panel.
- El build frontend requiere `VITE_API_BASE_URL`; la compilación local previa y el smoke de API deben apuntar al backend correcto. Los valores productivos de variables no se leyeron. No se halló un `release` automático de migraciones en el backend.

### Procedimiento coordinado propuesto

1. Resolver la discrepancia de permiso Manual y acordar el alcance de la reorganización backend. Preservar fuera del release los cambios personales de `.impeccable/config.json`, `.aws` local, evidencia y artefactos solo de prueba; revisar uno por uno los cambios backend sin commit. No incluir el bootstrap de schema de pruebas en artefactos de producción salvo decisión explícita.
2. Actualizar ambas ramas sobre el `main` vigente mediante PRs revisables, con commits/hashes exactos y listado de archivos. No integrar toda `refactor/editorial` hasta que la reorganización transversal se apruebe; los commits que mueven módulos de Catalog dependen de parte de esa reorganización. No publicar el código que se probó hasta repetir las comprobaciones pertinentes sobre el mismo árbol limpio que se pretende integrar.
3. Ejecutar en CI `yarn install --immutable`, build/typecheck y las suites focalizadas ya definidas para Catalog/consumidores. El workflow frontend actual no cubre build/tests; añadir o ejecutar esas comprobaciones en el proceso de PR antes de merge. Revisar `git diff --check` y confirmar que no se incluyen secretos ni fixtures.
4. Antes de cualquier acción productiva, verificar manualmente el app/backend, la rama y el release objetivo, el destino real del deploy frontend, `VITE_API_BASE_URL` y variables backend (solo presencia/nombre, sin revelar valores), y el esquema/ledger con las consultas de solo lectura descritas arriba. Capturar backup PostgreSQL de la base correcta, esperar estado `Completed` y guardar el identificador. Si aparece cualquier migración pendiente o diferencia de esquema, parar y someterla a preflight independiente; no ejecutar migraciones como parte de este release.
5. Dado que la publicación frontend y backend no es atómica y las versiones anterior/nueva no comparten el contrato de importación, usar una ventana coordinada: deshabilitar temporalmente las importaciones, publicar backend y frontend en rápida secuencia, comprobar health/API y versión, y reabrirlas solo después de smoke tests en staging con Manual y Excel reales. Smoke tests productivos iniciales deben ser de lectura para no insertar fixtures en datos reales.
6. Verificar en navegador los catálogos, listado/detalle de Disc, y en staging una importación sintética Manual y Excel que compruebe HTTP 201 + `data.results`, permisos, duplicados, errores de fila y persistencia. En producción, usar lectura de Catalog, autenticación/roles y errores 401/403; no escribir datos de prueba sin un plan de cleanup aprobado.
7. Si falla el código, revertir ambos despliegues al par de versiones anterior mediante Heroku Releases y el historial de deploys de Netlify, y mantener cerradas las importaciones mientras se verifica el estado. El rollback de código no revierte PostgreSQL. No hay migración prevista; si una migración se vuelve necesaria, aplicar su runbook/backup/plan de recuperación por separado y no prometer reversión automática de datos.

### Decisión

**BLOCKED — no publicar ni integrar todavía.** Los bloqueos son: (1) cambio backend sin commit que modifica la implementación ejecutada en las pruebas; (2) reorganización backend de alcance transversal y un `.aws` vacío introducido por commit; (3) frontend dos commits por detrás de la referencia local `origin/main`; (4) autorización Manual frontend/backend discordante; (5) falta confirmar el despliegue real y variables de Netlify, y posibilidad de rollback; (6) esquema/ledger productivo no comprobados. No hay evidencia de migración Catalog nueva, pero esto no equivale a validar el esquema de producción. Una vez resueltos los bloqueos, revisar el conjunto final de commits y hacer el despliegue coordinado con ventana de mantenimiento para importaciones.

## BC-CAT-RELEASE-4 — Inventario Git y alcance del backend

**Fecha de inspección:** 2026-10-15. **Resultado:** **BLOCKED**; no se integró ningún commit ni se modificaron referencias remotas. Esta sección reemplaza el inventario backend del RELEASE-2 para el estado que se observó ahora. No se accedió a PostgreSQL ni a Heroku.

### BC-CAT-RELEASE-3 — actualización recibida

Se registra como **completada en frontend**, según la indicación recibida para esta revisión. No se cambió ni se inspeccionó el repositorio frontend en esta tarea. La finalización de RELEASE-3 no resuelve por sí sola la selección de cambios backend, el acoplamiento con la reorganización transversal ni la compatibilidad del esquema de producción.

### Inventario Git backend

- Rama y HEAD: `refactor/editorial`, `7a7760b0e548171b40efa673a3761ec577ffb3d1`; sigue a `origin/refactor/editorial` en ese mismo hash.
- `origin/main` disponible localmente: `2b203b8fcd5140cda663be4e4a5f687dd35c4269`, commit del **2026-10-14 21:55:03 +02:00**. No se hizo fetch; la fecha y el hash describen la referencia local, no garantizan que coincida con el remoto actual.
- Merge-base: `2b203b8fcd5140cda663be4e4a5f687dd35c4269`. La rama tiene **5 commits exclusivos y 0 commits exclusivos de `origin/main`**; el rango completo toca **289 archivos**.

| Commit exclusivo | Fecha / alcance principal | Dominios y dependencias |
| --- | --- | --- |
| `be08be6` `refactor: reorganize backend modules by domain` | 2026-10-14; 266 archivos cambiados en el propio commit. Reorganiza imports y rutas de módulos, entidades, DTOs y tests. Cambia `src/app.module.ts`, `package.json` (postbuild/copy de i18n), arranque y documentación; añade `.aws` vacío. | Transversal: Catalog, Community, Editorial, Identity, Product, Platform, Integrations y Communications. También mueve `CommonModule`/Catalog overview y `PaginationDto`; reubica Auth, Asignations y los demás módulos. Contiene ajustes además de movimientos mecánicos, por ejemplo en servicios de Artists, Requests, Editorial y módulos de Integrations. |
| `614fcab` `refactor(artists): complete BC-ART-2 through BC-ART-4` | 2026-10-15; 11 archivos. | Catalog/Artists: controller, búsqueda, detalle, management, DTO/helper y caracterización; actualiza `roadmap/backend-cleanup.md`. |
| `e019e55` `fix(countries): validate pagination offset` | 2026-10-15; 6 archivos. | Catalog/Countries: controller, servicio, DTO de query y specs; actualiza roadmap de cleanup. |
| `f7518cf` `fix(genres): validate pagination and close cleanup` | 2026-10-15; 7 archivos. | Catalog/Genres: controller, DTOs y specs; actualiza roadmap de cleanup. |
| `7a7760b` `feat(catalog): finalize imports and validate Last.fm artist input` | 2026-10-15; 22 archivos. | Catalog/Import y Last.fm: servicios/parsers Excel y Manual, resultados comunes de importación, transacción, validación y specs; actualiza roadmap de cleanup. |

El rango total reparte sus 289 rutas entre Catalog (68), Editorial (92), Community (34), Product (27), Identity (26), Platform (14), Integrations (8), Communications (1), raíz de `src`/arranque (5), documentación/roadmaps (11), `test` (1), `package.json` (1) y `.aws` (1). Los cuatro commits posteriores a `be08be6` modifican principalmente Catalog, pero sus rutas y módulos ya están en el nuevo layout. Por tanto, los cuatro no son cherry-picks autónomos respecto a `origin/main`.

### Cambios locales sin commit

`git status --porcelain=v2` no muestra cambios staged. Hay **14 archivos modificados unstaged** y **5 archivos sin seguimiento**:

| Archivos/cambio local | Clasificación para RELEASE Catalog |
| --- | --- |
| `src/catalog/discs/dto/{create-disc-with-artist.dto.ts,create-discs.dto.ts}` y `src/catalog/discs/write/disc-write.service.ts` | **Pendiente de clasificación**: cambios de producción de Catalog (validación de payloads y transacción de creación Disc/Artist), no incluidos en los cinco commits confirmados y no necesarios para identificar el contrato de Import/Artists/Countries/Genres del rango. Deben decidirse y caracterizarse antes de incorporarlos al release. |
| `src/catalog/discs/home/disc-home.service.ts` | **Pendiente de clasificación**: cambio de producción de Catalog en ranking/estado personal y desempate de orden. Es independiente del cierre de Import/Artists/Countries/Genres; revisar su alcance antes de incluirlo. |
| Specs modificados de Discs: controller, DTOs, Home PostgreSQL y escritura | **Útiles para verificación** de los cambios locales de Discs; no son requisitos de runtime. Dos suites Home son PostgreSQL opt-in. |
| `src/catalog/discs/__tests__/catalog-postgres.integration.spec.ts` (nuevo) y `src/catalog/discs/__tests__/discs-validation.spec.ts` (nuevo) | **Útiles para pruebas** de persistencia/validación; el primero es una prueba de integración PostgreSQL opt-in. No se ejecutaron en esta tarea. |
| `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts` | **Útil únicamente para pruebas** de Community/relación de usuario; queda fuera de la entrega funcional de Catalog. Es PostgreSQL opt-in. |
| `scripts/bootstrap-catalog-test-schema.ts` y entrada `db:bootstrap-catalog-test` en `package.json` | **Útiles únicamente para pruebas**: bootstrap explícito de un esquema aislado desde metadata TypeORM. No es una migración ni prueba compatibilidad del esquema real. Excluir del artefacto de producción salvo decisión separada. |
| `roadmap/backend-cleanup.md` | **Documentación útil**, con cambios locales pendientes de commit; preservar y revisar por separado. |
| Este `roadmap/catalog-regression-2026-10-15.md` | **Documentación del análisis**, actualmente sin seguimiento. |
| `roadmap/catalog-regression-evidence/excel-selector-blocked.jpg` | **Evidencia de prueba**, sin seguimiento (JPEG, 1173×680); no es código de producción. |

No se observan otros archivos staged. El `.aws` de la rama está vacío (0 bytes) y fue añadido por `be08be6`; no aparece como cambio local sin commit. `.env` está ignorado; no se leyó ni se usó. No se detectaron archivos de credenciales entre los cambios de trabajo listados. No se descartó ni limpió nada.

### Dependencias arquitectónicas del cambio transversal

La dependencia está demostrada en el árbol actual:

- `src/app.module.ts` importa Catalog bajo `src/catalog/...`, Auth desde `src/identity/auth`, i18n desde `src/platform/i18n` y registra módulos reubicados de Editorial, Product, Identity y Platform. Dejar fuera `be08be6` sin rehacer el wiring deja imports que no existen en `main` o elimina el registro requerido.
- Los módulos de Artists, Countries, Genres, Discs, Import y Last.fm usan el `AuthModule` reubicado. Import, entre otros, registra repositorios de Artist/Disc/Country/Genre; Last.fm depende de `DiscModule`, Auth y `LastfmIntegrationModule`.
- Los servicios y DTOs de Catalog importan `PaginationDto` desde `src/platform/common/dtos/pagination.dto.ts`. Catalog overview y `AppModule` dependen del módulo/controller movido desde `src/common` a `src/catalog/overview`.
- `Disc` conserva la relación existente con `Asignation`, cuya entidad pasa a `src/editorial/asignations`; la entidad User relaciona Catalog/Community con Editorial. Los módulos Community y Editorial también dependen de la nueva ruta de Auth y del DTO compartido. El cambio de `AppModule` y los imports de esas entidades es parte de la misma relocalización.
- La configuración de TypeORM carga entidades por glob, y `src/data-source.ts` no cambia en el rango. Esto no resuelve imports de TypeScript ni el registro NestJS; la configuración de build/i18n y arranque sí se ajusta en `be08be6`.

No es seguro excluir el commit transversal dejando intactos los cuatro commits de Catalog. Una publicación Catalog-only exigiría extraer o adaptar explícitamente el cierre de dependencias (Auth, paginación, overview, relación Disc/Asignation, registro NestJS, rutas/imports y configuración de build), y comprobar que el layout restante compila y conserva los demás módulos. No se ha demostrado que ese cierre sea pequeño. `be08be6` además contiene código funcional y pruebas fuera de Catalog, por lo que no debe tratarse como un simple movimiento automático.

### Migraciones y entidades

- El diff real contra `origin/main` no contiene archivos nuevos, modificados ni eliminados en `src/migrations`; el estado local tampoco lista cambios de migración. No se ejecutaron ni se consultaron migraciones.
- Se reubicaron entidades de Editorial/Identity/Product y se ajustaron imports en Disc y entidades de Community. La inspección de las diferencias con detección de renombres muestra cambios de imports/rutas y formato, no cambios de columnas, enums, relaciones o índices en metadata TypeORM. Para Catalog, `disc.entity.ts` cambia la ruta de `Asignation`, sin cambiar campos ni relaciones.
- No cambia `src/data-source.ts`, `scripts/db-migrations.js` ni `Procfile`. `be08be6` cambia scripts de copia de i18n; el cambio local de `package.json` solo agrega el comando de bootstrap de pruebas. No se observa un runner de migración nuevo ni automático.
- No aparece una dependencia de **nuevo esquema** fuera de Catalog atribuible a estos commits. El wiring de runtime sí conserva relaciones existentes con `users`, Community (rates/favorites/pendings/comments) y Editorial (Asignation), por lo que esas tablas y relaciones deben existir como parte del esquema vigente. Esto no acredita el estado de producción: no se accedió al ledger ni a la base real.

### Opciones de integración

| Opción | Incluye / ventajas | Riesgos y complejidad | Verificaciones requeridas |
| --- | --- | --- | --- |
| **A. Integrar la rama completa** | Los cinco commits y el layout coherente tal como está; conserva de una vez todos los imports, módulos, wiring y configuración que hacen funcionar Catalog. Complejidad de preparación baja. | Integra 289 rutas, incluidos cambios de Community, Editorial, Identity, Product, Integrations, Platform y documentación que no son requisitos de Catalog. `be08be6` mezcla movimientos con cambios funcionales; su revisión y regresiones amplían mucho el release. El estado local de Discs no forma parte de esos commits, pero altera las pruebas/ejecución local observadas. | Revisión funcional por dominios afectados; build/typecheck y suites focalizadas de cada dependencia; diff final limpio; comprobar el mismo hash que se publicaría y coordinar el contrato frontend/backend. |
| **B. Preparar una rama de publicación desde `main` con el cierre mínimo de Catalog** | Permite limitar el release a Catalog y sus dependencias imprescindibles, conservando fuera cambios de otros dominios cuando sea posible. | No equivale a cherry-pick aislado de los cuatro commits Catalog: requiere extraer/adaptar parte del commit transversal y quizá resolver rutas/imports del resto de módulos. El tamaño real del cierre no está determinado; puede acercarse a la reorganización completa. Riesgo de dejar un import roto o alterar el registro/relaciones por una selección incompleta. Complejidad alta. | Antes de implementarla, elaborar lista de dependencia archivo por archivo. Luego compilar/typecheck; inspeccionar grafo/imports y registro de AppModule; suites Catalog más tests de módulos consumidores; comparar contratos y metadata TypeORM con `main`; revisar diff de publicación y repetir regresión sobre ese hash. |
| **C. Dividir los cambios en commits independientes antes de integrar** | Puede ofrecer revisión y aceptación separadas de Catalog, dependencias transversales y cambios de otros dominios; hace explícito qué trabajo acompaña al release. | El transversal ya está en un commit grande con cientos de rutas y cambios funcionales. Partirlo después requiere reconstruir historia/selecciones y resolver dependencias; no garantiza que Editorial/Community/Identity puedan dividirse sin trabajo adicional. Complejidad muy alta y riesgo de conflictos o estados intermedios no compilables. | Diseñar orden de commits con dependencias, verificar cada estado intermedio que se pretenda integrar, ejecutar regresión amplia al final y revisar semántica de cambios más allá de rutas renombradas. |

**Recomendación:** preparar primero la opción **B** como ejercicio de alcance sobre una rama nueva basada en el `main` que se confirme al integrar. Resolver la clausura real de Auth, Platform/common, overview, entidad Disc/Asignation, AppModule y configuración antes de seleccionar commits; no cherry-pickear los cuatro commits Catalog solos. Si esa clausura incorpora la mayor parte del transversal o no puede probarse con claridad, detener la publicación Catalog-only y presentar la opción A como una integración de backend completa con revisión por dominios y aceptación explícita del alcance. No se ejecutó ninguna opción.

### Riesgos y bloqueos actuales

1. **Bloqueo de alcance:** el contenido necesario para Catalog depende del commit transversal, cuyo alcance incluye múltiples dominios. No está resuelto si se acepta completo o se puede cerrar un subconjunto seguro.
2. **Bloqueo de estado local:** hay cambios de producción unstaged en DTOs, transacción de escritura y Home de Discs. No pertenecen al conjunto de cinco commits, pero pueden afectar qué código se valida/publica; decidir si se excluyen o se incorporan y auditar ese conjunto exacto.
3. **Bloqueo de repetibilidad:** las suites PostgreSQL y el bootstrap local son opt-in; no se repitieron por las restricciones de esta tarea y el bootstrap derivado de metadata no acredita migraciones/esquema de producción.
4. **Bloqueo de integración:** aunque RELEASE-3 frontend se registra como completada, falta confirmar el par exacto de commits frontend/backend que se desplegaría y verificar el contrato de importación contra HTTP real para esos hashes.
5. **Bloqueo de producción:** el esquema/ledger productivo no se verificó. La ausencia de migraciones en el diff significa que no se detecta una migración nueva requerida por este cambio; no equivale a validar el destino productivo.

**Decisión:** **BLOCKED; no marcar READY.** Esta tarea actualiza la evidencia y recomienda una vía de preparación, pero no integra, divide ni adapta commits, no modifica código y no certifica el esquema productivo.

## BC-CAT-RELEASE-5 — Preparación y commits locales de Catalog

**Fecha:** 2026-10-15. **Rama:** `refactor/editorial`. Se conservaron los cinco commits preexistentes y la reorganización transversal. No se hizo push, merge, rebase, cherry-pick ni despliegue.

### Clasificación y alcance

- **Correcciones funcionales Catalog/Discs:** mapping de `artistId`/`genreId` en create, validación de fechas y flags en create/update, transacción en `createWithArtist`, eliminación del fanout en Home y orden de desempate estable. No se modificó código fuera de Catalog ni se reformatearon archivos adicionales.
- **Pruebas de regresión:** specs de DTO/controller/escritura y las dos suites PostgreSQL de Home ligadas a BC-DIS-2; nueva suite persistente Catalog que cubre escritura, rollback e importaciones parcial Manual/Excel.
- **Bootstrap PostgreSQL local:** comando opt-in en `package.json` y script que valida el contenedor, loopback, base, propietario, versión, esquema y ausencia del ledger antes de crear metadata de prueba. No es un runner de migraciones.
- **Documentación y evidencia:** actualización de BC-DIS-1–4 en `roadmap/backend-cleanup.md`, este registro y la captura `roadmap/catalog-regression-evidence/excel-selector-blocked.jpg`.
- **Exclusiones:** `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts` (Community, fuera del conjunto Catalog); no se incluyó en commits aunque se ejecutó para repetir el inventario PostgreSQL de RELEASE-4. `.env` y archivos temporales permanecieron fuera del staging; no se añadió ninguna credencial. `.impeccable/config.json` no se modificó. El `.aws` vacío citado en RELEASE-4 ya pertenecía a un commit anterior y no se volvió a incluir.
- No se encontraron otros cambios funcionales, secretos ni configuraciones locales entre los cambios seleccionados. El comando de `package.json` no requirió cambios de lockfile ni dependencias.

### Verificaciones de RELEASE-5

- `yarn --ignore-engines build`: aprobado.
- `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`: aprobado.
- Suites focalizadas de Discs (DTO, escritura, Home, controller y validación): **18 suites aprobadas, 118 tests aprobados**; 7 suites PostgreSQL opt-in quedaron omitidas en esta ejecución unitaria.
- Suites PostgreSQL contra el contenedor desechable local: **9/9 suites y 33/33 tests aprobados** (ocho suites opt-in D31–D37/Pending y la nueva integración persistente Catalog). La primera ejecución de las ocho suites opt-in no autenticó porque faltaba exportar `DB_PASSWORD`; se repitió con la credencial temporal explícita y pasó. La integración nueva pasó en ambas ejecuciones.
- Antes y después de la prueba de escritura, `db:bootstrap-catalog-test --verify-only` confirmó la base `riffvalley_catalog_test_20261015`, usuario/propietario `riffvalley_catalog_test`, PostgreSQL 17, binding `127.0.0.1:55432`, 30 tablas, 42 claves foráneas, metadata compatible con seis diferencias TypeORM ya verificadas como equivalentes y ausencia de `public.migrations`. Se creó un contenedor desechable nuevo porque el contenedor RELEASE-4 ya no existía. El PostgreSQL independiente de `127.0.0.1:5432` no se usó ni modificó.
- Después de las suites persistentes, las tablas Artist, Disc, Genre y Country quedaron con **0** filas de prueba con el prefijo `BC-CAT-REG-4`. No se ejecutaron migraciones, pruebas externas ni consultas a producción.
- `git diff --check`, `git diff --cached --check` y revisión explícita del contenido staged: aprobados.

### Archivos incluidos y commits

1. Correcciones funcionales y pruebas estrechamente ligadas a BC-DIS-1–4: `src/catalog/discs/__tests__/discs.controller.spec.ts`, `src/catalog/discs/__tests__/discs-validation.spec.ts`, `src/catalog/discs/dto/create-disc-with-artist.dto.spec.ts`, `src/catalog/discs/dto/create-disc-with-artist.dto.ts`, `src/catalog/discs/dto/create-discs.dto.spec.ts`, `src/catalog/discs/dto/create-discs.dto.ts`, `src/catalog/discs/dto/update-discs.dto.spec.ts`, `src/catalog/discs/home/__tests__/home-personal-state.postgres.spec.ts`, `src/catalog/discs/home/__tests__/home-ranking.postgres.spec.ts`, `src/catalog/discs/home/disc-home.service.ts`, `src/catalog/discs/write/disc-write.service.spec.ts` y `src/catalog/discs/write/disc-write.service.ts`.
   - Commit: `0b3ce8e fix(discs): validate writes and stabilize home ranking`.
2. Suite persistente PostgreSQL y bootstrap local: `package.json`, `scripts/bootstrap-catalog-test-schema.ts` y `src/catalog/discs/__tests__/catalog-postgres.integration.spec.ts`.
   - Commit: `b78e599 test(catalog): add disposable postgres regression harness`.
3. Roadmaps y evidencia indicados arriba se incluyen en el commit de documentación/evidencias que cierra RELEASE-5.

### Archivos locales todavía pendientes

- `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts` permanece modificado y sin commit por estar fuera del alcance de Catalog. No se descartó ni alteró durante la preparación.
- RELEASE-5 no observó otros cambios locales pendientes después de seleccionar sus archivos; no limpió archivos temporales ajenos ni configuraciones ignoradas.

### Estado respecto al merge

Los cambios de Catalog identificados quedaron confirmados en commits locales y sus verificaciones solicitadas pasaron. **No se realizó merge. El backend no queda certificado como listo para integrar en `main`**: siguen vigentes los bloqueos registrados en RELEASE-4 sobre aceptar/revisar el alcance transversal de cinco commits, verificar el contrato HTTP con los hashes frontend/backend que se integrarán y comprobar compatibilidad del esquema e historial de migraciones de producción. No se accedió a producción para esta preparación.

## BC-CAT-RELEASE-8 — Preflight de integración y despliegue

**Fecha:** 2026-10-15. **Resultado:** **BLOCKED**; no se hizo merge ni despliegue. Se conservaron los ocho commits candidatos y los cambios locales de Community.

### Git y alcance

- Backend en `refactor/editorial`, HEAD `f61b2c70a277b6f5d705728d2582b5ea4048c794`; `origin/main` actualizado en `2b203b8fcd5140cda663be4e4a5f687dd35c4269`. La rama candidata está 8 commits por delante y 0 por detrás.
- Commits candidatos, conservados sin reescritura: `be08be6` (reorganización BA-1–BA-13), `614fcab` (Artists), `e019e55` (Countries), `f7518cf` (Genres), `7a7760b` (Import/Last.fm y `data.results`), `0b3ce8e` (BC-DIS-1–4), `b78e599` (pruebas/bootstrap PostgreSQL) y `f61b2c7` (documentación/evidencia).
- Al iniciar el preflight, `git status` mostraba únicamente `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts` modificado y unstaged. Se preservó sin incluirlo. No había otros cambios staged ni sin seguimiento en el checkout backend. El `.aws` dentro del rango comprometido es un archivo de 0 bytes, no contiene credenciales; `.env` no se incluyó. `.impeccable/config.json` no se modificó.
- La reorganización transversal permanece como commit íntegro. Los cuatro commits BC-DIS corresponden a las correcciones y pruebas ya registradas en RELEASE-5; no se hallaron cambios locales adicionales en esos archivos.
- `git diff --check origin/main...HEAD` y `git diff --check` pasan. No se detectaron cambios de `src/migrations`, `src/data-source.ts`, `scripts/db-migrations.js` o `Procfile` en el candidato.

### Verificaciones del candidato

- `yarn --ignore-engines build`: aprobado.
- `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`: aprobado.
- Suites unitarias de Catalog: **57 suites aprobadas, 576 tests aprobados; 8 suites opt-in omitidas**. Sigue fallando la expectativa de `discId` en `src/catalog/discs/catalog/disc-catalog.service.spec.ts`; RELEASE-1 confirmó el mismo fallo en `main` antes de los cambios de Discs, por lo que es preexistente.
- Regresión backend (sin suites PostgreSQL ni migraciones): **125 suites aprobadas, 6 fallidas y 1 omitida; 1.147 tests aprobados, 12 fallidos y 4 omitidos**. Los fallos son la expectativa preexistente de `discId`, dos specs de `Versions` con dependencias Nest sin registrar y tres suites HTTP que chocan con `listen EPERM` al abrir `0.0.0.0`. No se corrigieron ni suprimieron.
- Las pruebas de imports/módulos de Catalog incluidas en la ejecución focalizada pasan. El build/typecheck validan resolución de imports y compilación, no sustituyen un smoke test HTTP.
- Suites PostgreSQL opt-in: **no ejecutadas en esta revisión**. Las variables para una base de prueba están unset y `127.0.0.1:55432` no responde; por tanto, no se preparó ni tocó ninguna base. RELEASE-5 conserva la evidencia previa 9/9 suites y 33/33 tests en PostgreSQL desechable.
- No se pudieron completar pruebas HTTP desde este entorno por el permiso de sockets. No hubo llamadas a proveedores externos.

### Esquema, ledger y Heroku

- La CLI autenticada identifica la app exacta `spammusic-back`. El release actual sigue siendo `v314` (`Deploy 2b203b8f`, 2026-10-14); PostgreSQL está disponible en la región EU, versión 16.14, con 34 tablas. No se cambió configuración ni estado de Heroku.
- La ejecución de solo lectura del release actual confirma `STAGE=prod`, `DB_NAME=ddddmrfqbqstju` y que `DATABASE` conecta a esa misma base. El ledger `migrations` existe. `yarn db:check` reporta **90 migraciones compiladas, 91 filas aplicadas y 0 pendientes**.
- Comparación de solo lectura de identidades: no hay duplicados; la única fila aplicada sin clase fuente actual es `UpdateListStatusEnum1766066905027`. Está documentada como discrepancia histórica de procedencia en `roadmap/roles-production-deployment.md`; no coincide con una migración pendiente ni es ejecutada por este candidato. No hay migraciones nuevas de Catalog ni pendientes que justifiquen ejecutar migraciones.
- Esta comprobación acredita destino y ledger, pero no constituye una comparación completa de cada columna, enum y relación de las entidades del commit transversal contra PostgreSQL. La compatibilidad estructural completa del candidato no queda demostrada, así que se mantiene como preflight pendiente.
- El backup `b008` figura como Completed el 2026-10-13 22:06 UTC. No se creó otro backup. El procedimiento documentado separa rollback de release de restauración de PostgreSQL; cualquier restauración requiere evaluación, no sería automática.
- No se publicó nada; no se ejecutaron smoke tests de API ni importaciones en producción. Release y hash productivos siguen siendo `v314` / `2b203b8f`.

### Frontend y ventana de publicación

- En el checkout frontend, `origin/main` actualizado es `4e136c1369743892d60fa482aa0c75be757e900a` (merge PR #185), que ya contiene la rama de integración observada en `95baad07647c1fbb5854bdc189eac6650a299af5`. La rama frontend solicitada ya no está pendiente de merge en Git; su estado de despliegue automático no se verificó.
- `yarn build` del frontend terminó correctamente, con advertencias previas de Browserslist, CSS y tamaño de chunks. `yarn test --run` no llegó a ejecutar las pruebas: Vite no pudo crear su archivo temporal `vite.config.ts.timestamp-…` porque el checkout frontend es de solo lectura. No se alteraron `.impeccable/config.json` ni `.aws` locales.
- No se puede confirmar desde esta tarea que las importaciones Manual/Excel estén detenidas durante una ventana coordinada, ni comprobar el despliegue real del frontend. Dado que frontend `main` ya incluye el contrato `data.results` y el backend productivo continúa en `2b203b8f`, confirmar estado operativo y coordinar la transición es obligatorio antes de publicar backend.

### Decisión y pendientes

**No merge, no deploy.** No se confirma compatibilidad estructural completa de PostgreSQL con el árbol transversal, no se pudo repetir la regresión PostgreSQL opt-in, la regresión completa conserva fallos conocidos y no se verificó el estado publicado del frontend ni una ventana sin importaciones. El backend no queda certificado como listo para integrar en `main` o desplegar.

- Hash de `main` backend: sin cambios, `2b203b8fcd5140cda663be4e4a5f687dd35c4269`.
- Commits integrados y release Heroku nuevo: ninguno.
- Archivos locales pendientes: `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts`, intacto y fuera del alcance, y esta actualización del roadmap RELEASE-8, que queda unstaged porque no se integró el candidato.
- Smoke tests: no ejecutados porque no hubo despliegue.
- Para reanudar: comparar las entidades del candidato con el esquema productivo mediante lectura completa, repetir suites PostgreSQL sobre base desechable verificada, comprobar el estado real del frontend publicado, y acordar/desactivar importaciones durante la ventana coordinada. Después repetir el preflight sobre los hashes exactos antes del merge y deploy.

## BC-CAT-RELEASE-10 — Verificación para merge en main y deploy automático

**Fecha:** 2026-10-15. **Resultado:** **BLOCKED antes del merge**. No se hizo merge, push ni deploy; no se ejecutaron migraciones ni smoke tests posteriores a deploy.

### Git y candidato

- Rama actual: `refactor/editorial`, HEAD `f61b2c70a277b6f5d705728d2582b5ea4048c794`. Tras actualizar `origin`, `origin/main` sigue en `2b203b8fcd5140cda663be4e4a5f687dd35c4269`; el candidato está 8 commits por delante y 0 por detrás.
- Se conservan los ocho commits existentes: `be08be6`, `614fcab`, `e019e55`, `f7518cf`, `7a7760b`, `0b3ce8e`, `b78e599` y `f61b2c7`. No se reescribió ni separó la reorganización transversal.
- El árbol tiene solo dos cambios locales: este roadmap y `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts`. El spec de Community se conserva fuera de la integración; no hay cambios locales de aplicación sin commit. `.impeccable/config.json` no se modificó.
- El diff `main...refactor/editorial` no contiene cambios en `src/migrations`; el `Procfile`, el datasource y `migrationsRun: false` tampoco cambian. No hay una migración nueva de Catalog.

### Base de producción

- `heroku run --app spammusic-back --no-tty --exit-code -- yarn db:check`: aprobado. Ledger `migrations`; 90 migraciones compiladas, 91 aplicadas y **0 pendientes**.
- Se consultó `DATABASE` dentro de `BEGIN READ ONLY`/`ROLLBACK`. Las tablas consultadas de Catalog están presentes y las 18 FK examinadas apuntan a las tablas/columnas existentes. UUID, fechas, booleanos, textos y campos numéricos usados por Artist, Country, Genre, Disc, Rate, Favorite, Pending y las relaciones incluidas en las consultas de Catalog tienen tipos PostgreSQL compatibles. El `name` de Country acepta como máximo 50 caracteres en el DTO, por debajo de `varchar(100)` productivo; el DTO no escribe `isoCode`, cuya columna existente es `varchar(5)`. No se hizo una auditoría del resto del esquema ni se consultaron datos de negocio.
- No se ejecutó ningún runner de migración ni se modificó esquema o datos.

### Protección de importaciones

- El código frontend revisado no incluye un interruptor temporal de importación: las rutas Manual y Excel dependen de los permisos existentes (`superadmin`/`riffvalley`). No se cambiaron roles ni permisos.
- La protección operativa disponible es activar maintenance en `spammusic-back`, escalar `web` a cero y esperar a que no queden dynos ni escrituras activas antes de iniciar el merge; mantener ambos controles hasta que el release nuevo esté validado. En esta comprobación el estado observado era `maintenance=off`, `web=1` (`web.1` arriba). No se cambió porque el preflight quedó bloqueado antes de abrir una ventana.
- La ruta Manual frontend espera `data.results`; el backend candidato entrega el resultado Manual dentro de `data` y su resultado incluye `results`. El servicio Excel del frontend espera `data.results` y el controlador candidato devuelve el resultado de importación, que incluye `results`. El par de fuentes apunta al mismo contrato; la comprobación del frontend publicado y el smoke HTTP real siguen siendo necesarios para autorizar la reapertura.

### Frontend y Automatic Deploys

- El checkout local del frontend conserva el cambio de `.impeccable/config.json` y `.aws`; no se modificó ninguno. La rama frontend y su código local no acreditan qué versión sirve Netlify ahora.
- La URL pública identificada en el frontend (`https://app.riffvalley.es`) respondió HTTP 403 desde esta sesión, por lo que no se pudo inspeccionar el bundle publicado ni acreditar que el frontend nuevo esté activo.
- `heroku apps:info` identifica `spammusic-back`, pero no informa del toggle de Automatic Deploys ni de la rama conectada. El navegador integrado no está disponible. La consulta de webhooks de GitHub fue rechazada porque la sesión carece del scope `admin:repo_hook`; no se amplió ningún permiso. Por tanto, **no se ha demostrado que Automatic Deploys esté activo para `main`**.
- La secuencia candidata podría mantener las importaciones bloqueadas durante el corte con maintenance y `web=0`, pero no compensa la falta de evidencia de que el frontend publicado use el contrato nuevo después de reabrir el backend.

### Decisión

**No merge, no push, no deploy.** Bloquean la integración dos comprobaciones requeridas que no pudieron acreditarse: el commit/contrato frontend realmente publicado y la configuración efectiva de Automatic Deploys de Heroku para `main`. El esquema consultado y el ledger no muestran bloqueos; no se cambió producción.

- `main` confirmado local/remoto: `2b203b8fcd5140cda663be4e4a5f687dd35c4269`.
- Release Heroku sin cambio: `v314`, `Deploy 2b203b8f`.
- Smoke tests post-deploy: no ejecutados porque no hubo deploy.
- Para reanudar: verificar en Netlify/panel o con acceso de solo lectura al deploy que el frontend publicado consume `data.results`; verificar en el panel de Heroku que Automatic Deploys está conectado a `main`. Después repetir el preflight inmediatamente, activar maintenance y `web=0`, integrar y publicar sin force-push, comprobar el release y completar los smoke tests antes de reabrir tráfico.
