# CAT-DISC-3b — Contratos y arquitectura de DiscListService

**Estado:** completada en diseño y contratos de aplicación; CAT-DISC-3c y posteriores permanecen pendientes.
**Fecha:** 2026-10-28.
**Base:** auditoría CAT-DISC-3a del checkout frontend y estructura backend de este checkout.
**Alcance:** DTOs validados y tipos de respuesta; sin controller/rutas, SQL, queries Community nuevas, migraciones ni cambios de consumidores.

## Arquitectura aprobada

`DiscListService` será una fachada de lectura propiedad de `Catalog`, ubicada en `src/catalog/discs/list/`. Seleccionará uno de seis modos, coordinará la lectura del dominio y adaptará sus resultados a un contrato específico de `/disc-list`. No sustituirá `DiscsService`, `DiscCatalogService` ni `DiscTopService`, y no tendrá escrituras.

La fachada dependerá de APIs de lectura explícitas de los owners. No consultará repositorios Community ni implementará de nuevo sus reglas. La selección de orden/DTO/mapping de página pertenece a Catalog; elegibilidad, consulta de datos propios y escrituras pertenecen a cada módulo Community. No se ha creado aquí un servicio vacío ni se han exportado servicios para aparentar que la integración está lista.

| Modo         | Unidad y regla de elegibilidad                                                                                                                               | Owner del lector                        | Total                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------ |
| `all`        | Disc con fecha de lanzamiento hasta hoy; estado personal calculado para el usuario autenticado. `eligibility` permite `all`, `unvotedRate` o `unvotedCover`. | Catalog (`DiscCatalogService`)          | Discos                                     |
| `rates`      | Rate propio con `rate` no nulo.                                                                                                                              | Rates (`RatesService`; Rate musical)    | Registros Rate                             |
| `covers`     | Rate propio con `cover` no nulo.                                                                                                                             | Rates (`RatesService`; Rate de portada) | Registros Rate                             |
| `comments`   | Comment propio; el comportamiento actual no excluye `isDeleted`.                                                                                             | Comments (`CommentsService`)            | Registros Comment; repetir disco es válido |
| `favorites`  | Favorite propio.                                                                                                                                             | Favorites (`FavoritesService`)          | Registros Favorite                         |
| `pendientes` | Pending propio.                                                                                                                                              | Pendings (`PendingsService`)            | Registros Pending                          |

Rates, covers, comments, favorites y pendientes no garantizan un disco único por fila de resultado. No se inventa una unicidad que no está acreditada por las entidades/migraciones inspeccionadas. Se conserva el identificador de entrada (`entryId`) además del identificador de Disc para identificar filas repetidas y preservar la semántica de la unidad.

### Adaptaciones pendientes de CAT-DISC-3c

- `DiscCatalogService.findAll(dto, user)` ya cubre `all`, pero su respuesta legacy/default `limit=10` no constituye automáticamente el nuevo contrato. La fachada debe adaptarla sin modificar `GET /api/discs`.
- `RatesService` ya está exportado por `RatesModule`; necesita un lector acotado para el payload/orden nuevo si la firma actual no basta. Covers es otra vista del mismo owner y de la columna `Rate.cover`.
- `CommentsService`, `FavoritesService` y `PendingsService` implementan las lecturas actuales, pero sus módulos no exportan esos servicios. Añadir APIs explícitas de lectura de pantalla y exportación mínima en sus módulos propietarios, o contratos equivalentes, sin exponer repositorios a Catalog.
- Inspeccionar el grafo Nest al conectar `DiscModule` a Comments/Favorites/Pendings y Rates; evitar ciclos y dependencias hacia módulos de escritura. No se modificó ningún módulo Community en esta tarea.
- Las opciones dinámicas requieren lectores propios equivalentes a universo elegible por owner. No se calcularán desde la página limitada ni desde el catálogo global.

## Contrato HTTP preparado, aún no registrado

Las rutas previstas son:

```text
GET /api/discs/list
GET /api/discs/list/options
```

Ambas se autenticarán con `@Auth()` y obtendrán el usuario con `@GetUser()`. No se acepta `userId` en DTO. No se ha agregado ninguna ruta al controller; `GET /api/discs`, sus DTOs y consumidores permanecen intactos. Al registrar las nuevas rutas en CAT-DISC-3c/3d, deben declararse antes de `@Get(':id')` en `DiscsController` (o usar controller con path `discs/list`) para evitar captura dinámica.

## DTO del listado

Implementado en `src/catalog/discs/list/dto/disc-list-contracts.dto.ts` como `DiscListQueryDto`:

