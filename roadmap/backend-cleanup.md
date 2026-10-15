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

| Orden | Dominio                   | Módulos previstos                                                                                                                 | Estado                              |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1     | Catalog                   | Artists, Countries, Genres, Discs, CatalogImport, CatalogOverview, LastfmCatalog                                                  | Artists, Countries y Genres completados; resto pendiente |
| 2     | Community                 | Comments, Favorites, Pendings, Rates, Requests                                                                                    | Pendiente                           |
| 3     | Editorial                 | Articles, Asignations, Contents, FestivalPlaylists, Links, Lists, NationalReleases, Points, Reunions, RiffValleyPlaylists, Videos | Pendiente                           |
| 4     | Product                   | News, Suggestions, Versions                                                                                                       | Pendiente                           |
| 5     | Identity                  | Auth, AccessRequests                                                                                                              | Pendiente                           |
| 6     | Integrations              | CloudflareR2, Instagram, LastfmIntegration, SMTP, Spotify, Telegram, TikTok, WordPress                                            | Pendiente                           |
| 7     | Platform / Infrastructure | I18n, Seeds, Uploads                                                                                                              | Pendiente                           |
| 8     | Communications            | Mail                                                                                                                              | Pendiente                           |

### Estado detallado por módulo

Estados válidos: **pendiente**, **auditado**, **en cleanup**, **completado**. Solo cambia al avanzar explícitamente por una auditoría o tarea aprobada.

| Dominio                   | Módulo              | Estado     |
| ------------------------- | ------------------- | ---------- |
| Catalog                   | Artists             | completado |
| Catalog                   | Countries           | completado |
| Catalog                   | Genres              | completado |
| Catalog                   | Discs               | pendiente  |
| Catalog                   | CatalogImport       | pendiente  |
| Catalog                   | CatalogOverview     | pendiente  |
| Catalog                   | LastfmCatalog       | pendiente  |
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

**Verificaciones de BC-GEN-0:** revisión estática del módulo, DTO compartido, composición y consumers directos conocidos; lectura de suites existentes sin ejecución; coherencia del estado del roadmap; `git diff --check`. No se modificó producción, tests ni fixtures. No se ejecutaron tests, migraciones, seeds, servicios externos ni queries a PostgreSQL. Discs, CatalogImport, CatalogOverview y demás módulos consumidores permanecen pendientes de auditoría.

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
