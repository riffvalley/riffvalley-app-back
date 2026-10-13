# Roadmap de roles de usuario

**Estado final: roadmap funcional de roles completado.** El backend está migrado y desplegado en Heroku; el frontend está adaptado y desplegado en Netlify, confirmado manualmente por el usuario. PostgreSQL usa `users.role`. La comprobación básica de autenticación incluyó verificar el rol recibido en la web. Las pruebas completas de permisos con cuentas editoriales y administrativas no se ejecutaron; quedan como observación de cobertura, no como fase pendiente.

Este documento conserva el historial de la refactorización y su adaptación al contrato jerárquico aprobado el 2026-10-13. Las notas anteriores que dicen que el corte remoto, el despliegue o la adaptación frontend están pendientes son fotografías históricas y quedan supersedidas por el cierre final de [producción](roles-production-deployment.md) y de [frontend](roles-frontend-contract.md). R.5c, R.7 y R.8 anteriores quedaron reemplazadas por R.9–R.15.

El contrato y su adopción frontend están documentados en [R.15b](roles-frontend-contract.md). Los resultados finales de producción están en [cierre de despliegue](roles-production-deployment.md). Las menciones posteriores a “pendiente” en las tareas históricas describen su fecha de redacción, no el estado actual.

## Contrato objetivo

El backend utilizará exclusivamente un rol por usuario, almacenado como `role: ValidRoles`:

| Rol            | Significado objetivo                                                |
| -------------- | ------------------------------------------------------------------- |
| `user`         | Usuario estándar; destino aprobado de `babyUser`.                   |
| `collaborator` | Colaborador; hereda los permisos de `user`.                         |
| `riffvalley`   | Miembro del equipo Riff Valley; hereda los permisos inferiores.     |
| `superadmin`   | Administrador; hereda todos los permisos de los niveles inferiores. |

Jerarquía: `user < collaborator < riffvalley < superadmin`. Cada endpoint role-gated declara un nivel mínimo; el núcleo de Auth evalúa la jerarquía una sola vez. `@Auth()` exige autenticación y no filtra por rol. Se elimina definitivamente `roles: string[]`; no habrá compatibilidad múltiple ni jerarquías duplicadas en módulos o servicios.

## Reglas de ejecución vigentes

- Preservar rutas públicas, autenticación y comprobaciones de propiedad; cada endpoint role-gated declara un único mínimo y la jerarquía vive solo en Auth.
- Mantener una sola fuente de rol por usuario: campo `role`, respuesta y JWT singulares. No implementar coexistencia de `roles[]` y `role` ni compatibilidad dual.
- Aplicar exclusivamente las correspondencias aprobadas. `admin` y el antiguo `user` no crean un rol por sí solos; desconocidos o filas ambiguas bloquean la migración.
- Confirmar el esquema y el registro de migraciones de cada entorno antes de definir la edición in-place o una nueva migración.
- No modificar frontend en esta ola. Documentar primero el claim singular y el corte de despliegue para su adaptación posterior.

## Comprobaciones del corte completadas

Se confirmó el ledger de producción, la población y el destino de los roles; se obtuvo y conservó el backup `b008`; se coordinó el deploy y la migración, y se verificaron esquema y API. Las tareas abajo conservan sus planes originales, no una lista de trabajo pendiente. Las pruebas completas de permisos con cuentas editoriales y administrativas no se ejecutaron y quedan como observación adicional.

## R.1 — Inventario de roles y autorizaciones

- **Estado:** Completada (2026-10-13). Inventario, matriz actual de endpoints, resultados de PostgreSQL, riesgos y decisiones para R.2: [Inventario R.1](roles-inventory.md).
- **Objetivo:** obtener un mapa verificable de los nombres de rol, sus fuentes de verdad y los permisos efectivos antes de decidir conversiones.
- **Alcance:** localizar definiciones y tipos, validadores, decoradores, guards, controllers, servicios y consultas; entidades y columnas; DTOs; creación y actualización de cuentas; login, estrategia y claims JWT; administración, seeds, fixtures y tests; y referencias literales a roles. Registrar cada uso por capacidad y método HTTP. Identificar por separado las autorizaciones que actualmente requieren el antiguo `user` y los consumidores de `roles: string[]`.
- **Fuera de alcance:** editar implementación, datos, tests o configuración; decidir equivalencias no respaldadas por evidencia.
- **Dependencias:** ninguna.
- **Criterios de aceptación:** inventario con ubicación y comportamiento de cada uso funcional; permisos actuales agrupados por capacidad y rol; consumidores de emisión/lectura de roles identificados; casos sin cobertura o con semántica ambigua marcados como pendientes, incluyendo las cuentas `admin` y el rol antiguo `user`.
- **Verificaciones:** búsquedas de referencias y revisión de definiciones, módulos, rutas, DTOs, estrategia JWT, persistencia, seeds y tests; contrastar referencias literales con usos funcionales para distinguir documentación o datos históricos.
- **Tamaño estimado:** M.

## R.2 — Contrato y matriz de permisos

- **Estado:** Contrato completado y desplegado conforme al modelo singular. La matriz vigente por nivel mínimo está en [Contrato jerárquico](roles-contract.md); el diseño multirol descrito en esta subtarea es histórico.
- **Objetivo:** acordar el significado y los permisos de los cuatro roles usando la evidencia de R.1.
- **Alcance:** elaborar una matriz rol × capacidad/ruta que muestre acceso permitido, denegado o pendiente de decisión para el comportamiento actual y el objetivo; documentar las decisiones funcionales pendientes enumeradas arriba que afecten a usuarios existentes, especialmente el antiguo `user`, `admin` y el nuevo `collaborator`.
- **Fuera de alcance:** asignar permisos por intuición, crear jerarquías, cambiar autorización o modificar el frontend.
- **Dependencias:** R.1.
- **Criterios de aceptación:** matriz revisable que cubre las autorizaciones encontradas; los cuatro nombres objetivo y `roles: string[]` quedan fijados; cada diferencia entre permisos actuales y objetivo tiene decisión y justificación; ningún permiso de `collaborator` queda supuesto; las reglas para combinación, datos ambiguos y claims antiguos quedan resueltas o bloquean expresamente las subtareas dependientes.
- **Verificaciones:** cotejar matriz contra cada uso de R.1, rutas y pruebas de autorización disponibles; revisión de que no exista herencia implícita ni conversión automática ambigua.
- **Tamaño estimado:** M. El volumen de autorizaciones está repartido entre once dominios, pero la decisión permanece acotada a acordar la matriz y resolver los casos ambiguos documentados en R.1.

