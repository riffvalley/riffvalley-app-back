# CAT-DISC-4c.1a — Auditoría de portadas, enlaces y elegibilidad

**Estado:** auditoría documental; sin cambios de código ni de contrato.
**Fecha:** 2026-10-28.
**Siguiente paso posible:** CAT-DISC-4c.1b, implementación posterior sujeta a revisión y aprobación de esta auditoría.

## Resumen

`Disc` concentra actualmente una sola URL de imagen (`image`) y una sola URL de escucha (`link`), ambas independientes y nullable. No hay entidades de proveedor asociadas al disco ni campos `spotifyAlbumId`/`bandcampAlbumId`. `verified` es un booleano de verificación/enriquecimiento usado por el mantenimiento automático; no equivale a publicación. Las búsquedas automáticas no crean discos: actualizan los discos ya existentes cuyo lanzamiento ha llegado y cuyo `link` está vacío o contiene uno de dos mensajes de estado.

La API nueva `GET /api/discs/list` devuelve discos sin imagen en sus seis modos; no aplica elegibilidad por medios. Sus totales y opciones tampoco excluyen esos discos. La vista frontend principal sí descarta las tarjetas sin imagen después de recibir la página, lo que deja huecos y hace que la cantidad visible no corresponda con `totalItems`. La tarjeta individual ya tiene una imagen local de fallback, pero la vista no llega a montarla para discos sin imagen.

La regla propuesta es viable como predicado SQL aplicado en resultados, counts y opciones de cada modo. Debe definirse una vez en una utilidad de predicado de Catalog reutilizable por los lectores, manteniendo la propiedad de las queries y sus relaciones en cada dominio. No se debe filtrar una página ya cargada ni alterar endpoints legacy.

## Modelo y almacenamiento

| Elemento | Ubicación | Almacenamiento y significado |
|---|---|---|
| Disco | `src/catalog/discs/entities/disc.entity.ts` (`Disc`) | `image: text nullable`, `link: varchar(255) nullable`, `verified: boolean nullable` con valor inicial `false`; sin entidad externa ligada al disco. |
| Artista y género | `src/catalog/artists/entities/artist.entity.ts`, `src/catalog/genres/entities/genre.entity.ts` | Relaciones de catálogo; no son referencias de proveedor musical. `Artist` puede tener su propia imagen, distinta de la portada del disco. |
| Puntuación de rate/cover | `src/community/rates/entities/rate.entity.ts` (`Rate`) | La puntuación `cover` describe la valoración comunitaria de una portada; no almacena la imagen. |
| Spotify público | `src/integrations/spotify-integration/api/spotify-public-api.service.ts` | Respuestas efímeras de API: id/nombre/enlace/portada del álbum; el resolver no persiste por sí solo. |
| Credenciales/API Spotify | `src/integrations/spotify-integration/api/spotify-client-credentials.service.ts` | Token temporal en memoria y credenciales de configuración; no vincula un disco a un álbum. |
| Playlist Spotify Riff Valley | `src/editorial/playlists/spotify-playlists/` y entidades de integración asociadas | Dominio distinto de playlists/listas del proyecto y sus tracks. No representa el enlace de escucha de un `Disc`. |

No existe estado explícito de publicación del disco en `Disc`. El calendario/listados generales usan principalmente `releaseDate` para limitar discos futuros. `verified` tampoco debe interpretarse como publicado/no publicado.

`CreateDiscDto` y `CreateDiscWithArtistDto` aceptan `image` como string opcional (sin validación de URL) y `link` como URL opcional (`@IsUrl`, hasta 255 caracteres). La columna permite `null`; una omisión al crear deja el campo sin valor. `UpdateDiscDto` hereda el DTO parcial: omitir el campo preserva el valor; enviar `image: ""` es admisible como string vacío; enviar `null` no pasa los validadores actuales. El importador manual guarda `image: ''` en ciertos registros. El importador Excel y otros flujos deben distinguirse por su payload; no se encontró normalización global de URLs en la entidad.

