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

## D-4b.1 — Backend del widget Disco aleatorio

**Estado:** completada el 2026-10-26; D-4b.2 sigue pendiente.

### Contrato HTTP

`GET /api/discs/random` conserva su DTO y respuesta actuales. `difficulty` es opcional y admite `easy`, `normal` o `hard`; `previousDiscId` es un UUID opcional. Ambos parámetros se aplican únicamente cuando se solicita una dificultad. El `limit` existente y los filtros `genre`, `country`/`countryId`, `year`, `ep` y `debut` siguen aplicándose. Los parámetros inválidos producen el `400` habitual de `ValidationPipe`.

La ruta ya estaba protegida por `@Auth()` y recibía `@GetUser()`. Se mantiene esa protección para llamadas antiguas y personalizadas; la identidad se obtiene de la sesión/JWT y nunca de un `userId` de query. La ausencia de candidatos devuelve `[]` y se propagan los errores de Rates/Catalog.

### Selección y ownership

Catalog conserva la aplicación de filtros, el límite, el corte de lanzamiento (`releaseDate <= hoy`, que excluye también fechas nulas como antes), `ORDER BY RANDOM()`, la selección de IDs y la hidratación existente.

`RatesRandomSelectionService` expone a Catalog un contrato interno tipado de predicados SQL acotados. Rates calcula desde `rate` actual, exclusivamente donde `rate IS NOT NULL`: excluye discos musicales ya valorados por el usuario; cuenta votos comunitarios con `COUNT(DISTINCT userId)`; y obtiene preferencias por `genreId` ordenadas por discos distintos valorados (`COUNT(DISTINCT disc.id) DESC`, desempate `genreId ASC`). No consulta ni utiliza `rate_vote_events`. Las filas duplicadas no multiplican votos ni discos; una nota `0` cuenta y una valoración solo de portada no cuenta.

- **Easy:** al menos 5 usuarios musicales distintos; limita los géneros a los 3 preferidos. Si el usuario aún no tiene géneros valorados, no añade filtro personal de género.
- **Normal:** de 2 a 4 usuarios musicales distintos; limita a los 7 géneros preferidos, con el mismo comportamiento cuando no hay preferencias.
- **Hard:** entre 0 y 1 usuario musical distinto. Si existen candidatos en géneros nunca valorados, el `CASE` SQL les da prioridad sobre los géneros restantes. Si no hay candidatos de esos géneros, quedan disponibles los que están fuera del Top 7. Un usuario sin preferencias puede recibir cualquier género.

Los predicados se aplican a la consulta de IDs antes de la selección aleatoria; no se descargan candidatos ni se hidrata el catálogo completo. Se conserva la hidratación/enriquecimiento posterior existente y no se añade consulta de conteo. `previousDiscId` se excluye en la primera consulta; si esta no produce candidatos, se repite sin esa exclusión para permitir repetir el único disco válido. No se guarda historial ni se escribe en base de datos. El modo difícil ordena primero por prioridad de género y luego por `RANDOM()`, sin ponderar por cantidad de votos dentro del nivel.

### Verificación y límites

Las pruebas focalizadas de Catalog y Rates pasaron: 38 suites y 354 tests. La suite unitaria completa pasó: 216 suites, 2.120 tests y 91 omitidos (14 suites opt-in); los snapshots también pasaron. Typecheck, build, runtime dependency gate, gates estructural y de tipado seguro, tests de gates, ESLint y `git diff --check` pasaron. El gate ESLint conserva 839 hallazgos existentes y no añade nuevos. El contrato de respuesta sigue pasando por el mismo mapeo e hidratación anteriores. No se midió el plan ni el rendimiento con datos representativos; no se añadieron índices ni se optimizó `ORDER BY RANDOM()`.

La suite de PostgreSQL aislada no se ejecutó: no había destino de integración configurado. Las consultas se revisaron y probaron mediante aserciones unitarias, no contra un servidor PostgreSQL real. El wrapper `pnpm run verify` tampoco pudo iniciarse porque pnpm devolvió `ERR_SQLITE_ERROR: unable to open database file` al resolver la versión fijada; sus verificaciones se ejecutaron individualmente con los scripts locales y pasaron. La primera petición frontend puede solicitar directamente la dificultad; el frontend aún no se ha modificado ni integrado (D-4b.2 permanece pendiente).

## D-4b.3 — Backend de Portada del día

**Estado:** completada el 2026-10-27; integración frontend pendiente. Este identificador mantiene separadas las tareas existentes: D-5 corresponde a Insights y D-10 conserva Portada/Aventura.

### Contrato HTTP y selección

`GET /api/discs/daily-cover-featured` requiere autenticación. La identidad se toma exclusivamente de `@GetUser()`; no acepta `userId`. Devuelve un único disco enriquecido o `null` cuando no hay candidato. La respuesta conserva `id`, `userRate`, `averageCover` y `voteCount` musical del mapper actual, y añade `coverVoteCount`, número de usuarios distintos con voto de portada válido usado para el umbral. Los discos sin imagen se excluyen porque el endpoint abastece una tarjeta de portada.

Un candidato debe tener al menos cuatro votos de portada de usuarios distintos, media de portada estrictamente superior a 7, no tener voto de portada del usuario autenticado y no tener lanzamiento futuro respecto al día natural de `Europe/Madrid`. Los campos musicales no intervienen: el voto musical no excluye por sí mismo al usuario y `voteCount` permanece sin cambios.

Rates ofrece a Catalog los agregados/predicados de portada. Solo se usan filas con `cover IS NOT NULL` (incluido `cover = 0`); se ignoran votos solo musicales. Ante duplicados de un mismo usuario y disco, se usa su fila más reciente según `COALESCE(editedAt, createdAt) DESC`, con `id DESC` como desempate determinista. Tanto el conteo como la media utilizan esa misma fila por usuario, y la exclusión personal comprueba la existencia de cualquier portada no nula.

Catalog selecciona en PostgreSQL un único ID ordenando por `md5(userId || fechaMadrid || discId)`; después hidrata solo ese disco con las relaciones y campos actuales de Catalog. La respuesta recupera el ID seleccionado de SQL si TypeORM no lo incluye en la entidad hidratada. Para un conjunto estable de candidatos, usuario y fecha, la elección es reproducible y no depende del orden ni tamaño del catálogo. Cambiar el conjunto de candidatos puede cambiar la portada dentro del mismo día; no hay persistencia ni garantía de estabilidad absoluta. Al cambiar el día Madrid cambia la entrada del hash.

### Verificación y pendiente

