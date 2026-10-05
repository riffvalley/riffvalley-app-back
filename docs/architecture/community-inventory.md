# Community — Inventario previo a migración

Fotografía del código existente revisado el 2026-10-05 para A.1 de [`roadmap/community.md`](../../roadmap/community.md). No describe una arquitectura objetivo ni cambia los contratos.

## Resumen

- Las cinco capacidades conservan módulos Nest raíz e independientes registrados directamente en `AppModule`. Cada módulo expone su controller y registra sus propios providers y repositorios; ninguno exporta sus servicios.
- Todas importan `AuthModule`. Las rutas marcadas `@Auth()` usan Passport JWT y `UserRoleGuard`; sin roles indicados se requiere sesión autenticada, y con roles se exige uno de los indicados.
- El prefijo global es `/api`. Los paths listados abajo son los paths HTTP completos.
- `Comment`, `Favorite`, `Pending` y `Rate` se relacionan con `User` y `Disc`. `DiscRequest` se relaciona con `User`, `Genre` y `Country`. `Disc` mantiene las relaciones inversas de las cuatro primeras; `User` mantiene las inversas de las cinco.
- `Catalog` lee y proyecta Rates/Favorites/Pendings/Comments mediante relaciones, joins, subconsultas y SQL directo. Requests crea entidades de Catalog mediante repositorios TypeORM propios; no se encontró un caller backend de `RequestsService` desde Catalog.
- El frontend consume las cinco APIs. Varios controllers permiten lecturas y mutaciones por ID sin `@Auth()`; esto se anota como contrato actual.

## Comments

### Contrato HTTP

Controller: `src/community/comments/comments.controller.ts`; service: `src/community/comments/comments.service.ts`.

| Método y ruta | Acceso | Entrada | Respuesta observable / semántica |
|---|---|---|---|
| `POST /api/comments` | `@Auth()`; usuario autenticado, cualquier rol | `CreateCommentDto`: `comment` requerido; `discId` UUID v4; `parentId` UUID v4 opcional; `createdAt` fecha opcional | Devuelve entidad `Comment` guardada, con relaciones asignadas de User, Disc y parent; User es eager. Aunque service lanza 404 si Disc/parent no existe, su catch lo pasa a `handleDbExceptions`, que convierte cualquier error sin código 23505 a 500 genérico; código duplicado se devuelve como 400. |
| `GET /api/comments` | `@Auth()` | `PaginationDto`; `limit` (default 10), `offset` (0), `query`, `dateRange`, `genre`, `country`, `type` | Página `{ totalItems, totalPages, currentPage, limit, data }`. Solo comentarios del usuario autenticado. `type=comment` filtra texto no nulo; `query` busca disco/artista; fechas filtran por release date; genre/country filtran IDs. Orden: release date DESC, artist name ASC. Cada fila incluye Comment, Disc, Artist y Genre. Aunque `Comment.user` tiene eager metadata, este QueryBuilder no une explícitamente User y TypeORM no aplica eager automáticamente en QueryBuilder. |
| `GET /api/comments/:id` | Sin `@Auth()` | `id` UUID (ParseUUIDPipe) | Entidad `Comment` o 404; la relación `user` es eager. |
| `PATCH /api/comments/:id` | Sin `@Auth()` | `id` UUID; `UpdateCommentDto` (PartialType del DTO de creación) | Devuelve Comment guardado o 404; los errores de guardado siguen el manejo anterior. |
| `DELETE /api/comments/:id` | Sin `@Auth()` | `id` UUID | Si tiene replies, marca `isDeleted=true`, reemplaza texto por `Comentario eliminado` y devuelve un mensaje de soft delete; sin replies lo borra físicamente y devuelve mensaje de borrado permanente. Ausente: 404. |
| `GET /api/comments/disc/:discId` | Sin `@Auth()` | `discId` sin pipe UUID | Array de proyección: campos restantes de Comment, `isDeleted`, texto (texto fijo si borrado), `parentId`, `user:{id,username,image}` y `disc:{id,name}`. Disc no encontrado produce inicialmente 404 pero el catch del método lo convierte a 500 genérico. |

El DTO `CommentResponseDto` no declara `user.image`, aunque el mapper sí lo devuelve. `findCommentsByDisc` carga user, parent y disc explícitamente y reduce user/disc al objeto indicado.

### Dependencias

- `CommentsModule` importa `TypeOrmModule.forFeature([Comment, Disc])` y `AuthModule`; controller y provider propio: `CommentsController`, `CommentsService`.
- `CommentsService` inyecta `Repository<Comment>`. Consulta `Disc` con `commentRepository.manager.findOne`; no inyecta `Repository<Disc>` (el comentario de código lo deja comentado).
- Usa `User` del argumento del controller/JWT, `PaginationDto` compartido y `CommentResponseDto`; no depende directamente de otro service de Community.
- No exporta providers. `AppModule` registra `CommentsModule` directamente.

### TypeORM

- `Comment.user`: `ManyToOne(User, user.comments)`, eager, `onDelete: CASCADE`.
- `Comment.disc`: `ManyToOne(Disc, disc.comments)`, no eager, `onDelete: CASCADE`.
- `Comment.parent`: `ManyToOne(Comment, comment.replies)`, nullable, `onDelete: CASCADE`; `Comment.replies`: inversa `OneToMany`.
- La relación `Disc.comments` es `OneToMany(Comment, comment.disc)` con `eager: true`. `User.comments` es `OneToMany` con cascade true.
- `GET /comments` usa QueryBuilder y selecciona Disc/Artist/Genre; el comportamiento eager no se aplica automáticamente a QueryBuilder. `GET /comments/disc/:discId` solicita explícitamente user/parent/disc. Los métodos que devuelven entidad mediante `findOneByOrFail` o `save` sí quedan sujetos a la metadata eager.

