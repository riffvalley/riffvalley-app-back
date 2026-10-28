# MEDIA-1 — Auditoría integral de búsqueda y matching musical

**Estado:** auditoría documental completada el 2026-10-28. No se modificó código, esquema ni datos.

**Alcance:** búsquedas del catálogo de artistas y discos, consumidores de solicitudes/importaciones, Spotify, Bandcamp, enriquecimiento, persistencia, índices declarados y pruebas existentes. La auditoría no ejecutó proveedores, jobs, pruebas ni consultas a una base de datos.

## 1. Resumen ejecutivo

El backend no tiene un único mecanismo de búsqueda musical. Artistas usa una clave `nameNormalized` y una normalización TypeScript propia en las búsquedas de catálogo; DiscList, calendario, importaciones, solicitudes y sugerencias usan comparaciones diferentes. La búsqueda de discos no comparte la clave normalizada de artistas de forma consistente, y ningún flujo interno implementa similitud difusa de títulos.

El enriquecimiento automático diario reside actualmente en `src/catalog/discs/maintenance/disc-link-maintenance.service.ts`. Spotify consulta un solo resultado por búsqueda. Su rama estricta persiste el primer resultado sin comprobar artista, título o tipo de lanzamiento; por eso puede guardar un single homónimo u otro lanzamiento como álbum. La rama de fallback comprueba únicamente el artista. La portada del primer resultado se guarda como `null` si Spotify no devuelve imagen, incluso si había una portada previa. Bandcamp es scraping HTML, no una API confirmada: selecciona el primer resultado con enlace y no compara los nombres que sí extrae.

Las migraciones muestran que se habilitaron `unaccent` y `pg_trgm` y se creó un índice GIN de trigramas para `artist.name_normalized`; una migración posterior lo elimina y crea un índice B-tree con el mismo nombre. Esto describe el historial del repositorio, no el estado de una base concreta. No se midieron planes ni latencias.

No hay pruebas PostgreSQL ejecutadas en esta auditoría. Los tests existentes son mayoritariamente unitarios con repositorios/proveedores simulados y no cubren falsos positivos de single, validación entre candidatos, las equivalencias Unicode indicadas ni la conservación de portada frente a una respuesta Spotify sin imagen.

## 2. Alcance y metodología

Se inspeccionaron estáticamente entidades, controllers, DTOs, servicios, QueryBuilders/SQL, módulos, jobs, migraciones, specs unitarios y documentación existente. Las afirmaciones de comportamiento vigente citan código; las referencias de cobertura citan specs; las referencias sobre el historial de esquema citan migraciones. Se cotejaron además `roadmap/integrations/integrations.md` y los documentos Spotify. No se consultó producción ni una base local de propósito no confirmado; no se hicieron llamadas externas ni se invocaron jobs.

**Limitación de rendimiento:** no se conectó PostgreSQL y no se generaron `EXPLAIN (ANALYZE, BUFFERS)`. Por tanto, no se reportan tiempos, cardinalidades ni estado efectivo de extensiones/índices.

## 3. Modelo y ownership observado

| Dato | Modelo/campo | Observación |
|---|---|---|
| Disco | `src/catalog/discs/entities/disc.entity.ts` — `Disc` | `name`, `image`, `link`, `verified`, `ep`, `releaseDate` y relaciones con artista/género. No hay ID externo de álbum ni columna de fuente/procedencia observada. `ep` permite distinguir EP; no existe tipo LP explícito. |
| Artista | `src/catalog/artists/entities/artist.entity.ts` — `Artist` | Conserva `name` y una clave `nameNormalized`/`name_normalized` no nula. La clave sirve a búsquedas, no reemplaza el valor original. |
| Request | `src/community/requests/entities/disc-request.entity.ts` | Guarda nombres de artista/disco y datos declarativos, incluido `ep`; no guarda una coincidencia de proveedor. La aprobación crea el disco sin resolver duplicado de título. |
| Sugerencia genérica | `src/product/suggestions` | Título/descripción de texto; no es un selector ni un lookup de entidades Artist/Disc. |
| Novedad editorial | `src/editorial/national-releases` | Mantiene nombres de artista/disco como datos editoriales y busca sugerencias de Disc con igualdad `LOWER`, sin matching Unicode. No es una integración de música. |
| Integración Spotify | `src/integrations/spotify-integration` | Cliente y modelos de respuesta externos. La URL/imagen seleccionadas terminan en `Disc.link` y `Disc.image` desde Catalog/Discs. |
| Integración Bandcamp | `DiscLinkMaintenanceService` | Scraper privado dentro de Catalog/Discs; no se encontró cliente/API Bandcamp separado. |

