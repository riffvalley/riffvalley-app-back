# Backend Cleanup — Editorial: Articles, Asignations y Lists

**Navegación:** [índice Backend Cleanup](../README.md). Anterior: índice Backend Cleanup. Siguiente: [Videos y Contents](videos-contents.md).

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
