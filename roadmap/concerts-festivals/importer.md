# Importador de conciertos y festivales

## CON-B04f — Validación integral y rendimiento con Docker

**Estado:** validación backend completada en PostgreSQL 16.14 aislado mediante Docker Compose. La configuración reproducible y las métricas completas están en [import-performance.md](import-performance.md). La ejecución no usó `SpamMusicDB`, PostgreSQL del host, servicios remotos ni frontend.

`bash scripts/con-b04f/validate-docker.sh` construye el runner Node 24/pnpm 11.28.7, inicia PostgreSQL y el fixture geográfico local, ejecuta `pnpm run verify`, y luego las integraciones reales de recibos, migraciones e importador. Las siete migraciones `179207`–`179213` se ejecutaron contra la base de eventos. La cadena histórica completa no se reproduce desde cero: el test crea solo las tablas prerrequisito de Country, Artist y User que anteceden al tramo de dominio.

Resultados: verify aprobado (303 suites y 2.896 tests aprobados; 34 suites/182 tests omitidos por sus condiciones normales); 17 pruebas PostgreSQL aprobadas; migraciones, índices, FKs, triggers, rollback, idempotencia y conflictos concurrentes verificados. Las ampliaciones simultáneas conservaron posiciones únicas y registraron cero deadlocks. Los lotes A de 20/50/100 filas promediaron 234 ms/359 ms/941 ms; los escenarios medidos de 100 filas promediaron menos de 1,3 s. La importación de localidades nuevas usó exclusivamente el fixture Docker. No se añadieron optimizaciones de producción porque estas mediciones no identificaron un cuello de botella que justificase cambiar las reglas o consultas.

## CON-B04e — Ampliación confirmada de lineups existentes

**Estado:** implementada en backend mediante `POST /api/events/:eventId/import-lineup`; requiere JWT y rol mínimo `riffvalley`. No cambia el frontend ni el comportamiento de `POST /api/events/import-batch`.

La operación requiere una decisión explícita del editor y no se llama desde la detección automática. El body contiene `batchId`, `rowId`, la `sourceRow` original de importación (incluidos tipo, artistas, fecha y localidad) y el array `artists` confirmado. El `eventId` solo se toma de la ruta; propiedades adicionales, incluido un ID de evento contradictorio en el body, se rechazan por el `ValidationPipe` global.

```json
{
  "batchId": "uuid-lote",
  "rowId": "uuid-fila",
  "sourceRow": {
    "rowId": "uuid-fila",
    "type": "concert",
    "lineup": [
      { "name": "Metallica", "artistId": "uuid-metallica" },
      { "name": "Gojira", "artistId": "uuid-gojira" }
    ],
    "startDate": "2027-05-15",
    "city": "Madrid",
    "countryId": "uuid-pais"
  },
  "artists": [{ "name": "Gojira", "artistId": "uuid-gojira" }]
}
```

Dentro de la transacción del recibo, la operación bloquea el Event destino y el ámbito de importación de su localidad, vuelve a leer lineup y fecha/localidad, resuelve artistas con `ImportEntityResolversService` y repite `ImportConflictsService.inspect`. El motor debe confirmar que la fila sigue coincidiendo con el evento de ruta, que persiste al menos una participación que originó la coincidencia y que los artistas solicitados siguen siendo añadibles o ya están presentes. Cambios incompatibles devuelven `IMPORT_CONFLICT_STALE`; participación incompatible con otro evento devuelve `IMPORT_PARTICIPATION_INCOMPATIBLE`; ambigüedad devuelve `IMPORT_ARTIST_AMBIGUOUS`. El editor puede volver a analizar la fila.

La persistencia solo inserta nuevas filas `EventArtist`, al final de la última posición, con `tourId = null`; nunca reemplaza o actualiza las existentes ni guarda el Event. En festivales conserva giras por actuación existentes y no crea `TourArtist`. La clave real `Artist.id` evita duplicados; identidades sin catálogo pasan por el resolutor exacto/ambiguo y su materialización transaccional. Respuesta: `{status: "updated", eventId, addedArtists, existingArtists}`.

Los recibos separan operaciones mediante `operation`: `create-event` es el valor predeterminado compatible con CON-B04d y `expand-lineup` identifica esta escritura. El hash incluye destino, fila original y artistas confirmados; un reintento idéntico reproduce el JSON guardado, mientras contenido diferente devuelve `IMPORT_OPERATION_ID_REUSED`. La migración `1792130000000-ScopeImportReceiptsByOperation` conserva los recibos actuales con `create-event` y añade la dimensión al índice único. La reserva, las comprobaciones finales, artistas nuevos, EventArtist y resultado comparten transacción. No se ejecutó esta migración en PostgreSQL en esta tarea.