### Consumers

- Backend: Catalog `DiscCatalogService.findOne` solicita `comments:{user:true}`; el detalle de Disc devuelve la colección Comment completa como parte de la entidad. Catalog también cuenta Comments por Disc en la lista de discos y en Queries de Favorites/Pendings/Rates.
- Frontend: `services/comments/comments.ts` consume POST, PATCH, DELETE, GET `/comments`, GET `/comments/disc/:discId`. `DiscList.vue` usa la lista del usuario; `ComentsModal.vue` consulta y crea por disco; `CommentItem.vue` crea replies, edita y borra.

### Tests actuales

- No hay suite propia `comments/*.spec.ts` encontrada.
- Catalog tiene cobertura relacionada de payload/detalle y los contadores aparecen en tests de Catalog/Home, pero no se encontró caracterización propia de Comments para permisos de endpoints, DTOs, filtros/paginación, forma de cada respuesta, errores, borrado lógico/físico, replies ni proyección por disco.

## Requests

### Contrato HTTP

Controller: `src/community/requests/requests.controller.ts`; service: `src/community/requests/requests.service.ts`.

| Método y ruta | Acceso | Entrada | Respuesta observable / semántica |
|---|---|---|---|
| `POST /api/requests` | `@Auth()`; cualquier rol autenticado | `CreateRequestDto`: nombres de disco/artista 1–100 chars; `releaseDate` se declara opcional pero no tiene decorador class-validator; ep, debut, description, image, link URL ≤255, genreId/countryId UUID opcionales | Devuelve `DiscRequest` guardada. `user`, `genre` y `country` son relaciones eager; los IDs se asignan como objetos relacionados. `releaseDate` no está whitelist por metadata de validación; con el `ValidationPipe` global (`whitelist` y `forbidNonWhitelisted`), enviarlo se rechaza como propiedad no permitida. |
| `GET /api/requests` | `@Auth(admin, riffValley)` | Ninguna | Array de entidades ordenado `createdAt DESC`; relaciones eager de user/genre/country. |
| `GET /api/requests/my` | `@Auth()` | Usuario autenticado | Array del usuario autenticado, `createdAt DESC`; mismas relaciones eager. |
| `GET /api/requests/:id` | `@Auth(admin, riffValley)` | UUID | Una entidad Request o 404 `Request <id> not found`. |
| `PATCH /api/requests/:id` | `@Auth(admin, riffValley)` | `UpdateRequestDto` (PartialType del create + adminNotes opcional) | Devuelve entidad guardada. Request aprobada: 400 `No se pueden modificar peticiones ya aprobadas`. `genreId`/`countryId` opcionales; si se envían vacíos/el valor falsy se limpian. |
| `POST /api/requests/:id/approve` | `@Auth(admin, riffValley)` | UUID | Crea/busca Artist, crea Disc y cambia estado a approved; devuelve Disc. Estado distinto a pending: 400 `Esta petición ya fue procesada`. |
| `POST /api/requests/:id/reopen` | `@Auth(admin, riffValley)` | UUID | Pone estado pending y borra adminNotes; devuelve Request. Aprobada: 400 `No se puede reabrir...`; ya pending: 400 `La petición ya está pendiente`. |
| `DELETE /api/requests/:id` | `@Auth(admin, riffValley)` | Body `adminNotes` requerido por controller en la práctica | Rechaza con 400 `El motivo del rechazo es obligatorio` si está vacío/blanco. En caso contrario marca rejected, guarda notas y devuelve Request. No elimina físicamente. |

`RequestStatus` tiene `pending`, `approved`, `rejected`; una Request aprobada no admite update ni reopen. `findAll` y `findByUser` ordenan por creación descendente. No se declaran filtros ni paginación.

### Dependencias

- `RequestsModule` importa `TypeOrmModule.forFeature([DiscRequest, Artist, Disc, Genre, Country])` y `AuthModule`; provider propio `RequestsService`, controller `RequestsController`.
- El service inyecta repositorios de DiscRequest, Artist, Disc, Genre y Country. `genreRepo` y `countryRepo` están inyectados/registrados pero no se usan directamente en el service actual; las relaciones se asignan con stubs `{id}` y se leen mediante relaciones eager.
- Dependencia directa de módulo Nest: `AuthModule`; no importa CatalogModule ni invoca services de Catalog. Dependencia por entidad/repositorio: repositorios de entidades Catalog para la aprobación (Artist/Disc) y referencias a Genre/Country.
- No exporta providers. `AppModule` registra `RequestsModule` directamente.

### TypeORM

- `DiscRequest.user`: `ManyToOne(User, user.requests)`, eager.
- `DiscRequest.genre` y `country`: `ManyToOne` nullable y eager, sin inversa declarada en Genre/Country para Request.
- `User.requests`: inversa `OneToMany`, cascade true.
- La aprobación usa `Artist.nameNormalized` y puede crear Artist, luego crea Disc con artist y, si existen, genre y otros datos de la solicitud. Esto produce entidades reales de Catalog y no una llamada a un service de Catalog.

### Consumers

