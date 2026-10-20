# R.15b — Contrato de Auth y roles para frontend

**Estado:** Contrato completado. El frontend fue adaptado y desplegado en Netlify, confirmado manualmente por el usuario. El backend está desplegado en Heroku y PostgreSQL usa el rol singular; véase el [cierre de producción](production-deployment.md). La confirmación manual del despliegue frontend no se presenta como una comprobación independiente de este repositorio.

**Fuentes verificadas:** controllers, DTOs, servicios, entidad y estrategia de Auth actuales; [contrato jerárquico](contract.md); [auditoría actual de endpoints](endpoints-audit.md); [preflight de migración](migration-preflight.md). La tabla completa de 252 handlers permanece en la auditoría y no se duplica aquí.

## Estado de la transición

- **Refactorización funcional del backend:** completada en código y verificada en R.9–R.14; incluye rol singular, jerarquía central y autorización de los 252 handlers auditados.
- **Preparación de migración (R.15a):** completada para la preparación operativa local. El preflight del entorno destino y la ventana concreta siguen siendo propios de la ejecución.
- **Migración de PostgreSQL:** completada; esquema final `users.role` y postflight de producción documentados en el cierre enlazado.
- **Despliegue del backend:** completado en Heroku, release `v309`.
- **Adaptación del frontend:** completada y desplegada en Netlify según confirmación manual del usuario.
- **Alcance de comprobación:** autenticación básica verificada, incluido el rol recibido en la web. No se ejecutó una prueba completa de permisos con cuentas editoriales y administrativas.

## Contrato HTTP de Auth

La aplicación monta el prefijo global `/api`. Las rutas de Auth usan `/api/auth`. No existe `GET /api/auth/me` ni otro endpoint de identidad actual. `GET /api/auth/private` es una ruta de prueba protegida por `superadmin`, no un endpoint de perfil para todos los usuarios.

### Registro

`POST /api/auth/register` es público. El cuerpo aceptado por `CreateUserDto` es:

```json
{
  "email": "persona@example.com",
  "password": "Password1",
  "username": "persona",
  "image": "avatar.png",
  "dashboardConfig": [{ "id": "module-id", "enabled": true }],
  "mobileDashboardConfig": [{ "id": "module-id", "enabled": true }],
  "dashboardButtonsEnabled": false
}
```

Solo `email`, `password` y `username` son obligatorios. Los demás campos son opcionales; cada configuración es una lista de objetos `{ id: string, enabled: boolean }`. Las reglas de longitud/formato de contraseña y usuario están en `CreateUserDto`. `role`, `roles`, `isActive`, `notes`, `id` y demás campos no forman parte del cuerpo permitido; la validación global rechaza propiedades no declaradas. El servidor asigna `role: "user"`.

Respuesta: objeto de usuario recién creado más `token`. Incluye `id`, `email`, `username`, `role`, `createdAt` y los campos opcionales de perfil enviados; no incluye `password` ni `roles`. El JWT se firma con `{ username, id, role }` y expira a las 8 horas.

### Login

`POST /api/auth/login` es público. Cuerpo exacto:

```json
{ "username": "persona", "password": "Password1" }
```

La búsqueda de username no distingue mayúsculas. Respuesta: `{ id, username, role, image, dashboardConfig, mobileDashboardConfig, dashboardButtonsEnabled, token }` con campos de perfil posiblemente ausentes si no tienen valor. No incluye contraseña, email ni `roles`. `token` contiene el JWT de 8 horas, firmado con `{ username, id, role }`. Credenciales incorrectas producen `401`.

### JWT y transporte de sesión

El backend obtiene el JWT exclusivamente de `Authorization: Bearer <token>` mediante Passport. No hay cookie de sesión emitida por Auth, refresh token ni endpoint de renovación en el controller actual. El navegador puede conservar el token como decida el frontend; el repositorio backend no define ni permite verificar su almacenamiento, store, expiración local o restauración tras recargar.

El claim actual es singular:

```json
{
  "username": "persona",
  "id": "uuid",
  "role": "riffvalley",
  "iat": 0,
  "exp": 0
}
```

`iat` y `exp` son claims temporales añadidos por la librería JWT. El valor `role` del token puede quedar obsoleto durante una sesión: el backend no lo usa para decidir el mínimo de rol. `JwtStrategy` busca al usuario por `id` y rechaza usuarios inexistentes o inactivos; `UserRoleGuard` vuelve a leer `users.role` de PostgreSQL para cada ruta con mínimo. Por ello, un cambio de rol administrativo afecta la autorización de la siguiente petición, aunque el token siga vigente y su claim conserve el rol anterior. El cliente debe actualizar su representación de rol al recibir una respuesta confiable nueva o al volver a autenticar; el token no es autoridad definitiva.

