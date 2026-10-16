# Auditoría y clasificación global de módulos del backend

**Estado:** las 11 tareas efectivas de traslado (BA-1 a BA-10 y BA-12) y el cierre BA-13 están completados. BA-11 fue absorbida por BA-13 y no se considera ejecutada. BA-14.A y BA-14.B están completadas; Asignations queda bajo `src/editorial/lists/asignations/` y conserva su módulo Nest independiente.
**Base observada:** rama actual, 2026-10-16. Inventario de 40 módulos funcionales NestJS; `AppModule` se cuenta aparte como composición de arranque.

## Alcance y fuentes

Se recorrió todo `src/`, los módulos Nest, controllers, services, entidades, DTOs, referencias de imports, jobs, pruebas, `app.module.ts` y `data-source.ts`. Se leyeron `AGENTS.md`, `roadmap.md` y los roadmaps de Catalog, Community, Integrations e Integrations Cleanup. Los roadmaps de área cerrados se conservan como historial y continúan siendo la fuente de evidencia detallada de esas reorganizaciones.

Las cifras de LOC son aproximadas: suma de TypeScript de producción bajo el módulo, sin specs. La columna de pruebas cuenta archivos `*.spec.ts` existentes en ese árbol; no representa una afirmación de que todas las rutas estén caracterizadas. Los prefijos de rutas corresponden a `@Controller` (con `/api` global). Permisos se resumen según decorators visibles en controllers. Importaciones de entidades por repositorio y relaciones de TypeORM se detallan en «Riesgos».

## Resumen de ownership

- **Catalog (7 módulos):** Artists, Countries, Discs, Genres, Import, Last.fm use case y `CommonModule`/`/catalog`.
- **Community (5):** Comments, Favorites, Pendings, Rates, Requests. Ya están bajo `src/community/` y su roadmap está cerrado. Las dependencias cruzadas con Catalog y Auth se aplazan.
- **Editorial (11):** Articles, Asignations, Contents, Festival Playlists, Links, Lists, National Releases, Points, Reunions, Riff Valley Playlists y Videos. Riff Valley Playlists se agrupa en `editorial/playlists/` y Festival Playlists conserva su módulo propio.
- **Identity/Auth (2):** Auth y Access Requests.
- **Communications (1):** Mail. El transporte SMTP permanece separado en Integrations.
- **Integrations (8):** Cloudflare R2, Instagram, Last.fm API, SMTP, Spotify, Telegram, TikTok y WordPress.
- **Platform/Infrastructure (3):** i18n, Seeds y Uploads. Los DTOs/helpers reutilizados se conservan en `platform/common`; Uploads es el caso de aplicación local que coordina el servicio de almacenamiento externo R2.
- **Product (3, `src/product/`):** News, Suggestions y Versions. Agrupa el feed de noticias, el feedback/bugs y el workflow de versiones sin fusionar sus módulos; Suggestions conserva su vínculo a VersionItem.
- **AppModule** compone todo lo anterior; `main.ts`, `standalone.ts`, `data-source.ts`, migraciones y configuración también son archivos de arranque/infraestructura, no módulos de negocio.

La clasificación primaria no duplicada suma los **40 módulos**: Catalog 7, Community 5, Editorial 11, Identity/Auth 2, Communications 1, Integrations 8, Platform/Infrastructure 3 (i18n, Seeds y Uploads) y Product 3. `AppModule` se excluye de este total.

## Inventario y clasificación de los 40 módulos

Cada módulo tiene controller/service/module Nest salvo que se indique. La ruta HTTP se da por prefijo; métodos disponibles y guards resumen lo observado. `Auth()` indica usuario autenticado según decorator, y los roles se refieren a `riffvalley`/`superadmin` cuando se nombran.

