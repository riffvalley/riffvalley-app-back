# BC-COMM — Auditoría inicial de Community

**Estado:** auditoría completada por BC-COMM-0 (2026-10-21); BC-COMM-1–5 completadas el 2026-10-21; BC-COMM-6–9 pendientes.
**Base observada:** rama `refactor/community`, checkout limpio al inicio. La migración estructural y el saneamiento G.1–G.7 constan como cerrados en el roadmap funcional de Community (2026-10-05). Esta auditoría registra el árbol y los Quality Gates actuales; no reabre ni altera aquel historial.

## Inventario de capacidades

Community tiene cinco módulos NestJS reales, compuestos directamente en `AppModule`. No hay `CommunityModule` agregador ni dependencia funcional que lo requiera. Cada módulo declara su controller y providers, importa `AuthModule` y registra sus entidades con `TypeOrmModule`; Requests también registra repositorios de entidades de Catalog.

| Módulo | Controller / rutas aproximadas | Providers | Entidad y DTOs | Función actual |
| --- | --- | --- | --- | --- |
| Comments | `CommentsController`, 6 rutas en `/api/comments` | `CommentsService` | `Comment`; create, update y response | Crear, consultar, editar y borrar comentarios y replies; listado personal filtrado y lectura pública por disco. |
| Favorites | `FavoritesController`, 4 rutas en `/api/favorites` | `FavoritesService` | `Favorite`; create | Añadir/quitar favoritos y consultar el listado personal enriquecido con estado y agregados de Catalog. |
| Pendings | `PendingsController`, 4 rutas en `/api/pendings` | `PendingsService` | `Pending`; create | Añadir/quitar discos pendientes y consultar el listado personal con estado y agregados de Catalog. |
| Rates | `RatesController`, 8 rutas en `/api/rates` | `RatesService`, `RatesStatsService`, `RatesHistoryService` | `Rate`; create y update | Crear/actualizar puntuaciones, listar rates personales, ofrecer estadísticas e historial, y exponer lecturas públicas por disco e historial de usuario. |
| Requests | `RequestsController`, 7 rutas en `/api/requests` | `RequestsService` | `DiscRequest`; create y update | Recibir peticiones de discos; listar las propias, gestionar/admin, aprobar, rechazar y reabrir. La aprobación crea/encuentra Artist y crea Disc en Catalog. |

Los controladores definen 29 handlers HTTP en total. Las rutas personales y mutaciones de Comments, Favorites, Pendings y Rates usan `@Auth()`; los accesos por ID de recursos personales comprueban ownership en sus servicios. Requests exige autenticación para crear/ver las propias y `ValidRoles.riffvalley` para administración. Las lecturas de comentarios por disco, rates por disco e historial de rates por `userId` permanecen públicas, como describe el inventario funcional anterior.

### Entidades, contratos y relaciones

- `Comment` relaciona User y Disc, y consigo misma mediante `parent`/`replies`. Al borrar un comentario con replies se conserva una marca lógica y se sustituye el texto; sin replies se borra físicamente. La lectura por disco devuelve una proyección reducida de usuario/disco e identifica comentarios eliminados.
- `Favorite`, `Pending` y `Rate` relacionan User y Disc. Las entidades tienen relaciones eager hacia User; Rate también declara eager hacia Disc. `Disc` conserva las relaciones inversas y algunos consumidores de Catalog solicitan/proyectan estas colecciones y sus IDs.
- `DiscRequest` relaciona User, Genre y Country con carga eager. `RequestsService` usa directamente repositorios de Artist, Disc, Genre y Country de Catalog.
- `User` mantiene las relaciones inversas de las cinco entidades Community. Catalog consulta rates, comments, favorites y pendings mediante joins, subconsultas, relaciones y SQL; Auth usa Rate para actividad y registra su entidad en sus módulos. `AppModule` importa los cinco módulos directamente. No se encontró un efecto externo SMTP, Spotify u otra integración desde Community.
- El prefijo global `/api` y el `ValidationPipe` con `whitelist`, `forbidNonWhitelisted` y `transform` están documentados en `AGENTS.md`/`src/main.ts`.

