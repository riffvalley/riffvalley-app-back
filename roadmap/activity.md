# Actividad — ACT-BE

**Alcance:** historial personal cronológico de valoraciones y cambios de puntuación. Este plan es exclusivo del backend. Actividad es una capacidad de lectura independiente de Estadísticas; Rates conserva las escrituras y las reglas de valoración.

**Estado:** ACT-BE-1, ACT-BE-2, ACT-BE-3a, ACT-BE-3b, ACT-BE-3c y ACT-BE-4 completadas el 2026-10-29. Backend de Actividad completado y cerrado para el alcance acordado, condicionado a la verificación PostgreSQL aislada pendiente. No se inició trabajo de frontend.

## ACT-BE-1 — Auditoría de Rates y eventos

**Estado:** completada el 2026-10-29. Auditoría estática de entidad, escrituras, consultas, estadísticas, migraciones y pruebas. Sin cambios funcionales, conexión a bases de datos ni consultas a producción.

### Hallazgos

#### Entidad y captura

- `RateVoteEvent` persiste filas individuales en `rate_vote_events`: UUID, `user_id`, `occurred_at` (`timestamptz`, default PostgreSQL `CURRENT_TIMESTAMP`), `event_type` (`set`/`change`), `disc_id` nullable, `previous_value` y `new_value` (`decimal(4,2)`, ambos nullable). La relación con User es obligatoria y `ON DELETE CASCADE`; la relación con Disc es nullable y `ON DELETE SET NULL`. La tabla no conserva imagen, artista, género ni snapshot del catálogo.
- `RatesService.create()` y `update()` llaman a `recordVoteEvent()` dentro de la misma transacción que guarda Rate. La inserción de evento falla la transacción completa. `create()` serializa la búsqueda/inserción de una pareja usuario/disco con advisory lock; `update()` bloquea la fila Rate con `pessimistic_write` y comprueba ownership.
- Se emite `set` cuando una fila nueva trae puntuación no nula o cuando una fila existente pasa de `rate = null` a una puntuación. Se emite `change` al pasar entre dos puntuaciones no nulas distintas. La comparación numérica considera `8` y `8.00` iguales. No se emite evento por una valoración solo de portada, una edición solo de portada, repetir la puntuación, limpiar puntuación a `null` ni borrar Rate. Una valoración borrada y creada de nuevo puede producir otro `set`; por tanto, `set` significa transición capturada de ausencia actual a puntuación, no primera valoración vitalicia.
- Cada transición efectiva escrita crea una fila con usuario, disco (si no se elimina después), tipo, puntuación anterior/nueva y fecha. Un `set` tiene anterior `null`; un `change` conserva ambos valores. Los campos de disco y puntuación se añadieron nullable después de crear el ledger y no hubo backfill: pueden existir filas antiguas con `disc_id`, `previous_value` y `new_value` a `null`. No se consultó ninguna base para determinar si hay filas así en cada entorno.
- La migración `1792000000000-CreateRateVoteEvents` crea la tabla, los índices `(user_id, occurred_at)` y `(occurred_at)`, y el singleton `rate_vote_event_capture.started_at`. La migración `1792010000000-AddDiscAndValuesToRateVoteEvents` agrega disco y valores sin actualizar filas anteriores. El instante real de inicio por entorno está en el singleton si las migraciones se aplicaron; el número/nombre de migración no prueba cuándo se aplicaron.

#### Fechas y reconstrucción

- `occurred_at` representa un instante PostgreSQL `timestamptz`, internamente comparable como instante UTC. Sin embargo, su default es `CURRENT_TIMESTAMP`, que PostgreSQL fija al inicio de la transacción. Con contención/bloqueos puede ser anterior al momento en que se guarda Rate y se inserta su evento. Las transacciones concurrentes pueden empezar en un orden y adquirir el bloqueo en otro. Es la fecha registrada por el ledger, no una prueba exacta del orden real de serialización bajo contención.
- La precisión disponible es la de `timestamptz` de PostgreSQL (microsegundos por defecto), pero dos eventos pueden compartir marca temporal. El UUID da identidad, no orden cronológico. Ordenar además por ID permitiría paginación determinista, aunque no establece cuál acción simultánea ocurrió primero. Capturar la hora de escritura de evento y fijar un desempate estable se debe resolver en el diseño ACT-BE-2.
- `Rate.createdAt` y `Rate.editedAt` existen en la entidad con decoradores de fecha sin tipo/zona explícitos en el código de entidad. `editedAt` se actualiza al editar Rate y puede cambiar por una modificación de portada; no conserva una secuencia de ediciones. Ninguno equivale a la hora de escucha del disco. El backend no registra fecha real de escucha en esta ruta.
- Para mostrar días locales, ACT-BE-2 fija fechas civiles más zona IANA explícita y límites semiabiertos. La base usa `timestamptz` para el ledger y las estadísticas existentes calculan días de negocio en `Europe/Madrid`; eso no significa que el ledger guarde una fecha local ni permite usar `Rate.createdAt` como sustituto de `occurred_at`.

#### Historial existente y agregaciones

- `RatesHistoryService` (`GET /api/rates/user/:userId/history`) no consulta `rate_vote_events`. Sintetiza `created` desde `Rate.createdAt` y, como máximo, un `updated` desde el único `Rate.editedAt` retenido, mostrando los valores actuales de la fila. No tiene puntuaciones anterior/nueva, pierde modificaciones intermedias y puede atribuir a una edición de puntuación una edición que solo afectó a portada. Además, la ruta no lleva `@Auth()` y acepta un `userId` de ruta. No debe reutilizarse como fuente ni como autorización de Actividad.
- `RatesStatsService`, `HistoricalRatesStatsService`, `CommunityDashboardRatesService` y `ActivityStatisticsService` consultan `rate_vote_events` para agregados. Las métricas de votos nuevos filtran `set`; otras series y totales pueden contar ambos tipos. Son consumidores estadísticos, no una API de cronología individual. El `ActivityModule` existente vive en `src/identity/activity`, gestiona presencia/estadísticas de actividad y ya registra RateVoteEvent para agregados, pero no ofrece el historial personal de puntuaciones. ACT-BE-2 asigna la nueva consulta a un `ActivityHistoryModule` de Community, separado de `ActivityStatisticsService` y del módulo de presencia/estadística de Identity.
- Las pruebas inspeccionadas cubren las reglas `set`/`change`, escritura omitida para edición de portada/valor igual/limpieza, atomicidad por error de ledger, migraciones y preservación de filas legacy con columnas nuevas nulas. Las pruebas PostgreSQL de ledger son opt-in y no se ejecutaron. Los tests de estadísticas caracterizan agregaciones, no una consulta paginada de historial por usuario.