La consulta semanal de enriquecimiento selecciona `image IS NULL OR image = ''`. `updateImage` actualiza directamente la columna, sin comprobar formato, disponibilidad remota o existencia del disco. La edición de calendario permite modificar `image` manualmente. Por tanto, hay diferencia entre `NULL`, cadena vacía y URL no vacía; las listas actuales las devuelven tal cual.

## Spotify

### Resolución manual/de consulta

1. `GET /api/discs/spotify/album?albumName=…&artistName=…` delega en `DiscsService.resolveSpotifyAlbum`.
2. `SpotifyPublicApiService.resolveAlbum` llama a Spotify Search por álbum y artista y toma solo el primer resultado.
3. Devuelve `spotifyId`, `name`, `listenUrl` y `coverUrl`. `listenUrl` y `coverUrl` son nullable según la respuesta; la imagen usa `images[0]`.
4. Si no hay resultados, el backend devuelve `404 Álbum no encontrado en Spotify`. Errores del proveedor se convierten en `502` (y un 404 de Spotify en NotFound).
5. La ruta no escribe el `Disc`. El cliente puede usar los datos para completar/editar un disco, pero la persistencia posterior es una operación separada.

`GET /api/discs/spotify/album/:spotifyAlbumId` consulta detalles y devuelve también URL, portada, artistas, fecha y pistas; tampoco persiste. `GET /api/discs/:id/spotify-tracks` consulta tracks según nombre de disco/artista local; no requiere ni guarda un ID Spotify en `Disc`.

### Enriquecimiento automático

`DiscLinkMaintenanceService` corre cada día a las 06:00, zona `Europe/Madrid`. También está disponible mediante `check-spotify` standalone. Selecciona todos los discos ya publicados por fecha (`releaseDate <= hoy`) cuyo `link` sea `NULL`, `''`, `No se encontró el álbum` o `Error al realizar la búsqueda`. No selecciona un disco con link ya presente aunque falte portada.

Con Client Credentials busca el álbum en Spotify con consulta estricta `album:<normalizado> artist:<normalizado>`, límite de un resultado. Acepta directamente el primer álbum estricto, sin validar que el artista devuelto coincida. Si hay resultado guarda `external_urls.spotify`, la primera imagen o `null`, marca `verified = true` y guarda el disco.

Si no hay resultado estricto, busca Bandcamp. Si Bandcamp no devuelve coincidencia válida (o falla), intenta búsqueda libre en Spotify y comprueba igualdad del nombre normalizado de algún artista. Con coincidencia guarda enlace, primera imagen o `null`, `verified = true`. Si no coincide, registra `No se encontró el álbum` en `link`; ante errores agotados registra `Error al realizar la búsqueda`.

Las búsquedas sin coincidencia/errores no borran `image`; solo escriben mensajes en `link`. En cambio, los dos caminos Spotify que encuentran álbum asignan `disc.image = album.images?.[0]?.url || null`: podrían borrar una portada anterior si la respuesta trae lista de imágenes vacía. La tarea diaria repetirá intentos porque ambos marcadores están incluidos en la selección. Los links válidos no se vuelven a buscar automáticamente.

## Bandcamp

No se encontró API oficial ni entidad/servicio persistente de Bandcamp. La única búsqueda automática identificada vive como fallback en `DiscLinkMaintenanceService.searchBandcamp` y hace `fetch` de `https://bandcamp.com/search?q=…&item_type=a`, parseando HTML con Cheerio.

Toma el primer `li.searchresult`, su primer enlace y su primer `img`; transforma el sufijo del nombre del recurso a `_10` como supuesto tamaño de alta resolución y elimina query string del enlace. Registra nombre de álbum y artista, pero no los compara con los valores buscados: la validación efectiva es que haya enlace en el primer resultado. No consulta después la página del álbum ni comprueba disponibilidad real de la portada. Errores HTTP/conexión continúan hacia búsqueda libre Spotify.

