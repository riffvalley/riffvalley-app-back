# CON-B03 — Dominio de conciertos y festivales

El contrato de importación por lote (`POST /api/events/import-batch`) y su persistencia parcial se documentan en [importer.md](importer.md); no modifica el modelo de dominio descrito aquí.

**Estado:** implementado en backend; migraciones Event Domain, Tours y Tour por actuación aplicadas y verificadas en la base local `SpamMusicDB` el 2026-11-02. No se comprobó ni modificó ningún entorno remoto.

## Auditoría y decisiones

- No había entidades, módulo ni rutas de eventos/conciertos/festivales en el checkout. CON-B01 ya ofrece `POST /api/artists/resolve-batch`; Events valida de nuevo los IDs seleccionados al persistir.
- El dominio geográfico vigente es `Country → AdministrativeRegion → Locality → Venue`. Venue almacena `localityId`; el evento no duplica ciudad, provincia, región ni país.
- Los módulos Nest mantienen entidad en `entities/`, DTOs en `dto/`, controladores y servicios en la raíz, y specs en `__tests__/`. Las escrituras editoriales usan `@Auth(ValidRoles.riffvalley)` y las lecturas del catálogo son públicas.
- La consulta de solo lectura a la base local `SpamMusicDB` (2026-11-02) confirmó 107 migraciones compiladas, 107 aplicadas y una pendiente: `CreateEventDomain1792090000000`. No se aplicó ninguna migración; no se comprobó ningún entorno remoto.

## Modelo

- `Event` es la entidad única para `concert` y `festival`. Guarda `name` opcional, `startDate`/`endDate` como tipo PostgreSQL `date`, y `price`/`otherInfo` como texto libre. No existe estado de publicación.
- `Event.venueId` es obligatorio y tiene FK `RESTRICT`. Al borrar Venue con eventos, PostgreSQL lo impide.
- `EventArtist` es una entidad explícita con posición desde 1 y unicidad `(event_id, position)`. Conserva el nombre de lineup aunque `artistId` sea nulo.
- Si se elimina un Artist, su FK se pone a null y el nombre conservado permanece. Si se elimina Event, su servicio elimina primero las relaciones; la FK también limita el borrado de hijos al dueño Event mediante `ON DELETE CASCADE`. Nunca se elimina un Artist por borrar Event.
- Las fechas de API son `YYYY-MM-DD`; el servicio no las convierte en instantes ni usa zonas horarias. El fin no puede ser anterior al inicio.

## Venues genéricos

`venues.is_generic` distingue un punto de localidad (true) de un espacio físico (false, valor predeterminado). El Venue genérico usa el nombre canónico de Locality, `type=other`, y no almacena coordenadas propias. Las coordenadas efectivas se calculan desde Locality en las consultas de mapa; las rutas de salas físicas excluyen genéricos.

La migración reemplaza la unicidad global por localidad + nombre por dos índices parciales: uno conserva la deduplicación de todos los venues físicos y otro garantiza un único genérico por localidad. Esto permite que una sala física use el mismo nombre que su localidad. `VenuesService.getOrCreateGenericVenue` verifica la localidad y usa `INSERT .. ON CONFLICT` sobre el índice parcial para recuperar de forma idempotente la fila ganadora concurrente. Acepta el EntityManager de la transacción de Event y no invoca Nominatim.

Los endpoints ordinarios de Venue no aceptan `isGeneric`; no permiten modificar, mover ni borrar genéricos. Las importaciones y la resolución de salas solo consultan venues físicos. La FK Event→Venue bloquea el borrado de una sala en uso.

## API implementada

- `GET /api/events?limit=20&offset=0&type=concert&dateFrom=2027-04-01&dateTo=2027-04-30&venueId=<uuid>&administrativeRegionId=<uuid>` — lectura pública paginada. El rango filtra por fecha de inicio.
- `GET /api/events/:id` — lectura pública con Venue y lineup ordenado.
- `POST /api/events` — requiere `riffvalley` o superior.
- `PATCH /api/events/:id` — requiere `riffvalley` o superior. `lineup` omitido preserva el lineup; un array lo sustituye, y `[]` lo vacía.
- `POST /api/events/:eventId/import-lineup` — requiere JWT y rol mínimo `riffvalley`; confirma de forma independiente una ampliación aditiva del lineup. Recibe `batchId`, `rowId`, `sourceRow` original y los artistas confirmados; el evento de ruta es la autoridad del destino. Revalida conflictos, añade solo participaciones ausentes al final y no modifica Event ni EventArtist existentes. Las nuevas participaciones llevan `tourId = null`, incluso en festivales; no se crea `TourArtist`.
- `DELETE /api/events/:id` — requiere `riffvalley` o superior.

