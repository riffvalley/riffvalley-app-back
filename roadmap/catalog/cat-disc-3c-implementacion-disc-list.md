# CAT-DISC-3c — Implementación backend de DiscListService

**Estado:** completada para el listado; CAT-DISC-3d (opciones) y CAT-DISC-3e (migración frontend) siguen pendientes.
**Fecha:** 2026-10-28.
**Base contractual:** [CAT-DISC-3b](cat-disc-3b-contratos-disc-list.md) y la auditoría CAT-DISC-3a del checkout frontend (`roadmap/catalog/cat-disc-3a-auditoria-consumidores-contratos.md`).

## Arquitectura implementada

`DiscListService` es una fachada de lectura de Catalog en `src/catalog/discs/list/`. `DiscsController` registra `GET /api/discs/list` antes de `@Get(':id')`, aplica `@Auth()` y recibe el usuario únicamente mediante `@GetUser()`. El `ValidationPipe` global valida el `DiscListQueryDto`; `userId` no forma parte del contrato y el whitelist global rechaza parámetros extra.

La fachada transforma la petición en criterios para lectores de dominio, selecciona el owner según `mode`, conserva el envelope de paginación y proyecta items al contrato discriminado de CAT-DISC-3b. No contiene consultas Community ni lógica de escritura. La respuesta no incluye relaciones completas de usuarios ni datos personales de otros usuarios. No se añade caché.

| Modo         | Lector propietario                                           | Unidad de resultado y total                                                                                                     |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `all`        | `DiscCatalogService.findDiscList`                            | Una fila por Disc elegible; total de discos. El usuario autenticado determina `userRate`, `favoriteId` y `pendingId`.           |
| `rates`      | `RatesDiscListReader` → `RatesService.findAllByUser`         | Una fila por Rate propio con el campo musical presente; total de rates.                                                         |
| `covers`     | `RatesDiscListReader` → `RatesService.findAllByUser`         | Una fila por Rate propio con portada presente; total de rates.                                                                  |
| `comments`   | `CommentsDiscListReader` → `CommentsService.findAllByUser`   | Una fila por Comment propio, incluso si se repite el Disc o está marcado eliminado según la consulta actual; total de comments. |
| `favorites`  | `FavoritesDiscListReader` → `FavoritesService.findAllByUser` | Una fila por Favorite propio; total de favorites.                                                                               |
| `pendientes` | `PendingsDiscListReader` → `PendingsService.findAllByUser`   | Una fila por Pending propio; total de pendings.                                                                                 |

Rates, covers, favorites, comments y pendientes conservan `entryId` junto con `disc.id`; la fachada no deduplica filas por disco. Los lectores de cada owner reutilizan los filtros y condiciones de elegibilidad actuales. `all` sigue usando la query de Catalog, no la elegibilidad estadística de TopDiscs.

## Ordenación y paginación

Se mantiene `offset=0`, `limit=20` por defecto y máximo 100 según el DTO de CAT-DISC-3b. Se devuelve `totalItems`, `totalPages`, `currentPage` y `limit`; resultados vacíos conservan `totalPages=0`, `currentPage=1`. Los counts proceden de las consultas count de cada owner y cuentan su unidad de resultado, no siempre discos.

El DTO enumera y valida sorts semánticos por modo; no admite expresiones SQL. Las adapters los convierten a nombres permitidos por las consultas propietarias. La lectura nueva añade desempates por ID de Disc, Rate, Comment, Favorite o Pending para que el orden sea determinista entre páginas. Se preserva el orden predeterminado de cada owner. La implementación de comments mantiene Comment como unidad y agrega únicamente las relaciones requeridas para filtrar/mapear.

La inspección de los controles actuales de `/disc-list` confirmó los sorts usados por la UI (fecha, artista/media en `all`; fecha y rate/cover propio en los modos correspondientes). No se cambió el frontend; la validación del contrato evita sort no soportado por modo. La migración y su adaptación de respuesta se reservan a CAT-DISC-3e.

## Owners, módulos y dependencias

- **Catalog:** `DiscCatalogService.findDiscList` adapta el DTO nuevo al query existente y activa desempate estable en la rama nueva. No cambia el `findAll` legacy cuando se invoca sin opciones.
- **Rates:** `RatesDiscListReader` está exportado desde `RatesModule`; delega en `RatesService`.
- **Comments, Favorites, Pendings:** cada módulo exporta un reader pequeño de DiscList; cada reader delega exclusivamente en su servicio propietario. No se exponen repositorios.
- **Identity:** `@Auth()` y `@GetUser()` protegen la ruta y proporcionan el principal autenticado; no se añadió filtro de identidad enviado por cliente ni se modificó Identity globalmente.