Las pruebas focales de Catalog, Rates y el controller pasaron: 3 suites, 102 tests. Cubren la política SQL, la selección/hidratación, resultado vacío y compatibilidad de las rutas existentes. El typecheck, build de Nest, gate de runtime dependencies, ESLint sin hallazgos nuevos, gates estructural/de tipado seguro, `git diff --check` y las siete suites de pruebas de los quality gates pasaron. El gate estructural conserva 9 infracciones históricas, el gate de tipado seguro conserva 5 y ESLint conserva 839; ninguno añadió hallazgos.

La suite unitaria completa se ejecutó, pero no pasó en este sandbox: 204 suites pasaron, 12 fallaron y 14 fueron omitidas; los fallos HTTP del entorno reportan `listen EPERM` al abrir `0.0.0.0`. La repetición focal posterior pasó. El wrapper `pnpm run verify` quedó bloqueado al resolver pnpm (sin salida después de iniciar la secuencia); `pnpm run quality:typecheck` reportó `ERR_SQLITE_ERROR: unable to open database file`, por lo que se ejecutaron los scripts locales directamente. No se ejecutó PostgreSQL real, así que la SQL sigue sin validación contra un servidor. No se añadieron índices ni migraciones. La integración del nuevo endpoint en el widget frontend queda pendiente en la tarea de frontend correspondiente.

## D-COM — Community

La auditoría localizada en `roadmap/community/community.md` documenta que `/discs/homeDiscs` ejecuta seis SELECT para devolver discos, estadísticas globales, totales, rankings de usuarios y distribución; también caracteriza que el ranking de portadas filtra por fecha de publicación y cuenta filas `cover IS NOT NULL`. `homeDiscs` se conserva para sus otros consumidores. Community Dashboard separa las lecturas siguientes para que la carga del widget no ejecute agregados del modal.

### D-COM.1 — Rankings de Community

**Estado:** implementada en backend; integración frontend pendiente.

`GET /api/community/dashboard/rankings?year=YYYY` requiere autenticación y acepta años enteros desde 2025. Devuelve `year`, `topUsersByRates` (`user.id`, `user.username`, `rateCount`) y `topUsersByCover` (`user.id`, `user.username`, `totalCover`), con máximo 20 filas por ranking y desempate por username e ID. No expone email, Rates, distribución, rachas ni estadísticas del modal.

Para 2025 y 2026 el ranking musical cuenta discos distintos por usuario a partir de las valoraciones musicales actuales `rate IS NOT NULL`; el cero cuenta y una fila duplicada de usuario/disco no suma otro disco. El año se determina por `Disc.releaseDate`. Desde 2027 solo se cuentan discos distintos con evento `set` durante el año natural de `Europe/Madrid`, usando `occurred_at` y descartando eventos sin disco o sin valor musical. Los eventos `change` no suman. La cobertura comienza cuando se activó la captura y no se reconstruyen ni rellenan eventos ausentes; 2027 solo será un ejercicio completo si la captura funciona sin interrupciones desde el 1 de enero.

El ranking de portadas mantiene la semántica histórica de `homeDiscs`: año de `Disc.releaseDate` y número de filas de Rate con `cover IS NOT NULL` por usuario; no representa nuevos eventos de portada, no deduplica filas y no usa `rate_vote_events`, que no registra cambios de portada.

La petición usa dos agregaciones SQL: ranking musical histórico/ledger y ranking de portadas. No dispara distribución, géneros destacados, catálogo de discos ni rachas. `GET /discs/homeDiscs` no cambia.

### D-COM.2 — Estadísticas del modal de Community

**Estado:** implementada en backend; integración frontend pendiente.

`GET /api/community/dashboard/stats?year=YYYY` exige la misma autenticación y validación del año. Devuelve `year`; `summary.ratedDiscs`, `summary.releasedDiscs`, `summary.participatingUsers` y `summary.averageRating`; seis intervalos ordenados en `ratingDistribution` (`label`, `min`, `max`, `minInclusive`, `maxInclusive`, `count`); hasta cinco `currentStreaks` (`user.id`, `user.username`, `days`); y `topGenres`, un arreglo de hasta cinco elementos (`id`, `name`, `ratedDiscs`) que queda vacío sin resultados. El campo singular `topGenre` se elimina.

En 2025–2026, las valoraciones se basan en las filas actuales musicales no nulas de discos publicados en el año. Los duplicados de usuario/disco para medias y distribución se reducen a la fila más recientemente editada (desempate por ID); el promedio comunitario es la media de las medias por disco, con el mismo peso por disco. `ratedDiscs` y `participatingUsers` son conjuntos históricos definidos por discos publicados en el año. Desde 2027 las estadísticas musicales usan `set` y `new_value` en límites semiabiertos del año Madrid; no infieren medias actuales como si fueran valores de evento. El promedio es la media de los valores `new_value` por disco identificable y luego la media simple de esos promedios de disco. La distribución usa los mismos valores de evento, incluso si el evento no conserva `disc_id`; así mantiene el ámbito temporal y el total de valores capturados. `ratedDiscs` cuenta discos distintos con `set` identificable y `participatingUsers` usuarios distintos con evento `set` musical, incluso cuando falta el identificador del disco. Las series del ledger siguen limitadas por la cobertura real disponible.

`releasedDiscs` cuenta siempre los discos cuyo `Disc.releaseDate` cae en el año y no usa `createdAt`. La distribución clasifica las notas decimales (Rates admite dos decimales, entre 0 y 10) en `[0,1]`, `(1,3]`, `(3,5]`, `(5,7]`, `(7,10)` y `{10}`; las categorías son disjuntas e incluyen medios puntos. Una media sin valoraciones es `null`; los conteos vacíos son cero.

Las rachas son actuales, independientes del año elegido y cuentan fechas locales Madrid consecutivas con al menos un evento `set`, no cantidad de votos. Se excluyen `change`; hoy o ayer pueden ser el día más reciente activo, conforme a la regla actual. El Top 5 desempata por username e ID y solo expone ID, username y días. `topGenres` cuenta discos distintos con actividad musical por género y año usando los mismos criterios temporales del modal: publicación y Rates musicales actuales no nulos deduplicados por usuario/disco para 2025–2026; eventos `set` con valor musical en límites anuales Madrid desde 2027. Excluye cambios y votos exclusivamente de portada. PostgreSQL ordena por `ratedDiscs` descendente y, en empate, por nombre e ID ascendentes; aplica `LIMIT 5`. No cambia la semántica ni la cobertura histórica.

La ruta ejecuta de forma independiente los agregados de Rates para resumen, distribución, género y rachas, además del conteo de lanzamientos de Catalog. No reconstruye rankings ni descarga votos al proceso. No se añaden índices ni caché; no se midieron planes de ejecución. Falta ejecutar estas SQL contra PostgreSQL aislado. El frontend debe solicitar rankings al montar/cambiar año y stats solo al abrir el modal o cambiar el año con el modal abierto.

