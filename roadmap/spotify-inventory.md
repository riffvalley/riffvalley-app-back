# Inventario backend de Spotify (S.1)

Inventario de referencias encontradas en el backend del repositorio. Se documentan usos y relaciones observados; no se asigna ninguna referencia a la clasificación de S.2 ni se propone un rename o movimiento. Los valores reales de secretos/credenciales no se leyeron ni se incluyen.

## Persistencia y relaciones TypeORM

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/spotify/entities/spotify.entity.ts` | `Spotify`, `SpotifyStatus`, `SpotifyType` | Entidad TypeORM `@Entity('spotify')`; estados/tipos; columnas de playlist local/remota y relaciones | `Content`, `User`, `SpotifyPlaylistArtist` | `SpotifyService`, `FestivalPlaylistsService`, `ContentsService`, `User`, `Content`, `ArtistManagementService`, controllers y módulos indicados abajo |
| `src/spotify/entities/spotify.entity.ts` | `Spotify.content`, `Spotify.user`, `Spotify.playlistArtists` | `OneToOne` inversa a Content; `ManyToOne` a User (nullable, `SET NULL`); `OneToMany` con cascade a artistas de playlist | `Content.spotify`, `User.spotify`, `SpotifyPlaylistArtist.spotify` | Serialización/lecturas de `SpotifyService`; consultas de Content; sincronización y respuestas de playlist |
| `src/contents/entities/content.entity.ts` | `ContentType.SPOTIFY`, `Content.spotify` | Tipo enum `spotify`; `OneToOne` nullable con `JoinColumn` en `content`, por tanto FK `content.spotifyId` | `Spotify` | `ContentsService`, `SpotifyService`, contenido editorial |
| `src/auth/entities/user.entity.ts` | `User.spotify` | `OneToMany` inversa hacia `Spotify`, con cascade | `Spotify.user` | `SpotifyService`, `ContentsService` y lecturas asociadas de contenido |
| `src/festival-playlists/entities/spotify-playlist-artist.entity.ts` | `SpotifyPlaylistArtist` | Entidad de asociación entre `Spotify` y `Artist`; tabla `spotify_playlist_artists`, FK `spotify_id`; almacena estado, selección y tracks asociados | `Spotify`, `Artist`, enum/tipos locales de estado/selección | `FestivalPlaylistsService`, `ArtistManagementService`, consulta de artistas huérfanos |
| `src/festival-playlists/entities/spotify-connection.entity.ts` | `SpotifyConnection` | Entidad TypeORM para la cuenta conectada, OAuth state y credenciales cifradas; tabla `spotify_connections` | `TokenCryptoService`, `FestivalPlaylistsService` | `FestivalPlaylistsService` |
| `src/asignations/entities/asignations.entity.ts` | `Asignation.spotifyTrackId` | Campo nullable para ID de track Spotify seleccionado manualmente | DTO y service de Asignations; consumo posterior de Lists | `AsignationsService`, `ListsService` |

### Tabla física y metadata observada

- `Spotify` declara `@Entity('spotify')`; el nombre físico actual es `spotify`. No se encontró indicación de que TypeORM use otro nombre para esa tabla.
- Esta constatación es del metadata TypeORM y del SQL de migraciones del repositorio; en S.1 no se consultó una base de datos desplegada o local para inspeccionar su catálogo vivo.
- La entity declara campos como `name`, `status`, `link`, `type`, `fecha_actualizacion`, `spotify_playlist_id`, `description`, `is_public`, `image_url` y `protected_track_uris`. Las migraciones históricas documentan los renombres de `nombre`/`estado`/`enlace`/`tipo` a los nombres actuales y las columnas añadidas posteriormente.
- `spotify.userId` referencia `users.id` y la relación actual declara `ON DELETE SET NULL`. `content.spotifyId` referencia `spotify.id` con restricción única en la migración de relación. `spotify_playlist_artists.spotify_id` referencia `spotify.id` con `ON DELETE CASCADE`; esa tabla tiene unicidad compuesta (`spotify_id`, `artist_id`).
- `spotify_connections` guarda una única conexión lógica identificada por `connection_key` (constraint `riff-valley`), estado OAuth y expiraciones. `spotify_playlist_artists` guarda los artistas/selección/tracks de una playlist. Son tablas distintas de `spotify`.
- También existe `asignation.spotifyTrackId` (máximo 32 caracteres en el DTO; la migración lo crea como `varchar(32)`).

## Módulos, providers, repositorios e imports

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/app.module.ts` | `SpotifyModule` | Registra/importa el módulo en la aplicación NestJS | `src/spotify/spotify.module.ts` | Aplicación backend |
| `src/spotify/spotify.module.ts` | `SpotifyModule` | Registra `Repository<Spotify>`, controllers y `SpotifyService`; importa `ContentsModule` y `WordpressModule` | `Spotify`, `SpotifyService`, controllers Spotify, `ContentsModule`, `WordpressModule` | Controllers de gestión y consulta Spotify |
| `src/festival-playlists/festival-playlists.module.ts` | `FestivalPlaylistsModule` | Registra repositorios de `SpotifyConnection`, `SpotifyPlaylistArtist`, `Spotify` y `Artist`; providers del service y cifrado | `AuthModule`, `MailModule`, `ConfigModule` | Controllers de playlist de festival y género |
| `src/wordpress/wordpress.module.ts` | `WordpressModule` | Registra y exporta `SpotifyApiService` junto a `WordpressService` | `ConfigService` (inyectado por el service; disponible globalmente) | `SpotifyModule`, `DiscsModule`, `ListsModule` |
| `src/catalog/discs/discs.module.ts` | `DiscsModule` | Registra el provider `DiscSpotifyService` | `SpotifyApiService` exportado por `WordpressModule` en el módulo consumidor | `DiscsService` |
| `src/lists/list.module.ts` | `ListModule` | Registra `ListsService` y sus repositorios/módulos importados, incluido acceso a `SpotifyApiService` mediante `WordpressModule` | `WordpressModule`, entidades de Lists y dependencias de publicación | `ListController` |
| `src/catalog/artists/artists.module.ts` | `ArtistsModule` | Registra el repositorio de `SpotifyPlaylistArtist` | Entity de asociación | Gestión de artistas y consultas de huérfanos |
| `src/contents/contents.module.ts` | `ContentsModule` | Registra el repositorio de `Spotify` | `Spotify` entity | `ContentsService` |
| `src/contents/contents.controller.ts` | `ContentsController` | Invoca el job manual de revisión de enlaces | `ContentSchedulerService` | Operación administrativa de Contents |
| `src/standalone.ts` | comando `check-spotify` | Selecciona ejecución aislada de `checkMissingSpotifyLinks()` | Scheduler de Contents | Ejecución manual standalone |