| Campo                  | Contrato                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                 | Requerido: `all`, `rates`, `covers`, `comments`, `favorites`, `pendientes`. Valor desconocido: HTTP 400 por `ValidationPipe`.                                                                                                                            |
| `query`                | Texto opcional; búsqueda de disco/artista. Los lectores deben preservar el significado existente y documentado en 3a.                                                                                                                                    |
| `dateRange`            | Dos fechas calendario ISO `YYYY-MM-DD`, inclusivas, válidas y en orden ascendente. Fecha imposible, rango parcial o invertido: 400.                                                                                                                      |
| `countryId`, `genreId` | UUID versión 4 opcionales; el nuevo contrato no añade aliases por nombre. Inválidos: 400.                                                                                                                                                                |
| `eligibility`          | Solo `all`, `unvotedRate` o `unvotedCover`, y solo en modo `all`; ausente equivale a `all`.                                                                                                                                                              |
| `sort`                 | Clave semántica enumerada, nunca expresión SQL. Validada contra una allowlist por modo. Ausente usa orden predeterminado estable del modo.                                                                                                               |
| `offset`               | Entero `>= 0`, default `0`; offset conserva la paginación existente por desplazamiento.                                                                                                                                                                  |
| `limit`                | Entero de `1` a `100`, default `20`. El máximo sigue la convención existente de límite 100 usada por Rates Artist Summary; permite hasta cinco páginas de la carga actual y no altera consumidores legacy (el endpoint nuevo aún no tiene consumidores). |

Orden predeterminado por modo: `releaseDateDesc`, después nombre de artista ascendente y desempate por Disc ID ascendente para `all`, rates, covers, favorites y pendientes; en comments se prioriza fecha de comentario descendente, después release date descendente, y finalmente Comment ID. Cualquier `sort` solicitado conserva un orden total y añade los desempates estables del modo. Para los modos de evento, el identificador estable de evento es `entryId`.

Las claves semánticas admitidas se definen en el enum `DiscListSort`: release date asc/desc, artist name asc, disc name asc, createdAt asc/desc, myRate asc/desc, myCover asc/desc, average rate asc/desc, average cover asc/desc, vote count desc y comment count desc. La tabla del DTO restringe cada clave a sus modos válidos. Si frontend requiere otro orden que usaba el legacy, se añadirá como clave semántica tras revisar el consumidor; no se aceptará SQL libre.

`totalItems` es el total de unidades del modo (no siempre discos), `totalPages = ceil(totalItems / limit)`, `currentPage = floor(offset / limit) + 1`; cero resultados produce `totalPages=0`, `currentPage=1`; un offset fuera de rango produce página vacía y total calculado. Página y total pueden observar instantes distintos ante escrituras concurrentes. Offset no es snapshot/cursor.

## Tipos de respuesta del listado

Definidos en `src/catalog/discs/list/disc-list.types.ts`. El `DiscListResponse` conserva el envelope `{ totalItems, totalPages, currentPage, limit, data }` observado en los listados. Su unión tipada se discrimina por `itemType` en cada fila; la solicitud determina el modo y no se repite:

```json
{
  "totalItems": 1,
  "totalPages": 1,
  "currentPage": 1,
  "limit": 20,
  "data": [
    {
      "itemType": "comment",
      "entryId": "comment-uuid",
      "comment": "Texto",
      "createdAt": "2026-10-01T12:00:00.000Z",
      "disc": { "id": "disc-uuid" }
    }
  ]
}
```

Cada modo no-comment devuelve una proyección de tarjeta con `itemType` (`disc`, `rate`, `cover`, `favorite` o `pending`) y `entryId`. Conserva datos necesarios para DiscCard: identidad/nombre/imagen/fecha/enlace/EP/debut; artista y país (`id`, `name`, `isoCode`); género (`id`, `name`, `color`); medias, `voteCount`, `commentCount`, `userRate`, `favoriteId`, `pendingId`. Relaciones/metadatos nullable se expresan con `null`; no se envían arrays completos de Community ni objetos User.

Comments devuelve un `DiscListCommentItem` con `Comment.id`, texto y fecha de creación, junto con una proyección `disc` para la tarjeta. Por ello puede repetir el mismo Disc en varias filas; `totalItems` cuenta Comments. Para el resto `entryId` es el ID de Rate/Favorite/Pending y `id` sigue siendo Disc ID; en `all`, `entryId` es Disc ID.

No se copian los envelopes actuales de cada endpoint Community ni se cambian esos endpoints. La adaptación al componente de tarjeta corresponde al frontend de CAT-DISC-3e, junto a la migración exclusiva de `/disc-list`.

## Contrato de opciones

