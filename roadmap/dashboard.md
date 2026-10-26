# Roadmap del dashboard

Este documento recoge las decisiones de estadísticas de dashboard para Rates y su composición futura. La tarea D-B1.3 se implementa como contrato interno; no amplía `DashboardSummary` ni añade rutas HTTP.

## D-B1.1 — Captura de actividad de voto

La captura registra eventos transaccionales `set` y `change` en `rate_vote_events`. `set` indica una transición musical desde ausencia de valoración a un valor; `change` indica el cambio entre dos valores no nulos. Cambios solo de portada, repetición de la misma nota, retirada y borrado no generan eventos. Las lecturas de valoración actual deben consultar `Rate.rate IS NOT NULL`, sin reconstruirlas desde el ledger.

La tabla `rate_vote_event_capture` conserva un registro singleton con `started_at`, escrito al iniciar la captura. Es el límite verificable para eventos del ledger y no se sustituye por la fecha de una migración ni por `Rate.createdAt`/`editedAt`.

## D-B1.2 — Identificación de discos en eventos

Los eventos nuevos incluyen `disc_id`, `previous_value` y `new_value`. `disc_id` conserva una FK `ON DELETE SET NULL`; un evento retenido cuyo disco se borró no se reasigna ni se cuenta como otro disco. Los eventos creados antes de aplicar la captura enriquecida pueden conservar `disc_id = NULL`. No se ejecuta backfill.

No existe un marcador fiable separado para el inicio de captura enriquecida de discos. Los eventos sin `disc_id` no se atribuyen a un disco ni a un género; sí cuentan como actividad en su día local. No se infieren identificadores desde la migración ni se hace backfill.

## D-B1.3 — Estadísticas históricas de votación

**Estado:** completada el 2026-10-26.

### Contrato interno

`HistoricalRatesStatsService.getUserHistoricalStats(userId)` devuelve:

- `totalRatedDiscs`: discos distintos actualmente valorados musicalmente (`Rate.rate IS NOT NULL`), independiente de la cobertura histórica.
- `month`: discos distintos identificables con evento `set` en el mes Madrid actual (`ratedDiscs`), sus IDs para CrossDomain y días locales distintos con `set` (`activeDays`).
- `year`: los mismos datos de discos identificables para el año Madrid actual.
- `history`: métricas de vida explícitamente `null`; el ledger comenzó después de que existieran votos.
- `currentStreak`: días Madrid consecutivos con `set` observados en los eventos disponibles.
- `discoveries`: explícitamente desconocido (`null`) porque no se puede demostrar el primer voto de vida por disco.
- `timezone`: `Europe/Madrid`.

Los campos `ratedDiscs` mensuales/anuales cuentan discos distintos con actividad `set` durante el período. No significan primeros descubrimientos. Varios `set` del mismo disco en un período suman un disco; el mismo disco puede volver a contar en otro período. `change` no cuenta.

### Consultas y propiedad de datos

Rates hace una consulta agregada PostgreSQL por usuario que combina el conteo actual de Rate con eventos. Filtra `event_type = 'set'`, deriva límites semiabiertos desde medianoches Europe/Madrid, deduplica IDs, agrupa días locales y calcula la secuencia consecutiva con funciones de ventana. Incluye todos los eventos disponibles sin condicionar los períodos al marcador de inicio de captura. Ni el histórico completo de eventos ni entidades `Disc` se cargan en memoria.

Rates no consulta Catalog ni carga discos. Expone los IDs distintos disponibles; CrossDomain los entrega a la operación pública de Catalog durante la composición D-B1.4. Catalog cuenta `COUNT(DISTINCT disc."genreId")` contra la clasificación actual. El modelo solo tiene una relación `Disc.genre`; no existe subgénero separado. La reclasificación actual afecta también las consultas de períodos pasados. Discos inexistentes/ids ya puestos a `NULL` no se inventan ni se cuentan como disco o género. Los IDs no forman parte del DTO HTTP.

### Límite histórico

Los contadores de mes y año devuelven los valores derivados de eventos disponibles, incluido `0` cuando no hay actividad conocida. Los eventos sin `disc_id` no se pueden atribuir a discos o géneros, aunque sus días sí cuentan como actividad. No se reconstruyen votos anteriores al inicio de captura. Los acumulados de 2026 son parciales y ganarán representatividad conforme avance el tiempo; no equivalen a un histórico completo. Los conteos de vida y los primeros descubrimientos permanecen desconocidos y no se deducen de `Rate` actual ni del primer evento conservado.

No se introducen índices ni migraciones. La consulta usa los índices existentes de `rate_vote_events`; falta medir planes con datos representativos antes de proponer cambios de rendimiento.

### Verificación