### Usuario autenticado y perfil

No existe endpoint general para recuperar al usuario autenticado. `@GetUser()` solo expone el `req.user` a handlers protegidos; no crea una ruta HTTP. La entidad configura `email`, `password` y `role` con `select: false`. En consecuencia, el usuario devuelto por `JwtStrategy` no contiene necesariamente esos campos y la ruta de prueba no ofrece una fuente de rol para el frontend.

`PATCH /api/auth` requiere cualquier usuario autenticado y actualiza únicamente su propia cuenta. El body permite las propiedades opcionales de perfil `email`, `password`, `username`, `image`, `dashboardConfig`, `mobileDashboardConfig` y `dashboardButtonsEnabled`; no permite `role` ni `roles`. La respuesta es la entidad de la propia cuenta guardada, con los campos cargados y modificados por esta operación. Por la selección `select: false`, no debe esperarse que incluya `role` o `email` de forma uniforme. No usar esta respuesta como reemplazo de `/me` ni como contrato para conocer el rol vigente.

## Administración de usuarios

Todas las rutas siguientes usan bearer token y tienen mínimo `superadmin`, salvo `PATCH /api/auth`, ya descrita. `superadmin` debe estar activo y ser el rol persistido en PostgreSQL.

| Método y ruta                     | Petición                                                                                                            | Respuesta observada                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/auth/users`             | Sin body.                                                                                                           | Array de `{ id, username, email, role, createdAt, notes, isActive }`, ordenado por `createdAt` descendente.                                                                                                                                                |
| `GET /api/auth/usersRv`           | Sin body.                                                                                                           | Array de `{ id, username, email, role, image }` para roles `riffvalley` y `superadmin`. Lo consume la asignación editorial.                                                                                                                                |
| `GET /api/auth/users/role/:role`  | `role` debe ser un valor canónico singular.                                                                         | Array de `{ id, username, email, role, image }`; filtro por igualdad exacta, no por herencia. Valor inválido: `400`.                                                                                                                                       |
| `GET /api/auth/users/superusers`  | Sin body.                                                                                                           | Array de `{ id, username, email, role, image }` con `role: "superadmin"`. El path conserva el nombre histórico `superusers`.                                                                                                                               |
| `GET /api/auth/users/admin-stats` | Query basada en paginación; defaults `limit=10`, `offset=0`, `inactiveDays=7`; admite `notVotedDays`, `accessDays`. | `{ users: { totalItems, totalPages, currentPage, limit, data }, usersPerDay, lastLoginPerDay, neverAccessed, lastVotePerDay, inactiveVotersPerDay }`. Cada fila de `users.data` contiene `id, username, email, image, createdAt, lastLogin, lastVoteDate`. |
| `GET /api/auth/activity`          | Query de paginación; defaults `limit=20`, `offset=0`.                                                               | `{ totalItems, totalPages, currentPage, limit, data }`; cada elemento incluye rate y proyecciones reducidas `user: { id, username, image }`, `disc: { id, name }`.                                                                                         |
| `GET /api/auth/:id/activity`      | ID de usuario en path.                                                                                              | `{ votes, logins }`; votos ordenados por fecha descendente con disc relacionado y logins como `{ date }`.                                                                                                                                                  |
| `GET /api/auth/:id`               | ID de usuario en path.                                                                                              | Entidad de usuario obtenida sin relaciones explícitas. Por `select: false`, email, password y role pueden quedar fuera. No tratarlo como endpoint fiable para leer el rol actual.                                                                          |
| `PATCH /api/auth/superadmin/:id`  | Body parcial de perfil más opcionalmente `role`, `notes`, `createdAt`.                                              | Entidad guardada del usuario objetivo. El campo singular `role` se valida contra los cuatro valores canónicos; el conjunto exacto de campos devueltos depende de los campos cargados y actualizados.                                                       |
| `PATCH /api/auth/:id/deactivate`  | Sin body; el ID identifica la cuenta.                                                                               | Entidad guardada con `isActive: false`.                                                                                                                                                                                                                    |
| `PATCH /api/auth/:id/activate`    | Sin body; el ID identifica la cuenta.                                                                               | Entidad guardada con `isActive: true`.                                                                                                                                                                                                                     |
| `DELETE /api/auth/:id`            | Sin body; el ID identifica la cuenta.                                                                               | Resultado de `Repository.remove` para la entidad eliminada.                                                                                                                                                                                                |

El body administrativo puede incluir `email`, `password`, `username`, `image`, `dashboardConfig`, `mobileDashboardConfig`, `dashboardButtonsEnabled`, `role`, `notes` y `createdAt`. `role` acepta exactamente un string de `ValidRoles`. No se acepta `roles[]`; `role` tampoco es modificable en `PATCH /api/auth` ni en registro. El servicio comprueba además que el actor sea `superadmin` activo persistido antes de actualizar roles, activar/desactivar o borrar usuarios.

## Jerarquía y autorización

Los únicos valores canónicos son:

| Rol            | Nivel | Lectura funcional actual                                                           |
| -------------- | ----: | ---------------------------------------------------------------------------------- |
| `user`         |     0 | Cuenta estándar y base de permisos autenticados.                                   |
| `collaborator` |     1 | Hereda lo de `user`. **No dispone todavía de permisos editoriales adicionales.**   |
| `riffvalley`   |     2 | Hereda niveles inferiores y alcanza operaciones con mínimo editorial `riffvalley`. |
| `superadmin`   |     3 | Hereda todos los niveles y alcanza operaciones con mínimo `superadmin`.            |

Un nivel mínimo permite el acceso a ese rol y a todos los superiores. En los endpoints del backend actual, `@Auth()` exige un usuario autenticado y no compara rol. `@Auth(ValidRoles.riffvalley)` admite `riffvalley` y `superadmin`; `@Auth(ValidRoles.superadmin)` admite únicamente `superadmin`. No hay endpoints con mínimo `collaborator` en la auditoría actual.

La autenticación y autorización del backend son controles efectivos y se comprueban en cada petición. Ocultar menús, botones o rutas en Vue solo controla visibilidad y navegación; no concede ni reemplaza permisos del servidor. Para navegación: usar el nivel mínimo como regla de visibilidad, mantener `requiresAuth` para rutas de login y reflejar los `403` del backend como sesión sin permiso. Los guards frontend actuales no fueron auditados en este trabajo.

La jerarquía está centralizada en Auth. Un valor desconocido, antiguo o malformado no alcanza ningún mínimo y debe tratarse como no autorizado. `GET /users/role/:role` y las asignaciones administrativas rechazan valores fuera de la enumeración. La migración de filas ambiguas sigue cerrada por las reglas del preflight; la interfaz no debe mapear nombres legacy por su cuenta.

## Guía breve por capacidades

La auditoría de referencia contiene todos los paths y verbos: 252 handlers, **87 públicos**, **38 que requieren autenticación sin mínimo**, **99 con mínimo `riffvalley`** y **28 con mínimo `superadmin`**. Para construir navegación y controles:

- Público: no mostrarlo como protegido por rol. La lista completa está en [auditoría de endpoints](endpoints-audit.md).
- Autenticado: sesión válida para los 38 handlers `@Auth()`; las reglas de propiedad siguen aplicando donde corresponde.
- Editorial: `riffvalley` o `superadmin` para operaciones con mínimo `riffvalley`, incluidas Artist Management, herramientas editoriales y Kanban de playlists locales.
- Administración: solo `superadmin` para gestión de usuarios, versiones y operaciones con ese mínimo.
- `collaborator`: no habilitar capacidades editoriales nuevas por el mero nombre del rol; hoy solo hereda `@Auth()`.

El recuento conserva exactamente la clasificación final publicada por R.14f. Las rutas CRUD de playlists locales requieren ahora `riffvalley` en backend aunque el hallazgo documenta guards frontend que solo exigían login.

## Inventario orientativo para Vue

Este inventario describe lo conocido cuando se redactó el contrato backend, no una auditoría actual del repositorio frontend. El usuario confirma que la adaptación está desplegada en Netlify. No se revisó aquí el código frontend ni se ejecutaron pruebas completas con cuentas editoriales o administrativas.

| Área                               | Trabajo frontend previsto                                                                                            | Evidencia / estado                                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Store de autenticación             | Sustituir la lectura/modelo `roles[]` por `role: ValidRole`; evitar usar claims viejos como autorización.            | Adaptación frontend desplegada según confirmación manual; el detalle del código frontend queda fuera de este repositorio.                                                                              |
| Estado de sesión                   | Definir cuándo actualizar la copia del rol después de login, cambios administrativos o una nueva autenticación.      | La adaptación está desplegada según confirmación manual. El detalle del store no se inspeccionó en este cierre; no bloquea el roadmap funcional.                                                       |
| Guards del router                  | Resolver rangos de roles singulares y diferenciar login requerido de mínimo editorial/administrativo.                | `ArtistManagement` y Kanban de playlists locales permiten actualmente cualquier sesión autenticada, pero las escrituras backend exigen `riffvalley`; alinear esos guards. Referencia: auditoría R.14f. |
| Menús y navegación                 | Aplicar los mismos mínimos que los handlers para no mostrar acciones que recibirán `403`.                            | La comprobación completa queda como observación; la visibilidad sigue sin ser seguridad.                                                                                                               |
| Gestión de usuarios                | Cambiar modelos y formularios de multirol a un único rol; usar endpoints administrativos actuales.                   | Adaptación frontend desplegada según confirmación manual; no se hizo inventario independiente de componentes en este backend.                                                                          |
| Selectores editoriales             | Consumir `GET /api/auth/usersRv` como selección de cuentas `riffvalley` y `superadmin`; interpretar `role` singular. | Consumidor confirmado en asignación editorial; respuesta incluye `id, username, email, role, image`.                                                                                                   |
| Kanban administrativo de versiones | Cambiar listas/filtros a `role: superadmin` y guardar sesión/claims singulares.                                      | `GET /api/auth/users/superusers` se usa en Kanban administrativo de versiones, según R.14e.                                                                                                            |
| Formularios de administración      | Enviar `role` string al `PATCH /api/auth/superadmin/:id`; retirar `roles[]` y aliases legacy.                        | Rutas y DTO actuales comprobados en backend; frontend reportado como adaptado y desplegado por el usuario.                                                                                             |
| Tipos, DTOs y servicios HTTP       | Tipar valores canónicos; actualizar request/response de registro, login, perfil y administración; enviar Bearer.     | Backend comprobado. Ubicaciones frontend no inspeccionadas.                                                                                                                                            |
| Tests                              | Actualizar fixtures, login/store/guards, roles desconocidos, herencia, visibilidad y estados `401`/`403`.            | Autenticación básica, incluido el rol recibido en web, confirmada por el usuario. No se ejecutaron pruebas completas con cuentas editoriales y administrativas.                                        |

## Compatibilidad y secuencia de adopción

El contrato actual de backend y PostgreSQL usa `role` singular. El estado final del esquema y su ledger están registrados en [P.3.6](production-deployment.md). Los párrafos que describían `users.roles` en producción son contexto histórico del preflight.

La secuencia de adopción documentada fue: preflight y backup; corte manual; validación de esquema/datos; despliegue del backend singular y adaptación frontend. Se ejecutó y cerró en P.3.5/P.3.6. Esta guía se conserva como referencia histórica, no como trabajo pendiente.

Durante un máximo de 8 horas desde su emisión, un JWT previo puede conservar el claim antiguo `roles[]`. La estrategia necesita `id` para recuperar al usuario y actualmente ignora el claim de rol; el guard de nivel lee PostgreSQL. Por tanto, claims antiguos no otorgan privilegios, aunque una cuenta sin usuario existente o inactiva se rechaza. El cliente debe prever que un frontend viejo que lea solo `roles[]` no reconocerá el nuevo contrato y que el backend singular no ofrece compatibilidad dual.

## Diferencias y límites documentales

- El bullet de roles en el `AGENTS.md` raíz aún enumera `admin`, `superUser`, `user`, `riffValley`; no coincide con el código actual (`ValidRoles` singular). Se conserva aquí la fuente de verdad pedida: código actual y jerarquía aprobada en el roadmap.
- Las tablas orientativas describen la información recopilada en el backend; no constituyen una auditoría independiente del repositorio frontend. El estado final está resumido al inicio y las comprobaciones no ejecutadas permanecen como observaciones.
- No se encontró ni se presupone `/auth/me`, refresh token, cookie de sesión ni una forma de almacenamiento del token en Vue.
- Los consumidores `ArtistManagement`, Kanban de playlists, asignación editorial y Kanban de versiones proceden de la auditoría previa; los demás consumidores Vue, archivos, tipos y pruebas requieren una inspección posterior del repositorio frontend.

## Cierre de R.15b

R.15b queda completada: están documentados el contrato Auth singular, la jerarquía, la fuente real de autorización, las rutas y respuestas relevantes, la secuencia de corte y los riesgos de compatibilidad. El frontend está adaptado y desplegado según confirmación manual del usuario; el cierre de backend/PostgreSQL está documentado en P.3.5/P.3.6. La validación amplia de permisos editoriales y administrativos no se ejecutó y no bloquea el roadmap.