El body de creación acepta `type`, `startDate`, `endDate?`, `name?`, `venueId?`, `localityId?`, `price?`, `otherInfo?` y `lineup?: [{artistId: uuid|null, name}]`. Debe incluir `venueId` o `localityId`; si ambos se envían, el Venue debe pertenecer a esa Locality. `localityId` solo resuelve o crea el Venue genérico y nunca se persiste en Event. Un ID de Artist debe existir; `artistId: null` representa un artista aún no catalogado. El orden del array define posiciones 1..N.

Las escrituras validan referencias dentro de una transacción. La creación del Venue genérico, Event y relaciones EventArtist queda confirmada o revertida en conjunto; la unicidad parcial conserva protección ante carreras.

## Migración

`1792090000000-CreateEventDomain` añade `is_generic`, reemplaza los índices parciales de Venue y crea `events`, `event_artists`, checks, índices y FKs. No contiene backfill destructivo ni se ha ejecutado en producción. `synchronize` y `migrationsRun` permanecen desactivados.

## CON-B03b — Giras

`Tour` agrupa explícitamente Events de tipo `concert` mediante `Event.tourId` nullable (1:N). Tour no es un valor del enum Event y no tiene artistas, fechas, recintos ni localidades propias. No existe `TourArtist`: cada concierto conserva sus relaciones `EventArtist`, lineup y orden. No se infiere una gira por artistas, fechas o nombres. El check `CHK_events_tour_is_concert` y la validación de servicio impiden asociar festivales.

`GET /api/events` añade el filtro `tourId`. `POST` acepta `tourId` opcional; `PATCH` conserva la gira si se omite y la retira con `tourId: null`. Se rechaza toda asociación de un festival, incluida una actualización que lo convierta en festival dejando una gira asociada.

`GET /api/tours` usa `limit`/`offset`. `GET /api/tours/:id` responde `{tour, events: {totalItems, totalPages, currentPage, limit, data}}`; los eventos de la gira se consultan paginados y ordenados por fecha, luego ID y posición de lineup. La eliminación bloquea la gira y devuelve conflicto mientras haya conciertos asociados; la FK también es `RESTRICT`. Se permiten nombres homónimos, sin unicidad ni fusión heurística.

La migración incremental `1792100000000-CreateTours` crea `tours` y añade `events.tour_id` nullable, FK restrictiva e índice `(tour_id, start_date)`. El ledger local consultado antes del cambio tenía pendiente `CreateEventDomain1792090000000`. Tras compilar ambos cambios, la consulta de solo lectura mostró 108 migraciones compiladas, 107 aplicadas y dos pendientes (`CreateEventDomain1792090000000` y `CreateTours1792100000000`). No se aplicó ninguna migración.

## CON-B03c — Giras por actuación en festivales

`Event.tourId` continúa representando la pertenencia del concierto completo a una gira. La asociación de cada artista de apoyo con esa gira no se infiere. En festivales, cada fila `EventArtist` puede tener su propio `tourId` nullable; varias actuaciones del mismo festival pueden apuntar a giras distintas o no tener gira. No existe `TourArtist`, no se duplica el festival y no se modifica la relación EventArtist→Artist. Un artista sin catálogo (`artistId: null`) puede tener una asociación de gira explícita.

El DTO de lineup admite `tourId?: uuid | null`. Omitirlo crea la actuación sin gira; enviar `null` también la deja sin gira. `PATCH` sin `lineup` conserva el conjunto actual, y enviar un array sustituye todo el lineup (incluidas sus giras y posiciones). Se valida la existencia de todas las giras antes de guardar; no se crean automáticamente. Solo los festivales aceptan giras en filas EventArtist. Solo los conciertos aceptan `Event.tourId`. Un cambio de tipo que mantenga una relación incompatible se rechaza; el cliente puede retirar la relación en el mismo PATCH explícito que cambia el tipo. La FK y los triggers protegen la relación también en PostgreSQL. Todas las escrituras del evento y su lineup permanecen en una transacción.

`GET /api/tours/:id` mantiene `events` como colección paginada cronológicamente y combina las dos participaciones. Cada elemento conserva en el nivel superior los campos del Event y añade `participationType` (`concert` o `festival-performance`) y `participatingArtist` (nulo en conciertos; para festival contiene `artistId`, nombre de lineup, posición y el Artist relacionado si existe). Una actuación de festival ocupa una fila por EventArtist asociado; no se repiten filas por los demás artistas del mismo lineup. La consulta obtiene solo la página pedida, ordenando por fecha, Event ID y posición; la colección agregada no se persiste en Tour.

`PATCH /api/events/:eventId/artists/:eventArtistId` modifica exclusivamente `tourId` en una participación de festival y requiere el rol `riffvalley` o superior. El body debe contener `tourId` explícito como UUID o `null`; se rechazan campos adicionales. La transacción verifica el festival, que la participación pertenece a ese Event y que la gira exista antes de guardar. No sustituye el lineup ni modifica Event, Artist u otras participaciones. En la respuesta de Tour detalle, `participatingArtist.id` identifica la fila EventArtist.

