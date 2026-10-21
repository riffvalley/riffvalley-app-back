# Identity — BC-ID-0

**Estado:** BC-ID-0, BC-ID-1 y BC-ID-2 completadas (2026-10-21). BC-ID-1 caracterizó contratos/permisos y corrigió únicamente la serialización del hash de contraseña en las dos rutas de actualización, tras reproducir la exposición con datos ficticios. BC-ID-2 eliminó los hallazgos actuales de tipado seguro y ESLint en Identity, conservando contratos y pruebas. BC-ID-3–10 siguen pendientes.

## Alcance y repositorios observados

- Backend: `riffvalley-app-back`, estado local limpio al comenzar la inspección. NestJS, Passport/JWT, TypeORM y PostgreSQL.
- Frontend: `../riffvalley-app-front`, disponible localmente para lectura. Vue 3, Pinia, Vue Router, Axios y Vite.
- Wiki: `../riff-valley-wiki`, disponible localmente para lectura. Vue 3, Vue Router y Vite; su `package.json` declara pnpm. También contiene `roadmap/authentication-analysis.md`, que se contrastó con el código.
- Las rutas de los dos consumidores son relativas al checkout backend y no están bajo su raíz escribible. No se modificó ninguno de esos repositorios.

## Backend: inventario

### Módulos y componentes

`src/identity/auth/` es el módulo de identidad principal; no existe módulo/directorio `users` independiente. `AuthModule` registra `AuthController`, `AuthService`, `JwtStrategy`, `UserRoleGuard`, repositorios TypeORM para `User`, `UserAccessLog` y `Rate`, Passport con estrategia predeterminada `jwt`, y `JwtModule` configurado desde `JWT_SECRET` con expiración `8h`. Exporta TypeORM, estrategia/Passport, JwtModule y UserRoleGuard. `AppModule` establece el prefijo `/api`.

- Controller: `auth.controller.ts` expone registro, login, perfil, administración de usuarios, actividad y una ruta privada de diagnóstico.
- Servicio: `auth.service.ts` implementa cuentas, autenticación, perfil, administración, métricas y actividad.
- Providers de autorización: `JwtStrategy` y `UserRoleGuard`.
- Decorators: `@Auth()`, `@RoleProtected()` y `@GetUser()`.
- DTOs: `CreateUserDto`, `LoginUserDto`, `UpdateUserDto`, `AdminUpdateUserDto`.
- Entidades: `User` (`users`) y `UserAccessLog` (`user_access_log`). `User` contiene `isActive`, rol, hash de contraseña, perfil/configuración y relaciones a Rates, Favorites, Pendings, Comments, Asignations, playlists, Articles, Videos y Requests. `UserAccessLog` registra como máximo una fila por usuario y fecha; es analítica de accesos diarios, no una sesión.
- `src/identity/access-requests/` es módulo separado, con controller/service/DTO. Su `POST /api/access-requests` es público, limitado a 3 solicitudes por minuto vía `ThrottlerGuard`; comprueba alias ocupado y notifica por `MailService`. No crea una cuenta ni es recuperación de contraseña.

### Contratos HTTP actuales

Todas las rutas llevan el prefijo `/api`; los DTOs pasan por el `ValidationPipe` global (whitelist, rechazo de propiedades no declaradas y transformación).

