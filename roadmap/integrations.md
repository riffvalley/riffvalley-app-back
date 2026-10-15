# Roadmap de Integrations

## Contexto y objetivos

El backend de Riff Valley debe agrupar el código cuyo ownership principal sea comunicarse con servicios externos, conservando las features y dominios que consumen esas comunicaciones. `src/integrations/` será una frontera física para módulos NestJS concretos; no será una arquitectura por capas ni un módulo NestJS agregador.

La organización del código existente da una guía: Catalog está agrupado directamente bajo `src/catalog/`, por dominios (`artists/`, `discs/`, `countries/`, `genres/`, `import/`) y con subcarpetas por responsabilidad donde el volumen lo justifica. Integrations seguirá el mismo enfoque directo: `src/integrations/<provider>-integration/`, con la estructura interna propia de cada proveedor.

La primera implementación, habilitada por el cierre de Spotify S.9, trasladó `spotify-integration` a la carpeta común. El inventario y las decisiones de ownership de este documento se basan en el código actual; las tareas pendientes describen cambios futuros y no modifican contratos, configuración sensible ni persistencia.

## Inventario de integraciones

Las rutas HTTP listadas abajo incluyen el prefijo global `/api`. Solo se anotan nombres de variables de entorno; no se copian valores ni secretos.

### Spotify

- **Ubicación y piezas:** `src/integrations/spotify-integration/` contiene `SpotifyIntegrationModule`, `api/`, `http/`, `oauth/` e `index.ts`. `api/` implementa Client Credentials y la API pública; `oauth/` implementa OAuth, operaciones autenticadas, cifrado y `SpotifyConnection`; `http/` contiene los DTOs y controllers de proxy.
- **Responsabilidad y configuración:** acceso público con Client Credentials, cuenta autenticada y OAuth; variables `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `SPOTIFY_TOKEN_ENCRYPTION_KEY`, `SPOTIFY_FRONTEND_REDIRECT_URL` y el destinatario opcional `SPOTIFY_REAUTH_NOTIFICATION_EMAIL`. El recordatorio usa `MailService`.
- **Consumidores y dependencias:** `FestivalPlaylistsModule`, `ListsModule`, `ContentsModule` y `DiscModule` importan el módulo o sus providers; la orquestación de playlist local continúa en Festival Playlists y `RiffValleyPlaylist`. `AppModule` registra el módulo raíz. Hay referencias de pruebas en Catalog Import y en la prueba de separación del controller de `RiffValleyPlaylist`.
- **Endpoints propios:** `GET /api/spotify/artists/search`, `/search/multiple`, `/:spotifyId/top-tracks`, `/:spotifyId/albums`, `/:spotifyId/images` y `GET /api/spotify/albums/:spotifyAlbumId/most-popular-track`. Festival Playlists conserva sus rutas de workflow `/api/festival-playlists/spotify/connect`, `/spotify/callback`, `/spotify/connection` (GET/DELETE): el callback/orquestación y redirect son de la feature, aunque usen el OAuth provider. Preservar validaciones, respuestas, permisos y rutas al mover el módulo.
- **Persistencia, tests y dispersión:** `SpotifyConnection` y su metadata TypeORM pertenecen a las credenciales de la cuenta externa. Hay tests de Client Credentials, API pública, OAuth, Account API, DTO/controller y suites de consumers en Catalog, Contents, Lists, Festival Playlists y playlist local. S.9 está completada. La comunicación Spotify ya está agrupada; el traslado pendiente es estructural. No se identificó una segunda implementación de transporte que deba fusionarse.
- **Riesgo:** actualizar todos los imports, incluido el barrel `index.ts`, specs y `AppModule`; mantener el registro TypeORM de `SpotifyConnection` y los controllers bajo el prefijo vigente. No mover lógica de dominio ni ejecutar migraciones.

### WordPress

- **Ubicación y piezas:** `src/wordpress/wordpress.module.ts` y `wordpress.service.ts`; el servicio implementa `createPost`, `getPost`, `updatePostContent`, `findPostBySlug`, `findAuthorBySlug` y `getOrCreateTag` mediante WordPress REST API.
- **Responsabilidad y autenticación:** publicación y lectura autenticadas con Basic Auth (`WP_USER`, `WP_APP_PASSWORD`, `WP_API_URL`). El endpoint REST por defecto está escrito en el código como `https://riffvalley.es/wp-json/wp/v2`.
- **Consumidores y dependencias:** `ListsModule` importa el módulo y `ListsService` crea/actualiza publicaciones y tags. `DiscsModule` también importa `WordpressModule`, aunque no se localizó un uso de `WordpressService` en Discs; verificar ese edge en la tarea, sin darlo por necesario ni eliminarlo sin evidencia. `NewsService` hace aparte una lectura pública de posts WordPress, sin autenticación, con caché en memoria.
- **Endpoints propios:** no tiene controller HTTP propio. Se invoca desde operaciones de Lists; News expone sus propios endpoints y compone ahí la lectura externa.
- **Tests, duplicación y riesgo:** `ListsService` tiene tests que mockean `WordpressService`, pero no se encontró un spec dedicado del cliente REST ni de `NewsService`. La lectura pública de News duplica el host/ruta REST fuera del módulo. Al unificar el transporte, preservar la lectura anónima, la caché y el contrato de News, además de los errores y respuestas del flujo de publicación.
- **Configuración no confirmada:** `.env.template` contiene `WP_GRAPHQL_URL`, pero no se localizó uso runtime; el código inspeccionado usa REST y `WP_API_URL`. No asumir que GraphQL está activo.

### Last.fm

