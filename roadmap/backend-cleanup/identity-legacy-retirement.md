# BC-ID-9 — Inventario y retirada de autenticación legacy

## Estado y alcance

**BC-ID-9.1 — Inventario y plan (documentación): completada, 2026-10-22.** No modifica código, pruebas, configuración de producción ni clientes.

**BC-ID-9.2 — Retirada de código y regresión: implementada y verificada en el checkout, 2026-10-22. Publicación y comprobación de producción pendientes. BC-ID-9 permanece abierta hasta validar esa publicación.** La release desplegada no fue modificada en esta tarea.

App y Wiki son los únicos consumidores del backend y ambos usan exclusivamente `refresh-v1`; no hay otros consumidores que investigar. Este plan cubre solo la compatibilidad de login antiguo y sus referencias. No es una auditoría general de Identity. Las sesiones existentes y nuevas deben seguir operativas durante cualquier publicación o rollback.

## Inventario

| Grupo | Elementos y decisión |
| --- | --- |
| **Eliminado en BC-ID-9.2** | La rama sin `X-Auth-Session-Mode` de `AuthController.login()` y la ruta de credenciales `AuthService.login()`. Esta era la compatibilidad de login legacy que App y Wiki ya no usaban. |
| **Eliminado en BC-ID-9.2** | `ActivityService.recordLoginAccess()` y su prueba focalizada: el único caller productivo era la rama legacy de `AuthController.login()`. Se conservaron la entidad/tabla `UserAccessLog` y las consultas históricas de actividad; no se borraron ni migraron filas. |
| **Eliminado en BC-ID-9.2** | Las expectativas/casos de login HTTP legacy en `auth-session-login.http.spec.ts`, `auth-session-protocol.postgres.integration.spec.ts` y las caracterizaciones de `AuthService.login()` en `auth.service.spec.ts`. Las pruebas renovables de esas suites permanecen. |
| **Actualizado en BC-ID-9.2** | Las afirmaciones operativas en `identity-session-contracts-and-rollout.md`, `identity-session-security.md` e `identity-session-http-topology.md`; sus registros históricos quedan contextualizados, no borrados. |
| **Conservar** | Las ramas `refresh-v1` de login, bootstrap CSRF, refresh y logout; emisión y borrado de cookies HttpOnly separadas para App/Wiki; rotación, revocación, JWT de acceso de 15 minutos, estrategia/validación Bearer, perfiles y control de estado/roles. Conservar `AUTH_SESSION_MODE_HEADER` y `AUTH_SESSION_MODE`: refresh/logout siguen negociando el protocolo mediante `X-Auth-Session-Mode: refresh-v1`. |
| **Conservar** | Validación de Origin y controles del edge, CORS credentialed y `X-Auth-Session-Mode` en la allowlist CORS, rate limiting, `JWT_SECRET`, `AUTH_SESSION_EDGE_SECRET` y configuración de origins/gate. Son dependencias de sesiones o de seguridad compartida, no exclusivas del login legacy. `AUTH_SESSION_EDGE_SECRET` está documentada en `.env.template`; `AUTH_SESSION_MODE_ENABLED`, `AUTH_SESSION_APP_ORIGIN` y `AUTH_SESSION_WIKI_ORIGIN` se leen en el código, aunque no figuran en ese template. No quitar ni renombrar estas variables en esta retirada. |
| **Adaptar** | El login HTTP deja de seleccionar una rama por ausencia o presencia del header: el endpoint conserva únicamente el camino `refresh-v1`, con sus validaciones de request, límites y respuesta actuales. Mantener el header para refresh/logout y no reinterpretar valores ausentes o desconocidos como autenticación alternativa. |
| **Adaptar** | `LoginUserDto` (`dto/login-user.dto.ts`) es compartido por login renovable; conservarlo. `JwtModule` fija expiración por defecto de 8 h y `AuthService.getJwtToken()` también se usa al registrar una cuenta (`AuthService.create()`), además de en el login antiguo. Mantener el pin de expiración de `auth.module.spec.ts` como protección del registro; no retirar ni cambiar ese TTL/helper como parte de BC-ID-9.2. El contrato de registro queda fuera de alcance. El JWT de sesión ya especifica `15m` explícitamente. |
| **Adaptar** | Conservar los guards, estrategia Bearer, roles/permisos, entidades y perfiles de Identity. No hay guards ni permisos exclusivos del flujo legacy. Revisar las pruebas mixtas para quitar solo la expectativa legacy; mantener las comprobaciones de refresh-v1, incluso en suites que también contenían una regresión legacy. |