**Verificación D-COM:** las 4 suites focalizadas del cambio pasan (9 tests); las regresiones de `homeDiscs`, Rates y `dashboard-summary` pasan (4 suites, 15 tests), para 8 suites y 24 tests focalizados/regresión. Typecheck directo, build Nest, runtime dependency gate, gates de estructura/tipado seguro, sus seis tests de control y `git diff --check` pasan. ESLint conserva 839 diagnósticos del baseline y no añade nuevos. `pnpm run verify` no inicia porque pnpm falla con `unable to open database file`. La suite unitaria completa se ejecutó directamente: 208 suites pasan, 11 fallan y 14 opt-in se omiten; los fallos HTTP son `listen EPERM` al enlazar `0.0.0.0` en el sandbox. No se ejecutó PostgreSQL real: no hay destino aislado configurado. La SQL solo se validó por revisión y tests de query/mocks. `homeDiscs` y los servicios existentes de Rates no cambian; no se modificaron archivos frontend.

### D-COM.2.1 — Top 5 de géneros

**Estado:** implementado en backend; adaptación frontend pendiente.

La respuesta de estadísticas sustituye el objeto nullable `topGenre` por `topGenres`, arreglo vacío o con hasta cinco `{ id, name, ratedDiscs }`. La consulta SQL existente aplica `COUNT(DISTINCT votes.disc_id)`, ordena por conteo descendente y luego por nombre e ID ascendentes, y limita el resultado en PostgreSQL. Para 2025–2026 conserva el criterio histórico de discos publicados y Rates musicales actuales válidos; desde 2027 usa eventos musicales `set` del año Madrid, sin inferir votaciones históricas ni usar la fecha de publicación para fijar el año de actividad. El resto del contrato y las consultas de rankings no cambian.

El consumidor frontend existente que requiere adaptación es `riffvalley-app-front/src/services/community/dashboard.ts` y sus fixtures `src/services/community/dashboard.test.ts`, `src/app/communityDashboardStats.test.ts` y `src/views/dashboard/components/DashboardCommunityWidget.test.ts`; `src/views/dashboard/components/DashboardCommunityStatsModal.vue` actualmente representa un solo género destacado. Su cliente tipado debe cambiar a `topGenres` y el modal debe presentar el arreglo, coordinado en la siguiente tarea frontend. No se modificó frontend en D-COM.2.1.

Las pruebas focalizadas pasan: 3 suites y 13 tests, incluyendo Top 5, subconjunto/array vacío, campos y conteos numéricos, SQL histórica y de eventos, deduplicación, cero musical, filtros de portada, desempate y límites Madrid; la cobertura existente mantiene el contrato del resto de estadísticas, rankings y autenticación. Typecheck directo, Nest build, runtime dependency gate, diff check y los siete tests de los gates pasan. Los gates estructural y de tipado seguro conservan 9 y 5 hallazgos preexistentes; ESLint conserva 839 y no añade nuevos. `pnpm run verify` no inicia por `unable to open database file`. La suite unitaria completa ejecutada directamente termina con 209 suites aprobadas, 11 fallidas y 14 opt-in omitidas (2.033 tests aprobados, 106 fallidos y 91 omitidos); los fallos HTTP observados son `listen EPERM` al enlazar `0.0.0.0` en este sandbox. No hay PostgreSQL aislado configurado: la SQL se revisó y se cubre con aserciones sobre la consulta, pero no se ejecutó contra PostgreSQL real.

## D-8c — «Tu semana musical»

El identificador técnico del widget sigue siendo `ultimosVotos`; el título será **Tu semana musical**. El resumen es solo del usuario autenticado. El árbol disponible no contiene D-8a, D-8b ni definición de `ultimosVotos`; este diseño usa las decisiones del brief aprobado.

### D-8c.1 — Diseño backend

**Estado:** completada el 2026-10-27. Investigación/documentación; no se modificaron código funcional, esquema, migraciones ni frontend.

#### Evidencia y fechas

- `1792000000000-CreateRateVoteEvents` crea `rate_vote_events` y el singleton `rate_vote_event_capture`; `started_at` se toma con `clock_timestamp()` al ejecutar la migración. `1792010000000-AddDiscAndValuesToRateVoteEvents` agrega `disc_id`, `previous_value` y `new_value` nullable, sin backfill. El timestamp del nombre de migración no demuestra cuándo se aplicó en cada entorno.
- `RatesService.create/update` guarda Rate y evento en la misma transacción. Emite `set` al pasar la nota de ausente a no nula, y `change` entre dos notas no nulas distintas. No emite al cambiar solo portada, repetir la nota, retirar a `null` o borrar. El constraint acepta solo `set` y `change`; una Rate solo de portada no genera evento, pero añadir luego nota sí.
- `DELETE /rates/:id` borra Rate sin evento. PATCH a `rate=null` tampoco emite; puede dejar el cover. Revalorar después genera otro `set`, así que puede haber varios `set` por pareja y el primero retenido no necesariamente es el primer voto real. `rate(userId, discId)` tiene índice no único `IDX_rate_user_disc_d46`; el advisory lock serializa la ruta de escritura, no garantiza unicidad histórica.
- `Rate.createdAt` fecha la fila, que puede ser solo cover y no cambia al agregar nota. `editedAt` se actualiza por ediciones musicales y de portada y se sobrescribe. Ninguna es fecha de primera nota musical. `RatesHistoryService` usa ambas para un historial aproximado de creación/edición de filas; no es una fuente de fechas musicales verificadas.
- `occurred_at` sí es fecha del instante de transición registrado. Un `set` fecha el paso de ausencia actual a nota; no demuestra primera valoración vitalicia: pudo existir Rate antes del ledger, borrarse o retirarse y restaurarse. `change` no es voto nuevo.
- Eventos tienen FK de usuario `ON DELETE CASCADE` y de disco `ON DELETE SET NULL`. Al borrar disco, el evento queda con `disc_id=NULL` y no puede asignarse a género. Al borrar nota/Rate, el evento permanece; la lectura actual debe unir Rate con `rate IS NOT NULL`, excluyéndolo hasta que exista valoración vigente. Revalorar no borra eventos anteriores.
- La migración no backfillea. Las pruebas PostgreSQL opt-in prueban rollback transaccional, campos nullable y `SET NULL` de disco, no datos de producción. El repo no acredita el despliegue efectivo del writer ni cuándo se aplicó el ledger; el marcador registra creación de infraestructura, no que el writer ya estuviera activo. Tampoco existe marcador para el inicio de IDs de disco poblados. No se consultó PostgreSQL: fecha real de cobertura por verificar.