- **Ubicación y piezas:** `src/lastfm/` contiene `LastfmModule`, `LastfmController` y un `LastfmService` que mezcla llamadas HTTP a Last.fm con una operación de Catalog.
- **Responsabilidad y autenticación:** `GET /2.0/` para `artist.getinfo` y `album.getinfo`, usando `LASTFM_API_KEY` en la query. Las respuestas y errores se traducen dentro del servicio.
- **Consumidores y dependencias:** `LastfmModule` importa `AuthModule` y `DiscModule`; `LastfmService.fillWeeklyImages` consulta `DiscsService.findWeeklyWithoutImage` y guarda imágenes mediante `updateImage`. El controller conserva la API del backend: `GET /api/lastfm/artist` es de lectura y `POST /api/lastfm/fill-images` requiere `superadmin`.
- **Tests, dispersión y riesgo:** existe `lastfm.controller.spec.ts` para metadata de autorización/ruta, pero no se encontró un spec de `LastfmService` ni de su transporte. Mover el módulo entero invertiría la dependencia Integrations → Catalog. Extraer solo el cliente Last.fm y dejar controller/orquestación/escrituras en Last.fm/Catalog mantiene la dirección correcta y el contrato HTTP.

### TikTok

- **Ubicación y piezas:** `src/tiktok/` contiene módulo, controller, DTOs, `TiktokService`, `TiktokTokenCryptoService` y las entidades `TiktokConnection` y `TiktokVideo`. El servicio combina OAuth/API con ciclo de vida de la conexión, sincronización programada y lectura de registros locales.
- **Responsabilidad y configuración:** OAuth y API v2 (`user.info.basic`, `video.list`), refresh, cifrado de tokens, cron de sincronización y recordatorio de reautorización. Variables: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_TOKEN_ENCRYPTION_KEY`, `TIKTOK_SYNC_CRON`, `TIKTOK_FRONTEND_REDIRECT_URL` y `TIKTOK_REAUTH_NOTIFICATION_EMAIL`.
- **Consumidores y dependencias:** se registra desde `AppModule`; no se encontró un consumer Nest interno aparte de sus propios controllers/jobs. Depende de `AuthModule`, TypeORM para las dos entidades y `MailModule` para recordatorios. La UI consume su API.
- **Endpoints propios:** `POST /api/tiktok/connect`, `GET /api/tiktok/callback`, `GET` y `DELETE /api/tiktok/connection`, `GET /api/tiktok/videos` y `GET /api/tiktok/videos/:tiktokVideoId`. Las rutas protegidas y públicas tienen contratos distintos que deben preservarse.
- **Tests, dispersión y riesgo:** existe `tiktok.controller.spec.ts` y README de configuración; no hay spec localizado de `TiktokService`, OAuth/API, cifrado ni sincronización. No se separa hoy un cliente HTTP. Al trasladar, conservar entities/table metadata, cron, redirect/callback, scopes, cifrado, guards y envío de correo; no hacer cambios de schema.

### Instagram / Meta Graph y Heroku Platform API

- **Ubicación y piezas:** `src/integrations/instagram-integration/` contiene `InstagramIntegrationModule`, controller, DTO, `InstagramService` y `InstagramPost`. El servicio pagina Graph API, actualiza el cache local, renueva token con cron y persiste el token.
- **Responsabilidad y configuración:** Graph API usa `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`, `IG_GRAPH_API_VERSION` e `IG_SYNC_CRON`. La persistencia opcional utiliza `IG_HEROKU_API_TOKEN` y `IG_HEROKU_APP_NAME` para hacer `PATCH /apps/:app/config-vars` a Heroku Platform API; en local el código escribe `.env`.
- **Consumidores y dependencias:** `InstagramIntegrationModule` se registra en `AppModule`; no se localizó un consumer Nest adicional. El controller conserva el endpoint que consume la UI. TypeORM persiste `InstagramPost`, que es una copia/cache de medios remotos y URLs firmadas, no el dominio editorial general de Riff Valley.
- **Endpoints propios:** `GET /api/instagram/posts`, sin guard declarado en su controller. El cron sincroniza posts cada 10 minutos por defecto y renueva token semanalmente.
- **Tests, dispersión y riesgo:** I.5 añadió specs de servicio, controller y módulo. Las pruebas cubren respuesta Graph y paginación/upsert, actualización de URLs firmadas, respuesta de caché, errores de autenticación, refresh y persistencia Heroku/`.env` con dobles; no se leen/escriben secretos reales ni se contacta a los proveedores. No se cambia la configuración ni el schema.

### Telegram (lectura de páginas públicas)

- **Ubicación y piezas:** `src/telegram/` contiene módulo, controller, DTOs y `TelegramService`, que obtiene y parsea HTML de `https://t.me/s/<channel>`; mantiene caché en memoria durante 15 minutos. No usa un bot token ni el Telegram Bot API.
- **Consumidores y endpoints:** `NewsModule` importa `TelegramModule`; `NewsService` usa `getChannelPosts` para una fuente de noticias. El módulo expone `GET /api/telegram/channel-posts` (guard `riffvalley`) y `GET /api/telegram/posts` (público). No hay configuración/token externo identificado.
- **Tests y riesgo:** existe `telegram.controller.spec.ts`, pero no un test localizado del parser/caché/HTML remoto. La estructura es pequeña y puede trasladarse completa si se preserva la API HTTP, el guard, parser, caché y export usado por News. El HTML público es un formato remoto cambiante; las verificaciones deben usar fixtures y no depender de llamadas en vivo.

### Setlist.fm