### Contract finding

**Current behavior:** `GET /api/rates/user/:userId/history` no lleva `@Auth()` y permite pedir el historial aproximado de cualquier `userId` conocido.

**Problem:** además de no ser una secuencia de eventos fiable, la ruta no limita el acceso al historial al usuario autenticado.

**Impact:** backend + frontend; el consumidor frontend actual no se inspeccionó en este repositorio.

**Options:** preservar la ruta legada mientras se revisan consumidores; cambiar su autorización/contrato; retirarla tras confirmar que no quedan consumidores.

**Recommendation:** no reutilizarla para Actividad. La nueva lectura debe derivar el usuario del JWT. Revisar el endpoint legado como decisión separada con inventario de consumers, sin cambiarlo en esta auditoría.

**Blocks the current task:** No; la nueva consulta puede aplicar aislamiento propio por usuario.

#### Qué pasado puede recuperarse

| Categoría                                         | Recuperabilidad real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Eventos completos y fiables                    | Desde que la captura está activa, las filas con `disc_id` y valores conservados identifican cada transición registrada, su usuario, tipo, valores y timestamp de ledger. El timestamp puede reflejar inicio de transacción bajo contención y los atributos del catálogo se leen de las relaciones actuales, no de snapshots. “Fiable” describe la transición persistida, no la primera valoración de vida.                                                                                                         |
| 2. Fecha inicial de fila, sin cambios intermedios | Una Rate que aún exista conserva `createdAt`, que fecha la creación de la fila, no necesariamente la primera puntuación: la fila pudo crearse solo con portada. `editedAt` solo conserva la última edición y puede referirse a portada. No hay evidencia suficiente para convertir esas fechas en eventos confirmados de puntuación, así que no se reconstruirán como `set`/`change`.                                                                                                                              |
| 3. Agregaciones                                   | Los contadores/series de Estadísticas resumen eventos por usuario, día o tipo; su respuesta no identifica discos ni acciones individuales. El ledger fuente conserva filas individuales solo para el período efectivamente capturado y con las limitaciones de campos legacy indicadas.                                                                                                                                                                                                                            |
| 4. Irrecuperable                                  | Acciones anteriores al inicio efectivo de captura; valores e IDs de disco ausentes en filas legacy; cambios intermedios previos a conservarlos; notas anteriores de Rates existentes antes del ledger; fechas reales de escucha; y acciones de retiradas/borrados, que nunca generan evento. Si se elimina User, el FK también elimina sus eventos. Si se elimina Disc, el evento sobrevive pero pierde `disc_id`, por lo que ya no se puede abrir el disco desde esa fila. No se inferirán ni inventarán eventos. |

La disponibilidad de eventos completos depende de la fecha de activación de captura en cada base y de las columnas presentes. Esa fecha se debe consultar en un entorno autorizado antes de comunicar cobertura durante ACT-BE-3; no se consultó producción para esta auditoría ni para ACT-BE-2.

#### Datos que podría presentar Activity

- Persistidos en evento: ID de evento, `set`/`change`, `user_id`, `disc_id` nullable, valor anterior/nuevo nullable y `occurred_at`.
- Obtenibles mediante joins actuales: nombre/ID de Disc, Artist y Genre, e imagen actual del Disc. La portada valorada del usuario podría leerse de Rate actual, pero no es un valor histórico del evento. Nombre, imagen y género no son snapshots y pueden cambiar; tras borrar Disc no quedan disponibles por la relación.
- No disponible como estado histórico: portada de la fecha del evento, datos de catálogo anteriores a ediciones, ni un detalle del disco para un evento con `disc_id` perdido. El ID actual de Disc sirve para navegación cuando la relación todavía existe.
- Una página debe resolver todas las relaciones en SQL con proyección explícita, sin cargar entidades con relaciones eager innecesarias ni hacer una consulta por evento. ACT-BE-2 define el DTO con valores históricos anterior/nuevo y datos actuales del catálogo claramente distinguidos.

#### Viabilidad de las consultas y rendimiento

- Cronología descendente, rango temporal, disco/artista y tipo son viables filtrando el ledger por `user_id`, `occurred_at`, `disc_id` y `event_type` y uniendo Disc/Artist/Genre. El índice existente `(user_id, occurred_at)` cubre el prefijo de usuario y el orden/rango temporal; `(occurred_at)` es global y no reemplaza al índice por usuario. Búsqueda textual por disco/artista puede requerir filtros de joins y su coste debe medirse.
- Paginación estable usa orden total timestamp más ID y cursor keyset. Esto estabiliza un conjunto estático, pero el ID aleatorio no corrige timestamp de inicio de transacción ni prueba el orden causal de marcas empatadas; ACT-BE-2 documenta el límite con escrituras concurrentes.
- Autorización futura debe derivar el usuario exclusivamente de `@GetUser()` bajo `@Auth()` y evitar aceptar un usuario arbitrario. La ruta histórica de Rates por `userId` no satisface ese requisito.
- No se añadieron índices ni se estimó coste con `EXPLAIN`; sin parámetros y datos representativos no hay evidencia para otra migración/índice. La consulta debe evitar N+1 y separar el total solo si el contrato de paginación requiere total exacto.

### Decisión de arquitectura recomendada