La eliminación de Tour se rechaza cuando quedan conciertos o actuaciones de festivales asociados. La FK usa `RESTRICT`; desvincular una gira nunca elimina eventos ni artistas. La migración incremental `1792110000000-AddTourToEventArtists` incorpora `event_artists.tour_id`, FK restrictiva, índice parcial `(tour_id, event_id, position)` y triggers de integridad que requieren que el Event sea festival y bloquean cambios de tipo incompatibles. Las tres migraciones pendientes (`CreateEventDomain1792090000000`, `CreateTours1792100000000` y `AddTourToEventArtists1792110000000`) se aplicaron en una transacción local; `db:check` confirmó cero pendientes y se verificaron las columnas, restricciones, índices y triggers. `synchronize` y `migrationsRun` siguen desactivados.

## CON-B04a — Preparación del modelo para importación masiva

Tour añade `normalizedName`, generado mediante `normalizeGeography(name)`, manteniendo `name` como valor visible. La migración incremental `1792120000000-PrepareTourNamesAndImportReceipts` añade y rellena la columna, aborta si hay colisiones y crea `UQ_tours_normalized_name`. Antes de aplicar, la consulta de solo lectura a `SpamMusicDB` encontró cero Tours y cero colisiones. La migración se aplicó allí el 2026-11-02; `db:check` confirmó cero pendientes y se verificaron la columna, el índice único y las restricciones de recibos. El ledger conserva la histórica `UpdateListStatusEnum1766066905027` sin artefacto compilado: 111 entradas aplicadas frente a 110 migraciones compiladas. No se ejecutó en remoto ni se editó el ledger. La actualización y creación usan el mismo normalizador; PostgreSQL es la autoridad ante carreras y `ToursService` traduce su unique violation a conflicto controlado.

El nombre sugerido al editor sigue la convención **Artista principal + nombre de gira + año** (p. ej. `Septicflesh European Tour 2027`), sin validación rígida ni generación automática por artistas. `ToursService.findExactByName(name)` realiza igualdad exacta de clave normalizada y devuelve Tour o `null`. No crea ni fusiona giras; cuando la clave existe, el importador futuro requiere confirmación mediante el ID del Tour.

`catalog_import_row_receipts` persiste editor, batch UUID, row UUID, hash SHA-256 del JSON procesado con claves de objeto ordenadas, estado y resultado JSONB. Su identidad única es `(editor_id, batch_id, row_id)` y `editor_id` referencia `users` con `ON DELETE RESTRICT`; usuarios distintos no comparten recibos. `ImportRowReceiptsService.execute` reserva la identidad con `INSERT .. ON CONFLICT DO NOTHING`, obtiene `FOR UPDATE` y corre persistencia/resultado en la misma transacción. Una fila completa repetida reproduce el resultado; otra huella bajo la misma identidad da conflicto. La transacción serializa reintentos concurrentes y revierte recibo y callback juntos. No se conserva payload de entrada. Retención indefinida, sin limpieza en esta fase; la migración no permite rollback automático destructivo de recibos.

La suite de integración PostgreSQL está preparada para una base de fixtures vacía con prefijo `con_b04a_` y `CON_B04A_PG_INTEGRATION=1`; no se ejecutó porque ese fixture crea y elimina tablas y la base habitual `SpamMusicDB` contiene el esquema persistente. El esquema de producción de la migración sí se verificó directamente en PostgreSQL local; la carrera de recibos con conexiones concurrentes sigue pendiente. La suite unitaria no se considera evidencia de esa carrera.

## Posterior

- Importación masiva de conciertos/festivales.
- **Frontend futuro: Asociación de giras desde la ficha de un festival.** Mostrar un selector de gira junto a cada artista, buscar y elegir giras existentes, permitir quitar la asociación y usar el PATCH individual anterior para no modificar el resto del lineup. Se implementará cuando se desarrollen las fichas y funcionalidades de festivales; queda fuera de CON-B03c.
- Integración de `tourId` por actuación en el importador masivo (CON-B04) y tareas posteriores de frontend.
- Resolución conservadora de giras existentes durante importación; no deduplicar solo por nombre.
- Integración frontend del editor tipo Excel.
- Resolución eficiente de recintos por nombre sin localidad.
- Fichas públicas de eventos, mapas y consultas geográficas específicas de conciertos.

## Auditoría de migraciones CON-B03c

El preflight local informó 109 migraciones compiladas, 107 entradas aplicadas y tres pendientes. La revisión del ledger encontró una entrada histórica sin migración compilada: `UpdateListStatusEnum1766066905027`. Tras aplicar las tres pendientes, el ledger contiene 110 entradas; `db:check` confirma cero pendientes. La discrepancia histórica queda documentada, sin editar el ledger ni retirar esa entrada. Se comprobaron las dos columnas `tour_id`, sus FKs restrictivas, los índices de consulta y ambos triggers habilitados. No se consultó ni modificó un entorno remoto.