`POST /api/events/import-batch` conserva su política: las filas conflictivas siguen devolviendo conflicto y nunca modifican un Event existente.

## CON-B04c — Motor de detección de duplicados y conflictos

**Estado:** implementado en backend como `ImportConflictsService.inspect(rows)`, exportado por `CatalogImportModule`; no añade endpoint ni persistencia. Se ejecuta después de las resoluciones de CON-B04b, tanto en la inspección inicial de CON-B04d como en su revalidación transaccional. Devuelve un resultado por `rowId`, con cero o más conflictos tipados y deterministas, severidad, códigos estables, referencias simétricas a otras filas, IDs de eventos candidatos y artistas coincidentes/añadibles.

- `concert` y `tour` se comparan como conciertos: artista inequívoco + misma localidad + mismo día inicial. El nombre de concierto y Venue no intervienen.
- Concierto frente a festival solo genera revisión si el festival dura un día. **Los festivales de varios días nunca producen un conflicto de participación por el mero solapamiento del intervalo**, aunque el artista y la localidad coincidan o el concierto ocurra en otra ciudad: no se conoce el día de actuación.
- Festival frente a festival usa nombre normalizado, localidad y fechas: periodo idéntico es duplicado; solapamiento con periodo distinto es revisión; periodos separados o ciudades distintas son independientes. No se fusionan lineups.
- Artistas y localidades nuevos se comparan entre filas solo con identidades provisionales inequívocas. Artistas/localidades ambiguos no se consideran iguales; localidades homónimas en regiones diferentes permanecen separadas.
- La consulta a PostgreSQL limita eventos candidatos por localidades ya resueltas y rango de fechas del lote, y filtra artistas por IDs cuando están disponibles; conserva festivales para comprobar duplicados y participaciones textuales sin `artistId`. Filas con localidades nuevas solo se comparan entre sí hasta que CON-B04b resuelva la localidad.
- Varios eventos coincidentes se devuelven como candidatos sin elección arbitraria. La propuesta de añadir artistas no modifica el lineup y la incorporación confirmada corresponde a CON-B04e.

El servicio solo lee y no reemplaza la protección ante carreras de la fase que persiste. Sus entradas y resultados internos reutilizables se definen en `src/catalog/import/conflicts/import-conflicts.types.ts`.

## CON-B04d — Persistencia parcial e idempotente

**Estado:** implementado en backend en `POST /api/events/import-batch`; requiere JWT con rol mínimo `riffvalley`. El detalle HTTP está disponible también en [import-audit.md](import-audit.md). No cambia el frontend.

### Entrada

```json
{
  "batchId": "uuid",
  "countryId": "uuid",
  "rows": [
    {
      "rowId": "uuid",
      "type": "concert | festival | tour",
      "name": null,
      "lineup": [{ "name": "Metallica", "artistId": "uuid" }],
      "startDate": "2027-05-15",
      "endDate": null,
      "city": "Madrid",
      "province": null,
      "administrativeRegionId": null,
      "venue": "La Riviera",
      "tourId": null,
      "price": null,
      "otherInfo": null
    }
  ]
}
```

El sobre requiere `batchId`, `countryId` y un array de hasta 100 filas. Cada fila se valida de forma independiente y rechaza propiedades desconocidas; acepta hasta 100 artistas, UUIDs y fechas de calendario válidas, ciudad obligatoria, nombres de artista de hasta 100 caracteres, ciudad/provincia de hasta 150, recinto y gira de hasta 180, nombre de evento de hasta 240 y textos `price`/`otherInfo` de hasta 2.000/10.000 caracteres. Una fila inválida conserva su posición y no invalida el lote. `name` es opcional en conciertos y obligatorio en festivales y giras.

`countryId` sirve de contexto para buscar localidades existentes y sus alias. Si no se encuentra la localidad, el resolutor actual requiere `administrativeRegionId` existente para preparar la geocodificación; no inventa regiones ni países. La región es opcional para localidades ya registradas. `province` solo ayuda a desambiguar. Esta diferencia respecto al ejemplo mínimo del contrato es intencional y queda registrada en la auditoría.

### Resultado y persistencia

