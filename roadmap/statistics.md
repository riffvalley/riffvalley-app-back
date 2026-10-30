# Estadísticas — EST

## EST-BE-2 — Contratos HTTP, DTOs y validaciones de Estadísticas

**Estado:** completada el 2026-10-29. El DTO compartido, sus validaciones, los tipos de respuesta y la retirada de los contratos legacy están implementados. No se implementaron cálculos nuevos ni se consultó PostgreSQL.

Ambas rutas requieren `year` de cuatro cifras (2025 hasta el año actual en `timeZone`) y aceptan `timeZone` IANA opcional, con fallback explícito `UTC`. Por decisión de esta tarea se rechazan años futuros según el año civil actual de la zona seleccionada. Los dos endpoints conservan autenticación y derivan el usuario de `@GetUser()`; no reciben `userId` público.

La población contractual exige simultáneamente año civil de `Disc.releaseDate` = año seleccionado y año local de asignación/voto = año seleccionado. La fuente será `Rate.createdAt` como aproximación en 2025–2026 y eventos `set` de `rate_vote_events.occurred_at` desde 2027; `change` no cuenta como actividad. Las métricas de nota usan la Rate vigente. EST-BE-2 no implementa esos filtros ni agregaciones.

El contrato tipado usa `activityCount` anual como cantidad de discos distintos con actividad elegible; el calendario diario usa también discos distintos por fecha. Los conteos mensuales y por género conservan su unidad de asignaciones Rate/eventos `set`. `scoredDiscs`, `mean`/`median` anulables, `scoreDistribution`, disco destacado, controversia y galaxia describen las puntuaciones vigentes. Sus unidades están documentadas en `src/community/rates/dto/rates-user-stats.dto.ts`. Se retiran `yearOverYear`, `totalVotes`, `totalUsers`, `rank`, `weeks` y las etiquetas antiguas que confundían actividad con puntuaciones; el reemplazo no intenta mantener compatibilidad. La cobertura desconocida se expresa como `unknown`, magnitudes indeterminables como `null`, resultados ausentes como colecciones vacías y cero solo cuando sea una cifra calculada y conocida.

El selector histórico de EST-BE-3 implementa la cohorte de Rates 2025–2026 y EST-BE-4 implementa las agregaciones, todavía pendientes de verificación PostgreSQL real. Los dos endpoints continúan respondiendo HTTP 501 mientras no se conecte una composición contractual verificada; no ejecutan consultas legacy ni devuelven respuestas estadísticas parciales.

## EST-BE-3 — Cohorte anual histórica de Estadísticas (2025–2026)

**Estado:** completada el 2026-10-29 para la selección reutilizable. No implementa agregaciones ni modifica los endpoints: ambos continúan en HTTP 501.

`RatesHistoricalCohortService.selectForUser(userId, year)` solo acepta 2025 y 2026. Filtra con parámetros por `rate."userId"`, `disc."releaseDate" >= inicio` y `< fin`, y `rate."createdAt" >= inicio` y `< fin`. El año editorial usa límites `date`; el año de Rates usa medianoches locales Europe/Madrid y rango semiabierto. No usa `editedAt` para elegibilidad. El contrato de producto aceptado interpreta los valores históricos de `createdAt` como Madrid local y no convierte datos almacenados desde UTC.

La consulta funciona con ambos tipos PostgreSQL posibles: si `createdAt` es `timestamp without time zone`, compara directamente los límites civiles locales; si es `timestamp with time zone`, compara instantes UTC calculados desde las medianoches Madrid y proyecta el valor local con `AT TIME ZONE 'Europe/Madrid'`. No se verificó el tipo físico desplegado. La entidad sigue sin tipo explícito y la migración inicial de `rate` no está en este repo; la convención Madrid es una decisión de producto, no una garantía de cómo se guardaron originalmente los valores.

El resultado separa:

- `historicalAssignments`: una fila por Rate que cumple ambos años, aunque `rate` actual sea `NULL` o esté fuera de escala. Filas duplicadas permanecen en esta cohorte y pueden contar como múltiples registros históricos aproximados.
- `currentScoredDiscs`: como máximo una puntuación por disco. Para duplicados gana `editedAt DESC NULLS LAST`, después `createdAt DESC` e `id DESC`. Solo se admiten notas actuales finitas dentro de 0–10. Si la fila determinista ganadora tiene nota nula o inválida, ese disco no entra en la cohorte puntuable; no se recupera una nota vieja de otra duplicada.

La selección no carga relaciones eager ni historial en memoria mediante ORM: ejecuta una consulta SQL parametrizada con join a Disc y window function, aislada por usuario. `Disc.releaseDate` es PostgreSQL `date` nullable (día civil; sin precisión/procedencia que identifique si año/mes eran conocidos); `Rate.rate` es decimal(4,2) nullable y la escritura acepta 0–10. Existe el índice no único `(userId, discId)`, pero no una restricción única. `RatesService.create()` serializa escrituras normales; esto no elimina la posibilidad de duplicados legacy.

La aproximación no puede reconstruir Rates borradas, cuándo se puntuó por primera vez una Rate creada sin nota, los valores de nota anteriores a cambios ni asignaciones retiradas sin evidencia retenida. `editedAt` solo ayuda a escoger el valor vigente entre duplicados; no prueba fecha histórica de voto.

**Tests y verificaciones:** Jest focalizado pasó con 58 tests; los dos casos de PostgreSQL quedaron omitidos porque no había servidor local. Pasaron typecheck, build, ESLint/Prettier focalizados, `git diff --check` y enlaces Markdown. Se preparó una suite PostgreSQL gated por `RATE_STATS_COHORT_PG_INTEGRATION=1`, con base vacía loopback y prefijo `est_be3_cohort_`, para ejercitar límites/duplicados con `timestamp` y `timestamptz`; no se ejecutó y los mocks no se presentan como prueba SQL. Un intento adicional del test de módulo de Rates falló al inicializar el proveedor `SpotifyConnectionRepository` porque el fixture existente no registra `DataSource`; no corresponde al selector y no se modificó.

EST-BE-4 añade agregaciones de actividad para totales, meses y días sobre esta cohorte sin activar el selector desde HTTP. EST-BE-5 añade la selección de eventos `set` desde 2027, sin agregaciones ni conexión HTTP. Las tareas EST-BE-6 en adelante cubren géneros, puntuaciones, destacados, controversia y galaxia.

## EST-BE-4 — Agregaciones históricas de actividad (2025–2026)

**Estado:** implementación lista; cierre pendiente de verificación SQL PostgreSQL local. Los endpoints `GET /rates/stats` y `GET /rates/stats/discs` siguen respondiendo HTTP 501; no se conectó ninguna respuesta parcial.

`RatesHistoricalAggregationsService` expone internamente el total anual, doce meses y calendario diario activo sobre la CTE de `helpers/historical-rate-cohort-query.ts`, compartida con `RatesHistoricalCohortService.selectForUser()`. La población exige usuario solicitado, `Disc.releaseDate` en el año y `Rate.createdAt` dentro del mismo año. La selección de puntuaciones sigue separada de las agregaciones; el helper comparte únicamente la elegibilidad y parámetros. No consulta el ledger ni carga Rates históricas en memoria. El total anual y cada día cuentan discos distintos; cada mes conserva el conteo de filas Rate. Las Rates sin nota vigente siguen aportando actividad.

Los doce meses se identifican por `YYYY-MM`, usan el mes de creación local y contienen cero cuando no hay filas. El calendario usa `YYYY-MM-DD`, solo devuelve fechas con actividad y ordena de forma determinista; cada detalle diario corresponde a un disco único en esa fecha. Las sumas mensuales coinciden con la atribución por género más `activityWithoutGenre`; no se comparan con el total anual distinto ni con la suma diaria, porque un disco puede tener asignaciones en varios meses o días. Un día ausente significa que no hay una Rate elegible en la fuente histórica disponible, no que se haya demostrado ausencia absoluta de actividad pasada. Con fuente vacía el total es `0`, los doce meses son cero y el calendario es `[]`.

La convención de `createdAt` histórico es fija: `Europe/Madrid`, independiente del parámetro contractual `timeZone`, que corresponde a la estrategia moderna basada en instantes reales. Para `timestamp without time zone` se interpreta directamente el valor civil guardado; para `timestamptz` se aplican límites instantes de medianoche Madrid y `AT TIME ZONE 'Europe/Madrid'` antes de extraer mes/día. Las comparaciones y agrupaciones no dependen de la zona de sesión PostgreSQL. No se presupone que los `timestamp` ingenuos estuvieran guardados en UTC.

**Tests y verificaciones:** Jest focalizado pasó con 24 tests; 2 casos de integración PostgreSQL quedaron omitidos en esa ejecución previa. En EST-BE-4b se comprobó que `psql` y `pg_isready` están instalados, pero `pg_isready` no encuentra servidor; faltan los binarios `postgres`, `initdb` y `pg_ctl`, el paquete `postgresql-16` no está instalado y no existe un cluster local. Docker está instalado, pero el usuario no puede acceder a su socket. No se instaló software ni se cambiaron permisos del sistema. El test PostgreSQL no se ejecutó en EST-BE-4b: 0 pruebas reales ejecutadas, 0 aprobadas y 0 fallidas; por tanto no se cuenta como una pasada ni como una suite sin omisiones. La suite aislada queda preparada para probar ambos tipos temporales y variación de zona, pero los mocks no sustituyen integración SQL. No se ejecutaron suites completas, E2E, migraciones ni consultas a producción.

**Pendiente para cerrar EST-BE-4:** ejecutar la suite PostgreSQL aislada con `timestamp without time zone` y `timestamptz`, incluida la variación de zona de sesión. En EST-BE-4b se confirmó que no hay servidor ni binarios locales de servidor; el paquete PostgreSQL no está instalado y Docker no es accesible para el usuario actual. Preparar otra instancia requeriría instalar software o cambiar permisos del sistema, fuera de la autorización disponible para esta tarea. No se conectó a ninguna base ni se ejecutaron migraciones. EST-BE-4 permanece pendiente hasta que pasen las pruebas PostgreSQL reales sin omisiones. La futura composición contractual HTTP y las métricas de EST-BE-5 en adelante son trabajo posterior. No se implementan 2027, puntuaciones, géneros, destacados, controversia ni galaxia.

## EST-BE-5 — Cohorte anual de eventos `set` (2027+)

**Estado:** implementación y verificaciones focalizadas completadas el 2026-10-29. La integración PostgreSQL aislada está preparada, pero no se ejecutó porque no hay servidor PostgreSQL local; esto no cuenta como validación PostgreSQL aprobada. Los endpoints `GET /rates/stats` y `GET /rates/stats/discs` siguen respondiendo HTTP 501.

`RatesEventSetCohortService.selectForUser({ userId, year, timeZone })` define la población moderna reutilizable y solo acepta años enteros desde 2027. `timeZone` es opcional y usa `UTC` si se omite; se valida como zona IANA. La consulta SQL parametrizada filtra el usuario indicado, `event_type = 'set'`, la transición ledger `previous_value IS NULL AND new_value IS NOT NULL`, la publicación editorial mediante `Disc.releaseDate >= YYYY-01-01 AND < (YYYY+1)-01-01`, y `occurred_at >= inicio AND < fin`. El rango temporal se calcula como instantes UTC desde las medianoches locales del año elegido, sin depender de la zona de sesión PostgreSQL. Cada fila conserva el `eventId` y se ordena por instante e ID; varios `set` del mismo disco permanecen como eventos independientes. El servicio selecciona eventos únicamente: no calcula agregaciones ni discos únicos o Rates vigentes.

El `INNER JOIN` a `disc` y el filtro de fecha excluyen eventos con `disc_id` nulo, discos eliminados o no resolubles, y discos con `releaseDate` nula. No se reconstruyen esas relaciones mediante títulos, Spotify ni Rates, por lo que esos datos reducen la cobertura histórica observada. El ledger permite eventos legacy sin disco/valores; tampoco se consideran elegibles si no acreditan la transición `set` nula→no nula. La entidad define `occurred_at` como `timestamptz`; `user_id` UUID obligatorio con FK a User y borrado en cascada; `disc_id` UUID nullable con FK a Disc y `ON DELETE SET NULL`; y `previous_value`/`new_value` nullable `decimal(4,2)`. El check de BD limita `event_type` a `set`/`change`; el DTO de escritura de Rates valida puntuaciones entre 0 y 10 con hasta dos decimales. Los índices existentes son `(user_id, occurred_at)` y `(occurred_at)`, sin índice por `disc_id`. No se añadieron índices ni migraciones.

**Tests y verificaciones:** Jest focalizado pasó con 26 tests; la suite PostgreSQL gated `RATE_STATS_EVENT_COHORT_PG_INTEGRATION=1` quedó omitida (0 pruebas reales ejecutadas, 0 aprobadas y 0 fallidas). Esa integración comprueba filtros editoriales y temporales, límites exactos, eventos incompletos, cambios, usuario ajeno y variación de zona de sesión en una base loopback vacía con prefijo `est_be5_event_cohort_`; no se marca como aprobada. Los casos unitarios ejercitan `UTC`, `Europe/Madrid`, `America/Los_Angeles` y `Pacific/Kiritimati`, incluidos los límites locales de Año Nuevo. También pasaron typecheck, build, ESLint/Prettier focalizados, `git diff --check` y validación de enlaces Markdown. No se ejecutaron suites completas, E2E, migraciones ni consultas a producción.