## R.3 — Modelo y autorización central

- **Estado:** Completada bajo el contrato singular mediante R.10–R.14; la implementación multirol que describe esta subtarea es histórica.
- **Objetivo:** introducir los nombres objetivo en la fuente central de roles y en los mecanismos comunes de validación y autorización.
- **Alcance:** actualizar enum/tipos, validación de roles, decoradores y guards identificados en R.1, de acuerdo con la matriz aprobada en R.2; preservar autenticación, extracción del usuario, emisión/verificación JWT y el arreglo de roles. Caracterizar antes la semántica común de autorización y añadir cobertura focalizada para roles permitidos y denegados.
- **Fuera de alcance:** asignar permisos de `collaborator` sin decisión; convertir el modelo a rol único; modificar consumidores específicos de módulos que correspondan a R.4; cambiar datos persistidos.
- **Dependencias:** R.1 y R.2. No se mantienen alias legacy en el enum porque el contrato central debe exponer solo los cuatro valores finales. Por ello, el cambio aislado no compila con todos los consumidores: R.4 y las rutas Auth de R.6 deben actualizarse antes de obtener una compilación integrada; R.5/migración no debe desplegarse con consumidores sin adaptar.
- **Criterios de aceptación:** el núcleo usa los cuatro nombres canónicos; guards aplican la matriz sin jerarquías nuevas; `roles: string[]` y la lectura de PostgreSQL se conservan; pruebas focalizadas cubren acceso permitido, denegado, desconocidos y cuentas sin rol válido. La aceptación integrada requiere resolver todos los consumidores señalados antes de compilar/desplegar.
- **Verificaciones:** `yarn --ignore-engines test src/auth/guards/user-role/user-role.guard.spec.ts --runInBand` (13/13 pasa). `yarn --ignore-engines run tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` informa 130 errores `TS2339`/`TS2551` por miembros eliminados en consumidores pendientes: 116 en dominios de R.4 y 14 en `src/auth/auth.controller.ts`, cuyas operaciones administrativas corresponden a R.6. No se cambiaron esos consumidores ni se añadieron equivalencias.
- **Tamaño estimado:** M.

## R.4 — Autorizaciones de módulos

- **Estado:** Completada bajo el contrato singular mediante R.11a–R.11f; los resultados de allowlists multirol de esta subtarea son históricos.
- **Objetivo:** adaptar todos los consumidores específicos del backend a la matriz acordada, por incrementos que puedan revisarse y desplegarse.
- **Alcance:** reemplazar los nombres legacy en controllers, servicios, consultas, DTOs u otros consumidores localizados por R.1; ajustar las pruebas de cada capacidad y respetar decisiones explícitas de R.2. Aplicar los seis incrementos identificados en R.1; `collaborator` permanece fuera de las allowlists hasta que se decida su alcance por funcionalidad.
- **Fuera de alcance:** inventar permisos, refactorizar lógica ajena a autorización, cambiar contratos no aprobados o modificar frontend.
- **Dependencias:** R.1, R.2 y R.3; cada bloque depende además de las decisiones de permisos correspondientes.
- **Criterios de aceptación:** cada consumidor inventariado tiene dueño/subtarea; permisos efectivos coinciden con la matriz; cada dominio puede verificarse de forma focalizada; ningún rol retirado queda como autorización funcional activa.
- **Verificaciones:** suites de cada dominio con Yarn; revisar rutas y metadatos de roles; búsquedas de nombres antiguos clasificando coincidencias en código funcional, migraciones, documentación o fixtures históricos.
- **Tamaño estimado:** seis incrementos independientes S/M; el detalle propuesto tras R.1 es:
  - **R.4.1 — Catalog e imports (M):** Completada (2026-10-13). `catalog/artists` y los imports manual/Excel usan solo `riffvalley` y `superadmin` según la matriz; no se concede `collaborator`. Las pruebas focalizadas pasan (18/18). El typecheck `noEmit` baja de 130 a 118 errores: quedan 14 en Auth (R.6) y 104 en los demás incrementos de R.4 — Requests (12), Festival/Genre Playlists (45), Last.fm (2), National Releases (11), News (6), Suggestions (14), Telegram (3), TikTok (9) y Uploads (2). No quedan errores TypeScript en Catalog/imports.
  - **R.4.2 / R.4b — Requests (S):** Completada (2026-10-13). Las seis rutas protegidas por rol admiten únicamente `riffvalley`; se retiró `admin` sin sustituirlo y no se añadió `collaborator`. Las rutas `POST /requests` y `GET /requests/my` conservan `@Auth()` sin filtro de rol. Tests focalizados pasan (5/5); typecheck: 106 errores restantes, cero en Requests (92 en otros dominios de R.4 y 14 en Auth/R.6).
  - **R.4.3 / R.4c — Suggestions (S):** Completada (2026-10-13). Las siete rutas de gestión admiten solo `riffvalley`; se elimina `admin` sin reemplazo y no se agrega `collaborator`. `POST /suggestions`, `GET /suggestions/my` y `PATCH /suggestions/:id` mantienen autenticación sin filtro de rol. Pruebas focalizadas pasan (2/2); typecheck: 92 errores restantes, cero en Suggestions (78 en otros dominios de R.4 y 14 en Auth/R.6).
  - **R.4.4 / R.4d — News y National Releases (M):** Completada (2026-10-13). News limita sus tres mutaciones a `superadmin`; National Releases limita sus seis rutas ya protegidas por rol a `riffvalley`. Las lecturas públicas y la creación general con throttling conservan su acceso. No se concede `collaborator`. Tests focalizados pasan (4/4); typecheck: 75 errores restantes, cero en estos módulos (61 en otros dominios de R.4 y 14 en Auth/R.6).
  - **R.4.5 / R.4e — Integraciones y operaciones (S):** Completada (2026-10-13). Uploads `POST /uploads/image` y Last.fm `POST /lastfm/fill-images` admiten solo `superadmin`; Telegram `GET /telegram/channel-posts` y las tres operaciones de conexión TikTok admiten `superadmin` o `riffvalley`. Se conserva el endpoint público `GET /telegram/posts`, las lecturas públicas de Last.fm/TikTok y el callback OAuth; el antiguo `user` no se convierte en `collaborator`. Tests focalizados pasan (6/6); typecheck: 59 errores restantes, cero en integraciones (45 en Festival/Genre Playlists y 14 en Auth/R.6).
  - **R.4.6 / R.4f — Festival y Genre Playlists (M):** Completada (2026-10-13). Las 14 rutas de Festival Playlists y las 12 de Genre Playlists admiten únicamente `superadmin` o `riffvalley`; se retiró `admin` sin reemplazo y no se agregó `collaborator`. `GET /festival-playlists/artists/top-songs` mantiene autenticación sin filtro de rol y el callback OAuth de Spotify sigue público. Pruebas focalizadas: 25/25; typecheck: permanecen solo los 14 errores conocidos de Auth/R.6 y ninguno de R.4.
  - Los ocho endpoints de administración Auth y las consultas de usuarios permanecen en R.6; no se duplican en estos incrementos.