| Módulo | Actual → propuesta | Responsabilidad y archivos aproximados | Rutas y acceso actual | Dependencias, relaciones y consumidores relevantes | Pruebas / decisión |
|---|---|---|---|---|---|
| AccessRequests | `src/identity/access-requests` → `src/identity/access-requests` | Alta/solicitud de acceso; 79 LOC; controller, service, module, DTO; sin entity propia, usa User. | `/access-requests` POST; público con `ThrottlerGuard`. | `User`, Mail; consumidor externo: formulario de solicitud. | 0 specs locales. Trasladar con Identity. |
| Articles | `src/articles` → `src/editorial/articles` | Artículos y asociación con Content; 376 LOC; controller, service, module, Article, 2 DTO. | `/articles` GET/POST/PATCH/DELETE; lectura pública; writes `riffvalley`; `:id/content` autenticado `riffvalley`. | `Content` mediante `forwardRef`; User como autor/editor/coautor. AppModule, Contents y frontend editorial. | 0 specs locales. Trasladar; caracterización previa recomendada por el ciclo. |
| Asignations | `src/editorial/lists/asignations` → sin cambio | Asignaciones de discos a listas editoriales y usuarios; controller, service, module, entity, 2 DTO. | `/asignations` CRUD; POST requiere `Auth()`; PATCH/DELETE `riffvalley`; lecturas públicas; GET por list. | List, Disc, User; importa ListsModule y llama ListsService para sincronización WordPress; `List.asignations` eager+cascade. Disc Calendar proyecta asignaciones. | 2 specs. BA-14.B agrupa su carpeta bajo Lists y conserva el módulo Nest separado. |
| Auth | `src/identity/auth` → `src/identity/auth` | Login, usuarios, roles, guards/strategies, registro de acceso; 1,101 LOC; controller/service/module, User y UserAccessLog, DTO, guards, strategy, interfaces y decorators. | `/auth` GET/POST/PATCH/DELETE; operaciones autenticadas/roles por método; administración de usuarios restringida. | Dependencia transversal de casi todos los módulos; User tiene relaciones a Community, Editorial y Requests. Auth importa Rate. | 6 specs. Trasladar como unidad; primero mapear aliases e imports de todos los consumers. |
| Artists | `src/catalog/artists` → sin cambio | Catálogo de artistas con servicios de catálogo, detalles, gestión, huérfanos, búsqueda y escritura; 864 LOC; controller, module, entity, DTO y 7 services. | `/artists` GET/POST/PATCH/DELETE; listados/lectura públicos; mutaciones `riffvalley`. | Country eager; Disc; Artist Management además consume playlist local. Importa módulos/datos de Discs, Genres, Countries, Users y Riff Valley Playlists según operaciones. | 10 specs. Mantener donde está. |
| Countries | `src/catalog/countries` → sin cambio | Catálogo de países; 187 LOC; controller/service/module/entity/2 DTO. | `/countries` GET/POST/PATCH/DELETE; escritura `riffvalley`, lectura pública. | Artist inverse `OneToMany` con cascade; usado por Artists, Discs, Requests, import, Seeds y `/catalog`. | 2 specs. Mantener. |
| Discs | `src/catalog/discs` → sin cambio | Catálogo y escritura, calendario, Home, enrichment, integración Spotify de discos; 2,184 LOC; controller/module, fachada y 6 services, entity, DTO, helpers/loaders y tests. | `/discs` GET/POST/PATCH/DELETE y subrutas weekly/random/options/date/home/Spotify; rutas autenticadas según operación; altas/edición `riffvalley`, endpoints personales `Auth()`. | Artist, Genre, Rates, Favorites, Pendings, Comments, Asignations; relaciones eager de Artist/Genre/Favorites/Pendings/Comments. Importa Community, Catalog y Spotify Integration. | 34 specs. Mantener. Cualquier ajuste de eager necesita consumer review y caracterización. |
| Genres | `src/catalog/genres` → sin cambio | Catálogo de géneros; 230 LOC; controller/service/module/entity/2 DTO. | `/genres` CRUD; lectura pública, cambios `riffvalley`. | Disc inverse; Requests, import, Seeds, Common. | 2 specs. Mantener. |
| CatalogImport | `src/catalog/import` → sin cambio | Importación manual y Excel, parsing, template y logging; 796 LOC; module, dos controllers, 3 services, parsers y DTO. | `/catalog/import` POST, `/catalog/import/excel` GET/POST; acceso `superadmin`/`riffvalley` según controller. | Artist, Disc, Country, Genre y Auth; registra directamente sus repositorios. No consume adaptadores externos en el módulo actual. | 11 specs. Mantener bajo Catalog. |
| Lastfm (feature) | `src/catalog/lastfm` → sin cambio | Endpoints y caso de uso de consulta de artista/rellenado de imágenes; 83 LOC; controller/service/module. | `/lastfm` GET/POST; consulta pública, `fill-images` `superadmin`. | `LastfmApiService` desde Last.fm Integration y servicios de Discs; job operativo manual. | 3 specs. Mantener junto al caso de uso Catalog; no mover a Integrations el controller ni la política de enrichment. |
| Common / Catalog | Controller y `CommonModule` de `src/common` → `src/catalog/overview`; `PaginationDto` y `applyOrder` → `src/platform/common`; `TopStatsQueryDto` → `src/catalog/discs/dto` | Composición de lectura del catálogo; el árbol actual suma 248 LOC con los DTOs/helpers además del module/controller. | `/catalog` GET público. | CommonModule registra repositorios Genre y Country; `PaginationDto` se comparte entre Catalog, Community, Editorial e Identity; `applyOrder` se comparte entre Favorites y Rates. `TopStatsQueryDto` solo lo usa `DiscsController`. | La ruta pasa a Catalog Overview; utilidades compartidas pasan a Platform/Common y el DTO exclusivo queda en Discs. |
| Mail | `src/communications/mail` → sin cambio | Servicio de envío y notificaciones de aplicación; 150 LOC; module/service. | Sin controller propio. | Importado por Access Requests, National Releases, TikTok y otros flujos. Consume SmtpTransportService. | 1 spec. Mantener separado del transporte. |
| Comments | `src/community/comments` → sin cambio | Comentarios y respuestas; 476 LOC; controller/service/module/entity/3 DTO. | `/comments` CRUD; `Auth()` para contribuciones y acciones de usuario, lectura según endpoint. | User eager y Disc; relación padre-hijos recursiva; Disc.comments eager. | 3 specs. Mantener; relación observable. |
| Favorites | `src/community/favorites` → sin cambio | Favoritos de usuario/disco; 404 LOC; controller/service/module/entity/DTO. | `/favorites` GET/POST/DELETE; acceso autenticado. | User eager, Disc; Disc.favorites eager. | 3 specs. Mantener; colección eager requiere conservar el payload actual. |
| Pendings | `src/community/pendings` → sin cambio | Lista personal de pendientes; 374 LOC; controller/service/module/entity/DTO. | `/pendings` GET/POST/DELETE; acceso autenticado. | User eager, Disc; Disc.pendings eager. | 4 specs, incluida prueba Postgres. Mantener. |
| Rates | `src/community/rates` → sin cambio | Valoraciones, historial y estadísticas; 1,005 LOC; controller/module, facade service, history/stats services, entity/2 DTO. | `/rates` CRUD y consultas; acceso personal autenticado; operaciones administrativas según endpoint. | User y Disc eager; Disc.rates; Auth importa Rates, dependencia transversal inversa. | 5 specs. Mantener; ciclo conceptual Auth → Rates y acoplamiento de catálogo. |
| Requests | `src/community/requests` → sin cambio | Solicitudes de incorporación de discos por usuarios, con aprobación/reapertura; 374 LOC; controller/service/module/entity/2 DTO. | `/requests` POST usuario, GET/ID/PATCH/approve/reopen/DELETE `riffvalley`; `/my` usuario autenticado. | User, Genre y Country eager; crear/aceptar puede incorporar Disc. Catalog y Auth como consumers. | 2 specs. Mantener; roadmap Community cerrado. |
| Contents | `src/contents` → `src/editorial/contents` | Contenido editorial y cron de enlaces/operaciones programadas; 1,272 LOC; controller/module, service y scheduler, entity/2 DTO. | `/contents` CRUD y by-month; mutaciones `riffvalley`, lecturas públicas; trigger diario `riffvalley`. | Article, Video, Reunion, List, RiffValleyPlaylist, Disc y User; Lists y Points; Spotify Integration. Ciclo con Articles, Videos, Lists y Reunions. | 2 specs. Trasladar después de caracterizar ciclo/job, sin alterar horarios ni efectos. |
| FestivalPlaylists | `src/festival-playlists` → `src/editorial/playlists/festival-playlists` | Orquestación de playlists de festivales/géneros, Spotify/setlist.fm y sincronización diaria; 2,170 LOC; 2 controllers, service, module, asociación entity, 7 DTO. | `/festival-playlists` y `/genre-playlists`; mutaciones de gestión `riffvalley`; callback Spotify; top songs requiere `Auth()`. | RiffValleyPlaylist, Artist, Mail, Spotify Integration; llamada Setlist.fm dentro del caso de uso. Cron diario 09:00 Europe/Madrid. | 3 specs. Trasladar el caso de uso local a Editorial; mantener Spotify y otras APIs externas en Integrations. |
| i18n | `src/i18n` → `src/platform/i18n` | Configuración Nest i18n; 17 LOC TS más `src/i18n/*.json`; solo module. | Sin HTTP propio. | Registrado por AppModule; traducciones en archivos JSON y cabecera de idioma existente. | 0 specs. Trasladar módulo y recursos juntos. |
| CloudflareR2 | `src/integrations/cloudflare-r2-integration` → mantener | Cliente/adaptador Cloudflare R2; 47 LOC; module/service. | Sin ruta propia. | Consumido por Uploads. | 2 specs. Mantener en Integrations. |
| Instagram | `src/integrations/instagram-integration` → mantener | Cliente Meta Graph, posts, almacenamiento de token y façade de lectura; 331 LOC; module, controller/service/token storage, entity, DTO. | `/instagram/posts` GET; público según controller. | Persistencia InstagramPost; cliente Graph y configuración externa. | 4 specs. Mantener. |
| LastfmIntegration | `src/integrations/lastfm-integration` → mantener | Cliente API Last.fm; 98 LOC; module/service/types. | Sin ruta propia. | Exportado a Catalog/Lastfm para ejecutar el caso de uso local. | 2 specs. Mantener adaptador externo. |
| SMTP | `src/integrations/smtp-integration` → mantener | Transporte SMTP; 34 LOC; module/service. | Sin ruta propia. | Importado por Communications/Mail. | 2 specs. Mantener adaptador externo. |
| Spotify | `src/integrations/spotify-integration` → mantener | API pública, credenciales, OAuth/API de cuenta, cifrado y fachadas HTTP; 1,219 LOC; module, 5 services, 2 controllers, SpotifyConnection, DTOs/tipos/index. | `/spotify/artists` y `/spotify/albums` GET; acceso según endpoint, lecturas públicas. | Consumido por Catalog/Discs, Contents, Lists y Festival Playlists. Entity SpotifyConnection; no importa a los consumidores. | 6 specs. Mantener. El historial Spotify ya separa playlist local de proveedor externo. |
| Telegram | `src/integrations/telegram-integration` → mantener | Lectura de publicaciones/canal público; 220 LOC; module/controller/service/2 DTO. Descarga y parsea HTML público con Cheerio desde `https://t.me/s/{channel}`; no usa Telegram Bot API. | `/telegram` GET; `channel-posts` requiere `riffvalley`, `posts` es público. | Scraping HTML público de Telegram; consumido por News vía module/service. | 2 specs. Mantener. |
| TikTok | `src/integrations/tiktok-integration` → mantener | API, OAuth, vídeo local/cache y fachada; 1,090 LOC; module, 5 services, controller, 2 entities, DTOs. | `/tiktok` connect/callback/connection/videos; OAuth callbacks públicos, gestión autenticada `riffvalley`, datos públicos donde aplica. | TikTokConnection, TiktokVideo, token encryption, Mail; proveedor TikTok. | 7 specs. Mantener; integración cerrada en ambos roadmaps. |
| WordPress | `src/integrations/wordpress-integration` → mantener | Cliente REST WordPress; 218 LOC; module/service/types. | Sin ruta propia. | Lists para publicar/editar; News para feed público. | 1 spec. Mantener el transporte; lógica de negocio/caché permanece en Lists/News. |
| Links | `src/links` → `src/editorial/links` | Enlaces asociados a List; 272 LOC; controller/service/module/entity/2 DTO. | `/links` CRUD, lectura pública; POST autenticado, edición/borrado `riffvalley`. | List con borrado en cascada; Lists y frontend. | 0 specs. Trasladar como módulo independiente de Editorial; no fusionar servicio/controller con Lists. |
| Lists | `src/lists` → `src/editorial/lists` (carpeta propia del contexto Lists + Asignations) | Listas editoriales y sincronización/publicación WordPress/Spotify; 2,176 LOC; controller/service/module/entity/3 DTO, 2 specs. | `/lists` GET y subrutas por periodos/tipos; lectura pública o `Auth()` según ruta; gestión y publicación `riffvalley`. | Content→List one-to-one; ListsService sincroniza fechas de Content. Asignation y Link eager+cascade; WordPress y Spotify; Contents importa Lists con `forwardRef`; Asignations y Videos importan Lists. BA-14.B agrupa Asignations como subcarpeta, sin fusionar módulos; Links permanece independiente. | 2 specs. Mantener rutas, payloads y efectos de publicación. |
| NationalReleases | `src/national-releases` → `src/editorial/national-releases` | Gestión/calendario de lanzamientos nacionales, aprobación y notificaciones; 553 LOC; controller/service/module/entity/4 DTO. | `/national-releases` GET/POST/PATCH/DELETE; lectura pública, bulk/gestión `riffvalley`; POST moderado por throttle. | Disc nullable no eager; Auth y Mail. API pública de calendario. | 1 spec. Trasladar a Editorial por publicación/calendario; no cambiar moderación ni linkeo a Disc. |
| News | `src/editorial/news` → `src/product/news` | Feed/noticias propias, agregación de fuentes y caché; 472 LOC; controller/service/module/entity/2 DTO. | `/news` CRUD/feed/source-feed; feeds públicos; mutaciones `superadmin`. | Telegram y WordPress Integration; entidad News/cache local. | 2 specs. BA-5 la agrupó bajo Editorial; BA-12 la traslada a Product sin mover los transports ni cambiar el caché. |
| Points | `src/points` → `src/editorial/reunions/points` | Puntos/elementos de agenda dentro de Reunion; 182 LOC; controller/service/module/entity/2 DTO. | `/points` CRUD; GET público; mutaciones `riffvalley`. | Reunion dueño de la colección; `Reunion.points` cascade, FK on delete CASCADE. PointsModule importa ReunionsModule con `forwardRef`; la dependencia de módulo es unidireccional. | 0 specs. Trasladar junto a Reunions como submódulo real; no crear servicio duplicado. |
| Reunions | `src/reunions` → `src/editorial/reunions` | Reuniones/eventos con Points y Content; 193 LOC; controller/service/module/entity/2 DTO. | `/reunions` CRUD; GET público, mutaciones `riffvalley`. | Content/Contents vía `forwardRef`; Points inversa con cascade. Consumers: Contents y Points. ReunionsModule no importa PointsModule. | 0 specs. Trasladar junto a Points como unidad de ownership, sin ciclo Nest Reunions↔Points. |
| RiffValleyPlaylists | `src/riff-valley-playlists` → `src/editorial/playlists/riff-valley-playlists` | Entidad local de playlists propias de Riff Valley asociadas a Content; 552 LOC; controller/service/module/entity/3 DTO. | `/riff-valley-playlists` CRUD, festivals/genres/random; writes `riffvalley`, listados públicos. | Content one-to-one, User, RiffValleyPlaylistArtist, Artist Management y Festival Playlists. La integración externa de Spotify no es ownership del módulo. | 4 specs. BA-9 mueve únicamente este módulo bajo Editorial; preservar nombres/contrato ya migrados por roadmap Spotify. |
| Seeds | `src/seeds` → `src/platform/seeds` | Inicialización manual de usuarios y catálogos base; 142 LOC; service/module, sin HTTP. | Sin controller/ruta. | User, Genre, Country; no importa los módulos de dominio, registra repositorios directamente. | 0 specs. Trasladar como utilidad de operación; revisar ejecución manual/configuración. |
| Suggestions | `src/suggestions` → `src/product/suggestions` | Feedback/bugs con workflow de triage y vínculo opcional a VersionItem; 378 LOC; controller/service/module/entity/2 DTO. | `/suggestions` POST autenticado; `/my` usuario; administración lectura/progreso/rechazo/cierre/lectura `riffvalley`; PATCH general autenticado. | User eager y VersionItem opcional; Versions se mueve junto a Suggestions en BA-12. | 1 spec. BA-12 la agrupa con News y Versions bajo Product; se conserva distinta de Community/Requests y cada módulo Nest permanece independiente. |
| Uploads | `src/uploads` → `src/platform/uploads` | Caso de uso HTTP de subida de imagen; 84 LOC; controller/service/module. | `/uploads/image` POST `superadmin`. | `CloudflareR2IntegrationModule`; no entity local. | 3 specs. Trasladar bajo Platform/Uploads; R2 sigue externo. |
| Versions | `src/versions` → `src/product/versions` | Planificación/publicación y workflow de versiones/items; 772 LOC; controller/service/module, 2 entities, 4 DTO. | `/versions` CRUD, items, current/public/dev/draft/production; acceso público a lecturas publicadas y `superadmin` a writes/admin. | Version one-to-many items eager+cascade; User asignaciones. Suggestions apunta a VersionItem y se traslada junto a Versions; Auth importa Rate, no Versions. | 3 specs. BA-12 la mueve junto a Suggestions y News; suites incluyen hallazgos/fixtures históricamente frágiles documentados por Spotify. |
| Videos | `src/videos` → `src/editorial/videos` | Publicaciones de vídeo asociadas a Content/List; 486 LOC; controller/service/module/entity/3 DTO. | `/videos` CRUD y links a List/Content; lectura pública; writes `riffvalley`. | Content bidireccional vía `forwardRef`, Lists, User; `Video.list` nullable. | 0 specs. Trasladar después de caracterizar el ciclo con Contents. |

### Componentes técnicos anidados ya agrupados

Los subdirectorios internos no son módulos Nest adicionales salvo cuando se indica: Artist/Disc responsibility services; Excel y Manual Import; Rates history/stats; Spotify `api/http/oauth`; TikTok `api/http/oauth/videos`. Se conservan junto a su módulo dueño. `src/roles-migration/run-roles-migration-chain.ts` es utilidad operacional, no un módulo de dominio; las migraciones siguen en `src/migrations/`. `src/i18n/en.json` y `es.json` son recursos de configuración. Las 95 entradas de `src/migrations` y sus tests no forman 95 módulos; continúan en `src/migrations` por requerimiento del discovery TypeORM.

## Evaluación de Editorial

La lista editorial solicitada sí tiene ownership local editorial, pero con matices:

- **Editorial claro:** Articles, Contents, Lists, National Releases, Videos, Asignations, Reunions y sus Points. Gestionan contenido, calendario, publicación, asignación o eventos.
- **Riff Valley Playlists:** es contenido editorial local ya separado conceptualmente de Spotify y queda en `editorial/playlists/riff-valley-playlists`; Spotify API/OAuth/credenciales permanecen en Integrations. Festival Playlists coordina un caso editorial distinto de programación de festivales/géneros y su módulo permanece independiente bajo Editorial.
- **Links:** módulo transversal en forma, pero su único ownership persistido observado es `List`; se agrupa en Editorial junto a Lists, conservando módulo/controller separado y su ruta.
- **National Releases:** mantiene datos de publicaciones de música y enlazado opcional a Disc; el endpoint público de agenda y la moderación editorial justifican Editorial. La entidad sigue dependiendo de Catalog/Disc.
- **Points:** no es un dominio editorial autónomo observable; son partes subordinadas de Reunions. La propuesta lo anida bajo `editorial/reunions/points`, sujeto a actualizar metadata/import graph sin alterar tabla ni cascadas.

Los otros módulos editoriales fuera de la lista explícita son **Contents y Links**. News, Versions y Suggestions pasan a `src/product/` en BA-12; `AccessRequests` permanece en Identity.

## Estructura objetivo completa

