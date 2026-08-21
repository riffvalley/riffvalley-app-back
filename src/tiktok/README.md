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
// 201
{ "authorizationUrl": "https://www.tiktok.com/v2/auth/authorize/?client_key=...&state=..." }
```

### `GET /callback`

Público (TikTok redirige aquí el navegador, sin JWT). No lo llama el
frontend directamente. Si `TIKTOK_FRONTEND_REDIRECT_URL` está configurada,
responde con un 302 a `${TIKTOK_FRONTEND_REDIRECT_URL}?tiktok=connected` (o
`...=error`); si no, devuelve el JSON de `completeConnection` o lanza el
error. El frontend debe leer el query param `tiktok` en esa página de
destino para mostrar el resultado.

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

Cuando `authorizationStatus` es `expiring_soon` o `reauthorization_required`,
el frontend debe ofrecer volver a pulsar "Conectar TikTok" (repite el flujo
de `POST /connect`).

### `DELETE /connection`

Desconecta la cuenta (borra la fila). **Requiere JWT** (mismos roles).
Operación destructiva: el frontend debe confirmarla.

```json
// 200
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

404 con el shape estándar de NestJS (`{ statusCode, message, error }`) si el
id no existe en la caché local.

## Notas de implementación

- Los contadores (`viewCount`, `likeCount`...) se refrescan en cada
  sincronización (cron cada 10 min por defecto, `TIKTOK_SYNC_CRON`); no son
  en tiempo real, pueden ir hasta 10 minutos desfasados respecto a TikTok.
- `embedHtml`/`embedLink` incluyen parámetros de tracking propios de TikTok
  (`utm_campaign=tt4d_open_api&utm_source=<client_key>`); no hace falta
  limpiarlos, son válidos tal cual.
- Los tokens de acceso/refresco se guardan cifrados (AES-256-GCM) y nunca se
  exponen en ninguna respuesta.