**Conclusión:** el modelo actual no permite identificar en general la primera valoración musical real por usuario/disco. Solo fecha `set` conservados, que no se deben presentar como primeras valoraciones de vida. `createdAt`/`editedAt` no son fechas musicales; no hay fuente pre-ledger.

#### Política histórica y cobertura

| Alternativa           | Evaluación                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Solo `set`         | No inventa fechas, pero acredita el primer `set` capturado, puede omitir legacy o contar una revaloración. Solo ofrecer con procedencia `first_captured_set` y cobertura parcial.                                                                                                                                                                                          |
| B. Fechas aproximadas | `createdAt` puede ser cover-only y `editedAt` cualquier edición. No justifican ni siquiera una estimación del primer voto; se descarta.                                                                                                                                                                                                                                    |
| C. Ledger durable     | Guardar transaccionalmente fecha de primera nota, inmutable y con unicidad por usuario/disco; borrar Rate no borra el hecho. Permite probar primeras valoraciones solo para parejas sin historia previa al corte. Pares actuales deben quedar marcados como legacy sin fecha; parejas votadas y borradas antes del corte son imposibles de identificar retrospectivamente. |

Recomendación: C para garantizar primeras valoraciones futuras de parejas sin historia anterior al seguimiento (`verified_first_vote`), sin backfill desde fechas ambiguas. Los pares existentes al corte (incluidas valoraciones borradas cuyo rastro ya no está) siguen sin fecha vitalicia fiable. Hasta tener ledger durable y corte real de despliegue, no presentar `set` actuales como “votos nuevos” exactos. Se requiere aprobar para D-8c.2 si se acepta temporalmente A, claramente parcial, o se espera C. Ninguna alternativa reconstruye el pasado con exactitud.

`rate_vote_event_capture.started_at` detecta que una semana empieza antes de crear el marcador, pero no confirma writer activo, IDs enriquecidos ni continuidad. Cero solo comprobado cuando el intervalo completo está cubierto. Semana anterior al corte: desconocida; cruce del corte: parcial; semana actual: semana a la fecha con `asOf`. Contrato: `coverage.status` `complete | partial | unavailable`; métricas `null` para parcial/no disponible y `0` solo con cobertura completa. Error SQL/HTTP se propaga como error, no se transforma en cero ni estado de cobertura.

#### Géneros, métricas y HTTP

Catalog tiene una relación singular `Disc.genre` vía `disc."genreId"`; no hay géneros secundarios ni vínculo del género al artista. Contar el género actual del disco, distinto por ID. Sin género: suma cero géneros, pero el disco sí cuenta en votos/media. No filtrar por lanzamiento. Reclasificar hoy afecta el histórico, como el agregado `countCurrentGenresForDiscSets`.

Con cobertura verificada: votos nuevos = parejas cuya primera valoración real cae en semana Madrid; nota media = media actual de esas Rates (no `new_value`), excluir notas eliminadas y conservar `0`, devolver `null` si no hay nota vigente; géneros = géneros actuales distintos de discos con nota vigente. El evento de una nota borrada puede seguir contando en el total desde ledger, pero no en media ni lista.

Propuesta: `GET /api/rates/weekly-summary`, Rates controller, `@Auth()` y usuario desde `@GetUser()`, sin parámetros ni `userId`. No reutilizar `GET /rates/user/:userId/history`: actualmente carece de `@Auth()` y acepta ID arbitrario.

```json
{
  "timezone": "Europe/Madrid",
  "period": {
    "start": "2026-10-26T00:00:00+01:00",
    "endExclusive": "2026-11-02T00:00:00+01:00",
    "asOf": "2026-10-27T12:00:00+01:00"
  },
  "coverage": {
    "status": "complete",
    "source": "verified_first_vote_ledger",
    "coveredFrom": "2026-10-20T09:30:00Z"
  },
  "week": { "newVotes": 2, "currentAverageRate": 8.25, "exploredGenres": 2 },
  "recentVotes": [
    {
      "disc": {
        "id": "disc-uuid",
        "name": "Album",
        "image": "https://example.test/cover.jpg",
        "releaseDate": "2024-06-14",
        "artist": { "id": "artist-uuid", "name": "Artist" }
      },
      "currentRate": 8.5,
      "firstVoteAt": "2026-10-26T17:24:00Z",
      "dateProvenance": "verified_first_vote"
    }
  ]
}
```

Con cobertura parcial/no disponible, las métricas son `null`. Lista de máximo cinco, una por disco, valoración actual y fecha con procedencia; A usaría `first_captured_set`, nunca `verified_first_vote`. Incluir solo ID/nombre/imagen de disco, fecha de lanzamiento si la navegación la necesita, ID/nombre de artista, nota, instante y procedencia. No incluir usuario/email, cover, comentarios, favoritos, pendientes, medias comunitarias ni eventos crudos. Reutilizar proyección de Catalog solo mediante interfaz pública mínima.

#### Consulta, índices y riesgos

Derivar lunes y lunes siguiente con `date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')`; convertir medianoches a `timestamptz` y filtrar `[start,end)`. Maneja semanas DST de 167/169 horas y evita conversiones fila a fila antes del filtro.

Con fuente futura: CTE de contexto (usuario, límites, corte), primera fila durable por pareja, aplicar período antes de agregar; agregar total; unir Rate vigente, Disc y género para media/géneros; recientes con joins a Rate (`rate IS NOT NULL`), Disc y Artist, ordenar por fecha descendente y desempatar `disc.id ASC`, `rate.id ASC`, y luego `LIMIT 5`. Agregar en PostgreSQL y devolver a lo sumo una fila de resumen y cinco proyecciones. Nada de descargar historia a Node, N+1 o consultas por disco. Si se usa A, `MIN(occurred_at)` por usuario/disco para `set` identificables antes del rango, con la semántica limitada ya descrita.

Índices observados: `rate_vote_events(user_id, occurred_at)`, `(occurred_at)`, `rate(userId, discId)`, `rate(discId)`. No hay unicidad de pareja. No proponer índice nuevo sin `EXPLAIN (ANALYZE, BUFFERS)` con datos/params representativos aislados. No se midieron planes ni tiempos.

Nota de vigencia: el contrato, SQL y política histórica de esta investigación describen el diseño anterior con primeras valoraciones. La decisión de producto posterior lo sustituye: el widget se basará en Rates actuales y en su última actividad; no se implementará endpoint de primeras valoraciones ni se consultará `rate_vote_events` para el widget.

### D-8c.2a — Seguimiento durable de primeras valoraciones

**Estado:** revertida por decisión de simplificación el 2026-10-27.