`Disc.image`/`Disc.link` admiten ausencia en el flujo y la consulta (se seleccionan `NULL`, cadena vacía o centinelas). No existe un campo de estado de publicación identificado en `Disc`; la elegibilidad de publicación/visibilidad pertenece a lecturas y filtros, no a un estado nuevo de matching. `verified` es booleano nullable y no identifica proveedor ni origen manual. El código observado no implementa una tabla de enlaces pendientes/resolución externa.

Las URL de Spotify y Bandcamp se toman de la respuesta externa. Spotify usa `external_urls.spotify`; Bandcamp toma `href` del primer resultado y quita su query string. Las búsquedas consultadas no generan un enlace Spotify a partir de un ID local. No se encontró validación de disponibilidad externa al listar.

## 4. Inventario de búsquedas internas y consumidores

| Función | Ruta/consumidor | Implementación y comparación | Normalización, orden y página | Tests / notas |
|---|---|---|---|---|
| Buscar artista por nombre | `GET /api/artists/search/by-name`; consumidores en `src/services/artist/artist.ts` | `ArtistSearchService.findByName`: `artist.name_normalized LIKE '%q%'`; carga discos asociados después de resolver artistas. | `normalizeForSearch` en query; orden `artist.name ASC`; no pagina y carga todo el resultado. `%`/`_` de entrada no están escapados. Entrada de espacios que normaliza a vacío puede convertirse en `LIKE '%%'`. | `artist-search.service.spec.ts`, helper de normalización. Test del caso Björk documenta ausencia de match cuando la clave equivalente no está normalizada como espera; no hay suite de equivalencias especiales completa. |
| Listado de artistas para administración | `GET /api/artists/management`; frontend de gestión y consumidor de `services/spotify/festivalPlaylists.ts` | `ArtistManagementService.findAllForManagement`, filtro `nameNormalized LIKE`; `ArtistOrphansService.countForManagement` repite el filtro en el conteo de huérfanos. | `normalizeForSearch`; orden `updatedAt DESC`; `limit/offset`, filtros género y needsReview; el count recibe los mismos filtros de búsqueda. | Specs de management/orphans; mocks de TypeORM. |
| Resolver nombres exactos de artista | `ArtistCatalogService.findExactNameMatches`, usado por `RatesArtistLastfmService` | Normaliza la entrada y candidatos, consulta `nameNormalized IN`; solo devuelve una coincidencia si el nombre tiene un único candidato. | Coincidencia exacta de clave; no fuzzy. Preserva ambigüedad como no resuelta. | Specs de ArtistCatalog y mapping Last.fm. |
| Crear disco con texto de artista | `DiscWriteService.createWithArtist` | Busca `Artist.name ILike(artistName)` como igualdad `ILIKE`; resuelve por país si hay ambigüedad, en otro caso puede crear Artist y Disc. | No utiliza la clave normalizada para lookup; no búsqueda de título ni verificación de disco duplicado en este flujo. | Specs de write; no cubren todo el conjunto de caracteres especiales/ambigüedad. |
| Crear/editar disco por IDs | Rutas de creación y edición en `DiscsController` / `DiscWriteService` | Recibe `artistId`/`genreId` y modifica los campos indicados; no es una búsqueda de texto ni una detección de duplicado de título. | IDs; el nombre del disco puede editarse sin una comparación difusa de duplicados observada. | Specs de controller/write. |
| Listado de discos / `all` | `GET /api/discs/list` y legacy `GET /api/discs`; `DiscCatalogService` | `disc.name ILIKE '%query%' OR artist.name_normalized ILIKE '%query%'`. | Query sin normalizador común; página/count aplican filtros; sort solicitado o `releaseDate DESC, artist.name ASC`; tie-break por ID solo cuando se solicita. | `disc-catalog.service.spec.ts` caracteriza expresión, `%query%`, filtro y paginación; no prueba equivalencia Unicode real en PostgreSQL. Legacy no se modifica en MEDIA-1. |
| Calendario de discos | rutas de calendario de `DiscsController`; `DiscCalendarService` | Misma forma general: título original `ILIKE` o `artist.name_normalized ILIKE`. | El término no pasa por `normalizeForSearch`; página/count y orden por fecha ASC, artista ASC. | Specs del calendario comprueban SQL armado, no comportamiento Unicode del motor. |
| DiscList `rates`, `covers`, `comments`, `favorites`, `pendientes` | `GET /api/discs/list`; lectores propietarios de Community; filtros compartidos en `src/community/common/helpers/apply-disc-list-filters.ts` | Predicado `disc.name ILIKE` o `artist.name ILIKE` sobre valores originales. Cada lector conserva sus relaciones/aislamiento. | Sin clave normalizada ni NFD en el filtro común; helper se aplica a resultados, total y opciones de los lectores nuevos. Los sort/paginación pertenecen al reader correspondiente. | Specs por lector y de opciones DiscList; SQL probado con mocks y existe spec PostgreSQL aislado, no ejecutado aquí. |
| Options de DiscList | `GET /api/discs/list/options` | Opciones dinámicas de países/géneros usan los readers y filtros compartidos según modo; no son una búsqueda de entidades independiente. | Deben reflejar el conjunto filtrado del modo; la normalización actual se hereda del filtro del reader. | Specs de opciones; no se validaron planes/Unicode en esta auditoría. |
| Importación manual | `src/catalog/import/manual/import/catalog-import.service.ts` (`CatalogImportService`) | Busca Artist por `nameNormalized` calculado desde el nombre entrante; duplicado Disc por `artistId` + `name ILike(discName.trim())`. | Igualdad textual case-insensitive para título; política de duplicado distinta de Excel. No compara `ep`/fecha como identidad. | `src/catalog/import/manual/import/__tests__`; sin matriz de ediciones y homónimos. |
| Importación Excel | `src/catalog/import/excel/import/excel-import.service.ts` (`ExcelImportService`) | Resuelve Artist por clave normalizada (y `countryId` cuando viene); duplicado Disc por `artistId`, igualdad exacta de `name` y fecha si se aportó. | Sin normalización de título en la condición encontrada; no incorpora `ep` en identidad. | `src/catalog/import/excel/import/__tests__/excel-import.service.spec.ts`; el comportamiento difiere del import manual. |
| Crear/editar solicitud | `RequestsService` | Guarda cadenas aportadas. Al aprobar resuelve/crea Artist por clave normalizada y crea Disc a partir de request sin lookup previo de título duplicado. | Normalización Artist exacta; no búsqueda de candidato de álbum. | Specs de requests cubren algunos casos con diacríticos; no duplicado de Disc en aprobación. |
| Sugerencias de novedad | `NationalReleasesService.findSuggestedDiscs` | SQL `LOWER(disc.name)=LOWER(requested.discName)` y equivalente de artista; selecciona `LIMIT 1` sin `ORDER BY`. | Igualdad exacta sin acentos ni elección determinista si hay duplicados. Otras comprobaciones de duplicado editorial usan `LOWER` y tipo de novedad. | Spec de servicio con query mock; no consulta PostgreSQL Unicode. |
| Sugerencias genéricas | `SuggestionsService` | Persiste propuesta libre `title`/`description`; no busca disco/artista. | No aplica. | Specs de Suggestions; no tratarla como matching musical. |
| Datos de artista por ID | `ArtistDetailsService` | Consultas por ID; búsquedas de relación con lanzamientos nacionales comparan `LOWER(name)` exacto. | No fuzzy; no es endpoint de búsqueda de catálogo. | Specs de detalle. |