- Backend: no se encontró caller externo de `RequestsService` en Catalog ni en Auth/User. El flujo de aprobación opera con los repositorios de Catalog desde Requests. `AuthModule` se importa para guards.
- `AccessRequestsModule` es independiente, registrado por separado y no importa `RequestsModule`, `RequestsService` ni `DiscRequest`; es un flujo distinto.
- Frontend: `services/requests/requests.ts` consume create, my, list admin, patch, approve, reopen y delete/reject. `SuggestPage.vue` consume create y my; `PetitionsPage.vue` consume las operaciones de gestión; `SidebarMenu.vue` consulta la lista para el indicador de solicitudes.

### Tests actuales

- No se encontró suite propia para Requests.
- Sin pruebas de Requests, no hay baseline específico localizado para rutas/permisos, transiciones de estado, validación del body de rechazo, errores 400/404, respuestas eager, aprobación que crea entidades de Catalog ni orden de las listas.

## Favorites

### Contrato HTTP

Controller `src/community/favorites/favorites.controller.ts`; service `src/community/favorites/favorites.service.ts`.

| Método y ruta | Acceso | Entrada | Respuesta observable / semántica |
|---|---|---|---|
| `GET /api/favorites` | `@Auth()` | `PaginationDto`: limit=10, offset=0, query, dateRange, genre, country y `orderBy` | Página `{totalItems,totalPages,currentPage,limit,data}`. Filtra favorites del usuario actual; busca disco/artista; filtra release date, genre y country (UUID o nombre); orden configurable con allowlist y fallback releaseDate DESC / artist ASC. Cada item incluye Favorite con Disc/Artist/Genre/Country y datos añadidos a `disc`: `userFavorite`, `voteCount`, `commentCount`, `userRate`, `userPending`, `averageRate`, `averageCover`. |
| `POST /api/favorites` | `@Auth()` | `CreateFavoriteDto`: `discId` UUID v4 | Devuelve entidad Favorite guardada y User/Disc asignados. Aunque service lanza 404 si Disc no existe, el catch lo pasa a `handleDbExceptions`: código duplicado produce 400 y los otros errores, incluido ese NotFound, se traducen a 500 genérico. |
| `GET /api/favorites/:id` | Sin `@Auth()` | UUID | Entidad Favorite (User eager) o 404. |
| `DELETE /api/favorites/:id` | Sin `@Auth()` | UUID | Borra por ID sin comprobar propietario; devuelve `{message}`. ID ausente: 404. |

### Dependencias

- `FavoritesModule` importa `TypeOrmModule.forFeature([Favorite, Disc])` y `AuthModule`; provider propio `FavoritesService` y controller `FavoritesController`.
- Inyecta solo `Repository<Favorite>`. Obtiene Disc mediante `favoriteRepository.manager.findOne`; importa la entidad `Pending` para join directo en listado. Consulta además tablas Rate y Comment desde QueryBuilder/subqueries.
- No depende de servicios externos de Community; sí tiene dependencia a metadata/tabla de Pending y cruces SQL con Rate/Comment. No exporta providers; `AppModule` lo registra directamente.

### TypeORM

- `Favorite.user`: `ManyToOne(User, user.favorite)`, eager, cascade delete.
- `Favorite.disc`: `ManyToOne(Disc, disc.favorites)`, cascade delete; no eager en lado owning.
- Inversas: `User.favorite` OneToMany cascade true; `Disc.favorites` OneToMany eager.
- Listado construye QueryBuilder explícito sobre Disc, Artist, Genre y Country. Une Pending y Rate por usuario y hace subconsultas para medias y conteos; cuenta Comments por disco. No depende de FavoritesService ni de cargar servicio externo.

### Consumers

- Backend Catalog: `DiscCatalogService` une los Favorites del usuario actual y mapea `favoriteId`; el detalle de Disc carga la colección completa `favorites` con user. Home SQL proyecta `userFavoriteId`; helper lo expone como `favoriteId`. FavoritesService en sí no tiene callers de servicio backend detectados.
- Frontend: `DiscList.vue` consume `GET /favorites`; `DiscCardComponent.vue` consume POST/DELETE; helper service declara GET listado. Estados `favoriteId` llegan también por endpoints Catalog/Home.

### Tests actuales

- No se encontraron specs propios de Favorites.
- Los tests de Catalog/Home cubren algunas proyecciones `favoriteId`/personal state. No se encontró characterization propia de CRUD, filtros, orden, page metadata, payload agregado del listado, errores o permisos (incluyendo rutas ID sin auth).

## Pendings

### Contrato HTTP

Controller `src/community/pendings/pendings.controller.ts`; service `src/community/pendings/pendings.service.ts`.

| Método y ruta | Acceso | Entrada | Respuesta observable / semántica |
|---|---|---|---|
| `POST /api/pendings` | `@Auth()` | `CreatePendingDto`: `discId` UUID v4 | Devuelve Pending guardado con User y Disc asignados; Disc puede incluir `Disc.pendings` eager en el Disc anidado. Aunque service lanza 404 si Disc no existe, el catch lo pasa a `handleDbExceptions`: código duplicado produce 400 y los otros errores, incluido ese NotFound, se traducen a 500 genérico. |
| `GET /api/pendings` | `@Auth()` | `PaginationDto`: limit=10, offset=0, query, dateRange, genre, country | Página `{totalItems,totalPages,currentPage,limit,data}` del usuario autenticado; búsqueda disco/artista, rango por releaseDate y filtros genre/country (UUID o nombre); orden releaseDate DESC y artist ASC. Disc se amplía con `userPending`, `voteCount`, `commentCount`, `userRate`, `averageRate`, `averageCover`, `favoriteId`; incluye colección `disc.favorites` filtrada al usuario. |
| `GET /api/pendings/:id` | Sin `@Auth()` | UUID | Entidad Pending (User eager y Disc según metadata inversa eager) o 404. |
| `DELETE /api/pendings/:id` | Sin `@Auth()` | UUID | Borra por ID sin comprobar propietario; devuelve `{message}`; ID ausente: 404. |