`docs/architecture/community-inventory.md` registra consumidores frontend conocidos como `ComentsModal.vue`, `DiscList.vue`, `Dashboard`, `UserModal`, `ArtistManagement`, `SuggestPage.vue` y `PetitionsPage.vue`. El frontend no está presente en este checkout, así que esos consumidores y sus payloads se consideran referencias documentales históricas, no verificación del código frontend actual.

## Quality Gates observados

Se ejecutaron los scripts actuales contra el checkout. Los baselines de ESLint y tipado son temporales y se respetaron sin modificaciones.

| Gate | Deuda atribuible a `src/community/` | Resultado global real |
| --- | --- | --- |
| Estructura | **18 entradas**: 8 `module-root-file` y 10 `spec-outside-tests`, correspondientes a 10 specs. Archivos: `comments/comments.controller.spec.ts`, `comments/comments.service.spec.ts`, `favorites/favorites.controller.spec.ts`, `favorites/favorites.service.spec.ts`, `pendings/pendings.controller.spec.ts`, `pendings/pendings.service.spec.ts`, `rates/rates.service.spec.ts`, `rates/history/rates-history.service.spec.ts`, `rates/stats/rates-stats.service.spec.ts` y `requests/requests.service.spec.ts`. Los specs ya ubicados dentro de `__tests__/` no infringen estructura. | `node scripts/structural-quality-gate.js`: 40 módulos, 95 infracciones históricas, 0 nuevas y 0 obsoletas. |
| Tipado seguro | **127 entradas**: 118 `explicit-any` y 9 `double-type-assertion`; 0 supresiones. Once `any` están en producción y 107 en specs. Archivos y ocurrencias: `comments/comments.service.ts` 2, `comments/comments.service.spec.ts` 16, `comments/__tests__/comments.module.spec.ts` 1; `favorites/favorites.service.ts` 1, `favorites/favorites.service.spec.ts` 6, `favorites/__tests__/favorites.module.spec.ts` 1; `pendings/pendings.service.ts` 1, `pendings/pendings.service.spec.ts` 8, `pendings/__tests__/pendings.module.spec.ts` 6, `pendings/__tests__/pending-user-relation.postgres.spec.ts` 1; `rates/rates.controller.ts` 2, `rates/rates.service.ts` 1, `rates/rates.service.spec.ts` 32, `rates/__tests__/rates.controller.spec.ts` 4, `rates/__tests__/rates.module.spec.ts` 7, `rates/history/rates-history.service.ts` 4, `rates/history/rates-history.service.spec.ts` 5, `rates/stats/rates-stats.service.spec.ts` 3; `requests/requests.service.spec.ts` 25 y `requests/__tests__/requests.module.spec.ts` 1. Los 9 dobles casts están en specs; el spec PostgreSQL tiene 1 `any`. | `node scripts/type-safety-quality-gate.js`: 224 infracciones históricas, 0 nuevas, 0 obsoletas y 0 duplicadas. |
| ESLint | **535 diagnósticos en 28 archivos**. Desglose exacto por regla y archivo: ver tablas siguientes. | `node scripts/eslint-quality-gate.js`: 1.439 diagnósticos, 0 nuevos, 0 obsoletos y 0 duplicados. |
| Typecheck | **0 errores atribuibles a Community**. | `node scripts/typecheck-quality-gate.js`: `tsconfig.json`, 0 errores nuevos, obsoletos o baseline. |

### Desglose ESLint de Community

El comando se ejecuta con `fix: false` y `cache: false`. No se usó `yarn lint`, que aplica autocorrección.

