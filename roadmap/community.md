# Roadmap de Community

Este documento contiene la planificación y el registro de ejecución de la iteración estructural de Community, extraída del índice maestro.

### Iteración — Community

- **Estado:** Community cerrada (2026-10-05). Migración estructural y saneamiento G.1–G.7 completados; regresión backend y regresión manual frontend completadas sin regresiones detectadas. No quedan subtareas pendientes en este roadmap.

**Objetivo:** migrar estructuralmente `comments`, `requests`, `favorites`, `pendings` y `rates` bajo `src/community/`, preservando su comportamiento y contratos. El ownership agrupa capacidades mediante las que los usuarios interactúan con, expresan estado sobre o contribuyen al catálogo.

**Estructura resultante:**

```text
src/community/
  comments/
  requests/
  favorites/
  pendings/
  rates/
```

**Reglas de alcance para toda la iteración:**

- Preservar comportamiento, rutas HTTP, permisos y contratos existentes. No cambiar payloads como parte del movimiento.
- No modificar relaciones TypeORM, `eager`, cascadas ni metadata.
- No optimizar consultas ni QueryBuilders, salvo para corregir una regresión demostrablemente introducida por una subtarea de esta iteración.
- Mantener Rates, Favorites y Pendings como capacidades independientes; no crear abstracciones compartidas por mera similitud.
- Catalog y Auth pueden conservar durante esta iteración sus dependencias actuales hacia datos de Community. `User`, `Disc`, `Genre` y `Country` no cambian de ownership.
- Quedan fuera `access-requests`, `suggestions`, `national-releases` y las capacidades editoriales.
- Un futuro `CommunityModule` raíz es opcional y solo de composición; no es requisito para ubicar las capacidades bajo Community.
- Preservar la relación inversa actualmente sospechosa de `Pending.user` como hallazgo preexistente, no investigarla como cambio de metadata ni corregirla en esta iteración.
- Si futuras subtareas encuentran hallazgos preexistentes, de atribución desconocida o fuera de alcance: no corregirlos, no suprimirlos, no modificar `.impeccable/config.json` y no cambiar estilos, comportamiento o arquitectura para satisfacer el hook. Reportarlos únicamente. Corregir solo hallazgos demostrablemente introducidos por la subtarea en ejecución.

#### A — Caracterización y baseline

##### A.1 — Inventariar contratos, consumidores y dependencias

- **Objetivo:** establecer el mapa previo de las cinco capacidades y de sus consumidores antes de planificar movimientos concretos.
- **Alcance:** controllers, rutas, permisos, DTOs, servicios, módulos, entidades propias, providers de TypeORM, imports internos y consumidores backend/frontend conocidos de Comments, Requests, Favorites, Pendings y Rates; registrar dependencias actuales de Catalog y Auth.
- **Fuera de alcance:** mover archivos, editar producción, cambiar relaciones/metadata o modificar contratos.
- **Dependencias:** ninguna.
- **Criterios de aceptación:** cada capacidad tiene inventariados sus contratos HTTP, dependencias DI/TypeORM, consumidores y referencias entre módulos; quedan identificadas explícitamente las relaciones y respuestas observables que deban preservarse.
- **Verificaciones previstas:** búsquedas de imports y rutas; revisión de módulos y entidades; inspección de callers backend y frontend disponibles; `git diff --check` si se documenta el inventario mediante cambios de roadmap posteriores.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Inventario actual documentado en `docs/architecture/community-inventory.md`; A.2 permanece pendiente.

##### A.2 — Definir la caracterización mínima antes de mover

- **Objetivo:** decidir qué evidencia de comportamiento debe existir antes de cada movimiento.
- **Alcance:** especificar casos aplicables de payload completo, campos ausentes/null/0, relaciones, errores y códigos HTTP, permisos, orden, filtros, paginación, efectos secundarios y resolución DI; distinguir baseline existente de cobertura que falte.
- **Fuera de alcance:** añadir pruebas ahora, cubrir cada endpoint exhaustivamente en una sola tarea o cambiar implementaciones.
- **Dependencias:** A.1.
- **Criterios de aceptación:** cada operación que pueda verse afectada por el movimiento tiene una caracterización existente identificada o una prueba mínima pendiente asignada a la subtarea de su capacidad; los contratos y comportamientos sin cobertura no se dan por equivalentes solo por compilar.
- **Verificaciones previstas:** revisión de suites actuales y matriz de cobertura por capacidad/operación; confirmar que la lista contempla consumidores y relaciones observables identificados en A.1.
- **Tamaño estimado:** S.
- [x] **Completada (2026-10-05).** Baseline mínimo y asignación de caracterizaciones pendientes documentados en `docs/architecture/community-inventory.md`; B.1 sigue pendiente.

#### B — Comments

##### B.1 — Migrar Comments a Community

- **Objetivo:** caracterizar Comments y realizar posteriormente su movimiento estructural a `src/community/comments/`.
- **Alcance:** completar la caracterización pendiente de controller/service según A.2; mover implementación y tests existentes, actualizar imports y composición Nest/TypeORM que sean necesarios para el nuevo path.
- **Fuera de alcance:** alterar rutas, payloads, reglas de comentarios, consultas, metadata de relaciones o relaciones eager/cascadas.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** los archivos de Comments quedan bajo el ownership futuro; no quedan imports rotos; rutas, permisos, payloads, errores, efectos y relaciones caracterizados se preservan.
- **Verificaciones previstas:** specs de Comments; inspección de imports y providers; comparar rutas/controller y respuestas caracterizadas antes/después; build TypeScript.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Comments y su caracterización mínima quedaron bajo `src/community/comments/`; B.2 permanece pendiente.

##### B.2 — Verificar DI, TypeORM y consumidores de Comments

- **Objetivo:** confirmar la integración después del movimiento de Comments.
- **Alcance:** resolución Nest de controller/service y repositorios, registro de entidades y consumers identificados en A.1, incluidos los que dependen de Disc/Comment o de los datos expuestos actualmente.
- **Fuera de alcance:** retirar relaciones eager, modificar mappings o rediseñar respuestas.
- **Dependencias:** B.1.
- **Criterios de aceptación:** no hay providers/repositorios duplicados o ausentes; consumers conocidos siguen resolviendo la dependencia y observan el mismo comportamiento; cualquier fallo previo queda atribuido como preexistente.
- **Verificaciones previstas:** specs DI y de consumidores disponibles; revisión de `TypeOrmModule` y metadata sin editarla; build y regresión focalizada.
- **Tamaño estimado:** S.
- [x] **Completada (2026-10-05).** DI, metadata TypeORM e integración con consumers verificados; los fallos heredados quedan reportados. C.1 permanece pendiente.

#### C — Requests

##### C.1 — Migrar Requests a Community

- **Objetivo:** caracterizar Requests y moverlo posteriormente a `src/community/requests/`.
- **Alcance:** fijar comportamiento y contratos de sus operaciones; mover módulo, controller, service, DTOs y tests propios; actualizar imports y composición requeridos, considerando dependencias con Catalog y Auth.
- **Fuera de alcance:** `access-requests`, `suggestions`, cambios de permisos/rutas/payloads o cambios de queries/relaciones.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** Requests queda ubicado bajo Community; los consumers y dependencias con Catalog/Auth siguen funcionando; rutas, permisos, payloads, errores y side effects se preservan.
- **Verificaciones previstas:** specs de Requests existentes o añadidos para caracterizar; revisión de guards/decoradores, dependencias de entidades Catalog y providers; build TypeScript.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Requests y su caracterización mínima quedaron bajo `src/community/requests/`; C.2 permanece pendiente.

##### C.2 — Verificar consumidores y dependencias con Catalog/Auth

- **Objetivo:** verificar la resolución e integración de Requests después del movimiento.
- **Alcance:** callers backend/frontend identificados, imports de entidades y módulos de Catalog, servicios/guards de Auth y composición Nest relevante.
- **Fuera de alcance:** mover entidades Catalog/Auth, alterar autorización o cambiar el contrato de Requests.
- **Dependencias:** C.1.
- **Criterios de aceptación:** consumers identificados siguen obteniendo los mismos datos y resultados; Catalog y Auth conservan sus dependencias actuales cuando sean necesarias; fallos preexistentes quedan documentados y fuera del cambio.
- **Verificaciones previstas:** specs focalizados de Requests y suites de los consumers disponibles; revisión de DI/imports; build.
- **Tamaño estimado:** S.
- [x] **Completada (2026-10-05).** Resolución Nest, repositorios Catalog, guards/Auth, rutas y aislamiento de `access-requests` verificados; E.1 permanece pendiente.

