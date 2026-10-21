# Topología HTTP de sesiones — verificación para BC-ID-6C.1

**Verificado y actualizado:** 2026-10-21. Las observaciones de BC-ID-6C.1 son de solo lectura. La configuración de dominio registra la asociación autorizada en Heroku y el CNAME específico en Cloudflare. BC-ID-6C.2 implementa CORS y añade un adaptador reutilizable, sin invocar cookies desde rutas ni cambiar el estado del feature gate.

## Topología desplegada observada

| Componente | Host verificado | Observación |
|---|---|---|
| Riff Valley App | `https://app.riffvalley.es` | Resuelve mediante Cloudflare y la página pública responde HTTPS 200. Su bundle público apunta a `https://spammusic-back-99963122d70c.herokuapp.com/api`. |
| Riff Valley Wiki | `https://wiki.riffvalley.es` | Resuelve mediante Cloudflare y la página pública responde HTTPS 200. El bundle público apunta al mismo hostname Heroku. |
| API usada actualmente por App/Wiki | `https://spammusic-back-99963122d70c.herokuapp.com` | Hostname Heroku predeterminado, conservado y con HTTPS válido. El root devuelve 404 JSON; la ruta protegida `GET /api/auth/private` devuelve 401 esperado sin credenciales. |
| API adicional | `https://backend.riffvalley.es` | CNAME DNS-only a `animate-dove-feqentcsj1yqt48hjbdp6ntp.herokudns.com`; ACM emitió un certificado válido. El root devuelve 404 JSON y `GET /api/auth/private` devuelve 401 desde Heroku. App y Wiki aún no usan este hostname. |
| `api.riffvalley.es` | No es el API | En la consulta realizada respondió con redirección 301 a `https://www.riffvalley.es/`. No debe configurarse como origen de API sin un cambio de infraestructura y verificación posterior. |

Las solicitudes que App y Wiki realizan actualmente siguen siendo **cross-site**, porque ambos bundles aún usan el host `herokuapp.com`. El nuevo host `backend.riffvalley.es` comparte site registrable y HTTPS con App/Wiki, por lo que las solicitudes desde ellos serían same-site pero seguirían siendo cross-origin. Las URLs locales del checkout (`localhost`) no se usaron como evidencia de despliegue. Los bundles consultados son recursos públicos y pueden cambiar en una publicación futura.

La consulta de `AUTH_SESSION_APP_ORIGIN`, `AUTH_SESSION_WIKI_ORIGIN` y `AUTH_SESSION_MODE_ENABLED` en la configuración de Heroku no encontró valores configurados. No se cambió ninguna variable. El modo de sesión permanece desactivado y la ruta negociada conserva su bloqueo actual.

## CORS observado

`src/main.ts` conserva la lista exacta de orígenes previamente configurada, incluidos App y Wiki, y no usa comodines. CORS permite credenciales solo cuando el navegador presenta uno de esos Origins admitidos. La configuración del backend ahora declara explícitamente los métodos y headers legacy y de sesiones: `Authorization`, `Content-Type`, `X-Custom-Lang`, `X-Auth-Session-Mode`, `X-CSRF-Token` y `X-Refresh-Operation`.

La observación de preflight pública anterior a este cambio confirmó:

- `Access-Control-Allow-Origin` igual al Origin permitido (no `*`).
- `Access-Control-Allow-Credentials: true` y `Vary: Origin`.
- Los headers solicitados `content-type`, `x-auth-session-mode` y `x-csrf-token` fueron admitidos por el middleware actual.
- Un Origin externo obtuvo respuesta a OPTIONS, pero sin `Access-Control-Allow-Origin`, por lo que el navegador no puede leer la respuesta ni completar la llamada CORS.

La allowlist conserva orígenes históricos para no cambiar las llamadas legacy; reducirla requiere inventariar consumidores y está fuera de este corte. CORS no sustituye la validación CSRF. App y Wiki deberán usar `credentials: 'include'` / `withCredentials` únicamente al adoptar el flujo con cookies; sus clientes desplegados no lo configuran actualmente.

