# Clasificación, ownership y resultado de S.3

Este documento conserva la clasificación de S.2 y registra las decisiones finales que la implementación S.3 tomó. El inventario de partida está en [spotify-inventory.md](spotify-inventory.md).

## Decisiones aplicadas en S.3/S.4/S.5/S.6

- `RiffValleyPlaylist` representa los registros editoriales propios de Riff Valley. Entity, enums, service, controller, DTOs, módulo, archivos y tests viven bajo `src/riff-valley-playlists/`.
- `Spotify*` se conserva para el proveedor, sus recursos externos, OAuth, Client Credentials, Spotify API, IDs remotos y URLs. `src/spotify-integration/` posee la integración externa y registra las fachadas HTTP bajo las rutas conservadas `/api/spotify/artists/...` y `/api/spotify/albums/...`.
- `FestivalPlaylistsService` sigue coordinando datos locales y sincronización remota. Los repositorios, relaciones y variables locales usan `riffValleyPlaylist*`; los IDs de playlists remotas, artistas y tracks conservan `spotify*`.
- La asociación se llama `RiffValleyPlaylistArtist`: su FK/modelo apunta a la playlist local y mantiene `spotifyArtistId`/`spotifyTrackId` para recursos externos.
- `ContentType.RIFF_VALLEY_PLAYLIST` usa el valor `riff_valley_playlist`; una migración reversible cambia el valor del enum existente sin tocar filas. `CreateContentDto` y la relación usan `riffValleyPlaylistId`/`riffValleyPlaylist`.
- `User.riffValleyPlaylists` reemplaza la colección local `User.spotify`. Artist Management expone `riffValleyPlaylists`.
- CRUD, listados, filtros, detalle, Content asociado y operaciones de géneros/festivales del recurso local usan `/api/riff-valley-playlists/...`. Las fachadas externas `/api/spotify/artists/...` y `/api/spotify/albums/...` no cambian. Las rutas OAuth bajo `/api/festival-playlists/spotify/...` siguen identificando Spotify externo.
- Frontend migrado en la misma tarea: cliente y tipos, páginas, rutas internas y menú de navegación, gestores, calendario/Content, artistas, payloads y usos de los endpoints. El callback TikTok también apunta a las nuevas rutas de interfaz. No se conserva alias ni endpoint legacy local.

## Persistencia física

S.4 migró físicamente el dominio local a `riff_valley_playlists`; `Content.riffValleyPlaylist` usa `riffValleyPlaylistId`; la asociación vive en `riff_valley_playlist_artists` con `riff_valley_playlist_id`. Constraints, índice y enums de estas entidades usan nombres de dominio `riff_valley_playlist*`. `userId` permanece porque describe una relación con User. `spotifyPlaylistId`/`spotify_playlist_id`, `spotifyArtistId`, `spotifyTrackId` y sus URIs continúan identificando recursos externos.

No se reescribieron migraciones históricas. La migración S.3 de `content_type_enum` sigue siendo reversible y cambia el valor persistido a `riff_valley_playlist`. La migración S.4 añade renames de tablas, columna, constraints, índice y enums, sin recrear ni actualizar filas.

## Clasificación de responsabilidades

| Referencia/área                                           | Clasificación y ownership                          | Estado tras S.3                                                                                                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRUD/listados/Content asociado de playlist local          | RiffValleyPlaylist                                 | Renombrado, aislado y expuesto bajo `/api/riff-valley-playlists`.                                                                                                                                 |
| Content y User                                            | Relación al dominio local                          | Propiedades `riffValleyPlaylist`, `riffValleyPlaylistId`, `riffValleyPlaylists`; columna física histórica mapeada explícitamente.                                                                 |
| Artist Management y asociación                            | Catálogo consume `RiffValleyPlaylistArtist`        | Relación y respuesta usan `riffValleyPlaylists`; asociación renombrada.                                                                                                                           |
| Festival/genre playlist orchestration                     | Feature local que sincroniza Spotify               | Service se mantiene; nombres de repositorios/variables/params locales corregidos. Su refactor es S.5/S.6 cuando proceda.                                                                          |
| OAuth, SpotifyConnection y TokenCryptoService             | Integración externa Spotify                        | `SpotifyIntegrationModule` posee OAuth, entity/conexión y cifrado; Festival Playlists mantiene decisiones de lifecycle y negocio. No se cambió el schema OAuth.                                   |
| API externa y controllers de artistas/álbumes             | Integración externa Spotify                        | Viven bajo `src/spotify-integration/`; `/api/spotify/artists/...` y `/api/spotify/albums/...` conservan sus contratos.                                                                            |
| Client Credentials y transporte                           | Integración externa Spotify                        | Un `SpotifyClientCredentialsService` cachea/renueva el token; `SpotifyPublicApiService` ejecuta lecturas públicas y Contents consume el provider de Client Credentials. `WordpressModule` dejó de poseerlos. |
| Discs, Lists y Contents scheduler                         | Consumers con ownership de negocio                 | Catalog/Lists mantienen sus decisiones; Contents conserva `checkMissingSpotifyLinks`, query/fallback/matching y delega transporte Spotify.                                                        |
| Festival Playlists y setlist.fm                           | Orquestación del feature y proveedor independiente | `FestivalPlaylistsService` conserva sincronización y reglas del feature; requests setlist.fm continúan allí y fuera de integración Spotify.                                                       |
| Mail                                                      | Envío de correo                                    | `MailService.sendSpotifyReauthorizationReminder()` permanece en Mail.                                                                                                                             |
| Migraciones, SQL raw e identificadores físicos históricos | Historial o persistencia                           | Las migraciones históricas conservan nombres legacy; el schema activo usa nombres locales para playlist/relaciones. `spotify_playlist_id` activo se conserva porque identifica el recurso remoto. |