La propuesta es una organización física, no una nueva arquitectura por capas. Cada módulo mantiene su propio controller/service/module/entity/DTO y API pública. `AppModule` permanece como compositor explícito; no se crean `EditorialModule`, `CatalogModule`, `IntegrationsModule` u otros agregadores salvo una decisión futura basada en composición real.

```text
src/
  main.ts
  app.module.ts
  standalone.ts
  data-source.ts
  winston.config.ts
  platform/
    common/                         # DTOs/helpers usados por varios dominios
    i18n/                           # módulo + en.json/es.json
    seeds/                          # carga manual de datos base
    uploads/                        # endpoint/caso de uso de subida
  identity/
    auth/                           # User, guards, strategies, decorators, access log
    access-requests/
  catalog/
    artists/
    countries/
    discs/
    genres/
    overview/                       # módulo/controller actual de /catalog
    import/
    lastfm/                         # feature/caso de uso Last.fm de Catalog
  community/
    comments/
    favorites/
    pendings/
    rates/
    requests/
  editorial/
    articles/
    asignations/
    contents/
    links/
    lists/
    national-releases/
    playlists/
      festival-playlists/
      riff-valley-playlists/
    reunions/
      points/                       # actual módulo Points, sin fusionar
    videos/
  product/
    news/
    suggestions/
    versions/
  communications/
    mail/
  integrations/
    cloudflare-r2-integration/
    instagram-integration/
    lastfm-integration/
    smtp-integration/
    spotify-integration/
    telegram-integration/
    tiktok-integration/
    wordpress-integration/
  migrations/                       # discovery por glob, ubicación estable
    __tests__/
  roles-migration/                  # script operacional histórico
```

No hay que mover `main.ts`, `app.module.ts`, `standalone.ts`, `data-source.ts` ni `winston.config.ts` para alcanzar ownership funcional. `src/migrations/` se mantiene como raíz requerida por globs/configuración; no se agrupa bajo una carpeta técnica nueva. El árbol muestra módulos y archivos de raíz representativos; subcarpetas internas existentes `dto/`, `entities/`, specs, servicios de responsabilidad, helpers/loaders y tests permanecen según su volumen real.

## Módulos a trasladar

Se propone trasladar 20 módulos existentes que hoy están fuera de sus agrupaciones objetivo, manteniendo todos sus nombres Nest y fronteras funcionales:

- `articles`, `asignations`, `contents`, `festival-playlists`, `links`, `lists`, `national-releases`, `reunions`, `riff-valley-playlists`, `videos` → `editorial/` (10 módulos; Riff Valley Playlists queda en `editorial/playlists/`).
- `points` → `editorial/reunions/points` (1 módulo subordinado).
- `auth`, `access-requests` → `identity/` (2).
- `news`, `suggestions`, `versions` → `product/` (3 módulos independientes).
- CommonModule/controller de `common` → `catalog/overview`; DTOs/helpers transversales de `common` → `platform/common`.
- `i18n`, `seeds`, `uploads` → `platform/` (3 módulos).

**Total propuesto: 20 módulos trasladables**. Desglose: Editorial 11 (10 + Points), Identity 2, Product 3 y Platform 3, más CommonModule que se mueve de la raíz a Catalog/overview. Catalog pasa de 6 a 7 módulos; Community 5, Communications 1 e Integrations 8 permanecen en sus agrupaciones actuales. `AppModule` es adicional y no se clasifica como módulo funcional.

Traslado significa mover módulo, controller, service, DTOs, entities, specs y helpers que sean de su ownership juntos, y actualizar imports/DI/configuración necesaria durante la futura implementación. No significa fusionar, renombrar rutas, crear aliases alternativos, cambiar tablas o rehacer contratos. En particular, `Points` permanece como módulo Nest propio aunque quede físicamente junto a Reunions.

## Módulos que deben permanecer intactos en esta planificación

- Los módulos actuales de `catalog/` y `community/`, ya organizados y con roadmaps de área completados. `LastfmModule` queda junto a su caso de uso Catalog; solo el cliente vive en Integrations.
- Los ocho módulos de `integrations/`; la integración SMTP no absorbe Mail; R2 no absorbe Uploads; WordPress no absorbe News/Lists; Spotify no absorbe playlists locales; Telegram no absorbe News.
- `communications/mail`, que es notificación de aplicación y consumidor del adaptador SMTP.
- Los seis módulos de Catalog existentes permanecen; CommonModule es el séptimo ownership de Catalog. Los DTOs/helpers comunes sí pasan a `platform/common` por su uso en varios dominios.
- `main.ts`, `app.module.ts`, `standalone.ts`, `data-source.ts`, `winston.config.ts`, `migrations/` y el runner operacional `roles-migration/`.
- DTOs/rutas/guards/payloads/schema y comportamiento de jobs, publicación, cache o notificaciones. Cualquier excepción requerirá una tarea independiente y una decisión explícita.

## Dependencias, ciclos y riesgos

### Grafo de dependencias relevante

- **Catalog ↔ Community:** `Disc` importa entidades de Rates/Favorites/Pendings/Comments y esas features importan Disc. Es un acoplamiento de ownership conocido; los roadmaps Community/Catalog lo dejan aplazado. La reorganización física requiere imports correctos sin intentar desacoplarlo.
- **Auth → Rates:** Auth registra/usa Rate para el comportamiento histórico de usuario. Es un edge funcional inverso a la agrupación principal; el roadmap Community ya lo registra como aplazado. No trasladar Rate ni cambiar el wiring aquí.
- **Contents → Lists:** `ContentsModule` importa Lists con `forwardRef`; `ListsModule` registra el repositorio Content y ListsService sincroniza fechas mediante ese repositorio, pero ListsModule no importa ContentsModule ni inyecta ContentsService. Es una dependencia de módulo unidireccional, no un ciclo Nest; conservar el wiring actual en movimientos físicos.
- **Contents ↔ Articles/Videos/Reunions:** entidades Content mantienen relaciones a Article, Video, Reunion, List y RiffValleyPlaylist; Articles/Videos/Reunions importan Contents con `forwardRef`/inyección forwardRef. Debe trasladarse la red como grupo ordenado, con pruebas de DI y metadata.
- **Points → Reunions:** PointsModule importa ReunionsModule con `forwardRef`, pero ReunionsModule no importa PointsModule; no es un ciclo Nest mutuo. La entidad tiene relación bidireccional/cascade. Contents también referencia Reunion y mantiene su ciclo con Reunions/Lists por separado.
- **Lists ↔ Asignations/Links/Videos/Contents:** `List` expone `asignations` y `links` eager+cascade; Asignations, Links y Videos importan/registran List; Contents usa Lists. Mantener rutas y shape.
- **Editorial → Catalog/Integrations:** NationalRelease→Disc; Asignation→Disc; FestivalPlaylists→Artist, Spotify, Mail y Setlist.fm; Lists→WordPress/Spotify; Contents→Spotify; RiffValleyPlaylist→Artist local mediante asociación de festival.
- **Product — Versions/Suggestions/News:** BA-12 agrupa estos tres módulos bajo `src/product/`, manteniendo sus clases y módulos independientes. Suggestions conserva su FK lógica a VersionItem y User; Versions mantiene sus items/relaciones; News conserva sus integraciones Telegram y WordPress. El cambio de ubicación no convierte Integrations en owner del feed ni crea un módulo agregador.
- **AccessRequests → Identity/Mail:** usa repositorio User y servicio Mail; puede moverse bajo Identity sin acoplar el servicio de correo a Auth.
- **Uploads → R2 Integration:** conservar frontera entre controlador/caso de uso y cliente externo.

### Persistencia y TypeORM

- `AppModule` configura `autoLoadEntities: true`, `synchronize: false`; cada módulo declara entidades con `TypeOrmModule.forFeature`. `data-source.ts` descubre entities por glob `src/**/*.entity.ts` / `dist/**/*.entity.js`, por lo que el cambio de ubicación conserva el patrón pero debe comprobarse compilación y CLI migrations.
- Relaciones TypeORM apuntan a clases importadas y no a carpetas. Al mover `User`, `Content`, `Disc`, `List`, `Reunion`, `Point`, `Article`, `Video`, `VersionItem` o entidades Integration hay que actualizar todo import de clase y validar metadata; ningún traslado autoriza cambio de decoradores, nombre de tabla/columna, enum, FK, cascada o eager.
- Relaciones que deben tratarse como contrato observable: Disc→Artist/Genre/Favorites/Pendings/Comments; Artist→Country; User→community/editorial collections; List→Asignations/Links; Version→items; Comment→User/parent/replies; Rate/Favorite/Pending→User/Disc; Content→User y relaciones editoriales; Asignation→User/Disc eager; Suggestion→User eager.
- No ejecutar migraciones ni editarlas para una reorganización física. La metadata y todos los imports deben coincidir con los mappings activos e históricos sin producir schema diff.

### Rutas, guards y consumidores

- Los prefijos HTTP se definen por strings en decorators, no por el path del archivo; conservar literalmente `@Controller` y métodos/decorators preserva prefijos y políticas. Revisar además `main.ts` por `/api`, `Auth` global/decorators y callback URLs de integraciones.
- Consumidores no limitados al módulo: frontend, `AppModule`, otros módulos Nest, `data-source.ts`, tests con imports hard-coded, migraciones que referencian entidades/clases, scripts y rutas OAuth/webhooks. Buscar strings de `src/...`, imports barrel, aliases de TS/Jest, mocks, fixtures, documentación y configuración antes/durante cada movimiento.
- Algunas suites usan imports absolutos `src/...` y otras relativos. No convertir sistemáticamente a aliases ni corregir imports fuera de alcance; actualizar solo las referencias que el traslado rompa.
- Tests existentes son desiguales: hay 0 specs en AccessRequests, Articles, Common, Links, Points, Reunions, Seeds, Videos e i18n; otras features tienen entre 1 y 34. Asignations cuenta ahora con dos specs locales. Las áreas sin suite local necesitan verificaciones de Nest DI, rutas y consumidores antes de moverlas; este documento no manda crear tests ahora.
- Mantener exactos status codes, roles y casos públicos. En la clasificación se observan endpoints anónimos de feeds/lecturas junto a CRUD protegido, y callbacks OAuth públicos; reorganizar no debe uniformarlos.

### Jobs y efectos externos

- `ContentSchedulerService`: cron a las 06:00 y los lunes a las 08:00, zona definida en servicio; realiza operaciones de scheduler/actualización de enlaces y consulta Spotify/Bandcamp. Sigue dentro de Editorial/Contents, con transporte Spotify delegado a Integration.
- `FestivalPlaylistsService`: cron diario 09:00 Europe/Madrid, sincronización Spotify/setlist.fm y efectos en persistencia/mail; permanece en Editorial/Festival Playlists.
- Otros efectos: WordPress publicación desde Lists y feed público en News; Telegram feed en News; R2 mediante Uploads; SMTP mediante Mail; Instagram/TikTok persisten recursos/tokens y consultan APIs externas. No ejecutar llamadas externas durante un movimiento estructural.

### Riesgos de contrato y ownership

- El contenido de playlist propio ya cambió de `/spotify` a `/riff-valley-playlists` por decisión explícita documentada en los roadmaps de Spotify. La futura mudanza no vuelve a migrar ese contrato ni añade aliases.
- La documentación de `AGENTS.md` describe expiración JWT de 24h y roles legacy; la configuración actual de `AuthModule` usa 8h y `ValidRoles` define los roles vigentes. La tarea de ubicación debe preservar la configuración del código y no resolver esta divergencia preexistente.
- `CommonModule` expone `/catalog` y registra repositorios Genre/Country; su ownership es Catalog, por lo que el módulo/controller se proponen en `catalog/overview`. Los DTOs/helpers que sí tienen consumidores transversales se separan a `platform/common`. Mantener body, relaciones y orden/semántica actuales.
- `NationalRelease` separa campos locales de Disc y mantiene una relación opcional no eager. No convertirlo en entidad de Catalog ni alterar response.
- `List` contiene tracking WordPress y relaciones eager; su traslado puede cambiar imports pero no JSON, publicación o sincronización.
- El ownership de `FestivalPlaylistsService` es local aunque opere Spotify y setlist.fm. No trasladar su regla de negocio a los adapters externos.
- `News` agrupa el feed local y su caché, mientras Telegram y WordPress permanecen como fuentes/transportes externos en Integrations. `Versions` mantiene el workflow de publicaciones y `Suggestions` el triage de feedback/bugs; BA-12 los agrupa bajo `src/product/` sin fusionarlos ni modificar sus contratos o la relación VersionItem. Requests sigue perteneciendo a Community.
- `TelegramService` descarga y parsea HTML público con Cheerio desde `https://t.me/s/{channel}`. No usa Telegram Bot API; se mantiene en Integrations porque su dependencia externa es la página pública del proveedor y sus datos se consumen como fuente externa.
- `Points` bajo `Reunions` es un cambio de ubicación basado en su única relación/consumidor observado, no una fusión de APIs. Si en ejecución se descubre otro consumer, reevaluar nesting manteniendo el módulo separado.