| Regla | Archivo | Diagnósticos |
| --- | --- | ---: |
| `prettier/prettier` | `comments/comments.service.spec.ts` | 49 |
| `prettier/prettier` | `comments/comments.service.ts` | 1 |
| `prettier/prettier` | `comments/entities/comment.entity.ts` | 2 |
| `prettier/prettier` | `favorites/entities/favorite.entity.ts` | 1 |
| `prettier/prettier` | `favorites/favorites.service.spec.ts` | 35 |
| `prettier/prettier` | `favorites/favorites.service.ts` | 10 |
| `prettier/prettier` | `pendings/entities/pending.entity.ts` | 2 |
| `prettier/prettier` | `pendings/pendings.controller.ts` | 2 |
| `prettier/prettier` | `pendings/pendings.service.spec.ts` | 61 |
| `prettier/prettier` | `pendings/pendings.service.ts` | 8 |
| `prettier/prettier` | `rates/__tests__/rates.module.spec.ts` | 17 |
| `prettier/prettier` | `rates/entities/rate.entity.ts` | 2 |
| `prettier/prettier` | `rates/history/rates-history.service.spec.ts` | 23 |
| `prettier/prettier` | `rates/rates.controller.ts` | 1 |
| `prettier/prettier` | `rates/rates.module.ts` | 1 |
| `prettier/prettier` | `rates/rates.service.spec.ts` | 70 |
| `prettier/prettier` | `rates/rates.service.ts` | 8 |
| `prettier/prettier` | `rates/stats/rates-stats.service.spec.ts` | 6 |
| `prettier/prettier` | `rates/stats/rates-stats.service.ts` | 214 |
| `prettier/prettier` | `requests/__tests__/requests.module.spec.ts` | 1 |
| `@typescript-eslint/ban-types` | `comments/__tests__/comments.module.spec.ts`; `comments/comments.controller.spec.ts`; `favorites/favorites.controller.spec.ts`; `favorites/favorites.service.spec.ts`; `pendings/__tests__/pendings.module.spec.ts`; `pendings/pendings.controller.spec.ts`; `rates/__tests__/rates.controller.spec.ts`; `rates/__tests__/rates.module.spec.ts` | 1 cada uno |
| `@typescript-eslint/ban-types` | `requests/__tests__/requests.module.spec.ts` | 2 |
| `@typescript-eslint/no-unused-vars` | `favorites/favorites.controller.ts`; `pendings/entities/pending.entity.ts`; `pendings/pendings.controller.ts` | 1 cada uno |
| `@typescript-eslint/no-unused-vars` | `rates/stats/rates-stats.service.ts` | 2 |
| `@typescript-eslint/no-var-requires` | `pendings/__tests__/pending-user-relation.postgres.spec.ts` | 1 |
| `@typescript-eslint/no-var-requires` | `requests/__tests__/requests.module.spec.ts` | 5 |

El desglose suma 514 Prettier, 10 `ban-types`, 5 `no-unused-vars` y 6 `no-var-requires`. La infracción de tipado y los diagnósticos ESLint del spec de PostgreSQL son deuda del test; no atribuyen deuda a PostgreSQL ni justifican ejecutarlo.

## Pruebas y dependencias externas

Community contiene 17 archivos spec: 16 unitarios/de wiring y `pendings/__tests__/pending-user-relation.postgres.spec.ts`. También existen specs de consumers y metadata en Catalog/Auth; el checkout cuenta además con suites de integración PostgreSQL en otros dominios que no se consideraron focalizadas.

Se ejecutó `yarn --ignore-engines test --runInBand src/community`: **16 suites aprobadas, 83 tests aprobados; 1 suite y 2 tests omitidos**. La suite de relación Pending/User solo se activa con `D33_POSTGRES_TEST=1`; no se definió esa variable ni se accedió a PostgreSQL. Los specs unitarios usan repositorios falsos; algunos construyen metadata TypeORM sin inicializar una conexión. Community no tiene una dependencia externa de ejecución que fuera necesaria para esta regresión focalizada.

## Riesgos funcionales y contractuales

Estos hallazgos se separan de los Quality Gates y no cambian el conteo de deuda. BC-COMM-5 caracterizó los contratos en código y revisó el checkout frontend actual, sin modificar producción ni respuestas.

### Contract finding

#### COMM-R1 — Lectura pública de Rates devuelve relación User amplia

**Current behavior:** `GET /api/rates/disc/:discId` es público y devuelve filas `Rate` con `id`, `rate`, `cover`, `createdAt`, `editedAt`, `user` y la relación eager `disc`. La consulta carga explícitamente `user`. La metadata de TypeORM deja seleccionables `User.id`, `username`, `isActive`, `image`, `dashboardConfig`, `mobileDashboardConfig`, `dashboardButtonsEnabled`, `createdAt`, `notes` y `lastLogin`; `email`, `password` y `role` tienen `select: false`. No se levantó PostgreSQL, por lo que la lista de columnas de la consulta y su JSON exacto se confirma mediante metadata y opciones de repositorio, no con una respuesta HTTP de una base real.

**Problem:** el contrato carga User completo según columnas seleccionables, con configuración del dashboard, notas, fecha de actividad y datos de perfil junto a las puntuaciones.

