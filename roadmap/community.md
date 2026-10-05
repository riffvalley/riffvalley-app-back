# Roadmap de Community

Este documento contiene la iteración planificada de Community extraída del índice maestro. Su contenido y estado no implican que se haya ejecutado ninguna subtarea.

### Iteración — Community

**Objetivo:** preparar y ejecutar en el futuro la migración estructural de `comments`, `requests`, `favorites`, `pendings` y `rates` bajo `src/community/`, preservando su comportamiento y sus contratos actuales. El ownership agrupa capacidades mediante las que los usuarios interactúan con, expresan estado sobre o contribuyen al catálogo.

**Estructura objetivo (solo planificación):**

```text
src/community/
  comments/
  requests/
  favorites/
  pendings/
  rates/
```

No crear esta estructura ni ejecutar ninguna subtarea al incorporar esta iteración al roadmap.

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
- [x] **Completada (2026-10-05).** Resolución Nest, repositorios Catalog, guards/Auth, rutas y aislamiento de `access-requests` verificados; D.1 permanece pendiente.

#### D — Favorites y Pendings

##### D.1 — Migrar Favorites a Community

- **Objetivo:** caracterizar Favorites y mover posteriormente su módulo a `src/community/favorites/` como capacidad independiente.
- **Alcance:** fijar las operaciones, contratos y consumers de Favorites; mover implementación y tests propios; actualizar imports, providers y composición necesarios.
- **Fuera de alcance:** combinar lógica con Pendings o Rates, cambiar consultas, relaciones, eager/cascadas o payloads.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** Favorites queda bajo Community como módulo/capacidad independiente; rutas, respuestas, permisos, side effects y referencias caracterizadas permanecen iguales.
- **Verificaciones previstas:** specs de Favorites; revisión de imports y DI; pruebas de consumers aplicables; build TypeScript.
- **Tamaño estimado:** M.

##### D.2 — Migrar Pendings a Community

- **Objetivo:** caracterizar Pendings y mover posteriormente su módulo a `src/community/pendings/` como capacidad independiente.
- **Alcance:** fijar las operaciones, contratos y consumers de Pendings; mover implementación y tests propios; actualizar imports, providers y composición necesarios.
- **Fuera de alcance:** unificarlo con Favorites o Rates, corregir la relación inversa sospechosa de `Pending.user`, cambiar queries, relaciones, eager/cascadas o payloads.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** Pendings queda bajo Community como capacidad independiente; su metadata permanece intacta, incluido el hallazgo preexistente de `Pending.user`; rutas, permisos, respuestas y efectos caracterizados se preservan.
- **Verificaciones previstas:** specs de Pendings; revisión de imports y DI; suites de consumers aplicables; confirmar que no hay cambios de metadata TypeORM; build.
- **Tamaño estimado:** M.

##### D.3 — Verificar consultas y consumidores cruzados

- **Objetivo:** comprobar la integración de Favorites y Pendings con Catalog y otros consumers después de ambos movimientos.
- **Alcance:** revisar consultas existentes sin optimizarlas, cargas actuales de relaciones, resolución de repositorios y callers cruzados que consumen Favorite/Pending o sus IDs/colecciones.
- **Fuera de alcance:** reescribir QueryBuilders, cambiar forma de carga, quitar eager o cambiar los campos devueltos.
- **Dependencias:** D.1 y D.2.
- **Criterios de aceptación:** consumers conocidos mantienen datos y semántica actuales; no hay cambios de SQL intencionales ni de metadata; las capacidades siguen separadas.
- **Verificaciones previstas:** suites focalizadas y consumers aplicables; comparación de respuestas caracterizadas; revisión de consultas/metadatos para detectar cambios accidentales; build.
- **Tamaño estimado:** M.

#### E — Rates

##### E.1 — Migrar Rates a Community

- **Objetivo:** caracterizar Rates y mover posteriormente su capacidad a `src/community/rates/`.
- **Alcance:** fijar operaciones, contratos, permisos, reglas de rate y consumers; mover módulo, implementación y tests propios; actualizar imports, providers y composición requeridos.
- **Fuera de alcance:** combinar Rates con Favorites/Pendings, cambiar cálculos, consultas, metadata TypeORM o payloads.
- **Dependencias:** A.1 y A.2.
- **Criterios de aceptación:** Rates queda bajo Community como capacidad independiente; rutas, respuestas, orden, errores, permisos y side effects caracterizados no cambian.
- **Verificaciones previstas:** specs de Rates y consumers directos; inspección de DI y repositorios; build TypeScript.
- **Tamaño estimado:** M.

##### E.2 — Verificar consumidores de Catalog y Auth

- **Objetivo:** comprobar los puntos de integración de Rates con Catalog y Auth tras el movimiento.
- **Alcance:** consumidores que agregan o muestran rates en Catalog, reglas que usan el usuario autenticado y dependencias de módulos/repositorios actuales.
- **Fuera de alcance:** cambiar cálculos agregados, autenticación, autorización, relaciones o contrato.
- **Dependencias:** E.1.
- **Criterios de aceptación:** Catalog y Auth siguen resolviendo las dependencias necesarias; datos y reglas visibles a consumidores permanecen iguales; no se introducen abstracciones compartidas con Favorites/Pendings.
- **Verificaciones previstas:** suites focalizadas de Rates, Catalog y Auth aplicables; revisión de DI/imports y build.
- **Tamaño estimado:** S.