### Dependencias

- `PendingsModule` importa `TypeOrmModule.forFeature([Pending, Disc])` y `AuthModule`; provider propio `PendingsService` y controller `PendingsController`.
- Inyecta solo `Repository<Pending>`; localiza Disc mediante su manager. QueryBuilder selecciona Favorites para el usuario, une Rate y consulta tablas Rate/Comment para medias y conteos.
- No exporta providers ni llama a otros services de Community; `AppModule` lo registra directamente.

### TypeORM

- `Pending.user`: `ManyToOne(User, (user) => user.rate)`, eager, `onDelete: CASCADE`. Esa es exactamente la inversa declarada actualmente; ver hallazgo preexistente al final. `User.pending` apunta por su lado a `pending.user`, `OneToMany`, cascade true.
- `Pending.disc`: `ManyToOne(Disc, disc.pendings)`, `onDelete: CASCADE`, no eager en el lado owning.
- `Disc.pendings`: `OneToMany(Pending, pending.disc)` con `eager: true`.
- Listado selecciona explícitamente Disc, Artist, Genre, Country y Favorites de usuario mediante QueryBuilder, y hace joins/subqueries a Rate y Comment. Un test existente fija el filtrado de favoritos y la colección eager en create.

### Consumers

- Backend Catalog: listado de Disc une Pendings del usuario y mapea `pendingId`; calendario autenticado hace lo mismo y lo proyecta. Home SQL devuelve estado personal `pendingId`. El detalle `DiscCatalogService.findOne` solicita la colección de Pending y su User. No se encontró consumer de `PendingsService` por inyección.
- Frontend: `DiscList.vue` consume listado; `DiscCardComponent.vue`, `DiscComponent.vue` y `DiscComponentBaby.vue` crean/borran pendientes; las respuestas de Disc/Calendar/Home alimentan `pendingId`.

### Tests actuales

- `src/community/pendings/pendings.service.spec.ts`: valida campos combinados del listado ante Favorite ausente/uno/múltiples (favoriteId, collection, ausencia de `disc.pendings`/`comments`, joins), y conserva `Disc.pendings` eager en respuesta anidada de create.
- No hay tests localizados para rutas/controller y auth, creación normal/404, filtros/orden/paginación, findOne/delete y propietario; esas zonas carecen de baseline propio observado.

## Rates

### Contrato HTTP

Controller `src/community/rates/rates.controller.ts`; servicios `src/community/rates/rates.service.ts` y `src/community/rates/rates-stats.service.ts`.

| Método y ruta | Acceso | Entrada | Respuesta observable / semántica |
|---|---|---|---|
| `POST /api/rates` | `@Auth()` | `CreateRateDto`: `discId` UUID v4; `rate` y `cover` opcionales/nullables, numéricos hasta 2 decimales, 0–10 | Crea o actualiza la rate existente del mismo User/Disc; devuelve entidad Rate. Aunque service lanza 404 si Disc no existe, su catch traduce los errores sin código 23505 a 500 genérico; código duplicado DB produce 400. |
| `GET /api/rates` | `@Auth()` | `PaginationDto`: limit=10, offset=0, query/dateRange/genre/type/country/orderBy | Página `{totalItems,totalPages,currentPage,limit,data}` por usuario actual. `type=rate`/`cover` filtra valor no nulo; dateRange aplica releaseDate; query disco/artista; genre; country por UUID o nombre. Orden por allowlist de disco, artista, fecha, score y agregados; default releaseDate DESC / artist ASC. Cada Rate tiene Disc con Artist/Country/Genre y campos agregados/personalizados: `userRate`, `voteCount`, `commentCount`, `averageRate`, `averageCover`, `favoriteId`, `pendingId`. |
| `GET /api/rates/stats` | `@Auth()` | `year` opcional | Objeto con totalVotes, mean, median, votesByGenre, votesByMonth/weeks, votesByScore (scores 0–10), totalUsers y rank. Año filtra por release year de Disc. |
| `GET /api/rates/home-insights` | `@Auth()` | Ninguna | `{topArtists,countries}`; hasta siete artistas con promedio/conteo y hasta diez países con count/percentage. |
| `GET /api/rates/user/:userId/history` | Sin `@Auth()` | `type=rate|cover|both` default both; `order=ASC|DESC` default DESC; limit 20; offset 0; from/to opcionales | Página de eventos de Rate: `{userId,type,order,totalItems,totalPages,currentPage,limit,data}`. Cada evento tiene `rateId`, action created/updated, timestamp, dayLabel, rate, cover, disc `{id,name,artist?}`. La paginación se aplica a eventos. `from` y `to` solo forman rango si ambos están presentes. |
| `GET /api/rates/disc/:discId` | Sin `@Auth()` | `discId` | Array de Rates del disco con relación User. Disc no encontrado produce inicialmente 404 pero el catch del método lo convierte a 500 genérico. |
| `GET /api/rates/:id` | Sin `@Auth()` | UUID | Entidad Rate (User y Disc eager) o 404. |
| `PATCH /api/rates/:id` | `@Auth()` | UUID y `UpdateRateDto` (PartialType del create) | Solo propietario; devuelve Rate actualizada y fija editedAt. 404 si falta, 403 `You can only edit your own rates`. |
| `DELETE /api/rates/:id` | `@Auth()` | UUID | Solo propietario; borra y devuelve `{message}`. 404 si falta, 403 `You can only delete your own rates`. |

