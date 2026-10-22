# Auditoría de Platform

## Alcance y estado (2026-10-22)

Auditoría de la estructura histórica `src/platform/`, sus dependencias y consumers backend localizables. La limpieza se cerró el 2026-10-22: sus elementos compartidos restantes se trasladaron a `src/shared/` o junto a sus consumidores, y `src/platform/` fue eliminado.

I18n, Seeds y Uploads fueron **retirados** por BC-PLAT-R2, R1 y U2. BC-PLAT-R3 separó los filtros de `PaginationDto`; BC-PLAT-R4 completó el cierre estructural. Las secciones históricas siguientes conservan la evidencia previa donde se indica. No se atribuye a Platform deuda de otros dominios.

## Módulos y límites

| Área | Responsabilidad y dependencias | Consumers conocidos |
| --- | --- | --- |
| I18n (retirado) | Antes registraba `nestjs-i18n`, fallback `en`, recursos JSON y resolución por `x-custom-lang`; no tenía providers propios ni dependencias de dominio. | Solo lo importaba `AppModule`; no se localizaron consumidores de traducciones. Retirado por BC-PLAT-R2. |
| Seeds (retirado) | Antes insertaba usuarios, géneros y países mediante repositorios TypeORM; dependía de entidades de Identity y Catalog, además de bcrypt. | Sin llamada productiva ni comando; retirado por BC-PLAT-R1. |
| Uploads (retirado) | El módulo y `POST /uploads/image` se eliminaron por BC-PLAT-U2 al confirmar que la App no tiene consumidor funcional; su único cliente frontend era una función huérfana. | Sin consumer funcional; conservada la integración Cloudflare R2 según el alcance acordado. |
| Shared / Pagination | `PaginationDto` contiene únicamente `limit` y `offset`, con transformación y validaciones de paginación. | Base compartida por consultas de Catalog, Community, Editorial, Product e Identity; vive en `src/shared/dto/`. |
| Community / orden | `parseOrdersRaw` valida campo/dirección contra allowlist opcional y `applyOrder` aplica orden a un `SelectQueryBuilder`. | Favorites y Rates; implementación compartida en `src/community/common/helpers/apply-order.helper.ts`. |
| Bootstrap | La opción `cronJobs` depende de `STAGE` y `DISABLE_SCHEDULED_TASKS`. | Se configura directamente en `AppModule`; una prueba verifica las opciones de `ScheduleModule` en su metadata. |

El grafo conocido no muestra ciclos Nest. Antes de BC-PLAT-U2, Uploads dependía de la integración de almacenamiento en dirección Platform → Integrations. BC-PLAT-R3 retiró el acoplamiento nominal del DTO común con `ListStatus` de Editorial y separó los filtros por owner.

## Hallazgos justificados

### PLAT-Q1 — Specs fuera de `__tests__` (retirada por BC-PLAT-U2)

**Estado:** no requiere tarea. El spec de Seeds fue eliminado por R1 y los tres specs de Uploads por U2; sus hallazgos se retiraron del baseline al desaparecer los archivos.

### PLAT-Q2 — Tipado seguro histórico en specs (retirada por BC-PLAT-U2)

**Hecho:** antes de BC-PLAT-R1 el baseline conservaba dos hallazgos Platform: doble aserción en `uploads.service.spec.ts:24` y `any` explícito en `seed.module.spec.ts:29`. Al eliminarse el spec de Seeds, solo queda el doble cast de Uploads; no se observaron hallazgos de tipos explícitos inseguros en implementación productiva de Platform.

**Estado:** no requiere tarea. El doble cast del spec de Uploads desaparece junto con el módulo y su entrada de baseline.

### PLAT-Q3 — Diagnósticos ESLint históricos en PaginationDto (completada por BC-PLAT-R3)

**Resultado:** se retiraron los imports con la extracción de filtros y las entradas exactas correspondientes del baseline. `PaginationDto` no presenta hallazgos propios en los gates actuales.

### PLAT-Q4 — Diagnóstico ESLint histórico en spec de Uploads (retirada por BC-PLAT-U2)

**Estado:** no requiere tarea. El spec de Uploads fue eliminado y su entrada de baseline retirada.