## R.5 — Migración de datos

- **Estado:** Completada mediante R.13–R.15. La migración singular se aplicó en PostgreSQL local y producción, con backups y postflight registrados; R.5a–R.5c conservan el plan previo.
- **Desglose histórico:** R.5a–R.5c conservan el diseño anterior; la ejecución efectiva queda en R.13–R.15 y en el cierre de producción.
- **Objetivo:** diseñar y aplicar mediante una migración explícita una transición segura de los roles persistidos en PostgreSQL.
- **Alcance:** usar el esquema documentado por R.1 y ejecutar un preflight de la base objetivo para verificar población y formato reales; definir conversión y reversión según R.2; contemplar roles acumulados, duplicados, valores desconocidos, cuentas con `admin`, nombres antiguos y cuentas sin roles canónicos. Definir el orden de versiones/despliegue para que aplicación, JWT y datos no queden en estados incompatibles.
- **Fuera de alcance:** asumir que basta con reemplazar cadenas, descartar valores desconocidos, convertir `admin` a `superadmin` sin decisión, o convertir el antiguo `user` en `collaborator` automáticamente.
- **Dependencias:** R.1 para el esquema y perfiles reales; R.2 para reglas de mapeo; coordinar con R.3/R.4 y cerrar las escrituras de roles de R.6 para fijar un orden de despliegue compatible. La aplicación de producción espera a un backend integrado y compilable.
- **Criterios de aceptación:** plan documenta precondiciones, respaldo/recuperación, mapeo explícito, comportamiento ante duplicados/desconocidos, validación posterior y reversión; no se pierden roles o privilegios en escenarios ambiguos; la migración coincide con el esquema real y permite un despliegue ordenado; la aplicación puede operar durante cada etapa definida.
- **Verificaciones:** pruebas de migración con combinaciones representativas y casos límite; comprobar estado previo y posterior, idempotencia según convención local y reversión si resulta viable; revisión del SQL frente al esquema y estrategia de despliegue aprobados. No ejecutar contra producción como parte de la planificación.
- **Tamaño estimado:** L en conjunto; R.5a S, R.5b M y R.5c M. La base local tiene 190 cuentas `babyUser`, 7 cuentas con el antiguo `user` y varias combinaciones de tres roles con distinto orden. R.5a encontró además que no hay backend dual-read desplegable y que `migrationsRun: true` requiere controlar el corte/runner. El detalle y evidencia local están en [Preflight de migración R.5a](roles-migration-preflight.md).
  - **R.5a — Preflight de migración (S):** Completada para desarrollo local (2026-10-13) y producción (2026-10-14). Los resultados de producción se resumen en [P.3.5/P.3.6](roles-production-deployment.md); esta nota conserva la fotografía local de 198 cuentas y sus roles legacy. [Informe R.5a](roles-migration-preflight.md).
  - **R.5b — Migración reversible y pruebas (M):** Implementada y probada (2026-10-13), no ejecutada en bases persistentes según el contexto disponible. `MigrateCanonicalUserRoles1791910000000` transforma arrays a arrays, por lo que queda supersedida por la migración de rol único de R.13. Su snapshot y pruebas sirven de referencia, no de implementación final. Detalle histórico: [Preflight e implementación R.5b](roles-migration-preflight.md).
  - **R.5c — Corte anterior (M):** Sustituida por R.15; el corte efectivo está completado y registrado en P.3.5/P.3.6.

## R.6 — Registro, login y administración