### Dependencias

- `RatesModule` importa `TypeOrmModule.forFeature([Rate, Disc])` y `AuthModule`; providers `RatesService`/`RatesStatsService`; controller `RatesController`.
- `RatesService` inyecta `Repository<Rate>`; carga Disc por `rateRepository.manager.findOne`. `RatesStatsService` inyecta `Repository<Rate>` y `Repository<User>` (User disponible desde `AuthModule`), sin inyectar servicios Catalog/Auth.
- `RatesService` cruza Pending por entidad en QueryBuilder, Favorite por tabla y Comment por subconsulta; helper externo común `apply-order.helper` procesa orden. No exporta providers; `AppModule` registra `RatesModule` directamente.

### TypeORM

- `Rate.user`: `ManyToOne(User, user.rate)`, eager, cascade delete; `Rate.disc`: `ManyToOne(Disc, disc.rates)`, eager, cascade delete.
- Inversas: `User.rate` OneToMany cascade true; `Disc.rates` OneToMany sin eager.
- `RatesStatsService` usa Artist/Country/Genre por joins desde Disc en QueryBuilder. Rates no declara relaciones propias directas con estas entidades.
- `GET /rates` QueryBuilder selecciona Disc/Artist/Genre/Country y añade agregados con subqueries/joins. Las rutas de entidad devueltas usan metadata eager según el método de lectura.

### Consumers

- Backend Auth: `AuthService` inyecta `Repository<Rate>` y calcula última votación/actividad en estadísticas de usuarios; carga actividad paginada con Disc/User y entrega votos por usuario junto a logins.
- Backend Catalog: Disc Catalog, Home y Calendar leen Rate para personal state/promedios/conteos/rankings; Artist Details/Search/Management agregan promedio y cantidad de rates por disco. No dependen de `RatesService` por DI.
- Frontend: `DiscList.vue` consume `/rates`; `DiscCardComponent.vue` consume GET por disco y POST/PATCH; `ArtistManagement.vue` consulta rates de discos; Dashboard consume historia/lista/home insights; `UserModal.vue` consume historia; `Statistics.vue` consume stats.

### Tests actuales

- `rates.controller.spec.ts`: metadatos de ruta, orden de `home-insights` antes de `:id`, guards y delegación de usuario.
- `rates-stats.service.spec.ts`: insights vacíos; top artists ordenados, limitados y normalizados; conteos/porcentajes de países; conteo >1000 sin cap de filas.
- No se encontraron specs de `RatesService`. Los tests de Catalog/Home/Artist cubren partes de agregación y proyecciones consumidoras, pero no create/update/delete, ownership, validación DTO, listados/filtros/orden, history, rates by disc ni todos los errores/respuestas HTTP.

## Dependencias cruzadas

| Cruce | Mecanismo actual | Observación del resultado |
|---|---|---|
| Favorites → Pendings | Importa entidad `Pending`; QueryBuilder hace join por discId/userId | El listado añade `disc.userPending:{id}`. |
| Pendings → Favorites | QueryBuilder de Pending hace `leftJoinAndSelect('disc.favorites', ...)` limitado al usuario | Conserva en la respuesta `disc.favorites` y deriva `favoriteId`. |
| Favorites/Pendings/Rates → Rates | SQL por nombre de tabla y subqueries: Rate/Favorite lists suman user rate; los tres calculan count/average de Rate | Campos agregados se embeben en el Disc de respuesta. No hay llamada a RatesService. |
| Favorites/Pendings/Rates → Comments | Subquery directa a tabla `comment` por Disc | Deriva `commentCount`, incluyendo el conteo del registro según query actual. Sin llamada a CommentsService. |
| Rates → Favorites/Pendings | joins a `favorite` y entidad Pending por disco/usuario | Añade `favoriteId` y `pendingId` al Disc contenido en el Rate. |
| Catalog → las cuatro entidades | Relaciones TypeORM desde Disc; QueryBuilder y SQL manual; subqueries de conteos/promedios | `userRate`, `favoriteId`, `pendingId`, `commentCount`, voteCount y colecciones de detalle se proyectan en respuestas de Catalog. |
| Requests → Catalog | Repositorios TypeORM de Artist/Disc/Genre/Country registrados e inyectados; aprobación crea Artist/Disc | No es cruce por service/module Catalog. |
| Auth → Rates | Auth registra Rate mediante `forFeature`; `AuthService` inyecta su repositorio | Dependencia directa de repositorio/entidad; Auth no importa RatesModule. |

No se encontraron cruces de servicio entre las capacidades. Las dependencias cruzadas son imports de entidades, repositorios/tablas y QueryBuilder/subconsultas; las respuestas agregadas convierten esos cruces en contratos observables.

## Consumers externos

### Catalog

