# BC-ID-3F — Actividad diaria y votaciones

**Estado:** BC-ID-3F.1 (análisis inicial), BC-ID-3F.2 (registro diario) y BC-ID-3F.3 (historial y consultas) completadas el 2026-10-22. Las pruebas PostgreSQL de 3F.2/3F.3 están preparadas como opt-in y no se ejecutaron en este entorno. BC-ID-3F.4 sigue pendiente.

## Objetivo y alcance

Conocer qué usuarios usan Riff Valley App cada día, aunque no voten, y cruzar esa actividad con sus votos. La zona de negocio para los días es Europe/Madrid. Wiki queda fuera del alcance inicial. No incluye dashboard, páginas vistas, duración de sesión ni recuperación de contraseña (BC-ID-10).

## Datos existentes revisados

### Accesos y sesiones

- UserAccessLog (user_access_log) tiene clave (userId, date) y registra logins, una fila como máximo por usuario y fecha. UsersService.recordLogin() actualiza User.lastLogin; ActivityService registra la fecha de base de datos con CURRENT_DATE y ON CONFLICT DO NOTHING. No representa restauraciones de sesión ni identifica por sí solo un día de uso de App. No cambiar, migrar ni reinterpretar esos datos históricos.
- AuthSession conserva clientType, createdAt y lastActivityAt. El cliente se determina en el login y el refresh validando el contexto de origen y la cookie contra la sesión. lastActivityAt se sobrescribe en cada rotación, así que no forma un historial de actividad diaria.
- El JWT de acceso renovable actual contiene username, id y role; no contiene clientType ni session id. La renovación refresh-v1 devuelve un JWT y metadatos de refresh, pero no notifica una visita a Activity.

### Votaciones de Community

- La entidad es Rate (tabla rate), relacionada con User y Disc. Tiene createdAt (CreateDateColumn) y editedAt (UpdateDateColumn, nullable). rate y cover son valores independientes y nullable; aquí “votación” significa una valoración con rate IS NOT NULL, no una valoración de portada.
- El flujo normal de RatesService.create() busca una fila del mismo usuario/disco y, si la encuentra, la actualiza; si no, crea una fila. PATCH /api/rates/:id también modifica la fila del propio usuario. Ambas rutas fijan editedAt. El índice observado (userId, discId) no es único, así que la aplicación intenta reutilizar la fila, pero el esquema no garantiza unicidad ante carreras.
- createdAt es la creación de la fila, no todas las acciones de voto. editedAt es la fecha de la última modificación de la fila: puede deberse a cover, a rate o a ambos y reemplaza cualquier edición anterior. No permite reconstruir cada cambio de nota ni atribuir con certeza la última edición a una votación.
- DELETE /api/rates/:id hace hard delete. Rate no tiene deletedAt ni papelera; las filas eliminadas dejan de estar en los conteos actuales.
- Consultas actuales: RatesStatsService.getUserStats() cuenta filas actuales con rate IS NOT NULL y produce desgloses por puntuación, género, disco, etc. Sus filtros year se basan en Disc.releaseDate; la serie por mes/semana agrupa Rate.createdAt, que describe creación de filas, no todas las votaciones realizadas. RatesHistoryService expande cada fila a creación y, como máximo, su última edición; filtra por campos actuales y no conserva versiones de valores. ActivityService.getUserActivity() devuelve las filas Rate del usuario con createdAt/editedAt; findAllAdminStats() incluye agregados históricos de votos y filtros de inactividad. No hay un histórico completo de acciones de voto.
- El endpoint existente GET /api/rates/user/:userId/history reutiliza RatesHistoryService, pero su método del controller no declara @Auth. No reutilizarlo como API de estadísticas administrativas; las rutas nuevas de Activity se protegen explícitamente con superadmin.
- En ActivityService, el agregado lastVotePerDay usa la última fecha entre createdAt y editedAt de cada fila Rate; puede ser una edición de cover. Además, getUserActivity() devuelve las filas Rate sin filtrar necesariamente rate IS NOT NULL. Los nombres/payloads históricos se preservan, pero no son métricas exactas de votos.

### Qué puede afirmarse con los datos actuales