## Controllers y rutas HTTP

El prefijo global de NestJS añade `/api`. Las rutas siguientes son las declaradas localmente por los controllers.

| Archivo | Símbolo/responsabilidad | Tipo de uso / rutas | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/spotify/spotify.controller.ts` | `SpotifyController`, `@Controller('spotify')` | CRUD local: `GET /spotify`, `GET /spotify/:id`, `POST /spotify`, `PATCH /spotify/:id`, `DELETE /spotify/:id`; consultas locales `GET /spotify/festivals`, `/spotify/genres`, `/spotify/genres/random`; crea Content con `POST /spotify/:id/content` | `SpotifyService`; DTOs de create/update/list | Consumers HTTP externos al backend; `ContentsService` para Content enlazado |
| `src/spotify/spotify-artists.controller.ts` | `SpotifyArtistsController`, `@Controller('spotify/artists')` | `GET /spotify/artists/search`, `/search/multiple`, `/:spotifyId/top-tracks`, `/:spotifyId/albums`, `/:spotifyId/images` | `SpotifyApiService` y DTOs de búsqueda/listado de álbumes | Consumers HTTP externos; API externa Spotify a través del service |
| `src/spotify/spotify-albums.controller.ts` | `SpotifyAlbumsController`, `@Controller('spotify/albums')` | `GET /spotify/albums/:spotifyAlbumId/most-popular-track` | `SpotifyApiService` | Consumers HTTP externos; API externa Spotify a través del service |
| `src/festival-playlists/festival-playlists.controller.ts` | `FestivalPlaylistsController`, `@Controller('festival-playlists')` | `POST /spotify/connect`, `GET /spotify/callback`, `GET/DELETE /spotify/connection`; `GET /artists/top-songs`; playlists: `POST /`, `POST /link`, `POST /:spotifyId/link`, `GET /:spotifyId`, `PATCH /:spotifyId`, `PUT /:spotifyId/image`, `POST /:spotifyId/artists`, `GET /:spotifyId/artists/:artistId/tracks`, `PUT /:spotifyId/artists/:artistId/tracks`, `DELETE /:spotifyId/tracks`, `DELETE /:spotifyId/artists/:artistId` | `FestivalPlaylistsService`, ConfigService y DTOs de playlist/tracks | Consumers HTTP; Spotify y setlist.fm desde el service |
| `src/festival-playlists/genre-playlists.controller.ts` | `GenrePlaylistsController`, `@Controller('genre-playlists')` | CRUD/gestión de playlist de género: `POST /genre-playlists`, `/link`; `GET/PATCH /:spotifyId`; `POST /:spotifyId/link`; `PUT /:spotifyId/image`; gestión de artistas/tracks, clear y shuffle | `FestivalPlaylistsService`; DTOs de creación, asociación y selección de tracks | Consumers HTTP autenticados; Spotify desde el service |
| `src/catalog/discs/discs.controller.ts` | rutas Spotify dentro de `DiscsController` (`@Controller('discs')`) | `GET /discs/spotify/album`, `GET /discs/spotify/album/:spotifyAlbumId`, `GET /discs/:id/spotify-tracks` | `DiscsService`, `ResolveSpotifyAlbumQueryDto`; `DiscSpotifyService` indirectamente | Consumers HTTP externos; `SpotifyApiService` indirectamente |

Los controllers Spotify declaran `ValidationPipe` local para sus DTOs; los controllers de festivales aplican guards/roles `Auth`. No se modificó ni verificó el comportamiento HTTP en esta subtarea: las rutas se registran como inventario.

## Services, clientes HTTP y llamadas externas

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/spotify/spotify.service.ts` | `SpotifyService` | CRUD/listado de filas `Spotify`; QueryBuilder filtra status/type/fechas/búsqueda, ordena/pagina y carga user/content/count de playlist artists; método de playlist aleatoria; crea/elimina/reconsulta Content enlazado | `Repository<Spotify>`, `ContentsService`, DTOs de Spotify | `SpotifyController` |
| `src/festival-playlists/festival-playlists.service.ts` | `FestivalPlaylistsService` | Implementa conexión OAuth, token exchange/refresh, consulta de perfil, CRUD/enlace/sincronización de playlists, tracks, búsquedas, imagen y sincronización de artistas; hace `fetch` directamente a `accounts.spotify.com` y `api.spotify.com/v1` (authorize/token, profile, create/list/update playlist, playlist items/images, search); también consulta setlist.fm para sacar canciones | Repositorios `SpotifyConnection`, `Spotify`, `Artist`, `SpotifyPlaylistArtist`; `ConfigService`, `TokenCryptoService`, `MailService`; DTOs y tipos internos | Dos controllers de festival/género; tarea programada de reautorización; Spotify y setlist.fm |
| `src/festival-playlists/token-crypto.service.ts` | `TokenCryptoService` | Hash de OAuth state y cifrado/descifrado de access y refresh tokens | `SPOTIFY_TOKEN_ENCRYPTION_KEY` mediante configuración | `FestivalPlaylistsService` |
| `src/wordpress/spotify-api.service.ts` | `SpotifyApiService` | Cliente API Spotify independiente: token Client Credentials y `fetch` a `/v1/search`, `/artists/:id`, `/artists/:id/top-tracks?market=ES`, `/artists/:id/albums`, `/albums/:id` y `/albums/:id/tracks`; adapta respuesta externa a interfaces locales de artista, álbum y track (incluye IDs, imágenes y external links) | `ConfigService`; DTO `SpotifyAlbumGroup` | `SpotifyArtistsController`, `SpotifyAlbumsController`, `DiscsService`, `DiscSpotifyService`, `ListsService` |
| `src/catalog/discs/spotify/disc-spotify.service.ts` | `DiscSpotifyService` | Lee Disc y artista (QueryBuilder con join/proyección) y pide tracks Spotify por álbum/artista | Repositorio Disc, `SpotifyApiService` | `DiscsService.getSpotifyTracks()` |
| `src/catalog/discs/discs.service.ts` | fachada `DiscsService` — métodos `resolveSpotifyAlbum`, `getSpotifyAlbumDetails`, `getSpotifyTracks` | Coordina llamada de resolver álbum/detalle mediante `SpotifyApiService` y delega tracks a `DiscSpotifyService`; traduce ausencia de álbum a NotFound | `SpotifyApiService`, `DiscSpotifyService` | `DiscsController` |
| `src/contents/content-scheduler.service.ts` | `ContentSchedulerService.checkMissingSpotifyLinks`, `getSpotifyToken` | Obtiene token Client Credentials con `fetch`, busca álbumes por Spotify Search y actualiza `Disc.link`; también intenta una búsqueda menos estricta tras no encontrar álbum | `Disc` repository/QueryBuilder; `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`; además lógica fallback Bandcamp | `ContentsController` y `standalone.ts`; escribe enlaces en Disc |
| `src/lists/list.service.ts` | `ListsService.resolveSpotifyTrackId` y generadores de posts | Usa el `spotifyTrackId` manual si existe; si no, llama `SpotifyApiService.findTrackForAlbum`; inserta IDs/iframes de `open.spotify.com` en HTML enviado a WordPress para secciones de discos | `SpotifyApiService`, `Asignation.spotifyTrackId`, datos de Disc/Artist y servicios WordPress | Generación/sincronización de posts de listas: weekly, monthly y best discs |
| `src/mail/mail.service.ts` | `MailService.sendSpotifyReauthorizationReminder` | Construye y envía recordatorio de reautorización OAuth; usa dirección configurada de aviso | `SPOTIFY_REAUTH_NOTIFICATION_EMAIL` y configuración general de correo; recibe expiración/días | `FestivalPlaylistsService.checkSpotifyAuthorizationLifetime()` |

