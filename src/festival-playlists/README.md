# Festival playlists sincronizadas

La playlist real de Spotify se crea al principio en la cuenta oficial de Riff
Valley. Cada alta o baja de un artista actualiza inmediatamente Spotify y la
base de datos.

## Configuración

1. Crear una aplicación en Spotify for Developers.
2. Registrar exactamente el valor de `SPOTIFY_REDIRECT_URI`. En local debe
   usarse `127.0.0.1`; Spotify no admite `localhost`. En producción debe ser
   HTTPS.
3. Obtener una API key de setlist.fm.
4. Configurar las variables de `.env.template`. La clave
   `SPOTIFY_TOKEN_ENCRYPTION_KEY` debe ser estable y tener al menos 32
   caracteres.
5. Ejecutar las migraciones `1786400000000-CreateSpotifyConnections`,
   `1786401000000-CreateSpotifyPlaylistArtists` y
   `1786402000000-AddSpotifyPlaylistImage` y
   `1786403000000-AddSpotifyProtectedTracks` y
   `1786404000000-AddSpotifyAuthorizationLifetime`.
6. Opcionalmente, configurar `SPOTIFY_REAUTH_NOTIFICATION_EMAIL`. Si no está
   definida se utiliza `MAIL_TO`. El backend envía un único aviso cuando quedan
   14 días o menos para volver a autorizar Spotify.

## Flujo

Todas las rutas salvo el callback requieren el JWT de Riff Valley App. Existe
una única conexión OAuth global, identificada como `riff-valley`; las
credenciales no pertenecen al usuario que ejecuta la operación. Los roles
`admin`, `superUser` y `riffValley` pueden conectar, desconectar y gestionar la
cuenta oficial y sus playlists.

### 1. Conectar Spotify

`POST /api/festival-playlists/spotify/connect` devuelve `authorizationUrl`. El
frontend redirige allí al usuario y Spotify vuelve al callback del backend.

El estado puede consultarse con
`GET /api/festival-playlists/spotify/connection`. La respuesta incluye
`canUploadImages` y `missingScopes`; si falta `ugc-image-upload`, hay que volver
a completar el OAuth antes de cambiar portadas. También incluye
`authorizationStatus`, `reauthorizationRequired`, `reauthorizationReason`,
`authorizedAt`, `refreshTokenExpiresAt` y `daysUntilReauthorization`.

Los access tokens se renuevan automáticamente al utilizarlos. Spotify limita el
refresh token a seis meses: su renovación no amplía esa fecha. Un cron diario a
las 09:00 (Europe/Madrid) comprueba la caducidad y envía el recordatorio; si el
token caduca o Spotify responde `invalid_grant`, el frontend debe iniciar de
nuevo el OAuth. Nunca se guardan el usuario ni la contraseña de Spotify.

### 2. Crear la playlist

`POST /api/festival-playlists`

```json
{
  "name": "Resurrection Fest 2027",
  "description": "Canciones probables del festival",
  "public": false
}
```

La operación crea inmediatamente la playlist vacía en Spotify y el registro
local en `spotify`, incluyendo `spotifyPlaylistId`, URL y fecha. No asigna la
playlist al usuario que pulsa el botón.

También se puede crear el registro local a partir de una playlist que ya existe
en Spotify con `POST /api/festival-playlists/link` y el cuerpo
`{ "spotifyUrl": "https://open.spotify.com/playlist/..." }`. Si existe un único
registro antiguo con ese enlace, se reutiliza en lugar de crear un duplicado.
Si no existe, se crea ya vinculado con los metadatos y pistas protegidas de
Spotify.

Los registros antiguos que ya tengan un enlace de Spotify pero no tengan
`spotifyPlaylistId` se vinculan con
`POST /api/festival-playlists/:spotifyId/link`. El backend comprueba que la
playlist pertenezca a la cuenta conectada, sincroniza sus metadatos y conserva
como protegidas todas las pistas que ya existían para que al quitar después un
artista no se borren accidentalmente.

### 3. Editar nombre, descripción, visibilidad o portada