#### D — Favorites y Pendings

##### D.1 — Migrar Favorites a Community

- **Objetivo:** caracterizar Favorites y mover posteriormente su módulo a `src/community/favorites/` como capacidad independiente.
- **Alcance:** fijar las operaciones, contratos y consumers de Favorites; mover implementación y tests propios; actualizar imports, providers y composición necesarios.
- **Fuera de alcance:** combinar lógica con Pendings o Rates, cambiar consultas, relaciones, eager/cascadas o payloads.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** Favorites queda bajo Community como módulo/capacidad independiente; rutas, respuestas, permisos, side effects y referencias caracterizadas permanecen iguales.
- **Verificaciones previstas:** specs de Favorites; revisión de imports y DI; pruebas de consumers aplicables; build TypeScript.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Favorites y sus tres bloques de caracterización mínima quedaron bajo `src/community/favorites/`; los consumers Catalog y el cruce existente con Pending siguen caracterizados. E.1 permanece pendiente.

##### D.2 — Migrar Pendings a Community

- **Objetivo:** caracterizar Pendings y mover posteriormente su módulo a `src/community/pendings/` como capacidad independiente.
- **Alcance:** fijar las operaciones, contratos y consumers de Pendings; mover implementación y tests propios; actualizar imports, providers y composición necesarios.
- **Fuera de alcance:** unificarlo con Favorites o Rates, corregir la relación inversa sospechosa de `Pending.user`, cambiar queries, relaciones, eager/cascadas o payloads.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** Pendings queda bajo Community como capacidad independiente; su metadata permanece intacta, incluido el hallazgo preexistente de `Pending.user`; rutas, permisos, respuestas y efectos caracterizados se preservan.
- **Verificaciones previstas:** specs de Pendings; revisión de imports y DI; suites de consumers aplicables; confirmar que no hay cambios de metadata TypeORM; build.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Pendings y sus dos bloques nuevos de caracterización quedaron bajo `src/community/pendings/`; se reutilizó la cobertura existente y se preservó `Pending.user → user.rate`. E.1 permanece pendiente.

##### D.3 — Verificar consultas y consumidores cruzados

- **Objetivo:** comprobar la integración de Favorites y Pendings con Catalog y otros consumers después de ambos movimientos.
- **Alcance:** revisar consultas existentes sin optimizarlas, cargas actuales de relaciones, resolución de repositorios y callers cruzados que consumen Favorite/Pending o sus IDs/colecciones.
- **Fuera de alcance:** reescribir QueryBuilders, cambiar forma de carga, quitar eager o cambiar los campos devueltos.
- **Dependencias:** D.1 y D.2.
- **Criterios de aceptación:** consumers conocidos mantienen datos y semántica actuales; no hay cambios de SQL intencionales ni de metadata; las capacidades siguen separadas.
- **Verificaciones previstas:** suites focalizadas y consumers aplicables; comparación de respuestas caracterizadas; revisión de consultas/metadatos para detectar cambios accidentales; build.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Favorites, Pendings, Home y Calendar conservaron sus cruces y payloads; metadata e imports quedaron verificados. El conjunto focalizado dio 140/141 tests por el fallo preexistente de `DiscCatalogService` en `addSelect('disc.id', 'discId')`, que permanece sin cambios. E.1 permanece pendiente.

#### E — Rates

##### E.1 — Migrar Rates a Community

- **Objetivo:** caracterizar Rates y mover posteriormente su capacidad a `src/community/rates/`.
- **Alcance:** fijar operaciones, contratos, permisos, reglas de rate y consumers; mover módulo, implementación y tests propios; actualizar imports, providers y composición requeridos.
- **Fuera de alcance:** combinar Rates con Favorites/Pendings, cambiar cálculos, consultas, metadata TypeORM o payloads.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** Rates queda bajo Community como capacidad independiente; rutas, respuestas, orden, errores, permisos y side effects caracterizados no cambian.
- **Verificaciones previstas:** specs de Rates y consumers directos; inspección de DI y repositorios; build TypeScript.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Rates y las cuatro caracterizaciones mínimas quedaron bajo `src/community/rates/`; las suites propias de controller/stats y los consumers focalizados de Home, Calendar y Artists pasan. El typecheck y `git diff --check` pasan y no quedan imports al path anterior. `DiscCatalogService` conserva el fallo preexistente de `addSelect('disc.id', 'discId')`, documentado en D.3; no se modificó.

##### E.2 — Verificar consumidores de Catalog y Auth

- **Objetivo:** comprobar los puntos de integración de Rates con Catalog y Auth tras el movimiento.
- **Alcance:** consumidores que agregan o muestran rates en Catalog, reglas que usan el usuario autenticado y dependencias de módulos/repositorios actuales.
- **Fuera de alcance:** cambiar cálculos agregados, autenticación, autorización, relaciones o contrato.
- **Dependencias:** E.1.
- **Criterios de aceptación:** Catalog y Auth siguen resolviendo las dependencias necesarias; datos y reglas visibles a consumidores permanecen iguales; no se introducen abstracciones compartidas con Favorites/Pendings.
- **Verificaciones previstas:** suites focalizadas de Rates, Catalog y Auth aplicables; revisión de DI/imports y build.
- **Tamaño estimado:** S.
- [x] **Completada (2026-10-05).** Rates, Auth → Rate y los consumers focalizados de Home, Calendar y Artists pasan; Auth resuelve el repositorio y conserva las proyecciones de actividad. RatesModule se registra una vez en AppModule; no hay dependencia inversa ni imports legacy. El typecheck y `git diff --check` pasan. `DiscCatalogService` conserva el fallo preexistente de `addSelect('disc.id', 'discId')`; no se modificó. Dos suites PostgreSQL se omitieron por no estar habilitadas en este entorno. F.1 permanece pendiente.

#### F — Composición y regresión final

##### F.1 — Normalizar imports y composición futura

- **Objetivo:** cerrar los paths e imports de las cinco capacidades y decidir la composición mínima necesaria.
- **Alcance:** corregir referencias a ubicaciones anteriores y revisar `AppModule` y módulos consumidores; añadir un `CommunityModule` raíz solo si simplifica composición y se limita a importar/exportar módulos existentes.
- **Fuera de alcance:** introducir un módulo raíz por obligación estética, cambiar ownership de entidades externas, crear barrels genéricos o alterar dependencias funcionales.
- **Dependencias:** B.2, C.2, D.3 y E.2.
- **Criterios de aceptación:** no quedan imports activos hacia las ubicaciones anteriores; cada capability se compone una vez y mantiene su independencia; cualquier `CommunityModule` es opcional y solo de composición.
- **Verificaciones previstas:** búsquedas de imports legacy; revisión de módulos Nest y posibles ciclos/duplicidades DI; build.
- **Tamaño estimado:** S.
- [x] **Completada (2026-10-05).** No quedan referencias activas de código a las ubicaciones anteriores; AppModule registra una vez cada módulo de capacidad y no se añadió CommunityModule porque el registro directo es la composición mínima. Revisadas las dependencias entre capacidades, Catalog/Auth, entidades y tests: no hay ciclos ni providers duplicados introducidos. Inventario actualizado a los paths actuales. Typecheck y `git diff --check` pasan; F.2 permanece pendiente.

##### F.2 — Verificar límites arquitectónicos

- **Objetivo:** confirmar que el resultado corresponde al ownership acordado sin extender el alcance.
- **Alcance:** comprobar carpetas objetivo, independencia de Rates/Favorites/Pendings, ownership sin cambios de User/Disc/Genre/Country y exclusión de access-requests, suggestions, national-releases y capacidades editoriales.
- **Fuera de alcance:** migrar capacidades excluidas o resolver hallazgos documentados.
- **Dependencias:** F.1.
- **Criterios de aceptación:** los límites están satisfechos; no se añadieron abstracciones compartidas sin reutilización real; `Pending.user` y otros hallazgos fuera de alcance permanecen sin modificación y reportados.
- **Verificaciones previstas:** inspección de estructura, imports, metadata TypeORM y diff de producción; confirmar ausencia de cambios no planificados en contratos.
- **Tamaño estimado:** S.
- [x] **Completada (2026-10-05).** `src/community/` contiene únicamente Comments, Requests, Favorites, Pendings y Rates; Auth/User, Catalog y las capacidades excluidas siguen fuera. Rates, Favorites y Pendings mantienen módulos y servicios independientes; no hay abstracciones compartidas ni `CommunityModule`, y no se añadieron dependencias de servicio entre capacidades. La comparación con la base previa confirma que los cambios de producción de la migración son movimientos y ajustes de imports; las relaciones, `eager`, cascadas, metadata, rutas, permisos y contratos se conservan. `Pending.user → user.rate` permanece intacta y reportada en el inventario. Typecheck y `git diff --check` pasan; F.3 permanece pendiente.