No se recomienda ningún cambio de contrato ni se identifica uno que bloquee la planificación. Cualquier hallazgo nuevo al ejecutar tareas se reportará conforme a `AGENTS.md`, con impacto y opciones antes de cambiar comportamiento.

## Roadmap global de implementación futura

Las tareas son independientes donde el grafo lo permite. **XS** ≤ unas pocas rutas/archivos y verificación acotada; **S** una capacidad pequeña o movimiento autocontenido; **M** varios módulos acoplados o muchos consumidores. No incluyen extracción funcional, limpieza de deuda ni cambio de contratos.

### Platform / Identity

#### BA-1 — Reubicar i18n bajo Platform (XS)

- **Objetivo:** agrupar configuración i18n sin cambiar mensajes ni selección de idioma.
- **Alcance:** módulo, recursos JSON, AppModule y rutas de recursos afectadas.
- **Exclusiones:** cambios de traducción, headers o comportamiento i18n.
- **Dependencias:** ninguna.
- **Verificaciones:** resolución del módulo Nest, rutas de recursos en desarrollo y producción, typecheck/build aplicable, `git diff --check`.
- **Estado:** completada. BA-1 se limita a trasladar la configuración y sus recursos bajo Platform; no implementa la funcionalidad de traducciones.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines exec tsc --noEmit` pasan. El contexto Nest aislado resuelve `I18nConfigModule` tanto desde el código fuente como desde el compilado. `AppModule` importa `./platform/i18n/i18n.module`; en desarrollo la ruta relativa del loader llega a `src/platform/i18n`, y en producción los JSON se copian a `dist/platform/i18n`, junto al módulo compilado. Se conservan `fallbackLanguage: 'en'` y `HeaderResolver(['x-custom-lang'])`; los JSON no se modificaron. El loader devuelve `languages: []` y `translations: {}` con los recursos actuales. Riff Valley no usa traducciones funcionalmente; activar o implementar esa capacidad queda fuera del alcance de BA-1.

#### BA-2 — Ubicar la lectura /catalog en Catalog y conservar utilidades comunes (M)

- **Objetivo:** alinear el módulo/controller que expone `/catalog` con el dominio Catalog y ubicar DTOs/helpers reutilizados en Platform/Common.
- **Alcance:** CommonModule y CatalogController a `catalog/overview`; PaginationDto y applyOrder a `platform/common`; imports consumidores y AppModule. `TopStatsQueryDto`, con un único consumidor en `DiscsController`, permanece en el dominio y se ubica en `catalog/discs/dto`.
- **Exclusiones:** rediseño de endpoint/payload, cambio de ownership de Genre/Country, duplicación de DTO/helper o reorganización funcional de sus consumers.
- **Dependencias:** ninguna; puede preceder BA-3 y los movimientos que actualicen rutas de import a utilidades comunes.
- **Verificaciones:** DI, ruta `/api/catalog`, shape/auth actuales, consumers de los DTOs/helpers en Catalog/Community/Editorial/Identity, typecheck/build.
- **Estado:** completada. El endpoint quedó bajo Catalog Overview y solo las utilidades con uso compartido cruzaron a Platform/Common. Se conservó el nombre `CommonModule` para limitar cambios públicos; ahora registra únicamente su controller y repositorios de Catalog.
- **Decisiones y dependencias:** `PaginationDto` tiene consumidores en Catalog, Community, Editorial e Identity/Auth. `applyOrder` se usa en Community/Favorites y Community/Rates. `TopStatsQueryDto` tiene un único consumidor, `DiscsController`, por lo que permanece en `catalog/discs/dto`. La referencia de tipo existente `ListStatus` en `PaginationDto` no genera import runtime en el JS compilado; no se introdujeron ciclos Nest ni módulos agregadores.
- **Evidencia:** el controller conserva `@Controller('catalog')`, `@Get()`, el acceso sin guards, `Promise.all`, orden ascendente por `name` y el payload `{ genres, countries }`; `main.ts` conserva el prefijo global `api`. `CommonModule` sigue registrando `[Genre, Country]` con `TypeOrmModule.forFeature`. La suite de Overview usa repositorios simulados y cubre metadata de ruta pública, shape/orden, caso vacío e inyección; pasa junto a 9 suites de consumidores afectados (10 suites, 99 tests en total, sin PostgreSQL). `yarn --ignore-engines build`, `yarn --ignore-engines exec tsc --noEmit`, búsqueda de imports antiguos y `git diff --check` pasan. Prettier pasa para los archivos trasladados, el test nuevo y `AppModule`. El chequeo agregado de todos los consumidores señala formato preexistente en 12 archivos; sus cambios BA-2 son solo imports y no se reformatearon para respetar el alcance.

#### BA-3 — Reubicar Auth y Access Requests bajo Identity (M)

- **Objetivo:** agrupar identidad y solicitud de acceso conservando la frontera Mail.
- **Alcance:** `auth/`, `access-requests/`, imports, tests y AppModule.
- **Exclusiones:** migración funcional de roles, cambios de JWT, permisos, User schema o envío de mail.
- **Dependencias:** fijar mapa de consumidores/imports absolutos; coordinar con cualquier traslado de entidades Identity.
- **Verificaciones:** suites Auth/AccessRequests y consumidores, guards/roles/rutas, DI de Rates y Mail, TypeORM metadata, build.
- **Estado:** completada (2026-10-14). Auth quedó en `src/identity/auth/` con su organización íntegra; Access Requests quedó en `src/identity/access-requests/`. No se creó un agregador `IdentityModule`.
- **Archivos y consumers:** se trasladaron 21 archivos de Auth (controllers, service/module, entidades, DTOs, guards, strategies, decorators, interfaces y tests) y los 4 archivos existentes de Access Requests; se añadió `access-requests.controller.spec.ts` para ruta pública, throttling y delegación. Se actualizaron `AppModule`, Catalog (Artists, Countries, Discs, Genres, Import, Last.fm), Community (Comments, Favorites, Pendings, Rates, Requests), Editorial (Articles, Asignations, Contents, Festival Playlists, Links, Lists, National Releases, News, Points, Reunions, Riff Valley Playlists, Versions, Videos), Integrations (Spotify, Telegram, TikTok), Platform (Seeds, Uploads), Suggestions y sus tests/fixtures; también los imports de User en entidades y servicios TypeORM. Los imports absolutos `src/auth/...` ahora apuntan a `src/identity/auth/...`. Mail conserva `src/communications/mail` y la dirección previa de dependencias; el acoplamiento Auth → Rates se conserva.
- **Contratos preservados:** siguen iguales `/api/auth` y `/api/access-requests`, DTOs, JWT (incluidas sus opciones), guards, roles, permisos, throttling público (3 solicitudes/60 s), relaciones User/UserAccessLog, flujo de aprobación y envío de correo. No se editaron entidades, decoradores TypeORM ni migraciones.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasan. Las 15 suites focalizadas de Auth, Access Requests, Rates, Requests, Catalog, Mail, SMTP y consumidores pasan (232 tests); las tres suites HTTP que requieren listener local pasan también (9 tests, con ejecución autorizada fuera del sandbox y servicios mockeados). `UserRoleGuard` y AuthModule resuelven en las suites existentes; `SmtpIntegrationModule` resuelve `MailService` por `MailModule`. La metadata TypeORM confirma tabla `users`, nueve relaciones OneToMany de User y `UserAccessLog.user` ManyToOne con `onDelete: CASCADE`. `prettier --check` pasa para ambos árboles Identity y `AppModule`, y `git diff --check` pasa. La comprobación Prettier amplia detectó formato no conforme en varios consumers que también contienen cambios locales de otras tareas; se dejaron intactos y los cambios de BA-3 en esos archivos son imports. Una comprobación general de suites sin tests PostgreSQL reportó fallos fuera de BA-3 en `VersionsController`/`VersionsService` (repositories no provistos en sus specs) y una expectativa SQL de `DiscCatalog`; no se modificaron esas suites ni su lógica.

#### BA-4 — Reubicar Seeds y Uploads bajo Platform (S)

- **Objetivo:** agrupar operación de datos iniciales y endpoint de storage.
- **Alcance:** módulos/servicios y wiring a Catalog/Auth/R2.
- **Exclusiones:** datos seed, política de autenticación, storage provider, ejecución automática.
- **Dependencias:** BA-3 para imports de Auth; BA-2 independiente.
- **Verificaciones:** DI, ruta `/api/uploads/image`, proveedor R2, referencia operacional a SeedService, build.
- **Estado:** completada (2026-10-14). `SeedModule`/`SeedService` y `UploadsModule`/controller/service quedaron bajo `src/platform/`; no se creó `PlatformModule`.
- **Archivos y referencias:** se trasladaron 2 archivos de Seeds y 6 de Uploads con su organización y pruebas; se añadió `seed.module.spec.ts` para comprobar la inyección sin ejecutar `createSeed()`. `AppModule` apunta a `platform/seeds` y `platform/uploads`; la referencia manual comentada en `main.ts` apunta a `platform/seeds/seed.service`. Los roadmaps de integración/roles con enlaces a los archivos movidos se actualizaron. Uploads sigue siendo usado por `AppModule`; no se encontraron otros consumidores de `UploadsService` ni comandos npm/Yarn o scripts CLI de seed.
- **Contratos y procedimientos preservados:** `POST /api/uploads/image`, mínimo `superadmin`, campo `file`, límite 5 MB, tipos MIME aceptados, estructura de key UUID, respuesta `{ url }`, manejo de error, Auth y `CloudflareR2IntegrationModule` no cambiaron. El procedimiento manual de Seeds mantiene su orden `createSeed` → usuarios → géneros → países y los mismos datos; sigue sin ejecutarse automáticamente ni durante estas verificaciones.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasan. Las seis suites focalizadas de Seeds, Uploads y Cloudflare R2 pasan (9 tests). La prueba de Uploads resuelve `UploadsController`/`UploadsService` mediante Auth y un provider R2 simulado; la prueba de Seeds resuelve sus repositories simulados de User, Genre y Country sin llamar a `createSeed`. Las suites existentes verifican ruta/permisos de Uploads y la metadata de R2. `prettier --check` sobre los archivos trasladados, `AppModule` y `main.ts`, y `git diff --check` pasan. La búsqueda en source/tests/scripts/configuración no encuentra imports ni rutas antiguas; no se accedió a PostgreSQL, Cloudflare R2 ni otros servicios.
- **Hallazgo fuera de alcance:** `SeedService` continúa construyendo los usuarios con una propiedad `roles`, mientras la entidad User actual declara `role`. La invocación permanece comentada en `main.ts`; no se ejecutó ni se corrigió esa discrepancia en BA-4.

### Editorial

#### BA-5 — Reubicar News y National Releases (S)

- **Objetivo:** agrupar publicaciones editoriales con bajo acoplamiento a Contents.
- **Alcance:** `news/`, `national-releases/`, imports, entidades, tests y AppModule.
- **Exclusiones:** cambiar caché/fuentes, moderación, notificaciones, relación a Disc o contrato.
- **Dependencias:** BA-3 para Auth/Identity. Mail mantiene su ruta actual, así que BA-4 no es prerrequisito.
- **Verificaciones:** suites existentes, rutas/guards, providers Telegram/WordPress/Mail, metadata de Disc/News, build.
- **Estado:** completada (2026-10-14). `NewsModule` y `NationalReleasesModule` quedaron en `src/editorial/news/` y `src/editorial/national-releases/`; no se creó un agregador `EditorialModule`.
- **Archivos trasladados:** News: `news.controller.ts`, `news.service.ts`, `news.module.ts`, `entities/news.entity.ts`, DTOs `create-news.dto.ts` y `update-news.dto.ts`, y specs `news.controller.spec.ts` y `news.service.spec.ts` (8). National Releases: `national-releases.controller.ts`, `national-releases.service.ts`, `national-releases.module.ts`, `entities/national-release.entity.ts`, DTOs `create-national-release.dto.ts`, `create-national-release-from-disc.dto.ts`, `link-disc.dto.ts` y `update-national-release.dto.ts`, y `national-releases.controller.spec.ts` (9).
- **Imports y consumidores:** actualizados `AppModule`, Mail (`CreateNationalReleaseDto`), la spec de Telegram, Catalog/Artists (module, details, management y spec) y Catalog/Import spec. Se ajustaron los imports relativos de National Releases a Identity/Auth, Communications/Mail y entidades de Catalog. Integrations Telegram/WordPress y Mail conservan sus providers y wiring existentes.
- **Contratos preservados:** siguen iguales las rutas `/api/news` y `/api/national-releases`, sus métodos, DTOs, validaciones, guards, permisos, throttling, relaciones, orden de consultas y notificaciones. Se conserva News → Telegram/WordPress y National Releases → Mail/Catalog; `NationalRelease.disc` continúa siendo nullable y no eager. No se modificaron entidades ni esquema; los cambios de formato de Prettier no alteran su metadata.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false` pasan. Las 7 suites focalizadas de News, National Releases y consumers directos pasan (22 tests); AuthModule/UserRoleGuard y MailModule resuelven en sus 4 suites focalizadas (49 tests). La compilación de un TestingModule con NewsModule y NationalReleasesModule confirma que ambos servicios y sus dependencias Nest se resuelven con repositorios/config simulados y sin servicios externos. Las specs de controllers verifican rutas y permisos; la metadata TypeORM confirma la tabla News sin relaciones y `NationalRelease.disc` como ManyToOne nullable/no-eager con join column `discId`. Prettier se aplicó a los 17 archivos trasladados y a los consumers tocados; la búsqueda no encuentra imports antiguos en source/tests/scripts/configuración y `git diff --check` pasa. No se accedió a PostgreSQL ni a servicios externos.
- **Hallazgos documentales fuera de alcance:** roadmaps históricos de auditoría conservan enlaces a `src/news/` y `src/national-releases/`; `roadmap/integrations-cleanup.md` también conserva una referencia textual al antiguo import del DTO de National Releases. No afectan imports ejecutables y no se actualizaron para mantener el alcance limitado.

