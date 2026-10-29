# CAT-ART-4b — Rellenar imágenes de artistas por lotes

**Estado:** completada el 2026-10-29. CAT-ART-4c y CAT-ART-5 permanecen pendientes y no se iniciaron.

El informe referenciado como `cat-art-4a-auditoria-rellenar-imagenes.md` no está disponible en este checkout. Se revisaron los servicios vigentes de Artist y Spotify y se implementó el contrato en este backend (`riffvalley-app-back`). El checkout separado llamado `spammusic-back` no contiene código de aplicación.

## Contrato

- `GET /api/artists/images/fill/preview`, protegido con `superadmin`, devuelve `eligible`, `batchSize` (10), `estimatedBatches` y `startCursor`.
- `POST /api/artists/images/fill`, protegido con `superadmin`, recibe `cursor` opcional y `batchSize` opcional (1–10; predeterminado 10). Devuelve `processed`, agregados (`updated`, `notFound`, `ambiguous`, `failed`, `concurrentUpdates`), un `results` con el ID y resultado de cada artista, `source` (`spotify` o `lastfm`) cuando se actualiza, `nextCursor` y `hasMore`.
- Cada resultado identifica un `artistId`; fallos no incluyen mensajes ni cuerpos de proveedores. El cursor es Base64URL de una estructura versionada con el UUID anterior y un límite superior. Es opaco para el contrato, pero no está firmado y no contiene secretos.

## Recorrido, búsqueda y persistencia

El recorrido ordena por UUID ascendente y usa comparación keyset (`id > after`), más el límite superior capturado al crear el cursor. Selecciona artistas con imagen nula/vacía y artistas con `needsReview=true`, incluidos estos últimos cuando ya tienen imagen. El cursor avanza al último ID seleccionado independientemente de si se actualizó, no hubo candidato, hubo ambigüedad o falló Spotify. Una imagen añadida concurrentemente no altera el orden ni desplaza otros registros como ocurriría con `OFFSET`.

El límite superior es el UUID mayor observado, no una marca temporal: los UUID aleatorios no permiten un snapshot de inserciones entre peticiones. Un registro nuevo con ID entre `after` y el límite aún puede aparecer; uno con ID anterior a `after` o superior al límite queda fuera. Si otra operación elimina una imagen de un artista cuyo ID ya pasó, ese artista se recoge en un nuevo preview, no en el cursor actual. No se mantiene una transacción ni una tabla de snapshot entre peticiones.

La búsqueda reutiliza `SpotifyPublicApiService.findArtistCandidates` y recupera hasta cinco perfiles. Compara nombres con `compareNormalizedMusicNames`. Si Spotify no da candidato compatible, o el único candidato compatible no tiene imagen, consulta `LastfmApiService.searchArtistImageCandidates` (`artist.search`, máximo cinco resultados, timeout de 1.000 ms). No usa Last.fm para saltarse una ambigüedad detectada por Spotify. En ambos proveedores exige exactamente un resultado compatible y una URL de imagen usable; múltiples coincidencias exactas producen `ambiguous`, cero producen `not_found`, y errores del proveedor producen `failed`. Se descarta la imagen placeholder conocida de Last.fm. La unicidad del nombre dentro de una muestra limitada no demuestra identidad musical independiente; un homónimo fuera de la muestra sigue siendo un riesgo residual. No se guarda ningún ID inventado.

La escritura ejecuta un `UPDATE` por ID que fija `image` a la imagen aceptada del proveedor y `needsReview=false`. La condición compara la imagen actual con la imagen leída al seleccionar el artista; si ya tenía imagen, también exige que siga con `needsReview=true`. Así se permite corregir imágenes existentes marcadas para revisión, pero no sobrescribir una imagen modificada concurrentemente. `affected = 0` se informa como `concurrent_update`. Los artistas sin coincidencia, ambiguos o con error del proveedor conservan imagen y estado. No se modifican nombres ni claves normalizadas.

## Tiempo y concurrencia

Las llamadas a Spotify que usa este proceso y la obtención de Client Credentials reciben `AbortSignal.timeout`; para este flujo se fija un máximo de 1.500 ms por llamada. El fallback de Last.fm tiene timeout de 1.000 ms y solo se usa en búsquedas Spotify sin imagen aceptada. El lote se ejecuta secuencialmente, con tope de 10 artistas: el coste máximo nominal de proveedor es 25 segundos si todos necesitan fallback, o hasta 26,5 segundos si también se renueva el token, antes de sumar PostgreSQL y la respuesta HTTP. No es una garantía de caber en cualquier timeout HTTP de Heroku; el tamaño actual de 10 conserva ese riesgo si todos los artistas necesitan fallback. DNS, planificación del event loop y base de datos también quedan fuera de los timeouts externos. Se devuelve error individual de proveedor y se continúa el lote.

No existe bloqueo distribuido ni estado de trabajo persistente. Dos llamadas simultáneas con el mismo cursor pueden repetir búsquedas a Spotify; la actualización condicional impide sobrescribir una imagen existente y la segunda escritura se informa como concurrencia. Se espera que el frontend avance secuencialmente usando `nextCursor`. Si una consulta de página no selecciona artistas, el lote termina aunque una elegibilidad concurrente aparezca inmediatamente después; se requiere un preview nuevo para recoger esos cambios y evitar devolver `hasMore=true` sin avanzar el cursor. Cambios del catálogo durante el recorrido pueden hacer que `eligible` de preview difiera de resultados finales; no se ofrece snapshot transaccional entre peticiones.

No se escribe un log por lote exitoso. Las anomalías de cursor generan logs estructurados de nivel error, sin registrar el cursor ni IDs: una elegibilidad detectada tras una página vacía genera `artist_image_fill_empty_page_with_remaining_eligible`; una violación del contrato de continuación genera `artist_image_fill_cursor_invariant_failed` e incluye los campos `processed`, `hasMore` y `nextCursorPresent`.

## Verificación

Los tests cubren el contrato HTTP, autorización, delegación y comportamiento focalizado de cursor, selección, clasificación, persistencia condicional y timeout. La integración PostgreSQL se ejecuta solo contra el esquema desechable local identificado en su spec, nunca contra producción. Comprobaciones ejecutadas: tests focalizados, integración PostgreSQL si la base aislada está disponible, typecheck, build, ESLint focalizado, `git diff --check` y verificación de enlaces Markdown modificados. No se ejecutan suites completas, E2E ni `pnpm verify`.