1. **No leer `RatesHistoryService` para Actividad:** reconstruye aproximaciones desde una fila mutable y no puede recuperar cambios consecutivos ni sus valores anteriores.
2. **No crear una segunda fuente de verdad ni event sourcing:** reutilizar `rate_vote_events` como registro de transiciones que escribe Rates. Rates continúa siendo responsable de reglas y escrituras; el módulo Activity será propietario de la consulta y proyección de lectura del historial.
3. **Usar una proyección SQL de lectura en Activity** que una eventos con el catálogo actual y pagine/filtre en base de datos. La persistencia actual permite publicar el historial con el límite temporal documentado; el ajuste condicional de `occurred_at` no convierte el orden en orden de commits. No se justifica una segunda tabla de eventos ni hay backfill fiable.
4. **No exponer cobertura histórica como historia completa:** documentar la captura efectiva y tratar filas legacy o campos nulos como incompletos. Mantener explícita la distinción entre fecha de valoración y fecha real de escucha, esta última no disponible.

### Roadmap backend

| Tarea                                                                       | Tamaño | Dependencias                            | Alcance y criterios de aceptación                                                                                                                                                                                                                                                                                               | Verificación y riesgos                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | -----: | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ACT-BE-1 — Auditoría de Rates y eventos** (completada 2026-10-29)         |      S | Ninguna                                 | Documentar entidades, escrituras, consultas, fechas, casos límite, cobertura pasada, arquitectura e índices existentes. Solo documentación; sin código, migraciones ni accesos a producción.                                                                                                                                    | Inspección estática y de tests/migraciones; enlaces Markdown y `git diff --check` limitados a documentos propios.                                                                                                                                                 |
| **ACT-BE-2 — Contrato HTTP y semántica temporal** (completada 2026-10-29)   |      S | ACT-BE-1                                | Definir endpoint personal, DTO, filtros y validación; zona/día, paginación por evento y cursor; legacy, seguridad, arquitectura, rendimiento y decisión temporal; dejar roadmap implementable sin cambiar código funcional.                                                                                                     | Inspección estática focalizada, enlaces Markdown y `git diff --check` solo para documentos modificados. Sin tests, build, typecheck, E2E ni acceso a base de datos.                                                                                               |
| **ACT-BE-3a — Ajuste temporal del ledger** (completada 2026-10-29)          |      S | ACT-BE-2                                | Para eventos nuevos, `occurred_at` usa `clock_timestamp()` y conserva tipo `timestamptz`; mantener el insert de evento dentro de la transacción de Rate y sin cambiar `set`/`change`. Una migración ajusta el default de bases existentes. No actualizar eventos históricos.                                                    | Cobertura PostgreSQL aislada añadida para comprobar default, timestamp de `set`/`change`, transacción y preservación histórica; ejecución pendiente por falta del servidor local. No confundir hora de evaluación con commit ni afirmar orden causal concurrente. |
| **ACT-BE-3b — Consulta y proyección del historial** (completada 2026-10-29) |      M | ACT-BE-2; ACT-BE-3a solo si se ejecuta  | Añadir servicio/repositorio de lectura del ledger en el nuevo módulo Community de historial Activity. Filtrar por usuario, límites temporales, tipo y texto; ordenar y paginar en SQL; proyectar relaciones actuales del catálogo con joins/select explícitos, sin N+1 ni lecturas de Rate para reconstruir valores históricos. | Tests unitarios focalizados aprobados; suite PostgreSQL opt-in aislada preparada y no ejecutada. Riesgos: búsqueda textual, catálogo mutable y timestamp no causal.                                                                                               |
| **ACT-BE-3c — Exposición HTTP de historial** (completada 2026-10-29)        |      S | ACT-BE-3b                               | Publicar `GET /api/activity/history`, DTO/validación, `@Auth()` y usuario de `@GetUser()`; mantener el endpoint de identidad/statistics existente; integrar módulo en `AppModule`. No aceptar `userId`, cambiar Rates/Estadísticas ni añadir frontend.                                                                          | Tests HTTP focalizados, typecheck, build y ESLint focalizado aprobados. Cursores firmados con HMAC-SHA256 y caducidad 24 h, ligados a usuario y filtros.                                                                                                          |
| **ACT-BE-4 — Verificación, rendimiento y cierre** (pendiente)               |      S | ACT-BE-3b/3c y decisión tomada sobre 3a | Cubrir transiciones consecutivas, eventos del mismo día, empate, nuevos eventos durante navegación, legacy y filtros combinados; verificar DTO, paginación y aislamiento; medir SQL y registrar cobertura efectiva de captura en entorno autorizado, sin inventar backfill.                                                     | Tests focalizados y `EXPLAIN (ANALYZE, BUFFERS)` con parámetros/datos representativos en entorno aislado; no producción. Evaluar índices adicionales solo con plan y frecuencia/coste de escritura documentados.                                                  |

ACT-BE-3 se divide en persistencia temporal (ACT-BE-3a, completada), consulta/proyección (ACT-BE-3b, completada) y exposición HTTP (ACT-BE-3c, completada el 2026-10-29). ACT-BE-4 sigue pendiente.

## ACT-BE-2 — Contrato HTTP y semántica temporal

**Estado:** completada el 2026-10-29. Diseño documental solamente; no se modificó código funcional ni se consultó una base de datos.

### Arquitectura e integración NestJS

- Rates conserva escritura, transacción y semántica de `rate_vote_events`. La consulta nueva leerá ese ledger; no reutilizará `RatesHistoryService`, Rate actual ni `ActivityStatisticsService` y no creará tabla de eventos.
- La capacidad se implementará como módulo propio de lectura, recomendado en `src/community/activity-history/` y llamado `ActivityHistoryModule` para distinguirlo del `ActivityModule` actual. Tendrá servicio de consulta/proyección y controlador propios; se registrará en `AppModule` y usará `TypeOrmModule.forFeature` para `RateVoteEvent` y las entidades de catálogo necesarias, además de `AuthorizationModule`.
- El `ActivityModule` en `src/identity/activity/` permanece dueño de presencia y estadísticas administrativas/de identidad. No se amplía `ActivityStatisticsService`. No hay ciclo de dependencia con Rates: el nuevo módulo consulta directamente la entidad ledger compartida, y Rates no importa el módulo de historial.
- `GET /api/activity/history` no colisiona con las rutas actuales de `ActivityController`: `users`, `summary`, `inactivity`, `users/:userId` y `app/daily`. La nueva ruta no añade identificador de usuario.

