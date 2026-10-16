# Backend Cleanup

## Objetivo y alcance

Auditar progresivamente los módulos del backend después de completar Backend Architecture. Esta fase revisa responsabilidades, dependencias, calidad, consultas, contratos y pruebas; convierte solo los problemas demostrados en tareas pequeñas y verificables. La reorganización física ya cerrada no se reabre por defecto.

La planificación es incremental. Se trabaja en un dominio cada vez y no se auditan todos los módulos de antemano. El primer dominio es Catalog y el primer módulo revisado es Artists. El roadmap registra auditorías, decisiones, tareas pendientes y hallazgos históricos que requieren clasificación futura.

La auditoría no implementa mejoras. En tareas posteriores se cambia únicamente aquello que quede expresamente incluido en la tarea activa.

## Reglas generales de intervención

- No modificar código de producción, tests ni fixtures durante una auditoría. La auditoría puede leer tests existentes, pero no añadirlos ni corregirlos.
- Conservar los cambios locales presentes en el checkout. La evidencia se refiere al estado observado y distingue modificaciones locales de comportamiento anterior cuando se puede.
- No corregir hallazgos preexistentes, de atribución desconocida o fuera del alcance de la tarea activa.
- No crear abstracciones sin una responsabilidad concreta, no dividir servicios por tamaño y no introducir DDD u otras capas por obligación.
- No mezclar cambios de implementación, cambios de contrato y cambios de esquema. Los bugs funcionales se planifican aparte de las refactorizaciones arquitectónicas.
- Preservar contratos observables como rutas, permisos, validación, payloads, relaciones, orden, paginación, errores y efectos secundarios salvo decisión explícita.
- Tratar relaciones eager como parte observable de la respuesta hasta identificar sus consumidores. No retirarlas durante una limpieza sin caracterización y carga explícita equivalente.
- Revisar la SQL con evidencia antes de optimizarla. No añadir índices por intuición; medir con parámetros y datos representativos.
- No ejecutar migraciones, seeds ni operaciones contra PostgreSQL, APIs u otros servicios reales durante las auditorías.
- No modificar `.impeccable/config.json` para silenciar hallazgos.
- Cuando la evidencia sugiera una mejora de contrato, registrar comportamiento actual, consumidores conocidos, impacto backend/frontend, opciones y recomendación. No iniciar una migración contractual o tarea cross-repository automáticamente.

## Procedimiento por módulo

1. Leer el módulo completo: controllers, DTOs, entidades, servicios, helpers, providers y composición Nest.
2. Localizar consumidores directos en producción: imports, repositorios/entidades inyectados, llamadas a servicios, relaciones y composición en `AppModule`.
3. Revisar responsabilidades y dependencias; identificar ciclos, dependencias de otros dominios, acceso directo a entidades externas y límites entre módulos.
4. Revisar validaciones, tipos, errores, duplicación demostrable, código muerto, consultas y complejidad accidental.
5. Leer las pruebas existentes pertinentes y compararlas con rutas, permisos, casos límite y payloads. No ejecutarlas salvo que una tarea de implementación posterior lo pida; tampoco modificarlas durante la auditoría.
6. Separar hechos comprobados de hipótesis. Registrar los hechos con archivo/línea y efecto concreto; dejar las hipótesis como investigación pendiente y no convertirlas en tareas de corrección.
7. Crear tareas solo cuando exista beneficio demostrado. Priorizar XS/S; dividir M/L cuando los pasos puedan cerrar sin estados intermedios incorrectos.
8. Actualizar el estado del módulo. «Auditado» significa que la revisión terminó, no que sus tareas estén implementadas.

### Registro de hallazgos

Cada hallazgo incluye identificador estable, ubicación, evidencia, problema/consecuencia, categoría (`arquitectura`, `calidad`, `testing` o `bug funcional`), prioridad (`alta`, `media`, `baja`), tamaño (`XS`, `S`, `M`, `L`), propuesta, dependencias y riesgos. Se indica explícitamente si la evidencia es un hecho o una hipótesis.

### Criterios de módulo auditado

Un módulo queda **auditado** cuando:

- se leyó su implementación completa y se identificaron sus consumers directos conocidos;
- se revisaron endpoints, permisos, DTOs y relaciones observables aplicables;
- se consultaron las pruebas existentes y se documentaron huecos relevantes, sin añadir pruebas;
- cada finding tiene evidencia y clasificación, o se documenta por qué no justifica una tarea;
- sus tareas futuras tienen alcance, exclusiones, dependencias, aceptación, verificaciones y tamaño;
- no se ejecutó ningún cambio de producción como parte de la auditoría.

Un módulo queda **completado** solo después de cerrar todas las tareas aprobadas de su revisión, documentar verificaciones y riesgos pendientes, y comprobar que no quedan tareas activas de ese módulo. «Completado» no significa que todo hallazgo histórico o contractual haya sido resuelto.

## Orden inicial y estado

La secuencia se ampliará después de cada dominio; no constituye una orden para auditar todos los módulos ahora. Los 40 módulos funcionales identificados por Backend Architecture aparecen aquí como pendientes, excepto Artists, cuya auditoría se registra abajo. AppModule y archivos de arranque no se consideran módulos funcionales.

| Orden | Dominio                   | Módulos previstos                                                                                                                 | Estado                                                                                                   |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1     | Catalog                   | Artists, Countries, Genres, Discs, CatalogImport, CatalogOverview, LastfmCatalog                                                  | Artists, Countries, Genres, CatalogImport, CatalogOverview y LastfmCatalog completados; Discs en cleanup |
| 2     | Community                 | Comments, Favorites, Pendings, Rates, Requests                                                                                    | Pendiente                                                                                                |
| 3     | Editorial                 | Articles, Asignations, Contents, FestivalPlaylists, Links, Lists, NationalReleases, Points, Reunions, RiffValleyPlaylists, Videos | Articles, Asignations, Lists y Videos completados; Links retirado por BC-LNK-1; Contents y el resto pendiente |
| 4     | Product                   | News, Suggestions, Versions                                                                                                       | Pendiente                                                                                                |
| 5     | Identity                  | Auth, AccessRequests                                                                                                              | Pendiente                                                                                                |
| 6     | Integrations              | CloudflareR2, Instagram, LastfmIntegration, SMTP, Spotify, Telegram, TikTok, WordPress                                            | Pendiente                                                                                                |
| 7     | Platform / Infrastructure | I18n, Seeds, Uploads                                                                                                              | Pendiente                                                                                                |
| 8     | Communications            | Mail                                                                                                                              | Pendiente                                                                                                |

### Estado detallado por módulo

Estados válidos: **pendiente**, **auditado**, **en cleanup**, **completado** y **retirado** (módulo eliminado del producto, no cleanup completado). Solo cambia al avanzar explícitamente por una auditoría o tarea aprobada.

| Dominio                   | Módulo              | Estado     |
| ------------------------- | ------------------- | ---------- |
| Catalog                   | Artists             | completado |
| Catalog                   | Countries           | completado |
| Catalog                   | Genres              | completado |
| Catalog                   | Discs               | en cleanup |
| Catalog                   | CatalogImport       | completado |
| Catalog                   | CatalogOverview     | completado |
| Catalog                   | LastfmCatalog       | completado |
| Community                 | Comments            | pendiente  |
| Community                 | Favorites           | pendiente  |
| Community                 | Pendings            | pendiente  |
| Community                 | Rates               | pendiente  |
| Community                 | Requests            | pendiente  |
| Editorial                 | Articles            | completado |
| Editorial                 | Asignations         | completado |
| Editorial                 | Contents            | pendiente  |
| Editorial                 | FestivalPlaylists   | pendiente  |
| Editorial                 | Links               | retirado   |
| Editorial                 | Lists               | completado |
| Editorial                 | NationalReleases    | pendiente  |
| Editorial                 | Points              | pendiente  |
| Editorial                 | Reunions            | pendiente  |
| Editorial                 | RiffValleyPlaylists | pendiente  |
| Editorial                 | Videos              | completado |
| Product                   | News                | pendiente  |
| Product                   | Suggestions         | pendiente  |
| Product                   | Versions            | pendiente  |
| Identity                  | Auth                | pendiente  |
| Identity                  | AccessRequests      | pendiente  |
| Integrations              | CloudflareR2        | pendiente  |
| Integrations              | Instagram           | pendiente  |
| Integrations              | LastfmIntegration   | pendiente  |
| Integrations              | SMTP                | pendiente  |
| Integrations              | Spotify             | pendiente  |
| Integrations              | Telegram            | pendiente  |
| Integrations              | TikTok              | pendiente  |
| Integrations              | WordPress           | pendiente  |
| Platform / Infrastructure | I18n                | pendiente  |
| Platform / Infrastructure | Seeds               | pendiente  |
| Platform / Infrastructure | Uploads             | pendiente  |
| Communications            | Mail                | pendiente  |

## Auditoría 1 — Catalog / Artists

**Estado:** completado; BC-ART-1, BC-ART-2, BC-ART-3 y BC-ART-4 completadas.
**Base observada:** rama actual y estado local del checkout, 2026-10-14. Se detectaron cambios locales en rutas/imports y formato de Artists/consumers. La revisión conserva esos cambios y no atribuye sus efectos a esta auditoría.
**Alcance leído:** implementación, DTOs, entidad, composición, helpers y specs bajo `src/catalog/artists/`; consumers directos de entidad/repositorio en Disc Write, Catalog Import manual/Excel, Community Requests y Festival Playlists; queries de National Releases que cargan `Disc.artist`; composición de Catalog/App. Se consultaron los tests existentes sin ejecutarlos ni modificarlos. No se revisó el frontend ni se ejecutaron pruebas.

### Resumen de arquitectura y contratos

- `ArtistsController` conserva las rutas `/artists`: lecturas públicas para listado, gestión, detalle y búsqueda; `POST`, `PATCH` y `DELETE` requieren `riffvalley`. Los IDs de ruta usan `ParseUUIDPipe`; los DTOs de escritura tienen validadores de `class-validator`.
- `ArtistsService` es una fachada de delegación. Los servicios separados cubren catálogo, escritura, búsqueda, detalles, gestión y huérfanos. Las fronteras actuales son coherentes; no hay evidencia para dividirlos por tamaño.
- `ArtistManagementService` agrega discos, lanzamientos nacionales y asociaciones de playlists para la vista de gestión. Es una responsabilidad de composición del caso de uso, aunque mantiene acceso directo a repositorios de Catalog y Editorial.
- `ArtistsModule` registra `Artist`, `Disc`, `NationalRelease` y `RiffValleyPlaylistArtist`; importa AuthModule. No se observó un ciclo de módulos Nest desde la composición revisada. Hay acoplamiento de datos entre Catalog y Editorial por los repositorios/entities usados en el endpoint de management.
- Consumers de repositorio/entidad hallados: Disc Write; Catalog Import manual y Excel; Community Requests; Festival Playlists y su entidad de asociación. National Releases consulta `Disc.artist` mediante la relación de Disc; su `national-releases.service.ts` conserva además un import `Artist` sin usos. Disc, NationalRelease y `RiffValleyPlaylistArtist` modelan relaciones con Artist. `AppModule` compone Catalog/Artists mediante CatalogModule en el estado local.
- `Artist.country` es `eager: true` y nullable. `findAll`/`findOne` devuelven entidades y el spec actual confirma la relación eager en el resultado de `findOne`. Management, Search y Details la cargan explícitamente. La asociación de playlists también declara Artist eager. El frontend no está en este repositorio, por lo que la dependencia externa de esos campos no se pudo confirmar; tratar la relación como observable hasta caracterizar a sus consumers.
- La gestión repite condiciones de filtrado entre query de datos y count; además hay tres proyecciones de discos con campos/agrupación y agregados de rates muy similares. No se propone reescribir consultas ni optimizar SQL en esta fase.
- Las suites locales cubren controller, fachada, DI, catálogo, escritura, búsqueda, detalle, gestión, huérfanos y helper. Los specs de servicio usan mocks TypeORM y caracterizan varios payloads, filtros y errores; no se ejecutaron durante BC-0. Los consumers Requests y National Releases no aportan una suite de servicio local en la auditoría consultada; Catalog Import y Festival Playlists tienen pruebas en sus árboles.

### Hallazgos

#### ART-F1 — Normalización inconsistente en creación desde Requests

- **Ubicación:** `src/community/requests/requests.service.ts:91-101`; comparación con `src/catalog/artists/write/artist-write.service.ts:24-49` y `src/catalog/artists/helpers/normalize-for-search.ts:1-9`.
- **Evidencia comprobada:** Artists Write calcula `nameNormalized` mediante `normalizeForSearch` (minúsculas, eliminación de diacríticos, sustitución de `+`, compactación de espacios y trim). La aprobación de Requests busca y crea el valor usando solo `request.artistName.toLowerCase()`. Por ejemplo, el nombre «Björk + Co» produce `bjork co` en Artists Write y `björk + co` en Requests.
- **Problema/consecuencia:** una aprobación puede no encontrar un artista ya existente con el mismo nombre visible y crear otro registro normalizado de forma distinta. También hay normalizadores específicos en Disc Write y Catalog Import; la política completa entre escritores requiere revisión antes de una unificación amplia.
- **Categoría / prioridad / tamaño:** bug funcional; media; S para alinear la aprobación de Requests con la regla ya usada por Artists, M si se decide unificar también Import y Disc Write.
- **Propuesta:** en una tarea acotada, hacer que la resolución/creación de Artist de Requests use la misma normalización que Artists Write y caracterizar los nombres con acentos, `+` y espacios. Registrar por separado la decisión sobre otros escritores.
- **Dependencias y riesgos:** toca un consumer de Community; verificar sus DTOs y tests antes de cambiarlo. Cambiar valores persistidos requiere considerar datos históricos; esta tarea no autoriza una migración ni reescritura masiva.
- **Hecho frente a hipótesis:** la diferencia de valor guardado está demostrada por el código; la existencia de registros duplicados en la base real no se comprobó.

#### ART-F2 — Proyecciones de discos sin tipo explícito y repetidas

- **Ubicación:** `src/catalog/artists/search/artist-search.service.ts:67-92`, `src/catalog/artists/details/artist-details.service.ts:57-73`, `src/catalog/artists/management/artist-management.service.ts:136-159` (y las continuaciones del mapeo de management).
- **Evidencia comprobada:** Search y Management construyen `Map<string, any[]>`; los tres flujos proyectan campos de Disc/Genre y convierten `rateCount`/`averageRate` de `raw` a número con la misma regla. Search/Management también repiten las subqueries COUNT/AVG de Rate.
- **Problema/consecuencia:** los resultados quedan sin comprobación estática y tres copias del mapeo pueden divergir cuando cambie el payload. No hay evidencia de que la SQL actual sea lenta o incorrecta.
- **Categoría / prioridad / tamaño:** calidad; baja; S.
- **Propuesta:** evaluar un tipo de proyección y un helper localizado/reutilizado por estas tres responsabilidades para el mapping común; conservar queries, payload, orden y conversiones existentes. Solo extraer SQL compartida si el cambio mantiene claridad y tiene cobertura de caracterización existente o futura.
- **Dependencias y riesgos:** Search, Details y Management; preservar `null`/`0`, campos opcionales y asociación `raw`/`entities` por índice. No altera contrato intencionadamente.
- **Hecho frente a hipótesis:** duplicación y ausencia de tipos demostradas; la posibilidad de divergencia futura es riesgo, no regresión actual.

#### ART-F3 — Parámetros de management se parsean sin validación

- **Ubicación:** `src/catalog/artists/artists.controller.ts:34-48`; `src/catalog/artists/management/artist-management.service.ts:24-37, 156-160`; caracterización actual en `src/catalog/artists/__tests__/artists.controller.spec.ts`.
- **Evidencia comprobada:** el controller usa `parseInt` sobre strings; el test espera que `limit='7tail'` se convierta en `7`, acepta `offset='-2'` y pasa `'0'` como cero. El servicio usa estos valores para `take`, `skip` y aritmética de páginas (`Math.ceil(totalItems / limit)`). No usa un DTO con validadores como el listado normal de Artists.
- **Problema/consecuencia:** parámetros malformados se aceptan parcialmente; `limit=0` puede producir una consulta vacía y `totalPages` infinito/indefinido cuando hay resultados; offsets negativos pasan a la query. La respuesta no valida que `needsReview` sea literalmente true/false: cualquier valor distinto de `true` se vuelve `false`.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Propuesta:** introducir un DTO de query específico para management con transformación y validación de enteros, rango positivo/no negativo y booleano; definir explícitamente si entradas inválidas devuelven 400. Conservar defaults actuales para campos omitidos.
- **Dependencias y riesgos:** tests de controller/management y potencial consumidor frontend de `/artists/management`; la respuesta HTTP para valores inválidos cambia respecto del parsing actual, así que debe ser decisión explícita y caracterizarse. No reutilizar PaginationDto genérico sin revisar sus validadores.
- **Hecho frente a hipótesis:** parsing permisivo y valores cero/negativos alcanzando el servicio están probados en la spec actual; la salida de TypeORM para cada valor no se ejecutó en BC-0.

#### ART-F4 — La página vacía de management descarta el total calculado

- **Ubicación:** `src/catalog/artists/management/artist-management.service.ts:74-88`; expectativa actual en `src/catalog/artists/management/artist-management.service.spec.ts`.
- **Evidencia comprobada:** el servicio calcula `totalItems` con `countQb.getCount()` y `orphanCount` con `countForManagement`; si la página (`qb.getMany()`) no contiene filas, devuelve `totalItems: 0`, `totalPages: 0` y `orphanCount: 0` sin usar esos resultados. La spec entrega `count: 9` y `orphanCount: 4`, pero espera los ceros.
- **Problema/consecuencia:** para una página fuera del rango, el envelope contradice el count de los filtros y oculta el total/orphans existentes. El cliente no puede distinguir “sin coincidencias” de “página vacía por offset”. La prueba fija este comportamiento actual, por lo que corregirlo cambia una response observable.
- **Categoría / prioridad / tamaño:** bug funcional, con impacto contractual; media; S.
- **Propuesta aprobada en BC-ART-4:** devolver los counts ya calculados, conservar `data: []`, calcular `totalPages` desde `totalItems` y `limit`, y conservar la página solicitada en `currentPage`.
- **Dependencias y riesgos:** `/artists/management` y su paginación frontend. La adaptación BC-ART-4.F permite volver a la última página válida cuando `currentPage > totalPages` y `totalPages >= 1`; no queda bloqueo de compatibilidad.
- **Hecho frente a hipótesis:** respuesta, test y adaptación frontend comprobados; con `totalPages: 0` no existen páginas válidas a las que volver.

### Contract finding — ART-F4

**Current behavior:** cuando la página está vacía, `/artists/management` devuelve `totalItems: 0`, `totalPages: 0` y `orphanCount: 0`, aunque las consultas anteriores hayan calculado counts mayores.

**Problem:** los counts dejan de describir los filtros aplicados y el cliente no puede distinguir una página fuera de rango de una búsqueda sin coincidencias.

**Impact:** backend + frontend.

**Options:**

1. Preservar los ceros actuales por compatibilidad.
2. Refactorizar internamente el cálculo sin cambiar los valores HTTP (no resuelve la inconsistencia).
3. Cambiar la semántica para devolver los counts calculados también en una página vacía.
4. Coordinar backend/frontend si el cliente necesita adaptar paginación o estado vacío.

**Recommendation:** aplicar la semántica aprobada de la opción 3; BC-ART-4.F ya permite al frontend recuperarse de páginas fuera de rango cuando existen páginas válidas. Conservar `data: []`, counts reales y la página solicitada.

**Blocks the current task:** No; la adaptación frontend correspondiente está implementada y verificada.

#### ART-F5 — Relación eager de Country observable sin inventario frontend actual

- **Ubicación:** `src/catalog/artists/entities/artist.entity.ts:39-44`; `src/catalog/artists/catalog/artist-catalog.service.ts:13-38`; además `src/catalog/artists/catalog/artist-catalog.service.spec.ts` y endpoints de Festival Playlists.
- **Evidencia comprobada:** `Artist.country` tiene `eager: true`; `findAll` y `findOne` devuelven entidades sin proyectar; el test fija que `findOne` retorna el Country eager. Management/Search/Details también incluyen Country explícitamente y la asociación de playlists carga Artist.
- **Problema/consecuencia:** la relación forma parte del payload observado en varios callers, pero este checkout no incluye frontend para confirmar qué vistas la usan. Quitar eager podría alterar respuestas de Artists y asociaciones de playlists.
- **Categoría / prioridad / tamaño:** arquitectura/contrato; baja; XS, como registro sin tarea de cambio.
- **Propuesta:** mantener la relación. Si una mejora futura plantea cambiar eager, identificar consumers y preservar payload con carga explícita antes de retirar la opción.
- **Dependencias y riesgos:** Artists, Festival Playlists y frontend fuera de este repositorio.
- **Hecho frente a hipótesis:** configuración y respuestas testeadas comprobadas; consumo frontend concreto no confirmado.

### Contract finding — ART-F5

**Current behavior:** `Artist.country` se carga como relación eager y aparece en resultados de entidad; varios servicios además la cargan explícitamente. `RiffValleyPlaylistArtist.artist` también es eager.

**Problem:** la relación es observable en payloads, pero no se comprobó qué consumers frontend necesitan Country ni si alguna query externa paga un coste innecesario.

**Impact:** backend + frontend; el consumo frontend permanece sin confirmar.

**Options:**

1. Preservar eager y el payload actual.
2. Revisar internamente cada query, cargar explícitamente donde haga falta y mantener responses equivalentes.
3. Cambiar el contrato para devolver solo `countryId` u otra proyección mínima.
4. Coordinar la retirada/cambio con el frontend después de inventariar sus usos.

**Recommendation:** opciones 1 y 2 como condición para cualquier cleanup interno; no iniciar opción 3/4 sin evidencia del coste y decisión explícita.

**Blocks the current task:** No; no se cambia eager ni el payload durante la auditoría.

#### ART-F6 — Import de Artist sin uso en National Releases

- **Ubicación:** `src/editorial/national-releases/national-releases.service.ts:15`.
- **Evidencia comprobada:** el import `Artist` aparece una sola vez en el archivo y no se usa en tipos, valores ni consultas; la lectura de `disc.artist` usa la relación de `Disc`.
- **Problema/consecuencia:** deja una dependencia documental falsa en el servicio y puede incumplir reglas de lint según configuración. No cambia runtime ni justifica por sí solo una tarea de cleanup.
- **Categoría / prioridad / tamaño:** calidad; baja; XS.
- **Propuesta:** retirar solo si el archivo entra en una tarea explícita de National Releases; no ampliar BC-0 ni generar una tarea aislada por este import.
- **Dependencias y riesgos:** fuera del módulo auditado; ningún riesgo funcional demostrado.
- **Hecho frente a hipótesis:** import sin uso demostrado; efecto de lint depende de configuración.

### Tareas propuestas

Estas tareas quedan pendientes; ninguna se ejecutó en BC-0.

#### BC-ART-1 — Alinear la normalización al aprobar Requests (S, prioridad media)

- [x] **Completada (2026-10-14).** Requests importa `normalizeForSearch` desde Artists y calcula una clave única reutilizada para la búsqueda y la creación. El nombre visible y las relaciones de Artist/Disc y la transición de estado se mantienen.

- **Objetivo:** resolver o crear el artista de una petición con la normalización que ya usa Artists Write.
- **Problema que resuelve:** ART-F1: búsqueda/creación solo en minúsculas puede no coincidir con `nameNormalized` sin diacríticos, con `+` sustituido y espacios normalizados.
- **Archivos previstos:** `src/community/requests/requests.service.ts`, su spec existente y, si la reutilización lo requiere, `src/catalog/artists/helpers/normalize-for-search.ts`.
- **Alcance:** normalización de `nameNormalized` durante approve; prueba de correspondencia para acentos, `+` y espacios; preservar `request.artistName` como nombre visible.
- **Exclusiones:** imports manual/Excel, Disc Write, migración/reparación de datos, cambios de contrato HTTP de Requests.
- **Dependencias:** ART-F1; revisar uso de helper cross-domain y cobertura existente.
- **Criterios de aceptación:** el approve encuentra un Artist preexistente creado con Artists Write cuando ambos nombres se normalizan igual; la creación nueva guarda el mismo valor canónico; conserva relaciones y transición de estado actuales. **Verificado.**
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/community/requests/requests.service.spec.ts src/catalog/artists/write/artist-write.service.spec.ts` — 2 suites y 15 tests aprobados; `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; Prettier `--check` y `git diff --check` aprobados. Sin acceso a DB ni servicios reales.
- **Cambios:** `src/community/requests/requests.service.ts` y `src/community/requests/requests.service.spec.ts`; tests nuevos cubren artista existente con diacríticos, `+`, espacios repetidos y combinación de esos casos, además de creación con clave normalizada y nombre visible original, país/género, asociación al disco y estado APPROVED. La prueba preexistente de aprobación conserva también la transición y el rechazo de una segunda aprobación.
- **Tamaño:** S.

#### BC-ART-2 — Tipar y consolidar la proyección de Disc compartida (S, prioridad baja)

- [x] **Completada (2026-10-14).** Tipos explícitos para el `raw` de COUNT/AVG y las proyecciones de Disc, NationalRelease y Playlist; helper puro para transformar Disc, conservando consultas y payloads.

- **Objetivo:** reducir duplicación demostrada en la proyección de discos y eliminar `any` de esos mapas.
- **Problema que resuelve:** ART-F2; tres servicios repiten mapping de Disc/Genre/rates con arrays `any[]`.
- **Archivos previstos:** los servicios Search, Details y Management; un tipo/helper local de Artists si el diseño muestra reutilización real; sus specs existentes.
- **Alcance:** tipo de resultado y mapping común con shape actual; convertir también la selección COUNT/AVG solo si el QueryBuilder queda más claro y es verificable.
- **Exclusiones:** cambiar SQL, orden, filtros, campos o semántica del payload; abstraer los queries enteros; optimización de rendimiento no medida.
- **Dependencias:** ninguna; considerar ART-F2.
- **Criterios de aceptación:** mismas claves, valores, `null`/`0`, asociación raw/entity y orden para Search, Details y Management; sin `any` en las proyecciones tocadas; helper con responsabilidad concreta y tests/cobertura adecuados.
- **Verificaciones:** tres specs de servicio; build/typecheck; `git diff --check`.
- **Inventario y diferencias:** las búsquedas de Artist (`getMany`/`findOne`) devuelven entidades `Artist`; `getRawAndEntities<DiscRateProjectionRaw>()` devuelve entidades `Disc[]` y filas raw con `rateCount`/`averageRate`, tipadas como campos opcionales `string | number | null` para admitir datos ausentes y las representaciones numéricas del driver. Search agrupa la proyección Disc por `disc.artist.id` y devuelve una lista de Artists con Country y Discs. Details devuelve un Artist con Country, Discs planos y `nationalReleases`. Management devuelve un envelope paginado y, por Artist, Country, Discs, `nationalReleases` y `riffValleyPlaylists`. Solo el elemento Disc comparte forma; las colecciones y envoltorios permanecen propios de cada caso.
- **Tipos/helper:** `DiscRateProjectionRaw` y `ArtistDiscProjection` junto con `mapDiscProjection` en `src/catalog/artists/helpers/map-disc-projection.ts`. Management tipa también sus mapas de NationalRelease y Playlist usando `Pick` de las entidades correspondientes. Los tres servicios conservan la asociación `entities[index]` / `raw[index]`; Search y Management conservan el agrupamiento y el orden iterado.
- **Archivos:** helper nuevo; servicios y specs existentes de Search, Details y Management; este roadmap.
- **Evidencia de compatibilidad:** las expectativas preexistentes mantienen las claves y diferencias de cada payload, Country/Genre ausentes como `null`, agregados inválidos/ausentes como `0`/`null` y el orden de consultas. Fixtures adicionales en Search y Management cubren agrupamiento, orden, asociación raw/entity y métricas en cero. No cambiaron QueryBuilders, SQL, joins, filtros, selección de columnas, ordenación ni paginación.
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/catalog/artists/search/artist-search.service.spec.ts src/catalog/artists/details/artist-details.service.spec.ts src/catalog/artists/management/artist-management.service.spec.ts` — 3 suites, 11 tests aprobados; `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; Prettier y `git diff --check` aprobados. No se accedió a PostgreSQL ni a servicios externos.
- **Tamaño:** S.

#### BC-ART-3 — Validar los parámetros de Artists Management (S, prioridad media)

- [x] **Completada (2026-10-14).** `GET /api/artists/management` valida los filtros mediante un DTO dedicado; los parámetros inválidos reciben HTTP 400 y se mantienen los defaults y semántica de los válidos.

- **Objetivo:** rechazar parámetros inválidos y evitar valores de paginación incoherentes.
- **Problema que resuelve:** ART-F3; `parseInt` tolera sufijos, permite cero/negativos y coerciona strings booleanos no válidos a false.
- **Archivos previstos:** `artists.controller.ts`, un DTO de query específico bajo `dto/`, specs existentes de controller/management.
- **Alcance:** transformación/validación de `limit`, `offset` y `needsReview`; defaults actuales cuando se omiten; respuesta 400 para entradas inválidas acordadas.
- **Exclusiones:** modificar el contrato de respuesta, cambiar filtros/SQL o adoptar PaginationDto genérico sin caracterizarlo.
- **Dependencias:** la decisión contractual para parámetros inválidos se fijó para esta tarea: responder HTTP 400. La verificación frontend/backend posterior registra una incompatibilidad con `countryId`; revisar ese resultado antes de desplegar el endurecimiento.
- **Criterios de aceptación:** enteros positivos para limit, offset no negativo, booleano estricto; valores inválidos reciben 400; defaults de ausencia y filtros válidos permanecen iguales; no puede generarse totalPages infinito por limit cero.
- **Verificaciones:** tests del controller/servicio para ausencia, extremos y entradas inválidas; build/typecheck; no ejecutar e2e de listener en esta tarea salvo entorno compatible.
- **DTO y reglas:** `ArtistManagementQueryDto` valida `query` y `genreId` como strings opcionales; `limit` como cadena de dígitos que representa un entero seguro mayor que cero; `offset` como cadena de dígitos que representa un entero seguro no negativo; y `needsReview` como exactamente `true` o `false`. Los parámetros numéricos se convierten a `number` solo después de validar. Se mantienen `limit=15` y `offset=0` cuando se omiten.
- **Cambio contractual:** antes, `parseInt` aceptaba prefijos numéricos con sufijos, truncaba decimales y pasaba negativos o resultados `NaN`; `needsReview` distinto de `true` se convertía silenciosamente en `false`. Ahora cualquier valor inválido de `limit`, `offset` o `needsReview` recibe HTTP 400. Los filtros válidos, los defaults, la ruta, el acceso público y la response permanecen iguales. Esta decisión no cambia la semántica de página vacía ni sus contadores; eso sigue pendiente en BC-ART-4.
- **Consumers:** la verificación frontend/backend encontró usos en la vista ArtistManagement y en las búsquedas de artistas de gestión de playlists. Ver el registro de compatibilidad posterior a esta tarea.
- **Archivos:** `src/catalog/artists/dto/artist-management-query.dto.ts` y su spec; `src/catalog/artists/artists.controller.ts`; `src/catalog/artists/__tests__/artists.controller.spec.ts`; este roadmap. El servicio y sus QueryBuilders no cambiaron.
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/catalog/artists/__tests__/artists.controller.spec.ts src/catalog/artists/dto/artist-management-query.dto.spec.ts src/catalog/artists/management/artist-management.service.spec.ts` — 3 suites, 30 tests aprobados. Las pruebas aplican el `ValidationPipe` global (`transform`, `whitelist`, `forbidNonWhitelisted`, conversión implícita habilitada) al DTO y verifican status 400; no se abrió listener HTTP. `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; Prettier y `git diff --check` aprobados. Sin acceso a PostgreSQL ni servicios externos.
- **Tamaño:** S.

### Verificación frontend/backend de BC-ART-3 (2026-10-14)

**Alcance y estado:** revisión de solo lectura de `riffvalley-app-front` (`chore/refactor-integration-dev`) y `riffvalley-app-back` (`refactor/editorial`). No se encontró `AGENTS.md` en el frontend. El frontend tiene un `.aws` sin seguimiento que se conservó. La implementación local de BC-ART-3 ya estaba presente en el checkout; esta revisión no modificó código ni tests en ninguno de los repositorios.

**Consumidores localizados:**

- `src/services/artist/artist.ts:getArtistsManagement`, usado por `ArtistManagement.vue` para paginar la lista y para `fillAllImages`.
- `src/services/spotify/festivalPlaylists.ts:searchFestivalArtists`, usado por `GenrePlaylistManager.vue` y `FestivalPlaylistManager.vue`.

**Serialización y valores observados:** Axios recibe los objetos en `params`; omite propiedades `undefined` y serializa números y booleanos primitivos como parámetros query. `ArtistManagement.vue` envía `limit=30` y `offset=(page - 1) * 30`; `fillAllImages` usa `limit=200`, comienza `offset=0` y suma 200 por lote. `searchFestivalArtists` usa defaults `query=""`, `limit=15`, `offset=0`; sus consumidores observados llaman con límites 15 o 30, offset 0 y `query.trim()`. `needsReview` inicia en `null`, la vista lo alterna entre `true` y `null`, y `null` se convierte en `undefined`; por tanto, actualmente se omite o se serializa como `true`. La firma de servicio también permite `false`, que Axios serializaría como `false`. Los campos de búsqueda y género vacíos se convierten en `undefined`, salvo el `query=""` del default de búsqueda de playlists, que es una cadena vacía aceptada por el DTO.

| Parámetro     | Clasificación                    | Evidencia resumida                                                     |
| ------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `limit`       | Compatible                       | Se usan enteros positivos: 15, 30 y 200.                               |
| `offset`      | Compatible                       | Se inicia en cero y se incrementa en pasos enteros.                    |
| `needsReview` | Compatible                       | La vista envía `true` o lo omite; el servicio también permite `false`. |
| `query`       | Compatible                       | Se omite vacío o se envía como string, incluso `""`.                   |
| `genreId`     | Compatible                       | Se envía el ID seleccionado o se omite.                                |
| `countryId`   | Requiere adaptación del frontend | Se envía al seleccionar país, pero el DTO estricto lo rechaza.         |

**Incompatibilidad `countryId`:** `ArtistManagement.vue` incluye `countryId` solo cuando se selecciona un país. El `ValidationPipe` global usa `forbidNonWhitelisted: true`, pero `countryId` no está declarado en `ArtistManagementQueryDto`; por tanto, la petición recibe HTTP 400. Antes el controller y `ArtistManagementService` tampoco aplicaban este filtro: el cambio hace que falle la carga en vez de devolver la lista sin filtrar. Sin selección, Axios omite el valor `undefined` y no hay error.

**Conclusión y orden recomendado:** los parámetros de paginación, búsqueda, género y revisión son compatibles con las reglas de BC-ART-3. El endpoint no es completamente compatible mientras la vista envíe `countryId`. Antes de desplegar el backend estricto, adaptar primero el frontend para no serializar ese campo mientras no exista soporte backend; después desplegar la validación estricta. Como el selector de país ya no filtraba resultados en el backend anterior, omitir el parámetro conserva el comportamiento efectivo actual. Si se necesita que filtre, planificarlo como cambio coordinado frontend/backend y no incorporarlo silenciosamente a BC-ART-3.

#### BC-ART-4 — Corregir los counts de página vacía en Management (S)

- [x] **Completada (2026-10-15).** La rama de página vacía conserva los contadores consultados, calcula `totalPages` con `totalItems` y `limit`, mantiene `currentPage` según offset y devuelve `data: []`.

- **Objetivo:** devolver counts consistentes cuando los filtros tienen resultados pero el offset produce `data: []`.
- **Problema que resuelve:** ART-F4; la rama vacía descarta los counts consultados.
- **Archivos previstos:** `src/catalog/artists/management/artist-management.service.ts`, spec del servicio y documentación/consumer de respuesta si se confirma en frontend.
- **Alcance aprobado:** mantener `data: []`, devolver `totalItems` y `orphanCount` reales, calcular `totalPages` desde `totalItems` y `limit`, y conservar `currentPage = floor(offset / limit) + 1`, aunque supere `totalPages`.
- **Exclusiones:** cambios de filtros, límite/offset o shape general fuera de esta semántica; no combinar con BC-ART-3.
- **Dependencias:** BC-ART-4.F en frontend, verificada en `riffvalley-app-front/roadmap/artists-management.md`; ofrece recuperación a la última página válida para `currentPage > totalPages` cuando `totalPages >= 1`.
- **Criterios de aceptación:** tests cubren cero coincidencias y página fuera de rango con coincidencias; envelope concuerda con el count escogido por decisión; orden y datos de páginas con resultados no cambian.
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/catalog/artists/management/artist-management.service.spec.ts src/catalog/artists/__tests__/artists.controller.spec.ts src/catalog/artists/dto/artist-management-query.dto.spec.ts` — 3 suites, 31 tests aprobados; `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; Prettier y `git diff --check` aprobados. Sin acceso a PostgreSQL ni servicios externos.
- **Tamaño:** S.

**Verificación frontend (2026-10-15):** la adaptación BC-ART-4.F se revisó en `riffvalley-app-front/roadmap/artists-management.md` y en la vista/helper: cuando `currentPage > totalPages` y `totalPages >= 1`, ofrece volver explícitamente a la última página válida. No cambia el endpoint ni requiere otra adaptación para este contrato.

**Implementación y comportamiento:** la rama vacía reutiliza `totalItems` y `orphanCount` ya obtenidos, calcula `totalPages: Math.ceil(totalItems / limit)`, mantiene `currentPage: Math.floor(offset / limit) + 1` y conserva `data: []`. Las consultas, filtros, joins, ordenación, selección y paginación no cambiaron. La prueba anterior que esperaba ceros con `count=9` y `orphanCount=4` ahora caracteriza una página fuera de rango y espera `totalPages=2`, `currentPage=3` y los contadores reales; se añadió una prueba de primera página sin coincidencias con los contadores en cero. La prueba existente de página con resultados sigue cubriendo el envelope y la proyección.

**Verificaciones realizadas:** suite focalizada de Management, controller y DTO (3 suites, 31 tests); build NestJS; typecheck con `tsc --noEmit`; Prettier sobre los archivos TypeScript modificados; `git diff --check`. No se accedió a PostgreSQL ni a servicios externos.

### Hallazgos no convertidos en tareas

- **ART-F5 / eager Country:** se conserva. Falta evidencia del frontend y no se ha demostrado beneficio de cambiar la carga; la alternativa mínima sería `countryId`, pero cambiaría la response y requeriría verificar/posiblemente adaptar frontend.
- **ART-F6 / import sin uso:** confirmado, pero deliberadamente no se crea una tarea por ser de beneficio menor y estar fuera del módulo auditado.
- **Acoplamiento de Management a Editorial:** usa repositorios de NationalRelease y PlaylistArtist para construir una vista de gestión. La operación agregada es coherente con el endpoint y no hay un ciclo Nest observado ni evidencia suficiente de que un servicio puente reduciría complejidad. Se conserva y se reevalúa si cambia el ownership o aparecen más consumers.
- **Normalizadores de Disc Write y Catalog Import:** hay implementaciones distintas además de Requests. ART-F1 documenta la divergencia, pero BC-ART-1 se acota a Requests; una política canónica para todos los writers necesita revisar semánticas de import y datos existentes antes de abrir una tarea separada.
- **Errores legacy de escritura/búsqueda y delete result:** los tests actuales caracterizan respuestas genéricas de DB (`ayuda`), traducción de error PostgreSQL `23505` y `DeleteResult` sin 404. No se cambia ni se eleva a tarea en esta auditoría sin un problema de consumidor demostrado.

## Auditoría 2 — Catalog / Countries

**Estado:** completado; BC-COU-1 y BC-COU-2 completadas.
**Base observada:** rama actual y checkout limpio, 2026-10-15. No había cambios locales que separar de la base observada.
**Alcance leído:** implementación completa de `src/catalog/countries/` (controller, service, module, DTOs, entity y specs); DTO compartido de paginación y configuración del `ValidationPipe`; composición en `AppModule`; consumers directos conocidos en Artists, Discs/Calendar, Catalog Overview, Catalog Import manual/Excel, Community Requests y Seeds. Se consultaron las pruebas pertinentes sin ejecutarlas ni modificarlas. No se auditaron esos otros módulos ni el frontend.

### Inventario y contratos

- `CountriesController` expone `POST /api/countries`, `GET /api/countries`, `GET /api/countries/:id`, `PATCH /api/countries/:id` y `DELETE /api/countries/:id`. Lecturas públicas; escrituras protegidas por `@Auth(ValidRoles.riffvalley)`. Los IDs de detalle, actualización y borrado usan `ParseUUIDPipe`.
- `POST` usa `CreateCountryDto` (`name` string, 1–50 caracteres). `PATCH` usa `PartialType(CreateCountryDto)`, por lo que acepta nombre omitido/vacío; ambos rechazan `isoCode` como propiedad no permitida con el ValidationPipe global (`whitelist` y `forbidNonWhitelisted`). Aunque la entidad incluye `isoCode`, la API de Countries no permite crear/editar ese campo. No hay evidencia en esta auditoría de que esa sea una necesidad funcional, por lo que no se abre tarea.
- `GET /countries` pasa `CountriesQueryDto` (extensión de `PaginationDto`) a `findAndCount({ take, skip })` y retorna `{ totalItems, totalPages, currentPage, limit, data }`, sin orden explícito. El parámetro `offset` se valida como entero seguro no negativo y, si se omite, conserva el default de servicio 0.
- `CountriesService` implementa CRUD en una única responsabilidad coherente. La persistencia de create/update traduce Postgres `23505` a 400 y errores restantes a 500 genérico. `findOne` usa `findOneByOrFail` y BC-COU-1 traduce solo `EntityNotFoundError` a 404, propagando los demás errores al manejo interno de Nest. `remove` devuelve `DeleteResult` sin traducir cero filas ni errores de FK.
- `Country` tiene `id` UUID, `name` varchar(255), `isoCode` nullable varchar(50) y colección inversa `artist` `OneToMany` con `cascade: true`. `Artist.country` es nullable `ManyToOne` eager y el FK de Artist hace referencia a Country. No se observó una relación directa Country–Disc: los filtros por país se resuelven a través de Artist.
- Consumers/repo access observados: Artists usa Country como relación de artista; Disc Calendar consulta países asociados a discos y selecciona explícitamente `id`, `name`, `isoCode`; Catalog Overview lista todos los países por nombre; import manual busca país predeterminado/seleccionado y Excel carga la lista para lookup/template; Community Requests guarda o asigna Country a solicitudes; Seeds inserta países ausentes. No se halló consumer directo Country en Editorial en la búsqueda acotada. Los endpoints de Countries devuelven entidades. En la auditoría inicial no se revisó el frontend; la compatibilidad del endpoint paginado se verificó posteriormente en BC-COU-2.
- No hay queries complejas, SQL manual, agregaciones ni responsabilidades mezcladas en Countries. No se encontró duplicación interna que justifique extracción; las consultas de listas en Overview/Calendar tienen filtros/payloads propios y no son duplicación de comportamiento de este endpoint.

### Pruebas existentes y límites

- `countries.controller.spec.ts` fija rutas, métodos, DTOs, pipes UUID, permisos, passthrough de respuestas y propagación de errores.
- `countries.service.spec.ts` cubre creación/actualización y DTOs, éxito y errores de escritura, paginación, validación del query por `ValidationPipe`, 404 y propagación de fallos inesperados en `findOne`, borrado sin coincidencia, propagación de FK y metadata de relación con Artist. También conserva una prueba de servicio directo con `limit=0` que documenta `totalPages: Infinity` y `currentPage: NaN`; no caracteriza aceptación HTTP de ese valor y no forma parte de BC-COU-2.
- `domain-mutation-authorization.spec.ts` incluye Countries en la verificación de autorización de mutaciones. Tests de consumers consultados cubren usos de Country en Disc, imports, Requests, Overview y Rates, pero no se ejecutaron durante esta auditoría.

### Hallazgos

#### COU-F1 — Errores de repositorio en `findOne` se reportan como Country inexistente

- **Ubicación:** `src/catalog/countries/countries.service.ts:54-60`; caracterización en `src/catalog/countries/countries.service.spec.ts:164-178`.
- **Evidencia comprobada:** el `try/catch` cubre `findOneByOrFail` y transforma cualquier error en `NotFoundException`. La prueba pasa `Error('database offline')` y espera el mismo 404 que para entidad ausente.
- **Problema/consecuencia:** una caída o error de conexión hace que `GET /countries/:id` afirme que el recurso no existe, ocultando el fallo operativo y dando una señal incorrecta a consumidores y diagnósticos.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Propuesta:** distinguir entidad ausente (`EntityNotFoundError` o consulta nullable seguida de 404) de fallos de infraestructura; conservar el 404 y mensaje actuales para IDs inexistentes y permitir que un fallo operativo llegue al manejo 500 del framework, o mapearlo explícitamente a 500 genérico.
- **Dependencias y riesgos:** solo `CountriesService` y su spec. Cambia el status observable ante errores de DB, no el contrato de éxito o ausencia. No requiere esquema ni consumidor coordinado.
- **Hecho frente a hipótesis:** la conversión indiscriminada está probada; que haya ocurrido una caída real no se comprobó.

#### COU-F2 — `offset` de Countries no tiene validación efectiva

- **Ubicación:** `src/platform/common/dtos/pagination.dto.ts:22-24`; uso en `src/catalog/countries/countries.controller.ts:29-32` y `src/catalog/countries/countries.service.ts:34-43`.
- **Evidencia comprobada:** `PaginationDto.offset` tiene `@Type(() => Number)` pero carece de `@IsNumber` y `@Min(0)`. El ValidationPipe global sí transforma y valida DTOs; el servicio pasa el valor resultante directamente como `skip` y lo usa en la división de página. El spec actual verifica offsets válidos y casos directos, pero no valida query strings negativos, no numéricos o fraccionarios mediante el DTO.
- **Problema/consecuencia:** la API no establece que `offset` sea un entero no negativo. Valores negativos o fraccionarios pueden llegar a la query; texto no numérico se transforma a `NaN` sin una regla del DTO que lo rechace. El comportamiento concreto de TypeORM/driver para estos inputs no se ejecutó, pero la aceptación por validadores puede confirmarse al implementar.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Propuesta:** validar `offset` como número entero no negativo para el endpoint de Countries. Preferir DTO específico de Countries si no se ha caracterizado el impacto de corregir `PaginationDto`, que es compartido por otros endpoints fuera del alcance de esta auditoría.
- **Dependencias y riesgos:** modificación del controller/DTO y pruebas de pipe/service; evitar un cambio amplio del DTO compartido sin auditar los demás consumidores. Las entradas inválidas pasarían a 400; solicitudes válidas y defaults (`limit=10`, `offset=0`) deben conservarse.
- **Hecho frente a hipótesis:** carencia de validadores y paso directo demostrados; respuesta TypeORM a cada valor inválido no medida.

### Tareas propuestas

#### BC-COU-1 — Separar Country inexistente de fallo de persistencia en `findOne` (S, prioridad media)

- [x] **Completada (2026-10-15).** `findOne` convierte `EntityNotFoundError` al 404 existente y relanza sin modificación otros errores del repositorio; NestJS los trata como error interno con respuesta genérica.
- **Alcance completado:** conservar 404 y mensaje para Country inexistente; no convertir fallos operativos del repositorio en 404; actualizar las pruebas de caracterización.
- **Exclusiones:** sin cambios en CRUD restante, borrado/FK, payloads exitosos, autorización o esquema.
- **Dependencias:** COU-F1; ninguna tarea externa.
- **Casos y resultados:** país existente devuelve la misma instancia de Country (contrato previo conservado); `EntityNotFoundError` produce `NotFoundException` 404 con el mensaje vigente; error inesperado del repositorio se rechaza con la misma instancia de error, sin exponer su detalle en una respuesta HTTP normal de Nest.
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/catalog/countries/countries.service.spec.ts src/catalog/countries/__tests__/countries.controller.spec.ts` — 2 suites, 26 tests aprobados; `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; Prettier ejecutado sobre los dos archivos TypeScript modificados; `git diff --check` aprobado. Sin acceso a PostgreSQL ni servicios externos.

#### BC-COU-2 — Validar `offset` en `GET /countries` (S, prioridad media)

- [x] **Completada (2026-10-15).** `CountriesQueryDto` hereda los demás parámetros existentes y valida `offset` como entero seguro no negativo; entradas inválidas reciben 400.
- **Compatibilidad frontend (2026-10-15):** se revisó el frontend en la rama `chore/refactor-integration-dev` (AGENTS.md no encontrado en el frontend ni en los directorios padre comprobados). El único caller de `getCountries` para `GET /countries` es `ArtistManagement.vue`, que invoca `getCountries(250, 0)` al montar; `src/services/countries/countries.ts` declara `offset: number` y serializa `{ limit: 500, offset }` mediante Axios. El offset entregado es el entero `0`; no hay omisión, cadena vacía, decimal, negativo ni texto dinámico en este flujo. Los listados de países para formularios consultados usan el agregado `/catalog`; la función `/countries/all` no tiene caller en `src`. No se encontró incompatibilidad. Se conservó el `.aws` sin seguimiento del frontend.
- **Alcance completado:** aceptar solo offset entero seguro no negativo en el endpoint; mantener default cero y compatibilidad de valores válidos; validar con el ValidationPipe global y simulación de servicio/repositorio.
- **Exclusiones:** cambiar limit u otros campos de PaginationDto, endurecer paginación de otros módulos, modificar orden/shape de resultados o introducir límites de negocio no establecidos.
- **Dependencias:** COU-F2. Antes de cambiar el DTO compartido, revisar su impacto; se recomienda un DTO dedicado para mantener acotada la tarea.
- **Criterios de aceptación:** query ausente, cero y entero seguro positivo mantienen el comportamiento actual; negativos, fracciones, sufijos, vacío, espacios, notación exponencial/signada y enteros fuera de rango seguro reciben 400 antes de acceder al repositorio; envelope y limit se conservan.
- **Casos y resultados:** ValidationPipe aprueba offset omitido, `0`, `17` y `Number.MAX_SAFE_INTEGER`; rechaza `-1`, `1.5`, `2tail`, vacío, whitespace, `1e2`, `+2`, `Number.MAX_SAFE_INTEGER + 1` y un entero decimal muy grande; prueba de servicio confirma `skip: 17` con limit default 10.
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/catalog/countries/countries.service.spec.ts src/catalog/countries/__tests__/countries.controller.spec.ts` — 2 suites, 36 tests aprobados; `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; Prettier ejecutado sobre controller, DTO y specs propios de Countries; `git diff --check` aprobado. Sin PostgreSQL ni servicios externos.

### Hallazgos no convertidos en tareas

- **Cascade Country → Artist:** metadata `cascade: true` está comprobada, pero los consumers encontrados usan Countries para lookup/lista y los DTOs de escritura no aceptan la colección `artist`. No se observó un save de Country con Artists relacionados ni una consecuencia efectiva; no se propone cambiar la relación ni abrir tarea especulativa.
- **`isoCode` no escribible desde Countries:** el campo aparece en entidad y respuestas, pero no en Create/Update DTOs. No se identificó consumer o flujo que necesite modificarlo. Dejarlo fuera hasta contar con requisito concreto.
- **Borrado y errores FK:** `remove` retorna `DeleteResult` con `affected: 0` para ID inexistente y deja propagar fallo de FK; ambos comportamientos están fijados por las pruebas. Sin decisión de contrato o evidencia de consumidor perjudicado, no se cambia ni se crea tarea.
- **Sin cleanup arquitectónico adicional:** service, controller y módulo tienen una responsabilidad clara; no se justifica dividir Countries, crear loaders/helpers ni centralizar consultas de consumidores con shapes diferentes.

**Verificaciones de BC-COU-0:** lectura estática del módulo, `PaginationDto`, configuración global del ValidationPipe, composición y consumidores directos identificados; lectura de suites existentes, sin ejecución; estado del roadmap actualizado; `git diff --check`. No se modificó producción, tests ni fixtures. No se ejecutaron tests, migraciones, seeds ni servicios externos.

## Auditoría 3 — Catalog / Genres

**Estado:** completado; BC-GEN-1, BC-GEN-2 y BC-GEN-3 completadas.
**Base observada:** rama `refactor/editorial`, 2026-10-15. El checkout estaba limpio al iniciar esta auditoría; el único cambio de esta tarea es este registro de roadmap.
**Alcance leído:** implementación completa de `src/catalog/genres/` (controller, service, módulo, DTOs, entidad y specs); configuración global de validación, `PaginationDto` y composición en `AppModule`; consumers directos encontrados en Catalog/Discs, Catalog/Overview, Catalog/Import, Community/Requests, Editorial/National Releases y Seeds; tipos de Artist que incluyen Genre. Se buscaron usos en Product, Integrations, scripts, configuración y plugin WordPress. Se consultaron tests pertinentes sin ejecutarlos ni modificarlos. No se inspeccionó frontend ni se auditaron los módulos consumidores completos.

### Inventario y contratos

- `GenresController` expone `POST /api/genres`, `POST /api/genres/bultCreateGenre`, `GET /api/genres`, `GET /api/genres/:id`, `PATCH /api/genres/:id` y `DELETE /api/genres/:id`. Lecturas públicas; escrituras protegidas con `@Auth(ValidRoles.riffvalley)`. Los endpoints por ID aplican `ParseUUIDPipe`.
- `POST` usa `CreateGenreDto`; `PATCH` usa `PartialType(CreateGenreDto)`. `name` y `color` se validan como strings de 1–50 caracteres cuando están presentes. Aunque `color` está declarado opcional en TypeScript y es nullable en entidad, la ausencia falla en validación HTTP. El spec de controller caracteriza expresamente esa diferencia. El endpoint batch recibe un objeto TypeScript inline, no DTO; el ValidationPipe global no valida su estructura interna. El servicio comprueba únicamente que `genres` sea array, mapea `name` y `color` sin validar los elementos y guarda la lista.
- `GET /genres` recibe `PaginationDto`, ordena por `name ASC` y devuelve `{ totalItems, totalPages, currentPage, limit, data }`, con defaults de servicio `limit=10`, `offset=0`. `limit` tiene `@IsPositive()` pero no regla entera/segura; `offset` solo se transforma a Number y no tiene validadores. Ambos valores llegan al repositorio como `take`/`skip` y se usan en aritmética del envelope.
- `GenresService` concentra CRUD y batch, una responsabilidad coherente. `create`, `bulkCreate` y la persistencia de `update` mapean `23505` a 400 y otros errores a 500 genérico. `findOne` convierte cualquier rechazo de `findOneByOrFail` a 404. `update` da 404 si `preload` devuelve ausencia; `remove` devuelve `DeleteResult` directamente, incluso con `affected=0`.
- `Genre` tiene UUID, `name` varchar(50), `color` varchar nullable y relación inversa `OneToMany` a `Disc`; no tiene parent/children ni otra estructura jerárquica. `Disc.genre` es la relación propietaria `ManyToOne` y eager. No se halló consumidor que solicite o arme árboles/jerarquías.
- Consumers directos: `Disc` guarda Genre; Disc Write asigna género; Calendar obtiene opciones de géneros de discos; Home, filtros de comunidad, Favorites, Pendings, Comments y Rates filtran por `disc.genreId`/relación. Catalog Overview lista todos los géneros por nombre. Import manual/Excel y la plantilla consultan géneros para lookup o exportación. Community Requests modela `genre` como relación eager y asigna referencias por ID; su repositorio está registrado/injectado aunque el servicio no lo consulta para resolver la relación. National Releases carga/proyecta `disc.genre`; Asignations/Links conservan campos textuales de género independientes, con fragmentos comentados de resolución de Genre. Seeds crea géneros. Los tipos de Artist proyectan Genre desde Disc.
- No se encontró consumo de la entidad/repository Genre en Product o Integrations; los géneros de Spotify son strings externos, no la entidad Catalog. En el árbol de scripts/config no aparecen referencias operativas salvo un comentario en `restore_heroku_to_local.sh` con la ruta de API; `test/excel.e2e-spec.ts` y el plugin WordPress muestran consumo indirecto de datos de género, no dependencia del módulo Nest.
- No se observó SQL manual, múltiples responsabilidades ni duplicación interna que justifique extracción. Las queries de Genre en Overview, Calendar, imports y consumidores tienen proyecciones/propósitos distintos. Las lecturas que devuelven entidades exponen `color`; no se propone alterar el payload ni la relación eager.

### Pruebas existentes y límites

- `genres.controller.spec.ts` caracteriza rutas/métodos, DTOs, UUID pipe, permisos, passthrough, propagación de errores, color ausente requerido por validación y casos del `PaginationDto`. Verifica que `limit=0` falla y que `offset=-5` se acepta con `limit=5`.
- `genres.service.spec.ts` cubre CRUD, orden/paginación/defaults, manejo de errores de escritura, ausencia de género, batch vacío y `DeleteResult` con cero afectados. También fija que el service acepta `limit=0` y valores negativos directos, y que `findOne` traduce un error `database offline` a 404. Para batch solo cubre el rechazo si `genres` no es array y no valida campos de cada elemento.
- `domain-mutation-authorization.spec.ts` incluye mutaciones de Genres. Tests de consumidores pertinentes encontrados en Disc Calendar, Catalog Overview, Imports y Requests; se leyeron como contexto donde fue necesario, sin ejecutar ninguna suite.
- No se verificó el frontend ni el JSON real contra una base de datos. Los hallazgos de respuesta HTTP se basan en validadores/flujo de código y caracterización existente; no se hicieron llamadas de red ni SQL.

### Hallazgos

#### GEN-F1 — `findOne` informa fallo de repositorio como recurso inexistente

- **Ubicación:** `src/catalog/genres/genres.service.ts:84-90`; caracterización en `src/catalog/genres/genres.service.spec.ts:207-219`.
- **Evidencia comprobada:** el `catch` envuelve `findOneByOrFail` sin discriminar el tipo de excepción y siempre crea `NotFoundException`. El spec pasa `Error('database offline')` y espera el mismo 404 que para el ID ausente.
- **Consecuencia:** un fallo de conexión o persistencia se presenta como Genre inexistente, con status semánticamente incorrecto y señal operativa engañosa para callers y monitoreo.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Propuesta:** distinguir `EntityNotFoundError` (404 existente) de errores inesperados (propagar para 500 genérico de Nest), siguiendo el criterio ya aplicado en Countries. Actualizar caracterización para ausencia y fallo inesperado.
- **Dependencias y riesgos:** `GenresService` y su spec. Cambia el status HTTP solo para errores de infraestructura; antes de implementar, identificar consumers frontend de `GET /genres/:id` y confirmar que no dependen del 404 ante indisponibilidad.
- **Hecho frente a hipótesis:** la traducción indiscriminada está probada por implementación y test; que haya ocurrido una caída real no se comprobó.

#### GEN-F2 — El endpoint batch no valida los elementos del payload

- **Ubicación:** `src/catalog/genres/genres.controller.ts:29-34`; `src/catalog/genres/genres.service.ts:34-48`; contraste con `CreateGenreDto` en `src/catalog/genres/dto/create-genre.dto.ts:3-12`.
- **Evidencia comprobada:** el body batch está anotado como objeto literal y su spec confirma `design:paramtypes` igual a `Object`; el ValidationPipe no valida `genres[]`. En el service, solo se comprueba `Array.isArray`; cada elemento se lee sin validación y se copia a `repository.create`. El spec verifica que `{ name: 'No color' }` pasa a `create/save` con `color: undefined`.
- **Consecuencia:** entradas con tipo o forma inválida pueden alcanzar TypeORM; errores de restricciones de base de datos se convierten en 500 genérico salvo que sean unique violations. Los límites/tipos de los campos tampoco quedan alineados con el endpoint individual.
- **Categoría / prioridad / tamaño:** calidad con error funcional de validación; media; S.
- **Propuesta:** crear DTO batch dedicado y validar que el body sea objeto con array de elementos que cumplan reglas de Genre; reutilizar reglas concretas de nombre/color si la semántica del batch debe coincidir con `CreateGenreDto`. Mantener la ruta, la respuesta y el orden de entrada.
- **Dependencias y riesgos:** controller, DTO y specs existentes. La respuesta para payloads inválidos pasa a 400 antes de persistir, frente a errores actuales que pueden acabar en 500. Revisar consumers frontend/integraciones del endpoint y payloads usados antes de implementar; no cambiar la grafía legacy de ruta dentro de esta tarea.
- **Hecho frente a hipótesis:** ausencia de validación y paso de campo ausente demostrados; el status final para cada payload malformado depende de la restricción de PostgreSQL correspondiente y no se verificó con DB.

#### GEN-F3 — La paginación acepta offsets inválidos y no garantiza enteros

- **Ubicación:** `src/platform/common/dtos/pagination.dto.ts:16-24`; uso en `src/catalog/genres/genres.controller.ts:37-40` y `src/catalog/genres/genres.service.ts:61-80`; caracterización en `src/catalog/genres/__tests__/genres.controller.spec.ts:205-224` y `src/catalog/genres/genres.service.spec.ts:164-195`.
- **Evidencia comprobada:** `offset` solo aplica `@Type(() => Number)`; no tiene `@IsInt`, `@Min(0)` ni chequeo de número finito. El spec del controller confirma que `offset=-5` pasa el ValidationPipe. `findAll` pasa `offset` a `skip` y deriva `currentPage` de `offset/limit`; los tests de service muestran envelopes `Infinity`/`NaN` con `limit=0` y resultados incoherentes con parámetros negativos directos.
- **Consecuencia:** query strings negativos, fraccionarios o no numéricos pueden superar la validación de offset y llegar al repositorio; se pueden producir paginación incoherente o errores de consulta. El efecto exacto para cada valor en PostgreSQL/TypeORM no se comprobó.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Propuesta:** introducir `GenresQueryDto` que valide limit como entero positivo y offset como entero no negativo finito, preservando defaults y envelope. No endurecer `PaginationDto` global sin auditar sus otros consumidores.
- **Dependencias y riesgos:** tarea limitada al endpoint Genres, sus controller/service/specs; valores inválidos pasarían a 400. El frontend del endpoint `GET /genres` debe localizarse antes de implementación para confirmar serialización y usos de valores omitidos/negativos. Cambios al DTO compartido podrían afectar módulos fuera de este alcance y quedan excluidos.
- **Hecho frente a hipótesis:** reglas ausentes, aceptación de offset negativo y aritmética no válida con parámetros directos están probadas; el error concreto del driver no se midió.

#### GEN-F4 — `color` opcional en tipos pero requerido en el DTO HTTP

- **Ubicación:** `src/catalog/genres/dto/create-genre.dto.ts:9-12`; entidad `src/catalog/genres/entities/genre.entity.ts:12-13`; caracterización en `src/catalog/genres/__tests__/genres.controller.spec.ts:183-203`.
- **Evidencia comprobada:** `color?: string` y columna nullable, pero los decoradores `IsString`, `MinLength` y `MaxLength` no incluyen `IsOptional`; el spec confirma que `{ name: 'Rock' }` recibe 400 en validación.
- **Consecuencia:** la semántica disponible en TypeScript y esquema no coincide con la validación HTTP. No se ha demostrado que un consumidor real necesite crear géneros sin color, por lo que no se puede determinar si el comportamiento correcto es exigirlo o admitir ausencia.
- **Categoría / prioridad / tamaño:** calidad; baja; XS para decisión/caracterización, sin tarea de implementación propuesta.
- **Propuesta:** decidir si color es obligatorio para altas públicas; alinear tipo, validadores y criterio de batch en una tarea futura solo cuando los consumers o requisito confirmen la semántica. No cambiar ahora.
- **Dependencias y riesgos:** contrato de creación y consumers frontend/integración, no revisados en BC-GEN-0.
- **Hecho frente a hipótesis:** discrepancia comprobada; impacto funcional en consumers es hipótesis no confirmada.

### Contract findings

#### GEN-F1 — Errores de `GET /genres/:id`

**Current behavior:** `findOne` devuelve 404 tanto para Genre ausente como para cualquier error del repositorio.

**Problem:** fallos operativos se presentan como ausencia de recurso.

**Impact:** backend + frontend; los consumers concretos del detalle no se revisaron en esta auditoría.

**Options:** (1) preservar el 404 actual; (2) corregir internamente la distinción; (3) definir un error HTTP específico; (4) coordinar cambios si el frontend depende del status incorrecto.

**Recommendation:** opción 2, conservando el 404 para ausencia y propagando errores inesperados como 500 genérico; verificar consumers antes de implementar.

**Blocks the current task:** No; la auditoría solo registra evidencia.

#### GEN-F2 — Validación de `POST /genres/bultCreateGenre`

**Current behavior:** el endpoint acepta un body no validado por DTO y el service valida solamente que `genres` sea array.

**Problem:** elementos inválidos llegan al repositorio y su respuesta de error depende del fallo de persistencia.

**Impact:** backend + frontend/integraciones.

**Options:** (1) preservar validación laxa; (2) añadir validación interna equivalente a las reglas de Genre; (3) cambiar el contrato de error de entradas inválidas a 400; (4) coordinar con consumidores del batch.

**Recommendation:** opción 2 con status 400 definido para entrada inválida y payload válido/respuesta actual preservados; inventariar consumers antes de implementación.

**Blocks the current task:** No; identificar consumers frontend es precondición para ejecutar BC-GEN-2.

#### GEN-F3 — Query params de `GET /genres`

**Current behavior:** el endpoint usa `PaginationDto`, cuyo `offset` no valida enteros ni rango y permite valores negativos.

**Problem:** parámetros inválidos alcanzan el QueryBuilder/repository y la aritmética de páginas puede dejar de ser coherente.

**Impact:** backend + frontend.

**Options:** (1) conservar la aceptación actual; (2) validar localmente con DTO específico; (3) cambiar el comportamiento HTTP de entradas inválidas a 400; (4) coordinar si algún consumer serializa valores no estándar.

**Recommendation:** opciones 2 y 3, conservando defaults, valores válidos y response; no modificar `PaginationDto` compartido sin auditoría de sus consumers.

**Blocks the current task:** No; localizar consumers del endpoint es requisito previo a BC-GEN-3.

### Tareas propuestas

Las siguientes tareas quedan pendientes; BC-GEN-0 no implementó ninguna.

#### BC-GEN-1 — Distinguir Genre inexistente de error de repositorio (S, prioridad media)

- [x] **Completada.** El servicio conserva 404 solo para `EntityNotFoundError` y propaga otros errores sin envolverlos. El spec de servicio caracteriza entidad existente, `EntityNotFoundError` y fallo inesperado.
- **Objetivo:** mantener el 404 para un ID inexistente y no traducir fallos inesperados del repositorio a 404.
- **Hallazgo:** GEN-F1.
- **Alcance:** corregir `GenresService.findOne`; actualizar su spec para entidad ausente y error inesperado; preservar payload de éxito y mensaje actual de 404.
- **Exclusiones:** cambios en escritura, delete, rutas, esquema o payload exitoso; no adaptar frontend sin evidencia de dependencia.
- **Dependencias:** antes de cambiar status para errores inesperados, localizar consumers frontend del detalle y comprobar cómo manejan 404/500.
- **Criterios de aceptación:** entidad encontrada conserva respuesta; `EntityNotFoundError` conserva 404/mensaje; otro error del repository se propaga para respuesta 500 genérica; sin exposición del detalle operativo.
- **Verificaciones:** tests focalizados de `GenresService` y controller si corresponde; build/typecheck; `git diff --check`; sin DB/servicios externos.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/genres/genres.service.spec.ts src/catalog/genres/__tests__/genres.controller.spec.ts` — 2 suites y 31 tests aprobados; `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; Prettier aprobado para `genres.service.ts`. `prettier --check` sobre `genres.service.spec.ts` falla por formato preexistente y no atribuible a BC-GEN-1; el mismo fallo se reproduce al comprobar el archivo de `HEAD`. No se reformateó el spec. `git diff --check` aprobado.
- **Consumers:** revisión de solo lectura del frontend adyacente; se encontraron usos de los listados `/genres` y `/genres/all`, pero no llamadas a `/genres/:id` en `src`. No se modificó el frontend.
- **Tamaño:** S.

#### BC-GEN-2 — Validar elementos del alta batch (S, prioridad media)

- [x] **Completada (2026-10-15).** El body batch usa un DTO con validación anidada y transforma cada elemento a `CreateGenreDto`; el servicio conserva su lógica de persistencia y su response.
- **Objetivo:** rechazar con 400 bodies batch que no cumplan la estructura/reglas de entrada de Genre.
- **Hallazgo:** GEN-F2.
- **Alcance:** DTO batch validado por el ValidationPipe y reglas por elemento; preservar ruta legacy, orden de creación, forma de respuesta y persistencia batch.
- **Exclusiones:** renombrar ruta, cambiar respuesta de éxito, cambiar unicidad/datos/esquema o resolver GEN-F4 sin decisión de semántica.
- **Compatibilidad:** búsqueda en `riffvalley-app-front/src` no encontró llamadas a `POST /api/genres/bultCreateGenre`; los servicios de Genres solo llaman `GET /genres` y `GET /genres/all`. Tampoco se hallaron callers internos de `bulkCreate`; los formularios de escritura frontend revisados usan el catálogo de lectura. No se modificó el frontend. En la forma estática original del endpoint, cada elemento tenía `name` y `color` requeridos.
- **Reglas preservadas:** `CreateGenreDto` exige runtime `name` y `color` como strings de 1–50 caracteres. `color` es opcional solo en la declaración TypeScript; la ausencia falla en el ValidationPipe individual, por lo que el batch también la rechaza. No hay propiedades marcadas `@IsOptional()` en `CreateGenreDto`; no existe un campo opcional válido que pueda cubrirse sin alterar la regla aprobada. La ausencia de `color` queda probada como 400 y GEN-F4 permanece fuera de alcance. Los arrays vacíos siguen siendo válidos y conservan el resultado `{ message: '0 genres have been successfully created.', data: [] }`.
- **Criterios de aceptación:** `genres` ausente/no array y elementos con nombre/color ausentes, nulos, vacíos o con shape incorrecto reciben 400 antes de invocar el servicio; entradas válidas conservan orden y `{ message, data }`; el array vacío conserva comportamiento actual.
- **Pruebas añadidas:** el spec de controller usa el `ValidationPipe` con `transform`, `whitelist`, `forbidNonWhitelisted` e `enableImplicitConversion`, igual que el pipe global. Cubre batch válido, elemento válido junto a inválido, varios elementos inválidos, campos requeridos ausentes, tipos inválidos, array vacío y passthrough de response. No se accede a PostgreSQL.
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/catalog/genres/genres.service.spec.ts src/catalog/genres/__tests__/genres.controller.spec.ts` — 2 suites, 40 tests aprobados; `yarn --ignore-engines build` y `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobados. Prettier pasó en DTO, controller y specs de controller. `git diff --check` aprobado; sin DB ni servicios externos.
- **Tamaño:** S.

#### BC-GEN-3 — Validar paginación de `GET /genres` sin afectar DTO compartido (S, prioridad media)

- [x] **Completada (2026-10-15).** `GET /genres` usa `GenresQueryDto`, que conserva los filtros reconocidos de `PaginationDto` y valida `limit`/`offset` como enteros seguros antes de llamar al servicio.
- **Objetivo:** aceptar solo `limit` entero positivo y `offset` entero no negativo, evitando valores no finitos o fraccionarios.
- **Hallazgo:** GEN-F3.
- **Alcance:** DTO query específico de Genres; conservar `limit=10`, `offset=0`, sort ascendente y envelope actuales.
- **Exclusiones:** cambios globales a `PaginationDto`, límites máximos nuevos, reordenación, filtros o paginación de otros módulos.
- **Compatibilidad:** revisión de `riffvalley-app-front/src` encontró tres llamadas: `getGenres(150, 0)` en ArtistManagement y DiscByDate y `getGenres(200, 0)` en CreateDiscForm. El servicio construye parámetros numéricos `limit`/`offset`; los consumidores usan enteros positivos y offset cero. No se encontraron callers internos del listado aparte del controller. Las llamadas conservan el contrato válido. El DTO extiende `PaginationDto` para conservar los parámetros reconocidos; no se modificó el frontend.
- **Reglas implementadas:** `limit` entero seguro mayor que cero; `offset` entero seguro no negativo. Se rechazan strings vacíos, negativos, decimales, sufijos, valores no numéricos y enteros fuera del rango seguro. Los parámetros omitidos se mantienen `undefined` para conservar los defaults del servicio `10/0`; valores válidos y filtros reconocidos mantienen el resultado y envelope actuales.
- **Criterios de aceptación:** ausencia y valores enteros válidos conservan resultados; cero/negativo para limit, offset negativo, decimal, no numérico, vacío y fuera de rango seguro reciben 400 antes de invocar repository; envelope de válidos no cambia.
- **Pruebas:** el spec del controller ejecuta el `ValidationPipe` con las opciones globales y cubre parámetros omitidos, valores válidos y límite seguro máximo, query/filtros reconocidos, y entradas inválidas para ambos parámetros; los specs del servicio caracterizan defaults, query TypeORM y envelope con repositorio simulado.
- **Verificaciones:** tests del ValidationPipe/controller y service; build/typecheck; `git diff --check`; sin DB/servicios externos.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/genres/genres.service.spec.ts src/catalog/genres/__tests__/genres.controller.spec.ts` — 2 suites, 53 tests aprobados; `yarn --ignore-engines build` aprobado; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobado; `yarn --ignore-engines prettier --check src/catalog/genres/dto/genres-query.dto.ts src/catalog/genres/genres.controller.ts src/catalog/genres/__tests__/genres.controller.spec.ts` aprobado; `git diff --check` aprobado. Sin PostgreSQL ni servicios externos.
- **Tamaño:** S.

### Hallazgos sin tarea

- **GEN-F4 / color:** discrepancia real entre tipo/esquema y validación, pero sin requisito o consumer confirmado que permita escoger semántica. Se mantiene la conducta actual y no se propone cambiar contrato por inferencia.
- **Jerarquías:** la entidad y consumers encontrados modelan Genre como catálogo plano enlazado a Disc; no se hallaron consumers que requieran árbol. No se propone esquema ni abstracción jerárquica.
- **Relación eager Disc.genre:** forma parte de respuestas de Disc y es consumida/proyectada por varios usos de Catalog y Editorial. No se modifica ni se abre tarea sin medir coste y caracterizar consumers frontend.
- **DeleteResult con `affected=0`:** comportamiento fijado por tests, sin evidencia de consumidor perjudicado; no se cambia ni se convierte en tarea.
- **Asignations/Links y género textual:** los campos libres son distintos del Genre estructurado de Disc, aunque haya fragmentos comentados de resolución. No hay evidencia suficiente para unificarlos ni para atribuirlo a Genres.
- **Sin cleanup arquitectónico:** CRUD, módulo, relación e inventario no justifican dividir el service, extraer helpers ni centralizar queries de consumidores.

**Verificaciones de BC-GEN-0:** revisión estática del módulo, DTO compartido, composición y consumers directos conocidos; lectura de suites existentes sin ejecución; coherencia del estado del roadmap; `git diff --check`. No se modificó producción, tests ni fixtures. No se ejecutaron tests, migraciones, seeds, servicios externos ni queries a PostgreSQL. En ese cierre histórico, Discs, CatalogImport, CatalogOverview y demás módulos consumidores permanecían pendientes de auditoría.

## Auditoría 4 — Catalog / CatalogImport

**Estado:** completado (2026-10-15); BC-IMP-1, BC-IMP-2 y sus subtareas BC-IMP-2.1 a BC-IMP-2.5, BC-IMP-3 y BC-IMP-4 completadas; análisis BC-IMP-2.A y BC-IMP-2.1b completados. Se conserva como condición de release el despliegue coordinado backend/frontend del contrato.
**Base observada:** rama actual, 2026-10-15. No se modificaron código, tests ni fixtures durante esta auditoría; solo este roadmap.
**Alcance leído:** implementación completa de `src/catalog/import/` (controllers, servicios, DTO, parser, logger, plantilla, módulo y specs); `test/excel.e2e-spec.ts`; composición en `AppModule`; entidades y normalizadores de Artists/Discs relevantes; usos directos del módulo. Se leyeron las pruebas sin ejecutarlas. Durante BC-IMP-0 no se inspeccionó frontend ni se auditaron los módulos consumidores.

### Inventario, responsabilidades y contratos

- `CatalogImportModule` registra ambos controllers y cinco providers. Importa `Artist`, `Disc`, `Country`, `Genre` y `AuthModule`; no tiene entidades propias ni migraciones.
- **Entrada manual:** `POST /api/catalog/import/manual`, protegido con mínimo `superadmin`. `ProcessManualDataDto` valida string no vacío para `date`, array `albums` y DTO anidado (`line`, IDs UUID opcionales, flags booleanos). `CatalogImportService` parsea fecha/texto, busca o crea Artist, busca o crea Disc, consulta Country/Genre y genera un reporte de discos nuevos/existentes. Los formatos inválidos y re-releases de línea se omiten y solo se registran en `manual_data.log`.
- **Excel:** `GET /api/catalog/import/excel/template` y `POST /api/catalog/import/excel`, ambos con mínimo `riffvalley` (superadmin hereda el nivel). Template lee Countries/Genres ordenados y crea un XLSX. Upload usa `FileInterceptor('file')`, parser ExcelJS, precarga Countries/Genres y procesa filas visibles; acumula errores de fila y continúa. Las filas requieren Artist y Disc cuando alguna de esas celdas está presente. Headers no se comprueban; se usan columnas posicionales. Los flags solo son verdaderos con `si` case-insensitive.
- Las reglas de duplicados difieren: manual compara Artist con `ILike(trim(name))` y Disc con `ILike(trim(name))` + Artist, sin releaseDate; Excel compara Artist por igualdad exacta de nombre (y Country ID cuando viene) y Disc por igualdad exacta de nombre + Artist, incluyendo releaseDate solo cuando se pudo parsear. Ambos reutilizan el catálogo y no crean Countries/Genres. Excel crea Artist antes de consultar/guardar Disc; manual guarda Artist y Disc secuencialmente.
- Las dos vías escriben directo por repositorios TypeORM, sin transacción explícita. Excel atrapa errores por fila y devuelve `{ created, errors }`; manual propaga el primer error y no devuelve su reporte parcial. Logger manual escribe un stream a archivo relativo al proceso; Excel/template usan Logger de Nest y también hay `console.log/error` en el template/controller.
- No hay integración HTTP ni servicio externo dentro del módulo. Dependencias runtime relevantes: PostgreSQL/TypeORM, ExcelJS, Multer/Express y filesystem para `manual_data.log`.
- **Consumers directos conocidos:** solo `CatalogImportController`/`ExcelController` llaman sus servicios; `AppModule` compone `CatalogImportModule`. `test/excel.e2e-spec.ts` monta el módulo e integra upload, descarga y roles; `auth-rate.consumer.spec.ts` verifica dirección de importación entre Auth, Rates y CatalogImport. Servicios de CatalogImport inyectan entidades/repositorios compartidos de Artists, Discs, Countries y Genres, pero no son llamados por esos servicios de dominio.
- Las entidades implicadas son `Artist` y `Disc` (Country/Genre como relaciones de catálogo). `Artist.nameNormalized` es campo requerido por entidad; el flujo Excel/manual lo calcula de forma distinta al helper actual de Artists.

### Pruebas existentes y cobertura consultada

- Manual: specs de controller fijan ruta, verbo, guardas/rol y envelope de éxito; el spec del servicio caracteriza fecha válida e inválida, default Country, referencias Country/Genre, creación/reuso/duplicado, orden, skips y persistencia previa a un fallo posterior; parser de línea/fecha y normalizador tienen specs propios; logger tiene spec.
- Excel: specs de controller fijan rutas, rol, headers de plantilla, falta de archivo y propagación de error; servicio caracteriza columnas por posición, hojas hidden, trimming, resolución de catálogos, flags, errores por fila, duplicate lookup y continuación tras fallo; parser caracteriza formatos de fecha válidos e ilegibles; template caracteriza las dos hojas y dropdowns. E2E caracteriza autorización y una subida vacía válida, pero no import real con repositorios persistentes.
- Módulo tiene spec de DI. No se ejecutaron suites ni E2E durante BC-IMP-0. Los tests ya fijan varios comportamientos legacy observables; las tareas de abajo separan explícitamente las decisiones que los cambiarían.

### Hallazgos

#### IMP-F1 — Clave normalizada de Artist depende del formato de importación

- **Ubicación:** `src/catalog/import/manual/parser/normalize-import-artist-name.ts:1-8`; `src/catalog/import/manual/import/catalog-import.service.ts:103-113`; `src/catalog/import/excel/import/excel-import.service.ts:120-135`; comparación con `src/catalog/artists/helpers/normalize-for-search.ts:1-9` y `src/catalog/discs/write/helpers/normalize-artist-name.ts:1-8`.
- **Evidencia (hecho):** Manual elimina diacríticos, pasa a minúsculas y compacta espacios, pero conserva `+`; Excel solo aplica `toLowerCase()` y conserva diacríticos/espacios repetidos. Artists Write usa `normalizeForSearch`, que además sustituye `+` por espacio. Los specs actuales fijan diferencias: manual espera `arbol del mar` y Excel espera `árbol  del mar` para el mismo nombre con acento/espacios.
- **Consecuencia (riesgo demostrado por valores, no por datos reales):** el campo `nameNormalized` se persiste con claves distintas según el camino y puede no coincidir con Artists Write/búsqueda. No se consultó la base de datos y no se afirma que ya existan duplicados.
- **Categoría / prioridad / tamaño:** calidad con impacto potencial de integridad funcional; media; S.
- **Propuesta:** ambos importadores calculan y consultan `nameNormalized` con la regla canónica existente `normalizeForSearch`. Mantener el filtro de Country opcional que ya aplica Excel, sin unificarlo con el flujo manual. Caracterizar acentos, `+`, espacios y conservación del nombre visible.
- **Dependencias y riesgos:** depende del helper estabilizado en BC-ART-1. La resolución por `nameNormalized` reemplaza el lookup por nombre visible anterior; un Artist histórico con clave ausente o calculada con otra regla no coincidirá hasta una decisión separada sobre reparación de datos. No se actualizan filas existentes ni se cambia el criterio de Country.
- **Hecho frente a hipótesis:** divergencia de transformación y specs comprobada; duplicados existentes o impacto en una pantalla concreta no verificados.

#### IMP-F2 — El import manual aborta el lote y oculta resultados parciales ante errores por fila

- **Ubicación:** `src/catalog/import/manual/import/catalog-import.service.ts:58-68, 84-96, 98-137`; expectativa explícita en `src/catalog/import/manual/import/catalog-import.service.spec.ts:257-274`.
- **Evidencia (hecho):** los álbumes se procesan secuencialmente. Un Disc duplicado se añade a `existingDiscs` y continúa el bucle; una línea inválida o `re-release` solo se registra en log y se omite sin resultado individual. En cambio, una referencia Genre/Country ausente o un error de repositorio escapa del bucle: la spec espera que Artist y Disc del primer registro permanezcan guardados cuando el segundo usa un Genre inexistente, pero no se retorna `report` y el controller propaga el error. La fecha y la consulta inicial del Country por defecto también pueden fallar antes/durante el lote. No hay transacción por registro ni envelope de resultados parciales.
- **Clasificación demostrada:** errores de validación estructural del DTO se rechazan antes del servicio; la fecha inválida y el fallo de la consulta inicial del Country por defecto pueden fallar globalmente; una línea que no parsea y `re-release` se omiten con log; referencias Genre/Country ausentes lanzan `NotFoundException`; duplicado de Disc es un resultado normal que se añade a `existingDiscs`; excepciones de repositorio son fallos técnicos no clasificados por fila. Las referencias ausentes y fallos técnicos no se devuelven hoy como resultados individuales.
- **Diferencia frente a lo deseado (decisión funcional BC-IMP-2.A):** cada disco debe terminar independientemente como importado, duplicado omitido o fallido con motivo; un error de fila no revierte éxitos anteriores ni evita procesar filas posteriores. Para 30 filas con 3 duplicados y sin otros fallos, la respuesta debe permitir identificar 27 importadas y 3 duplicadas.
- **Consecuencia:** hoy una referencia inválida o fallo técnico en una fila impide que las posteriores se procesen y oculta todo el reporte, pese a que escrituras previas siguen persistidas. Los duplicados sí continúan, pero el usuario solo los reconoce en la colección `existingDiscs`; skips de sintaxis/re-release no se muestran.
- **Categoría / prioridad / tamaño:** bug funcional/consistencia; media; M.
- **Propuesta:** aislar cada fila con transacción TypeORM individual para que una falla posterior a guardar un Artist no deje ese Artist creado sin su Disc, capturar y clasificar fallos por fila, continuar el lote y devolver un resultado identificable para cada entrada procesada. Mantener los errores estructurales de request (DTO y fecha/lote inválidos, según decisión de BC-IMP-4) como errores de request. Preservar intactos el criterio actual de duplicado de Disc (`ILike` por título y Artist, sin fecha) y la asociación Artist-Disc.
- **Dependencias y riesgos:** el lookup del Country por defecto se realiza una vez antes del bucle, por lo que su fallo hoy aborta todo el lote; la implementación deberá localizar ese fallo por fila o reportarlo para cada fila afectada. Se requiere usar el mismo manager transaccional para escrituras de Artist/Disc y actualizar el test que actualmente fija persistencia previa a un error posterior. La forma del nuevo resultado es cambio de contrato y requiere coordinar el consumidor frontend conocido. Sin transacción por fila, una falla en el lookup de duplicado o al crear/guardar Disc después de guardar un Artist puede dejar un Artist huérfano; el orden de llamadas lo demuestra, pero no se simuló una transacción ni se consultó una BD real.
- **Hecho frente a hipótesis:** continuación en duplicado, abortos por excepción, ausencia de reporte y persistencia previa están probados con repositorios mock. El código permite fallar después del guardado de Artist y antes del Disc; la escritura parcial concreta bajo errores reales del driver no se verificó con PostgreSQL. Que ya haya Artists huérfanos es una hipótesis no confirmada.

#### IMP-F3 — La fecha manual admite rollover e `Invalid Date`

**Estado:** resuelto por BC-IMP-4.

- **Ubicación:** `src/catalog/import/manual/dto/process-manual-data.dto.ts:26-34`; `src/catalog/import/manual/parser/parse-manual-date.ts:16-26`; `src/catalog/import/manual/import/catalog-import.service.ts:45-56, 135`; specs en `src/catalog/import/manual/parser/parse-manual-date.spec.ts:13-24`.
- **Evidencia (hecho):** DTO solo exige una cadena no vacía. El parser usa `parseInt` sin comprobar día/año y construye `new Date(year, monthIndex, day)`. `February 31, 2026` se convierte en 3 de marzo y el test fija ese rollover; un año no numérico da un objeto `Invalid Date` truthy que no activa `if (!releaseDate)` y llega al guardado. Texto incompleto puede lanzar y el servicio lo transforma en `Error` genérico.
- **Consecuencia:** entradas de fecha no calendario pueden almacenarse con otro día o fallar tarde durante persistencia; las fechas malformadas producen un error interno genérico en vez de validación de request. El cambio a rechazo 400 modifica el contrato para entradas antes aceptadas.
- **Categoría / prioridad / tamaño:** bug funcional y validación/contrato; media; S.
- **Propuesta:** parsear de forma estricta una fecha completa válida, rechazar rollover y `Invalid Date`, y traducir fecha inválida a `BadRequestException`; preservar formato admitido y fecha válida del reporte.
- **Dependencias y riesgos:** confirmar consumidores del endpoint antes de desplegar el nuevo 400; no hay consumer frontend en este checkout. Cambia la aceptación de fechas legacy; no requiere schema ni migración.
- **Hecho frente a hipótesis:** rollover está fijado en test y flujo de Invalid Date se demuestra por el código; fallo exacto de driver para `Invalid Date` no se ejecutó.

#### IMP-F4 — Fechas Excel inválidas se convierten en ausencia o rollover y la fila se importa

- **Ubicación:** `src/catalog/import/excel/parser/excel-workbook.parser.ts:76-91`; `src/catalog/import/excel/import/excel-import.service.ts:50-60, 159-170`; `src/catalog/import/excel/parser/excel-workbook.parser.spec.ts:176-187`; `src/catalog/import/excel/import/excel-import.service.spec.ts:171-180`.
- **Evidencia (hecho):** parser devuelve `null` tanto para fecha vacía como texto no parseable; servicio crea Disc con ese `null` y devuelve éxito. Un test afirma `{ created: 1, errors: [] }` para texto `not a date`. Además, la rama `DD/MM/YYYY` usa `Date.UTC` sin validar que el día resultante coincida con el ingresado (`excel-workbook.parser.ts:80-87`), por lo que una fecha imposible como `31/02/2026` se normaliza al mes siguiente. El template permite fecha vacía, por lo que fecha vacía, inválida e imposible no se distinguen correctamente.
- **Consecuencia:** un error tipográfico de fecha se acepta como álbum sin fecha y no aparece en el resumen de errores, indistinguible de una fecha opcionalmente vacía.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Propuesta (realizada en BC-IMP-3):** preservar fecha vacía como opcional, representar una fecha no vacía pero inválida como fallo de esa fila y continuar el resto dentro del contrato `data.results`; no conservar el shape legacy `{ created, errors }` retirado por BC-IMP-2.4.
- **Dependencias y riesgos:** cambio del parser y tests; consumer frontend coordinado por BC-IMP-2.5 presenta `reasonCode`, hoja y fila sin depender de errores internos. La aceptación de fechas vacías permanece.
- **Hecho frente a hipótesis:** colapso de estados y success actual probados; no se inspeccionó si el frontend distingue el texto de error más allá de renderizar la lista.

#### IMP-F5 — Upload no clasifica los errores del workbook como errores de cliente

**Estado:** resuelto por BC-IMP-4.

- **Ubicación:** `src/catalog/import/excel/controller/excel.controller.ts:59-77`; parser `src/catalog/import/excel/parser/excel-workbook.parser.ts:18-28`; test actual del controller `src/catalog/import/excel/controller/excel.controller.spec.ts:233-244`.
- **Evidencia (hecho):** el upload solo convierte archivo ausente en 400; el controller propaga cualquier error del servicio. ExcelJS/parser lanza errores ordinarios para workbook ilegible o sin hojas. El spec fija passthrough del error genérico de importación, y no existe prueba de status HTTP para archivo corrupto.
- **Consecuencia:** entrada Excel inválida no tiene una respuesta 4xx estable; errores de parsing llegan como errores internos 500, mezclados con fallos de almacenamiento. El servicio por fila sí mantiene un resumen parcial para errores de datos/persistencia.
- **Categoría / prioridad / tamaño:** calidad de contrato HTTP; media; S.
- **Propuesta:** clasificar fallos de formato como 400 con mensaje estable y seguro, preservando el resultado parcial por fila y dejando los fallos inesperados de infraestructura como 500 genérico; caracterizar mediante controller/E2E sin acceder a servicios reales.
- **Dependencias y riesgos:** el status/error body es cambio contractual; verificar consumers frontend y límites entre errores esperados del parser y fallos de DB. El tamaño y tipo MIME no tienen configuración de límites explícita en `FileInterceptor`; no se propone un límite sin definirlo con datos de uso.
- **Hecho frente a hipótesis:** propagación del error ordinario está implementada y probada a nivel controller; status HTTP efectivo de workbook corrupto se infiere del manejo por defecto de Nest y no se verificó ejecutando E2E.

#### IMP-F6 — El resumen Excel no identifica resultados individuales y mezcla duplicados con fallos técnicos

- **Ubicación:** `src/catalog/import/excel/parser/excel-workbook.parser.ts:30-69`; `src/catalog/import/excel/import/excel-import.service.ts:37-44, 46-68, 70-119, 121-188, 190-193`; `src/catalog/import/excel/controller/excel.controller.ts:59-78`; tests `src/catalog/import/excel/import/excel-import.service.spec.ts:134-157, 181-200, 345-366, 393-466`; consumer `riffvalley-app-front/src/services/imports/imports.ts:48-64` y `src/views/importPage/ImportDiscs.vue:88-105, 153-179`.
- **Evidencia (hecho):** el parser procesa hojas visibles en orden y conserva `sheet` y `rowNumber` físico; omite hojas hidden/veryHidden, cabecera, filas completamente vacías. `rowNumber` se reinicia en cada hoja. El servicio retorna `{ created, errors }`; `created` es solo un total, y `errors` contiene `{ row, disc, artist, error }`. Validaciones de campos/referencias y duplicados agregan error y siguen; el spec también fija que un fallo en `discRepo.save` agrega error y procesa una fila posterior. El duplicado se presenta como texto dentro de `errors`, no como estado distinto. Una fila no vacía sin Artist ni Disc se omite silenciosamente. El `catch` incluye `err.message` sin clasificarlo ni sanearlo. El frontend muestra el total creado y una lista de errores por número de fila; no presenta los discos importados uno a uno ni muestra hoja como campo independiente.
- **Escrituras parciales (riesgo respaldado por orden de código):** el servicio puede guardar un Artist nuevo en `artistRepo.save` antes de consultar duplicado y guardar el Disc; si una operación posterior falla no existe transacción/rollback para esa fila. El test del fallo de Disc usa un Artist preexistente, por lo que la existencia real de Artists huérfanos no queda demostrada. No se consultó PostgreSQL.
- **Errores técnicos (límite demostrado):** toda excepción producida dentro del `try` por fila se convierte en elemento de `errors` y el bucle continúa; el código no diferencia un fallo aislado de una caída sistémica del repositorio. Que un error técnico concreto exponga SQL depende del contenido que arroje el driver: el hecho demostrado es que se devuelve texto de excepción sin filtrar.
- **Comportamiento que ya cumple:** conserva el orden de procesamiento; reporta fila física para validaciones, referencias y duplicados; continúa tras esos errores y tras un fallo de `save`; cuenta los Discs creados; los specs caracterizan esos caminos. La lectura de workbook y la precarga inicial de Genres/Countries ocurren antes del bucle y, si fallan, abortan la importación.
- **Diferencia frente al contrato común:** Excel ya ofrece parcialidad y errores por registro para varios casos, pero no un resultado para cada fila procesable ni identificación individual de éxitos, no separa `duplicate` de `failed`, y su fila física necesita el nombre de hoja para ser inequívoca. Su trabajo no es rehacer la continuación ya existente; es estructurar estados/fuentes, manejar skips, sanear mensajes y distinguir fallos técnicos que se pueden aislar.
- **Categoría / prioridad / tamaño:** contrato de resultados y clasificación de errores; media; M para adaptar el flujo y caracterizar los límites sistémicos, más la consistencia por fila compartida con IMP-F2.
- **Propuesta:** añadir `data.results` por fila procesable bajo el contrato común definitivo. Usar estado `duplicate` en vez de tratarlo semánticamente como fallo; informar éxitos individuales; incluir `sheet` junto al `rowNumber`; convertir filas no vacías sin artista/disco en `failed` con código seguro, manteniendo fuera del reporte las filas totalmente vacías, cabeceras y hojas ocultas. Clasificar solo fallos técnicos recuperables con rollback confirmado como fallos de fila; un fallo sistémico o rollback incierto detiene el lote. Sanear los mensajes públicos.
- **Dependencias y riesgos:** BC-IMP-2.1 define los tipos; transacción individual común por BC-IMP-2.2. No cambiar reglas de duplicate lookup, normalización ni la aceptación de fechas en BC-IMP-3. Cambiar la respuesta afecta el contrato observado por la UI; backend y frontend deben activarse en un despliegue coordinado, sin desplegar por separado versiones incompatibles. Los errores de parseo de workbook y precarga siguen siendo globales según IMP-F5/contrato común.
- **Hecho frente a hipótesis:** forma de respuesta, continuación y orden Artist→Disc están demostrados por el servicio/tests. No se ejecutaron fallos reales de conexión/rollback ni se comprobó contenido SQL en respuestas; fugas concretas de SQL y Artists huérfanos en datos existentes no están confirmados.

### Contract finding — IMP-F2, IMP-F3, IMP-F4, IMP-F5 e IMP-F6

**Current behavior:** manual recibe `{ date, albums: [{ line, genreId?, countryId?, ep?, debut? }] }`; éxito responde 201 `{ message, data: { savedDiscs, existingDiscs } }`, con items `{ discId, artistId, message }`. El array position no se devuelve; artist/title se recuperan del texto concatenado `message`. DTO/ValidationPipe rechaza como 400 los errores estructurales, UUID y flags antes de iniciar servicio; la fecha compartida se procesa antes del bucle y una fecha que lanza `Error` ordinario acaba normalmente en 500. Referencia inexistente lanza 404. Esos fallos no incluyen resultados previos y las líneas no parseables/re-release se omiten.

Excel recibe un multipart `file` en `POST /api/catalog/import/excel` (201 por default); responde directamente `{ created, errors }`, donde `errors` contiene `{ row, disc, artist, error }`. Parser recorre hojas visibles en orden y produce `sheet` + número físico de fila; cabeceras, hojas hidden/veryHidden y filas totalmente vacías se excluyen; el número físico puede repetirse entre hojas. La respuesta no incluye `sheet` como campo ni items importados individuales. Errores de fila y duplicados llegan juntos en `errors`. La UI presenta conteo `created` y lista por fila; errores globales (archivo ausente 400, parser/precarga fallidos normalmente 500) se muestran como un mensaje. `ImportPage.vue` es consumidor manual y `ImportDiscs.vue` consumidor Excel, ambos desde `src/services/imports/imports.ts`; no se encontró otro uso directo. El primero analiza `message`, el segundo consume estructura de `errors`; ninguna vista usa un resultado común.

**Problem:** el shape manual no distingue resultados por entrada ni conserva resultado al fallar. Excel continúa para muchos errores por fila, pero confunde duplicado con fallo, no identifica éxitos uno a uno, y `row` sin `sheet` no es inequívoco. Además, su `catch` devuelve `err.message` sin filtrar y trata toda excepción por fila como recuperable. Los dos flujos necesitan distintos adaptadores de localización, pero pueden compartir estado, campos de artista/disco, IDs, reason code y mensaje seguro. La fecha almacenada puede diferir de la ingresada o quedar ausente sin error; la clasificación de workbook inválido queda en IMP-F5.

**Impact:** backend + frontend para el contrato común y su presentación; backend-only para transacciones individuales; backend + frontend para clasificación de errores HTTP globales si cambia el status/body de IMP-F3/4/5.

**Options:**

1. Mantener ambos contratos legacy; no satisface la identificación por entrada.
2. Refactorizar persistencia por fila sin cambiar reportes; resuelve consistencia, pero no hace visibles los resultados.
3. Usar un único contrato definitivo para ambos formatos y retirar los campos legacy cuando se active.
4. Coordinar la activación backend/frontend tras completar los cambios backend. No desplegar por separado versiones incompatibles; la adaptación frontend se prepara para el mismo cambio contractual coordinado.

**Recommendation:** usar el mismo contrato definitivo para ambos flujos bajo `data.results`; al activarlo, retirar `savedDiscs`, `existingDiscs`, `created` y `errors`. `inputIndex` es entero base cero y local al request: manual = posición del elemento en `albums`; Excel = ordinal base cero entre las filas `ParsedExcelRow` que el parser devuelve, en orden de workbook/hoja/fila y excluyendo cabeceras, hojas ocultas y filas totalmente vacías. El índice no se renumera por éxito/error y distingue entradas repetidas. `source` es una unión discriminada: `{ kind: 'manual', inputLine?: string }` (se incluye cuando el valor es una cadena) o `{ kind: 'excel', sheet, rowNumber }`; Excel necesita hoja y fila física porque el número se repite entre hojas. Cada elemento tiene `inputIndex`, `source`, `status` y `message` seguro. Resultados `imported` y `duplicate` incluyen nombres e IDs de Artist y Disc; `failed` incluye `reasonCode` estable, nombres/IDs disponibles y mensaje seguro. No se incluyen IDs inciertos ni SQL, stack o información interna. Los códigos representan causas por entrada (entrada inválida, re-release, referencia inexistente o persistencia aislada); un fallo global no genera un resultado de fila y conserva la semántica HTTP global existente/definida por IMP-F3/4/5. Los criterios de duplicado de cada formato permanecen propios. Filas Excel totalmente vacías/cabeceras/hojas ocultas no son entradas; una fila con contenido pero sin artista o disco sí devuelve `failed`. Los parsers de texto manual y workbook Excel siguen siendo independientes.

**Respuesta definitiva:** ambos endpoints devolverán `{ message, data: { results: CatalogImportResultItem[] } }` en manual y `{ data: { results: CatalogImportResultItem[] } }` en Excel, junto al status HTTP ya definido para éxito. El shape de los controllers no cambia en BC-IMP-2.1; en las tareas de activación del contrato se sustituyen los campos legacy. Una petición/archivo que no se puede interpretar o un fallo sistémico sigue rechazándose con error HTTP global y mensaje seguro; errores de validación/duplicado/fallo técnico aislable se representan por entrada según su clasificación.

La adaptación frontend se realiza después de completar los cambios backend y se despliega coordinadamente con la versión backend que activa el contrato. No se deben desplegar versiones incompatibles por separado. No habrá fallback legacy permanente; durante desarrollo se mantienen las respuestas actuales hasta el cambio coordinado.

**Blocks the current task:** No; BC-IMP-2.1 define y tipa el contrato sin cambiar respuestas. La adaptación frontend y activación del contrato quedan para después de 2.2, 2.3 y 2.4, con despliegue coordinado.

### BC-IMP-2.1b — Análisis de Excel y contrato común

- **Estado:** análisis completado. La decisión preliminar de compatibilidad aditiva registrada aquí queda sustituida por BC-IMP-2.1: contrato definitivo único y despliegue backend/frontend coordinado.
- **Alcance revisado:** controllers, servicio, parser, specs manual y Excel; types/servicios/vistas frontend `ImportPage.vue` y `ImportDiscs.vue`; rutas, roles y respuesta HTTP. No se ejecutaron pruebas, llamadas de API/importaciones ni accesos a base de datos.
- **Conclusión:** Excel ya continúa y devuelve filas con errores para validaciones, referencias, duplicados y excepciones de fila; no necesita que se reescriba esa política para todos los casos. Sí necesita estado duplicate separado, éxito por fila con IDs, ubicación Excel inequívoca, fallas seguras y distinción entre aislables y sistémicas. La escritura Artist→Disc puede ser parcial, por lo que comparte necesidad de transacción individual con manual.
- **Contrato analizado:** `data.results` en ambos; `inputIndex` base cero por secuencia de entrada especificada; `source` discriminada por formato; estado/nombres/IDs/reasonCode/mensaje común. La recomendación inicial de mantener proyecciones legacy era preliminar y queda reemplazada por el contrato definitivo de BC-IMP-2.1.
- **Verificación documental:** lectura estática y de pruebas; consumers directos frontend localizados; `git diff --check`.

### Tareas propuestas

#### BC-IMP-1 — Alinear la clave normalizada de Artist en ambos importadores (S, prioridad media)

- [x] **Completada (2026-10-15).** Ambos importadores usan `normalizeForSearch` para buscar y crear Artists; se conserva el nombre visible y el filtro opcional de Country de Excel.

- **Hallazgo:** IMP-F1.
- **Objetivo:** persistir `Artist.nameNormalized` con la normalización canónica ya usada por Artists Write.
- **Alcance:** ambos flujos calculan una clave con `normalizeForSearch` y la usan tanto en `findOne({ nameNormalized })` como al crear Artist. Manual continúa sin filtrar por Country; Excel conserva `countryId` como filtro cuando se informó País. Preservar el nombre visible, las relaciones y el response. Caracterizar acentos, `+`, espacios repetidos y combinación de casos.
- **Exclusiones:** unificar el filtro de Country de los dos importadores, cambiar duplicate lookup de Disc, Disc Write u otros consumers; reparar/deduplicar valores persistidos; schema/migraciones o contrato HTTP.
- **Dependencias/riesgos:** helper de Artists incorporado por BC-ART-1. Revisar import entre dominios y fijar comportamiento de caracteres compuestos. No se recalculan valores históricos; una Artist antigua cuya clave se guardó con la normalización previa puede no reutilizarse por la consulta canónica hasta reparar sus datos en una tarea independiente.
- **Criterios de aceptación:** ambos importadores encuentran Artists existentes por clave normalizada y guardan esa misma clave para Artist nuevo; `name` permanece sin normalizar; Excel mantiene el filtro opcional de Country; los QueryBuilders y criterios de Disc duplicado permanecen iguales; Disc conserva la asociación al Artist reutilizado/creado. **Verificado.**
- **Diferencias restantes documentadas:** manual no filtra Artist por Country mientras Excel añade `countryId` si se indicó; Disc duplicado manual usa `ILike` y no compara fecha, mientras Excel usa igualdad exacta y agrega `releaseDate` cuando la fecha se parsea. No se modificaron en esta tarea.
- **Pruebas añadidas/adaptadas:** specs manual y Excel cubren Artist existente por clave, Artist nuevo con diacríticos, `+`, espacios repetidos y combinación, conservación del valor visible y asociación del Disc.
- **Archivos:** ambos servicios y sus specs; eliminados el normalizador manual redundante y su spec; este roadmap.
- **Verificaciones realizadas:** import manual + Excel + Artists Write: 3 suites, 42 tests aprobados; Requests: 1 suite, 8 tests aprobados; `yarn --ignore-engines build` y `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobados. `git diff --check` se vuelve a ejecutar al cierre. Prettier se comprobó; el check integral informa formato pendiente en archivos manuales/specs y roadmap, y el mismo check falla sobre `HEAD` en esos archivos. Las regiones modificadas de TypeScript se formatearon con Prettier por rango para no reformatear código preexistente fuera de alcance; `excel-import.service.ts` pasa el check integral. Sin PostgreSQL ni servicios externos.
- **Tamaño:** S.

#### BC-IMP-2 — Procesar imports manual y Excel por disco con resultados parciales (tarea padre; L, prioridad media)

- **Hallazgos:** IMP-F2 e IMP-F6.
- [x] **Completada (2026-10-15).** Backend manual/Excel y adaptación frontend implementados según BC-IMP-2.1 a BC-IMP-2.5.
- **Objetivo:** procesar de manera independiente los registros manuales y las filas procesables de Excel, con un resultado inequívoco por entrada y sin atomicidad global.
- **Alcance realizado:** contrato común, transacciones individuales, continuidad manual y Excel por disco/fila y adaptación frontend del reporte. Se preservaron autenticación, rutas, entrada actual y reglas de duplicados.
- **Exclusiones:** transacción global, cambio de criterios de duplicado, normalización de Artist, corrección de fechas (BC-IMP-3/4), cambios de formato de plantilla, migraciones, reparación histórica, endpoint nuevo o versionado.
- **Dependencias/riesgos:** se completó la secuencia 2.1 → 2.2 → 2.3/2.4 → 2.5. La activación requiere desplegar backend y frontend coordinadamente; no desplegar por separado versiones incompatibles. Errores sistémicos/rollback incierto detienen el import; escrituras de transacciones anteriores pueden persistir y no siempre será posible devolver reporte si el proceso/HTTP falla. El despliegue coordinado queda como condición operacional antes de release, no como tarea de implementación abierta.
- **Criterios de aceptación globales:** cada registro reportable tiene un resultado ordenado e identificado por `inputIndex` y localización propia del formato; imported/duplicate/failed son distinguibles; fallos recuperables no revierten otros discos y se sigue cuando rollback es seguro; regla de duplicado permanece intacta; fallos globales siguen siendo HTTP errors seguros; frontend presenta resultados por entrada y errores globales por separado bajo el único contrato, sin mantener compatibilidad legacy permanente.
- **Verificaciones globales:** tests focalizados en mocks de ambos servicios/controllers y tests frontend existentes; consistencia transaccional, orden/índice/fuente, errores globales, build/typecheck, Prettier y `git diff --check` comprobados en las subtareas. Sin importaciones reales ni PostgreSQL/servicios externos. La publicación queda condicionada a despliegue coordinado.
- **Tamaño total:** L (S + M + M + S).

#### BC-IMP-2.1 — Definir el contrato único tipado de resultados (S, prioridad media)

- [x] **Completada (2026-10-15).** Contrato tipado compartido añadido; no se cambiaron respuestas HTTP ni se integró aún en los servicios/controllers.
- **Hallazgo:** IMP-F2 e IMP-F6.
- **Objetivo:** definir una única forma tipada para los resultados por entrada de Manual y Excel.
- **Tipos:** `src/catalog/import/dto/catalog-import-result.types.ts` exporta `CatalogImportResultItem`, las variantes discriminadas `CatalogImportImportedResult`, `CatalogImportDuplicateResult`, `CatalogImportFailedResult`, `CatalogImportResultSource`, `CatalogImportResultStatus`, `CatalogImportFailureReasonCode` y el contenedor `CatalogImportResultsData` (`{ results }`). Los éxitos y duplicados requieren nombres e IDs de Artist/Disc; los fallidos exigen `reasonCode`, admiten nombres/IDs disponibles y todos los resultados llevan índice, fuente y mensaje.
- **Contrato definitivo:** los dos flujos usan `data.results`. `inputIndex` es entero base cero y estable por orden de entrada; manual usa el índice original en `albums`, Excel el ordinal sobre filas emitidas por el parser. La fuente manual puede llevar `inputLine`; Excel lleva hoja y fila física. Códigos de fallo por entrada: `INVALID_INPUT`, `RE_RELEASE`, `REFERENCE_NOT_FOUND`, `PERSISTENCE_FAILED`. Fallos globales quedan fuera de results y usan error HTTP global seguro. Detalles y semántica en Contract finding.
- **Alcance realizado:** añadir tipos compartidos backend y documentar el contrato. Parsers manual/Excel siguen independientes; el contrato no unifica su parsing ni los criterios de duplicado.
- **Exclusiones:** integrar los tipos en servicios/controllers, cambiar sus respuestas HTTP actuales, modificar frontend, persistencia, transacciones, validaciones o reglas de duplicado. No se crean tests cosméticos para interfaces sin comportamiento ejecutable.
- **Criterios de aceptación:** ambos formatos pueden expresar imported/duplicate/failed con identificación de origen sin campos de localización ajenos al formato; resultados repetidos se distinguen por índice; reason codes solo se exigen para fallos; el contrato no admite datos internos en mensajes por su especificación documental; endpoints siguen respondiendo exactamente con sus shapes actuales en esta tarea.
- **Verificaciones realizadas:** `yarn --ignore-engines build` y `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json` aprobados; Prettier pasa sobre el archivo de tipos. No aplican tests focalizados porque solo se añadieron tipos sin comportamiento ejecutable. El check Prettier del roadmap falla por formato preexistente ya registrado en BC-IMP-1; no se reformateó el documento completo para evitar cambios ajenos. `git diff --check` aprobado. Sin tests/importaciones reales, DB o servicios externos.
- **Tamaño:** S.

#### BC-IMP-2.2 — Aislar escrituras y validar consistencia de cada disco (M, prioridad media)

- [x] **Completada (2026-10-15).** Ambos importadores realizan Artist/Disc lookup y persistencia de cada entrada con un QueryRunner independiente.
- **Hallazgo:** IMP-F2, IMP-F6.
- **Objetivo:** asegurar rollback de una entrada cuando falla después de crear/reutilizar Artist, en ambos formatos, sin revertir transacciones de otras entradas.
- **Alcance realizado:** `runCatalogImportTransaction` en `src/catalog/import/catalog-import-transaction.ts` abre, confirma o revierte y libera un QueryRunner por disco. En ambos flujos se obtienen repositorios de Artist y Disc desde el mismo `EntityManager` de ese runner. Quedan en la transacción la búsqueda/creación de Artist, su guardado, lookup de Disc y guardado de Disc. Cada commit queda independiente y no se abre una transacción por lote.
- **Operaciones fuera del límite:** Manual parsea fecha y línea, obtiene Country predeterminado y resuelve Genre/Country explícitos antes de abrir la transacción; Excel parsea el workbook, precarga Genre/Country y valida los campos/referencias antes de abrir cada transacción. Son lecturas/preparación sin escrituras de Artist/Disc. Los logs de inicio, parsing y validación quedan fuera; los logs de éxito y la composición del reporte ocurren después del commit y tampoco son reversibles.
- **Diferencias preservadas:** Manual continúa lanzando el primer error de referencia o persistencia y no entrega el reporte; los commits de registros previos permanecen. Excel conserva su `catch`/continuidad ante errores de operación de fila después de un rollback completado, y su response actual `{ created, errors }`. No se añadió `data.results` ni cambió el contrato HTTP. Criterios duplicate manual (ILike y Artist) y Excel (igualdad exacta Artist+Disc, fecha opcional) siguen intactos.
- **Límite de error transaccional:** los fallos al crear/conectar/iniciar/confirmar/liberar QueryRunner se propagan como `CatalogImportTransactionError`; en Excel salen del `catch` por fila y abortan la petición. Los fallos del callback con rollback completado conservan el comportamiento actual de cada importador. Si rollback falla, el wrapper conserva el error original y `rollbackError` y evita que Excel continúe. No se agregan reintentos ni se convierten errores de ciclo transaccional en errores recuperables. La versión instalada de TypeORM descarta el error de rollback dentro de `EntityManager.transaction`, por lo que el QueryRunner explícito hace visible ese fallo.
- **Exclusiones:** transacción global, cambiar forma de entrada/respuesta, reintentar automáticamente, capturar/continuar por filas todavía, cambiar duplicate lookup/normalización/fechas, cambiar Excel parser o plantilla.
- **Dependencias/riesgos:** depende de modelos/types de 2.1. Rollback debe confirmarse para clasificar error como aislado; una prueba simulada no garantiza comportamiento de PostgreSQL. Si rollback/conexión quedan inciertos, detener como fallo sistémico. Mantener writes Artist y Disc dentro del mismo manager también para éxito y duplicate lookup de cada fila.
- **Criterios de aceptación:** Artist nuevo y Disc exitoso se confirman juntos; fallo del guardado de Disc revierte el Artist recién creado cuando el rollback se confirma; Artist preexistente no se guarda ni elimina por fallo de otro registro; commits previos permanecen; manager usa repositorios transaccionales para todas las operaciones de Artist/Disc; duplicados y relaciones mantienen su semántica actual.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/import`: 10 suites, 89 tests aprobados; `yarn --ignore-engines test --runInBand src/identity/auth/__tests__/auth-rate.consumer.spec.ts`: 1 suite, 3 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; `git diff --check`. Prettier pasa en el helper transaccional, servicio Excel y spec de módulo. La versión HEAD anterior a esta tarea ya falla Prettier en el servicio/spec Manual y spec Excel; las secciones añadidas se formatearon por rango sin reformatear el resto. Sin PostgreSQL ni importaciones reales.
- **Tamaño:** M.

#### BC-IMP-2.3 — Procesar el lote manual con resultados parciales (M, prioridad media)

- [x] **Completada (2026-10-15).** Manual procesa y reporta cada álbum por separado; el endpoint activa el contrato definitivo.
- **Hallazgo:** IMP-F2.
- **Alcance realizado:** el servicio emite un elemento ordenado por cada índice de `albums`, con `inputIndex`, `source.kind: manual`, `inputLine` cuando es string, nombres/IDs disponibles, estado y mensaje seguro. `imported` se devuelve tras commit confirmado; el lookup existente Artist+Disc mantiene el criterio `ILike` y genera `duplicate`; línea inválida o incompleta produce `INVALID_INPUT`, re-release `RE_RELEASE`, Genre/Country ausente `REFERENCE_NOT_FOUND`. La respuesta ya no incluye `savedDiscs` ni `existingDiscs`; el controller mantiene el envelope `{ message, data }`, fija HTTP 201 y `data` contiene `{ results }`.
- **Validación y errores:** `albums` ausente/no-array, entrada que no puede transformarse como objeto, campo raíz inválido y fecha compartida inválida siguen rechazándose globalmente; `AlbumItemDto` conserva whitelist anidada con `@Allow`, y el servicio clasifica por posición los valores/IDs opcionales inválidos como `INVALID_INPUT`. Genre/Country inexistentes son fallos por fila; fallos técnicos de sus consultas y de Country predeterminado se convierten en error HTTP global seguro. La persistencia solo continúa como `PERSISTENCE_FAILED` para `QueryFailedError` con SQLSTATE PostgreSQL allowlist (`22001`, `22003`, `22007`, `22008`, `23502`, `23503`, `23514`) después de que el helper haya completado rollback y release. Errores desconocidos, códigos no permitidos (incluido `23505`, cuya semántica de duplicado no se infiere), errores de conectividad y fallos de connect/start/commit/rollback/release detienen el lote; nunca se inspeccionan mensajes SQL. No hay reintentos.
- **Límite y consistencia:** cada álbum mantiene su propio QueryRunner de BC-IMP-2.2; no se abre transacción global. Una fila recuperable revierte únicamente sus writes de Artist/Disc y deja continuar; commits anteriores se conservan. En fallo sistémico la API propaga error global sanitizado, no procesa filas restantes y no entrega un reporte parcial; el mensaje no afirma si la fila en curso se confirmó o revirtió.
- **Exclusiones:** Excel (2.4), transacción global, fallos sistémicos no recuperables, exponer detalle interno, cambios de normalización/duplicados, reglas de fecha BC-IMP-4.
- **Dependencias/riesgos:** depende de 2.1 (tipos disponibles) y 2.2 (atomicidad por entrada). La clasificación continuable está ligada a SQLSTATE de PostgreSQL; las pruebas usan QueryRunner/repositorios simulados y no validan códigos ante una instancia real. Si el backend se despliega con el contrato nuevo sin la adaptación frontend, las versiones son incompatibles; la activación requiere despliegue coordinado según el padre BC-IMP-2. Si un error sistémico impide responder, commits previos pueden persistir sin que el usuario reciba sus resultados.
- **Criterios de aceptación:** la respuesta procesada contiene exactamente un resultado por entrada indexable, conserva el orden y permite distinguir títulos repetidos por `inputIndex`/`inputLine`; 30 entradas con 3 duplicadas, 2 fallidas y 25 correctas reportan 25 `imported`, 3 `duplicate` y 2 `failed`; resultado incluye código estable y mensaje seguro cuando falla; inputs globalmente inválidos conservan error HTTP; una fila solo continúa tras rollback confirmado y error allowlisted; error sistémico detiene inmediatamente el lote; relaciones Disc-Artist y commits previos se conservan; el contrato definitivo no expone campos legacy.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/import/manual`: 6 suites, 44 tests aprobados; `yarn --ignore-engines test --runInBand src/catalog/import`: 11 suites, 97 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier check de los seis archivos Manual propios modificados; `git diff --check`. Solo mocks; sin PostgreSQL ni importaciones reales.
- **Tamaño:** M.

#### BC-IMP-2.4 — Adaptar Excel al resultado común sin rehacer su continuidad (S, prioridad media)

- [x] **Completada (2026-10-15).** Excel devuelve resultados estructurados por fila y distingue duplicados, fallos recuperables y errores sistémicos.
- **Hallazgo:** IMP-F6.
- **Contrato y alcance realizado:** `ExcelImportService` produce un `CatalogImportResultsData` con un `result` por cada `ParsedExcelRow` en orden. `inputIndex` es el ordinal base cero entre filas emitidas por el parser en orden de hoja/fila; `source` conserva `{ kind: 'excel', sheet, rowNumber }` con número físico de fila. Las filas vacías completas, cabeceras y hojas ocultas continúan excluidas por parser; una fila emitida con Artist o Disc ausente produce `failed/INVALID_INPUT`. `imported` y `duplicate` incluyen nombres/IDs de Artist y Disc; duplicados ya no se mezclan con fallos. `failed` utiliza los reason codes del contrato común y mensajes seguros.
- **Errores y consistencia:** se mantienen preloads de Genre/Country y el procesamiento secuencial; las referencias ausentes y los campos obligatorios faltantes son fallos de fila recuperables. La transacción por fila de BC-IMP-2.2 conserva Artist/Disc conjuntamente y no se crea transacción global. Solo un `QueryFailedError` con SQLSTATE allowlisted (`22001`, `22003`, `22007`, `22008`, `23502`, `23503`, `23514`) se convierte en `PERSISTENCE_FAILED`, y únicamente cuando el helper devuelve tras rollback y liberación confirmados. Errores desconocidos, códigos no permitidos (incluido `23505`), fallos de conexión/ciclo de QueryRunner, rollback o liberación detienen el lote con HTTP 500 seguro; los mensajes SQL/driver no se devuelven y no se reintenta. Error de lectura del workbook sigue siendo global para BC-IMP-4.
- **Contrato HTTP:** `POST /api/catalog/import/excel`, multipart `file`, permisos y status de éxito permanecen; `@Post()` conserva el HTTP 201 por defecto. La respuesta ahora es `{ data: { results } }`, retirando `{ created, errors }` y sin añadir un mensaje nuevo. La adaptación frontend debe activarse con este backend en un despliegue coordinado; no desplegar versiones incompatibles por separado.
- **Rendimiento observado:** Genre y Country se consultan una vez cada uno antes del bucle y se usan mapas en memoria. Cada fila importable mantiene una búsqueda de Artist, una búsqueda de Disc y un QueryRunner/transacción individual, además de los saves que correspondan; el bucle no se paraleliza. La prueba simulada de 150 filas confirma que el cambio no añade consultas de referencia ni consultas por fila nuevas. No hay evidencia para optimizar esas operaciones ni para añadir cache; no se midió con PostgreSQL.
- **Exclusiones:** reimplementar loop/continuidad que ya existe; cambiar regla exacta de duplicate lookup (Artist+Disc y fecha opcional), normalización de Artist, aceptación de fecha (BC-IMP-3), clasificación de workbook ilegible/status global (BC-IMP-4/IMP-F5), columnas/plantilla, atomicidad global.
- **Dependencias/riesgos:** depende de 2.1 (tipos compartidos) y 2.2 (atomicidad por entrada). La allowlist de SQLSTATE se prueba con mocks; no se validó ante PostgreSQL real. El 23505 y los errores desconocidos no se atribuyen a una fila porque su causa no se puede determinar con seguridad; por tanto, un caso concurrente no clasificable interrumpe el lote y no se presenta falsamente como `failed`. El contrato nuevo es incompatible con consumidores frontend antiguos hasta el despliegue coordinado.
- **Criterios de aceptación:** cada `ParsedExcelRow` tiene exactamente un resultado con índice estable; hoja/fila distinguen ubicaciones repetidas entre sheets; duplicado incluye Artist/Disc IDs y no aparece como `failed`; validación y referencias ausentes continúan; fallo de persistencia solo continúa tras rollback/liberación confirmados y clasificación allowlisted; fallo sistémico detiene el procesamiento restante con error global seguro; transacciones y orden individuales se conservan; no se exponen mensajes SQL ni campos legacy.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/import/excel`: 4 suites, 55 tests aprobados; `yarn --ignore-engines test --runInBand src/catalog/import`: 11 suites, 101 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier check de los cuatro archivos Excel modificados; `git diff --check`. Se añadieron casos con 150 filas y mocks; sin PostgreSQL ni importaciones reales.
- **Tamaño:** S.

#### BC-IMP-2.5 — Adaptar el frontend al contrato único de importación

- [x] **Completada en frontend (2026-10-15).** Estado registrado tras inspeccionar implementación, pruebas existentes y roadmap del frontend; ese repositorio no se modificó durante BC-IMP-3.
- **Evidencia:** `riffvalley-app-front/src/services/imports/imports.ts` consume `data.results` para Excel y rechaza la forma legacy; `src/views/importPage/ImportDiscs.vue` presenta conteos, estados y hoja/fila; `src/services/imports/imports.test.ts` y `src/views/importPage/importResults.test.ts` caracterizan contrato, orden, estados y localización. `roadmap/catalog-import.md` registra esta tarea como completada y requiere despliegue coordinado.
- **Resultado:** ambas vistas consumen el contrato definitivo sin fallback legacy y distinguen importados, duplicados omitidos y fallidos. Los errores sistémicos seguros advierten sobre escrituras anteriores; backend y frontend deben desplegarse coordinadamente.
- **Verificación en esta tarea:** revisión estática de los archivos y pruebas citados; no se ejecutaron tests frontend.

#### BC-IMP-3 — Distinguir fecha Excel opcional de fecha inválida (S, prioridad media)

- [x] **Completada (2026-10-15).** Excel diferencia fecha vacía, válida e inválida sin cambiar la respuesta HTTP.
- **Hallazgo:** IMP-F4.
- **Reglas implementadas:** el parser conserva `null` para valores vacíos (incluidos espacios), conserva objetos `Date` válidos que ExcelJS entrega para celdas de fecha y acepta los formatos textuales previos solo si su calendario existe. Valida componentes antes de crear fechas día/mes/año, ISO y mes textual; no hay rollover para días o meses imposibles. Celdas con tipo no admitido, fechas ilegibles y objetos `Date` inválidos quedan marcados `INVALID_DATE` en el resultado del parser. Los seriales numéricos con formato de fecha se convierten a `Date` por ExcelJS y conservan su fecha; números sin formato de fecha y otros tipos no admitidos se rechazan como entrada inválida.
- **Resultados:** el servicio convierte una fecha inválida en `failed/INVALID_INPUT`, mensaje seguro y `source` con hoja y fila física; omite la persistencia de esa fila y continúa con las siguientes. Fecha ausente sigue siendo opcional y se guarda como `releaseDate: null`. No se alteró el envelope ni el status HTTP de Excel.
- **Exclusiones:** fechas obligatorias, nuevos formatos de plantilla, cambios de headers/columnas, reglas de duplicado, parser/validación manual y BC-IMP-4 (errores globales de workbook).
- **Verificaciones:** `yarn --ignore-engines test --runInBand src/catalog/import/excel`: 4 suites, 65 tests aprobados; `yarn --ignore-engines test --runInBand src/catalog/import`: 11 suites, 111 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier sobre parser/specs y servicio/spec Excel; `git diff --check`. Sin PostgreSQL ni importaciones reales.
- **Tamaño:** S.

#### BC-IMP-4 — Validar fechas manuales y clasificar workbook ilegible (S, prioridad media)

- [x] **Completada (2026-10-15).** Fechas compartidas manuales estrictas y errores de workbook clasificados sin convertir errores internos en 400.
- **Hallazgos:** IMP-F3 e IMP-F5.
- **Fechas manuales:** `parseManualDate` acepta el formato de mes inglés completo, día y año de cuatro cifras que ya usa el flujo, y comprueba que los componentes forman una fecha real sin rollover. Devuelve `null` para fechas imposibles, malformadas o que producirían `Invalid Date`; el servicio responde `BadRequestException` con mensaje seguro antes de consultar catálogos o iniciar escrituras. `date` continúa siendo requerido por el DTO. No existe campo de fecha por álbum, por lo que no se inventó un fallo individual; si se añade en otro contrato, su clasificación requerirá una decisión independiente.
- **Workbook Excel:** archivo ausente y buffer vacío/inválido reciben 400. El parser emite `InvalidExcelWorkbookError` para firma que no es ZIP, errores conocidos de estructura ZIP, manifest workbook ausente/malformado reconocido y workbook sin hojas. El controller traduce únicamente ese error tipado a un 400 seguro. Excepciones no reconocidas de ExcelJS y fallos inesperados se propagan como errores de servidor; no se convierten indiscriminadamente todos los errores de librería en errores de cliente. No se cambió el procesamiento de filas ni el parser de fechas Excel de BC-IMP-3.
- **Contratos y exclusiones:** se preservan `data.results`, mensajes de resultado por disco/fila, rutas, permisos y status de éxito; fecha Excel sigue opcional. Sin cambios al frontend, criterios duplicate, importación secuencial, esquema o migraciones. El frontend ya muestra los errores globales aprobados según BC-IMP-2.5; el contrato actualizado backend/frontend requiere despliegue coordinado.
- **Criterios comprobados:** se acepta fecha válida e incluyendo 29 de febrero en año bisiesto; se rechazan días/meses inexistentes, años no bisiestos, texto malformado e `Invalid Date`; fecha raíz inválida no toca repositorios. Workbook válido continúa; archivo ausente, vacío, no ZIP, ZIP truncado o sin hojas se clasifica como 400; fallo desconocido conserva el camino de servidor.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/import/manual`: 6 suites, 51 tests aprobados; `yarn --ignore-engines test --runInBand src/catalog/import/excel`: 4 suites, 76 tests aprobados; `yarn --ignore-engines test --runInBand src/catalog/import`: 11 suites, 129 tests aprobados; build y typecheck aprobados; Prettier sobre los ocho archivos TypeScript propios; `git diff --check`. Sin PostgreSQL, APIs ni importaciones reales.
- **Hallazgos fuera de alcance:** la fecha individual no existe en `AlbumItemDto`; las fechas por fila de Excel permanecen bajo BC-IMP-3. El límite de upload/MIME y clasificación de errores de generación de plantilla siguen fuera de BC-IMP-4, según el alcance aprobado.
- **Tamaño:** S.

### Hallazgos sin tarea

- **Reglas distintas de resolución y duplicate:** manual usa `ILike` y omite fecha en la búsqueda de Disc; Excel usa igualdad exacta y condición de fecha opcional. Está demostrado, pero no hay evidencia de qué identidad de álbum representa un mismo Disc cuando varían mayúsculas, Country o releaseDate. No unificar semánticas sin decisión de dominio.
- **Cabeceras Excel posicionales:** el template define siete encabezados y el parser ignora nombres. El spec caracteriza explícitamente headers arbitrarios; no se detectó un fallo de consumer ni se propone cambiar el formato legacy.
- **Error de persistencia Excel por fila:** se captura y continúa intencionalmente y existe prueba de escrituras previas/posteriores; no se propone atomicidad del workbook completo. La posible Artist huérfana si falla el guardado de Disc no se verificó con DB real y no justifica tarea separada frente al flujo de revisión de Artists.
- **Tamaño/MIME del upload:** `FileInterceptor` no configura límites explícitos, pero no se inspeccionaron límites globales de Express/Multer ni patrones de carga. Se registra para decidir límites con datos de operación, sin tarea de seguridad inferida.
- **Plantilla y logging:** hay `console.log/error` de diagnóstico y envío de error de generación de plantilla con texto de excepción. Son hechos de calidad, pero no se crea tarea de cleanup aislada sin impacto actual demostrado.

**Verificaciones de BC-IMP-0:** lectura estática del módulo, entidades/normalizadores relevantes, composición, consumers directos y specs existentes; coherencia de estados/tareas del roadmap; `git diff --check`. No se modificó código, tests ni fixtures; no se ejecutaron tests/E2E, importaciones reales, PostgreSQL, migraciones ni servicios externos. Discs, CatalogOverview y LastfmCatalog siguen pendientes.

## Auditoría 5 — Catalog / LastfmCatalog

**Estado:** completado (2026-10-15); BC-LFM-1 completada.
**Base observada:** rama actual, 2026-10-15. El checkout contiene cambios locales preexistentes en este roadmap y en Catalog Import; se conservaron. BC-LFM-1 modificó solo el controller, su spec y esta sección del roadmap.
**Alcance leído:** implementación completa de `src/catalog/lastfm/` y sus cuatro specs; composición de `AppModule`; métodos de `DiscsService` usados directamente y sus pruebas de delegación; referencias de entorno; lectura limitada de la interfaz de `LastfmIntegrationModule`/`LastfmApiService` y de sus specs para entender el límite. Se leyeron las pruebas sin ejecutarlas. No se auditó Lastfm Integration.

### Inventario, responsabilidades y dependencias

- `LastfmModule` compone `LastfmController`, `LastfmService`, `DiscModule`, `AuthModule` y `LastfmIntegrationModule`; no declara entidades ni repositorios propios. `AppModule` es su consumidor de composición conocido. No se encontraron otras llamadas directas a Lastfm Catalog.
- `GET /api/lastfm/artist?artist=...` no requiere rol y delega el payload sin transformación. `POST /api/lastfm/fill-images?month=...&year=...&week=...` requiere mínimo `superadmin`. Su DTO local convierte parámetros a número y valida mes 1–12, año desde 2020 y semana opcional >= 1. La validación global aplica whitelist, rechazo de campos desconocidos y transformación.
- `LastfmService` concentra dos flujos pequeños y cohesionados: delega la consulta de artista y coordina el enriquecimiento semanal de discos. Para imágenes verifica configuración, pide candidatos sin imagen a `DiscsService`, consulta Last.fm por artista/álbum y persiste cada URL mediante `DiscsService.updateImage`. No accede directamente a TypeORM ni repite consultas de catálogo.
- `DiscsService` delega las operaciones de enriquecimiento a `DiscEnrichmentService`, que selecciona candidatos por rango de fechas semanal y ausencia de imagen y actualiza `Disc.image`. Esta dependencia mantiene las consultas y escrituras del catálogo dentro de Discs.
- La frontera observada es suficiente: Catalog controla selección/orquestación/persistencia de negocio mediante Discs; Integration ofrece `assertConfigured`, `getArtistInfo` y `getAlbumImage` para la comunicación externa. Lastfm Catalog no construye URLs ni interpreta el protocolo HTTP/JSON.
- Dependencia de configuración: `LASTFM_API_KEY` aparece en `.env.template`; su validación ocurre al ejecutar los métodos del provider, antes de la búsqueda semanal. No se encontraron otras referencias de configuración específicas de Catalog.
- En la lectura acotada de Integration, `getArtistInfo` propaga errores HTTP/provider como `BadRequestException`; `getAlbumImage` convierte ausencia, error HTTP, red o JSON inválido a `null`. Catalog conserva esa semántica y un fallo de `updateImage` rechaza la operación agregada. La calidad de esos contratos y respuestas pertenece a la auditoría independiente de Integration.
- No hay entidades/migraciones ni consultas TypeORM propias de Lastfm Catalog. No se observó duplicación o código muerto demostrable que justifique cleanup estructural.

### Pruebas existentes y cobertura consultada

- `lastfm.module.spec.ts` caracteriza el cableado Nest de Catalog, Auth e Integration.
- `lastfm.controller.spec.ts` caracteriza rutas, verbos, ausencia de guarda en lectura pública, rol `superadmin` en la operación de escritura y, tras BC-LFM-1, el rechazo de parámetros inválidos y la delegación/payload para nombres válidos.
- `lastfm.service.spec.ts` caracteriza delegación del payload de artista, candidatos vacíos, orden de llamada de configuración, consulta semanal, imagen encontrada/no encontrada y persistencia. No caracteriza fallos de escritura, candidatos múltiples con respuestas fuera de orden o fallo parcial de la operación agregada.
- `lastfm-api.service.spec.ts` se leyó solo para entender la interfaz de dependencia; no se tomó como auditoría de Integration.
- No se ejecutaron tests, llamadas a Last.fm ni consultas a PostgreSQL.

### Hallazgos

#### LFM-F1 — La consulta pública de artista no valida el parámetro requerido

**Estado:** resuelto por BC-LFM-1 (2026-10-15).

- **Ubicación:** `src/catalog/lastfm/lastfm.controller.ts:18-20`; dependencia observada en `src/integrations/lastfm-integration/lastfm-api.service.ts:23-27, 64-72`.
- **Evidencia (hecho):** el controller recibe `@Query('artist') artist: string` sin DTO, pipe o comprobación. La integración construye la URL usando `encodeURIComponent(value)`; si el parámetro está ausente, el valor no se valida antes de producir la solicitud externa. El spec de controller comprueba ruta y exposición pública, pero no el input.
- **Consecuencia:** la ruta puede gastar una solicitud externa en un nombre ausente, vacío, whitespace o repetido/multivalor y devolver un error originado por Last.fm en vez de rechazar una petición local malformada. No se confirmó qué consumidor frontend usa la ruta ni si envía estos valores.
- **Categoría / prioridad / tamaño:** bug funcional de validación; media; S.
- **Propuesta:** validar en el límite del controller que `artist` sea un único string no vacío (rechazar whitespace-only) y responder HTTP 400 antes de llamar al servicio. Mantener sin transformación los nombres válidos para preservar el valor que se consulta. Añadir cobertura del parámetro ausente, vacío/whitespace, multivalor y nombre válido.
- **Dependencias y riesgos:** revisar el consumidor HTTP disponible antes de implementar; frontend no está en este checkout y el uso concreto permanece no confirmado. Cambia el error observable solo para entradas inválidas; conservar ruta, permisos públicos y respuesta para entradas válidas. No cambiar el tratamiento de errores/respuestas de Last.fm, que corresponde a Integration.
- **Hecho frente a hipótesis:** falta de validación y envío del argumento a la dependencia comprobados estáticamente; que algún consumer actual envíe entradas inválidas no está confirmado.

### Contract finding — LFM-F1

**Current behavior:** `GET /api/lastfm/artist` no valida `artist`; los valores inválidos se envían a Last.fm y el error devuelto depende del provider.

**Problem:** una petición local incompleta o multivalor genera tráfico externo y un error externo en lugar de una respuesta de validación clara.

**Impact:** backend + frontend; el consumer frontend y su comportamiento no se confirmaron en este repositorio.

**Options:**

1. Preservar el comportamiento actual para entradas inválidas.
2. Añadir validación interna del controller con HTTP 400, conservando el contrato para nombres válidos.
3. Definir otro contrato de error o cambiar la forma de respuesta.
4. Coordinar una adaptación backend/frontend si el inventario del consumer encuentra solicitudes inválidas.

**Recommendation:** opción 2; evita solicitudes externas inútiles y no cambia el contrato válido. Confirmar el consumer antes de implementación y coordinar solo si depende del comportamiento inválido actual.

**Blocks the current task:** No; la auditoría termina con el hallazgo y la tarea queda pendiente.

### Tareas propuestas

#### BC-LFM-1 — Validar `artist` en la consulta pública de Last.fm (S, prioridad media)

- [x] **Completada (2026-10-15).** El controller rechaza valores ausentes, no string, vacíos y whitespace-only con `BadRequestException` HTTP 400 antes de llamar a LastfmService. No transforma ni normaliza nombres válidos.
- **Hallazgo:** LFM-F1.
- **Alcance realizado:** validación de string único no vacío/no whitespace en `lastfm.controller.ts`; la comprobación acepta espacios internos, Unicode y símbolos, y pasa el valor válido intacto a LastfmService. Se conserva ruta, exposición pública y payload devuelto por el servicio.
- **Exclusiones:** cambios a respuestas válidas, permisos, protocolo o errores del provider; cambios en Lastfm Integration; nuevos endpoints; adaptación frontend automática; cambios a fill-images o consultas de Discs.
- **Consumidores:** no se encontraron consumidores directos del endpoint en backend fuera de su controller/spec; el frontend no está disponible en este checkout.
- **Criterios verificados:** ausente, vacío, espacios, tab/newline, multivalor y objeto reciben HTTP 400 y no llaman al servicio; nombres con espacios internos y con Unicode/símbolos se delegan sin cambios y devuelven por identidad el payload del servicio; ruta y permisos siguen caracterizados.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/lastfm/lastfm.controller.spec.ts` — 1 suite, 9 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit -p tsconfig.build.json`; Prettier check de los dos archivos Lastfm modificados; `git diff --check`. Sin llamadas a Last.fm, PostgreSQL ni otros servicios externos.
- **Tamaño:** S.

### Hallazgos sin tarea

- `fillWeeklyImages` procesa candidatos concurrentemente con `Promise.all`; `notFound` se añade según el orden de respuesta y no necesariamente el orden de la consulta. No hay requisito ni evidencia de consumer que demuestre que el orden sea contractual, por lo que no se propone cambiar concurrencia ni respuesta.
- Los errores de consulta/persistencia de un disco rechazan la operación agregada aunque otras escrituras concurrentes puedan completarse. Es una consecuencia visible del flujo, pero no hay evidencia de fallo operativo ni definición de resultados parciales que justifique convertirlo en una tarea de Catalog; una decisión futura necesitaría caracterizar el contrato y clasificar errores con evidencia.
- La validación de shape de respuestas, HTTP/red/JSON y tipado del payload opcional de artista pertenecen a Lastfm Integration y quedan expresamente fuera de BC-LFM-0.
- No se justifica extraer servicios/helpers ni mover código: la responsabilidad de Catalog es pequeña y coherente y las dependencias respetan los límites actuales.

**Verificaciones de BC-LFM-0:** revisión estática completa de `src/catalog/lastfm/`, composición, consumers directos conocidos, operaciones de Discs usadas, referencias de configuración y specs existentes; lectura limitada de la dependencia Lastfm Integration; coherencia del roadmap; `git diff --check`. En BC-LFM-0 no se modificó producción, tests ni fixtures ni se ejecutaron tests/E2E, PostgreSQL o servicios externos. **Cierre de BC-LFM-1:** implementación y verificaciones registradas arriba; LFM-F1 resuelto y sin tareas Lastfm Catalog pendientes. En el cierre histórico de BC-LFM-0, Discs y CatalogOverview aún estaban pendientes; CatalogOverview se completó después y Discs queda auditado en BC-DIS-0. Lastfm Integration conserva su estado pendiente para auditoría propia.

## Auditoría 6 — Catalog / CatalogOverview

**Estado:** completado (2026-10-15); BC-OVR-0 y BC-OVR-1 completadas; OVR-F1 resuelto.
**Base observada:** rama `refactor/editorial`, 2026-10-15. El registro previo de BC-OVR-0 se conserva; BC-OVR-1 se completó en el frontend y sus verificaciones pasaron.
**Alcance leído:** implementación completa de `src/catalog/overview/`, composición en `AppModule` y `main.ts`, entidades de Genre/Country, contratos y dependencias pertinentes de Genres/Countries; búsqueda estática de consumers backend y frontend; spec de CatalogOverview y suites de módulos dependientes pertinentes. Se revisaron consumers del frontend en el checkout vecino, sin modificarlo. No se ejecutaron tests ni se contactó PostgreSQL o servicios externos.

### Inventario, arquitectura y contratos

- `CommonModule` registra `CatalogController` y `TypeOrmModule.forFeature([Genre, Country])`; `AppModule` importa el módulo. No hay servicio ni DTO propios. No se encontraron otros imports de `CatalogController` o `CommonModule` en producción.
- `GET /api/catalog` es la única ruta de Overview, pública y sin parámetros. Consulta ambos repositorios en paralelo con `find({ order: { name: 'ASC' } })` y devuelve `{ genres, countries }`. No proyecta ni transforma las entidades; devuelve sus campos escalares (Genre: `id`, `name`, `color`; Country: `id`, `name`, `isoCode`). Las relaciones inversas `Genre.disc` y `Country.artist` no son eager y no se cargan en esta consulta.
- Las llamadas de repositorio son lecturas de dos catálogos independientes. No se encontró lógica de dominio duplicada: CRUD y validación siguen en Genres/Countries y Overview únicamente compone sus resultados. El módulo consulta repositorios directamente, pero no importa sus módulos ni servicios; no hay ciclo Nest ni dependencia circular observada. La frontera evita acoplar un endpoint agregado al paginado individual de los dos recursos.
- El contrato fija orden ascendente de base de datos por `name`; el spec confirma las opciones exactas y la respuesta directa. Si ambas consultas no encuentran datos se devuelven dos arrays vacíos. Si cualquiera rechaza, `Promise.all` rechaza la petición completa y Nest trata el error; no hay traducción específica. No recibe entrada que requiera validación.
- Consumers backend directos del agregado no encontrados fuera del controller y su spec. Los consumidores frontend centralizan la petición en `src/services/catalog/catalog.ts` y `useCatalogStore` (`App.vue` inicia la carga; el store evita repetirla tras `loaded`). Las vistas identificadas consumen ese store en DiscCalendar, DiscList, DiscListError, HomePage, ImportPage, SuggestPage, PetitionsPage, DiscCalendarBaby y GenrePlaylistManager. Otros consumidores encontrados usan `/genres` o `/countries` directamente y no dependen de Overview.
- El spec existente comprueba metadata de ruta y método, ausencia de guards, shape, opciones de orden, resultado vacío e inyección Nest de ambos repositorios. No caracteriza fallos de una de las consultas por separado ni el comportamiento cuando solo uno de los catálogos está vacío. El flujo de código demuestra el rechazo agregado y el retorno independiente de arrays vacíos; no se encontró impacto práctico que justifique ampliar la suite durante esta auditoría.

### Hallazgos

### Contract finding

**Current behavior:** `GET /api/catalog` serializa directamente Genre y Country; el backend permite `null` en `Genre.color` y `Country.isoCode`, mientras el cliente frontend los tipa como `string`.

**Problem:** el tipo del cliente afirma una garantía que la entidad/API no ofrece. No se confirmó que haya registros actuales con esos valores nulos ni un fallo runtime.

**Impact:** frontend-only.

**Options:**

1. Preservar compatibilidad, dejando las declaraciones TypeScript actuales.
2. Refactorizar internamente el backend, sin resolver la discrepancia del cliente.
3. Cambiar el contrato HTTP para hacer esos campos no nulos o normalizarlos, lo que alteraría datos/respuestas.
4. Coordinar un refactor backend/frontend, si se decide cambiar la nulabilidad efectiva del API.

**Recommendation:** conservar el contrato y ajustar solo los tipos frontend a nullable; es la opción de menor alcance y refleja el esquema existente. BC-OVR-1 completó ese cambio.

**Blocks the current task:** No; CatalogOverview puede quedar auditado sin cambiar su comportamiento.

#### OVR-F1 — Tipos frontend no reflejan la nulabilidad de los campos del agregado (resuelto)

- **Ubicación:** `src/catalog/genres/entities/genre.entity.ts:12-13`, `src/catalog/countries/entities/country.entity.ts:11-12`; tipos del consumidor en `../riffvalley-app-front/src/services/catalog/catalog.ts:1-12`.
- **Evidencia comprobada:** Genre declara `color` como columna nullable y Country declara `isoCode` como columna nullable. La interfaz frontend `Genre` y `Country` del servicio de `/catalog` los declara como `string`, sin `null`. El controller devuelve directamente las entidades, por lo que no normaliza ni excluye dichos nulls. No se consultó la base de datos y no se afirma que existan actualmente filas con esos valores nulos.
- **Consecuencia:** el consumidor TypeScript describe una respuesta más estricta que la permitida por el backend. Si una fila contiene `null`, el frontend compila suponiendo un string; futuras operaciones sin comprobación podrían fallar o manejar mal ese valor. No se identificó un fallo runtime actual atribuible a este contrato.
- **Categoría / prioridad / tamaño:** contrato; baja; S.
- **Propuesta:** alinear los tipos de `Genre.color` y `Country.isoCode` del servicio agregado a `string | null` y atender los errores de tipos resultantes en sus callsites; mantener intacta la respuesta HTTP y sus campos.
- **Dependencias y riesgos:** tarea frontend independiente; requiere revisar sus consumidores del store y ejecutar typecheck/tests frontend. No cambia datos, campos ni semántica backend. No requiere coordinación de despliegue porque solo corrige tipos estáticos.
- **Hecho frente a hipótesis:** nulabilidad de entidades, shape sin transformación e interfaces no nullable son hechos del código. La presencia de null en datos operativos y un fallo runtime son posibilidades no verificadas.

### Tareas propuestas

#### BC-OVR-1 — Alinear nulabilidad de los tipos frontend de `/catalog` (S, prioridad baja)

- [x] **Completada en frontend (2026-10-15).** Se alinearon los tipos de `Genre.color` y `Country.isoCode` con la nulabilidad que permite el backend; las verificaciones frontend pasaron.
- **Alcance realizado:** tipos de `Genre.color` y `Country.isoCode` declarados como nullable y callsites adaptados donde fue necesario; se mantuvieron el payload y comportamiento de `/api/catalog`.
- **Exclusiones:** no cambiar entidades, validadores, datos, consultas, shape HTTP ni consumidores backend; no normalizar null a cadena vacía.
- **Dependencias:** OVR-F1; checkout del frontend `riffvalley-app-front`.
- **Criterios de aceptación:** tipos del cliente reflejan las columnas nullable; callsites manejan `null` donde haga falta; una respuesta compatible con el contrato del backend no requiere assertions no-null.
- **Verificaciones:** typecheck y pruebas frontend pertinentes, sin cambiar la respuesta backend.

### Hallazgos no convertidos en tareas

- No se propone extraer un servicio para dos consultas simples ni mover lógica de Genres/Countries. No hay acoplamiento circular, transformación duplicada ni query repetida dentro del caso de uso.
- La interfaz frontend ordena de nuevo por `localeCompare` los arrays ya ordenados por `name ASC` por la base de datos. No se demostró que esto cause trabajo relevante o un comportamiento incorrecto; no se convierte en tarea de optimización.
- El error de una consulta hace fallar toda la composición por `Promise.all`. Esa atomicidad del agregado es coherente con que ambas listas forman una única respuesta; no se encontró requisito para respuestas parciales.

**Verificaciones de BC-OVR-0/1:** BC-OVR-0 se verificó mediante revisión estática de controller, módulo, entidades, composición, consumers y tests existentes sin ejecución. BC-OVR-1 se realizó en frontend y sus verificaciones pasaron (detalle registrado por la tarea frontend). No se modificaron producción, tests, fixtures ni frontend durante BC-OVR-0 en este checkout. Sin PostgreSQL, migraciones ni servicios externos. OVR-F1 queda resuelto y CatalogOverview completado.

## Auditoría 7 — Catalog / Discs

**Estado:** completado (2026-10-15); BC-DIS-0, BC-DIS-1, BC-DIS-2, BC-DIS-3 y BC-DIS-4 completadas.
**Base observada:** rama `refactor/editorial`, 2026-10-15. Al inicio había una modificación local previa de este roadmap con el registro de CatalogOverview; se conservó y se sincronizó BC-OVR-1 según el resultado frontend indicado por el usuario. No se encontraron modificaciones locales en producción o pruebas.
**Alcance leído:** composición Nest y `src/catalog/discs/` completo (controller, módulo, fachada, entidad, servicios, DTOs, helpers, pruebas unitarias, pruebas de integración PostgreSQL existentes y baseline `D0-baseline.md`); validación global; entidades y consumers directos pertinentes en Catalog Import, Community y Editorial; llamada inversa desde Lastfm Catalog; integración Spotify. Se leyeron las pruebas pertinentes sin ejecutarlas. No se consultó frontend, base de datos, Heroku ni servicios externos.

### Inventario, arquitectura y contratos

- `DiscModule` registra `DiscsController`, la fachada `DiscsService`, `DiscCatalogService`, `DiscCalendarService`, `DiscHomeService`, `DiscWriteService`, `DiscEnrichmentService` y `DiscSpotifyService`. Registra `Disc`, `Artist`, `Genre` y `Country` con TypeORM, importa `AuthModule` y `SpotifyIntegrationModule`, y exporta solo `DiscsService`. `AppModule` compone `DiscModule`; TypeORM usa `autoLoadEntities`, `synchronize: false` y `migrationsRun: false`.
- La fachada delega lecturas de catálogo, calendario, estadísticas Home, escrituras, Spotify y enriquecimiento. Mantiene dos llamadas directas a `SpotifyPublicApiService`: resolver álbum (y traducir resultado vacío a 404) y obtener detalles. No hay repositorios ni consultas duplicadas en la fachada. Los servicios extraídos tienen una responsabilidad reconocible y no hay motivo para volver a dividirlos por tamaño.
- `DiscCatalogService` resuelve detalle, listado con filtros/agregados, selección aleatoria y opciones de filtros. `DiscCalendarService` sirve calendario autenticado/público, filtros públicos y grupos semanales. `DiscHomeService` compone ranking, estadísticas y loaders SQL. `DiscWriteService` crea/actualiza/elimina y puede resolver/crear Artist. `DiscEnrichmentService` encuentra discos sin imagen y actualiza imagen para Lastfm Catalog. `DiscSpotifyService` valida existencia del Disc y consulta tracks. Los helpers mapean filas SQL, estado personal, opciones, orden aleatorio y rangos semanales.
- No se observa ciclo de módulos Nest: `DiscModule` importa Auth y Spotify; `LastfmModule` importa Disc y consume su fachada, sin import inverso desde Disc. Hay acoplamiento de entidades entre Catalog y Community (Rate, Favorite, Pending, Comment) y Editorial (Asignation, NationalRelease y ContentScheduler); estos módulos inyectan directamente `Repository<Disc>` o el manager. También hay relación desde Genre. Catalog Import Manual/Excel inyecta Disc y Artist para importación. Otros consumers encontrados: Community Rates, Favorites, Pendings, Comments y Requests; Editorial National Releases, Asignations y ContentScheduler; Lastfm Catalog consume únicamente los métodos de enriquecimiento de la fachada. La frontera actual comparte entidad/repositorio, no servicios Nest de esos dominios.
- Los `ManyToOne` a Artist/Genre y `OneToMany` a Favorite/Pending/Comment son eager en `Disc`; Artist carga Country eager. Rates y Asignations no son eager. Los query builders definen las relaciones necesarias de forma explícita; en cambio `findOne` devuelve una entidad con el detalle de todas las colecciones y sus usuarios. Esa respuesta es observable y el consumidor frontend no se confirmó en esta revisión.
- Contratos actuales bajo prefijo `/api`: `POST /discs` requiere `riffvalley`; `POST /discs/with-artist` requiere cualquier usuario autenticado; `PATCH` y `DELETE /discs/:id` requieren `riffvalley`. Lecturas de listado, random, options, calendario autenticado y home requieren autenticación; calendario público, weekly, detalle, endpoints Spotify y filtros públicos no tienen `@Auth`. Los IDs de Disc usan `ParseUUIDPipe` en detalle, tracks, update y delete. Se observó que `src/catalog/discs/__tests__/D0-baseline.md` describe como públicas varias escrituras que el controller actual protege; la auditoría usa el código actual y no actualiza ese baseline fuera del alcance de edición.
- El controller acepta DTOs tipados por `ValidationPipe` global (`transform`, conversión implícita, whitelist y rechazo de propiedades desconocidas). Weekly, random, options y resolución Spotify tienen DTOs dedicados; listados usan `PaginationDto`. Errores conocidos: detalle/Spotify tracks y update ausentes traducen a 404; remove comprueba `affected`; `resolveSpotifyAlbum` devuelve 404 cuando no hay match. Los errores técnicos de queries se propagan al manejador Nest. `orderBy` valida el campo en el servicio, pero la dirección es un cast TypeScript y se entrega a TypeORM; no se observó una prueba de entrada inválida. No se eleva a tarea porque no se acreditó impacto de consumidor ni contrato de error concreto.
- La paginación principal usa `take/skip` en SQL y `getCount`; random selecciona IDs con `ORDER BY RANDOM()` y limita antes de hidratar, conservando el orden aleatorio al mapear. Calendario pagina en SQL, cuenta con `getManyAndCount` y consulta NationalRelease para los IDs de la página. Home está limitado a 20 resultados y ejecuta loaders independientes para totales, top usuarios, distribución y estadísticas globales. No se encontró paginación principal en memoria, ni evidencia de N+1 en los servicios revisados. Las llamadas Last.fm por candidato pertenecen a la coordinación de Lastfm Catalog, no a una consulta repetida de Discs.
- Hay query builders TypeORM en Catalog, Calendar, Options, Spotify tracks y Enrichment; Home y la carga de NationalRelease del calendario usan SQL parametrizada mediante `Repository.query`/`EntityManager.query`. Write usa repositorios `create/save/preload/delete`; no usa `EntityManager.transaction`.
- Cobertura existente: controller/fachada; Catalog (listado, filtros, count, raw mapping, random, options y detalle); Calendar (autenticado, público, filtros, weekly y helpers); Home (respuesta, mappers/loaders y siete suites PostgreSQL opt-in); Write; Enrichment; Spotify; DTOs; y helpers puros. Los tests caracterizan payloads, casos vacíos, filtros, orden de random, errores 404, y estados nulos/cero. Las pruebas PostgreSQL de ranking caracterizan deliberadamente fanout de relaciones, no un resultado corregido. Huecos relevantes para los hallazgos aparecen en las tareas siguientes. No se ejecutaron pruebas.

### Hallazgos

#### DIS-F1 — `POST /discs` no aplica los IDs de Artist y Genre al crear (resuelto en BC-DIS-1)

- **Ubicación:** `src/catalog/discs/write/disc-write.service.ts:29-36`; DTO `src/catalog/discs/dto/create-discs.dto.ts:34-40`; entidad `src/catalog/discs/entities/disc.entity.ts:51-55`; comparación con el mapeo explícito de `update` en `src/catalog/discs/write/disc-write.service.ts:57-76`.
- **Evidencia (hecho):** antes de BC-DIS-1, el DTO aceptaba `artistId` y `genreId`, pero `create` pasaba el DTO directamente a `Repository.create`. La entidad solo declara las relaciones `artist` y `genre`, no propiedades escalares `artistId`/`genreId`; el transformador `PlainObjectToNewEntityTransformer` de TypeORM copia columnas y propiedades de relación descritas en metadata, por lo que ignora esos dos nombres. En `update` sí se convierten explícitamente a `{ id }` para las relaciones. El spec previo de create usaba un mock que reflejaba el DTO completo y no verificaba con metadata real las relaciones guardadas. BC-DIS-1 lo corrigió y añadió la comprobación de metadata real descrita abajo.
- **Consecuencia:** una petición válida que incluya IDs puede crear el Disc sin las asociaciones solicitadas. No se afirma que haya ocurrido en producción.
- **Categoría / prioridad / tamaño:** bug funcional; alta; S.
- **Corrección aplicada:** mapear IDs presentes a las relaciones `{ id: artistId }` y `{ id: genreId }`, preservar campos escalares y el contrato de respuesta, y caracterizar create con relaciones ausentes/presentes.
- **Dependencias y riesgos:** no se añadieron consultas de existencia; la FK valida al persistir. No se cambió validación ni la forma HTTP.
- **Hecho frente a hipótesis:** el descuadre metadata/DTO y que el transformer omite propiedades desconocidas son hechos; pérdida de relación en una ejecución de DB real no fue reproducida en esta auditoría.

#### DIS-F2 — El ranking Home duplica discos e infla los conteos al unir estados personales (resuelto en BC-DIS-2)

- **Ubicación:** `src/catalog/discs/home/disc-home.service.ts:68-80,85-90`; caracterizaciones `src/catalog/discs/home/__tests__/home-ranking.postgres.spec.ts:271-299` y `src/catalog/discs/home/__tests__/home-personal-state.postgres.spec.ts:224-260`.
- **Evidencia (hecho):** la consulta agrega ratings y a la vez une Favorite/Pending del usuario. Agrupa por `f.id`, creando una fila por Favorite duplicado; sin agrupar por Pending, varias filas Pending multiplican las filas de Rate antes de `COUNT` y la fórmula de `weightedScore`. Las pruebas PostgreSQL insertan relaciones repetidas y esperan dos resultados para un Disc con dos Favorites y `voteCount=4` cuando una fila adicional Pending duplica dos ratings a cuatro. Las entidades no declaran unique compuesto Disc+User.
- **Consecuencia:** la respuesta de `GET /api/discs/homeDiscs` puede repetir un mismo álbum y presentar voteCount/weightedScore incorrectos cuando hay estados duplicados; el `LIMIT 20` puede ocupar cupos con repeticiones.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Corrección aplicada:** quitar los JOIN de Favorite/Pending de la consulta que agrega Rate y agrupar una sola vez por Disc. Las subconsultas personales `LIMIT 1` conservan el shape y, ante Favorites duplicados, seleccionan uno de sus IDs conforme a la semántica ya existente. Se añadió `d.id ASC` para que el límite de 20 tenga un desempate estable.
- **Agregados:** `voteCount` sigue contando registros Rate con `rate` no nulo; `averageRate`, `averageCover` y `weightedScore` usan las filas Rate reales, sin que la cardinalidad de Favorite/Pending las replique.
- **Dependencias y riesgos:** no se añade restricción de esquema ni migración. El ID elegido entre Favorites duplicados sigue siendo indeterminado por el `LIMIT 1` existente. Los fixtures muestran la semántica de la query, pero no la frecuencia de duplicados en los datos operativos.
- **Hecho frente a hipótesis:** el fanout y sus resultados están comprobados en specs PostgreSQL existentes; la ocurrencia en producción no está confirmada.

#### DIS-F3 — El DTO de creación deja pasar fechas inválidas y flags sin validar (resuelto en BC-DIS-3)

- **Ubicación:** `src/catalog/discs/dto/create-discs.dto.ts:42-52`; caracterización explícita `src/catalog/discs/dto/create-discs.dto.spec.ts:71-80`; configuración de transformación en `src/main.ts:36-42`.
- **Evidencia (hecho):** en `CreateDiscDto`, `releaseDate` solo tenía `@IsOptional`, y `ep`, `debut` y `featured` no declaraban validador de tipo. El `ValidationPipe` global convierte implícitamente strings a `Date` y booleanos; una fecha inválida llegaba como `Invalid Date` aceptada y una cadena como `"false"` se convertía a `true`. `CreateDiscWithArtistDto` usa otro DTO: `@IsDateString()` no activaba validación ISO estricta y sus flags booleanos también sufrían conversión implícita.
- **Consecuencia:** la ruta autenticada `POST /api/discs` acepta una fecha inválida hasta persistencia, donde puede generar un error de base de datos en vez de un 400 de validación; los flags no tienen validación explícita de booleano. `UpdateDiscDto` hereda la misma metadata incompleta mediante `PartialType`.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Corrección aplicada:** validar la fecha `Date` transformada y marcar como inválida una fecha ISO con día imposible antes de que la conversión de JavaScript la normalice; usar `@IsDateString({ strict: true })` en la creación con artista. Validar los tres flags con `@IsBoolean()` y recuperar el valor crudo del body antes de validar, evitando que la conversión implícita acepte strings o números.
- **Opcionalidad:** `@IsOptional()` conserva la omisión y `null` admitidos previamente; `UpdateDiscDto` sigue siendo parcial por `PartialType`.
- **Hecho frente a hipótesis:** la aceptación de `Invalid Date`, la ausencia de validadores y la conversión implícita son hechos del pipeline y sus pruebas; el error concreto de persistencia no se provocó.
- **Hecho frente a hipótesis:** aceptación validada de `Invalid Date` y ausencia de decorators de flags son hechos; un error concreto de persistencia no se provocó.

#### DIS-F4 — `createWithArtist` podía dejar un Artist persistido sin Disc (resuelto en BC-DIS-4)

- **Ubicación:** `src/catalog/discs/write/disc-write.service.ts:39-54,93-132`; pruebas de mapping/resolución en `src/catalog/discs/write/disc-write.service.spec.ts:452-751`.
- **Evidencia (hecho):** si no existe Artist coincidente, `resolveArtist` lo guarda antes de construir y guardar el Disc. Las operaciones usan repositorios separados sin manager transaccional; las pruebas cubren resolución y mapping exitosos, no el fallo de `discRepository.save` después de persistir un Artist nuevo.
- **Consecuencia:** si falla el segundo guardado, la operación HTTP falla pero el Artist creado en el primero permanece sin el álbum que motivó la operación. No afecta el caso de reutilizar un Artist existente.
- **Categoría / prioridad / tamaño:** bug funcional (atomicidad); media; S.
- **Corrección aplicada:** `createWithArtist` realiza la resolución/creación de Artist y el guardado de Disc dentro de `discRepository.manager.transaction`; ambos repositorios se obtienen del `EntityManager` de la transacción. El error se propaga para que TypeORM revierta ambas escrituras.
- **Resultado:** si el Artist ya existe, se reutiliza sin guardarlo ni alterarlo; si es nuevo y falla el Disc, se revierte el Artist. Se mantienen búsqueda case-insensitive, normalización, desambiguación por `countryId`, datos opcionales y contrato HTTP.
- **Verificación y límite:** pruebas focalizadas cubren éxito con Artist existente/nuevo, fallos de Artist, Disc y transacción, rollback y procedencia del manager. PostgreSQL no estaba escuchando en `localhost:5432`; la prueba comprueba el límite transaccional mediante estado aislado simulado, no mediante INSERT/ROLLBACK real del driver.
- **Hecho frente a hipótesis:** el flujo transaccional y sus errores se cubren en pruebas; no se reprodujo el rollback contra PostgreSQL en esta sesión.

### Contract finding — DIS-F5

**Current behavior:** `GET /api/discs/:id` devuelve la entidad con Artist/Country, Genre y colecciones completas de Favorites, Pendings y Comments, incluidas sus relaciones eager con User. `findOne` solicita explícitamente estas relaciones; el spec caracteriza el payload y usuarios de cada item.

**Problem:** el tamaño de la respuesta y el trabajo de carga crecen con esas colecciones. No se confirmó en este checkout qué datos necesita el frontend ni si usa los usuarios y campos completos.

**Impact:** backend + frontend.

**Options:**

1. Preservar compatibilidad hasta identificar a todos los consumidores.
2. Refactorizar internamente la carga solo después de fijar el payload equivalente y cargar explícitamente las relaciones necesarias.
3. Cambiar el contrato a proyecciones pequeñas (por ejemplo, IDs, estados del usuario y contador de comentarios) si las colecciones completas no tienen consumer.
4. Coordinar backend/frontend si el detalle deja de exponer colecciones o usuarios.

**Recommendation:** preservar ahora la respuesta. El baseline D0 y las decisiones históricas D39–D44 de `roadmap/catalog.md` ya registran esta superficie como observable; no crear una tarea duplicada sin clasificar el consumer frontend. Una alternativa más pequeña puede requerir frontend.

**Blocks the current task:** No; se documenta el límite sin retirar eager relations.

### Tareas propuestas (ordenadas por prioridad y dependencias)

#### BC-DIS-1 — Mapear Artist/Genre IDs en la creación simple (S, prioridad alta)

- **Shape de respuesta:** después de guardar, elimina del objeto retornado las propiedades `artist` y `genre`; conserva así el JSON de create previo, que no exponía esas relaciones.
- [x] **Completada (2026-10-15).** `create` convierte los IDs opcionales a referencias `{ id }` antes de `Repository.create`, sin consultas de lookup ni cambios en DTO, permisos o respuesta.
- **Hallazgo:** DIS-F1.
- **Alcance realizado:** separa `artistId` y `genreId` del resto del DTO, pasa a TypeORM únicamente propiedades de Disc y construye `artist: { id }` / `genre: { id }` para los IDs presentes. Conserva los campos opcionales, omisión/null de relaciones y respuesta del servicio. El controller mantiene ruta, permiso y delegación sin cambios.
- **Referencias inexistentes:** no se consulta previamente Artist/Genre. La FK de TypeORM valida al guardar; una violación PostgreSQL `23503` sigue el manejador actual de error técnico y se responde con HTTP 500 genérico. No se añadió una nueva política de errores.
- **Exclusiones:** cambios a existencia de referencias, normalización, permisos, validación adicional y contrato HTTP.
- **Criterios de aceptación:** se omiten relaciones no suministradas; cada ID suministrado se persiste en su relación correspondiente; errores de FK conservan el manejo HTTP vigente; la prueba no usa exclusivamente un mock que acepta cualquier propiedad.
- **Verificaciones realizadas:** `yarn --ignore-engines test --runInBand src/catalog/discs/write/disc-write.service.spec.ts src/catalog/discs/dto/create-discs.dto.spec.ts src/catalog/discs/__tests__/discs.controller.spec.ts src/catalog/discs/__tests__/discs.service.spec.ts` — 4 suites, 52 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier check de los tres archivos TypeScript modificados; `git diff --check`.
- **Cobertura TypeORM y límite:** una prueba construye metadata TypeORM real (`DataSource.buildMetadatas`, sin inicializar conexión), usa `Repository<Disc>.create` real y comprueba las join columns `artistId`/`genreId`, sus referencias a `id` y los valores que TypeORM extrae para ambas FK. `save` se simula para no acceder a PostgreSQL; una violación FK 23503 se caracteriza con error simulado. No se hizo INSERT real ni se verificaron restricciones contra una base de datos.
- **Dependencias y riesgos:** sin dependencia previa. La prueba de metadata comprueba que las propiedades de relación alimentan las columnas FK aunque la respuesta conserve el shape previo sin esas propiedades.

#### BC-DIS-2 — Corregir agregación y cardinalidad de Home (S, prioridad media)

- [x] **Completada (2026-10-15).** Se eliminaron los JOIN de estado personal de la consulta agregada, dejando el estado en sus subconsultas `LIMIT 1`, y se fijó `d.id ASC` como desempate estable.
- **Hallazgo:** DIS-F2.
- **Alcance realizado:** cada Disc produce una fila; `voteCount`, `averageRate`, `averageCover` y `weightedScore` no dependen de cuántos Favorites o Pendings tenga el usuario. Las subconsultas personales conservan los campos y seleccionan como máximo un estado. No se modifican datos, entidades ni esquema.
- **Duplicados de Favorite:** la tabla y el test PostgreSQL permiten duplicados Disc+User. Si existen varios para el usuario actual, se conserva uno mediante el `LIMIT 1` ya usado por la consulta; no se deduplican ni modifican registros. Su ID concreto sigue sin orden garantizado.
- **Orden:** se conserva `weightedScore DESC` y se añade `d.id ASC` como desempate reproducible para el límite de 20.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/catalog/discs/home src/catalog/discs/__tests__/discs.service.spec.ts src/catalog/discs/__tests__/discs.controller.spec.ts src/catalog/discs/calendar/disc-calendar.service.spec.ts` — 13 suites y 102 tests aprobados; 7 suites PostgreSQL opt-in omitidas (27 tests). `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier check sobre los archivos modificados; `git diff --check`.
- **Límite PostgreSQL:** las suites usan tablas temporales en una conexión local configurada como `localhost:5432/SpamMusicDB`, pero PostgreSQL no estaba escuchando; no se ejecutaron contra producción ni se pudo validar la consulta real en esta sesión.
- **Verificación adicional:** una ejecución que incluía `disc-catalog.service.spec.ts` tuvo un fallo fuera de alcance y de atribución no determinada: la expectativa de `addSelect('disc.id', 'discId')` no coincide con las llamadas observadas. No se modificó esa consulta ni su prueba.
- **Dependencias y riesgos:** ninguna técnica; BC-DIS-3 está completada y BC-DIS-4 sigue pendiente.

#### BC-DIS-3 — Validar campos opcionales del DTO de creación/actualización (S, prioridad media)

- [x] **Completada (2026-10-15).** Se validan las dos rutas de creación de Disc y la actualización parcial.
- **Hallazgo:** DIS-F3.
- **Alcance realizado:** `CreateDiscDto` y `UpdateDiscDto` validan `releaseDate`, `ep`, `debut` y `featured`; `CreateDiscWithArtistDto` valida su `releaseDate`, `ep` y `debut`. Sin cambios en rutas, permisos, servicio de escritura, defaults, entidad ni esquema.
- **Exclusiones:** cambios a valores por defecto, nulabilidad de esquema, otras reglas de Disc y cambios a DTOs de calendario.
- **Reglas aplicadas:** el DTO simple mantiene las conversiones de fecha actuales y comprueba que las fechas ISO con día calendario imposible no se normalicen; `@IsDate()` rechaza `Invalid Date`. La ruta con artista requiere fecha ISO8601 estricta. `ep`, `debut` y `featured` aceptan booleanos reales; strings y números se rechazan aun con conversión implícita global. En ambos DTOs se mantiene la opcionalidad anterior, incluido `null`.
- **Actualización:** `PartialType` conserva todos los campos opcionales; los specs pasan por el `ValidationPipe` configurado como en `main.ts`. Pruebas de controller confirman HTTP 400 antes de invocar métodos de escritura.
- **Verificaciones ejecutadas:** suites focalizadas de DTO, controller y escritura — 7 suites, 73 tests aprobados (incluyen los casos de ausencia y `null`); `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier en los archivos modificados; `git diff --check`.
- **Verificación amplia:** `yarn --ignore-engines test --runInBand src/catalog/discs` obtuvo 26 suites aprobadas, 267 tests aprobados y 7 suites/27 tests omitidos; fallaron `disc-catalog.service.spec.ts` (expectativa de `addSelect` no coincidente) y `discs.spotify-http-contract.spec.ts` (el entorno impide escuchar en `0.0.0.0`). No se modificaron esas pruebas ni áreas; su atribución no se determinó.
- **Compatibilidad observada:** el frontend envía `YYYY-MM-DD` en `/discs/with-artist`; la actualización de fecha envía un `Date` que JSON serializa como timestamp ISO. Los dos formatos pasan; los flags de los formularios son booleanos JSON. No se cambió el frontend.
- **Dependencias y riesgos:** los cuerpos inválidos ahora reciben HTTP 400 antes de persistir; se conserva la semántica de ausencia/null. BC-DIS-4 está completada.

#### BC-DIS-4 — Hacer atómica la creación compuesta de Artist y Disc (S, prioridad media)

- [x] **Completada (2026-10-15).** La resolución/creación de Artist y el guardado de Disc comparten el manager de una transacción TypeORM.
- **Hallazgo:** DIS-F4.
- **Alcance:** compartir manager transaccional al resolver/crear Artist y guardar Disc; garantizar rollback de Artist nuevo si falla la persistencia del Disc.
- **Exclusiones:** importar masivo, cambiar resolución de duplicados, alterar errores HTTP, limpieza de Artists existentes y migraciones.
- **Criterios de aceptación:** Artist nuevo + Disc se confirman juntos; fallo al guardar Disc revierte Artist nuevo; Artist preexistente no se modifica ni elimina por el fallo; el error original se propaga; ambos repositorios pertenecen a la transacción.
- **Implementación:** `discRepository.manager.transaction` envuelve el flujo completo. `Artist` y `Disc` se buscan/guardan con repositorios obtenidos de su `EntityManager`; el lookup case-insensitive, normalización y desambiguación por `countryId` se conservan. Los fallos se propagan sin capturarse como éxito.
- **Cobertura:** éxito reutilizando Artist y creando Artist; fallo al guardar Artist; fallo al guardar Disc con rollback del Artist nuevo y conservación del existente; error transaccional propagado; verificación de que ambas escrituras usan repositorios del manager transaccional. El controller sigue caracterizando ruta `POST /discs/with-artist`, autenticación y delegación sin cambios.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/catalog/discs/write/disc-write.service.spec.ts src/catalog/discs/__tests__/discs.service.spec.ts src/catalog/discs/__tests__/discs.controller.spec.ts src/catalog/artists` — 14 suites, 120 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier sobre `disc-write.service.ts` y `disc-write.service.spec.ts`; `git diff --check`.
- **Límite de integración:** PostgreSQL no estaba disponible en `localhost:5432`; no se hizo prueba de integración real ni se contactó producción. El rollback se comprueba con un manager transaccional aislado que descarta el estado staged cuando falla el callback. Se conserva la limitación PostgreSQL de BC-DIS-2: las suites opt-in del ranking (7 suites/27 tests) quedaron omitidas porque el servidor local no estaba escuchando.
- **Dependencias y riesgos:** no se modifican entidades, esquema, endpoints ni consumidores. Discs queda completado. Con esta auditoría quedan cerrados los siete módulos de Catalog (Artists, Countries, Genres, CatalogImport, LastfmCatalog, CatalogOverview y Discs), por lo que el dominio Catalog queda completado.

### Hallazgos no convertidos en tareas

- El contrato eager de detalle queda abierto en DIS-F5; el frontend no está presente en este checkout y no se debe retirar una relación observable sin clasificar sus consumidores. El tema ya figura en el baseline de Discs y en D39–D44 del roadmap de Catalog, por lo que no se crea una segunda tarea contractual.
- `PaginationDto.offset` no valida entero ni no-negatividad y permite filtros/textos que solo tienen sentido en otros módulos; `orderBy` solo restringe el nombre de columna dentro de DiscCatalog y delega la dirección a TypeORM. Se documenta como limitación de DTO compartido, sin tarea en esta auditoría: endurecerlo puede afectar otros controllers y no se verificó un fallo de consumer en Discs.
- Las ordenaciones por releaseDate/Artist no añaden un ID como último desempate. No hay evidencia de que el consumidor exija orden total estable, así que no se propone tarea.
- No se midió SQL ni se propuso caché/índices. Las consultas relevantes están paginadas o limitadas en SQL; cualquier candidato adicional requeriría planes y datos representativos.
- Los errores de `findOneOrFail` se traducen todos a 404, incluidos errores distintos a “no encontrado”; la consulta no distingue errores de infraestructura. No se observó un caso concreto que justifique cambiar ese contrato ahora.

**Verificaciones de BC-DIS-0:** revisión estática de módulo, controller, servicios, DTOs, entidad, helpers, consultas, composición, consumers directos y specs; contraste de la configuración de ValidationPipe y del transformer instalado de TypeORM para DIS-F1; revisión de coherencia de estados y tareas del roadmap; `git diff --check -- roadmap/backend-cleanup.md`. En ese cierre de auditoría no se modificó producción, pruebas, fixtures, entidades ni migraciones y no se ejecutaron pruebas/typecheck/build, PostgreSQL, migraciones, Heroku ni servicios externos. Las implementaciones posteriores se registran en sus tareas.

## Auditoría 2 — Editorial / Articles

**Estado:** completado; BC-ARTI-1, BC-ARTI-2 y BC-ARTI-3 completadas. BC-ARTI-0 completada (2026-10-15).
**Base observada:** rama `refactor/editorial`, 2026-10-15. Se detectó un cambio local previo en `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts`; se conservó sin inspeccionarlo como parte de Articles ni modificarlo.
**Alcance leído en BC-ARTI-0:** `src/editorial/articles/` completo (controller, service, module, DTOs y entidad); composición de `AppModule`; consumidores backend directos de Article/service/repositorio; entidades Content y User; rutas de Contents usadas por Articles; ValidationPipe global y pruebas pertinentes. Entonces no se revisó frontend ni se ejecutaron tests, build o typecheck.
**Ampliación en BC-ARTI-1:** se revisaron los consumidores de Articles en `riffvalley-app-front`, especialmente creación y edición en Articles Kanban y edición desde Content Calendar. No se modificó frontend. No se accedió a PostgreSQL ni a servicios externos.
**Ampliación en BC-ARTI-2:** se verificó el consumer `getArticles`, que actualmente envía solo `userId` como UUID y omite filtros vacíos; se añadieron pruebas de listado mediante un `ValidationPipe` con la misma configuración que `main.ts`. No se modificó frontend ni se accedió a PostgreSQL o servicios externos.
**Ampliación en BC-ARTI-3:** se revisaron las migraciones que declaran las constraints de Article→User y se caracterizaron mediante `QueryFailedError` los errores específicos y los errores ajenos; no se accedió a PostgreSQL ni se modificaron otros módulos.

### Inventario y contratos observados

`ArticlesModule` está registrado en `AppModule`. Incluye `ArticlesController`, `ArticlesService`, `Article`, DTOs de creación y actualización, y registra el repositorio TypeORM. El módulo importa `AuthModule` y `ContentsModule`; exporta `ArticlesService` y `TypeOrmModule`.

| Método y ruta (`/api`) | Método | Acceso observado |
| --- | --- | --- |
| `/articles` | GET | Público; filtros `limit`, `offset`, `q`, `status`, `userId`; devuelve arreglo paginado de hasta 200 filas |
| `/articles/:id` | GET | Público; `ParseUUIDPipe`; 404 si no existe |
| `/articles` | POST | `riffValley`; `CreateArticleDto` |
| `/articles/:id` | PATCH | `riffValley`; `ParseUUIDPipe` y `UpdateArticleDto` |
| `/articles/:id/content` | POST | `riffValley`; crea Content de backlog vinculado si Article tiene usuario y no tiene Content |
| `/articles/:id` | DELETE | `riffValley`; `ParseUUIDPipe`; rechaza con 400 si existe Content asociado |

No hay autorización por ownership ni uso de `@GetUser()`; las mutaciones están restringidas al rol editorial `riffValley`. Las lecturas quedan públicas. La prueba `src/identity/auth/__tests__/domain-mutation-authorization.spec.ts` incluye las cuatro mutaciones de Articles y sus mínimos de rol; no es una prueba HTTP integral.

`Article` tiene campos `name`, `status`, `type`, `link`, `updateDate`, marcas de tiempo y relaciones con Content y con User en los papeles de autor, editor y coautor. Las relaciones de usuario permiten `null` y usan `ON DELETE SET NULL`; Content es la relación inversa one-to-one. Article no declara relaciones eager. `findAll` y `findOne` cargan explícitamente `user`, `content`, `editor` y `coauthor`; se preserva el payload observable. La lista se pagina en SQL, limita `limit` a 200 y ordena por `updatedAt DESC`, sin segundo criterio de desempate. No hay evidencia de impacto real del empate que justifique una tarea de ordenación.

### Arquitectura, dependencias y consumidores

- Articles representa el registro y flujo editorial de artículos, con una acción explícita para crear el Content correspondiente. El servicio mantiene la persistencia Article, sus reglas de estado y la coordinación de esa acción. La responsabilidad es coherente; no se propone dividirlo por tamaño.
- `ArticlesService` depende de `ContentsService` para consultar Content vinculado, crear uno y evitar la eliminación de Article mientras ese Content exista. `ContentsService` no inyecta `ArticlesService`: registra `Repository<Article>` y lee/escribe Article directamente. `ContentsModule` registra la entidad y no importa `ArticlesModule`; no se observa ciclo de módulos Nest. El `forwardRef` de `ArticlesModule` a `ContentsModule` no tiene un import inverso visible que lo requiera.
- Consumers directos encontrados: `ContentsService` lee Article para sincronizar inicialmente la fecha, lo crea al crear ciertos Contents de tipo ARTICLE y recibe `articleId` para vincularlo; `Content` mantiene la relación; `User` tiene la colección `articles`; `AppModule` compone el módulo. No se encontraron consumidores de `ArticlesService` fuera de su controller. Articles no depende directamente de Catalog.
- `ArticlesService` guarda el Article y luego vuelve a consultarlo con sus relaciones para formar la respuesta. Ese fetch es parte del payload actual, por lo que no se propone quitarlo. No se observaron consultas N+1 demostradas ni motivo para optimizar SQL sin medición.

### Hallazgos

#### ARTI-F1 — La creación permite estados que la transición PATCH rechaza — resuelto

- **Ubicación:** `src/editorial/articles/articles.service.ts:33-49,119-139`; validación DTO en `src/editorial/articles/dto/create-article.dto.ts:12-40`.
- **Evidencia (hecho):** `create()` guarda directamente cualquier combinación válida por enum. En cambio, `update()` exige usuario para `editing` y `ready`, y exige `updateDate` para cambiar a `published`. Por tanto, POST puede crear un Article `editing`/`ready` sin usuario o `published` sin fecha, combinaciones que la ruta PATCH impide al transicionar. Contents solo copia la fecha a `publicationDate` cuando Article está `published` y tiene `updateDate` (`src/editorial/contents/contents.service.ts:119-135`).
- **Consecuencia:** el estado inicial puede violar reglas que sí rigen el mismo flujo al editar; un Article publicado sin fecha no aporta fecha inicial al Content que se cree después.
- **Categoría / prioridad / tamaño:** bug funcional / media / S.
- **Corrección propuesta:** aplicar al estado inicial las mismas invariantes de usuario y fecha vigentes en las transiciones; fijar los casos permitidos y rechazados en pruebas de servicio/HTTP.
- **Dependencias y riesgos:** ninguna técnica. Formalizará como HTTP 400 combinaciones que ahora llegan a persistencia; revisar si hay consumidores que deliberadamente crean estos estados antes de implementarlo.
- **Resolución:** BC-ARTI-1 aplica esas mismas condiciones a la creación. El frontend (`riffvalley-app-front/src/views/articles/ArticlesKanban.vue:614-621`) crea `not_started` y puede enviar el usuario autenticado; `ContentsService` también crea Articles en `editing` con usuario y fecha (`src/editorial/contents/contents.service.ts:203-223`). Esas rutas permanecen válidas. No se encontró un consumidor que necesite estados iniciales incompletos.

#### ARTI-F2 — Los filtros de listado no pasaban por validación de DTO — resuelto

- **Ubicación:** `src/editorial/articles/articles.controller.ts:28-31`; `FindArticleParams` y coerciones en `src/editorial/articles/articles.service.ts:16-22,54-76`; `src/main.ts:36-43`.
- **Evidencia (hecho):** `@Query()` recibe el interface TypeScript `FindArticleParams`, que no existe como clase de runtime ni tiene decoradores. El ValidationPipe global no valida sus campos. La aritmética convierte `limit`/`offset` de forma implícita; valores no numéricos pueden producir `NaN` que se pasa a `take`/`skip`; `status` tampoco se contrasta con `ArticleStatus`. `limit` conserva un máximo de 200 y ambos parámetros limitan valores negativos a cero.
- **Consecuencia:** parámetros mal formados no reciben un rechazo HTTP 400 consistente; se pasan sin validar a TypeORM y el resultado/error queda delegado a TypeORM y PostgreSQL. No se consultó base de datos para caracterizar la respuesta exacta.
- **Categoría / prioridad / tamaño:** bug funcional / media / S.
- **Corrección propuesta:** sustituir el interface de entrada HTTP por un DTO de clase que valide/transforme los campos sin cambiar los defaults ni el límite de 200; definir de manera explícita la respuesta para valores inválidos y cubrirla.
- **Dependencias y riesgos:** decisión de contrato sobre parámetros inválidos. Validarlos como enum/números puede cambiar errores delegados al driver por HTTP 400; los consumidores válidos conservan valores y paginación actuales.
- **Resolución:** BC-ARTI-2 añadió `FindArticlesQueryDto`, valida el estado enum, el UUID, el tipo de texto y enteros seguros para `limit`/`offset`. Los negativos y límites superiores continúan sujetos al clamp existente; las cadenas vacías mantienen sus resultados efectivos. El consumer frontend observado solo envía `userId` con formato UUID, por lo que no se encontró un envío actual incompatible.

#### ARTI-F3 — IDs de usuario inexistentes se detectaban solo al guardar — resuelto

- **Ubicación:** `src/editorial/articles/articles.service.ts:33-49,102-113`; relaciones Article en `src/editorial/articles/entities/article.entity.ts:62-73`; validación de forma en `src/editorial/articles/dto/create-article.dto.ts:32-42`.
- **Evidencia (hecho):** los DTOs solo comprueban que `userId`, `editorId` y `coauthorId` tengan formato UUID. `create()` y `update()` asignan referencias parciales sin consultar que los usuarios existan ni traducir errores de persistencia. Las tres relaciones tienen clave foránea hacia User. No se encontró un filtro global que traduzca violaciones de clave foránea a error HTTP de cliente.
- **Consecuencia:** una referencia inexistente alcanza `repo.save()` y la violación de integridad queda como error de persistencia no clasificado, en vez de un error HTTP de recurso/referencia identificable.
- **Categoría / prioridad / tamaño:** bug funcional / media / S.
- **Corrección propuesta:** definir y aplicar una clasificación HTTP uniforme para IDs referenciados inexistentes en creación y actualización, con pruebas que cubran cada asignación y la preservación del error ante fallos no relacionados.
- **Dependencias y riesgos:** elegir si la respuesta será 400 o 404 y considerar la carrera entre comprobación y escritura; la restricción de base de datos debe seguir siendo la protección final.
- **Resolución:** BC-ARTI-3 traduce únicamente violaciones PostgreSQL `23503` de las tres constraints Article→User (`userId`, `editorId`, `coauthorId`) a HTTP 404 genérico. No añade consultas de existencia; las claves foráneas siguen protegiendo frente a referencias inválidas y carreras. Otros errores se propagan sin cambios.

### Contract findings

#### ARTI-F1 — Validación distinta entre POST y PATCH

**Current behavior antes de BC-ARTI-1:** PATCH rechazaba la transición a `editing`/`ready` sin usuario y a `published` sin fecha; POST aceptaba esos estados sin los campos relacionados.

**Problem:** dos rutas que crean/modifican el mismo recurso aplican invariantes editoriales distintas, y Contents usa `updateDate` al construir la fecha de publicación inicial.

**Impact:** backend + frontend.

**Options:**

1. Preserve compatibility: mantener la aceptación actual en POST.
2. Refactor internally: extraer una validación compartida sin aplicarla a la creación; no resuelve el estado inicial inconsistente.
3. Change the contract: rechazar en POST las mismas combinaciones incompletas que ya rechaza PATCH.
4. Coordinate a backend/frontend refactor: confirmar primero los payloads usados por cada cliente y adaptar cualquier flujo que dependa de las combinaciones incompletas.

**Recommendation:** opción 3, aceptada tras revisar los consumidores disponibles. La creación ahora aplica los requisitos existentes y conserva los payloads válidos.

**Blocks the current task:** No; la decisión quedó sustentada por el uso actual y BC-ARTI-1 está completada.

#### ARTI-F2 — Parámetros de listado sin validación HTTP

**Current behavior antes de BC-ARTI-2:** la ruta recibía query strings mediante un interface sin validación de runtime; valores se transformaban parcialmente en el servicio y el estado se pasaba a TypeORM sin comprobación de enum. Ahora un DTO de query valida los filtros y las entradas incorrectas reciben HTTP 400 antes del servicio.

**Problem:** entradas inválidas no reciben un HTTP 400 consistente y pueden alcanzar la consulta con `NaN` o un estado arbitrario. La respuesta exacta del driver no se verificó con PostgreSQL.

**Impact:** backend + frontend.

**Options:**

1. Preserve compatibility: conservar el comportamiento actual, incluido delegar entradas inválidas a la capa de consulta.
2. Refactor internally: usar un DTO manteniendo deliberadamente la coerción y los errores actuales; no evita estados arbitrarios ni `NaN`.
3. Change the contract: devolver HTTP 400 para query params mal formados y mantener filtros/paginación válidos.
4. Coordinate a backend/frontend refactor: inventariar payloads de clientes y corregir cualquier envío inválido antes de activar 400.

**Recommendation:** opción 3, aceptada tras revisar los consumidores; conservar defaults, clamp, búsqueda, relaciones de respuesta y límite para las solicitudes válidas. Los valores inválidos de estado/UUID/formato numérico se rechazan con HTTP 400.

**Blocks the current task:** No; la regla quedó sustentada por los consumidores revisados y BC-ARTI-2 está completada.

#### ARTI-F3 — Error de referencia de usuario delegado a la base de datos

**Current behavior antes de BC-ARTI-3:** un UUID con formato válido se asignaba como relación parcial; una referencia inexistente alcanzaba la escritura sin traducción a error HTTP de cliente. Ahora se clasifican solo las tres constraints de Article hacia User.

**Problem:** el cliente recibe un error de persistencia no clasificado en vez de una respuesta estable para una referencia inválida.

**Impact:** backend + frontend.

**Options:**

1. Preserve compatibility: dejar que la FK rechace la operación y mantener el error actual.
2. Refactor internally: mapear las violaciones de FK específicas de Article a un error de cliente sin cambiar el resto de persistencia.
3. Change the contract: comprobar las referencias y devolver 400 o 404 acordado antes de guardar.
4. Coordinate a backend/frontend refactor: acordar el status y la presentación de errores de referencia en los consumidores.

**Recommendation:** opción 3, aplicada con HTTP 404 siguiendo la convención de `ContentsService` para User inexistente. Se conservan las FKs como defensa final y los fallos ajenos no se convierten en errores de cliente.

**Blocks the current task:** No; el status y mensaje quedaron definidos y BC-ARTI-3 está completada.

### Contrato observado sin tarea separada

En `PATCH`, `UpdateArticleDto` deriva de `PartialType(CreateArticleDto)`, cuyos campos opcionales aceptan `null` con `@IsOptional()`. El servicio actualiza `link`, `updateDate`, `userId`, `editorId` y `coauthorId` solo si el valor es truthy; enviar `null` pasa validación pero se ignora. Las columnas/relaciones correspondientes permiten nulos. No se revisó frontend ni se confirmó si los consumidores usan `null` para solicitar limpieza o si `null` debe equivaler a ausencia. No se propone cambiar esta semántica ni abrir tarea hasta confirmar el contrato de los consumidores; preservarla es la opción segura por ahora.

### Pruebas y cobertura

- `src/editorial/articles/articles.controller.spec.ts` cubre validación de estados de POST/PATCH y filtros de GET mediante un `ValidationPipe` configurado como el global. El listado cubre ausencia de filtros, cada filtro, combinaciones, cadenas vacías, transformaciones/clamp, valores inválidos con HTTP 400 antes de invocar el servicio y conservación de la respuesta.
- La cobertura de escritura incluye éxito con relaciones asignadas, referencias Article→User inexistentes en creación/actualización, opcionalidad y propagación de FKs ajenas y errores de persistencia inesperados. Se mantienen fuera de estas tareas pruebas de PostgreSQL, eliminación con Content y creación de Content. La cobertura de permisos sigue incluyendo el registro de Articles dentro de `domain-mutation-authorization.spec.ts`; no es una prueba HTTP integral.
- No se añadieron ni ejecutaron pruebas durante BC-ARTI-0; las pruebas de tareas implementadas se documentan en sus cierres.
- Los IDs inválidos por sintaxis reciben validación DTO en los cuerpos de escritura, e IDs de ruta pasan `ParseUUIDPipe`; la falta identificada para relaciones es existencia y clasificación de la referencia, no su formato.

### Tareas propuestas

#### BC-ARTI-1 — Aplicar invariantes editoriales al estado inicial (S, prioridad media)

- [x] **Completada (2026-10-15).** ARTI-F1 resuelto.
- **Regla acordada:** los cinco valores del enum son válidos como estado inicial cuando cumplen los requisitos existentes: `not_started` e `in_progress` no exigen usuario ni fecha; `editing` y `ready` exigen usuario; `published` exige `updateDate`. No se impone usuario a `published`, porque PATCH tampoco lo exige.
- **Implementación:** `ArticlesService` comparte la validación de requisitos entre POST y las transiciones PATCH. POST rechaza combinaciones incompletas con `BadRequestException` antes de guardar. PATCH conserva sus mismas condiciones, mensajes, estados y transiciones; no se introdujo una matriz de transiciones ni se alteró el tratamiento de un status sin cambio.
- **Pruebas:** nuevo `articles.controller.spec.ts` con `ValidationPipe` real y la configuración global de `main.ts`. Cubre creación en cada estado válido, estados iniciales incompletos, enum inválido, transiciones representativas válidas/rechazadas, respuestas con HTTP 400 y status sin cambio. No se modificó frontend.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/articles/articles.controller.spec.ts` — 1 suite, 19 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit -p tsconfig.build.json`; `yarn --ignore-engines prettier --check src/editorial/articles/articles.service.ts src/editorial/articles/articles.controller.spec.ts`; `git diff --check`.
- **Entorno:** Yarn v1 omitió la comprobación de `engines` porque el proyecto declara Node 20.x y la sesión usa Node 22.23.1. No se cambió Node ni se instalaron dependencias. No se accedió a PostgreSQL o servicios externos.
- **Límite de alcance:** `ArticleActionsModal` permite escoger `published`, pero `ContentCalendar.handleUpdateArticle` no envía `updateDate`, que la transición PATCH ya requiere. Este comportamiento preexistente no lo causó BC-ARTI-1 ni se cambió porque esta tarea preserva PATCH y excluye cambios de frontend; queda señalado para clasificación en el trabajo que corresponda.

#### BC-ARTI-2 — Validar filtros de Articles con DTO (S, prioridad media)

- [x] **Completada (2026-10-15).** ARTI-F2 resuelto.
- **Alcance:** reemplazar `FindArticleParams` como entrada HTTP por una clase DTO; validar `limit`, `offset`, `status`, `userId` y `q`, conservando defaults y máximo 200 para solicitudes válidas; cubrir los parámetros inválidos con pruebas.
- **Contrato confirmado:** `getArticles` en el frontend solo envía `userId`, y lo hace como UUID cuando tiene valor. `limit` y `offset` continúan aceptando enteros negativos y sobre 200 para aplicar el clamp preexistente; formatos fraccionarios, no numéricos, exponentes, hexadecimal y enteros fuera del rango seguro reciben 400. `q` vacío conserva su efecto de no filtrar; `status` y `userId` vacíos se tratan como omitidos; paginación vacía conserva su coerción efectiva a cero.
- **Implementación:** `FindArticlesQueryDto` valida filtros antes de la llamada al servicio. Se conservan consulta por texto, estado, ramas de autor/editor/coautor, defaults 50/0, límite máximo 200, orden, relaciones y forma de respuesta. No cambian rutas, permisos, reglas de estados ni frontend.
- **Pruebas:** extensión de `articles.controller.spec.ts` con `ValidationPipe` y opciones globales. Cubre consulta sin filtros, filtros individuales y combinados, cadena vacía, transformaciones/clamp, HTTP 400 para cada tipo inválido y que el servicio no se invoque antes del rechazo; verifica resultado y forwarding a TypeORM.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/articles/articles.controller.spec.ts` — 1 suite, 39 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; Prettier sobre `find-articles-query.dto.ts`, controller, service y spec de Articles; `git diff --check`.
- **Entorno:** Yarn v1 omitió la comprobación de `engines` porque el proyecto declara Node 20.x y la sesión usa Node 22.23.1. No se cambió Node ni se instalaron dependencias. No se accedió a PostgreSQL o servicios externos.
- **Exclusiones:** cambiar forma del payload, reglas de búsqueda, orden, semántica de `userId` o añadir filtros.
- **Aceptación:** filtros válidos mantienen búsqueda/paginación actuales; entradas mal formadas reciben una respuesta 400 definida antes de llamar TypeORM; la paginación no pasa `NaN` a `take`/`skip`.
- **Dependencias y riesgos:** no quedan dependencias para esta tarea. Los parámetros inválidos que antes se delegaban a TypeORM ahora reciben HTTP 400.
- **Verificaciones:** pruebas del DTO mediante ValidationPipe global y pruebas del controller/service para forwarding y límites; build/typecheck según el procedimiento aprobado.

#### BC-ARTI-3 — Clasificar las referencias a usuarios que no existen (S, prioridad media)

- [x] **Completada (2026-10-15).** ARTI-F3 resuelto.
- **Alcance:** acordar y mapear el error de referencia inexistente para `userId`, `editorId` y `coauthorId` en POST y PATCH; cubrirlo y comprobar que fallos de base de datos ajenos a esas referencias no se convierten en errores de cliente.
- **Decisión de contrato:** HTTP 404, en línea con `ContentsService` cuando User no existe. El mensaje es genérico y no expone SQL, nombres de constraints ni detalles del driver.
- **Implementación:** `ArticlesService` convierte solo `QueryFailedError` PostgreSQL con código `23503`, tabla `article` y una de las constraints Article→User conocidas en `NotFoundException`. No consulta Users antes de guardar; no transforma otras FKs ni errores inesperados. Las relaciones siguen siendo opcionales y las constraints conservan su función de integridad.
- **Pruebas:** `articles.controller.spec.ts` cubre éxito y ausencia de asignación, las tres relaciones en POST/PATCH, 404 con respuesta segura, FK de otra relación y errores inesperados propagados sin modificación.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/articles/articles.controller.spec.ts` — 1 suite, 52 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; `yarn --ignore-engines prettier --check src/editorial/articles/articles.service.ts src/editorial/articles/articles.controller.spec.ts`; `git diff --check`.
- **Entorno:** Yarn v1 omitió la comprobación de `engines` porque el proyecto declara Node 20.x y la sesión usa Node 22.23.1. No se cambió Node ni se instalaron dependencias. No se accedió a PostgreSQL o servicios externos.
- **Exclusiones:** cambios en `User`, reglas de ownership/roles, transacciones amplias, migraciones o traducción global de errores para otros módulos.
- **Aceptación:** cada referencia inexistente produce 404 sin persistir el Article; relaciones existentes siguen asignándose; la restricción de FK permanece activa como defensa ante carreras.
- **Dependencias y riesgos:** no quedan dependencias. El clasificador depende de los nombres estables de constraints definidos en las migraciones actuales.
- **Verificaciones:** pruebas unitarias de resolución/error y de escritura; si se decide una prueba PostgreSQL, usar la infraestructura aislada del proyecto y no servicios externos; build/typecheck según el procedimiento aprobado.

**Decisiones no convertidas en tareas:** no se propone extraer otro servicio, cambiar relaciones cargadas, modificar el payload, cambiar orden/paginación válida, añadir índices ni optimizar queries sin medición. El `forwardRef` hacia Contents parece innecesario con la composición actual, pero su retirada es limpieza de bajo beneficio y no justifica una tarea independiente.

**Cierre del módulo:** BC-ARTI-0 y BC-ARTI-1 a BC-ARTI-3 completadas; Articles queda completado. Los demás módulos de Editorial siguen pendientes. No se avanzó a Asignations.

**Verificaciones de BC-ARTI-0:** revisión estática de implementación, pruebas, consumidores directos y composición; coherencia revisada contra las reglas generales y estado detallado del roadmap; `git diff --check -- roadmap/backend-cleanup.md`. No se ejecutaron tests, build, typecheck, migraciones ni operaciones con base de datos o servicios externos durante BC-ARTI-0. Las verificaciones de las tareas posteriores se registran en sus cierres.

## Auditoría BC-ASG-0 — Editorial / Asignations

**Estado actual:** completado; BC-ASG-0, BC-ASG-1, BC-ASG-2 y BC-ASG-3 completadas. El resto de Editorial continúa pendiente.
**Base observada:** rama `refactor/editorial`, 2026-10-16. Se detectó un cambio local preexistente en `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts`; se conservó sin lectura funcional, edición ni atribución a esta auditoría.
**Alcance leído:** implementación completa bajo `src/editorial/lists/asignations/` (controller, service, module, DTOs, entidad); registro en `AppModule`; entidades relacionadas de List, User y Disc; ValidationPipe global; consultas directas y transformaciones consumidoras en Lists, Contents y Disc Calendar; specs de autorización, Disc Calendar, Lists y consumers de relaciones. No se accedió al frontend, PostgreSQL, Heroku ni otros servicios. No se ejecutaron tests, build ni typecheck.

### Resumen de arquitectura y contratos

- `AsignationsModule` registra controller/service y repositorios de `Asignation`, `Disc`, `List` y `User`, e importa `AuthModule` y `ListsModule`. `AppModule` lo registra directamente. No exporta el servicio.
- `AsignationsController` expone `POST /asignations`, `GET /asignations`, `GET /asignations/:id`, `PATCH /asignations/:id`, `DELETE /asignations/:id` y `GET /asignations/list/:listId`. Las rutas con `:id` usan `ParseUUIDPipe`; `listId` no tiene pipe.
- Las lecturas son públicas; crear requiere JWT autenticado sin rol mínimo (`@Auth()`); editar y borrar requieren `riffValley`. No existe comprobación de ownership en servicio. No se infiere que sea un defecto porque las reglas permiten asignar una tarea a otro usuario y no se encontró una política de ownership definida para este recurso.
- `AsignationsService` concentra CRUD y paginación, resolución de relaciones iniciales, saneamiento de texto y, al cambiar determinados campos, delegación de sincronización WordPress a `ListsService`. Es una única responsabilidad de gestión de asignaciones; su tamaño y dependencias no justifican extraer servicios.
- El módulo depende de Editorial/Lists (`List` y `ListsService`), Identity (`User`) y Catalog (`Disc`). No importa Articles ni Contents. Contents y Lists consumen las asignaciones mediante relaciones de `List`; Disc Calendar las carga mediante `disc.asignations`. La entidad mantiene relaciones inversas desde List, User y Disc. La composición revisada no muestra un ciclo de módulos Nest.
- `done` es boolean nullable; `position` int nullable con validación HTTP de entero firmado en rango PostgreSQL; descripción, bandas similares y género libre son texto nullable; `spotifyTrackId` varchar(32) nullable. `user` y `disc` son nullable y eager; al borrar User se conserva la asignación con usuario nulo, mientras que al borrar Disc o List se elimina la asignación. `list` es obligatoria. No hay columnas de fecha ni flujo de estados.
- `findAll` usa `findAndCount` con paginación por defecto 10/0; `findByListId` filtra por List, ordena por username ascendente y usa 100/0. Ambos devuelven total, páginas, página actual, límite y entidades. `findOne` devuelve entidad o 404. `create` y `update` devuelven la entidad; `remove` devuelve un mensaje.
- Los campos de texto se sanean al escribir: `description` admite un conjunto acotado de etiquetas y bandas similares/género se convierten en texto plano. `spotifyTrackId` admite cadena vacía para restaurar la selección automática. `position` es campo opcional. El DTO de update hereda los validadores de create con `PartialType`.
- Las relaciones eager `user` y `disc` forman parte observable de las respuestas de entidad. Disc Calendar proyecta solo los datos de asignación que consume; Lists/Contents cargan listas con asignaciones para operaciones editoriales. No se propone retirar relaciones eager sin identificar y caracterizar consumidores externos del payload.
- No se halló acceso directo a `AsignationsService` fuera de su controller; los consumers conocidos usan relaciones/repositorios y servicios de Lists. No se encontró duplicación sustancial, consulta N+1 demostrada, ni razón para índices o reescrituras SQL sin medición.

### Hallazgos

#### ASG-F1 — La validación de `position` queda desactivada

- **Ubicación:** `src/editorial/lists/asignations/dto/create-asignations.dto.ts:55-59`; DTO heredado en `src/editorial/lists/asignations/dto/update-asignations.dto.ts:1-4`; validación global en `src/main.ts:37-41`.
- **Evidencia (hecho observado antes de BC-ASG-1):** `ValidateIf` de `position` consultaba `o.rate`, propiedad que no pertenece a este DTO. Con `rate` ausente, condición que aplica al payload permitido por whitelist global, el predicado era falso y class-validator omitía `IsNumber`. Además, la conversión implícita global podía convertir strings numéricos antes de validar.
- **Consecuencia:** valores de tipos no numéricos llegaban a la persistencia; decimales o enteros fuera del rango de la columna PostgreSQL `int` tampoco eran filtrados antes del servicio.
- **Categoría / prioridad / tamaño:** bug funcional / media / XS.
- **Resolución (BC-ASG-1):** sustituido el predicado ajeno por `IsInt`, límites `-2147483648..2147483647` y `Type(() => Object)` para impedir conversión implícita de strings en este campo. Se conserva la opcionalidad y `null`; no se impone positividad ni otro rango editorial. Decimales se rechazan porque no son representables por la columna `int`.

#### ASG-F2 — Referencias inexistentes se responden como error 500

- **Ubicación:** `src/editorial/lists/asignations/asignations.service.ts:71-85,110-112,189-227,238-245`.
- **Evidencia (hecho):** `create()` lanza `Error` si List, User o Disc no existen, pero el catch convierte cualquier error salvo código PostgreSQL `23505` en `InternalServerErrorException`. `update()` guarda un User parcial sin comprobar existencia; la violación de FK `23503` cae en el mismo 500 genérico. Las FK de `Asignation` están definidas por las relaciones de la entidad y las migraciones existentes. `findOne()` también convierte cualquier excepción de consulta en 404 (líneas 136-144), por lo que un fallo de persistencia puede aparecer falsamente como ausencia.
- **Consecuencia:** el cliente no recibe clasificación HTTP estable para referencias/recurso inexistentes y fallos de consulta pueden ocultarse como 404. Los consumidores no pueden distinguir adecuadamente entrada inválida/no encontrada de una indisponibilidad interna.
- **Categoría / prioridad / tamaño:** bug funcional / media / S.
- **Corrección propuesta:** mapear solo referencias inexistentes de List/User/Disc y ausencia de Asignation a errores HTTP acordados; propagar fallos de persistencia inesperados como 500. Cubrir create/update/findOne, incluyendo errores ajenos a las referencias.
- **Dependencias y riesgos:** elegir 400/404 para referencias inexistentes; mantener las FK como garantía ante carreras. El mapeo debe ser específico para no exponer detalles del driver ni enmascarar fallos no relacionados.
- **Resolución (BC-ASG-2):** las referencias List/User/Disc ausentes en `create` dan 404 con consulta previa ya existente; FK `23503` solo se traduce si coinciden tabla `asignation` y constraint User/Disc/List conocido. `findOne` devuelve 404 solo cuando la consulta responde `null`; los errores del repositorio se propagan. `update` conserva 404 al no encontrar el preload y mapea solo la FK conocida User→Asignation. `remove` conserva su 404 al afectar cero filas. Los errores inesperados y FK ajenas se propagan; `23505` de Asignation conserva 400 con mensaje genérico sin detalle SQL.

#### ASG-F3 — `findAll` pagina sin orden estable

- **Ubicación:** `src/editorial/lists/asignations/asignations.service.ts:124-132`; `findByListId` con orden parcial en `287-299`.
- **Evidencia (hecho):** `findAll()` aplica `take`/`skip` sin `order`. `findByListId()` ordena solo por `user.username`, que es nullable a través de la relación opcional; múltiples asignaciones sin usuario quedan empatadas. No se declara orden contractual alternativo en controller/DTO.
- **Consecuencia:** el orden entre páginas no está determinado por el contrato SQL; inserciones/replanes o empates pueden mover registros entre páginas y producir omisiones/repeticiones al recorrer resultados paginados.
- **Categoría / prioridad / tamaño:** bug funcional / baja / XS.
- **Corrección propuesta:** acordar un orden primario compatible con uso actual y añadir una clave única estable como desempate en ambas consultas paginadas; documentar/cubrir el orden de respuesta.
- **Dependencias y riesgos:** confirmar el orden primario deseado de `findAll` con consumidores. Añadir desempate a username conserva el orden visible existente y resuelve empates; cualquier orden predeterminado nuevo de `findAll` puede afectar a consumidores que asumían el orden incidental de la base de datos.
- **Resolución (BC-ASG-3):** `findAll()` ordena por `Asignation.id ASC`, al no existir orden funcional declarado ni consumidores directos del endpoint en el backend revisado. `findByListId()` conserva `user.username ASC` y añade `Asignation.id ASC` para desempatar. Las opciones `where`, `take` y `skip`, las relaciones y la forma de respuesta se mantienen.

### Cobertura de pruebas

- `src/editorial/lists/asignations/asignations.controller.spec.ts` prueba creación y PATCH parcial con el `ValidationPipe` global equivalente; cubre enteros negativos/positivos, `null`, ausencia, strings/tipos incorrectos, decimales y ambos extremos fuera del rango. Verifica HTTP 400 antes de llamar al servicio.
- `src/editorial/lists/asignations/asignations.service.spec.ts` caracteriza referencias relacionadas existentes/ausentes, FK conocidas/ajenas, recursos ausentes, fallos de repositorio, respuestas válidas y mensajes seguros sin acceder a PostgreSQL.
- `src/identity/auth/__tests__/domain-mutation-authorization.spec.ts` comprueba metadata de ruta/rol y decisiones del guard para `update` y `remove`; no cubre `create` ni autenticación/contrato HTTP integral de Asignations.
- Los specs de Disc Calendar verifican la carga/proyección de asignaciones; los de Lists ejercitan datos asignados en generación; Contents no tiene en el árbol consultado un spec que caracterice payload/consulta de `list.asignations`.
- La cobertura directa añadida en BC-ASG-1/2 cubre validación de `position` y clasificación de errores del servicio. BC-ASG-3 añade inspección de las opciones TypeORM para ambos listados, orden principal y desempate, paginación por `limit`/`offset`, páginas consecutivas sin duplicados, filtro por lista, resultado vacío y forma de respuesta. Sigue sin haber cobertura consultada de autorización HTTP de creación/lecturas, ownership ni contratos HTTP completos de CRUD; esos huecos corresponden a las revisiones futuras cuando apliquen.

### Tareas propuestas

#### BC-ASG-1 — Corregir la validación de `position` (XS, prioridad media)

- [x] **Completada (2026-10-16).** ASG-F1 resuelto.
- **Alcance ejecutado:** corregir la condición que consultaba `rate` y validar el tipo/rango representable por `position` en POST y PATCH mediante el ValidationPipe global.
- **Exclusiones:** cambios de esquema, reglas de WordPress, modificaciones de consumers, reordenación de asignaciones o cambios a otros DTOs.
- **Implementación:** `@Type(() => Object)` mantiene el tipo JSON original a pesar de `enableImplicitConversion` global; `@IsInt`, `@Min(-2147483648)` y `@Max(2147483647)` validan el rango de la columna PostgreSQL `int`. Se mantienen ausencia y `null` mediante `@IsOptional`; no se impone positividad, coherente con el campo entero firmado y la ausencia de una regla de negocio adicional.
- **Pruebas:** el nuevo `asignations.controller.spec.ts` usa ValidationPipe con `whitelist`, `forbidNonWhitelisted`, `transform` y `enableImplicitConversion`. Cubre números válidos negativos/positivos, decimales, valores sobre/abajo del rango, string numérico, booleano, objeto, array, `null` y ausencia en POST/PATCH; verifica rechazo HTTP 400 antes de invocar el servicio.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists/asignations/asignations.controller.spec.ts` — 1 suite, 16 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; `yarn --ignore-engines prettier --check src/editorial/lists/asignations/dto/create-asignaciones.dto.ts src/editorial/lists/asignations/asignations.controller.spec.ts`; `git diff --check`.
- **Riesgos:** no se consultó PostgreSQL; los límites se derivan del tipo `int` declarado por la entidad y su columna existente. No hay cambios de esquema.

#### BC-ASG-2 — Clasificar ausencia de asignación y referencias relacionadas (S, prioridad media)

- [x] **Completada (2026-10-16).** ASG-F2 resuelto.
- **Alcance ejecutado:** clasificar referencias ausentes y recursos Asignation inexistentes; preservar fallos inesperados y clasificar FK únicamente por SQLSTATE, tabla y constraint concretos.
- **Exclusiones:** cambiar forma de payload, ownership, reglas de roles, cambios de esquema o traducción global de errores.
- **Implementación:** `create` devuelve 404 para List/User/Disc ausentes usando las consultas de existencia existentes. Se clasifican como 404 únicamente FK `23503` con tabla `asignation` y una constraint concreta de User/Disc/List; update aplica User FK. `findOne` devuelve 404 ante resultado nulo y propaga errores de consulta. `update` y `remove` conservan 404 cuando la Asignation no existe. `findByListId` ya no convierte fallos de consulta en una excepción genérica. Violaciones `23505` mantienen HTTP 400 con mensaje seguro, sin detalle de driver. Los demás errores se relanzan.
- **Pruebas:** `asignations.service.spec.ts` cubre recursos y referencias existentes/ausentes, FK conocida, tabla o constraint ajena, errores inesperados, el 400 seguro por `23505`, y conservación de payload/paginación válida.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists/asignations` — 2 suites, 34 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; `yarn --ignore-engines prettier --check src/editorial/lists/asignations/asignations.service.ts src/editorial/lists/asignations/asignations.service.spec.ts`; `git diff --check`.
- **Dependencias y riesgos:** no requiere PostgreSQL. La traducción de FK depende de los nombres concretos de constraints actuales y falla de forma segura (500 genérico de Nest) ante constraints no reconocidas.

#### BC-ASG-3 — Dar orden determinista a las consultas paginadas (XS, prioridad baja)

- [x] **Completada (2026-10-16).** ASG-F3 resuelto.
- **Alcance ejecutado:** `findAll` ordena por ID ascendente como orden estable, ya que no tenía criterio funcional explícito; `findByListId` conserva username ascendente y añade ID ascendente como desempate. La revisión no encontró consumidores backend directos de estos endpoints fuera del controller.
- **Exclusiones:** cambiar límite/defaults, contrato de paginación, filtros, índices o payload.
- **Aceptación:** ambas consultas declaran orden estable por clave única; el orden por username permanece en listados por lista y los empates producen resultados predecibles.
- **Compatibilidad y riesgos:** no cambian rutas, filtros, límites, relaciones ni forma de respuesta. El endpoint global adquiere un orden determinista donde antes el orden no estaba declarado.
- **Pruebas:** `asignations.service.spec.ts` inspecciona las opciones de `findAndCount` y cubre orden principal, desempate por ID, limit/offset, páginas consecutivas sin repetición, filtro por lista, respuesta vacía y forma de respuesta.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists/asignations` — 2 suites, 35 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json`; `yarn --ignore-engines prettier --check src/editorial/lists/asignations/asignations.service.ts src/editorial/lists/asignations/asignations.service.spec.ts`; `git diff --check`.
- **Riesgos:** no se accedió a PostgreSQL ni a servicios externos. La simulación de páginas en la prueba complementa la inspección de opciones TypeORM; no sustituye una prueba de integración contra PostgreSQL.

### Aspectos revisados sin tarea

- No se encontró lógica de ownership explícita. Las lecturas son públicas, creación acepta cualquier JWT y las escrituras requieren `riffValley`; con el material backend revisado no se demuestra que la asignación a otro usuario sea indebida.
- La sincronización WordPress se ejecuta después del `save()` de Asignation y dentro del mismo bloque de manejo de errores. No se comprobó mediante servicios externos cómo se comportan sus fallos; no se propone transacción distribuida ni cambio de contrato en esta auditoría.
- No se proponen cambios a relaciones eager porque las asignaciones son parte de los payloads consumidos por Lists/Contents y el calendar proyecta campos concretos; no se revisó frontend para establecer si todos los campos de user/disc se necesitan en respuestas directas.
- No se proponen extracciones de servicio, reescrituras SQL ni índices. No hay evidencia de ciclo Nest, N+1 atribuible a consultas del módulo ni duplicación de responsabilidades que justifique reorganización.

**Estado tras BC-ASG-3:** Asignations queda **completado**; ASG-F1/BC-ASG-1, ASG-F2/BC-ASG-2 y ASG-F3/BC-ASG-3 están resueltos/completadas. Articles conserva su estado completado; Contents y los demás módulos de Editorial continúan pendientes.

**Verificaciones de BC-ASG-0:** revisión estática de implementación, composición, DTOs, pruebas existentes y consumers; coherencia del roadmap y estados; `git diff --check -- roadmap/backend-cleanup.md` aprobado. En BC-ASG-0 no se ejecutaron tests, build, typecheck, migraciones ni operaciones con PostgreSQL o servicios externos. Las verificaciones de BC-ASG-1, BC-ASG-2 y BC-ASG-3 constan arriba.

## Auditoría BC-LST-0 — Editorial / Lists

**Estado:** BC-LST-0, BC-LST-1, BC-LST-2, BC-LST-3, BC-LST-4, BC-LST-5, BC-LST-6, BC-LST-7, BC-LST-8, BC-LST-8.1, BC-LST-9 y BC-LST-10 completadas. Lists sigue **en cleanup**, pendiente de reorganización arquitectónica. Articles y Asignations siguen completados; los demás módulos de Editorial siguen pendientes. No se avanzó al módulo siguiente.
**Base observada:** rama actual y estado local del checkout, 2026-10-16. Se conservaron los cambios locales encontrados, incluidos los movimientos/imports y cambios de BA-14.B, `src/community/pendings/__tests__/pending-user-relation.postgres.spec.ts` y otros archivos preexistentes. No se atribuyen a BC-LST-0.
**Alcance leído:** implementación completa de `src/editorial/lists/` (incluida la subcarpeta `asignations/` para entender la relación, sin auditar ni cambiar su cleanup ya completado); DTOs, entidad, queries, composición en `AppModule`, reglas globales de validación, consumidores directos en Contents, Videos, Links, Asignations, Catalog/Disc Calendar, User y `PaginationDto`; suites de Lists y pruebas consumidoras relevantes. No se inspeccionó frontend ni se accedió a PostgreSQL, Heroku, WordPress, Spotify u otros servicios. No se ejecutaron tests, build ni typecheck.

### Arquitectura, responsabilidades y contratos

- `ListsModule` registra `ListsController`/`ListsService`, repositorios de `List` y `Content`, `AuthModule`, WordPress Integration y Spotify Integration; exporta `ListsService`. `AppModule` registra Lists y Asignations como módulos Nest independientes. La arquitectura actual es adecuada: Lists mantiene el ownership editorial de listas, fechas y publicación; WordPress/Spotify son transportes externos y Asignations es un módulo independiente agrupado físicamente bajo Lists por BA-14.B. No hay evidencia para extraer responsabilidades ni reorganizar carpetas.
- `ListsController` expone `POST /lists`; `GET /lists`, `/weeks`, `/next`, `/weekly/current`, `/weekly/past/:year/:month`, `/video/current`, `/video/past/:year`, `/special`, `/video`, `/month/current` y `/month/past/:year`; `POST /weekly/create`, `POST /:id/wp-posts` y `POST /:id/wp-best-post`; `GET /:id`; `PATCH /:id`; `DELETE /:id`. El código también declara dos veces `GET /video/current` y `GET /video/past/:year`, con handlers distintos que delegan a los mismos métodos. No se demostró un efecto funcional adverso; se deja como duplicación sin tarea.
- Crear, actualizar, borrar lista, crear lista semanal y generar posts WordPress exigen rol mínimo `riffvalley`; `GET /lists` y `/weeks` exigen usuario autenticado; las lecturas específicas por tipo/periodo y `GET /:id` son públicas. Los IDs de `:id` usan `ParseUUIDPipe`; year/month de las rutas históricas semanales, mensuales y de vídeo se validan mediante DTOs de ruta y ValidationPipe. Los DTOs de create/update usan validaciones de nombre, enum, booleanos y fechas ISO; update hereda create y admite referencias WordPress; el query de generación valida `position` como entero >= 1. La paginación compartida transforma `limit` y `offset`, exige solo que `limit` sea positivo, no limita `offset` a no negativo y filtra `statusExclusions` como strings sin restringirlos a `ListStatus`.
- `List` tiene UUID, nombre, tipo (`month`, `week`, `special`, `video`), estado editorial nullable, tipo especial, fechas de agenda, IDs/URL WordPress y tracking JSONB de discos/posts semanales. `asignations` y `links` son `OneToMany` eager+cascade; `Content` tiene relación `OneToOne` nullable a List. Las relaciones eager son parte observable; Lists y Contents consumen Asignations y Links para publicación/respuestas, y no se propone retirarlas. Asignation mantiene FKs a List/Disc/User; Links depende de List y `onDelete: CASCADE`.
- Las queries listan por nombre ascendente con `findAndCount` y defaults 40/0. Lecturas de agenda mensual/semanal/vídeo filtran rangos temporales y ordenan por la fecha aplicable; las pruebas actuales caracterizan las fronteras mensuales y el cierre semanal. No se midió SQL ni se propone optimización, índice ni cambio de orden incidental.
- `ContentsService` crea listas mensuales/semanales y mantiene fechas de Content/List; ListsService también sincroniza fechas desde List y elimina Content al borrar una List. `VideosService` crea listas de vídeo. Asignations guarda el cambio editorial antes de invocar `ListsService.syncDiscToWordPress`; el error externo se propaga al caller aunque la escritura local ya se haya completado. Este efecto distribuido no justifica presumir atomicidad entre sistemas ni se propone transacción distribuida o cambio de contrato.
- La generación de publicaciones escribe primero en WordPress y guarda después el tracking `wpPostId`/`wpWeeklyPosts`/`wpPublishedDiscs` en PostgreSQL. La selección Spotify se usa para generar embeds; el fallo al consultar Spotify se captura y produce `null`/fallback. Los errores WordPress se propagan. No se observó compensación entre sistemas; sí se identificó el riesgo de reintento duplicado descrito en LST-F1.
- No se encontró dependencia circular nueva ni duplicación que justifique reorganización. `ContentsModule` importa Lists con `forwardRef`; Lists no importa ContentsModule y usa su repositorio, por lo que la dependencia de módulo es unidireccional. Videos y Asignations importan Lists; Links solo registra/reposiciona List y conserva su módulo independiente.

### Hallazgos

#### LST-F1 — La publicación puede duplicar bloques si falla un paso posterior de sincronización

- **Ubicación:** `src/editorial/lists/list.service.ts:623-824, 1017-1086, 1358-1379, 1427-1523`.
- **Evidencia (hecho de código):** `syncDiscsIntoPost` actualiza el contenido externo y retorna el tracking nuevo en memoria. En el flujo semanal, el tracking de posiciones se guarda una sola vez al final de todas las posiciones (`generateWordPressPosts`); en el flujo mensual y el sync por asignación, WordPress se actualiza antes de guardar `wpPublishedDiscs`. Si una posición posterior o el guardado local falla, la escritura externa anterior ya ocurrió y el tracking local puede seguir indicando que ese disco no fue publicado. El siguiente intento calcula `newDiscs` desde ese tracking obsoleto e inserta otra vez el bloque antes del footer, sin comprobar primero si el marcador `rv-disc-<id>` ya está en el post.
- **Consecuencia:** un fallo recuperable seguido de reintento puede duplicar uno o más bloques de discos en WordPress. La operación no es atómica entre sistemas; el problema demostrado es que el reintento no es idempotente.
- **Categoría / prioridad / tamaño:** bug funcional / media / S.
- **Estado:** resuelto por BC-LST-1 (2026-10-16).
- **Corrección propuesta:** hacer idempotente la inserción usando los marcadores de bloque existentes y/o guardar checkpoints locales por publicación exitosa; preservar el comportamiento de actualización de bloques existentes y no introducir transacción distribuida. Cubrir fallo de guardado y fallo en una posición posterior, seguido de reintento sin contenido duplicado.
- **Dependencias y riesgos:** ListsService, interfaz con WordPress y generación de contenido mensual/semanal; no modificar la frontera ni la lógica interna de Asignations. Debe preservarse contenido editado manualmente en WordPress; reconciliar por marcador solo si coincide con el formato generado.
- **Pruebas revisadas:** `list.service.spec.ts` cubre selección de track, creación de post y propagación de un error WordPress durante lookup; no caracteriza fallo después de una escritura externa, checkpoints ni reintentos. No se ejecutó.

#### LST-F2 — Fechas anuladas en List quedan obsoletas en el Content enlazado y escrituras pareadas no son atómicas

- **Ubicación:** `src/editorial/lists/list.service.ts:152-239, 241-256`; DTO nullable en `src/editorial/lists/dto/create-list.dto.ts:31-42`; relación en `src/editorial/contents/entities/content.entity.ts:45-66`.
- **Evidencia (hecho de código):** `IsOptional` admite `null` para las tres fechas y las columnas son nullable. `update()` guarda primero List, pero la sincronización solo arranca cuando el valor recibido es truthy y solo copia fechas no nulas. Así, PATCH con `closeDate: null`, `releaseDate: null` o `listDate: null` borra List pero conserva el valor previo en Content. Si guardar Content falla después de guardar List, también queda una divergencia y la petición falla aunque List ya cambió. `removeList()` elimina Content y después List en dos escrituras sin transacción; si falla el segundo paso, la lista permanece sin su Content.
- **Consecuencia:** los endpoints/consumidores de Contents y Lists pueden observar agendas contradictorias o una eliminación parcial tras errores de persistencia. La aceptación de `null` convierte el caso de limpieza de fecha en comportamiento alcanzable por contrato.
- **Estado:** resuelto por BC-LST-2 (2026-10-16).
- **Categoría / prioridad / tamaño:** bug funcional / media / S.
- **Corrección propuesta:** definir y aplicar sincronización también para los campos explícitamente enviados como `null`, y hacer transaccionales las escrituras conjuntas List/Content en actualización y borrado. Preservar el comportamiento cuando el campo no se envía y las relaciones/cascadas actuales. Añadir pruebas de cada campo nullable y rollback en fallos de la segunda escritura.
- **Dependencias y riesgos:** `Content`/Lists y consumers directos Contents/Videos; usar transacción PostgreSQL solo en la implementación futura, sin acceder a la base en esta auditoría. Confirmar que `null` representa borrar el valor sincronizado, como permiten ya DTO y columna. No cambiar el contrato HTTP.
- **Pruebas revisadas:** no hay pruebas CRUD de `ListsService` ni casos de null-synchronization o errores del repositorio. Hay specs de controller/scheduler de Contents, pero no caracterizan la sincronización de fechas de `ContentsService`; el caller inverso también ignora fechas nulas, fuera del alcance de esta auditoría.

#### LST-F3 — Parámetros de año/mes aceptan valores parciales o meses fuera de rango

- **Ubicación:** `src/editorial/lists/list.controller.ts:55-63, 71-76, 93-98, 105-108`; cálculo de rangos en `src/editorial/lists/list.service.ts:303-321, 349-373, 394-408`.
- **Evidencia (hecho de código):** los valores de ruta llegan como strings y `parseInt` acepta prefijos numéricos (`2026x` → 2026). La ruta semanal acepta cualquier mes; `new Date(year, month - 1, 1)` normaliza valores como 13 al siguiente año y 0 al año anterior. No hay `ParseIntPipe`, validador de rango ni DTO de ruta.
- **Consecuencia:** rutas malformadas no producen un 400 consistente; un mes fuera de 1–12 consulta un periodo distinto del que expresa la URL y puede devolver un calendario engañoso.
- **Categoría / prioridad / tamaño:** bug funcional / baja / XS.
- **Estado:** resuelto por BC-LST-3 (2026-10-16).
- **Corrección propuesta:** (implementada por BC-LST-3) validar year/month completos y limitar el mes a 1–12 antes de llamar al servicio; validar además el rango que pueden representar sin rollover las ventanas anuales existentes.
- **Dependencias y riesgos:** contrato de error 400 para parámetros inválidos; preservar rutas y resultados válidos. No toca SQL ni esquema.
- **Pruebas revisadas:** `list.service.spec.ts` cubre fechas de corte con parámetros válidos; no hay cobertura de conversión/validación de los parámetros de ruta ni de CRUD/paginación HTTP.

### Contract finding — LST-F3

**Current behavior:** las rutas aceptan prefijos parseables y meses fuera de 1–12; los últimos se normalizan a otro periodo.

**Problem:** una URL inválida puede devolver un calendario distinto del que solicita o fallar de forma no uniforme.

**Impact:** backend-only para entradas inválidas; rutas y resultados de periodos válidos permanecen iguales.

**Options:** 1) preservar el parseo actual; 2) validar enteros/rangos y devolver 400; 3) cambiar rutas o semántica de los archivos.

**Recommendation:** opción 2; conserva compatibilidad válida y evita respuestas de otro periodo.

**Blocks the current task:** No; BC-LST-3 cubre la validación sin depender de otras correcciones.

### Tareas propuestas

#### BC-LST-1 — Hacer idempotente la sincronización WordPress en reintentos (S, prioridad media)

- [x] **Completada (2026-10-16).** LST-F1 resuelto; Lists permanece en cleanup por BC-LST-2 y BC-LST-3 pendientes.
- **Objetivo:** impedir bloques duplicados cuando WordPress ya aceptó una actualización, pero falla un paso posterior de WordPress o el guardado de tracking local.
- **Alcance ejecutado:** flujos mensual/semanal, sincronización por Asignation y creación/adopción de posts; reconciliación por slug estable del post y marcador Gutenberg `rv-disc-<discId>`; clasificación de resultados remotos de escritura.
- **Exclusiones:** transacción distribuida, cambios de contrato, modificación del cleanup de Asignations, reescritura de plantillas HTML o limpieza de posts editados manualmente que no tengan marcador reconocido.
- **Dependencias:** ninguna. Coordinarse con el formato actual `rv-disc-<discId>` y tracking JSONB existente.
- **Implementación:** `syncDiscsIntoPost` inspecciona los grupos Gutenberg balanceados e identifica de forma única los marcadores de disco. Une los marcadores remotos con `wpPublishedDiscs`/`wpWeeklyPosts`, actualiza bloques propios en su posición y solo inserta los que no están ni en remoto ni en tracking; bloques con IDs ajenos permanecen intactos. Una identidad repetida o un bloque marcador incompleto detiene la operación con 409 para revisión manual. Los posts nuevos se recuperan por slug; si el lookup no está disponible, no tiene resultado concluyente o apunta a un post en papelera, Lists no guarda tracking ni crea otra publicación a ciegas.
- **Resultado incierto:** WordPress Integration expone `WordpressWriteError` con resultado `rejected` para respuestas 4xx y `unknown` para red, 5xx o respuestas exitosas ilegibles/incompletas. Ante update incierto, Lists relee el post y solo avanza si el contenido coincide exactamente con el enviado y los marcadores recién insertados aparecen una sola vez. Si no se confirma, devuelve 503; no muta ni guarda tracking. Errores inesperados no se capturan como recuperables. El lookup por slug propaga respuestas HTTP fallidas o payloads inválidos en vez de informar falsamente que no existe.
- **Límite:** WordPress REST no ofrece aquí clave de idempotencia ni transacción coordinada con PostgreSQL; no se afirma exactamente una ejecución. En resultados inciertos no verificables la petición falla para revisión manual. Los reintentos explícitos siempre consultan por slug o releen el post antes de intentar un cambio.
- **Pruebas:** Lists prueba primera publicación, reintento con tracking completo, tracking local ausente pero marcador remoto presente, publicación semanal en orden, fallo de una posición posterior y reintento sin duplicar, fallo del save local después de crear, errores remotos confirmados e inciertos, verificación fallida, identidad duplicada, bloques ajenos, post por slug recuperado/no resuelto, y errores inesperados. WordPress Integration prueba la clasificación de escrituras y rechazo de lookups HTTP fallidos.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists/list.service.spec.ts src/editorial/lists/list.controller.spec.ts src/integrations/wordpress-integration/wordpress.service.spec.ts` — 3 suites, 61 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json --pretty false`; `yarn --ignore-engines prettier --check` sobre los 4 archivos modificados; `git diff --check`.
- **Riesgos residuales:** un cambio externo manual que elimine o duplique el marcador impide la reconciliación automática y requiere revisión. Se preservan bloques sin identidad gestionada; no hay llamadas reales a WordPress ni PostgreSQL en las verificaciones.
- **Estado final:** LST-F1 resuelto; BC-LST-1 completada. BC-LST-2 y BC-LST-3 siguen pendientes; Lists permanece **en cleanup**.

#### BC-LST-2 — Sincronizar cambios y limpieza de fechas entre List y Content (S, prioridad media)

- [x] **Completada (2026-10-16).** LST-F2 resuelto; Lists continúa en cleanup porque BC-LST-3 permanece pendiente.
- **Semántica anterior:** List ya se guardaba antes que su Content asociado, pero solo se propagaban fechas truthy; desde Contents se guardaba primero Content y se omitían las fechas nulas al actualizar List. En ambos sentidos, campo ausente significaba conservar, pero `null` explícito dejaba fechas divergentes. La creación automática RADAR/BEST y el borrado de Content/List también usaban escrituras locales separadas.
- **Semántica actual:** campo omitido no dispara sincronización; una fecha enviada sincroniza `closeDate`↔`closeDate`, `releaseDate`↔`publicationDate` y, para List week/month/video, `listDate`↔`listDate`. `null` explícito limpia ambos campos nullable. La regla previa que exige fecha de publicación para Content RADAR/REUNION se conserva: un `releaseDate: null` de List con ese Content asociado devuelve 400 sin modificar ninguna entidad.
- **Transacciones:** `ListsService.update()` usa un `EntityManager` transaccional para guardar List y Content cuando ambos requieren cambio; si no hay Content enlazado o no necesita sincronización, solo guarda List sin abrir transacción. `ContentsService.update()` guarda su Content y la List mediante repositorios del mismo manager cuando la fecha requiere propagar un cambio. La creación automática de Content RADAR/BEST, su List y la asociación final también comparte manager. El borrado iniciado desde Lists o desde Contents elimina Content y List en una misma transacción; `ContentsService` pasa el manager a `ListsService.removeList()` para mantener el mismo contexto. La sincronización semanal/mensual no duplica cambios cuando las fechas ya coinciden.
- **Exclusiones:** contratos HTTP, entidades/esquema, cascadas de Asignation/Link, reglas de estado editorial y transacciones distribuidas. No se abren transacciones para la creación aislada de una List ni para actualizaciones/borrados de una sola entidad.
- **Integraciones y límite:** no se hacen llamadas a WordPress o Spotify dentro de estas transacciones ni se alteró BC-LST-1. La sincronización de `Content` con `Reunion` que puede continuar después de una actualización permanece fuera de la transacción List/Content; tampoco existe atomicidad entre PostgreSQL y servicios externos.
- **Pruebas:** se añadieron pruebas de fechas válidas, `null`, campos omitidos, cambios parciales, fallo al guardar cualquiera de las entidades, rollback simulado del manager compartido, eliminación correcta/fallida, creación RADAR y preservación de la regla RADAR. Se ejecutaron también los tests relacionados con BC-LST-1.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists/list.service.spec.ts src/editorial/lists/list.controller.spec.ts src/integrations/wordpress-integration/wordpress.service.spec.ts src/editorial/contents/contents.service.spec.ts src/editorial/contents/contents.controller.spec.ts src/editorial/contents/content-scheduler.service.spec.ts` — 6 suites, 81 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json --pretty false`; Prettier en los cuatro archivos propios; `git diff --check`.
- **Riesgos residuales:** si la sincronización posterior Content/Reunion falla, puede quedar pendiente aunque el par Content/List ya esté confirmado. El test utiliza mocks del manager y verifica que ambas escrituras se obtienen del mismo contexto y que un error aborta el callback; no se accedió a PostgreSQL.

#### BC-LST-3 — Validar parámetros de periodo de listas (XS, prioridad baja)

- [x] **Completada (2026-10-16).** LST-F3 resuelto; Lists permanece **en cleanup** por BC-LST-5, auditoría funcional Frontend/Backend.
- **Implementación:** `/weekly/past/:year/:month`, `/month/past/:year` y ambas declaraciones actuales de `/video/past/:year` usan DTOs validados por `ValidationPipe`. La conversión solo admite dígitos decimales completos; mes requiere entero 1–12. Año requiere entero 100–275759: se excluye 0–99 porque el constructor `Date` lo convierte a 1900–1999, y el máximo permite representar el rango completo enero-diciembre usado por los servicios. No se aplican límites de año basados en reglas editoriales nuevas.
- **Compatibilidad:** rutas, permisos, métodos de servicio y respuestas para periodos dentro del rango conservan su contrato. Entradas parciales, vacías, alfabéticas, mixtas, negativas, decimales, meses fuera de rango y años que producirían rollover o fechas no representables reciben HTTP 400 antes de invocar el servicio.
- **Pruebas:** controller spec ejecuta los DTOs mediante `ValidationPipe`, comprueba 400 y ausencia de llamadas al servicio para inválidos, y delegación/respuesta para meses 1 y 12 y los endpoints anualizados; también cubre los límites de año. Incluye ambas declaraciones de vídeo.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists/list.controller.spec.ts src/editorial/lists/list.service.spec.ts src/catalog/discs/calendar/disc-calendar.service.spec.ts` — 3 suites, 112 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit -p tsconfig.build.json --pretty false`; Prettier en los tres archivos propios; `git diff --check`.
- **Riesgos residuales:** no se añadieron límites por antigüedad editorial; el mínimo evita la conversión 1900 de `Date` y el máximo su rango nativo de fechas. No se cambió la lógica de consulta del calendario.

#### BC-LST-4 — Auditar la semántica funcional de `free` (S, prioridad baja)

- [x] **Completada (2026-10-16).** Revisión estática terminada; sin cambios de código/pruebas ni ejecución de tests, build o typecheck. Lists sigue **en cleanup** por la decisión BC-LST-10.
- **Objetivo:** determinar qué significa `free` en cada tipo de List, qué reglas lo gobiernan y qué comportamiento actual lo consume.
- **Alcance:** revisar entidad/DTOs, creación y actualización, consumers backend y pruebas existentes; caracterizar reglas y contratos actuales antes de proponer cualquier cambio. Inspeccionar consumers frontend si están disponibles en el checkout correspondiente.
- **Exclusiones:** no introducir reglas de `free` como parte de BC-LST-3; no cambiar datos, entidades, migraciones ni contratos durante la auditoría.
- **Aceptación:** significado y evidencia documentados; diferencias entre modalidades, inconsistencias, ambigüedades, huecos de pruebas y siguientes pasos separados. Cumplido abajo.

### Auditoría funcional de `free` — BC-LST-4

**Alcance observado:** rama `refactor/editorial`, checkout limpio al inicio (2026-10-16). Se leyó `src/editorial/lists/` completo, incluido `asignations/`, servicios de WordPress/Spotify usados por Lists, consumidores backend de Contents, Videos, Links y Disc Calendar, pruebas pertinentes y frontend en `/home/tottibero/workspaces/riffvalley/riffvalley-app-front`. Sin acceso a PostgreSQL ni servicios externos; no se ejecutaron tests, build ni typecheck.

#### Significado confirmado y límites de evidencia

- `free` es una propiedad booleana persistida de `List`, pero el código no define qué concepto de negocio representa. No significa en el comportamiento observable “sin asignaciones”, “sin fecha”, “sin publicación” ni “sin coste”: ningún servicio lee el valor para decidir qué hacer.
- `POST /lists` admite `free: true`, `false` o `null`; si se omite, la entidad define default `false` y la columna conserva default false. `PATCH /lists/:id` también admite los tres valores porque `UpdateListDto` hereda los campos de `CreateListDto`. Se persiste el valor enviado sin validar transiciones ni disparar efectos laterales por modalidad. Se puede cambiar después de asignar discos o publicar en WordPress.
- Los creadores internos mensuales, semanales y de vídeo omiten `free`, por lo que la columna usa default false. Incluye RADAR/BEST creados desde Contents, creación de lista semanal y listas asociadas a Videos (`contents.service.ts:286-301`, `list.service.ts:569-705`, `videos.service.ts:186-197`). La creación manual genérica requiere nombre y tipo; estado, specialType, fechas y free son opcionales. El DTO de List no incluye asignaciones ni links iniciales: se gestionan por sus operaciones propias.
- `free: null` es un tercer valor permitido por DTO, entidad y esquema (la migración `1767027355740-AddListDateToContent.ts` quita `NOT NULL`). Ningún consumer lo diferencia de true/false. No hay evidencia para afirmar que sea un estado intencional ni para normalizarlo.
- El frontend tipa `ContentList.free` como `boolean` (`src/services/contents/contents.ts:22-31`), pero la búsqueda encuentra solo esa declaración; vistas y servicios no lo leen y no hay control de formulario que seleccione la modalidad. La declaración del tipo no establece significado ni tratamiento de null.

#### Matriz comparativa de comportamiento

No hay ramas funcionales de `free`: los dos valores booleanos siguen las mismas reglas en todas las áreas. Cada fila indica ubicación y cobertura; cuando el flujo general tiene tests, estos no caracterizan la modalidad.

| Área | `free=true` | `free=false` | Código / pruebas |
|---|---|---|---|
| Creación | Admitido por el endpoint genérico; las relaciones se gestionan por operaciones propias. | Igual y default en base de datos al omitir. Los creadores internos month/week/video omiten free. | `create-list.dto.ts:11-41`, `list.service.ts:81-89,493-705`; Contents/Videos arriba. Sin tests de create de List ni de valores free. |
| Actualización | PATCH permite pasar de false/null a true; se guarda directamente. | Puede cambiarse desde true/null del mismo modo. | `update-list.dto.ts:5-13`, `list.service.ts:162-260`; hay tests de fechas/transacción, ninguno de free ni de error de persistencia de este campo. |
| Asignaciones | Crear, actualizar, ordenar y borrar sin consultar free. | Idéntico. `position` se usa en agrupación/publicación, no se condiciona por free. | `asignations.controller.ts`, `asignations.service.ts`, `list.service.ts:707+`; specs cubren CRUD, FK, posición y orden, sin modalidad. |
| Calendario | Inclusión por tipo/fechas, sin filtro free. | Idéntico. | `list.service.ts:121-149,368-490`, `disc-calendar.service.ts:100-135`; pruebas de rangos semanal/mensual/anual, no free. |
| Content | Se mantiene relación/sync de fechas; free no es campo de Content ni se sincroniza a otro valor. | Idéntico; RADAR/BEST crean listas con default false. | `contents.service.ts:286-301`, sincronización Lists/Contents; tests de BC-LST-2 para fechas/transacciones y RADAR, no modalidad. |
| Publicación | Mismos generadores y bloques Gutenberg; no bloquea ni altera el contenido. | Idéntico. `wp-best-post` sí valida type MONTH; `wp-posts` agrupa asignaciones por posición. | `list.controller.ts:113-125`, `list.service.ts:707+`, `1373-1388`; tests cubren plantillas, orden, reintentos y publicación, no ambas modalidades. |
| WordPress | Mismo tracking/reconciliación. Sync por Asignation opera en MONTH/WEEK y devuelve `synced:false` para otros tipos. | Idéntico. | `list.service.ts:1126-1144`; tests BC-LST-1 y servicio cubren fallos/reintentos/bloques, sin free. |
| Spotify | Misma selección manual/automática de track y fallback para embeds. | Idéntico. | `list.service.ts:1911-1935` y composición Gutenberg; tests cubren track manual, singles, tercer/último track, fallo y embed; ninguno depende de free. |
| Eliminación | Igual: elimina Content asociado en transacción y List; las cascadas afectan Asignations/Links según sus relaciones. No se borra post remoto. | Idéntico. | `list.service.ts:269-318`, entidades List/Asignation/Link; tests cubren borrado/transacción/error, no free. |
| Permisos | Mismos permisos por endpoint; no hay autorización por modalidad. | Idéntico. | `list.controller.ts:30-145`: mutaciones List y publicación `riffValley`; GET `/lists` y `/weeks` autenticados, lecturas específicas públicas. Asignations: POST autenticado, PATCH/DELETE `riffValley`, lecturas públicas. Specs cubren creación/roles generales, no matriz free. |

#### Diferencias intencionales (no dependen de `free`)

- List types MONTH/WEEK/VIDEO/SPECIAL tienen calendarios y creadores distintos. Contents crea WEEK para RADAR y MONTH para BEST; Videos crea VIDEO. No se propone unificar esos flujos.
- La sincronización de cambios de asignación con WordPress se limita a MONTH/WEEK; la publicación “Mejores discos” requiere MONTH. Son reglas por `List.type`, no por `free`.
- Spotify se usa para resolver embeds de las publicaciones; la selección manual por asignación tiene prioridad. Tampoco depende de `free`.
- BC-LST-1 hizo idempotente/reconciliable la publicación; BC-LST-2 sincronizó fechas y transacciones locales List/Content; BC-LST-3 validó parámetros de periodo. La auditoría no demuestra interacción de esos cambios con free y no reabre su alcance.

#### Hallazgos

##### LST-F4 — `free` no tiene semántica funcional comprobable

- **Ubicación:** `src/editorial/lists/entities/list.entity.ts:72-73`, `dto/create-list.dto.ts:27-29`, `dto/update-list.dto.ts:5`, `list.service.ts:81-89,162-260`; no hay lecturas de free en backend. En frontend solo se declara en `src/services/contents/contents.ts:22-31` sin uso.
- **Evidencia:** el campo se acepta en create/update y forma parte de la entidad; no modifica operaciones, relaciones, fechas, calendario, Content, publicación, integraciones o permisos.
- **Problema/consecuencia:** el contrato permite cambiar un valor sin efecto conocido y puede hacer pensar que se aplicó una regla inexistente. No se demuestra defecto de ejecución ni se infiere la regla correcta.
- **Categoría / prioridad / tamaño:** ambigüedad de dominio/contrato; baja; XS para decisión, sin implementación autorizada.
- **Recomendación:** confirmar si el dato es informativo, debe controlar un flujo concreto o ya no se necesita. Después delimitar una eventual tarea backend-only o backend + frontend; no añadir condiciones por intuición.
- **Hecho frente a hipótesis:** ausencia de usos comprobada; propósito e intencionalidad no confirmados.

### Contract finding — LST-F4/LST-F5

**Current behavior:** la API acepta y devuelve `List.free`; create/update admiten boolean y null. No hay reglas backend que lo consuman. El frontend declara `ContentList.free` como boolean, pero no lo lee.

**Problem:** el campo expone una modalidad sin semántica observada; además, el contrato del backend admite null y el tipo frontend no. No se ha confirmado que una vista use este dato.

**Impact:** backend + frontend para una definición o cambio contractual; consumo frontend activo no confirmado.

**Options:**

1. Preservar el contrato/valores hasta obtener decisión de negocio.
2. Documentar el significado y añadir consumidor sin alterar el payload, si se confirma que es informativo.
3. Cambiar el contrato para normalizar/eliminar `null` o retirar el campo si no tiene uso.
4. Coordinar backend/frontend si el campo debe influir en flujos o formularios del frontend.

**Recommendation:** opción 1 hasta la decisión de BC-LST-10; no inferir una regla ni cambiar el tipo o la persistencia.

**Blocks the current task:** No; la auditoría queda completada. Sí bloquea una implementación que atribuya significado o elimine `null`.

##### LST-F5 — `null` es un tercer valor aceptado sin regla asociada

- **Ubicación:** DTO `free?: boolean | null`, entidad nullable y migración `1767027355740-AddListDateToContent.ts`; `update()` pasa el valor directamente.
- **Evidencia:** create/update aceptan null y el esquema lo permite; ningún consumer lo interpreta. No es un rechazo de persistencia ni un bug demostrado.
- **Problema/consecuencia:** el frontend declara boolean estricto mientras API/esquema permiten null. No se sabe si es compatibilidad histórica o estado intencional; normalizarlo a false o quitarlo cambiaría contrato sin decisión.
- **Categoría / prioridad / tamaño:** ambigüedad contractual; baja; XS; se resuelve junto a LST-F4, sin tarea correctiva separada.
- **Impacto:** backend + frontend si se decide retirar null o cambiar payload. No se halló consumo frontend activo.

#### Cobertura de pruebas y propuesta

- No hay tests de create/update de List que pasen `free`; la suite del servicio cubre calendario, Spotify, publicación, sincronización de fechas y eliminación, pero no valores omitido/true/false/null, cambios de modalidad, payload ni error de save de este campo.
- No hay tests de modalidad en Asignations, Disc Calendar, Contents, Gutenberg, Spotify ni permisos. Los flujos generales sí cuentan con cobertura variable, detallada en la matriz, pero no prueban diferencias entre modalidades.
- Tras la decisión de negocio, añadir caracterización de create/update/payload para cada valor que se mantenga. Añadir pruebas de consumidores solo si se introduce una regla de modalidad. La falta de pruebas por sí sola no justifica cambiar comportamiento.

#### BC-LST-10 — Eliminar el campo obsoleto `List.free` (S, prioridad baja)

- [x] **Completada (2026-10-16).** Eliminado del modelo List, DTO de creación y contrato frontend; migración aditiva `1791930000000-RemoveFreeFromList.ts` preparada con `up`/`down`. No se ejecutó la migración ni se accedió a PostgreSQL o producción.
- **Hallazgos resueltos:** LST-F4 y LST-F5. Se confirmó que `free` no tenía uso funcional ni representaba las modalidades SPECIAL/WEEK/MONTH.
- **Cambios:** retirada la columna de la entidad y DTO; retirada la propiedad `ContentList.free`; ninguna otra propiedad de List ni lógica por tipo editorial cambia. No se encontraron usos en controllers, servicios, formularios, payloads, tests, fixtures, seeds o consultas SQL fuera del historial de migraciones.
- **Migración:** `up` elimina `list.free`; `down` la restaura como `boolean DEFAULT false`, nullable como el esquema inmediatamente anterior. Los valores históricos se pierden al ejecutar `up`; `down` recupera la columna y el default, pero no los valores anteriores.
- **Alcance de migraciones:** se conservan intactas las migraciones históricas, incluidas las que originalmente crearon, alteraron o eliminaron temporalmente la columna.
- **Verificaciones:** backend: 8 suites focalizadas (158 tests), build, typecheck y Prettier de los tres archivos backend propios aprobados; frontend: 7 suites (28 tests), build y typecheck aprobados. La comprobación Prettier del rango `ContentList` modificado pasó; el archivo completo mantiene tres diferencias de formato preexistentes fuera del cambio y el repo frontend no declara Prettier. `git diff --check` y búsqueda de referencias ejecutables a `List.free` aprobados. Revisión estática confirmó que el `down` recupera el esquema nullable con default false vigente. La migración no se ejecutó.
- **Dependencias/riesgos:** desplegar el contrato frontend/backend junto con la migración antes de ejecutar `up`; los valores históricos no son recuperables por `down`.

#### BC-LST-5 — Auditoría funcional Frontend/Backend de Lists, Radar y Mejores (S, prioridad media)

- [x] **Completada (2026-10-16).** Revisión estática de `/list/lists`, `/discos/radar` y `/discos/mejores`, sus consumidores y contratos. No se modificó código ni pruebas; no se ejecutaron tests, build o typecheck ni se accedió a bases de datos o integraciones externas.
- **Objetivo:** reconstruir los flujos reales desde la interacción frontend hasta Lists, Asignations y Contents; separar diferencias intencionales, defectos demostrados, mejoras opcionales y decisiones de negocio.
- **Fuentes:** frontend `src/router/index.ts`, `src/views/list/ListsList.vue`, `src/views/list/EditList.vue`, `src/views/discos/{RadarNovedades,RadarDetalle,MejoresDiscos,MejoresDiscosDetalle}.vue`, `src/components/{AsignationList,MejoresAsignationList,DiscByDate,ContentCalendar,CreateContentModal}.vue`, servicios `src/services/{list,asignations,contents}`; backend `src/editorial/{lists,contents}/`, incluidos `lists/asignations/`, DTOs, servicios, controllers y specs. Se revisaron WordPress/Spotify y los efectos cubiertos por BC-LST-1/2/3.

##### Matriz de las tres rutas

| Característica | `/list/lists` | `/discos/radar` | `/discos/mejores` |
|---|---|---|---|
| Objetivo funcional | Gestiona Lists `SPECIAL`, filtradas por specialType; no es el catálogo global. `ListsList.vue` → `GET /lists/special`. | Consulta listas `WEEK` actuales/futuras y pasadas; detalle edita un Radar semanal. `RadarNovedades.vue` → `/lists/weekly/current`, `/weekly/past/:year/:month`; `RadarDetalle.vue` → `/lists/:id`. | Consulta listas `MONTH` actuales y pasadas; detalle mantiene una selección mensual. `MejoresDiscos.vue` → `/lists/month/current`, `/month/past/:year`; detalle → `/lists/:id`. |
| Entidades implicadas | List y sus asignaciones especiales; creación no genera Content. Borrado de List elimina Content enlazado si hubiera uno. | Content + List WEEK al crear desde calendario; Asignations por posición; publicación WordPress y datos Spotify. | Content + List MONTH al crear desde calendario; Asignations y votos; publicación WordPress y datos Spotify. |
| Creación y edición | Crea `type=special` con name/specialType por `POST /lists`; edición de special name/type mediante `PATCH /lists/:id`. No expone free/status/fechas. | La ruta no crea listas: calendario crea Content RADAR y ContentsService crea List WEEK. Detalle edita name/status/listDate/closeDate. El campo description mostrado no existe en UpdateListDto. | La ruta no crea listas: calendario crea Content BEST y ContentsService crea List MONTH. Detalle edita name/status/listDate. |
| Asignaciones | `SpecialAsignationList`; operaciones Asignation. | `AsignationList`: grupos por position, `0` sin asignar, arrastre a grupos, máximo de cuatro impuesto solo en la UI; “Nuevo Radar” agrega un grupo local. | `MejoresAsignationList`: CRUD, done, descripción/similarBands/Spotify; `DiscByDate` y `MisVotosMes` aportan selección/votos. |
| Fechas y estados | SPECIAL no tiene fecha editorial y no debe recibir una fecha por defecto. | Requiere fecha; calendario y detalle no deben permitir borrarla. Estados new/assigned/published. ListService resuelve semanas por cierre/fecha con ventana de gracia. | Requiere fecha; calendario y detalle no deben permitir borrarla. Selector mensual genera listDate día 15. Estados new/assigned/published; Monthly ListService separa periodos por fechas. |
| Publicación | No se ofrece generación WordPress en la vista special. | Botón por grupo llama `POST /lists/:id/wp-posts?position=...`; produce/actualiza borrador, tracking y enlaces. | Detalle llama `POST /lists/:id/wp-best-post`; requiere List MONTH y al menos una asignación; publica como borrador y registra tracking. |
| Integraciones | Ninguna visible en este flujo. | WordPress explícito por grupo; cambios de texto de Asignation sincronizan con WP cuando corresponde; Spotify resuelve embeds. | WordPress explícito para el post mensual; Spotify para embeds/track seleccionado. BC-LST-1 cubre idempotencia/reintentos. |
| Permisos | Router y mutaciones exigen `riffValley`; lecturas específicas de Lists tienen permisos propios backend. | Las rutas frontend exigen `riffValley`; creación/edición/publicación backend también. Asignation POST requiere auth y PATCH/DELETE `riffValley`. | Igual que Radar. |
| Validaciones | UI pide name/specialType; SPECIAL no requiere fecha y no debe tener default editorial. | WEEK/RADAR requiere fecha; cada grupo admite como máximo cuatro asignaciones, límite que backend debe aplicar en create/update. La edición de List no incluye `description`. | MONTH/BEST requiere fecha. La interfaz muestra referencia visual de 10 discos; no se estableció ese umbral como regla de dominio. |
| Errores | Carga muestra toast y queda vacía; creación/borrado muestran error genérico. | Índice consume errores silenciosamente como listas vacías; detalle muestra toast. Un PATCH de description o fecha vacía resulta 400. | Índice consume errores silenciosamente como vacío; detalle muestra toast. Un date input vacío se envía como `""` y recibe 400. |
| Pruebas existentes | Backend List controller/service cubre roles y CRUD general, no hay pruebas de componentes/flujo frontend detectadas. | Backend Lists/Asignations/Contents cubre calendario, publicación/reintentos, CRUD genérico y sincronización de fechas; no hay specs frontend de ruta/componentes. | Backend cubre publicación y sincronización general; falta probar BEST sin fecha/null y no hay specs frontend de ruta/componentes. |

##### A. Comportamiento confirmado

- `/list/lists` administra listas especiales directamente; no genera Content ni representa los flujos Radar/Mejores. `ListsList.vue`, `EditList.vue`; backend `list.controller.ts` y `list.service.ts`.
- Radar y Mejores se crean desde `ContentCalendar.vue`/`CreateContentModal.vue`, no desde sus páginas índice. `ContentsService.create()` crea Content y, en la misma transacción, una List WEEK para RADAR o MONTH para BEST. La edición de fechas desde Lists y Contents ya comparte sincronización transaccional tras BC-LST-2.
- Radar usa Asignation.position para separar paquetes editoriales y genera borrador WP por grupo; Mejores gestiona una selección mensual y un borrador WP por List. Spotify se usa para resolver embeds, no para crear listas.
- En todos los flujos de las tres páginas se exige rol `riffValley` para mutaciones. Las reglas de lectura pueden ser más abiertas en backend y las páginas están protegidas en frontend.
- La propiedad `free` no se usa en estos tres flujos. La ambigüedad previa LST-F4/F5 permanece separada en BC-LST-10.

##### B. Diferencias intencionales

- SPECIAL, WEEK/RADAR y MONTH/BEST tienen propósitos, calendarios, creadores y generadores WordPress distintos; no se recomienda unificarlos.
- El Radar agrupa Asignations por posición y ofrece publicación semanal por grupo; Mejores usa una publicación mensual completa y controles de votos/estado de selección. Las listas SPECIAL siguen siendo gestión especial sin fecha editorial.
- El límite confirmado de cuatro discos por grupo Radar se aplica en backend al crear y modificar Asignations, incluidos los cambios de grupo. El indicador visual de diez discos en Mejores no se define como límite de dominio.
- Edición de fechas mantiene semántica de fecha calendario distinta de campos de publicación del Content. BC-LST-2 sincroniza cambios aceptados; no se reabre su solución transaccional.

##### C. Defectos demostrados

###### LST-F6 — Radar intentaba actualizar `List.description`, campo ausente del contrato (resuelto en BC-LST-6)

- **Evidencia:** `RadarDetalle.vue` enlaza `list.description` y envía PATCH `{description}`; `List` no declara esa propiedad y `UpdateListDto` deriva de `CreateListDto`, que tampoco la admite. Con ValidationPipe global `whitelist` + `forbidNonWhitelisted`, el cambio devuelve 400.
- **Decisión confirmada:** eliminar el campo de descripción de la edición de List en Radar. No eliminar ni cambiar campos de descripción válidos que pertenecen a Content.
- **Impacto:** la edición ofrecida actualmente no puede persistirse. Corrección frontend-only: retirar el control y el envío de `description` en el PATCH de List, preservando la edición de descripción de Content en su propio flujo.
- **Prioridad/tamaño:** media; XS, frontend-only.

###### LST-F7 — Las reglas de fecha obligatoria no estaban garantizadas de forma uniforme (resuelto en BC-LST-7)

- **Evidencia previa a BC-LST-7:** `CreateContentModal.vue` marca fecha para RADAR/BEST; `ContentsService.create()` exigía RADAR pero permitía BEST sin fecha. El helper monthly podía asignar fecha predeterminada a List mientras Content quedaba sin publicationDate. `ContentsService.update()` protegía RADAR frente a null pero permitía limpiarla en BEST.
- **Decisión confirmada:** WEEK/RADAR y MONTH/BEST requieren fecha; SPECIAL no tiene fecha editorial y no recibe fecha por defecto. La fecha obligatoria de Radar y Mejores no se puede borrar.
- **Resolución:** `ContentsService` valida RADAR/BEST al crear y al modificar publicación/tipo; `ListsService` valida entradas directas WEEK/MONTH, impide fechas en SPECIAL y elimina defaults de releaseDate de los helpers semanales/mensuales. `POST /lists/weekly/create` conserva ruta y permiso, pero requiere ahora `releaseDate` en el body para que el flujo directo pueda crear una WEEK válida sin inventarla. Las fechas List/Content siguen sincronizándose mediante los managers transaccionales de BC-LST-2. REUNION conserva su validación previa.
- **Riesgo histórico:** no se corrigieron filas existentes. WEEK/MONTH con releaseDate nula/inválida y SPECIAL con fechas pueden persistir hasta que se edite su releaseDate, publicationDate o modalidad. Los PATCH de otros campos conservan datos históricos sin validarlos de nuevo. No se añadió migración ni restricción de esquema.
- **Estado:** resuelto por BC-LST-7; prioridad/tamaño originales media / S.

###### LST-F8 — El máximo confirmado de cuatro asignaciones por grupo Radar no se valida en backend

- **Evidencia:** `AsignationList.vue` bloquea el quinto elemento por grupo; Asignations DTO/service aceptan cualquier position integer válido y no cuentan filas existentes. Publicación por position incluye las asignaciones que existan.
- **Decisión confirmada:** cada grupo de Radar admite como máximo cuatro discos.
- **Impacto:** clientes directos o cambios concurrentes pueden exceder el límite y alterar el paquete semanal publicado. Backend debe validar altas y modificaciones, incluidos cambios de grupo; position 0 se conserva como bandeja sin asignar. La comprobación debe evitar que una colisión concurrente supere el máximo.
- **Prioridad/tamaño:** media; S, con cobertura de create/update, movimiento entre grupos, límite exacto y concurrencia razonable.
- **Resolución BC-LST-8:** `AsignationsService` cuenta discos con `position` distinto de null/0 y limita los grupos WEEK a cuatro en altas y cambios que incrementan el destino. SPECIAL y MONTH quedan fuera. Se sincroniza el cambio de tipo de lista con altas/modificaciones mediante advisory locks transaccionales; convertir a WEEK rechaza grupos históricos por encima del máximo. Position 0 continúa sin límite.
- **Estado:** resuelto por BC-LST-8 (2026-10-16); prioridad/tamaño originales media / S.

###### LST-F8.1 — La posición 0 de Radar se incluía como grupo publicable

- **Hallazgo:** `generateWordPressPosts()` agrupaba todas las asignaciones con position no nula, incluyendo la bandeja 0, y `syncDiscToWeeklyPost()` podía actualizar su post asociado. La posición 0 está definida como pendiente de distribuir, no como grupo editorial.
- **Resolución BC-LST-8.1:** se omite position 0 en la generación semanal y se evita su sincronización individual. Las asignaciones quedan en la lista; cualquier tracking histórico de la posición 0 se conserva, sin borrado de posts ni cambios remotos. El flujo mensual no se filtra.
- **Estado:** resuelto por BC-LST-8.1 (2026-10-16); alcance backend-only.

###### LST-F9 — La edición de fechas no distingue fechas obligatorias de fechas anulables

- **Decisión confirmada:** Radar y Mejores no permiten borrar su fecha obligatoria. Los campos de fecha de otros flujos solo deben enviar `null` cuando el contrato admita anulación.
- **Evidencia:** los date inputs pueden producir `""`; el backend rechaza esa cadena, mientras BC-LST-2 admite limpieza explícita con null donde la fecha es anulable.
- **Impacto:** evitar PATCH inválidos y evitar que una fecha obligatoria se convierta en null. En otros flujos, enviar null solo si el contrato permite anular.
- **Prioridad/tamaño:** baja; XS frontend, validación backend cubierta por BC-LST-7.
- **Estado:** resuelto por BC-LST-9 (2026-10-16).

### Contract finding — LST-F6

**Current behavior:** Antes de BC-LST-6, Radar mostraba un campo description y lo enviaba en `PATCH /lists/:id`; el DTO rechaza propiedades desconocidas y List no tiene ese campo. La edición se retiró, manteniendo los campos válidos de descripción de Content.

**Problem:** la interfaz promete edición que nunca puede persistirse.

**Impact:** frontend-only para el control de List; no modificar campos válidos de Content.

**Options:**

1. Retirar el control y el envío `description` de la edición de List en Radar.
2. Mantener intactos los campos de descripción propios de Content y sus flujos.

**Recommendation:** cumplir la decisión confirmada con un cambio solo en el frontend de Lists y preservar las descripciones de Content.

**Blocks the current task:** No; la auditoría está completada y la decisión está tomada.

##### D. Mejoras opcionales y cobertura

- En la auditoría inicial no se encontraron tests frontend para las tres rutas. BC-LST-6 añade una prueba focal para la retirada del control y el payload Radar, incluida la continuidad del manejo de errores. La cobertura backend existente no caracteriza los contratos completos de interacción ni errores visuales.
- Priorizar pruebas pendientes para (1) protección frontend de fechas obligatorias y envío de null solo donde el contrato lo permite, y (2) máximo de cuatro en create/update/movimiento de Asignations Radar. BC-LST-7 añade cobertura backend de fechas y mantiene pruebas de reintento/publicación y sincronización transaccional de BC-LST-1/2.
- Los índices Radar/Mejores silencian errores de fetch y se presentan como vacíos; considerar estado de error visible. Los PATCH inline cambian el modelo local antes de recibir respuesta y no restauran el valor ante fallo. Son mejoras de UX de prioridad baja, sin tarea propuesta por ahora.
- Las opciones de año en `CreateContentModal.vue` están codificadas para 2025–2026; limita selección de periodos posteriores. Registrar como deuda temporal de interfaz, sin tarea separada hasta confirmar el horizonte editorial esperado.
- No se encontró duplicación funcional que justifique reorganizar Lists, Asignations, Contents o páginas; la distribución observada sigue la propiedad de datos e integraciones. No se propone refactor arquitectónico.

##### E. Dudas de negocio

- No quedan dudas de negocio abiertas para BC-LST-6–9: las decisiones sobre SPECIAL, fechas RADAR/BEST, descripción de List Radar, límite de grupo y fechas obligatorias están confirmadas. El umbral visual de diez en Mejores y el horizonte de años del calendario no forman parte de estas tareas.

##### BC-LST-6–9 — Estado de tareas

| Tarea | Hallazgo | Prioridad / tamaño | Propuesta mínima |
|---|---|---|---|
| **BC-LST-6** (completada 2026-10-16) | LST-F6 resuelto | Media / XS | Retirada del control `List.description` en Radar y añadido test del formulario, payloads restantes y error de guardado. Se conservaron los campos válidos de Content. |
| **BC-LST-7** (completada 2026-10-16) | LST-F7 resuelto | Media / S | Validación de creación y actualización de Content RADAR/BEST y List WEEK/MONTH; SPECIAL sin fechas editoriales. Ausencia conserva datos en PATCH y null no borra fechas obligatorias; helpers sin fecha por defecto. Sincronización transaccional List/Content y reglas REUNION preservadas. |
| **BC-LST-8** (completada 2026-10-16) | LST-F8 resuelto | Media / S | Máximo de cuatro discos por grupo WEEK protegido en creación, actualización y cambios de grupo; position 0 sin límite. Locks advisory transaccionales para concurrencia y validación al convertir una lista a WEEK. |
| **BC-LST-8.1** (completada 2026-10-16) | LST-F8.1 resuelto | Baja / XS | Excluir la bandeja Radar position 0 de generación y sincronización WordPress, conservar asignaciones y tracking histórico y mantener publicación MONTH. |
| **BC-LST-9** (completada 2026-10-16) | LST-F9 resuelto | Baja / XS | Impedir borrar fechas obligatorias de Radar y Mejores en la UI; en otros flujos enviar null solo si el contrato permite anular. Aceptación: vacío en Radar/Mejores no limpia fecha y los flujos anulables mantienen el envío null permitido por su contrato. |

#### BC-LST-6 — Retirar la edición de `List.description` en Radar (XS, frontend-only)

- [x] **Completada (2026-10-16).** LST-F6 resuelto; Lists permanece en cleanup por BC-LST-7, BC-LST-8 y BC-LST-9.
- **Implementación:** se eliminó el control de descripción en `RadarDetalle.vue`; los PATCH de nombre, estado y fechas conservan sus payloads por campo y no incluyen `description`. No se modificaron servicios/tipos de Content ni la edición de descripciones de Content/Asignation.
- **Pruebas:** `RadarDetalle.test.ts` cubre ausencia del control, PATCH de nombre/estado/fechas sin `description` y aviso ante error de guardado.
- **Verificaciones frontend:** `yarn test src/views/discos/RadarDetalle.test.ts` (3 tests aprobados); `yarn build` (incluye `vue-tsc`, build aprobado; se observaron avisos de CSS/chunks y Browserslist); `git diff --check`.
- **Alcance:** solo frontend; sin cambios en backend, entidades, migraciones, rutas o permisos. No se avanzó a otra tarea.

**Estado posterior a BC-LST-6:** Lists permanece **en cleanup** por BC-LST-7, BC-LST-8 y BC-LST-9. El hallazgo `free` queda registrado en BC-LST-10 como decisión independiente.

#### BC-LST-7 — Validar fechas según el tipo de lista (S, prioridad media)

- [x] **Completada (2026-10-16).** LST-F7 resuelto; Lists permanece **en cleanup** por BC-LST-8 y BC-LST-9.
- **Reglas aplicadas:** SPECIAL se crea y edita sin fechas editoriales ni defaults; WEEK/RADAR y MONTH/BEST requieren `List.releaseDate` / `Content.publicationDate` válidas al crear. Actualizar `releaseDate` o `publicationDate` a null, vacío o inválido devuelve HTTP 400; un campo ausente conserva la fecha. Una fecha válida puede reemplazar la existente. Entradas directas a Lists y cambios de tipo también respetan la fecha requerida. REUNION mantiene su requisito previo.
- **Sincronización:** creación de Content RADAR/BEST con su List y actualizaciones pareadas conservan la transacción local de BC-LST-2. No se modificaron integraciones externas, entidades, relaciones ni esquema. Los campos opcionales `listDate` y `closeDate` siguen admitiendo null donde el contrato lo permite.
- **Pruebas focalizadas:** `list.service.spec.ts` y `contents.service.spec.ts` cubren SPECIAL, fechas válidas/ausentes/null/inválidas, creación y actualización directa y desde Content, actualización parcial, generación de List mensual con fecha explícita, REUNION y rollback transaccional. `list.controller.spec.ts` comprueba body requerido/ISO para `POST /lists/weekly/create` y preserva su permiso; las suites de ambos controllers mantienen sus validaciones HTTP y roles.
- **Verificaciones:** Yarn focalizado (4 suites, 104 tests aprobados), `yarn --ignore-engines build`, `yarn --ignore-engines tsc --noEmit` y Prettier en los archivos backend propios aprobados. `git diff --check -- roadmap/backend-cleanup.md` ejecutado al cierre. No se accedió a PostgreSQL, WordPress ni Spotify.
- **Compatibilidad:** no se migraron datos históricos potencialmente incompatibles; no hay reparación automática ni tarea de datos incluida en BC-LST-7. Los callers existentes de `POST /lists/weekly/create` deben incluir `releaseDate`; callers sin body ahora reciben HTTP 400 en vez de crear una lista con fecha automática.
- **Alcance:** no se avanzó a BC-LST-8 ni BC-LST-9.

**Estado posterior a BC-LST-7:** Lists permanece **en cleanup** por BC-LST-8 y BC-LST-9. BC-LST-10 sigue completada como decisión independiente sobre `List.free`.

#### BC-LST-8 — Limitar Radar a cuatro discos por grupo (S, prioridad media)

- [x] **Completada (2026-10-16).** LST-F8 resuelto; Lists permanece **en cleanup** únicamente por BC-LST-9.
- **Regla:** las listas WEEK admiten como máximo cuatro discos por cada `position` distinto de null/0. Position 0 continúa siendo la bandeja sin asignar. SPECIAL y MONTH no tienen este límite.
- **Operaciones protegidas:** creación de Asignation; actualización de disco, posición o lista; movimientos hacia grupos completos; conversión de otra modalidad de List a WEEK cuando ya existan asignaciones. Las modificaciones dentro del mismo grupo y movimientos hacia un grupo con espacio se permiten; la cuenta excluye la propia asignación al validar un movimiento.
- **Concurrencia:** advisory locks transaccionales PostgreSQL coordinan por lista y por grupo. Las operaciones en grupos distintos comparten el lock de modalidad de lista, pero no se bloquean entre sí por capacidad. La conversión de tipo adquiere lock exclusivo de lista y revisa los grupos antes de guardar. No se añadió esquema ni migración. No se usó PostgreSQL: no era necesario para verificar las rutas de lock mediante pruebas unitarias y no se configuró una base de pruebas aislada para esta tarea.
- **Pruebas focalizadas:** suites de Asignations y Lists cubren primer/cuarto/quinto disco, position 0, posiciones negativas no nulas, actualizaciones dentro del grupo, movimiento con espacio y a grupo lleno, modalidades SPECIAL/MONTH, listas inexistentes, errores de persistencia, ausencia de save parcial, locks antes de contar y conversiones de tipo con grupos dentro/fuera del límite.
- **Verificaciones:** `yarn --ignore-engines test` focalizado (4 suites, 133 tests aprobados); `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit`; Prettier en los archivos propios; `git diff --check`. Node disponible es 22.23.1 y `package.json` declara Node 20, por eso Yarn se ejecutó con `--ignore-engines`.
- **Compatibilidad:** rutas, permisos, DTOs, respuestas, orden editorial, fechas y publicación Gutenberg/WordPress no se modificaron. No se avanzó a BC-LST-9 ni a otra tarea.
- **Hallazgo posterior:** la inclusión de position 0 descubierta al cerrar BC-LST-8 quedó resuelta en BC-LST-8.1.

**Estado posterior a BC-LST-8:** Lists permanece **en cleanup** por BC-LST-9. BC-LST-10 sigue completada como decisión independiente sobre `List.free`.

#### BC-LST-8.1 — Excluir la bandeja sin asignar de la publicación Radar (XS, backend-only)

- [x] **Completada (2026-10-16).** LST-F8.1 resuelto; BC-LST-8 se mantiene completada y Lists sigue **en cleanup** por BC-LST-9.
- **Comportamiento anterior:** el agrupamiento semanal incluía cualquier posición no nula, por lo que position 0 podía generar/actualizar un post Radar. La sincronización individual también podía editar un post si había tracking para esa posición.
- **Comportamiento actual:** para listas WEEK, position 0 queda fuera de los grupos publicables y no se sincroniza por asignación. Se conservan en memoria/BD las asignaciones y el tracking position 0. Las posiciones distintas de 0 mantienen el procesamiento existente. MONTH y SPECIAL no reciben el filtro.
- **Reconciliación e histórico:** no se eliminan posts o bloques remotos ni se borra tracking histórico de position 0. Si ese grupo se publicó previamente, permanece en WordPress y su tracking local se conserva; requiere revisión manual si se desea limpiarlo.
- **Pruebas:** Lists prueba asignaciones 0/1/2, solo posición 0, selección explícita 0, conservación de asignaciones/tracking, sincronización individual, publicación mensual y reintento/reconciliación BC-LST-1.
- **Verificaciones:** `yarn --ignore-engines test --runInBand` focalizado (5 suites, 159 tests aprobados), `yarn --ignore-engines build`, `yarn --ignore-engines tsc --noEmit`, Prettier focalizado y `git diff --check`. Sin llamadas reales a PostgreSQL o WordPress.
- **Alcance:** sin cambios de DTOs, entidades, migraciones, rutas, contratos, frontend o límites BC-LST-8. No se avanzó a BC-LST-9.

**Estado posterior a BC-LST-8.1:** Lists permanece **en cleanup** por BC-LST-9. BC-LST-8 y BC-LST-10 siguen completadas.

#### BC-LST-9 — Alinear las fechas de Radar y Mejores con el backend (XS, frontend-only)

- [x] **Completada (2026-10-16).** LST-F9 resuelto; Lists sigue **en cleanup**, pendiente de reorganización arquitectónica. No se avanzó a otra tarea.
- **Contratos verificados:** `releaseDate` es obligatoria para Lists WEEK/MONTH; `listDate` y `closeDate` son anulables. `POST /lists/weekly/create` exige `releaseDate`; no hay consumidores frontend de esa ruta. El consumidor interno `ContentsService` pasa `publicationDate` al helper semanal.
- **Implementación:** Radar y Mejores validan `releaseDate` y no envían PATCH si está vacía o inválida; restauran el valor anterior y muestran validación comprensible. Fechas válidas se envían como `YYYY-MM-DD`. Radar mantiene `listDate`/`closeDate` y Mejores `listDate` como opcionales, enviando `null` explícitamente al vaciarlas. Se preserva `listDate` como fecha opcional usada por la selección mensual.
- **Pruebas:** `yarn test src/views/discos/RadarDetalle.test.ts src/views/discos/MejoresDetalle.test.ts` (2 suites, 9 tests aprobados); payloads válidos/opcionales, fecha vacía/inválida/sin cambios y error de guardado.
- **Verificaciones frontend:** `yarn build` (typecheck y build aprobados; avisos preexistentes de CSS/chunks y Browserslist); `git diff --check` aprobado.
- **Alcance:** sin cambios de código backend, contratos, rutas o consumidores. Lists continúa en cleanup pendiente de reorganización arquitectónica; BC-LST-7/8/8.1 siguen completadas y BC-LST-12–16 permanecen pendientes.

### Cobertura y decisiones sin tarea

- `list.controller.spec.ts` comprueba roles mínimos de creación/publicación, delegación WordPress y validación de parámetros de periodo mediante ValidationPipe. La metadata HTTP completa y las guardas de lecturas siguen sin caracterizarse.
- `list.service.spec.ts` cubre cambios de estado temporal semanal/mensual, selección de tracks Spotify, creación de post, sincronización de fechas, reintentos y eliminación transaccional. No cubre `free` ni todo el CRUD; paginación y errores DB siguen sin caracterizar.
- No se encontraron duplicados funcionales, N+1 demostrado ni consulta que justifique optimización. No se proponen reorganización de ListsService por tamaño, extracción de servicios, cambio de relaciones eager, índices ni rediseño de payload. La respuesta pública de Lists incluye relaciones eager de Asignations/Links; sus consumers frontend no se inspeccionaron, por lo que se preserva el shape.
- Se observó que GET `/lists` está autenticado y varias lecturas específicas son públicas; se mantiene como contrato existente al no haber evidencia suficiente de que la diferencia sea un error de autorización. Al cierre de BC-LST-10, `ContentList.free` también se retiró del contrato frontend.
- Los errores WordPress propagados pueden ocurrir después de que Asignation quede guardada, porque la sincronización se ejecuta después del save. Ese resultado parcial entre PostgreSQL y WordPress se documenta y no se considera por sí solo un defecto: las operaciones no tienen que ser atómicas entre sistemas. BC-LST-1 aborda el defecto reproducible de duplicación en reintentos, no promete una transacción distribuida.

**Verificaciones de BC-LST-0:** revisión estática de implementación, DTOs, módulos, entidad/relaciones, pruebas, composición y consumidores; coherencia revisada contra Backend Architecture, BA-14.A/BA-14.B y reglas generales del roadmap. `git diff --check -- roadmap/backend-cleanup.md` ejecutado tras actualizar este documento. No se ejecutaron tests, build, typecheck, migraciones ni operaciones contra PostgreSQL o servicios externos. Los demás módulos de Editorial permanecen pendientes.

## Hallazgos históricos pendientes de clasificación futura

Se conservan como avisos recibidos; **BC-0 no los investigó ni corrigió**. Su clasificación corresponde a una auditoría o tarea futura del módulo dueño:

- Specs legacy de Versions que construyen `TestingModule` sin `VersionRepository`.
- Expectativa SQL de DiscCatalog sobre `addSelect` que no coincide con la consulta actual.
- Tres suites HTTP que quedaron pendientes por `listen EPERM` al abrir listener.
- Discrepancia `roles` / `role` en `SeedService`.
- Internacionalización todavía no implementada funcionalmente.
- Revisión posterior de `roles-migration/`.
- Referencias documentales históricas a rutas antiguas.

## Auditoría BC-LST-11 — Plan arquitectónico para ListsService

**Estado:** auditoría completada (2026-10-16). BC-LST-12 y BC-LST-13 se completaron después mediante extracciones incrementales; BC-LST-14 se completó después; BC-LST-15–16 siguen pendientes. Lists continúa **en cleanup** por esas tareas y BC-LST-9, cuyo estado frontend actual se conserva sin cambios por esta tarea. BC-LST-8 permanece completada. No se avanzó a otro módulo.
**Base observada:** rama actual. Se conservaron los cambios locales preexistentes; no se atribuyen a esta auditoría.
**Alcance:** AGENTS.md, este roadmap y `roadmap/backend-architecture.md`; `src/editorial/lists/list.service.ts` completo (2.284 líneas), módulo/controller/DTOs/entidades y Asignations; módulos/consumidores de Contents, Videos, WordPress Integration y Spotify Integration; composición `AppModule`; suites de Lists, Asignations y WordPress Integration. Revisión estática de métodos, dependencias y referencias. No se inspeccionó ni modificó frontend, no se ejecutaron tests/build/typecheck y no hubo acceso a PostgreSQL ni a servicios externos. Solo se actualizó este roadmap.

### Inventario y responsabilidades actuales

La cifra de 2.284 líneas incluye imports, constantes, comentarios y lógica. El reparto aproximado por bloques físicos es orientativo; varias unidades colaboran y no se deben extraer por corte de líneas.

| Responsabilidad | Métodos actuales | Dependencias y consumidores |
|---|---|---|
| CRUD y lectura base | Públicos: `create`, `findAll`, `findOne`, `update`, `removeList`. Privado: `removeListWithManager`. | `Repository<List>`, `Repository<Content>`, `EntityManager`. `ListsController` consume el CRUD; `ContentsService.remove()` consume `removeList(id, manager)`. `findOne` es además el cargador común interno para publicación y se usa en endpoints. |
| Fechas, coordinación List/Content y transacciones | Privados: `validateCreateDateRules`, `lockListTypeForUpdate`, `assertRadarGroupsWithinLimit`, `validateUpdateDateRules`, `assertRequiredEditorialDate`, `hasAnyDate`, `assignDateIfChanged`, `dateValuesMatch`, `listTypeHasSyncedListDate`; lógica transaccional en `update`, creación/borrado. | Repositorios List/Content y manager transaccional TypeORM. `ContentsService` crea listas WEEK/MONTH pasando su manager y delega el borrado pareado con el mismo manager. `VideosService` crea List VIDEO. La sincronización no invoca servicios externos dentro de la transacción local. |
| Consultas y calendario | Públicos: `findUpcoming`, `findNext`, `findAllSpecialLists`, `findAllVideoLists`, `findCurrentMonthLists`, `findPastMonthListsByYear`, `findCurrentWeeklyLists`, `findPastWeeklyListsByMonth`, `findCurrentVideoLists`, `findPastVideoListsByYear`. Funciones de fecha exportadas: `getWeeklyOpenCutoff`, `getMonthlyReferenceStart`; constantes de gracia/cierre mensual. | Solo `Repository<List>` y reglas de fechas/estados. Consumidos por `ListsController`; los servicios Contents, Videos y Asignations no llaman estas consultas. `findAll` permanece en el CRUD por ser el listado general paginado. |
| Creación de listas por tipo | Públicos: `createVideoList`, `createWeeklyList`, `createMonthlyList`. | `Repository<List>`, `EntityManager` opcional y validación de fechas. Contents llama WEEK/MONTH dentro de la transacción Content/List; Videos llama VIDEO. No son CRUD genérico: materializan las modalidades editoriales con reglas de fechas específicas. |
| Generación/publicación semanal Radar | Público: `generateWordPressPosts`; privados: cálculo/agrupación por posición, metadatos/tags, adopción por slug, llamada a reconciliación, armado de respuesta y tracking `wpWeeklyPosts`. | `findOne`, `Repository<List>`, WordPress y Spotify. Entrada del controller `POST /lists/:id/wp-posts`. Agrupa solo posiciones publicables; position 0 queda excluida según BC-LST-8.1. |
| Sincronización por asignación | Público: `syncDiscToWordPress`; privados: `syncDiscToMonthlyPost`, `syncDiscToWeeklyPost`, `getWeeklyReleaseFriday`, `buildWeeklyPostTitle`. | List y asignación eager cargada, WordPress/Spotify, tracking JSONB y reconciliación común. `AsignationsService.update()` la invoca después de guardar cambios de texto editorial; no hay transacción conjunta PostgreSQL/WordPress. La rama WEEK evita sincronizar position 0. |
| Generación/publicación mensual Mejores discos | Público: `generateBestDiscsWordPressPost`; privados: `createBestDiscsPost`, `appendNewDiscsToBestPost`, `linkListToWpPost`, `toPublishedDiscRecord`. | `Repository<List>`, WordPress, Spotify y reconciliación común. Entrada `POST /lists/:id/wp-best-post`, validada para MONTH. Mantiene `wpPostId`, `wpPostUrl` y `wpPublishedDiscs`. |
| Reconciliación idempotente WordPress | Privados: `updatePostContentWithReconciliation`, `createPostAndReconcile`, `uncertainWordPressResult`, `syncDiscsIntoPost`; inserción, detección y reemplazo de bloques: `insertBeforeFooter`, `findFooterMarkerIndex`, `findDiscSectionBoundaries`, `findDiscGroupMarkers`, `getUniqueDiscSection`, `replaceDiscSection`. | WordPress, Spotify/autores y tracking de List; colaboran con flujos semanal, mensual y sincronización individual. La unidad decide si crea/actualiza bloques, confirma escrituras inciertas y mantiene IDs estables sin tocar contenido ajeno. |
| Construcción de Gutenberg | Privados: `buildPostContent`, `buildWeeklyDiscSections`, `buildBestDiscsPostContent`, `buildDiscSections`, `buildSocialFooter`, `extractParagraphs`, `buildExtraParagraphBlocks`; marcador estático del footer. | Datos ya cargados de List/Asignation/Disc/User, IDs Spotify y autores resueltos por la capa de publicación. Produce dos formatos editoriales distintos (Radar semanal y Mejores mensual) que comparten grupos `rv-disc-<id>` y footer marcado. |
| Adaptación Spotify/autores | Privados: `resolveSpotifyTrackId`, `resolveAuthors`. | Spotify API pública y búsqueda de autor WordPress. Se usan al renderizar bloques; el track manual tiene prioridad y los fallos de Spotify usan fallback sin cancelar la publicación. Son adaptadores de datos necesarios para publicación, no un módulo nuevo ni ownership de Integrations. |
| Errores de persistencia | Privado: `handleDbExceptions`. | Traduce violación única PostgreSQL y error inesperado en excepciones HTTP. Se usa en CRUD/creación; no forma una responsabilidad de negocio independiente. |

### Dependencias, acoplamientos y evaluación arquitectónica

- `ListsService` inyecta cuatro dependencias directas: repositorios TypeORM de List y Content, `WordpressService` y `SpotifyPublicApiService`. La mezcla más marcada es entre escrituras editoriales/transaccionales locales y flujos remotos WordPress/Spotify: estos últimos ocupan aproximadamente 1.250 líneas de lógica de publicación, reconciliación y resolución de datos dentro de la misma clase que administra calendario y fechas.
- El código local List/Content mantiene un límite transaccional importante: las escrituras pareadas reciben el `EntityManager` de la operación de origen. BC-LST-2 y BC-LST-7 se sostienen en que List y Content se escriben usando ese manager común. Las extracciones futuras no deben abrir transacciones nuevas ni cambiar los parámetros manager opcionales de `createWeeklyList`, `createMonthlyList`, `removeList`.
- El máximo de cuatro asignaciones por grupo se implementa coordinadamente: Asignations adquiere locks advisory transaccionales por lista/grupo; Lists bloquea conversión de tipo y valida grupos existentes antes de volver una lista WEEK. `ListsService` no depende de `AsignationsService`; `AsignationsService` depende de ListsService para sincronización externa, no para el lock de capacidad. Mantener validación y ownership del límite en su ubicación actual, salvo futura decisión con evidencia; ninguna extracción propuesta necesita tocar Asignations.
- `List` carga `asignations` y `links` como relaciones eager+cascade. La generación WP usa además `disc`, `artist` y `user`; cualquier publicación extraída debe cargar una forma equivalente y conservar el orden editorial. No reducir relaciones ni modificar respuestas HTTP.
- `ContentsModule` importa `ListsModule` con `forwardRef` y `ContentsService` inyecta ListsService con `forwardRef`; ListsModule registra su propio repositorio Content, pero no importa ContentsModule ni inyecta ContentsService. La dependencia de módulo efectiva observada es Contents → Lists; no se identifica un ciclo Nest real dentro de este par. VideosModule y AsignationsModule también importan ListsModule; ListsModule no importa ninguno de ellos. Mantener los módulos actuales y revisar los imports DI en cada extracción, sin agregar `forwardRef` por precaución ni introducir un módulo agregador.
- `WordpressService` es el cliente REST del proveedor y también se consume por News para lectura de feed. La política de publicación, slugs, tags, marcadores, tracking y reconciliación es responsabilidad editorial de Lists, no debe trasladarse a WordPress Integration. Spotify Integration conserva el transporte; selección de track/fallback y su uso en esos posts sigue siendo política del caso de uso Lists.
- No se encontró duplicación textual que convenga eliminar como tarea aparte. Hay dos renderizadores intencionadamente distintos, con estructuras y contenido propio, y un único algoritmo compartido de reconciliación que parametriza el render. La fecha de viernes se calcula tanto en generación como en `getWeeklyReleaseFriday`; debe caracterizarse durante la extracción, pero no hay que cambiar reglas de fecha como parte de esta auditoría. Tampoco se propuso dividir el error DB, cada método pequeño o la coordinación List/Content en servicios artificiales.
- `ListService` no ofrece actualmente fachada de export/alias: la clase pública es `ListsService`. Mantenerla como fachada del controller y de los consumidores Contents, Videos y Asignations sí aporta valor para conservar DI y firmas públicas mientras se extraen proveedores internos. El controller puede seguir delegando en ListsService; no hay beneficio probado en cambiar su contrato o resolver ahora el `forwardRef` de Contents.

### Estructura mínima propuesta

```text
src/editorial/lists/
  list.service.ts                         # CRUD, fechas, creación por tipo y coordinación local List/Content
  list-calendar.service.ts                # consultas específicas de calendario
  wordpress/
    list-gutenberg-builder.ts             # renderizadores y transformaciones HTML puras
    list-wordpress-reconciliation.service.ts # bloques marcados, escritura incierta, reconciliación compartida
    weekly-list-publisher.service.ts      # generación Radar y sync individual semanal
    monthly-list-publisher.service.ts     # publicación Mejores y sync individual mensual
```

`ListCalendarService` solo requiere `Repository<List>`. El builder es una unidad de funciones puras (no un provider Nest si no hay necesidad de DI), con tipos de entrada explícitos y tests directos del HTML/orden/marcadores. La reconciliación es un provider editorial porque coordina WordPress, selección Spotify/autores y estado de tracking; no pertenece al cliente de integración. Los dos publishers son providers del módulo Lists y dependen del reconciliador y builder; el semanal también gestiona entradas `wpWeeklyPosts`, el mensual `wpPostId`/`wpPublishedDiscs`.

`ListsService` conserva las firmas públicas que consumen controller y otros módulos, y delega publicación al publisher correspondiente; `syncDiscToWordPress` selecciona MONTH/WEEK luego de cargar la List y delega el sync apropiado. No debe inyectarse ListsService de vuelta en esos proveedores: se pasan los objetos cargados o se accede directamente al repositorio necesario, evitando ciclo. La coordinación local List/Content permanece en ListsService, que recibe managers externos como hoy. No se propone mover lógica a Contents, Asignations, WordPress Integration ni crear un módulo ListsPublishing nuevo.

### Plan de implementación incremental

BC-LST-12 y BC-LST-13 se completaron como se documenta abajo. BC-LST-15–16 siguen pendientes; ejecutarlas secuencialmente y completar caracterización/regresión de cada una antes de iniciar la siguiente.

#### BC-LST-12 — Extraer las consultas de calendario de Lists (S)

- [x] **Completada (2026-10-16).** Las consultas se trasladaron a `ListCalendarService`; `ListsService` conserva los métodos públicos como fachada. Ver registro de cierre al final de esta auditoría.
- **Objetivo:** trasladar consultas de listas por tipo/periodo a `ListCalendarService` y dejar CRUD, `findOne`, fechas y creación de List en `ListsService`.
- **Métodos:** `findUpcoming`, `findNext`, `findAllSpecialLists`, `findAllVideoLists`, `findCurrentMonthLists`, `findPastMonthListsByYear`, `findCurrentWeeklyLists`, `findPastWeeklyListsByMonth`, `findCurrentVideoLists`, `findPastVideoListsByYear`; mover o importar con ownership claro `getWeeklyOpenCutoff`, `getMonthlyReferenceStart`, `WEEKLY_CLOSE_GRACE_DAYS`, `MONTHLY_CLOSE_DAY`.
- **Archivos:** nuevo `list-calendar.service.ts` y spec adyacente; `list.module.ts`; delegación/wiring en `list.service.ts` y, si hace falta, `list.controller.ts` sin cambiar rutas ni respuestas.
- **Dependencias/consumidores:** solo `Repository<List>`; controller es consumer de las consultas temporales. `ListsService` conserva sus métodos públicos como forwarding para reducir cambios y fijar compatibilidad durante la migración.
- **Aceptación:** mismo filtro, orden, límites temporales, shape y errores; no cambia `findAll`/`findOne`, las fechas de escritura ni las transacciones. Providers registrados una vez y DI resuelta sin ciclo.
- **Regresión:** casos actuales del spec de calendario semanal/mensual, desempates y partición actuales/pasadas; añadir lectura de métodos especiales/vídeo y errores de consulta si no están caracterizados. Ejecutar suites focalizadas de Lists y consumers directos.

**Cierre BC-LST-12:** se movieron `findUpcoming`, `findNext`, las consultas específicas por tipo/periodo y los helpers/constantes de ventanas semanal/mensual. Los métodos de `ListsService` y las exportaciones previas de helpers permanecen compatibles. `ListCalendarService` recibe solo el repositorio List; `ListsModule` lo registra y ListsService lo inyecta, sin dependencia circular ni cambio en los consumers. El spec de Lists conserva la caracterización de calendario vía fachada y el nuevo `list-calendar.service.spec.ts` verifica inyección, registro Nest y propagación de errores. No se tocaron reglas de escritura, transacciones, publicación, entidades o esquema.

- **Pruebas:** 8 suites focalizadas de Lists, Asignations y Contents; 160 tests aprobados. Contents y Asignations se verificaron como consumidores directos. Videos no tiene spec de servicio en el árbol actual; su consumo `createVideoList` no se modificó.
- **Verificaciones:** `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier focalizado en los archivos TypeScript afectados y `git diff --check -- roadmap/backend-cleanup.md`.
- **Tamaño actual:** `list.service.ts` queda en 2.122 líneas; `list-calendar.service.ts` contiene 211 líneas. Las estimaciones de tamaño final tras BC-LST-13–16 permanecen como aproximación.
- **Estado:** completada (2026-10-16). BC-LST-13–16 continúan pendientes; el estado de BC-LST-9 se conserva como estaba. Lists permanece **en cleanup** y no se avanzó a otra tarea.

#### BC-LST-13 — Extraer la construcción de bloques Gutenberg (S)

- [x] **Completada (2026-10-16).** Se capturaron snapshots del render antiguo antes de moverlo; el builder extraído produce la misma salida byte a byte.
- **Objetivo:** aislar el render HTML puro, preservando exactamente los dos formatos y los marcadores que permiten la reconciliación.
- **Métodos:** `buildPostContent`, `buildWeeklyDiscSections`, `buildBestDiscsPostContent`, `buildDiscSections`, `buildSocialFooter`, `extractParagraphs`, `buildExtraParagraphBlocks` y `FOOTER_MARKER_CLASS`. Mantener en publicación la resolución de Spotify y autor.
- **Archivos:** nuevo `wordpress/list-gutenberg-builder.ts` y spec; adaptación de `list.service.ts` hasta el posterior traslado del publisher. Sin cambio de entidad/DTO ni del paquete Gutenberg.
- **Dependencias/consumidores:** funciones sin DI que reciben asignaciones, List/datos del post, tracks/autores. Solo los flujos de publicación los consumen.
- **Aceptación:** salida HTML byte a byte equivalente para los fixtures representativos, mismo orden editorial, clase `rv-disc-<id>`, footer, embeds, párrafos y diferencias Radar/Mejores; ninguna operación de persistencia o red dentro del builder.
- **Regresión:** mover/caracterizar los tests existentes de track embed, bloques Gutenberg, contenido/orden y footer; casos sin imagen, descripción vacía/mult párrafo, autor/track fallback y caracteres/IDs representativos.

**Cierre BC-LST-13:** `buildPostContent`, `buildWeeklyDiscSections`, `buildBestDiscsPostContent`, `buildDiscSections`, `buildSocialFooter`, `extractParagraphs`, `buildExtraParagraphBlocks` y `FOOTER_MARKER_CLASS` se movieron a `wordpress/list-gutenberg-builder.ts` como funciones sin servicios ni persistencia. `ListsService` conserva la selección Spotify/autores, publicación, tracking y reconciliación; importa los renderizadores y el marcador de footer.

- **Equivalencia:** antes de extraer, el spec nuevo llamó a los métodos privados actuales y guardó dos snapshots Jest externos: Radar con varias posiciones y fallback, y Mejores con varios discos. Tras extraer, se redirigieron exactamente las mismas entradas a las funciones puras y ambos snapshots pasaron sin actualizarse; cubren IDs UUID, caracteres acentuados/HTML, imágenes presentes/ausentes, descripción vacía/multipárrafo, track disponible/fallback, autor WordPress/fallback, marcador de disco, footer y separación de grupos. No se alteraron metadatos de los posts, que permanecen en publicación.
- **Pruebas:** suites focalizadas de builder, Lists (publicación Radar/Mejores y reconciliación), controller y WordPress Integration: 4 suites, 118 tests aprobados y 2 snapshots aprobados. Sin llamadas externas.
- **Verificaciones:** `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a `list.service.ts` y los dos archivos del builder; `git diff --check`.
- **Tamaño actual:** `list.service.ts` queda en 1.813 líneas; el módulo puro del builder tiene 312 líneas.
- **Estado:** completada (2026-10-16). BC-LST-15–16 siguen pendientes; Lists permanece **en cleanup**. El estado de BC-LST-9 no se altera; no se avanzó a otra tarea.

#### BC-LST-14 — Extraer la reconciliación WordPress idempotente (M)

- **Estado:** completada (2026-10-16). BC-LST-15 y BC-LST-16 siguen pendientes; Lists permanece en cleanup.

- **Objetivo:** agrupar el algoritmo compartido de escritura/relectura segura y reconciliación de bloques; no cambiar los callers ni prometer transacción distribuida.
- **Métodos:** `updatePostContentWithReconciliation`, `createPostAndReconcile`, `uncertainWordPressResult`, `syncDiscsIntoPost`, `insertBeforeFooter`, `findFooterMarkerIndex`, `findDiscSectionBoundaries`, `findDiscGroupMarkers`, `getUniqueDiscSection`, `replaceDiscSection`, `resolveSpotifyTrackId`, `resolveAuthors`, `toPublishedDiscRecord` (ubicar tracking mapper donde evite dependencia circular).
- **Archivos:** nuevo `wordpress/list-wordpress-reconciliation.service.ts` y spec; provider de ListsModule; ambos flujos de publicación aún en ListsService delegan al provider. No mover `WordpressService` ni su contrato.
- **Dependencias/consumidores:** WordPress, Spotify, builder de BC-LST-13, errores/resultados inciertos de WordPress y tipos JSONB de List. Consumido por publicación semanal/mensual y sync individual; recibe content/IDs/trackers, sin llamar a ListService ni abrir transacciones TypeORM.
- **Aceptación:** conserva 4xx vs resultado incierto, verificación exacta del contenido y marcador, adopción idempotente, bloques ajenos, errores de identidad Gutenberg duplicada/incompleta y resultado de tracking; DI sin ciclo y sin cambio de HTTP.
- **Regresión:** mover y ampliar casos BC-LST-1 de primer intento/reintento, save posterior fallido, lookup incierto por slug, actualización remota incierta, marcador local/remote, duplicados, footer y contenido ajeno; WordPress Integration spec no requiere cambios funcionales.
- **Implementación:** `ListWordPressReconciliationService` centraliza la reconciliación de bloques, creación/actualización segura, selección de Spotify/autores y mapping de tracking. Se registra una vez en `ListsModule`; `ListsService` delega desde publicación Radar/Mejores y sync individual sin cambiar su fachada ni abrir transacciones TypeORM.
- **Pruebas y verificaciones:** suites focalizadas de reconciliación, Gutenberg, Lists, controller, Asignations y WordPress Integration: 6 suites, 154 tests y 2 snapshots aprobados. Build y typecheck con Yarn aprobaron; Prettier se limitó a archivos propios y `git diff --check` pasó. Sin conexiones externas.
- **Tamaño:** `list.service.ts` queda en 1.433 líneas. No se cambió `WordpressService`, HTML Gutenberg, tracking ni generación semanal/mensual.

#### BC-LST-15 — Extraer publicación y sincronización semanal Radar (M)

- [x] **Completada (2026-10-16).** Lists permanece en cleanup; BC-LST-16 sigue pendiente.
- **Objetivo:** encapsular los flujos por posición Radar y su tracking `wpWeeklyPosts`.
- **Métodos:** `generateWordPressPosts`, `syncDiscToWeeklyPost`, `getWeeklyReleaseFriday`, `buildWeeklyPostTitle` y la agrupación/slug/SEO/tags y respuesta semanal que hoy están inline dentro de `generateWordPressPosts`.
- **Archivos:** nuevo `wordpress/weekly-list-publisher.service.ts` y spec; ListsModule; delegación desde `ListsService` y tipos compartidos solo donde sean reales.
- **Dependencias/consumidores:** List/repository, WordPress, builder y reconciliación de BC-LST-13/14. `ListsService` preserva firma pública para `ListsController` y `AsignationsService`; el provider semanal no llama de vuelta a ListsService.
- **Aceptación:** Radar sigue publicando posiciones positivas en orden editorial, excluye position 0 de generación y sync, mantiene tracking por posición, adopción por slug y respuesta existente; límites BC-LST-8, estado de lista y fechas no cambian. No escribe ni elimina asignaciones.
- **Regresión:** tests actuales de Radar 0/1/2, lista solo con bandeja, posición solicitada, reintentos/reconciliación, orden, post borrado/papelera, primer sync y cambio de grupo ya permitido; verificar que ningún flujo mensual se altera.
- **Implementación:** `WeeklyListPublisherService` recibe la lista cargada desde la fachada y gestiona agrupación semanal, metadata/tags/slug, generación, adopción y sync individual. Se registra una vez en `ListsModule`; no depende de vuelta de `ListsService`. La fachada conserva `generateWordPressPosts` y `syncDiscToWordPress`; la publicación MONTH permanece en `ListsService`.
- **Pruebas y verificaciones:** suites focalizadas de publicador, Lists, Asignations, reconciliación, builder Gutenberg, controller y WordPress Integration: 7 suites, 168 tests y 2 snapshots aprobados. Build, typecheck, Prettier focalizado y `git diff --check` aprobados. Sin conexiones a PostgreSQL ni servicios externos.
- **Tamaño actual:** `list.service.ts` queda en 1.043 líneas; el publicador semanal se encuentra en su propio servicio y spec. No se modificaron reconciliación, HTML, tracking histórico ni sincronización mensual.
- **Estado:** completada (2026-10-16). BC-LST-16 sigue pendiente; Lists continúa **en cleanup**. No se avanzó a otra tarea.

#### BC-LST-16 — Extraer publicación mensual Mejores discos (M)

- [x] **Completada (2026-10-16).** Lists permanece en cleanup, pendiente de BC-LST-17.
- **Objetivo:** encapsular generación, adopción/recreación y sync incremental del post mensual, separado del flujo semanal.
- **Métodos:** `generateBestDiscsWordPressPost`, `createBestDiscsPost`, `appendNewDiscsToBestPost`, `syncDiscToMonthlyPost`, `linkListToWpPost`; mantener en reconciliador el algoritmo compartido y en builder las plantillas.
- **Archivos:** nuevo `wordpress/monthly-list-publisher.service.ts` y spec; ListsModule; delegación de métodos públicos/fachada `syncDiscToWordPress` desde ListsService.
- **Dependencias/consumidores:** List/repository, WordPress, builder y reconciliación de BC-LST-13/14. Controller y Asignations conservan su integración mediante ListsService.
- **Aceptación:** solo MONTH genera Mejores; orden, títulos/metadatos/slug, sincronización de bloques y tracking se conservan. La publicación mensual no filtra position 0 (BC-LST-8.1), no adopta la regla de capacidad BC-LST-8 fuera de WEEK y mantiene idempotencia BC-LST-1.
- **Regresión:** generación inicial, post enlazado/vacío, adopción por slug, post eliminado/en papelera, adición/edición de discos, position 0 mensual, track/manual y autor, fallos de save y reintento sin duplicados.
- **Implementación:** `MonthlyListPublisherService` recibe la List ya cargada y gestiona la publicación MONTH, adopción, sincronización incremental/individual y tracking `wpPostId`/`wpPostUrl`/`wpPublishedDiscs`. Se registra una vez en `ListsModule`; `ListsService` conserva sus métodos públicos y distribuye sync entre publicadores MONTH y WEEK. No se filtró position 0 ni se aplicó el límite Radar.
- **Pruebas y verificaciones:** suites focalizadas del publicador mensual, semanal, Lists, controller, Asignations, reconciliación, Gutenberg y WordPress Integration: 8 suites, 178 tests y 2 snapshots aprobados. Build, typecheck, Prettier focalizado y `git diff --check` aprobados. Sin conexiones externas.
- **Tamaño actual:** `list.service.ts` queda en 746 líneas; el publicador mensual tiene su servicio y spec propios. La generación Gutenberg, reconciliación compartida y publicador semanal permanecen sin cambios.
- **Estado:** completada (2026-10-16). Lists continúa **en cleanup**, pendiente de BC-LST-17; no se avanzó a otro módulo.

#### BC-LST-17 — Auditoría final de responsabilidades y plan para ListsService (S)

- **Estado:** auditoría completada (2026-10-16). No se modificaron código ni pruebas; Lists continúa **en cleanup** hasta implementar y verificar las tareas aprobadas abajo. No se cierra el módulo ni se avanza a otro.
- **Base y alcance:** revisión estática del `ListsService` actual (746 líneas en el checkout, con cambios locales preservados), `ListsModule`, controller, DTOs/reglas, módulos y servicios de Contents, Videos y Asignations, providers Nest, búsquedas de consumidores y specs existentes. No se inspeccionó frontend ni se accedió a PostgreSQL o servicios externos.

##### Inventario de métodos restantes

| Método(s) | Responsabilidad y dependencias | Consumidores conocidos | Visibilidad | Destino recomendado |
| --- | --- | --- | --- | --- |
| `create`, `findAll`, `findOne` | Crear List validando el tipo/fechas; listado paginado por nombre con filtros de status; resolver List por ID y traducir no encontrado. `Repository<List>`, DTOs, reglas de fecha y traducción de error DB. | `create`, `findAll`, `findOne`: `ListsController`; `findOne`: también los métodos de publicación de la fachada. | Públicos | `ListCrudService`; `ListsService` mantiene wrappers para controller/consumidores. |
| `update` | Actualizar List; sincronizar las fechas explícitamente modificadas al Content enlazado; guardar el par en transacción si hace falta; bloquear cambio de tipo y validar capacidad Radar al convertir a WEEK. `Repository<List>`, `Repository<Content>`, `EntityManager`, query advisory sobre List y grupos de Asignation. | `ListsController`; no se encontró llamada directa desde Contents, Videos o Asignations. | Público | `ListContentCoordinator` para la operación y sus persistencias; reglas puras permanecen en helper. |
| `removeList`, `removeListWithManager` | Eliminar Content asociado y List. Acepta manager externo de Contents o abre transacción al borrar el par; sin Content conserva la ruta actual de borrado de List. | `ListsController`; `ContentsService.remove` pasa explícitamente el manager transaccional. El helper es solo interno. | Público / privado | `ListContentCoordinator`, preservando ambos caminos y el mismo `EntityManager`. |
| `validateCreateDateRules`, `validateUpdateDateRules`, `assertRequiredEditorialDate`, `hasAnyDate`, `dateValuesMatch`, `assignDateIfChanged`, `listTypeHasSyncedListDate` | Validación de fechas obligatorias WEEK/MONTH, SPECIAL sin fechas, comparación/copia de fechas y política de qué tipos sincronizan `listDate`. No hacen I/O salvo que el caller use el resultado. | Validaciones propias de `ListsService`; la función exportada `isValidDateValue` también la importa `ContentsService`. | Privados; `isValidDateValue` exportada | No crear un provider `ListRules` por ahora. Mantener las funciones puras en `list-date-rules.ts` y añadir allí solo reglas que realmente tengan dos consumers; reglas de orquestación local pueden permanecer como funciones privadas del coordinador. |
| `lockListTypeForUpdate`, `assertRadarGroupsWithinLimit` | Serializar cambio de tipo con advisory lock y comprobar que ningún grupo Radar supera cuatro discos antes de convertir una List a WEEK. Requiere manager PostgreSQL y consulta a `asignation`. | Solo `update`; Asignations no llama a Lists para esta validación y mantiene sus propios locks de grupos/capacidad al mutar posiciones. | Privados | Dentro de `ListContentCoordinator`, como parte de la actualización, sin dependencia hacia `AsignationsService`. |
| `findUpcoming`, `findNext`, `findAllSpecialLists`, `findAllVideoLists`, `findCurrentMonthLists`, `findPastMonthListsByYear`, `findCurrentWeeklyLists`, `findPastWeeklyListsByMonth`, `findCurrentVideoLists`, `findPastVideoListsByYear` | Wrappers de consultas temporales ya trasladadas a `ListCalendarService`. | `ListsController`; los consumers externos conservan `ListsService`. | Públicos | Permanecen como forwarding en la fachada; no extraerlos otra vez ni exportar el calendar a otros módulos. |
| `createVideoList` | Crear List VIDEO, derivar fechas/nombre por defecto, persistir y traducir errores DB. No coordina Content ni acepta manager. | `VideosService.createListForVideo`. | Público | `ListCrudService`; conservar defaults, fecha/hora provistas, nombre y firma. |
| `createWeeklyList`, `createMonthlyList` | Crear List WEEK/MONTH con fecha de publicación obligatoria, fechas/nombre derivados y repositorio del manager opcional. Son invocadas dentro de la transacción que crea Content RADAR/BEST. | `ContentsService.create` dentro de la misma transacción y el endpoint semanal del `ListsController`; los métodos mensuales no tienen ruta directa. | Públicos | `ListCrudService`, pasando intacto el `EntityManager` opcional. El save debe usar exclusivamente el repo derivado de ese manager cuando se entrega. |
| `generateWordPressPosts`, `syncDiscToWordPress`, `generateBestDiscsWordPressPost` | Resolver List y delegar la publicación/sync por tipo a los publicadores semanal o mensual; SPECIAL/otros tipos no se sincronizan en el método individual. | `ListsController`; `AsignationsService.update` invoca `syncDiscToWordPress` después del save si cambió contenido sincronizable. | Públicos | Permanecen como forwarding en la fachada hacia los publishers actuales; no trasladar Asignations a la capa de publicación ni hacer que un publisher llame a la fachada. |
| `handleDbExceptions` | Mapear unique violation a 400 y los demás errores a 500, con log. | Creaciones, `create`, `update` y publicación vía el comportamiento local ya extraído. | Privado | Reutilizar desde los servicios internos solo si la implementación demuestra una duplicación real; no crear una capa de excepciones anticipada. |

`ListsController` conserva todos sus métodos y contratos. `ContentsService` usa `createWeeklyList`, `createMonthlyList` y `removeList(manager)`; además importa la función pura `isValidDateValue`. `VideosService` llama a `createVideoList`; `AsignationsService` llama únicamente a `syncDiscToWordPress`. No se identificaron consumers externos de los métodos de calendario fuera del controller, pero se preservan sus firmas públicas. La prueba de controller fija el forwarding de endpoints; los specs de List cubren escritura, fechas, tipo, transacción y publicación; Contents caracteriza las operaciones que invocan a Lists; Asignations caracteriza la sincronización luego del save.

##### Decisión arquitectónica

- **`ListCrudService`: recomendada.** Encapsular `create`, `findAll`, `findOne` y los tres creadores tipados VIDEO/WEEK/MONTH con persistencia de `List`. Recibe `Repository<List>`; los creadores WEEK/MONTH aceptan y usan el manager opcional existente. Las validaciones propias de creación permanecen en las funciones de dominio compartidas/servicio, sin introducir repositorios genéricos.
- **`ListContentCoordinator`: recomendada.** Encapsular `update`, borrado y helpers transaccionales List/Content, más el lock de cambio de tipo y el límite de cuatro discos que se valida al pasar a WEEK. Recibe repositorios `List` y `Content`; acepta un manager desde Contents y es la única pieza que coordina las dos entidades. No llama a `ListsService`, `ContentsService` ni `AsignationsService`.
- **`ListRules`: no recomendada como provider.** De las reglas actuales, `isValidDateValue` ya tiene dos consumers (Lists y Contents) y justifica seguir como función pura exportada desde `list-date-rules.ts`. El resto son políticas privadas de creación/actualización o conversiones de fechas sin reutilización demostrada; dejarlas como funciones puras cercanas a su owner evita un servicio/capa DI artificial.
- **`ListsService`: fachada recomendada.** Conserva firmas públicas; delega persistencia/lecturas a CRUD, coordinación a Coordinator, calendario al calendar y WordPress a publishers. Los providers internos no se exportan desde `ListsModule`; solo se exporta `ListsService`.

**Grafo de dependencias propuesto:** `ListsController`, `ContentsService`, `VideosService` y `AsignationsService` → `ListsService` → `ListCrudService`, `ListContentCoordinator`, `ListCalendarService`, `WeeklyListPublisherService`, `MonthlyListPublisherService`. `ListContentCoordinator` → repositorios List/Content; `ListCrudService` → repositorio List; ambos pueden usar funciones puras de `list-date-rules.ts`. Los publishers mantienen sus dependencias actuales en WordPress/reconciliación/repositorio y no invierten dependencia a `ListsService`. No hay export nuevo ni dependencia de Lists hacia Contents/Asignations. `ContentsModule` conserva su import de ListsModule y wiring `forwardRef` durante estas extracciones; no se propone tocar ese ciclo de DI incidentalmente. `ListsModule` mantiene TypeOrm `forFeature([List, Content])`, providers internos y export único de ListsService.

No cambiar ni fusionar módulos. No se propone un servicio aparte para creación de cada tipo, un `ListRulesService`, una capa repository, publisher agregador ni módulos nuevos. Los constructores de tests manuales que hoy crean `ListsService` con dependencias de persistencia/publicación se actualizarán junto con cada extracción; las firmas de métodos públicos son el contrato a conservar.

##### Tareas pequeñas propuestas

###### BC-LST-18 — Extraer CRUD y creación tipada de Lists (S)

- [x] **Completada (2026-10-16).** `ListCrudService` extrae creación directa, consultas CRUD y creadores VIDEO/WEEK/MONTH. BC-LST-19 sigue pendiente; Lists permanece **en cleanup**.
- **Objetivo:** mover persistencia simple y creadores tipados a `ListCrudService`, manteniendo a `ListsService` como entrada pública y preservando exactamente firmas/resultados.
- **Métodos afectados:** mover implementación de `create`, `findAll`, `findOne`, `createVideoList`, `createWeeklyList`, `createMonthlyList` y validación de creación que dependa directamente de esos métodos. La fachada conserva esos siete métodos como delegaciones. No mover `update` ni `removeList` en esta tarea.
- **Archivos:** nuevo `src/editorial/lists/list-crud.service.ts` y spec adyacente; modificar `list.service.ts`/spec, `list.module.ts` y, solo si hace falta para tests de DI, specs de controller/consumers. Mantener DTOs, entidades y rutas en su sitio.
- **Dependencias:** ninguna nueva dependencia de módulo; `ListCrudService` usa `Repository<List>` y funciones puras actuales. `createWeeklyList`/`createMonthlyList` reciben el mismo manager opcional y guardan con `manager.getRepository(List)`. `ListsModule` registra provider interno y continúa exportando solo ListsService.
- **Pruebas y verificaciones futuras:** mover caracterización específica junto al CRUD; cubrir filtros/orden/paginación y not found; WEEK/MONTH requieren releaseDate válida; SPECIAL no admite fechas; VIDEO conserva defaults y fechas/hora provistas; nombres/localización mensual-semanal; manager de transacción; unique error y errores DB. Verificar delegaciones de controller, Contents/Videos, resolución DI y búsqueda de imports/proveedores. Ejecutar suites focalizadas y build/typecheck aplicables según la tarea de implementación; no acceder a DB/servicios externos.
- **Riesgos:** cambiar semántica de defaults/zonas horarias o captura de error; perder la identidad del manager transaccional de Contents; romper constructores manuales de specs. Mantener firmas y comparar llamadas/repositorio con las pruebas existentes.
- **Tamaño:** S.
- **Aceptación:** ListsService delega; llamadas existentes siguen resolviendo a través de ListsService; responses/errores/orden/defaults idénticos; manager compartido preservado; provider registrado una vez y no exportado; no cambian rutas, permisos, DTOs, entidad ni schema.
- **Cierre:** `ListCrudService` se registra una vez en `ListsModule` y no depende de `ListsService`; la fachada conserva `create`, `findAll`, `findOne`, `createVideoList`, `createWeeklyList` y `createMonthlyList`. Las reglas comunes `assertRequiredEditorialDate`/`hasAnyEditorialDate` se mantienen como funciones en `list-date-rules.ts`, sin provider adicional. `update`, `removeList`, coordinación List/Content, límites Radar y publicación permanecen en sus owners previos para BC-LST-19 o servicios ya extraídos. No se modificaron entidades, DTOs, rutas, permisos, Contents, Asignations ni frontend.
- **Pruebas y verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists` — 10 suites, 184 tests y 2 snapshots aprobados; `yarn --ignore-engines test --runInBand src/editorial/contents/contents.service.spec.ts src/editorial/lists/asignations/asignations.service.spec.ts` — 2 suites, 40 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; spec de wiring Nest verifica inyección y registro; `yarn --ignore-engines prettier --check` en archivos focalizados; `git diff --check`. Sin PostgreSQL ni servicios externos. Tras ampliar casos de fechas/defaults, la suite Lists se volvió a ejecutar antes del cierre.
- **Tamaño observado:** `list.service.ts` queda en 522 líneas antes de BC-LST-19; se conservan ahí actualización/borrado transaccional y sus reglas.

###### BC-LST-19 — Extraer coordinación transaccional List/Content y estabilizar la fachada (M)

- [x] **Completada (2026-10-16).** Se extrajo la coordinación List/Content; Lists queda completado. Los demás módulos de Editorial permanecen pendientes y no se avanzó al siguiente.
- **Objetivo:** encapsular la actualización/borrado acoplados de List y Content en `ListContentCoordinator` y dejar las firmas públicas estables de ListsService como delegaciones ligeras.
- **Métodos afectados:** `update`, `removeList`, `removeListWithManager`, reglas/comparaciones/copias de fechas usadas solo por estos caminos, advisory lock y `assertRadarGroupsWithinLimit`. Dejar `syncDiscToWordPress`, `generateWordPressPosts`, `generateBestDiscsWordPressPost` y todos los wrappers de calendario en la fachada.
- **Archivos:** nuevo `src/editorial/lists/list-content-coordinator.service.ts` y spec; modificar `list.service.ts`/spec y `list.module.ts`; actualizar `contents.service.spec.ts` o `asignations.service.spec.ts` solo si las pruebas de delegación/manager lo requieren. No modificar sus implementaciones productivas ni otros módulos.
- **Dependencias:** BC-LST-18 completada; Coordinator inyecta repositorios List/Content y no llama de vuelta a ListsService ni a Contents/Asignations. Contents conserva el manager de su transacción en create RADAR/BEST, update de fecha y delete; Asignations conserva llamada post-save a `syncDiscToWordPress`.
- **Pruebas y verificaciones futuras:** caracterizar update con/sin Content y con/sin sincronización; null frente a omitido; transacción/rollback de List+Content; eliminación desde Lists y con manager externo desde Contents; fechas sincronizadas solo según tipo; RADAR/BEST no pierden fecha obligatoria; SPECIAL permanece sin fecha; cambio a WEEK con grupo de más de cuatro discos se rechaza y conserva locks. Verificar DI y grafo sin ciclos, métodos/firma/controller y ambos consumers; ejecutar specs focalizados y build/typecheck aplicables en implementación.
- **Riesgos:** abrir transacción cuando el comportamiento actual no lo hace; usar repositorios del manager base en vez del transaccional; sacar escritura de Content de la misma transacción; alterar la regla de campos ausentes/null; perder query de límite Radar. No incluir WordPress/Spotify en transacciones.
- **Tamaño:** M.
- **Aceptación:** conducta de update/remove y errores equivalente; `removeList(id, manager?)` sigue usando el manager recibido; transacciones continúan locales y atómicas; límite de cuatro grupos se aplica solo a conversión a WEEK como hoy; providers internos y dependencias unidireccionales; ListsService queda como fachada estable.

- **Cierre:** `ListContentCoordinator` contiene `update`, `removeList`, la eliminación interna con manager, sincronización/comparación de fechas, validaciones de fechas relacionadas, advisory lock y comprobación del límite Radar. `ListsService` conserva las firmas públicas y delega CRUD, coordinación List/Content, calendario y publicación; `syncDiscToWordPress` mantiene el despacho WEEK/MONTH. El coordinador solo recibe repositorios List/Content, usa el manager entregado o la transacción del repositorio según el flujo original y no depende de la fachada ni de Contents/Asignations. `ListsModule` registra el provider una vez y continúa exportando únicamente ListsService. La fachada termina en 170 líneas; no se añadió `ListRulesService` ni se incluyó una reorganización física en BC-LST-19.
- **Pruebas y verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists` — 11 suites, 155 tests y 2 snapshots aprobados; `yarn --ignore-engines test --runInBand src/editorial/contents/contents.service.spec.ts src/editorial/lists/asignations/asignations.service.spec.ts` — 2 suites, 40 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a archivos propios; verificación de registro/inyección NestJS y referencias unidireccionales; `git diff --check`. Sin PostgreSQL ni servicios externos.
- **Compatibilidad y regresiones:** los specs focales cubren transacciones y manager compartido, rollback en errores de guardado/eliminación, campos omitidos frente a `null`, fechas RADAR/REUNION y WEEK/MONTH, SPECIAL sin fecha, cambio a WEEK y capacidad Radar, eliminación simple/relacionada y delegación de fachada. Las suites conservan regresiones de reconciliación WordPress, orden editorial, posición 0, Gutenberg y compatibilidad con Contents/Asignations; no se tocaron publishers, rutas, permisos, entidades, DTOs ni contratos HTTP.
- **Estado final:** BC-LST-1 a BC-LST-19 están completadas (incluidas BC-LST-8.1 y las subtareas aplicables); no quedan hallazgos Lists pendientes en este roadmap. Lists pasa a **completado**. Los demás módulos de Editorial siguen **pendientes**; no se avanzó a otra tarea.

Después de BC-LST-19 se abrió BC-LST-20, limitada a reorganizar físicamente servicios y specs ya extraídos; no implica nuevas responsabilidades, capas o cambios funcionales.

#### BC-LST-20 — Reorganizar la estructura de Lists (S, estructural)

- [x] **Completada (2026-10-16).** Lists vuelve a **completado** tras verificar los movimientos e imports; no se avanzó a otro módulo.
- **Objetivo:** organizar los servicios ya extraídos y sus pruebas según responsabilidad, sin cambiar comportamiento ni dividir más los servicios.
- **Alcance:** mover CRUD, Calendar y Content Coordinator a `application/`, con sus specs en `application/__tests__/`; mover las pruebas de fachada/controller a `lists/__tests__/`; agrupar las pruebas funcionales WordPress y snapshot en `wordpress/__tests__/`; trasladar reglas puras compartidas a `domain/` cuando la ubicación se justifique por su reutilización. Mantener los cuatro archivos de producción WordPress en `wordpress/` y Asignations como módulo independiente.
- **Archivos y consumers:** CRUD, Calendar y Coordinator con sus specs se movieron a `application/`; `list-date-rules.ts` pasó a `domain/`; los specs de fachada/controller quedaron en `lists/__tests__/`; los specs WordPress y el snapshot pasaron a `wordpress/__tests__/`. Se actualizaron imports del módulo/fachada, specs internos y la referencia compartida de `ContentsService`. No se modificó lógica de Contents, Asignations u otros módulos.
- **Dependencias:** BC-LST-19 completada; tarea exclusivamente estructural. No requiere nuevas dependencias Nest, módulos, providers, exports ni cambios de metadata TypeORM.
- **Riesgos:** rutas relativas rotas, Jest ubicando snapshots en ruta anterior o cambio accidental de contenido; modificaciones involuntarias de providers o consumers por los paths.
- **Pruebas y verificaciones:** suites focalizadas de Lists, Contents y Asignations; snapshots Gutenberg sin regenerarlos; build y typecheck; verificación DI y ausencia de ciclos; metadata TypeORM aislada si existe un mecanismo local sin DB; búsqueda de imports obsoletos; Prettier solo en archivos propios y `git diff --check`. No conectar a PostgreSQL ni servicios externos.
- **Tamaño:** S.
- **Aceptación:** estructura objetivo coherente, sin carpetas vacías ni ubicaciones duplicadas; imports resueltos y sin referencias obsoletas; providers/export, contratos, reglas, transacciones, publicaciones, relaciones y metadata sin cambios; snapshots idénticos; ningún módulo fuera de Lists reorganizado.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists` — 11 suites, 155 tests y 2 snapshots aprobados sin regenerarlos; `yarn --ignore-engines test --runInBand src/editorial/contents/contents.service.spec.ts src/editorial/lists/asignations/asignations.service.spec.ts` — 2 suites, 40 tests aprobados; build; typecheck; Prettier en los archivos reubicados/actualizados; wiring NestJS verificado por spec; revisión de imports obsoletos y del grafo estático sin ciclos; `git diff --check`. No se encontró una comprobación aislada de metadata TypeORM; las entidades y relaciones no se movieron ni editaron. Sin PostgreSQL ni servicios externos.
- **Compatibilidad:** providers/export de `ListsModule`, relaciones y metadata TypeORM, rutas, permisos, contratos HTTP, reglas de fecha, transacciones List/Content, publicación y reconciliación permanecen sin cambios. La carpeta `asignations/` conserva su módulo independiente. No se crearon directorios vacíos ni se reorganizaron otros módulos.
- **Estado final:** BC-LST-20 completada y Lists vuelve a **completado**. Las demás áreas y módulos de Editorial permanecen pendientes; no se avanzó a otra tarea.

##### Tamaño esperado, regresiones y cierre de auditoría

- **Estimación de fachada:** aproximadamente **100–160 líneas** después de BC-LST-18/19, sin imponer un límite. Incluirá constructor/proveedores, firmas públicas y forwarding de CRUD, coordinación, calendario y publishers; se elimina la implementación extensa y los helpers privados que migren. No reducir wrappers si eso cambia los contratos públicos existentes. **Resultado BC-LST-19:** `list.service.ts` queda en 170 líneas, manteniendo todos los wrappers y firmas públicas.
- **Regresiones protegidas:** fechas obligatorias de RADAR/BEST y WEEK/MONTH; SPECIAL sin fechas; transacciones pareadas List/Content con manager compartido; límite de cuatro discos Radar; posición 0 no publicable en WEEK y permitido en MONTH; reconciliación WordPress idempotente; orden editorial de calendario y asignaciones; rutas, payloads, errores, permisos/validaciones; compatibilidad de Contents, Videos y Asignations. El comportamiento de position 0 mensual permanece propiedad del publisher mensual y no se debe alterar durante estas extracciones.
- **Pruebas existentes reutilizadas/movidas:** `list-content-coordinator.service.spec.ts` cubre coordinación, fechas, transacciones y rollback; `list-crud.service.spec.ts` cubre persistencia/tipos; `list.service.spec.ts` y `list.controller.spec.ts` fijan delegación y contrato; `list-calendar.service.spec.ts` verifica wiring y calendario; `contents.service.spec.ts` cubre creación RADAR/BEST, sincronización y borrado con manager; `asignations.service.spec.ts` fija sincronización WordPress post-save; specs de publishers cubren reconciliación, orden de publicación, position 0 y tracking.
- **Riesgo de integración externo:** no cambiar reconciliación, formato/orden Gutenberg, tracking, fallbacks Spotify ni respuestas WordPress en estas tareas. No llamar a servicios reales.
- **Riesgo de contratos y relaciones:** no cambiar controller, rutas, permisos, validación HTTP, shapes, eager relations o cascades. No se inspeccionó frontend; no se proponen cambios de contrato.
- **Estado Lists:** **completado** tras BC-LST-20; BC-LST-1 a BC-LST-20 (incluidas las subtareas aplicables) están cerradas. Los módulos restantes de Editorial continúan pendientes. El número de servicios se decidió por cohesión, evidencia de transacciones y persistencia, no como cuota de líneas.

**Verificaciones BC-LST-17:** lectura estática completa de los archivos y consumers indicados; inventario de métodos y búsquedas de referencias; revisión de providers/imports NestJS y firmas públicas; revisión de cobertura existente. Solo se actualizó este roadmap. `git diff --check -- roadmap/backend-cleanup.md` ejecutado al cierre. No se ejecutaron tests, build, typecheck ni operaciones con PostgreSQL/servicios externos.

**Verificaciones BC-LST-11:** inventario estático de métodos/consumidores, revisión de wiring NestJS, consultas TypeORM/transacciones y suites existentes; roadmap actualizado; `git diff --check -- roadmap/backend-cleanup.md` aprobado. No se ejecutaron tests, build, typecheck ni servicios externos por alcance.

## Cierre de BC-0 (estado histórico al 2026-10-14)

- **Catalog/Artists:** en cleanup, no completado. BC-ART-1, BC-ART-2 y BC-ART-3 completadas; BC-ART-4 pendiente hasta coordinar la adaptación frontend indicada en ART-F4.
- **Otros módulos:** siguen pendientes según la tabla de estado. Countries, Genres y Discs no se auditaron en esta fase.
- **Implementación:** ninguna mejora de código, test o fixture se ejecutó.
- **Verificaciones de BC-0:** revisión estática de Artists/consumers y consulta de tests existentes; validación de enlaces entre `roadmap.md` y este documento; `git diff --check` de documentos afectados. No se ejecutó suite global ni pruebas.

## BC-LNK-1 — Retirar el módulo editorial Links

- **Estado:** retirado (2026-10-16). Es una baja funcional del módulo, no un cleanup completado. No se avanza a otro módulo de Editorial; Videos y Contents siguen pendientes.
- **Inventario y consumers:** `LinksModule`, controller, service, entidad, DTOs y spec exclusivo vivían en `src/editorial/links/`; `AppModule` lo registraba y el spec de autorización global fijaba sus mutaciones. Lists era la única entidad relacionada: `Link.list` tenía `ON DELETE CASCADE` y `List.links` era `eager` + `cascade`. Contents, Videos y Asignations no importaban Links ni consumían su servicio. En frontend se buscaron referencias ejecutables en `src/`: no hay llamadas a `/links` ni lecturas de `list.links`; el frontend sí consulta `/lists` y consume Asignations. No se encontraron otros imports, fixtures ni scripts del dominio.
- **Contrato observado:** Lists incluía `links` en sus respuestas por la relación eager. La UI actual no lee esa propiedad; retirar la relación elimina ese campo observable de Lists. No se encontraron consumers funcionales conocidos, por lo que la retirada sigue desbloqueada; se conserva el resto del contrato y la lógica de Lists.
- **Contract finding:** **Current behavior:** las lecturas de Lists incluyen `links` por eager loading. **Problem:** se emite una colección de un módulo retirado; el frontend actual no la consume. **Impact:** backend-only según consumers inspeccionados. **Options:** (1) preservar el payload requeriría mantener datos/representación artificial; (2) refactor interno no puede conservar la relación tras borrar la tabla; (3) retirar el campo junto con el contrato Links; (4) coordinar frontend/backend si apareciera un consumer del frontend. **Recommendation:** opción 3, porque no hay consumer funcional conocido. **Blocks the current task:** No.
- **Enlaces homónimos preservados:** no se tocaron los campos `link` de Disc, NationalRelease, Article o Riff Valley Playlist, ni las URLs de WordPress/Spotify/Telegram ni los endpoints de vinculación de playlists.
- **Esquema:** `link` es la tabla propia de la entidad. La relación conocida crea una FK saliente `link.listId → list.id` con `ON DELETE CASCADE`; no hay entidades que apunten a Link. La migración nueva `1791940000000-RemoveEditorialLinks.ts` elimina la tabla sin `CASCADE`, de modo que PostgreSQL rechazará dependencias entrantes inesperadas. Su `down` recrea columnas y FK, pero no recupera filas eliminadas por `up`; no se borraron datos adicionales. La migración está pendiente y no se ejecutó.
- **Archivos retirados:** módulo, controller, service, entidad, DTOs de creación/actualización y spec del controller bajo `src/editorial/links/`. Se retiraron el registro en `AppModule`, la relación de `List` y los casos/imports de autorización del controller eliminado. No se cambió la lógica de Lists, Contents ni Videos. Se conservaron intactos los cambios locales preexistentes del checkout.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists src/editorial/contents/contents.service.spec.ts src/editorial/contents/contents.controller.spec.ts src/identity/auth/__tests__/domain-mutation-authorization.spec.ts` — 14 suites, 271 tests y 2 snapshots aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; comprobación estática con reflect-metadata confirma ausencia de LinksModule en `AppModule`, de tabla `link` y de relación `List.links`; búsqueda de imports/clases obsoletos en `src`, `test` y `scripts`; Prettier focalizado; `git diff --check`. El frontend se inspeccionó en solo lectura para inventariar consumers y no se modificó. No se ejecutaron migraciones ni se accedió a PostgreSQL o servicios externos.

## BC-VID-0 — Auditoría del módulo editorial Videos

- **Estado:** auditoría y cleanup completados (2026-10-16); BC-VID-1, BC-VID-2, BC-VID-3, BC-VID-5, BC-VID-6 y BC-VID-7 completadas; BC-VID-4 completó la auditoría contractual. Videos queda **completado** y Contents sigue pendiente. No se avanza a otro módulo.
- **Base y alcance:** rama actual del backend, checkout limpio al inicio. Lectura completa de `src/editorial/videos/`, composición en `AppModule`, relación con Lists y Contents, migraciones locales relevantes, autorización global y specs consumidores. Se inspeccionaron en solo lectura los consumidores directos disponibles en `riffvalley-app-front`; no se modificó ese repositorio. TikTok es una integración independiente y no forma parte de este módulo.
- **Inventario:** `VideosModule` registra `Video`, `VideosController` y `VideosService`; importa Auth, Lists y Contents (este último con `forwardRef`) y exporta VideosService/TypeORM. `Video` tiene `ManyToOne` nullable a User (`user`) y Editor (`editor`) y a List; `Content` es `OneToOne` inversa y conserva el FK único `content.videoId`. El servicio contiene CRUD, filtros, creación de List y creación explícita de Content; no hay integración externa propia.
- **Rutas/contratos:** bajo `/api/videos`, `GET /` lista `Video[]` (default limit 50, máximo 200, offset 0, orden `updatedAt DESC`; filtros `q`, `status`, `type`, `desde`, `hasta`, `userId`); `GET /:id` obtiene detalle; `POST /` crea; `PATCH /:id` actualiza; `DELETE /:id` elimina; `POST /:id/list` crea y vincula una List VIDEO; `POST /:id/content` crea un Content de backlog. Los GET son públicos; todas las mutaciones requieren `riffvalley` (también admite `superadmin` por el guard común). Los IDs de ruta pasan `ParseUUIDPipe` versión 4. DTOs validan enums, longitud del nombre, fechas ISO, UUIDs de escritura y límites de paginación. El filtro `userId` solo valida string y no hay validación cruzada de `desde`/`hasta`.
- **Responsabilidades y dependencias:** las fechas/estados y el catálogo de videos pertenecen a Videos; las Listas VIDEO y sus fechas/calendario son propiedad de Lists y Videos delega la creación a `ListsService.createVideoList`. Videos devuelve la List relacionada en sus consultas y usa Lists para vincularla. El endpoint de Content delega a Contents, crea un backlog sin fecha y exige un usuario asignado; no hay sincronización posterior de estados. Contents también puede crear una entidad Video al crear un Content tipo VIDEO, como comportamiento propio de Contents. Videos bloquea eliminar una entidad que ya tenga Content asociado. No se identificó ciclo Nest: Contents no importa VideosModule ni inyecta VideosService; consume el repositorio de Video. El `forwardRef` de Contents desde Videos no corresponde a una dependencia inversa encontrada.
- **Consumers frontend:** `src/services/videos/videos.ts` llama las rutas de CRUD/list/content. `VideosKanban.vue` consume lista, asignaciones, fechas, estado, creación de Lists y Content; `ContentCalendar.vue` y `VideoActionsModal.vue` actualizan videos asociados a Content. La pantalla del tablero solo necesita el ID de List para navegar, aunque actualmente también consulta `video.list?.id` como fallback. El calendario de Lists VIDEO permanece en el módulo Lists.
- **Persistencia y efectos:** `findAll` y `findOne` cargan explícitamente `user`, `list`, `editor` y `content`. List declara `asignations` eager y Asignation declara `user`/`disc` eager, por lo que la relación List puede ampliar el payload de Video con asignaciones y sus entidades. La migración histórica deja FKs de Video a Users/List y de Content a Video con `NO ACTION`; el borrado de Video comprueba primero Content y después elimina. `createListForVideo` guarda List y luego Video en dos operaciones independientes, sin transacción. La creación explícita de Content solo persiste Content y su FK hacia Video.
- **Pruebas existentes:** no hay specs propios en `src/editorial/videos/`. `domain-mutation-authorization.spec.ts` fija rutas y rol mínimo para las mutaciones de Videos y evalúa el guard común; no cubre llamadas HTTP o respuestas. Tests de Lists prueban `createVideoList` aislado, no su coordinación desde Videos. Tests de Contents cubren el ciclo de creación automática de Video desde Content, no los endpoints de Videos. No se ejecutaron pruebas.

### Hallazgos demostrados

#### VID-F1 — La creación omite los invariantes que sí aplica el cambio de estado (**resuelto por BC-VID-1**)

- **Evidencia:** `src/editorial/videos/videos.service.ts` (create, líneas 53–67; update, 141–158) y `src/editorial/videos/dto/create-video.dto.ts` (status requerido, userId/updateDate opcionales). `update` rechaza pasar a `editing`/`ready` sin usuario y a `published` sin `updateDate`; `create` guarda cualquier combinación válida por enum sin ejecutar esas reglas.
- **Impacto/categoría:** bug funcional, prioridad media, tamaño S. La API permite crear videos en estados que su propia transición equivalente rechazaría, incluidos `published` sin fecha o `editing`/`ready` sin usuario.
- **Propuesta:** aplicar al alta las mismas precondiciones de estado que al cambio, con errores 400 coherentes y pruebas de casos válidos/inválidos. Mantener permisos, DTO y shape HTTP.

#### VID-F2 — IDs relacionados inexistentes llegan directamente a persistencia (**resuelto por BC-VID-2**)

- **Evidencia:** `create` asigna referencias `{ id }` para User, Editor y List y `update` hace lo mismo para User/Editor/List sin resolverlas previamente (`videos.service.ts`, 53–65 y 120–135). La migración `1770800000000-CreateVideoEntity.ts` crea FKs para las tres relaciones y la migración posterior mantiene las FKs como `NO ACTION`. El servicio no captura ni traduce errores de `repo.save` en esas rutas.
- **Impacto/categoría:** bug funcional, prioridad media, tamaño S. Un UUID sintácticamente válido que no exista falla al guardar en vez de producir un `NotFoundException`/404 claro; el error de persistencia no traducido se convierte en error 500. Afecta altas y asignaciones/cambios de relación.
- **Resolución:** Videos traduce a 404 los errores PostgreSQL `23503` solo si la tabla es `video` y el constraint coincide con las FKs conocidas de `userId`, `editorId` o `listId`. Se conservan `null`/omitido como antes y no se agregan consultas de existencia; los errores con otra tabla, constraint o SQLSTATE se propagan.

#### VID-F3 — La creación de List VIDEO y su asociación a Video no es atómica (**resuelto por BC-VID-3**)

- **Evidencia:** `createListForVideo` llama a `ListsService.createVideoList` (que persiste la List en `ListCrudService`) y después guarda la relación en `repo.save(video)` en una operación separada (`videos.service.ts`, 183–200). No comparte `EntityManager` ni compensa el primer save si el segundo falla. La fachada actual de Lists no acepta manager en `createVideoList`.
- **Impacto/categoría:** bug funcional de consistencia, prioridad media, tamaño S. Si falla el segundo guardado después de crear la List, queda una List VIDEO huérfana que el usuario no puede alcanzar desde el Video.
- **Resolución:** `VideosService.createListForVideo` abre una transacción desde el manager del repositorio Video, bloquea y carga el Video dentro de ella, y pasa el mismo `EntityManager` a `ListsService.createVideoList`. La creación de List y el guardado de Video usan repositorios obtenidos de ese manager; cualquier fallo revierte ambas escrituras. El lock evita crear listas duplicadas en peticiones concurrentes. El log de ListCrud queda fuera de la transacción.

#### VID-F4 — El endpoint no permite limpiar User o Editor aunque la UI ofrece esa acción

- **Evidencia:** `VideosKanban.vue` asigna `undefined` al seleccionar vacío y envía `userId: undefined`/`editorId: undefined`; JSON omite esos campos. El backend solo reasigna al recibir un valor truthy (`videos.service.ts`, 120–128), por lo que responde sin error y conserva la relación en base de datos. El frontend queda optimistamente sin asignación hasta que recarga.
- **Impacto/categoría:** contrato funcional backend + frontend. Es una acción visible que aparenta completarse y se revierte tras refrescar.
- **Opciones:** preservar el contrato actual (la UI no debe ofrecer limpiar); refactor interno del backend no puede inferir un campo omitido; cambiar el contrato para que null signifique limpiar; coordinar ambas partes para enviar/aceptar null.
- **Recomendación:** coordinar un cambio backend/frontend donde `null` limpie y la omisión conserve, pero confirmar primero si User debe seguir siendo obligatorio mientras el Video permanece en `editing`/`ready`, o solo al entrar en esos estados como aplica BC-VID-1. Propuesta de trabajo: BC-VID-5.

#### VID-F5 — El campo `link` sigue en el frontend pero ya no existe en Video

- **Evidencia:** la entidad y DTOs backend no declaran `link`; la migración `1770829235721-RemoveVideoLink.ts` elimina la columna. El frontend todavía modela `link`, muestra el campo en `VideosKanban.vue` y lo envía al crear/editar; `VideoActionsModal.vue` y `ContentCalendar.vue` también lo reenvían. La validación global de `main.ts` prohíbe propiedades no declaradas, por lo que una petición que incluya un link produce 400; no puede persistirse.
- **Impacto/categoría:** frontend; la interfaz presenta un campo no soportado por el modelo/contrato actual y, si tiene valor, puede impedir guardar por `forbidNonWhitelisted` en el pipe global.
- **Opciones:** (1) preservar compatibilidad requeriría restaurar el campo en el backend y migrar esquema; (2) refactor interno no puede hacer persistible un campo ausente; (3) restaurar el contrato HTTP para Video; (4) coordinar cambios en ambos repositorios. La alternativa de menor alcance es retirar el campo solo de Video en frontend.
- **Recomendación:** proponer BC-VID-6 frontend-only para retirar `link` de tipos, formularios, vistas y payloads Video; mantener intactos `Article.link` y enlaces de otros dominios. La UI actual no ofrece una capacidad funcional soportada por backend.

#### VID-F6 — La respuesta de Video carga una relación List más amplia de lo que usa el consumer conocido

- **Evidencia:** `Video.list` no es eager, pero `VideosService.findAll` y `findOne` solicitan explícitamente `list`. `List.asignations` es eager y Asignation carga eager `user` y `disc`, ampliando cada Video con la lista y potencialmente todas sus asignaciones. `VideosKanban` solo requiere el ID: usa `listId` y normaliza desde `list.id`; la respuesta de `POST /videos/:id/list` también se lee solo para `response.list.id`. `VideoListDetalle` carga List y Asignations desde sus propios endpoints. `ContentsService.findAll/findOne` carga `video`, `video.user` y `video.editor`, pero no `video.list`.
- **Impacto/categoría:** contrato y posible sobrecarga de payload/consultas; el tamaño real no se midió y los consumidores externos no están confirmados. El frontend tipa `listId`, pero no `list`, y el workaround evidencia que el contrato de Video no entrega directamente el campo escalar declarado.
- **Opciones:** (1) preservar el payload actual; (2) limitar internamente la carga pero conservar `list:{id}`; (3) cambiar a un `listId` escalar y adaptar los consumidores conocidos; (4) coordinar backend/frontend tras revisar posibles consumidores externos. Ninguna reducción debe eliminar `list` sin tratarla como cambio observable.
- **Recomendación:** propuesta BC-VID-7: caracterizar el payload y confirmar consumers antes de decidir entre `list:{id}` mínimo o `listId`; medir una respuesta representativa si se prioriza la reducción. Preservar el contrato hasta esa decisión.

### Tareas propuestas

#### BC-VID-1 — Aplicar invariantes de estado también al crear Videos

- **Estado:** completada (2026-10-16); hallazgo VID-F1 resuelto; prioridad media; tamaño S.
- **Alcance:** validar en `VideosService.create` las precondiciones de estado ya impuestas en `update`, sin duplicar ni debilitar las reglas existentes. Mantener rutas, roles, DTOs y payloads.
- **Exclusiones/dependencias:** no sincronizar estados con Content; no modificar Contents, Lists, frontend, esquema ni migraciones.
- **Aceptación:** creación `editing`/`ready` sin User y `published` sin `updateDate` devuelve 400; combinaciones válidas persisten y mantienen la respuesta actual; tests de servicio fijan ambas clases de casos.
- **Implementación:** `VideosService` comparte una sola validación entre POST y las transiciones de PATCH. POST exige User para `editing`/`ready` y `updateDate` para `published`; no se exige Editor. PATCH conserva la comprobación únicamente al cambiar de estado y sigue exigiendo una fecha explícita al publicar, incluso si el Video ya tenía fecha. `status` no tiene valor por defecto y sigue siendo obligatorio en POST; los campos opcionales omitidos/null conservan su comportamiento anterior. Contents sigue creando Videos `editing` con User y fecha, sin cambios en su implementación.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts src/editorial/contents/contents.service.spec.ts` — 2 suites, 40 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a `videos.service.ts`, `videos.service.spec.ts` y `contents.service.spec.ts`; `git diff --check` aprobado. No se accedió a PostgreSQL ni servicios externos.

#### BC-VID-2 — Traducir referencias relacionadas inexistentes

- **Estado:** completada (2026-10-16); hallazgo VID-F2 resuelto; prioridad media; tamaño S.
- **Alcance implementado:** en POST/PATCH, traducir a 404 las violaciones FK conocidas para User, Editor y List; preservar omisión/null según el contrato vigente y no añadir consultas de existencia.
- **Exclusiones/dependencias:** no modificar módulos/contratos de Lists o Contents, esquema/migraciones ni frontend. Implementar solo la validación del lado Videos.
- **Aceptación:** IDs válidos siguen asignándose; UUIDs inexistentes generan 404 estable solo para las FKs conocidas de `video`; null/omitido conserva su semántica; errores de validación siguen en 400 y fallos de persistencia no relacionados se propagan sin filtrar datos del driver.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts src/editorial/contents/contents.service.spec.ts` — 2 suites, 55 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a `videos.service.ts` y `videos.service.spec.ts`; `git diff --check`. No se accedió a PostgreSQL ni servicios externos.

#### BC-VID-3 — Hacer atómica la creación de List VIDEO desde Video

- **Estado:** completada (2026-10-16); hallazgo VID-F3 resuelto; prioridad media; tamaño S.
- **Alcance implementado:** componer creación de List VIDEO y asociación a Video con el mismo `EntityManager` transaccional; extender de forma opcional y compatible la fachada de Lists y su servicio CRUD para aceptar el manager.
- **Exclusiones/dependencias:** Lists permanece completado y no se reorganiza; no cambiar los defaults, nombres, rutas, permisos, respuesta, Content ni publicación externa.
- **Aceptación:** éxito persiste List VIDEO y FK de Video; fallo al crear List no modifica Video; fallo al guardar Video revierte la List; los errores y defaults actuales se conservan; Video se bloquea durante la comprobación para evitar duplicados concurrentes.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts src/editorial/lists/application/__tests__/list-crud.service.spec.ts src/editorial/contents/contents.service.spec.ts` — 3 suites, 82 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; revisión de wiring confirma que Videos importa Lists y que Lists no importa Videos; Prettier limitado a los archivos de Videos y Lists modificados; `git diff --check`. No se accedió a PostgreSQL ni servicios externos.

**Verificaciones BC-VID-0:** revisión estática de implementación, entidades, DTOs, wiring Nest, migraciones locales, autorización y specs pertinentes; búsqueda de consumidores frontend en solo lectura. Solo se actualizó `roadmap/backend-cleanup.md`. No se ejecutaron tests, build, typecheck ni se accedió a PostgreSQL o servicios externos. `git diff --check -- roadmap/backend-cleanup.md` se ejecutará al cierre.

## BC-VID-4 — Auditoría de contratos frontend/backend de Videos

- **Estado en ese cierre intermedio:** auditoría completada (2026-10-16); no se modificó código ni pruebas. Videos permanecía **en cleanup** antes de cerrar BC-VID-7; Contents y el resto de módulos permanecían pendientes.
- **Base y alcance:** inspección de solo lectura de los dos repositorios en la rama `refactor/editorial`. El backend contiene cambios locales previos de BC-VID-1/2/3 y Contents spec; el frontend también tiene cambios locales, incluido `.impeccable/config.json` y un cambio en `services/contents/contents.ts` que solo retira `ContentList.free`, sin relación con Video. Se conservaron todos. No se encontró `AGENTS.md` en la raíz ni dentro del frontend.
- **Verificaciones:** no se ejecutaron tests, build ni typecheck; no se accedió a PostgreSQL ni servicios externos. `git diff --check -- roadmap/backend-cleanup.md` se ejecutó tras documentar los hallazgos.

### Contract finding — Desasignación de User y Editor

- **Current behavior:** `VideosKanban.vue` y `VideoActionsModal.vue` muestran opciones vacías para User y Editor. Al seleccionarlas, el frontend convierte el valor a `undefined`; `ContentCalendar.vue` reenvía esos valores y la serialización JSON omite las propiedades. `UpdateVideoDto` hereda `@IsOptional`, que permite `null`, pero `VideosService.update` solo asigna User/Editor si sus IDs son truthy. Por tanto, `null` y omisión no cambian la relación y la UI puede aparentar que limpió la asignación hasta que se recarga.
- **Problem:** no se puede desasignar desde las dos superficies de edición. La entidad TypeORM declara ambas relaciones `nullable: true`; la limitación está en el payload y en la rama PATCH, no en el modelo.
- **Impact:** backend + frontend.
- **Business rule:** BC-VID-1 exige User al crear `editing`/`ready` y al transicionar hacia esos estados. En PATCH la validación se ejecuta únicamente si cambia el estado; no exige que el User permanezca asignado en cada actualización. Debe decidirse si se permite limpiar User mientras el Video permanece en `editing`/`ready`, o si se requiere cambiarlo en el mismo PATCH a un estado que no exija User. Editor no tiene esa precondición. El endpoint de creación de Content sigue exigiendo un User.
- **Options:** 1. Preservar compatibilidad y retirar la opción de desasignar de la UI. 2. Refactor interno sin cambiar payload: no puede distinguir la intención porque el campo omitido significa no modificar. 3. Definir `null` como limpieza en PATCH, manteniendo omitido como no-op. 4. Coordinar backend/frontend para que ambas superficies envíen `null` y manejen el resultado/error.
- **Recommendation:** coordinar BC-VID-5 después de confirmar la regla de User para `editing`/`ready`. El backend debería distinguir `undefined` de `null`; el frontend enviaría `null` al limpiar y restauraría el estado anterior si el PATCH falla. Para preservar la regla existente, rechazar limpiar User mientras el estado final siga requiriéndolo, permitiendo una transición simultánea fuera de `editing`/`ready`; confirmar esta interpretación antes de implementar.
- **Regression tests:** PATCH con User/Editor UUID los asigna; `null` los limpia; omitido los conserva; errores restauran la UI; rechazo 400 al limpiar User bajo la regla acordada; limpieza junto a transición válida; no cambia la validación de transición ni el requisito de User para crear Content.
- **Compatibility risk:** aceptar `null` como limpieza introduce una operación observable nueva. Mantener exactamente la semántica de campos omitidos evita afectar a consumidores antiguos.
- **Blocks the current audit:** No; no se cambió el contrato.

### Contract finding — Campo `Video.link` obsoleto

- **Current behavior:** el frontend declara `link` en `Video` y `CreateVideoDto`; `VideosKanban.vue` incluye input, enlace de tarjeta y propiedad en POST/PATCH; `VideoActionsModal.vue` carga y edita el campo y emite `link` en `update-video`; `ContentCalendar.vue` lo reenvía al PATCH de Video. Cuando el valor está vacío, `undefined` se omite al serializar. Cuando tiene valor, el pipe global (`whitelist` + `forbidNonWhitelisted`) rechaza la propiedad con 400.
- **Backend evidence:** la entidad `Video` y sus DTOs actuales no declaran `link`; la migración `1770829235721-RemoveVideoLink.ts` quita la columna. No hay tests específicos de Video que caractericen ese campo ni pruebas frontend de Video encontradas en el árbol inspeccionado.
- **Problem:** un control visible ofrece una propiedad que nunca se persiste y puede hacer fallar el guardado completo del Video o del formulario de Content.
- **Impact:** frontend; el contrato backend ya excluye el campo.
- **Options:** 1. Preservar la situación, con el riesgo actual de 400 cuando el campo tiene contenido. 2. Refactor interno del backend no resuelve la incompatibilidad. 3. Restaurar el contrato requiere entidad, DTO y migración, fuera de esta auditoría. 4. Retirar el campo en frontend en todo el flujo Video.
- **Recommendation:** BC-VID-6 frontend-only para retirar el campo de los tipos, formularios, vistas, normalización y payloads exclusivos de Video. No retirar `Article.link` ni enlaces de otros dominios.
- **Regression tests:** verificar que crear/editar Video y actualizar Video desde Content no envían `link`; conservar el flujo `Article.link`; una búsqueda de referencias de Video no debe dejar controles o payloads colgantes.
- **Compatibility risk:** bajo en backend, que ya no admite el campo; se elimina una UI sin persistencia. Confirmar que el producto no pretenda reintroducir enlaces de video antes de retirar el control.
- **Blocks the current audit:** No.

### Contract finding — Relación `Video.list` sobredimensionada

- **Current behavior:** `Video.list` no es eager por sí sola; `VideosService.findAll` y `findOne` solicitan `user`, `list`, `editor` y `content`. Esos métodos respaldan GET `/videos` y GET `/videos/:id`; `create`, `update`, `createListForVideo` y `createContentForVideo` terminan en `findOne`, por lo que sus respuestas también llevan la relación. `List` serializa sus columnas y su colección eager `asignations`; cada Asignation incluye sus campos propios y las relaciones eager `user` y `disc`. `Disc` marca eager `artist`, `genre`, `favorites`, `pendings` y `comments`; `Artist.country` también es eager. La configuración TypeORM no establece otra `relationLoadStrategy`, por lo que no hay evidencia local de una estrategia de carga que reduzca estas relaciones. `createListForVideo` primero usa solo `relations: ['list']` para la comprobación transaccional, pero su respuesta final vuelve a `findOne`.
- **Known consumers:** En el frontend inspeccionado, `VideosKanban.vue` navega usando `list.id`, normaliza ese valor a `listId` y lee `response.list.id` tras crear la List. `VideoListDetalle.vue` obtiene List y Asignations por endpoints propios. `ContentCalendar.vue` no depende de `video.list`; el `ContentsService` carga la relación `video` desde Content, pero `Video.list` no es eager y no solicita esa relación. En backend, Videos solo tiene su controller como consumidor del servicio; Contents accede al repositorio de Video para operaciones propias y no solicita `video.list`. Los tests de Video fijan que la respuesta de creación de List contiene `list.id`, pero no caracterizan el shape completo de GET listado/detalle. No se confirmó ningún consumidor externo.
- **Cost and evidence:** la expansión tiene coste estructural: una consulta de listado puede incluir una colección de asignaciones por cada Video y relaciones asociadas a cada asignación/Disc; con varias colecciones, crece el volumen de filas/materialización. `GET /videos` admite hasta 200 resultados. No se capturó SQL ni payload representativo ni se midió el coste con datos; por tanto, no hay una regresión de rendimiento demostrada. La multiplicidad indica un riesgo de escalado, no evidencia suficiente para cambiar la respuesta o justificar el coste de una proyección alternativa.
- **Contract finding:** **Current behavior:** respuestas Video incluyen el objeto `list` con sus relaciones eager transitivas; Kanban obtiene de él el ID que el frontend modela como `listId`. **Problem:** se carga y serializa más información de la que usa el consumer conocido, con posible coste creciente, pero no medido. **Impact:** backend + frontend si cambia el payload; consumidores externos permanecen sin confirmar. **Options:** (1) conservar la respuesta actual; (2) restringir la carga a `list:{id}`, que elimina propiedades observables; (3) cambiar a `listId` explícito y adaptar frontend; (4) coordinar un cambio backend/frontend tras medir y obtener inventario más completo. **Recommendation:** opción 1. No hay rendimiento demostrado que justifique el cambio, y ni la opción 2 ni la 3 preservan el contrato observable. No añadir DTO de respuesta: hoy fijaría otro shape HTTP sin beneficio medido y exigiría caracterización/cambios de compatibilidad. Si aparece evidencia cuantitativa de coste, abrir una decisión contractual independiente y conservar consumidores desconocidos hasta confirmarlos.
- **Compatibility risk:** medio/alto para cualquier reducción: el objeto `list`, Asignations y los datos eager de User/Disc son observables; el backend publica GET de Videos sin autenticación y el inventario de consumers externos está incompleto. Tests actuales no protegen el payload completo.
- **Blocks the current audit:** No; la opción A cierra BC-VID-7 sin alterar contrato ni código.

### Propuestas de continuación

#### BC-VID-5 — Habilitar desasignación explícita de User y Editor

- **Estado:** completada (2026-10-16); prioridad media; tamaño S. En ese cierre intermedio, Video seguía en cleanup a la espera de BC-VID-7.
- **Reglas implementadas:** en PATCH, campo omitido conserva la relación, UUID válido la asigna y `null` la elimina. Editor se puede limpiar en cualquier estado. User solo se puede limpiar si el estado resultante no es `editing` ni `ready`; estado y responsable se validan conjuntamente. Se conserva `updateDate` explícito al cambiar a `published`.
- **Frontend:** Kanban envía `null` al limpiar y revierte el cambio visual si falla; los formularios del calendario solo incluyen User/Editor si cambiaron, restauran sus valores ante rechazo y muestran el mensaje del backend.
- **Exclusiones respetadas:** no se modificaron `Video.link`, rutas, permisos, entidades, migraciones, sincronización con Content, otras relaciones/formularios ni `.impeccable/config.json`. En ese momento BC-VID-6/7 y Contents seguían pendientes.
- **Verificaciones ejecutadas:** backend `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts` — 1 suite, 54 tests aprobados (incluye regresiones BC-VID-1/2, UUID válidos/inexistentes, omisión/null y ausencia de persistencia ante 400); `yarn --ignore-engines build`; `yarn --ignore-engines run tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a los dos archivos backend modificados. Frontend `yarn vitest run src/views/contentCalendar/components/VideoActionsModal.test.ts src/views/videos/VideosKanban.test.ts` — 2 suites, 5 tests aprobados; `yarn build`. `git diff --check` aprobado en ambos repositorios. Detector Impeccable sin hallazgos. No se accedió a PostgreSQL ni servicios externos.

#### BC-VID-6 — Retirar `link` del dominio Video en frontend

- [x] **Completada (2026-10-16); frontend-only.** Se retiró `link` de los tipos `Video`/`CreateVideoDto`, de los controles y vistas del Kanban y del calendario, y de los payloads POST/PATCH. Se conservaron Article y los enlaces de otros dominios.
- **Pruebas:** creación y edición desde VideosKanban comprueban ausencia de `link` y conservación de nombre, tipo, estado, fecha y usuario; VideoActionsModal comprueba que no ofrece el control y conserva sus campos soportados. Se mantienen las pruebas de asignaciones/error HTTP del Kanban y restauración de asignaciones del calendario.
- **Verificaciones:** `yarn vitest run src/views/videos/VideosKanban.test.ts src/views/contentCalendar/components/VideoActionsModal.test.ts` — 2 suites, 8 tests aprobados; `yarn build`; `yarn vue-tsc --noEmit`; búsqueda de referencias funcionales obsoletas en los archivos de Video; `git diff --check`.
- **Exclusiones respetadas:** no se modificó backend, BC-VID-7, `.impeccable/config.json`, rutas, permisos ni enlaces de otros dominios. En ese cierre intermedio, Videos seguía **en cleanup** por BC-VID-7 y Contents seguía pendiente.

#### BC-VID-7 — Reducir y explicitar la relación List en el contrato Video

- **Estado:** completada (2026-10-16); decisión A, conservar comportamiento actual; Videos queda **completado**.
- **Decisión y justificación:** se conserva `Video.list` junto con el grafo eager de List/Asignations/User/Disc. Existe una expansión estructural y un posible coste de escalado, pero no se midieron SQL ni payload con datos representativos; el inventario externo tampoco está cerrado. Reducir la carga a `list:{id}` o reemplazarla por `listId` cambia campos observables, así que no se puede asegurar compatibilidad. No hay evidencia suficiente para aprobar ese cambio ni para introducir un DTO explícito. La decisión podrá revisarse con métricas y consumidores confirmados en una tarea contractual independiente.
- **Consumers y tests revisados:** Kanban usa `list.id` para completar `listId` y navegación, y `response.list.id` al crear la lista; el detalle carga List/Asignations desde sus endpoints. Contents no solicita `video.list`; las specs de Videos comprueban la presencia de `list.id` en el resultado de creación, no el payload completo de listado/detalle. Consumers externos no confirmados.
- **Compatibilidad/riesgo:** se preservan payload y consultas actuales; permanece sin cuantificar el coste de expansión y sin inventariar posibles consumers externos. No se modifica contrato HTTP.
- **Verificaciones BC-VID-7:** lectura estática de consultas, entidades, DTOs, serialización implícita, rutas, frontend y tests existentes; se actualizó únicamente este roadmap. `git diff --check -- roadmap/backend-cleanup.md`. No se ejecutaron tests, build ni typecheck; no se accedió a PostgreSQL ni servicios externos.