La respuesta devuelve `{ "batchId", "results": [...] }` en el orden de entrada, con un resultado identificado por `rowId` y estado `created`, `conflict`, `invalid` o `failed`. `created` incluye `eventId`, IDs reutilizables de localidad/recinto/artistas y `tourId` cuando aplique; un replay añade `replayed: true`. Conflictos incluyen código y, cuando el motor los entrega, conflictos tipados con filas relacionadas, eventos candidatos y artistas coincidentes/añadibles. Errores técnicos se registran internamente y responden con un mensaje genérico.

Cada fila admisible ejecuta una transacción corta que incluye recibo, materialización de Locality/Artist/Venue/Tour y escritura de Event/EventArtist. Un error revierte solo esa fila. Los artistas se inspeccionan en lote y se materializan con bloqueo normalizado; localidad, recinto y gira reutilizan sus bloqueos/restricciones y resolutores existentes. Los artistas/recintos/localidades/tours creados por una fila fallida revierten con ella; las filas posteriores pueden crearlos. Los eventos tipo `tour` se guardan como `concert`, con `Event.name = null` y `Event.tourId` asociado.

La inspección inicial usa `ImportConflictsService.inspect`; antes de escribir, la fila repite la inspección dentro de la transacción después de resolver IDs. Un advisory lock por localidad serializa estas comprobaciones y escrituras para no depender solo de la lectura previa; el alcance evita un bloqueo global, aunque serializa importaciones concurrentes dentro de una misma localidad. Las filas incompatibles entre sí se rechazan todas y el motor devuelve referencias simétricas. No se modifica ningún evento existente; las propuestas aditivas quedan para CON-B04e.

`ImportRowReceiptsService` identifica editor + lote + fila y compara el hash SHA-256 del contenido normalizado. Una consulta de lote permite reproducir recibos completados antes de revisar posibles duplicados; la reserva, el evento y el resultado se confirman en la misma transacción. Contenido distinto con identidad reutilizada devuelve `IMPORT_IDEMPOTENCY_CONFLICT`. Conflictos e inválidos no guardan recibo, por lo que pueden reintentarse con la misma identidad después de corregir condiciones externas; los fallos técnicos anteriores al commit tampoco dejan recibo.

La inspección de artistas es agrupada y las localidades repetidas comparten la preparación geográfica; Nominatim no se consulta para localidades existentes. El lote limita consultas de candidatos por localidad y fechas. Las integraciones PostgreSQL, las carreras y las métricas se ejecutaron después en el entorno aislado de CON-B04f descrito en [import-performance.md](import-performance.md); no se usó `SpamMusicDB`.

## CON-D01 — Auditoría y contrato de importación masiva

Auditoría completada y ampliada tras integrar CON-B04a–d. Las decisiones iniciales y las diferencias entre contratos se registran en [import-audit.md](import-audit.md).

## CON-B04b — Resolución de entidades para importación

**Estado:** implementada en backend. `ImportEntityResolversService` se exporta desde `CatalogImportModule` y proporciona operaciones de inspección sin crear entidades y materialización con el `EntityManager` del llamador. Los resultados distinguen `existing`, `created`, `ambiguous`, `invalid` y `conflict`, con códigos estables para decisiones editoriales.

- Artist reutiliza `normalizeMusicName`, `getMusicNameVariants`, `compareNormalizedMusicNames` y los campos calculados por el catálogo (`nameNormalized`, `searchNameNormalized`, `needsReview=true`). Una coincidencia ambigua sin selección devuelve candidatos y no crea ni modifica artistas; un `artistId` explícito se valida contra el nombre normalizado y permite elegir un candidato inequívoco. Como no existe unicidad normalizada segura para el histórico, la materialización serializa la clave con `pg_advisory_xact_lock` y reconsulta bajo el lock; no añade un índice único.
- Locality busca nombre canónico y alias normalizados dentro del país, región y provincia aportados. Los homónimos devuelven `LOCALITY_AMBIGUOUS`; una localidad nueva exige región y país compatibles. `prepareLocalities` prepara la identidad geográfica con Nominatim antes de persistir y agrupa entradas equivalentes en la misma llamada. La materialización exige esa preparación, revalida la identidad bajo el manager transaccional y guarda localidad, coordenadas, identidad OSM y alias juntos. No crea Country ni AdministrativeRegion.
- Venue físico se busca por clave normalizada y localidad, excluyendo los genéricos; `VenuesService.createImportVenue` lo crea como `concert_hall/active` y recupera la fila ganadora con `ON CONFLICT`. El venue vacío delega en `VenuesService.getOrCreateGenericVenueWithStatus`, que mantiene el mecanismo idempotente de CON-B03. Ambas rutas reciben el manager transaccional.
- Tour usa `normalizeGeography` y la clave única de CON-B04a. Un Tour existente queda en `TOUR_CONFIRMATION_REQUIRED` hasta recibir su ID explícito. Una colisión que aparezca después de inspeccionar también devuelve conflicto; no se reutiliza automáticamente.
- Las claves de Artist, Locality, Venue y Tour se protegen durante materialización mediante locks transaccionales o las restricciones parciales/únicas PostgreSQL ya existentes. CON-B04d conserva el `tourId` recién creado solo después de confirmar su fila y lo usa para las siguientes filas del mismo lote.