#### BA-6 — Reubicar Lists y Links (M)

- **Objetivo:** agrupar lista editorial y su recurso subordinado Links manteniendo módulos independientes.
- **Alcance:** `lists/`, `links/`, consumidor Asignations/Videos/Contents, TypeORM imports, tests y AppModule.
- **Exclusiones:** separar ListsService, quitar eager relations, cambiar WordPress/Spotify o rutas.
- **Dependencias:** BA-3/Auth. BA-6 se puede completar primero: actualizará Contents, Asignations y Videos para importar Lists desde Editorial; después BA-7 y BA-8 se ejecutan sobre esa ubicación. BA-6 y BA-7 pueden ir en un único cambio coordinado si las subtareas conservan sus límites y verificaciones.
- **Verificaciones:** rutas, Link/List entity metadata, respuesta con Links/Asignations, flujo WordPress/Spotify mockeado, DI/ciclos, suites existentes, build.
- **Estado:** completada (2026-10-14). Lists quedó en `src/editorial/lists/` y Links en `src/editorial/links/`, manteniendo módulos separados. Lists sigue representando listas editoriales; `RiffValleyPlaylistModule` permanece en su ubicación y ownership actuales.
- **Archivos trasladados:** Lists: `dto/create-list.dto.ts`, `dto/generate-wp-posts-query.dto.ts`, `dto/update-list.dto.ts`, `entities/list.entity.ts`, `list.controller.ts`, `list.controller.spec.ts`, `list.module.ts`, `list.service.ts` y `list.service.spec.ts` (9). Links: `dto/create-links.dto.ts`, `dto/update-links.dto.ts`, `entities/links.entity.ts`, `links.controller.ts`, `links.module.ts` y `links.service.ts` (6). Se añadió `links.controller.spec.ts` para comprobar rutas y permisos de Links.
- **Imports y consumidores:** actualizados `AppModule`; Contents (entity/module/service); Asignations (entity/module/service); Videos (entity/module/service); Platform/Common (`PaginationDto`) e Identity/Auth (`domain-mutation-authorization.spec.ts`). También se actualizaron las referencias internas List↔Link. Contents, Asignations y Videos permanecen en sus ubicaciones; no se adelantaron BA-7 ni BA-8.
- **Contratos y dependencias preservados:** continúan iguales los endpoints `/api/lists` y `/api/links`, DTOs, guards y permisos, relaciones TypeORM y comportamiento de consultas/publicación. Lists conserva WordPress y Spotify; `List.asignations` y `List.links` mantienen `cascade` y `eager`, `Link.list` conserva `onDelete: CASCADE`, y las relaciones de Content, Video y Asignation con List mantienen sus opciones. Se conservaron los `forwardRef` existentes entre Contents/Lists y Contents/Videos; no se creó un agregador `EditorialModule` ni se mezclaron Lists con playlists.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false` pasan. Las 6 suites focalizadas de Lists, Links y consumidores afectados pasan (141 tests), incluyendo publicación mockeada, autorización, Contents y su scheduler. Un TestingModule Nest resuelve Lists/Links y los servicios de Contents, Videos y Asignations con repositorios/configuración simulados. La metadata TypeORM comprueba las relaciones List/Link, Content/List, Video/List y Asignation/List; se verificó el `forwardRef` de Contents. Prettier pasa en los árboles trasladados y `git diff --check` pasa; no quedan imports antiguos en source, tests, scripts ni configuración. No se accedió a PostgreSQL, WordPress ni Spotify reales.
- **Referencias documentales fuera de alcance:** permanecen rutas antiguas en enlaces de `roadmap/roles-endpoints-audit.md`, `roadmap/spotify-inventory.md` y `roadmap/integrations-cleanup.md`, y en comandos/evidencia histórica de `roadmap/catalog.md`. No son imports ejecutables y se dejaron intactas.

#### BA-7 — Reubicar Contents con Articles, Videos y Reunions (M)

- **Objetivo:** trasladar el núcleo editorial de forma coordinada con consumidores bidireccionales.
- **Alcance:** `contents/`, `articles/`, `videos/`, `reunions/`; resolver imports/forwardRef por nueva ubicación; AppModule.
- **Exclusiones:** romper ciclos, reescribir scheduler, modificar relaciones, hora/side effects o contratos.
- **Dependencias:** BA-3/Auth y BA-6 (Lists ya estará en su ruta objetivo). BA-7 puede ejecutarse antes de BA-8: mantiene Points en su ruta antigua y actualiza ese import al mover Reunions; BA-8 lo traslada después. También se permite coordinar ambas tareas en el mismo cambio.
- **Verificaciones:** Nest DI, rutas y permisos por controller, Content entity metadata, cron registration/zone, suites y consumers, build.
- **Estado:** completada (2026-10-14). Los cuatro módulos quedaron bajo `src/editorial/`; Points y Asignations permanecen en sus ubicaciones actuales. No se creó un `EditorialModule` agregador.
- **Archivos trasladados (28):** Contents: `content-scheduler.service.ts`, `content-scheduler.service.spec.ts`, `contents.controller.ts`, `contents.controller.spec.ts`, `contents.module.ts`, `contents.service.ts`, `dto/create-content.dto.ts`, `dto/update-content.dto.ts` y `entities/content.entity.ts` (9). Articles: `articles.controller.ts`, `articles.module.ts`, `articles.service.ts`, `dto/create-article.dto.ts`, `dto/update-article.dto.ts` y `entities/article.entity.ts` (6). Videos: `videos.controller.ts`, `videos.module.ts`, `videos.service.ts`, `dto/create-video.dto.ts`, `dto/list-video.query.dto.ts`, `dto/update-video.dto.ts` y `entities/video.entity.ts` (7). Reunions: `reunions.controller.ts`, `reunions.module.ts`, `reunions.service.ts`, `dto/create-reunion.dto.ts`, `dto/reunion-genre.dto.ts` y `entities/reunion.entity.ts` (6).
- **Imports y consumidores:** actualizados `AppModule` y `standalone.ts`; Identity/Auth (`User` y `domain-mutation-authorization.spec.ts`); Points (module, entity y service); Lists; y Riff Valley Playlists (module, service, entity y spec). También se actualizaron las referencias internas entre Contents, Articles, Videos y Reunions. Se mantuvieron los imports absolutos `src/editorial/...` y se ajustaron los relativos afectados por el traslado.
- **Contratos y dependencias preservados:** permanecen los endpoints `/api/contents`, `/api/articles`, `/api/videos` y `/api/reunions`, DTOs, validaciones, guards, roles y permisos. No cambiaron entidades ni schema: `Content` sigue relacionado con Article y Video por OneToOne y con Reunion por ManyToOne nullable/no-eager; `Reunion.points` mantiene OneToMany con cascade y `Point.reunion` ManyToOne. Los módulos y servicios conservan sus `forwardRef`, incluidos los ciclos con Lists y Points. Los jobs mantienen `0 6 * * *` y `0 8 * * 1`, ambos con zona `Europe/Madrid`; no se ejecutaron.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false` pasan. Pasan las 9 suites focalizadas de los módulos movidos, Lists y consumers afectados (157 tests); la suite de rutas de Riff Valley Playlists necesitó ejecutarse fuera del sandbox porque Supertest no puede abrir el listener local dentro de él. Un TestingModule Nest resuelve los servicios de los cuatro módulos y sus consumers directos con repositorios/config simulados, sin DB ni servicios externos. `domain-mutation-authorization.spec.ts` y las specs de Contents verifican rutas y permisos; una comprobación de `getMetadataArgsStorage()` valida las relaciones TypeORM y una lectura de metadata `@Cron` confirma expresiones y zonas horarias. Prettier `--check`, búsqueda de imports/rutas antiguas en source/tests/scripts/config y `git diff --check` pasan. No se ejecutaron jobs, publicaciones, consultas PostgreSQL ni llamadas externas.
- **Cobertura existente:** Contents tenía dos specs; Articles, Videos y Reunions no tenían specs locales dedicadas. Se usaron las suites existentes de autorización y consumers, sin añadir pruebas nuevas.
- **Referencias documentales históricas fuera de alcance:** `roadmap/roles-endpoints-audit.md`, `roadmap/spotify-inventory.md` y `roadmap/integrations.md` conservan referencias a las rutas previas. No son imports ejecutables y se dejaron intactas.

#### BA-8 — Reubicar Asignations y Points junto a sus owners (M)