- **Estado:** Completada para el contrato singular en R.12. El estado multirol previo descrito aquí queda como historial.
- **Objetivo:** verificar que los flujos de alta, login y administración crean, validan, modifican y exponen los roles acordados.
- **Alcance:** revisar registro/creación de usuarios, actualización administrativa de roles, validaciones y DTOs, login y JWT, respuestas de autenticación, listados/detalles administrativos y las operaciones identificadas por R.1. Ajustar solo lo necesario para cumplir la matriz y el contrato aprobado.
- **Fuera de alcance:** cambios de producto no relacionados con roles o cambios no aprobados en payloads de autenticación/administración.
- **Dependencias:** R.2–R.4 para implementación; coordinar cambios de escritura con R.5b y disponer de Auth integrado antes de R.5c. El orden de despliegue debe evitar que la migración se ejecute con instancias legacy activas.
- **Criterios de aceptación:** registro asigna `user` en servidor y no acepta roles enviados por el cliente; perfil propio no modifica roles; solo `superadmin` puede asignar/modificar roles, con validación en controller/DTO y servicio; altas y ediciones conservan `roles: string[]`; login, claims y respuestas son coherentes; no se conceden permisos adicionales por defecto.
- **Verificaciones:** pruebas focalizadas de registro, login, JWT y CRUD administrativo; confirmar DTOs, validaciones y payloads frente al contrato vigente y aprobado.
- **Tamaño estimado:** M. El alcance comprobado se concentra en ocho endpoints protegidos por roles, límites de DTO/servicio para registro y perfil, y consultas públicas de usuarios.

## R.7 — Pruebas y regresión

- **Estado:** Completada mediante R.14. Como observación, no se ejecutaron pruebas completas de permisos con cuentas editoriales y administrativas.
- **Objetivo:** demostrar que la matriz y migración se cumplen y que los nombres retirados no conservan comportamiento funcional.
- **Alcance:** completar cobertura unitaria, integración y de migración para roles permitidos/denegados, ausencia de rol, acumulación de roles, datos límite de migración y administración; revisar todos los usos encontrados por R.1.
- **Fuera de alcance:** cambios de permisos sin decisión, arreglos ajenos a roles o actualización del repositorio frontend.
- **Dependencias:** R.3–R.6.
- **Criterios de aceptación:** regresión focalizada pasa; casos de acceso por rol y combinaciones reflejan la matriz; migración y rollback definidos quedan cubiertos al nivel que permita el entorno; búsqueda final no encuentra referencias funcionales activas a `admin`, `superUser`, `riffValley` o `babyUser`, ni usos del `user` antiguo sin clasificación. Coincidencias históricas o de compatibilidad quedan justificadas y acotadas.
- **Verificaciones:** suites aplicables con Yarn; migración en base de pruebas disponible; build/typecheck con Yarn según scripts reales; búsqueda final de referencias y `git diff --check`.
- **Tamaño estimado:** L, por la regresión distribuida entre 67 endpoints role-gated, 38 autenticados sin filtro de rol y escenarios de migración.

## R.8 — Cierre del backend y contrato para frontend

- **Estado:** Completada mediante R.15; backend y PostgreSQL desplegados/migrados, frontend adaptado y desplegado según confirmación manual del usuario.
- **Objetivo:** cerrar la refactorización backend y dejar al frontend un contrato y una secuencia de adopción inequívocos.
- **Alcance:** revisar el resultado integral, referencias, rutas protegidas, persistencia, JWT y endpoints administrativos; documentar nombres de roles, claims/respuestas afectados, incompatibilidades y orden recomendado de despliegue backend/frontend; registrar decisiones que requieran coordinación.
- **Fuera de alcance:** modificar el repositorio frontend, iniciar una migración de contrato no aprobada o añadir endpoints/versiones alternativas.
- **Dependencias:** R.7 y todas las subtareas anteriores; requiere que las decisiones funcionales pendientes estén resueltas o documentadas con su efecto explícito.
- **Criterios de aceptación:** backend completo verificado; no quedan referencias funcionales sin resolver; el contrato frontend identifica campos/claims, nombres definitivos, impacto de tokens anteriores y orden de despliegue; incompatibilidades y consumidores pendientes se comunican sin adaptar frontend en esta tarea.
- **Verificaciones:** suites y build/typecheck backend con Yarn; búsqueda final de nombres legacy; revisión de documentación de contrato y secuencia; `git diff --check`.
- **Tamaño estimado:** S.

## Nueva ola — adaptación al rol único jerárquico

Los planes detallados de esta ola describen la ejecución histórica. R.9–R.15 están completadas; su evidencia y observaciones se conservan en cada sección. No quedan fases funcionales obligatorias abiertas.

### R.9 — Contrato y matriz de niveles mínimos

- **Estado:** Completada documentalmente (2026-10-13). La jerarquía aprobada y los 67 mínimos están registrados en [Contrato jerárquico](roles-contract.md); no se modificó código.
- **Objetivo:** convertir la matriz de allowlists anterior a una matriz de nivel mínimo y describir la herencia por nivel.
- **Alcance:** conservar las rutas y métodos, identificar el mínimo de cada uno de los 67 endpoints, declarar qué roles resultan admitidos por herencia y mantener las rutas públicas y `@Auth()` separadas.
- **Dependencias:** decisión de arquitectura aprobada por el usuario; evidencia histórica de R.1/R.2/R.4.
- **Criterios de aceptación:** cada endpoint tiene un mínimo único; `superadmin` hereda de `riffvalley`, `collaborator` de `user`; las allowlists/decisiones de matriz anteriores quedan marcadas históricas y no hay grants especiales dispersos.
- **Verificaciones:** cotejar las 67 filas con el contrato anterior; validar la expansión matemática de mínimos a roles permitidos; revisar rutas públicas y autenticadas sin filtro.
- **Tamaño:** S.

### R.10 — Entidad y autorización central de rol único

