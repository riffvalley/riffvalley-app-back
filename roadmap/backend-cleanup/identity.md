# Identity — BC-ID-0 / BC-ID-3A

**Estado:** BC-ID-0, BC-ID-1, BC-ID-2 y BC-ID-3A–3E completadas (2026-10-21). BC-ID-3A estableció el diseño; BC-ID-3B extrajo Users; BC-ID-3C extrajo Activity; BC-ID-3D separó Authorization; BC-ID-3E dejó Auth limitado a autenticación y coordinación de registro. BC-ID-3F y BC-ID-4–10 siguen pendientes.

## Alcance y repositorios observados

- Backend: `riffvalley-app-back`, estado local limpio al comenzar la inspección. NestJS, Passport/JWT, TypeORM y PostgreSQL.
- Frontend: `../riffvalley-app-front`, disponible localmente para lectura. Vue 3, Pinia, Vue Router, Axios y Vite.
- Wiki: `../riff-valley-wiki`, disponible localmente para lectura. Vue 3, Vue Router y Vite; su `package.json` declara pnpm. También contiene `roadmap/authentication-analysis.md`, que se contrastó con el código.
- Las rutas de los dos consumidores son relativas al checkout backend y no están bajo su raíz escribible. No se modificó ninguno de esos repositorios.

## Backend: inventario inicial de BC-ID-0

Este inventario describe el estado previo a BC-ID-3. Tras BC-ID-3B/3C existen `UsersModule` y `ActivityModule`: Auth conserva la fachada/controladores, Users posee la escritura de cuentas, y Activity posee accesos históricos y estadísticas. El registro actual de cada corte está debajo.

### Módulos y componentes

En ese estado auditado, `src/identity/auth/` concentraba el módulo de identidad: no existía módulo/directorio `users` independiente. `AuthModule` registraba `AuthController`, `AuthService`, `JwtStrategy`, `UserRoleGuard`, repositorios TypeORM para `User`, `UserAccessLog` y `Rate`, Passport con estrategia predeterminada `jwt`, y `JwtModule` configurado desde `JWT_SECRET` con expiración `8h`. Exportaba TypeORM, estrategia/Passport, JwtModule y UserRoleGuard. `AppModule` establece el prefijo `/api`.

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

## BC-ID-3A — diseño de responsabilidades y dependencias

### Decisiones de arquitectura

El objetivo de BC-ID-3 es separar responsabilidades demostradas sin exigir un módulo Nest por cada nombre. `AuthModule` puede conservar temporalmente el controller y una fachada delgada para mantener las rutas; los módulos nuevos se justifican por ownership de casos de uso, repositorios y consumidores, no por agrupar métodos mecánicamente.

| Área | Ownership propuesto | Límite y dependencias |
|---|---|---|
| Auth | Login, validación de credenciales y emisión de access token; después, coordinación con Sessions. | Depende de una lectura interna de identidad y del puerto de sesiones. No administra perfiles ni estadísticas. |
| Users | Consultas/cuentas, perfiles, cambio de contraseña, activación, desactivación, borrado y administración. | Único owner de escrituras y repositorio de `User`. Devuelve proyecciones sin hash; mantiene `password` fuera de selecciones y respuestas. No importa Auth ni Authorization. |
| Authorization | `JwtStrategy`, `UserRoleGuard`, decorators, jerarquía y evaluación de permisos del backend. | Depende de una consulta mínima de identidad vigente (id, rol y estado) de Users. Nunca autoriza usando solo el rol local del frontend. |
| Activity | Apertura diaria autenticada por app, consulta de accesos y métricas de actividad. | Owner de su tabla/repositorio nuevo; consulta la identidad para autorización y puede leer `Rate` con un repositorio local durante la transición. No importa `RatesModule`. |
| Sessions (futuro) | Sesiones persistentes, refresh rotatorio, revocación y logout global entre aplicaciones. | Auth coordina emisión/login y Sessions; Sessions depende de Users para estado/cuenta, nunca de Auth. SSO comparte sesión autenticada entre Riff Valley y Wiki. |
| AccessRequests | Solicitud pública de acceso y notificación por correo. | Mantiene su módulo; usa una consulta de alias disponible mediante Users y `MailService`. No crea cuentas ni sesiones. |

Se conserva la jerarquía actual `user < collaborator < riffvalley < superadmin`. El backend consulta identidad/rol vigentes en cada autorización protegida como ahora; claims o estado UI de clientes no conceden permisos.

### Matriz de extracción de AuthService