Al encontrar Bandcamp guarda ese enlace como `Disc.link`, pone `verified = true` y usa la imagen extraída; si Bandcamp no trae imagen conserva `disc.image` existente por `bandcampResult.image || disc.image`. No existe una búsqueda automática independiente por discos con link Bandcamp y sin imagen, porque el mantenimiento solo busca links ausentes/marcadores. Los enlaces manuales se guardan en el mismo campo `link`; no llevan etiqueta de plataforma.

## Precedencia y conservación

El modelo no guarda fuente, URL por plataforma, fecha de actualización, resultado pendiente ni historial. `link` puede ser Spotify, Bandcamp u otra URL manual; no existe prioridad consultable entre ellas. No se distinguen enlaces pendientes salvo por los dos textos centinela almacenados en `link`.

| Escenario | Comportamiento encontrado |
|---|---|
| Link Spotify y portada Spotify | Se guardan en `link` e `image` durante el mantenimiento. |
| Link Bandcamp con portada | Reemplaza `link` y actualiza `image`. |
| Link Bandcamp sin portada | Reemplaza `link` y conserva imagen anterior, si la había. |
| Link manual sin imagen | Se conserva si ya es válido; el cron no lo selecciona para enriquecer portada. |
| Imagen manual sin link | El cron puede buscar porque link falta; resultado Spotify puede sustituir la imagen manual; resultado Bandcamp solo la sustituye si scrapeó una imagen. |
| Búsqueda automática fallida | Escribe mensaje en `link`; conserva `image`; repetirá en futuros cron diarios. |
| Búsqueda posterior exitosa | Sustituye link y pone portada de fuente encontrada, con la excepción de fallback Bandcamp sin imagen que conserva la previa. |

### Defectos/riesgos observables en la integración

- Las búsquedas Spotify aceptan el primer resultado estricto sin validar artista, lo que puede asociar un álbum incorrecto.
- La búsqueda Bandcamp no valida nombre/artista pese a extraerlos; puede aceptar un resultado ajeno.
- Una coincidencia Spotify válida sin imagen sobrescribe una portada previa con `null`.
- Los estados de error/no encontrado se escriben en `link`, campo expuesto como si fuera URL y compartido con enlaces manuales; validaciones de URL en create/update no impiden que el cron persista esos mensajes.
- La elegibilidad de actualización se basa solo en falta de link. No detecta discos con enlace válido pero sin imagen, por lo que el mantenimiento no los enriquece.
- No hay una validación de URL común ni comprobación de que una imagen remota responda; la disponibilidad real no se puede inferir del string.

Estos hallazgos justifican tareas acotadas de integración; no se han corregido en esta auditoría.

## Regla de elegibilidad

La propuesta es `hasCover || hasMusicLink`. Para evaluación de strings se recomienda definir presencia como `NULLIF(BTRIM(value), '') IS NOT NULL`. Esto excluye `NULL`, vacío y solo espacios, pero **no** demuestra que una URL esté bien formada, sea de música o responda. No se recomienda petición HTTP externa al listar.

| Portada | Enlace musical | Elegible |
|---|---|---|
| Sí | Sí | Sí |
| Sí | No | Sí |
| No | Sí | Sí |
| No | No | No |

En el modelo actual no se puede distinguir enlace musical válido de URL inválida, ni identificar la plataforma. La regla tal como está propuesta equivale a presencia de una cadena no vacía en `link`, incluidos mensajes centinela históricos si aún existen. La implementación deberá excluir expresamente los centinelas (`No se encontró el álbum`, `Error al realizar la búsqueda`) para que no cuenten como música. Esta decisión y la definición exacta de `hasMusicLink` siguen pendientes.

## Comportamiento actual de los seis modos

`GET /api/discs/list` enruta `all` a `DiscCatalogService`; `rates`/`covers` a `RatesService`; `comments` a `CommentsService`; `favorites` y `pendientes` a sus servicios Community. Los lectores preservan ownership: los modos comunitarios consultan entradas del usuario autenticado, y comments se basan en comentarios no nulos. No se identificó filtrado por imagen ni enlace en esos servicios.