##### F.3 — Regresión final de Community

- **Objetivo:** demostrar que la iteración completa preserva el comportamiento observable y la integración.
- **Alcance:** regresión focalizada de las cinco capacidades y de consumers backend relevantes en Catalog/Auth; compilación; revisión final de rutas, contratos, DI, entidades y cambios.
- **Fuera de alcance:** arreglar fallos preexistentes o contractuales ajenos a una regresión atribuible a una subtarea.
- **Dependencias:** F.1 y F.2.
- **Criterios de aceptación:** regresión y build aprobados; contratos, permisos, respuestas y side effects caracterizados se preservan; fallos heredados se atribuyen y reportan; los únicos cambios son los necesarios para el movimiento estructural y sus pruebas.
- **Verificaciones previstas:** suites de Comments, Requests, Favorites, Pendings y Rates; suites disponibles de consumidores Catalog/Auth; `yarn --ignore-engines tsc --noEmit --incremental false`; `git diff --check`; revisión de imports antiguos y del diff.
- **Tamaño estimado:** M.
- [x] **Completada (2026-10-05).** Las 49 suites aplicables pasan (340 tests); falla una suite con un test por la expectativa preexistente de `DiscCatalogService.addSelect('disc.id', 'discId')`; siete suites PostgreSQL (28 tests) quedan omitidas porque sus flags de ejecución no están habilitados. No se identificaron regresiones atribuibles a la migración. Typecheck y `git diff --check` pasan. La regresión confirma estructura, imports, DI, metadata y consumers; se cierra la migración estructural. La evaluación post-migración de saneamiento permanece pendiente.

## Post-migración — Evaluación de saneamiento de Community

**Estado:** evaluación e iteración de saneamiento G.1–G.7 completadas (2026-10-05).

- **Dependencia satisfecha:** cierre de F.3 — Regresión final de Community.
- **Objetivo:** corregir primero riesgos de autorización y bugs demostrables; después resolver deuda interna y medir consultas, preservando contratos observables salvo decisión explícita.
- **Fuentes:** `docs/architecture/community-inventory.md`, caracterizaciones/tests añadidos en B–E, y controllers, servicios, DTOs, entidades y consumidores actuales de Catalog/Auth.
- **Reglas generales:**
  - No inferir que una lectura es privada solo porque carezca de `@Auth()`: decidir por ruta tras revisar los datos y consumers. Las mutaciones de datos personales deben autenticar y comprobar ownership.
  - Fijar el comportamiento relevante antes del cambio; no considerar build/typecheck como caracterización. Preservar contratos salvo decisión documentada.
  - No retirar `eager` ni colecciones de `Disc` hasta identificar consumers, fijar payload actual y cubrir explícitamente las cargas requeridas. Si un consumer queda sin confirmar, preservar la relación.
  - Medir SQL con parámetros/datos representativos antes de optimizar o proponer índices. No crear abstracciones compartidas, repositories custom, CQRS, query services o `CommunityModule` sin necesidad y reutilización demostrables.
  - Registrar, sin corregir, fallos ajenos como `DiscCatalogService → addSelect('disc.id', 'discId')`; no modificar `.impeccable/config.json`.

### Registro de hallazgos y decisiones

| Hallazgo y evidencia | Impacto, consumers y tipo | Prioridad, riesgo y coordinación | Decisión propuesta |
|---|---|---|---|
| **Autorización/ownership.** `CommentsController` deja GET/PATCH/DELETE por id y GET por disco sin `@Auth()`; PATCH/DELETE tampoco validan propietario. Favorites y Pendings dejan GET/DELETE por id públicos; `remove(id)` borra solo por ID. Rates deja history por `userId`, rates por disco y GET por id públicos; PATCH/DELETE sí comprueban owner. Requests restringe operaciones administrativas y autentica `my`. | Riesgo de exposición de datos y modificación/borrado ajenos: **seguridad** y potencial **bug**. Consumers: frontend de Comments/Favorites/Pendings/Rates; Catalog proyecta parte del estado personal por separado. | **P0**; riesgo alto al cambiar accesos. Escrituras: backend-only; hacer privadas lecturas hoy públicas puede requerir backend + frontend. | Proteger mutaciones de Comment/Favorite/Pending con autenticación y ownership. Decidir por separado qué GET puede seguir público revisando contenido y consumers; no proteger todo indiscriminadamente. Subtarea propia. |
| **404→500.** Catches de Comments (`create`, `findCommentsByDisc`), Favorites/Pendings (`create`) y Rates (`create`, `findRatesByDisc`) traducen cualquier error que no sea 23505 a 500, incluso `NotFoundException` de Disc o parent ausente. Los `findOne` por entidad conservan 404; Requests lanza 404 directamente. | Status HTTP incorrecto y diagnóstico oculto: **bug/contrato**. Consumers de endpoints Community y frontend. | **P1**; riesgo medio por status observable; backend-only para restaurar 404, FE coordination si depende del 500 actual. | Preservar excepciones HTTP conocidas y traducir solo errores DB. Characterizar por operación antes del cambio. Subtarea propia. |
| **Metadata `Pending.user` (resuelto en G.2).** TypeORM resolvía el inverse side de `Pending.user` como `User.rate`, mientras `User.pending` resolvía correctamente a `Pending.user`. PostgreSQL demostró que la persistencia y carga en ambas direcciones funcionaban pese al puntero inverso incoherente; no se hallaron consumers de navegación User → Pending. | Inconsistencia reproducida en metadata real y riesgo para navegación/operaciones ORM que sigan el inverse side; sin fallo observable en las operaciones probadas ni consumer actual: **bug de metadata**. | **P1**; cambio backend-only, acotado a una lambda. | Corregir `Pending.user` para apuntar a `User.pending`. Tests fijan metadata recíproca y persistencia/carga con FK, eager y cascada preservadas. |
| **DTO y formas reales.** `CommentResponseDto.user` omite `image`, que `findCommentsByDisc` devuelve. Las respuestas de listas incorporan agregados y subobjetos; `Pending.userPending` es un ID mientras otras proyecciones usan formas distintas. Tests Catalog fijan proyecciones; characterization directa de Favorites/Pendings/Rates es parcial. Null/0 también difiere entre mappers. | Deuda de tipado y formas heterogéneas, algunas raras pero **contractuales**; **contrato/deuda técnica**. Consumers: frontend de Comments/listas y Catalog (`userRate`, `favoriteId`, `pendingId`, `commentCount`, agregados). | **P2**; riesgo medio si cambia JSON; al uniformar/quitar campos: backend + frontend. | Alinear DTO Comment con el mapper y fijar formas reales relevantes con tests. No uniformar payloads ni nullabilidad ni cambiar Catalog en esta iteración. |
| **Eager y colecciones Disc.** `Disc.favorites`, `Disc.pendings`, `Disc.comments` están eager. Disc detail carga User de esas colecciones; Catalog/Home/Calendar también proyectan estados y agregados; tests de Catalog fijan arrays y estado personal. | Posible carga/payload costosos, parcialmente usados: **performance/contrato**. Consumers: Disc Catalog, Home, Calendar, frontend y objetos Disc anidados. | **P2**; riesgo alto al quitar relaciones. Reducir JSON o sustituir arrays exige backend + frontend; optimizar carga interna con JSON idéntico sería backend-only. | Medir cada endpoint y consumer; conservar eager/arrays mientras exista consumer no confirmado. No asumir que eager aplica igual a find y QueryBuilder. Cambio solo con ahorro demostrado y equivalencia. |
| **`RatesService` (541 líneas).** Contiene create/upsert, listado filtrado/paginado con agregados, findOne, update/delete con ownership, lectura por disco, manejo de errores y history que expande Rate a eventos, ordena/pagina en memoria y ejecuta conteos. `RatesStatsService` (248 líneas) ya contiene stats/insights. `RatesService` lo consume únicamente RatesController; no hay spec completo de su servicio. | Mezcla mutación, proyección y caso de uso history: **deuda técnica/arquitectura**. History lo consumen Dashboard y UserModal; el resto, Routes de Rates. | **P2**; riesgo medio DI/contrato; backend-only manteniendo respuesta. | No dividir automáticamente lectura/escritura ni duplicar Stats. Characterizar y extraer únicamente history si se confirma como límite autónomo; mantener CRUD/listado/lookup juntos inicialmente y revisar cohesión después. Stats permanece separado. |
| **Queries repetidas/coste (G.7).** Se midieron SQL generados y planes locales. Favorites/Pendings/Rates repiten AVG/COUNT por Disc; varias consultas totales incluyen joins de estado que no afectan el count. Catalog y Home repiten agregados con otras proyecciones. | Seq scans correlacionados medidos y dos joins innecesarios retirados del query total de Favorites/Rates; contratos listados distintos: **performance/deuda técnica**. | **P3**; cambios backend-only si equivalentes. | Retirar solo los joins demostrados como sobrantes en los conteos Favorites/Rates; mantener los demás patrones, sin abstracción compartida ni índice nuevo. G.7 documenta las decisiones y limitaciones. |
| **Acoplamiento Catalog ↔ Community y Auth → Rate.** Catalog usa relaciones/SQL de Rate, Favorite, Pending y Comment; Requests aprueba materializando Artist/Disc vía repositorios Catalog. Auth importa/registra Rate y calcula actividad/historial en `AuthService`; `auth-rate.consumer.spec.ts` fija ese consumer. No hay dependencia inversa de `RatesService`. | Acoplamiento de entidad/esquema, sin evidencia de bloqueo actual: **arquitectura/deuda técnica**. | **P3**; riesgo alto y beneficio no probado; backend-only en teoría, con superficie amplia. | No mover ownership ni introducir facades/ports ahora. Registrar como restricción y reabrir ante una mejora concreta de dominio/coste. No merece subtarea propia de esta iteración. |
| **Fallo preexistente ajeno:** expectativa/fallo `DiscCatalogService → addSelect('disc.id', 'discId')` registrado durante F.3. | Fuera de Community sin vínculo demostrado. | Excluido. | No corregir ni incorporar a verificaciones salvo que una tarea de Community pruebe relación directa. |

