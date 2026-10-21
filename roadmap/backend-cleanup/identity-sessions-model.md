# BC-ID-4C — Diseño de sesiones y tokens propios

**Estado:** completado como diseño documental el 2026-10-21. No implementa ni autoriza código, migraciones, endpoints o cambios de infraestructura. La dirección de producto vigente es evolucionar NestJS y PostgreSQL existentes, sin servicio adicional. Riff Valley y Wiki mantienen inicios de sesión independientes.

## Decisiones y límites

| Tema | Decisión de BC-ID-4C | Estado |
|---|---|---|
| Sesión | Una sesión persistida por navegador/cliente autenticado, con vencimiento absoluto a los 30 días desde el login. La rotación no cambia `expiresAt`. | Firme |
| Access token | JWT firmado por el backend actual, objetivo de 15 minutos. `AuthorizationModule` mantiene validación y consulta de usuario/rol vigente. | Firme como diseño; algoritmo, claims finales y claves quedan para revisión de seguridad/contrato |
| Refresh token | Valor opaco criptográficamente aleatorio, uso rotatorio, hash persistido y revocación por sesión. | Firme |
| Cliente | Cada sesión se marca `app` o `wiki`; los clientes y sus sesiones son independientes. No hay SSO ni logout cruzado. | Firme; la forma verificable de identificar cliente se fija en 4E |
| Persistencia | Tablas propias en el PostgreSQL actual; nunca guardar el refresh bearer en claro. | Firme como propuesta sujeta a medir recursos |
| Browser storage | Preferir access token en memoria y refresh cookie HttpOnly/Secure; aplicar solo si la topología real permite cookies seguras y CSRF/CORS correcto. | Condicionada a infraestructura |
| Operación | Limpieza oportunista y acotada en flujos de autenticación, sin nuevo worker, dyno, servicio ni extensión de PostgreSQL asumida. | Firme como estrategia inicial; medir carga |

El modelo de amenazas, rate limiting, respuesta a reuse, logout, cambio de contraseña y cuentas inactivas se cerró en [BC-ID-4D — seguridad y revocación](identity-session-security.md). 4D corrige las propuestas de recuperación idempotente de esta versión: no se persiste un refresh sucesor recuperable ni se garantiza recuperarlo tras perder la respuesta; una carrera produce un único sucesor y la petición perdedora puede requerir login. Contratos HTTP, recuperación del perfil y secuencia de migración se cerraron en [BC-ID-4E](identity-session-contracts-and-rollout.md). La fase BC-ID-4 está completada solo como diseño documental; implementación posterior sigue pendiente.

## Responsabilidades

| Componente | Responsabilidad | Límite para evitar duplicación |
|---|---|---|
| `AuthModule` | Recibir credenciales, delegar comprobación de contraseña/estado a Users y coordinar el login. Solicitar a Sessions la creación de sesión y emitir el access JWT asociado al resultado. | No persiste refresh tokens, no rota ni revoca sesiones, no duplica políticas de sesiones. Mantiene la fachada y contratos legacy durante la transición que defina 4E. |
| `UsersModule` | Ser dueño de cuentas, hash/validación de contraseñas, perfil, rol y estado `isActive`; proveer lecturas mínimas a Auth y Authorization. Al desactivar/cambiar contraseña, solicitar o disparar la invalidación de sesiones definida por contrato interno. | No posee sesiones ni tokens de refresh. No depende de Auth para validar credenciales. |
| `AuthorizationModule` | Validar firma, expiración y claims de access JWT; resolver usuario activo y permisos/rol vigentes como hace ahora. | No maneja login ni refresh, no consulta la tabla de sesiones en cada request. |
| Futuro `SessionsModule` | Crear sesiones, generar/validar/rotar refresh tokens, aplicar expiración absoluta, detectar reuse, revocar sesión o todas las sesiones y limpiar filas expiradas. En refresh consulta a Users el estado activo mínimo. | No valida contraseñas, no emite access JWT y no se convierte en dueño de Users. Expone operaciones internas a Auth/Users según el wiring decidido en 5/6. |
| Frontend y Wiki | Cada una conserva su login, sesión de cliente, restauración, renovación y logout local. El frontend usa Axios; Wiki usa Fetch. | No comparten storage, refresh token, perfil autenticado ni sesión entre sí. Cookie enviada al mismo API no cambia esta regla. |