`all`, calendario, modos Community y búsqueda de artista tienen distintas columnas/normalización. No deben asumirse intercambiables. Los seis modos de DiscList heredan sus lecturas: `all` pasa por Catalog; `rates`, `covers`, `comments`, `favorites` y `pendientes` mantienen ownership de los readers de Community. Una regla compartida debe ser un criterio aplicable por los readers, no una transferencia de ownership ni un filtro posterior a `LIMIT/OFFSET`.

## 5. Normalización y casos Unicode

`src/catalog/artists/helpers/normalize-for-search.ts` aplica `+ → espacio`, Unicode NFD, elimina marcas `Diacritic`, minúsculas, colapsa espacios y recorta. No aplica transliteración explícita de `ø`, `æ`, `œ`, `ł`, `ð`, `þ`; tampoco normaliza puntuación, apóstrofos, guiones ni artículos. `src/catalog/discs/write/helpers/normalize-artist-name.ts` es otra implementación: NFD, elimina el rango combinante básico, minúsculas y trim, pero no reemplaza `+` ni colapsa espacios internos. `DiscLinkMaintenanceService.normalizeString` es una tercera variante NFD, eliminación de U+0300–U+036F, apóstrofo curvo a recto y trim; no contiene equivalencias especiales ni colapso de espacios.

La migración `1758355724537-SyncEntities.ts` inicializa `name_normalized` con SQL `lower(unaccent(name))` y colapso de espacios. Esta política no es idéntica a la función TypeScript vigente ni garantiza las equivalencias propuestas. El título de Disc no tiene columna normalizada. `ILIKE` expresa comparación case-insensitive del motor y no debe confundirse con transliteración o equivalencia editorial.