- **Discs:** `DiscCatalogService` usa Rate para promedio/filtros/orden y estado de votación; une Favorite y Pending del usuario para `favoriteId`/`pendingId`; hace count de Comment. `findOne` carga las colecciones `favorites:{user}`, `pendings:{user}` y `comments:{user}` además de Artist/Country y Genre, y devuelve Disc con esas relaciones.
- **Home:** `DiscHomeService` y loaders ejecutan SQL directo sobre Rate; proyectan agregado global, distribución, ranking/top users, rate del usuario y favoriteId. Las vistas home no dependen de servicios Rate/Favorite.
- **Calendar:** el calendar autenticado une relaciones rates/favorites/pendings y mapea `userRate`, `favoriteId`, `pendingId`; el calendario público selecciona Disc/Artist/Country/Genre sin esas interacciones.
- **Artists:** `ArtistDetailsService`, `ArtistSearchService` y `ArtistManagementService` usan subqueries SQL `rate` para promedio/conteo por disco. No se detectó uso de Favorites, Pendings, Comments o Requests en esos servicios.
- **Requests/Catalog:** Requests consume entidades y repositorios de Catalog para aprobar y materializar una sugerencia como Artist/Disc; no se encontró el sentido inverso ni dependencia de Requests desde servicios Catalog.

Estas colecciones y datos agregados son payloads observables de consumidores Catalog aunque no siempre provengan de la API directa de la capacidad.

### Auth

- `AuthModule` registra `User`, `UserAccessLog` y `Rate`; `AuthService` inyecta Rate y lo usa para actividad y fecha de último voto/ranking de usuarios.
- `User` importa las cinco entidades y declara las inversas `rate`, `favorite`, `pending`, `comments` y `requests`, todas OneToMany con cascade true. Rate/Favorite/Pending/Comment/DiscRequest apuntan a esas inversas según se detalla por entidad; destaca el caso de Pending documentado abajo.
- La autenticación de Community llega por `AuthModule` importado por cada módulo y `@Auth()` en endpoints protegidos; `@GetUser()` consume el User establecido por JWT.

### Access Requests

- `AccessRequestsModule` es una capacidad raíz aparte, registrada en `AppModule`; su controller usa `/access-requests`. No depende de Requests ni de `DiscRequest` en los imports o consumers revisados. Solo se registra como capacidad vecina excluida, sin atribuirla a Community Requests.

### Frontend

El repositorio frontend revisado es `../spammusic-front`; los servicios API conservan los paths actuales:

- Comments: `src/services/comments/comments.ts`; callers `DiscList.vue`, `ComentsModal.vue`, `CommentItem.vue`.
- Requests: `src/services/requests/requests.ts`; callers `SuggestPage.vue`, `PetitionsPage.vue`, `SidebarMenu.vue`.
- Favorites: `src/services/favorites/favorites.ts`; listado en `DiscList.vue`, mutación en `DiscCardComponent.vue`.
- Pendings: `src/services/pendings/pendings.ts`; listado en `DiscList.vue`, mutaciones en `DiscCardComponent.vue`, calendario normal y calendario baby.
- Rates: `src/services/rates/rates.ts`; callers en `DiscList.vue`, `DiscCardComponent.vue`, `ArtistManagement.vue`, Dashboard, `UserModal.vue` y `Statistics.vue`.
- El frontend también depende de los campos derivados de Catalog: `userRate`, `favoriteId`, `pendingId`, `commentCount` y agregados de rates. Esos consumers no invocan siempre el endpoint propio de cada capacidad.

## Hallazgos preexistentes / fuera de alcance

- **Pending.user:** metadata actual exacta: `@ManyToOne(() => User, (user) => user.rate, { eager: true, onDelete: 'CASCADE' })`; la inversa de `User` destinada a Pending se llama `pending`. Se registra como hallazgo preexistente sin investigar ni cambiar metadata.
- **Acceso por ID sin auth:** Comments deja sin `@Auth()` GET/PATCH/DELETE por id y GET por disco; Favorites y Pendings dejan sin `@Auth()` GET/DELETE por id; Rates deja sin `@Auth()` history por userId, rates por Disc y GET por id. Se documenta literalmente el estado del controller, sin inferir una decisión de autorización.
- **Eager observable desde Disc:** `Disc.favorites`, `Disc.pendings` y `Disc.comments` son OneToMany eager; detalle de Disc añade User a esas tres colecciones. Consumers Catalog y algunos objetos anidados mantienen arrays observables.
- **Response DTO Comment incompleto:** `CommentResponseDto.user` declara id/username, mientras el mapper devuelve además image.
- Las rutas y contratos de `access-requests` quedan fuera de esta fotografía excepto por confirmar que son independientes de Requests.

## Implicaciones para A.2

Zonas donde no se encontró caracterización propia suficiente y que requieren revisión de cobertura en A.2:

- Comments: rutas, auth, DTOs/filtros, respuesta de disco frente a lista por usuario, replies, borrado lógico/físico y errores.
- Requests: permisos y todas las operaciones/transiciones, validación del rechazo, eager payload y side effects/repositorios de aprobación.
- Favorites: controller/servicio completos, ownership/acceso por ID, payload agregado, filtros, orden, paginación y cruces Pending/Rate/Comment.
- Pendings: endpoints y errores, filtros/orden/paginación y relación inversa declarada, además de la cobertura ya existente de join y respuesta eager en create.
- Rates: servicio completo (create upsert, ownership de edición/borrado, listados, history, disc y filtros/orden), contratos de estadísticas y consumers de Catalog/Auth.
- Para las cinco capacidades: payloads directos y embebidos de Catalog, asociaciones eager de User/Disc, relaciones cruzadas y endpoints frontend identificados; separar evidencia existente de zonas no cubiertas.

La priorización y asignación de esos huecos queda resuelta en la sección de baseline A.2 que sigue.

## Baseline mínimo de caracterización para la migración

Este baseline cubre únicamente seams que pueden romperse al cambiar paths, composición Nest/TypeORM o contratos básicos. “Caracterización” significa el bloque de comportamiento descrito, no una batería para cada combinación de entrada.