| Método o responsabilidad actual | Propietario y dependencias actuales | Propietario propuesto | Consumidores conocidos | Riesgo de extracción | Fachada temporal |
|---|---|---|---|---|---|
| `create` (registro, bcrypt y JWT) | `auth.service.ts`; `User`, `JwtService`, roles | Auth coordina registro/login; Users crea la cuenta. Separar token de la persistencia. | Frontend administrativo; no se observó registro en Wiki. | `POST /api/auth/register` mezcla escritura de cuenta y emisión de token; mantener forma de respuesta. | Sí, `AuthController` conserva ruta y delega. |
| `login` (lookup case-insensitive, comparación bcrypt, `lastLogin`, token y log diario) | `auth.service.ts`; `User`, `UserAccessLog`, `JwtService`, bcrypt | Auth valida credenciales con Users; Activity recibe solo eventos de apertura del cliente, no el login como sustituto. | Frontend y Wiki `POST /api/auth/login`. | Forma de respuesta y claims son consumidos por ambos clientes. El login actual registra un acceso aunque no se conozca la app. | Sí, hasta coordinar endpoint/consumidores; retirar el log ambiguo solo al preservar sus estadísticas. |
| `findAll`, `findAllRv`, `findUsersByRole`, `findSuperUsers`, `findOne` | `auth.service.ts`; `User` repository, roles | Users, con proyecciones específicas por operación. | Controller `/api/auth/users*`, `/api/auth/:id`; tareas internas pueden consumir Users. | Campos, orden y mínimos de rol son contrato observable; `findOne` actualmente puede seleccionar relaciones/campos según metadata. | Sí, rutas actuales delegan en Users. |
| `updateUser`, `profileUpdateFields`, `withoutPassword` | `auth.service.ts`; `User`, DTOs, bcrypt | Users: perfil propio y cambio de contraseña; serializer/proyección segura. | Frontend `PATCH /api/auth`; Wiki no usa PATCH. | Permisos por actor derivado de `@GetUser`, allowlist y response sin hash desde BC-ID-1. | Sí. |
| `updateUserSuperAdmin`, `adminUpdateFields`, `validateAssignedRole`, `assertSuperadmin` | `auth.service.ts`; `User`, roles, DTO admin, bcrypt | Users: administración, rol, notes y fechas; Authorization provee política/guard, Users valida actor vigente en escrituras sensibles. | Frontend admin `PATCH /api/auth/superadmin/:id`. | No degradar la segunda comprobación superadmin, validación de rol ni protección de contraseña. | Sí. |
| `setActive`, `remove` | `auth.service.ts`; `User`, cascadas TypeORM, rol | Users. En el futuro, desactivación/borrado debe revocar sesiones. | Frontend administración; otros dominios conservan relaciones de User. | Cascadas y restricciones de entidades relacionadas; borrar no equivale a desactivar. | Sí. |
| `findAllAdminStats` | `auth.service.ts`; `User`, `UserAccessLog`, `Rate`, SQL PostgreSQL y `PaginationDto` | Activity para series de acceso; Users para conteos/listado de cuentas. Estadísticas de votos se deben mantener con Rates/Community o Activity como consulta analítica explícita, sin dependencia de módulo circular. | `/api/auth/users/admin-stats`, panel administrativo. | Payload compuesto: usuarios, votos, logins y agregados diarios; consumidores y semánticas históricas deben caracterizarse antes de redistribuir. | Sí; preservar response agregada durante la extracción. |
| `getAllActivity` | `auth.service.ts`; `Rate` con relaciones `user`/`disc` | Activity mientras conserve el endpoint histórico; a largo plazo valorar ownership de estadísticas de votos en Community/Rates. | `/api/auth/activity`, administrador. | Proyección paginada de votos/usuario/disco; `Rate` es propiedad de Community. | Sí. |
| `getUserActivity` | `auth.service.ts`; `Rate`, `UserAccessLog` | Activity como composición de eventos diarios y actividad; si se mantiene “votes”, consultar una API/query de Rates sin ciclo. | `/api/auth/:id/activity`, administrador. | Response `{ votes, logins }` y relación de disco se consumen como contrato; logins son fechas del log actual. | Sí. |
| `getJwtToken` | `auth.service.ts`; `JwtService`, `JwtPayload` | Auth; en BC-ID-4–8 se integra con Sessions según diseño contractual. | Login/registro y ambos clientes leen el token/claims. | Expiración actual `8h`, claims `{username,id,role}` y formato JWT son dependencias vigentes. | No como servicio separado; conservar en Auth. |
| `assertAllowedFields`, `handleDBerrors` | `auth.service.ts`; reglas de DTO/TypeORM | Users para mutaciones/cuentas; conservar normalización de errores cerca de los casos de uso. | Rutas de registro/actualización y sus errores 400. | El `ValidationPipe` global no reemplaza la allowlist interna de campos. | No necesariamente; reutilizar solo si hay más de un consumidor. |
| JWT strategy, guard, decorators y roles (fuera del service) | `JwtStrategy` y `UserRoleGuard`; `User`, `Reflector`, Passport | Authorization, con Users identity reader. | Controladores de Catalog, Community, Editorial e Integrations protegidos con `@Auth`. | `AuthModule` es dependencia transversal; provider/export/import change puede romper módulos y permisos. | Mantener exports compatibles durante migración. |
| Solicitud de acceso (fuera de AuthService) | `AccessRequestsService`; `User` repository y `MailService` | AccessRequests; lookup de alias mediante Users y envío por Mail. | `POST /api/access-requests`; frontend de acceso. | Conserva respuesta pública, throttle 3/min, y envío best-effort de email. | No hace falta fachada adicional; conservar su endpoint. |

### Grafo de dependencias y ownership TypeORM

```text
Catalog / Community / Editorial / Integrations
                │ consumen guards y decorators
                ▼
          Authorization ───────► Users (IdentityReader: id, role, isActive)
                                      ▲            ▲
                                      │            │
                         Auth ────────┘            │
                           │                       │
                           └──────► Sessions (futuro)
                                      │             │
                                      └─────────────►Users

Activity ─────► Users (identidad de actor)
   └──────────► Rate repository (consulta acotada; no RatesModule)
AccessRequests ─► Users (alias existente) + Mail
```

El dibujo marca dependencias de providers; entidades TypeORM pueden seguir registrándose localmente en módulos que necesitan joins/relaciones, pero el repositorio de `User` para escrituras y operaciones de cuenta pertenece a Users. Users exportaría una interfaz/provider de lectura de identidad y casos de uso necesarios, no su `Repository<User>` crudo. Auth y Authorization importan Users y nunca son importados por Users. Activity mantiene su repositorio de actividad y las lecturas analíticas concretas; no se debe hacer que Rates importe Activity. AccessRequests deja de abrir su propio repositorio de User cuando Users proporcione lookup de alias, sin importar AuthModule.

Los módulos de dominio hoy importan `AuthModule` para decorators/guards; un módulo Authorization compatible debe exportar `PassportModule`/strategy y guard necesarios durante el traslado. Evitar exportar `TypeOrmModule` y `JwtModule` de forma general desde Auth como API transversal. Migrar consumidores por lotes y eliminar exports solo tras revisar referencias y tests de módulo. No crear `UsersModule` como fachada vacía antes de mover una responsabilidad real.

### Registro diario por aplicación

El `UserAccessLog` actual tiene clave primaria `(userId, date)`, no guarda app y se inserta durante `login()` usando `CURRENT_DATE`. Es un registro de login diario, no identifica qué aplicación se abrió y no se actualiza al restaurar una sesión persistente. Recomiendo crear una tabla/entidad de actividad diaria específica, por ejemplo `user_daily_activity`, con `userId`, `date`, `application` (`app` o `wiki`) y FK a User. Su clave única/primaria sería `(userId, date, application)`, que además sirve para historial por usuario/fecha. Un índice candidato `(date, application)` puede ayudar las series de actividad; validar con consultas y `EXPLAIN ANALYZE` con datos representativos antes de añadirlo. La restricción única sí es necesaria para idempotencia.