#### F — Composición y regresión final

##### F.1 — Normalizar imports y composición futura

- **Objetivo:** cerrar los paths e imports de las cinco capacidades y decidir la composición mínima necesaria.
- **Alcance:** corregir referencias a ubicaciones anteriores y revisar `AppModule` y módulos consumidores; añadir un `CommunityModule` raíz solo si simplifica composición y se limita a importar/exportar módulos existentes.
- **Fuera de alcance:** introducir un módulo raíz por obligación estética, cambiar ownership de entidades externas, crear barrels genéricos o alterar dependencias funcionales.
- **Dependencias:** B.2, C.2, D.3 y E.2.
- **Criterios de aceptación:** no quedan imports activos hacia las ubicaciones anteriores; cada capability se compone una vez y mantiene su independencia; cualquier `CommunityModule` es opcional y solo de composición.
- **Verificaciones previstas:** búsquedas de imports legacy; revisión de módulos Nest y posibles ciclos/duplicidades DI; build.
- **Tamaño estimado:** S.

##### F.2 — Verificar límites arquitectónicos

- **Objetivo:** confirmar que el resultado corresponde al ownership acordado sin extender el alcance.
- **Alcance:** comprobar carpetas objetivo, independencia de Rates/Favorites/Pendings, ownership sin cambios de User/Disc/Genre/Country y exclusión de access-requests, suggestions, national-releases y capacidades editoriales.
- **Fuera de alcance:** migrar capacidades excluidas o resolver hallazgos documentados.
- **Dependencias:** F.1.
- **Criterios de aceptación:** los límites están satisfechos; no se añadieron abstracciones compartidas sin reutilización real; `Pending.user` y otros hallazgos fuera de alcance permanecen sin modificación y reportados.
- **Verificaciones previstas:** inspección de estructura, imports, metadata TypeORM y diff de producción; confirmar ausencia de cambios no planificados en contratos.
- **Tamaño estimado:** S.

##### F.3 — Regresión final de Community

- **Objetivo:** demostrar que la iteración completa preserva el comportamiento observable y la integración.
- **Alcance:** regresión focalizada de las cinco capacidades y de consumers backend relevantes en Catalog/Auth; compilación; revisión final de rutas, contratos, DI, entidades y cambios.
- **Fuera de alcance:** arreglar fallos preexistentes o contractuales ajenos a una regresión atribuible a una subtarea.
- **Dependencias:** F.1 y F.2.
- **Criterios de aceptación:** regresión y build aprobados; contratos, permisos, respuestas y side effects caracterizados se preservan; fallos heredados se atribuyen y reportan; los únicos cambios son los necesarios para el movimiento estructural y sus pruebas.
- **Verificaciones previstas:** suites de Comments, Requests, Favorites, Pendings y Rates; suites disponibles de consumidores Catalog/Auth; `pnpm build`; `git diff --check`; revisión de imports antiguos y del diff.
- **Tamaño estimado:** M.

## Post-migración — Evaluación de saneamiento de Community

**Estado:** pendiente; trabajo posterior a la iteración de migración estructural.

- **Dependencia:** completar F.3 — Regresión final de Community.
- **Límite temporal:** no ejecutar esta evaluación antes de terminar la migración estructural completa.
- **Objetivo:** revisar los hallazgos acumulados durante A–F y decidir, con evidencia de comportamiento, impacto y consumers, cuáles justifican una iteración posterior de saneamiento o refactor.
- **Fuera de la migración actual:** esta evaluación no forma parte de B–F ni autoriza cambios durante la migración. No presupone eliminar eager, modificar endpoints o contratos, dividir `RatesService`, crear servicios compartidos ni cambiar metadata TypeORM.
- **Backlog inicial a evaluar:** autenticación y autorización, incluidos endpoints por ID actualmente sin `@Auth()`; manejo de errores y casos 404/500; DTOs y formas de respuesta; metadata y relaciones TypeORM, incluido el hallazgo preexistente de `Pending.user`; uso de relaciones eager y payloads cargados desde `Disc`; queries, joins, subqueries y SQL duplicado entre Rates/Favorites/Pendings/Comments; responsabilidades y tamaño de `RatesService`; abstracciones compartidas solo si se demuestra reutilización real; acoplamiento Catalog ↔ Community y dependencia Auth → Rate; oportunidades de reducir coste de consultas sin cambios accidentales de contrato; y otros hallazgos relevantes que aparezcan durante B–F.
- **Criterio de decisión:** cada opción se evaluará según evidencia, impacto, consumers y dependencias. El backlog no representa decisiones tomadas ni una obligación de cambiar el comportamiento actual.
- **Resultado esperado:** inventario de deuda y hallazgos aún vigentes tras la migración; prioridad e impacto; clasificación como bug, seguridad, deuda técnica, performance o mejora arquitectónica; dependencias y consumers afectados; propuesta de qué merece una iteración posterior; y, solo si se decide actuar, división de ese trabajo en subtareas pequeñas.
- **Fuera de alcance de esta evaluación:** diseñar ahora las subtareas de saneamiento o ejecutar cualquiera de los cambios propuestos.