| Método y ruta | Acceso | Comportamiento observable |
|---|---|---|
| `POST /api/auth/register` | Público | Crea usuario con rol `user`, guarda contraseña bcrypt y responde campos del usuario más JWT. No se encontró flujo de verificación de correo. |
| `POST /api/auth/login` | Público | Recibe `username` y contraseña; búsqueda de username case-insensitive; devuelve perfil/configuración, `id`, rol y `token`; actualiza `lastLogin` y agrega acceso diario. |
| `GET /api/auth/private` | superadmin | Ruta de diagnóstico; responde objeto de usuario dentro de `{ ok, message, user }`. |
| `GET /api/auth/users` | superadmin | Listado administrativo con campos seleccionados, orden `createdAt DESC`. |
| `GET /api/auth/usersRv` | riffvalley o superior | Usuarios con rol mínimo riffvalley. |
| `GET /api/auth/users/role/:role` | superadmin | Usuarios de rol validado. |
| `GET /api/auth/users/superusers` | superadmin | Usuarios superadmin. |
| `GET /api/auth/users/admin-stats` | superadmin | Estadísticas paginadas de usuarios, logins y votos. |
| `GET /api/auth/activity` | superadmin | Actividad de Ratings paginada, proyecta usuario/disco. |
| `GET /api/auth/:id/activity` | superadmin | Ratings y fechas de acceso del usuario. |
| `GET /api/auth/:id` | superadmin | Busca usuario por ID. |
| `PATCH /api/auth` | usuario autenticado | Edita su propio email, contraseña, username, imagen y configuración de dashboard. |
| `PATCH /api/auth/superadmin/:id` | superadmin | Administración de campos de usuario, incluida asignación de rol/fecha/notes. |
| `PATCH /api/auth/:id/deactivate`, `PATCH /api/auth/:id/activate` | superadmin | Cambia `isActive`. |
| `DELETE /api/auth/:id` | superadmin | Elimina usuario; entidades relacionadas tienen cascadas ORM y/o restricciones propias. |
| `POST /api/access-requests` | Público, throttled | Solicitud informativa de acceso por correo y alias. |

No se localizaron endpoints de recuperación/reset de contraseña, logout, refresh/renovación ni sesiones. El registro es público; el frontend observado registra desde gestión de usuarios, pero el backend no impone autenticación a ese endpoint.

No existe `GET /api/auth/me` ni una ruta de lectura del perfil propio: el perfil se obtiene del response de login/registro y luego se conserva en los almacenes locales. `GET /api/auth/:id` es solo superadmin. Por eso una futura estrategia de access token en memoria necesitará decidir cómo reconstruir el perfil tras reload, sin asumir un endpoint actual.

### Tokens, contraseñas y sesión

- Login y registro generan JWT firmado por `JwtService.sign()` con el secreto de configuración `JWT_SECRET`; `JwtModule` fija `expiresIn: '8h'`. No se halló configuración explícita de algoritmo, issuer, audience, `jti` o rotación de claves en estos archivos.
- El payload tipado contiene `username`, `id` y `role`. JWT Strategy extrae exclusivamente `Authorization: Bearer ...`, valida firma/expiración mediante Passport JWT y vuelve a buscar el usuario por ID en cada request. Rechaza usuario inexistente o inactivo. La consulta actual permite usar rol/estado vigentes de base de datos en vez de confiar solo en claims; UserRoleGuard vuelve a consultar rol cuando hay mínimo configurado.
- Contraseñas se procesan con bcrypt, coste 10, mediante APIs síncronas `hashSync`/`compareSync`. DTO y allowlists limitan propiedades aceptadas. No se documentan parámetros de política de contraseña en el DTO más allá de las validaciones actuales; no se encontró cambio/reset autenticado por flujo dedicado.
- No hay tabla de refresh tokens, sesiones, lista de revocación ni endpoint de revocación. Logout es solo responsabilidad local del consumidor. Un JWT emitido sigue siendo criptográficamente válido hasta su expiración; desactivar cuenta bloquea requests futuros por la consulta de usuario, pero borrar/cambiar contraseña/rol no tiene mecanismo general de revocación de tokens ya emitidos aparte de los efectos de esa consulta.
- Secretos: el código lee `JWT_SECRET` desde configuración; no se copió ni inspeccionó ningún valor secreto. Comprobar existencia/validación de configuración en todos los entornos queda fuera de lo inferible del módulo.

### Autorización y dependencias internas

Roles existentes: `user < collaborator < riffvalley < superadmin`; `roleMeetsMinimum` compara jerarquía. `@Auth(minimumRole?)` aplica `AuthGuard()` de Passport y `UserRoleGuard`; si no hay rol mínimo, el segundo permite tras autenticación. Si hay mínimo, el guard obtiene metadata, verifica que sea rol válido y consulta rol actual en DB. Hay además verificaciones de superadmin dentro de operaciones críticas de `AuthService`.