La inserción debe ser `INSERT ... ON CONFLICT ("userId", date, application) DO NOTHING` o equivalente TypeORM con constraint explícita; la base de datos arbitra carreras concurrentes entre pestañas/reintentos. El día se calcula en backend con una zona horaria IANA configurada de forma única (decisión pendiente: UTC recomendado para actividad analítica, o zona de negocio si “día” significa calendario local). Convertir el instante del servidor a esa zona antes de obtener `date`; no sumar 24 horas a medianoche ni derivar la fecha del reloj del cliente. Un `date` calendario evita que el horario de verano cree días de 23/25 horas. Desplegar todas las instancias con la misma zona/configuración y probar los límites de día y cambios DST.

Separar tabla nueva preserva el significado de históricos: los `UserAccessLog` existentes no contienen origen y no se deben copiar como `app` ni `wiki`. Las estadísticas actuales de login se conservan leyendo la tabla antigua; el nuevo panel muestra aperturas verificables desde la fecha de activación. Si luego se decide unificar, los registros antiguos deben seguir marcados como desconocidos en una estructura de transición, nunca atribuirse por inferencia.

La señal debe enviarse una vez por inicialización de app después de que el cliente haya validado/restaurado una identidad autenticada; no se vincula a navegación, voto ni otra acción. La API autentica el bearer/sesión para obtener `userId`, calcula la fecha y deriva la app mediante contexto autorizado de backend. No acepta `userId`, fecha ni `application` arbitrarios del body. El endpoint candidato es `POST /api/activity/open`, autenticado e idempotente; cada cliente lo invoca en startup/restauración, y un refresh automático no lo invoca. No se debe considerar `Origin` por sí solo una prueba contra clientes HTTP que puedan falsificar headers. Para atribución firme, el backend emite un token de acceso con `aud`/client binding propio de `app` o `wiki` (o equivalente en la sesión) y lo valida; la identidad/sesión sigue siendo compartida. CORS/orígenes exactos son defensa complementaria, no la autoridad de app.

Consultas propuestas:

- Activos diarios por app: `COUNT(DISTINCT userId)` con agrupación por `date` y filtro `application`.
- Únicos diarios combinados: `COUNT(DISTINCT userId)` filtrando las dos aplicaciones y agrupando solo por `date`, de modo que un usuario presente en ambas se cuente una vez.
- Días de apertura por usuario: filas filtradas por `userId`, ordenadas por `date` y `application`.
- Evolución en intervalo: filtro inclusivo/exclusivo documentado para rango de fechas, con serie agregada por día/app; completar días sin eventos en la capa de reporte si el contrato necesita ceros.

No aplicar retención a la tabla histórica ni a la nueva sin una decisión de privacidad/analítica. Evaluar retención futura, borrado en cascada al borrar usuario y limpieza por lotes con métricas y política aprobada. No registrar navegación, ratón ni permanencia.

### SSO y sesiones: requisitos fijados, implementación futura

El sistema final debe permitir que iniciar sesión en Riff Valley habilite acceso a Wiki y viceversa sin volver a introducir credenciales, sujeto a permisos; mantener sesiones persistentes hasta 30 días; renovar access tokens automáticamente; rotar y revocar refresh tokens; cerrar sesión compartida/global desde cualquiera de las dos aplicaciones; y conservar jerarquía de roles actual. La expiración de access token y la duración absoluta/inactiva de sesión son parámetros distintos y aún deben decidirse. La rotación, persistencia, SSO y logout global no forman parte de BC-ID-3A ni de BC-ID-3.

Sessions debe tener contratos independientes para crear, renovar, revocar sesión actual y revocar todas las sesiones, con rotación atómica y detección de reuso. Auth valida contraseña y delega creación; Authorization valida credencial de acceso y consulta Users; Sessions guarda hashes de refresh tokens, familia/estado/fechas y se apoya en Users para cuenta activa. Logout desde frontend o Wiki revoca el mismo identificador de sesión; los dos clientes reciben/notifican el cambio en su siguiente validación o por mecanismo de propagación decidido en BC-ID-4. El acceso inmediato de ambas UIs a un logout global exige coordinar notificación/estado compartido, no solo limpiar localStorage.

Decisiones técnicas aún abiertas para BC-ID-4: orígenes y topología reales, cookie/storage, CSRF/CORS, expiración de access token, inactividad vs duración absoluta dentro de 30 días, sesiones concurrentes/dispositivos, manejo de access tokens ya emitidos al revocar, y mecanismo de aviso al otro cliente. Las decisiones de producto sobre SSO, máximo de 30 días, rotación/revocación global y jerarquía ya están fijadas y no se reabren en BC-ID-4.

### Estrategia de compatibilidad HTTP

BC-ID-3 conserva todas las rutas `/api/auth` y sus guards, payloads, errores y orden/proyección observable. La separación empieza dentro del controller/fachada y delega en Users/Activity sin mover contratos. Más adelante pueden añadirse rutas aditivas `/api/users`, endpoints específicos de Activity y endpoints de sesión bajo `/api/auth`; frontend y Wiki se migran coordinadamente contra el contrato disponible. Una ruta antigua solo se retira con inventario de consumidores, telemetría de uso y despliegue/rollback acordados. No se renombra endpoint en BC-ID-3A.

### Cortes de implementación de BC-ID-3

Estimaciones relativas: S = cambio acotado; M = varias clases, módulos y suites; L = coordinación de varios consumidores o migración/contrato.