| Modo | Universo actual relevante | Opciones, cuenta y paginación |
|---|---|---|
| `all` | Discos con fecha de lanzamiento no futura, filtros de búsqueda/fecha/país/género y elegibilidad opcional de rate. Incluye `image = NULL` y link vacío. | Países/géneros salen de consultas dinámicas sobre el universo filtrado; la cuenta y página de datos pasan por `DiscCatalogService`. |
| `rates` | Rates del usuario con `rate IS NOT NULL`; disco puede no tener medios. | Options cuentan universo de rates puntuados. Página y total tienen filtros equivalentes de dominio/usuario. |
| `covers` | Rates del usuario con `cover IS NOT NULL`; disco puede no tener medios. | Igual que rates, con `cover` como tipo de valoración. |
| `comments` | Comentarios del usuario con texto no nulo, agrupados como filas de comentario; varias filas pueden repetir el mismo disco. El disco puede no tener medios. | Options del usuario derivadas de sus comentarios; count cuenta comentarios, no discos únicos; orden estable termina en `comment.id`. |
| `favorites` | Favoritos del usuario; disco puede no tener medios. | Options derivadas de favoritos; count cuenta entradas de favorito; consulta y count aplican los filtros antes/después de paginar de forma equivalente. |
| `pendientes` | Pendings del usuario; disco puede no tener medios. | Options derivadas de pendings; count cuenta entradas de pending; filtros se aplican antes de paginar y en la query de count. |

Todos los servicios aplican filtros SQL antes de `take/skip` y calculan `totalItems` con una query de count que vuelve a aplicar filtros. El cambio de elegibilidad debe agregarse simétricamente a query de datos, count y options de cada modo. Filtrar en frontend o tras cargar una página rompería `totalItems`, `totalPages` y podría devolver páginas visualmente incompletas. Para `comments`, el predicado se aplica al disco de cada comentario pero los comentarios siguen siendo filas distintas; no deduplicar discos.

La options endpoint devuelve países y géneros dinámicos, omitido el filtro de la misma dimensión para ofrecer opciones alternativas. La regla debe estar en ambas queries de opciones, conservando el comportamiento de omisión cruzada. Los filtros `rates`/`covers` consideran solo la puntuación pertinente. Debe mantenerse el aislamiento de usuario para options, filas y totales.

`DiscCatalogService.findDailyCoverFeatured` exige portada explícitamente por el significado de “cover”; esa selección especializada no forma parte de los seis modos y no debe cambiarse por el OR de manera incidental. Tampoco se debe trasladar la regla a endpoints legacy.

## Impacto frontend observado

- `../riffvalley-app-front/src/modules/catalog/discs/presentation/views/DiscListView.vue` renderiza tarjetas con `discs.filter((d) => d.image)`. El filtro se ejecuta sobre la página recibida: elimina discos con null/vacío sin solicitar reemplazo y el contador/paginación siguen usando metadatos backend.
- `loadDiscList.ts` transforma `image: null` a `""`, sin perder el disco; `DiscCardComponent.vue` calcula `computedImage` como `props.image || defaultImage`, así que acepta el caso si se renderiza.
- La vista de comentarios conserva filas individuales y enseña comentario y metadatos del disco, pero renderiza siempre `<img :src="comment.disc?.image">` sin fallback ni `@error`; con `null`/cadena vacía puede mostrar un icono de imagen rota o un espacio vacío. Esto también debe contemplarse al adaptar el frontend. Otras vistas legacy y componentes tienen sus propios usos; no es necesario cambiarlos sin alcance confirmado.
- La tarjeta general incluye `link`; el disco con enlace y sin portada se puede mostrar usando la imagen fallback que ya implementa la tarjeta. Cambios mínimos posteriores: quitar el filtrado frontend por `image`, verificar render para `image: ""`, y mantener accesibles `link` y el fallback.
- Una URL no vacía pero rota todavía produce imagen rota hasta que haya manejo `@error` en esa tarjeta; esto es distinto de `image: null` y la regla de elegibilidad no debe afirmar disponibilidad remota.

