# CAT-DISC-3d — Opciones dinámicas de filtros para DiscList

**Estado:** implementación completada el 2026-10-28. La validación SQL de opciones pasó en PostgreSQL Docker aislado. La validación SQL del listado CAT-DISC-3c se completó en CAT-DISC-3h.

## Endpoint y contrato

Se implementó `GET /api/discs/list/options` en `DiscsController`, antes de las rutas dinámicas. Usa `@Auth()` y `@GetUser()`; no admite `userId`. El `ValidationPipe` global valida `DiscListOptionsQueryDto` y rechaza campos adicionales. La ruta existente `GET /api/discs/list` y todos los endpoints legacy conservan sus handlers y contratos.

La petición reutiliza `mode`, `query`, `dateRange`, `countryId`, `genreId` y `eligibility` (esta última solo para `all`). No acepta `offset`, `limit`, `sort` ni identidad. Devuelve el `DiscListOptionsResponse` de CAT-DISC-3b: `countries[{id,name,isoCode}]` y `genres[{id,name,color}]`, sin contadores, con valores nullable como tales, sin nulos de relación, sin duplicados y ordenados por nombre e ID. Cuando el universo no produce una dimensión, se devuelve un array vacío.

## Arquitectura, ownership y filtros cruzados

`DiscListService.findOptions` selecciona el owner y propaga el `User` autenticado. Catalog no consulta repositorios privados de Community. Cada reader ya exportado desde su módulo delega en un método de opciones de su servicio propietario; no se añadieron dependencias Nest, exports de servicios de escritura ni ciclos.

| Modo         | Lector/criterio conservado                                                                                                    | Unidad al deduplicar opciones                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `all`        | `DiscCatalogService`; discos hasta hoy y `eligibility` de usuario para valoración musical/portada no votada. No usa TopDiscs. | Discos elegibles                                                          |
| `rates`      | Rates; `rate.rate IS NOT NULL` y usuario autenticado.                                                                         | Rates elegibles, dimensiones sin duplicados                               |
| `covers`     | Rates; `rate.cover IS NOT NULL` y usuario autenticado.                                                                        | Rates de portada elegibles                                                |
| `comments`   | Comments; comentario propio no nulo, manteniendo el comportamiento vigente de `isDeleted`.                                    | Las dimensiones se deduplican aunque un disco tenga comentarios repetidos |
| `favorites`  | Favorites propios del usuario.                                                                                                | Favoritos elegibles                                                       |
| `pendientes` | Pendings propios del usuario.                                                                                                 | Pendientes elegibles                                                      |

Se comparten los filtros de búsqueda, periodo, país y género entre las dos consultas de dimensiones mediante `applyDiscListFilters`. La lectura de opciones de cada owner parte de su asociación elegible, no de la página ni de sus 20 items. `all` llama al mismo `applyFindAllFilters` usado por `findAll`, con los mismos filtros, y aplica el corte temporal del listado.

- La consulta de países omite únicamente el `countryId` seleccionado y conserva `genreId`.
- La consulta de géneros omite únicamente `genreId` y conserva `countryId`.
- Ambas respetan modo, usuario, búsqueda, periodo y elegibilidad. Las consultas SQL son distintas y pueden observar cambios concurrentes entre sí, como ya ocurre entre peticiones de opciones y listado.
- Cada dimensión usa `SELECT DISTINCT`, excluye relaciones ausentes y ordena con desempate por ID; no carga páginas ni colecciones para deduplicar en memoria.
- Se conservó el filtro legacy Community por nombre de país donde sus lectores ya lo aceptaban; el DTO nuevo solo expone UUID.

## Seguridad

La ruta requiere sesión válida; no define rol superior al usuario autenticado. El usuario llega por `@GetUser()`, nunca por query. Rates, Comments, Favorites y Pendings filtran el registro propietario por `user.id`; `all` usa al usuario solo para la elegibilidad `unvotedRate`/`unvotedCover`. Las pruebas confirman que asociaciones de otro usuario no producen opciones para la sesión actual. No se introdujo caché; la respuesta sigue siendo privada y no apta para caché compartida. Se conservan las respuestas estándar 401/403 de Identity/Nest.

## Pruebas y verificaciones

- PostgreSQL local Docker aislado (`riffvalley_topdiscs_test`, loopback `127.0.0.1:55433`, PostgreSQL 17, rol con permiso temporal): **3/3 tests SQL aprobados**. Las tablas fixture fueron `TEMP`, la suite verificó la identidad y permisos del destino, y no ejecutó migraciones ni DDL persistente.
- Casos SQL: los seis modos; universo de 25 asociaciones (sin límite de página); filtros cruzados; búsqueda/fechas; rate y cover separados y valores nulos; identidad de usuario; comentarios duplicados y comentario nulo; relaciones de país ausentes; múltiples géneros; opciones vacías y elegibilidad `unvotedRate`.
- Suites focalizadas de DTO, fachada, controller, Catalog y los cuatro servicios Community: **9 suites/186 tests aprobados**; prueba PostgreSQL adicional: **1 suite/3 tests aprobados**.
- `pnpm run verify`: **aprobado**; 231 suites unitarias/2.248 tests aprobados, 17 suites/113 tests opt-in omitidos, 2 snapshots aprobados; build Nest y runtime dependency gate aprobados.
- Gates globales: typecheck **0 errores**; ESLint **839 diagnósticos históricos, 0 nuevos**; estructural **9 infracciones históricas, 0 nuevas**; tipado seguro **5 hallazgos históricos, 0 nuevos**. No se modificaron baselines.
- ESLint focal y `git diff --check`: verificados sin hallazgos nuevos tras formatear únicamente los archivos del alcance.
- La validación PostgreSQL del SQL real de `GET /api/discs/list` y la evolución multi-género están documentadas en [CAT-DISC-3h](cat-disc-3h-multiseleccion-generos.md). No se afirma validación productiva ni mediciones de rendimiento representativas.

## Compatibilidad y límites

No se modificaron los contratos de `GET /api/discs/list`, `GET /api/discs`, Rates, Comments, Favorites, Pendings, TopDiscs ni Dashboard. No se cambió frontend, SQL persistente, migraciones, índices, caché, Identity, WordPress ni elegibilidad de TopDiscs. Las consultas de opciones usan dimensiones `DISTINCT` con `Country`/`Genre` many-to-one; los comentarios repetidos no multiplican las opciones. No se midió producción.

## Archivos

- `src/catalog/discs/discs.controller.ts`, `src/catalog/discs/list/disc-list.service.ts`: ruta y fachada.
- `src/catalog/discs/catalog/disc-catalog.service.ts`: opciones del modo `all`, reutilizando filtros existentes.
- `src/community/common/helpers/apply-disc-list-filters.ts`, `src/community/common/types/disc-list-options.ts`: filtros y contrato interno acotado.
- `src/community/{rates,comments,favorites,pendings}/`: consultas propietarias y métodos de reader.
- `src/catalog/discs/list/__tests__/disc-list-options.postgres.integration.spec.ts` y specs focales de fachada/controller: regresión.

## Siguiente trabajo

- **CAT-DISC-3e:** corregir la identidad de consulta `all` en frontend antes de migrar solo `/disc-list`, adaptar los items discriminados y sustituir opciones globales por este endpoint.
- La precondición técnica de validación PostgreSQL del listado para CAT-DISC-3e está satisfecha por CAT-DISC-3h; la identidad de sesión `all` del frontend sigue siendo una precondición funcional pendiente.
- No se implementó la reorganización visual de filtros. CAT-DISC-3e y posteriores siguen pendientes.