**Impact:** backend + frontend. El checkout frontend está disponible: `ArtistManagement.vue` usa `getDiscRates` para localizar el rate propio y requiere `user.id`; `DiscCardComponent.vue` solicita el mismo endpoint al abrir votos y `VotesModal.vue` usa `user.id`, `username` e imagen. La interfaz TS `DiscRate.User` declara además email/roles, pero esos campos no son consumidos por estos dos flujos. La necesidad real confirmada es `id`, `username` e `image` para el listado general de votos, y solo `id` en ArtistManagement.

**Options:** preservar compatibilidad y confirmar el payload del consumer; refactorizar internamente con una proyección de usuario mínima compatible; cambiar los campos públicos tras coordinación frontend.

**Recommendation:** COMM-5 confirma consumers actuales y campos usados. BC-COMM-7 puede acotar la proyección preservando `id`, `username`, `image` (incluyendo compatibilidad con los tipos TS frontend si siguen siendo parte del contrato), y `Rate`/`Disc` existentes. Antes del cambio, decidir expresamente si otros consumidores externos dependen de la relación amplia; no se inspeccionaron clientes externos.

**Blocks the current task:** No; se registra para planificación separada.

### COMM-R2 — Entrada del historial público de Rates sin validación de rango

**Current behavior:** `GET /api/rates/user/:userId/history` es público (sin `@Auth()`). Defaults: `type=both`, `order=DESC`, `limit=20`, `offset=0`; admite conceptualmente `type=rate|cover|both` y `order=ASC|DESC`. El controller usa `parseInt(value, 10)`, crea `Date` sin validar y aplica filtro de rango solo cuando llegan `from` y `to` juntos. Frontend `UserModal.vue` llama el endpoint público con `type=both`, `order=DESC`, limit 20 y offset 0; pagina con offset/limit. El servicio `rates.ts` también expone los seis parámetros, fechas opcionales en pareja.

**Problem:** la frontera no valida conjunto, rango ni formato: `parseInt('12items', 10)` resulta 12, valores negativos pasan, valores no numéricos se convierten en `NaN`, tipos inesperados se devuelven en `type` y usan el predicado de `both`, y `order` inesperado se delega al QueryBuilder. Si ambas fechas son inválidas, se delegan como `Invalid Date`; no se caracterizó el error del driver/HTTP porque no se usó PostgreSQL. Una sola fecha se ignora. El servicio filtra eventos por `createdAt`/`editedAt` inclusivamente y compone la paginación por evento.

**Impact:** backend; la lectura es pública y el inventario anterior la relaciona con Dashboard/UserModal.

**Options:** conservar defaults y rangos válidos mientras se añade validación; cambiar límites o acceso exige coordinar el contrato público y el consumer.

**Recommendation:** BC-COMM-6 debe definir límites para `limit`/`offset`, comportamiento para rangos parciales y errores 400 para tipo, orden, fechas y números inválidos. Preservar defaults y acceso público mientras no haya decisión explícita de producto; `UserModal` depende actualmente de esa lectura sin autenticación.

**Blocks the current task:** No.

### COMM-R3 — `releaseDate` de Requests no valida fecha

**Current behavior:** `releaseDate` solo lleva `@IsOptional()`: con el ValidationPipe global y conversión implícita, fechas ISO `YYYY-MM-DD` y timestamp ISO se transforman a `Date`; una cadena inválida también supera la validación como `Invalid Date`; el campo ausente o `null` se acepta. La entidad `DiscRequest.releaseDate` es `date nullable` y al aprobar se copia a Disc. `genreId` y `countryId` aceptan ausencia o `null`; si se aportan deben ser UUID v4. El servicio no consulta Genre/Country antes de asignar `{id}` y guardar. Errores de persistencia por referencias inexistentes no se simularon con base real.

**Problem:** fechas inválidas pasan la frontera y pueden fallar al guardar o aprobar. IDs sintácticamente válidos pero inexistentes también llegan a persistencia y dependen de la FK/driver.

**Impact:** backend + frontend. `importPage/SuggestPage.vue` exige fecha desde 2025, envía date-only y omite IDs vacíos. `PetitionsPage.vue` administra las solicitudes con inputs date y selects; al borrar género/país manda `null`, y al vaciar fecha puede mandar `''`. El endpoint actual acepta `null` para IDs; una validación futura debe conservar esa forma de limpiar referencias. La fecha vacía de administración requiere decisión: mantener el clear como ausencia/null, o adaptar el cliente antes de exigir un formato.