### Endpoint, filtros y errores

`GET /api/activity/history` devuelve transiciones individuales en orden descendente. Parámetros definitivos:

| Parámetro  | Contrato                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`     | Opcional, fecha civil estricta `YYYY-MM-DD`, inclusiva en la zona `timeZone`.                                                                                                                            |
| `to`       | Opcional, fecha civil estricta `YYYY-MM-DD`, inclusiva en la zona `timeZone`.                                                                                                                            |
| `timeZone` | Zona IANA requerida si se envía `from` o `to`; p. ej. `Europe/Madrid`. Se valida contra la base de zonas horarias del runtime.                                                                           |
| `type`     | Opcional: `set` o `change`. Ausente significa ambos. No se define valor `all`; omitir el filtro es la opción equivalente.                                                                                |
| `q`        | Opcional, texto UTF-8 recortado, 1–100 caracteres. Búsqueda literal sin distinción de mayúsculas en nombre de disco o artista actuales. `%` y `_` se escapan como literales; no se aceptan patrones SQL. |
| `limit`    | Entero decimal de 1 a 100; predeterminado 30.                                                                                                                                                            |
| `cursor`   | Cursor opaco devuelto por la API; ausente inicia una navegación nueva.                                                                                                                                   |

Fechas de pared (`YYYY-MM-DD`) son la única forma aceptada de `from`/`to`; no se mezclan timestamps con y sin offset. Así no se interpreta una hora sin zona ni se convierte accidentalmente en UTC. Se rechazan fechas de calendario inválidas, fechas fuera del rango soportado por la API, zonas desconocidas, `from > to`, límites fuera de rango, tipos desconocidos, query vacía/solo espacios y campos extraños según el `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`). Intervalo sin `from` o sin `to` es válido. Parámetros/cursor malformados producen HTTP 400 con el formato de validación habitual; sesión ausente/inválida produce HTTP 401 con el guard JWT existente. `limit` fuera del rango no se recorta silenciosamente.

`q` solo encuentra eventos cuyo `disc_id` todavía identifica un disco y cuya relación actual permite buscar título o artista. Eventos sin disco identificable permanecen en resultados sin búsqueda, pero no pueden coincidir con `q`. La búsqueda afecta al catálogo actual, no al nombre histórico del día del evento.

### Límites de fecha, zonas y agrupación

- Se calcula el límite inferior como inicio del día civil `from` en `timeZone` y el superior como inicio del día siguiente a `to` en esa zona. SQL usa siempre el intervalo semiabierto `[fromInstant, toExclusiveInstant)`, traducido a instantes UTC para `occurred_at` (`timestamptz`). No se usa `23:59:59.999` ni `BETWEEN` inclusivo.
- Para un día completo: `?from=2026-10-21&to=2026-10-21&timeZone=Europe/Madrid`. El tamaño del día se obtiene de las reglas IANA y puede ser 23, 24 o 25 horas en cambios DST. Si una zona omite una fecha civil completa (caso histórico de cambio de línea de fecha), se responde 400; medianoches inexistentes por un cambio horario se resuelven al primer instante válido de esa fecha según las reglas de zona.
- Cada llamada que continúa una búsqueda debe repetir los mismos filtros normalizados, incluido `timeZone`; el cursor verifica que coinciden. El frontend agrupa por día en la zona local elegida y no recibe agrupaciones del backend. La zona puede cambiar entre navegaciones nuevas; no forma parte de la identidad persistente del evento.
- La respuesta expone `occurredAt` como timestamp ISO-8601 UTC con `Z`, conservando precisión disponible. No se presenta como hora real de escucha.

### Respuesta y DTO de evento

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "change",
      "occurredAt": "2026-10-31T14:25:18.123456Z",
      "disc": {
        "id": "uuid",
        "title": "Nombre actual del disco",
        "artist": { "id": "uuid", "name": "Nombre actual del artista" },
        "coverUrl": "https://…",
        "genre": { "id": "uuid", "name": "Nombre actual del género" }
      },
      "previousValue": 6,
      "newValue": 9
    }
  ],
  "nextCursor": "opaque-token-or-null",
  "hasMore": true
}
```

`disc` es `null` si `disc_id` es `null` o la relación ya no existe. Cuando hay disco, Artist y Genre son objetos nullable si sus datos relacionados no están disponibles; no se inventan nombres ni IDs. Portada, título, artista y género son datos actuales del catálogo, no snapshots del momento de votar. Valores históricos provienen exclusivamente de `previous_value`/`new_value`; se normalizan como números JSON de 0–10 (hasta dos decimales) o `null` y nunca se sustituyen por `Rate.rate`. Los nulos legacy se preservan explícitamente. Se conserva cada fila; no se eliminan silenciosamente eventos incompletos. `set` no significa primera valoración vitalicia: es una transición capturada de puntuación nula a no nula. `change` es una transición capturada entre valores no nulos distintos. El contrato no afirma registrar portada, repeticiones del mismo valor, borrados, limpiezas a null ni fechas de escucha.

La consulta debe seleccionar columnas y hacer joins SQL de una sola página para Disc/Artist/Genre, con proyección explícita que evite relaciones eager ajenas (comentarios, favoritos, pendientes, países) y consultas por elemento. No se devuelve `userId`: el recurso ya es personal y el ID no es necesario para la UI.

### Paginación, orden y semántica del cursor