- **Estado:** Completada e integrada con R.11 y R.12.
- **Objetivo:** sustituir el modelo central de arrays por `User.role: ValidRoles` y aplicar la jerarquía una sola vez en Auth.
- **Alcance:** adaptar entidad/tipos, enum, decoradores, metadatos, `UserRoleGuard`, `JwtPayload` y tests centrales. `@Auth()` mantiene solo autenticación; `@Auth(minimum)` evalúa un único mínimo y admite todos los niveles iguales o superiores. PostgreSQL sigue siendo autoridad y desconocidos deniegan acceso.
- **Fuera de alcance:** cambiar mínimos de endpoints de dominio (R.11), DTO/operaciones de Auth (R.12), schema/data migration (R.13) o frontend.
- **Dependencias:** R.9. La integración/despliegue se difiere hasta completar R.11–R.14; no añadir un campo de compatibilidad `roles`.
- **Criterios de aceptación:** una sola función de rango/resolución en Auth; entity, guard y claim usan el valor singular; pruebas cubren cada mínimo y herencia, no herencia inversa, desconocido y sin rol; no quedan tipos centrales de `roles: string[]`.
- **Verificaciones:** `yarn --ignore-engines test src/auth/guards/user-role/user-role.guard.spec.ts --runInBand` pasa (43/43). Prettier y `git diff --check` pasan. `yarn --ignore-engines run tsc --noEmit --incremental false -p tsconfig.build.json --pretty false` informa 31 errores de consumidores pendientes: 10 en `src/auth/auth.service.ts` (R.12: entidad, selección, respuesta/JWT, filtros y autorización administrativa todavía usan `roles[]`) y 21 por llamadas multiargumento al decorador en `catalog/import/excel`, `festival-playlists`, `genre-playlists`, `telegram` y `tiktok` (R.11). La suite `auth.controller.spec.ts` no puede ejecutarse con ts-jest porque importar `AuthController` compila `AuthService` y falla por esos diagnósticos de R.12. No se cambiaron esos consumidores.
- **Tamaño:** M.

### R.11 — Consumidores de módulos por nivel mínimo

- **Estado:** Completada (R.11a–R.11f).
- **Objetivo:** expresar en controllers cada autorización de dominio como un mínimo único del contrato R.9.
- **Alcance:** sustituir argumentos de múltiples roles por el mínimo aprobado; conservar `@Auth()` y las rutas públicas; dejar propiedad y reglas de negocio independientes intactas; eliminar comprobaciones de strings de rol en servicios o consultas y centralizarlas en Auth cuando existan.
- **Dependencias:** R.9 para la matriz; coordinar integración con R.10. Cada incremento puede revisarse por separado, pero no desplegarse antes de tener la jerarquía central y la migración completas.
- **Criterios de aceptación:** cada endpoint conserva método/path y su mínimo coincide con la matriz; los niveles superiores heredan mediante el guard central; no hay arrays de roles ni jerarquías/comparaciones copiadas en módulos.
- **Verificaciones:** tests focalizados de cada incremento, revisión de metadatos HTTP y búsqueda de usos funcionales de `roles` en el dominio.
- **Desglose:**
  - **R.11a — Catalog e imports (S):** Completada (2026-10-13). `DELETE /artists/orphans/all`, `DELETE /artists/:id` y ambas rutas Excel declaran solo `riffvalley`; `POST /catalog/import/manual` declara solo `superadmin`. Las pruebas verifican que `superadmin` accede a Artists y Excel por herencia, sin enumerarlo en esos decoradores. Pruebas focalizadas: 20/20; Prettier y `git diff --check` pasan. El typecheck baja de 31 a 29 errores: Excel queda sin diagnósticos; persisten 10 en `src/auth/auth.service.ts` (R.12), 14 en Festival Playlists, 1 en Genre Playlists, 1 en Telegram y 3 en TikTok (R.11b–R.11f).
  - **R.11b — Requests y Suggestions (XS):** Completada (2026-10-13). Requests mantiene mínimo `riffvalley` en listado, lectura individual y cinco operaciones de moderación; Suggestions lo mantiene en listado, lectura individual y cinco operaciones de gestión. `superadmin` supera ambos mínimos mediante `roleMeetsMinimum`; `user` y `collaborator` quedan por debajo. Se conservan `@Auth()` en creación/consulta comunitaria y `PATCH /suggestions/:id`. No hubo cambios en controllers. Pruebas focalizadas: 4/4; Prettier y `git diff --check` pasan. El typecheck conserva los mismos 29 diagnósticos registrados en R.11a: 10 en AuthService (R.12), 14 en Festival Playlists, 1 en Genre Playlists, 1 en Telegram y 3 en TikTok; ninguno en Requests ni Suggestions.
  - **R.11c — Suggestions (XS):** Absorbida en R.11b (2026-10-13); no queda trabajo de Suggestions pendiente en R.11.
  - **R.11d — News y National Releases (S):** Completada (2026-10-13), como corresponde al roadmap vigente; R.11c permanece absorbida por R.11b. News conserva `superadmin` como mínimo en creación, edición y eliminación; National Releases conserva `riffvalley` en sus seis operaciones protegidas. `roleMeetsMinimum` confirma que `user`, `collaborator` y `riffvalley` no alcanzan el mínimo de News, y que `superadmin` hereda acceso en National Releases. Las lecturas de News siguen públicas; creación general de National Releases sigue pública y rate-limited, y sus lecturas generales siguen públicas. No se modificaron controllers. Pruebas focalizadas: 4/4; Prettier y `git diff --check` pasan. El typecheck mantiene los mismos 29 diagnósticos conocidos: 10 en AuthService, 14 en Festival Playlists, 1 en Genre Playlists, 1 en Telegram y 3 en TikTok; ninguno en News ni National Releases.
  - **R.11e — Integraciones (S):** Completada (2026-10-13). `POST /lastfm/fill-images` y `POST /uploads/image` conservan mínimo `superadmin`; `GET /telegram/channel-posts`, `POST /tiktok/connect`, `GET /tiktok/connection` y `DELETE /tiktok/connection` usan mínimo `riffvalley`. Las pruebas verifican exclusividad de `superadmin`, herencia hacia `superadmin` en rutas `riffvalley` y conservación de rutas públicas (Last.fm artist, Telegram posts, TikTok callback y lecturas de vídeos). Pruebas focalizadas: 6/6; Prettier y `git diff --check` pasan. El typecheck baja de 29 a 25 errores: desaparecen los cuatro de Telegram/TikTok; quedan 10 en `src/auth/auth.service.ts` (R.12), 14 en Festival Playlists y 1 en Genre Playlists.
  - **R.11f — Festival y Genre Playlists (S):** Completada (2026-10-13). El roadmap vigente define una sola subtarea combinada, sin división adicional. Las 14 operaciones protegidas de Festival Playlists y las 12 rutas de Genre Playlists usan mínimo `riffvalley`; `superadmin` hereda acceso mediante `roleMeetsMinimum`, y `user`/`collaborator` no alcanzan ese mínimo. `GET /festival-playlists/artists/top-songs` conserva `@Auth()` y el callback de Spotify sigue público. No se modificó lógica de ownership ni negocio. Pruebas focalizadas: 3/3; Prettier y `git diff --check` pasan. El typecheck baja de 25 a 10 errores: desaparecen los 14 de Festival Playlists y el de Genre Playlists; quedan los 10 conocidos de `src/auth/auth.service.ts` (R.12).