| Corte | Objetivo y alcance | Dependencias/archivos | Criterios de aceptación y pruebas/gates | Riesgos y consumidores | Tamaño |
|---|---|---|---|---|---|
| [x] BC-ID-3A — diseño y ownership | Este documento: matriz, límites, grafo, compatibilidad, actividad y secuencia. | Solo `roadmap/backend-cleanup/identity.md`. | Rutas API y referencias de archivo revisadas; no hay enlaces Markdown rotos; `git diff --check`; sin código/tests/productivo. | Las rutas de consumidores actuales deben guiar la secuencia. | S |
| [x] BC-ID-3B — Users y cuentas (completada 2026-10-21) | Extraer registro de cuenta/persistencia, consultas, perfil, contraseña, admin, estado y borrado a Users; Users provee reader mínimo de identidad. AuthController mantiene rutas como fachada. | `auth.service.ts`, DTOs/serialización, `User`, `AuthModule`, `UsersModule` y `UsersService`; AccessRequests consulta alias mediante Users. | Tests focales 29 suites/431 tests; hash nunca responde; roles/actor/allowlists y cascadas intactos; quality gates sin hallazgos nuevos. | Perfil/admin frontend; altas; AccessRequests; consumidores de `User` directo. | M |
| [x] BC-ID-3C — Activity y desacople de Rates (completada 2026-10-21) | Extraer accesos históricos, actividad por usuario, agregados de Rate y estadísticas administrativas a Activity; conservar AuthService como fachada y el registro histórico al hacer login. No implementar todavía aperturas diarias por aplicación. | `ActivityModule` registra repositorios de lectura/analítica `User`, `UserAccessLog` y `Rate`; exporta solo `ActivityService`. Auth importa Activity; Users deja de usar UserAccessLog; Activity no importa Auth ni RatesModule. | Payloads, filtros, orden, paginación, errores, roles y login caracterizados; pruebas de servicio/módulo y consumidores; gates de estructura, tipos, lint, typecheck, build y diff check. | Rates sigue importando Auth; evitar ciclo usando TypeORM directamente en Activity. | M |
| [x] BC-ID-3D — Authorization (completada 2026-10-21) | Mover Strategy, guard, decorators y policy/roles a Authorization; exportar providers mínimos; adaptar imports de dominios gradualmente. Reubicar aquí el spec histórico de `UserRoleGuard` dentro de `__tests__/`, eliminando la infracción estructural histórica de Identity. | `auth/strategies`, `guards`, `decorators`, `interfaces/valid-roles.ts`, módulos protegidos en Catalog/Community/Editorial/Integrations y consumidores relacionados. | JWT válido/expirado, usuario eliminado/inactivo, rol vigente de DB, jerarquía y metadata; wiring Auth/Authorization y consumidores; structure gate sin deuda nueva y sin la infracción histórica; unit/type/lint/build. | Auth conserva fachada y exports transitorios; no cambiar roles/semántica. | M/L |
| [x] BC-ID-3E — Auth delgado y cierre de regresión (completada 2026-10-21) | Auth conserva login/credenciales/registro/emisión; elimina métodos migrados y dependencias residuales de Rate/Users CRUD. | Auth, Users, Activity, Authorization, Rates y módulos consumidores. | Auth sin repositorios ni consultas de administración/estadística; rutas antiguas delegan con contratos iguales; suites Identity + consumidores y gates registrados en 3E. | Revisión del wiring; no retirar `/api/auth`. | M |
| BC-ID-3F — aperturas por app en clientes | Una vez disponible contrato backend/aditivo, frontend y Wiki emiten apertura una vez tras restaurar/validar sesión, con contexto app derivado por backend; no emiten en refresh ni llamadas automáticas. | Frontend `initializeAuth`/store/interceptor; Wiki `useAuth`/inicio Fetch; contrato Activity y mecanismo app-scoped de BC-ID-4–8. | Tests con stubs: sesión válida, anónima, retry, dos apps el mismo día, restauración, refresh sin evento; smoke coordinado sin API real. | Requiere dos repositorios y despliegue coordinado. Si el token/session context por app se define solo en BC-ID-4–8, el wiring final espera a esos cortes. | L |

BC-ID-3A quedó completada como diseño; BC-ID-3B extrajo Users, BC-ID-3C extrajo Activity, BC-ID-3D separó Authorization y BC-ID-3E cerró la separación interna de Auth. BC-ID-3F sigue pendiente y separa explícitamente el trabajo de los clientes y su dependencia del contexto autenticado de aplicación que se decida para Sessions.

### Implementación de BC-ID-3B (2026-10-21)

- `UsersModule` registra los repositorios TypeORM de `User` y `UserAccessLog`, y exporta únicamente `UsersService`; no exporta un `Repository<User>` como API de Users. `UsersService` es owner de creación/persistencia, consultas, perfil, hashing bcrypt (coste 10), administración/roles, activación, borrado, actor superadmin, allowlists, proyecciones sin contraseña y lookup de alias.
- El servicio expone lecturas internas acotadas: credenciales por username (incluye hash solo para la comprobación interna de Auth), identidad mínima por id (`id`, `role`, `isActive`), usuario vigente por id y existencia de alias. Auth consume credenciales/registro y delega las operaciones de cuentas; `AuthService` ya no inyecta ni consulta `Repository<User>`.
- `AuthModule` importa `UsersModule`. Sigue registrando temporalmente `User` en TypeORM porque `UserRoleGuard` aún depende directamente del repositorio hasta BC-ID-3D; conserva la exportación TypeORM existente para compatibilidad de módulos consumidores, incluido el servicio de estadísticas de Rates que resuelve el repositorio de User por esa vía. `UsersModule` no importa Auth, Authorization ni Community. No se cambió JwtStrategy/UserRoleGuard ni se movieron sus specs: Authorization queda para 3D.
- `AuthController` y rutas `/api/auth` permanecen sin cambios. Auth conserva login, claims actuales (`username`, `id`, `role`), expiración `8h`, actualización de `lastLogin` y log diario; registro sigue emitiendo el mismo token y respuesta. Se preservan las proyecciones de listados, validación del actor vigente, errores 400/401/403/404 y campos de respuesta. Los hashes se eliminan de respuestas de creación/actualización.
- La consulta de estadísticas administrativas `findAllAdminStats` ahora se delega a Users para retirar las consultas directas de User de Auth. Su respuesta combinada conserva paginación, series de registros/logins y estadísticas de voto. Las referencias SQL a `rate` siguen siendo una responsabilidad transitoria de esta consulta hasta BC-ID-3C; no se añadió import ni dependencia Nest hacia Community.
- AccessRequestsModule reemplazó su acceso al repositorio User por `UsersService.isUsernameTaken`; endpoint, validaciones, throttle de 3/min, envío best-effort de correo y respuesta permanecen. Mail y su integración no cambiaron.
- Diferencia observada al inspeccionar el código previo: el helper `handleDBerrors` traducía el error PostgreSQL `23505` a 400, pero no relanzaba otros errores capturados en registro. Users conserva la traducción de unicidad y ahora relanza excepciones de persistencia restantes en vez de resolver silenciosamente `undefined`, según el requisito de propagación de errores. No se altera el contrato exitoso ni los errores conocidos.
- Pruebas: 29 suites/431 tests focales (Users, Auth, AccessRequests y consumidores Rates/Editorial) aprobados; suite HTTP de Riff Valley Playlists requirió ejecución con permiso fuera del sandbox para abrir el servidor loopback. El subconjunto Identity final pasó 11 suites/233 tests.
- Quality Gates: estructura, 41 módulos/77 infracciones históricas/0 nuevas; type safety, 68 hallazgos históricos/0 nuevos/obsoletos/duplicados; ESLint, 892 históricos/0 nuevos/obsoletos/duplicados; typecheck, 0 errores; build correcto; `git diff --check` comprobado al cierre. No se actualizaron baselines ni se usaron PostgreSQL/migraciones.