### Iteración de saneamiento — Community

**Objetivo:** reducir primero riesgos de seguridad y bugs HTTP; resolver metadata si se demuestra incorrecta; fijar contratos reales y extraer solo una responsabilidad clara de Rates. Medir relaciones y SQL antes de cambios de rendimiento. No es una re-arquitectura general.

**Reglas de ejecución:** caracterizar inputs, status, payloads, ownership, relaciones, filtros, orden, null/0 y side effects aplicables. No combinar cambios de autorización con query/eager/metadata. Mantener rutas/respuestas salvo decisión explícita. Mantener `RatesStatsService`; no crear abstracciones por semejanza. Estimaciones XS/S/M; dividir antes de ampliar una subtarea que supere M.

#### Bloque 1 — Seguridad y ownership (P0)

##### G.1 — Caracterizar y cerrar acceso a operaciones Community

- **Estado:** completada (2026-10-05).
- **Problema/evidencia:** rutas identificadas arriba: escritura de Comment sin auth/owner y borrado Favorite/Pending sin auth/owner; lecturas por ID/history con política no fijada.
- **Impacto/tipo:** seguridad; usuarios y consumers frontend. Cambiar mutaciones backend-only; hacer privadas lecturas puede requerir FE/backend.
- **Alcance:** decidir acceso por ruta; exigir autenticación y ownership para mutar/borrar datos personales; conservar acceso anónimo de lectura solo si datos y callers lo justifican. Mantener Requests y Rates update/delete según sus reglas actuales.
- **Fuera de alcance:** payloads, cambios de Auth, ocultar campos o permisos administrativos de Requests.
- **Dependencias:** ninguna; caracterización precede a cada cambio.
- **Criterios de aceptación:** matriz por endpoint; pruebas anon/autenticado, propietario/no propietario; ninguna mutación de recurso ajeno; 401/403/404 fijados; lectura pública conservada donde esté justificada.
- **Verificaciones:** tests focalizados de guards/controllers/services, búsqueda de rutas y revisión de consumers; pruebas frontend solo si cambia acceso.
- **Tamaño:** M.

**Decisión por ruta (G.1):**

| Capacidad y ruta | Anónimo | Propietario autenticado | No propietario autenticado | Inexistente |
|---|---|---|---|---|
| Comments `POST /`, `GET /` | 401 | 201 creación propia / 200 lista propia | No aplica: se limita al usuario autenticado | Create con Disc/parent inexistente: 404 |
| Comments `GET /:id`, `PATCH /:id`, `DELETE /:id` | 401 | 200; actualiza o elimina según el comportamiento previo | 403 | 404 |
| Comments `GET /disc/:discId` | Público; proyección usada por `ComentsModal.vue` | Público | Público | 404 |
| Favorites `POST /`, `GET /` | 401 | 201 creación propia / 200 lista propia | No aplica: se limita al usuario autenticado | Create con Disc inexistente: 404 |
| Favorites `GET /:id`, `DELETE /:id` | 401 | 200 | 403 | 404 |
| Pendings `POST /`, `GET /` | 401 | 201 creación propia / 200 lista propia | No aplica: se limita al usuario autenticado | Create con Disc inexistente: 404 |
| Pendings `GET /:id`, `DELETE /:id` | 401 | 200 | 403 | 404 |
| Rates `POST /`, `GET /`, `GET /stats`, `GET /home-insights` | 401 | 201 creación/upsert propia / 200 datos propios | No aplica: se limita al usuario autenticado | Create con Disc inexistente: 404 |
| Rates `GET /:id`, `PATCH /:id`, `DELETE /:id` | 401 | 200 | 403 | 404 |
| Rates `GET /disc/:discId` | Público | Público | Público | 404 |
| Rates `GET /user/:userId/history` | Público; consumer de Dashboard y UserModal | Público | Público | Página vacía para userId sin eventos, según algoritmo actual |

Los listados y POST de Comments/Favorites/Pendings/Rates siguen requiriendo autenticación, limitados al usuario del token cuando son listados. Stats y home-insights de Rates siguen autenticados. No se cambió la autorización existente de PATCH/DELETE Rates ni se tocó Requests.

**Hallazgo de contrato revisado:** los cuatro `GET /:id` devolvían la entidad personal con su relación User eager, incluyendo campos de perfil; no se hallaron consumers frontend para esas rutas. G.1 los limita al propietario: el acceso anónimo queda en 401, el no propietario en 403 y el recurso inexistente en 404. Se preservan las lecturas públicas de comentarios por disco (modal de comentarios), rates por disco (ArtistManagement) e history (Dashboard/UserModal), que tienen consumers identificados y exponen las proyecciones que esos flujos usan.

**Resultado:** mutaciones personales autenticadas y limitadas por owner; los GET por ID también quedan privados por la relación de usuario que exponen. Payloads, DTOs, metadata TypeORM y queries de lectura no se rediseñaron. G.2 permanece pendiente.

#### Bloque 2 — Metadata y bugs (P1)

##### G.2 — Verificar y corregir condicionalmente `Pending.user`

- **Estado:** completada (2026-10-05).
- **Problema/evidencia:** metadata resuelta de TypeORM vinculaba `Pending.user.inverseRelation` con `User.rate`, no `User.pending`. PostgreSQL confirmó persistencia y carga Pending → User y User → Pending, incluida cascada desde `User.pending`; no se encontró consumer backend de esa navegación.
- **Impacto/tipo:** bug de metadata demostrado; User/Auth y navegación inversa. Sin consumer backend actual ni fallo de persistencia/carga reproducido; riesgo limitado a metadatos ORM incoherentes; backend-only.
- **Alcance:** inspeccionar metadata resuelta, navegar/persistir ambas direcciones y buscar consumers; se corrigió solo el inverse side. Preservar FK, eager/cascade y respuestas no relacionadas.
- **Dependencias:** ninguna técnica; después de G.1 recomendado para aislar diffs.
- **Criterios de aceptación:** el metadata apunta recíprocamente a `User.pending`/`Pending.user`; persistencia, cascada y carga por ambos lados funcionan; FK, eager, cascade, `onDelete`, payloads y consumers no cambian.
- **Verificaciones:** metadata resuelta y args, fixtures PostgreSQL con tablas temporales, suites focalizadas Pending/User; typecheck y `git diff --check`.
- **Tamaño:** S.

**Conclusión de G.2:** el defecto quedó demostrado por la metadata resuelta (`Pending.user.inverseRelation === User.rate`), aunque no se reprodujo un fallo de persistencia o carga en los flujos probados. Se corrigió únicamente la lambda inverse side y las pruebas confirman que la navegación y persistencia siguen funcionando. `User.pending` está tipada como un `Pending` singular pese a ser `OneToMany`; no se cambió esa declaración porque queda fuera de la corrección mínima de metadata de G.2.

