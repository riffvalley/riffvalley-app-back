# Integración de TikTok

Espejo de contenido de la cuenta oficial de TikTok de Riff Valley (`@riffvalley`),
igual de espíritu que Instagram: una única conexión OAuth global (no por
usuario), un cron que sincroniza los vídeos públicos a una tabla local, y un
endpoint público que sirve esa caché. Ninguna ruta salvo `connect`,
`connection` y `DELETE connection` requiere JWT.

## Configuración

1. Crear una app en [TikTok for Developers](https://developers.tiktok.com),
   añadir el producto **Login Kit** y los scopes `user.info.basic` y
   `video.list`. Con una única cuenta propia basta el modo **Sandbox** +
   **Target Users** (añadir `@riffvalley` como tester) — no hace falta pasar
   por App Review.
2. Registrar exactamente `TIKTOK_REDIRECT_URI` en Login Kit → Web. TikTok
   exige HTTPS (no admite `127.0.0.1`/`localhost` como Spotify), así que en
   local solo se puede completar el flujo contra un dominio real (producción
   o un túnel HTTPS).
3. Configurar las variables de `.env.template`. `TIKTOK_TOKEN_ENCRYPTION_KEY`
   debe ser estable y tener al menos 32 caracteres.
4. Ejecutar las migraciones `1786500000000-CreateTiktokConnections`,
   `1786501000000-CreateTiktokVideo` y
   `1786502000000-AddPermalinkToTiktokVideo`.
5. Opcionalmente, configurar `TIKTOK_REAUTH_NOTIFICATION_EMAIL`. Si no está
   definida se usa `MAIL_TO`. Se envía un único aviso cuando quedan 14 días o
   menos para que caduque la autorización (TikTok limita el refresh token a
   365 días desde la última conexión).

## Contratos

Base URL: `/api/tiktok`. Todas las fechas van en ISO 8601 (UTC).

### `POST /connect`

Arranca el flujo OAuth. **Requiere JWT** de rol `admin`, `superUser` o
`riffValley` — el frontend hace la llamada autenticada y luego redirige él
mismo a `authorizationUrl` (el backend no hace un 302 en este paso).

```http
POST /api/tiktok/connect
Authorization: Bearer <jwt>
```

```json
// 201 Created
{
  "authorizationUrl": "https://www.tiktok.com/v2/auth/authorize/?client_key=sbawaeewdaj4cc8ohv&response_type=code&redirect_uri=https%3A%2F%2Fspammusic-back-99963122d70c.herokuapp.com%2Fapi%2Ftiktok%2Fcallback&scope=user.info.basic%2Cvideo.list&state=WJERo1AXEJQwWNBwOS1YGZQhuVhQCj_Oop-Dk2NUTos"
}
```

Errores: `401` sin JWT o rol insuficiente (shape estándar de Nest, ver
abajo); `500` si faltan `TIKTOK_CLIENT_KEY`/`TIKTOK_REDIRECT_URI` en el
backend.

### `GET /callback`

Público (TikTok redirige aquí el navegador, sin JWT). No lo llama el
frontend directamente, es la propia URL que TikTok invoca tras el consentimiento:

```
GET /api/tiktok/callback?code=...&scopes=user.info.basic,video.list&state=...
```

Si `TIKTOK_FRONTEND_REDIRECT_URL` está configurada (lo está en prod:
`https://app.riffvalley.es/spotify/festivales`), responde con un **302** a:

```
https://app.riffvalley.es/spotify/festivales?tiktok=connected
```

o, si algo falla (state inválido/caducado, error de TikTok, `invalid_grant`...):

```
https://app.riffvalley.es/spotify/festivales?tiktok=error
```

El frontend debe leer el query param `tiktok` en esa página de destino para
mostrar el resultado (y opcionalmente volver a pedir `GET /connection` para
refrescar el estado mostrado).

### `GET /connection`

Estado de la conexión. **Requiere JWT** (mismos roles que `connect`).

```http
GET /api/tiktok/connection
Authorization: Bearer <jwt>
```

```ts
interface TiktokConnectionStatus {
  connected: boolean;
  openId: string | null;
  displayName: string | null;
  missingScopes: string[]; // subconjunto de ["user.info.basic","video.list"]
  authorizationStatus:
    | 'disconnected'
    | 'connected'
    | 'expiring_soon'
    | 'reauthorization_required';
  reauthorizationRequired: boolean;
  reauthorizationReason: 'refresh_token_expired' | 'refresh_token_invalid' | null;
  authorizedAt: string | null;
  refreshTokenExpiresAt: string | null;
  daysUntilReauthorization: number | null;
}
```

Ejemplo real (cuenta conectada, capturado en producción):

```json
// 200 OK
{
  "connected": true,
  "openId": "-000q-hiJccQwYtqbsCArR1ZDswxG3knKug6",
  "displayName": null,
  "missingScopes": [],
  "authorizationStatus": "connected",
  "reauthorizationRequired": false,
  "reauthorizationReason": null,
  "authorizedAt": "2026-08-21T18:45:07.868Z",
  "refreshTokenExpiresAt": "2027-08-21T18:45:07.868Z",
  "daysUntilReauthorization": 365
}
```

Sin conectar:

```json
// 200 OK
{
  "connected": false,
  "openId": null,
  "displayName": null,
  "missingScopes": ["user.info.basic", "video.list"],
  "authorizationStatus": "disconnected",
  "reauthorizationRequired": false,
  "reauthorizationReason": null,
  "authorizedAt": null,
  "refreshTokenExpiresAt": null,
  "daysUntilReauthorization": null
}
```

`displayName` puede salir `null` aunque `connected` sea `true` — TikTok no
siempre devuelve el nombre en `user/info`; no depender de él para saber si
hay conexión, usar `connected`/`authorizationStatus`.

Cuando `authorizationStatus` es `expiring_soon` o `reauthorization_required`,
el frontend debe ofrecer volver a pulsar "Conectar TikTok" (repite el flujo
de `POST /connect`).

### `DELETE /connection`

Desconecta la cuenta (borra la fila). **Requiere JWT** (mismos roles).
Operación destructiva: el frontend debe confirmarla.

```json
// 200 OK
{ "connected": false }
```

### `GET /videos`

**Público, sin JWT.** Lista paginada, pensada para pintar una grid/carrusel
— deliberadamente ligera: no incluye `embedHtml` (pesa ~1-2KB por vídeo, el
`<blockquote>` + `<script>` del widget oficial) ni `videoDescription`
(normalmente idéntica a `title`) ni columnas internas de BD. Usa el id de
TikTok como `id` público, no el uuid interno.

```http
GET /api/tiktok/videos?limit=12&offset=0
```

- `limit`: entero 1–50 (por defecto 12).
- `offset`: entero ≥0 (por defecto 0).

```ts
interface TiktokVideoSummary {
  id: string; // id de TikTok (p.ej. "7675082523445153027")
  title: string | null;
  coverImageUrl: string | null;
  permalink: string | null; // enlace a la página del vídeo en tiktok.com
  embedLink: string | null; // URL del reproductor en iframe
  duration: number | null; // segundos
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  createTime: string; // fecha de publicación en TikTok
}

interface TiktokVideosResponse {
  data: TiktokVideoSummary[];
  totalItems: number;
  hasMore: boolean; // true si offset + data.length < totalItems
}
```

Ejemplo real (basado en datos de producción, recortado a 1 vídeo):

```json
// 200 OK — GET /api/tiktok/videos?limit=1&offset=0
{
  "data": [
    {
      "id": "7675082523445153027",
      "title": "OS TRAEMOS TRES DISCOS DE JULIO QUE NO DEBES PERDERTE. #metal #recomendaciones #mejoresdelmes #music",
      "coverImageUrl": "https://p16-common-sign.tiktokcdn-eu.com/tos-no1a-p-0037-no/oQuwERiaAnS5TMRDCABAIeQyIY1wXBCCAaijvc~tplv-tiktokx-cropcenter-q:300:400:q70.jpeg?dr=9232&x-expires=1787425200&x-signature=bJrYzRKuH%2FkW59UCwIDeZ7fhgek%3D&...",
      "permalink": "https://www.tiktok.com/@riffvalley/video/7675082523445153027",
      "embedLink": "https://www.tiktok.com/player/v1/7675082523445153027?music_info=1&description=1&autoplay=1&loop=1&utm_campaign=tt4d_open_api&utm_source=sbawaeewdaj4cc8ohv",
      "duration": 69,
      "viewCount": 795,
      "likeCount": 8,
      "commentCount": 2,
      "shareCount": 0,
      "createTime": "2026-08-17T19:20:11.000Z"
    }
  ],
  "totalItems": 86,
  "hasMore": true
}
```

`coverImageUrl` es una URL firmada por TikTok con expiración
(`x-expires`); se refresca sola en cada sincronización, así que no hace
falta cachearla del lado del frontend más allá de una sesión de navegación.

### `GET /videos/:id`

**Público, sin JWT.** `:id` es el id de TikTok (el mismo `id` que devuelve
`GET /videos`, no el uuid interno). Pensado para una vista de detalle de un
único vídeo (modal, página propia) donde sí interesa el embed oficial
completo.

```ts
interface TiktokVideoDetail extends TiktokVideoSummary {
  videoDescription: string | null;
  embedHtml: string | null; // <blockquote class="tiktok-embed">...<script>
}
```

```json
// 200 OK — GET /api/tiktok/videos/7675082523445153027
{
  "id": "7675082523445153027",
  "title": "OS TRAEMOS TRES DISCOS DE JULIO QUE NO DEBES PERDERTE. #metal #recomendaciones #mejoresdelmes #music",
  "coverImageUrl": "https://p16-common-sign.tiktokcdn-eu.com/tos-no1a-p-0037-no/oQuwERiaAnS5TMRDCABAIeQyIY1wXBCCAaijvc~tplv-tiktokx-cropcenter-q:300:400:q70.jpeg?...",
  "permalink": "https://www.tiktok.com/@riffvalley/video/7675082523445153027",
  "embedLink": "https://www.tiktok.com/player/v1/7675082523445153027?music_info=1&description=1&autoplay=1&loop=1&utm_campaign=tt4d_open_api&utm_source=sbawaeewdaj4cc8ohv",
  "duration": 69,
  "viewCount": 795,
  "likeCount": 8,
  "commentCount": 2,
  "shareCount": 0,
  "createTime": "2026-08-17T19:20:11.000Z",
  "videoDescription": "OS TRAEMOS TRES DISCOS DE JULIO QUE NO DEBES PERDERTE. #metal #recomendaciones #mejoresdelmes #music",
  "embedHtml": "<blockquote class=\"tiktok-embed\" cite=\"https://www.tiktok.com/@riffvalley/video/7675082523445153027?utm_campaign=tt4d_open_api&utm_source=sbawaeewdaj4cc8ohv\" data-video-id=\"7675082523445153027\" style=\"max-width: 605px;min-width: 325px;\"> <section> <a target=\"_blank\" title=\"@riffvalley\" href=\"https://www.tiktok.com/@riffvalley\">@riffvalley</a> <p>OS TRAEMOS TRES DISCOS DE JULIO QUE NO DEBES PERDERTE. <a title=\"metal\" href=\"https://www.tiktok.com/tag/metal\">#metal</a> ...</p> </section> </blockquote> <script async src=\"https://www.tiktok.com/embed.js\"></script>"
}
```

Si `:id` no existe en la caché local:

```json
// 404 Not Found
{
  "statusCode": 404,
  "message": "Vídeo de TikTok no encontrado",
  "error": "Not Found"
}
```

## Errores comunes (rutas con JWT)

Mismo shape estándar de NestJS en todas las rutas protegidas
(`connect`, `connection`, `DELETE connection`):

```json
// 401 Unauthorized — sin token o token inválido/caducado
{ "statusCode": 401, "message": "Unauthorized" }
```

```json
// 403 Forbidden — token válido pero rol sin permiso
{
  "statusCode": 403,
  "message": "User <username> is not authorized",
  "error": "Forbidden"
}
```

## Notas de implementación

- Los contadores (`viewCount`, `likeCount`...) se refrescan en cada
  sincronización (cron cada 10 min por defecto, `TIKTOK_SYNC_CRON`); no son
  en tiempo real, pueden ir hasta 10 minutos desfasados respecto a TikTok.
- `embedHtml`/`embedLink` incluyen parámetros de tracking propios de TikTok
  (`utm_campaign=tt4d_open_api&utm_source=<client_key>`); no hace falta
  limpiarlos, son válidos tal cual.
- Los tokens de acceso/refresco se guardan cifrados (AES-256-GCM) y nunca se
  exponen en ninguna respuesta.