- Sí: número actual de filas valoradas (rate IS NOT NULL) por usuario y total; fecha de creación de esas filas; instante de última modificación de la fila.
- No: cantidad histórica acumulada de votos realizados si hubo ediciones o borrados; todas las fechas en las que un usuario votó; última votación fiable; votaciones exactas por día ni usuarios que votaron ese día. editedAt no basta porque también cambia por cover, y solo conserva la edición más reciente.
- Los agregados existentes basados en Rate se pueden conservar como medidas del estado actual o de creación de filas, pero no renombrar como eventos de votación sin capturar transiciones de rate.

## Registro diario de App

Definir actividad como que un usuario autenticado haya completado login o restauración de sesión en App en una fecha natural de Madrid. No contar refresh automático, pestañas adicionales, navegación ni acciones. El cliente llama a una ruta independiente después de completar login o restauración satisfactoria; una clave única en PostgreSQL hace idempotentes las llamadas del mismo día.

### Persistencia mínima

Tabla propuesta user_app_daily_activity:

- user_id uuid NOT NULL, FK a users(id) con ON DELETE CASCADE.
- activity_date date NOT NULL, día calculado por el servidor en Europe/Madrid.
- PK/unique (user_id, activity_date) para que una sola inserción gane ante pestañas o requests concurrentes.
- Sin timestamp por visita, IP, user-agent, token ni datos de navegación: el requisito es el día activo. No guardar estadísticas derivables.