### Referencias actuales de tests y documentación

Los tests del login legado están mezclados con las suites renovables de `src/identity/auth/__tests__/auth-session-login.http.spec.ts`, `auth.controller.spec.ts`, `auth.service.spec.ts` y `auth-session-protocol.postgres.integration.spec.ts`. La prueba de `ActivityService.recordLoginAccess()` está en `src/identity/activity/__tests__/activity.service.spec.ts`; quitar solo el escritor legacy y su prueba, preservando consultas agregadas e historial. `auth.module.spec.ts` fija el TTL predeterminado de 8 h que también protege el registro, por lo que debe permanecer. La suite HTTP de PostgreSQL es opt-in; su caso legacy no justifica activar PostgreSQL para esta retirada. Los tests de `session-auth-contract.dto.spec.ts` y `session-http-cors.spec.ts` prueban contratos compartidos: deben continuar comprobando `refresh-v1` y el header permitido.

Las referencias documentales con compromisos explícitos de mantener compatibilidad legacy aparecen en:

- `roadmap/backend-cleanup/identity-session-contracts-and-rollout.md`
- `roadmap/backend-cleanup/identity-session-security.md`
- `roadmap/backend-cleanup/identity-session-http-topology.md`

Actualizar solo las afirmaciones operativas vigentes que contradigan la retirada; no reescribir el historial de decisiones ni cambiar otros hallazgos.

## Subtareas

| ID | Tamaño | Objetivo y alcance | Dependencias | Criterios de aceptación | Verificaciones |
| --- | --- | --- | --- | --- | --- |
| **BC-ID-9.2 — Retirar login sin negociación** | **S — código y pruebas completados; publicación pendiente** | Quitar la rama no negociada de `AuthController.login()`, `AuthService.login()` y el writer exclusivo `ActivityService.recordLoginAccess()`. Eliminar y ajustar exclusivamente las pruebas que caracterizan esos caminos, conservando historial/consultas de `UserAccessLog`, el resto de las suites y el contrato del registro con JWT de 8 h. Corregir las afirmaciones operativas vigentes de los tres documentos referenciados arriba. No tocar App, Wiki, migraciones, Heroku ni configuración de producción. | BC-ID-9.1; BC-ID-7 y BC-ID-8 completadas y validadas en producción (confirmado por el solicitante). | En el checkout, login sin `refresh-v1` devuelve `503` y no emite token/cookie ni crea sesión; App/Wiki mantienen el contrato renovable. Rate limiting, Origin/edge, Bearer, roles y perfiles se preservan. Registro conserva respuesta/TTL; historial/consultas de actividad se retienen. Referencias activas corregidas. | `yarn test:unit --runInBand src/identity/auth src/identity/activity`: 17 suites y 317 tests pasaron; la suite HTTP PostgreSQL opt-in quedó omitida (10 tests), sin forzar guardas. `yarn verify`: aprobado, 202 suites y 1.942 tests pasaron, 75 omitidos, 2 snapshots aprobados; typecheck con 0 errores y ESLint 0 hallazgos nuevos. `git diff --check` y enlaces internos aprobados. Publicación/smoke test de App y Wiki quedan pendientes; no ejecutar migraciones. |

No se propone una subtarea para quitar `X-Auth-Session-Mode`, el TTL por defecto de 8 h, `JWT_SECRET` o variables de sesiones: todos tienen uso compartido o renovable confirmado. Tampoco se crean tareas para volver a investigar consumidores ni repetir las validaciones de BC-ID-7/8.

## Publicación y rollback

1. Publicar BC-ID-9.2 como cambio backend ordinario después de que pase su regresión local. No cambiar configuración, esquema ni clientes.
2. Tras publicar, comprobar con App y Wiki que login `refresh-v1`, refresh rotatorio y logout siguen respondiendo correctamente; verificar que la cookie de cada cliente conserva su aislamiento y que una llamada sin negociación ya no autentica. No registrar ni copiar credenciales/cookies durante el smoke check.
3. Si falla cualquier comprobación renovable, revertir la release del backend a la release inmediatamente anterior. Esa versión anterior conserva `refresh-v1`; no revertir clientes ni alterar sesiones, cookies o configuración. Repetir la comprobación renovable tras el rollback.

Este es un procedimiento documental: BC-ID-9.1 no publica ni revierte releases.