## Clasificación de gates (captura anterior a BC-PLAT-R1/R2/U2; solo evidencia histórica)

Captura de `node scripts/structural-quality-gate.js`, `node scripts/type-safety-quality-gate.js` y `node scripts/eslint-quality-gate.js` el 2026-10-22:

| Gate | Resultado global | Atribución a Platform |
| --- | --- | --- |
| Estructura | 44 módulos; 31 violaciones históricas; 0 nuevas; 0 entradas obsoletas. | Cuatro specs de Seeds/Uploads incumplen ubicación/raíz. `i18n/en.json` y `i18n/es.json` aparecen también como `module-root-file`; se conservan en su ubicación porque son recursos del loader configurado, y no se justifica moverlos sin validar resolución de recursos/build. |
| Tipado seguro | 27 violaciones históricas; 0 nuevas; 0 obsoletas; 0 duplicadas. | Dos entradas anteriores en specs Platform (PLAT-Q2). El resto pertenece a migraciones, Product u otros ámbitos. |
| ESLint | 881 diagnósticos históricos; 0 nuevos; 0 obsoletos; 0 duplicados. | Tres imports no usados en PaginationDto y un `prefer-const` en spec de Uploads (PLAT-Q3/Q4). Los demás diagnósticos son ajenos a Platform. |

La salida histórica confirma que esos hallazgos estaban recogidos en los baselines, no que sigan vigentes tras R1/R2. No atribuye el `27/881/31` global a Platform. La verificación posterior a R1/R2 está registrada al final de esta auditoría.

## Límites señalados en la primera revisión

- No separar Seeds en servicios por entidad: administra tres colecciones en una única capacidad operativa y no se demostró complejidad que justifique la extracción.
- No introducir una abstracción propia de Platform para Cloudflare R2: la integración proporciona el adaptador de almacenamiento (la dependencia desde Uploads era histórica y el módulo fue retirado por U2).
- No hacer una separación inmediata de `PaginationDto` ni de su relación con `ListStatus`: afecta múltiples consumers; la revisión actual convierte esa incógnita en BC-PLAT-R3, empezando por caracterizar rutas y campos.
- No trasladar los JSON de idioma: la configuración apunta a `../i18n/`; hace falta una razón técnica y comprobar el empaquetado antes de alterar esa ruta.
- No inventariar el resto de hallazgos globales dentro de tareas Platform. Los baselines y dominios dueños siguen siendo la fuente para deuda de Product, Integrations, migraciones y otros módulos.

## Revisión de responsabilidades y utilidad real (2026-10-22)

Esta revisión complementa y actualiza las conclusiones de ownership de la auditoría inicial. Se siguieron imports/inyección, `AppModule`, bootstrap, scripts y referencias del repo. No se repitieron los quality gates. El inventario de cron se limitó a los handlers que `ScheduleModule` descubre en los módulos consumidores.

### Seeds — herramienta de inicialización sin camino de ejecución actual

`SeedService.createSeed()` inserta, si no existen, dos usuarios de ejemplo, géneros y países mediante tres repositorios. No es un endpoint ni un proceso recurrente. `SeedModule` está registrado por `AppModule` y por tanto su provider existe también en el contexto de `console`, pero no hay un comando `seed` ni consumer que invoque `createSeed()`. La única invocación localizada está comentada en `main.ts`. Los specs solo comprueban DI; no ejecutan el seed.

El código conserva datos hard-coded de ejemplo. Además, la entidad `User` expone `role: ValidRoles`, mientras el seed construye `roles: ['user', 'superUser']`; no asigna el campo actual ni roles válidos para el usuario admin. La capacidad de inicialización de usuarios no corresponde a una feature backend disponible ni es una fuente fiable para bootstrap de roles. No se ejecutó contra base alguna.

**Decisión ejecutada en BC-PLAT-R1:** eliminar `SeedModule`, el servicio, su spec y el hook comentado de `main.ts`. No trasladar el servicio a Identity/Catalog. Si reaparece una necesidad de inicialización, resolverla entonces como operación one-shot explícita y fuera del arranque HTTP.

### Scheduling — infraestructura global; trabajos propiedad de sus dominios