**Options:** conservar valores válidos y añadir validación de fecha/relaciones con errores HTTP caracterizados; cambiar formato o semántica requiere coordinación frontend.

**Recommendation:** BC-COMM-6 puede exigir date-only/ISO compatible con el formulario de creación y validar existencia de referencias con 404, conservando fecha opcional a nivel API, `null` para limpiar IDs y el envío date-only del cliente. Antes de validar fecha en administración, normalizar o decidir el significado de `''`; las restricciones de año mínimo (2025) son solo frontend hoy y no deben asumirse como regla API sin decisión funcional.

**Blocks the current task:** No.

### COMM-R4 — Aprobación de Request escribe Artist, Disc y estado en pasos separados

**Current behavior:** `RequestsService.approve` busca/crea Artist, guarda Disc y luego guarda Request como approved con tres operaciones de repositorio sin transacción visible.

**Problem:** si falla una escritura posterior puede quedar un Artist/Disc persistido y Request pendiente; una repetición puede encontrar al Artist y crear otro Disc. La posibilidad de ese estado parcial o de carreras es inferencia a partir del orden de escrituras; no se reprodujo en base real.

**Impact:** backend, con efecto en Catalog y en la gestión frontend de peticiones.

**Options:** conservar el flujo; caracterizar fallos; hacer atómicas las escrituras con un manager común; decidir aparte cualquier deduplicación funcional de Disc.

**Recommendation:** una prueba unitaria de rollback/fallo caracteriza la necesidad; si confirma el riesgo, usar transacción acotada para Artist/Disc/Request sin alterar la regla de búsqueda ni el payload.

**Blocks the current task:** No.

### Hallazgos preservados y verificados

- La autorización y ownership de rutas personales ya están implementados y caracterizados en los controllers/services actuales. No se propone reabrir el hallazgo de autorización del roadmap funcional cerrado.
- `Pending.user` apunta ahora a `User.pending`; las pruebas de metadata actuales comprueban que son lados inversos. El spec PostgreSQL que además caracteriza persistencia sigue opcional.
- Los servicios Comments, Favorites, Pendings y Rates conservan `HttpException` en sus catches, por lo que los 404 explícitos de Disc/parent no se convierten en 500 en el código actual. Las descripciones antiguas de `docs/architecture/community-inventory.md` sobre ese catch están desactualizadas.
- `Comment.createdAt` es opcional en el DTO de creación y se copia al entity; el cliente puede suministrar fecha. Se registra como semántica observable, sin evidencia de que sea un bug.
- **Semántica caracterizada de `commentCount`:** Favorites, Pendings y Rates ejecutan `COUNT(comment.id)` con `comment.discId = disc.id`; no filtran `isDeleted` ni `parent`, así que cuentan tombstones y replies además de comentarios visibles de primer nivel. Las pruebas de servicio fijan el predicado actual. En el frontend actual, `DiscList.vue` y `HomePage.vue`/`DashboardPage.vue` pasan el contador a `DiscCardComponent.vue`, que muestra el número junto al acceso a comentarios. Decisión funcional pendiente y separada: definir si el badge representa todas las filas históricas o solo comentarios visibles; cambiarlo puede alterar la cifra que ven los usuarios y debe coordinarse con el producto.
- Las relaciones eager y las colecciones/valores `null`, `0`, IDs personales y agregados de Disc son contratos de salida documentados y fijados parcialmente por pruebas de Community/Catalog. No retirarlos ni normalizarlos como parte del saneamiento de calidad.

## Roadmap de cortes propuesto

Los cortes no autorizan ejecución. Cada uno debe mantener rutas, permisos, respuestas, relaciones y errores salvo que una decisión funcional aparte lo apruebe. Tamaños estimados para implementación posterior.