#### Bloque 3 — Errores y contratos (P1–P2)

##### G.3 — Preservar 404 de dominio en Community

- **Estado:** completada (2026-10-05).
- **Problema/evidencia:** los catches DB de Comments/Favorites/Pendings/Rates convierten NotFound en 500 en altas y lecturas por disco; Comments incluye parent inexistente.
- **Impacto/tipo:** bug/contrato; API y frontend; FE coordination solo si callers dependen del 500.
- **Alcance:** dejar pasar excepciones HTTP conocidas y traducir errores DB concretos sin filtrar detalles. No tocar Requests.
- **Dependencias:** compartir la caracterización de G.1 cuando aplique; se puede implementar por capability.
- **Criterios de aceptación:** Disc/parent inexistente devuelve 404; fallo DB no clasificado conserva 500 seguro; duplicados siguen 400 donde aplica.
- **Verificaciones:** tests focalizados de status y cuerpo HTTP por operación.
- **Tamaño:** S.

**Resultado:** los cuatro handlers preservan cualquier `HttpException` y mantienen la traducción de duplicados `23505` a 400 y el 500 genérico para errores inesperados. Tests de servicio caracterizan los 404 por disco/parent, 400 de duplicado, 500 seguro y las operaciones correctas existentes. G.4 queda registrado a continuación.

##### G.4 — Alinear DTO Comment y fijar formas observables

- **Estado:** completada (2026-10-05).
- **Problema/evidencia:** DTO omite `user.image`; responses directas de Community tienen agregados, subobjetos y nulabilidad heterogénea; cobertura directa incompleta.
- **Impacto/tipo:** contrato/deuda; Comments, Favorites/Pendings/Rates y Catalog. Rediseñar payload requiere backend+frontend.
- **Alcance:** documentar y probar estructuras directas consumidas, alinear DTO a mapper; preservar formas, null/0 y campos. No uniformar ni rediseñar Catalog.
- **Dependencias:** ninguna; referencia para G.5–G.7.
- **Criterios de aceptación:** DTO refleja JSON actual; tests fijan envelope/relaciones/proyecciones/nulabilidad relevantes; sin cambios de runtime no decididos.
- **Verificaciones:** specs de mapper/services y revisión de consumers del inventory.
- **Tamaño:** S.

**Resultado:** `CommentResponseDto` ahora declara `user.image: string | null` y `editedAt: Date | null`, campos emitidos por el mapper (`editedAt` queda en el spread de los campos restantes). La caracterización de Comments fija objeto completo, `parentId` nulo o ID, marca/texto de comentario eliminado, imagen nula o presente, fechas y subobjetos `{id,name}` de Disc. Favorites conserva `userRate` como objeto `{id,rate,cover}`, `userPending` como `{id}`, y `voteCount: null`/`commentCount: 0`/promedios `null` cuando no hay interacciones. Pendings conserva `userPending` como ID, el array filtrado `favorites`, `favoriteId`, `userRate` como objeto o `null`, y sus conversiones actuales de conteos/agregados. Rates conserva `userRate` como objeto, `favoriteId`/`pendingId` como ID o `null`, `voteCount: null` para agregado cero, `commentCount: 0`, promedio numérico `0` frente a promedio ausente `null`, y los campos personales Rate/cover `0`/`null`; también queda fijada la respuesta directa por disco con Users y scores nulos. No cambió lógica runtime ni Catalog y no se uniformaron payloads. G.5 permanece pendiente.

#### Bloque 4 — Cohesión de Rates (P2)

##### G.5 — Caracterizar y extraer history de Rates si es autónomo

- **Problema/evidencia:** 541 líneas; CRUD/upsert, listados/proyecciones, lookup por disco y algoritmo de history. History reconstruye eventos created/updated, los ordena/pagina en memoria y cuenta eventos con consultas adicionales. Stats ya está aislado.
- **Impacto/tipo:** deuda técnica/arquitectura; solo RatesController usa service; history lo consume Dashboard/UserModal. Backend-only si contrato igual.
- **Alcance:** caracterizar type/range (incluido rango parcial ignorado), order, páginas por evento, empate/orden, Rate sin Artist; mover history a `RatesHistoryService` con spec adyacente solo si no necesita CRUD/list. No crear fachada innecesaria. Mantener el resto junto inicialmente; reevaluar tamaño/cohesión tras extracción.
- **Decisión sobre división:** no separar mutaciones/upsert de todas las lecturas: no hay caller alternativo ni un beneficio probado para otra capa; no duplicar `RatesStatsService`. History es el límite más claro por su algoritmo y proyección autónomos.
- **Dependencias:** characterization antes del movimiento; G.4 fija semántica observable.
- **Criterios de aceptación:** rutas/JSON idénticos; implementación movida, no copiada; providers/imports correctos; sin cambios SQL/metadata colaterales.
- **Verificaciones:** pruebas de history y delegación de controller, suite focalizada Rates, typecheck.
- **Tamaño:** M.
- [x] **Completada (2026-10-05).** Rates conserva controller, módulo y servicio principal en la raíz; DTOs y entidad quedan en sus categorías existentes; controller/módulo tests están en `__tests__/`; `RatesHistoryService` y su spec adyacente están en `history/`. No se dividió CRUD/lecturas y `RatesStatsService` permanece separado. History quedó caracterizado antes del movimiento: tipos `rate`/`cover`/`both`, rango completo inclusivo (el controller ignora `from`/`to` parciales), orden ASC/DESC por timestamp con empates estables según el orden de entrada y sin desempate explícito, paginación sobre eventos expandidos, conteos separados de eventos creados/editados, Rate sin artista, scores nulos/0 y JSON serializado. Dashboard consume hasta 100 eventos `created` de tipo `rate` para rachas; UserModal consume páginas de 20 eventos `both` y los metadatos de total/página. El algoritmo depende solo del repositorio Rate, por lo que se extrajo sin cambiar queries ni payload; el controller delega directamente y el módulo registra el provider. Cinco suites de Rates (24 tests), typecheck y `git diff --check` pasan. G.6 y G.7 siguen pendientes.

#### Bloque 5 — Carga y consultas (P2–P3)

##### G.6 — Medir colecciones eager y payloads Community de Catalog

- **Problema/evidencia:** colecciones eager de Disc y cargas de User en detalle; Catalog/Home/Calendar proyectan estados; tests fijan algunas respuestas.
- **Impacto/tipo:** performance/contrato; Disc, Home, Calendar, frontend y objetos anidados. Reducir arrays/JSON requiere backend+frontend; misma respuesta con carga más selectiva sería backend-only.
- **Alcance:** matriz operación→relación→consumer→payload/tamaño/coste; distinguir eager en find de joins QueryBuilder. Recomendar conservar o alternativa pequeña; no quitar relaciones durante medición.
- **Dependencias:** G.4; datos representativos.
- **Criterios de aceptación:** consumidores identificados y coste medido; ahorro justificable; equivalencia de JSON si cambia solo carga; consumers sin confirmar mantienen eager.
- **Verificaciones:** inspeccionar SQL/cantidad de consultas y JSON por rutas representativas; comparar callers Catalog.
- **Tamaño:** M.

**Estado: completada (2026-10-05).** Se revisaron metadata TypeORM, consultas Catalog, mappers, tests existentes y callers frontend en `spammusic-front`. No se cambió producción ni se añadieron tests. La base de datos local no pudo medirse: el intento de una consulta agregada de solo lectura a `127.0.0.1:5432` terminó en `EPERM` dentro del sandbox; no hay cardinalidades ni bytes de payload de datos reales disponibles. Las cifras siguientes son cantidad estructural de consultas/joins derivada del código y del comportamiento configurado por defecto en TypeORM 0.3.20, no latencias ni volumen real.

TypeORM usa `relationLoadStrategy: 'join'` por defecto en repository `find`. `DiscCatalogService.findOne` solicita explícitamente las tres colecciones Community; también se detectaron cargas eager desde `NationalReleasesService` y los importadores manual/Excel. Las lecturas con QueryBuilder y SQL directo no heredan automáticamente las relaciones eager; cada selección/relación Community que cargan está declarada en la consulta. Los `COUNT`/`AVG` correlacionados son parte de una sentencia, no consultas adicionales.

