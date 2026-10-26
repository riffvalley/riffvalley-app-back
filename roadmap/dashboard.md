# Roadmap del dashboard

Este documento recoge las decisiones de estadísticas de dashboard para Rates y su composición futura. La tarea D-B1.3 se implementa como contrato interno; no amplía `DashboardSummary` ni añade rutas HTTP.

## D-B1.1 — Captura de actividad de voto

La captura registra eventos transaccionales `set` y `change` en `rate_vote_events`. `set` indica una transición musical desde ausencia de valoración a un valor; `change` indica el cambio entre dos valores no nulos. Cambios solo de portada, repetición de la misma nota, retirada y borrado no generan eventos. Las lecturas de valoración actual deben consultar `Rate.rate IS NOT NULL`, sin reconstruirlas desde el ledger.

La tabla `rate_vote_event_capture` conserva un registro singleton con `started_at`, escrito al iniciar la captura. Es el límite verificable para eventos del ledger y no se sustituye por la fecha de una migración ni por `Rate.createdAt`/`editedAt`.

## D-B1.2 — Identificación de discos en eventos

Los eventos nuevos incluyen `disc_id`, `previous_value` y `new_value`. `disc_id` conserva una FK `ON DELETE SET NULL`; un evento retenido cuyo disco se borró no se reasigna ni se cuenta como otro disco. Los eventos creados antes de aplicar la captura enriquecida pueden conservar `disc_id = NULL`. No se ejecuta backfill.

No existe un marcador fiable separado para el inicio de captura enriquecida de discos. Por eso la implementación no infiere ese límite desde la migración que añadió columnas: examina los eventos `set` del período y marca incompleto cualquier período que contenga un evento sin `disc_id`.

## D-B1.3 — Estadísticas históricas de votación

**Estado:** completada el 2026-10-26.

### Contrato interno

`HistoricalRatesStatsService.getUserHistoricalStats(userId)` devuelve:

- `totalRatedDiscs`: discos distintos actualmente valorados musicalmente (`Rate.rate IS NOT NULL`), independiente de la cobertura histórica.
- `month`: discos distintos con evento `set` en el mes Madrid actual (`ratedDiscs`), IDs de esos discos solo si el período está completo (uso interno de CrossDomain), días locales distintos con `set` (`activeDays`) y cobertura.
- `year`: los mismos datos de discos para el año Madrid actual.
- `history`: métricas de vida explícitamente `null`; el ledger comenzó después de que existieran votos.
- `currentStreak`: días Madrid consecutivos con `set`, si la cobertura permite determinar el inicio de la secuencia.
- `discoveries`: explícitamente desconocido (`null`) porque no se puede demostrar el primer voto de vida por disco.
- `timezone`: `Europe/Madrid`.

Los campos `ratedDiscs` mensuales/anuales cuentan discos distintos con actividad `set` durante el período. No significan primeros descubrimientos. Varios `set` del mismo disco en un período suman un disco; el mismo disco puede volver a contar en otro período. `change` no cuenta.

### Consultas y propiedad de datos

Rates hace una consulta agregada PostgreSQL por usuario que combina el conteo actual de Rate con eventos. Filtra `event_type = 'set'`, deriva límites semiabiertos desde medianoches Europe/Madrid, deduplica IDs, agrupa días locales y calcula la secuencia consecutiva con funciones de ventana. Se excluye el día local en que comenzó la captura para no tratarlo como día completo. Ni el histórico completo de eventos ni entidades `Disc` se cargan en memoria.

Rates no consulta Catalog ni carga discos. Expone IDs distintos únicamente para períodos completos; CrossDomain los entrega a la operación pública de Catalog durante la composición D-B1.4. Catalog cuenta `COUNT(DISTINCT disc."genreId")` contra la clasificación actual. El modelo solo tiene una relación `Disc.genre`; no existe subgénero separado. La reclasificación actual afecta también las consultas de períodos pasados. Discos inexistentes/ids ya puestos a `NULL` no se inventan y provocan cobertura parcial del conteo de discos/géneros. Los IDs no forman parte del DTO HTTP.

### Cobertura y límites