| Entrada / almacenado | Resultado deseado | Evaluación del comportamiento actual |
|---|---|---|
| `Solstafir` / `Sólstafir` | Encontrar | Artist puede coincidir por clave `normalizeForSearch`; flujos que usan raw `ILIKE`/otra función dependen de su columna/expresión y no tienen una garantía común. |
| `MOL` / `MØL` | Encontrar | La normalización TypeScript no convierte `ø`; no hay equivalencia garantizada. |
| `Motorhead` / `Motörhead` | Encontrar | Diacrítico sobre `o` se elimina en NFD; los flujos que normalizan simétricamente pueden encontrarlo. |
| `Bjork` / `Björk` | Encontrar | Igual que arriba para NFD; no todo consumidor usa la misma clave. |
| `Dodsrit` / `Dödsrit` | Encontrar | NFD puede retirar la diéresis; depende del flujo y de la clave persistida. |
| `Alcest` / `Alcest` | Exacta | Los filtros parciales también la encuentran, pero no distinguen explícitamente exacta frente a parcial/ranking. |
| `Secrets of Pandora` / `The Secrets of Pandora` | Candidato | No se elimina artículo inicial; el `LIKE '%…%'` puede encontrar la frase como subsecuencia si aparece intacta, pero no define una equivalencia simétrica/article-aware. |
| `æ/ae`, `œ/oe`, `ł/l`, `ð/d`, `þ/th` | Evaluar equivalencia | Sin mapa explícito en los normalizadores TypeScript inspeccionados. |
| Apóstrofos, guiones, espacios repetidos | Búsqueda tolerante | Solo se armonizan espacios en el helper principal y apóstrofo curvo en el helper Spotify; no hay política compartida. |
| Escrituras no latinas | Conservar y buscar sin corrupción | No hay transliteración general identificada; no se debe reducir escritura original a transliteración como identidad. |

NFD y eliminación de marcas son una transformación de diacríticos, no transliteración. Una normalización más agresiva podría crear colisiones, por ejemplo cuando ligaduras/letras se expanden o signos de puntuación separan nombres que son distintos. Deben separarse clave primaria de búsqueda, equivalencias/aliases alternativos, fuzzy candidate scoring e identidad confirmada. El nombre original debe conservarse.

## 6. Spotify

### Búsqueda y selección

`SpotifyClientCredentialsService.albumSearchUrl` forma la consulta Search API con `type=album` y `limit=1`; el cliente obtiene/cacha token en memoria y `searchAlbumsByRawQuery` devuelve el JSON o informa errores HTTP. Aunque la respuesta tipada ofrece `album_type`, `total_tracks`, `release_date`, `artists`, `images` y URL, el consumidor de mantenimiento toma solo `items[0]`.

En `DiscLinkMaintenanceService.checkMissingSpotifyLinks`:

1. Selecciona discos publicados (releaseDate <= hoy) con `link` null, vacío o uno de dos textos centinela.
2. Busca `album:<nombre> artist:<artista>` tras una normalización local limitada, `limit=1`.
3. Si existe resultado, lo guarda inmediatamente sin cotejar el artista retornado, el título o el tipo local/remoto.
4. Si no, consulta Bandcamp; si tampoco hay resultado, hace búsqueda libre Spotify `artista álbum` y toma el primer resultado cuyo artista normalizado coincide exactamente. No comprueba que el título coincida ni que sea álbum/EP.
5. Persiste el link y la imagen (más `verified=true`).

Esta es la causa comprobada del riesgo de singles: el parámetro `type=album` devuelve objetos del tipo de recurso álbum, que pueden tener `album_type` `single`, `album` o `compilation`; el código ignora `album_type` y cualquier evidencia de número de pistas/fecha. Con `limit=1` no evalúa candidatos alternativos. En el fallback, un artista correcto basta aunque el título no sea el solicitado. No se afirma que cada búsqueda produzca un falso positivo; sí que el código permite guardar uno.

`DiscsService.resolveSpotifyAlbum` y `SpotifyPublicApiService.resolveAlbum` se usan en búsqueda manual (`GET /api/discs/spotify/album` y detalle): query estricta artist/album, `limit=1`, sin validación posterior, devuelve un solo candidato. Es un resolver de lectura: si no hay resultado lanza 404; no persiste. `getAlbumDetails` devuelve artistas, imagen, fecha, pistas y URL pero no `album_type`. La UI manual en `DiscDetail.vue` consulta y usa detalles/pistas para edición; no es el mismo recorrido que el job. `getAlbumTracks` también consulta un único resultado para seleccionar track/embed y no escribe metadata de Disc. No se encontraron reintentos internos del Search API; el job diario vuelve a intentar filas con sentinel/null en la siguiente ejecución. No se encontró workflow de evaluación de varios candidatos.

### Persistencia, error y conservación