## DTOs y tipos

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/spotify/dto/create-spotify.dto.ts` | `CreateSpotifyDto` | Validación de alta de fila Spotify local y asignación de usuario | Entity y `SpotifyService` | `SpotifyController` |
| `src/spotify/dto/update-spotify.dto.ts` | `UpdateSpotifyDto` | Validación de actualización de campos/estado de fila | Entity y `SpotifyService` | `SpotifyController` |
| `src/spotify/dto/list-spotify.query.dto.ts` | `ListSpotifyQueryDto` | Filtros/paginación de listados | `SpotifyService` | `SpotifyController` |
| `src/spotify/dto/search-spotify-artist-query.dto.ts` | `SearchSpotifyArtistQueryDto` | Parámetro de búsqueda por nombre de artista | `SpotifyApiService` | `SpotifyArtistsController` |
| `src/spotify/dto/list-spotify-artist-albums.query.dto.ts` | `ListSpotifyArtistAlbumsQueryDto`, `SpotifyAlbumGroup` | Grupos/límite de álbumes consultados | `SpotifyApiService` | `SpotifyArtistsController` y su test DTO |
| `src/catalog/discs/dto/resolve-spotify-album-query.dto.ts` | `ResolveSpotifyAlbumQueryDto` | Nombres de álbum/artista para resolver álbum en Spotify | `DiscsController`, `DiscsService` | Ruta de resolver álbum |
| `src/festival-playlists/dto/link-spotify-playlist.dto.ts` | `LinkSpotifyPlaylistDto` | URL externa para enlazar una playlist existente | `FestivalPlaylistsService` | Controllers de playlist de festival/género |
| `src/festival-playlists/dto/search-spotify-tracks-query.dto.ts` | `SearchSpotifyTracksQueryDto` | Texto de búsqueda de tracks | `FestivalPlaylistsService` | Controllers de playlist de festival/género |
| `src/festival-playlists/dto/select-playlist-artist-tracks.dto.ts` | `SelectPlaylistArtistTracksDto`, `ReplacePlaylistArtistTracksDto`, `ReplaceFailedFestivalArtistTracksDto` | Selección de IDs externos de tracks y reemplazo de selecciones fallidas | `SpotifyPlaylistArtist`, `FestivalPlaylistsService` | Controllers de playlist de género/festival |
| `src/festival-playlists/dto/create-synced-playlist.dto.ts` | `CreateSyncedPlaylistDto` | Nombre, descripción y visibilidad de playlist remota | `FestivalPlaylistsService` | Controllers de playlist de festival/género |
| `src/festival-playlists/dto/update-synced-playlist.dto.ts` | `UpdateSyncedPlaylistDto` | Campos editables de playlist remota | `FestivalPlaylistsService` | Controllers de playlist de festival/género |
| `src/festival-playlists/dto/sync-playlist-artist.dto.ts` | `SyncPlaylistArtistDto` | Artista, cantidad de canciones y setlists recientes para sincronización | `Artist`, `FestivalPlaylistsService` | `FestivalPlaylistsController` |
| `src/festival-playlists/dto/top-songs-query.dto.ts` | `TopSongsQueryDto` | Parámetros de consulta de setlist.fm usados para construir una lista de canciones | `FestivalPlaylistsService` | `FestivalPlaylistsController` |
| `src/asignations/dto/create-asignations.dto.ts` | `CreateAsignationDto.spotifyTrackId` | Validación de ID de track elegido manualmente | Entity Asignation y `AsignationsService` | `ListsService` lo reutiliza al generar embeds |
| `src/contents/dto/create-content.dto.ts` | `CreateContentDto.spotifyId` | Referencia al registro `Spotify` enlazado a un Content | `ContentsService` | `SpotifyService.createContentForSpotify`, consumers de Contents |

## Consultas SQL, QueryBuilders y esquema migrado

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/spotify/spotify.service.ts` | `findAll`, `findRandomGenrePlaylist` | QueryBuilders ORM sobre `spotify`; joins `user`/`content`, count relación, filtros y selección aleatoria | Metadata de `Spotify` | Controllers locales Spotify |
| `src/festival-playlists/festival-playlists.service.ts` | OAuth state y queries de playlist | QueryBuilder de `spotify_connections` para consumir state hasheado; repositorio TypeORM para playlist, asociaciones y conexión | Tres repositorios TypeORM | Controllers de festival/género |
| `src/catalog/artists/management/artist-management.service.ts` | carga de playlists por artista | QueryBuilder ORM con join `association.spotify`; proyecta id/nombre/link/type/imageUrl en resultado `spotifyPlaylists` | `SpotifyPlaylistArtist`, `ArtistsModule` | `ArtistsController`/consumer backend de gestión |
| `src/catalog/artists/orphans/artist-orphans.service.ts` | `countForManagement`, `removeOrphanArtists` | SQL manual en condiciones `NOT EXISTS` sobre `spotify_playlist_artists spa`, para excluir artistas usados por playlists | Tabla `spotify_playlist_artists` y `artist.id` | Servicios de gestión/eliminación de artistas huérfanos |
| `src/contents/contents.service.ts` | creación, lectura, relación y borrado de Content | Repositorio `Spotify`; carga de relaciones `spotify`, `spotify.user`; QueryBuilder con joins `content.spotify`/`spotify.user`; búsqueda por Spotify ID | `Content.spotifyId`, `Spotify.user` | `SpotifyService`, controllers de Contents |
| `src/migrations/*.ts` | cambios de esquema e históricos SQL indicados abajo | SQL manual TypeORM `QueryRunner` | Tablas `spotify`, `content`, `users`, `spotify_connections`, `spotify_playlist_artists`, `asignation` | Esquema PostgreSQL |