- Orden total: `occurred_at DESC, id DESC`. Para valores iguales de `occurred_at`, comparar UUID aporta desempate repetible, no orden de escritura ni orden de commits. La consulta de continuación usa keyset: `(occurred_at, id) < (:cursorOccurredAt, :cursorId)` en orden descendente; no usa offset ni total exacto.
- Leer `limit + 1` filas con proyección y usar la fila extra para saber `hasMore`. Devolver como máximo `limit`; `nextCursor` apunta a la última fila entregada si hay fila extra, y es `null` en caso contrario. `hasMore` false y `nextCursor` null al agotarse. Esto mantiene páginas de 30 por defecto, hasta 100, y no carga el historial completo.
- Cursor opaco base64url versionado y firmado con HMAC-SHA256 (clave derivada de `JWT_SECRET` con separación de propósito), con timestamp/UUID de la última fila, ancla superior de la primera página, usuario autenticado, fingerprint de filtros normalizados (fechas ya resueltas a instantes, zona, tipo, búsqueda normalizada y `limit`), emisión/expiración a 24 horas y versión de formato. Validar firma en tiempo constante, versión, tipos, rangos, UUID, timestamp, caducidad y fingerprint; rechazar cursor corrupto, expirado o usado con otro usuario/filtros con 400. Rotar `JWT_SECRET` invalida cursores activos, que el cliente puede reiniciar solicitando la primera página. No aceptar IDs de usuario ni SQL desde su contenido. Un cursor inválido no se reinicia silenciosamente.
- El ancla superior limita la navegación a la ventana inicial y excluye los eventos nuevos posteriores que queden por encima de ella. Cursor/keyset evita los desplazamientos de offset y no duplica/omite filas de un conjunto estático. El ledger es append-only en este flujo, pero catálogo y commits concurren. Con `CURRENT_TIMESTAMP`, una transacción que comenzó antes puede insertar/confirmar después con timestamp anterior al ancla o al cursor; puede aparecer en una página posterior o quedar detrás del punto ya recorrido. Por ello la navegación es estable de mejor esfuerzo, no snapshot transaccional entre peticiones. Mantener una transacción/snapshot SQL entre requests no es viable; garantizar orden de commits requeriría una secuencia ordenable asignada con semántica adecuada y diseño aparte.

### Seguridad y rendimiento

- Aplicar `@Auth()` y obtener exclusivamente `user.id` mediante `@GetUser()`. La consulta base exige `event.user_id = :authenticatedUserId` antes de filtros, joins y paginación. No se aceptan `userId`, rol administrativo para inspección cruzada ni ruta por dueño. Sesiones inválidas siguen el contrato global JWT (401); el límite global de throttling existente complementa el máximo por página.
- Todos los valores de filtros y cursor se parametrizan. El cursor se valida contra el usuario actual y los filtros; una alteración no permite consultar a otra persona. Los joins son únicamente de catálogo asociado al `disc_id` filtrado y solo proyectan datos públicos necesarios. Nunca se consultan Rate, notas de usuario ni relaciones privadas para construir el DTO.
- El índice `(user_id, occurred_at)` es compatible con filtro personal y rango/order inverso descendente en PostgreSQL. No contiene `id`, así que los empates pueden requerir ordenación adicional. El índice global `(occurred_at)` no sustituye el prefijo por usuario. El filtro de tipo se aplica sobre la tabla ledger; un índice parcial/compuesto solo se considerará si planes y distribución lo justifican. La búsqueda `ILIKE` con comodines en Disc/Artist puede dominar coste y no queda resuelta por el índice del ledger; medir selectividad, joins, cardinalidades y si conviene `pg_trgm` o columna normalizada antes de migrar. El límite y `limit + 1` evitan conteo completo.
- ACT-BE-4 medirá primera página y continuación (con y sin cursor), rangos de uno y muchos días, filtros `set`/`change`, búsqueda común y poco común, muchos discos por artista, eventos sin disco, dataset por usuario pequeño y grande, y empates. Capturará `EXPLAIN (ANALYZE, BUFFERS)` con parámetros/datos representativos en entorno aislado, tiempos p50/p95, filas escaneadas frente a entregadas, uso de índices y memoria/sort. No se ejecuta contra producción en esta fase.

### Cierre de ACT-BE-2

Diseño restringido al backend. No hay implementación funcional, cambios de frontend, migraciones, pruebas/build/typecheck, ni acceso a producción en ACT-BE-2. ACT-BE-3 y ACT-BE-4 seguían pendientes al cerrar esa fase. La fecha de activación real de captura se documentará solo mediante proceso autorizado antes de comunicar cobertura histórica a consumidores.

## ACT-BE-3a — Decisión y ajuste de `occurred_at`

**Estado:** completada el 2026-10-29. Se eligió la alternativa B: usar `clock_timestamp()` para las nuevas filas del ledger.

- **Comportamiento anterior:** `CURRENT_TIMESTAMP` en PostgreSQL representa el inicio de la transacción. Si `RatesService.create()` espera por el advisory lock de usuario/disco, o `update()` espera por el bloqueo de la fila Rate, el evento podía recibir una fecha anterior a la ejecución de su `INSERT` por toda la duración de esa espera y operaciones previas.
- **Alternativas:** conservar `CURRENT_TIMESTAMP` daba una marca estable por transacción, pero no aproximaba el momento de inserción tras esperas; `clock_timestamp()` refleja el reloj del servidor al evaluar el default en cada inserción. Ninguna opción marca el commit ni establece el orden entre transacciones concurrentes.
- **Decisión:** usar `clock_timestamp()` en el default de entidad y PostgreSQL. El beneficio es una fecha más próxima al registro del evento en la operación de Rates, en particular cuando hay contención. Se conserva `timestamptz`, la inserción de ledger sigue dentro de la transacción de Rates, y no cambian las condiciones, valores ni nombres de eventos `set`/`change`.
- **Migración:** `src/migrations/1792040000000-UseClockTimestampForRateVoteEvents.ts` cambia solo el default de `occurred_at`; su reversión restaura `CURRENT_TIMESTAMP`. No actualiza filas existentes, IDs ni relaciones. Es una migración independiente y manual según las salvaguardas del proyecto; no se ejecutó en ninguna base en esta tarea.
- **Inserciones de Rates:** `recordVoteEvent()` continúa omitiendo `occurred_at` para que PostgreSQL aplique el default vigente. No se establecen timestamps explícitos desde Rates.
- **Estadísticas y consultas:** permanecen iguales sus filtros, agregaciones y conteos por `event_type`; `set`/`change` siguen contando lo mismo. Las fechas futuras pueden caer en un día/período distinto si una transacción cruza un límite temporal entre su inicio y el insert, que es el ajuste buscado. Los eventos anteriores conservan sus marcas y los filtros sobre `occurred_at` siguen siendo válidos. No se modificaron servicios de Estadísticas.
- **Orden:** la lectura de Actividad mantiene `occurred_at DESC, id DESC`. El UUID desempata timestamps iguales de forma determinista dentro del conjunto, pero no prueba orden real de escritura ni de commits. `clock_timestamp()` tampoco elimina empates ni impide que una transacción con timestamp menor confirme después que otra.
- **Verificación:** se añadió una prueba de integración PostgreSQL opt-in en `src/community/rates/__tests__/rate-vote-events.postgres.integration.spec.ts` para el tipo/default, eventos `set` y `change` dentro de una transacción demorada y preservación de una fecha histórica explícita. También se añadió cobertura estática de la migración. PostgreSQL local no estaba disponible (`127.0.0.1:5432` sin respuesta), por lo que la prueba real de servidor no se ejecutó; no se afirma que la semántica temporal haya sido verificada en PostgreSQL durante esta tarea.
- **Archivos funcionales y de prueba:** `src/community/rates/entities/rate-vote-event.entity.ts`, `src/migrations/1792040000000-UseClockTimestampForRateVoteEvents.ts`, `src/migrations/__tests__/rate-vote-event-clock-timestamp-migration.spec.ts` y `src/community/rates/__tests__/rate-vote-events.postgres.integration.spec.ts`.