## Casos límite

| Dato | Tratamiento actual | Tratamiento bajo elegibilidad recomendada |
|---|---|---|
| `image: null` | Incluido en API; omitido por tarjetas de DiscList. | No cuenta como cover; requiere link válido según definición pendiente. |
| `image: ''` / espacios | No normalizado; omitido por el frontend en valor vacío. | Considerar ausente con trim SQL. |
| URL de imagen inválida o caída | Se conserva/devuelve como string; no se verifica externamente. | La presencia de string bastaría salvo que se introduzca una validación local formal; no hacer fetch al listar. |
| Link Spotify válido sin imagen | Puede guardarse por mantenimiento; el list API lo devuelve, frontend omite tarjeta. | Elegible. |
| Link Bandcamp válido sin imagen | El fallback conserva imagen anterior o deja null; frontend omite si null. | Elegible. |
| Link de otra plataforma | Puede guardarse manualmente como URL en el campo genérico; no hay identificación de plataforma. | Elegible solo si `hasMusicLink` acepta URLs genéricas no vacías; decisión pendiente. |
| Link vacío / espacios | Vacío puede ser guardado en algunos imports; cron considera solo null/`''`, no espacios. | Ausente tras `BTRIM`. |
| URL malformada en `link` | DTO normal valida URL, pero imports, cron y valores históricos pueden eludirlo. | Presencia no equivale a link musical válido; centinelas deben excluirse. |
| Sin portada ni enlaces | API puede devolverlo; frontend lo omite por imagen. | No elegible. |
| Pendiente de enriquecimiento | No hay estado propio; null/vacío o centinelas en `link`; futuras fechas no entran al cron. | Si no tiene medio elegible se excluye, aunque la fecha futura no es equivalente a “no publicado”. |
| Datos manuales | Mismos campos `image`/`link`; no se etiqueta fuente. | Deben conservarse; no inferir plataforma ni autoridad de fuente. |
| Datos importados | Se usan los mismos campos; hay import manual con imagen vacía. | Evaluar por contenido normalizado; evitar borrar valores por fallos automáticos. |

## Recomendación arquitectónica

Definir una única expresión de elegibilidad reutilizable y aplicarla en SQL por cada lector, antes de ordenar/paginar, al count y a las queries de opciones. La forma provisional sería un helper de dominio/query en `src/catalog/discs/` que produzca el predicado `NULLIF(BTRIM(disc.image), '') IS NOT NULL OR (…)` y que los servicios propietarios apliquen sobre su alias `disc`.

No recomiendo filtrar en el mapper, en `DiscListService` después de recuperar páginas ni en el frontend como regla de dominio. Un servicio compartido que posea/reposicione las queries de Community movería ownership fuera de Rates, Comments, Favorites y Pendings. El compromiso es compartir la definición del predicado, mientras cada reader mantiene sus joins, filtros de usuario, multiplicidad/semántica, orden, paginación, count y options. Confirmar en diseño si un helper importado desde Catalog es el límite aceptable o si se acuerda una ubicación neutral común; no crear un repositorio o capa de consulta genérica.

Para `all`, añadir el mismo criterio a `findDiscList`, count y las dos consultas de opciones. Para Community, propagarlo por `RatesService`, `CommentsService`, `FavoritesService`, `PendingsService` y sus queries de options. Las opciones dinámicas deben describir el universo de registros elegibles en el modo actual, respetando filtros de usuario/tipo y la omisión de la dimensión consultada.

### Contract finding

**Current behavior:** las seis vistas backend pueden incluir discos sin portada y cuentan esos registros; la página principal frontend elimina las tarjetas después de paginar.

