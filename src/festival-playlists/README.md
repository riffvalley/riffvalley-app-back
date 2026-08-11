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
5. Ejecutar las migraciones `1786400000000-CreateSpotifyConnections` y
   `1786401000000-CreateSpotifyPlaylistArtists`.

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
`GET /api/festival-playlists/spotify/connection`.

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

### 3. Añadir un artista

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

### 4. Consultar o quitar artistas

`GET /api/festival-playlists/:spotifyId` devuelve la playlist con sus artistas,
pistas y estados.

`DELETE /api/festival-playlists/:spotifyId/artists/:artistId` elimina sus pistas
de Spotify y su relación local. Una pista compartida con otro artista se conserva.

`DELETE /api/festival-playlists/spotify/connection` elimina los tokens locales,
pero no borra las playlists creadas en Spotify.

## Criterio musical

Se analizan por defecto los últimos diez conciertos con canciones y se obtienen
las diez canciones más repetidas. Cada canción cuenta una sola vez por concierto
y se excluyen las entradas `tape`. Las respuestas conservan las URLs fuente de
setlist.fm para que el frontend muestre la atribución correspondiente.