El contrato actual no tiene endpoint de perfil propio. 4E define consulta por Bearer en `GET /api/auth/session` y restauración por `POST /api/auth/refresh`, que devuelve el perfil mínimo de Auth sin hacer que Sessions replique perfiles o permisos.

## Ciclo de vida

### Login y emisión

1. El cliente envía usuario y contraseña al login existente.
2. Auth delega credenciales y estado a Users. Respuesta externa genérica ante usuario inexistente, contraseña incorrecta o cuenta inactiva.
3. Auth pide a Sessions crear una sesión con identificador aleatorio no secreto, propietario, cliente `app`/`wiki`, `createdAt`, `expiresAt = createdAt + 30 días` y actividad inicial.
4. Sessions genera refresh token aleatorio de al menos 256 bits de entropía y guarda únicamente su hash/HMAC; entrega el bearer solo una vez a Auth para establecerlo en el mecanismo de almacenamiento aprobado.
5. Auth emite un access JWT de aproximadamente 15 minutos con sujeto estable y datos mínimos. Roles mutables siguen consultándose desde Users/Authorization.

Los contratos JSON y rutas futuras de refresh/logout están fijados como diseño en 4E. Los JWT legacy de 8h no deben interpretarse como sesiones persistentes.

### Renovación

El cliente renueva poco antes de `exp`, con margen pequeño por desfase de reloj, o después de un 401 que el cliente haya identificado como access token expirado. Una renovación válida comprueba sesión no revocada, usuario aún activo y `now < expiresAt`; consume el refresh actual y crea un nuevo hash/registro ligado a la sesión. La nueva expiración absoluta sigue siendo la original.

Si el refresh expiró, se revocó, falta la sesión o ya pasó el límite absoluto, Sessions rechaza sin emitir tokens y el cliente limpia su estado y pide login. No se renueva una sesión vencida; el login nuevo crea una nueva sesión y un nuevo límite de 30 días.

### Expiración y restauración

Una cookie persistente puede restaurar la sesión después de cerrar el navegador. Al reabrir, el cliente llama al endpoint de restauración/refresh con el refresh cookie; el backend valida sesión y refresh, emite access JWT nuevo y devuelve los datos de perfil definidos por 4E. El cliente no confía en claims decodificados ni en perfil guardado local como prueba de autenticación.

Al alcanzar 30 días desde `createdAt`, el refresh deja de funcionar aunque se haya rotado minutos antes. El cliente borra la sesión local y solicita autenticación explícita. El usuario inactivo tampoco puede restaurar ni renovar.

## Modelo mínimo de PostgreSQL

Propuesta lógica, no DDL ni migración:

### `auth_sessions`

| Campo | Uso |
|---|---|
| `id` UUID aleatorio, PK | Identificador opaco de sesión; no es credencial bearer. |
| `user_id` FK a `users.id`, no nulo | Propietario; índice para revocar/listar sesiones de usuario. Borrado de usuario revoca/elimina en cascada según política aprobada. |
| `client_type` enum/check (`app`, `wiki`) | Distingue cliente para sesiones y revocación local. No reemplaza autenticación de cliente ni autorización. |
| `created_at` timestamptz, no nulo | Inicio de sesión y ancla inmutable del límite absoluto. |
| `expires_at` timestamptz, no nulo | `created_at + 30 días`, no deslizante; `CHECK (expires_at > created_at)`. |
| `revoked_at` timestamptz nullable | Revocación; `NULL` indica no revocada. |
| `last_activity_at` timestamptz, no nulo | Último refresh/login significativo, no cada llamada API. No extiende `expires_at`. |

### `auth_refresh_tokens`

