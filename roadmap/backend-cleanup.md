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
| 3     | Editorial                 | Articles, Asignations, Contents, FestivalPlaylists, Links, Lists, NationalReleases, Points, Reunions, RiffValleyPlaylists, Videos | Pendiente                                                                                                |
| 4     | Product                   | News, Suggestions, Versions                                                                                                       | Pendiente                                                                                                |
| 5     | Identity                  | Auth, AccessRequests                                                                                                              | Pendiente                                                                                                |
| 6     | Integrations              | CloudflareR2, Instagram, LastfmIntegration, SMTP, Spotify, Telegram, TikTok, WordPress                                            | Pendiente                                                                                                |
| 7     | Platform / Infrastructure | I18n, Seeds, Uploads                                                                                                              | Pendiente                                                                                                |
| 8     | Communications            | Mail                                                                                                                              | Pendiente                                                                                                |

### Estado detallado por módulo

Estados válidos: **pendiente**, **auditado**, **en cleanup**, **completado**. Solo cambia al avanzar explícitamente por una auditoría o tarea aprobada.

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
| Editorial                 | Articles            | pendiente  |
| Editorial                 | Asignations         | pendiente  |
| Editorial                 | Contents            | pendiente  |
| Editorial                 | FestivalPlaylists   | pendiente  |
| Editorial                 | Links               | pendiente  |
| Editorial                 | Lists               | pendiente  |
| Editorial                 | NationalReleases    | pendiente  |
| Editorial                 | Points              | pendiente  |
| Editorial                 | Reunions            | pendiente  |
| Editorial                 | RiffValleyPlaylists | pendiente  |
| Editorial                 | Videos              | pendiente  |
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

## Hallazgos históricos pendientes de clasificación futura

Se conservan como avisos recibidos; **BC-0 no los investigó ni corrigió**. Su clasificación corresponde a una auditoría o tarea futura del módulo dueño:

- Specs legacy de Versions que construyen `TestingModule` sin `VersionRepository`.
- Expectativa SQL de DiscCatalog sobre `addSelect` que no coincide con la consulta actual.
- Tres suites HTTP que quedaron pendientes por `listen EPERM` al abrir listener.
- Discrepancia `roles` / `role` en `SeedService`.
- Internacionalización todavía no implementada funcionalmente.
- Revisión posterior de `roles-migration/`.
- Referencias documentales históricas a rutas antiguas.

## Cierre de BC-0 (estado histórico al 2026-10-14)

- **Catalog/Artists:** en cleanup, no completado. BC-ART-1, BC-ART-2 y BC-ART-3 completadas; BC-ART-4 pendiente hasta coordinar la adaptación frontend indicada en ART-F4.
- **Otros módulos:** siguen pendientes según la tabla de estado. Countries, Genres y Discs no se auditaron en esta fase.
- **Implementación:** ninguna mejora de código, test o fixture se ejecutó.
- **Verificaciones de BC-0:** revisión estática de Artists/consumers y consulta de tests existentes; validación de enlaces entre `roadmap.md` y este documento; `git diff --check` de documentos afectados. No se ejecutó suite global ni pruebas.