- El cron diario `0 6 * * * Europe/Madrid` llama a `checkMissingSpotifyLinks({summaryOnly:true})`. Hay también invocación manual desde `ContentsController` y comando standalone `check-spotify`; la tarea no se ejecutó.
- Error/no resultado no borra portada, pero puede escribir un texto centinela en `Disc.link` (según rama) para que el registro siga siendo candidato a reintento. El siguiente cron selecciona esos centinelas.
- Resultado Spotify encontrado con `images` vacío escribe `disc.image = null`, por lo que puede sustituir una portada válida existente. Esta ruta no protege metadata manual ni conserva el valor anterior.
- Tener un link no vacío evita búsquedas posteriores, aunque el link sea manual o dudoso; no se comprueba `verified` ni la procedencia.
- El resolver manual no persiste ni borra datos. No se identificó una búsqueda manual para elegir entre varios resultados.
- El método guarda entidad completa mediante `save`; otra ejecución manual/cron concurrente podría competir y la última escritura ganar. No hay bloqueo/versionado observado. Riesgo de carrera posible, no reproducido.

## 7. Bandcamp y reconciliación de ownership

La integración activa encontrada es `searchBandcamp` privado en `src/catalog/discs/maintenance/disc-link-maintenance.service.ts`. Construye consulta HTTP HTML `https://bandcamp.com/search?q=ARTISTA+ÁLBUM&item_type=a`, parsea con Cheerio, y lee el primer `ul.result-items li.searchresult`. Del primer anchor extrae URL; del primer `img`, imagen; `.heading` y `.subhead` dan título/artista. Quita query string de la URL y cambia sufijo de imagen a `_10`.

Aunque obtiene heading/subhead, no compara esos nombres con el Disc solicitado. Devuelve `found` si hay `href`; el caller lo acepta. No visita página de detalle ni verifica artista, título, fecha o número de canciones. Si la respuesta HTTP no es OK, falla el fetch o la estructura no trae resultado/enlace, devuelve `error` o `not-found`; el caller continúa con fallback Spotify. Cuando Bandcamp encuentra URL sin imagen, conserva `disc.image` por la expresión `result.image || disc.image`; cuando trae imagen puede reemplazarla. `verified=true` tampoco registra origen. No se encontró una búsqueda manual de Bandcamp, API oficial usada, importador Bandcamp independiente ni job de actualización de links ya completos.

**Discrepancia histórica:** `roadmap/integrations/integrations.md` y documentos Spotify atribuyen Bandcamp a `ContentSchedulerService` bajo `src/contents`. El código vigente está en `src/catalog/discs/maintenance/DiscLinkMaintenanceService`; `ContentsController` delega explícitamente en este servicio. `src/editorial/contents/content-scheduler.service.ts` tiene cron semanal de creación editorial y no contiene búsqueda Bandcamp. La referencia histórica está desactualizada respecto al código. La dependencia queda en Catalog/Discs y el controller editorial expone una acción manual que la invoca; no se movió código.

## 8. Jobs, enriquecimiento y edición

| Proceso | Disparador/selección | Escritura y riesgo |
|---|---|---|
| Enlace Spotify con fallback Bandcamp | Cron diario o llamada manual; discos con fecha pasada y link null/vacío/sentinel | Escribe link, image y verified. Sin límite explícito en query; un mal resultado puede permanecer fuera de revisión si link no está vacío. Errores vuelven a intentarse por cron por sentinel. |
| Imágenes Last.fm | `POST /api/lastfm/fill-images` protegido para superadmin; busca discos de la semana con image null/empty | Llama Last.fm por artista/título y `updateImage` por ID si obtiene imagen. No reemplaza imágenes no vacías según selección. `Promise.all`, sin límite de concurrencia observado; no es cron. |
| Contenido editorial semanal | Cron lunes en `ContentSchedulerService` | Crea contenido editorial, no enriquece discos ni consulta Bandcamp. |
| Importaciones | Acciones manual/Excel | Resuelven artista y crean discos; las reglas de deduplicación son distintas. No son cron. |
| Requests | Envío y aprobación editorial | Nombres se conservan como texto; aprobar resuelve/crea Artist y crea Disc sin comprobación de duplicado de título. |

La edición normal usa campos de Disc y enlaces/imágenes, sin procedencia ni historial de metadata observado en estas entidades. No se encontró registro de fuente manual/automática en `Disc`. No hay aprobación editorial automática de cambios de título: los lectores/listados muestran el título almacenado; el resolver manual es separado. Para el roadmap, candidato, identidad, vínculo, propuesta de corrección y aprobación editorial deben seguir siendo acciones distintas.

## 9. PostgreSQL, índices y estrategia

La migración `1758355724537-SyncEntities.ts` habilita `unaccent`/`pg_trgm`, crea y rellena `artist.name_normalized` con `lower(unaccent(name))` + colapso de espacios, y declara GIN `gin_trgm_ops` con nombre `artist_name_normalized_trgm_idx`. La migración posterior `1758424806274-AddStateToVersionItem.ts` elimina dicho índice y crea B-tree sobre `name_normalized` con el mismo nombre. En el historial del repositorio, el índice final declarado es B-tree con nombre engañoso, y un B-tree normal no es un índice de substring `%q%` equivalente al GIN trigram. No se observó índice dedicado de Disc.name en las entidades/migraciones inspeccionadas. La extensión creada en migración no equivale a afirmar que esté activa en una base desplegada.