1. **[x] BC-COMM-1 — Reubicar los specs fuera de las raíces de módulo (S).** **Alcance:** mover los 10 specs enumerados en Estructura a `__tests__/` dentro de su módulo/responsabilidad, ajustando imports. No modificar código productivo ni expectativas. **Dependencias:** ninguna. **Verificaciones:** completadas; evidencia registrada abajo. No activar el spec PostgreSQL.
2. **[x] BC-COMM-2 — Tipar mocks y fixtures de Community (M; completado 2026-10-21).** Completados sus cinco cortes sin cambios productivos. En conjunto se retiraron 116 hallazgos de tipado de tests respecto al baseline inicial de 224; quedan 108 entradas globales, correspondientes a hallazgos fuera de los specs de Community. **Evidencia global:** `yarn quality:types` (108 hallazgos, 0 nuevos, 0 obsoletos y 0 duplicados); `yarn quality:typecheck` (0 errores); `git diff --check`. No quedan hallazgos de tipado en specs Community; se conservan los 11 `any` productivos fuera de estos cortes. La suite PostgreSQL de Pendings permaneció omitida.
   - **[x] BC-COMM-2A — Comments (completado 2026-10-21).** Tipados los mocks y fixtures de los tres specs de Comments; no había dobles casts. Se retiraron 17 hallazgos `explicit-any` de tests. **Evidencia:** `yarn --ignore-engines test --runInBand src/community/comments` (3 suites, 21 tests aprobados); `yarn quality:typecheck` (0 errores); `yarn quality:types` (207 hallazgos, 0 nuevos, 0 obsoletos, 0 duplicados); `git diff --check`. El baseline de tipado pasó de 224 a 207 entradas: 17 resueltas en Comments; 79 hallazgos existentes de otros specs Community conservaron sus fingerprints al actualizar sus rutas definitivas tras BC-COMM-1.
   - **[x] BC-COMM-2B — Favorites (completado 2026-10-21).** Tipados los mocks y fixtures de los specs de servicio y módulo; se retiraron 7 hallazgos `explicit-any`. **Evidencia:** `yarn --ignore-engines test --runInBand src/community/favorites` (3 suites, 12 tests aprobados); `yarn quality:typecheck` (0 errores); `yarn quality:types` (200 hallazgos, 0 nuevos, 0 obsoletos, 0 duplicados); `git diff --check`. El baseline pasó de 207 a 200 entradas; se conservó el hallazgo de `explicit-any` del servicio productivo fuera del alcance.
   - **[x] BC-COMM-2C — Pendings (completado 2026-10-21).** Tipados los mocks y fixtures de servicio, módulo y spec PostgreSQL; eliminados los 15 hallazgos de los tests (8 del spec de servicio, incluidos 6 dobles casts; 6 del módulo y 1 del spec PostgreSQL), sin cambios productivos ni de escenarios. **Evidencia:** `yarn test:unit --runInBand src/community/pendings` (3 suites activas, 16 tests aprobados; suite PostgreSQL omitida, 2 tests omitidos por su guardia); `yarn quality:typecheck` (0 errores); `yarn quality:types` (185 hallazgos, 0 nuevos, 0 obsoletos y 0 duplicados); `git diff --check`. El baseline de tipado pasó de 200 a 185 entradas; se conservó el hallazgo productivo preexistente de `pendings.service.ts`.
   - **[x] BC-COMM-2D — Rates (completado 2026-10-21).** Tipados los mocks y fixtures de los cinco specs: service (32 hallazgos), controller (4), module (7), history (5) y stats (3). Se conservaron escenarios, expectativas y errores simulados; sin cambios productivos. **Evidencia:** `yarn test:unit --runInBand src/community/rates` (5 suites, 24 tests aprobados); `yarn quality:typecheck` (0 errores); `yarn quality:types` (134 hallazgos, 0 nuevos, 0 obsoletos y 0 duplicados); `git diff --check`. El baseline pasó de 185 a 134 entradas: 51 resueltas en Rates.
   - **[x] BC-COMM-2E — Requests (completado 2026-10-21).** Tipados los mocks y fixtures de los specs de servicio y módulo, conservando los valores, retornos, orden de llamadas y expectativas. Se retiraron 26 hallazgos: 25 del spec de servicio y 1 del módulo; sin cambios productivos. **Evidencia:** `yarn test:unit --runInBand src/community/requests` (2 suites, 10 tests aprobados); `yarn quality:typecheck` (0 errores); `yarn quality:types` (108 hallazgos, 0 nuevos, 0 obsoletos y 0 duplicados); `git diff --check`. El baseline pasó de 134 a 108 entradas. No se ejecutaron PostgreSQL ni servicios externos.