| Operación | Relación Community y mecanismo | Consultas aproximadas y joins Community | Payload relevante / consumers confirmados | Decisión |
|---|---|---|---|---|
| `GET /discs/:id` (`DiscCatalogService.findOne`) | `favorites`, `pendings`, `comments` desde `Disc` eager y `relations` anidadas; incluye `user` de cada colección. `rates` no se carga. Repository `findOneOrFail`, estrategia `join`. | 1 SELECT; 9 joins totales observables en el árbol pedido: Artist, Country, Genre y las tres colecciones más sus tres User. El cruce de las tres colecciones puede multiplicar filas SQL por `favorites × pendings × comments`, aunque TypeORM deduplica entidades al hidratar. | Devuelve arrays completos `favorites[]`, `pendings[]`, `comments[]` con columnas de relación/User; el array Comment no incluye replies. La inspección del frontend encontró consumo de listados, Home y Calendar, pero ningún caller de `GET /discs/:id`; el consumidor de ese endpoint queda observable pero no confirmado. Separar carga SQL (fanout/columnas repetidas) de payload JSON (serializa cada elemento hidratado). Sin datos no se estima tamaño en bytes. | **Candidato a optimización posterior.** La colección completa parece prescindible para los callers frontend localizados, pero la ruta expone un contrato y quedan consumidores externos sin confirmar; no quitar eager ni relaciones ahora. |
| `GET /discs` (`DiscCatalogService.findAll`) | `rates`, `favorites`, `pendings` unidos explícitamente y filtrados por `userId`; `commentCount`, medias y votos mediante subconsultas escalares. QueryBuilder. | Normalmente 3 sentencias con página: selección de IDs para `skip/take` con joins, hidratación de página y count. 6 joins en la hidratación principal (Artist/Country/Genre y las tres relaciones Community); los filtros de voto pueden sumar el join de Rate al count. | La respuesta conserva en el objeto Disc los arrays `rates`/`favorites`/`pendings`, pero contienen las filas del usuario de la petición, no las colecciones completas. No contiene `comments[]`; solo `commentCount`. `DiscList` y `DiscCardComponent` consumen `userRate`, `favoriteId`, `pendingId`, `commentCount`, `voteCount` y promedios; no se encontró lectura directa de esos arrays en esos componentes. | **Mantener como está.** Las colecciones ya están acotadas al usuario; convertirlas en proyecciones nuevas podría cambiar el JSON y no se midió un ahorro material. |
| `GET /discs/random` (`DiscCatalogService.findRandom`) | Primero selecciona IDs. En hidratación une `rates`, `favorites`, `pendings` filtrados por usuario; Comments solo como `commentCount`. QueryBuilder. | 2 consultas en total (IDs aleatorios + hidratación); 6 joins en la hidratación (Artist/Country/Genre + 3 Community). Las subconsultas de agregados están en esa misma sentencia. | Los arrays conservados contienen filas del usuario; no se carga `comments[]`. El consumer localizado es AdventureModule; comparte el shape de Disc usado por las cards. | **Mantener como está.** La selección no carga colecciones Community completas y no hay medida que justifique modificar la forma actual. |
| `GET /discs/homeDiscs` (`DiscHomeService`) | SQL directo: Rate agregado para ranking; joins a Favorite/Pending del usuario actual y subconsultas para IDs de favorito/pendiente, Rate personal y `commentCount`. | 6 sentencias del handler: una consulta de estadísticas globales, una principal, y cuatro consultas de totales/rankings/distribución. La consulta principal tiene joins a Rate/Favorite/Pending y joins de catálogo; ninguna relación se hidrata como colección. | Devuelve columnas proyectadas/derivadas, sin arrays Community. HomePage consume Rate personal, ID de Favorite/Pending, conteos y promedios. | **Mantener como está.** No hay carga de arrays Community; ya se envían los estados/agregados consumidos. |
| `GET /discs/date` autenticado (`DiscCalendarService.findAllByDate`) | QueryBuilder une Rate/Favorite/Pending con filtro del usuario y asignaciones; no carga Comments. | `getManyAndCount` suele ejecutar 3 sentencias por paginación con joins; si la página tiene discos, se añade 1 SELECT de NationalRelease (hasta 4). 9 joins totales declarados: Artist/Country/Genre, Rate, Asignation/User/List, Favorite y Pending. De ellos, 3 son Community. | Mapper conserva `rates[]`, `favorites[]`, `pendings[]` personales y `asignations[]`, además de `userRate`, `favoriteId`, `pendingId`; no serializa `comments[]`. DiscComponent consume el estado pendiente y los callers de calendario usan las proyecciones de Rate/favorito/pendiente; no se confirmó consumo directo de los arrays. | **Mantener como está.** Las relaciones Community están filtradas por usuario; payload derivado necesario para el calendario. Los arrays conservados son observables y no se cambia el contrato sin confirmar todos los callers. |
| `GET /discs/date/public` (`DiscCalendarService.findAllByDatePublic`) | No solicita Community; QueryBuilder selecciona Artist/Country/Genre. Eager no se aplica a QueryBuilder. | `getManyAndCount`: aproximadamente 2 sentencias con paginación; cero joins Community. | El mapper devuelve una proyección de catálogo sin campos/arrays Community. Es endpoint público de calendario. | **Mantener como está.** Sin carga Community. |
| `GET /discs/weekly` (`DiscCalendarService.findWeekly`) | QueryBuilder con selección parcial de Disc/Artist/Country/Genre. No solicita Community ni aplica eager. | 1 SELECT; cero joins Community. | Mapper devuelve campos de calendario semanales sin arrays Community. | **Mantener como está.** Sin carga Community. |
| `GET /discs/date/public/filters` | Queries QueryBuilder de Genre y Country enlazadas a Disc; no consultan tablas Community. | 2 SELECT; cero joins Community. | Solo filtros de catálogo. | **Mantener como está.** Sin carga Community. |
| `GET /discs/options` (`DiscCatalogService.findOptions`) | QueryBuilder de opciones escalares; solo une Country/Genre cuando el campo/filtro lo pide. No solicita Community ni aplica eager. | 1 SELECT; cero joins Community. | Valores escalares de filtro, sin arrays Community. | **Mantener como está.** Sin carga Community. |
| `POST /national-releases` desde Disc y `PATCH /national-releases/:id/link-disc` (`NationalReleasesService`) | Repository `findOne` con `relations: artist, genre`; además carga `Disc.favorites`, `pendings`, `comments` eager y sus Users. | 1 SELECT por Disc localizado; aproximadamente los mismos 9 joins que el detalle al cargar las tres colecciones y relaciones de catálogo. | La lógica usa `disc.ep`, nombre, link, artista y género; `createFromDisc`/`linkDisc` devuelven NationalRelease con el Disc asignado, por lo que sus arrays pueden formar parte del JSON observable. Consumer frontend específico de esos arrays no confirmado. | **Candidato a optimización posterior.** La lógica interna no necesita Community, pero el Disc anidado del response puede exponer los arrays y falta comprobar consumidores/JSON actual. |
| Import manual y Excel (detección de Disc duplicado) | Repository `findOne` de Disc sin relaciones explícitas; carga eager de Community y Artist/Genre según metadata. | 1 SELECT por fila que busca duplicado; la consulta suma los joins eager, incluidas las tres colecciones. Volumen total depende del número de filas procesadas. | El caller solo comprueba si el Disc existe; no serializa la entidad encontrada. El resultado observable del import es el informe de importación, no esas relaciones. | **Candidato a optimización posterior.** El consumer está confirmado y no usa las relaciones; falta cardinalidad real para demostrar materialidad. |
| `GET /artists/:id/details` (`ArtistDetailsService`) | Consulta Disc mediante QueryBuilder, con join explícito a Genre y agregados Rate. No carga Community ni aplica eager. | 3 SELECT para el handler: Artist, Disc y NationalRelease; las dos últimas se ejecutan en paralelo. Cero joins Community en la consulta de Disc. | Mapper proyecta Disc y omite relaciones Community. | **Mantener como está.** No hay carga Community de Disc. |

### Contract finding

**Current behavior:** `GET /api/discs/:id` serializa `favorites[]`, `pendings[]` y `comments[]` completos con sus Users mediante repository `findOne` y carga eager. No se halló caller frontend de esa ruta en el inventario consultado.

**Problem:** los tres joins de colección pueden multiplicar filas SQL entre sí; además el JSON crece con cada interacción. No hay datos de cardinalidad/bytes ni confirmación de consumidores externos para establecer el ahorro real o preservar el payload con carga selectiva.

**Impact:** backend + frontend si se reducen arrays del contrato; backend-only si se demuestra carga interna más selectiva con JSON idéntico.