La clave se calcula con SQL `unaccent` durante backfill y con TypeScript en escrituras/búsquedas posteriores. Esa diferencia puede dejar claves históricas y nuevas con algoritmos distintos. El SQL directo de `LOWER(...) = LOWER(...)` (National Releases) no consume la columna normalizada. Las consultas `%query%` sin escapar comodines aceptan patrones de usuario y tienen distinta indexabilidad según índice/operador.

**Pendiente para implementación:** confirmar estado de esquema de PostgreSQL local aislado; consultar definición efectiva de índices/extensiones; capturar cardinalidad representativa; `EXPLAIN (ANALYZE, BUFFERS)` para queries reales de artista/disco; comparar estrategias de normalización y paginación. No se justifica índice/migración sin esas mediciones.

## 10. Pruebas existentes y huecos

**Suites localizadas (no ejecutadas):**

- Artistas: `artist-search.service.spec.ts`, specs de helper de normalización, management, catálogo, escritura, importación y mapping Last.fm. Los tests son de servicios/helpers y repositorios mockeados.
- Discs: `disc-catalog.service.spec.ts`, `disc-calendar.service.spec.ts`, specs de write, import manual/Excel, enrichment, maintenance y API Spotify; comprueban construcción de filtros/queries y delegaciones con dobles.
- Solicitudes/sugerencias/novedades: specs de Requests, Suggestions y National Releases, con repositorios/QueryBuilders mockeados.
- Proveedores: specs de `SpotifyPublicApiService` y `DiscLinkMaintenanceService` simulan HTTP/fetch; hay fixture HTML Bandcamp exitoso y casos de fallo de transporte/respuesta.
- PostgreSQL: el repositorio contiene specs de integración aislada para Catalog/DiscList y consultas relacionadas; no se usaron ni se verificó aquí su entorno/configuración operativa.

**Huecos relevantes:** no hay matriz completa para `MØL/MOL`, `Sólstafir/Solstafir`, `Motörhead/Motorhead`, `Björk/Bjork`, `Dödsrit/Dodsrit`, ligaduras y letras especiales; artículos, puntuación, apóstrofos, dobles espacios y scripts no latinos; colisión por normalización; ranking exacto vs parcial. Spotify no cubre selección entre varios candidatos, single homónimo, artista incorrecto en rama estricta, título incorrecto en fallback, álbum/EP (incluido EP clasificado como single), reedición/deluxe, respuesta sin imagen conservando portada, link manual protegido, retry y concurrencia. Bandcamp no cubre validación del artista/título parseados, orden de candidatos, HTML incompleto/cambiado o falsa coincidencia. Imports/requests no cubren de forma común duplicados con variaciones de caja, fecha, `ep` y título Unicode. No se encontró prueba de rendimiento SQL con datos representativos en el alcance consultado.

La matriz inicial de MEDIA roadmap conserva casos positivos/negativos; ampliar con los falsos positivos anteriores y datos reales anonimizados del catálogo antes de fijar umbrales.

## 11. Matriz de comportamiento actual y requerido

| Caso | Actual comprobado | Necesidad futura |
|---|---|---|
| MØL/MOL | Sin equivalencia explícita en helpers TS; resultado inconsistente por consumidor. | Alias/equivalencia limitada con control de colisiones. |
| Sólstafir/Solstafir, Björk/Bjork, Motörhead/Motorhead, Dödsrit/Dodsrit | Helpers NFD resuelven diacríticos combinantes si ambos lados pasan por la misma función; no todos los lectores lo hacen. | Política compartida, simétrica y probada. |
| `Secrets of Pandora`/`The Secrets of Pandora` | Puede coincidir por substring en algunos lectores; no hay política opcional de artículo ni score de candidato. | Coincidencia fuerte de candidato separada de identidad. |
| Álbum y single homónimos | Spotify estricta guarda primer resultado; no filtra tipo ni compara identidad. | Varios candidatos, artista/título y tipo como evidencia; nunca autoaceptar solo título. |
| EP devuelto como Spotify `single` | Sin lógica local que evalúe `ep`, `album_type` o `total_tracks`. | No rechazar exclusivamente por `album_type`; evaluar duración/formato y catálogo local. |
| Link manual sin portada | No se busca si el link no vacío; Spotify job puede sustituir image si selecciona primer resultado. | Procedencia y política de no pérdida revisables. |
| Búsqueda fallida | Link puede volverse sentinel y es reintentable; imagen actual se conserva salvo resultado Spotify sin imagen. | Distinguir no encontrado/error de enlace válido sin mezclar estado con URL. |
| Bandcamp primer resultado | Acepta cualquier primer resultado con href; nombres parseados no validan. | Evaluar candidatos y registrar razón/ambigüedad. |
| Dos importaciones/aprobaciones repetidas | Criterios de duplicado diferentes; Requests aprobación no detecta duplicado de Disc. | Definir identidad de catálogo/flujo, sin borrar variantes editoriales válidas. |