La suite focalizada cubre deduplicación de discos, agregación actual de géneros, ceros cubiertos, períodos anteriores a captura, eventos sin disco, racha incierta, zona Madrid/límites, errores SQL/Catalog y wiring Nest. `pnpm run verify` pasó: 215 suites, 2.110 tests aprobados y 91 omitidos. Los gates estructural, de tipado seguro y ESLint no detectaron hallazgos nuevos; typecheck y build pasaron. `git diff --check` pasó. La ejecución fue con mocks y revisión de las consultas; no hay opt-in ni base PostgreSQL aislada `bc_id_3f_3_*` configurada, así que no se ejecutó una prueba real del SQL contra PostgreSQL. No se usó una base real ni se ejecutaron migraciones de producción.

## D-B1.4 — Integración de estadísticas históricas en DashboardSummary

**Estado:** completada el 2026-10-26.

`GET /api/app/dashboard-summary` compone `HistoricalRatesStatsService.getUserHistoricalStats(sessionUser.id)`, `DiscCatalogService.countCatalogDiscs()` y `DiscCatalogService.countCurrentGenresForDiscSets()` desde CrossDomain. El conteo de Rates y el total global de Catalog se ejecutan en paralelo. CrossDomain solicita una única agregación actual de `genreId` para los IDs identificables de mes/año. No se usa el endpoint de discos ni se consultan discos individualmente.

El DTO público conserva `personal.totalRatedDiscs`, `personal.currentStreak`, `personal.year.{ratedDiscs, exploredGenres}`, `personal.month.{ratedDiscs, exploredGenres, activeDays}` y `catalog.totalDiscs`. Desde D-B2.2 las métricas temporales reflejan los eventos disponibles y devuelven cero si no hay eventos identificables; no quedan bloqueadas por historia previa incompleta. La identidad viene exclusivamente de `@GetUser()` y no se acepta un `userId` de entrada. Los errores de Rates o Catalog se propagan.

CrossDomain evita la operación de géneros cuando ambos conjuntos están vacíos; Catalog devuelve cero para ambos. El total actual de Rates y actividad mensual/anual se obtiene en la misma consulta histórica; DashboardSummary no duplica consultas de eventos, rachas ni días. Rates no depende del módulo de Catalog.

Durante la integración se corrigió una coma final en el SQL de D-B1.3 y se amplió esa misma agregación para incluir `totalRatedDiscs` actual. La ausencia de eventos devuelve cero en las métricas temporales. No se duplican las consultas de eventos, días ni racha del método anterior de Rates.

Las pruebas de DashboardSummary cubren ceros cubiertos, datos de mes/año, preservación de nulos temporales con días cubiertos, propagación de errores, contrato exacto, identidad de sesión y exports públicos de Rates/Catalog. Las pruebas focalizadas de Rates/Catalog cubren la consulta agregada y que no se soliciten géneros cuando el período no es publicable o está vacío. `pnpm run verify` pasó con 215 suites y 2.113 tests aprobados; 91 tests opt-in omitidos. ESLint reportó cero hallazgos nuevos; typecheck, build, gates estructural y de tipado seguro pasaron. `git diff --check` pasó.

La verificación PostgreSQL real sigue pendiente: no hay una base aislada de pruebas configurada. Las consultas se verificaron mediante mocks y aserciones de SQL; no se afirma que hayan sido ejecutadas contra PostgreSQL. La query tipada frontend ya consume este contrato sin una petición adicional; D-B2.2 no requiere cambiar sus tipos.

## D-B2

**Estado:** desglosada en tareas. D-B2.2 activa las estadísticas de mes/año sin iniciar el rediseño del banner.

## D-B2.2 — Activar estadísticas mensuales y anuales

**Estado:** completada el 2026-10-26.

DashboardSummary conserva el contrato actual. `year.ratedDiscs` y `month.ratedDiscs` cuentan discos distintos identificables con eventos `set` en el período Madrid correspondiente. `month.activeDays` cuenta fechas Madrid distintas que tienen al menos un evento `set`; la racha cuenta la secuencia consecutiva más reciente observada. Los eventos `change` no suman actividad. Si el mismo disco recibe varios `set`, cuenta una vez por período.

Rates agrega eventos por usuario en una sola consulta PostgreSQL. La consulta aplica los límites semiabiertos Madrid de mes y año, deduplica `disc_id`, cuenta días locales y calcula la racha con funciones de ventana. Ya no limita resultados por `rate_vote_event_capture.started_at` ni condiciona mes/año a una cobertura completa. Eventos `set` con `disc_id = NULL` sí contribuyen a días activos, pero no se atribuyen a ningún disco ni género. CrossDomain siempre compone los conteos disponibles y reutiliza una única llamada a `countCurrentGenresForDiscSets`; Catalog cuenta géneros actuales distintos sobre los IDs conocidos y devuelve cero para conjuntos vacíos. No se cargan entidades ni historiales completos, no se añaden endpoints o migraciones y la autenticación permanece igual.

Los períodos sin eventos devuelven cero. No se reconstruyen votos anteriores a la captura ni se infieren discos para eventos sin ID. Por eso los acumulados de 2026 son parciales y representarán mejor la actividad conforme avance la captura; no equivalen a un histórico musical completo. La consulta sigue propagando errores de Rates o Catalog.