EST-BE-6 consume esta población para total anual, meses y días; EST-BE-7 podrá añadir la actividad por género. Las métricas de puntuación requerirán una proyección separada de discos únicos elegibles. La integración PostgreSQL de EST-BE-4 y EST-BE-5 sigue pendiente independientemente del cierre de estas agregaciones.

## EST-BE-6 — Agregaciones de actividad mediante eventos `set` (2027+)

**Estado:** completada el 2026-10-29 para implementación y verificaciones focalizadas. La integración PostgreSQL real queda pendiente; no se considera validada por los mocks. `GET /rates/stats` y `GET /rates/stats/discs` continúan en HTTP 501.

`RatesEventSetAggregationsService.aggregateActivityForUser(userId, year, timeZone?)` ejecuta una sola consulta con la CTE de `helpers/event-set-cohort-query.ts`, compartida con `RatesEventSetCohortService`. No replica los filtros de elegibilidad ni carga eventos individuales. Cuenta cada `eventId` elegible: dos o más eventos `set` del mismo disco contribuyen cada uno al total; no cuentan discos únicos, Rates vigentes, transiciones `change`, eventos incompletos ni eventos de otro usuario. La unión a `disc` exige un disco resoluble y `releaseDate` del año seleccionado.

La agregación calcula el total anual de discos distintos, conteos mensuales por evento `set` y conteos diarios por disco distinto desde las mismas filas elegibles. Mes y día salen de `occurred_at AT TIME ZONE` con la zona IANA parametrizada. El servicio construye los doce meses en orden con ceros donde no haya eventos, y un calendario disperso con una fila por fecha civil local activa (`YYYY-MM-DD`), ordenado cronológicamente. Con cohorte vacía devuelve total cero, doce meses en cero y calendario vacío. Los conteos son enteros no negativos; valida que el detalle diario coincida y que el total de meses coincida con la atribución por género más actividad sin género. La suma mensual y diaria no tiene que coincidir con los discos únicos anuales.

El selector calcula los límites semiabiertos como instantes UTC correspondientes al 1 de enero local y al 1 de enero siguiente. Las agrupaciones usan la misma zona IANA solicitada (fallback `UTC`), no la zona de sesión PostgreSQL; una fecha local puede cruzar el límite UTC, y los días DST conservan su fecha civil aunque tengan 23 o 25 horas. La estrategia rechaza 2025 y 2026 y no modifica la semántica temporal histórica. Eventos antiguos incompletos, discos borrados o fechas de publicación nulas reducen la cobertura observada; no se reconstruyen desde Rates.

**Tests y verificaciones:** Jest focalizado pasó con 18 tests; los dos archivos de integración PostgreSQL quedaron omitidos, con cuatro tests omitidos (0 pruebas SQL reales ejecutadas, 0 aprobadas y 0 fallidas). La suite nueva gated `RATE_STATS_EVENT_AGGREGATIONS_PG_INTEGRATION=1` prepara una base loopback vacía con prefijo `est_be6_event_aggregations_` y comprueba el SQL real para repetición de eventos por disco, filtros de usuario/tipo/transición/publicación, meses y días, UTC, `Europe/Madrid`, `America/Los_Angeles`, `Asia/Kathmandu`, límites de año, DST y zona de sesión. No se intentó instalar PostgreSQL, cambiar permisos de Docker ni consultar bases externas; el entorno documentado no tiene servidor PostgreSQL local accesible. También pasaron typecheck (0 errores), build, ESLint sin autocorrección, Prettier focalizado y `git diff --check`. No se ejecutaron suites completas, E2E, migraciones ni consultas a producción.

El proveedor `RatesEventSetAggregationsService` queda registrado y exportado por `RatesModule` para consumo interno. Esta tarea no compone contratos HTTP, no activa consultas legacy y no implementa géneros, puntuaciones, destacados, polémica ni galaxia. La siguiente tarea recomendada es EST-BE-7: actividad por género a partir de la misma cohorte, teniendo en cuenta que el género actual del catálogo no es snapshot del evento.

## EST-BE-7 — Agregaciones de actividad por género

**Estado:** completada y aceptada en EST-BE-11 con la semántica de género único actual del catálogo para esta versión. Cada Rate histórica o evento `set` aporta como máximo una unidad al género actual del disco; discos sin género cuentan en `activityWithoutGenre`. No se introducen relaciones múltiples ni migraciones.

Los servicios históricos y modernos reutilizan sus CTEs de elegibilidad y agregan la cohorte sobre la relación canónica actual `Disc.genre` (`disc."genreId"` → `genre.id`). Los conteos por género preservan filas Rate elegibles o eventos `set`, igual que los meses; el total anual cuenta discos únicos y los días cuentan discos únicos por fecha. Ninguna consulta usa eventos `change` ni mezcla fuentes entre años. El resultado contiene `activityByGenre` con conteos por nombre y `activityWithoutGenre` para asignaciones en discos sin relación resoluble. Cada servicio comprueba que meses y atribución por género más actividad sin género coincidan; estos conteos pueden superar el total anual de discos únicos. Los nombres de género no tienen unicidad declarada en la entidad, así que el agregado consolida entidades con el mismo nombre para ajustarse al contrato actual, que expone `genre: string` sin ID.

**Hallazgo de modelo:** Disc tiene una única relación opcional `ManyToOne` a Genre y no existe tabla intermedia ni campo de géneros secundarios. La atribución a todas las asociaciones se aplica a la única asociación que el catálogo permite hoy; no es posible representar un disco vinculado simultáneamente a Black Metal, Atmospheric Black Metal y Post-Metal ni que una asignación contribuya a los tres. Tampoco se puede reconstruir una asociación de género histórica: la relación es el género actual del catálogo. Ampliar esa capacidad requiere definir y migrar un modelo de géneros múltiples y decidir cómo identificar géneros con nombres duplicados en el contrato.

**Tests y verificaciones:** Jest focalizado pasó con 17 tests; 5 casos PostgreSQL quedaron omitidos porque la integración requiere una base aislada loopback y no había servidor local accesible. El typecheck pasó con 0 errores. Las suites PostgreSQL existentes se adaptaron para crear tablas `genre` y probar atribución, pero no cuentan como validación SQL real mientras permanezcan omitidas. No se ejecutaron migraciones ni se consultó una base externa.

Las entidades de género con nombres duplicados se consolidan en el mismo grupo por `genre.name`, como requiere el contrato público que solo expone el nombre. No se cambia identidad ni contrato en esta tarea. La posible incorporación futura de géneros múltiples requiere una decisión y migración separadas.

### EST-BE-1 — Diseño definitivo del backend

**Estado:** completada el 2026-10-29. Diseño y contrato propuestos; no implementado. Solo se actualizaron documentos. No se modificaron código ejecutable, DTOs, endpoints, migraciones ni datos; no se consultó PostgreSQL ni producción.

EST-BE-1 fijó la población, las fuentes y el significado de las métricas. EST-BE-2 cierra y reemplaza las propuestas de nombres/shape de respuesta y compatibilidad que siguen en esta sección, manteniendo las reglas funcionales aprobadas. La decisión de producto prevalece sobre la semántica actual descrita en la auditoría EST-3.

### Regla de población anual

Para `year=Y`, un voto/disco solo pertenece a la población anual si se cumplen a la vez:

1. El disco tiene `Disc.releaseDate` en el año natural `Y`.
2. El usuario autenticado asignó el voto dentro del año natural `Y`, según la fuente asignada a ese año.

En forma abreviada: **año de publicación = año del voto = `year`**. No entran discos de otro año, aunque el usuario los vote en `Y`; tampoco discos publicados en `Y` cuyo voto se asigne después. La fecha de publicación filtra la cohorte; la fecha de voto filtra la actividad dentro de esa cohorte.

Un disco puede producir varios eventos `set` en un año si la nota se retira y se vuelve a asignar. La unidad de actividad desde 2027 es el evento, no el disco único. Rates no conserva de forma equivalente las reasignaciones históricas.

### Fuentes por año y matriz de métricas

| Métrica                                                  | Fuente 2025–2026                                                                                                       | Fuente desde 2027                                                                                         | Población y unidad                                                                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Total anual `totalVotes`                                 | Una fila Rate del usuario/disco con nota vigente no nula y `Rate.createdAt` en el año local; es aproximación histórica | Evento `rate_vote_events` del usuario con `type='set'`, `disc_id` asociado, `occurred_at` en el año local | Asignaciones aproximadas por fila Rate en 2025–26; eventos `set` desde 2027. No discos únicos                                                                                                                                  |
| Ranking existente `rank`                                 | Filas Rate elegibles por usuario                                                                                       | Eventos `set` elegibles por usuario                                                                       | Puesto ordinal entre usuarios ordenados por la misma unidad de actividad anual; empates deterministas por ID de usuario. No se añade un ranking nuevo. Véase decisión pendiente sobre exposición/coste                         |
| Votos por mes                                            | `Rate.createdAt`, mes local                                                                                            | `occurred_at` de eventos `set`, mes local                                                                 | Votos elegibles, no publicación mensual; doce entradas fijas, incluso con cero. `month` se normaliza a `YYYY-MM`                                                                                                               |
| Votos por género                                         | Rates elegibles unidos a todos los géneros actuales del disco                                                          | Eventos `set` elegibles unidos a géneros actuales del disco                                               | Cada actividad se atribuye una vez a cada género distinto del disco. La suma puede superar `totalVotes`; los sin género quedan fuera del desglose y se reflejan en `unclassified` si se conserva el desglose aditivo propuesto |
| Calendario diario `votesByDay`                           | `Rate.createdAt`, día local                                                                                            | `occurred_at` de eventos `set`, día local                                                                 | Conteo de votos elegibles; año completo con ceros solo con cobertura completa, si no calendario disperso                                                                                                                       |
| Media y mediana                                          | Nota vigente de Rate del usuario para cada disco de la cohorte con al menos una actividad elegible Rate del año        | Nota vigente de Rate para cada disco que tenga al menos un evento `set` elegible del usuario en el año    | Una puntuación vigente por usuario/disco, una vez por disco elegible; nunca notas de eventos                                                                                                                                   |
| Distribución `votesByScore`                              | Mismas notas vigentes que media/mediana                                                                                | Mismas notas vigentes que media/mediana                                                                   | Puntuaciones actuales, bucket por entero según regla pendiente; no distribución histórica                                                                                                                                      |
| Disco destacado y destacados por género/mes ya presentes | Rate vigente de candidatos elegibles                                                                                   | Rate vigente de candidatos que tengan actividad `set` elegible                                            | Mayor puntuación vigente; selección de género/mes sobre la actividad elegible asociada al disco                                                                                                                                |
| Discos polémicos `mostControversial`                     | Rate personal vigente de candidatos elegibles y Rates comunitarias vigentes                                            | Rate personal vigente de discos con `set` elegible y Rates comunitarias vigentes                          | Comparación actual no histórica; media incluye al consultante y exige cuatro votantes ajenos válidos distintos                                                                                                                 |
| Galaxia `GET /rates/stats/discs`                         | Rate vigente de discos de la cohorte con Rate creada en el año (proxy)                                                 | Rate vigente de discos con evento `set` elegible del usuario                                              | Un elemento por disco puntuado elegible, aunque la actividad histórica tenga varios eventos                                                                                                                                    |
| Comparación `yearOverYear`                               | No recomendada                                                                                                         | No recomendada                                                                                            | Retirar del contrato objetivo: los años cruzados no son comparables con claridad suficiente                                                                                                                                    |

**Término “voto” en esta propuesta:** para actividad significa una asignación observable por la fuente del año; para métricas de puntuación significa una Rate vigente y válida. Son poblaciones relacionadas, pero no idénticas cuando falta la Rate actual. El contrato debe informar los estados vacíos y la base temporal sin presentar ambos conceptos como un mismo conteo.

### Transición Rates → eventos

#### 2025 y 2026: Rates como aproximación

- La actividad se infiere de Rates que aún existen, pertenecen al usuario, corresponden a un disco publicado en el año seleccionado, tienen puntuación actual no nula y cuya fecha de creación cae en el año local seleccionado.
- `Rate.createdAt` es solo aproximación: una fila pudo crearse sin nota y puntuarse más tarde; editar una nota no mueve `createdAt`; eliminar una Rate borra la evidencia; no se reconstruyen todas las asignaciones, cambios o retiradas. Una Rate retirada/eliminada no cuenta actividad histórica. Una nota actual puede diferir de la de aquel año.
- Una Rate existente sin puntuación no demuestra una asignación y no cuenta como actividad elegible. Esta decisión evita convertir una fila vacía conocida en voto. Si el usuario asignó y después quitó la nota sin eliminar la fila, la fuente actual no permite saber cuándo ocurrió; el caso se clasifica como no verificable, no se inventa un voto.
- No se rellenan ni corrigen Rates con eventos. Aunque hubiera eventos capturados para esos años, no se combinan ambas fuentes.
- Descripción de calidad recomendada en la respuesta: `activityBasis: "rate_created_at_estimate"`. Es una etiqueta de fuente, no una afirmación de reconstrucción exacta.

#### Desde 2027: eventos `set`