| Campo | Uso |
|---|---|
| `id` UUID/identificador aleatorio, PK | Identidad interna del token; nunca expuesto como secreto suficiente para autenticar. |
| `session_id` FK a `auth_sessions.id`, no nulo | Sesión propietaria; borrar sesión elimina sus tokens. |
| `token_hash` bytea, no nulo, único | Digest del token opaco. Índice único para localizar el token presentado. Preferir HMAC-SHA-256 con secreto pepper de configuración separado del material del token y comparación segura; un hash criptográfico rápido es apropiado porque el token tiene alta entropía y no es una contraseña humana. Nunca registrar el token ni su digest completo en logs. |
| `created_at` timestamptz, no nulo | Emisión del bearer. |
| `consumed_at` timestamptz nullable | Se establece en rotación. Un token ya consumido permite detectar repetición mientras la sesión siga vigente. |
| `replaced_by_id` nullable, FK al mismo conjunto | Enlace al sucesor para trazabilidad de rotación. Como máximo un sucesor por token (`UNIQUE`). |

Las fechas de expiración y revocación de sesión viven en `auth_sessions` y se validan junto al token. Se puede duplicar `expires_at` en refresh rows solo si mediciones justifican limpiar/consultar sin join; evitar duplicación inicial. Retener los tokens consumidos mientras haga falta detectar reuse y la retención de auditoría acordada; purgar la familia al expirar o revocar la sesión según política y retención definida en 4D/5.

Índices/restricciones iniciales:

- PK de sesión y tokens; FK `auth_sessions.user_id → users.id`; FK `auth_refresh_tokens.session_id → auth_sessions.id` con borrado en cascada acordado.
- Índice único en `token_hash`; índice `auth_sessions(user_id, client_type, revoked_at)` para revocación/listado; índice parcial de sesiones activas si las consultas observadas lo justifican.
- Índice de expiración `auth_sessions(expires_at)` para barrido; índice `auth_refresh_tokens(session_id, consumed_at)` para obtener token vigente y limpiar familias.
- Restricciones de un solo token sucesor por token y, si el esquema lo permite sin costo/complicación, una sola credencial no consumida por sesión. Transacción y bloqueo siguen siendo necesarios; la restricción es defensa adicional.
- No guardar IP completa, user agent ni huella invasiva por defecto. Si 4D justifica metadatos de seguridad, limitar y definir privacidad/retención.