Se retiró exclusivamente la infraestructura de esta subtarea: entidad y tabla `rate_first_musical_votes`, entidad y marcador `rate_first_musical_vote_capture`, writer idempotente, migración `1792020000000-CreateRateFirstMusicalVotes` y pruebas específicas. Al revisar el estado local, la migración seguía como archivo sin seguimiento de Git y no apareció evidencia nueva de aplicación. La ejecución anterior también dejó constancia de que no se ejecutó en ninguna base. No se consultó producción, no se ejecutaron migraciones ni se borraron tablas/datos.

Las escrituras de Rates vuelven a su estado anterior: `create`, `update` y `remove` conservan las transacciones existentes y la escritura de eventos musicales `set`/`change`. El sistema previo `rate_vote_events` y `rate_vote_event_capture.started_at` permanece intacto. No se añadió migración de reversión porque la nueva migración no se aplicó.

### D-8c.2b — Endpoint semanal de primeras valoraciones

**Estado:** cancelado en su diseño original por la nueva decisión de producto. No se implementó ni se añadirá un endpoint basado en fecha de primera valoración o en `rate_vote_events`.

### Nuevo diseño: rates por última actividad

El widget conserva el identificador técnico `ultimosVotos` y se titulará «Tu semana musical». El cálculo futuro utilizará exclusivamente filas actuales de `rate` y relaciones Catalog. No usará `rate_vote_events` ni añadirá historial. Describe la última actividad visible de cada Rate, no una lista completa de acciones.

- Actividad de una Rate: `GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt"))`, expresión ya utilizada por `ActivityService`. Como alternativa equivalente para valores normales, Catalog/Rates ya ordenan portadas con `COALESCE(editedAt, createdAt)`. Desempate estable por `rate.id`.
- `createdAt` fecha la fila; puede representar una valoración solo de portada. `editedAt` es una única fecha sobrescrita por cualquier modificación de Rate, musical o de portada; no conserva ediciones previas ni su tipo. Filas borradas ya no están disponibles. Por tanto, actividad semanal y últimos cinco son una proyección de estado actual, no auditoría completa. No inferir primera nota musical ni fecha de cada acción.
- La entidad no declara explícitamente tipo con zona horaria para estos campos y la conexión TypeORM no configura zona. El futuro SQL debe verificar el tipo real de las columnas y la zona de almacenamiento de datos antes de convertir a `Europe/Madrid`; no asumir que son instantes UTC solo por el tipo JS `Date`.
- Semana natural semiabierta `[lunes 00:00 Madrid, lunes siguiente 00:00 Madrid)`. Una Rate cuenta una sola vez cuando su última actividad actual cae en el período.
- Indicadores: (1) total de Rates activas, incluyendo cover-only; (2) media de `rate` actual no nulo de esas Rates; (3) géneros actuales distintos para Rates musicales; (4) disco mejor valorado entre ellas, con desempate estable; (5) género dominante por cantidad de Rates musicales; (6) comparación con la semana anterior solo si puede computarse en una agregación acotada. Si se compara la semana en curso, comparar el mismo tramo local transcurrido de la semana previa o exponer que el período actual está incompleto; no comparar sin aviso semana parcial con una completa.
- `Tus últimos 5 Rates` incluye Rates de portada y musicales, ordenadas por su última actividad descendente y `rate.id` como desempate. No aplicar límite antes de restringir al usuario actual.
- Las métricas que requieren nota excluyen `rate IS NULL`; una Rate cover-only sí cuenta para actividad y últimos cinco. `0` es una nota musical válida. Géneros vienen de `Disc.genre` actual y se deduplican por género; sin género no agrega un género.

No hay nuevo agregado ni endpoint en esta reversión. D-8c debe verificar el tipo y semántica temporal desplegados, caracterizar consumidores/payload y diseñar una consulta única PostgreSQL que aplique usuario y ventana antes de agregar/limitar, sin N+1 ni descarga de Rates a Node. Revisará si el índice existente `rate(userId, discId)` basta; no se propondrán índices sin plan representativo. La implementación futura deberá preservar auth y contratos hasta acordar el endpoint en su propio alcance.

### D-8c — Backend simplificado

**Estado:** completada en backend; D-8d y D-8e siguen pendientes.

Se añadió `GET /api/rates/dashboard-summary`, autenticado con `@Auth()` y ligado exclusivamente al ID obtenido con `@GetUser()`. No acepta `userId`, no devuelve entidades y no consulta `rate_vote_events`. El DTO contiene el intervalo semiabierto `[start, endExclusive)` ISO UTC, `timezone: Europe/Madrid`, seis métricas y hasta cinco Rates recientes con disco, artista, portada, notas actuales y última actividad.

La actividad se calcula con `GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt"))`. La inspección del writer confirmó que `RatesService.create` actualiza una Rate existente y `RatesService.update` establecen `editedAt = new Date()`; ambos caminos permiten cambios musicales y de portada. Una Rate nueva recibe `createdAt`. `remove` elimina la fila y no deja actividad consultable. Así, `editedAt` es la modificación más reciente conocida, no un historial ni una fecha del tipo de cambio. Se conserva el alcance de estado actual: al cambiar una Rate de semana, deja de contar en la semana anterior.

La semana y la anterior se delimitan en Node resolviendo los lunes a medianoche de `Europe/Madrid`, convertidos a instantes UTC. La consulta compara fechas como límites semiabiertos; cubre cambios de mes/año y semanas de 167/169 horas por DST. En PostgreSQL una sola consulta filtrada por usuario produce conteos, media, géneros distintos, mejor disco, género dominante y `LIMIT 5` reciente. La media y el mejor disco consideran solo notas musicales no nulas (0 es válida); el total semanal y género dominante incluyen Rates solo de portada; los géneros se deduplican por ID y los nulos se ignoran. Empates: disco por nota DESC, nombre ASC, disco ID ASC y Rate ID ASC; género por cantidad DESC, nombre ASC e ID ASC; recientes por actividad DESC e ID ASC. Si no hay notas, media/mejor disco son `null`; sin Rates o géneros, los conteos son 0 y la lista vacía. La diferencia es `actual - anterior`; el porcentaje es `null` si la semana anterior vale cero.

**Limitación temporal pendiente de confirmación ambiental:** la entidad no declara `timestamptz` ni zona, no se encontró una migración de creación de `rate` que pruebe el DDL desplegado y no se consultó una base. La consulta interpreta los valores `timestamp` de Rate como reloj UTC (`AT TIME ZONE 'UTC'`) y serializa la actividad con sufijo `Z`; esto coincide con el flujo habitual de `Date` del writer, pero no prueba cómo se almacenaron todas las filas ni la zona de sesión histórica. Antes de usar la semana como dato financiero/forense debe verificarse el tipo real y muestrearse el comportamiento en un entorno aislado. No se inventan fechas ni se consulta el ledger de eventos.