3. **[x] BC-COMM-3 — Tipar producción y entradas de Rates (M; completado 2026-10-21).** Retirados los 11 `any` explícitos productivos: 2 Comments, 1 Favorites, 1 Pendings, 2 RatesController, 1 RatesService y 4 RatesHistoryService. Conservados rutas, decorators, DTOs, consultas, defaults, payloads y semánticas de excepciones; el historial usa los tipos de dominio para `order` y la relación `disc`, manteniendo el fallback tipado a `discId` si está disponible. Sin validaciones HTTP nuevas. **Evidencia:** suites focalizadas con `yarn --ignore-engines test:unit --runInBand src/community/comments src/community/favorites src/community/pendings src/community/rates` (14 suites aprobadas, 73 tests aprobados; 1 suite PostgreSQL y 2 tests omitidos por su guardia); `yarn quality:typecheck` (0 errores); `yarn quality:types` (97 entradas, 0 nuevas, 0 obsoletas y 0 duplicadas); `yarn --ignore-engines build`; `git diff --check`. El baseline pasó de 108 a 97 entradas, retiradas exclusivamente las 11 productivas enumeradas. No se ejecutaron PostgreSQL ni servicios externos.
4. **[x] BC-COMM-4 — Cerrar ESLint de Community (M; completado 2026-10-21).** Retirados los 535 diagnósticos del baseline histórico: 514 `prettier/prettier`, 10 `ban-types`, 5 `no-unused-vars` y 6 `no-var-requires`. En la comprobación inicial de este checkout había 694 diagnósticos actuales de Community: 673 Prettier y los mismos 21 de las otras reglas; los 159 avisos adicionales de formato estaban en archivos Community que ya tenían cambios locales de BC-COMM-1–3. Se formatearon únicamente archivos Community diagnosticados y se corrigieron exclusivamente los hallazgos de esas reglas, preservando comportamiento. El baseline ESLint pasó de 1.439 a 904 entradas al retirar únicamente las 535 entradas históricas de `src/community/`.
5. **[x] BC-COMM-5 — Caracterizar contratos públicos y entrada de Requests (S; completada 2026-10-21).** **Alcance:** fijar payload/consumo de `GET /rates/disc/:discId`, entrada del historial público, fechas/relaciones de Request y semántica de `commentCount`; sin cambios productivos, rutas ni JSON. **Evidencia:** checkout frontend inspeccionado; se añadieron pruebas de metadata/consulta Rates, defaults y parseo permisivo del historial, DTO/transformación de Requests y predicado de los tres contadores. Las limitaciones de no usar PostgreSQL ni confirmar consumidores externos quedan documentadas en COMM-R1–R3.
6. **[ ] BC-COMM-6 — Validar entradas de historial y Requests (M).** **Alcance:** tras COMM-5, validar `type`, `order`, `limit`, `offset`, `from`/`to` del historial y el formato de `releaseDate`/referencias Catalog de Requests; mantener defaults y respuestas válidas actuales, y definir errores 400/404 con pruebas. No cambiar acceso público, shape de respuesta ni formato frontend sin coordinación. **Decisiones necesarias:** fijar límites de paginación y política de fechas parciales; acordar fecha vacía en PetitionsPage; distinguir UUID v4 válido de referencia Catalog existente. **Dependencias:** COMM-5 para confirmar consumidores y formatos. **Verificaciones:** límites, valores inválidos, fechas parciales/mal formadas, referencias inexistentes y casos válidos en suites focalizadas; ESLint, typecheck/build. Sin PostgreSQL ni servicios externos.
7. **[ ] BC-COMM-7 — Restringir la proyección User en Rates por disco (M).** **Alcance:** devolver una proyección acotada compatible desde `GET /rates/disc/:discId`, preservando al menos `user.id`, `username` e `image` (estos dos últimos los usa VotesModal; ArtistManagement requiere `id`), además de Rate/Disc actuales. **Dependencias:** COMM-5; confirmar si existe consumidor externo de los campos amplios antes de cerrar contrato. **Verificaciones:** contrato HTTP con campos esperados/ausentes, regresión de ArtistManagement si está disponible, suite Rates y typecheck/build. Si no puede confirmarse uso externo, registrar el riesgo residual.
8. **[ ] BC-COMM-8 — Hacer atómica la aprobación de Requests (M).** **Alcance:** caracterizar Artist ya existente/nuevo y fallos de guardado; ejecutar Artist, Disc y transición de Request en una transacción, preservando respuesta, estado y regla de búsqueda. Sin migración ni cambio de deduplicación. **Dependencias:** caracterización de fallo/rollback y revisión de `RequestsService`; puede realizarse sin PostgreSQL con manager transaccional falso. **Verificaciones:** éxito con Artist existente/nuevo, fallo de cada escritura y rollback simulado, suite Requests, typecheck/build. No activar integraciones ni base real.
9. **[ ] BC-COMM-9 — Cierre de saneamiento de Community (XS).** **Alcance:** comprobar que los cortes aprobados quedaron cerrados; actualizar inventario/estado, retirar entradas de los tres baselines y registrar riesgos contractuales diferidos. **Dependencias:** BC-COMM-1–4; COMM-5–8 solo si el usuario decide incluir sus correcciones en este ciclo. **Verificaciones:** `yarn verify`, regresión focalizada de Community y consumers disponibles sin servicios externos/PostgreSQL, enlaces Markdown y `git diff --check`. No declarar resuelto un riesgo que siga diferido.

