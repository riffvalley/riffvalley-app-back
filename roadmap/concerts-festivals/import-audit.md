# CON-D01 — Auditoría y contrato de importación masiva

## CON-B04g — Resolución anticipada por lotes

La revisión confirmó que `ImportEntityResolversService` ya ofrecía lectura exacta/ambigua de Artist y Locality para el backend de importación, y lectura exacta de Tour mediante `ToursService.findExactByName`. Esos servicios internos también contienen operaciones de materialización/geocodificación, por lo que las rutas HTTP se conectan a lectores de catálogo puros adecuados al contexto del endpoint, sin invocar esas operaciones con efectos laterales. Artist reutiliza `ArtistCatalogService` y la normalización musical; Tour reutiliza `normalizeGeography` y su índice único. Locality aprovecha el mismo normalizador, entidades, alias e identidad geográfica existentes con una consulta agrupada. No se añade lógica aproximada ni se selecciona el primer candidato.

Contratos implementados, todos con máximo de 100 entradas, resultados correlacionados por `index` y entradas repetidas preservadas:

| Endpoint                             | Resultado y consulta                                                                                                                                                                                                                                                                                                                                    | Acceso/efectos                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/artists/resolve-batch`    | Añade `status`, `candidates`, `index` y códigos a la respuesta legacy; mantiene `artist` como identidad inequívoca o `null`. `ARTIST_AMBIGUOUS` devuelve todos los `{id,name}` candidatos.                                                                                                                                                              | Público; una búsqueda SQL agrupada, sin escritura.                                                                                        |
| `POST /api/localities/inspect-batch` | Recibe nombre, país obligatorio, región opcional y provincia opcional. `LOCALITY_AMBIGUOUS` devuelve candidatos con país/región/provincia. Errores de contexto: `LOCALITY_COUNTRY_NOT_FOUND`, `LOCALITY_REGION_NOT_FOUND`, `LOCALITY_REGION_COUNTRY_MISMATCH`. `new` informa `requiresAdministrativeRegionId` cuando falta la región para materializar. | Público, acorde con las lecturas de Venue; países/regiones en bloque y una consulta por nombres/alias. Cero geocodificación y escrituras. |
| `POST /api/tours/resolve-batch`      | Coincidencia exacta por nombre normalizado. Una gira existente devuelve su UUID y `TOUR_CONFIRMATION_REQUIRED`; filas inconsistentes múltiples devuelven `TOUR_AMBIGUOUS`.                                                                                                                                                                              | Público; una consulta por claves únicas, sin creación.                                                                                    |
| `POST /api/venues/resolve-batch`     | Se conserva; ahora informa estado, índice y candidatos y mantiene `venue` legacy. La búsqueda exacta se limita a localidad y excluye genéricos.                                                                                                                                                                                                         | Público; una consulta agrupada, sin escritura.                                                                                            |

El documento `docs/frontend/modules/events-festivals-importer.md` de CON-F08a no está disponible en este repositorio backend; esta definición se basa en la auditoría indicada en la tarea. El frontend puede usar los inspectores como previsualización, pero debe conservar UUID y texto, pedir selección explícita ante ambigüedad y revalidar con CON-B04d/e al persistir. Estas consultas no reservan identidades ni garantizan que el catálogo siga igual.

La suite Docker de CON-B04f se ejecutó con esta ampliación: su prueba PostgreSQL del inspector de Locality resolvió el nombre canónico y un alias a la misma fila, midió tres consultas para el lote y verificó cero llamadas al geocoder. La validación completa y las integraciones existentes pasaron; el compose temporal y su volumen se eliminaron al terminar.

> La auditoría original se realizó antes de implementar el importador. La revisión focalizada de CON-B04b y sus decisiones de reutilización quedan registradas al final de este documento.

**Alcance:** lectura focalizada de Events, EventArtist, Tours, resolución de Artist, Venue/localidades y los importadores de catálogo existentes. No se modificó código funcional ni se ejecutaron pruebas o migraciones.

## Estado actual y reutilización

### Revisión CON-B04c — motor de conflictos

`ImportConflictsService.inspect(rows)` consume filas ya resueltas: `rowId`, tipo de importación (`concert | festival | tour`), artistas con estado de resolución e identidad, fechas, localidad existente o identidad geográfica provisional y referencias opcionales a eventos elegidos. Devuelve un resultado por fila y permite varios conflictos por resultado, con código, severidad, referencias recíprocas a filas, eventos candidatos, artistas coincidentes y artistas añadibles. El contrato está en `src/catalog/import/conflicts/import-conflicts.types.ts`; la función pura de reglas es `analyzeImportConflicts`.

El servicio solo consulta `Event`, `EventArtist` y `Venue`: limita candidatos por localidad persistida y solapamiento del rango de fechas del lote, y carga el lineup de esos candidatos. Filas con localidad nueva se comparan entre sí mediante la identidad geográfica provisional `administrativeRegionId + province normalizada + city normalizada`; no se equiparan localidades solo por nombre. Artistas nuevos se comparan por `normalizeMusicName` solo si CON-B04b los resolvió como inequívocos. Identidades ambiguas no participan en coincidencias automáticas. El motor no crea ni modifica entidades y no llama a Nominatim.

Las filas `tour` participan como `concert`. Los conciertos chocan por artista inequívoco, día inicial y localidad, sin considerar nombre de concierto ni Venue. La coincidencia con festival solo se informa para festivales de un día; un festival de varios días no genera choque de participación por el intervalo, incluso en otra ciudad. Los festivales se deduplican de manera independiente por nombre normalizado, localidad y periodo: periodo idéntico es duplicado bloqueante; periodos solapados diferentes requieren revisión; periodos separados o ciudades distintas son independientes. No se fusionan lineups.

Para eventos existentes, una coincidencia de concierto devuelve todos los IDs candidatos y el conjunto de artistas aún no asociados que se podrían proponer a CON-B04e. Si todos los artistas inequívocos ya están asociados, devuelve la coincidencia como duplicado sin artistas añadibles. Esta fase no elige un candidato si hay varios ni realiza la ampliación. `existingEventIds` en la entrada conserva selecciones de preview para que CON-B04d pueda volver a llamar `inspect` en confirmación; la prevalidación no sustituye las garantías de concurrencia al persistir.

No se añadieron columnas, índices, endpoint ni escrituras para CON-B04c. La integración futura debe invocar la inspección después de las resoluciones de CON-B04b y antes de `ImportRowReceiptsService.execute`; el recibo sigue siendo la frontera idempotente de persistencia, no el mecanismo de análisis.

| Área                        | Capacidad comprobada                                                                                                                                                                                                                                                                                           | Uso en CON-B04                                                                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eventos                     | `EventsService.create` valida fechas y referencias y crea Event, Venue genérico y lineup en una transacción. `EventArtist.position` conserva el orden. `PATCH /events/:id` sustituye todo el lineup cuando recibe `lineup`.                                                                                    | Reutilizar las reglas y primitivas de persistencia; no llamar a `PATCH` para añadir artistas. Extraer una operación transaccional que cree Event y sus EventArtist, o añada una relación individual sin borrar el lineup actual.                                            |
| Artistas                    | `POST /artists/resolve-batch` reconoce identidad exacta normalizada solo cuando hay un candidato inequívoco. `CreateArtistDto` requiere solo `name`; `ArtistWriteService` calcula las claves normalizadas y marca `needsReview=true`.                                                                          | Reutilizar normalización y resolución exacta. Añadir resolución/creación en la misma transacción que la fila, agrupando nombres repetidos. No convertir una coincidencia ambigua en selección automática.                                                                   |
| Tours                       | `ToursService.create` recorta el nombre, pero no normaliza ni comprueba duplicados; no hay índice único.                                                                                                                                                                                                       | Resolver explícitamente Tour existente o crear uno solo tras elección/confirmación. Añadir unicidad global normalizada y manejo de carrera antes de depender de ella.                                                                                                       |
| Venues                      | `POST /venues/resolve-batch` resuelve solo salas físicas exactas por nombre normalizado y `localityId`; excluye genéricos. `importBatch` crea salas y tolera fallos por elemento, pero no crea eventos. `getOrCreateGenericVenue(localityId, manager)` es idempotente y acepta el EntityManager transaccional. | Reutilizar resolución exacta y creación genérica. Para Venue nuevo usar los valores acordados `concert_hall`, `active`, `isGeneric=false`, además de `localityId`; proteger la carrera con la unicidad existente (localidad + nombre normalizado).                          |
| Geografía                   | La cadena persistida es Country → AdministrativeRegion → Locality → Venue. `LocalitiesService.resolveAndGeocode` exige `administrativeRegionId` o región + `countryId`, busca nombre y alias, devuelve `ambiguous` si no es inequívoco, pero puede crear Locality y llamar a Nominatim.                        | Resolver solo contra datos locales/alias durante importación. City sola no identifica globalmente una localidad; Province ayuda, pero no equivale a región/país. Exigir `localityId` elegido cuando falte contexto o haya más de un candidato. No geocodificar fila a fila. |
| Transacciones e importación | Events ya envuelve Event + Venue genérico + lineup en una transacción. `runCatalogImportTransaction` encapsula QueryRunner y rollback. Las importaciones manual/Excel procesan filas secuencialmente y conservan resultados previos; capturan SQLSTATE recuperables. Venue batch ofrece estados por entrada.   | Reutilizar QueryRunner y respuesta individual, adaptándolos a escritura de todas las entidades de una fila. La transacción de fila debe incluir auxiliares creados para ella y el Event con todas sus participaciones.                                                      |

### Diferencias entre el modelo actual y las reglas acordadas

- `EventType` persistido admite solo `concert | festival`. `tour` debe ser una instrucción de importación que produzca `Event(type=concert, name=null, tourId=...)`; no debe llegar al enum ni persistirse como nombre del Event.
- Hoy se permiten Tours homónimos. La nueva regla requiere clave global normalizada única, limpieza previa de homónimos y una restricción de base de datos, no solo una comprobación de aplicación.
- `EventArtist.artistId` es nullable y `name` obligatorio: permite conservar texto no catalogado. Para esta importación, las filas nuevas deben resolver o crear Artist y guardar su ID; Artist automático queda marcado `needsReview=true` por el servicio existente.
- `EventsService.update` reemplaza el lineup completo. La incorporación aprobada de artistas a un evento existente requiere una operación aditiva e individual de EventArtist dentro de transacción, validando posición/concurrencia; el endpoint actual PATCH no satisface ese contrato.
- No hay clave de idempotencia para filas importadas ni restricción de unicidad de eventos por artista/localidad/fecha. El índice Venue-localidad sí evita repetir Venue físico y el genérico tiene unicidad por Locality.
- La API actual de resolución geográfica no puede recibir únicamente City/Province sin región/país y puede crear/geocodificar. Hace falta una ruta o servicio de búsqueda local de solo lectura con candidatos y ambigüedad explícita.

## Contrato HTTP propuesto

`POST /api/events/import-batch`, protegido con `@Auth(ValidRoles.riffvalley)`. Límite inicial sugerido: 100 filas por solicitud, igual que los endpoints batch existentes.

```json
{
  "batchId": "uuid-generado-por-el-cliente",
  "rows": [
    {
      "rowId": "uuid-estable-de-la-fila",
      "type": "tour",
      "name": "Northbound Tour",
      "startDate": "2027-05-12",
      "endDate": null,
      "lineup": [
        { "name": "Artist A", "artistId": "uuid-opcional" },
        { "name": "New Artist" }
      ],
      "venue": { "name": "Sala Nueva" },
      "locality": {
        "localityId": "uuid-opcional",
        "city": "Santander",
        "province": "Cantabria",
        "administrativeRegionId": "uuid-opcional",
        "countryId": "uuid-opcional"
      },
      "price": null,
      "otherInfo": null,
      "resolutions": {
        "tourId": null,
        "existingEventId": null,
        "addArtistsToExistingEvent": false
      }
    }
  ]
}
```

- `type`: `concert | festival | tour`. `name` es opcional para `concert` y requerido para `festival`/`tour`. En `tour`, representa el nombre de Tour y Event.name se guarda nulo.
- `lineup`: array ordenado de `{name, artistId?}`. El `artistId`, si se envía, debe existir y corresponder al artista elegido; si no, se usa resolución normalizada exacta. Sin candidato se crea un Artist nuevo; con más de un candidato se devuelve `conflict` para selección explícita, sin crear un duplicado. Artistas nuevos con la misma clave normalizada en el lote se comparten. Repeticiones normalizadas del mismo artista dentro de una fila se rechazan como inválidas para evitar participaciones duplicadas.
- `venue`: nombre opcional. Con nombre no vacío, buscar Venue físico exacto en la localidad y crearlo si falta. Vacío/nulo significa genérico. No aceptar `venueId` desligado de la localidad; puede admitirse como referencia explícita solo validando que pertenece a ella.
- `locality`: `localityId` explícito es la referencia preferida. En su defecto, resolver City/Province y contexto geográfico solo contra la base local y alias. Cero candidatos implica localidad no resuelta; varios implican ambigüedad. Ninguno crea Locality ni llama a Nominatim durante el envío.
- `resolutions.tourId`: permite seleccionar explícitamente una gira existente después de que el preview la identifique. Si el nombre normalizado ya existe y no se envía ese ID, fila `conflict`; nunca crear una segunda gira silenciosamente. Las filas nuevas del mismo lote y clave de nombre comparten un Tour.
- `resolutions.existingEventId` y `addArtistsToExistingEvent=true`: decisión expresa para añadir solo artistas indicados, sin reemplazar las participaciones actuales. Si no se confirma, devolver propuesta `conflict`.
- Los campos opcionales `endDate`, `price` y `otherInfo` conservan la semántica Event actual. Las fechas son `YYYY-MM-DD`; intervalos inclusivos para solapamiento.

Respuesta, un resultado por `rowId`, conservando el orden solicitado:

```json
{
  "batchId": "uuid-generado-por-el-cliente",
  "results": [
    {
      "rowId": "uuid-estable-de-la-fila",
      "status": "created",
      "eventId": "uuid",
      "tourId": "uuid",
      "created": {
        "artistIds": ["uuid"],
        "venueId": "uuid",
        "localityId": "uuid"
      }
    },
    {
      "rowId": "uuid-fila-pendiente",
      "status": "conflict",
      "code": "ROW_ARTIST_DATE_OVERLAP",
      "message": "El artista participa en otra fila incompatible.",
      "conflictsWith": [
        { "rowId": "uuid-otra-fila", "artistId": "uuid", "eventId": null }
      ],
      "candidates": []
    }
  ]
}
```

Estados terminales por intento:

- `created`: la fila se guardó completa. Puede incluir IDs de entidades auxiliares creadas o reutilizadas.
- `conflict`: requiere decisión del editor (ambigüedad, Tour existente, evento coincidente/propuesta de ampliación o choque con otra fila).
- `invalid`: incumplimiento del contrato o dato requerido ausente/inválido; incluir `code`, `field` y mensaje legible.
- `failed`: error de persistencia inesperado o fallo transitorio aislado; incluir código seguro y `retryable`. No exponer SQL ni detalles internos.

No hace falta un estado `existing`: una fila nueva que reutiliza Artist/Venue/Tour seleccionado y crea Event es `created`; si la fila ya fue procesada, la respuesta idempotente devuelve el resultado original. Los conflictos cruzados incluyen ambos `rowId` y bloquean a ambas filas.

## Validación, dependencias y transacciones parciales

1. Validar forma, tamaño, fechas, tipo y campos obligatorios por fila; devolver `invalid` sin abortar el resto del lote.
2. Resolver en bloque las localidades, nombres de artistas, Venue físicos, Tours existentes y eventos candidatos con consultas por conjuntos. No crear nada durante esta fase. Los IDs de artistas/localidades enviados se validan contra la base.
3. Construir dependencias entre filas: clave normalizada de artistas nuevos, Tour nuevo, Locality y Venue. Detectar conflictos de lote simétricamente antes de guardar; filas en conflicto permanecen pendientes y ninguna gana por orden.
4. Persistir cada fila aceptada en transacción propia. Esa transacción resuelve/crea los auxiliares faltantes y guarda Event + lineup ordenado + recibo idempotente de fila. Un error revierte todo lo creado únicamente por esa fila; las filas correctas independientes permanecen confirmadas.
5. Compartir entidades de forma segura mediante unicidades normalizadas y lectura/recuperación tras `23505`: Artist se reutiliza si la identidad exacta es inequívoca; Venue mediante índice existente; Tour mediante la futura clave única; Locality mediante su clave geográfica. El Venue genérico ya usa `ON CONFLICT` por localidad.

Tres filas de una gira nueva pueden ejecutarse como tres transacciones: la primera que confirme crea Tour y su Event; las siguientes recuperan el mismo Tour y guardan sus Events. Si una fila falla, no deja Tour/Artist/Venue exclusivo de esa fila sin evento; las entidades creadas por otras filas confirmadas permanecen. Esto no requiere transacción global. Si una misma gira en el lote tiene conflicto en una de sus filas, resolver si se bloquea solo esa fila o todas las filas nuevas del grupo: recomendación inicial, aislar la fila conflictiva y guardar las válidas, pues el requisito es parcial por fila.

### Concurrencia e idempotencia

- Añadir un recibo/ledger persistente con índice único sobre `batchId + rowId + payloadHash` (hash de la fila normalizada y de las decisiones de resolución) y resultado. La fila Event, sus entidades exclusivas y el recibo de `created` se confirman juntos.
- Repetir la misma fila y el mismo payload devuelve el resultado previamente confirmado sin crear entidades. Editar la fila o sus decisiones cambia el hash y constituye un nuevo intento; `rowId` se mantiene para que el frontend conserve la identidad visual de la fila. Los conflictos no requieren recibo de éxito y se vuelven a evaluar en el nuevo intento.
- Una colisión de unicidad durante carrera se recupera leyendo la entidad ganadora y revalidando que cumple el mismo criterio. Errores transitorios pueden reintentarse por fila; validaciones/conflictos requieren editar o confirmar.
- Sin recibo idempotente persistente, las restricciones actuales no bastan: no existe clave de evento ni de participación que detecte de forma segura toda repetición; deducirlo solo de artista/fecha podría fusionar eventos legítimos.

## Matriz de conflictos

| Caso                                                          | Comparación                                                                                                                                     | Resultado propuesto                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Concierto contra concierto entre filas o persistido           | Mismo artista inequívoco, misma localidad y mismo `startDate`; `tour` participa como concierto. Venue y nombre no cambian la comparación.       | Conflicto bloqueante. Si existe más de un Event compatible, devolver todos como candidatos; proponer artistas que faltan sin alterar lineup. |
| Concierto contra festival de un día                           | Mismo artista inequívoco, localidad y fecha; el festival tiene `startDate = endDate` o `endDate = null`.                                        | Revisión de participación, simétrica entre filas. No añadir automáticamente artistas ni asociaciones.                                        |
| Concierto contra festival de varios días                      | El concierto cae dentro del intervalo del festival y comparte artista; no se conoce el día de actuación.                                        | No generar conflicto de participación, aunque coincidan localidad o artista.                                                                 |
| Solapamiento sin artista identificado                         | El nombre no tiene match exacto único y todavía no se ha creado Artist.                                                                         | No afirmar conflicto por similitud; resolver/crear identidad y luego validar participación.                                                  |
| Duplicado de festival                                         | `type=festival`, nombre normalizado igual, misma localidad y periodo. Mismos extremos son coincidencia exacta; otros periodos pueden solaparse. | Mismo periodo: duplicado claro. Solapamiento distinto: revisión. Fechas separadas o localidad diferente: independiente. No fusionar lineups. |
| Mismo nombre de festival en otra ciudad o fechas no solapadas | Nombre coincide, pero localidad distinta o intervalos disjuntos.                                                                                | No es duplicado automático.                                                                                                                  |
| Mismo día y ciudad, eventos distintos                         | No coincide el nombre de festival ni hay artista conflictivo.                                                                                   | No es duplicado por sí solo; permitir creación.                                                                                              |
| Tour homónimo persistente                                     | Nombre Tour con la futura normalización global coincide.                                                                                        | `conflict` hasta que editor seleccione `tourId` existente o cambie el nombre; no autocrear.                                                  |
| Ciudad no resuelta/ambigua                                    | Lookup local por City/Province/contexto devuelve cero o varios Locality.                                                                        | `invalid` si falta City; `conflict` si necesita selección geográfica. No asignar al primer resultado.                                        |

La consulta de candidatos persistidos se limita por Locality y rango solapado (`event.startDate <= candidateEnd` y `COALESCE(event.endDate,event.startDate) >= candidateStart`), y filtra por artistas identificados cuando hay IDs; conserva festivales para la deduplicación por nombre. El rango solo acota la consulta. Para participación, un festival de varios días nunca se considera incompatible por su intervalo. Duplicidad de evento y choque de participación son diagnósticos separados.

## Escenarios de aceptación

| Caso                     | Resultado esperado                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Gira nueva            | Tres filas `tour`, mismo nombre y fechas distintas: un Tour, tres Events (`name=null`, `type=concert`) y participaciones ordenadas; artistas repetidos reutilizados.                                                                     |
| B. Concierto y festival  | Mismo artista en ambos, misma localidad y fechas no solapadas: dos Events y dos EventArtist.                                                                                                                                             |
| C. Conflicto entre filas | Mismo artista identificado, localidad y fecha: ambas `conflict`, cada una referencia el `rowId` de la otra; ninguna se crea.                                                                                                             |
| D. Concierto existente   | Coincidencia de artista/localidad/fecha y lineup entrante añade otro artista: devolver Event existente y propuesta de adición; sin confirmación no modificar ni crear Event. Tras confirmar, añadir EventArtist sin borrar los actuales. |
| E. Venue desconocido     | Locality inequívoca y sala nueva: crear Venue físico `concert_hall`, `active`, `isGeneric=false` y asociar Event.                                                                                                                        |
| F. Venue vacío           | Con City resuelta y sin Venue: reutilizar/crear el genérico único de Locality y asociarlo.                                                                                                                                               |
| G. Localidad ambigua     | Varios candidatos geográficos: fila pendiente con candidatos/contexto necesario; no crear Venue ni escoger arbitrariamente.                                                                                                              |
| H. Importación parcial   | Diez filas, siete válidas y tres conflictivas: confirmar siete y responder conflictos por fila; el cliente conserva tres pendientes.                                                                                                     |
| I. Reintento             | Reenvío de las mismas claves/payloads confirmados: reproducir resultados y mantener número de Events, Tours, Artists y Venues.                                                                                                           |

## Riesgos técnicos y decisiones por cerrar

1. **Normalización de Tour — resuelta en CON-B04a:** usar `normalizeGeography` (trim + espacios colapsados + acentos/caja normalizados), columna persistida `normalized_name`, unique index global y consulta exacta por esa clave. La consulta local de solo lectura encontró cero Tours y cero colisiones; la migración incremental aborta y reporta IDs/nombres si futuros datos chocan. No renombra ni fusiona entidades.
2. **Localidades desconocidas — resuelto en CON-B04b:** creación solo con `AdministrativeRegion` y Country existentes; `prepareLocalities` llama a Nominatim antes de la transacción y solo propone materializar una identidad geográfica única. Sin contexto o sin candidato inequívoco, la fila queda pendiente; no se crean divisiones administrativas.
3. **Interpretación City/Province — resuelto para resolutores:** `Locality.province` continúa siendo texto. City/Province se compara con localidad y alias dentro del país/región seleccionados; provincia no sustituye a Country o AdministrativeRegion.
4. **Reglas de incompatibilidad — resueltas en CON-B04c:** conciertos comparten conflicto por artista/localidad/mismo día inicial; un festival solo genera conflicto de participación con concierto si dura un día. Festivales se deduplican aparte por nombre, localidad y periodo equivalente/solapado.
5. **Solapamiento en límites:** fechas son `date` sin hora. Para duplicados de festivales, los periodos son inclusivos y `endDate=null` equivale a `startDate`. Ese intervalo no extiende una participación de festival a todos los días.
6. **Artistas no reconocidos o ambiguos:** la creación mínima es válida solo con `name`; confirmar creación automática marcada para revisión (`needsReview=true`) cuando no hay candidato, y selección explícita cuando hay varios candidatos normalizados.
7. **Importación por grupo Tour:** definir si una fila conflictiva bloquea el resto de filas nuevas con el mismo Tour. Recomendación: conservar parcialidad por fila; no bloquear válidas independientes, manteniendo el diagnóstico de grupo.
8. **Idempotencia persistente — resuelta en CON-B04a:** la identidad única es editor + `batchId` + `rowId`; se compara SHA-256 del contenido procesado normalizado por orden de claves y se guarda resultado JSONB. La retención es indefinida por ahora, sin limpieza automática; la reserva y la escritura futura del evento se comparten en una transacción.
9. **Tamaño/rendimiento:** confirmar límite de 100 filas; medir consultas por lote y posibles conflictos sobre datos representativos antes de índices adicionales. No introducir índices de conflicto por intuición.

## Desglose recomendado para CON-B04

1. **CON-B04a — Preparación del modelo para importación masiva (completada):** añadir unicidad normalizada, lookup exacto y recibos transaccionales persistentes. La resolución geográfica y el contrato HTTP del importador permanecen fuera de esta fase.
2. **CON-B04b — Resolución de entidades (completada):** inspección previa sin insertar entidades, preparación geográfica agrupada y materialización transaccional de Artist, Locality, Venue y Tour. Los contratos y límites están registrados en `importer.md`.
3. **CON-B04c — Motor de detección de duplicados y conflictos (completada):** comparar filas y candidatos persistidos sin escrituras; producir conflictos simétricos y separar duplicidad de evento y participación.
4. **CON-B04d — Persistencia parcial e idempotente:** transacción por fila, creación/reuso de Artist/Tour/Venue genérico o físico + Event/EventArtist + recibo; recuperación de carreras y errores recuperables por fila.
5. **CON-B04e — Adición confirmada a Event existente (implementada):** `POST /api/events/:eventId/import-lineup`, con confirmación independiente y revalidación transaccional de localidad, fecha, participación y conflictos.
6. **CON-B04f — Validación integral y rendimiento con Docker (completada):** quality gates, migraciones y suites de integración/concurrencia en PostgreSQL aislado, más mediciones de 20/50/100 filas. No incluye cambios frontend; véase [import-performance.md](import-performance.md). La integración frontend permanece posterior.

### Cierre CON-B04a

- Convención editorial sugerida: **Artista principal + nombre de gira + año**; no se valida ni autogenera.
- `normalizeGeography` es la única clave de Tour. PostgreSQL impide duplicados y las carreras se traducen a conflicto en CRUD.
- La resolución de Tours es exacta por clave; no hay fuzzy match ni creación. El importador futuro debe pedir confirmación con el ID existente.
- El recibo se identifica por editor/lote/fila, valida contenido procesado por hash, guarda estado/resultado JSONB y se bloquea en la transacción que guardará la fila. La retención es indefinida hasta diseñar una limpieza explícita.
- `1792120000000-PrepareTourNamesAndImportReceipts` aplicada en `SpamMusicDB` local el 2026-11-02 después de confirmar cero Tours y cero colisiones. `db:check` quedó con cero pendientes y el esquema real confirmó la columna no nula, ambos índices únicos, la FK y las checks del recibo. El ledger mantiene la histórica `UpdateListStatusEnum1766066905027` sin artefacto compilado (111 entradas frente a 110 migraciones compiladas); no se editó. No se ejecutó en remoto. La suite PostgreSQL de concurrencia sigue pendiente porque requiere su propia base de fixtures vacía; las pruebas unitarias no se consideran cobertura de esa carrera.
- Exportados los contratos `ToursService.findExactByName` y `ImportRowReceiptsService.execute` para CON-B04b. CON-B04a no implementa importación masiva, endpoints ni cambios frontend.

## Referencias revisadas

- `src/catalog/events/events.service.ts`, DTOs y `entities/event*.entity.ts`.
- `src/catalog/tours/tours.service.ts`, DTOs, entidad y migración `1792100000000-CreateTours`.

## Revisión focalizada CON-B04e — ampliación confirmada

`EventsService.update` reemplaza el lineup completo si recibe `lineup`, por lo que no es una primitiva válida para completar eventos. `EventArtist` conserva posición y `tourId`; la ampliación crea filas nuevas y no guarda el Event ni toca participaciones existentes. El endpoint separado `POST /api/events/:eventId/import-lineup` usa `@Auth(ValidRoles.riffvalley)`, JWT/guards existentes y DTO estricto. La autoridad del destino es el parámetro de ruta.

El contrato del conflicto de CON-B04c entrega IDs candidatos y artistas añadibles, pero no conserva el contenido completo de la fila conflictiva. Para volver a validar localidad, fechas e identidades en una petición independiente, el contrato nuevo exige `sourceRow` original junto con `batchId`, `rowId` y la selección explícita `artists`. La transacción bloquea el Event y el mismo advisory lock por localidad usado por CON-B04d, resuelve otra vez las identidades, reejecuta `ImportConflictsService.inspect` con el EntityManager transaccional y exige el evento de destino y una participación coincidente vigente. Una fila obsoleta devuelve `IMPORT_CONFLICT_STALE`; artistas ambiguos, incompatibles o una identidad de recibo reutilizada tienen códigos separados.

`ImportRowReceiptsService` comparte la misma tabla, transacción y hash canónico, pero ahora su clave agrega `operation`. La migración `1792130000000-ScopeImportReceiptsByOperation` pone los recibos históricos bajo `create-event` mediante default y crea unicidad por editor/lote/fila/operación; las ampliaciones usan `expand-lineup`. No invalida ni mezcla recibos de CON-B04d.

## Validación CON-B04f — PostgreSQL y rendimiento en Docker

La configuración reproducible y las cifras detalladas están en [import-performance.md](import-performance.md). El flujo usó exclusivamente Compose con el proyecto `con-b04f-validation`, PostgreSQL `16.14`, runner Node `24`/pnpm `11.28.7` y un fixture geográfico HTTP local. No accedió a `SpamMusicDB`, PostgreSQL instalado en el host ni servicios remotos. La limpieza elimina solo los contenedores, red y volumen nombrados para este proyecto.

`pnpm run verify` aprobó: 303 suites y 2.896 tests pasaron; 34 suites y 182 tests quedaron omitidos por condiciones normales del repositorio. Los gates informaron cero hallazgos nuevos: estructura (9 históricos), tipado seguro (5), ESLint (832); typecheck sin errores y build aprobado. Las integraciones PostgreSQL sumaron 17 pruebas aprobadas entre recibos, migraciones y ejecución real de `EventsImportBatchService`/`ImportEventLineupService`.

En el PostgreSQL aislado se ejecutaron las migraciones `179207`–`179213`, comprobando índices, restricciones, FKs y triggers de Venue, Tour, EventArtist y recibos. Se verificaron tres conciertos con un Tour compartido, festivales, venues físicos/genéricos, rollback y reintentos. Las carreras reales materializaron Artist/Venue/Tour sin duplicados; dos importaciones incompatibles del mismo artista/fecha terminaron como una creación y un conflicto. Dos ampliaciones paralelas produjeron posiciones distintas, una espera de lock observada y cero deadlocks. La suite del servicio probó localidad nueva mediante el mock Docker, sin llamadas externas.

Los lotes existentes tardaron en promedio 177 ms/413 ms/768 ms para 20/50/100 filas (284/704/1.404 consultas); el escenario con Tour/Artist compartidos tardó 185 ms/436 ms/800 ms (309/759/1.509 consultas). Repetir el mismo recibo tomó 4/9/13 ms y una consulta; la detección de conflictos del escenario medido tomó 12/20/40 ms y cuatro consultas. Veinte eventos quedaron holgadamente bajo la referencia de dos segundos. No se cambió el código de producción ni se agregaron índices: los resultados no justificaron una optimización funcional. El conteo de consultas es total por llamada, no una segmentación instrumentada por fase.

Límite: para no reproducir una cadena histórica de migraciones incompleta desde cero, la prueba prepara las tablas base mínimas de Country, Artist y User y ejecuta las siete migraciones de dominio/importación sobre PostgreSQL real. No se afirma que la cadena histórica completa ni un entorno de producción se hayan verificado. No se cambiaron contratos ni frontend.

Pruebas ejecutadas: Jest completo en serie (303 suites aprobadas, 32 omitidas; 2.896 tests aprobados, 169 omitidos), suite focalizada del servicio/controlador/recibos/conflictos/migración, `quality:typecheck` (0 errores), `quality:types` (0 nuevos; 5 históricos), `quality:lint` (0 nuevos; 832 históricos), gate estructural (0 nuevos; 9 históricos), quality build/runtime dependencies y build de Nest. `git diff --check` pasó. La primera ejecución de Jest en sandbox no pudo abrir sockets HTTP; al repetirla con permiso de sockets locales pasó completa. El wrapper `pnpm run verify` no llegó al final porque el primer typecheck detectó dos errores del spec, ya corregidos; después se ejecutaron y aprobaron los gates relevantes individualmente. La comprobación de concurrencia PostgreSQL real no se ejecutó: no se usó la base persistente local para fixtures destructivos y no había una base aislada identificada. La nueva migración queda pendiente de aplicar/verificar fuera de esta tarea. El endpoint no modifica el frontend.

- `src/catalog/artists/catalog/artist-catalog.service.ts`, `write/artist-write.service.ts`, DTO y entidad Artist.
- `src/catalog/venues/venues.service.ts`, LocalitiesService, DTOs, entidades Locality/Alias/Venue.
- `src/catalog/import/transaction/catalog-import-transaction.ts`, importadores manual y Excel.
- Estado del roadmap en `importer.md` y `domain.md`.

## Revisión e implementación CON-B04b

La auditoría focalizada verificó las implementaciones actuales de `ArtistsService.resolveBatch`, `ArtistCatalogService.resolveExactNames`, `ArtistWriteService`, `LocalitiesService.resolveAndGeocode`, alias, `VenuesService.importBatch` y `getOrCreateGenericVenue`, `ToursService.findExactByName`, `ImportRowReceiptsService.execute` y `runCatalogImportTransaction`.

- Artist requiere solo `name`; la creación del catálogo calcula `nameNormalized`, `searchNameNormalized` y `needsReview=true`. El normalizador `normalizeMusicName` junto a sus variantes y comparación son la lógica común de identidad. No hay unique index seguro para el histórico. El resolutor usa transacción del llamador, advisory lock de PostgreSQL por clave normalizada y reconsulta bajo lock; ambigüedad sin `artistId` se devuelve con candidatos. Si se envía ID, el resolutor lo carga junto con los candidatos de nombre y comprueba que corresponde a la identidad normalizada.
- La búsqueda local de Locality considera nombre y alias, contexto de país/región y provincia textual. Las ambigüedades requieren selección. Para una localidad nueva `prepareLocalities` crea únicamente un objeto transitorio en memoria y llama al geocoder existente antes de la transacción; agrupa las mismas claves en el lote. Nominatim conserva limitación global, user-agent y política de identidad. La materialización requiere una preparación geográfica inequívoca y escribe Locality + identidad/coordenadas OSM + alias con el manager transaccional. País/región deben existir; no se inventan divisiones administrativas.
- Venue existente se busca como físico (`isGeneric=false`) por localidad + `normalizeGeography`. `VenuesService.createImportVenue` crea la sala con la unicidad existente y recupera de forma segura la fila ganadora mediante `ON CONFLICT`; el vacío delega en `getOrCreateGenericVenueWithStatus`, que conserva el mecanismo idempotente PostgreSQL del genérico, dentro del manager del llamador. No se usa `VenuesService.importBatch`, porque es una operación autónoma por lote y no acepta manager.
- Tour usa `normalizeGeography` y la columna/índice únicos de CON-B04a. El resolutor pide confirmación explícita por ID para toda clave existente, incluso si aparece tras la inspección. Un contexto explícito permite compartir una Tour recién creada por filas del mismo grupo transaccional; el coordinador debe descartar ese contexto si hay rollback. No crea relaciones ni asocia fechas.
- `ImportRowReceiptsService.execute` abre la transacción de fila y entrega su `EntityManager` al callback que materializa dependencias, Event y EventArtist; así el recibo y el evento se confirman o revierten juntos. Los resolutores aceptan ese manager sin abrir transacciones propias.

Las pruebas unitarias nuevas cubrieron ambigüedad y serialización de Artist, falta de contexto local, geocodificación agrupada sin insertar Locality durante preparación, confirmación obligatoria de Tour y entradas inválidas. La carrera real de PostgreSQL quedó pendiente en esa fase y se validó después con el fixture aislado de CON-B04f; nunca se conectaron esas suites a `SpamMusicDB`. No se implementaron endpoints, Event, EventArtist ni cambios frontend en CON-B04b.

## Implementación CON-B04d — `POST /api/events/import-batch`

La ruta protegida requiere `riffvalley`. El DTO del sobre valida `batchId`, `countryId` y hasta 100 elementos; el servicio transforma y valida cada fila por separado para que una propiedad desconocida, fecha inválida o falta de ciudad no rechace las demás. Los resultados conservan el orden y ofrecen `created`, `conflict`, `invalid` o `failed` con códigos estables. El DTO de fila admite hasta 100 artistas, `concert | festival | tour`, datos de fecha, recinto, provincia, `administrativeRegionId` opcional, `tourId`, precio e información adicional. No se modificó frontend.

La resolución sigue la auditoría de CON-B04b: búsqueda de artistas agrupada, resolución de localidades y alias por país, preparación geográfica antes de las escrituras, salas físicas existentes/nuevas y Venue genérico cuando el nombre está vacío. Se registra el ajuste al ejemplo inicial: para crear una localidad ausente se necesita `administrativeRegionId` existente, ya que el geocoder actual deriva región/país de ese objeto y el backend no inventa divisiones administrativas; las localidades conocidas no requieren este ID. Nominatim queda fuera de transacciones.

Antes de inspeccionar conflictos se busca en una sola consulta si hay recibos previos por editor/lote/fila; un contenido idéntico reproduce el resultado sin tratar el Event creado por el propio intento como duplicado. Cada fila restante confirma recibo, dependencias, Event y EventArtist en una transacción individual. Las entidades compartidas se materializan dentro de la transacción de la primera fila que se confirme; un rollback no deja huérfanos y una fila posterior puede crear/reutilizar la entidad. Tours de nombre normalizado nuevo se comparten mediante el resultado ya confirmado en el mismo lote; un Tour anterior requiere su `tourId` explícito. Tours guardan eventos `concert` sin nombre y no generan `TourArtist`.

`ImportConflictsService` inspecciona filas del lote y eventos persistidos sin cambiar sus reglas. Antes de escritura se vuelve a inspeccionar mediante el `EntityManager` transaccional. Un advisory lock por `localityId` serializa las importaciones en la misma localidad; esto protege conciertos de igual artista/fecha y festivales solapados frente a carreras sin bloqueo global, a costa de serializar eventos concurrentes distintos de esa localidad. Conflictos e invalidaciones no dejan recibo ni entidades; errores de persistencia revierten el recibo con la fila y se registran sin detalle sensible. Los eventos existentes nunca se amplían; esa operación queda para CON-B04e.

Verificaciones: `pnpm run verify` aprobado: 301 suites aprobadas, 2.883 tests aprobados y 32 suites/169 tests omitidos por sus condiciones de ejecución; build, typecheck, gates estructural, tipado seguro y ESLint sin hallazgos nuevos. La variable `CON_B04A_PG_INTEGRATION` estaba desactivada y PostgreSQL local no respondía en `localhost:5432`, así que no se ejecutaron pruebas de integración/concurrencia contra una base aislada. No se usó `SpamMusicDB`. No se ejecutaron pruebas visuales ni navegador.
