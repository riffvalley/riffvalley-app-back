# CON-F12i — Contrato backend de importación masiva

**Autoridad contractual:** contrato comprobado en el backend el 2026-11-04. Complementa la política de identidad de [CON-F12e](con-f12e-identity-policy.md) y prevalece sobre descripciones históricas de CON-B04d/CON-F12b con límite de 100 filas. No cambia el comportamiento del endpoint.

## Ruta, autenticación y límites

- `POST /api/events/import-batch` (`/api` es el prefijo global).
- Requiere JWT y rol mínimo `riffvalley`; `superadmin` también lo satisface. `user` y `collaborator` no tienen permiso.
- El body requiere `batchId` UUID, `countryId` UUID y `rows` array. El máximo es **50 filas**, incluido el límite. El array vacío pasa la validación del DTO.
- Propiedades desconocidas en el sobre producen HTTP 400. Más de 50 filas produce HTTP 400 antes de procesar filas.
- Una fila mal formada o con propiedades desconocidas se devuelve como `invalid` en su posición; no rechaza el resto del lote.
- Un body aceptado devuelve HTTP 200 con un resultado por entrada. Fallos de autenticación/autorización son 401/403.

## Entrada

```json
{
  "batchId": "uuid",
  "countryId": "uuid",
  "rows": [
    {
      "rowId": "uuid",
      "type": "concert",
      "name": null,
      "lineup": [{ "name": "Septicflesh", "artistId": "uuid" }],
      "startDate": "2112-02-21",
      "endDate": null,
      "city": "Madrid",
      "localityId": "uuid",
      "province": "Madrid",
      "administrativeRegionId": "uuid",
      "venueId": "uuid",
      "venue": "La Riviera",
      "tourId": null,
      "price": "20 EUR",
      "otherInfo": "Puertas a las 19:00"
    }
  ]
}
```

El ejemplo muestra todos los nombres de propiedad admitidos; los campos opcionales se pueden omitir. Reglas exactas:

| Campo | Regla |
| --- | --- |
| `batchId`, `countryId`, `rowId` | UUID requerido. `rowId` debe ser único dentro del lote. |
| `type` | Requerido: `concert`, `festival` o `tour`. `tour` importa una actuación de concierto asociada a una gira. |
| `name` | Opcional, nullable, texto de hasta 240 caracteres. Obligatorio y no vacío para `festival` y `tour`; opcional para `concert`. |
| `lineup` | Opcional, máximo 100 elementos. Cada elemento requiere `name` no vacío de hasta 100 caracteres y puede llevar `artistId` UUID o `null`. `concert` y `tour` requieren al menos un artista; `festival` no. |
| `startDate` | Requerido, fecha de calendario estricta `YYYY-MM-DD`. |
| `endDate` | Opcional, nullable, misma fecha estricta; no puede preceder a `startDate`. |
| `city` | Requerido, texto no vacío de hasta 150 caracteres. |
| `localityId`, `venueId` | Opcionales; si aparecen deben ser UUID. Se comprueba que sean existentes y compatibles con los nombres/localidad enviados. |
| `province` | Opcional, nullable, texto de hasta 150 caracteres; ayuda a resolver localidades. |
| `administrativeRegionId` | Opcional, nullable, UUID. Hace falta una región válida para crear una localidad nueva; puede omitirse si la localidad ya existe. |
| `venue` | Opcional, nullable, texto de hasta 180 caracteres. |
| `tourId` | Opcional, nullable, UUID; solo se admite para `type: "tour"`. Si la gira ya existe, se requiere confirmarla explícitamente mediante su ID. |
| `price` | Opcional, nullable, texto de hasta 2.000 caracteres. |
| `otherInfo` | Opcional, nullable, texto de hasta 10.000 caracteres. |

Las filas aceptan únicamente estas propiedades. Las validaciones por fila también comprueban fechas de calendario, referencias seleccionadas y consistencia entre IDs y nombres. La resolución de una localidad nueva puede geocodificarse; una localidad ya catalogada no necesita región administrativa.

## Respuesta

```json
{
  "batchId": "uuid-del-request",
  "results": [
    {
      "rowId": "uuid-de-fila",
      "status": "created",
      "eventId": "uuid-evento",
      "localityId": "uuid-localidad",
      "venueId": "uuid-recinto",
      "artistIds": ["uuid-artista"],
      "replayed": false
    }
  ]
}
```

`results` conserva el orden y el tamaño de `rows`. La posición es la correlación definitiva; cada resultado devuelve el `rowId` recibido si se pudo leer. En filas sin objeto o sin `rowId` de texto, `rowId` es `null`. Un `rowId` repetido produce un `invalid` por cada posición repetida.

Los estados y sus campos son:

| Estado | Campos obligatorios | Significado |
| --- | --- | --- |
| `created` | `rowId`, `status`, `eventId`, `localityId`, `venueId`, `artistIds`, `replayed` | Evento creado en una transacción propia. `tourId` se incluye cuando la fila crea una actuación de gira. `replayed` es `false` en la primera confirmación y `true` al reproducir su recibo. |
| `unchanged` | `rowId`, `status`, `eventId` | Hay un duplicado exacto según la política de identidad y no se importa otra vez. Puede incluir `code` y `message`; si se produce durante revalidación transaccional también puede incluir `replayed`. |
| `conflict` | `rowId`, `status`, `code`, `message` | Requiere decisión o corrección: identidad de idempotencia reutilizada con otro contenido, coincidencia parcial, ambigüedad o conflicto de catálogo. `conflicts` y `candidates` se incluyen cuando el análisis los proporciona. |
| `invalid` | `rowId` (puede ser `null`), `status`, `code`, `message` | Datos inválidos, referencia inconsistente, fecha inválida o fila duplicada por `rowId`. Puede incluir `candidates`. |
| `failed` | `rowId` (puede ser `null`), `status`, `code`, `message` | Fallo técnico de preflight/persistencia o resultado no disponible. El mensaje es genérico; el detalle técnico se registra en backend. |

Cuando se devuelve `conflicts`, cada elemento contiene `rowId`, `kind`, `code`, `severity`, `message`, `relatedRowIds`, `existingEventIds`, `matchingArtists`, `addableArtists` y `candidateEventIds`. Estos detalles aparecen solo cuando se detecta un conflicto tipado.

### Ejemplos registrados por la integración PostgreSQL

El siguiente body y sus respuestas son muestras reales de la prueba de 50 filas. Los UUID y la fecha pertenecen al fixture temporal de PostgreSQL.

Entrada:

```json
{
  "batchId": "deea75ea-5826-4528-a756-3b22694dccb6",
  "countryId": "73083804-5141-45b5-92b5-0395422f3fe7",
  "rows": [
    {
      "rowId": "5f600213-47bd-4d09-9962-e7464bf3bd30",
      "type": "concert",
      "name": null,
      "lineup": [
        {
          "name": "Septicflesh",
          "artistId": "6a5581b7-d9e9-42f9-ab23-02f6f141d188"
        }
      ],
      "startDate": "2112-02-21",
      "city": "Madrid",
      "province": "Madrid",
      "administrativeRegionId": "2beb88c3-73b0-4b94-b5f8-9b8dd4283c40",
      "venue": "La Riviera",
      "price": "0 EUR",
      "otherInfo": "Original row 0"
    }
  ]
}
```

Resultado `created` observado:

```json
{
  "batchId": "deea75ea-5826-4528-a756-3b22694dccb6",
  "results": [
    {
      "rowId": "5f600213-47bd-4d09-9962-e7464bf3bd30",
      "status": "created",
      "eventId": "ce01c03e-96b9-495c-827c-6fbc954d4b3d",
      "localityId": "77c91ef6-18d0-434c-94b1-3a2d1af0d6ef",
      "venueId": "14f2e36a-1bf9-4d97-a753-2cc13b25f139",
      "artistIds": ["6a5581b7-d9e9-42f9-ab23-02f6f141d188"],
      "replayed": false
    }
  ]
}
```

El reintento de esa misma petición, con las mismas claves y contenido, reprodujo los campos y cambió `replayed` a `true`:

```json
{
  "batchId": "deea75ea-5826-4528-a756-3b22694dccb6",
  "results": [
    {
      "rowId": "5f600213-47bd-4d09-9962-e7464bf3bd30",
      "status": "created",
      "eventId": "ce01c03e-96b9-495c-827c-6fbc954d4b3d",
      "localityId": "77c91ef6-18d0-434c-94b1-3a2d1af0d6ef",
      "venueId": "14f2e36a-1bf9-4d97-a753-2cc13b25f139",
      "artistIds": ["6a5581b7-d9e9-42f9-ab23-02f6f141d188"],
      "replayed": true
    }
  ]
}
```

El lote siguiente usó un `batchId` y `rowId` nuevos para la misma fecha, localidad y lineup. El resultado real fue:

```json
{
  "batchId": "79bf969e-fbfe-4860-aca9-d09f6b72674e",
  "results": [
    {
      "rowId": "bfb87249-7f48-4d26-861f-2a8d99c2574a",
      "status": "unchanged",
      "eventId": "ce01c03e-96b9-495c-827c-6fbc954d4b3d",
      "code": "CONCERT_DUPLICATE",
      "message": "This event is already registered and was not imported again"
    }
  ]
}
```

La prueba de cancelación PostgreSQL a mitad del lote produjo `[created, failed, failed]`: la primera fila conservó su `eventId`; la fila cancelada devolvió `IMPORT_ROW_FAILED`; la fila posterior devolvió `IMPORT_PREFLIGHT_FAILED`. La causa de prueba fue SQLSTATE `57014`, y no se persistieron la fila cancelada ni la posterior.

## `batchId`, `rowId`, idempotencia e igualdad de eventos