Los dominios de Catalog, Community, Editorial e Integrations consumen `AuthModule`, decorators/guards, `User` y/o repositorio de usuario. La entidad User es además propietaria de relaciones inversas de numerosos dominios. `AuthService` depende de `Rate` para estadísticas/actividad. `AccessRequestsService` depende directamente de `User` y `MailService`. Auth por tanto es dependencia transversal: cambios de payload, roles, guard, claims, usuario y módulo requieren revisión de rutas consumidoras. Hay tests de contrato de autorización distribuidos por dominio; no deben asumirse cubiertos solo por specs de Identity.

### Deuda y Quality Gates

Conteo leído de los baselines actuales, filtrando rutas `src/identity/` (no se alteraron): 1 hallazgo estructural preexistente, 29 de tipado seguro y 12 de ESLint. La mayoría de hallazgos de tipado/ESLint están en specs; producción tiene al menos un `as any` en `AuthService.profileUpdateFields`, `any` en el manejador de DB y deuda ESLint en `auth.service.ts`/DTOs. El hallazgo estructural es el spec histórico de `guards/user-role` fuera de `__tests__/`; baseline no debe añadirse ni cambiarse en auditoría. Estos son snapshots de línea base; los gates completos determinarán que no haya regresiones nuevas.

Tests focales bajo `__tests__/`: `auth.controller.spec.ts`, `auth.service.spec.ts`, `auth.dto.spec.ts`, `jwt.strategy.spec.ts`, `domain-mutation-authorization.spec.ts`, `auth-rate.consumer.spec.ts`; y spec del UserRoleGuard en su ubicación histórica. Cubren controller/servicio/DTO, guards, claims emitidos, validación de usuario, cambios de dominio y consumo de límite de solicitudes. BC-ID-1 añadió casos de contraseña de login incorrecta, payload inválido con 400, aceptación/rechazo de JWT según usuario vigente y regresiones de serialización para cambio de contraseña propio y administrativo. La matriz explícita de consumers backend fuera de estos tests sigue siendo una limitación; las rutas de dominios continúan cubiertas por suites distribuidas. Huecos diferidos: flujos de sesión inexistentes por diseño actual; migración cross-consumer; configuración de despliegues sin secretos; no hay pruebas automáticas de Wiki.

## Frontend principal: comportamiento observado

- Login UI está en `src/views/loginPage/LoginPage.vue`; llama `useAuthStore().login`, que usa `POST /auth/login`. Registro administrativo aparece en `views/users/ManageUsers.vue` y llama `POST /auth/register`. No se encontraron UI/endpoints de recuperación de contraseña.
- `src/stores/auth/auth.ts` mantiene token, identidad, rol, imagen y configuración en Pinia y `localStorage` (claves separadas). Al iniciar, restaura esos valores sin llamar endpoint de perfil ni validar JWT; limpia también el formato legacy `roles`. `initializeAuth()` instala el default Authorization header.
- `src/services/api/api.ts` adjunta Bearer desde Pinia a cada request. Respuesta 401 limpia sesión local y navega a Login; 403 muestra notificación y deja que vista maneje primero. No hay renovación/reintento de request. No se encontró endpoint logout.
- Vue Router y vistas consultan store/rol para permisos. El cliente conserva el rol recibido al login; las decisiones backend siguen protegidas por sus guards, pero el estado de UI puede quedar obsoleto mientras no ocurra 401 o recarga.
- Hallazgo verificable: JWT accesible a JavaScript y persistido en localStorage; una XSS ejecutada en el origen puede leerlo. Restauración local no detecta expiración hasta que el backend responde 401. Logout solo elimina estado de ese navegador; token copiado sigue válido hasta expirar. Interceptor genérico aplica el logout a cualquier 401, no distingue credencial expirada de 401 de un endpoint público/otro error.
- Login catch reemplaza errores por “Invalid credentials”, incluso errores de red/servidor; mejora de UX/diagnóstico. Revisar si login/logout tienen tests focales en el proyecto antes de cambiar implementación.