- **Ubicación y responsabilidades:** llamada HTTP puntual en `FestivalPlaylistsService.getTopSongs`, dentro de `src/festival-playlists/`. Obtiene setlists recientes, normaliza canciones y calcula frecuencias para la regla de sincronización.
- **Autenticación, consumers, dependencias y endpoints:** usa `SETLISTFM_API_KEY` en `x-api-key`. Se expone bajo `GET /api/festival-playlists/artists/top-songs` (guard `@Auth()`), y se consume también al sincronizar una playlist de festival que consulta Spotify y persiste su estado local. No existe módulo o cliente Setlist.fm independiente.
- **Tests, dispersión y decisión:** `festival-playlists.service.spec.ts` cubre orden de setlists, deduplicación por concierto, canciones de cinta y errores/resultados. La llamada es exclusiva de una feature y el algoritmo de agregación depende de esa regla. Mantenerla en Festival Playlists por ahora; crear un adapter propio solo si aparecen reutilización u operaciones independientes que lo justifiquen.

### Bandcamp

- **Ubicación y responsabilidades:** método privado `searchBandcamp` en `src/contents/content-scheduler.service.ts`. Hace scraping HTML de búsqueda pública con `fetch` y Cheerio, como fallback entre búsquedas Spotify para completar un link de álbum.
- **Autenticación, consumers, dependencias y endpoints:** no usa credenciales ni tiene endpoint propio. Solo lo invoca el cron `ContentSchedulerService`, que consulta Disc/Artist local, usa Spotify como búsqueda primaria y guarda los metadatos encontrados.
- **Tests, dispersión y decisión:** `content-scheduler.service.spec.ts` comprueba el orden de fallbacks mediante el mock del método privado; no se encontró test dedicado al parser HTML de Bandcamp. Mantenerlo local al scheduler mientras siga siendo un único fallback pequeño. El HTML externo puede cambiar y el scraping está sujeto a ese riesgo; no crear módulo solo por usar Cheerio.

### Cloudflare R2 (S3 compatible)

- **Ubicación y responsabilidades:** `src/platform/uploads/uploads.service.ts` instancia `S3Client` y ejecuta `PutObjectCommand`; el endpoint, bucket y URL pública están codificados allí. `UploadsController` aplica el contrato HTTP, el límite de 5 MB, filtro de imagen y autorización.
- **Autenticación, consumers y endpoints:** usa `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`. `UploadsModule` se registra en `AppModule`; no se encontró otro consumer del servicio. `POST /api/uploads/image` requiere `superadmin`.
- **Tests y riesgo:** existe `uploads.controller.spec.ts`, pero no spec del servicio/cliente R2. Propuesta: mover solamente el cliente/operación de almacenamiento a Cloudflare R2 Integration y mantener `UploadsController`, validación, autorización y forma de respuesta en `uploads/`. Conservar bucket/key/URL, MIME y errores; no cambiar los endpoints ni el contrato del objeto devuelto.

### Correo SMTP

- **Ubicación y responsabilidades:** `src/mail/` contiene `MailModule` y `MailService`, que configura Nodemailer usando `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS` y `MAIL_TO`. Envía avisos de Access Requests, National Releases y reautorización de Spotify/TikTok.
- **Consumidores y dependencias:** `AccessRequestsModule`, `NationalReleasesModule`, `FestivalPlaylistsModule` y `TiktokModule`. `MailService` importa `CreateNationalReleaseDto`, así que combina envío SMTP con contenido/contrato de una feature.
- **Endpoints y tests:** no expone endpoints propios y no se encontró spec del servicio SMTP.
- **Decisión y riesgo:** es una comunicación externa real, pero no mover `MailService` entero: introduciría dependencia de una integración hacia un DTO de dominio y trasladaría plantillas/mensajes de la aplicación. Mantener notificaciones en `src/mail/`; diferir la extracción del transporte SMTP hasta diseñar y caracterizar una frontera que deje la composición de mensajes con los consumers. No añadir una capa genérica de email como parte de otros traslados.

### Cobertura del inventario y librerías

La revisión de llamadas de red y clientes en `src/` encontró los proveedores enumerados arriba: Spotify, WordPress, Last.fm, TikTok, Meta/Instagram, Heroku Platform API, páginas públicas de Telegram, Setlist.fm, Bandcamp, Cloudflare R2 y SMTP. No se encontró una integración runtime con YouTube, Google u otro API/SDK en el código inspeccionado. `fetch`, Cheerio, Nodemailer, AWS SDK, TypeORM, NestJS y `uuid` son mecanismos/dependencias: solo se clasifican las comunicaciones concretas y sus owners, no cada paquete externo por separado.

## Decisiones de ownership

- **Integrations:** comunicación, autenticación/tokens, cliente/adaptador y tipos estrictamente remotos del proveedor. Estado persistido específico de una cuenta/proveedor puede acompañar su integración si se conserva la metadata TypeORM y no se cambia el schema.
- **Dominios y consumers fuera:** `RiffValleyPlaylist` y sus CRUD/relaciones, Catalog, Contents y scheduler, Festival Playlists, Lists, News, Uploads, Access Requests y National Releases. Conservan reglas, consultas, composición de contenido, validación HTTP y respuestas propias; importan el módulo/provider cuando corresponda.
- **Mover como módulos de proveedor:** Spotify, WordPress, TikTok, Instagram y Telegram. Mantener los controllers de integración que hoy exponen su API interna al backend donde el controller pertenezca a la superficie pública, preservando rutas y guards.
- **Last.fm:** trasladar solo el cliente y tipos Last.fm. Dejar `LastfmController`, la coordinación de `fillWeeklyImages` y las llamadas `DiscsService` fuera para evitar que la integración importe Catalog.
- **Cloudflare R2:** trasladar cliente/escritura de objetos; mantener el endpoint y reglas de subida en `uploads/`.
- **No crear módulos aún:** Setlist.fm y Bandcamp permanecen en sus consumers por ser llamadas puntuales y específicas de la feature. El transporte SMTP queda aplazado por la mezcla observada con composición de notificaciones.
- **No crear agregador NestJS:** `src/integrations/` solo agrupa módulos independientes. `AppModule` y los consumers importan cada módulo directamente; no introducir `IntegrationsModule`, registry ni proveedor genérico multi-provider.