`AppModule` registra `ScheduleModule.forRoot`. Solo desactiva cron cuando `STAGE === 'dev'` y `DISABLE_SCHEDULED_TASKS === 'true'`; en los demás casos, incluidos `prod`, quedan activos. Los handlers `@Cron` nunca estuvieron en Platform. Además, el comando `console` crea un contexto de `AppModule` y expone `check-spotify` (Catalog) y `create-weekly` (Editorial) para invocar manualmente dos handlers que también tienen cron; no existe un comando operativo equivalente para los cron de Integrations.

Los seis handlers localizados permanecen junto a sus responsabilidades:

| Dominio/servicio | Tarea programada |
| --- | --- |
| Catalog — `DiscLinkMaintenanceService` | Diario 06:00, busca Discs ya publicados sin link válido y trata de completar el vínculo mediante Spotify. |
| Editorial — `ContentSchedulerService` | Lunes 08:00, crea contenidos semanales editoriales. |
| Integrations — `InstagramService` | Cada 10 min por defecto, sincroniza posts y refresca URLs de medios; semanalmente renueva el token Meta. |
| Integrations — `TiktokService` | Cada 10 min por defecto, sincroniza vídeos. |
| Integrations — `TiktokConnectionService` | Diario 09:00, comprueba expiración y envía recordatorio de reautorización. |
| Integrations — `SpotifyConnectionService` | Diario 09:00, comprueba expiración y envía recordatorio de reautorización. |

Los handlers son descubiertos por Nest al componer los módulos del dominio en `AppModule`; el bootstrap solo configura las opciones del scheduler y no contiene lógica funcional de jobs. No se observa un cron común duplicado. **Decisión:** conservar ScheduleModule y configurar ahí su activación; mantener cada handler en su dominio/Integration. No crear `PlatformSchedulerService` ni trasladar los jobs a Platform.

### Uploads — módulo retirado tras confirmar consumidores en App

La evidencia anterior describía `POST /api/uploads/image`, su contrato, validaciones y delegación a `CloudflareR2Service`. Una búsqueda funcional en Riff Valley App encontró esa ruta únicamente en `uploadImage()` de `src/services/news/news.ts`; la función no tenía imports ni llamadas y no estaba conectada a una pantalla. El editor de noticias no usa esa función. Las pantallas de playlists sí cargan imágenes, pero llaman a `PUT /festival-playlists/:id/image` y `PUT /genre-playlists/:id/image`, endpoints propios de Editorial que actualizan Spotify.

**Decisión BC-PLAT-U2:** eliminar `UploadsModule`, controller, servicio y pruebas, retirarlo de `AppModule` y borrar el cliente frontend huérfano. No cambiar las subidas de playlists ni otros endpoints. Conservar `CloudflareR2IntegrationModule` y `CloudflareR2Service` como pidió el alcance; el inventario estático actual no mostró otros consumers funcionales en backend. Los endpoints de playlists permanecen separados porque no delegan en R2.

### I18n — integración inicializada, sin uso localizado

`I18nConfigModule` registra `nestjs-i18n`, fallback `en`, resolución del header `x-custom-lang` y `I18nJsonLoader` para `src/platform/i18n/`. `AppModule` lo importa. Build y desarrollo copian los JSON a `dist/platform` mediante `postbuild`, `copy-i18n` y `start:dev`, necesarios para que la ruta configurada tenga recursos en ejecución.

No se encontraron inyecciones de `I18nService`, llamadas de traducción, decorators o referencias a las claves en código productivo. Los únicos recursos contienen `dish.ingredientExists`/`ingredientExists`, texto de ejemplo que no corresponde a un consumer localizado. La configuración se carga al arrancar pero no hay uso funcional conocido; recursos y scripts de copia son soporte de esa integración inactiva. El paquete `nestjs-i18n` y el paquete `i18n` no tienen otros imports localizados en backend.

**Decisión ejecutada en BC-PLAT-R2:** retirar el wiring y los recursos sin dejar loader preparado. Si aparece una feature que necesite traducciones, implementar entonces el mecanismo mínimo que cubra sus claves y empaquetado. `X-Custom-Lang` permanece en CORS por su función de allowlist HTTP; ya no selecciona idioma en el backend.

