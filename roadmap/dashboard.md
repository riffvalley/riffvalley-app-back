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