## Estructura objetivo propuesta

```text
src/
  integrations/
    spotify-integration/
      api/
      http/
      oauth/
    wordpress-integration/
    telegram-integration/
    lastfm-integration/       # cliente API y tipos remotos
    tiktok-integration/       # API/OAuth, token y estado específico TikTok
    instagram-integration/    # Graph API y estado/cache específico Instagram
    cloudflare-r2-integration/
    smtp-integration/         # transporte, si I.7 confirma la frontera caracterizada
  catalog/                    # permanece como dominio/consumer
  contents/                   # permanece como dominio/consumer
  festival-playlists/         # permanece como dominio/consumer
  lists/                      # permanece como dominio/consumer
  news/                       # permanece como consumer WordPress/Telegram
  riff-valley-playlists/      # dominio local; fuera de integrations/
  uploads/                    # endpoint, autorización y validación locales
  mail/                       # composición de notificaciones; SMTP aplazado
```

Las subcarpetas internas de cada módulo se decidirán por su contenido real y conservarán el layout vigente cuando se traslade. No crear carpetas vacías ni renombrar entidades/contratos sin una decisión y tarea específicas.

## Reglas generales

- Antes de cada movimiento, fijar mediante tests el comportamiento aplicable: rutas, guards, DTOs, payloads, errores, caché, orden, efectos externos y metadata TypeORM.
- Mover la implementación existente; no duplicarla. Actualizar imports, providers, exports, dependencias Nest y specs afectados.
- Usar nombres de módulo `<Provider>IntegrationModule` (`SpotifyIntegrationModule`, `WordpressIntegrationModule`, `TiktokIntegrationModule`, etc.). No renombrar services o símbolos públicos salvo ambigüedad demostrada y decisión documentada.
- Mantener `/api`, contratos, permisos, configuración de credenciales, cifrado, cron y efectos remotos. No hacer llamadas en vivo a proveedores para las pruebas.
- No realizar cambios de schema o migraciones por un traslado de carpeta. Si se modifica metadata TypeORM, demostrar que los nombres físicos y las relaciones no cambian; no conectar a producción.
- No leer/copiar secretos ni escribir `.env`, Heroku config vars u otra configuración externa durante las tareas de estructura.
- No mover consumidores ni reglas de dominio, añadir abstracciones multi-provider o corregir deuda preexistente como parte de un traslado.
- Reportar hallazgos contractuales antes de cambiar comportamiento. Mantener hallazgos preexistentes, desconocidos y fuera de alcance sin corregirlos ni suprimirlos ni alterar `.impeccable/config.json`.
- Ejecutar por tarea las pruebas focalizadas, build/typecheck y `git diff --check` pertinentes con Yarn; atribuir fallos nuevos frente a los baselines existentes.

## Tareas

### I.0 — Trasladar Spotify Integration a la carpeta común