## Política candidata de cookie de refresh

Para el hostname nuevo `backend.riffvalley.es`, App y Wiki comparten site registrable y HTTPS con la API, aunque siguen siendo cross-origin. La política implementada para ese transporte es:

- Cookie de host del API (host-only): omitir `Domain`.
- `HttpOnly; Secure; SameSite=Lax`.
- `Path=/api/auth`, limitado a las rutas de autenticación previstas.
- `Expires` igual al vencimiento absoluto de la sesión (30 días desde login, sin extenderse al rotar).
- Nombre distinto por cliente: `__Secure-rv_app_refresh` y `__Secure-rv_wiki_refresh`; la selección se resuelve en servidor desde el Origin exacto, nunca desde un identificador libre del body.
- Al borrar, repetir nombre, Path y atributos de alcance; usar expiración pasada.

`SessionRefreshCookieAdapter` puede leer exclusivamente la cookie nominada del cliente después de validar la metadata, emitirla mediante `Set-Cookie` o borrarla con el mismo alcance. No incluye el refresh en JSON y no se conecta a controladores; no crea sesiones. La emisión y el borrado requieren Origin HTTPS canónico, JSON, CSRF válido y señal HTTPS de Express. La selección `app`/`wiki` se resuelve por Origin, y la cookie es host-only porque no define `Domain`.

## Origin, CSRF y transporte

Para login, refresh y logout con autenticación automática por cookie, el adaptador futuro debe:

1. Exigir `Origin` presente y compararlo como origen HTTPS canónico exacto con la allowlist configurada. Resolver `app`/`wiki` únicamente con esa asociación del servidor; origen ausente, inválido o ambiguo falla cerrado.
2. Exigir `Content-Type: application/json` y `X-CSRF-Token` válido. El token pre-login debe estar ligado al nonce/bootstrap no autenticador; refresh/logout deben validar un token ligado a la sesión. Son verificadores/formatos distintos y aún deben diseñarse e implementarse antes de exponer rutas.
3. Rechazar `Sec-Fetch-Site` explícitamente inválido; cuando esté presente, aceptar solo valores reconocidos (`same-origin`, `same-site`, `cross-site`). La ausencia no omite Origin ni CSRF. Fetch Metadata es defensa adicional, no sustituto del token.
4. No tratar CORS/preflight como autorización. No inspeccionar, consumir ni rotar una cookie antes de validar Origin y CSRF.

El helper implementa únicamente la validación de metadata con un callback verificador de CSRF; no emite tokens CSRF ni define firma, rotación, expiración o almacenamiento del nonce. No se crean todavía endpoints. El adaptador debe recibir el verificador adecuado a la operación y se mantiene inaccesible desde HTTP hasta completar esos verificadores.

### Proxy HTTPS de Heroku