### Migraciones que contienen referencia Spotify

| Archivo | Símbolo/responsabilidad | Tipo de uso / objeto tocado | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/migrations/1758527731605-CreateSpotify.ts` | `CreateSpotify` | Crea `spotify`, columnas iniciales y enums de tipo/estado | PostgreSQL | Entity `Spotify`, repositorios actuales |
| `src/migrations/1766178367407-AddUserToSpotify.ts` | `AddUserToSpotify` | Añade/elimina `userId` y FK a `users` en `spotify` | `users.id` | `Spotify.user` |
| `src/migrations/1766204149725-UpdateContentTypeAndRelations.ts` | `UpdateContentTypeAndRelations` | Modifica ContentType y elimina/recrea relación/columna de usuario sobre `spotify` | `content`, `spotify`, `users` | Entities Content/Spotify/User |
| `src/migrations/1766204357843-CorrectContentTypeEnum.ts` | `CorrectContentTypeEnum` | Enum `content_type_enum` contiene valor `spotify`; también SQL histórico de `userId` en `spotify` | `content`, `spotify`, `users` | `ContentType.SPOTIFY`, entity Spotify |
| `src/migrations/1766205233604-AddSpotifyRelationToContent.ts` | `AddSpotifyRelationToContent` | Añade `content.spotifyId`, unique y FK a `spotify.id` | Tablas `content`, `spotify` | `Content.spotify` |
| `src/migrations/1766206128414-AddUserIdToSpotify.ts` | `AddUserIdToSpotify` | Añade/elimina `spotify.userId` y FK a `users` | `users.id` | `Spotify.user` |
| `src/migrations/1766398035718-RefactorArticlesAndSpotifyEnglishFields.ts` | `RefactorArticlesAndSpotifyEnglishFields` | Renombra columnas de `spotify` español/inglés e intercambia tipos enum | `spotify` | Metadata de `Spotify` |
| `src/migrations/1770700000000-HarmonizeStatusEnums.ts` | `HarmonizeStatusEnums` | Convierte valores históricos de `spotify.status` y reconstruye enum; rollback restaura valores anteriores | `spotify.status` | `SpotifyStatus` |
| `src/migrations/1772646475219-AddCascadeDeleteToUserRelations.ts` | `AddCascadeDeleteToUserRelations` | Ajusta FK `spotify.userId` a `ON DELETE SET NULL` en el conjunto de relaciones de usuario | `spotify`, `users` | `Spotify.user` |
| `src/migrations/1772657119515-AddLinkToNationalRelease.ts` | `AddLinkToNationalRelease` | Junto con cambios de NationalRelease, recrea FK `spotify.userId` | `spotify`, `users`, `national_release` | `Spotify.user` y NationalRelease |
| `src/migrations/1784928759086-AddSpotifyTrackIdToAsignation.ts` | `AddSpotifyTrackIdToAsignation` | Añade/elimina `asignation.spotifyTrackId varchar(32)` | Tabla `asignation` | Entity Asignation, `AsignationsService`, `ListsService` |
| `src/migrations/1786400000000-CreateSpotifyConnections.ts` | `CreateSpotifyConnections` | Crea `spotify_connections`, unique key/state y constraint de conexión Riff Valley | PostgreSQL | Entity `SpotifyConnection` |
| `src/migrations/1786401000000-CreateSpotifyPlaylistArtists.ts` | `CreateSpotifyPlaylistArtists` | Añade columnas de sincronización a `spotify`; crea `spotify_playlist_artists`, FKs/índices/unique | `spotify`, `artist` | Entity `SpotifyPlaylistArtist`, services de playlists y Artists |
| `src/migrations/1786402000000-AddSpotifyPlaylistImage.ts` | `AddSpotifyPlaylistImage` | Añade/elimina `spotify.image_url` | Tabla `spotify` | Entity `Spotify`, respuesta de playlist |
| `src/migrations/1786403000000-AddSpotifyProtectedTracks.ts` | `AddSpotifyProtectedTracks` | Añade/elimina `spotify.protected_track_uris jsonb` | Tabla `spotify` | Entity `Spotify`, lógica de tracks protegidos |
| `src/migrations/1786404000000-AddSpotifyAuthorizationLifetime.ts` | `AddSpotifyAuthorizationLifetime` | Añade expiración de refresh token a `spotify_connections` y rellena el valor de datos previo | Tabla `spotify_connections` | Entity y lifecycle OAuth |
| `src/migrations/1786405000000-AddSpotifyArtistManualSelection.ts` | `AddSpotifyArtistManualSelection` | Añade `selection_mode` y `spotify_artist_id` a `spotify_playlist_artists` | Tabla `spotify_playlist_artists` | Entity de asociación y selección manual |

## Configuración, credenciales y tokens

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `.env.template` | Variables documentadas | Declara `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `SPOTIFY_FRONTEND_REDIRECT_URL`, `SPOTIFY_TOKEN_ENCRYPTION_KEY`, `SPOTIFY_REAUTH_NOTIFICATION_EMAIL` | ConfigModule / servicios Spotify | OAuth de Festival Playlists, cliente API, scheduler y correo |
| `src/festival-playlists/festival-playlists.service.ts` | `requiredConfig`, OAuth/token lifecycle | Lee client ID, secret, redirect URI y frontend redirect; genera state, intercambia código y renueva tokens | `ConfigService`, connection repository, `TokenCryptoService` | Controllers FestivalPlaylists |
| `src/festival-playlists/entities/spotify-connection.entity.ts` | `SpotifyConnection` | Campos `accessToken`, `refreshToken`, `oauthStateHash`, expiraciones, scope, user id, conexión; la metadata excluye select por defecto los tokens sensibles | Tabla `spotify_connections` | `FestivalPlaylistsService` |
| `src/festival-playlists/token-crypto.service.ts` | encrypt/decrypt/hash | Usa clave `SPOTIFY_TOKEN_ENCRYPTION_KEY`; cifra tokens y hashea el state OAuth | Configuración del entorno | `FestivalPlaylistsService` |
| `src/wordpress/spotify-api.service.ts` | client credentials | Lee client ID y secret mediante `ConfigService`; token cacheado en memoria por el service | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Controllers Spotify, Catalog, Lists |
| `src/contents/content-scheduler.service.ts` | client credentials | Lee `process.env.SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`; obtiene token sin conservar refresh token | Las mismas variables de entorno | Job de enlaces Spotify faltantes |
| `src/mail/mail.service.ts` | destinatario reauth | Usa `SPOTIFY_REAUTH_NOTIFICATION_EMAIL` para aviso; no contiene credenciales Spotify | Variables de mail | `FestivalPlaylistsService` |