No se implementa `POST /api/events/import-batch`; tampoco se cambian contratos HTTP ni frontend. Los resolutores no gestionan Event, EventArtist, TourArtist ni asociaciones de gira con festivales.

## CON-B04a — Preparación del modelo para importación masiva

**Estado:** implementada en backend; migración incremental `1792120000000-PrepareTourNamesAndImportReceipts` aplicada y verificada en `SpamMusicDB` local el 2026-11-02. Antes de aplicarla, PostgreSQL 17.10 confirmó cero Tours y ninguna colisión según `normalizeGeography`. Después, `db:check` informó cero pendientes; se verificaron la columna no nula, el índice único, la tabla/índice de recibos y sus cuatro restricciones. El ledger muestra 110 migraciones compiladas frente a 111 entradas aplicadas por la histórica `UpdateListStatusEnum1766066905027`, cuyo artefacto no está compilado; esa discrepancia no se modificó. No se tocó ningún entorno remoto. La suite de concurrencia PostgreSQL no se ejecutó porque su fixture destructivo requiere una base vacía separada.

Tour conserva su nombre visible y persiste `normalizedName`, calculado con `normalizeGeography` (NFD, eliminación de diacríticos, trim, colapso de espacios y minúsculas `und`). El índice único PostgreSQL `UQ_tours_normalized_name` garantiza unicidad global. La migración calcula cada clave con la misma utilidad y aborta con IDs y nombres si descubre colisiones; no fusiona, renombra ni elimina Tours. Crear o renombrar una gira sincroniza ambas columnas; `23505` se devuelve como conflicto controlado. `ToursService.findExactByName` consulta solo igualdad de clave normalizada y nunca crea. CON-B04b marca una gira existente como pendiente de confirmación explícita por ID.

La convención recomendada al editor es **Artista principal + nombre de gira + año**, por ejemplo `Septicflesh European Tour 2027`. Es una guía editorial, no una validación del nombre oficial; no se generan nombres automáticamente desde artistas.

`ImportRowReceiptsService.execute` recibe el ID del editor autenticado, `batchId`, `rowId`, contenido procesado y un callback de persistencia. Calcula SHA-256 sobre JSON con claves de objeto ordenadas, reserva la identidad única `(editor_id, batch_id, row_id)`, y ejecuta el callback y el guardado del resultado JSONB con el mismo `EntityManager` transaccional. El retry con contenido equivalente devuelve el resultado anterior; contenido distinto con la misma identidad genera conflicto. La clave incluye editor para aislar cuentas. Se guardan solo identidad, hash, estado, resultado e instantes de creación/actualización; el contenido de entrada no se conserva. Los recibos se retienen indefinidamente en esta fase; no existe proceso de limpieza. La migración no es reversible automáticamente porque borrar recibos puede habilitar duplicados tras un retry.

Contratos disponibles para CON-B04b: resolución exacta `ToursService.findExactByName`; módulo exportable `ToursModule`; servicio `ImportRowReceiptsService.execute`, apto para escribir recibo y resultado de fila en la transacción de la futura importación. No se crean eventos ni recibos mediante endpoints/importaciones en CON-B04a. PostgreSQL confirmó la unicidad y restricciones instaladas. En la fase B04a la carrera de reintentos seguía pendiente; CON-B04f la validó después contra PostgreSQL 16.14 aislado, junto con la separación de recibos por operación.

## CON-B03b — Giras

Implementado en backend como una relación explícita Tour 1:N Event, limitada a conciertos. El modelo, las rutas, la respuesta paginada del detalle, la política de homónimos y la migración están documentados en [domain.md](domain.md). Cada fecha conserva su propio lineup; la selección y el autocompletado entre filas serán parte de la interfaz/importador futuro.