## Wiki: comportamiento observado

- Proyecto Vue 3/Vite TypeScript; sin Axios, Pinia ni dependencia JWT. `LoginView.vue` hace login contra `POST /auth/login` a `VITE_API_BASE_URL` mediante `apiRequest` (Fetch), con `username`/`password` y Authorization Bearer en requests autenticados.
- `useAuth.ts` guarda un JWT en localStorage bajo clave separada `riff-valley-wiki.jwt`. Al login decodifica base64url y valida forma/expiración/consistencia de los claims con el perfil de respuesta. En restauración vuelve a decodificar y programa expiración local. El propio comentario aclara que los claims no se verifican criptográficamente en el navegador; la autorización real de API sigue siendo backend.
- Un temporizador limpia la sesión al alcanzar exp y notifica navegación; fetch ante 401 con token llama `onUnauthorized` y limpia estado; 403 invoca callback de acceso denegado. No reintenta ni renueva.
- `src/auth/roles.ts` duplica roles y jerarquía; la Wiki permite acceso a `collaborator` o superior en router y tras login. El backend proporciona el token/perfil compartido, pero la Wiki mantiene su copia de token independiente del frontend principal. No hay evidencia de cookie compartida o SSO web; los dos tokens son JWT del mismo endpoint y pueden ser independientes en emisión.
- La Wiki no implementa registro ni recuperación. El contrato actual que consume exige respuesta login con `id`, `username`, `role`, `token`; token con `exp`, `id`, `username`, `role`; JWT firmado compatible con backend. Cambiar claims o formato exige coordinación.
- Expirar localmente no revoca en backend; existe ventana donde la UI está limpia pero token copiado aún se acepta hasta exp. LocalStorage expone token a XSS como en frontend principal. Si frontend y Wiki están en orígenes distintos, localStorage no se comparte por diseño de navegador; dominios actuales y topología concreta de despliegue no se comprobaron desde configuración fuente.

## Riesgos y decisiones de arquitectura

1. **Robo de token por XSS y logout sin revocación:** ambos consumidores persisten Bearer en localStorage y no existe revocación de sesión. 8 h fija el horizonte máximo normal, salvo cuenta desactivada/inválida.
2. **Sin recuperación/validación de correo:** no hay ruta de recuperación/reset ni confirmación visible en backend. Definir producto, política antifraude y UX antes del contrato.
3. **Autorización transversal:** distintos dominios importan `AuthModule` y dependen de semántica jerárquica; migración de guard/claims impacta rutas fuera de Identity.
4. **Respuestas y payload:** login y registro devuelven token más campos de usuario; Wiki valida claims y perfil. No cambiar token/shape o campos sin transición compatible.
5. **Exposición de estado de usuario:** el perfil de autenticación se entrega a ambos consumidores y se persiste en UI; confirmar conjunto mínimo de campos y no filtrar campos internos al redefinir respuestas.
6. **Rendimiento del login:** bcrypt sync puede ocupar event loop; primero medir carga representativa antes de decidir implementación async/limitación adicional.

### Contract finding

**Current behavior (confirmado antes de la corrección):** `PATCH /api/auth` y `PATCH /api/auth/superadmin/:id` aceptaban `password`; `profileUpdateFields` lo transformaba a hash bcrypt, lo asignaba a la entidad y ambos caminos devolvían `userRepository.save(user)`. La respuesta JSON serializada incluía `password` con el hash `$2b$10$…` en ambas rutas, pese a `select: false`. La evidencia se obtuvo con credenciales de prueba generadas por bcrypt y no se guardó ningún secreto real.

**Problem:** la respuesta exponía un verificador reutilizable para ataques offline de contraseña y creaba una diferencia de contrato entre login/registro y actualización. `select: false` no elimina una propiedad ya asignada a la instancia.

**Impact:** backend + frontend.

**Options consideradas:** preservar shape público omitiendo solo la contraseña; reemplazar response por payload mínimo, lo que sí cambiaría contrato.