- `complete`: el período empieza en o después de `rate_vote_event_capture.started_at` y no contiene eventos `set` sin `disc_id`. Un período completo sin eventos devuelve cero.
- `partial_missing_disc_ids`: el límite de captura cubre el período, pero hay eventos `set` sin disco identificable, incluidos eventos antiguos sin la captura enriquecida y discos borrados.
- `before_capture`: el período comienza antes de `started_at`; no se devuelve cero ni se presenta como completo.
- `unknown`: falta el marcador singleton o no se puede leer.
- La cobertura de `activeDays` es distinta: depende de si el mes entero tuvo días completos desde el inicio de captura, no de la disponibilidad de `disc_id`. La racha también queda `null` si podría continuar antes del primer día completo conocido.
- El total histórico de discos/géneros y los primeros descubrimientos permanecen desconocidos. No se deducen de `Rate` actual ni del primer evento conservado.

No se introducen índices ni migraciones. La consulta usa los índices existentes de `rate_vote_events`; falta medir planes con datos representativos antes de proponer cambios de rendimiento.

### Verificación

La suite focalizada cubre deduplicación de discos, agregación actual de géneros, ceros cubiertos, períodos anteriores a captura, eventos sin disco, racha incierta, zona Madrid/límites, errores SQL/Catalog y wiring Nest. `pnpm run verify` pasó: 215 suites, 2.110 tests aprobados y 91 omitidos. Los gates estructural, de tipado seguro y ESLint no detectaron hallazgos nuevos; typecheck y build pasaron. `git diff --check` pasó. La ejecución fue con mocks y revisión de las consultas; no hay opt-in ni base PostgreSQL aislada `bc_id_3f_3_*` configurada, así que no se ejecutó una prueba real del SQL contra PostgreSQL. No se usó una base real ni se ejecutaron migraciones de producción.

## D-B1.4 — Integración de estadísticas históricas en DashboardSummary

**Estado:** completada el 2026-10-26.

`GET /api/app/dashboard-summary` compone `HistoricalRatesStatsService.getUserHistoricalStats(sessionUser.id)`, `DiscCatalogService.countCatalogDiscs()` y `DiscCatalogService.countCurrentGenresForDiscSets()` desde CrossDomain. El conteo de Rates y el total global de Catalog se ejecutan en paralelo. Tras conocer la cobertura, CrossDomain solicita una única agregación actual de `genreId` para los conjuntos completos de mes/año. No se usa el endpoint de discos ni se consultan discos individualmente.

El DTO público conserva `personal.totalRatedDiscs`, `personal.currentStreak`, `personal.year.{ratedDiscs, exploredGenres}`, `personal.month.{ratedDiscs, exploredGenres, activeDays}` y `catalog.totalDiscs`. CrossDomain copia los valores ya agregados; las métricas temporales no cubiertas permanecen `null`. La identidad viene exclusivamente de `@GetUser()` y no se acepta un `userId` de entrada. Los errores de Rates o Catalog se propagan.

CrossDomain omite la agregación de géneros de un período cuando su cobertura no es completa y evita la operación cuando ambos conjuntos están vacíos. El total actual de Rates y actividad mensual/anual se obtiene en la misma consulta histórica; DashboardSummary ya no llama también al agregado anterior de actividad, evitando duplicar consultas de eventos, rachas y días. Rates no depende del módulo de Catalog.

Durante la integración se corrigió una coma final en el SQL de D-B1.3 y se amplió esa misma agregación para incluir `totalRatedDiscs` actual. La ausencia del marcador ahora conserva ese conteo actual y deja desconocidas las métricas temporales. No se duplican la consulta de eventos, días ni racha del método anterior de Rates.

Las pruebas de DashboardSummary cubren ceros cubiertos, datos de mes/año, preservación de nulos temporales con días cubiertos, propagación de errores, contrato exacto, identidad de sesión y exports públicos de Rates/Catalog. Las pruebas focalizadas de Rates/Catalog cubren la consulta agregada y que no se soliciten géneros cuando el período no es publicable o está vacío. `pnpm run verify` pasó con 215 suites y 2.113 tests aprobados; 91 tests opt-in omitidos. ESLint reportó cero hallazgos nuevos; typecheck, build, gates estructural y de tipado seguro pasaron. `git diff --check` pasó.

La verificación PostgreSQL real sigue pendiente: no hay una base aislada de pruebas configurada. Las consultas se verificaron mediante mocks y aserciones de SQL; no se afirma que hayan sido ejecutadas contra PostgreSQL. El frontend aún debe integrar el contrato final y no forma parte de esta tarea.

## D-B2

**Pendiente.** No se inicia en esta tarea.