Heroku termina TLS en su router y reenvía tráfico HTTP al dyno. `src/main.ts` no configura actualmente `trust proxy`. La documentación de [HTTP Routing de Heroku](https://devcenter.heroku.com/articles/http-routing) advierte que `X-Forwarded-For`, `X-Forwarded-Proto` y `X-Forwarded-Host` no son confiables genéricamente para decisiones de seguridad por el orden de los headers; sus logs de router pueden registrar `tls=true`. El certificado HTTPS del dominio `herokuapp.com` es parte del alojamiento documentado por [Heroku SSL](https://devcenter.heroku.com/articles/ssl).

El adaptador usa `request.secure` de Express como señal HTTPS y falla cerrado si es falso; no confía por su cuenta en `X-Forwarded-Proto`. Como `src/main.ts` no configura `trust proxy`, la petición reenviada por Heroku actualmente se considera insegura y el adaptador no emitirá cookies en producción. No se habilitó `trust proxy` de forma amplia. Antes de conectar rutas debe acordarse y probarse una estrategia segura para Heroku que distinga HTTPS terminado en el router de HTTP/headers falsificados.

## Bloqueos antes de habilitar transporte

- Configurar los Origins exactos en el servidor tras decisión operativa; los valores de sesión consultados en Heroku están vacíos.
- Diseñar los tokens CSRF pre-login y ligados a sesión y sus verificadores.
- Acordar una comprobación de HTTPS segura detrás del proxy Heroku; `request.secure` falla cerrado en el despliegue actual.
- Probar en navegadores objetivo preflight credentialed, persistencia y envío de cookies cross-site, rotación, expiración y borrado, incluyendo bloqueo de cookies de terceros.
- Migrar App y Wiki al hostname `backend.riffvalley.es` antes de depender de `SameSite=Lax`; hoy siguen llamando al hostname `herokuapp.com`.
- Verificar redacción de `Cookie`, `Set-Cookie`, `Authorization` y cuerpos en logs antes de piloto.

Hasta satisfacer esos puntos, conservar el 503 del modo negociado, no emitir cookies ni refresh en JSON y mantener intacto el login legacy.

### BC-ID-6C.2 — transporte HttpOnly y CORS

**Implementado:** 2026-10-21. `src/main.ts` usa una política CORS explícita que conserva los Origins legacy y permite los headers del protocolo; no usa comodines. El adaptador host-only separa `app` y `wiki`, restringe `Path` a `/api/auth`, aplica `Secure; HttpOnly; SameSite=Lax` y expiración absoluta, valida Origin/CSRF/HTTPS antes de leer, escribir o borrar y rechaza valores refresh con formato inválido. No se conectan endpoints ni se emiten cookies en el estado actual. `AUTH_SESSION_MODE_ENABLED` sigue apagado y la negociación continúa respondiendo 503.

`yarn verify` pasó con 0 hallazgos nuevos. La comprobación de HTTPS en Heroku falla cerrado mientras `trust proxy` no se configure con una estrategia verificada; la implementación de bootstrap/verificadores CSRF y pruebas de navegador siguen bloqueando la exposición HTTP del transporte. App y Wiki todavía usan el hostname legacy, por lo que requieren migración coordinada antes de usar `SameSite=Lax`.

## Configuración de `backend.riffvalley.es`

**Verificado:** 2026-10-21. Heroku y Cloudflare se modificaron únicamente para asociar `backend.riffvalley.es`; los clientes no se modificaron.

### Estado actual y disponibilidad

- La identidad Heroku consultada es `tottiesp@gmail.com`; `heroku apps:info --app spammusic-back` confirmó que la app exacta es `spammusic-back`, región EU, stack Heroku-24 y un dyno web Basic. Se asoció `backend.riffvalley.es` mediante `heroku domains:add`; Heroku aceptó la asignación, lo que confirma que el hostname no estaba reservado por otra app Heroku. `heroku domains` confirma que se conservó `spammusic-back-99963122d70c.herokuapp.com` y que el dominio adicional apunta al target `animate-dove-feqentcsj1yqt48hjbdp6ntp.herokudns.com`.
- Antes del cambio no había un registro DNS explícito para `backend`. Cloudflare tenía `*.riffvalley.es CNAME riffvalley.es`, **Proxied**, TTL Auto; el apex tenía un A DNS-only `134.0.10.93`. El wildcard explica que `backend` y un subdominio aleatorio llegaran al WordPress del apex y redirigieran a `https://www.riffvalley.es/`.
- La zona está activa en la cuenta Cloudflare de Riff Valley, plan **Free**, con nameservers `coraline.ns.cloudflare.com` y `austin.ns.cloudflare.com`. La regla Single Redirect habilitada `Hostmaster a www` solo coincide con `hostmaster.riffvalley.es` y redirige a `www`; no afecta a `backend`. No hay Page Rules ni Workers Routes. El modo SSL/TLS de la zona es **Full**, con Automatic mode habilitado.
- Se añadió únicamente `backend.riffvalley.es CNAME animate-dove-feqentcsj1yqt48hjbdp6ntp.herokudns.com`, **DNS only**, TTL Auto. El wildcard se conservó sin cambios. La interfaz de Cloudflare confirmó el registro y resolvers públicos pasaron a devolver el CNAME de Heroku.
- ACM estaba desactivado; se habilitó después de configurar DNS y Heroku informó `DNS Verified`, luego `Cert issued`. El certificado Let’s Encrypt cubre `backend.riffvalley.es`, con vencimiento 2027-01-19 y renovación programada 2026-12-19.

Antes del cambio, el wildcard de WordPress hacía que `backend.riffvalley.es` redirigiera al apex. El nuevo registro reemplazó ese comportamiento solo para `backend`; las llamadas actuales de App y Wiki siguen usando el hostname Heroku y no se interrumpieron.

### Destino DNS y TLS recomendados

El registro necesario es un **CNAME**:

| Campo Cloudflare | Valor futuro |
|---|---|
| Type | `CNAME` |
| Name | `backend` |
| Target | `animate-dove-feqentcsj1yqt48hjbdp6ntp.herokudns.com` (target asignado por Heroku el 2026-10-21). |
| Proxy status | **DNS only** (nube gris) para la fase inicial recomendada. |
| TTL | Auto (valor usado en el registro creado). |

Heroku no ofrece IPs estáticas para un CNAME/A fijo; hay que usar siempre el DNS Target dado por `heroku domains`. Cloudflare responde con sus IPs públicas cuando proxy está activo y es normal que oculte el CNAME en consultas públicas. El [manual de dominios de Heroku](https://devcenter.heroku.com/articles/custom-domains) y la [guía Cloudflare–Heroku](https://developers.cloudflare.com/support/third-party-software/others/configure-cloudflare-and-heroku-over-https/) describen este patrón.

Para la primera transición se recomienda **Cloudflare DNS autoritativo, registro DNS-only y TLS terminado en Heroku ACM**:

1. La asociación de `backend.riffvalley.es` ya está hecha en Heroku; conservar el target registrado arriba.
2. La zona Cloudflare ya fue inspeccionada; el cambio se aisló al nombre `backend`, sin tocar el wildcard, reglas, `app`, `wiki`, `api` ni apex.
3. Se creó el CNAME explícito `backend` al target exacto de Heroku, DNS-only, TTL Auto. El CNAME público resuelve directamente al target.
4. ACM se habilitó con `heroku certs:auto:enable --app spammusic-back`; `heroku certs:auto --wait` confirmó `Cert issued` para `backend.riffvalley.es`.
5. Las pruebas HTTPS públicas validaron el certificado y confirmaron que las peticiones llegan a Heroku/NestJS.

Esta opción evita el certificado manual: Heroku indica que con ACM el HTTPS del hostname `herokuapp.com` continúa operativo. En cambio, cargar un certificado manual con `heroku certs:add` desactiva ACM y Heroku documenta que el HTTPS del hostname por defecto puede dejar de funcionar; no hacerlo mientras App/Wiki sigan usándolo ([TLS en Heroku](https://devcenter.heroku.com/articles/understanding-tls-on-heroku), [ACM](https://devcenter.heroku.com/articles/automated-certificate-management), [cambio documentado del host default](https://devcenter.heroku.com/changelog-items/1815)).

El coste incremental esperado de dominio Heroku y ACM es **0**; Heroku indica que los custom domains no se cobran y que ACM se incluye gratuitamente. El app actual ya tiene un dyno Basic de pago; no requiere ampliarlo ni agregar addons. La zona Cloudflare está en el plan **Free**. DNS-only no consume un plan proxy adicional, pero el API queda fuera del proxy/WAF/CDN de Cloudflare y se expone directamente a la red de Heroku. El servidor no redirige HTTP a HTTPS automáticamente según Heroku; debe garantizarse en Nest una política HTTPS segura antes de aceptar credenciales/cookies por HTTP. Esta política sigue pendiente y no se modifica en este corte.

**Alternativa proxied, no recomendada en esta fase:** Cloudflare DNS naranja + TLS Full (strict) requiere certificado de origen cuyo SAN coincida con `backend.riffvalley.es`. Cloudflare Origin CA (sin coste adicional y aceptado por Full strict) podría instalarse manualmente en Heroku, pero el certificado no es confiable fuera de Cloudflare, requiere proxy siempre activo y Heroku indica que el certificado manual desactiva ACM y puede quitar HTTPS del hostname `herokuapp.com`. Adoptar esta variante exigiría que ambos frontends ya hubieran migrado, un plan de rollback distinto y gestión/rotación manual del certificado. No se debe usar `Flexible`, porque dejaría el tramo Cloudflare→Heroku sin TLS. Cloudflare ofrece Origin CA en todos sus planes pero no envía avisos de vencimiento ([Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/), [Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)).

### Cambios necesarios al completar la transición

**Backend:**

- Las rutas, el prefijo `/api`, DTOs, Auth legacy y sesiones no necesitan cambio para resolver el hostname. Mantener disponible el dominio actual de Heroku; no redirigirlo ni retirarlo durante la migración.
- La allowlist CORS conserva los Origins llamantes `https://app.riffvalley.es` y `https://wiki.riffvalley.es`. `https://backend.riffvalley.es` es el host de destino/API, no un Origin de frontend que haya que añadir. CORS sigue siendo credentialed y necesario aunque ahora las llamadas sean same-site, porque App, Wiki y API continúan siendo origins distintos.
- Para el transporte de sesiones, configurar en Heroku los valores exactos `AUTH_SESSION_APP_ORIGIN=https://app.riffvalley.es` y `AUTH_SESSION_WIKI_ORIGIN=https://wiki.riffvalley.es` cuando el rollout sea aprobado; mantener `AUTH_SESSION_MODE_ENABLED` apagado. Las variables actuales consultadas estaban vacías.
- El acceso por otro dominio no resuelve el bloqueo actual de confianza de proxy/HTTPS en Nest. No confiar ampliamente en `X-Forwarded-Proto`; acordar una estrategia verificada para Heroku y Cloudflare antes de usar `req.secure` o emitir cookies. Cloudflare puede forzar HTTPS en el borde, pero un acceso directo conocido al target también debe considerarse.

**App y Wiki:**

- Cambiar en el entorno de build de ambos clientes la URL base API que actualmente apunta a `https://spammusic-back-99963122d70c.herokuapp.com/api` por `https://backend.riffvalley.es/api`, y desplegar cada frontend solo después de superar el smoke test del dominio nuevo. En App el código consume `VITE_API_BASE_URL`; en Wiki el bundle desplegado usa la URL antigua, pero su código fuente no está presente en el checkout local revisado.
- En el corte futuro que adopte sesiones, incluir credenciales (`withCredentials` en Axios / `credentials: 'include'` en Fetch) solo para esas llamadas. La migración del hostname por sí sola no requiere enviar cookies ni cambia el login legacy.

Al compartir ahora el site registrable y esquema HTTPS, el par App/API y Wiki/API pasa de **cross-site a same-site**, aunque siga siendo **cross-origin**. CORS/preflight y Origin/CSRF siguen aplicando. El adaptador aplica `SameSite=Lax`; una futura prueba en navegador puede comparar `Strict` antes de cualquier activación. Se mantienen `HttpOnly`, `Secure`, host-only sin `Domain`, nombres separados por `app`/`wiki`, `Path=/api/auth` y expiración absoluta de sesión. El servidor debe seleccionar por Origin validado e ignorar el nombre de cookie ajeno a ese cliente; no confiar en `clientType` enviado en JSON.

### Procedimiento de activación futuro sin interrumpir el API actual

1. (Completado 2026-10-21) Inspeccionar Cloudflare. El nombre `backend` no tenía entrada específica; el wildcard proxied apuntaba al apex. Se verificaron reglas de redirect, Page Rules, Workers Routes, proxy mode, TTL y SSL/TLS antes de cambiar el DNS.
2. La asociación con Heroku y comprobación de no-conflicto ya se completaron. Asociar un dominio en Heroku no lo hace enrutar hasta que se cambie DNS.
3. (Completado 2026-10-21) Crear/añadir el CNAME explícito `backend` hacia el target exacto de Heroku, DNS-only, TTL Auto. El wildcard se deja intacto.
4. (Completado) Habilitar ACM y esperar `Cert issued`; si una emisión futura no progresa, revisar target/CAA/DNSSEC sin repetir activaciones por el rate limit de Let's Encrypt.
5. (Completado) Verificar DNS, HTTPS y certificado público de ACM con `curl`/resolvers públicos. En DNS-only no se espera `CF-Ray`.
6. (Pendiente antes de migrar frontends) Ejecutar preflight sin credenciales ni body sensible para ambos Origins y confirmar `Access-Control-Allow-Origin` exacto, `Access-Control-Allow-Credentials: true`, `Vary: Origin`, headers `content-type`, `x-auth-session-mode`, `x-csrf-token` y métodos esperados. Comparar status/body JSON legacy contra el host Heroku actual y probar rutas no mutables; no negociar `refresh-v1` habilitado ni esperar Set-Cookie.
7. Solo después actualizar `VITE_API_BASE_URL` en App y API URL de Wiki en sus propios build environments; desplegar y verificar cada cliente por separado. El antiguo hostname Heroku sigue sirviendo y es rollback inmediato para los builds. Confirmar logs y errores de ambos hosts antes de retirar referencias antiguas, sin hacer redirect.
8. Para rollback DNS, restaurar exactamente el target/proxy/TTL previo del registro `backend` (en este caso era ausencia de registro explícito con fallback al wildcard). Para rollback frontend, volver a desplegar builds que usan el hostname Heroku. Dejar el custom domain y certificado en Heroku durante el diagnóstico; retirarlos únicamente tras decisión explícita y cuando el DNS ya no los apunte, evitando dangling DNS/subdomain takeover.

El cambio del wildcard de WordPress a la API modificó el comportamiento público de `https://backend.riffvalley.es`. No interrumpió las llamadas actuales de los dos frontends porque ambos siguen usando el hostname Heroku. No se puede garantizar un corte cero para cualquier consumidor desconocido de `backend`; el snapshot previo y la resolución al wildcard permiten restaurar su comportamiento anterior si hiciera falta.

### Pruebas same-site y cookies (posteriores; este corte no emite cookies)

- En Chrome, Firefox y Safari, probar requests `fetch`/Axios desde App y Wiki a `https://backend.riffvalley.es` con credenciales solo en endpoints futuros de sesión. Confirmar envío de la cookie host-only `backend`, persistencia a través de reload y comportamiento con protección anti-tracking habilitada.
- En DevTools confirmar `Secure`, `HttpOnly`, `SameSite=Lax` (y comparar Strict), ausencia de `Domain`, Path y expiración; JavaScript no debe leer el valor. Comprobar que refresh nunca aparece en JSON, storage, URL o logs.
- Verificar que cada Origin resuelve su cookie nominada y que un request App no consume la cookie Wiki, aun cuando el navegador pueda enviar ambas cookies del host API.
- Confirmar preflight credentialed, respuesta CORS exacta y CSRF antes de cualquier lectura/consumo de cookie. Estas pruebas siguen siendo obligatorias: same-site no elimina CSRF.

**Estado de la operación del 2026-10-21:** dominio asociado a `spammusic-back`; CNAME DNS-only publicado en Cloudflare; ACM habilitado y certificado emitido/validado. La ruta protegida `GET /api/auth/private` respondió HTTP 401 desde `server: Heroku`, esperado sin credenciales; `/` devolvió 404 JSON sin redirección. El hostname antiguo devolvió 404 HTTPS verificado en `/`; App y Wiki respondieron 200 HTTPS verificado. No se modificaron rutas, frontend, CORS, configuración de sesiones, wildcard, `api` ni WordPress.

**Pendientes ajenos a la configuración del dominio:** estrategia HTTPS en Nest y pruebas de Origin/CSRF/cookies same-site en los tres navegadores siguen pendientes antes de habilitar sesiones. App/Wiki mantienen sus URLs actuales del hostname Heroku; no se migraron en este corte.