### Common — parámetros compartidos y filtros con owner

`common` contiene dos piezas, no un módulo Nest:

`PaginationDto` conserva solo `limit` y `offset`, los parámetros de paginación compartidos. Los filtros están en DTOs de consulta de sus owners y conservan sus nombres, transformaciones y validaciones:

- Catalog: `DiscsListQueryDto`, `DiscsCalendarQueryDto` y `TopStatsQueryDto` alojan los filtros de catálogo, votos, países, rangos y estadísticas; Genres y Countries tienen DTOs de consulta propios.
- Community: `CommunityListQueryDto` comparte los filtros usados por Favorites, Rates, Comments y Pendings. `apply-order.helper.ts` queda en `src/community/common/helpers/` y mantiene una sola implementación usada por Favorites y Rates.
- Editorial: `ListQueryDto` es dueño de `statusExclusions` y su tipo `ListStatus`.
- Product: `NewsListQueryDto` es dueño de `status`.
- Identity: `ActivityListQueryDto` es dueño de `notVotedDays`, `accessDays` e `inactiveDays`.

Los DTOs especializados extienden la base compartida, conservando `limit` y `offset`; las rutas siguen usando los mismos parámetros y las respuestas no cambian. Los filtros ya no se aceptan incidentalmente en rutas ajenas al dominio, conforme al `ValidationPipe` con whitelist. No se duplicó la lógica de orden.

## Tareas de organización justificadas

Estas tareas reemplazan la recomendación anterior de empezar por mover specs. No se inicia ninguna ahora.

1. **[x] BC-PLAT-R1 — Retirar el seeder heredado del runtime (S; completada 2026-10-22).** Se eliminó `SeedModule`, `SeedService` y su spec; se retiró de `AppModule` y se borró el hook comentado de `main.ts`. Búsquedas en `src/`, scripts y configuración no encontraron otro consumer ni comando seed. No se creó reemplazo ni se ejecutaron datos. Se retiró del baseline el hallazgo del spec eliminado.
2. **[x] BC-PLAT-R2 — Retirar I18n sin consumers (S; completada 2026-10-22).** Se eliminó `I18nConfigModule`, los JSON `en/es`, su import en `AppModule`, los scripts `postbuild`/`copy-i18n` y el watcher correspondiente en `start:dev`; también se quitaron `i18n`, `nestjs-i18n`, `concurrently` y `copyfiles` tras confirmar que no tenían otro uso. No se eliminaron `X-Custom-Lang` de la allowlist CORS de sesiones. Se retiraron del baseline solo las entradas de recursos eliminados.
3. **[x] BC-PLAT-R3 — Separar filtros de `PaginationDto` por owner (completada 2026-10-22).** Se introdujeron DTOs de consulta por dominio para Catalog, Community, Editorial, Product e Identity; Common conserva solo la paginación compartida. `apply-order` se trasladó a Community para mantener una implementación compartida por Favorites y Rates. Se actualizaron consumidores y pruebas; no se cambiaron rutas, respuestas ni lógica de negocio. Se retiraron del baseline únicamente los hallazgos asociados a imports ahora eliminados.

4. **[x] BC-PLAT-R4 — Cerrar la estructura residual de Platform (completada 2026-10-22; ubicación de cron ajustada después).** `PaginationDto` se trasladó de `src/platform/common/` a `src/shared/dto/`, ubicación adecuada para su uso transversal. Inicialmente `shouldEnableCronJobs` pasó a `src/bootstrap/`; al confirmarse que solo lo usa `AppModule`, se integró en ese archivo. La prueba independiente se reemplazó por una prueba de la configuración real de `ScheduleModule` en `src/__tests__/app-module-schedule-options.spec.ts`. Una simplificación posterior eliminó la función auxiliar. Se eliminaron `common/`, `scheduling/`, `bootstrap/` y `platform/` al quedar vacíos. No se crearon módulos ni abstracciones y se conservó el comportamiento.