### Comments

**Cobertura existente:** no hay spec propio. Los tests de Catalog protegen `commentCount` y las colecciones en el detalle de Disc, pero no las operaciones de Comments.

**Caracterización mínima pendiente — 4 bloques nuevos:**

1. **Módulo, rutas y metadata:** comprobar que `CommentsModule` resuelve controller/service con `Repository<Comment>` y `AuthModule`, y que las rutas principales conservan sus métodos/path y `@Auth()` en create/listado; fijar relaciones Comment → User/Disc y parent/replies, incluida la metadata eager actual. **Motivo:** detecta wiring roto y cambios de metadata al relocalizar la entidad. **Tipo:** integración/DI, controller y metadata TypeORM. **Se implementará en:** B.1.
2. **Crear comentario y reply:** comprobar que create enlaza el User autenticado, Disc y parent opcional y devuelve Comment con la forma de entidad actual. **Motivo:** protege las referencias de User/Disc y el vínculo parent durante la reubicación. **Tipo:** unit de service. **Se implementará en:** B.1.
3. **Lecturas frontend:** comprobar el envelope paginado básico de `GET /comments` con Disc asociado y una lectura por disco con comentario normal, reply y comentario marcado eliminado, incluyendo `parentId`, proyección User/Disc, `isDeleted` y texto fijo de borrado. **Motivo:** protege ambas formas consumidas por `DiscList` y `ComentsModal`/`CommentItem`, además de la carga de relaciones; no cubre combinaciones de filtros. **Tipo:** unit de service / consumer characterization. **Se implementará en:** B.1.
4. **Borrado con y sin replies:** parametrizar los dos resultados actuales: soft delete cuando hay replies y delete físico cuando no los hay. **Motivo:** el cambio de respuesta y persistencia depende de la relación parent/replies. **Tipo:** unit de service. **Se implementará en:** B.1.

No se propone probar cada filtro de `GET /comments`, ni el endpoint PATCH por separado: la comprobación de rutas cubre su registro y esas reglas no son una dependencia específica del movimiento.

### Requests

**Cobertura existente:** no hay spec propio para Requests.

**Caracterización mínima pendiente — 4 bloques nuevos:**

1. **Módulo, rutas y roles:** resolver `RequestsModule`, controller/service y repositorios registrados, incluyendo las dependencias `AuthModule` y repositorios de Artist/Disc/Genre/Country; fijar paths/métodos y roles de las rutas administrativas. **Motivo:** protege composición, providers y contratos de acceso que Requests necesita después del movimiento. **Tipo:** integración/DI y controller. **Se implementará en:** C.1.
2. **Metadata y lectura de solicitud:** fijar las relaciones owning `DiscRequest → User/Genre/Country` como ManyToOne eager y la inversa `User.requests`; comprobar que create/listado devuelve entidades con esas relaciones y que las listas mantienen `createdAt DESC`. **Motivo:** preserva el payload eager y el orden consumidos por el frontend. **Tipo:** metadata TypeORM + unit de service. **Se implementará en:** C.1.
3. **Crear solicitud:** comprobar que el service asocia el User actual y las referencias opcionales Genre/Country y devuelve la entidad creada. **Motivo:** protege el vínculo de identidad y los repositorios Catalog usados por la capacidad. **Tipo:** unit de service. **Se implementará en:** C.1.
4. **Aprobar solicitud pendiente:** con Artist inexistente, comprobar creación de Artist y Disc con las referencias Genre/Country disponibles, retorno del Disc creado y transición de Request a approved; una segunda aprobación queda rechazada como ya procesada. **Motivo:** es el cruce funcional principal Requests → Catalog y fija el estado/resultado básico. **Tipo:** unit de service con repositorios mock. **Se implementará en:** C.1.

Se omiten pruebas separadas para cada variante de rechazo, reapertura, edición y error; la migración no cambia esas reglas y el flujo aprobado es el único materializador de entidades Catalog.

### Favorites

**Cobertura existente:** no hay spec propio. Catalog/Home ya fijan `favoriteId` y el detalle eager de `Disc.favorites`.

**Caracterización mínima pendiente — 3 bloques nuevos:**

1. **Módulo, rutas y metadata:** resolver controller/service y `Repository<Favorite>` mediante `FavoritesModule`/`AuthModule`, fijar métodos/path y la relación Favorite → User/Disc con sus inversas actuales y el eager de `Disc.favorites`. **Motivo:** detecta providers o imports rotos y cambios accidentales de metadata. **Tipo:** integración/DI, controller y metadata TypeORM. **Se implementará en:** D.1.
2. **Crear favorite:** comprobar que create enlaza User actual y Disc localizado y devuelve la entidad persistida. **Motivo:** protege las referencias necesarias para escritura y respuesta. **Tipo:** unit de service. **Se implementará en:** D.1.
3. **Listado enriquecido representativo:** comprobar la página básica y un Disc con userRate, userPending, conteos de Rate/Comment, medias y `userFavorite`; comprobar los valores ausentes como null donde formen parte de ese objeto. **Motivo:** protege los cruces SQL con Rates, Pendings y Comments que el frontend recibe juntos en Favorites. **Tipo:** unit de service / consumer characterization del endpoint. **Se implementará en:** D.1.

No se duplican tests de `favoriteId` en Catalog/Home ni se prueban matrices completas de filtros, orden y paginación.

### Pendings