- La actividad cuenta solo filas del usuario de sesión con `event_type='set'`, `disc_id IS NOT NULL`, disco existente y año local de `occurred_at` igual a `year`; se exige además `Disc.releaseDate` en `year`.
- `change` nunca suma un nuevo voto. `previous_value` y `new_value` no sustituyen a la nota vigente de Rate para media, mediana, distribución, destacados, controversia o galaxia.
- Varios `set` del mismo disco en el año cuentan como varios eventos de actividad. Para estadísticas de puntuación, el disco se incluye una sola vez y se usa una única Rate vigente.
- Eventos legacy sin `disc_id` o cuyo disco se eliminó (FK `ON DELETE SET NULL`) no se pueden unir a fecha de publicación, género ni galaxia; quedan fuera de todas las métricas de esta población. No se les atribuye disco por inferencia ni se rellenan desde Rate.
- La marca `rate_vote_event_capture.started_at` y los eventos sin asociaciones completas implican cobertura incompleta antes del inicio de captura o para filas legacy incompletas. La cohorte desde 2027 se describe como fuente de eventos capturados, no como historia anterior reconstruida.
- Etiqueta de fuente recomendada: `activityBasis: "set_events"`.

#### Actividad histórica sin puntuación vigente

Un evento `set` posterior puede seguir contando en actividad, mes, género y calendario aunque ya no exista una Rate vigente. No entra en media, mediana, distribución, disco destacado, controversia ni galaxia. Para 2025–26 no hay forma de conservar esa actividad tras borrarse la fila, ni distinguir con certeza una retirada de una ausencia de asignación; no se debe simular esa precisión.

### Año, zona horaria y publicación

#### Parámetros propuestos

Ambos endpoints aceptan `year` y `timeZone`:

```text
GET /api/rates/stats?year=2026&timeZone=Europe%2FMadrid
GET /api/rates/stats/discs?year=2026&timeZone=Europe%2FMadrid
```

- En el contrato objetivo, `year` es obligatorio en ambos endpoints. La implementación actual lo omite y agrega varios años, pero eso no tiene una interpretación única bajo la nueva regla anual. La transición debe coordinar el consumidor antes de exigirlo; no sustituir una omisión por “todos los años” ni cambiarla silenciosamente al año actual.
- `year`: entero de cuatro dígitos, desde 2025 inclusive. EST-BE-2 rechaza años futuros con relación al año actual de la zona IANA seleccionada, para evitar presentar períodos todavía no transcurridos como población anual vacía. Años anteriores a 2025 se rechazan porque este diseño no asigna fuente ni garantiza cobertura para ellos. El rango técnico superior queda acotado al año civil representable por PostgreSQL y debe validarse explícitamente.
- `timeZone`: nombre IANA válido. Se recomienda el casing camelCase que usa ActivityHistory (`timeZone`), no `timezone` ni un offset fijo. Rechazar strings vacíos, offsets como `+02:00`, abreviaturas y zonas inválidas con HTTP 400.
- Si se omite `timeZone`, usar explícitamente `UTC`, compatible con el valor por defecto actual de ActivityHistory. No usar la zona local del servidor. El frontend debería enviar la zona IANA del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) cuando esté disponible.
- Reutilizar el criterio de validación IANA de ActivityHistory, pero mantener el DTO y la responsabilidad del contrato de Estadísticas dentro de Rates; no acoplar módulos ni reutilizar clases de dominio por conveniencia.

#### Límites y conversión

El año de actividad es el intervalo local semiabierto `[Y-01-01 00:00, (Y+1)-01-01 00:00)` en `timeZone`. Convertir ambos límites civiles a instantes UTC y consultar con `>= startUtc AND < endUtc`; nunca usar `23:59:59.999` ni `BETWEEN` inclusivo. Convertir cada `occurred_at` y cada instante inequívoco de `Rate.createdAt` a la zona solicitada antes de agrupar por día/mes. Un instante próximo a medianoche puede pertenecer a otro día/año según la zona, de forma intencional.

Los límites se calculan como medianoches locales en fechas consecutivas, no sumando 365/366 días a un instante. Los años que contienen cambio DST pueden tener intervalos UTC de distinta duración; los días de cambio pueden durar 23 o 25 horas. La etiqueta de día local sigue siendo única y correcta. Para `Rate.createdAt`, el decorador actual no declara el tipo/zona PostgreSQL; antes de implementación hay que verificar la columna física y decidir cómo interpretar timestamps sin zona sin asumir que ya son instantes UTC.

#### Año de publicación

`Disc.releaseDate` está declarado como PostgreSQL `date`, nullable: representa una fecha civil sin hora ni zona. El filtro de publicación usa directamente el año de esa fecha de catálogo; `timeZone` no desplaza la fecha de publicación. Nulo queda excluido de la población. El campo puede contener una fecha completa, pero el modelo no guarda precisión/procedencia que permita distinguir día exacto de una fecha aproximada importada. El contrato lo tratará como fecha civil provista por catálogo, sin inferir hora, zona o precisión histórica adicional. Si en el futuro se necesitan años publicados sin día conocido, primero hará falta un modelo explícito de precisión o un campo anual; no se debe derivar ni inventar en esta tarea.

### Métricas de actividad

- **Total anual:** cuenta la unidad de actividad indicada en la matriz; no deduplica eventos `set`. En Rates no se puede discernir con seguridad un duplicado histórico por usuario/disco de una acción, por lo que los datos con duplicados potenciales quedan como limitación técnica a auditar. No usar `COUNT(DISTINCT disc_id)` para reemplazar el total.
- **Ranking existente:** hoy compara usuarios por cantidad de filas Rate puntuadas y no expresa ranking por año del voto. La propuesta conserva el campo solo si el coste/privacidad de agregado global es aceptable y redefine su unidad como actividad elegible por usuario, con misma fuente, cohorte y periodo. No se crea otro ranking. `totalUsers` actual es población global, no número de participantes; se recomienda retirar ambos campos (`rank`, `totalUsers`) del contrato objetivo si la UI no demuestra consumo imprescindible, o mantenerlos de forma coordinada si el frontend los usa. Esta comprobación es pendiente antes del cambio HTTP, no una nueva decisión de producto.
- **Meses:** siempre 12, enero–diciembre en orden, identificados por `month: "YYYY-MM"`, con `count: 0` cuando corresponda. `votesByMonth[].count` debe sumar `totalVotes`. Mes corresponde a fecha de asignación/proxy en zona local, nunca a mes de publicación. Las semanas actuales `weeks` no están aprobadas como métrica y usan semana de mes; retirarlas del contrato objetivo salvo confirmación de consumidor. Los `topDisc` existentes son puntuaciones, no conteos: solo se conservan si están definidos dentro de discos con actividad elegible en ese mes y puntuación vigente.
- **Géneros:** una asignación se cuenta una vez en cada ID de género distinto asociado al disco; evitar fan-out por uniones y nombres duplicados. La suma puede superar el total. Un disco sin género contribuye al total y a `unclassified`, no desaparece del denominador. Desde 2027 se usa el catálogo actual del disco; no se presentan géneros históricos. El modelo de Disc auditado solo expone un `genreId` principal, así que la asociación de “todos los géneros” deberá tomar las asociaciones reales disponibles en la implementación, no suponer que hay una relación múltiple. Precisar esa fuente es pendiente técnico.
- **Calendario:** para fuente completa, recomendar `votesByDay` como año completo: cada fecha local desde el 1 de enero hasta el 31 de diciembre inclusive, una sola vez, con ceros; en año actual, hasta hoy local inclusive. Para cobertura parcial o desconocida, recomendar calendario disperso (solo fechas con registros observados), junto con `activityCoverage`, y no materializar fechas no observadas como cero real. La suma de registros diarios observados debe coincidir con `totalVotes`. Los ceros en fuentes Rates representan ausencia de evidencia en la fuente disponible, no certeza de que no ocurriera una asignación histórica.

### Métricas con puntuaciones vigentes

La selección de puntuaciones parte de los discos de la cohorte que tienen actividad elegible en el año, y después une la Rate actual del usuario por disco. Varios eventos del mismo disco colapsan a un solo disco para estas métricas. Si falta Rate actual o su nota es nula, se conserva la actividad, pero se excluye el disco de agregados de puntuación. El contrato recomendado expone `scoredDiscs` para que el frontend pueda distinguir una métrica vacía de una cohorte activa sin notas vigentes.

- Excluir `NULL` de media, mediana, distribución, destacados, controversia y galaxia. No convertirlo a cero.
- Validar notas vigentes contra la escala documentada de Rate (0–10); valores fuera de escala se excluyen de todos los cálculos de puntuación y se consideran anomalía de datos, no se recortan ni normalizan en silencio. Confirmar escala y precisión decimal en implementación.
- Calcular media aritmética y mediana sobre una Rate vigente por usuario/disco elegible. Si no hay notas válidas, `mean` y `median` son `null`, distribución contiene los buckets definidos con cero o un array vacío según cierre de compatibilidad, y `scoredDiscs: 0`.
- Mantener las notas decimales. La distribución actual agrupa primero por valor decimal y luego usa `floor` en buckets enteros 0–10; conservar este significado inicialmente por compatibilidad, explicitar intervalos `[n,n+1)` y confirmar el bucket 10 incluye solo 10. No presentar buckets como valores observados exactos. Alternativa pendiente: distribución por valores de 0.01 si la UI realmente requiere granularidad.
- Si hay Rates duplicadas para una pareja usuario/disco, elegir un criterio determinista de Rate vigente (recomendada: la última por `editedAt`, luego `createdAt`, luego ID) solo para calcular una puntuación por disco y auditar la anomalía. No sumar duplicados en puntuaciones. Confirmar unicidad e impacto con datos autorizados antes de implementación; no cambiar constraints aquí.
- Una Rate que cambió en 2027 puede seguir definiendo la puntuación mostrada para Estadísticas 2026 si el disco tiene actividad elegible en 2026. Se trata de una fotografía de notas actuales sobre una cohorte de actividad pasada, no de la puntuación que existía en 2026. No usar valores de evento para fingir esa fotografía histórica.

### Disco destacado y controversia

**Disco destacado:** conservar `topDiscOverall` y escoger la mayor Rate vigente válida entre discos elegibles con puntuación vigente. Nulos, fuera de escala y discos sin Rate actual no son candidatos. La ordenación implementada es `rate DESC`, fecha elegible más reciente DESC y `disc.id ASC`; en 2025–2026 la fecha es `Rate.createdAt` local Europe/Madrid y desde 2027 es el `occurred_at` más reciente entre los eventos `set` elegibles del disco. Sin candidato, devolver `null`. El resultado usa el contrato existente: ID, nombre, imagen, artista, género nullable y nota vigente. La lista de candidatos se restringe a la población anual compartida.

**Discos polémicos:** EST-BE-9 implementa candidatos con actividad elegible del usuario, una nota personal vigente y Rates comunitarias vigentes válidas. La decisión aprobada el 2026-10-29 incluye la puntuación personal del usuario consultante en la media y exige al menos cuatro votantes ajenos distintos además de él. Primero se elige como máximo una Rate ajena por usuario y disco con `editedAt DESC NULLS LAST`, `createdAt DESC`, `id DESC`; después se excluyen notas nulas o fuera de escala. La media combina esos ganadores externos con la puntuación personal ya seleccionada para el disco elegible, exactamente una vez. `diff = userRate - communityAverage`; se conserva el signo y se ordena por `ABS(diff) DESC`, número total de Rates comunitarias válidas DESC e ID de disco ascendente. Se mantiene el máximo documentado de cinco resultados. Las Rates ajenas comunitarias son actuales y no tienen filtro temporal; solo los discos candidatos deben pertenecer a la cohorte anual doble. El DTO HTTP existente no expone el conteo; la implementación conserva ese conteo en su resultado interno sin alterar el contrato público. Los endpoints permanecen en HTTP 501.

### Galaxia `GET /rates/stats/discs`

Mantener el endpoint bajo demanda. Debe aplicar el mismo filtro doble del resumen y devolver como máximo una entrada por disco elegible con puntuación vigente. EST-BE-10 implementa el shape contractual actual: `id`, `name`, `rate`, `artist` nullable con `name` cuando existe y `genre` actual nullable con `name` y `color`. No se proyectan `image`, fecha de publicación ni metadatos de navegación: no forman parte de `RatesStatsRatedDiscDto` ni de la proyección legacy de referencia. Las relaciones a artista y género son opcionales para la selección; un disco válido no se pierde por carecer de esos metadatos. Eventos repetidos no duplican puntos y discos con evento pero sin Rate vigente quedan fuera de la galaxia aunque sigan contando en actividad.