### R.12 — Registro, perfil, administración y JWT singulares

- **Estado:** Completada (2026-10-13).
- **Objetivo:** adaptar R.6 para leer, escribir y exponer un único rol.
- **Alcance:** registro asigna `role: user`; DTO de registro/perfil rechaza campos de rol no permitidos; perfil no cambia `role`; administración exclusiva de `superadmin` asigna un `ValidRoles` singular. Login, respuestas y JWT exponen `role`, y consultas públicas filtran por columna singular. No cambiar duración JWT ni paths sin necesidad aprobada.
- **Dependencias:** R.9–R.10; revisión coordinada con R.13 para que el nombre/tipo de columna coincida.
- **Criterios de aceptación:** servicios aplican allowlists de campos y autoridad persistida; no existe asignación de arrays; los cuatro valores se validan en DTO y servicio; las operaciones Auth conservan su contrato HTTP y las rutas protegidas su mínimo.
- **Verificaciones:** pruebas focalizadas de alta, perfil, administración, login/JWT y consultas públicas; typecheck del área Auth.
- **Tamaño:** M.
- **Resultado:** el registro asigna `role: user` en servidor y DTO/servicio rechazan `role`, `roles` y campos no permitidos. Perfil mantiene su allowlist en DTO y servicio; cambios de rol solo se aceptan en administración y requieren que el actor tenga `superadmin` activo persistido. Login, registro y JWT exponen `role` singular. `usersRv` aplica el mínimo `riffvalley` usando `roleMeetsMinimum` (incluye `superadmin` por herencia); `/users/role/:role` y `/users/superusers` filtran por igualdad exacta, y se rechazan valores legacy, desconocidos y arrays. No se modificaron controladores ni esquema. Las 5 suites de Auth pasan (94/94; las 3 focalizadas de R.12 pasan 48/48); typecheck integrado sin errores; Prettier y `git diff --check` pasan. Al cerrar R.12 la migración seguía pendiente; se ejecutó localmente después en R.15a.

### R.13 — Preflight de despliegue y migración a `users.role`

- **Estado:** Completada. La cadena se ejecutó en local y producción; PostgreSQL conserva 198 usuarios, el esquema singular, 91 entradas de ledger y tres snapshots. La migración histórica se conserva intacta. El detalle remoto está en [P.3.5/P.3.6](roles-production-deployment.md).
- **Objetivo:** retirar `users.roles text[]` y migrar a un solo valor canónico con verificación y rollback exacto.
- **Alcance y dependencias:**
  - **R.13a — Preflight de datos y ledger (S):** Completada (2026-10-13) para el entorno local; `public.users` conserva `roles text[]` y el ledger de 89 entradas no incluye `1791910000000`. Se observaron 198 cuentas, seis combinaciones; cero arrays nulos/vacíos/duplicados/desconocidos y cero `['user']` exactos. No se consultaron entornos remotos, por lo que su ledger sigue desconocido. La recomendación conservadora es preservar la migración histórica y añadir una migración posterior; reevaluar in-place solo tras demostrar que no se aplicó en ningún destino. Detalle: [preflight y migración](roles-migration-preflight.md).
  - **R.13b — Migración y pruebas (M):** Completada como `src/migrations/1791920000000-MigrateUsersToSingleRole.ts`, conservando sin cambios la migración histórica. Produce `role text NOT NULL DEFAULT 'user'` con constraint canónica, valida antes de cambios, conserva snapshot de arrays/esquema, verifica IDs y tiene rollback exacto con bloqueo ante escrituras posteriores. `yarn migration:roles` usa transacciones `each` solo en ese runner y adapta el resultado del `UPDATE` histórico exacto; aborta si hay migraciones ajenas pendientes, falta ledger o ledgers/snapshots inconsistentes. 19 pruebas PostgreSQL efímeras cubren cadena histórica pendiente, histórica registrada, clasificación, validaciones y rollback. La configuración global y el arranque de la aplicación no se modificaron. La ejecución local posterior y su postflight están registrados en R.15a; los demás entornos requieren preflight y backup propios. Detalle en [preflight y migración](roles-migration-preflight.md).
- **Reglas:** normalizar `babyUser`, `riffValley` y `superUser`; conservar solo `collaborator` explícito; retirar `admin` y el `user` antiguo como fuentes de permiso; elegir el rol reconocido de mayor jerarquía solo cuando el origen restante sea inequívoco. No asignar `collaborator`; cualquier fila ambigua detiene la transacción completa.
- **Criterios de aceptación:** pruebas con las seis combinaciones históricas, roles canónicos escritos por R.6, admin combinado/aislado, antiguo user combinado/aislado, desconocidos, vacíos, nulos, duplicados, fallos y rollback. La implementación y pruebas efímeras pertenecen a R.13; la ejecución persistente local quedó registrada en R.15a. Cada otro entorno requiere preflight y backup propios.
- **Verificaciones:** pruebas de migración con Yarn y doble/DB efímera; revisar SQL contra esquema real; verificar dentro de transacción count/IDs, unicidad de rol canónico, default/constraint, ausencia de columna array y rollback exacto.