Las pruebas focalizadas cubren usuario sin actividad, conteos distintos de disco y día, filtro exclusivo `set`, límites Madrid, eventos sin `disc_id`, errores SQL/Catalog, composición con historia incompleta y el contrato HTTP autenticado. Pasaron 4 suites y 15 tests focalizados. `pnpm run verify` pasó con 215 suites y 2.112 tests aprobados; 91 tests opt-in omitidos. ESLint mantuvo 839 diagnósticos del baseline sin hallazgos nuevos; gates estructural, de tipado seguro, typecheck y build pasaron. `git diff --check` pasó. La suite PostgreSQL opt-in no se ejecutó porque el servidor configurado no acepta conexiones; no se afirma ejecución del SQL contra una base real. En frontend no hubo cambios de contrato ni de código; sus pruebas, typecheck y build ya pasaron con el estado local preexistente.

## D-B2.4 — Completar estadísticas de DashboardSummary

**Estado:** completada el 2026-10-26. `pnpm run verify` y las pruebas focalizadas pasaron; no se realizó backfill ni se modificó el frontend.

### Contrato añadido

Se agregan exactamente cinco campos al DTO existente, preservando los campos y tipos actuales:

- `personal.totalExploredGenres`: géneros actuales distintos de todos los discos con Rate musical actual no nulo; `0` si no hay discos valorados.
- `personal.totalActiveDays`: días locales distintos con evento musical `set` desde el inicio real del ledger; `0` si no hay eventos. Representa días registrados y no reconstruye actividad anterior al ledger.
- `personal.year.activeDays`: días Madrid distintos con `set` durante el año local actual; `0` si no existen. No se bloquea por cobertura histórica.
- `catalog.discsThisYear` y `catalog.discsThisMonth`: discos distintos cuya fecha musical de lanzamiento cae en el año/mes Madrid actual; `0` si no hay coincidencias.

Mes, año e histórico son vistas distintas. `currentStreak` permanece como indicador independiente. Los acumulados de actividad musical de 2026 pueden ser parciales porque la captura del ledger comenzó después de la actividad inicial de la cuenta. No se reconstruye ni se hace backfill de los días anteriores al ledger.

### Consultas y ownership

- Rates amplía la consulta agregada ya existente. Una CTE con `SELECT DISTINCT (occurred_at AT TIME ZONE 'Europe/Madrid')::date` cuenta días sin cargar eventos completos; los períodos filtran `set`, por lo que `change` no cuenta. La consulta añade los días del año y el total de días registrados, conservando los límites actuales de mes, los ratedDiscIds y la racha. También devuelve los IDs distintos de los discos con `Rate.rate IS NOT NULL` para que CrossDomain resuelva los géneros actuales.
- Catalog amplía la agregación de géneros para consultar en una llamada los conjuntos de mes, año y valoraciones actuales. Usa `COUNT(DISTINCT disc."genreId")`, joins por IDs y omite géneros nulos; no carga entidades ni crea N+1.
- Catalog añade una agregación de dos conteos por `Disc.releaseDate`, confirmada en la entidad como SQL `date`. PostgreSQL obtiene la fecha de calendario local con `CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid'`, y los límites mensuales/anuales se comparan directamente con la fecha de lanzamiento. La query excluye fechas nulas y cuenta IDs distintos; no usa `createdAt`.
- CrossDomain ejecuta en paralelo las lecturas independientes de Rates, total de catálogo y lanzamientos por período. Después llama a la operación pública de Catalog para los géneros de mes/año/histórico. Autenticación, endpoint y composición entre módulos se mantienen.

### Tests y límites de verificación

Las pruebas focalizadas cubren ceros sin actividad, deduplicación de días y discos, solo `set`, IDs de Rates actuales filtrados por `rate IS NOT NULL`, géneros duplicados/nulos, errores de SQL y composición, contrato HTTP con cinco campos nuevos, fechas de lanzamiento nulas, límites Madrid y ventanas de mes/año. Se comprueba que los resultados existentes de Rates y catálogo se conservan. Pasaron 4 suites focalizadas y 17 tests. `pnpm run verify` pasó con 215 suites aprobadas, 2.114 tests aprobados y 91 tests omitidos. Los gates estructural, de tipado seguro y ESLint no detectaron hallazgos nuevos; typecheck, build y `git diff --check` pasaron.

La verificación de estas consultas se realiza mediante pruebas unitarias con mocks y aserciones de SQL. La suite PostgreSQL aislada no está disponible en este entorno, por lo que no se afirma una ejecución real de consultas contra PostgreSQL. `releaseDate` es de tipo SQL `date`; no representa un instante, así que su comparación es de calendario y las fronteras se calculan en Madrid. Los acumulados `totalActiveDays` y `totalExploredGenres` describen los datos actualmente registrados, no una reconstrucción de toda la vida del usuario.