## CON-B03c — Giras en actuaciones de festivales

Implementado en backend. Cada `EventArtist` de festival puede asociarse explícitamente a una gira, manteniendo `Event.tourId` para conciertos. No se introduce `TourArtist` ni se infiere la asociación por artista o nombre. Se admiten artistas no catalogados, se validan referencias y cambios de tipo, y Tour detalle pagina y mezcla conciertos con actuaciones de festival identificadas por artista. Las migraciones Event Domain, Tours y Tour por actuación están aplicadas y verificadas en la base local `SpamMusicDB`; no se ejecutaron en remoto. La integración de `tourId` en el importador queda para CON-B04 y las tareas frontend posteriores.

El endpoint `PATCH /api/events/:eventId/artists/:eventArtistId` permite asociar, cambiar o retirar la gira de una única actuación con `tourId: uuid|null`; requiere `riffvalley` o superior y no modifica el resto del lineup. El endpoint de detalle de Tour devuelve el ID de EventArtist junto a los datos del artista y festival.

### Funcionalidad futura del frontend

**Asociación de giras desde la ficha de un festival.** Mostrar un selector de gira junto a cada artista, permitir buscar y elegir giras existentes y quitar la asociación mediante el PATCH individual. No forma parte de CON-B03c; se abordará con las fichas y funcionalidades de festivales.

## CON-B03 — Dominio de eventos y Venue genérico

Implementado en backend. El modelo, contrato definitivo, auditoría de dominios, política transaccional, permisos y migración están documentados en [domain.md](domain.md). Esta fase establece la API básica, pero no implementa el importador masivo ni modifica el frontend.

## CON-B01 — Resolución de artistas por lotes

**Estado:** completada el 2026-11-01. Implementada en backend; verificaciones unitarias y de calidad ejecutadas.

**Endpoint:** `POST /api/artists/resolve-batch` (lectura pública, misma política de acceso que las lecturas públicas del catálogo).

**Entrada:** `{ "names": ["Architects", "Spiritbox", "Banda Desconocida"] }`.

**Salida:** un elemento por nombre, conservando texto y orden: `{ "results": [{ "name": "Architects", "artist": { "id": "<uuid-real>", "name": "Architects" } }, { "name": "Spiritbox", "artist": { "id": "<uuid-real>", "name": "Spiritbox" } }, { "name": "Banda Desconocida", "artist": null }] }`.

**Coincidencia:** reutiliza `normalizeMusicName` y `compareNormalizedMusicNames` del catálogo. Se ignoran caja, espacios periféricos, formas Unicode compatibles, diacríticos latinos, puntuación y separadores que la normalización actual transforma; se aplican las variantes existentes de artículo inicial inglés. Se buscan claves normalizadas exactas, sin similitud parcial. No hay mecanismo fiable de alias independiente en el modelo actual.

**Ausencias y ambigüedad:** artista inexistente o con más de un candidato normalizado devuelve `artist: null`. No se crean ni actualizan registros.

**Validación:** hasta 100 nombres; cada nombre debe ser texto no vacío después de trim y tener como máximo 100 caracteres. Se permite un array vacío.

**Rendimiento:** una consulta por lote a `artist`, con proyección limitada a `id` y `name`; sin cargar discografía ni catálogo completo. Los nombres repetidos comparten la consulta y conservan su lugar en el resultado. La migración `1792060000000` añade un B-tree parcial en `search_name_normalized` para las búsquedas exactas. No se midió `EXPLAIN ANALYZE` con datos de producción.

### Siguiente tarea

Integrar la resolución con la columna `Lineup` del importador en el frontend. No forma parte de CON-B01.

## VEN-B01 / VEN-B01b — Catálogo de salas y dominio geográfico

El catálogo backend independiente de recintos y la jerarquía `Country → AdministrativeRegion → Locality → Venue` están documentados en [roadmap/venues/README.md](../venues/README.md). VEN-B01b prepara el dominio geográfico y los filtros/mapa; VEN-B02 implementa `POST /api/venues/import-batch`; VEN-B02b reconoce alias de localidad e identidades OSM. CON-B03 añade Venues genéricos de localidad y una API básica de Event. La futura integración del importador deberá enviar nombre y `localityId` a la resolución ordinaria, que continúa excluyendo genéricos como salas físicas.