### Implementación de BC-ID-3C (2026-10-21)

- `ActivityModule` posee los repositorios de lectura/analítica de `User`, `UserAccessLog` y `Rate`, y exporta únicamente `ActivityService`. Este concentra el registro histórico asociado al login, `getAllActivity`, `getUserActivity`, `findAllAdminStats` y los agregados de Rate necesarios para sus respuestas; no gestiona credenciales, perfiles ni cuentas.
- `AuthService` conserva temporalmente la fachada de los métodos actuales y las rutas de `AuthController` siguen bajo `/api/auth`. Login sigue actualizando `lastLogin` mediante Users y registra el acceso histórico mediante Activity con la misma consulta idempotente `CURRENT_DATE`/`ON CONFLICT DO NOTHING`. No cambiaron guards, roles ni contratos JSON.
- `UsersModule`/`UsersService` ya no registran ni consultan `UserAccessLog` y dejan de ser propietarios de estadísticas administrativas. Users mantiene el ownership de escritura de User; Activity consulta User únicamente para los agregados y proyecciones que ya generaba. `AuthModule` conserva el registro local de User requerido mientras `UserRoleGuard` siga en Auth y la exportación TypeORM que usan consumidores actuales.
- Dependencias: Auth → Users y Activity; Activity → TypeORM repositories de User, UserAccessLog y Rate. Activity no importa Auth, Users ni RatesModule, y no se añadió `forwardRef()`. Esto evita un ciclo aunque `RatesModule` importe `AuthModule`. No cambian Rate, su módulo ni endpoints de Community.
- Se conservan filtros opcionales `notVotedDays`, `accessDays` e `inactiveDays`, paginación `limit`/`offset`, orden descendente, proyecciones `votes`/`logins` y el shape administrativo (`users`, `usersPerDay`, `lastLoginPerDay`, `neverAccessed`, `lastVotePerDay`, `inactiveVotersPerDay`). Los históricos de `UserAccessLog` mantienen su semántica previa; no se atribuye su origen a una aplicación.
- Aperturas diarias `app`/`wiki` siguen pendientes para BC-ID-3F. Antes, BC-ID-4–8 debe fijar el contexto app-scoped autenticado y compatible con SSO, orígenes permitidos y cómo distinguir una apertura validada/restaurada de refresh o peticiones automáticas. BC-ID-3F necesitará después esquema con unicidad usuario/fecha/app, fecha calculada por servidor con zona coherente, inserción idempotente concurrente, migración aditiva que conserve históricos sin atribución ficticia, endpoint/señal coordinados desde ambos clientes y métricas por aplicación. Nada de eso se implementa en 3C.
- Pruebas focalizadas: Auth, Users, Activity y AccessRequests pasaron 12 suites/236 tests. `src/community` y `src/editorial` pasaron 73 suites/732 tests, 1 suite y 2 tests omitidos. El primer intento sandbox de los consumidores HTTP encontró `listen EPERM`; al repetir las suites con permiso de loopback, todas pasaron. No se usaron PostgreSQL ni servicios externos.
- Quality Gates: estructura, 42 módulos/77 infracciones históricas/0 nuevas/obsoletas; type safety, 68 hallazgos históricos/0 nuevos/obsoletos/duplicados; ESLint, 892 diagnósticos históricos/0 nuevos/obsoletos/duplicados; typecheck, 0 errores; `yarn build` correcto; `git diff --check` correcto. Sin cambios de baseline, esquema o migraciones.

### Implementación de BC-ID-3D (2026-10-21)

- `AuthorizationModule` es owner de `JwtStrategy`, `UserRoleGuard`, `@Auth()`, `@RoleProtected()`, `@GetUser()`, `ValidRoles`, `isValidRole` y `roleMeetsMinimum`. Strategy y guard consultan `UsersService`; la estrategia rechaza usuario eliminado o inactivo con 401, y el guard vuelve a comprobar estado y rol vigente cuando la ruta declara rol mínimo. La política conserva `user < collaborator < riffvalley < superadmin`; un rol elevado en el JWT no supera un rol inferior persistido.
- `AuthorizationModule` importa Config, Passport y Users; exporta strategy, guard, Passport y `UsersModule` para que los guards declarados por controllers consumidores resuelvan su proveedor de identidad en el contexto Nest que los ejecuta. `UsersModule` solo expone `UsersService`, nunca `Repository<User>`. Auth importa y reexporta Authorization como compatibilidad; mantiene temporalmente sus exports previos de TypeORM/JWT. No hay imports inversos desde Users ni `forwardRef()`.
- Se migraron imports de módulos consumidores a `AuthorizationModule` en Catalog, Community, Editorial, Integrations, Platform y Product. `AppModule` mantiene `AuthModule` por la API de autenticación; Rates mantiene Auth por el repositorio de User exportado para sus consultas existentes y además importa Authorization explícitamente. `AccessRequestsModule` sigue dependiendo solo de Users y Mail. Los archivos públicos antiguos bajo `src/identity/auth/{strategies,guards,decorators,interfaces}` son reexports compatibles para consumidores de símbolos que aún usen esas rutas.
- `AuthController`, rutas, DTOs, guards, claims, respuestas, códigos HTTP y expiración JWT de 8 horas no cambian. No se implementaron Sessions, renovación, refresh, revocación ni SSO. La expiración JWT se cubre con prueba HTTP protegida; tests de guard cubren metadata, jerarquía completa, usuario inexistente/inactivo y rol vigente frente al claim.
- El spec de `UserRoleGuard` se movió a `src/identity/authorization/guards/user-role/__tests__/`; el spec de `JwtStrategy` se movió a `src/identity/authorization/strategies/__tests__/`. Se quitó únicamente la entrada `spec-outside-tests` correspondiente a la ruta vieja del baseline estructural. Structure gate: 43 módulos, 76 infracciones históricas, 0 nuevas y 0 obsoletas.
- Pruebas: suites focalizadas de Identity y consumidores Catalog, Community, Editorial, Integrations, Platform y Product: 180 suites aprobadas, 1.752 tests aprobados y 9 suites/33 tests omitidos. Se ejecutaron con loopback permitido para los tests Supertest. No se usaron PostgreSQL ni servicios externos.
- Quality Gates: `yarn quality:structure` (43 módulos, 76 existentes, 0 nuevos/obsoletos); `yarn quality:types` (68 hallazgos históricos, 0 nuevos/obsoletos/duplicados); `yarn quality:lint` (892 diagnósticos históricos, 0 nuevos/obsoletos/duplicados); `yarn quality:typecheck` (0 errores); `yarn build`; `git diff --check`. El baseline estructural disminuyó exactamente una entrada; no se modificaron los otros baselines.
- Situación al cerrar 3D: Auth aún conservaba exports de compatibilidad y Rates importaba Auth por su repositorio histórico; ambos acoplamientos se retiraron en BC-ID-3E. Sesión compartida, SSO y logout global siguen en BC-ID-4–8; BC-ID-3F y la señal de actividad app/wiki esperan el contexto autenticado por aplicación que se defina allí.