**Resultado BC-ID-1:** regresiones exigen que ambos JSON carezcan de `password`, verifican que el hash se sigue guardando en la entidad, y comprueban que se conservan `id`, `username`, `email`, `image`, `role` e `isActive` presentes. `AuthService` ahora devuelve una proyección sin propiedad `password` después de save; no cambió algoritmo/coste bcrypt, rutas, DTOs ni respuestas de otras rutas. Los servicios frontend tipan ambas respuestas como `unknown` y sus stores/vistas ignoran el cuerpo de update, así que no consumen este campo ni dependen del hash.

**Estado:** corregido y verificado; no requiere migración ni cambio coordinado de Wiki.

### Contratos y permisos caracterizados por BC-ID-1

- Login correcto: `username` y `password`; response contiene `id`, `username`, `role`, `token` y datos opcionales de perfil/dashboard; firma claims `{ username, id, role }`. Login con contraseña incorrecta o usuario inexistente entrega `UnauthorizedException` (401) con mensaje genérico. Los tests aseguran que no se emite token en error.
- Registro: ruta pública `POST /api/auth/register`; crea rol `user`, responde campos de perfil/configuración y `token`, no incluye contraseña/hash ni acepta `role`, `roles`, `isActive` o `notes` del cliente. El frontend lo utiliza desde administración con `email`, `username`, `password`; su tipo de respuesta incluye `id`, `email`, `username`, `role`, `createdAt`, `token` y campos opcionales.
- Perfil `PATCH /api/auth`: requiere `@Auth()` (JWT válido, sin mínimo de rol) y el actor se deriva de `@GetUser()`, no de ID enviado por cliente. Admite solo campos de perfil/configuración definidos por DTO/allowlist. Después de cambiar contraseña, respuesta JSON ya no contiene password/hash; conserva proyección restante del usuario.
- Administración `PATCH /api/auth/superadmin/:id`: requiere mínimo superadmin y vuelve a comprobar rol/estado vigente del actor en `AuthService`; permite campos de perfil más rol/notes/createdAt. Hash ausente de respuesta tras cambio de contraseña. Las vistas administrativas solo esperan éxito y no inspeccionan el response body.
- DTO inválido con propiedades no declaradas devuelve excepción 400 bajo opciones del `ValidationPipe` global. Credenciales incorrectas, JWT de usuario eliminado o inactivo producen 401. Rol vigente bajo mínimo produce 403; cuatro niveles están caracterizados, incluyendo herencia ascendente. `UserRoleGuard` consulta `role` persistido y no confía en claim role forjado.
- `JwtStrategy` usa del payload únicamente `id` para volver a cargar al usuario; existencia y `isActive` son actuales de DB. El rol claim se firma y lo leen los consumidores al login, pero autorización de ruta privilegiada usa rol actual consultado por guard.
- `@GetUser()` entrega el `req.user` devuelto por strategy; el actor se usa en actualizaciones propias y comprobaciones administrativas. `@RoleProtected` establece metadata y `@Auth` combina Passport `AuthGuard()` con `UserRoleGuard`. El spec del guard comprueba que un rol JWT `superadmin` no eleva un rol DB `collaborator`.
- AccessRequests conserva POST público y límite 3/60 s; el módulo recibe alias/email, no emite token ni crea sesión. Tests preexistentes cubren metadata de ruta/throttle y el consumer rate-limit.

### Consumidores verificados