`DiscListOptionsQueryDto` reutiliza `mode`, `query`, `dateRange`, `countryId`, `genreId` y `eligibility`. No tiene `offset`, `limit` ni `sort`; los parámetros extra, incluido `userId`, se rechazan por whitelist.

Respuesta `DiscListOptionsResponse`:

```json
{
  "countries": [{ "id": "uuid", "name": "Norway", "isoCode": "NO" }],
  "genres": [{ "id": "uuid", "name": "Black Metal", "color": null }]
}
```

`countries` y `genres` son arrays (vacíos si no hay resultados), ordenados establemente por nombre e ID, sin contadores. El modo se conoce por la solicitud y no se repite en la respuesta. Las opciones provienen del conjunto completo elegible del modo/usuario; no de la página de 20. Countries aplica todos los criterios salvo `countryId`; genres aplica todos salvo `genreId`. La selección omitida es deliberada para el crossfilter. Las opciones se calculan con el owner que conoce la elegibilidad (y para `all`, Catalog), no con tablas Community consultadas desde Catalog.

## Identidad y seguridad

- `@Auth()` exige cualquier usuario con sesión válida; no hay rol especial para lectura.
- La identidad de lectura sale únicamente de `@GetUser()`/JWT. `userId` arbitrario está prohibido por contrato y whitelist.
- Rate/Comment/Favorite/Pending son datos personales del usuario autenticado; `all` también contiene estado personal (`userRate`, `favoriteId`, `pendingId`).
- Cada owner limita la elegibilidad y las proyecciones personales por el principal recibido. No se usa identidad de query string.
- Solicitud sin sesión: 401. La ruta no impone un rol específico; 403 solo aplicaría si una política de autorización posterior lo exigiera. No convertir errores 401/403 a página/opciones vacías.
- Respuestas y options son privadas: no cache compartida/CDN. Cualquier caché futura debe variar por identidad/generación de sesión y filtros completos o invalidarse al cambiar sesión.
- Precondición de CAT-DISC-3e: corregir identidad de consulta del modo `all` observada por CAT-DISC-2f antes de cambiar el transporte de frontend; no modifica Identity global.

## Gates y compatibilidad

`GET /api/discs` y los endpoints Community no se modifican. No se han creado rutas que parezcan operativas, consultas SQL, agregaciones de Community, migraciones, índices, frontend ni cambios de WordPress/TopDiscs/Dashboard. Los tests cubren DTOs/validadores y asignabilidad de los tipos de respuesta; no simulan una implementación productiva inexistente.

### Verificación CAT-DISC-3b (2026-10-28)

- Suite DTO/contratos y suite existente `DiscsController`: **2 suites, 23 tests aprobados**.
- `pnpm run quality:typecheck`: **0 errores, 0 nuevos**.
- `pnpm run build`: aprobado; runtime dependency gate detecta 486 archivos compilados y 26 módulos runtime declarados.
- ESLint focal con `--no-fix` en los tres archivos nuevos: aprobado.
- Tests del structural gate y type-safety gate: aprobados.
- Gates actuales: **9 violaciones estructurales históricas** y **5 hallazgos de tipado seguro históricos**, ambos con **0 nuevos**, 0 obsoletos y 0 duplicados. Se conservan sin modificar; rutas registradas en los baselines existentes bajo migrations/test, fuera de `src/catalog/discs/list/`.
- `git diff --check` y enlaces Markdown locales modificados: aprobados.

## Trabajo pendiente

- **CAT-DISC-3c:** implementar lectores owner acotados, adaptación de todos los modos, fachada, ruta de listado, unit/controller tests, orden estable y comparación contra contratos actuales.
- **CAT-DISC-3d:** options por modo/usuario y crossfilter de universo completo; decidir/verificar consultas con tests aislados y sin producción.
- **CAT-DISC-3e:** corregir identidad de sesión del frontend `all` antes de migrar transporte y adaptar la respuesta discriminada a DiscCard.
- Antes de conectar DI, confirmar dependencias acíclicas y decidir los exports mínimos de módulos Community. La lectura de options no debe implementarse en este corte.

### Decisiones pendientes de aprobación/producto

1. Confirmar la allowlist de sort contra los controles concretos que expondrá la vista durante CAT-DISC-3e. El contrato actual excluye expresiones legacy libres.
2. Confirmar con producto que el máximo nuevo de `limit=100` cubre exportaciones/lotes previstos para `/disc-list`; ningún consumidor existente se traslada antes de verificarlo.
3. Confirmar semántica observable de `all` si se necesita más elegibilidad que `all|unvotedRate|unvotedCover`; no trasladar alias/gramática legacy sin revisar 3a.