- **Objetivo:** ubicar Asignations como flujo de Lists y Points dentro de Reunions sin fusionar módulos.
- **Alcance:** `asignations/`, `points/`; módulos Lists/Reunions, metadata, imports de entidades/services y AppModule.
- **Exclusiones:** cambios de flujo, cascadas, tablas, endpoints, traducciones del campo legacy `asignations`.
- **Dependencias:** BA-3/Auth, BA-6 (para Asignations→Lists) y BA-7 (para Points→Reunions). BA-8 se ejecuta después de ambos, sin que BA-6/7 dependan de ella.
- **Verificaciones:** metadata List/Asignation/Reunion/Point, eager+cascade, DI/ciclos, rutas/roles, build.
- **Estado:** completada (2026-10-14). Asignations quedó en `src/editorial/asignations/` y Points en `src/editorial/reunions/points/`; Points conserva su módulo Nest independiente. No se crearon módulos agregadores.
- **Archivos trasladados (12):** Asignations: `asignations.controller.ts`, `asignations.module.ts`, `asignations.service.ts`, `dto/create-asignations.dto.ts`, `dto/update-asignations.dto.ts` y `entities/asignations.entity.ts` (6). Points: `points.controller.ts`, `points.module.ts`, `points.service.ts`, `dto/create-points.dto.ts`, `dto/update-points.dto.ts` y `entities/point.entity.ts` (6).
- **Imports y consumidores:** actualizados `AppModule`; Identity/Auth (`User` y `domain-mutation-authorization.spec.ts`); Catalog/Discs (`Disc`); Editorial/Lists (`List`); Editorial/Contents (módulo y servicio); y Editorial/Reunions (entidad). Los imports internos de Points mantienen su referencia a Reunions. Se ajustaron rutas absolutas y relativas; no quedan referencias ejecutables a `src/asignations` ni `src/points`.
- **Contratos y dependencias preservados:** continúan `/api/asignations` y `/api/points`, clases, DTOs, validaciones, roles y guards. Se conserva la nomenclatura `Asignations`. `Asignation` mantiene sus relaciones ManyToOne a User, Disc y List; las relaciones inversas User/Disc/List conservan su metadata, incluido `List.asignations` con eager+cascade. `Point` mantiene ManyToOne con `Reunion` y `onDelete: CASCADE`; `Reunion.points` sigue OneToMany con cascade. Se preservó `forwardRef` entre Points y Reunions, y la composición existente de Contents/Points.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false` pasan. Pasan 6 suites focalizadas de Contents, Lists, autorización y Catalog/Discs (181 tests). Asignations, Points y Reunions no tenían specs propias; no se añadieron pruebas. Un TestingModule resuelve Asignations, Points y sus consumers Contents, Lists y Reunions con 30 repositorios TypeORM simulados y configuración falsa, sin PostgreSQL ni servicios externos. La spec de autorización cubre rutas y permisos de ambos controllers; `getMetadataArgsStorage()` confirma tipos y opciones de las relaciones User/Disc/List↔Asignation y Reunion↔Point. Prettier `--check`, búsqueda de imports antiguos en source/tests/scripts/config y `git diff --check` pasan. No se ejecutaron migraciones ni se accedió a servicios externos.
- **Referencias documentales históricas fuera de alcance:** `roadmap/roles-endpoints-audit.md` y `roadmap/spotify-inventory.md` mantienen referencias a `src/asignations/` y `src/points/`; son evidencia/enlaces históricos, no imports ejecutables, y se dejaron intactos.

#### BA-9 — Reubicar Riff Valley Playlists bajo Editorial (S)

- **Objetivo:** ubicar el módulo local de playlists en `src/editorial/playlists/riff-valley-playlists/`, separado de Lists y de las playlists de festivales.
- **Alcance:** traslado íntegro de `src/riff-valley-playlists/` y actualización de Contents, Identity/Auth y Festival Playlists; revisar Catalog/Artists, que consume la entidad de asociación propiedad de Festival Playlists.
- **Exclusiones:** mover Festival Playlists, Versions, News o Suggestions, o cambiar la lógica de Festival Playlists; cambiar contratos, CRUD, Spotify externo o lógica editorial. En Festival Playlists solo se actualiza el import necesario.
- **Dependencias:** BA-3/Auth y BA-7/Contents completadas. BA-10 depende de la nueva ubicación para consumir Riff Valley Playlists; BA-9 no depende de BA-10 ni de BA-12.
- **Verificaciones:** suites de Riff Valley Playlists, Contents y Festival Playlists; DI con repositorios/proveedores simulados; rutas/guards/permisos; metadata Playlist/Content/Artist association; imports obsoletos; build/typecheck.
- **Estado:** completada (2026-10-14). El módulo quedó en `src/editorial/playlists/riff-valley-playlists/`; Lists permanece como módulo separado en `src/editorial/lists/`. Festival Playlists sigue en `src/festival-playlists/` para BA-10.
- **Archivos trasladados (11):** `dto/create-riff-valley-playlist.dto.ts`, `dto/list-riff-valley-playlists.query.dto.ts`, `dto/update-riff-valley-playlist.dto.ts`, `entities/riff-valley-playlist.entity.ts`, `entities/riff-valley-playlist.entity.spec.ts`, `riff-valley-playlist.controller.ts`, `riff-valley-playlist.controller.spec.ts`, `riff-valley-playlist.module.ts`, `riff-valley-playlist.routes.spec.ts`, `riff-valley-playlist.service.ts` y `riff-valley-playlist.service.spec.ts`.
- **Imports y consumidores:** actualizados `AppModule`; Contents (entity, module y service); Identity/Auth (`User` y la spec de autorización); y Festival Playlists (entidad de asociación, module y service). Catalog/Artists se revisó: consume `RiffValleyPlaylistArtist`, entidad que sigue bajo Festival Playlists, y no tenía import directo de `RiffValleyPlaylist` que debiera cambiar. Los imports internos del módulo usan rutas relativas y permanecen intactos; se actualizó el comentario de ruta física del DTO.
- **Contratos y dependencias preservados:** continúa `/api/riff-valley-playlists` con las mismas rutas, DTOs, guards, roles y CRUD; `RiffValleyPlaylist` conserva nombre, tabla y metadata. Se preservan las relaciones OneToOne con Content, ManyToOne nullable con User y OneToMany con `RiffValleyPlaylistArtist`, además de la relación inversa y cascada de la entidad de asociación. La integración Spotify y los procesos de Festival Playlists no cambiaron. El módulo sigue importando Contents sin agregar `forwardRef`; no se creó `PlaylistsModule` ni `EditorialModule`.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false` pasan. Las 12 suites focalizadas de Riff Valley Playlists, Contents, Festival Playlists, Catalog/Artists y autorización pasan con 159 tests; la suite HTTP requirió permiso para abrir un listener local, tras fallar con `listen EPERM` dentro del sandbox. Un TestingModule resuelve Riff Valley Playlists, Contents y Festival Playlists con 30 repositorios TypeORM simulados y providers simulados de Spotify, Mail, crypto y configuración. Las specs de rutas/autorización verifican endpoints y roles; metadata TypeORM confirma Playlist/Content/User/Artist association y tabla actual. Prettier `--check`, búsqueda de imports antiguos en source/tests/scripts/config y `git diff --check` pasan. No se usaron PostgreSQL, Spotify ni servicios externos reales.
- **Referencias documentales históricas fuera de alcance:** `roadmap/spotify-classification.md`, `roadmap/integrations.md` y `roadmap/roles-endpoints-audit.md` conservan menciones/enlaces a `src/riff-valley-playlists/`; son evidencia histórica o rutas de documentación, no imports ejecutables, y se dejaron intactas.

#### BA-10 — Reubicar Festival Playlists (M)