- **Frontend Vue:** `POST /auth/login` envía `username/password`; `LoginResponse` consume `id`, `username`, `role`, `token`, `image`, configuración de dashboard y flag. Store persiste token, username, userId, image, role y configuración en localStorage. Servicios perfil/admin hacen PATCH y tipan retorno `unknown`; store de perfil ignora retorno, y store admin mezcla `updatedUser` local en memoria. Así que la respuesta de update no es fuente de estado. Registro administrativo usa la forma descrita arriba. UI de cambio de contraseña envía `password` en perfil o admin. Sin refresh: cualquier cambio futuro de token/login/restauración/interceptor exige coordinación.
- **Wiki Vue:** Fetch `POST /auth/login` envía `username/password`; valida respuesta `id/username/role/token`, decodifica `exp/id/username/role` del JWT y los compara. Guarda token en su clave localStorage propia; `apiRequest` envía Bearer. No usa endpoints ni respuesta de actualización. Requiere que token continúe siendo JWT decodificable en navegador con esos claims; rotación/opaque access token o claims modificados requerirá cliente coordinado. 401 con token cierra sesión local y 403 navega a acceso denegado.
- **Backend cross-domain:** Catalog, Community, Editorial e Integrations tienen controladores protegidos con `@Auth()` o mínimos `riffvalley`/`superadmin`; módulos importan AuthModule y comparten guard/strategy. Las suites de autorización ya existentes distribuidas en esos dominios se incluyen en `yarn test:unit` completo. BC-ID-1 no altera esos permisos.
- No se encontró en Wiki un script de tests ni specs. Sus respuestas/campos se comprobaron leyendo implementación; la aplicación no se modificó.

### Arquitectura candidata para evaluar, no decisión

- Access token de vida corta (duración a decidir; p. ej. 5–15 minutos), firmado con algoritmo/issuer/audience y validación explícitos, claims mínimos (`sub`, `iss`, `aud`, `iat`, `exp`, opcional `jti`/versión). No incluir datos mutables innecesarios.
- Refresh token opaco, aleatorio y de un solo uso, persistido como hash con familia, expiración, emisión/último uso, usuario, sesión/dispositivo y estado de revocación. Rotación atómica en cada uso; reutilización de token consumido revoca familia y fuerza reautenticación. Definir retención/limpieza y política ante concurrencia.
- Revocación por sesión, usuario y eventos de seguridad (logout, reset de contraseña, desactivación, cambio sensible); estrategia de access-token revocation explícita: aceptar vida corta como ventana o comprobar versión/denylist cuando el riesgo lo justifique.
- Logout idempotente que revoca refresh/sesión. “Cerrar esta sesión” y “cerrar todas” pueden ser contratos separados si UX lo requiere.
- Evitar fijar storage sin decidir despliegues. Opción navegador: refresh en cookie `HttpOnly; Secure; SameSite` y access token solo en memoria. Requiere revisar dominios de frontend/API, `SameSite`, CORS con credenciales y CSRF (protección por token/origin/Fetch Metadata según topología). Alternativa: refresh token solo memoria reduce persistencia pero no sobrevive recarga; localStorage es simple pero deja refresh robable por XSS.
- Sesiones independientes reducen coordinación de logout y permiten sesiones/dispositivos separados; SSO requeriría un dominio de autenticación común, política de cookies/redirect, CORS y quizá logout federado. La Wiki y frontend pueden compartir credenciales sin compartir sesión. No hay evidencia suficiente para decidir SSO: conocer dominios reales, experiencia deseada, gestión operativa y modelo de amenaza.

### Decisiones necesarias antes de contratos

- Dominios/orígenes de producción y staging de API, frontend y Wiki; si son same-site, subdominios o sitios distintos; TLS, proxies y CORS actuales.
- SSO vs sesiones independientes; persistencia entre recargas; UX de revocar una o todas las sesiones; duración absoluta/inactiva y sesiones concurrentes.
- Cookie HttpOnly vs refresh en memoria/otra alternativa; defensa CSRF y XSS asumida; soporte para clientes no navegador si existe.
- Política de reset/confirmación de correo, enumeración de cuentas, expiración y rate limits; requisitos de política de contraseñas.
- Ventana de compatibilidad y despliegue coordinado backend/frontend/Wiki; estrategia ante JWT antiguos durante rollout y consumidores no identificados.
- Algoritmo/gestión de claves, issuer/audience, observabilidad sin tokens, límites de intentos, revocación por contraseña/rol y retención de datos de sesión.

## Roadmap propuesto

Cada tarea debe conservar compatibilidad hasta que las tres piezas estén listas para el cambio correspondiente. Tamaños iniciales orientativos, a confirmar con decisiones y caracterizaciones.