## Hallazgo contractual resuelto

### Contract finding

**Current behavior:** el namespace `/api/spotify` contenía tanto CRUD de playlists propias como las fachadas reales `/artists` y `/albums`; `Content`/DTOs serializaban `spotify` y `spotifyId`; Artist Management devolvía `spotifyPlaylists`.

**Problem:** el nombre del proveedor identificaba recursos propios en rutas y payloads, y el mismo namespace sugería ownership externo para operaciones locales.

**Impact:** backend + frontend.

**Options:** (1) preservar compatibilidad; (2) refactorizar internamente; (3) cambiar el contrato; (4) coordinar la migración backend/frontend.

**Recommendation:** coordinar un contrato explícito con migración de todos los consumers conocidos, pues eliminar el nombre ambiguo da un beneficio claro y ambos repositorios están disponibles.

**Blocks the current task:** No. La tarea autorizó expresamente el cambio y se migraron los consumers encontrados en backend y frontend. No quedan aliases ni endpoints temporales.

## Estado de S.5/S.6

`SpotifyIntegrationModule` agrupa `SpotifyPublicApiService`, `SpotifyClientCredentialsService`, `SpotifyOAuthApiService`, `SpotifyAccountApiService`, `SpotifyConnection`, `TokenCryptoService` y las fachadas externas de artistas/álbumes. La estructura actual separa `api/`, `http/` (con sus DTOs de rutas) y `oauth/`; `SpotifyAlbumGroup` vive con los tipos de la API pública. Los consumers usan `src/spotify-integration/index.ts` para providers exportados, sin importar controllers por esa superficie. Catalog/Discs, Lists, Contents y Festival Playlists dependen de integración; la integración no importa esos módulos. `WordpressModule` solo posee WordPress. Las rutas HTTP y contratos no cambiaron. Los requests directos a `accounts.spotify.com` y `api.spotify.com` quedan dentro de `spotify-integration`; los requests de Bandcamp y setlist.fm siguen con sus flujos actuales. El job de Contents conserva ownership y fallback.

## Cierre S.9 — decisiones finales

Las decisiones de S.2 sobre conservar el CRUD local bajo `/spotify` y mantener `spotify`/`spotifyId` en los contratos eran provisionales: S.3 las sustituyó por el rename coordinado de rutas, tipos y consumers. S.4 llevó ese rename a la persistencia; S.5/S.6 fijaron `SpotifyIntegrationModule` como única frontera externa; S.7/S.9 verificaron el cierre backend/frontend. La arquitectura final es la descrita en las decisiones aplicadas arriba, no las hipótesis de partida del inventario.

S.1–S.9 están completadas. La regresión final y sus fallos ajenos al área Spotify están registrados en [spotify.md](spotify.md). La metadata y migraciones se verificaron por inspección/tests, pero no contra una instancia PostgreSQL real porque no hay cliente ni servicio local disponible. No quedan tareas abiertas en esta ruta Spotify.

## Referencias `spotify` justificables

Las referencias `spotify*` físicas que persisten en migraciones antiguas son históricas. En el schema activo, `spotify_playlist_id`, `spotify_artist_id`, `spotifyTrackId` y URIs/URLs representan recursos externos; el constraint `UQ_riff_valley_playlists_spotify_playlist_id` incluye el nombre local de la tabla y el identificador remoto que protege. No quedan tablas, columnas, enums, constraints o índices físicos activos `spotify*` que representen el dominio local.