`PATCH /api/festival-playlists/:spotifyId` acepta uno o varios campos:

```json
{
  "name": "Resurrection Fest 2027 actualizado",
  "description": "Nueva descripción",
  "public": true
}
```

`PUT /api/festival-playlists/:spotifyId/image` recibe `multipart/form-data` con
la imagen en el campo `image`. Spotify sólo admite JPEG y limita a 256 KB la
imagen codificada en Base64, por lo que conviene comprimir la portada antes de
subirla. La URL resultante queda guardada en `imageUrl`.

### 4. Añadir un artista

`POST /api/festival-playlists/:spotifyId/artists`

```json
{
  "artistId": "UUID_DEL_ARTISTA",
  "tracksPerArtist": 10,
  "recentSetlists": 10
}
```

El backend obtiene las canciones frecuentes, las resuelve en Spotify y las
añade inmediatamente. En `spotify_playlist_artists` quedan guardados el artista,
las pistas exactas, los conciertos analizados y el estado de sincronización. Si
la sincronización falla, el registro permanece con estado `failed` y puede
reintentarse enviando de nuevo el mismo `POST`.

Antes de añadir pistas se consulta el contenido real de Spotify, de forma que
no se duplican canciones que ya estuvieran en una playlist vinculada.

### 5. Consultar o quitar artistas

`GET /api/festival-playlists/:spotifyId` devuelve la playlist con sus artistas,
pistas y estados.

`DELETE /api/festival-playlists/:spotifyId/artists/:artistId` elimina sus pistas
de Spotify y su relación local. Una pista compartida con otro artista se conserva.

`DELETE /api/festival-playlists/:spotifyId/tracks` vacía por completo la
playlist real de Spotify, incluidas las pistas anteriores a la vinculación. Las
eliminaciones se envían en lotes de cien y, cuando Spotify termina, se borran
también todas las asociaciones locales de artistas y la lista de pistas
protegidas. Es una operación destructiva que el frontend debe confirmar de
forma explícita.

`DELETE /api/festival-playlists/spotify/connection` elimina los tokens locales,
pero no borra las playlists creadas en Spotify.

## Playlists de género con selección manual

Las playlists `genero`, `especial` y `otras` reutilizan la misma conexión OAuth,
pero cada artista guarda exactamente dos canciones elegidas por el usuario. La
búsqueda se consulta en Spotify al vuelo y la selección final se persiste en
`spotify_playlist_artists.tracks` con `selection_mode = manual`.

- `POST /api/genre-playlists` crea la playlist real y el registro local.
- `POST /api/genre-playlists/link` vincula una playlist pegando su URL.
- `POST /api/genre-playlists/:spotifyId/link` vincula un registro local antiguo.
- `GET /api/genre-playlists/:spotifyId/artists/:artistId/tracks?q=...` busca
  canciones del artista en Spotify.
- `POST /api/genre-playlists/:spotifyId/artists` recibe `artistId` y dos
  `spotifyTrackIds` distintos.
- `PUT /api/genre-playlists/:spotifyId/artists/:artistId/tracks` sustituye las
  dos canciones guardadas.
- `DELETE /api/genre-playlists/:spotifyId/artists/:artistId` elimina el artista
  sin borrar canciones protegidas o compartidas.
- `DELETE /api/genre-playlists/:spotifyId/tracks` vacía completamente la
  playlist real y sus asociaciones locales.
- `POST /api/genre-playlists/:spotifyId/shuffle` mezcla el orden de todas las
  canciones reales, incluidas las anteriores a la vinculación.

Los metadatos y la imagen se gestionan con
`PATCH /api/genre-playlists/:spotifyId` y
`PUT /api/genre-playlists/:spotifyId/image`.

## Criterio musical

Se analizan por defecto los últimos diez conciertos con canciones y se obtienen
las diez canciones más repetidas. Cada canción cuenta una sola vez por concierto
y se excluyen las entradas `tape`. Las respuestas conservan las URLs fuente de
setlist.fm para que el frontend muestre la atribución correspondiente.