- **Estado:** Completada (2026-10-14).
- **Objetivo:** crear `src/integrations/` y alojar allí el módulo Spotify ya separado y cerrado por S.9.
- **Alcance:** trasladar `src/spotify-integration/` a `src/integrations/spotify-integration/`, manteniendo `api/`, `http/`, `oauth/`, `index.ts`, módulo, controllers, servicios, tipos, entity y specs. Actualizar imports de `AppModule`, Festival Playlists, Lists, Contents, Catalog/Discs y pruebas consumidoras.
- **Exclusiones:** no mover `RiffValleyPlaylist`, Festival Playlists ni Catalog; no crear un módulo agregador; no cambiar endpoints, DTOs, permisos, OAuth, configuración, entity metadata o persistencia.
- **Dependencias:** Spotify S.9 completada (confirmada en `roadmap/spotify.md`). Es la primera implementación de este roadmap.
- **Criterios de aceptación:** Spotify queda bajo `src/integrations/spotify-integration/`; Nest resuelve providers y `SpotifyConnection`; consumers compilan; rutas `/api/spotify/*`, respuestas y behavior siguen iguales; no quedan imports a la ubicación anterior.
- **Verificaciones:** specs de API Client Credentials, API pública, OAuth, Account API, HTTP/DTO y consumers de Catalog/Discs, Contents, Lists, Festival Playlists y playlist local; prueba modular/DI; build, typecheck y `git diff --check` con Yarn. No ejecutar migraciones.
- **Tamaño estimado:** S.
- **Resultado y evidencia:** se trasladó el módulo completo a `src/integrations/spotify-integration/`, conservando `api/`, `http/`, `oauth/`, providers, exports, metadata TypeORM y rutas HTTP. Se actualizaron `AppModule` y las referencias de Catalog/Discs, Catalog Import, Contents, Lists, Festival Playlists, RiffValleyPlaylist y los imports internos del módulo. `RiffValleyPlaylist` permanece en `src/riff-valley-playlists/`. `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasan. 17 suites focalizadas pasan (119 tests), incluidas Spotify, Catalog/Discs e Import, Contents, Lists, Festival Playlists y los contratos HTTP Spotify, Disc/Spotify y RiffValleyPlaylist; al correr dentro del sandbox, la suite HTTP de Spotify no pudo abrir el listener (`EPERM`), y pasa al repetir el grupo fuera del sandbox con el permiso local requerido, siguiendo S.9. La inspección de imports no encuentra referencias runtime a `src/spotify-integration/`; revisión de módulos confirma que Spotify exporta los mismos providers/TypeOrmModule y los consumers importan el módulo, sin nueva dependencia inversa. `git diff --check` pasa. El log de `AuthGuard`/`PassportModule` aparece como aviso conocido en la suite de contrato Disc/Spotify, que pasa y no es atribuible al traslado. No se ejecutaron migraciones ni se accedió a bases de datos.

### I.1 — Trasladar el cliente WordPress y consolidar la lectura de News

- **Estado:** Completada (2026-10-14).
- **Objetivo:** agrupar la comunicación REST de WordPress y eliminar el transporte duplicado en News sin alterar la API de News o Lists.
- **Alcance:** mover el cliente REST de `src/wordpress/` a `src/integrations/wordpress-integration/` y nombrar el módulo `WordpressIntegrationModule`; ajustar consumers `ListsService` y `NewsService`. Añadir al módulo de integración la lectura pública que hoy hace `NewsService`, manteniendo en News la caché y composición de la respuesta. Verificar el edge de `DiscsModule` hacia `WordpressModule` antes de actualizarlo o retirarlo.
- **Exclusiones:** no mover Lists, News, Disc/Catalog ni composición editorial; no cambiar Basic Auth, variables WordPress, rutas, payloads, caché, efectos de publicación o GraphQL; no implementar el uso de `WP_GRAPHQL_URL` sin evidencia.
- **Dependencias:** I.0 (carpeta común creada).
- **Criterios de aceptación:** Lists conserva publicación/edición y manejo actual de posts/tags; News conserva su contrato, respuesta pública y TTL; solo queda un owner para el acceso REST, con las diferencias entre Basic Auth y lectura pública explícitas; DI y todos los imports resuelven.
- **Verificaciones:** tests de Lists, tests/caracterización de respuesta y caché de News, revisión de los consumers reales, HTTP mockeado, build, typecheck y `git diff --check` con Yarn.
- **Tamaño estimado:** M.
- **Resultado y evidencia:** se movieron `WordpressService` y su módulo a `src/integrations/wordpress-integration/`; el módulo ahora se llama `WordpressIntegrationModule` y conserva la exportación de `WordpressService`. Lists importa el nuevo módulo y mantiene su lógica de publicación, edición y tags. News consume `getPublicPosts()` del mismo cliente: esa llamada sigue siendo anónima, mientras las operaciones de Lists conservan Basic Auth; la caché de News (10 minutos), el manejo de errores y el mapeo/respuesta de `getFeed` y `getSourceFeed` permanecen en News. Se retiró el import de WordPress en `DiscModule` tras comprobar que ningún servicio de Discs consume `WordpressService`. No queda transporte REST duplicado fuera de Integrations ni duplicación pendiente por razones técnicas. `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasan. Las 6 suites focalizadas de WordPress, News, Lists y Discs pasan (42 tests), incluida la resolución del provider exportado mediante `WordpressIntegrationModule`. La búsqueda no encuentra imports a `src/wordpress`, `WordpressModule` ni una segunda llamada REST de WordPress fuera del módulo; Lists y News importan el módulo proveedor y Discs ya no tiene la dependencia innecesaria. `git diff --check` pasa. No se ejecutaron migraciones ni llamadas a WordPress real.

### I.2 — Trasladar Telegram Integration

- **Estado:** Completada (2026-10-14).
- **Objetivo:** agrupar la lectura y adaptación de las páginas públicas `t.me` en un módulo de proveedor.
- **Alcance:** mover el servicio/parser, DTOs, controller y módulo de `src/telegram/` a `src/integrations/telegram-integration/`, con módulo `TelegramIntegrationModule`; actualizar `NewsModule` y `AppModule` como consumers.
- **Exclusiones:** no implementar Telegram Bot API/webhooks ni credenciales que no existen; no mover `NewsService`; no cambiar rutas, roles, resultados, paginación, parser o TTL de caché.
- **Dependencias:** I.0.
- **Criterios de aceptación:** los dos endpoints actuales mantienen paths, autenticación y respuesta; `NewsService` sigue usando el módulo exportado; parser, cache y controller pasan pruebas sin depender de red.
- **Verificaciones:** test de controller existente, añadir tests de parser/caché con HTML fixture, prueba de DI de News, build, typecheck y `git diff --check` con Yarn.
- **Tamaño estimado:** S.
- **Resultado y evidencia:** se trasladaron el servicio (incluidos parser, caché y paginación), controller, sus dos DTOs, módulo y spec a `src/integrations/telegram-integration/`, con `TelegramIntegrationModule` como módulo proveedor. Se actualizaron `AppModule` y `NewsModule`; `NewsService` continúa inyectando el `TelegramService` exportado y mantiene su mapeo de negocio. Las rutas, DTOs, roles y respuestas del controller no cambiaron. El único transporte encontrado es `fetch` del HTML público `https://t.me/s/...` procesado con Cheerio; no se usa Telegram Bot API ni hay credenciales o timeout configurados. Las pruebas con HTML simulado cubren mensajes válidos, orden, imágenes agrupadas, HTML vacío/inesperado, caché de 15 minutos, paginación `before`, HTTP no exitoso y recurso inaccesible; verifican también el mapeo consumido por News y las dependencias declaradas entre integración, News y Auth. Build y typecheck con Yarn pasan; 4 suites focalizadas pasan (16 tests). La búsqueda no encuentra imports a `src/telegram` ni `TelegramModule`; `git diff --check` pasa. No se hicieron llamadas reales a Telegram ni migraciones.

### I.3 — Separar cliente Last.fm del caso de uso de Catalog