### Implementación de BC-ID-3E (2026-10-21)

- `AuthService` ahora se limita a validar credenciales, coordinar el registro público con `UsersService` y emitir el JWT existente. Mantiene la búsqueda de credenciales y bcrypt delegado en Users, el registro público `/api/auth/register`, los claims `{ username, id, role }` y la expiración configurada de 8 horas. No implementa sesiones, refresh ni SSO.
- Se retiraron de `AuthService` sus fachadas de consultas administrativas, perfil, roles, activación/desactivación, eliminación, actividad y estadísticas. `AuthController` conserva todas las rutas `/api/auth` y delega directamente en `UsersService` o `ActivityService` según ownership. Después de un login válido actualiza `lastLogin` mediante Users y registra el acceso histórico mediante Activity; la respuesta no espera ni expone datos adicionales.
- `AuthModule` ya no registra ni exporta repositorios TypeORM, `JwtStrategy`, guards, Passport o servicios de dominio. Importa Users, Activity, Authorization, Config y `JwtModule` (JWT con expiración 8h) y provee `AuthService`; no exporta providers. El inventario no encontró módulos consumidores de AuthModule aparte de `AppModule`, que lo importa para montar la API. Los decorators, roles y rutas antiguas de importación permanecen como reexports de compatibilidad usados por código existente, pero pertenecen a Authorization.
- Se migró el consumidor residual de AuthModule en Rates: `RatesStatsService` obtiene el total de cuentas mediante `UsersService.countUsers()`. `RatesModule` importa directamente Users y Authorization; no importa Auth ni registra el repositorio User. Activity conserva sus consultas analíticas Rate sin importar `RatesModule`.
- No cambiaron endpoints, guards, roles, DTOs, errores, payloads ni serialización segura sin hash. Se mantienen `POST /api/auth/register` como capacidad de registro público prevista para la apertura de 2027, `POST /api/auth/login`, `PATCH /api/auth`, rutas administrativas y respuestas de actividad/estadísticas.
- Pruebas: suites Identity y Rates, 19 suites/283 tests aprobados. Suites consumidoras de Catalog, Community, Editorial, Integrations, Platform y Product, 169 suites/1.517 tests aprobados y 9 suites/33 tests omitidos. La primera ejecución sandbox de consumidores HTTP falló al intentar abrir loopback (`EPERM`); la repetición con permiso para el servidor local pasó. No se usaron PostgreSQL ni servicios externos.
- Quality Gates: `yarn quality:structure` (43 módulos, 76 infracciones históricas, 0 nuevas y 0 entradas obsoletas); `yarn quality:types` (68 históricas, 0 nuevas/obsoletas/duplicadas); `yarn quality:lint` (892 históricas, 0 nuevas/obsoletas/duplicadas); `yarn quality:typecheck` (0 errores); `yarn build`; `git diff --check`. No se modificaron baselines durante 3E.
- BC-ID-3F continúa pendiente para diseñar e implementar aperturas diarias diferenciadas `app`/`wiki` con contexto autorizado. Las decisiones futuras de SSO, sesiones persistentes de hasta 30 días, renovación, rotación y logout global siguen asignadas a BC-ID-4–8. No se declara completo el conjunto BC-ID-3.

### Decisiones pendientes y riesgos de BC-ID-3

- Confirmar consumidores externos adicionales de `/api/auth` y payloads del panel de admin mediante inventario/logs sin PII; el código confirma frontend y Wiki para login y frontend para gestión.
- Fijar zona de calendario de actividad (UTC recomendada para métricas) y política de retención antes de crear migración.
- Definir el esquema de `aud`/client binding de access tokens para atribuir `app`/`wiki` con confianza sin aceptar un parámetro de cliente. Esto debe ser compatible con SSO de una sesión compartida.
- Caracterizar si el campo `logins` del endpoint de actividad y los conteos de `lastLoginPerDay` deben conservar nombre/proyección o evolucionar aditivamente; las filas históricas no identifican app.
- No está disponible aquí un checkout local de `riffvalley-wiki` para volver a contrastar en esta ejecución; se conservan las observaciones de la auditoría BC-ID-1 del código Wiki. Verificar sus rutas/flujo de arranque al iniciar BC-ID-3F.

### Decisiones técnicas de tokens (detalle por concretar en BC-ID-4)