En PostgreSQL, derivar activity_date con una expresión explícita de zona, por ejemplo (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date; no depender de la zona horaria configurada en el servidor/DB ni del reloj del navegador. Insertar con ON CONFLICT (user_id, activity_date) DO NOTHING. Los límites de 7/30 días se calculan por fechas Madrid inclusivas y no con ventanas de 24 horas, por lo que DST no cambia la definición del día.

### Ruta y atribución de App

Propuesta: POST /api/activity/app/daily, autenticada, sin userId ni fecha en body, respuesta 204 No Content. El usuario sale del JWT validado. La ruta solo acepta un access token cuya atribución firmada sea clientType=app.

La sesión persistente ya tiene AuthSession.clientType y el login/refresh validan ese valor. Sin embargo, el JWT actual no lo lleva y @GetUser() solo resuelve la identidad/rol. Para una atribución verificable y App-only, la solución mínima es incluir de forma aditiva clientType en los JWT emitidos desde login y refresh, derivado de la SessionCredential/sesión validada; el endpoint exige app y rechaza wiki/tokens antiguos sin claim. No confiar en un campo de body ni en Origin aislado. Esto no requiere cambiar el intercambio HTTP refresh-v1 ni registrar una visita dentro de la ruta refresh: tras login/restauración, App usa el access token recién recibido para llamar al endpoint separado. Wiki permanece fuera del alcance.

## API de estadísticas propuesta

Reutilizar ActivityModule para acceso diario y sus consultas de lectura de Rate; no alterar rutas/payloads existentes. Todas las nuevas rutas de lectura llevan @Auth(ValidRoles.superadmin). La escritura diaria solo requiere usuario autenticado con claim App válido.

### GET /api/activity/users

Paginado (limit, offset) y opcionalmente filtrado por from/to (fechas Madrid inclusivas). Mantener todos los usuarios como base de la consulta y hacer LEFT JOIN a actividad y votos, para que aparezcan también usuarios activos que no hayan votado.

Proyección inicial:

    {
      "totalItems": 1,
      "limit": 20,
      "offset": 0,
      "activityDataSince": "2026-10-22",
      "voteDataSince": null,
      "data": [{
        "userId": "…",
        "username": "…",
        "lastActiveDate": "2026-10-22",
        "activeDays7": 5,
        "activeDays30": 18,
        "currentVotes": 42,
        "voteActionsRecorded": 0,
        "voteActions7": null,
        "voteActions30": null,
        "lastVoteAt": null,
        "votesByDay": []
      }]
    }

activityDataSince y voteDataSince hacen explícitos los cortes de cobertura. La tabla diaria no se backfillea desde UserAccessLog; activeDays7/30 refleja solo fechas desde activityDataSince y los períodos iniciales serán parciales. lastActiveDate y activeDays7/30 salen de la tabla diaria. currentVotes cuenta discos distintos que tienen un Rate actual con rate IS NOT NULL; no es historial de votos. voteActions7/30, lastVoteAt y votesByDay se completan solo desde el inicio de captura de acciones descrito debajo; antes son null/desconocidos, no cero. No inferirlos de editedAt. Orden de usuarios por última actividad descendente, luego username; usuarios sin actividad al final. No devolver email ni perfil completo.

### Contrato histórico de `GET /api/activity/summary` (retirado en I1-E03h)

Query from, to (fechas naturales Madrid inclusivas; por defecto últimos 30 días hasta hoy). Serie con un registro por día, incluso sin actividad:

    {
      "from": "2026-09-23",
      "to": "2026-10-22",
      "timezone": "Europe/Madrid",
      "activityDataSince": "2026-10-22",
      "voteDataSince": null,
      "periods": {
        "activeUsers7": 33,
        "activeUsers30": 71,
        "voteActions7": null,
        "voteActions30": null,
        "votingUsers7": null,
        "votingUsers30": null
      },
      "series": [{
        "date": "2026-10-22",
        "activeUsers": 18,
        "voteActions": null,
        "votingUsers": null
      }]
    }

activeUsers es COUNT(*) de filas usuario/día. periods cuenta usuarios distintos activos/votantes dentro de las ventanas inclusivas de 7/30 días terminadas hoy en Madrid. activityDataSince y voteDataSince documentan desde cuándo cada métrica es completa. Antes de voteDataSince, voteActions/votingUsers por día y período son null/desconocidos; después salen de acciones válidas, sin contar cambios de portada.

### GET /api/activity/users/:userId

Solo superadmin. Devuelve para un usuario los días activos y el detalle de actividad/votos en el rango Madrid solicitado (from/to; por defecto 30 días hasta hoy): { userId, lastActiveDate, activeDays7, activeDays30, activeDates, currentVotes, voteActions7, voteActions30, voteActionsRecorded, lastVoteAt, votesByDay }. voteActionsRecorded suma eventos desde que se activa la captura; no es un total histórico anterior. El rango limita activeDates y votesByDay; activeDays7/30 y voteActions7/30 siempre son ventanas móviles de días naturales Madrid terminadas hoy. Usuarios inexistentes conservan el 404 habitual.

### Captura de acciones de voto (BC-ID-3F.3)

`rate_vote_events` conserva metadatos mínimos: usuario, `occurred_at` UTC y transición `set` o `change`; no duplica nota, portada, disco ni snapshot. Se escribe en la misma transacción que `Rate`:

- `set`: una fila nueva con `rate` no nulo, o una fila existente cuyo `rate` pasa de nulo a un valor.
- `change`: `rate` cambia numéricamente entre dos valores no nulos.
- No se registra una modificación exclusiva de `cover`, una repetición del mismo valor (`8` y `8.0` son iguales), la retirada de `rate` a nulo ni el borrado de la fila. Por tanto, las acciones guardadas describen valoraciones efectivas realizadas; `currentVotes` consulta el estado actual y sí disminuye al retirar/borrar una valoración. Los eventos anteriores no se borran: no significan que el voto siga vigente.
- La escritura del evento va después de guardar `Rate`, dentro de la misma transacción; cualquier error revierte ambas escrituras. En `create`, un advisory lock transaccional por usuario/disco serializa reintentos/primeras inserciones contra la búsqueda existente, que no tiene unicidad de esquema. Un reintento con el mismo valor no añade evento.
- La migración `1792000000000-CreateRateVoteEvents` crea además el singleton `rate_vote_event_capture`, cuyo `started_at` marca el inicio real. `voteDataSince` es el día Madrid siguiente, para no presentar el día parcial de activación como completo. `voteActionsRecorded` y `lastVoteAt` pueden incluir eventos de ese día.
- No rellenar eventos históricos desde `createdAt` ni `editedAt`: son insuficientes y `editedAt` también cambia por `cover`. Los eventos previos al inicio de captura son desconocidos, no cero ni un histórico total. `currentVotes` es el único dato de votaciones derivado del estado actual de `Rate`.

La tabla tiene FK a `User` con borrado en cascada e índices por `(user_id, occurred_at)` y `occurred_at`, ligados a consultas por usuario/rango y agregados temporales. No se crea una tabla duplicada de votos ni se modifican tablas existentes.

### Implementación BC-ID-3F.3

- `RatesService.create()` registra `set` al crear una valoración y `set`/`change` al actualizar la fila existente según el valor previo. `update()` registra solo cambios efectivos de `rate`; `remove()` no registra evento.
- `ActivityStatisticsService` implementa lecturas SQL en PostgreSQL, con agregados separados, calendario `generate_series`, rangos UTC semiabiertos derivados de medianoches de `Europe/Madrid`, paginación SQL y bindings para valores. No se añadió caché. Los índices de la migración corresponden a las consultas nuevas; no se midieron con datos representativos.
- Rutas nuevas, todas `superadmin`: `GET /api/activity/users` (limit 1–100, offset, from/to), `GET /api/activity/users/:userId` (404 si falta el usuario) y `GET /api/activity/summary`. Las fechas son Madrid inclusivas; por defecto se consultan los últimos 30 días hasta hoy. Las respuestas incluyen `timezone`, ventanas 7/30 y límites de cobertura; valores previos/incompletos son `null`.
- El listado incluye todos los usuarios, también quienes entran pero no votan; devuelve `userId`/`username`, `currentVotes`, acciones registradas/7/30, última acción y `votesByDay`. El detalle añade `activeDates`; el resumen agrega usuarios activos, acciones y usuarios votantes.
- `activityDataSince` es conservador: si hay registros diarios, comienza el día posterior al primer día observado. Antes de ese corte las series/ventanas se marcan desconocidas. No se altera `UserAccessLog`.
- La prueba PostgreSQL opt-in de 3F.3 cubre migración, rollback si falla la inserción del evento y agrupación por día Madrid. No se ejecutó: requiere una base loopback vacía con prefijo `bc_id_3f_3_` y `RATE_VOTE_EVENTS_PG_INTEGRATION=1`.

### Implementación I1-E03b — Agregados base para el dashboard

**Estado:** completada el 2026-10-24. I1-E03b preservó temporalmente la respuesta legacy; el bloque HTTP se habilitó en I1-E03c. I1-E03h retiró después el payload y cálculo legacy.

- `ActivityStatisticsService.getDashboardBaseAggregates(range)` calcula una ventana Madrid inclusiva y es reutilizado por I1-E03c para construir el contrato definitivo.
- `activeUsers` cuenta `COUNT(DISTINCT user_id)` sobre `user_app_daily_activity` para todo el rango; la serie diaria cuenta usuarios distintos por fecha. No suma conteos diarios para obtener el total del período.
- `newVotes` cuenta únicamente `rate_vote_events.event_type = 'set'`; `votingUsers` cuenta usuarios distintos con esos mismos eventos. El ledger existente registra `set` al crear o asignar una valoración y omite cambios solo de portada, la misma nota, retirada y borrado. No se reconstruyen eventos desde `Rate.createdAt` o `editedAt`.
- `currentRatings` es el conteo actual de filas de `rate` con `rate IS NOT NULL`, independiente del rango y sin comparación histórica. No se usa como sustituto de votos nuevos.
- La cobertura de actividad reutiliza el límite conservador `MIN(user_app_daily_activity.activity_date) + 1`; si no hay filas, el corte es desconocido. La cobertura de voto usa el singleton `rate_vote_event_capture.started_at`, convertido a fecha Madrid y avanzado al día siguiente. Si el rango agregado empieza antes del corte, su total es `null`; en la serie, cada día anterior al corte es `null`, y un día desde el corte sin filas vale `0`. No se rellenan fechas históricas.
- La consulta usa CTEs separados para fuentes; `GROUPING SETS` deriva total y días desde una agregación por fuente del rango, y luego une solo resultados ya agregados al calendario. Los eventos usan límites UTC semiabiertos derivados de medianoches `Europe/Madrid`, lo que incluye ambos días solicitados aun en cambios DST. Los parámetros de fecha van enlazados y el nombre de zona es constante de código.
- Índices revisados: actividad tiene PK `(user_id, activity_date)`, útil para unicidad y consultas por usuario; no hay índice dedicado solo a `activity_date`. `rate_vote_events` tiene `IDX_rate_vote_events_occurred_at` para rangos temporales y `IDX_rate_vote_events_user_occurred_at` para búsquedas por usuario. El conteo actual de Rate no tiene un índice específico de `rate IS NOT NULL`. No se añadieron índices porque no se dispone de plan medido con datos representativos; no se accedió a una base real.
- Tests: Activity, 5 suites/38 aprobados y 7 opt-in omitidos; `RatesService`, 1 suite/16 aprobados. Las nuevas pruebas validan agregados únicos, series, `set` exclusivo, límites inclusivos Madrid, cero frente a cobertura ausente/parcial, total Rate y ausencia de joins crudos que inflen conteos. Las pruebas existentes de `RatesService` siguen caracterizando `set`, `change`, cover-only y actualizaciones sin cambio; no se modificaron.
- Typecheck (0 errores), Build, ESLint de solo lectura sobre los archivos modificados y `git diff --check` pasaron. `yarn verify` se detuvo en el gate global de ESLint con 0 hallazgos nuevos y 35 entradas históricas obsoletas asociadas a `src/winston.config.ts`, que ya tenía cambios locales ajenos a esta tarea; no se alteró ese archivo. La suite PostgreSQL opt-in no se ejecutó.
- I1-E03c completa estos agregados con rangos actual/anterior/baseline, comparativas y tasas; no se reutiliza `voteActions*` legacy como métrica set-only.

### Implementación I1-E03c — Comparativas y métricas derivadas

**Estado:** completada el 2026-10-24. I1-E03c añadió el bloque `dashboard`; I1-E03h retiró los campos de primer nivel legacy tras migrar el frontend.

- La resolución actual continúa usando I1-E03a. Para una ventana inclusiva de `N` fechas Madrid, `previous` es `[current.from - N, current.from - 1]`; `baseline` es `[previous.from - N, previous.from - 1]`. Son ventanas contiguas sin solapamiento. La aritmética opera sobre fechas ISO/UTC de calendario, no en bloques de 24 horas, así que el cruce DST conserva N días.
- `activeUsers` compara los distintos usuarios activos del rango; `newVotes` compara únicamente los eventos `set`; `votingUsers` compara los usuarios distintos con `set`. Sus deltas son actual menos previo y `changePercent` es delta / previo × 100 si el previo no es cero.
- `participationRate` = `votingUsers / activeUsers × 100`; `votesPerActiveUser` = `newVotes / activeUsers`. Los deltas de ambas tasas se expresan en puntos porcentuales para participación y en votos por usuario activo para intensidad. `returningUsers.current` es la intersección de usuarios activos current/previous; su valor `previous` es la intersección previous/baseline. `retentionRate.current` = recurrentes current / activos previous × 100; su valor previous = recurrentes previous / activos baseline × 100. La variación porcentual compara ambos valores, cuando el previo es distinto de cero.
- Las intersecciones salen de usuarios distintos por período en PostgreSQL, nunca de una suma de la serie diaria. La consulta abarca baseline→current en una lectura de actividad y hace los joins entre conjuntos ya reducidos a una fila usuario/período. `currentRatings` se cuenta solo para el actual (Rate actual con `rate IS NOT NULL`) y su histórico, delta y cambio porcentual son `null`/`unavailable`.
- La base se consulta por rango para reutilizar el agregado I1-E03b. La lectura de Rate y la serie se omiten en baseline; la lectura de Rate también se omite en previous, porque solo el KPI actual la necesita.
- Cada `MetricComparison` conserva current/previous, delta, `changePercent` y cobertura. Métricas derivadas combinan cobertura de actividad y votos; recurrencia/retención requieren cobertura de los períodos que forman cada intersección y exponen también baseline. Cobertura ausente o parcial produce valor `null` y comparación incompleta; denominadores cero producen `null` con `reason: zero_denominator`. Las series nuevas incluyen días actuales/previos y conservan `0` solo para días cubiertos sin actividad y `null` para días previos al corte.
- `asOf` es UTC ISO. `timezone` sigue siendo `Europe/Madrid`. El endpoint sigue protegido por `superadmin`; no cambian DTOs de entrada, autorización ni captura de datos.
- Tests: Activity, 5 suites/41 aprobados y 7 opt-in omitidos. Typecheck sin errores, Build, ESLint de solo lectura sobre los archivos modificados y `git diff --check` pasaron. `yarn verify` pasó sus gates de estructura y tipado seguro sin hallazgos nuevos, pero se detuvo en ESLint global: 0 nuevos y 35 entradas obsoletas de `src/winston.config.ts`, archivo con cambios locales ajenos a esta tarea; no se modificó. La limitación pendiente es no haber ejecutado estas consultas contra PostgreSQL real/fixture ni medido su plan; no se conectó a producción, no se ejecutaron migraciones y no se añadieron índices.
- **Pendiente I1-E03d:** validar agregaciones, cobertura histórica, comparativas y planes con datos representativos. Se prefiere una copia aislada de producción; una lectura estrictamente read-only de producción solo se permite con autorización explícita y controles de seguridad definidos en el roadmap Identity. No se requiere una base local sintética.

### Validación I1-E03d — Contrato, integración y rendimiento

**Estado:** pendiente, no completada. En esta tarea de planificación no se ejecutaron consultas a ninguna base ni migraciones.

- Se amplió `activity.http.spec.ts` con una prueba HTTP que serializa el bloque `dashboard` completo junto con todos los campos legacy. La misma suite ya confirma `superadmin` y rechaza la combinación de `period` con fechas, además de presets no permitidos. Las pruebas de servicio/DTO cubren rangos, comparativas, cobertura y null frente a cero; este test HTTP no se presenta como integración PostgreSQL.
- Resultado focalizado: `yarn test:unit src/identity/activity --runInBand`, 5 suites aprobadas, 42 tests aprobados y 7 opt-in omitidos. La suite HTTP requirió permiso de loopback porque Supertest abre un listener local; el primer intento dentro del sandbox terminó con `listen EPERM`, y al repetir con loopback permitido pasó.
- ESLint focalizado de solo lectura sobre Activity pasó. No se consultó base compartida o productiva. La disponibilidad de producción/copia aislada se comprobará únicamente cuando E03d se ejecute con la autorización y los controles indicados en el roadmap Identity.
- No se ejecutó `EXPLAIN` ni `EXPLAIN ANALYZE`. La revisión estática conserva los índices conocidos: PK de actividad `(user_id, activity_date)`, índices de eventos `occurred_at` y `(user_id, occurred_at)`, e índice de Rate por usuario/disco; no se añadió índice ni se afirma rendimiento de producción. Las queries de dashboard agregan por fuente y limitan la intersección de usuarios a un conjunto por usuario/período, pero quedan sin medir lecturas, buffers y escalabilidad.
- No se añadieron datos ficticios como sustituto de la integración ni se ejecutaron migraciones. E03d validará valores esperados para 7/30/90 días y rangos personalizados, cobertura y límites Madrid/DST usando preferentemente una copia aislada de producción; no requiere crear una base local sintética ni infraestructura nueva.
- Typecheck (`yarn quality:typecheck`) y Build (`yarn build`) pasaron. `yarn verify` aprobó integración de gates, estructura y tipado seguro, y se detuvo en ESLint global: 839 diagnósticos, 0 nuevos y 35 entradas obsoletas asociadas al `src/winston.config.ts` con cambios locales preexistentes; no se tocó ese archivo ni su baseline. `git diff --check` pasó.
- **Pendiente:** validar recuentos de activos y `set`, exclusión de `change`, cobertura/nulls y comparativas, y revisar planes SQL con volumen representativo. Se prefiere copia aislada; producción solo admite consultas estrictamente read-only tras autorización explícita, con cuenta dedicada, consultas acotadas/aprobadas, timeout y resultados agregados o anonimizados. Producción prohíbe escrituras, migraciones, cambios de esquema y `EXPLAIN ANALYZE`; no descargar datos personales innecesarios. No repetir las pruebas unitarias/HTTP ya aprobadas. E03d sigue pendiente hasta registrar esta evidencia; E03e y las tareas frontend posteriores pueden avanzar, pero activar el dashboard desplegado queda condicionado a verificar versión backend, migraciones aplicadas y cobertura real.

### Limpieza I1-E03h — eliminación definitiva de estadísticas legacy

**Estado:** completada el 2026-10-24.

- Contrato final: `GET /api/activity/summary` devuelve únicamente `{ dashboard }`. Se conserva dentro de ese bloque la estructura establecida por I1-E03c: períodos actual/anterior/baseline, zona `Europe/Madrid`, `asOf`, cortes de cobertura, métricas y comparativas, stock de valoraciones, y series actuales/previas con valores `null` para datos no cubiertos.
- Se eliminaron del nivel raíz `from`, `to`, `timezone`, `activityDataSince`, `voteDataSince`, `periods` y `series`, junto con `ActivitySummaryPeriod` y `ActivitySummaryDay`.
- `getSummary()` ya no ejecuta la query antigua de calendario, actividad diaria, acciones de voto (`set` y `change`) y usuarios votantes. Las consultas del dashboard permanecen en `getDashboardBaseAggregates()` y `getDashboardReturningCounts()`; los eventos `change` continúan almacenados y disponibles para las estadísticas compartidas de usuario.
- Auditoría de consumidores: el controller de Activity delega el resumen exclusivamente a `ActivityStatisticsService.getSummary`; el cliente frontend documentado para E03e/f/g usa `dashboard`. No se hallaron consumidores internos del backend para las propiedades raíz retiradas. `ActivityService.getAllActivity()`, `getUserActivity()` y `findAllAdminStats()` siguen conectados a los endpoints históricos de Auth y sus pruebas, por lo que se conservan. Las rutas `/activity/users`, `/activity/users/:userId` y `/activity/app/daily`, el registro diario y la lectura/escritura de Rate tampoco cambian.
- Los tests unitarios y HTTP de Activity fijan el contrato de solo `dashboard`, presets/fechas, coberturas y `null`, comparativas, usuarios recurrentes, eventos `set` y Rate actual. Los endpoints compartidos conservan sus suites sin cambios de comportamiento.
- No se requieren migraciones ni cambios de esquema. Riesgo de despliegue: cualquier cliente externo que aún lea los campos legacy de primer nivel dejará de recibirlos; el consumidor frontend revisado ya no depende de ellos. Desplegar el backend tras confirmar que la versión frontend que consume `dashboard` está activa; esta tarea no despliega ni consulta producción.
- `roadmap/frontend-architecture.md` no existe en este workspace; no se modificó otro repositorio.

## Consultas PostgreSQL

- Actividad individual: filtro user_id y rango directo de activity_date, listado de fechas y COUNT(*) FILTER (WHERE activity_date >= ...) para ventanas de 7/30 días.
- Usuarios activos por día: GROUP BY activity_date, COUNT(*); crear el calendario con generate_series y LEFT JOIN para incluir ceros.
- Per-user actuales: agrupar Rate por userId con COUNT(*) FILTER (WHERE rate IS NOT NULL); incluir todos los User mediante LEFT JOIN.
- Acciones de voto por día: rango UTC semiabierto derivado de medianoches Madrid convertidas a UTC, agrupar por occurred_at AT TIME ZONE 'Europe/Madrid'; calcular COUNT(*) y COUNT(DISTINCT user_id).
- Resumen cruzado: calendar series + agregados diarios independientes de actividad y voto, unidos por fecha. Evitar joins directos sin preagregar, que multiplicarían filas.
- Dashboard I1-E03b: `getDashboardBaseAggregates()` mantiene CTE independientes `activity_period`, `vote_period`, `activity_daily`, `vote_daily` y `current_ratings`; `GROUPING SETS` calcula los agregados diarios y del rango en una lectura de filas del período por fuente. `event_type = 'set'` se filtra antes de contar y no se une `Rate` a eventos o actividad.
- Paginar en SQL y evitar N+1. No añadir índices por intuición: revisar el índice existente IDX_rate_user_disc_d46 y medir consultas con parámetros/datos representativos antes de cualquier índice adicional. La PK usuario/fecha cubre lookup de usuario y unicidad diaria; considerar un índice de fecha solo tras EXPLAIN (ANALYZE, BUFFERS).

## Roadmap

| Subtarea | Tamaño | Dependencias | Objetivo y criterios de aceptación | Verificaciones previstas |
|---|---:|---|---|---|
| **BC-ID-3F.1 — Análisis inicial** (completada 2026-10-22) | XS | Ninguna | Auditoría inicial de UserAccessLog, sesiones, consultas y plan. Su conclusión App/Wiki queda corregida por esta revisión; no se vuelve a implementar ni se altera su histórico. | Diff documental y enlaces; realizados en el corte inicial. |
| **BC-ID-3F.2 — Registro diario de actividad** (completada 2026-10-22) | M | BC-ID-3F.1; AuthSession.clientType/SessionCredential y ruta renovable disponibles | Crear tabla aditiva `user_app_daily_activity` con PK/FK usuario-fecha y endpoint autenticado `POST /api/activity/app/daily` (204). Derivar `clientType` en JWT de la `SessionCredential` validada; denegar claim ausente/Wiki. Calcular `activity_date` en PostgreSQL con `Europe/Madrid`; `ON CONFLICT DO NOTHING`. No tocar `refresh-v1` ni `UserAccessLog`. | Pasaron tests focalizados y `yarn verify` (0 hallazgos nuevos; 204 suites aprobadas). La prueba PostgreSQL opt-in cubre migración, concurrencia y límites Madrid/DST, pero no se ejecutó: requiere `ACTIVITY_PG_INTEGRATION=1` y una base loopback vacía `bc_id_3f_2_*`. `git diff --check` sin errores. |
| **BC-ID-3F.3 — Historial de votaciones y consultas** (completada 2026-10-22) | M | BC-ID-3F.2; definición de transición efectiva de `rate` | Añadir ledger mínimo transaccional `set`/`change`; cover-only, misma nota, retirada y borrado no crean acciones. Implementar endpoints tipados/paginados bajo `superadmin`, conservar endpoints Community e históricos. No backfill. | `yarn verify` aprobado: 205 suites/1.960 tests aprobados; 14 suites/90 pruebas omitidas por opt-in o entorno. Focales de Rate, estadísticas y autorización aprobadas. PostgreSQL opt-in preparado, no ejecutado por falta de base loopback vacía; `git diff --check` aprobado. Sin migración ejecutada ni índices sujetos a medición. |
| **BC-ID-3F.4 — Integración con App y validación** (integración implementada; pendiente publicación) | M | 3F.2/3F.3 desplegables y App coordinada | App envía `POST /api/activity/app/daily` sin body tras login y restauración satisfactoria, mediante el cliente autenticado y sin esperar el resultado. Refresh no llama al endpoint; los duplicados diarios los absorbe la restricción del backend. Wiki y dashboard quedan fuera del alcance. | Tests focalizados del store/API y suite completa App: 100 tests aprobados; `yarn build`/typecheck aprobados. Pendiente publicar backend, aplicar las dos migraciones aprobadas, publicar App y recibir confirmación de captura real del usuario. BC-ID-3F permanece abierta hasta esa confirmación. |

La revisión justificó el ledger mínimo de transiciones de `rate`: sin él, las estadísticas exactas de votación diaria solicitadas eran irrecuperables a partir de `Rate`. No se guardan copias de puntuaciones ni datos de disco. BC-ID-3F.1, 3F.2 y 3F.3 están completadas; la integración de 3F.4 está implementada localmente y su cierre depende de publicar el registro y confirmar la captura real.

## Siguiente tarea de implementación recomendada

BC-ID-3F.4 queda pendiente de publicación ordenada del backend, aplicación de migraciones, publicación de App y confirmación de la captura real. No incluye Wiki ni dashboard.

## Procedimiento de PR para futuras tareas autorizadas

Cuando una tarea futura autorice publicar: preparar commit y PR; esperar a que el gateway complete sus checks; si todos pasan, hacer merge; si alguno falla, detenerse e informar. No añadir verificaciones manuales posteriores al gateway, repetir pruebas ni consultar estados adicionales innecesariamente. Esta tarea documental no autoriza push, merge ni despliegue.