La plantilla contiene placeholders, no valores activos. No se leyó `.env` ni se incluyeron secretos. Hay tres rutas de credenciales Client Credentials/OAuth observables: `FestivalPlaylistsService`, `SpotifyApiService` y `ContentSchedulerService`.

## Consumers backend adicionales y referencias relacionadas

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/contents/contents.service.ts` | integración del tipo Content Spotify | Al crear Content puede buscar/enlazar `Spotify`; puede crear una fila Spotify cuando el tipo es Spotify y falta `spotifyId`; consulta/carga `spotify.user`; ofrece lookup por Spotify ID | `Spotify`, `ContentType`, `CreateContentDto` | `SpotifyService`, flujos CRUD de Contents |
| `src/asignations/asignations.service.ts` | create/update de asignaciones | Persiste y permite limpiar `spotifyTrackId` | DTO/entity Asignation | `ListsService` |
| `src/catalog/artists/management/artist-management.service.ts` | `findAllForManagement` | Compone la lista `spotifyPlaylists` de cada artista con campos de la asociación y playlist | Repositorio `SpotifyPlaylistArtist` | Consumers de gestión de artistas |
| `src/catalog/artists/orphans/artist-orphans.service.ts` | conteo/eliminación de artistas huérfanos | Considera pertenencia a `spotify_playlist_artists` al decidir si un artista está huérfano | SQL/tabla de asociación | Gestión de artistas |
| `src/catalog/discs/discs.service.ts` / `src/catalog/discs/spotify/disc-spotify.service.ts` | consumo de búsqueda de tracks, álbum resolver/detalle | Disc y nombre de artista alimentan la búsqueda API; entrega tracks/detalle a la ruta correspondiente | `SpotifyApiService`, Disc repository | `DiscsController` |
| `src/lists/list.service.ts` | publicaciones WordPress | Usa la selección track manual o busca uno y genera iframes `open.spotify.com/embed/track/...` | Asignation, Disc, Artist, `SpotifyApiService` | Integración de publicación WordPress |
| `src/mail/mail.service.ts` | email de renovación | Informa al usuario administrador de que la autorización Spotify requiere renovación | `FestivalPlaylistsService`, proveedor de mail | Operación de conexión |
| `src/standalone.ts` | CLI/scheduler | Comando `check-spotify` dispara chequeo de enlaces Spotify | `ContentSchedulerService` | Ejecución standalone |

No se identificó una referencia Spotify directa en las entidades o services de Auth salvo `User.spotify` y sus imports/módulo; Auth queda relacionado por esa navegación TypeORM. Catalog sí usa la asociación de playlists para gestión y huérfanos, y Discs consume la API Spotify.

## Tests y fixtures

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `src/spotify/spotify.service.spec.ts` | `SpotifyService` | Tests de CRUD/listados/Content del módulo Spotify | Repositorio Spotify mock, ContentsService | `SpotifyController`/service |
| `src/spotify/spotify-artists.controller.spec.ts` | `SpotifyArtistsController` | Tests del controller frente al `SpotifyApiService` | Controller y API service mock | Rutas de artistas |
| `src/spotify/dto/list-spotify-artist-albums.query.dto.spec.ts` | `ListSpotifyArtistAlbumsQueryDto` | Test de transformación/validación del DTO | class-transformer/validator | Controller de artistas |
| `src/wordpress/spotify-api.service.spec.ts` | `SpotifyApiService` | Tests del cliente externo, parsing y errores | Fetch/config mock | Consumers del API service |
| `src/festival-playlists/festival-playlists.service.spec.ts` | `FestivalPlaylistsService` | Tests de OAuth, conexión, playlist/sync y requests remotos | Repositorios, cifrado, config, mail, fetch/setlist mocks | Controllers de festival/género |
| `src/catalog/discs/spotify/disc-spotify.service.spec.ts` | `DiscSpotifyService` | Tests de proyección de Disc, argumentos de tracks, errores | Repositorio Disc y `SpotifyApiService` mock | `DiscsService` |
| `src/catalog/discs/__tests__/discs.service.spec.ts` | métodos Spotify de `DiscsService` | Caracteriza/delega las operaciones de resolver/detalle y facade | `SpotifyApiService`, `DiscSpotifyService` | `DiscsController` |
| `src/catalog/discs/__tests__/discs.controller.spec.ts` | rutas del controller Discs | Referencias a endpoints/servicios Spotify | Controller DTO/service | Rutas Disc |
| `src/catalog/discs/__tests__/D0-baseline.md` | baseline Discs | Menciona operaciones Spotify dentro del inventario de alcance/base | Roadmap de Discs | Documentación de refactor |
| `src/catalog/artists/management/artist-management.service.spec.ts` | management artists | Fixture/aserciones para `spotifyPlaylists` | `SpotifyPlaylistArtist` mock | Gestión de artistas |
| `src/catalog/artists/orphans/artist-orphans.service.spec.ts` | artistas huérfanos | Verifica exclusión SQL ligada a asociación Spotify | QueryBuilder mock | Limpieza/gestión de artistas |
| `src/catalog/artists/__tests__/artists.module.spec.ts` | providers/módulo Artists | Registra `SpotifyPlaylistArtist` en fixture DI | `ArtistsModule` | Prueba de integración modular |
| `src/catalog/__tests__/catalog.module.spec.ts` | módulo Catalog | Configura/referencia el módulo de Spotify | `SpotifyModule`/árbol de módulos | Prueba modular Catalog |

No apareció test focalizado con mención Spotify para `ContentSchedulerService`, `ListsService`, `AsignationsService` ni `MailService` en la búsqueda de specs del checkout.

## Referencias por nombre y contexto ambiguo/documental

| Archivo | Símbolo/responsabilidad | Tipo de uso | Dependencias relevantes | Consumers conocidos |
|---|---|---|---|---|
| `test/spotify.http` | colección REST manual `@name createSpotify` | Prueba rutas locales `/spotify`; incluye cuerpos de ejemplo con enlaces `open.spotify.com/playlist/...`; contiene CRUD/error cases | Base URL HTTP de test | Persona que ejecuta el fixture REST; rutas `SpotifyController` |
| `src/festival-playlists/README.md` | documentación de módulo | Explica flujos y endpoints de festival/genre playlists y configuración asociada | Controllers/service/variables | Operación y desarrollo backend |
| `src/standalone.ts` | literal `check-spotify` | Nombre de comando CLI | Scheduler Contents | Operador del proceso standalone |
| `src/tiktok/README.md` | URLs frontend `/spotify/festivales?...tiktok=...` | Mención Spotify como destino frontend de callback TikTok; no es controller backend Spotify | Flujo OAuth TikTok | Documentación de callback de TikTok |
| `src/tiktok/tiktok.service.ts` | comentario comparativo con Spotify | Mención textual de diferencias entre credenciales TikTok y Spotify; no es llamada Spotify observada en ese punto | OAuth TikTok | Documentación cercana de implementación |
| `wordpress-plugin/riffvalley-table/riffvalley-table.php` | detección de host, icono y estilo Spotify | Presentación de enlaces Spotify en plugin PHP WordPress | URLs de links de releases | Visitantes de tablas WordPress; archivo fuera del backend NestJS |
| `wordpress-plugin/riffvalley-releases/riffvalley-releases.php` | detección de host, icono y campos de link Spotify | Presentación/edición del enlace de Spotify en plugin PHP WordPress | Links de Disc y UI del plugin | Editor y visitantes de releases; archivo fuera del backend NestJS |
| `roadmap.md`, `roadmap/catalog.md` y `roadmap/spotify.md` | menciones en roadmaps | Referencias de planificación/histórico y al alcance Spotify ya extraído dentro de Disc; no son código ejecutable | Documentación de roadmap | Mantenimiento del backend |

### Observaciones que quedan abiertas para S.2

- El símbolo/clase `Spotify` y la tabla física `spotify` se usan para registros locales de playlists y también sirven como referencia para el ID/link de la playlist externa en `FestivalPlaylistsService`. Se registra el doble contexto sin decidir cómo clasificarlo.
- El nombre `SpotifyModule` combina CRUD/entidad y controllers/clientes externos; el controller `SpotifyController` maneja el registro local, mientras los controllers de álbumes/artistas llaman al API externo. Se conserva como observación estructural, sin proponer extracción.
- Hay más de una ruta de cliente/autenticación externa: el `SpotifyApiService`, `FestivalPlaylistsService` y `ContentSchedulerService` usan `fetch`/tokens por separado. No se decide si deben permanecer agrupadas o consolidarse.
- En el mismo repositorio hay referencias frontend-like de documentación y PHP WordPress plugin, pero no pertenecen a los cambios backend S.1–S.7. Se anotan para evitar confundirlas con módulos NestJS.
- Las búsquedas cubrieron el contenido del repositorio oculto salvo dependencias/salidas generadas y archivos de entorno con valores (`.env`, `.env.*`); se revisó `.env.template` y solo se registraron nombres de variables. No se incluyeron contenidos de secretos.

## Método de búsqueda y cobertura

- Búsqueda sensible a mayúsculas/minúsculas del término `spotify` en nombres de archivos y contenidos, incluyendo rutas ocultas; se excluyeron `.git`, dependencias, `dist`, `coverage`, mapas/lockfiles y valores de `.env`.
- Búsqueda adicional en `src`, `test`, configuración/plantilla de entorno y documentación del repositorio; revisión de imports, decoradores TypeORM, providers, controllers, firmas de métodos, QueryBuilders, SQL de migraciones, URLs externas, tests y consumers encontrados.
- La lista de ficheros con referencias de código se cruzó con la lista de pruebas y con las migraciones que contienen SQL Spotify. Las menciones de `.env.template` se anotaron sin consultar ningún secreto desplegado/local.
- No se cambió código de producción, entity metadata, nombres, imports, rutas ni comportamiento. Esta documentación no toma las decisiones de clasificación reservadas para S.2.