- **Estado:** Completada (2026-10-14).
- **Objetivo:** mover el transporte y los tipos Last.fm sin invertir la dependencia con Discs.
- **Alcance:** crear `src/integrations/lastfm-integration/` y `LastfmIntegrationModule` con cliente y types específicos; consumirlo desde el módulo local `src/lastfm/`. Mantener ahí `LastfmController` y el caso de uso de rellenar imágenes, que coordina lecturas/escrituras con `DiscsService`.
- **Exclusiones:** no mover Catalog/Discs ni hacer que la integración dependa de `DiscModule`; preservar `LASTFM_API_KEY`, rutas, roles, errores y payloads.
- **Dependencias:** I.0.
- **Criterios de aceptación:** `GET /api/lastfm/artist` y `POST /api/lastfm/fill-images` mantienen respuesta y permisos; integración no importa Catalog; el caso de uso local actualiza las mismas imágenes y métricas.
- **Verificaciones:** añadir tests del cliente para respuestas y errores Last.fm, tests de coordinación con `DiscsService`, spec de controller existente, DI, build, typecheck y `git diff --check` con Yarn.
- **Tamaño estimado:** M.
- **Resultado y evidencia:** se creó `src/integrations/lastfm-integration/` con `LastfmIntegrationModule`, `LastfmApiService` y tipos de las respuestas remotas. El cliente conserva las llamadas `artist.getinfo` y `album.getinfo`, `LASTFM_API_KEY`, la selección `mega` → `extralarge` → `large`, los errores de artista y el fallback `null` de álbum ante errores/respuestas sin imagen. `LastfmService` permanece en `src/lastfm/` y conserva la consulta de discos semanales, las escrituras por `DiscsService.updateImage`, el conteo y `notFound`; `LastfmModule` importa el módulo proveedor además de `DiscModule` y `AuthModule`. Controller, rutas, permisos, DTOs y respuestas públicas no cambiaron. Las pruebas usan `fetch` simulado: 5 suites de Last.fm pasan (15 tests), incluidas respuesta/error/transporte, coordinación Catalog, autorización/controller, provider exportado y wiring Nest del módulo consumer. Las 2 suites focalizadas de Discs pasan (20 tests). `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasan. La búsqueda confirma que el transporte Last.fm solo está en `LastfmApiService`, la integración no importa Catalog y no hay imports a ubicaciones obsoletas. `git diff --check` pasa. Yarn mostró avisos de caché/global no escribibles, sin afectar los comandos. No se hicieron llamadas reales a Last.fm, migraciones ni conexiones a base de datos.

### I.4 — Trasladar TikTok Integration

- **Estado:** Completada (2026-10-14).
- **Objetivo:** alojar OAuth/API y estado específico del proveedor dentro de la frontera común.
- **Alcance:** trasladar módulo, controller/DTOs, servicio, token crypto, entidades y specs existentes a `src/integrations/tiktok-integration/`, con módulo `TiktokIntegrationModule`; actualizar `AppModule` y las dependencias Nest requeridas (`AuthModule`, `MailModule`, TypeORM).
- **Exclusiones:** no cambiar callbacks/redirecciones, scopes, contratos, guards, cron, notificaciones, cifrado, nombres físicos o persistencia; no mover Mail ni construir cliente genérico de OAuth.
- **Dependencias:** I.0.
- **Criterios de aceptación:** endpoints `/api/tiktok/*`, callback OAuth, conexión, sync de videos y detalle conservan comportamiento; metadata de `TiktokConnection` y `TiktokVideo` no cambia; no aparecen ciclos de módulos.
- **Verificaciones:** controller y nuevas pruebas focalizadas de token/API/sync/repository con red mockeada, revisión TypeORM sin DB/migraciones, build, typecheck y `git diff --check` con Yarn.
- **Tamaño estimado:** M.
- **Resultado y evidencia:** se trasladó `src/tiktok/` a `src/integrations/tiktok-integration/`, incluidos controller, DTO, `TiktokService`, `TiktokTokenCryptoService`, `TiktokConnection`, `TiktokVideo`, README y pruebas. El módulo se llama `TiktokIntegrationModule`; `AppModule` registra su nueva ubicación. Mantiene `ConfigModule`, `TypeOrmModule.forFeature` para las dos entidades, `AuthModule` y `MailModule`; no hay dependencia circular. `MailService` sigue enviando el aviso de reautorización desde la integración, sin mover la composición de emails. El inventario confirmó OAuth de autorización/callback, intercambio y refresh de tokens, `user/info`, `video/list` paginado (máximo 20 páginas), cifrado AES-256-GCM, hash SHA-256 de state, persistencia/upsert de conexión y cache de videos, sin endpoint de publicación ni consumidor interno fuera de `AppModule`. Se mantienen scopes, nombres de variables, redirects, guards, rutas `/api/tiktok/*`, respuestas, manejo de `invalid_grant`, cron diario de aviso y cron de sync (`TIKTOK_SYNC_CRON` o cada 10 minutos); no se modificaron entidades ni migraciones. Se añadieron pruebas simuladas para requests OAuth, perfil, refresh/rotación e invalidación de tokens, paginación y upsert de videos, errores API, respuestas de repositorio, cifrado, wiring de módulo y contratos/guards del controller. Las 4 suites focalizadas pasan (13 tests); `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasan. La búsqueda de imports antiguos (`src/tiktok`, `./tiktok/`, `TiktokModule`) no encuentra referencias; inspección de metadata confirma registro TypeORM de ambas entidades. `git diff --check` pasa. Yarn mostró avisos de caché/global no escribibles, sin afectar los comandos. No se llamaron APIs reales, ejecutaron migraciones ni accedió a producción.

### I.5 — Trasladar Instagram Integration

- **Estado:** Completada.
- **Objetivo:** poner el acceso Meta Graph y la gestión del cache/provider state bajo la frontera Instagram.
- **Alcance:** trasladar módulo, controller/DTO, servicio y entity `InstagramPost` a `src/integrations/instagram-integration/`, con módulo `InstagramIntegrationModule`; actualizar AppModule. Caracterizar por separado sincronización Graph, renovación de token y persistencia condicional por Heroku o `.env`.
- **Exclusiones:** no mover News u otros consumers, cambiar `/api/instagram/posts`, modificar entity/schema, ejecutar refresh real, escribir `.env`, cambiar Heroku config vars o leer credenciales.
- **Dependencias:** I.0.
- **Criterios de aceptación:** contrato GET, paginación/cache local, upsert, cron, selección de campos y manejo de errores se preservan; entity metadata no cambia; se explicita cómo se prueba el efecto de persistir el token sin tocar configuración real.
- **Verificaciones:** `yarn --ignore-engines test --runInBand` sobre las tres suites focalizadas (3 suites, 12 tests), `yarn --ignore-engines build`, `yarn --ignore-engines tsc --noEmit` y `git diff --check` completados. Tests mockean `fetch` y filesystem; se validaron los metadatos TypeORM de inyección/repositorio y cron sin DB. El primer intento con Yarn sin `--ignore-engines` se detuvo porque el proyecto declara Node 20 y el entorno usa Node 22.23.1. La búsqueda de imports obsoletos no encontró referencias a `src/instagram`, `InstagramModule` ni su módulo anterior. No hay consumidores Nest internos adicionales que requieran una suite propia; controller y registro en módulo quedaron cubiertos. La prueba aislada que intentó importar `AppModule` desde Jest chocó con el `import` ESM de `htmlparser2` cargado indirectamente por el preexistente `sanitize-html`; no se modificó esa dependencia fuera de alcance. La importación/registro en `AppModule` se revisó en código y compila.
- **Tamaño estimado:** M.

### I.6 — Extraer el cliente Cloudflare R2 de Uploads

- **Estado:** Completada.
- **Objetivo:** agrupar la escritura en almacenamiento externo y mantener `uploads/` como feature HTTP.
- **Alcance:** crear `src/integrations/cloudflare-r2-integration/` y `CloudflareR2IntegrationModule` para el cliente/adaptador de `PutObject`; hacer que `UploadsService` o el módulo local lo consuma. Mantener controller, autorización, filtros y límite de archivo en `src/platform/uploads/`.
- **Exclusiones:** no cambiar ruta, forma de respuesta, bucket/key, MIME, URL pública, errores ni variables de credenciales; no mover a producción ni subir archivos reales.
- **Dependencias:** I.0.
- **Criterios de aceptación:** `POST /api/uploads/image` mantiene guard, validación y response; objeto se sube con los mismos metadatos y error observable; no se filtran credenciales al log/respuesta.
- **Verificaciones:** `yarn --ignore-engines test --runInBand` sobre R2 y Uploads (5 suites, 7 tests), `yarn --ignore-engines build`, `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`, `yarn --ignore-engines prettier --check src/integrations/cloudflare-r2-integration src/uploads` y `git diff --check` completados. Se mockea `S3Client.send`; se caracterizan los parámetros de `PutObject`, URL pública, propagación del error del SDK y mapeo HTTP previo. Metadata de módulos confirma el provider/export de R2 y su import en Uploads, que mantiene su controller, provider y export. La inspección de referencias confirma que no existen consumidores internos adicionales de `UploadsService`; `AppModule` ya registra `UploadsModule`. No existen operaciones S3 de lectura, borrado o generación de URL firmada en el código actual. Yarn requiere `--ignore-engines` porque el entorno usa Node 22.23.1 mientras `package.json` declara Node 20.x. No se hicieron llamadas a Cloudflare ni se inspeccionaron valores de credenciales.
- **Tamaño estimado:** S.

### I.7 — Separar transporte SMTP de notificaciones de aplicación

- **Estado:** Completada (2026-10-14).
- **Objetivo:** alojar el envío SMTP externo sin colocar plantillas ni DTOs de dominio dentro de Integrations.
- **Alcance:** extraer el transporte y configuración `nodemailer` a `src/integrations/smtp-integration/` con `SmtpIntegrationModule`; mantener `MailService`/`MailModule` en `src/mail/` como composición de emails de la aplicación y hacer que use el transporte exportado. Actualizar Access Requests, National Releases, Festival Playlists y TikTok solo si DI lo requiere.
- **Exclusiones:** no cambiar destinatarios, subjects, HTML, errores, env keys, política de notificación ni crear un framework de plantillas/proveedores.
- **Dependencias:** I.0. Debe poder probarse con transport mockeado, sin enviar correo.
- **Criterios de aceptación:** `MailService` deja de construir directamente el transporter; la integración no importa `CreateNationalReleaseDto` ni otros tipos de feature; todos los consumers siguen enviando los mismos mensajes.
- **Verificaciones:** añadir pruebas de composición de correos y del transporte/configuración, pruebas DI de consumers, build, typecheck y `git diff --check` con Yarn.
- **Tamaño estimado:** M.
- **Resultado y evidencia:** se creó `src/integrations/smtp-integration/` con `SmtpIntegrationModule` y `SmtpTransportService`. El transporte crea Nodemailer con los mismos valores de `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER` y `MAIL_PASS`, `secure: false` y los timeouts de conexión/saludo/socket existentes; `sendMail` pasa las mismas opciones y propaga sin modificar el error. `MailService` conserva las cuatro composiciones, destinatarios, remitentes, asuntos, HTML, fallback de destinatario OAuth, logging, manejo observable de errores y métodos públicos. `MailModule` importa y consume el módulo SMTP, y sigue exportando únicamente `MailService`; Access Requests, National Releases, Festival Playlists y TikTok continúan usando esa fachada. No se encontró mecanismo de reintento ni adjuntos en el envío actual. Se añadieron pruebas mockeadas de configuración/creación/envío/error del transporte, composición y política de errores de MailService y resolución Nest entre `SmtpIntegrationModule` y `MailModule`. Las 5 suites focalizadas de SMTP, Mail, Festival Playlists y TikTok pasan (40 tests); también pasan `yarn --ignore-engines build` y `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`. Prettier se aplicó a todos los archivos modificados. La búsqueda confirma que Nodemailer y `createTransport` solo aparecen en la integración SMTP y que los cuatro consumidores siguen dependiendo de `MailService`/`MailModule`; no se modificaron sus imports ni se introdujeron dependencias directas al transporte. `git diff --check` pasa. Yarn mostró avisos de caché/global no escribibles, sin afectar los comandos. No se enviaron correos, no se leyeron credenciales ni se ejecutaron migraciones.

### I.8 — Regresión final y cierre

- **Estado:** Completada (2026-10-14).
- **Objetivo:** verificar la frontera común, sus consumers y la dirección del grafo de módulos tras los traslados.
- **Alcance:** inspeccionar rutas, DTOs, guards, errores, configuración por nombre, exports/DI, entidades y ciclos; confirmar que los providers agrupados se consumen desde la nueva ubicación y las reglas locales permanecen en sus features. Revisar Setlist.fm, Bandcamp y correo para confirmar las decisiones de ownership registradas.
- **Exclusiones:** no añadir cambios de comportamiento o contratos, integraciones no presentes ni refactors de dominios; no ejecutar migraciones ni acciones externas.
- **Dependencias:** I.1–I.7.
- **Criterios de aceptación:** no hay imports rotos ni ciclos introducidos; rutas/contratos y efectos observables están preservados; verificaciones pasan o las fallas preexistentes se atribuyen con evidencia; el inventario y estado final quedan actualizados.
- **Verificaciones:** suites focalizadas de cada integración y sus consumers, build, typecheck, revisión de imports/DI/rutas, suite completa proporcional y `git diff --check` con Yarn; no llamar a APIs reales ni conectarse a DB de producción.
- **Resultado y evidencia:** revisión conjunta de Spotify, WordPress, Telegram, Last.fm, TikTok, Instagram/Meta, Cloudflare R2 y SMTP. Los módulos y providers pertenecen a sus integraciones; Catalog, Lists, News, Uploads, Mail, Contents y Festival Playlists conservan sus casos de uso. La orquestación de playlist local sigue en `RiffValleyPlaylist`/Festival Playlists, y Setlist.fm y Bandcamp siguen en la feature que los usa. Las dependencias Nest de consumidores y exports revisados no introducen ciclos entre integraciones; `ContentsModule`/`ListsModule` conserva su `forwardRef` preexistente. `TiktokIntegrationModule` consume `MailModule` para avisos, mientras Mail depende únicamente de SMTP. No quedan imports runtime a las antiguas ubicaciones ni otra implementación del transporte WordPress: News usa el lector público de `WordpressService` y mantiene su caché y contrato.
  - Se revisaron rutas, DTOs, guards, permisos y respuestas de Spotify y `RiffValleyPlaylist`, Lists/WordPress, News/WordPress/Telegram, Catalog/Last.fm, Uploads/R2, Mail/consumidores y los controllers TikTok e Instagram. No se modificaron contratos. Los specs existentes mockean transporte y persistencia para OAuth/refresh/cifrado, crons, paginación, cachés/fallbacks, errores, URLs/metadatos R2 y SMTP; no se llamaron proveedores, enviaron correos, leyeron secretos, ejecutaron migraciones ni conectaron a PostgreSQL.
  - **Build:** `yarn --ignore-engines build` pasa. **Typecheck:** `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` pasa. El entorno usa Node 22.23.1 y `package.json` requiere Node 20.x.
  - **Suites focalizadas y consumers:** 42 suites / 200 tests pasan, incluidas las suites de las ocho integraciones y los consumers indicados. La suite HTTP de Spotify falló en la primera ejecución dentro del sandbox con `listen EPERM`; repetida con permiso para listener local, pasó.
  - **Suite unitaria completa:** 122 suites pasan, 9 se omiten y 3 fallan (967 tests pasan, 49 se omiten y 3 fallan). Los fallos son los fixtures incompletos de `VersionsController` y `VersionsService`, y la aserción preexistente de `DiscCatalogService.findAll`, ya documentados antes de I.8; no fallan suites de Integrations. La ejecución retiró `DATABASE_URL` y no accedió a PostgreSQL.
  - **Lint y Prettier:** ESLint en modo lectura global falla con 3,059 errores (S.9 registró 3,019 antes de Integrations; la diferencia de 40 no se atribuye con evidencia a cambios funcionales y queda como atribución desconocida). Prettier `--check` sobre los archivos afectados informa 15 archivos con diferencias de estilo, principalmente de código trasladado y pruebas; no se aplicó `--fix` ni se alteró el alcance para corregirlas. No hay impacto de build, typecheck o suites focalizadas. `git diff --check` pasa.
  - No se detectaron regresiones arquitectónicas, funcionales o contractuales introducidas por Integrations. No se requirieron correcciones de producción.
- **Tamaño estimado:** M.

## Dependencias y criterios de cierre

- **Inventario y ownership:** completados para esta planificación y documentados arriba; no queda pendiente un inventario genérico antes de I.0.
- **Primera implementación:** `Spotify S.9 → I.0`. Tras I.0, WordPress, Telegram, Last.fm, TikTok, Instagram, R2 y SMTP pueden avanzar como migraciones independientes según sus dependencias enumeradas; no hay que imponer un orden entre ellas salvo coordinación de cambios simultáneos en módulos/consumers comunes.
- **Cierre:** I.8 se completa con evidencia de pruebas y DI, sin imports obsoletos, cambios de contrato o nuevas dependencias circulares. Los problemas preexistentes se registran, no se corrigen dentro de estas tareas.
- **Estado general:** I.0–I.8 completadas (2026-10-14).