- Access token de vida corta con duración por decidir, firmado con algoritmo/issuer/audience y validación explícitos, claims mínimos (`sub`, `iss`, `aud`, `iat`, `exp`, opcional `jti`/versión). El `aud` o binding equivalente debe permitir al backend atribuir `app` frente a `wiki` aunque la sesión y el inicio de sesión sean compartidos. No incluir datos mutables innecesarios.
- Refresh token opaco, aleatorio y de un solo uso, persistido como hash con familia, expiración, emisión/último uso, usuario, sesión/dispositivo y estado de revocación. Rotación atómica en cada uso; reutilización de token consumido revoca familia y fuerza reautenticación. Definir retención/limpieza y política ante concurrencia.
- Revocación de la sesión compartida desde cualquiera de las aplicaciones y ante eventos de seguridad (reset de contraseña, desactivación, cambio sensible); decidir si access tokens ya emitidos se aceptan hasta expirar o se invalidan mediante versión/denylist.
- Logout global idempotente desde cualquiera de las dos aplicaciones; la semántica requerida es revocar la sesión compartida. Si se ofrece “cerrar solo este dispositivo”, será una capacidad adicional, no sustituto del logout global requerido.
- Evitar fijar storage sin decidir despliegues. Opción navegador: refresh en cookie `HttpOnly; Secure; SameSite` y access token solo en memoria. Requiere revisar dominios de frontend/API, `SameSite`, CORS con credenciales y CSRF (protección por token/origin/Fetch Metadata según topología). Alternativa: refresh token solo memoria reduce persistencia pero no sobrevive recarga; localStorage es simple pero deja refresh robable por XSS.
- SSO real entre frontend y Wiki es requisito decidido. La forma de establecer el origen de autenticación común (cookie/redirect u otro protocolo), CORS, CSRF y comunicación de cierre global depende de dominios reales y se define en el ADR; compartir credenciales o JWT emitidos por el mismo endpoint no satisface por sí solo SSO/logout compartido.

### Decisiones técnicas necesarias antes de contratos (BC-ID-4)

- Dominios/orígenes de producción y staging de API, frontend y Wiki; si son same-site, subdominios o sitios distintos; TLS, proxies y CORS actuales.
- Protocolo/técnica de SSO y persistencia del navegador; duración de access token, límite de inactividad dentro del máximo absoluto de 30 días y política de sesiones concurrentes.
- Cookie HttpOnly vs refresh en memoria/otra alternativa; defensa CSRF y XSS asumida; soporte para clientes no navegador si existe.
- Política de reset/confirmación de correo, enumeración de cuentas, expiración y rate limits; requisitos de política de contraseñas.
- Ventana de compatibilidad y despliegue coordinado backend/frontend/Wiki; estrategia ante JWT antiguos durante rollout y consumidores no identificados; propagación/observación del logout global entre las UIs.
- Algoritmo/gestión de claves, issuer/audience, observabilidad sin tokens, límites de intentos, revocación por contraseña/rol y retención de datos de sesión.

## Roadmap propuesto

Cada tarea debe conservar compatibilidad hasta que las tres piezas estén listas para el cambio correspondiente. Tamaños iniciales orientativos, a confirmar con decisiones y caracterizaciones.

### Saneamiento técnico (sin cambiar contratos)

| Tarea | Alcance y dependencias | Aceptación | Verificación | Tamaño |
|---|---|---|---|---|
| [x] BC-ID-1 — caracterización de contratos y permisos (completada 2026-10-21) | Caracterizar rutas/Auth, DTO/errores/payloads, identidad User y consumers directos; cubrir regresiones. Corrección limitada a serialización de password confirmada. | Inventario de contratos y expectativas backend/frontend/Wiki; guards y usuarios inválidos cubiertos; ningún hash de password en las dos respuestas PATCH. | 8 suites focales (218 tests), 2 suites de permisos frontend (8 tests), gates backend. | S |
| [x] BC-ID-2 — saneamiento TypeScript/ESLint de Identity (completada 2026-10-21) | Eliminar deuda de producción y tests con tipos concretos, narrowing y fixtures/mocks tipados; Prettier limitado a los archivos afectados. | Cero hallazgos actuales bajo `src/identity/`; comportamiento y contratos conservados; la infracción estructural histórica sigue registrada para una tarea estructural posterior. | 7 suites focalizadas (216 tests), gates de tipos, lint, typecheck, estructura, build y diff check. | S |
| [x] BC-ID-3A — diseño y ownership (completada 2026-10-21) | Diseño documentado en la sección anterior. | Owners y límites definidos; contratos preservados; cortes posteriores pendientes. | Enlaces revisados y `git diff --check`; solo documentación. | S |
| [x] BC-ID-3B — extraer Users (completada 2026-10-21) | Cuentas y perfiles en Users; Auth mantiene fachada. | Contratos existentes conservados. | Suite Identity y consumidores; gates completados según registro de 3B. | M |
| [x] BC-ID-3C — extraer Activity (completada 2026-10-21) | Logs históricos, actividad de usuarios y estadísticas de Rate en Activity; Auth delega. | Contratos existentes conservados y módulos sin ciclos. | Suites Identity/consumidores y gates registrados debajo. | M |
| [x] BC-ID-3D — Authorization (completada 2026-10-21) | Policy, roles, JWT strategy y guard en Authorization; los dominios dependen del módulo acotado. | Mismos permisos, claims, payloads y errores; dependencias sin ciclos. | 180 suites/1.752 tests; gates registrados en la sección de implementación; una infracción estructural histórica retirada. | M/L |
| [x] BC-ID-3E — Auth delgado (completada 2026-10-21) | Retirar responsabilidades migradas y dependencias residuales tras inventario de consumidores; mantener compatibilidad de AuthController. | Auth centrado en login, registro y JWT; Users/Activity poseen sus operaciones; contratos `/api/auth` conservados. | Suites Identity/Rates y consumidores; gates registrados en implementación 3E. | M |
| BC-ID-3F — aperturas app/wiki | Integrar señal autenticada de apertura en ambos clientes cuando exista endpoint y contexto app-scoped verificable; no contar refresh. | Una fila por usuario/fecha/app; ambas apps diferenciadas; anónimos y refresh excluidos; históricos sin atribución inventada. | Pruebas unitarias de stores/cliente y backend; migración aislada autorizada si aplica; contrato coordinado. | L |

### Seguridad de sesión (requiere decisiones y diseño contractual)