### R.14 — Pruebas e integración final

- **Estado:** Completada documental y técnicamente el 2026-10-13. R.14a–R.14f están ejecutadas; la auditoría actual registra 252 handlers: 87 públicos, 38 con `@Auth()` sin mínimo, 99 con mínimo `riffvalley` y 28 con mínimo `superadmin`. No quedan decisiones de autorización sin resolver dentro del alcance de R.14. Los fallos globales preexistentes y los seguimientos frontend/funcionales se registran por separado en [la auditoría de endpoints](roles-endpoints-audit.md) y no bloquean este cierre.
- **Objetivo:** demostrar que backend, jerarquía, matriz de mínimos y persistencia singular funcionan como un conjunto.
- **Alcance:** actualizar tests de autorización de R.3/R.4/R.6, migración, login/JWT y operaciones administrativas; cubrir endpoints permitidos/denegados por cada nivel, autenticación sin rol y propiedad; retirar assertions del modelo multirol.
- **Desglose:**
  - **R.14a — Auditoría de endpoints y permisos (S):** Completada documentalmente. Inventariados 252 handlers en 36 controllers antes de R.14b: 147 públicos, 38 con `@Auth()` y 67 con mínimo de rol. La matriz actualizada y las decisiones pendientes están en [Auditoría de endpoints y permisos](roles-endpoints-audit.md).
  - **R.14b — Corrección y regresión integrada (M):** Ejecutada. `GET /auth/users` ahora exige `superadmin`, ya que enumera emails, roles, notas y estado de todas las cuentas; ruta y respuesta no cambian. Metadata test añadido. **Fotografía histórica de R.14b:** tras el cambio quedaban 146 rutas públicas, 38 `@Auth()` y 68 con mínimo (`59 riffvalley`, `9 superadmin`). En esa etapa las otras cuatro lecturas públicas de Auth y 55 mutaciones públicas (tres acciones sensibles más 52 de dominio) estaban pendientes de revisión; R.14e y R.14f las resolvieron después. Auth focalizada: 4 suites / 96 tests pasaron. Regresión por dominios: 18 suites / 134 tests pasaron; el spec de Favorites no compila por importar `META_ROLES` retirado. Suite completa: 86 suites pasaron, 14 fallaron y 9 se omitieron (731 tests pasaron, 12 fallaron y 49 se omitieron). Fallos preexistentes ajenos incluyen assertions desfasadas, sockets bloqueados por sandbox, providers ausentes e imports `META_ROLES` antiguos. Typecheck integrado y `git diff --check` pasan; Prettier pasa en los archivos modificados. No existe comprobación de arquitectura configurada.
  - **R.14c — Saneamiento de pruebas de roles (S):** Completada. Ocho specs de Comments, Favorites, Pendings, Rates y Countries dejaron de importar `META_ROLES`; comprueban el guard de autenticación y la ausencia de mínimo mediante `META_MINIMUM_ROLE`. `test/excel.e2e-spec.ts` usa `role: ValidRoles`, genera JWT singular y cubre acceso `riffvalley`/`superadmin` y denegación `user`/`collaborator` para mínimo editorial. Se conservaron los arrays de los tests históricos de migración y el caso de AuthService que verifica el rechazo de `roles[]` aportado al administrar un usuario. Las suites modificadas pasaron: 8 unitarias / 26 tests y el e2e / 6 tests. Typecheck pasa. Suite global: 94 suites pasaron, 6 fallaron y 9 se omitieron (758 tests pasaron, 12 fallaron y 49 se omitieron), frente a R.14b: 86 pasaron, 14 fallaron y 9 se omitieron (731/12/49 tests). Desaparecieron los ocho fallos de suites por `META_ROLES`. Persisten la assertion desfasada de DiscCatalog, tres suites con `listen EPERM` al abrir sockets en el sandbox y dos specs de Versions con providers de repositorio incompletos. Prettier y `git diff --check` pasan. No se alteró código funcional; esos fallos quedaron anotados como preexistentes y no impidieron cerrar la auditoría de autorización.
  - **R.14d — Protección de operaciones editoriales (S):** Completada. `POST /contents/trigger-daily-link-update`, `POST /lists/:id/wp-posts` y `POST /lists/:id/wp-best-post` ahora requieren mínimo `riffvalley`; `superadmin` accede por herencia y `user`/`collaborator` quedan denegados. El cron y `standalone check-spotify` siguen llamando directamente al servicio de enlaces; las dos operaciones WordPress conservan handler, payload y respuesta. Tests focalizados de controllers y jerarquía, typecheck y Prettier pasan; suite global no repetida. **Fotografía histórica de R.14d:** 143 rutas públicas, 38 con `@Auth()` y 71 role-gated (62 `riffvalley`, 9 `superadmin`); quedaban pendientes las cuatro lecturas de Auth y 52 mutaciones de dominio, que se resolvieron en R.14e y R.14f.
  - **R.14e — Lecturas públicas restantes de Auth (S):** Completada. `GET /auth/usersRv` exige mínimo `riffvalley`; `/auth/users/role/:role`, `/auth/users/superusers` y `/auth/:id` exigen `superadmin`. Se verificaron consumidores frontend: `usersRv` se usa para asignación editorial y `users/superusers` en el Kanban administrativo de versiones; no se encontraron consumidores para las otras dos rutas. Los listados exponían emails y roles; `/auth/:id` además devolvía estado, preferencias de dashboard, notas y `lastLogin` sin ownership. Rutas y respuestas se conservan. Se añadieron pruebas de metadata, denegación por debajo del mínimo, acceso permitido, herencia de `superadmin` en `usersRv` y passthrough funcional. Auth focalizada: 5 suites / 109 tests pasan; typecheck integrado, Prettier y `git diff --check` pasan. Se documentó que las rutas de playlists solo declaran `requiresAuth` frente al mínimo editorial backend; el hallazgo de integración sigue pendiente.
  - **R.14f — Auditoría de mutaciones públicas de dominio (M):** Completada. Se reutilizaron las 52 filas pendientes: se protegieron 42 operaciones editoriales/catálogo/listas/reuniones/vídeos con `@Auth(ValidRoles.riffvalley)` y diez mutaciones de Versions con `@Auth(ValidRoles.superadmin)`. No se alteraron rutas, DTOs, respuestas, servicios, ownership ni validaciones. La lectura de consumidores confirmó que las escrituras vienen de herramientas editoriales autenticadas cuando se halló consumidor; los procesos semanales llaman el servicio directamente y la sincronización WordPress de asignaciones queda detrás de Auth. Las cuatro mutaciones restantes sin Auth son flujos públicos deliberados: registro, login, solicitud de acceso y propuesta nacional de lanzamiento (throttling en las dos solicitudes). Se añadieron pruebas de metadata/path/verbo y ejecución del `UserRoleGuard` para denegación, rol mínimo y herencia de `superadmin` en los 52 handlers. Focalizadas: 8 suites / 158 tests pasan. El spec existente `versions.controller.spec.ts` sigue fallando por no proveer `VersionRepository` al construir `VersionsService`, fallo anterior a R.14f registrado en la auditoría; no se corrigió fuera del alcance. Typecheck integrado, Prettier y `git diff --check` pasan. Código AST verificado: 87 rutas públicas, 38 con `@Auth()` y 127 con mínimo (`99 riffvalley`, `28 superadmin`). No quedan decisiones de permiso de backend para estas 52. El ajuste de guards frontend en ArtistManagement/kanbans de playlists se coordina fuera de R.14; el posible mínimo editorial para `POST /uploads/image`, el futuro acceso por módulos y permisos de `collaborator` también quedan como evolutivos separados.