**Cobertura existente que se reutiliza:** `pendings.service.spec.ts` ya protege el listado con Favorite ausente/uno/múltiples, `favoriteId`, la colección `disc.favorites`, la ausencia de `disc.pendings`/`disc.comments` en ese listado y el join filtrado por usuario. También protege el create anidado preservando la colección eager `Disc.pendings`.

**Caracterización mínima pendiente — 2 bloques nuevos:**

1. **Módulo, rutas y metadata:** resolver controller/service y `Repository<Pending>` vía `PendingsModule`/`AuthModule`; fijar rutas/métodos y metadata de Pending → User/Disc, incluyendo el destino inverso actual de `Pending.user` (`user.rate`) y la inversa User.pending. **Motivo:** confirma registro DI y evita que el movimiento cambie inadvertidamente una relación preexistente. La aserción preserva la metadata exacta; no propone corregirla. **Tipo:** integración/DI, controller y metadata TypeORM. **Se implementará en:** D.2.
2. **Listado enriquecido con datos presentes:** ampliar la caracterización del listado a un caso con Rate del usuario, Favorite, promedios y conteos de Rate/Comment no nulos; fijar `userPending`, `userRate`, `favoriteId` y agregados en Disc. **Motivo:** la suite actual cubre ramas de Favorite y varios valores ausentes, pero sus raw values dejan Rate/agregados en null y no fija la respuesta poblada. **Tipo:** unit de service / consumer characterization del endpoint. **Se implementará en:** D.2.

No se añade una segunda prueba de create ni se vuelve a probar la rama de Favorite ya cubierta.

### Rates

**Cobertura existente que se reutiliza:** `rates.controller.spec.ts` ya verifica registro/auth/delegación de `GET /rates/home-insights`; `rates-stats.service.spec.ts` ya fija insights vacíos, normalización/orden/límite de artistas y conteos/porcentajes de países. Los tests de Catalog/Home/Artists citados abajo caracterizan sus proyecciones y agregados.

**Caracterización mínima pendiente — 4 bloques nuevos:**

1. **Módulo, rutas y metadata:** resolver controller, `RatesService`, `RatesStatsService`, repositorios Rate/Disc y dependencia `AuthModule`; fijar paths/métodos de las rutas y metadata Rate → User/Disc (eager) e inversas. **Motivo:** cubre la composición/provider/import de entidad que más consumidores externos dependen de forma directa. **Tipo:** integración/DI, controller y metadata TypeORM. **Se implementará en:** E.1.
2. **Create/upsert:** comprobar alta con User/Disc y actualización de la Rate existente para el mismo par usuario/disco. **Motivo:** protege la escritura principal y que el repositorio/entidad siga resolviéndose tras moverla. **Tipo:** unit de service. **Se implementará en:** E.1.
3. **Listado enriquecido:** comprobar un Rate propio y su Disc con datos representativos de rate/cover, favoriteId, pendingId, conteos y medias, más el envelope paginado. **Motivo:** fija el cruce Rates ↔ Favorites/Pendings/Comments expuesto por esta API sin recorrer todos los filtros/orderBy. **Tipo:** unit de service / consumer characterization del endpoint. **Se implementará en:** E.1.
4. **Ownership de edición y borrado:** comprobar que el propietario puede editar/borrar y que un usuario distinto recibe el Forbidden actual en ambos casos. **Motivo:** preserva la frontera observable entre sesión/User y Rate. **Tipo:** unit de service. **Se implementará en:** E.1.

No se duplica `home-insights` ni se diseña una suite adicional para estadísticas, historial o cada variante de error.

### Consumers Catalog/Auth

- **Catalog: cobertura actual suficiente; no se propone test adicional.** `disc-catalog.service.spec.ts` fija el payload de listado con `userRate`, `favoriteId`, `pendingId`, `commentCount` y agregados, y fija la carga/respuesta de las colecciones eager de detalle. `disc-home.service.spec.ts` y `home-personal-state.postgres.spec.ts` cubren proyecciones personales, `commentCount` y agregados de Home; `disc-calendar.service.spec.ts` cubre `userRate`/`favoriteId`/`pendingId` de Calendar. Los specs de Artist Details/Search/Management existentes fijan agregados de Rates. La futura migración no cambia esos callers ni sus consultas.
- **Auth: falta cobertura focalizada de su consumo de Rate.** No se encontraron specs de `AuthService`, aunque `AuthModule` registra `Rate` y `AuthService` usa su repositorio en actividad e historial de usuario. Añadir una comprobación de resolución DI de `AuthService` y una lectura representativa de votos/actividad que demuestre el repositorio Rate y su relación Disc. **Tipo:** integración/DI + unit consumer characterization. **Se implementará en:** E.2, que es la subtarea que verifica el consumer Auth después de E.1.
- No se requieren suites nuevas del frontend: sus llamadas aportan evidencia de contrato, pero la caracterización backend cubre los endpoints y payloads relevantes para el movimiento.

### Qué NO vamos a caracterizar

- Combinaciones exhaustivas de filtros, orden y paginación; se fija únicamente el envelope y payload enriquecido representativo donde existe riesgo de relaciones cruzadas.
- Cada error por ID inexistente, cada transición secundaria de Requests, todos los endpoints CRUD de forma duplicada o todas las variantes de DTO.
- Una suite adicional de Catalog para campos ya fijados por sus specs actuales, ni una suite frontend.
- Rediseño o corrección de endpoints sin auth, errores 404 convertidos actualmente en 500, el DTO Comment incompleto, eager loading, QueryBuilders, duplicaciones, performance o `Pending.user`; salvo la aserción de metadata de Pendings que solo preserva su declaración actual.