La alternativa de asignar secuencias o imponer orden de commits queda fuera de alcance. No se crean triggers, secuencias globales ni sistemas adicionales de orden.

## ACT-BE-3b — Consulta y proyección del historial

**Estado:** completada el 2026-10-29. Implementación exclusivamente backend; ACT-BE-3c y ACT-BE-4 siguen pendientes.

### Arquitectura y consulta

- Se creó `ActivityHistoryModule` en `src/community/activity-history/` y se registró en `AppModule`. Exporta solo `ActivityHistoryService`; no tiene controlador ni servicio de escritura. Identity y `ActivityStatisticsService` no se modificaron. El módulo lee `RateVoteEvent` directamente, sin importar `RatesModule` ni crear un ciclo.
- `ActivityHistoryService.findUserHistory()` exige `userId` como argumento interno y siempre agrega `event.userId = :userId` a la consulta base. Restringe filas a `set`/`change`, parametriza filtros y no consulta `Rate`. No acepta un usuario desde un filtro ni se agregó endpoint HTTP.
- La consulta selecciona explícitamente columnas del ledger, disco, artista y género con tres joins de catálogo en SQL. No carga entidades/relaciones eager ni ejecuta consultas por fila. Imagen, título y nombres reflejan el catálogo actual, no un snapshot histórico.
- `q` reutiliza `buildMusicNameMultiColumnPartialPredicate` y las columnas de búsqueda normalizadas del catálogo, con fallback literal case-insensitive para nombres legacy. Al buscar, eventos sin disco resuelto no coinciden; sin búsqueda, se mantienen en la cronología.

### Filtros, fechas y paginación

- Se implementaron `type`, `from`, `to`, `timeZone` y `query`. Fechas exigen `YYYY-MM-DD`, una zona IANA cuando se usa un límite, fechas válidas y `from <= to`. Cada día se resuelve en su calendario local al primer instante de ese día; el límite superior es el inicio local del día posterior. La búsqueda binaria sobre reglas `Intl` evita asumir 24 horas UTC, cubre días de 23/25 horas, resuelve medianoches desplazadas al primer instante del día y rechaza fechas civiles omitidas.
- Orden y continuación usan la misma clave: `occurred_at DESC, id DESC` y comparación keyset estricta menor que `(after.occurredAt, after.id)`. No se usa `OFFSET`. La continuación tipada contiene la posición de la última fila y el ancla de primera página; aplica el ancla como límite superior para excluir eventos posteriores que queden por encima.
- El tamaño interno predeterminado es 30 y el máximo 100; límites inválidos se rechazan. Se lee `limit + 1`, se devuelven como máximo `limit` items, y la fila extra decide `hasMore`. `nextPosition` se devuelve solo cuando existe otra página, para que ACT-BE-3c firme ese objeto sin reimplementar ordenación o paginación.
- El UUID resuelve empates de timestamp de forma determinista, pero no representa el orden real de inserción ni de commit. La navegación sigue siendo de mejor esfuerzo ante commits concurrentes y no mantiene un snapshot entre peticiones.

### Proyección y datos incompletos

- Cada item contiene ID, tipo, `occurredAt`, valores históricos anterior/nuevo y disco nullable con ID/título/portada actuales, artista y género nullable. Los `decimal` del driver se convierten a número JSON. No se sustituye ningún valor histórico con la Rate actual.
- Se conservan eventos con `disc_id` nulo, relaciones ya eliminadas y valores anterior/nuevo nulos; campos ausentes se proyectan como `null`. Una relación con disco resuelto pero sin artista o género mantiene el disco y entrega esa relación como `null`.

### Tests y verificaciones

- Tests unitarios focalizados cubren aislamiento por usuario, orden y empate, continuación/anchor, `limit + 1`, página vacía/final, combinaciones de filtros, proyección de legacy y relaciones eliminadas, datos actuales de catálogo y una sola consulta de proyección. Helpers cubren validación de fechas, rango invertido, días DST de primavera/otoño y día civil omitido. La fecha de evento conserva seis dígitos fraccionarios UTC desde PostgreSQL para no perder microsegundos en la clave keyset al convertir a `Date` de JavaScript.
- Se añadió `activity-history.postgres.integration.spec.ts`, opt-in con `ACTIVITY_HISTORY_PG_INTEGRATION=1`. Crea únicamente tablas temporales dentro de una transacción y requiere host loopback más una base con prefijo `activity_history_test_`. La integración PostgreSQL no se ejecutó en esta tarea; los mocks unitarios no se consideran evidencia de ejecución SQL real.
- Resultado focalizado: Jest pasó 12 pruebas unitarias; la suite PostgreSQL quedó omitida porque requiere opt-in y base aislada. Typecheck pasó con cero diagnósticos, build pasó y ESLint focalizado (`--no-fix`) pasó. `git diff --check` limitado a los archivos propios pasó. El roadmap no añade enlaces Markdown. No se ejecutaron migraciones ni consultas a bases externas. No se añadieron índices.