- **Objetivo:** colocar la orquestación editorial local cerca de los demás flujos editoriales.
- **Alcance:** módulo/controllers/service/entity/DTOs, consumers RiffValleyPlaylist/Artist/Mail/Spotify; AppModule.
- **Exclusiones:** mover Spotify API/OAuth, crear adapter Setlist.fm, cambiar cron, llamadas externas o algoritmo.
- **Dependencias:** BA-3 y BA-9 (la nueva ubicación de RiffValleyPlaylist debe existir antes de actualizar/mover este consumer). BA-9 no depende de BA-10; BA-12 es independiente de ambas.
- **Verificaciones:** DI, rutas y guards, cron 09:00 Europe/Madrid, sincronización mediante mocks, metadata de asociación, imports previos, build/typecheck.
- **Estado:** completada (2026-10-14). `FestivalPlaylistsModule` permanece independiente en `src/editorial/playlists/festival-playlists/`, separado de `src/editorial/playlists/riff-valley-playlists/` y `src/editorial/lists/`.
- **Archivos trasladados (16):** `README.md`; DTOs `create-synced-playlist.dto.ts`, `link-spotify-playlist.dto.ts`, `search-spotify-tracks-query.dto.ts`, `select-playlist-artist-tracks.dto.ts`, `sync-playlist-artist.dto.ts`, `top-songs-query.dto.ts` y `update-synced-playlist.dto.ts`; `entities/riff-valley-playlist-artist.entity.ts`; `festival-playlists.controller.ts`, `festival-playlists.controller.spec.ts`, `festival-playlists.module.ts`, `festival-playlists.service.ts`, `festival-playlists.service.spec.ts`, `genre-playlists.controller.ts` y `genre-playlists.controller.spec.ts`.
- **Imports y consumers:** actualizado `AppModule`; Catalog/Artists (`artists.module.ts`, `artist-management.service.ts` y su spec); Catalog Import (`catalog-import.module.spec.ts`); y Riff Valley Playlists (`riff-valley-playlist.entity.ts` y su spec) para importar la asociación desde la nueva ubicación. Imports internos relativos del módulo permanecen válidos; no se añadieron agregadores.
- **Contratos y dependencias preservados:** se conservan controllers, clases, DTOs, validaciones, rutas `/festival-playlists` y `/genre-playlists`, guards/roles (`riffvalley` y acceso superior vigente), callback OAuth público y autenticación requerida para top songs. También se preservan la asociación TypeORM con RiffValleyPlaylist y Artist, dependencias Nest de Auth/Mail/Spotify, generación/sincronización, llamadas Spotify/setlist.fm y `@Cron('0 9 * * *', { timeZone: 'Europe/Madrid' })`. No se ejecutaron cron ni sincronizaciones.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false` pasan. Las 12 suites focalizadas de Festival Playlists, Riff Valley Playlists y Catalog/Artists pasan con 62 tests; la suite HTTP requirió repetición fuera del sandbox porque este bloqueó el listener local (`listen EPERM`). El TestingModule de FestivalPlaylists resuelve service/controllers con DataSource TypeORM simulado; las suites verifican rutas, guards y permisos; la spec de entidad verifica metadata de la asociación; inspección de metadata confirma cron 09:00 Europe/Madrid. Prettier y `git diff --check` pasan; búsqueda de imports ejecutables antiguos no encuentra coincidencias. No se accedió a PostgreSQL ni a APIs externas.
- **Referencias documentales históricas fuera de alcance:** `roadmap/integrations.md`, `roadmap/spotify-inventory.md` y `roadmap/roles-endpoints-audit.md` conservan algunos paths `src/festival-playlists/` en texto y enlaces de auditoría; no son imports ni rutas ejecutables y no se actualizaron.

#### BA-11 — Cerrar traslados Editorial e Identity (S)

- **Estado:** absorbida por BA-13; no ejecutada como verificación independiente. Se conserva BA-11 como identificador histórico.
- **Criterios transferidos a BA-13:** verificar las suites focalizadas de regresión Editorial e Identity, build/typecheck, rutas y decorators, metadata TypeORM, referencias ejecutables a ubicaciones antiguas y ownership final de Editorial/Product. Los hallazgos preexistentes o no atribuibles a los traslados se documentan, no se corrigen en esta verificación.

### Product y cierre general

#### BA-12 — Reubicar Versions, Suggestions y News bajo Product (M)

- **Objetivo:** agrupar el workflow de versiones, el feedback de producto y el feed local de noticias bajo `src/product/`, conservando cada módulo separado.
- **Alcance:** mover `src/versions/`, `src/suggestions/` y `src/editorial/news/` a `src/product/versions/`, `src/product/suggestions/` y `src/product/news/`; actualizar sus consumers, entidades y `AppModule`.
- **Exclusiones:** cambios de estados/permisos/UX, relación Suggestions↔VersionItem, contratos, News cache, integraciones Telegram/WordPress o lógica del workflow.
- **Dependencias:** BA-3/Auth, BA-5 (News ya quedó en Editorial) y BA-7 (Content); Versions y Suggestions se trasladan juntos para mantener la referencia a VersionItem. BA-12 es independiente de BA-9/BA-10.
- **Verificaciones:** suites de Versions, Suggestions y News y consumers; DI/repositorios simulados; rutas/roles; metadata Version/items/User y Suggestion/User/VersionItem; integración News con providers simulados; imports obsoletos; build/typecheck.
- **Responsabilidad de News:** se confirma la clasificación aprobada: el módulo mantiene entidad y feed local de producto, caché y endpoints propios; Telegram y WordPress son fuentes/transports consumidos, no el ownership del feed. No se encontró contradicción funcional.
- **Estado:** completada (2026-10-14). Los tres módulos quedaron separados bajo `src/product/`; `NationalReleasesModule` permanece en Editorial. No se creó `ProductModule` agregador.
- **Archivos trasladados (27):** Versions (12): `dto/create-version-item.dto.ts`, `dto/create-version.dto.ts`, `dto/update-version-item.dto.ts`, `dto/update-version.dto.ts`, `entities/version-item.entity.ts`, `entities/version.entity.ts`, `versions.controller.spec.ts`, `versions.controller.ts`, `versions.logic.spec.ts`, `versions.module.ts`, `versions.service.spec.ts`, `versions.service.ts`. Suggestions (7): `dto/create-suggestion.dto.ts`, `dto/update-suggestion.dto.ts`, `entities/suggestion.entity.ts`, `suggestions.controller.spec.ts`, `suggestions.controller.ts`, `suggestions.module.ts`, `suggestions.service.ts`. News (8): `dto/create-news.dto.ts`, `dto/update-news.dto.ts`, `entities/news.entity.ts`, `news.controller.spec.ts`, `news.controller.ts`, `news.module.ts`, `news.service.spec.ts`, `news.service.ts`.
- **Imports y consumers:** AppModule apunta a los tres módulos nuevos; `domain-mutation-authorization.spec.ts` importa Versions desde Product y `telegram.controller.spec.ts` importa el nuevo NewsModule. Se corrigieron los niveles relativos hacia Identity en `VersionItem`, `Suggestion` y su módulo/service; Suggestions y Versions mantienen sus referencias relativas de sibling hacia VersionItem. No hay otros imports ejecutables con las rutas antiguas.
- **Contratos y dependencias preservados:** clases, módulos, rutas `/versions`, `/suggestions` y `/news`, DTOs, validaciones, permisos, integraciones y configuración TypeORM permanecen iguales. Version conserva su OneToMany eager+cascade con VersionItem; Suggestion mantiene VersionItem nullable/no-eager con `onDelete: SET NULL`, y las relaciones con User no cambian. News sigue integrando Telegram y WordPress sin mover sus adapters ni alterar feed/caché/notificaciones.
- **Evidencia:** `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false` pasan. Se ejecutaron 8 suites focalizadas: 6 pasan (123 tests); los dos specs legacy de Versions fallan durante construcción de sus TestingModules porque no proveen `VersionRepository` al `VersionsService`, hallazgo preexistente ya registrado en este roadmap/roles preflight y no causado ni corregido por el traslado. Un TestingModule separado resuelve Versions, Suggestions y News con repositorios, Telegram y WordPress simulados. Specs de News/Suggestions y reflexión sobre Versions verifican rutas/guards/permisos; metadata TypeORM confirma relaciones Version/VersionItem/Suggestion y que News no tiene relaciones. Prettier, búsqueda de imports/rutas ejecutables antiguas y `git diff --check` pasan. No se accedió a PostgreSQL ni a servicios externos.
- **Referencias documentales históricas fuera de alcance:** `roadmap/roles-endpoints-audit.md` conserva enlaces de fuente `src/versions/` y `src/suggestions/`; `roadmap/roles-migration-preflight.md` menciona la ruta antigua en el registro del fallo preexistente. Son referencias de auditoría, no imports ejecutables, y se dejaron intactas.

#### BA-13 — Cierre global de arquitectura (S)

- **Estado:** completada (2026-10-14). BA-13 cierra la verificación global; BA-11 permanece absorbida y no ejecutada como tarea independiente.
- **Objetivo:** verificar transversalmente la arquitectura completa tras los traslados, usando las evidencias previas como base y cerrando la regresión global en una única tarea final.
- **Alcance:** Catalog, Community, Editorial, Identity, Platform, Product, Communications e Integrations; inventario y registro/resolución de módulos NestJS; imports y dependencias entre dominios; `autoLoadEntities`/DataSource glob; guards, roles y permisos; contratos HTTP y DTOs; metadata y relaciones TypeORM; dependencias circulares y `forwardRef`; cron y zonas horarias; integraciones y consumidores mediante mocks; documentación, árbol y referencias ejecutables a ubicaciones antiguas. Revisar expresamente los flujos Editorial e Identity transferidos desde BA-11 y el ownership final de Editorial/Product.
- **Exclusiones y límites de ejecución:** no realizar nuevas extracciones, cambios de contrato, migraciones SQL, seeds, cron reales, llamadas u operaciones externas, limpieza de deuda ni cambios en frontend. No corregir ni suprimir problemas preexistentes, de atribución desconocida o fuera de alcance para el futuro cleanup.
- **Dependencias:** BA-1 a BA-10 y BA-12 completadas. BA-11 está absorbida y no es una tarea ni dependencia independiente; sus criterios están incluidos aquí. Hallazgos no atribuibles con evidencia suficiente se registran como de atribución desconocida y no se tratan como regresiones BA.
- **Gestión de hallazgos:** clasificar cada uno como regresión demostrablemente introducida por una tarea BA, problema preexistente, atribución desconocida o fuera de alcance para el futuro cleanup. Corregir solo regresiones demostrablemente introducidas por las tareas BA y dentro del alcance; documentar las demás sin modificarlas ni suprimirlas. No modificar `.impeccable/config.json`.
- **Verificaciones ejecutadas:** `yarn --ignore-engines build` y `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasan. La búsqueda de imports con aliases `src/` a ubicaciones raíz antiguas no encuentra coincidencias; build/typecheck resuelven imports relativos. El árbol contiene 40 módulos funcionales más `AppModule`, de acuerdo con el inventario, y las ubicaciones verificadas incluyen Catalog/Overview, Community, Editorial, Identity, Platform, Product, Communications e Integrations. Lists mantiene su módulo propio y no se confunde con playlists; Riff Valley Playlists y Festival Playlists son módulos Nest independientes; Points permanece como módulo independiente dentro de Reunions; Versions, Suggestions y News están bajo Product. No se añadieron agregadores de dominio.
- **Nest, contratos y metadata:** pasan 15 suites de módulos/DI (29 tests), con repositorios/configuración simulados donde corresponde. La suite `domain-mutation-authorization` y pruebas focalizadas de Auth, Access Requests y Auth→Rates pasan (4 suites, 125 tests): rutas, métodos HTTP, decorators, roles mínimos y guard se verifican por metadata/reflection y guard simulado. Las suites de controllers/DTO de regresión incluidas en la corrida global pasan, salvo las limitaciones y fallos preexistentes anotados abajo. Las suites disponibles inspeccionan metadata de relaciones TypeORM de Contents, Lists/Links/Asignations, Articles/Videos, Reunions/Points, playlists/Artist, User/Auth, Versions/VersionItem y Suggestions; el build confirma el wiring de imports. `AppModule` conserva `autoLoadEntities: true`, `synchronize: false` y `migrationsRun: false`; `data-source.ts` usa globs `src/**/*.entity.ts`/`dist/**/*.entity.js` y migraciones análogos. Se mantienen los ciclos Nest existentes con `forwardRef` entre Contents y Lists/Articles/Videos/Reunions; Points importa Reunions con `forwardRef` sin una importación inversa.
- **Cron e integraciones:** inspección estática confirma Contents a las 06:00 diaria y 08:00 los lunes, ambos en `Europe/Madrid`, y Festival Playlists a las 09:00 en `Europe/Madrid`; no se ejecutó ningún cron. Las suites con proveedores simulados de Spotify, WordPress, Telegram, Last.fm, SMTP/Mail, Instagram, TikTok y R2 se incluyen en los resultados unitarios; no se contactaron APIs, SMTP ni storage externos.
- **Suites globales:** `yarn --ignore-engines test --runInBand --testPathIgnorePatterns='postgres\.spec\.ts|src/migrations/'` ejecuta 129 suites: 123 pasan y 6 fallan; 1.003 tests pasan y 12 fallan. Se excluyeron las suites PostgreSQL y `src/migrations/` para no contactar una base ni ejecutar pruebas de migraciones. La pasada separada de módulos/DI pasa 15/15 suites y 29/29 tests; la pasada focalizada de Identity/guards pasa 4/4 suites y 125/125 tests. Son subconjuntos y no se suman al total global.
- **Regresiones atribuibles a BA-1…BA-12:** no se encontraron regresiones demostrables causadas por los traslados. Build, typecheck, imports resueltos y suites focalizadas disponibles respaldan el cierre.
- **Problemas preexistentes que quedan para revisión futura:** `src/product/versions/versions.controller.spec.ts` y `versions.service.spec.ts` siguen fallando al construir el `TestingModule` por no proporcionar `VersionRepository`; BA-12 ya lo registró como fallo legacy. `src/catalog/discs/catalog/disc-catalog.service.spec.ts` mantiene una expectativa de `addSelect('disc.id', 'discId')` incompatible con la llamada actual, registrada previamente como fallo fuera de BA-3. No se modificaron.
- **Atribución desconocida / límite del entorno:** los tests HTTP de `src/integrations/spotify-integration/http/spotify-artists.controller.spec.ts`, `src/editorial/playlists/riff-valley-playlists/riff-valley-playlist.routes.spec.ts` y `src/catalog/discs/__tests__/discs.spotify-http-contract.spec.ts` no pudieron completar solicitudes porque el sandbox devuelve `listen EPERM` al abrir `0.0.0.0`; los errores de `port` son consecuencia de ese bloqueo. No permiten concluir el resultado HTTP de esas rutas en esta ejecución. Quedan como verificación para repetir en un entorno que permita listeners, no como regresiones atribuidas a BA.
- **Fuera de alcance y cleanup futuro:** las suites `*.postgres.spec.ts` no se ejecutaron por la prohibición de acceder a PostgreSQL; no se ejecutaron migraciones, seeds, cron ni operaciones externas. El futuro cleanup podrá revisar los dos problemas legacy descritos, sin que BA-13 los corrija o suprima. No se modificó código, tests ni `.impeccable/config.json`.
- **Cierre documental:** `git diff --check` no reporta errores de whitespace en los cambios rastreados; como este roadmap figura como archivo no rastreado en la rama actual, también se comprobó el contenido con `git diff --no-index --check /dev/null roadmap/backend-architecture.md`, sin hallazgos de whitespace.

Los traslados debían caracterizar la conducta afectada, especialmente en módulos sin tests locales y ciclos de Contents. El build solo demuestra resolución/compilación, no equivalencia de responses; por eso BA-13 registra suites, comprobaciones estáticas y limitaciones de ejecución.

### BA-14.A — Auditoría de agrupación de Lists y Asignations (S)