**Options:**

1. Preserve compatibility and leave the relations as they are.
2. Refactor internally after confirming consumers and proving JSON equivalence.
3. Change the contract after an explicit decision.
4. Coordinate a backend/frontend refactor if consumers need a smaller projection.

**Recommendation:** preservar ahora. Medir cardinalidades/bytes con datos representativos y confirmar consumers externos antes de modificar eager o relaciones.

**Blocks the current task:** No. La evidencia estructural basta para decidir no optimizar en G.6; el caso queda como candidato posterior.

Los tests existentes ya fijan el payload completo de detalle, los valores derivados del listado/random, las proyecciones de Home y los campos de Calendar. Como no hubo cambio de producción, no se añadieron tests ni se ejecutaron suites de consumers. G.7 permanece pendiente y no se midió ni optimizó duplicación SQL general.

##### G.7 — Medir duplicación SQL antes de optimizar

- **Problema/evidencia:** subqueries AVG/COUNT repetidas y queries de count/filtros por pares en servicios; Catalog consulta las mismas tablas. Diferencias de filtros/forma y ningún límite de coste medido.
- **Impacto/tipo:** performance/deuda; listados Community y Catalog. Cambios SQL backend-only si equivalentes; proyecciones diferentes requieren FE/backend.
- **Alcance:** priorizar endpoints con uso/coste; capturar SQL y parámetros; EXPLAIN ANALYZE antes/después de alternativas candidatas; evaluar costo de escritura/almacenamiento de índices. Mantener filtro/orden/paginación/null/0.
- **Fuera de alcance:** índices intuitivos, query service genérico, abstracción por parecido o unificar filtros distintos (country UUID/nombre vs UUID).
- **Dependencias:** G.4 y G.6 para separar coste de query y carga de relaciones.
- **Criterios de aceptación:** baseline reproducible y decisión por consulta; cambio solo si demuestra mejora sin regresión semántica ni coste injustificado; puede cerrar sin cambio de producción.
- **Verificaciones:** EXPLAIN ANALYZE representativo antes/después si se cambia SQL; tests focalizados de equivalencia.
- **Tamaño:** M.

**Estado: completada (2026-10-05).** Se midieron consultas reales con SQL generado por TypeORM, parámetros de una cuenta Community de mayor actividad (ID omitido), `limit=10`, `offset=0` y sin filtros opcionales. La BD local contiene 7.180 Disc, 19.300 Rate, 1.699 Favorite, 5.202 Pending y 811 Comment. Los planes se capturaron con `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Las cifras son una muestra local con buffers compartidos calientes; no representan p95, concurrencia ni latencia de producción. En esa cuenta, las listas reportaron 329 Favorites, 2.605 Pendings, 5.864 Rates y 388 Comments.

Forma SQL generada en los dos conteos tras el cambio (parámetro `$1` omitido/redactado):

```sql
SELECT COUNT(DISTINCT("favorite"."id")) AS "cnt"
FROM "favorite" "favorite"
LEFT JOIN "disc" "disc" ON "disc"."id" = "favorite"."discId"
LEFT JOIN "artist" "artist" ON "artist"."id" = "disc"."artistId"
LEFT JOIN "country" "country" ON "country"."id" = "artist"."countryId"
LEFT JOIN "genre" "genre" ON "genre"."id" = "disc"."genreId"
WHERE "favorite"."userId" = $1;