El grafo de imports es unidireccional: `DiscModule` importa módulos propietarios; los módulos Community no importan `DiscModule`. Las pruebas de módulos comprueban la disponibilidad de los readers y el build de Nest resuelve los providers. No se introdujo `forwardRef`.

Las opciones de filtro cruzado se implementaron en CAT-DISC-3d sobre el conjunto completo elegible, con consultas por owner y sin derivarlas de la página actual. Su contrato, pruebas y límite de validación SQL del listado están en [CAT-DISC-3d](cat-disc-3d-opciones-disc-list.md).

## Contrato y compatibilidad

El endpoint nuevo devuelve el envelope común y los tipos discriminados `disc`, `rate`, `cover`, `comment`, `favorite` y `pending`. Las proyecciones de tarjeta conservan los campos necesarios para DiscCard y el estado personal del usuario de sesión. Comments entrega texto, fecha y una proyección de Disc con los campos usados en su presentación.

**Ajuste justificado respecto a CAT-DISC-3b:** la auditoría del template real de comentarios en `DiscListView.vue` mostró que esa vista usa imagen, nombre, fecha, artista/país, género y comentario; no usa agregados musicales ni estado de Favorite/Pending. El tipo `DiscListCommentItem.disc` se estrechó a `DiscListCommentDiscProjection` para que la ruta no exponga datos personales o agregados innecesarios. Las tarjetas de los otros cinco modos mantienen la proyección completa aprobada. No cambia ningún contrato legacy.

La ampliación opcional de métodos propietarios para desempate/orden/proyección solo se activa desde estos readers. Las llamadas actuales de dos argumentos conservan su rama y orden previos. `GET /api/discs`, Rates, Comments, Favorites, Pendings, TopDiscs y HomeDiscs no se modificaron de forma observable; tampoco se alteraron Dashboard, WordPress, ni otros consumers. No se cambió ningún estado de TopDiscs.

La identidad observada por el frontend para consultar `all` sigue siendo una precondición pendiente antes de CAT-DISC-3e. No se alteró el frontend en esta tarea.

## Rendimiento y límites de validación

No se añadieron índices, caché, migraciones ni consultas de opciones. La query de comments carga `artist.country` en el nuevo modo para la proyección de pantalla; los agregados de cada owner siguen sus consultas existentes. No se realizó benchmarking ni `EXPLAIN ANALYZE`.

Docker local está disponible, pero el repositorio no aporta fixture/esquema de integración aislado para este endpoint. No se conectó a contenedores o bases existentes y no se presenta el SQL como validado en PostgreSQL. La omisión queda registrada; una prueba SQL requerirá preparar una base efímera explícita antes del release.

## Verificación

- Suites focalizadas de DTO, fachada, controller, readers, módulos y servicios propietarios: **13 suites, 108 tests aprobados**.
- Nest build mediante `pnpm run build`: aprobado; dependency gate: 493 archivos compilados y 26 módulos externos declarados.
- Typecheck equivalente (`tsc --noEmit --incremental false`): aprobado.
- ESLint focalizado con `--no-fix`: aprobado.
- Structural gate: 43 módulos; 9 infracciones históricas, **0 nuevas**.
- Type-safety gate: 5 infracciones históricas, **0 nuevas**.
- `git diff --check`: aprobado.
- `pnpm run build` y `pnpm exec jest` terminaron correctamente. Otras ejecuciones de `pnpm run`/`pnpm exec` fallaron intermitentemente con `ERR_SQLITE_ERROR: unable to open database file`; el Nest build, typecheck, ESLint focal y quality gates se completaron con los ejecutables/scripts locales directos.
- PostgreSQL aislado: no ejecutado; ver limitaciones de arriba.

## Estructura relevante

- `src/catalog/discs/list/`: fachada, DTO, tipos, mappers y specs.
- `src/community/common/types/disc-list-reader-criteria.ts`: criterios y contratos internos de lectura.
- `src/community/{rates,comments,favorites,pendings}/disc-list/`: adaptadores de lectura owner.
- `src/catalog/discs/discs.controller.ts` y `discs.module.ts`: ruta y providers del módulo Catalog.
- Servicios/módulos owners: extensión opcional de lectura estable y exports mínimos.

## Pendiente

- **CAT-DISC-3d:** completada; endpoint `GET /api/discs/list/options`, basado en universo completo por modo y usuario y filtros cruzados.
- **CAT-DISC-3e:** corregir identidad de solicitud `all` en frontend si procede y migrar solo `/disc-list`, adaptando los items discriminados.
- Preparar integración SQL con PostgreSQL efímero/aislado para validar las consultas nuevas antes de release; no conectar tests con instancias de desarrollo o producción.