## Verificaciones de esta auditoría

- **BC-COMM-1 (2026-10-21):** movidos los 10 specs y ajustados solo sus imports relativos; 16 suites Community aprobadas (83 tests; suite PostgreSQL omitida); typecheck sin errores. Se eliminaron únicamente las 18 entradas obsoletas de Community de `scripts/structural-quality-gate.baseline.json` (95 → 77). `yarn quality:structure`: 40 módulos, 77 infracciones existentes, 0 nuevas y 0 obsoletas; no hay infracciones actuales de Community. `git diff --check` aprobado.

- Gates ejecutados y aprobados: `node scripts/structural-quality-gate.js`, `node scripts/type-safety-quality-gate.js`, `node scripts/eslint-quality-gate.js` y `node scripts/typecheck-quality-gate.js`.
- Pruebas focalizadas: `yarn --ignore-engines test --runInBand src/community` — 16 suites/83 tests aprobados; 1 suite/2 tests omitidos por guardia PostgreSQL.
- No se ejecutó `yarn verify` completo porque incluye todo el backend y no es necesario para esta auditoría focalizada. No se ejecutaron build, E2E, pruebas PostgreSQL ni consumidores que conecten servicios reales.
- Comprobación de enlaces relativos en este documento y el índice, más `git diff --check`, registrada al cerrar el documento.

- **BC-COMM-4 (2026-10-21):** `yarn quality:lint` — 904 diagnósticos ajenos a Community, 0 nuevos, 0 obsoletos y 0 duplicados; Community sin diagnósticos. `yarn quality:types` — 97 entradas ajenas a Community, 0 nuevas, 0 obsoletas y 0 duplicadas. `yarn quality:structure` — 40 módulos, 77 infracciones preexistentes, 0 nuevas y 0 obsoletas. `yarn quality:typecheck` — 0 errores. `yarn --ignore-engines test --runInBand src/community` — 16 suites/83 tests aprobados; 1 suite/2 tests omitidos por la guardia PostgreSQL, sin activar PostgreSQL ni servicios externos. `yarn build` y `git diff --check` aprobados.

- **BC-COMM-5 (2026-10-21):** sin cambios productivos ni en baselines. Pruebas añadidas en Rates controller/service y Requests DTO/service; pruebas Favorites/Pendings/Rates fijan el predicado de `commentCount`. `yarn --ignore-engines test --runInBand src/community` — 17 suites aprobadas, 91 tests aprobados; 1 suite y 2 tests omitidos bajo la guardia PostgreSQL. `yarn quality:typecheck` — 0 errores; `yarn quality:types` — 97 diagnósticos históricos, 0 nuevos/obsoletos/duplicados; `yarn quality:structure` — 40 módulos, 77 infracciones históricas, 0 nuevas/obsoletas. `yarn quality:lint` — 904 diagnósticos históricos ajenos a Community, 0 nuevos/obsoletos/duplicados; Community sin diagnósticos. `git diff --check` aprobado. No se activaron PostgreSQL ni servicios externos. Se revisó el frontend actual; permanecen sin confirmar consumidores externos del API y el error exacto del driver ante fechas/IDs inválidos.