SELECT COUNT(DISTINCT("rate"."id")) AS "cnt"
FROM "rate" "rate"
LEFT JOIN "disc" "disc" ON "disc"."id" = "rate"."discId"
LEFT JOIN "artist" "artist" ON "artist"."id" = "disc"."artistId"
LEFT JOIN "country" "country" ON "country"."id" = "artist"."countryId"
LEFT JOIN "genre" "genre" ON "genre"."id" = "disc"."genreId"
WHERE "rate"."userId" = $1;
```

La hidratación de listas Community y Catalog emite además subqueries `AVG(rate.rate)`, `AVG(rate.cover)`, `COUNT(rate.id)` y `COUNT(comment.id)` por Disc, con los filtros `rate.discId = disc.id` y los `IS NOT NULL` propios de cada servicio. Para los planes se usaron los parámetros reales en el proceso local; el UUID queda redactado en este registro.

| Consulta/caso | Patrón repetido / inventario | Evidencia y coste local | Diferencias semánticas y consumer | Decisión |
|---|---|---|---|---|
| `GET /api/favorites` — `FavoritesService.findAllByUser` | Query de página calcula `AVG(rate.rate)`, `AVG(rate.cover)`, `COUNT(rate.id)` para Rates con `rate IS NOT NULL` y `COUNT(comment.id)` por Disc. La query de total repetía filtros y además unía Rate y Pending del usuario, aunque no filtraba ni proyectaba el conteo con esas tablas. | 3 SELECT: selección de IDs, hidratación y total. Hidratación: 30–49 ms observados, hasta 8.193 buffers; 3 subqueries Rate y 1 Comment hacen Seq Scan por cada una de las 10 filas. Count original: 531 buffers, con Seq Scan de Rate y Pending. Quitando ambos joins, mismo total (329), 20 buffers y 0,26 ms en la captura candidata; SQL TypeORM posterior confirma total 329 y plan de 20 buffers/0,26 ms. | Consumers `DiscList` y `FavoritesService` frontend; salida sigue incluyendo `userFavorite`, estado Rate/Pending, medias y conteos. Los filtros de fecha, texto, género y país siguen usando Disc/Artist/Country/Genre en count. | **Optimización pequeña y demostrada.** Se eliminaron del query de total los joins Rate/Pending y los `addSelect` que solo servían a esos joins. La query de página y el JSON no cambian. |
| `GET /api/rates` — `RatesService.findAllByUser` | Query de página calcula AVG/COUNT de Rate y Comment por Disc, más estado personal de Favorite/Pending. La query de total también unía Favorite sin usarlo en filtros ni proyección del count. | 3 SELECT: selección de IDs, hidratación y total. Hidratación: 47 ms y 7.970 buffers en la muestra; tres Seq Scan correlacionados de Rate y uno Comment ×10. Count original: 471 buffers/5,54 ms, incluyendo scan Favorite; sin ese join conserva total 5.864 y baja a 251 buffers/2,33 ms en comparación; SQL TypeORM posterior genera el count sin Favorite y conserva total 5.864 (251 buffers; 3,95 ms en esa captura). | Consumers `DiscList`, `Dashboard`, `UserModal` y `Statistics`; el Rate listado sigue proyectando `favoriteId`, `pendingId`, medias, votos y comentario. Filtros `type`, fecha de lanzamiento, texto, género y país no usan Favorite. | **Optimización pequeña y demostrada.** Se quitó únicamente Favorite del query de total. Query de página y respuesta permanecen iguales. |
| `GET /api/pendings` — `PendingsService.findAllByUser` | Repite las cuatro subqueries de agregados del listado Favorites, carga Favorite del usuario para `favoriteId` y mantiene otro query para total con filtros replicados. | 3 SELECT. La hidratación midió 32–50 ms y hasta 8.158 buffers; subqueries de tres AVG/COUNT Rate y Comment hacen Seq Scan ×10. No hay plan alternativo medido. | Consumers `DiscList` y cards/calendarios; la raíz y la salida `userPending`/`favoriteId` difieren de Favorites. El count necesita los joins Disc/Artist/Country/Genre solo cuando se filtra por esos campos. | **Candidato a optimización futura.** La repetición física está demostrada, pero no se comparó una agregación por lote equivalente ni se justificó un rewrite. |
| `GET /api/comments` — `CommentsService.findAllByUser` | Una query carga página y relaciones Disc/Artist/Genre; otra replica exactamente los filtros para el total. No calcula agregados Community. | 3 SELECT con paginación TypeORM por joins. En la muestra: ID page 3,12 ms/1.388 buffers; hidratación 0,28 ms/88; count 0,27 ms/24. | Consumer `DiscList`; pagina por comentarios del usuario con `type`, release date, texto, género y `countryId`, y ordena releaseDate DESC / artist ASC. El count separado es necesario para `totalItems/pages`. | **Duplicación aceptable por contrato distinto.** Página y total son operaciones distintas y pequeñas en este plan; se mantienen los filtros explícitos. |
| `GET /api/comments/disc/:discId` — `CommentsService.findCommentsByDisc` | Valida primero Disc y después obtiene Comments/User/parent/Disc; no repite AVG/COUNT. | 2 lecturas de entidad; no se perfilaron como candidata de agregación. | `ComentsModal` consume el árbol de comentarios, replies, usuario y disco. La validación y la lista producen resultados diferentes. | **Mantener como está.** No hay agregación repetida demostrada. |
| `GET /api/discs` — `DiscCatalogService.findAll` | Query de Disc repite los AVG Rate, AVG Cover, COUNT de Rate válido y COUNT de Comments; patrones equivalentes a listas Community, con una proyección de estados del usuario actual. Query de total aparte. | 3 SELECT; hidratación 29–48 ms, 8.175 buffers. Plan: tres Seq Scan de Rate ×10 y Comment ×10; la query de IDs/count explora las relaciones para filtros de usuario cuando aplican. | `DiscList` consume personal state, agregados, voto y conteo; promedio/cover Catalog no filtra explícitamente NULL porque `AVG` ya los ignora y normaliza ausencias a `null`/`0` en mapper. | **Candidato a optimización futura.** El coste de scans correlacionados está demostrado, pero agrupar sin cambiar limit/order, fanout de joins o `null`/`0` exige una comparación específica. No se tocó `addSelect('disc.id', 'discId')`. |
| `GET /api/discs/random` — `DiscCatalogService.findRandom` | Repite las mismas cuatro subqueries que la hidratación de Disc list; añade una consulta anterior de IDs aleatorios. | Código confirma 2 SELECT totales; no se ejecutó EXPLAIN separado para esta ruta. | Primero elige IDs aleatorios y luego proyecta estado/medias/conteos; no comparte filtros ni orden de la lista paginada. | **Mantener como está.** Coincidencia de expresiones, sin plan/coste propio que justifique unificarla. |
| `GET /api/discs/homeDiscs` — `DiscHomeService` y loaders | Ranking une Rate para medias/votos y hace subqueries personales de Rate/Favorite/Pending y Comment por Disc. Estadísticas globales, totales, ranking de usuarios y distribución consultan Rate en SELECTs separados. | 6 SELECT. Ranking principal: 94–133 ms, 10.393 buffers; Seq Scan de Rate/Favorite/Pending/Comment ×20 en subqueries personales, además de agregación principal. La estadística global tuvo 15–20 ms/451 buffers; otros loaders también recorren Rate. | `HomePage` consume weighted score, Rate personal, favorite/pending IDs, conteos y estadísticas con rangos distintos (`statsDateRange`/`distributionDateRange`). Los outputs agrupados no son intercambiables. | **Candidato a optimización futura.** Scans reales demostrados; no se probaron formas agrupadas que preserven ranking y rangos independientes. |
| `GET /api/discs/date` autenticado — `DiscCalendarService` | Une Rate/Favorite/Pending del usuario para estado; sin subqueries AVG/COUNT de esas tablas. | QueryBuilder con página/count y SELECT adicional de NationalRelease cuando hay discos; no se capturó plan de esta operación en G.7. | `DiscComponent` consume personal state y asignaciones; la fecha/orden del calendario difieren de Catalog general. | **Mantener como está.** No se detectó agregación repetida candidata. |
| `GET /api/artists/:id/details`, búsqueda y management — servicios Artist Details/Search/Management | Repiten por Disc `COUNT(rate.id)` y `AVG(rate.rate)` con `rate IS NOT NULL`; todos devuelven una proyección acotada a campos de Disc/Artist. | Duplicación en código confirmada; no se ejecutaron planes para esas rutas. | Detalle por un Artist, búsqueda por conjunto de artistas y cola de management tienen filtros, límites y consumers distintos. | **Candidato a optimización futura.** La similitud SQL no demuestra mismo conjunto ni un coste material sin planes de esos parámetros. |
| `/api/rates/home-insights` y `/api/rates/stats` — `RatesStatsService` | AVG/COUNT Rate reaparecen por artista, país, género, fecha mensual/semanal, score, mediana y ranking. | Insights hace 2 queries; stats ejecuta 7 consultas (conteos/grupos, media/mediana, ranking y total de users). No se midieron planes de estas rutas en esta muestra. | Cada agregado tiene grouping/rango/semántica propia; `stats` cuenta Rate válida por usuario y año de release, mientras insights separa artista y país. | **Duplicación aceptable por contrato distinto.** No consolidar agregados de forma textual sin probar forma, filtros y nulls de cada respuesta. |
| `GET /api/rates/user/:userId/history` — `RatesHistoryService` | Query de candidatos y dos conteos separados de acciones creadas/editadas. | 3 consultas; no se capturó EXPLAIN en este baseline. | `totalItems` cuenta eventos expandidos, no filas Rate; un registro puede contar como creación y edición. Se pagina sobre eventos ordenados en memoria. | **Duplicación aceptable por contrato distinto.** Los dos conteos son necesarios para el total observable de eventos. |

**Índices:** las tablas locales Rate/Comment/Favorite/Pending solo mostraron índice PK en `id`. Los scans correlacionados hacen relevante estudiar `rate("discId")` y `comment("discId")`, pero no se midió el plan con índice ni el coste de escritura/almacenamiento. No se creó ni se recomienda aplicar un índice sin esa comparación. Una agregación agrupada puede ser alternativa, también pendiente de EXPLAIN antes/después.

**Alcance de medición:** se capturó SQL TypeORM real y planes para Favorites, Pendings, Rates, Comments, Disc list y Home; no se imprimieron IDs ni valores de parámetros. La muestra fue una sola cuenta de alta actividad, primera página y sin filtros opcionales; los buffers fueron mayoritariamente cache hits. Los planes de Calendar, Random, Artist Details/Search/Management y Rates stats/history quedan como estimación estructural. No hay latencias de producción ni pruebas con carga concurrente.

**Cambio y verificaciones:** se retiraron solo los joins no usados en las queries de total de Favorites y Rates. Las comparaciones de conteo antes/candidato/post conservan `totalItems` (329 y 5.864); payload de página, filtros, orden, paginación y `null`/`0` siguen fijados por las specs existentes. Las dos suites focalizadas pasan: 2 suites, 21 tests. Typecheck y `git diff --check` se ejecutan al cierre. No se añadieron índices, helpers ni capas compartidas.

**Cierre:** G.7 queda completada. La iteración de saneamiento G.1–G.7 queda cerrada; no se abre otra iteración ni se implementa trabajo posterior.

#### Bloque 6 — Desacoplamiento de mayor alcance (P3, aplazado)

Catalog consulta tablas/relaciones Community; Auth consume Rate por repositorio para actividad; Requests escribe Artist/Disc al aprobar. Son dependencias de entidad/esquema ya caracterizadas, no dependencia de servicios bidireccional. No se programa mover ownership, introducir ports/facades ni separar módulos: el beneficio no está demostrado y el riesgo/coste es alto. Reabrir únicamente vinculado a un cambio concreto que produzca menor acoplamiento o coste medible.

#### Dependencias y orden resumido

1. G.1 seguridad (M).
2. G.2 metadata condicional (S) y G.3 errores HTTP (S).
3. G.4 DTO/contratos (S).
4. G.5 history de Rates (M), caracterización antes de extraer.
5. G.6 eager/payloads (M) y G.7 SQL/performance (M), medir antes de cambios.
6. Acoplamientos Catalog/Auth quedan documentados, sin subtarea de refactor en esta iteración.

#### Verificación de cierre de saneamiento

- Suites focalizadas de autorización/ownership, status HTTP, contratos, metadata si cambia y Rates history; añadir consumers Catalog/Auth solo donde el cambio los afecte.
- Si se modifica SQL: comparar filtros, orden, paginación, null/0 y payload; planes representativos antes/después.
- Typecheck y `git diff --check` para archivos tocados; revisar rutas, guards, metadata, providers, imports y JSON observable.
- Regresión completa solo si el conjunto de cambios lo justifica. Mantener `DiscCatalogService` fuera de alcance salvo atribución directa.

### Cierre de Community (2026-10-05)

- La migración estructural de Community queda cerrada; la regresión backend está completada y sus resultados y límites constan en F.3.
- El saneamiento G.1–G.7 queda cerrado. G.7 cambió únicamente los joins redundantes de los conteos de Favorites/Rates y añadió sus aserciones; no cambió payloads, filtros, orden, paginación, autorización ni metadata.
- La regresión manual frontend de Comments, Favorites, Pendings y Rates/History está completada sin incidencias.
- No quedan subtareas pendientes de Community en este roadmap. Los desacoplamientos Catalog ↔ Community y Auth → Rate siguen aplazados y no forman parte de trabajo pendiente de esta iteración.