### Limitaciones y siguiente fase

- La consulta usa el catálogo actual; cambios futuros de nombres, portada o género se reflejan retroactivamente en la proyección. La búsqueda puede requerir medición de rendimiento antes de optimizarse; no se añadió índice ni motor de búsqueda.
- La cobertura real del ledger depende del inicio de captura por entorno y de campos legacy nulos. ACT-BE-4 debe medir planes con parámetros/datos representativos y registrar cobertura autorizada.
- ACT-BE-3c implementa el endpoint HTTP descrito a continuación. ACT-BE-4 permanece pendiente para medir consultas con PostgreSQL aislado y datos representativos.

## ACT-BE-3c — API HTTP y cursores firmados

**Estado:** completada el 2026-10-29. ACT-BE-4 sigue pendiente.

### Endpoint, contrato y validación

- Se implementó `GET /api/activity/history` en `ActivityHistoryController`, dentro de `ActivityHistoryModule`. La ruta no colisiona con Identity: `/api/activity/users`, `/summary`, `/inactivity`, `/users/:userId` y `POST /app/daily` conservan sus rutas.
- `@Auth()` aplica el guard JWT existente y `@GetUser()` aporta el único identificador usado para consultar. No existe parámetro `userId`; el controlador delega en `ActivityHistoryService` y no contiene SQL.
- `ActivityHistoryQueryDto` valida fechas civiles reales `YYYY-MM-DD`, rango no invertido, zona IANA requerida y válida cuando hay fechas, `type` `set`/`change`, `q` recortada de 1 a 100 caracteres, `limit` entero decimal de 1 a 100 (predeterminado 30) y forma del cursor. El `ValidationPipe` global rechaza propiedades desconocidas, incluido `userId`. `q` se asigna al filtro `query` interno sin cambiar la búsqueda de 3b.
- Una fecha civil omitida por las reglas históricas de una zona se rechaza como HTTP 400 al resolver el rango existente; la conversión a instantes UTC sigue perteneciendo a `ActivityHistoryService` y su helper de 3b.
- La respuesta contiene `items`, `nextCursor` y `hasMore`; conserva eventos y puntuaciones legacy nulas, timestamp UTC de seis dígitos fraccionarios, y datos actuales de disco/artista/portada/género de la proyección. No incluye datos privados de Rate o `userId`, y devuelve eventos individuales sin agrupar.

### Seguridad y cursores

- `ActivityHistoryCursorService` emite tokens base64url opacos `payload.firma`, formato versión 1 y HMAC-SHA256 con comparación de firma en tiempo constante. La clave se deriva de `JWT_SECRET` mediante separación de propósito; no hay una clave estática ni fallback. La variable debe estar configurada y no puede conservar el placeholder `your_long_random_jwt_secret` del template. La firma contiene emisión y caducidad exacta a 24 horas; cambiar `JWT_SECRET` invalida los cursores activos.
- El payload vincula usuario, huella SHA-256 de filtros normalizados, `limit`, posición keyset `after`, ancla original, versión y expiración. La posición exige UUID y timestamp con seis dígitos fraccionarios y valida que `after` no supere el ancla. La API no convierte esos timestamps a `Date` ni acepta posiciones del cliente fuera de un token firmado.
- Firma alterada, token expirado, usuario/filtros/límite distintos, versión incompatible, formato o estructura incorrectos producen HTTP 400 con mensaje genérico sin datos del secreto. Solo se emite `nextCursor` si el servicio informa `hasMore`; la página vacía/final devuelve `nextCursor: null` y `hasMore: false`.
- La paginación conserva el orden/keyset y el ancla de 3b. Es una navegación de mejor esfuerzo ante concurrencia: no afirma orden de commit ni snapshot estable entre peticiones.

### Configuración, pruebas y límites

- No se añadió una variable nueva: cursor signing reutiliza `JWT_SECRET`, ya documentada en `.env.template`. No se modificaron secretos de producción ni se accedió a producción.
- Tests focalizados de controlador/HTTP, DTO, cursor, servicio y helper de fechas: 4 suites y 40 pruebas aprobadas. Incluyen sesión ausente (401), identidad de sesión, ruta, defaults/límites, filtros, páginas sucesivas/final, evento legacy nulo, firma/expiración/reutilización/versión y precisión de microsegundos. Los dobles de `ActivityHistoryService` verifican el contrato HTTP, no ejecución SQL real.
- Typecheck, build, ESLint focalizado y `git diff --check` se ejecutaron sobre el alcance propio; no se ejecutaron `verify`, suites completas, E2E ni migraciones. La integración real PostgreSQL y la medición de planes/latencias pertenecen a ACT-BE-4.
- Persisten los límites del ledger descritos en 3b: cobertura histórica dependiente del entorno, atributos del catálogo actuales y orden no equivalente al orden de commits. No se introdujeron cambios en Rates, Estadísticas, consultas SQL ni frontend.

## ACT-BE-4 — Verificación y cierre del backend

**Estado:** completada el 2026-10-29. El backend queda **COMPLETADO Y CERRADO para el alcance acordado**, con la ejecución PostgreSQL aislada pendiente de un entorno local disponible. Esa ausencia no se presenta como aprobación de integración ni de rendimiento.

### Arquitectura, contrato y aislamiento

- `ActivityHistoryModule` vive en `src/community/activity-history/` y se registra desde `AppModule`. Rates conserva las escrituras de `rate_vote_events`; Actividad solo consulta/proyecta ese ledger y no importa `RatesModule`. Identity conserva presencia/estadísticas. El módulo de Actividad no introduce dependencias circulares, consultas duplicadas, fuentes de verdad adicionales ni rutas adicionales al único `GET /api/activity/history`.
- El controlador de Actividad aplica `@Auth()`, obtiene el único usuario mediante `@GetUser()` y delega en el servicio. La consulta TypeORM filtra por `event.userId = :userId` en la propia consulta antes de filtros, orden y paginación; no acepta `userId` como filtro. El DTO limita fechas, zona IANA, tipo, búsqueda y `limit`; el ValidationPipe global rechaza propiedades desconocidas.
- La revisión detectó que la ruta legacy `GET /api/rates/user/:userId/history` permitía consultar otra cuenta sin autenticación. Se corrigió el defecto crítico en Rates: ahora requiere `@Auth()` y compara el parámetro de ruta con `@GetUser()` antes de llamar al servicio; el dueño conserva la ruta, filtros y respuesta actuales. La prueba del controlador confirma 403 y cero consultas para un ID ajeno.