## 12. Hallazgos priorizados

Prioridad indica riesgo observado, no frecuencia de ocurrencia. No se identificó P0 reproducible.

| ID | Símbolo/archivo | Hallazgo y evidencia | Riesgo / impacto | Prioridad | Responsable futuro |
|---|---|---|---|---|---|
| MEDIA-A1 | `DiscLinkMaintenanceService.checkMissingSpotifyLinks` | Resultado estricto `items[0]` se persiste sin comprobar artista, título, tipo local ni `album_type`; el fallback verifica artista pero no título/tipo. | Link de lanzamiento incorrecto, incluidos singles homónimos. Catalog + Integrations. | P1 | MEDIA-4, MEDIA-5 |
| MEDIA-A2 | `DiscLinkMaintenanceService.checkMissingSpotifyLinks` | `images[0]?.url || null` escribe `null` en `Disc.image`; no conserva portada existente. | Pérdida de portada válida. | P1 | MEDIA-5; coordinación con CAT-DISC-4c.1b si se solapa persistencia |
| MEDIA-A3 | `DiscLinkMaintenanceService.searchBandcamp` | Elige primer resultado con href; extrae título/artista pero no valida ninguno. | Puede vincular otro artista/álbum. | P1 | MEDIA-4, MEDIA-6 |
| MEDIA-A4 | Normalizadores de Artists, Disc write y DiscLinkMaintenance | Tres variantes y los lectores no usan una política simétrica; las equivalencias especiales no existen en helper TS. | Búsquedas fallidas/inconsistentes y duplicados de artista. | P2 | MEDIA-2, MEDIA-3 |
| MEDIA-A5 | `DiscImportService`, `DiscExcelImportService`, `RequestsService.approve` | Detección/creación duplicada de Disc difiere: manual ILIKE, Excel igualdad exacta y request sin búsqueda previa. | Variantes duplicadas o rechazos inconsistentes; no toda diferencia constituye duplicado real. | P2 | MEDIA-1 ampliación/decisión Catalog en MEDIA-3/8 |
| MEDIA-A6 | Migrations `1758355724537` y `1758424806274` | GIN trigram declarado inicialmente se elimina y sustituye por B-tree de igual nombre; SQL backfill `unaccent` difiere de helper TS. Estado de DB actual no comprobado. | Riesgo de plan inadecuado y claves históricas inconsistentes. | P2 | MEDIA-2/3 y revisión PostgreSQL aislada |
| MEDIA-A7 | `ArtistSearchService.findByName` | `%`/`_` no se escapan y query normalizada vacía puede producir `LIKE '%%'`; no limita/pagina endpoint. | Resultado amplio/coste innecesario en consultas particulares. | P2 | MEDIA-3; medir antes de cambiar contrato |
| MEDIA-A8 | `NationalReleasesService.findSuggestedDiscs` | Coincidencia exacta `LOWER` sin acentos y `LIMIT 1` sin orden determinista. | Sugerencias no aparecen o selección ambigua. | P2 | MEDIA-3/4 según ownership editorial aprobado |
| MEDIA-A9 | `LastfmService.fillWeeklyImages` | Enriquecimiento paralelo sin límite de concurrencia observado; update por ID no comprueba estado de imagen en el momento de escribir. | Competencia con otra fuente y concurrencia de solicitudes externas. No reproducido. | P3 | Revisar en tarea de enriquecimiento, MEDIA-5/8 solo si aplicable |
| MEDIA-A10 | `roadmap/integrations/*` vs código actual | Documentación atribuye Bandcamp a ContentScheduler; servicio activo es Catalog/Discs. | Ownership/documentación confusa, no bug runtime. | P2 | Actualización documental de Integrations dentro de tarea acordada |

## 13. Propuesta de límites arquitectónicos

- **Catalog** debe definir la política interna de nombres y la semántica de identidad del catálogo (Artista, Disc, LP/EP); sus lectores aplican el criterio sin ceder a Integrations el ownership de listas o filtros Community.
- **Normalización** puede ser una utilidad pequeña de dominio compartida si MEDIA-1/2 confirma uso real desde más de una responsabilidad; no depender de Spotify/Bandcamp ni alterar originales. Distinguir normalización primaria de aliases alternativos.
- **Integrations** conserva transporte, parseo y límites específicos de cada fuente. Un adapter entrega candidatos y metadatos disponibles; no debería decidir automáticamente que el primer candidato es el Disc ni editar títulos manuales.
- **Matching** toma candidatos y evidencia, evalúa/ordena, y emite decisión/ambigüedad. Persistencia/linking y propuesta de corrección editorial son pasos separados, con política explícita para conservar valores manuales y existentes.
- Evitar un framework genérico o una abstracción de proveedor antes de probar reutilización concreta. Las listas de Disc no deben realizar requests externos.