La propuesta original de conservar un resultado recuperable cifrado fue revisada por BC-ID-4D y descartada como política predeterminada: cifrado reversible mantiene una credencial bearer recuperable y no resuelve de forma segura quién puede repetir la operación. No crear `auth_refresh_operations` para guardar el sucesor, ni en claro ni cifrado, sin una decisión posterior de seguridad. Véase [la resolución de idempotencia y carreras](identity-session-security.md#rotación-idempotencia-y-conflicto).

## Rotación, reuse y concurrencia

La operación del servidor bloquea la fila de sesión y el refresh presentado en una transacción (`SELECT … FOR UPDATE` o equivalente), comprueba propietario/estado/expiración y realiza consumo más emisión del sucesor atómicamente. Dos procesos no pueden crear dos sucesores válidos.

**Resolución BC-ID-4D:** la rotación usa locks y una transacción para producir como máximo un sucesor. El cliente aplica single-flight y coordinación entre pestañas; la clave idempotente no es una credencial ni permite recuperar el sucesor. Si una respuesta se pierde después del commit, el retry puede recibir conflicto y exigir login. La política detallada, incluidos los límites de reuse y la respuesta ante carreras ambiguas, está en [BC-ID-4D](identity-session-security.md#rotación-idempotencia-y-conflicto). Rate limits y respuestas genéricas están en [controles contra abuso](identity-session-security.md#controles-contra-abuso-y-operación).

## Clientes y almacenamiento

| Alternativa | Persistencia tras cerrar navegador | Riesgo principal | Evaluación |
|---|---|---|---|
| JWT actual en `localStorage` | Sí | XSS puede leer y exfiltrar un bearer válido hasta `exp`; el token actual dura 8h. | Estado actual, no recomendado para refresh. |
| Access token solo en memoria | No; se pierde al recargar | XSS aún puede ejecutar acciones en el origen mientras viva la página, pero no extrae una credencial persistente desde storage. | Recomendado para access token, junto a restauración vía cookie. |
| Refresh en cookie `HttpOnly; Secure` | Sí | El navegador adjunta cookies automáticamente; requiere CSRF, TLS, CORS y topología compatible. HttpOnly reduce lectura por JS, no mitiga acciones XSS activas. | Preferencia condicionada para web. Cookie host-only del API minimiza alcance; usar nombre y ruta de cookie separados para `app` y `wiki`; evitar `Domain=.riffvalley.es` salvo requisito demostrado. |

Elegir `SameSite` y confirmar cookie requiere comprobar en cada entorno: URL exacta de API y ambos clientes (esquema/host/puerto), dominio registrable y relación site, HTTPS/certificado y terminación TLS, proxy/headers forwarded, configuración de producción/staging, política de cookies de navegadores objetivo, y `VITE_API_BASE_URL` efectivo. La auditoría de 4A solo encontró candidatos `app.riffvalley.es` y `wiki.riffvalley.es`; el origen del API y hosting activo no están confirmados.

Si API y cliente son same-site y HTTPS, probar primero una cookie host-only `SameSite=Lax` (o `Strict` si el flujo lo permite), `Secure`, `HttpOnly`, `Path` mínimo y expiración no superior a sesión. Si son cross-site, `SameSite=None; Secure` y el navegador puede bloquear la cookie de terceros; no se debe dar por viable sin pruebas reales. No ampliar Domain para compartir cookie entre subdominios. Como ambos clientes llaman al host API, el plan 4E requiere nombres/flujo de cookie diferenciados para aislar las sesiones `app` y `wiki`; atributos finales quedan pendientes de la topología. Si la cookie se adjunta a ambas, el servidor no debe interpretarlo como SSO ni como login común.

### CSRF y CORS

- Para endpoints autenticados por cookie, proteger refresh, logout y mutaciones contra CSRF. Propuesta: token CSRF sincronizado (cookie legible no HttpOnly o bootstrap endpoint y header personalizado), validar `Origin` contra allowlist exacta y aplicar Fetch Metadata cuando esté disponible. `SameSite` es defensa adicional, no única defensa.
- Mantener CORS con orígenes exactos autorizados, `Access-Control-Allow-Credentials: true`, métodos/headers mínimos y `Vary: Origin`. Nunca usar `*` con credenciales. Los clientes envían credenciales explícitamente (`withCredentials` en Axios, `credentials: 'include'` en Fetch) solo para el API configurado.
- Bearer access token en `Authorization` no requiere cookie para API requests; la cookie se limita al refresh/restauración/logout. No devolver el refresh token también en JSON.
- `Origin`/CORS no son autenticación de cliente y no sustituyen CSRF; BC-ID-4E decide un contexto `app`/`wiki` validable para BC-ID-3F.

## Renovación automática del cliente

- Renovar una vez cuando `exp` esté próximo, por ejemplo con margen corto, no en cada request. Si se recibe 401, reintentar solo si el contrato identifica access token vencido, queda refresh disponible y ese request todavía no se renovó. Un 403 no dispara refresh.
- Single-flight por pestaña; una sola petición renueva mientras otras esperan. Al rotar, actualizar access token en memoria y repetir cada request original como máximo una vez.
- Entre pestañas de una aplicación, coordinar con Web Locks o `BroadcastChannel`; no incluir refresh en mensajes. Si la pestaña líder se cierra después de consumir el refresh, el cliente no puede asumir que un retry recuperará el sucesor; ante conflicto sin resultado confirmado pide login.
- Al recargar o reabrir, hacer una única restauración con cookie. Deshabilitar interceptores sobre la propia petición refresh para evitar recursión.
- Ante errores transitorios (red/5xx), permitir retry acotado solo si se sabe que la transacción no se confirmó. Si el resultado del commit es desconocido, no asumir idempotencia bearer; coordinar estado y pedir login ante conflicto. No generar refresh ilimitados.
- Ante refresh vencido/revocado/reuse, limpiar perfil, access token y estado de aplicación, redirigir al login local y no reintentar. No convertir todos los 401 (p. ej. endpoint público o credencial de otro tipo) en refresh.

## Revocación y JWT emitidos

| Evento | Resultado de sesión/refresh | Resultado en App y Wiki |
|---|---|---|
| Logout Riff Valley | Revoca la sesión `app` actual y limpia su cookie/estado local. | Wiki continúa con su sesión separada. |
| Logout Wiki | Revoca la sesión `wiki` actual y limpia su estado local. | Riff Valley continúa con su sesión separada. |
| Revocar una sesión | Marca `revoked_at`; ninguna renovación posterior funciona. | El cliente afectado pierde acceso al renovar o al vencer el access JWT. |
| Revocar todas las sesiones de un usuario | Actualiza/revoca todas las sesiones del usuario en una operación administrativa/seguridad. | Afecta a App y Wiki para renovaciones, pero no anuncia logout instantáneo en UI. |
| Desactivar cuenta | Users marca inactivo y provoca revocación de sus sesiones. | La consulta de usuario ya existente en Authorization rechaza requests protegidos; no puede renovar. |
| Cambio de contraseña | Users guarda el nuevo hash y revoca sesiones de refresh del usuario; nuevos logins crean sesiones nuevas. | Access JWT previo puede seguir válido hasta `exp` salvo cuenta inactiva; límite de exposición objetivo 15 min. |

Un JWT autónomo ya firmado no queda revocado por modificar una fila de sesión. Sin consulta de sesión, denylist o introspección por request, puede aceptarse hasta `exp`, con objetivo diseñado de 15 minutos. El backend ya vuelve a leer identidad/estado en cada petición; Authorization mantiene ese costo/garantía. No añadir otra consulta para sesiones en cada request. Desactivación se refleja por el control existente; cambios de rol se reflejan por la consulta vigente. La semántica exacta y el límite aceptado están en [BC-ID-4D](identity-session-security.md#revocación-exacta).

## Recursos y limpieza

Coste esperado cualitativamente, sin asegurar capacidad ni inventar mediciones:

- Login: generación criptográfica local, una inserción de sesión, una inserción de refresh y lecturas de usuario ya necesarias. Costo bajo en DB relativo a requests protegidos, sujeto a medir volumen real.
- Refresh: localizar por índice único del hash; leer/bloquear sesión y token; escribir consumo, sucesor y actividad en una transacción. Es más caro que validar un JWT sin sesión, pero ocurre al renovar (aprox. cada 15 minutos de actividad como máximo) y no en cada request.
- Revocar sesión: actualización indexada de una sesión; revocar todas requiere update por `user_id` sobre sesiones activas. Cambio de contraseña/desactivación ya son flujos poco frecuentes.
- Almacenamiento: sesión pequeña por navegador y al menos una fila refresh por rotación retenida hasta vencimiento/revocación. Depende del número de usuarios/dispositivos y frecuencia de uso; medir filas, bytes e índices tras despliegue antes de fijar retención.
- CPU: generación aleatoria/HMAC y JWT son operaciones acotadas; el costo real de transacciones y bcrypt del login debe medirse con carga representativa. No se predice throughput.
- Conexiones: se usan el pool existente y transacciones cortas; no mantener locks durante llamadas externas o trabajo de cliente. Comprobar pool, conexiones máximas y límites PostgreSQL/Heroku antes de activar.

Sin un nuevo proceso, limpieza oportunista acotada en flujos de creación/rotación elimina lotes de sesiones expiradas/revocadas y sus tokens, con `expires_at` y `revoked_at` indexados. Limitar filas por transacción y evitar bloqueo prolongado. La retención acordada es 30 días después de expiración o revocación para conservar detección reciente de reuse y diagnóstico; después se elimina la familia. Si se observa crecimiento o bajo tráfico que impide limpiar, medir el backlog antes del piloto; no asumir Heroku Scheduler, extensión pg_cron ni dyno adicional.

Antes de producción, medir baseline y piloto en recursos actuales: duración/CPU de login y refresh, consultas y bloqueos, pool/conexiones activas, rows y bytes por tabla/índice, tiempo de limpieza, errores/latencia del API y tasa de renovaciones/reuse. Si el presupuesto de latencia/capacidad no cabe, detener rollout y elevar la decisión; no aumentar recursos dentro de este diseño.

## Casos de aceptación

1. **Login correcto:** valida credenciales vía Users, crea una sesión del cliente iniciador, devuelve JWT de aproximadamente 15 minutos y entrega refresh solo por el almacenamiento aprobado; DB contiene hash, nunca bearer.
2. **Cierre y reapertura del navegador:** si la sesión no venció ni revocó, una restauración con cookie obtiene nuevo access y perfil; sin cookie o con refresh inválido pide login.
3. **Renovación de access JWT:** refresh válido consume token anterior, emite sucesor y access nuevo; sesión conserva `expiresAt` original.
4. **Expiración absoluta a 30 días:** aunque cada refresh haya rotado, el token posterior al límite falla y obliga a login nuevo.
5. **Dos renovaciones simultáneas:** peticiones del cliente se coordinan y el backend produce como máximo un sucesor. La petición perdedora no obtiene credenciales; puede requerir login. No se recupera un bearer desde una respuesta idempotente persistida.
6. **Logout y revocación:** logout de App revoca solo sesión `app` actual; Wiki sigue autenticada independientemente. Revocar una sesión impide refresh y limpia cookie al siguiente contacto.
7. **Cuenta desactivada:** Users inactiva cuenta y revoca refresh; Authorization rechaza access JWT en requests protegidos por la consulta de estado actual.
8. **Contraseña modificada:** Users actualiza hash y solicita revocar todas las sesiones; credenciales antiguas no renuevan. JWT ya emitido puede aceptarse solo hasta su `exp` salvo cuenta inactiva.
9. **Login independiente App/Wiki:** autenticar en App no autentica Wiki. Cada login produce sesión/client type y refresh propios, aunque el browser mande cookies al mismo API.
10. **Refresh antiguo con sesión expirada:** refresh rotado previo, presentado después de expiración absoluta, no restaura sesión; respuesta genérica de reautenticación, sin emitir tokens y sin bucle cliente.

## Decisiones condicionadas a infraestructura

La auditoría local de 4A no confirmó origen público de API, orígenes de despliegue activos, TLS/proxy, staging ni proveedor efectivo de frontend/Wiki. El checklist de [4E](identity-session-contracts-and-rollout.md) bloquea el modo nuevo hasta comprobar en cada entorno:

1. Consultar configuración de despliegue y variables de URL de frontend/Wiki para obtener orígenes efectivos sin leer secretos.
2. Confirmar URL pública del API, TLS, certificado, terminación en proxy y forwarding seguro a NestJS; comprobar que `Secure` funciona detrás del proxy con el comportamiento real del framework.
3. Clasificar cada combinación de frontend/API como same-origin, same-site o cross-site y probar cookies en navegadores admitidos, incluida política de bloqueo de terceros.
4. Verificar allowlist CORS exacta, credenciales, headers CSRF, `OPTIONS`, `Vary: Origin` y envío desde Axios/Fetch.
5. Revisar límites actuales de Heroku/PostgreSQL (pool, conexiones, almacenamiento, logs, CPU/latencia) sin modificar recursos. Medir con un piloto autorizado y datos sintéticos/aislados.

No acceder a producción ni PostgreSQL como parte de BC-ID-4C. Si cookie cross-site falla, el plan 4E bloquea modo sesión para ese cliente hasta una decisión explícita; no dar por resuelto el storage con refresh en `localStorage` ni cookies compartidas.

## Implementación de persistencia BC-ID-5A

BC-ID-5A está completada el 2026-10-21 como corte aditivo y todavía inactivo. `AuthSession` y `AuthRefreshToken` reflejan las columnas y reglas de este modelo; la migración `1791950000000-CreateAuthSessionPersistence` crea solo esas dos tablas. El refresh se persiste como `bytea` hash, con unicidad por hash, cadena de sucesores y máximo un token no consumido por sesión. La sesión aplica cliente `app`/`wiki`, FK a User con cascade y la restricción `expires_at > created_at`.

No se creó `SessionsModule` ni lógica de rotación en 5A. Auth/Users/Authorization y el JWT legacy seguían sin utilizar las tablas. La migración no se ejecutó contra PostgreSQL porque no se confirmó una base local aislada. `down` rechaza tablas con filas antes de borrarlas. La evidencia del corte está en [BC-ID-5A y plan de implementación](identity-session-contracts-and-rollout.md#cierre-técnico-de-bc-id-5a).

## Operaciones internas BC-ID-5B

BC-ID-5B añade `SessionsModule`, `SessionsService` y un adaptador TypeORM transaccional, sin importar el módulo desde Auth y sin endpoints. El módulo exporta solo el servicio; el adaptador/repositories no se exponen como contrato público.

La creación verifica un usuario activo y un cliente `app`/`wiki`, fija `expiresAt` a 30 días desde `createdAt`, genera 32 bytes aleatorios y persiste solo SHA-256 en `bytea`. La rotación conserva el mismo vencimiento absoluto, comprueba propietario indirectamente desde el token, cliente, estado, expiración y consumo. Bloquea primero sesión y después refresh dentro de una transacción; inserta como máximo un sucesor, con la restricción única parcial de 5A como defensa adicional.

La huella SHA-256 de UUIDv4 de la operación se guarda en la fila consumida. Mismo token + misma huella durante 2 minutos produce conflicto sin bearer ni revocación; una clave distinta o ventana vencida se trata como reuse y revoca sesión/familia. No se guarda respuesta recuperable. Las operaciones internas de revocación son individual (propietario y cliente opcional) y global por usuario, incluyendo sesiones independientes de App y Wiki.

La fila conserva físicamente la huella hasta el vencimiento o la purga de 5D; esto no extiende la validez lógica de la ventana ni contiene secreto recuperable. Las pruebas unitarias al cierre de 5B no demostraban semántica real de locks, transacciones, índices ni carreras de PostgreSQL; esas garantías se verificaron en 5C/5D. La migración `1791960000000-AddRefreshOperationFingerprint` es aditiva y su `down` se niega si quedan huellas. Ver [cierres de BC-ID-5B/5C](identity-session-contracts-and-rollout.md#cierre-técnico-de-bc-id-5c) y [BC-ID-5D](identity-session-contracts-and-rollout.md#cierre-técnico-de-bc-id-5d).

## Dependencias posteriores

- **BC-ID-4D completada:** modelo de amenazas, política de rotación/reuse y revocación, CSRF/XSS, cookies, rate limits y límite de JWT tras revocación en [identity-session-security.md](identity-session-security.md). Sin exigir logout global.
- **BC-ID-4E:** contratos login/restore/refresh/logout/revoke, perfil, atributos de cookie, CORS/CSRF, identificación `app`/`wiki`, transición desde login JWT legacy y plan rollout/rollback. Revalidar infraestructura real; no modificar recursos aquí.
- **BC-ID-5B completada:** servicio transaccional interno, generación/hash, rotación, reuse y revocación están implementados sin activarse en Auth. La recuperación idempotente de un bearer tras respuesta perdida sigue descartada.
- **BC-ID-5C completada:** migraciones y garantías transaccionales verificadas con PostgreSQL 17.10 aislado; resultados, correcciones y límites en el [cierre de validación](identity-session-contracts-and-rollout.md#cierre-técnico-de-bc-id-5c).
- **BC-ID-5D completada:** auditoría categórica redactada y limpieza oportunista documentada/implementada sin tarea programada. La ventana de purga es 30 días tras expiración/revocación, lote máximo 250 refresh rows/100 sesiones, intervalo local de 24h. Los límites HTTP por IP/principal y login requieren contexto confiable y quedan en 6D antes de exponer endpoints.
- **BC-ID-6:** emisión/refresh/revocación por Auth/Sessions según ownership, preservando roles y compatibilidad legacy según lo acordado en 4E. Authorization mantiene validación actual de access tokens.
- **BC-ID-7 y 8:** migrar Axios y Fetch de forma independiente, con coordinación de pestañas, restauración y logout local.
- **BC-ID-3F:** necesita contexto de cliente `app`/`wiki` derivado de credencial validada y contrato acordado en 4E e implementado en 5/6; no depende de SSO ni de una cookie compartida.

El diseño de 4D/4E y los cortes BC-ID-5A–5D están completados. BC-ID-6–8 y BC-ID-3F siguen pendientes; no se implementaron endpoints ni se conectó la renovación al login, y no se activó autenticación por sesiones.