### Contract finding

**Current behavior:** la ruta histórica de Rates conserva la URL y los parámetros de filtros, pero ahora requiere sesión y solo permite el `userId` de esa sesión.

**Problem:** antes de ACT-BE-4 la ruta no estaba autenticada y exponía a cualquier solicitante una cronología aproximada de Rate para un usuario arbitrario.

**Impact:** backend + frontend; no se inspeccionaron consumidores frontend en este trabajo backend-only.

**Options:** preservar el acceso cruzado; retirar la ruta; o conservarla para el dueño y rechazar acceso cruzado.

**Recommendation:** conservar la ruta para el dueño autenticado y rechazar otros IDs; cierra el bypass sin cambiar el formato de respuesta del propietario.

**Blocks the current task:** No; el aislamiento ya está aplicado. Los consumidores frontend deben usar la sesión del dueño y su comportamiento no se verificó aquí.

### Seguridad, cursor y paginación

- El cursor usa HMAC-SHA256 con comparación de firma en tiempo constante y clave derivada por separación de propósito desde `JWT_SECRET`; rechaza ausencia o el placeholder del template, sin imponer un mínimo de longitud. El payload firmado vincula usuario, huella de filtros, `limit`, posición y ancla, versión y expiración de 24 horas. Cursor manipulado, vencido o incompatible se rechaza con HTTP 400 genérico. No se inspeccionaron ni registraron valores de secretos de ningún entorno; la seguridad efectiva del secreto configurado debe verificarse en cada entorno mediante el proceso de configuración seguro.
- La ordenación y keyset usan `occurred_at DESC, id DESC`; el cursor conserva seis cifras fraccionarias y el ancla de primera página. `limit + 1` gobierna `hasMore`; solo se emite `nextCursor` cuando hay otra página y una página vacía/final devuelve `nextCursor: null`, `hasMore: false`. Las pruebas unitarias históricas cubren filtros combinados, fechas locales, DST, empates, precisión, páginas sucesivas y eventos legacy.
- La paginación no mantiene un snapshot transaccional entre peticiones. `clock_timestamp()` aproxima el instante de inserción, pero no garantiza el orden de commit; el UUID desempata de forma estable y no representa secuencia real de escritura.

### PostgreSQL, rendimiento y migración

- **Integración PostgreSQL: no ejecutada.** `pg_isready -h 127.0.0.1 -p 5432` informó que no había respuesta. No se buscó ni intentó otro host, no se cambió configuración y no se conectó a producción, staging o una base compartida. Las suites existentes son opt-in y exigen bases locales aisladas con prefijos; la suite de Activity crea tablas temporales dentro de una transacción y la de Rates exige base vacía para su ciclo de migraciones. Ninguna se ejecutó en ACT-BE-4.
- Por ello quedan sin evidencia de servidor PostgreSQL la ejecución real de joins/proyección de catálogo, eventos `set`/`change`, nulos y discos ausentes, filtros SQL, empates/keyset/ancla, microsegundos, aislamiento entre usuarios, conversión DST y default de migración. No se afirma compatibilidad SQL verificada.
- **Rendimiento: no medido.** Sin PostgreSQL aislado y datos sintéticos representativos no se ejecutó `EXPLAIN (ANALYZE, BUFFERS)`, ni se estimaron latencias, filas leídas, joins o búsqueda textual. El índice existente `(user_id, occurred_at)` es candidato estructuralmente adecuado, pero no se considera medido; no se añadieron índices ni se concluye rendimiento general.
- Revisión estática de `1792040000000-UseClockTimestampForRateVoteEvents`: `up()` cambia solo el default de `occurred_at` a `clock_timestamp()`; conserva la columna `timestamptz`, no actualiza eventos existentes y no altera reglas `set`/`change`. `down()` restaura `CURRENT_TIMESTAMP`, una reversión coherente del default anterior. La prueba estática de migración ya existente verifica estos puntos. La migración **no se ejecutó** y debe aplicarse en cada entorno correspondiente mediante el procedimiento manual de despliegue; el arranque no migra automáticamente (`synchronize: false`, `migrationsRun: false`).

### Evidencia y límites del ledger

- Reutilizada de ACT-BE-3b: 12 pruebas unitarias aprobadas; de ACT-BE-3c: 40 pruebas focalizadas aprobadas; de ACT-BE-3a: pruebas focalizadas de Rates y migración aprobadas; además, typecheck, build y ESLint focalizado aprobados en las fases previas. Estas cifras provienen de fases/suites distintas y no se suman como pruebas únicas. En ACT-BE-4 se ejecutó `pnpm exec jest src/community/rates/__tests__/rates.controller.spec.ts --runInBand`: 1 suite y 32 pruebas aprobadas, incluida la protección nueva contra IDs ajenos. No se repitieron suites de Actividad ni verificaciones generales sin cambios en ese código.
- `git diff --check` pasó para los cambios versionados revisados. Las referencias Markdown de la documentación de Actividad apuntan a los artefactos existentes. No se ejecutaron `verify`, Jest completo, E2E, build/typecheck repetidos ni migraciones.
- Los límites aceptados del ledger siguen vigentes: `set` no demuestra primera valoración vitalicia; `change` solo refleja transiciones entre puntuaciones no nulas; borrar Rate o repetir valor no garantiza evento; filas legacy pueden carecer de disco/puntuaciones; los eventos previos a la captura no se reconstruyen y el timestamp no demuestra cuándo se escuchó el disco. No se inventaron eventos ni se realizó backfill.
- La proyección usa el catálogo actual, no snapshots históricos. La cobertura temporal real depende de la activación de captura y del esquema/filas de cada entorno, que no se consultaron. La integración SQL real y el rendimiento permanecen como limitaciones expresas para una verificación posterior en una base aislada autorizada.