### Saneamiento técnico (sin cambiar contratos)

| Tarea | Alcance y dependencias | Aceptación | Verificación | Tamaño |
|---|---|---|---|---|
| [x] BC-ID-1 — caracterización de contratos y permisos (completada 2026-10-21) | Caracterizar rutas/Auth, DTO/errores/payloads, identidad User y consumers directos; cubrir regresiones. Corrección limitada a serialización de password confirmada. | Inventario de contratos y expectativas backend/frontend/Wiki; guards y usuarios inválidos cubiertos; ningún hash de password en las dos respuestas PATCH. | 8 suites focales (218 tests), 2 suites de permisos frontend (8 tests), gates backend. | S |
| [x] BC-ID-2 — saneamiento TypeScript/ESLint de Identity (completada 2026-10-21) | Eliminar deuda de producción y tests con tipos concretos, narrowing y fixtures/mocks tipados; Prettier limitado a los archivos afectados. | Cero hallazgos actuales bajo `src/identity/`; comportamiento y contratos conservados; la infracción estructural histórica sigue registrada para una tarea estructural posterior. | 7 suites focalizadas (216 tests), gates de tipos, lint, typecheck, estructura, build y diff check. | S |
| BC-ID-3 — separar responsabilidades internas demostradas | Evaluar AuthService (cuentas, métricas/accesos) y AuthModule acoplamiento a Rate; extraer solo con responsabilidad/callers/tests caracterizados. | Wiring y ownership claros, fachada si callers justifican transición, comportamiento conservado. | specs de piezas/fachada, module tests y gates backend. | M |

### Seguridad de sesión (requiere decisiones y diseño contractual)

| Tarea | Alcance y dependencias | Aceptación | Verificación | Tamaño |
|---|---|---|---|---|
| BC-ID-4 — decisión ADR de sesión | Decidir expiración, SSO, cookie/storage, CSRF/CORS, dominios, revocación, device/session model, amenazas y despliegue. Prerrequisito para BC-ID-5. | ADR aprobado con diagramas de login/refresh/rotación/reutilización/logout, valores y responsabilidades de despliegue. | Revisión de amenazas y configuración por entorno sin credenciales reales. | S |
| BC-ID-5 — persistencia y servicio de refresh | Migración aditiva de tabla/sesión, hash refresh aleatorio, rotación transaccional, detección de reuso, expiración/limpieza y revocación. Depende de ADR y coordinación migración backend. | Tokens no se guardan en claro; doble refresh no produce dos sesiones válidas; revocar impide siguiente refresh; reglas de expiración definidas. | Tests aislados DB/migración según skill y entorno autorizado; unitarios de carrera/reuse; sin conectar servicios reales por defecto. | M |
| BC-ID-6 — endpoints y access tokens | Introducir emisión/refresh/logout revocable, JWT validation explícita y estrategia de convivencia con login actual. Depende de BC-ID-4/5. | Contrato nuevo versionado/aditivo; login antiguo no se elimina hasta migración; políticas de rate limit, errores y claims fijadas. | Unit/e2e aislados, validación de JWT y revocación; gates y pruebas de contrato. | M |

### Cambios contractuales y consumidores