5. **[x] BC-PLAT-R5 — Simplificar la composición de `AppModule` (completada 2026-10-22).** Se agruparon imports y registros por Catalog, Community, Editorial, Identity, Integrations y Product. La configuración existente de TypeORM se trasladó a `src/config/typeorm-options.ts`, tipada como `TypeOrmModuleOptions` y evaluada al registrar `TypeOrmModule`, conservando los valores y el momento de lectura de variables de entorno. La condición de cron quedó inline en `AppModule`. No se modificó la lista de módulos, la configuración de PostgreSQL/SSL, throttling, migraciones ni el comportamiento del cron.

4. **BC-PLAT-U1 — Reducir superficie DI sin tocar API (completada y supersedida por U2).** Se aplicó inicialmente al no existir consumers backend internos; la búsqueda posterior en App confirmó que el cliente era huérfano y que no había pantalla consumidora. La recomendación de conservar el endpoint queda retirada.
5. **[x] BC-PLAT-U2 — Retirar Uploads sin consumidores funcionales (S; completada 2026-10-22).** Se eliminó la API de Platform y el cliente frontend huérfano; se mantuvieron intactas las rutas de imagen de playlists y la integración R2. Se retiraron del baseline solo los hallazgos de archivos Uploads eliminados.

`apply-order` se comparte dentro de Community en `common/helpers`; no se justifica duplicarlo ni extraer otra abstracción. Uploads se retiró por falta de consumidor, no por el árbol de carpetas ni por los baselines.

No quedan tareas activas de Platform. `src/platform/` y `src/bootstrap/` han desaparecido completamente; la paginación compartida permanece en `src/shared/`, TypeORM en `src/config/` y la configuración de cron forma parte de `AppModule`. PLAT-Q1/Q2/Q4 dejaron de aplicar al eliminarse Uploads y Seeds; PLAT-Q3 se cerró con R3. La recomendación previa BC-PLAT-U1 de conservar el endpoint queda supersedida por U2, tras comprobar el repositorio App. La recomendación BC-PLAT-1 del informe inicial quedó supersedida; su objetivo está satisfecho por R1.

## Verificaciones de las auditorías

La revisión R3 ejecutó 22 suites focalizadas (365 tests aprobados), typecheck y lint. `yarn --ignore-engines verify` terminó con código 0: estructura (41 módulos, 21 infracciones históricas, 0 nuevas/obsoletas), tipado seguro, ESLint (0 nuevos/obsoletos), typecheck, build y Jest (202 suites aprobadas, 14 omitidas; 1.964 tests aprobados, 90 omitidos; 2 snapshots aprobados). La primera ejecución completa identificó que `GenresQueryDto` debía conservar `query`; se restituyó en su DTO propietario y la suite afectada pasó antes de repetir verify.

BC-PLAT-R4 pasó la prueba focalizada `schedule-options` (1 suite, 3 tests) y `yarn --ignore-engines verify` (código 0). Tras integrar la función en `AppModule`, se adaptó la prueba para inspeccionar la configuración efectiva de `ScheduleModule`; esta suite pasó (1 suite, 3 tests). La suite unitaria aprobó 202 suites y 1.964 tests, con 14 suites y 90 tests omitidos, y 2 snapshots aprobados. La estructura reportó 41 módulos NestJS, 21 infracciones históricas, 0 nuevas y 0 entradas obsoletas.

BC-PLAT-R5 pasó las suites focalizadas de `AppModule` y TypeORM (2 suites, 5 tests). `yarn --ignore-engines verify` terminó con código 0: estructura (41 módulos, 21 infracciones históricas, 0 nuevas/obsoletas), tipado seguro, ESLint, typecheck, build y Jest (203 suites aprobadas, 14 omitidas; 1.966 tests aprobados, 90 omitidos; 2 snapshots aprobados). No se modificó ningún baseline.

Para BC-PLAT-U2, las suites focalizadas de App pasaron (19 archivos, 100 tests) y `yarn build` pasó. El build frontend mostró warnings existentes de Browserslist, CSS y tamaño de chunk. En eliminaciones anteriores se retiraron del baseline únicamente diagnósticos de archivos borrados. No se ejecutaron Seeds, migraciones, PostgreSQL ni APIs externas, ni se desplegó.