Pruebas locales nuevas cubren límites Madrid, cruce de año, DST, estados vacíos, nota cero, cover-only, porcentaje, aislamiento por parámetro, SQL de una consulta y contrato/auth del endpoint. Los dobles comprueban construcción del contrato y SQL, no la ejecución del SQL ni sus agregaciones en PostgreSQL. No se encontró/configuró una base PostgreSQL aislada para esta tarea; las restricciones y resultados SQL quedan pendientes de integración PostgreSQL. No se añadieron índices porque no se midió un plan representativo con `EXPLAIN (ANALYZE, BUFFERS)`.

### D-8d — Frontend «Tu semana musical» (pendiente)

Consumir `GET /api/rates/dashboard-summary` y presentar las métricas con las limitaciones de última actividad actual.

### D-8e — Smoke tests manuales (pendiente)

Validación manual del usuario sobre la integración completa.

D-8a y D-8b no están presentes en esta rama; no se crean ni sobrescriben identificadores para ellas.

## D-ART — «Tus artistas favoritos»

### D-ART-3 — Endpoint backend independiente

**Estado:** completada en backend el 2026-10-27. D-ART-4 y D-ART-5a se completaron después; las tareas posteriores conservan sus estados indicados abajo.

La decisión aprobada es añadir `GET /api/rates/artists/top`, autenticado, de solo lectura y vinculado exclusivamente al ID de `@GetUser()`. No acepta `userId`, parámetros ni ejecuta consultas geográficas. El DTO explícito es `{ artists: RatesTopArtistDto[] }`; cada elemento expone `id`, `name`, `image` nullable, `ratingCount` y `averageRate`. `ratingCount` significa discos distintos del usuario con una nota musical no nula; una nota `0` sí cuenta.

PostgreSQL filtra primero por usuario y `rate IS NOT NULL`. Para duplicados de `(user, disc)`, una CTE de `ROW_NUMBER()` selecciona una fila: la marca temporal más reciente entre `createdAt` y `editedAt` (si es nula, se usa `createdAt`) y, si empatan, `rate.id` descendente. Esta es una regla determinista para el estado actual; no modifica ni elimina filas existentes. La consulta agrupa por artista y cuenta discos distintos. **D-ART-3b sustituye el ranking inicial** por la puntuación bayesiana documentada más abajo; la media expuesta continúa siendo la media musical personal real. No hay filtro temporal, se conserva la política existente sobre discos futuros y la consulta aplica `LIMIT 7` después de calcular y ordenar el score.

La lectura es independiente de Geography y no carga Rates en Node ni realiza N+1. Se preserva `GET /api/rates/home-insights`, su DTO y su consulta histórica (`topArtists` y `countries` incluidos); el ranking nuevo no cambia retroactivamente. Retirar `home-insights` se considerará cuando todos sus consumidores hayan sido migrados y auditados, sin adelantar esa limpieza.

Las pruebas unitarias con dobles cubren la ruta autenticada, identidad de sesión, DTO sin países, filtros, deduplicación, fecha/desempate de Rates duplicadas, conteo/orden/límite SQL, query única sin escrituras ni geografía y conservación de `home-insights` y Geography. Hay una suite opt-in PostgreSQL con un destino vacío `bc_id_3f_3_*` para comprobar conteos, medias, empates, nota cero, null/cover-only, duplicados, aislamiento y límite con el SQL real. No se configuró una base aislada en esta ejecución; esa suite queda sin ejecutar y las agregaciones reales de PostgreSQL no se afirman como verificadas.

La tarea no modifica frontend, Rates de escritura, Geography, esquemas, migraciones ni dependencias. D-ART-4 cubre el Top 7 frontend; D-ART-5a implementa el resumen personal; D-ART-5b evoluciona el modal; D-ART-6 añade filtros; D-ART-7 integra Last.fm; y D-ART-8 cubre smoke tests.

### D-ART-3b — Revisión bayesiana del ranking

**Estado:** completada en backend el 2026-10-27. D-ART-4 se completó después y el estado de D-ART-5a se registra más abajo; las tareas posteriores conservan sus estados indicados allí.

El ranking calcula en PostgreSQL `score = (n × R + m × C) / (n + m)`. `n` es la cantidad de discos distintos del artista del usuario; `R` su media personal; `C` la media musical global de ese usuario, con una sola Rate vigente por disco; `m = 2`, declarada como `RATES_ARTISTS_BAYESIAN_PRIOR_STRENGTH`. La media global se calcula directamente sobre el conjunto personal deduplicado, no promediando artistas. Solo entran Rates del usuario autenticado con `rate IS NOT NULL`; cero cuenta, votos de portada no. Si el usuario no tiene valoraciones musicales, devuelve `artists: []`.

Se conserva la deduplicación de D-ART-3: partición por disco después del filtro usuario/nota, mayor marca temporal entre `createdAt` y `editedAt` (con fallback a `createdAt`) y `rate.id DESC` para desempatar. No se modifica ninguna fila. CTEs SQL calculan la media global, `n`, `R` y score; el endpoint no carga Rates en Node, no usa Geography y no ejecuta N+1. El score no se añade al DTO: permanece interno, mientras `averageRate` sigue siendo `R` sin ajuste. Orden final: score DESC sin redondeo previo, media real DESC, cantidad de discos DESC, nombre ASC e ID ASC; luego `LIMIT 7`. El contrato HTTP, `home-insights` y Geography permanecen intactos.

#### Escenarios revisados con `m = 2`

- Dos discos a `9,85` frente a uno a `10`: con `C = 8`, los scores son `8,6375` y `8,2833`; lideran los dos discos. Con `C = 9,9` (media de esas tres valoraciones), son `9,875` y `9,9333`; lidera la nota 10. Por tanto, superar al 10 depende de la media global, como prescribe la fórmula; no se añaden excepciones.
- Dos discos a `7` frente a uno a `10`, con `C = 8`: `7,5` frente a `8,6667`; las notas 7 no desplazan automáticamente al 10.
- Cinco discos a `9,9` frente a uno a `10`, con `C = 5,95` (incluyendo cuatro discos a cero): `8,7714` frente a `7,3`; varias notas excelentes aportan confianza y pueden liderar.
- Diez discos a `6` frente a uno a `10`, con `C = 70/11`: `6,0606` frente a `7,5758`; el volumen mediocre no domina.