Shape ilustrativo (valor actual, no nota histórica ni dato real):

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000000",
    "name": "Disco ilustrativo",
    "rate": 8.5,
    "artist": { "name": "Artista ilustrativo" },
    "genre": { "name": "Género ilustrativo", "color": null }
  }
]
```

Para 2026 la entrada requiere Rate creada en 2026 como aproximación y nota vigente. Para 2027 requiere al menos un `set` elegible en 2027 y nota vigente. La respuesta sin candidatos es `[]` en ambos casos; los parámetros `year` y `timeZone` son los mismos que en `/stats`.

### Comparación interanual

Se recomienda retirar `yearOverYear` del contrato objetivo. 2025→2026 usa dos veces la aproximación Rates, pero omisiones/ediciones y el filtro doble impiden prometer equivalencia exacta. 2026→2027 cruza fuentes, granularidades y cobertura distintas. 2027→2028 es conceptualmente más comparable por usar `set`, aunque siguen siendo cohortes de publicación distintas, catálogo mutable y posibles límites de captura. Mantener una comparación genérica obligaría a exponer advertencias y reglas especiales sin ser parte central del producto. Si se recupera después, debe diseñarse como comparación explícita de años completos y con fuente/cobertura visible; no normalizar fuentes ahora.

### Estados y nulos

- **Cero real:** ninguna actividad contada en un periodo con cobertura conocida; contador `0` y buckets/calendario con cero donde el contrato lo define.
- **Año sin votos elegibles:** `totalVotes: 0`, doce meses en cero, calendario en ceros si su cobertura es conocida, `mean: null`, `median: null`, `scoredDiscs: 0`, destacados `null`, controversia y galaxia vacíos.
- **Usuario sin valoraciones:** mismo shape vacío, sin HTTP 404; una cohorte sin Rate vigente puede todavía contener actividad de evento desde 2027.
- **Notas vigentes inexistentes:** no hay media/mediana/distribución puntuada; se conserva total/actividad independiente y se usan nulos/arrays definidos, nunca cero como nota.
- **Histórico aproximado:** `activityBasis: "rate_created_at_estimate"`; esto describe la limitación para todos los conteos 2025–26.
- **Cobertura parcial/desconocida:** no rellenar historia pre-captura como cero. Exponer un indicador pequeño `activityCoverage: "complete" | "partial" | "unknown"` solo si el backend puede determinarlo; para Rates 2025–26 usar `unknown` o `partial` según decisión técnica de si “completo” se reserva a ledger. No añadir campos por métrica.
- **Evento legacy sin disco:** se excluye y no puede atribuirse a un disco; si la incompletitud afecta a cobertura del periodo, no representar las fechas como ceros conocidos.
- **Error de consulta:** error HTTP estándar 5xx; no convertir en una respuesta vacía o en ceros.
- **Comunidad insuficiente:** omitir candidato de controversia si no tiene cuatro votantes ajenos válidos distintos, además del consultante incluido en la media; no poner `diff: 0` ni inventar media.

### Evolución HTTP propuesta

Rutas actuales, sin endpoint nuevo:

```text
GET /api/rates/stats?year=2026&timeZone=Europe%2FMadrid
GET /api/rates/stats/discs?year=2026&timeZone=Europe%2FMadrid
```

Ambas requieren autenticación y derivan usuario exclusivamente de `@GetUser()`/sesión. Validar query con DTO: `year` con formato y rango explícitos; `timeZone` como zona IANA, default explícito UTC. El `ValidationPipe` global transforma y rechaza propiedades ajenas; el nuevo DTO debe respetar ese contrato.

Mantener ruta y campos estructurales cuando sea posible. Cambian de significado `totalVotes`, `votesByMonth[].count`, `votesByGenre[].count`, `votesByDay[].count`, ranking si se conserva, y población de `votesByScore`/media/mediana/top/controversia/galaxia: ahora describen la intersección de cohorte y año de asignación. No alterar el sentido de esos campos sin coordinar migración de frontend. `yearOverYear` se elimina tras transición coordinada. Los campos nuevos mínimos recomendados para que no haya afirmaciones engañosas son `activityBasis`, `activityCoverage` (si determinable) y `scoredDiscs`; evitar un campo genérico por cada métrica.

Forma propuesta del resumen (shape ilustrativo, valores no reales):

```json
{
  "year": 2026,
  "timeZone": "Europe/Madrid",
  "activityBasis": "rate_created_at_estimate",
  "activityCoverage": "unknown",
  "totalVotes": 0,
  "scoredDiscs": 0,
  "mean": null,
  "median": null,
  "votesByGenre": [],
  "votesByMonth": [{ "month": "2026-01", "count": 0, "topDisc": null }],
  "votesByScore": [
    { "score": 0, "count": 0 },
    { "score": 1, "count": 0 },
    { "score": 2, "count": 0 },
    { "score": 3, "count": 0 },
    { "score": 4, "count": 0 },
    { "score": 5, "count": 0 },
    { "score": 6, "count": 0 },
    { "score": 7, "count": 0 },
    { "score": 8, "count": 0 },
    { "score": 9, "count": 0 },
    { "score": 10, "count": 0 }
  ],
  "topDiscOverall": null,
  "mostControversial": [],
  "votesByDay": [],
  "votesWithoutGenre": 0
}
```

El ejemplo muestra solo un mes/día para no enumerar el año entero; respuesta real incluye 12 meses y calendario definido por cobertura. `rank`, `totalUsers` y `weeks` se retiran del contrato: el ranking legacy no representa la cohorte doble y no se acordó reconstruir un agregado global; las semanas de mes no forman parte de las métricas aprobadas. No se implementa compatibilidad para esos campos. `scoreDistribution` conserva 11 buckets enteros de puntuaciones vigentes. `activityWithoutGenre` cuenta actividad sin género sin sumarla a una categoría de género.

Ejemplo ilustrativo desde 2027:

```json
{
  "year": 2027,
  "timeZone": "Europe/Madrid",
  "activityBasis": "set_events",
  "activityCoverage": "partial",
  "totalVotes": 2,
  "scoredDiscs": 1,
  "mean": 8.5,
  "median": 8.5,
  "votesByMonth": [{ "month": "2027-01", "count": 2, "topDisc": null }],
  "votesByDay": [{ "date": "2027-01-02", "count": 2 }],
  "topDiscOverall": {
    "id": "00000000-0000-0000-0000-000000000000",
    "name": "Disco ilustrativo",
    "image": null,
    "rate": 8.5,
    "artist": { "name": "Artista ilustrativo" },
    "genre": null
  },
  "mostControversial": [],
  "votesWithoutGenre": 0
}
```

Los dos eventos pueden pertenecer al mismo disco: `totalVotes=2` y `scoredDiscs=1`. El `rate` del ejemplo es nota vigente, no valor de evento ni necesariamente la nota que motivó ambos eventos. `partial` solo ilustra una captura que no cubre todo el año; no presupone el estado real de captura de ningún entorno.

#### Compatibilidad y transición con frontend

La decisión expresa para Estadísticas es no conservar compatibilidad legacy: ambos endpoints cambian directamente a los contratos de esta tarea y `yearOverYear` se elimina sin sustituto. La adaptación del consumidor frontend queda fuera de este alcance y debe coordinarse como trabajo separado; no se crean rutas paralelas ni adaptadores backend.

### Seguridad y rendimiento para la implementación

- Ambos endpoints conservan `@Auth()`; no aceptar `userId` externo. Usar el identificador de sesión para Rates/eventos y para la lista de discos.
- Validar `year` y `timeZone` antes de consultar. Parametrizar filtros; aplicar intervalos acotados sobre timestamps y fecha de publicación.
- Enlazar cohortes y agregar en SQL por periodo/género sin N+1. Evitar cargar entidades eager innecesarias para agregaciones.
- Deduplicar solo donde sea semánticamente correcto: eventos nunca para total de actividad; una fila por disco para métricas de nota/galaxia; un género distinto por disco y evento para género.
- Revisar índices existentes y planes con datos representativos únicamente en una tarea autorizada de implementación/performance. EST-BE-1 no propone índices, migraciones ni consultas a producción.
- Mantener galaxia bajo demanda y limitar campos a lo que consume la visualización.

### Decisiones técnicas pendientes para los cálculos (EST-BE-3 en adelante)

1. Confirmar el tipo PostgreSQL y semántica almacenada de `Rate.createdAt`; no consultar producción ni asumir cómo interpretar `timestamp without time zone`.
2. Confirmar que `Disc.genreId` es la única asociación vigente antes de agregar el desglose; la implementación actual del catálogo expone un género principal.
3. Verificar la escala/precisión real de Rates y excluir anomalías fuera de 0–10 sin normalización silenciosa.
4. Auditar duplicados por usuario/disco en datos aislados/autorizados y decidir una selección determinista de Rate vigente para métricas de puntuación.
5. Definir cobertura de eventos usando `rate_vote_event_capture.started_at` y eventos incompletos; no afirmar que el histórico previo está completo.
6. EST-BE-9 confirma la discrepancia firmada y fija un mínimo de cuatro votantes ajenos válidos distintos; la media incluye también al usuario consultante.
7. El contrato definido para la galaxia usa ID, nombre, Rate, artista nullable y género actual nullable; no añade imagen, fecha ni metadatos de navegación sin una necesidad confirmada.

Decisiones de contrato cerradas por EST-BE-2: zona IANA con fallback UTC, futuro rechazado según año local actual, score buckets enteros `[n,n+1)` (el 10 representa exactamente 10), cobertura desconocida explícita, sin ranking legacy ni comparación interanual, y sin compatibilidad legacy.

### Roadmap backend de implementación posterior

EST-BE-2 a EST-BE-11 están implementadas o cerradas según sus estados individuales. EST-BE-4 mantiene pendiente la integración PostgreSQL real; esta limitación no bloqueó la composición HTTP. EST-BE-7 se acepta con género único. La siguiente tarea es EST-BE-12 para coordinar el frontend; no forma parte de EST-BE-11. Dependencias en orden:

| ID        | Tarea                                                                        | Dependencias                  | Criterio de salida                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| EST-BE-3  | Cohorte anual de actividad para `/stats` y población común de `/stats/discs` | EST-BE-2                      | Año de publicación y año local de asignación coinciden; Rates como estimado en 2025–26 y `set` desde 2027; fecha local y DST correctos; sin `change` |
| EST-BE-4  | Totales, actividad por mes y calendario                                      | EST-BE-3                      | Implementado; pendiente ejecución PostgreSQL aislada para verificar ambas precisiones temporales y zona de sesión                                    |
| EST-BE-5  | Cohorte anual de eventos `set` para 2027+                                    | EST-BE-2                      | Implementada; filtro compartido por usuario, transición, publicación y año local                                                                     |
| EST-BE-6  | Total anual, actividad por mes y calendario para eventos `set` (2027+)       | EST-BE-5                      | Implementada; total anual y días cuentan discos distintos; meses cuentan eventos; integración PostgreSQL real pendiente                               |
| EST-BE-7  | Actividad por género                                                         | EST-BE-5                      | Atribución sin fan-out; actividad sin género diferenciada; semántica del género actual documentada                                                   |
| EST-BE-8  | Población y agregados de puntuaciones vigentes                               | EST-BE-3 y EST-BE-5           | Una Rate determinista por disco; media, mediana exacta y 11 buckets; null si no hay notas; actividad separada                                        |
| EST-BE-9  | Disco destacado y discos polémicos                                           | EST-BE-8                      | Población elegible compartida, puntuación vigente y media comunitaria deduplicada; mínimo aprobado de cuatro votantes ajenos; discrepancia con signo |
| EST-BE-10 | Galaxia `stats/discs`                                                        | EST-BE-3, EST-BE-5 y EST-BE-8 | Población compartida; una entrada puntuable por disco; `scoredDiscs` idéntico; array vacío si no hay resultados                                      |
| EST-BE-11 | Composición HTTP e integración de Estadísticas                               | EST-BE-3 a EST-BE-10          | Ambos endpoints conectados a los servicios especializados y contratos focalizados verificados; las limitaciones PostgreSQL quedan documentadas       |

Cada tarea debe caracterizar primero el contrato afectado, colocar specs en `__tests__/`, evitar `any`/supresiones y preservar estado local preexistente. Las suites E2E/SQL no se conectan a servicios reales por defecto. Planificar cambios de frontend en documento y aprobación separados tras estabilizar el contrato backend.

### EST-BE-8 — Puntuaciones vigentes: media, mediana y distribución

**Estado:** implementación y verificaciones focalizadas completadas el 2026-10-29. La integración PostgreSQL quedó preparada, pero no ejecutada por falta de servidor local; no se afirma que el SQL haya sido validado en PostgreSQL. Los endpoints `GET /rates/stats` y `GET /rates/stats/discs` siguen en HTTP 501.

`RatesCurrentScoresService.aggregateForUser(userId, year, timeZone?)` implementa la población y las tres métricas. Para 2025–2026 reutiliza `getHistoricalRateCohortQuery()` y sus límites Europe/Madrid; solo considera Rates elegibles por usuario, año de `Disc.releaseDate` y año de `Rate.createdAt`. Entre duplicados de esa cohorte gana `editedAt DESC NULLS LAST`, `createdAt DESC`, `id DESC`, igual que EST-BE-3. Primero se elige esa fila y después se valida su nota: una Rate ganadora nula o inválida excluye el disco y nunca recupera una nota anterior.

Desde 2027 reutiliza `getEventSetCohortQuery()`, colapsa eventos `set` elegibles a `DISTINCT discId` y después une Rates actuales del mismo usuario y disco. Un disco con varios `set` contribuye una sola Rate. Eventos `change`, `new_value` y eventos de otro usuario no dan puntuación; el año de publicación y el instante local del evento conservan los filtros del selector moderno. Rates actuales duplicadas se resuelven con el mismo orden determinista, aplicado sobre todas las Rates del usuario y disco; si gana una nota nula o fuera de escala, no se recupera una anterior.

PostgreSQL calcula en una única consulta parametrizada los agregados y los buckets. La media usa `AVG` sobre `numeric`; la mediana ordena los valores decimales sin convertirlos a entero y promedia las posiciones centrales mediante `AVG` filtrado por `ROW_NUMBER`/`COUNT`, evitando la aproximación de buckets y la conversión interna a `double precision` de `percentile_cont`. El resultado público es `number`, así que la conversión de salida ocurre después del cálculo SQL. Sin puntuaciones, `scoredDiscs` es `0`, y `mean`/`median` son `null`.

`scoreDistribution` contiene siempre los 11 buckets del contrato EST-BE-2 en orden: `score` 0–9 representa `[score, score + 1)` y el bucket 10 representa exactamente 10. La nota decimal se asigna con `FLOOR`, sin redondearla al entero cercano. Buckets vacíos cuentan `0`, los límites son independientes de la etiqueta y la suma se valida contra `scoredDiscs`. Se incluyen notas finitas dentro de 0–10, inclusive; `NULL`, NaN/infinito y valores fuera de escala se excluyen.

Actividad permanece separada de las puntuaciones vigentes: el total anual y el calendario cuentan discos únicos, los meses y géneros cuentan filas Rate elegibles o eventos `set`, y EST-BE-8 cuenta discos únicos con Rate actual válida. Un disco sin Rate actual mantiene actividad pero no contribuye a `scoredDiscs`; por eso tampoco se exige igualdad entre ambos campos. Las puntuaciones son las vigentes al consultar; no reconstruyen el valor que tenía la nota durante el año de actividad. La lógica se registra en `RatesModule`, pero ningún endpoint la invoca.

**Tests y verificaciones:** el Jest focalizado ejecutó 22 tests aprobados en 3 suites; la nueva suite PostgreSQL tuvo 3 casos omitidos (0 ejecutados, 0 aprobados y 0 fallidos). El test contractual HTTP aprobó otros 14 casos y confirmó que ambas rutas siguen en 501 sin consultas legacy. Los tests de servicio verifican selección 2025/2026 frente a 2027+, parámetros, orden de desempate, deduplicación previa al join, media/mediana decimal, límites de bucket, resultado vacío y coherencia de suma. La integración optativa `RATE_STATS_CURRENT_SCORES_PG_INTEGRATION=1` usa una base vacía de loopback con prefijo `est_be8_current_scores_` y prueba las consultas reales con duplicados, nota ganadora nula, desempate por ID y creación, valores 0/10, varios `set`, `change`, otros usuarios, años distintos, actividad sin Rate y año vacío. No se ejecutó porque el entorno conocido no tiene PostgreSQL local; mocks y SQL estático no se presentan como validación real. Typecheck (`tsc --noEmit --incremental false`), Nest build y el gate de dependencias runtime pasaron; también ESLint sin autocorrección, Prettier, `git diff --check` y el enlace local actualizado. Se invocaron binarios locales directamente porque `pnpm exec` no pudo abrir la base SQLite local (`ERR_SQLITE_ERROR`). No se consultó una base externa, ni se ejecutaron migraciones. El test del módulo de Rates conserva el fallo preexistente de sus dos casos al no registrar `DataSource` para `SpotifyConnectionRepository`; se reprodujo y no se corrigió por estar fuera de alcance.

En este punto histórico del roadmap, la verificación PostgreSQL de EST-BE-4/5/6/9/10 seguía pendiente. EST-BE-9 implementó destacado y controversia; EST-BE-10 implementó galaxia. EST-BE-11 conectó posteriormente ambos endpoints y cerró la decisión de género único de EST-BE-7, sin validar SQL real en PostgreSQL.

### EST-BE-9 — Disco destacado y discos polémicos

**Estado:** implementación backend completada el 2026-10-29; las decisiones funcionales de controversia están aprobadas. La suite de integración PostgreSQL aislada queda preparada, pero su ejecución sigue pendiente porque no hay PostgreSQL local disponible. `GET /rates/stats` y `GET /rates/stats/discs` permanecen en HTTP 501.

`getCurrentScorePopulationQuery()` centraliza la selección que EST-BE-8 ya utilizaba: cohorte Rates 2025–2026 con Europe/Madrid o eventos `set` elegibles desde 2027, seguida de una sola Rate vigente por usuario/disco con `editedAt DESC NULLS LAST`, `createdAt DESC`, `id DESC`. La fila ganadora se valida después contra 0–10; una nota nula o inválida no recupera otra Rate. Las puntuaciones de candidatos siempre proceden de `Rate.rate`, nunca del ledger.

`RatesFeaturedDiscService.selectForUser()` devuelve `RatesStatsDiscDto | null`. Ordena puntuación personal descendente, fecha de asignación elegible descendente e ID ascendente. En cohorte histórica usa `Rate.createdAt` local dentro del año; si hay filas duplicadas del mismo disco, la fecha secundaria es la mayor `createdAt` elegible. Desde 2027 agrupa los `set` repetidos por disco y usa el `occurred_at` elegible más reciente. Las consultas unen Artist y Genre únicamente después de determinar la población, para evitar fan-out; incluyen el ID y los campos de disco del contrato EST-BE-2.

`RatesControversialDiscsService.analyzeForUser()` deduplica primero las Rates ajenas comunitarias por usuario/disco con el desempate de EST-BE-8 y valida después el ganador. La puntuación personal seleccionada para el disco elegible entra exactamente una vez en la media, y la elegibilidad requiere al menos cuatro usuarios ajenos válidos distintos además del consultante. `communityRateCount` cuenta los votos externos válidos más el consultante; el resultado interno conserva ese conteo para el desempate y análisis, sin añadir un campo al DTO público. Se conserva `diff = userRate - communityAverage`, con signo; el orden es magnitud absoluta descendente, conteo comunitario descendente e ID ascendente, con límite de cinco. Las Rates ajenas comunitarias son vigentes actuales sin filtro temporal. No se usan puntuaciones de portada ni eventos históricos para la media.

**Contrato:** el contrato EST-BE-2 ya contiene destacados nullable y una colección `mostControversial` con ID, título, imagen, nota personal, media, diferencia firmada, artista y género. No expone el conteo; se mantiene como dato interno porque no se conectan los endpoints y no se cambia el contrato público. No se introduce compatibilidad legacy.

**Pruebas y verificaciones:** Jest focalizado pasó con 67 tests y dos suites PostgreSQL aisladas quedaron omitidas (5 casos; 0 ejecutados, 0 aprobados y 0 fallidos). La integración `RATE_STATS_FEATURED_DISC_PG_INTEGRATION=1` prepara una base vacía loopback con prefijo `est_be9_featured_disc_` y casos para empates de destacado, media incluyendo la nota personal, cuatro votantes ajenos, Rates comunitarias duplicadas, ganador nulo y mínimo insuficiente, y eventos `set` repetidos. Los tests PostgreSQL no se ejecutaron y no se presentan como aprobados. También pasaron `tsc --noEmit --incremental false`, Nest build y el control de dependencias runtime; ESLint sin autocorrección, Prettier focalizado de TypeScript y Markdown, `git diff --check` y la revisión de enlaces Markdown. `pnpm exec` no pudo abrir la base SQLite local, por lo que se usaron los binarios locales directamente. No se ejecutaron suites completas, E2E, migraciones ni consultas a bases externas.

EST-BE-4 continúa pendiente de integración PostgreSQL real; EST-BE-7 conserva sin cambios su estado y decisión pendiente. EST-BE-10 es la galaxia y depende de EST-BE-3/5/8; EST-BE-11 es el cierre de verificaciones aisladas. No se conectan endpoints ni se implementan la galaxia o nuevas agregaciones de actividad en EST-BE-9.

### EST-BE-10 — Selección y proyección de discos de la galaxia

**Estado:** servicio y tests focalizados completados el 2026-10-29. La integración PostgreSQL aislada está preparada, pero no ejecutada por falta de servidor local; no se considera validación SQL aprobada. `GET /rates/stats` y `GET /rates/stats/discs` permanecen en HTTP 501 y no invocan este servicio.

`RatesGalaxyDiscsService.selectForUser(userId, year, timeZone?)` acepta internamente el usuario obligatorio, año y zona IANA opcional. Reutiliza `getCurrentScorePopulationQuery()` sin duplicar filtros: para 2025–2026 se apoya en la cohorte de Rates con convención Europe/Madrid; desde 2027 reutiliza eventos `set` elegibles, deduplicados a un disco antes de buscar la Rate vigente. Siempre toma la puntuación de `Rate.rate`, nunca de valores del ledger. La Rate ganadora se determina antes de validar la nota y mantiene `editedAt DESC NULLS LAST`, `createdAt DESC`, `id DESC`; una ganadora nula o fuera de escala excluye el disco sin recuperar una fila anterior. La consulta no aplica límite ni lee filas de otros usuarios como fuente de notas personales.

La colección devuelta es `RatesStatsRatedDiscDto[]`: `id`, `name`, puntuación `rate`, artista `{ name } | null` y género `{ name, color } | null`. No se agregan `image`, fecha de publicación, país u otros metadatos de navegación: no están en el DTO de galaxia vigente ni son necesarios para la proyección backend requerida. `disc` se une después de la selección; artista y género usan `LEFT JOIN`, evitando excluir discos por relaciones ausentes y sin multiplicación por género múltiple. Cada disco aparece una vez por la deduplicación previa de la población; homónimos conservan IDs distintos. El orden estable es puntuación vigente descendente, título ascendente e ID ascendente. Sin resultados se devuelve `[]`; los errores SQL y las notas inconsistentes no se convierten en vacío.

**Hallazgo de contrato:**

**Current behavior:** `RatesStatsRatedDiscDto` declaraba `artist` obligatorio, mientras que la relación `Disc → Artist` permite ausencia; Genre también es opcional.

**Problem:** un `INNER JOIN` o un artista inventado rompería respectivamente la igualdad con `scoredDiscs` o la fidelidad del catálogo.

**Impact:** backend + frontend cuando se conecte el endpoint.

**Options:** excluir discos sin artista (rompe la igualdad), representar un nombre ficticio, o permitir `artist: null` y conservar el disco.

**Recommendation:** se tipó `artist` como nullable. El usuario de la respuesta debe tratar ausencia explícitamente al integrar la visualización.

**Blocks the current task:** No; se corrigió el tipo del contrato antes de conectar la ruta.

**Tests y verificaciones:** 12 tests unitarios focalizados pasaron. Cubren selección de fuentes 2025/2026/2027, parámetros y reuso de CTE, validación de usuario y zona IANA, desempate y validación posterior, `LEFT JOIN` de relaciones opcionales, proyección tipada, vacíos, orden, error SQL propagado y ausencia de límite. La integración `RATE_STATS_GALAXY_PG_INTEGRATION=1` prepara una base vacía loopback con prefijo `est_be10_galaxy_`; incluye publicación/año de asignación, otros usuarios, Rates duplicadas con ganadora nula o inválida, eventos `set` repetidos, `change`, homónimos, metadatos opcionales y comparación exacta de longitud con `scoredDiscs`. En esta ejecución sus dos casos quedaron omitidos: 0 consultas PostgreSQL ejecutadas, 0 aprobadas y 0 fallidas. Typecheck, Nest build, ESLint focalizado sin autocorrección, Prettier focalizado, gate de dependencias runtime y `git diff --check` pasaron. No se ejecutaron suites completas, E2E, migraciones ni consultas externas. `pnpm exec` no pudo abrir la base SQLite local; se usaron los binarios locales directamente.

En ese corte previo a EST-BE-11, EST-BE-4 seguía pendiente de verificación PostgreSQL y EST-BE-7 aún no tenía decisión cerrada. EST-BE-11 conectó después los endpoints sin ejecutar PostgreSQL y aceptó la semántica de género único.

### Criterios de aceptación de EST-BE-1

- La regla doble de año es inequívoca y común a ambos endpoints.
- Rates se limita a actividad aproximada 2025–2026; eventos `set` se usan desde 2027, sin mezclar fuentes ni usar `change` como voto.
- Actividad y puntuación vigente están separadas; las puntuaciones no se reconstruyen con valores de eventos.
- Se documentan zona IANA, límites, DST, publicación `date`, estados vacíos, limitaciones históricas, seguridad, rendimiento, compatibilidad y tareas sucesivas.
- Quedan identificadas las decisiones técnicas pendientes sin presentarlas como implementación o aprobación funcional.
- Solo se editan `roadmap/statistics.md` y, si procede, su entrada en `roadmap.md`; no se modifica código ejecutable.

## EST-3 — Auditoría funcional del backend

**Estado:** completada el 2026-10-29. Auditoría estática de código, entidades, migraciones y tests. Solo documentación; no se modificaron servicios, controladores, entidades, migraciones, contratos ni datos. No se consultó PostgreSQL ni producción.

**Alcance:** `GET /api/rates/stats` y `GET /api/rates/stats/discs`, consumidos por `/statistics`. Se revisaron sus métricas, filtro `year`, autenticación, datos de Rates y `rate_vote_events`, junto con dependencias de Catalog y Users.

**Decisión confirmada:** EST-DEC-12 fija Rates para actividad estadística en 2025 y 2026 y eventos `set` desde 2027. No se implementa en EST-3. Esta decisión afecta actividad por mes, género, calendario diario y totales de actividad anual; no ordena sustituir Rate para preferencias, puntuaciones vigentes, disco destacado, discos polémicos o galaxia.

La documentación EST-2a del frontend no está presente en este repositorio backend. La comparación abajo se limita a la semántica observada y a la decisión EST-DEC-12 aportada para esta auditoría. No eleva propuestas EST-DEC-01–11 a decisiones aprobadas.

## Inventario de implementación

| Elemento                | Ubicación y responsabilidad                                                                                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controlador             | `src/community/rates/rates.controller.ts`: `RatesController.getUserStats()` para `stats`; `getUserRatedDiscs()` para `stats/discs`. Ambos métodos usan `@Auth()`, reciben `User` con `@GetUser()` y pasan el `year` opcional como `string`. El prefijo global `/api` se configura en `src/main.ts`.                                     |
| Servicio                | `src/community/rates/stats/rates-stats.service.ts`: `getUserStats()` compone conteos, media/mediana, distribución, ranking y consulta de detalles; `getUserRatedDiscs()` delega al loader.                                                                                                                                              |
| Loader SQL              | `src/community/rates/stats/loaders/rates-user-stats-details.loader.ts`: consultas SQL parametrizadas para discos destacados, controversia, calendario, comparación interanual y lista de discos.                                                                                                                                        |
| Respuesta               | `src/community/rates/dto/rates-user-stats.dto.ts`: tipos de respuesta, no DTO de entrada ni validación del query `year`. Incluye `totalVotes`, medias, desglose de género/mes/puntuación, ranking, discos destacados/controvertidos, calendario y comparación interanual.                                                               |
| Entidades               | `src/community/rates/entities/rate.entity.ts` (Rate actual, `rate`, `createdAt`, `editedAt`, User y Disc); `src/community/rates/entities/rate-vote-event.entity.ts` (ledger); `src/catalog/discs/entities/disc.entity.ts` (fecha de publicación, Artist y un género principal); entidades relacionadas de `User`, `Artist` y `Genre`.   |
| Composición             | `src/community/rates/rates.module.ts` registra `Rate`, `Disc` y `RateVoteEvent`; importa Users, Artists y Authorization. La consulta estadística de usuario usa el repositorio Rate y `UsersService.countUsers()`.                                                                                                                      |
| Escrituras relacionadas | `src/community/rates/rates.service.ts`: `create()` y `update()` guardan Rate y registran eventos de puntuación en la misma transacción. `remove()` elimina Rate sin evento de retirada.                                                                                                                                                 |
| Consumidores            | No hay consumidor interno backend de estos dos métodos identificado. El consumidor conocido por contexto es `/statistics` del frontend, que no se audita aquí. `stats/discs` devuelve el detalle de Rate vigente que puede servir de población para la visualización tipo galaxia; el backend no calcula una métrica llamada “galaxia”. |

No hay DTO decorado que valide `year`, ni pipe específico en estas rutas. `year` se acepta como texto literal; si es no vacío, se enlaza como parámetro SQL en `TO_CHAR(disc.releaseDate, 'YYYY') = valor`. Valores no numéricos o años sin resultados dan conjuntos vacíos/cero en las agregaciones que lo soportan; no se rechazan por contrato. Las consultas que comparan `releaseDate` excluyen fechas nulas al aplicar año. Sin `year`, las fechas nulas de lanzamiento sí entran en estadísticas que no necesitan un año de disco.

## Semántica por métrica

En la tabla, “compatible” valora la transición aprobada EST-DEC-12, no decisiones funcionales pendientes.

| Métrica                                                         | Fuente actual                                                                                                                                                                                                                    | Semántica real                                                                                                                                                                                                                                                                                                                                                                 | Filtro anual                                                                                                                      | Compatible con EST-DEC-12 | Cambio necesario                                                                                                                                                                                                                                                                                   | Riesgo |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Resumen: `totalVotes`, `mean`, `median`                         | QueryBuilder sobre `rate` unido a `disc`; `rate.rate IS NOT NULL`. `totalVotes` usa `getCount()` de filas Rate, no `COUNT(DISTINCT disc)`. Media y mediana usan valores vigentes de Rate. Un Rate con puntuación nula no cuenta. | Total es número de filas puntuadas actualmente, no número histórico de acciones. Media/mediana son la distribución actual. No se incluyen Rate sin valor.                                                                                                                                                                                                                      | `disc.releaseDate` por año de publicación, no fecha de voto/actividad; fechas de publicación nulas se excluyen cuando hay filtro. | Parcial                   | Si “total anual” pasa a ser actividad desde 2027, definir y aplicar conteo de eventos `set` solo al componente de actividad, dejando media/mediana ligada a valores actuales. Aclarar que total deja de ser comparable en semántica al cruzar 2026→2027.                                           | Alto   |
| Disco destacado (`topDiscOverall`; además top por género/mes)   | SQL del loader sobre Rate actual, Disc y Artist; Genre es `LEFT JOIN` en top general/mes y `INNER JOIN` en top de género.                                                                                                        | Ganador por puntuación vigente descendente; desempate por `createdAt` más reciente y luego Rate ID descendente. Retorna `null` si no hay puntuaciones candidatas. Top por género/mes usa mismo criterio dentro de cada grupo.                                                                                                                                                  | Los candidatos se filtran por `Disc.releaseDate` cuando se proporciona `year`.                                                    | Sí                        | Mantener Rate como fuente; no migrar a eventos. Decidir expresamente si merece fecha de publicación vigente y mismos desempates.                                                                                                                                                                   | Bajo   |
| Votos por mes y semana                                          | QueryBuilder sobre Rate/Disc; agrupa por `TO_CHAR(rate.createdAt, 'Month')`, mes numérico y `TO_CHAR(createdAt, 'W')`.                                                                                                           | Cuenta filas con puntuación vigente agrupadas por mes de creación de la fila y semana dentro del mes (1–5). Editar nota no cambia `createdAt`; una fila creada sin puntuación y puntuada después conserva fecha inicial. Al no filtrar año del disco, los meses de distintos años se suman por nombre/mes. No es historial de cambios.                                         | Si `year` existe, se filtra `Disc.releaseDate`; no limita el año de `createdAt`.                                                  | No                        | Para 2025–26, Rates conserva como máximo la fecha de creación actual de cada fila, con las limitaciones de edición/eliminación expuestas abajo. Desde 2027, agrupar eventos `set` por `occurred_at` y asociar su año al calendario de actividad; decidir si la semana se conserva en la respuesta. | Alto   |
| Votos por género                                                | QueryBuilder `rate` → `disc` → `genre`, agrupado por `genre.name`.                                                                                                                                                               | Cuenta Rate vigentes por nombre del único género principal de Disc. No es un modelo de géneros múltiples. El join interior excluye discos sin género; agrupar solo por nombre fusionaría géneros distintos con el mismo nombre si existieran.                                                                                                                                  | `Disc.releaseDate` cuando se especifica.                                                                                          | Parcial                   | Desde 2027 contar eventos `set` y unir a la relación actual de Disc/Genre. Definir el límite de género actual mutable (no hay snapshot en evento) y si “un voto” significa evento o disco distinto. La decisión aprobada no define más géneros.                                                    | Medio  |
| Calendario diario (`votesByDay`)                                | Loader SQL sobre Rate y Disc; `TO_CHAR(rate.createdAt, 'YYYY-MM-DD')`, `COUNT(rate.id)`.                                                                                                                                         | Filas Rate actualmente puntuadas agrupadas por fecha de creación. No representa ediciones de puntuación ni retiradas. No genera días vacíos. La expresión no especifica zona; la entidad Rate tampoco fija tipo/zona explícitos en el decorador de `createdAt`. Semántica física y zona de sesión requieren verificación en PostgreSQL real.                                   | Si `year` existe, filtra año de publicación del disco; sin él, devuelve todos los días con Rate vigente.                          | No                        | 2025–26: conservar Rate como proxy con precisión limitada. Desde 2027: contar eventos `set`, convertir `occurred_at` a una zona de negocio explícita antes de agrupar. Mantener la serie dispersa o rellenar días es cuestión contractual por decidir.                                             | Alto   |
| Distribución de puntuaciones (`votesByScore`, `mean`, `median`) | Rate actual. Agrupa por el decimal `rate.rate`, y luego coloca cada grupo en un bucket entero con `Math.floor`; entrega siempre posiciones 0–10.                                                                                 | Población de Rates no nulos actuales. Decimales como 8.5 se asignan al bucket 8; se conserva en el código el cómputo separado de media/mediana decimal. Nulos fuera.                                                                                                                                                                                                           | Año de lanzamiento de Disc.                                                                                                       | Sí                        | Mantener Rate, como indica EST-DEC-12. Confirmar que el floor decimal es el comportamiento deseado antes de cualquier cambio; no está cubierto por decisión EST-DEC-12.                                                                                                                            | Bajo   |
| Discos polémicos (`mostControversial`)                          | SQL del loader: Rate del usuario actual; subconsulta `AVG()` de Rates actuales del mismo disco para todos los usuarios.                                                                                                          | Diferencia = puntuación personal − media comunitaria; incluye la propia puntuación del usuario en la media. No impone mínimo de votos comunitarios: basta con que haya media no nula. Ordena por diferencia absoluta descendente, luego Disc ID ascendente y Rate personal descendente; máximo 5. La media no se filtra temporalmente, aunque sí se filtra el disco candidato. | Candidatos limitados por `Disc.releaseDate`; la media comunitaria considera todos los Rates vigentes del disco.                   | Sí                        | Preservar Rates. Si se cambia alguna semántica (excluir usuario, mínimo de votos, población temporal), requiere decisión funcional separada; no forma parte de EST-DEC-12.                                                                                                                         | Medio  |
| Galaxia / discos valorados (`stats/discs`)                      | SQL explícito del loader sobre Rate, Disc, Artist y `LEFT JOIN Genre`.                                                                                                                                                           | Devuelve un elemento por fila Rate del usuario con puntuación no nula: ID/nombre del disco, puntuación actual, artista y género principal actual nullable. Sin cálculo, normalización ni orden explícito en SQL. Los discos con artista ausente no aparecen por el join interior.                                                                                              | Año de publicación del disco. `releaseDate IS NULL` se omite al filtrar por año. Sin año, se incluyen.                            | Sí                        | Mantener Rates como fuente para notas y población. Si EST-2a requiere agregaciones/atributos extra para la galaxia, documentar contrato y medir su consulta al concretar esa decisión.                                                                                                             | Medio  |

### Campos complementarios del endpoint

- `votesByMonth[].topDisc` y `votesByGenre[].topDisc` seleccionan una Rate vigente por grupo con score y desempates del disco destacado; no son conteos de eventos.
- `totalUsers` es `UsersService.countUsers()` global, no una población de votantes en el año.
- `rank` cuenta usuarios con más filas Rate puntuadas que `totalVotes` sobre el mismo conjunto de discos de lanzamiento filtrado; el query de ranking no limita a un usuario y esa lectura global es necesaria para calcular posición. No expone sus rates ni discos.
- `yearOverYear` es una consulta aparte: compara filas Rate no nulas por `createdAt` entre el año natural actual hasta `asOf` y el mismo tramo del año anterior. No utiliza el `year` solicitado y no filtra por año de lanzamiento. El año y los límites iniciales se forman en JavaScript usando la zona local del proceso; la comparación SQL de fecha depende del tipo real de `createdAt` y la configuración de PostgreSQL. Por tanto no es comparativa del año seleccionado y no debe confundirse con las métricas filtradas.
- `stats/discs` no trae un orden `ORDER BY`, por lo que el orden de filas no es determinista contractualmente.

## Filtro `year` y fechas

En ambos endpoints, año significa **año de publicación del disco (`Disc.releaseDate`)** allí donde se aplica, no año de puntuación ni año de actividad. El predicado es por representación `YYYY` de `releaseDate`, con parámetro enlazado. Esto compara año natural de calendario de la columna `date` del catálogo y no define una zona horaria.

Las consultas de `totalVotes`, media, mediana, género, mes, distribución, top discs y controversia aplican ese mismo filtro de lanzamiento. El calendario también lo aplica. En cambio, `yearOverYear` ignora el filtro recibido y usa el año real del proceso y `Rate.createdAt`. `stats/discs` filtra por lanzamiento directamente en SQL con el mismo `TO_CHAR`. Así, los dos endpoints concuerdan en el atributo de año para sus listas/conteos, pero el endpoint de resumen contiene una comparación interanual con semántica independiente.

No hay validación de año (rango, formato o futuro). Un valor arbitrario se compara como texto y normalmente retorna cero/arrays vacíos, salvo `totalUsers`, ranking y `yearOverYear`, que mantienen su cálculo propio. Los valores SQL son parametrizados, por lo que el texto no se concatena como SQL. Sin filtro, `releaseDate` nulo participa en las métricas sobre Rate. Con filtro, no coincide con ningún año. La API devuelve arrays vacíos/ceros/null para la falta de filas; `votesByScore` siempre mantiene los 11 buckets y los `topDisc` vacíos son `null`.

La zona horaria de los campos de actividad históricos no queda fijada uniformemente: la expresión de meses/días usa `Rate.createdAt` directo; el modelo no declara tipo/zona explícitos en `createdAt`; `yearOverYear` usa fechas JavaScript en zona local; y no hay un contrato explícito UTC o Europe/Madrid para esos campos. La columna física desplegada, `TimeZone` de sesión y comportamiento PostgreSQL no se verificaron; no inferir una zona efectiva sin entorno PostgreSQL autorizado.

## Viabilidad temporal de EST-DEC-12

### Rates actuales en 2025–2026

- `Rate.createdAt` da una fecha de creación de fila; no conserva una fecha separada de primera nota ni las transiciones posteriores. `editedAt` se actualiza por ediciones y conserva solo la última fecha, sin valor previo ni motivo. Puede cambiar por edición de portada, según el contrato de escritura.
- Cambiar una puntuación existente no cambia `createdAt`. Por tanto, si 2025/2026 muestra puntuaciones actuales agrupadas por creación, los valores de puntuación son actuales, pero la fecha solo aproxima cuándo se creó la fila. Si una Rate se creó inicialmente sin score y recibió score después, el conteo puede asignarse a un día anterior.
- Borrar Rate elimina la fila sin evento de retirada. Las estadísticas basadas en Rate actual ya no cuentan esa puntuación ni su actividad previa. Borrar y volver a crear crea una fila con nueva fecha, pero no deja rastro de la retirada.
- El servicio coordina creación por usuario/disco con advisory lock y busca Rate existente; la entidad examinada no declara unicidad por pareja ni se encontró una constraint de unicidad en las migraciones revisadas. No se puede asegurar estáticamente que no haya duplicados históricos/datos externos; si existen, los conteos por filas los duplicarían. La cantidad real solo se confirma con inspección autorizada de base.
- Disc tiene un solo `genreId` nullable en la entidad. Las agregaciones por género pueden relacionar cada Rate con el género principal actual, pero no preservan el género histórico si cambia el catálogo. No se observó cobertura real de géneros por años.

**Conclusión 2025–2026:** Rates es viable para describir el estado actual de puntuaciones de discos publicados en un año y como proxy de actividad por fecha de creación. No ofrece precisión histórica completa de acciones ni garantiza equivalencia con una serie de eventos `set`. El código no permite confirmar qué filas, fechas o géneros existen realmente por año. La transición aprobada puede implementarse en modo histórico con esta limitación explícita; la magnitud del error requiere consulta de datos reales autorizada, no producción desde esta auditoría.

### `rate_vote_events` desde 2027

- Tabla/entidad: `src/community/rates/entities/rate-vote-event.entity.ts`, creada por migraciones `1792000000000-CreateRateVoteEvents`, `1792010000000-AddDiscAndValuesToRateVoteEvents` y ajustada por `1792040000000-UseClockTimestampForRateVoteEvents`.
- Cada fila conserva `user_id`, `occurred_at timestamptz`, `event_type` (`set`/`change`), `disc_id` nullable, `previous_value` y `new_value`. Hay índices `(user_id, occurred_at)` y `(occurred_at)`; FK de User con cascade y de Disc con `ON DELETE SET NULL`.
- `RatesService.recordVoteEvent()` emite `set` para puntuación no nula al crear o al pasar de null a valor; `change` al cambiar entre puntuaciones no nulas distintas. No emite evento para borrar, volver a null, repetir el mismo score o cambios solo de portada. Así, `set` es un paso a estado puntuado, no “voto nuevo del disco por primera vez” ni toda actividad de Rate.
- Evento incluye user y disc ID, suficiente para aislar por usuario y unir a Disc → Genre para categoría. `Genre` y demás atributos son del catálogo actual, no snapshot. Si se borra Disc, el ID pasa a null y el evento ya no se puede categorizar por género.
- La fila singleton `rate_vote_event_capture.started_at` registra el inicio de la captura en cada entorno. Filas previas de legacy pueden tener campos nuevos null: la migración de columnas no hace backfill y el test verifica que esas filas permanecen incompletas. No hay fuente para reconstruirlas sin inventar eventos.
- Los eventos `change` son cambios de puntuación y `set` captura alta/recuperación desde null. Para las métricas aprobadas la población debe filtrar `event_type = 'set'`. El evento persiste `new_value`, aunque EST-DEC-12 mantiene Rate como fuente de score vigente y preferencias.
- `occurred_at` da fecha de ledger y la entidad es `timestamptz`. La migración modifica su default a `clock_timestamp()`; fechas civiles requieren conversión a zona explícita, por ejemplo `Europe/Madrid`, antes de agrupar por día/mes. La marca representa el momento capturado de inserción, no necesariamente commit ni orden causal bajo contención.

**Conclusión desde 2027:** el ledger puede sostener conteos de `set` por año/mes/día y joins de género sin cambiar el modelo de escritura. Las consultas deberán definir zona, año de actividad, tratamiento de eventos con `disc_id` null y si se cuentan eventos o discos distintos. Las filas legacy incompletas y el período anterior al `started_at` no deben presentarse como cobertura completa. No se propone backfill ni migración para eventos históricos inexistentes.

## Seguridad y efectos

- Ambos handlers tienen `@Auth()` y obtienen el usuario desde `@GetUser()`; no reciben `userId` de query ni path. `getUserStats()` asigna `user.id` a las consultas personales y enlaza el parámetro; `getUserRatedDiscs()` enlaza el mismo ID como `$1`.
- `year` va parametrizado, sin interpolación de su valor. La ruta no declara DTO/validación; esto es una limitación de validación contractual, no una vía SQL injection en el código observado.
- Consultas personales de Rate y las seis queries de detalle filtran por el ID autenticado. El cálculo global de `rank` consulta datos de otros usuarios únicamente para contar cuántos superan el total actual; `totalUsers` es global por definición. No se devuelven puntuaciones ni IDs ajenos desde esas consultas.
- No se encontró defecto de aislamiento en estos dos métodos. El acceso a SQL es de lectura; no hay llamadas de escritura ni efectos secundarios en la ruta.
- **No relacionado con EST-3:** `RatesHistoryService` tiene una ruta de historial por `userId` y su autorización es una cuestión distinta; EST-3 no la consume ni modifica.

## Pruebas encontradas

- `src/community/rates/__tests__/rates.controller.spec.ts`: comprueba que `GET /rates/stats/discs` está autenticado, obtiene el usuario de sesión y reenvía usuario/año; la tabla de rutas también registra `stats`. No prueba validación HTTP de `year` porque no existe DTO de este endpoint.
- `src/community/rates/stats/__tests__/rates-user-stats-contracts.spec.ts`: caracteriza parcialmente el shape de `/stats`, conversión de puntuación a bucket, mapeo de top discs/controversia/calendario y que las consultas del loader reciben el ID de sesión. Prueba la proyección de `stats/discs` y binding de usuario/año.
- `src/community/rates/stats/__tests__/rates-stats.service.spec.ts`: contiene pruebas de otras estadísticas de Rates (incluidas consultas actuales de dashboard/geografía); no es una caracterización completa de las métricas `/stats` auditadas.
- `src/community/rates/__tests__/rates.service.spec.ts`: cubre reglas de escritura/propiedad de Rates y eventos en rutas de escritura. `src/community/rates/__tests__/rate-vote-events.postgres.integration.spec.ts` cubre restricciones, campos nulos legacy, relaciones, timestamps y atomicidad mediante PostgreSQL aislado/opt-in. No se ejecutaron en EST-3.
- No se halló cobertura específica suficiente para año sin datos, límite de año/calendario, filtros de fechas nulas, editar Rate y atribución mensual, retirada, duplicados, múltiples géneros (la entidad solo tiene uno), mínimo de votos controvertidos, empate de todos los ordenamientos, aislamiento real con dos usuarios en PostgreSQL ni contraste EST-DEC-12 2026/2027.

## Matriz de diferencias y dependencias de producto

1. La semántica `year` observada es año de publicación; EST-DEC-12 describe la fuente anual de actividad y no fija por sí sola el comportamiento del selector por año. El contrato debe acordar si el año solicitado significa año de actividad para esas métricas a partir de 2027, mientras las preferencias siguen filtradas por publicación.
2. La transición provoca un salto semántico: hasta 2026 son filas puntuadas actuales de discos publicados en el año; desde 2027 son acciones `set` según fecha de evento. Definir copy/etiquetas o periodos comparables necesita decisión de producto, no se aprueba aquí.
3. `yearOverYear` no depende de `year` y cuenta fechas de creación de Rate; su relación con EST-DEC-12 requiere decisión separada. No asumir que también cambia porque se llame interanual.
4. Métricas de score, preferencias, disco destacado, polémica y galaxia deben permanecer basadas en Rate según EST-DEC-12. Si EST-2a propone cambiar población, exclusión de voto propio, mínimos, ranking, múltiples géneros, calendario continuo o formato de galaxia, requiere decisión EST-DEC correspondiente.
5. La comparación funcional con detalles de EST-2a debe realizarse al enlazar su documento frontend o transcribir sus propuestas aprobadas; no está en este checkout y no se atribuyen propuestas no verificadas.

## Cambios backend potenciales para una tarea posterior

- Separar claramente población de “actividad” desde 2027 (eventos `set` por timestamp y zona definida) de estadísticas de puntuación/prefencias que permanecen sobre Rate.
- Resolver semántica del parámetro `year` para métricas mixtas; añadir validación/rango solo tras acordar el contrato. Mantener parámetro SQL.
- Definir política para año sin datos, nulos, eventos legacy incompletos y catálogo actual mutable; mantener los campos de respuesta hasta coordinar cualquier cambio contractual.
- Documentar/decidir de manera explícita la semántica independiente de `yearOverYear`, zona de Rate histórica, calendarización dispersa y orden estable de `stats/discs`.
- Antes de cambios, caracterizar límites 2025/2026/2027, cambios de Rate, doble `set`, nulos de fecha/score, duplicados potenciales y una Rate con género retirado. Confirmar disponibilidad de captura y esquema físico en un entorno PostgreSQL aislado/expresamente autorizado; usar datos reales solo con autorización. Medir consultas antes de proponer índices.
- No crear migraciones ni reconstruir eventos históricos inexistentes como parte de esta auditoría.

## Limitaciones de esta auditoría

Los hechos de rutas, SQL, filtros, escritura, entidades, índices y tests se confirman estáticamente en el código revisado. Requieren PostgreSQL autorizado: tipo físico desplegado de `Rate.createdAt`, zona de sesión, cobertura de fechas por año, proporción de puntuaciones editadas tras crear la fila, eliminaciones, duplicados, fechas de inicio de captura por entorno, presencia de filas legacy incompletas, cobertura de género y planes/rendimiento. No se consultó ni modificó ninguna base. Tampoco se inspeccionó frontend ni el documento EST-2a.

## EST-BE-11 — Composición HTTP e integración de Estadísticas

**Estado:** completada el 2026-10-29. `RatesAnnualStatisticsService` compone el resumen anual con los agregadores de actividad, las puntuaciones vigentes, el disco destacado y los discos polémicos. `GET /rates/stats` y `GET /rates/stats/discs` ya delegan en esa composición y en `RatesGalaxyDiscsService`, respectivamente; ambos conservan `@Auth()`, derivan `userId` de la sesión y reciben el `RatesStatsQueryDto` validado. No queda respuesta HTTP 501 en estas rutas ni se reactivan los cálculos legacy.

La composición selecciona `RatesHistoricalAggregationsService` para 2025–2026 y `RatesEventSetAggregationsService` desde 2027. La fuente histórica está etiquetada como aproximada (`rate_created_at_estimate`, cobertura `unknown`) y el ledger moderno como `set_events` con cobertura `partial`; `change` no se cuenta. Las puntuaciones, la media, la mediana, distribución, destacado, controversia y galaxia usan Rates vigentes. Las consultas de composición son secuenciales; no abren transacción y una escritura concurrente todavía puede hacer variar la vista entre consultas. Los errores de cada servicio se propagan, sin presentar respuestas parciales ni ceros inventados.

Se devuelve el DTO definitivo de EST-BE-2, incluidos meses (12 filas), calendario disperso, actividad sin género, conteos independientes de puntuaciones y buckets vacíos con cero; sin candidatos el destacado es `null`, controversia y galaxia son `[]`, y media/mediana son `null`. Los `topDisc` de grupos mensual y género se mantienen `null`: los servicios especializados conectados en EST-BE-11 no exponen selecciones por cada grupo y esta tarea no recupera el cálculo legacy. La galaxia devuelve una entrada por disco con nota vigente, IDs reales y artista/género nullable, orden determinista y errores propagados.

EST-BE-7 se acepta y cierra con un único género opcional por disco. Cada fila Rate o evento `set` aporta como máximo una unidad al género actual; sin género aporta a `activityWithoutGenre`. Los agregados agrupan por nombre y consolidan géneros distintos con nombres duplicados, acorde al DTO actual sin ID; esta tarea no altera identidad ni contrato.

**Impacto frontend:** no se modificó el repositorio frontend. El consumidor debe usar `year` obligatorio y el shape EST-BE-2; campos legacy (`yearOverYear`, `rank`, `totalUsers`, `weeks` y nombres anteriores) no se devuelven. La galaxia sigue siendo una carga bajo demanda.

**Tests y verificaciones:** verificación de contrato HTTP, controladores y composición focalizados; typecheck, Nest build, ESLint/Prettier focalizados, dependencias runtime cuando correspondía, `git diff --check` y enlaces Markdown. El resultado concreto de cada ejecución se registra al completar esta tarea. No se ejecutaron suites completas, E2E, migraciones ni acceso a producción.

**Limitación PostgreSQL:** no se instaló ni inició PostgreSQL, no se modificaron permisos y no se consultó producción. Los SQL reales de EST-BE-4 y demás suites gated siguen sin validación de integración; EST-BE-4 permanece pendiente de integración PostgreSQL. Los mocks focalizados no se presentan como prueba de SQL real.

EST-BE-12 cerró la composición backend inicial. EST-BE-M completa después los destacados y campos funcionales que quedaron pendientes; la adaptación del consumidor frontend y la verificación PostgreSQL real siguen fuera de esta tarea.

## EST-BE-12 — Revisión final y cierre del backend de Estadísticas

**Estado:** completada el 2026-10-29. La implementación backend de Estadísticas queda cerrada. EST-BE-4 conserva expresamente el estado de implementación lista con validación SQL PostgreSQL pendiente; no se declara aprobada la integración real.

### Arquitectura y contratos

La organización bajo `src/community/rates/stats/` mantiene servicios separados para cohortes históricas Rates, eventos `set`, agregaciones, selección de puntuaciones vigentes, media/mediana/distribución, destacado, controversia, galaxia y composición anual. Los helpers de consultas reúnen la definición de población y límites temporales; los servicios especializados son providers de `RatesModule`, y `RatesAnnualStatisticsService` compone los resultados sin importar servicios legacy. Los controladores no contienen SQL. Las consultas personales reciben el ID únicamente desde `@GetUser()`, filtran por usuario y usan parámetros; los resultados comunitarios solo devuelven medias agregadas y no incluyen identidades ni puntuaciones individuales ajenas. No hay escrituras en estos endpoints. La carga de galaxia sigue siendo independiente y bajo demanda.

`GET /rates/stats` y `GET /rates/stats/discs` requieren autenticación, `year` de cuatro cifras desde 2025 hasta el año civil actual de la zona solicitada, y aceptan `timeZone` IANA opcional con `UTC` predeterminado. No reciben `userId`, no responden HTTP 501 y no usan campos legacy (`yearOverYear`, `rank`, `totalUsers`, `weeks` ni nombres retirados). Las referencias a HTTP 501 en las notas de EST-BE-2–10 describían estados intermedios y quedan superadas por esta integración.

La revisión encontró que los resultados de destacado y controversia descartaban discos elegibles sin relación de artista mediante `INNER JOIN`, mientras el contrato y la galaxia admitían artista nullable. Se cambió a `LEFT JOIN`, se alinearon DTOs y resultados y se añadieron casos focalizados; un disco sin artista se conserva con `artist: null`. Artista y género son nullable en esas proyecciones. En EST-BE-12 `topDisc` mensual y por género todavía se devolvía como `null`; EST-BE-M completa esos algoritmos sobre la población elegible y las notas vigentes.

### Fuentes, elegibilidad y métricas

Un disco solo pertenece al año Y si su año de publicación y su año de asignación cumplen Y. En 2025–2026 la cohorte usa filas Rates y `Rate.createdAt` como aproximación con convención `Europe/Madrid`; se etiqueta con cobertura `unknown` y no reconstruye eventos o puntuaciones pasadas. Desde 2027 usa exclusivamente eventos `set` del usuario cuyo `occurred_at` cae en el año local y cuyo disco fue publicado ese año; `change` queda fuera y no se completan eventos desde Rates. Las puntuaciones son la Rate vigente, como máximo una por disco elegible: notas nulas o fuera de escala se excluyen y no se recupera una nota vieja cuando gana una fila duplicada con nota inválida.

La actividad cuenta filas Rates elegibles en el tramo histórico o eventos `set` desde 2027; entrega total, doce meses, días activos dispersos, actividad por género y actividad sin género. Los meses/días comparten cohorte y el servicio comprueba que sus sumas igualan el total. Cada Rate/evento aporta como máximo a un género actual; géneros diferentes con el mismo nombre se consolidan en la respuesta. La suma por género más `activityWithoutGenre` cubre el total. No se implementan relaciones multigénero ni IDs de género en la respuesta.

Las puntuaciones vigentes alimentan `scoredDiscs`, media, mediana y once buckets `[n,n+1)` (el bucket 10 contiene exactamente 10); se comprueba que los buckets sumen `scoredDiscs`. Sin puntuaciones, media y mediana son `null`, y los buckets conservan ceros. Sin candidato, el destacado es `null`; controversia y galaxia vacías son `[]`. La controversia exige cuatro Rates válidas de usuarios distintos además de la persona consultante, incluye su nota en la media comunitaria, calcula diferencia con signo y devuelve como máximo cinco resultados ordenados por diferencia absoluta y desempates estables. La galaxia deduplica eventos por disco y devuelve las mismas puntuaciones válidas que `scoredDiscs`, si no hay escrituras concurrentes entre consultas.

La composición ejecuta las consultas de actividad antes de las métricas independientes, que se solicitan en paralelo y sin transacción/snapshot compartido. Una escritura concurrente puede producir pequeñas discrepancias entre métricas de una respuesta; no se midió rendimiento SQL porque no se ejecutó PostgreSQL real. Los errores se propagan y no se sustituyen por resultados parciales. Los vacíos representan `0`, `null` y `[]` de acuerdo con el significado de cada campo, sin capturas generales que oculten fallos.

### Verificaciones y pendientes

- Jest focalizado de Estadísticas y controlador: 13 suites, 134 tests aprobados. No se ejecutaron suites PostgreSQL gated.
- Typecheck (`pnpm exec tsc --noEmit --incremental false`): aprobado.
- Nest build y control de dependencias runtime (`pnpm run build`): aprobados; se comprobaron 543 archivos compilados y 26 dependencias externas de runtime.
- ESLint/Prettier focalizados: tras formatear los dos casos de prueba añadidos, ambos controles aprobados.
- `git diff --check` de los cambios de esta tarea y comprobación de enlaces Markdown: aprobados.
- No se ejecutaron suites completas, E2E, `pnpm verify`, migraciones ni consultas a producción. La suite PostgreSQL aislada permanece sin ejecutar: no hay servidor PostgreSQL local accesible y Docker no está disponible para el usuario actual. En consecuencia, los SQL, incluidas las agregaciones de EST-BE-4, siguen sin validación PostgreSQL real. No se instalaron paquetes ni se cambiaron permisos.
- En la primera invocación de Jest el filtro de rutas se interpretó incorrectamente y se interrumpió la ejecución ampliada. Allí apareció el fallo ya conocido del test `RatesModule` por falta de `DataSource` para `SpotifyConnectionRepository`; el test pertenece a un fixture anterior y no se modificó. La ejecución focalizada posterior usó rutas explícitas y pasó.

Las limitaciones temporales de Rates 2025–2026 implican cobertura histórica desconocida y pueden diferir de actividad real; desde 2027, la cobertura del ledger es parcial porque eventos legacy incompletos, discos borrados o publicación desconocida se excluyen. El futuro frontend debe comunicar esa diferencia y consumir el contrato nuevo, incluido `activityBasis`, `activityCoverage`, `artist` nullable y `topDisc: null` en los desgloses mensual y por género. El repositorio frontend no se modificó.

| Tarea | Estado final |
| --- | --- |
| EST-BE-1 | Completada |
| EST-BE-2 | Completada |
| EST-BE-3 | Completada como implementación; convención histórica documentada |
| EST-BE-4 | Implementación completada; verificación SQL PostgreSQL pendiente |
| EST-BE-5–EST-BE-11 | Completadas |
| EST-BE-12 | Completada; cierre de implementación backend |

**Pendiente fuera de este cierre:** adaptar y verificar el consumidor frontend contra los contratos implementados; ejecutar las suites PostgreSQL aisladas autorizadas en un entorno disponible y, después, actualizar EST-BE-4 con evidencia real.

## EST-BE-M — Mejoras funcionales de Estadísticas

**Estado:** completada el 2026-10-29 para implementación y verificaciones focalizadas. La validación de SQL PostgreSQL real sigue pendiente; no se instalaron servicios ni se consultó producción.

### Contrato y semántica añadidos

- `standardDeviation` aparece en `GET /rates/stats` y se calcula con `STDDEV_POP` sobre las mismas puntuaciones vigentes válidas de `mean` y `median`. Es desviación poblacional, no una estimación desde los buckets. Sin puntuaciones es `null`; una puntuación produce `0`; con varias, el valor no se redondea en backend. La precisión de presentación queda a cargo del frontend.
- Cada mes y cada género ahora incluye `topDisc: RatesStatsDiscDto | null`. Los meses seleccionan usando el mes civil de asignación: `Rate.createdAt` con la convención histórica Europe/Madrid en 2025–2026 y eventos `set` con `timeZone` desde 2027. `change` queda fuera; eventos `set` repetidos pueden destacar el mismo disco en varios meses. El desempate usa nota vigente descendente, asignación elegible más reciente y `disc.id` ascendente. Los conteos mensuales no cambian.
- El destacado por género usa los discos puntuados elegibles del año y el género único actual de Catalog. Agrupa por `genre.name`, incluyendo nombres duplicados según el contrato, no limita la cantidad de géneros y usa desempates deterministas. Sin disco puntuado vigente devuelve `null`.
- Los DTOs de destacado global, mensual, género y controversia entregan `image` desde `Disc.image`, la imagen persistida por Catalog. Se conserva `null` cuando no hay portada; no se derivan URLs ni se consulta Spotify.
- `activityCount` del resumen anual cuenta discos distintos de la cohorte elegible. Cada fecha activa de `activityByDay` añade `discs`, con los discos distintos que tuvieron actividad elegible ese día y sus campos `discId`, `title`, `artist` nullable, `rate` vigente o `null`, y fecha civil `date`. Votos repetidos del mismo disco en una fecha cuentan una vez; el disco puede aparecer en otras fechas. La actividad histórica permanece aunque actualmente no tenga nota, en cuyo caso `rate` es `null`. El detalle y el conteo diario coinciden. El mismo disco puede aparecer en varias fechas, por lo que la suma diaria puede superar el total anual. Los conteos mensuales y por género mantienen la unidad de asignaciones/eventos y no tienen que sumar el total anual. La suma mensual debe coincidir con la atribución por género más `activityWithoutGenre`, ya que esas agregaciones siguen contando todas las asignaciones elegibles.

La respuesta sigue usando las rutas existentes, autenticación, usuario de sesión, año y zona IANA, población anual y distinción entre actividad y notas vigentes. No se añaden aliases legacy, endpoints, cambios de frontend, entidades ni migraciones.

### Verificaciones

- Jest focalizado de servicios, composición, DTO/contrato y controller: 7 suites y 98 tests aprobados.
- `pnpm exec tsc --noEmit --incremental false`: aprobado.
- `pnpm run build`: aprobado; el gate encontró 543 archivos compilados y 26 módulos runtime declarados/cargables.
- `git diff --check`: se ejecuta al cerrar esta tarea.
- No se ejecutaron pruebas PostgreSQL, suites generales, E2E ni `verify`; la integración real de las consultas permanece pendiente. No se modificó frontend ni se ejecutaron migraciones o consultas de producción.

| Tarea | Estado final |
| --- | --- |
| EST-BE-M | Completada; validación PostgreSQL real pendiente |

## Registro EST

| Tarea                                                      | Estado                      | Alcance                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EST-3 — Auditoría funcional de Estadísticas en backend** | **Completada (2026-10-29)** | Solo código backend y documentación. Diferencias, semántica temporal, seguridad, tests y viabilidad de EST-DEC-12 documentadas; sin implementación ni cambio de contrato. |
| EST-4                                                      | No iniciada                 | Fuera del alcance de EST-3.                                                                                                                                               |

### Registro de implementación de EST-BE-2

- DTO: `RatesStatsQueryDto` se comparte en `GET /rates/stats` y `GET /rates/stats/discs`. `year` se valida como string recibido con exactamente cuatro dígitos; no se convierte desde números ni se aceptan fechas, fracciones, signos o contenido adicional. El rango es 2025–año actual local de `timeZone`. `timeZone` acepta zona IANA, rechaza vacío/offset inválido y usa `UTC` explícito si se omite.
- Población: el contrato expresa `releaseYear = selectedYear` y `assignmentYear = selectedYear` simultáneamente. Rates es una aproximación histórica en 2025–26; a partir de 2027 solo cuentan eventos `set`. Las notas son puntuaciones Rate vigentes. `change` queda fuera del total de actividad.
- Respuestas: los tipos nuevos distinguen discos con actividad anual (`activityCount`), discos con nota vigente (`scoredDiscs`), puntuaciones (`mean`, `median`, score distribution) y medias comunitarias. Los conteos mensuales y por género expresan asignaciones/eventos; los días expresan discos distintos por fecha. Un total conocido puede ser cero; score/mean/median o actividad desconocida no se fabrican. Sin resultados se usarán colecciones vacías; los meses calculados conservarán 12 entradas; el calendario será disperso mientras la cobertura histórica no esté probada.
- Campos retirados: `yearOverYear`, `totalVotes`, `totalUsers`, `rank`, `weeks`, y los nombres `votesByGenre`, `votesByMonth`, `votesByDay` y `votesByScore` se reemplazan por nombres con unidades explícitas. No hay alias ni respuesta paralela legacy. La galaxia mantiene el array de discos con ID, nombre, puntuación vigente, artista y género nullable.
- Pendiente: ambos handlers devuelven 501 para solicitudes válidas hasta que se conecten las agregaciones de EST-BE-4 en adelante. Los tests focalizados cubren DTO, coerción, año por zona, auth, identidad de sesión y ausencia de consultas legacy. Se ejecutaron Jest focalizado (47 tests), `tsc --noEmit --incremental false`, build, ESLint y Prettier focalizados, `git diff --check` y comprobación de enlaces Markdown. El comando wrapper `pnpm run quality:typecheck` no pudo iniciar por error local de pnpm al abrir su base de datos; se ejecutó el typecheck equivalente directamente. No se ejecutaron suites completas, E2E, PostgreSQL, producción ni migraciones.
