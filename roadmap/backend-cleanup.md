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
| 1     | Catalog                   | Artists, Countries, Genres, Discs, CatalogImport, CatalogOverview, LastfmCatalog                                                  | Artists completado; resto pendiente |
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
| Catalog                   | Countries           | pendiente  |
| Catalog                   | Genres              | pendiente  |
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