Las pruebas unitarias inspeccionan la fórmula SQL, parámetro constante `m`, promedio global, orden sin `ROUND`, DTO, aislamiento por usuario y ausencia de consulta geográfica; no se consideran ejecución real de SQL. La suite opt-in PostgreSQL comprueba fórmula/ranking para esos escenarios, media/desempates, ceros, null/cover-only, duplicados, aislamiento y límite. No había una base aislada configurada en esta ejecución, así que PostgreSQL real no se ejecutó y la semántica de agregación queda pendiente de esa validación. `home-insights` conserva su prueba existente y no se toca. Typecheck, build, ESLint focalizado, gates arquitectónicos, runtime dependency gate y `git diff --check` forman parte de la verificación de esta tarea.

### D-ART-4 — Top 7 frontend y modal inicial

**Estado:** completada en frontend, según la integración posterior a D-ART-3b. No se modifica frontend en las tareas backend siguientes.

### D-ART-5a — Resumen personal y discos valorados del artista

**Estado:** completada en backend el 2026-10-27. D-ART-5b (evolución del modal frontend), D-ART-6 (filtros), D-ART-7 (Last.fm) y D-ART-8 (smoke tests) siguen pendientes.

Ruta autenticada `GET /api/rates/artists/:artistId/summary`. `artistId` es UUID validado con `ParseUUIDPipe`; la identidad proviene de `@GetUser()` y no se acepta `userId`. Responde 404 si no existe el artista. No altera `/artists/:id/details`, `/rates/artists/top`, `home-insights` ni Geography.

El DTO contiene `artist` (`id`, `name`, `image`, `country` con `id/name/isoCode`, y `genres` como IDs/nombres distintos del catálogo actual), `stats` (`ratedDiscCount`, `averageRate`, `highestRatedDisc`, `lowestRatedDisc`, `firstAvailableActivityAt`, `lastAvailableActivityAt`) y `discs` (`data`, `total`, `page`, `limit`, `totalPages`). Cada disco incluye ID, nombre, imagen, fecha de lanzamiento, nota musical actual, nota de portada nullable, Rate ID y `lastActivityAt`. Los highlights llevan ID/nombre/nota; empates de mejor/peor se resuelven por ID de disco ascendente. `averageRate` es la media personal real, no el score bayesiano.

Dos consultas de solo lectura comparten la misma CTE de elegibilidad. La primera devuelve metadata de Catalog y calcula estadísticas sobre el conjunto completo; la segunda selecciona una página en PostgreSQL. Ambas filtran primero por usuario, artista y `rate IS NOT NULL`, incluyen cero y usan `ROW_NUMBER()` por disco para conservar la Rate de actividad más reciente (`GREATEST(createdAt, COALESCE(editedAt, createdAt))`), con `rate.id DESC` como desempate. No consultan otros usuarios, `rate_vote_events`, Geography ni agregados comunitarios, y no descargan el historial para paginar. Los géneros son `DISTINCT` sobre los discos actuales del catálogo del artista; no existe relación de género directamente en Artist. País, imagen, lanzamiento, portada y géneros ausentes se serializan como `null` o lista vacía según el campo.

Paginación: `page` base 1, default 1 y máximo 10.000; `limit` default 10 y máximo 100. Ambos son enteros positivos validados y `userId` u otros parámetros desconocidos se rechazan. La respuesta informa total de discos deduplicados y páginas; totalPages es cero para un conjunto vacío. El orden fijo inicial es última actividad descendente e ID de disco ascendente. Filtros futuros deben añadirse al mismo CTE elegible antes de stats y paginación, sin implementarlos en 5a.

`firstAvailableActivityAt` es el menor `createdAt` conservado entre las Rates actuales deduplicadas; `lastAvailableActivityAt` es el mayor `GREATEST(createdAt, COALESCE(editedAt, createdAt))`. La lista usa esa última actividad. Son fechas disponibles en las filas actuales, no el primer/último voto musical histórico: `editedAt` puede reflejar una modificación de portada y no existe historial reconstruible. Se serializan como timestamp de base sin offset de zona (`YYYY-MM-DDTHH:mm:ss.ffffff`); la entidad no declara zona horaria y no se consultó una base para verificar el tipo/semántica desplegados. `releaseDate` se serializa como fecha de calendario `YYYY-MM-DD`.

Las pruebas con dobles cubren respuesta completa/vacía, 404, estadísticas independientes de página, parámetros y orden SQL, deduplicación, UUID, auth de sesión, validación de paginación y no inclusión de eventos/geografía/escrituras. Hay suite PostgreSQL opt-in para duplicados temporales y por ID, conteo/media/extremos, ceros y cover-only, aislamiento, fechas, metadatos opcionales, página/orden y artista inexistente. No había variables ni una base aislada configuradas, así que la suite PostgreSQL no se ejecutó: los mocks y aserciones SQL no se presentan como validación real de PostgreSQL. Tests focalizados, typecheck, build, ESLint, gates estructural/tipos, runtime dependency gate y `git diff --check` pasaron.

### D-ART-6 — Filtros del widget

El alcance de D-ART-6 es el widget «Tus artistas favoritos» del Dashboard; no incluye filtros en el modal. D-ART-6a corresponde al ranking backend por período y D-ART-6b al selector frontend. D-ART-6b sigue pendiente.

#### D-ART-6a — Ranking bayesiano por período

**Estado:** completada en backend el 2026-10-27. D-ART-6b (selector frontend), D-ART-7 (Last.fm) y D-ART-8 (smoke tests) siguen pendientes.

`GET /api/rates/artists/top` acepta `period=month|year|all`; si se omite, usa `all`. Devuelve hasta cinco artistas con el DTO existente, sin exponer el score. `month` y `year` usan los períodos naturales actuales de `Europe/Madrid`; `all` no restringe fechas. Los límites son semiabiertos `[inicio, fin)`. La fecha es la última actividad disponible de la Rate actual, `GREATEST(createdAt, COALESCE(editedAt, createdAt))`: una edición puede mover una Rate antigua al período actual. No se reconstruye historial.

La consulta existente conserva la deduplicación por usuario/disco (actividad descendente e ID de Rate descendente) antes del filtro temporal. Después calcula sobre el mismo conjunto filtrado la media global `C`, las medias y conteos personales por artista, y el score `(n × R + 2 × C) / (n + 2)`. Se mantienen los desempates por score, media real, cantidad, nombre e ID; el límite se aplica en PostgreSQL. No consulta Geography.

**Convención temporal y limitación:** `Rate` declara `createdAt`/`editedAt` sin tipo explícito; los defaults del driver TypeORM son `timestamp` sin zona. Para permanecer coherente con `RatesDashboardSummaryService`, el ranking trata esos valores como reloj UTC y compara contra medianoches Madrid convertidas a timestamps UTC sin zona. El CTE deriva ambos límites desde una única hora de PostgreSQL con `Europe/Madrid`, por lo que los intervalos respetan los cambios DST y no dependen de la zona de sesión. No se inspeccionó el esquema ni datos históricos de una base PostgreSQL aislada: la convención UTC es la del código existente, no una verificación del almacenamiento desplegado. No se cambió el esquema. Pasaron las suites focalizadas de Stats y Controller (41 tests), typecheck, build, ESLint focalizado, gates estructural y de tipado, runtime dependency gate y `git diff --check`. No había PostgreSQL aislado disponible; las aserciones unitarias inspeccionan la consulta pero no validan su ejecución, límites DST ni resultados reales de PostgreSQL.