| Tarea | Alcance y dependencias | Aceptación | Verificación | Tamaño |
|---|---|---|---|---|
| BC-ID-4 — ADR técnico de sesión y SSO | Diseñar la realización técnica de SSO ya decidido, sesiones persistentes hasta 30 días, rotación, revocación global, storage, CSRF/CORS, dominios, amenazas y despliegue. Prerrequisito para BC-ID-5. | ADR aprobado con diagramas de login compartido/refresh/rotación/reutilización/logout global y responsabilidades de despliegue. | Revisión de amenazas y configuración por entorno sin credenciales reales. | M |
| BC-ID-5 — persistencia y servicio de refresh | Migración aditiva de tabla/sesión, hash refresh aleatorio, rotación transaccional, detección de reuso, expiración/limpieza y revocación. Depende de ADR y coordinación migración backend. | Tokens no se guardan en claro; doble refresh no produce dos sesiones válidas; revocar impide siguiente refresh; reglas de expiración definidas. | Tests aislados DB/migración según skill y entorno autorizado; unitarios de carrera/reuse; sin conectar servicios reales por defecto. | M |
| BC-ID-6 — endpoints y access tokens | Introducir emisión/refresh/logout revocable, JWT validation explícita y estrategia de convivencia con login actual. Depende de BC-ID-4/5. | Contrato nuevo versionado/aditivo; login antiguo no se elimina hasta migración; políticas de rate limit, errores y claims fijadas. | Unit/e2e aislados, validación de JWT y revocación; gates y pruebas de contrato. | M |

### Cambios contractuales y consumidores

| Tarea | Alcance y dependencias | Aceptación | Verificación | Tamaño |
|---|---|---|---|---|
| BC-ID-7 — cliente frontend | Cliente central con access token memoria, refresh seguro según ADR, single-flight/retry limitado, 401/403 diferenciados, restauración y logout sesión. Depende de endpoint backend disponible. | Reload/expiración/401/red/logout limpian y restauran estado según decisión; no loop de refresh; permisos UI no son autoridad. | Tests store/interceptor/router en Vitest y build/typecheck. | M |
| BC-ID-8 — cliente Wiki | Adaptar Fetch auth, restauración/expiración, permisos/errores, storage y logout al contrato aditivo de SSO/sesión compartida definido en BC-ID-4/6. | Wiki continúa funcionando durante transición; usa sesión compartida con frontend; no trata claims decodificados como autoridad del servidor; destino post-login conservado. | Tests/typecheck/build Wiki con stub local de API. | M |
| BC-ID-9 — retirada de compatibilidad antigua | Solo tras métricas y confirmación de backend/frontend/Wiki y otros consumidores. Retirar respuesta/token legacy o rutas si el ADR lo decide. | Cero consumers conocidos del contrato antiguo, rollback documentado, despliegue verificado en todos los orígenes. | Inventario de logs sin PII/token, smoke tests coordinados y gates de los tres repos. | S |
| BC-ID-10 — recuperación y ciclo de credenciales | Definir primero flujo/email/rate limit; tokens de reset de un uso y hash persistido o proveedor seleccionado; invalidar sesiones según decisión. | Respuestas anti-enumeración, token no reutilizable/expirado, cambio de password comprobado; UX integrada sin filtrar cuentas. | Tests de servicio/contrato y envío de correo mock; no enviar correo real durante tests. | M |

Dependencias principales: BC-ID-1/2 y diseño BC-ID-3A preceden refactors; BC-ID-3B–3E son extracción backend; 3F necesita contrato de Activity y contexto app-scoped, cuya forma se concreta en BC-ID-4–8. BC-ID-4 precede BC-ID-5/6; backend BC-ID-5/6 precede la migración coordinada de clientes 7/8; BC-ID-9 es el último paso y requiere evidencia de adopción. BC-ID-10 puede diseñarse tras las decisiones técnicas de seguridad y debe acordar revocación de sesiones.

## Verificación de BC-ID-1

`yarn test:unit --runInBand` sobre Auth controller/service/DTO/JwtStrategy, UserRoleGuard, autorización de mutaciones cross-domain, consumo de throttling y AccessRequests controller: 8 suites, 218 tests aprobados. Suites frontend existentes de permisos de importación y menú: 2 suites, 8 tests aprobados desde configuración temporal en `/tmp`, porque el checkout frontend es de solo lectura; ningún archivo del frontend se cambió. Wiki no tiene tests encontrados.

Gates solicitados aprobados: `yarn quality:typecheck` (0 errores), `yarn quality:types` (97 hallazgos históricos, 0 nuevos/obsoletos/duplicados), `yarn quality:lint` (904 diagnósticos históricos, 0 nuevos/obsoletos/duplicados), `yarn quality:structure` (40 módulos, 77 infracciones históricas, 0 nuevas/obsoletas), `yarn build` y `git diff --check`. No se ejecutaron E2E, migraciones ni PostgreSQL/servicios externos.

## Verificación de BC-ID-2

Se resolvieron los 29 hallazgos de tipado seguro de Identity: `explicit-any` (28) y `double-type-assertion` (1). Se resolvieron los 12 diagnósticos ESLint de Identity: `@typescript-eslint/ban-types` (7, usos de `Function`) y `@typescript-eslint/no-unused-vars` (5). Los cambios sustituyen tipos inseguros por mocks/fixtures y handlers tipados, narrowing de `unknown` en el manejo de errores de BD y eliminación de imports/variables sin uso; no modifican rutas, DTOs públicos, respuestas, JWT, roles ni guards. Se aplicó Prettier únicamente a los archivos de Identity afectados.

Baselines antes/después: type safety, 97 → 68 entradas globales (29 de Identity retiradas); ESLint, 904 → 892 (12 retiradas). Ambos gates terminaron con 0 hallazgos nuevos, obsoletos o duplicados. Typecheck: 0 errores/nuevos/obsoletos/duplicados. `yarn quality:structure`: 40 módulos, 77 infracciones históricas, 0 nuevas/obsoletas; permanece la infracción histórica `spec-outside-tests` de `src/identity/auth/guards/user-role/user-role.guard.spec.ts`, conservada fuera del alcance de BC-ID-2. Build y `git diff --check` aprobaron.

Pruebas focalizadas: `yarn test:unit --runInBand src/identity/auth` — 7 suites, 216 tests aprobados en BC-ID-2. BC-ID-3A–3E están completadas; BC-ID-3F y BC-ID-4–10 siguen pendientes.