- **Dependencias:** R.10–R.13.
- **Criterios de aceptación:** suite Auth, suites focalizadas de los seis grupos y migración pasan; typecheck/build integrados pasan; las búsquedas no encuentran usos funcionales de `roles[]` ni checks de jerarquía fuera de Auth; no cambian rutas públicas por la jerarquía.
- **Verificaciones:** comandos Yarn del proyecto, typecheck, tests focalizados y regresión acordada; revisar diff sin modificar otros dominios o hallazgos fuera de alcance.
- **Tamaño:** M.

### R.15 — Corte seguro y contrato posterior para frontend

- **Estado:** Completada. Backend desplegado en Heroku, frontend adaptado y desplegado en Netlify (confirmación manual del usuario), y PostgreSQL migrado a `users.role`. Evidencias y límites de comprobación en [cierre de producción](roles-production-deployment.md).
- **Objetivo:** ejecutar el corte de schema con seguridad y entregar el contrato singular al equipo frontend, sin modificar su repositorio.
- **Alcance:**
  - **R.15a — Corte local (M):** **Migración y postflight de `SpamMusicDB` completados (2026-10-13).** Se creó un backup custom inmediato y se conservó el backup restaurado previamente. Se detuvo solo el contenedor API antiguo, se aplicaron las dos migraciones con el runner dedicado y se verificaron esquema, constraint, 198 IDs, distribución, ledger y snapshots. El 2026-10-13 se resolvió el arranque: `dist` y los logs activos pertenecían a `nobody`, y `AuthModule` no proporcionaba `UserRoleGuard` a los contextos de módulos; se corrigieron los propietarios y se centralizó/exportó el guard, importando `AuthModule` en los módulos afectados. `start:dev` inicializa Nest y `GET /api/countries` responde HTTP 200. La suite focalizada pasó salvo el fallo previo de `versions.controller.spec.ts` por `VersionRepository` ausente en su módulo de prueba. No se ejecutaron pruebas completas de permisos con cuentas editoriales y administrativas; son una observación adicional. El cierre remoto está en P.3.5/P.3.6.
  - **R.15b — Contrato y adopción frontend (S):** Completada. El contrato describe el claim singular y la jerarquía; el usuario confirmó manualmente que el frontend adaptado está desplegado en Netlify.
- **Dependencias:** R.13 y R.14, esquema/versión de artefacto probados y autorización operativa específica para el entorno.
- **Criterios de aceptación:** R.15a deja preparada y revisable la secuencia de preflight, backup/restauración, parada de escritores, runner único, postflight, despliegue compatible y recuperación; registra por separado preparación, migración y despliegue. La ejecución real requiere aprobación y preflight propios del destino. R.15b documenta el contrato singular y orden de despliegue para frontend.
- **Verificaciones:** ensayo del runner en entorno efímero; checklist verificable de preflight/backup/postflight/rollback; revisar el contrato sin cambiar frontend.
- **Tamaño:** M en conjunto (R.15a M + R.15b S).

### Orden de ejecución

1. R.9 deja el contrato y la matriz listos.
2. Ejecutar R.13a como lectura de ledgers y preflight antes de decidir si R.13b sustituye `1791910000000` o añade una migración posterior. Puede avanzar mientras se prepara el backend.
3. Implementar R.10, los incrementos R.11a–R.11f y R.12 en cambios pequeños sobre una única rama de integración. El typecheck/deploy integrado no se considera disponible hasta que todo consumidor use el contrato singular; no introducir adaptadores duales.
4. Completar R.13b contra la decisión de R.13a y el modelo final de R.10/R.12.
5. Completar R.14 y exigir regresión/typecheck integrados antes del corte.
6. El cierre funcional de roles está completado. Las pruebas completas con cuentas editoriales y administrativas quedan como observación adicional y no bloquean el roadmap.