## D-9 — Cementerio

### D-9b — Decisión funcional

**Estado:** cerrada en esta iteración.

Cementerio significa discos sin ninguna valoración musical comunitaria actual (`Rate.rate IS NOT NULL` no existe para ningún usuario). No se consideran votos de portada, favoritos, pendientes, eventos `rate_vote_events`, actividad reciente ni el historial del usuario autenticado. Cualquier nota musical no nula excluye el disco, incluida 0,10. La inspección del backend encontró una discrepancia con la premisa de nota mínima: `CreateRateDto` permite `@Min(0)` con dos decimales, y `Rate.rate` es `decimal(4,2) nullable`; el backend de escritura, por tanto, también permite actualmente `0,00`. D-9c no altera ni depende de ese contrato: ambas notas no nulas excluyen. El widget solicita dos discos: devuelve dos si existen al menos dos candidatos, uno si existe exactamente uno y una lista vacía si no hay ninguno. No se guarda historial ni se promete evitar repetición entre peticiones.

Se conservan las fechas: `Disc.releaseDate <= hoy` excluye lanzamientos futuros y fechas nulas, igual que el `/discs/random` existente. El sorteo continúa con `ORDER BY RANDOM()`. `unratedByCommunity=true` no se combina con `difficulty`; la validación responde 400 con un mensaje explícito. `false` no aplica el filtro y puede coexistir con `difficulty`.

### D-9c — Selección backend Catalog/Rates

**Estado:** completada en backend; D-9d y D-9e permanecen pendientes.

`GET /api/discs/random?unratedByCommunity=true&limit=2` reutiliza la ruta autenticada `GET /api/discs/random`; no acepta identidad de usuario en query. `unratedByCommunity` es opcional, acepta solo los literales `true`/`false` tras transformación estricta y devuelve 400 para otros valores. La dificultad y la selección de discos olvidados son modos incompatibles cuando el parámetro es `true`. `false` no aplica el filtro. Los filtros `genre`, `country`/`countryId`, `year`, `ep`, `debut` y `limit` continúan en la consulta.

Rates proporciona el predicado interno comunitario `NOT EXISTS` sobre filas `rate` con `rate IS NOT NULL`; no compara con un umbral, no consulta eventos y no usa `voted=false`. Así, filas solo de portada y duplicados sin valor musical no excluyen; una o varias valoraciones musicales válidas sí excluyen. Catalog aplica el predicado antes de `ORDER BY RANDOM() LIMIT`, selecciona IDs y reutiliza una sola consulta de hidratación para los candidatos. En modo Cementerio también exige `link` e `image` no nulos ni vacíos (tras recortar espacios), para entregar discos navegables y con portada. Esta elegibilidad adicional no altera `/discs/random` cuando el filtro está ausente o es `false`. La respuesta conserva el mapper/relaciones de `/discs/random`, incluido ID, álbum, artista/país, género, imagen, fecha, medias, `voteCount`, comentarios, `userRate`, favorito y pendiente. Para estos candidatos `voteCount` musical es cero; datos de portada como `averageCover` pueden seguir presentes.

### D-9c — Reposición para completar el límite

El endpoint repone candidatos si la primera selección o hidratación devuelve menos elementos que el límite solicitado. Cada reposición vuelve a seleccionar aleatoriamente en PostgreSQL y excluye los IDs ya intentados; solo solicita los IDs que faltan. Se permiten hasta dos reposiciones, y se detienen antes al completar el límite o cuando no hay más candidatos; así se conserva el resultado parcial si el catálogo elegible realmente es menor y se acota el trabajo ante un fallo anómalo de hidratación. No se carga el catálogo en memoria ni se repite por candidato individual.

Verificación focalizada de la reposición: `src/catalog/discs/catalog/__tests__/disc-catalog.service.spec.ts`, 93 tests aprobados, incluidos completar dos con una segunda selección y devolver uno cuando la selección restante está vacía. `git diff --check` pasa. `pnpm run quality:typecheck` no pudo iniciarse: pnpm informó `unable to open database file`; la compilación de TypeScript no se ejecutó en esta corrección.

`voted=false` queda intacto: filtra la ausencia de una nota propia del usuario y no sirve como indicador comunitario. `previousDiscId` conserva su semántica previa: solo se aplica al modo `difficulty` y, si no quedan alternativas, permite repetir el único candidato. No cambia la conducta para llamadas existentes. El filtro nuevo no usa `previousDiscId` ni estado personal para definir elegibilidad. El endpoint reduce la integración de hasta seis peticiones HTTP del widget a una; internamente conserva la selección de IDs seguida por hidratación de los seleccionados, sin cargar el catálogo elegible completo ni hacer N+1.

Las pruebas focalizadas de Rates, validación DTO, controller y Catalog pasan: 4 suites, 113 tests. Incluyen booleanos, incompatibilidad con `difficulty`, criterios de elegibilidad musical y cover-only/0,10/duplicados mediante la condición `IS NOT NULL`, filtros, fechas, selección aleatoria/límite, cero o menos candidatos, hidratación y `voteCount = 0`. La cobertura existente conserva autenticación, los tres niveles de dificultad, `previousDiscId` y contratos sin parámetro. Typecheck, build y runtime dependency gate pasan; pasan los siete tests de quality gates. El gate estructural conserva 9 hallazgos y el de tipado seguro 5; ESLint conserva 839 diagnósticos del baseline, sin nuevos. `git diff --check` pasa. `pnpm run verify` no inicia porque pnpm informa `unable to open database file`. La suite unitaria completa termina con 209 suites aprobadas, 11 fallidas y 14 opt-in omitidas (2.040 tests aprobados, 106 fallidos y 91 omitidos); los fallos HTTP observados son `listen EPERM` al enlazar `0.0.0.0` en este sandbox.

La consulta no se ejecutó contra PostgreSQL: no hay una base aislada configurada para esta tarea. Las pruebas verifican el contrato SQL y la selección/hidratación con dobles locales; no miden el plan ni el coste de `ORDER BY RANDOM()`. No se añaden índices, tablas ni migraciones. D-9d (extracción frontend) y D-9e (pruebas frontend/smoke autenticado) siguen pendientes; no se modificó el frontend.