**Problem:** el listado visible puede tener menos resultados que indica `totalItems`, con páginas visualmente incompletas.

**Impact:** backend + frontend.

**Options:** preservar compatibilidad; refactorizar internamente; cambiar el universo contractual del listado; coordinar un refactor backend/frontend.

**Recommendation:** acordar formalmente la nueva elegibilidad OR, aplicarla en consultas y metadatos backend y retirar el filtro visual por imagen de DiscList de forma coordinada. Mantener `image: null` en payloads y usar el fallback existente de `DiscCardComponent`.

**Blocks the current task:** No; es hallazgo y recomendación, sin cambio de producción en esta auditoría.

## Decisiones pendientes

1. Definir qué es `hasMusicLink`: cualquier URL no vacía o URLs musicales permitidas. El esquema no etiqueta plataforma.
2. Excluir mensajes centinela históricos de la elegibilidad; considerar cómo detectar otros valores no URL sin una migración ni consulta externa.
3. Confirmar que la regla OR aplica también a `comments`, cuyos elementos son comentarios, no discos únicos, y preservar recuentos repetidos.
4. Decidir ubicación neutral/coupling del helper SQL compartido manteniendo ownership Community.
5. Decidir si el cron puede reemplazar `link` manuales y portadas manuales al resolver; hoy solo trabaja links ausentes/centinela, pero los resultados Spotify pueden reemplazar una imagen existente.
6. Definir si errores/no encontrado deben seguir codificados como texto en `link`; no es necesario cambiarlo para el filtro si se excluyen expresamente.

## Plan de implementación posterior: CAT-DISC-4c.1b

1. **CAT-DISC-4c.1b.1 — Corregir enriquecimiento de metadatos:** validar coincidencia artista/álbum en Spotify estricto y Bandcamp; conservar portada anterior ante resultado sin imagen; decidir fuente y prioridad sin borrar datos válidos; ampliar caracterización unitaria.
2. **CAT-DISC-4c.1b.2 — Formalizar elegibilidad:** decidir semántica de enlace, tratamiento de cadenas vacías/espacios, URLs inválidas y centinelas; añadir definición única reutilizable.
3. **CAT-DISC-4c.1b.3 — Aplicar al modo `all` y opciones:** filtrar en SQL antes de paginar; alinear count y ambas opciones dinámicas.
4. **CAT-DISC-4c.1b.4 — Aplicar a modos Community:** Rates, Covers, Comments, Favorites y Pendings; alinear opciones, totals, paginación, orden, multiplicidad de comentarios y aislamiento de usuario.
5. **CAT-DISC-4c.1b.5 — Ajuste coordinado frontend:** dejar de descartar por ausencia de imagen en DiscList; comprobar fallback de tarjeta y presentar enlaces existentes; decidir separadamente el manejo de URL de imagen rota.
6. **CAT-DISC-4c.1b.6 — Regresión PostgreSQL aislada:** fixture con las cuatro combinaciones de la tabla, null/vacío/espacios/centinelas, múltiples comentarios por disco, filtros, pages y options; ejecutar únicamente en base aislada/autorizada. No consultar producción ni sincronizar proveedores.

Estas subtareas son propuestas, no autorización de implementación.

## Rutas auditadas

- Backend: `src/catalog/discs/entities/disc.entity.ts`, DTOs de creación/actualización, `write/`, `spotify/`, `enrichment/`, `maintenance/`, `catalog/disc-catalog.service.ts`, `list/disc-list.service.ts` y los lectores/servicios `src/community/{rates,comments,favorites,pendings}/`.
- Integración: `src/integrations/spotify-integration/api/` y `src/catalog/lastfm/` (enriquecimiento de imágenes semanal vía Last.fm, separado del resolver Spotify/Bandcamp).
- Frontend leído en el repositorio hermano: `src/modules/catalog/discs/presentation/views/DiscListView.vue`, `application/loadDiscList.ts`, `types/discList.ts`, `src/components/DiscCardComponent.vue` y lista de comentarios.