- El recibo de idempotencia se identifica por usuario autenticado + `batchId` + `rowId` + operación `create-event`. La operación es interna; no se envía en el JSON.
- El hash cubre el contenido de la fila procesada y el `countryId`. Las claves de objeto se canonicalizan; valores opcionales ausentes se convierten generalmente a `null`. Un retry con el mismo contenido y clave reproduce el resultado confirmado y marca `replayed: true`.
- Reutilizar la misma identidad con otro contenido devuelve `conflict` / `IMPORT_IDEMPOTENCY_CONFLICT`. Usa un nuevo `rowId` si se trata de una edición/revisión.
- `batchId`/`rowId` identifican una operación para repetirla; no identifican qué evento es igual en el catálogo. Cambiar esas claves evita reproducir un recibo, pero no evita la detección de duplicados.
- Concierto y `tour`: es `unchanged` si hay un único evento en la misma fecha y localidad y el lineup completo coincide. Si comparten parte, pero no todo el lineup, es `conflict`. Venue, nombre de concierto, gira, precio y `otherInfo` no forman la identidad.
- Festival: nombre normalizado, localidad y periodo inclusivo completo identifican el duplicado; el lineup no interviene. Mismo nombre/localidad con periodo solapado distinto requiere revisión (`conflict`).
- Las filas conflictivas dentro del mismo lote no se persisten. Filas `unchanged`, `conflict` e `invalid` no crean artistas, localidades, recintos, giras, eventos ni relaciones `EventArtist`. Un `unchanged` siempre incluye el `eventId` existente.

## Transacciones, fallos y reintentos inciertos

El servicio procesa filas secuencialmente. Cada fila persistible tiene una transacción independiente que contiene recibo, revalidación, materialización de referencias, Event, EventArtist y resultado del recibo. Las lecturas de preflight agrupan referencias; antes de escribir, revalida IDs, identidad y duplicados dentro de la transacción. Un advisory lock por localidad serializa la revalidación y escritura concurrente; las restricciones y claves foráneas PostgreSQL actúan como última defensa.

Un error de validación o conflicto de negocio afecta solo a su fila y permite continuar. Un error de infraestructura reconocido marca la fila actual como `failed` y las restantes como fallidas sin ejecutarlas. Las transacciones confirmadas anteriormente permanecen confirmadas. Si se pierde la respuesta después de un commit, repite el lote con las mismas claves y contenido: los recibos reproducen filas confirmadas; una transacción revertida puede reintentarse. La prueba cubre una cancelación SQL simulada, no un corte real del cliente HTTP; si el transporte se corta, el cliente puede no recibir una respuesta y debe resolver la incertidumbre reintentando las mismas claves.

La idempotencia evita volver a ejecutar una fila ya confirmada. La detección de eventos iguales evita crear otro evento incluso cuando el cliente usa identidades nuevas. Son protecciones separadas.

## Verificación PostgreSQL y recursos observados

Validación realizada contra PostgreSQL 16.14 en Docker temporal, runner Node 24/pnpm 11.28.7 y mock local de geocodificación. No hubo conexiones a producción ni llamadas a geocodificadores externos.

- 50 eventos con referencias conocidas: 705 consultas observadas, 50 transacciones, 323,27 ms. La muestra de RSS antes/después aumentó aproximadamente 0,875 MiB; no es un máximo de memoria instantáneo.
- Los mismos 50 eventos con `batchId` y `rowId` nuevos: 54 consultas, cero transacciones, 57,66 ms. Los 50 resultados fueron `unchanged`, con los `eventId` originales; los snapshots completos de Artist, Locality, Venue, Tour, Event y EventArtist fueron idénticos.
- Reintento con las mismas claves: los 50 resultados reprodujeron exactamente sus campos anteriores más `replayed: true`.
- En escenarios de 50 filas de la suite existente, el máximo medido fue 561,73 ms para crear una localidad mediante el fixture local. Las peticiones con referencias ya existentes se mantuvieron entre 262,06 y 291,61 ms en las tres repeticiones. Son tiempos del servicio en Docker local, sin HTTP/autenticación/red de producción.
- Las consultas incluyen lectura de recibos, inspecciones agrupadas de Artist/Locality/Tour y eventos candidatos, reserva/lectura bloqueada/actualización de recibos, revalidación y escrituras de referencias/Event/EventArtist. El contador es total por llamada; no se midió un desglose fiable por fase ni se ejecutó `EXPLAIN ANALYZE`.
- El escenario de concurrencia existente observó una espera de lock como máximo, cero deadlocks y una creación frente a un conflicto para importaciones incompatibles. Los IDs explícitos de localidad/recinto y la consistencia de referencias se revalidaron; la suite de migración comprobó las restricciones PostgreSQL.

Las cifras son fixtures sintéticos locales, no una garantía de latencia o memoria en producción. El frontend no se ejecutó ni se valida desde este documento.
