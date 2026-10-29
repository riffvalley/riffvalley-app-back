# CAT-ART-4b — Rellenar imágenes de artistas por lotes

**Estado:** completada el 2026-10-29. CAT-ART-4c y CAT-ART-5 permanecen pendientes y no se iniciaron.

El informe referenciado como `cat-art-4a-auditoria-rellenar-imagenes.md` no está disponible en este checkout. Se revisaron los servicios vigentes de Artist y Spotify y se implementó el contrato en este backend (`riffvalley-app-back`). El checkout separado llamado `spammusic-back` no contiene código de aplicación.

## Contrato

- `GET /api/artists/images/fill/preview`, protegido con `superadmin`, devuelve `eligible`, `batchSize` (10), `estimatedBatches` y `startCursor`.
- `POST /api/artists/images/fill`, protegido con `superadmin`, recibe `cursor` opcional y `batchSize` opcional (1–10; predeterminado 10). Devuelve `processed`, agregados (`updated`, `notFound`, `ambiguous`, `failed`, `concurrentUpdates`), un `results` con el ID y resultado de cada artista, `nextCursor` y `hasMore`.
- Cada resultado identifica un `artistId`; fallos no incluyen mensajes ni cuerpos de Spotify. El cursor es Base64URL de una estructura versionada con el UUID anterior y un límite superior. Es opaco para el contrato, pero no está firmado y no contiene secretos.

## Recorrido, búsqueda y persistencia

El recorrido ordena por UUID ascendente y usa comparación keyset (`id > after`), más el límite superior capturado al crear el cursor. Solo selecciona imágenes nulas o vacías. El cursor avanza al último ID seleccionado independientemente de si se actualizó, no hubo candidato, hubo ambigüedad o falló Spotify. Una imagen añadida concurrentemente no altera el orden ni desplaza otros registros como ocurriría con `OFFSET`.

El límite superior es el UUID mayor observado, no una marca temporal: los UUID aleatorios no permiten un snapshot de inserciones entre peticiones. Un registro nuevo con ID entre `after` y el límite aún puede aparecer; uno con ID anterior a `after` o superior al límite queda fuera. Si otra operación elimina una imagen de un artista cuyo ID ya pasó, ese artista se recoge en un nuevo preview, no en el cursor actual. No se mantiene una transacción ni una tabla de snapshot entre peticiones.

La búsqueda reutiliza `SpotifyPublicApiService.findArtistCandidates` y recupera hasta cinco perfiles. Compara nombres con `compareNormalizedMusicNames`. Cero candidatos compatibles produce `not_found`; más de uno produce `ambiguous`; exactamente uno con imagen puede actualizarse. Esta señal verifica compatibilidad textual y unicidad dentro de la muestra de Spotify, no demuestra identidad musical independiente. La búsqueda del proveedor no ofrece en este flujo un identificador local u otra evidencia común para desambiguar homónimos; por tanto, un homónimo fuera de los cinco candidatos sigue siendo un riesgo residual. No se guarda ningún ID inventado.

La escritura ejecuta `UPDATE artist SET image = ... WHERE id = ... AND (image IS NULL OR BTRIM(image) = '')`, sin pasar por `ArtistWriteService.update()`. `affected = 0` se informa como `concurrent_update`. La operación no toca `needsReview`, nombre ni claves normalizadas.

## Tiempo y concurrencia

Las llamadas a Spotify que usa este proceso y la obtención de Client Credentials reciben `AbortSignal.timeout`; para este flujo se fija un máximo de 1.500 ms por llamada. El lote se ejecuta secuencialmente, con tope de 10 artistas: el coste máximo nominal de proveedor es 15 segundos, o hasta 16,5 segundos si una petición necesita renovar el token, antes de sumar PostgreSQL y la respuesta HTTP. El límite reduce la exposición al timeout HTTP del despliegue, pero no constituye una garantía matemática de tiempo total: DNS, planificación del event loop y base de datos quedan fuera del timeout externo. Se devuelve error individual de proveedor y se continúa el lote.

No existe bloqueo distribuido ni estado de trabajo persistente. Dos llamadas simultáneas con el mismo cursor pueden repetir búsquedas a Spotify; la actualización condicional impide sobrescribir una imagen existente y la segunda escritura se informa como concurrencia. Se espera que el frontend avance secuencialmente usando `nextCursor`. Cambios del catálogo durante el recorrido pueden hacer que `eligible` de preview difiera de resultados finales; no se ofrece snapshot transaccional entre peticiones.

## Verificación

Los tests cubren el contrato HTTP, autorización, delegación y comportamiento focalizado de cursor, selección, clasificación, persistencia condicional y timeout. La integración PostgreSQL se ejecuta solo contra el esquema desechable local identificado en su spec, nunca contra producción. Comprobaciones ejecutadas: tests focalizados, integración PostgreSQL si la base aislada está disponible, typecheck, build, ESLint focalizado, `git diff --check` y verificación de enlaces Markdown modificados. No se ejecutan suites completas, E2E ni `pnpm verify`.