| Tarea | Alcance y dependencias | Aceptación | Verificación | Tamaño |
|---|---|---|---|---|
| BC-ID-7 — cliente frontend | Cliente central con access token memoria, refresh seguro según ADR, single-flight/retry limitado, 401/403 diferenciados, restauración y logout sesión. Depende de endpoint backend disponible. | Reload/expiración/401/red/logout limpian y restauran estado según decisión; no loop de refresh; permisos UI no son autoridad. | Tests store/interceptor/router en Vitest y build/typecheck. | M |
| BC-ID-8 — cliente Wiki | Adaptar fetch auth, restauración/expiración, permisos/errores, storage y logout al mismo contrato aditivo; mantener sesión aparte o integrar SSO solo conforme ADR. | Wiki continúa funcionando durante transición; ya no confía en claims decodificados para estado de servidor; destino post-login conservado. | Tests/typecheck/build Wiki con stub local de API. | S |
| BC-ID-9 — retirada de compatibilidad antigua | Solo tras métricas y confirmación de backend/frontend/Wiki y otros consumidores. Retirar respuesta/token legacy o rutas si el ADR lo decide. | Cero consumers conocidos del contrato antiguo, rollback documentado, despliegue verificado en todos los orígenes. | Inventario de logs sin PII/token, smoke tests coordinados y gates de los tres repos. | S |
| BC-ID-10 — recuperación y ciclo de credenciales | Definir primero flujo/email/rate limit; tokens de reset de un uso y hash persistido o proveedor seleccionado; invalidar sesiones según decisión. | Respuestas anti-enumeración, token no reutilizable/expirado, cambio de password comprobado; UX integrada sin filtrar cuentas. | Tests de servicio/contrato y envío de correo mock; no enviar correo real durante tests. | M |

Dependencias principales: BC-ID-1 y BC-ID-2 preceden refactors; BC-ID-4 precede BC-ID-5/6; backend BC-ID-5/6 precede las migraciones de los dos clientes, que pueden avanzar en paralelo con contrato aditivo estabilizado; BC-ID-9 es el último paso y requiere evidencia de adopción. BC-ID-10 puede diseñarse tras decisión de seguridad y ejecutarse separadamente, pero debe acordar revocación de sesiones.

## Verificación de BC-ID-1

`yarn test:unit --runInBand` sobre Auth controller/service/DTO/JwtStrategy, UserRoleGuard, autorización de mutaciones cross-domain, consumo de throttling y AccessRequests controller: 8 suites, 218 tests aprobados. Suites frontend existentes de permisos de importación y menú: 2 suites, 8 tests aprobados desde configuración temporal en `/tmp`, porque el checkout frontend es de solo lectura; ningún archivo del frontend se cambió. Wiki no tiene tests encontrados.

Gates solicitados aprobados: `yarn quality:typecheck` (0 errores), `yarn quality:types` (97 hallazgos históricos, 0 nuevos/obsoletos/duplicados), `yarn quality:lint` (904 diagnósticos históricos, 0 nuevos/obsoletos/duplicados), `yarn quality:structure` (40 módulos, 77 infracciones históricas, 0 nuevas/obsoletas), `yarn build` y `git diff --check`. No se ejecutaron E2E, migraciones ni PostgreSQL/servicios externos.

## Verificación de BC-ID-2

Se resolvieron los 29 hallazgos de tipado seguro de Identity: `explicit-any` (28) y `double-type-assertion` (1). Se resolvieron los 12 diagnósticos ESLint de Identity: `@typescript-eslint/ban-types` (7, usos de `Function`) y `@typescript-eslint/no-unused-vars` (5). Los cambios sustituyen tipos inseguros por mocks/fixtures y handlers tipados, narrowing de `unknown` en el manejo de errores de BD y eliminación de imports/variables sin uso; no modifican rutas, DTOs públicos, respuestas, JWT, roles ni guards. Se aplicó Prettier únicamente a los archivos de Identity afectados.

Baselines antes/después: type safety, 97 → 68 entradas globales (29 de Identity retiradas); ESLint, 904 → 892 (12 retiradas). Ambos gates terminaron con 0 hallazgos nuevos, obsoletos o duplicados. Typecheck: 0 errores/nuevos/obsoletos/duplicados. `yarn quality:structure`: 40 módulos, 77 infracciones históricas, 0 nuevas/obsoletas; permanece la infracción histórica `spec-outside-tests` de `src/identity/auth/guards/user-role/user-role.guard.spec.ts`, conservada fuera del alcance de BC-ID-2. Build y `git diff --check` aprobaron.

Pruebas focalizadas: `yarn test:unit --runInBand src/identity/auth` — 7 suites, 216 tests aprobados; incluye caracterización de Auth, JWT, roles, mutaciones cross-domain y AccessRequests. La deuda restante fuera de Identity en los baselines no se modificó. BC-ID-3–10 siguen pendientes.