## 14. Dependencias, riesgos y decisiones pendientes

**Dependencias:** MEDIA-2 debe acordar la política antes de cambios de normalización interna/proveedor. MEDIA-4 define scoring y bandas antes de MEDIA-5/6. MEDIA-3 puede ser independiente de la selección de candidatos externos. MEDIA-7 requiere diagnóstico de solo lectura y evidencia disponible. MEDIA-8 verifica las tareas finalmente aprobadas. CAT-DISC-4c.1 es iniciativa separada; solo coordinar si ambos cambios tocan persistencia de `image/link`.

**Decisiones pendientes:** equivalencias exactas y aliases; política para artículos y puntuación; significado de `verified`; representación diferenciada de URL manual/automática y error/no encontrado; definición de identidad de Disc y duplicado que preserve ediciones/reediciones; señales mínimas por fuente; interacción con el cambio CAT-DISC-4c; límite/rate policy de scraper Bandcamp; estado real de índices/extensiones; alcance contractual del endpoint de búsqueda de artista no paginado.

**Riesgos principales:** falsos positivos de enlace, pérdida de portada por null, normalizadores divergentes, falsos duplicados al normalizar, consultas substring sin índice compatible, concurrencia entre mantenimientos y dependencia de HTML Bandcamp no estable.

## 15. Plan para MEDIA-2–MEDIA-8

1. **MEDIA-2 — Normalización (S):** definir normalización simétrica, equivalencias conservadoras, colisiones y compatibilidad SQL; conservar valores originales.
2. **MEDIA-3 — Búsqueda interna (M):** aplicar política a lectores aprobados; exacta separada de parcial, medir PostgreSQL e índices; preservar contratos/ownership.
3. **MEDIA-4 — Matching (M):** ranking explicable por artista, título, tipo, pistas, fecha/edición; bandas calibradas con fixtures, separar candidato de escritura.
4. **MEDIA-5 — Spotify (M):** revisar búsqueda manual y job aparte, varios candidatos, álbum/EP/single, título/artista y conservación de datos; mocks, sin sincronización masiva.
5. **MEDIA-6 — Bandcamp (M):** validar HTML disponible, fixtures parser, seleccionar/rechazar con evidencia, tratar transporte/cambios de markup.
6. **MEDIA-7 — Enlaces históricos (S):** generar reporte de candidatos sospechosos y razones, solo lectura, revisión humana.
7. **MEDIA-8 — Regresión (M):** positivos, falsos positivos, persistencia, PostgreSQL aislado, rendimiento/contratos y errores de proveedores.

Esta auditoría cierra MEDIA-1 documentalmente. MEDIA-2–MEDIA-8 permanecen pendientes; no se implementó corrección ni se modificó el estado de CAT-DISC-4c.1.

## 16. Referencias de evidencia

- Búsqueda y escrituras: `src/catalog/artists/search/artist-search.service.ts`, `src/catalog/artists/helpers/normalize-for-search.ts`, `src/catalog/artists/management/artist-management.service.ts`, `src/catalog/artists/catalog/artist-catalog.service.ts`, `src/catalog/discs/catalog/disc-catalog.service.ts`, `src/catalog/discs/calendar/disc-calendar.service.ts`, `src/catalog/discs/write/disc-write.service.ts`, `src/community/common/helpers/apply-disc-list-filters.ts`.
- Imports y contribuciones: `src/catalog/import/manual/import/catalog-import.service.ts`, `src/catalog/import/excel/import/excel-import.service.ts`, `src/community/requests/requests.service.ts`, `src/editorial/national-releases/national-releases.service.ts`, `src/product/suggestions/`.
- Proveedores y jobs: `src/integrations/spotify-integration/`, `src/catalog/discs/maintenance/disc-link-maintenance.service.ts`, `src/catalog/lastfm/lastfm.service.ts`, `src/catalog/discs/enrichment/disc-enrichment.service.ts`, `src/editorial/contents/content-scheduler.service.ts`, `src/editorial/contents/contents.controller.ts`, `src/standalone.ts`.
- Esquema y evidencia estática: `src/catalog/artists/entities/artist.entity.ts`, `src/catalog/discs/entities/disc.entity.ts`, `src/migrations/1758355724537-SyncEntities.ts`, `src/migrations/1758424806274-AddStateToVersionItem.ts`.
- Tests consultados: specs `__tests__` de los servicios anteriores; no ejecutados en esta tarea.
- Documentación histórica cotejada: `roadmap/integrations/integrations.md`, `roadmap/integrations/spotify/`, `roadmap/catalog/catalog-discs-media-eligibility-audit.md`.