- **Estado:** auditoría completada (2026-10-16). Su recomendación se ejecutó en BA-14.B: las carpetas quedan agrupadas bajo `src/editorial/lists/` y `ListsModule`/`AsignationsModule` siguen independientes. La auditoría no movió código ni modificó lógica.
- **Relación funcional:** Lists crea y mantiene listas por tipo/periodo, consulta y proyecta sus asignaciones para generar publicaciones semanales/mensuales, produce publicaciones WordPress y sincroniza los datos seleccionados a WordPress/Spotify. Asignations registra la relación entre una lista y un disco, con datos de usuario, posición, recomendación, género manual y pista de Spotify; al cambiar contenido editorial de una asignación, solicita a ListsService la resincronización del bloque correspondiente en WordPress. Por tanto, las listas editoriales se construyen mediante asignaciones y estas no muestran un uso de negocio independiente de Lists.
- **Responsabilidades independientes:** mantener APIs, controllers, DTOs, servicios y módulos Nest separados. Lists administra ciclo de vida/fechas/tipos y efectos de publicación; Asignations administra altas, consultas paginadas, validación de referencias y cambios al contenido asignado. Links sigue siendo un módulo independiente de Lists. Catalog/Disc Calendar consume una proyección de asignaciones para su calendario y no convierte Asignations en responsabilidad de Catalog.
- **Relaciones de datos:** `List.asignations` es `OneToMany` con `cascade` y `eager`; `Asignation.list` es `ManyToOne` con `onDelete: CASCADE`. `Asignation.disc` y `.user` son eager; `Disc.asignations` y `User.asignations` proporcionan relaciones inversas. BA-14.B no cambia metadata, payloads ni esquema.
- **Imports y consumidores directos observados:** `AppModule` registra ambos módulos. `ContentsModule` registra List, importa ListsModule con `forwardRef`, y ContentsService llama ListsService al crear tipos de contenido basados en listas y carga asignaciones para operaciones editoriales. Videos importa ListsModule y usa List/ListsService; Links importa y registra List. `PaginationDto` importa `ListStatus` desde Lists, cuya ubicación no cambia en BA-14.B. `Disc` y `User` importan Asignation como entidad inversa; Disc Calendar carga `disc.asignations` y su mapper proyecta datos al resultado. La prueba de permisos de Identity importa ambos controllers. Las relaciones cruzadas dentro de las entidades, el registro del módulo y el spec de autorización tendrán que apuntar a la carpeta nueva; las specs locales de Asignations viajan con su carpeta. La búsqueda de referencias ejecutables en scripts/configuración no encontró imports adicionales; `data-source.ts` descubre entidades por glob, de modo que no contiene ruta individual que cambiar. Las migraciones no importan estas clases y quedan fuera del movimiento.
- **Grafo Nest y ciclos:** AsignationsModule importa ListsModule y AsignationsService inyecta ListsService; el sentido contrario no existe: Lists no importa AsignationsModule ni inyecta AsignationsService. No se observa un ciclo Nest entre ambos. ContentsModule importa ListsModule con `forwardRef`, pero ListsModule no importa ContentsModule, así que tampoco hay un ciclo Nest Contents↔Lists. BA-14.B conserva ese wiring existente y solo actualiza referencias a la carpeta movida. Las relaciones bidireccionales TypeORM List↔Asignation no implican un ciclo Nest.
- **Comparación de alternativas:**
  1. **A. Módulos hermanos bajo Editorial:** conserva la separación actual y mantiene claras las unidades de mantenimiento, pero deja en carpetas pares conceptos que funcionan como una unidad de listas construidas mediante asignaciones.
  2. **B. Carpetas agrupadas, módulos Nest independientes (recomendada):** expresa ownership funcional compartido, reduce dispersión para el mantenimiento de Lists y deja intactos endpoints, controllers, services, providers, tests y wiring Nest. Es un cambio de rutas/imports acotado y coherente con la regla de no fusionar módulos solo por compartir contexto.
  3. **C. Un único módulo Nest:** combina providers/controllers, pero no elimina la separación real de operaciones ni las dependencias a Contents, Catalog, Auth y servicios externos; aumentaría el alcance del cambio de DI sin beneficio funcional demostrado. No se recomienda.
- **Referencia Reunions/Points:** Points es una colección de agenda perteneciente a Reunion y se anidó manteniendo su módulo independiente. La analogía útil es agrupar por ownership sin fusionar módulos. Lists/Asignations tienen integración de publicación bidireccional y consumers externos adicionales, así que requieren actualizar más imports y no son una simple colección hija como Points.
- **Riesgos del movimiento:** imports absolutos/relativos y referencias de entidades pueden quedar obsoletos; cambiar un import incorrectamente puede alterar resolución de providers o metadata, aunque el movimiento físico no requiere modificar rutas HTTP ni esquema. Preservar el wiring `ContentsModule`→`ListsModule` con `forwardRef`, el registro de ambos módulos en AppModule, `List.asignations` eager+cascade, los efectos WordPress/Spotify y las relaciones desde Disc/User. No reorganizar archivos de Links ni adelantar el cleanup funcional pendiente de Lists.
- **Archivos/consumidores previstos para BA-14.B:** mover el contenido de `src/editorial/asignations/` a `src/editorial/lists/asignations/` (controller, service, module, entity, DTO y specs) y actualizar referencias desde `src/app.module.ts`, `src/identity/auth/entities/user.entity.ts`, `src/identity/auth/__tests__/domain-mutation-authorization.spec.ts`, `src/catalog/discs/entities/disc.entity.ts` y `src/editorial/lists/entities/list.entity.ts`. Revisar referencias internas del service/module/entity y confirmar con búsqueda que no queden imports anteriores. `PaginationDto`, Contents, Videos y Links usan rutas de Lists que permanecen iguales; Disc Calendar usa la propiedad de relación, no importa la clase ni el módulo de Asignations. Lists conserva sus archivos en la raíz de `src/editorial/lists/`.
- **Verificaciones de BA-14.A:** revisión estática de implementación completa, controllers, entidades, módulos, AppModule, Consumers y carpetas de tests/scripts; comparación con Reunions/Points y roadmaps. No se ejecutaron tests, build, typecheck, migraciones ni llamadas externas, por ser una auditoría documental. `git diff --check` se ejecutó al cierre.

#### BA-14.B — Agrupar Lists y Asignations (S)

- **Objetivo:** reflejar que las listas editoriales de Riff Valley se construyen mediante asignaciones, agrupando sus carpetas en `src/editorial/lists/` y conservando módulos Nest independientes.
- **Alcance:** mover `src/editorial/asignations/` a `src/editorial/lists/asignations/`; actualizar imports afectados, revisar rutas internas de metadata TypeORM, consumidores y pruebas; mantener `ListsModule`, `AsignationsModule` y `AppModule` como registro explícito independiente.
- **Estructura mínima propuesta:**

  ```text
  src/editorial/lists/
    list.controller.ts
    list.service.ts
    list.module.ts
    entities/
    dto/
    asignations/
      asignations.controller.ts
      asignations.service.ts
      asignations.module.ts
      entities/
      dto/
      *.spec.ts
  ```

- **Exclusiones:** fusionar módulos/services/controllers; cambiar lógica, DTOs, rutas HTTP, guards/permisos, payloads, entidades/decorators, migraciones, integraciones o frontend; reorganizar Links; ejecutar el cleanup pendiente de Lists; modificar archivos ajenos a las referencias necesarias. Mantener el nombre `Asignations`.
- **Dependencias:** BA-14.A completada; BA-6 y BA-8 completadas. No depende del cleanup funcional de Lists y no lo inicia.
- **Verificaciones de cierre:** búsqueda de imports antiguos y referencias en source/tests/scripts/configuración; build/typecheck aplicable; suites disponibles focalizadas de Lists, Asignations y consumers directos; comprobación Nest DI de ambos módulos y preservación del wiring ContentsModule→ListsModule; revisión de metadata TypeORM para List↔Asignation y relaciones inversas de Disc/User; rutas/guards sin cambios; `git diff --check`. No ejecutar migraciones ni contactar WordPress/Spotify/PostgreSQL.
- **Criterios de cierre:** carpetas bajo `src/editorial/lists/`; ambos módulos Nest continúan independientes y registrados una vez; no quedan imports rotos ni referencias antiguas ejecutables; rutas, permisos, respuestas, eager/cascade, metadata y efectos de publicación permanecen equivalentes; no hay cambios de esquema, negocio, frontend ni cleanup de Lists.
- **Archivos movidos:** los 6 archivos de producción (`asignations.controller.ts`, `asignations.service.ts`, `asignations.module.ts`, dos DTO y la entidad) y los 2 specs locales quedaron en `src/editorial/lists/asignations/`. Se usó un movimiento de carpeta completo; los cambios locales existentes de `asignations.service.ts`, `create-asignations.dto.ts` y ambos specs se conservaron.
- **Imports actualizados:** `AppModule`; las relaciones de `Disc`, `User` y `List`; y `domain-mutation-authorization.spec.ts`. Los imports relativos internos y los specs locales se mantienen dentro de la carpeta trasladada. Contents, Videos, Links y `PaginationDto` continúan importando Lists desde la misma ruta; Disc Calendar usa `disc.asignations` y no importaba la carpeta/módulo de Asignations. No quedan imports ejecutables a `src/editorial/asignations/` ni a la ruta antigua `src/asignations/`.
- **Contratos y comportamiento preservados:** `AsignationsModule` y `ListsModule` se registran por separado en `AppModule`; no se creó un módulo contenedor. Se conservaron nombres, endpoints, métodos, guards/permisos, DTOs, lógica, queries, providers, relaciones TypeORM y opciones `eager`/`cascade`, incluyendo la llamada a ListsService que sincroniza WordPress. No se tocaron integraciones Spotify, frontend, migraciones ni esquema; Lists y Links permanecen en sus ubicaciones y responsabilidades actuales.
- **Verificaciones ejecutadas:** 9 suites focalizadas de Lists, Asignations y consumers directamente afectados (219 tests); `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; comprobación aislada de metadata TypeORM para List↔Asignation y relaciones eager/onDelete; inspección de metadata Nest que confirma el registro separado de ambos módulos en AppModule y la importación ListsModule desde AsignationsModule; búsqueda de imports antiguos; `git diff --check`. Prettier pasó en los archivos propios de referencias salvo `src/catalog/discs/entities/disc.entity.ts`, cuya falta de formato también se confirma en `HEAD`; no se reformateó ese hallazgo preexistente. No se accedió a PostgreSQL ni a servicios externos.
- **Criterios de cierre:** ubicación definitiva bajo `src/editorial/lists/asignations/`; ambos módulos Nest independientes y registrados una vez; rutas, permisos, respuestas, metadata y efectos sin cambios; sin imports ejecutables antiguos ni cambios de esquema, negocio, frontend o cleanup de Lists.
- **Estado:** completada (2026-10-16). No se avanzó al cleanup de Lists.

## Orden recomendado

1. **BA-1 — i18n**, traslado aislado.
2. **BA-2 — `/catalog` y utilidades comunes**, independiente de Identity y listo antes de cambiar imports compartidos.
3. **BA-3 — Identity/Auth**, primero entre los módulos funcionales porque muchos providers consumen Auth.
4. **BA-4 — Seeds/Uploads** y **BA-5 — News/National Releases**, en cualquier orden o en paralelo después de BA-3.
5. **BA-6 — Lists/Links**, primero en el grupo cíclico; actualiza consumidores que aún viven en sus carpetas actuales.
6. **BA-7 — Contents/Articles/Videos/Reunions**, después de BA-6 para cerrar los ciclos existentes con referencias consistentes. Points permanece temporalmente en su ruta actual.
7. **BA-8 — Asignations/Points**, después de BA-6 y BA-7: Asignations ya conoce la nueva ruta de Lists y Points puede seguir la nueva ruta de Reunions.
8. **BA-9 — Riff Valley Playlists**, después de BA-7; actualiza el módulo local y sus consumers, incluido Festival Playlists.
9. **BA-10 — Festival Playlists**, después de BA-9; traslada solo ese módulo y conserva su independencia.
10. **BA-12 — Versions, Suggestions y News**, después de BA-3, BA-5 y BA-7; es independiente de BA-9/BA-10.
11. **BA-13 — Cierre global de arquitectura**, después de BA-1 a BA-10 y BA-12. Incluye la regresión Editorial/Identity planificada originalmente como BA-11.

Las dependencias expresan un orden ejecutable sin ciclos entre tareas: BA-6 → BA-7 → BA-8 elimina los bloqueos de secuencia sin exigir extraer o romper los ciclos Nest actuales; BA-9 → BA-10 resuelve la dependencia del consumer en una sola dirección; BA-12 depende de BA-3, BA-5 y BA-7, y es independiente de BA-9/BA-10. BA-11 conserva su identificador, pero no agrega una tarea ni una dependencia; sus criterios se verifican dentro de BA-13. Mantener separados agrupación física y refactor funcional, que tiene roadmaps propios.

## Criterio de cierre

El plan queda implementado cuando todos los módulos tienen ubicación primaria decidida, el árbol final concuerda con «Estructura objetivo», no quedan referencias de imports a ubicaciones antiguas, Nest resuelve todos los providers/cycles vigentes, TypeORM descubre entidades sin cambios de metadata/schema, y se conservan rutas, guards, permisos, payloads, jobs y efectos externos. Cada excepción se documenta con ownership y motivo. El cierre no exige eliminar archivos raíz de arranque, fusionar módulos, introducir agregadores, ni resolver ciclos/deuda que no sean efecto directo de mover archivos.

## Relación con roadmaps existentes

Catalog, Community, Integrations e Integrations Cleanup mantienen sus documentos y resultados como historial. Este roadmap solo planifica la ubicación global. Los roadmaps Spotify/roles y los de features conservan sus contratos, decisiones de ownership y evidencia; la futura reorganización no reabre sus fases cerradas.
