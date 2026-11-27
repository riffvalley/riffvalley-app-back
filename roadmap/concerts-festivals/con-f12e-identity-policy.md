# CON-F12e — Detección de eventos ya existentes

**Estado:** implementado en backend. La importación masiva incorpora eventos nuevos; los eventos existentes se editan individualmente desde el frontend. No se modificó el frontend ni se actualizaron o eliminaron eventos.

## Política de identidad

- **Conciertos y filas `tour`:** fecha inicial (`startDate`), localidad resuelta y lineup completo de artistas participantes. `tour` sigue representando un concierto y el nombre/ID de Tour no participa en la identidad. Venue, precio e información adicional tampoco participan.
- Un concierto es **`unchanged`** solo si hay un único evento candidato en la misma fecha y localidad y ambos lineups contienen exactamente los mismos artistas. Los artistas conocidos se comparan por ID; si uno de los lados carece de ID, se compara el nombre musical normalizado con el lineup persistido. No se crean artistas para hacer esa comprobación.
- Si coinciden fecha y localidad y se comparte al menos un artista, pero el lineup completo no es igual, el resultado es **`conflict`** para revisión. Compartir solo parte de los artistas nunca basta para considerarlos el mismo concierto. Si no comparten artistas, la fila puede ser nueva.
- Una fila de concierto o `tour` sin artistas es **`invalid`** (`EVENT_LINEUP_REQUIRED`): falta información necesaria para comprobar su identidad. Los artistas ambiguos o inválidos siguen siendo `invalid` por las reglas del resolutor. Un nombre nuevo e inequívoco se compara por nombre normalizado, y solo se crea si la fila termina importándose.
- **Festivales:** nombre normalizado con `normalizeGeography`, localidad y periodo inclusivo completo (`startDate` y `endDate`; sin `endDate`, equivale a un día). Coincidir en los tres valores es **`unchanged`**, con independencia del lineup entrante o persistido. Mismo nombre y localidad con periodos distintos solapados sigue siendo **`conflict`** para revisión. Periodos disjuntos o localidades distintas son independientes. El lineup no es requisito para identificar un festival.
- Las filas duplicadas dentro del propio lote permanecen en **`conflict`**; ninguna gana por orden ni se persiste automáticamente.

La clasificación `new` se conserva como `created` para los consumidores actuales del endpoint. `unchanged` se añade de forma aditiva a los resultados e incluye el `eventId` existente. No implica igualdad de campos editables: indica que no debe importarse el evento otra vez.

## Implementación y persistencia

El preflight utiliza `ImportConflictsService.inspect`, incluida su comparación de participación y sus reglas de festivales multidía. La lectura PostgreSQL ahora carga candidatos de la misma localidad y rango de fechas sin filtrarlos por IDs de artista, de modo que también permite revisar lineups de artistas aún no resueltos. No compara Venue, Tour, precio ni `otherInfo`.

Las filas `unchanged`, `conflict` e `invalid` se clasifican antes de materializar artistas, localidad, Venue o Tour. Las filas aptas repiten la inspección dentro de su transacción, bajo el advisory lock por localidad, antes de materializar artistas, Tour o Venue. Una identidad que aparece entre preflight y confirmación devuelve `unchanged` o `conflict` antes de crear Event/EventArtist; los conflictos revierten su transacción. En ambos casos no se materializan artistas, Tour ni Venue de la fila omitida. Los recibos mantienen la idempotencia de las filas confirmadas.

Se conserva `POST /api/events/import-batch`, el límite HTTP de 50 filas, el resultado en orden de entrada, las transacciones individuales y los reintentos idempotentes. No hay migración de esquema.

## Cobertura solicitada

Las pruebas unitarias cubren igualdad completa del lineup, coincidencia parcial, nombres de artistas sin ID, filas internas repetidas, lineup ausente, diferencias de fecha/localidad y la revalidación transaccional. La integración PostgreSQL cubre conciertos y festivales existentes, lineup distinto en festivales, ausencia de escrituras para filas omitidas, idempotencia y dos importaciones concurrentes de la misma identidad.

La suite PostgreSQL debe ejecutarse con la base temporal aislada `con_b04f_events` y el fixture local de geocodificación de CON-B04f; no debe apuntar a `SpamMusicDB` ni a servicios reales.
