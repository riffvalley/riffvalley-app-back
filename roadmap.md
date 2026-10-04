# Backend Refactor Roadmap

## Objetivos

Refactorizar progresivamente el backend de Riff Valley para mejorar su mantenibilidad, aplicar SOLID con pragmatismo, reducir duplicación y coste de consultas y evitar cargas de datos innecesarias, preservando el comportamiento actual.

La primera fase usa Discs como piloto. La inspección inicial encontró un servicio de 1.235 líneas, consultas SQL y QueryBuilder mezcladas, mapeos de respuesta repetidos y relaciones eager en Disc. El `DiscsService` actual ha crecido hasta unas 1.258 líneas y mantiene responsabilidades funcionales distintas en el mismo servicio. No se encontraron pruebas específicas de Discs antes de D0. Las tareas siguen pendientes hasta que exista evidencia para cerrarlas.

## Principios de trabajo

- Dividir el trabajo en subtareas pequeñas, revisables y reversibles.
- Preferir una tarea por endpoint o por responsabilidad concreta; dividir los endpoints grandes.
- Caracterizar primero la respuesta y el comportamiento que ya consume el frontend.
- No agrupar refactor, cambio de contrato y cambio de esquema en una misma tarea.
- Cada tarea debe incluir sus propias comprobaciones y poder cerrarse de forma independiente.
- La fase de Discs es un refactor interno: no requiere cambios ni integraciones nuevas del frontend.
- Si aparece un problema ajeno al alcance, anotarlo como candidato y no resolverlo automáticamente salvo que bloquee el trabajo actual.
- Antes de cambiar consultas, comparar sus filtros, resultado, orden, valores nulos y casos límite con la caracterización existente.

## Reglas arquitectónicas

- Mantener los módulos clásicos de NestJS: controller, service, module, DTOs y entities.
- Priorizar SRP sin convertir cada método o endpoint en una clase.
- Se permiten servicios auxiliares clásicos de NestJS dentro del mismo módulo cuando separen una responsabilidad funcional cohesionada y reduzcan de forma real la complejidad del servicio principal.
- No introducir DDD por capas, arquitectura hexagonal, CQRS, use cases, puertos/adaptadores, repositorios abstractos genéricos ni interfaces sin necesidad concreta.
- No introducir use cases por operación, command/query buses, Redis ni capas nuevas por razones estéticas.
- No extraer clases únicamente porque un archivo sea grande; el tamaño es una señal para revisar responsabilidades, no criterio suficiente para extraer.
- Mantener la inyección de dependencias de NestJS y TypeORM existentes salvo que una tarea concreta justifique otra cosa.
- Aplicar SOLID pragmáticamente: priorizar SRP, reducir duplicación, aclarar dependencias y mantener métodos comprensibles y responsabilidades cohesionadas.

### Arquitectura objetivo provisional para Discs

Mantener la estructura clásica del módulo: `discs.controller.ts`, `discs.service.ts` y `discs.module.ts` en la raíz, con `dto/` y `entities/` compartidos cuando se usan desde varias responsabilidades. La raíz `__tests__/` contiene únicamente specs de esos archivos principales y documentación/baseline de la fachada. Cada responsabilidad funcional extraída tiene su propia carpeta, con el servicio, su spec y helpers/constantes exclusivos juntos. No crear `shared/` hasta que exista reutilización real entre al menos dos responsabilidades.

La división inicial de responsabilidades es orientativa y podrá ajustarse al inspeccionar el código durante cada extracción:

- **DiscCatalogService:** `findAll`, `findRandom`, `findOptions` y lógica compartida de filtros/mapping únicamente cuando realmente aplique.
- **DiscCalendarService:** `findAllByDate`, `findAllByDatePublic`, `findWeekly`, `getFridayWeekRanges` y `findWeeklyWithoutImage`.
- **DiscHomeService:** `findTopRatedOrFeaturedAndStats` y estadísticas relacionadas con Home.
- **DiscWriteService:** `create`, `createWithArtist`, `resolveArtist`, `update`, `remove` y `updateImage`.
- **DiscSpotifyService:** `getSpotifyTracks`, `resolveSpotifyAlbum` y `getSpotifyAlbumDetails`.

Por defecto, conservar `DiscsService` como fachada/coordinador en la raíz para mantener su API pública interna, preservar controllers y callers, y delegar las responsabilidades a los servicios auxiliares en sus carpetas funcionales. Cambiar controllers o callers solo si existe una razón concreta. Los servicios auxiliares pueden inyectar directamente los repositorios y dependencias que necesitan; no centralizar todas las dependencias en la fachada para pasarlas después como parámetros.

Hacer extracciones incrementales después de estabilizar y caracterizar cada bloque. Una extracción debe mover lógica, no copiarla; actualizar los providers/DI de `DiscModule`; preservar exactamente el contrato y el comportamiento; reutilizar los tests actuales como red de seguridad y añadir o mover pruebas focalizadas cuando aporte claridad. Evitar duplicar expectativas idénticas. No mezclar una extracción con optimizaciones nuevas ni extraer código inestable solo para reducir líneas.

La extracción es estructural: no cambia rutas, DTOs públicos, payloads, filtros, ordenaciones, permisos, paginación, semántica ni frontend. Toda rareza contractual sigue las reglas de hallazgos y compatibilidad de este roadmap y de `AGENTS.md`.

## Reglas de rendimiento

- Evitar eager: true salvo justificación clara.
- Cargar únicamente las relaciones que necesita cada operación.
- Evitar N+1; preferir cargas por lote cuando correspondan.
- Revisar los SELECT * implícitos y limitar columnas solo si el contrato de salida queda preservado.
- Reducir joins innecesarios, especialmente sobre relaciones de colección.
- Evitar duplicar filtros entre queries de datos y de count; demostrar que ambas aplican exactamente los mismos filtros.
- Revisar el coste y la semántica de counts y paginación con joins.
- Justificar cada índice con una query concreta y evidencia de su plan/coste.
- No añadir caché como solución automática.
- Usar EXPLAIN ANALYZE cuando una optimización SQL no pueda demostrarse solo leyendo el código.
- No cambiar una query solo porque sea larga ni sustituir QueryBuilder por SQL raw —o al revés— por preferencia.
- No hacer microoptimizaciones que reduzcan la legibilidad sin evidencia razonable.
- Si el rendimiento no puede determinarse leyendo el código, formular una hipótesis, medir y optimizar solo con evidencia.
- Si durante D1–D38 aparece un candidato a índice, registrarlo con la query concreta y el filtro, join u orden que podría beneficiar, pero no crearlo. D45 reúne y contrasta los candidatos; D46 es la única tarea que puede añadirlos.

## Compatibilidad

Durante todo el roadmap de Discs preservar el contrato observable por frontend y callers: rutas, métodos HTTP, request DTOs públicos, nombres de campos, presencia o ausencia de campos, null frente a campo ausente, tipos, arrays vacíos, envelopes, filtros y su semántica, ordenaciones, paginación, permisos, códigos HTTP, errores, semántica y límites de fechas y relaciones actualmente visibles.

No crear /v2, endpoints alternativos, contratos paralelos ni nuevas integraciones del frontend para facilitar el refactor.

Flujo esperado: **API actual → caracterización → refactor interno → misma API → consumidores sin cambios**.

Si una mejora razonable requiere cambiar el contrato, no realizarla dentro de la tarea actual. Documentarla y, si merece la pena, añadir una tarea contractual independiente que incluya la adaptación de consumidores/frontend.

## Hallazgos contractuales e integración frontend/backend

Las subtareas preservan los contratos actuales por defecto. Una rareza contractual o ineficiencia causada por la integración no se corrige automáticamente ni se fuerza mediante una solución interna artificial: reportar el comportamiento y el coste, identificar consumidores e impacto, y decidir antes de cambiar backend o frontend.

Las opciones son mantener compatibilidad, aceptar deuda temporal, crear una tarea contractual independiente o acordar un refactor coordinado backend/frontend con una mejora concreta. No crear versiones nuevas de API, endpoints alternativos, migraciones contractuales, adaptaciones frontend ni tareas cross-repository sin una decisión explícita. Detectar un hallazgo no obliga a crear una tarea; primero evaluar su relevancia, documentar los menores cuando sea útil y añadir trabajo futuro solo si hay una mejora concreta que justifique el coste.

Si preservar el contrato obliga a mantener una solución claramente ineficiente, compleja o incoherente, reportarlo en vez de construir una solución artificial. No ampliar la subtarea: por ejemplo, un problema frontend descubierto durante D3 no autoriza a editar el frontend, cambiar otro endpoint ni abrir por sí solo un cambio contractual. Continuar con D3 si es posible sin decidir el hallazgo; si bloquea una implementación segura, dejarlo explícito y esperar una decisión antes del cambio dependiente.

Para D39–D44, si una relación eager se carga por historia, aparece en la respuesta aunque parezca ajena al endpoint, obliga a cargar una colección completa o podría sustituirse por favoriteId, pendingId, commentCount u otra proyección, reportar primero su coste, consumidores, alternativa e impacto frontend. No rediseñar el contrato automáticamente. Hasta una decisión explícita, mantener compatibilidad y aplicar la clasificación y secuencia de eager descritas abajo.

## Caracterización de contratos

Build o typecheck por sí solos no demuestran compatibilidad. En cada subtarea que pueda afectar comportamiento, caracterizar el contrato pertinente antes y después: shape completo de respuesta, nombres y presencia de campos, null frente a ausencia, 0 frente a null, arrays vacíos, relaciones incluidas, orden observable, filtros, paginación, códigos HTTP, errores, permisos, fechas y límites temporales. No todos los puntos aplican a todos los endpoints; cada tarea debe cubrir los que sí pueden verse afectados.

D0 monta únicamente el arnés mínimo y los fixtures/utilidades base. No debe convertirse en una prueba exhaustiva de endpoints: la caracterización concreta se añade progresivamente en D1–D38 junto al comportamiento que cada tarea toque.

## Política de eager loading

Los eager: true existentes pueden formar parte del contrato implícito que consume el frontend o un caller interno. No quitar primero un eager para después observar qué se rompe, inferir que una relación no se usa solo porque el endpoint no debería necesitarla ni eliminar campos de response como efecto de una optimización.

Para cada relación, clasificar consumidores en D39:

- **REQUERIDA:** el frontend o un caller interno consume actualmente la relación. Debe seguir disponible; antes de retirar el eager, las queries necesarias deben cargarla explícitamente.
- **OBSERVABLE PERO NO CONFIRMADA:** la relación aparece actualmente en la respuesta, pero no se ha confirmado si algún consumidor depende de ella. Mantenerla y no retirar el eager hasta verificar esos consumidores. Si no se puede verificar el frontend/caller, conservar el comportamiento.
- **NO CONSUMIDA:** se ha comprobado que ningún consumidor conocido depende de la relación. No eliminarla silenciosamente durante un refactor; si retirarla cambia el payload observable, documentarla como candidata a una futura tarea contractual.

Secuencia obligatoria para retirar cualquier eager: identificar consumidores; caracterizar el payload actual; precisar endpoints/callers que necesitan la relación; añadir y probar carga explícita donde haga falta; comprobar que las responses no cambian; solo entonces retirar eager: true; ejecutar regresión de backend y consumidores aplicables. Nunca retirar eager para descubrir después qué se rompe.

Mantener especialmente controladas las colecciones Disc.favorites, Disc.pendings y Disc.comments. Si un endpoint solo necesita favoriteId o pendingId del usuario, o commentCount, no cargar colecciones completas únicamente porque antes fueran eager; aplicar la optimización solo si se preserva el contrato actual o existe una tarea contractual explícita.

## Cierre sin cambios de producción

Una subtarea puede cerrarse correctamente sin modificar código de producción. Son resultados válidos añadir solo pruebas de caracterización, demostrar que una query ya es adecuada, concluir que una extracción no aporta claridad, demostrar que no existe una mejora medible, decidir no añadir un índice o mantener la implementación porque la alternativa aumenta complejidad. No cambiar código solo para que una subtarea “haga algo”.

## Regla de alcance

Si durante una subtarea aparecen problemas en otros módulos, anotarlos como candidato en la fase correspondiente. No resolverlos automáticamente salvo que bloqueen la tarea actual; dejar escrito el motivo del bloqueo y el cambio mínimo necesario.

## Impeccable

Si Impeccable detecta hallazgos preexistentes, de atribución desconocida o fuera del alcance, no corregirlos, no suprimirlos, no modificar .impeccable/config.json y no cambiar estilos o comportamiento para satisfacer el hook. Corregir únicamente hallazgos demostrablemente introducidos por la tarea actual.

## Verificaciones generales

- Ejecutar pruebas focalizadas del servicio/controller afectado y conservar pruebas de regresión de contratos.
- Antes de cerrar una fase, ejecutar las pruebas relacionadas y el build: <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>, <code>pnpm exec jest src/discs/__tests__/discs.controller.spec.ts --runInBand</code> cuando aplique, y <code>pnpm build</code>.
- Ejecutar pruebas e2e de Discs si se incorporan o existen casos aplicables: <code>pnpm run test:e2e -- --runInBand</code>.
- En cambios SQL de rendimiento, comparar planes con parámetros y datos representativos usando EXPLAIN ANALYZE; no inferir que un índice ayuda sin revisar el plan.
- En tareas de migración, revisar el SQL generado, el método down y la compatibilidad con datos existentes antes de ejecutar la migración en un entorno de prueba.
- Actualmente no existen archivos de prueba de Discs. D0 debe crear la base de caracterización antes de que una tarea cambie consultas o mapeos. Los comandos de las subtareas posteriores se refieren a esa suite cuando esté creada.

## Fase 1 — Discs

Alcance inspeccionado: src/discs/discs.controller.ts, src/discs/discs.service.ts, src/discs/discs.module.ts, seis DTOs del módulo, Disc y entidades relacionadas Artist, Genre, Rate, Favorite, Pending, Comment y Asignation; llamadas directas a LastFM; y migraciones que afectan Disc o sus relaciones. La ruta de migraciones revisada incluye debut, pinned, cascada Artist → Disc y la referencia desde National Release. No hay índices dedicados a las consultas de Disc detectados en las migraciones.

### D0 — Baseline y caracterización

- [x] Completada
- **Objetivo:** establecer evidencia del comportamiento actual antes de tocar consultas, respuestas o permisos.
- **Alcance:** arnés mínimo de pruebas de controller/service, inventario de rutas y decoradores de permisos, defaults DTO relevantes e inventario de migraciones; cada endpoint se caracteriza en su propia subtarea.
- **Fuera de alcance:** refactor de producción, cambio de contrato, migraciones o optimizaciones.
- **Dependencias:** ninguna.
- **Criterios de finalización:** existen los archivos/fixtures base; rutas y permisos actuales quedan registrados; se confirma que no hay pruebas de Discs previas; los casos específicos se cubren dentro de D1–D38.
- **Verificaciones:** <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>; revisar las rutas y decoradores de Auth en discs.controller.ts; <code>pnpm build</code>.
- **Riesgo:** S.
- **Nota de baseline (2026-10-02):** El repo usa Yarn 1.22.22. Los specs focalizados pasan; el `nest build` canónico no puede limpiar `dist/access-requests` (propiedad de `nobody`) y la compilación emitida en `/tmp` revela usos de `Express.Multer` sin tipo en cinco archivos preexistentes fuera de Discs. No se alteraron para cerrar D0.

### D1 — findAll: filtros

- [x] Completada
- **Objetivo:** hacer comprensible y verificable la aplicación de búsqueda, fechas, género, país y estado de voto sin alterar su semántica.
- **Alcance:** filtros de findAll en discs.service.ts y los casos de PaginationDto usados por ese endpoint; consistencia con la consulta de resultados y la de count.
- **Fuera de alcance:** joins de respuesta, agregados, orden y paginación.
- **Dependencias:** D0.
- **Criterios de finalización:** cada filtro mantiene el resultado actual; country/countryId conserva la resolución por UUID o nombre; voted y votedType mantienen sus valores admitidos y su comportamiento actual.
- **Verificaciones:** pruebas de filtros combinados y aislados en discs.service.spec.ts; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D2 — findAll: joins y datos seleccionados

- [x] Completada
- **Objetivo:** priorizar la eliminación de joins innecesarios, evitar relaciones sin consumidor y evitar duplicación de filas manteniendo queries comprensibles.
- **Alcance:** joins de Disc, Artist, Country y Genre en findAll; evaluar selección explícita de campos únicamente si tiene beneficio claro.
- **Fuera de alcance:** Rate/Favorite/Pending por usuario, agregados, formato final y otros endpoints.
- **Dependencias:** D0, D1.
- **Criterios de finalización:** cada join tiene un consumidor identificado; se preservan todos los campos HTTP actuales y no aparecen N+1 ni duplicación de filas. La selección parcial de entidades no es un objetivo: no adoptarla si produce entidades ambiguamente hidratadas, reconstrucción compleja o mapping menos mantenible; limitar columnas solo cuando el beneficio sea claro.
- **Verificaciones:** pruebas de respuesta completa y nulos; inspeccionar SQL generado y número de queries en fixture; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D3 — findAll: agregados

- [x] Completada
- **Objetivo:** aislar y hacer comprobables averageRate, averageCover, voteCount y commentCount.
- **Alcance:** subconsultas/agregados de rate y comment de findAll y su lectura desde el resultado raw.
- **Fuera de alcance:** estadísticas de homeDiscs, filtros de voted y cambios de fórmula.
- **Dependencias:** D0, D2.
- **Criterios de finalización:** se preserva exactamente la semántica de averageRate, averageCover, voteCount y commentCount, incluidos casos sin datos, decimales y null/0. Cada agregado tiene una única definición lógica en la consulta y no se duplica accidentalmente para distintos puntos del mapping; no se impone una estrategia física al optimizador.
- **Verificaciones:** pruebas con cero, uno y varios rates/comentarios y valores nulos; revisar SQL; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Candidato para D5:** al ordenar por `disc.averageRate`, una condición adicional repite `AVG(rate.rate)` para excluir medias nulas. No se modificó aquí; comparar con `EXPLAIN ANALYZE` y datos representativos al revisar la ordenación.

### D4 — findAll: estado del usuario

- [x] Completada
- **Objetivo:** cargar y exponer el rate, favoriteId y pendingId del usuario autenticado sin multiplicar filas.
- **Alcance:** joins de rate/favorite/pending restringidos al usuario en findAll y sus campos derivados.
- **Fuera de alcance:** estadísticas globales, escritura de esas relaciones y otros listados.
- **Dependencias:** D0, D2.
- **Criterios de finalización:** usuario con y sin cada relación recibe los mismos valores actuales; una relación de usuario no duplica discos ni altera voteCount.
- **Verificaciones:** pruebas de combinaciones con y sin rate/favorite/pending; inspección de SQL y resultado raw; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Bloqueo resuelto por D4.1 (2026-10-02):** se conserva el resultado actual de los joins y se asocian los agregados raw por `disc.id`; las filas múltiples ya no desplazan los agregados de otro disco.

### D4.1 — findAll: estabilidad raw/entities con joins de usuario

- [x] Completada
- **Objetivo:** resolver únicamente el bloqueo detectado en D4 sobre la asociación entre `raw` y `entities` cuando los joins de `rates`, `favorites` o `pendings` producen varias filas.
- **Alcance:** confirmar el comportamiento de `getRawAndEntities()` con el patrón actual y asociar los agregados raw a cada entidad Disc mediante una clave estable del disco, si el problema se demuestra.
- **Fuera de alcance:** limpieza general de D7, cambios de joins, fórmulas, ordenación, paginación, eager loading o contrato.
- **Dependencias:** D4.
- **Criterios de finalización:** una regresión para dos discos, donde el primero produzca varias filas raw, demuestra que cada entidad recibe sus propios agregados; se conservan `rates`, `favorites`, `pendings`, `userRate`, `favoriteId`, `pendingId` y los agregados actuales. Si no se demuestra el desalineamiento, no se cambia producción y D4 permanece bloqueada.
- **Verificaciones:** specs focalizados de Discs y <code>git diff --check</code>.
- **Riesgo:** S.
- **Evidencia:** TypeORM 0.3 agrupa las entidades por clave primaria en `RawSqlResultsToEntityTransformer`, pero `getRawAndEntities()` devuelve el conjunto raw original sin agrupar. La regresión representa cuatro filas joined del primer disco seguidas por una del segundo; el mapeo posicional anterior asignaba al segundo disco los agregados de la segunda fila del primero.
- **Resultado:** se añadió `disc.id` como alias raw `discId` y se construyó el mapping por esa clave. D4 queda completada con la regresión de estado del usuario y agregados.

### D5 — findAll: ordenación

- [x] Completada
- **Objetivo:** ordenar de forma clara y segura por los campos permitidos, manteniendo el orden predeterminado.
- **Alcance:** parsing de orderBy, allowlist de campos y dirección, incluyendo disc.averageRate.
- **Fuera de alcance:** filtros, agregados y paginación.
- **Dependencias:** D0, D1.
- **Criterios de finalización:** se preservan los campos y el orden por defecto observados; entradas no admitidas no introducen SQL ni cambian silenciosamente la selección de discos; queda cubierto el desempate si ya es observable.
- **Verificaciones:** pruebas por campo, dirección, varios criterios y entrada inválida; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Resultado (2026-10-02):** caracterizados los cinco campos permitidos (`disc.releaseDate`, `artist.name`, `disc.createdAt`, `disc.name`, `disc.averageRate`), sus alias SQL, ASC/DESC, prioridad de criterios múltiples, campos desconocidos y criterios incompletos. El default se conserva exactamente como `disc.releaseDate DESC, artist.name ASC`, sin desempate adicional. Los fragmentos desconocidos/incompletos se ignoran; las direcciones se pasan en mayúsculas a TypeORM, que rechaza las que no sean ASC/DESC.
- **`averageRate`:** se conserva el filtro que excluye discos sin media cuando se solicita este orden. Si el criterio se repite, su predicado `AVG` se añade una vez, aunque ambos criterios de orden se preservan. La consulta sigue expresando la media en el SELECT y en el predicado; evaluar si PostgreSQL evita/repite el cálculo requiere plan representativo. Candidato para la revisión integral posterior a D7: medir esa query con `EXPLAIN ANALYZE` antes de cambiar la forma de calcular/filtrar la media.
- **Hallazgo contractual:** ordenar por `disc.averageRate` excluye discos sin votos, mientras que ordenar por otros campos los conserva; es un efecto observable del filtro agregado al orden.

### Contract finding

**Current behavior:** `orderBy=disc.averageRate:...` añade `AVG(rate.rate) IS NOT NULL`; el resto de ordenaciones no elimina discos sin media.

**Problem:** el selector de ordenación también altera qué discos aparecen, no solo su posición. El resultado puede variar en cantidad/contenido entre campos de orden.

**Impact:** Backend-only.

**Options:**

1. Preserve compatibility.
2. Refactor internally.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** preservar la semántica existente durante D5. Si se decide que ordenar por media debe conservar discos sin votos, tratarlo como cambio contractual independiente.

**Blocks the current task:** No; la exclusión se preserva y queda caracterizada.

### D6 — findAll: paginación y count

- [x] Completada
- **Objetivo:** asegurar que la página y totalItems reflejan los mismos filtros sin contar relaciones de usuario como discos adicionales.
- **Alcance:** take/skip, consulta totalItems, totalPages/currentPage y límites por defecto.
- **Fuera de alcance:** cambio de convención de paginación o de contrato.
- **Dependencias:** D0, D1.
- **Criterios de finalización:** límites, offset, páginas vacías y filtros combinados coinciden con baseline; el count no incluye el límite de página y no cambia por joins de colección.
- **Verificaciones:** pruebas de página inicial/final/vacía y total exacto; comparar SQL de datos y count; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Caracterización (2026-10-02):** se prueban defaults `limit=10`, `offset=0`, `take/skip`, primera/intermedia/última página, página vacía y las fórmulas actuales: `totalPages = ceil(totalItems / limit)` y `currentPage = floor(offset / limit) + 1`. Para filtros D1, la query principal y la de count reciben el mismo conjunto; la query de count no recibe límite, offset ni ordenación. TypeORM 0.3 usa `COUNT(DISTINCT disc.id)` para PostgreSQL cuando hay joins y su count ignora limit/offset/skip/take. No se justifica un cambio de producción en la ruta normal.
- **Relaciones joined:** el count conserva únicamente los joins de artista/país y rate necesarios para filtros; no une favorites, pendings ni comments. La prueba incluye múltiples filas raw por disco y comprueba que `totalItems` procede del count de entidades, no del tamaño de la página ni de las filas raw.
- **Resolución D6.2:** al ordenar por `disc.averageRate`, la misma condición de existencia de media se aplica una vez a la query de datos y a la de count. Se preserva la pertenencia actual de `data`; `totalItems` cuenta ese mismo conjunto.

### Contract finding

**Current behavior:** `PaginationDto.offset` convierte el valor a número pero no restringe enteros ni valores no negativos. `limit` debe ser positivo, pero no tiene máximo. Para offsets más allá del final, `currentPage` sigue la fórmula del offset y puede superar `totalPages`; un conjunto vacío desde el inicio produce `totalPages=0`, `currentPage=1`.

**Problem:** offsets negativos/fraccionarios y límites arbitrariamente grandes llegan al servicio/QueryBuilder; además, una página fuera de rango puede informar una página actual mayor que el total. No se ha caracterizado aquí el error SQL concreto para offsets inválidos.

**Impact:** Backend-only.

**Options:**

1. Preserve compatibility.
2. Refactor internally.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** preservar la conversión y las fórmulas actuales; cualquier validación/clamp requiere una tarea contractual separada con callers.

**Blocks the current task:** No; D6 conserva la semántica de paginación y cuenta el mismo conjunto que lista, incluido el caso de orden por `averageRate`.

### D6.1 — findAll: semántica de averageRate y paginación

- [x] Análisis completado y decisión registrada
- **Objetivo:** decidir si ordenar por `averageRate` es una ordenación pura o si además filtra discos sin media, y alinear conceptualmente la paginación/count con esa semántica.
- **Alcance:** consumidores frontend de `GET /discs`, uso de `orderBy`, `totalItems`/`totalPages`, texto y controles de valoración; callers backend; comparación de ordenación pura frente a ordenación con exclusión.
- **Fuera de alcance:** implementar cualquiera de las opciones o modificar el frontend.
- **Dependencias:** D5, D6.
- **Criterios de finalización:** existe evidencia de consumidores y del significado que comunica la UI; se comparan impacto y compatibilidad de las opciones A/B; la recomendación se somete a decisión antes de implementar.
- **Riesgo:** S.
- **Análisis (2026-10-02):** el único caller frontend que envía `disc.averageRate` es `DiscList.vue`, en las opciones llamadas “Nota” dentro de “Todos los discos”. La misma selección ofrece por separado “Discos sin votar”; no comunica que “Nota” signifique solo discos valorados. `DiscList` usa `totalItems` tanto para el contador visible “Todos los discos (N)” como para decidir si carga más; no consume `totalPages`. Otros callers de `getDiscs` usan el total para continuar carga/lotes o para seleccionar discos aleatorios y no pasan `orderBy=disc.averageRate`. En backend, `findAll` solo se expone desde `DiscsController`; no hay callers backend de servicio adicionales.
- **Opción A — ordenación pura:** incluir no valorados y ordenar con `NULLS LAST` explícito en ambos sentidos. Backend-only para los callers encontrados: `totalItems` ya cuenta ese conjunto y `DiscList` mantiene contador y carga incremental coherentes. Cambia el contrato de datos porque actualmente se excluyen los no valorados al elegir “Nota”; compatibilidad baja para callers que dependiesen de esa exclusión. Complejidad media por retirar el filtro y fijar nulos. Recomendación: preferida por coherencia con el texto/controles de UI y porque separar “ordenar” de “discos sin votar” evita exclusiones implícitas.
- **Opción B — ordenación con exclusión:** mantener la lista actual y añadir la condición de media al count. Backend-only para corregir `totalItems`; la carga incremental dejaría de recorrer el total de todos los discos. Cambia el contrato observable de `totalItems` al ordenar por Nota, aunque conserva la pertenencia actual de `data`. La UI seguiría mostrando el número bajo “Todos los discos”, ahora limitado a valorados; recomendaría una adaptación frontend coordinada para que el contador describa el subconjunto. Complejidad backend baja/media, frontend media si se aclara el contador.
- **Recomendación del análisis inicial:** opción A, por coherencia con el texto/controles de UI.
- **Decisión aprobada:** opción B, mantener la exclusión actual y alinear el count. La decisión prioriza no cambiar la pertenencia del listado; el cambio de `totalItems` se limita a reflejar el conjunto ya devuelto por la query de datos.
- **Estado:** decisión implementada en D6.2; D6 cerrada y D7 pendiente.

### D6.2 — findAll: alinear count con orden por averageRate

- [x] Completada
- **Objetivo:** hacer que `totalItems` cuente el mismo conjunto paginable que `data` cuando se ordena por `disc.averageRate`.
- **Alcance:** reutilizar la condición existente de media no nula en la query de count cuando el criterio válido `disc.averageRate` está activo.
- **Fuera de alcance:** cambios en filas listadas, ordenación, filtros D1, joins D2/D4, agregados D3, mapping D7, frontend o SQL adicional.
- **Dependencias:** D5, D6, decisión D6.1.
- **Criterios de finalización:** data y count tienen la misma condición de existencia de media; criterios repetidos no duplican el predicado; otros órdenes conservan el count actual.
- **Verificaciones:** caso `orderBy=disc.averageRate`, mismo conjunto filtrado para data/count y specs focalizados de Discs.
- **Riesgo:** S.
- **Resultado (2026-10-02):** la condición se define una vez y se aplica a ambos QueryBuilders cuando se procesa el primer criterio `disc.averageRate`. Se mantiene la subquery `AVG` existente; no se realizó optimización física.

### D7 — findAll: mapping de respuesta

- [x] Completada
- **Objetivo:** evitar que índices de raw y entities se desalineen y hacer explícita la adaptación a la respuesta HTTP vigente.
- **Alcance:** mapping de discs, artista/país, estado de usuario y agregados; helper local solo si expresa esta responsabilidad.
- **Fuera de alcance:** cambiar nombres, tipos o presencia de campos de respuesta.
- **Dependencias:** D2, D3, D4, D6.
- **Criterios de finalización:** payloads caracterizados coinciden incluidos null/0, relaciones vacías y campos de artista/país; el mapping no depende de coincidencia accidental de índices tras ordenar.
- **Verificaciones:** snapshots/expectativas explícitas de payload; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Resultado (2026-10-02):** se conserva el mapping de producción. La caracterización exacta cubre relaciones de artista/país/género, arrays vacíos y poblados, estado de usuario, agregados nulos/cero/no nulos, más de un Disc y filas raw repetidas por Disc. `discId` solo sirve para indexar raw por clave primaria y no aparece en el payload final. No queda ninguna asociación posicional entre raw y entities: D4.1 ya reemplazó el índice por `Map<discId, raw>` y la nueva expectativa exacta verifica la forma resultante. No se justifica extraer o simplificar el mapper.

### Contract finding

**Current behavior:** cada Disc devuelve las relaciones `rates`, `favorites` y `pendings` seleccionadas, además de `userRate`, `favoriteId` y `pendingId`. En los consumidores frontend inspeccionados, `DiscList` pasa a la tarjeta los campos derivados; no se encontró lectura directa de esos arrays en ese flujo.

**Problem:** el payload incluye datos de relaciones que se solapan con los campos derivados y puede ser más grande de lo necesario. La ausencia de lecturas en el flujo conocido no demuestra que otros callers dependan de ellos.

**Impact:** Backend + frontend.

**Options:**

1. Preserve compatibility.
2. Refactor internally.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** preservar arrays y mapping en D7. Clasificar consumidores en D39 antes de considerar un contrato reducido a `userRate`, `favoriteId` y `pendingId`; en la UI conocida esos campos ya bastan, pero no se ha completado la auditoría de todos los callers.

**Blocks the current task:** No; D7 caracteriza y preserva exactamente el payload actual.

### Contract finding

**Current behavior:** cuando `artist.country` es null, el mapping entrega `artist.country: { name: null }`.

**Problem:** la relación ausente queda representada por un objeto parcial en vez de `null`, una forma que puede ser confusa para consumidores.

**Impact:** Backend + frontend.

**Options:**

1. Preserve compatibility.
2. Refactor internally.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** preservar la forma en D7 y caracterizarla. Si se quiere normalizar a `null`, decidirlo en una tarea contractual independiente tras verificar consumidores.

**Blocks the current task:** No; la forma existente queda cubierta por la expectativa del payload.

### D7.1 — findAll: revisión integral de rendimiento

- [x] Completada
- **Objetivo:** revisar conjuntamente consultas, filtros, joins, agregados, estado del usuario, orden, paginación, mapping y payload de `findAll` antes de cerrar el endpoint.
- **Alcance:** medir planes representativos; optimizar solo comportamiento interno equivalente y claramente justificado.
- **Fuera de alcance:** cambios de contrato/frontend, eager loading, índices, caché, cambio de fórmulas o arquitectura, y D8.
- **Dependencias:** D1–D7.
- **Verificaciones:** specs focalizados de servicio/controller; `git diff --check`; SQL generado y `EXPLAIN ANALYZE` cuando PostgreSQL esté disponible.
- **Riesgo:** M.
- **SQL y consultas:** se generó SQL con los metadatos TypeORM del proyecto, sin conexión. La consulta de datos selecciona `Disc`, `artist`, `country`, `genre` y las colecciones de `rate`, `favorite` y `pending` filtradas por `userId`, más cuatro subconsultas correlacionadas (AVG rate, AVG cover, COUNT de rates no nulos y COUNT de comentarios). La consulta de count cuenta Disc distintos, usa joins de artist/country y solo necesita el join de rate cuando hay filtro `voted`. Con `skip/take` y joins de colección, TypeORM ejecuta primero la selección distinta de IDs y después hidrata esos IDs; `findAll` ejecuta además el count. Son **3 sentencias SQL en una página no vacía y 2 si la página no devuelve IDs**. No hay N+1 en el mapping.
- **Filas y payload:** los joins de estado de usuario pueden multiplicar filas raw si existen varias relaciones del mismo tipo para usuario/disco; TypeORM limita la página por Disc distinto, hidrata entidades por PK y conserva filas raw repetidas. El mapping las asocia por `discId`, probado en D4.1/D7. Los joins `rates`, `favorites` y `pendings` de la consulta de datos se mantienen porque sus arrays y campos derivados forman parte del payload caracterizado. Se seleccionan todas las columnas de esas relaciones; el tamaño exacto en bytes no se midió. La reducción de esos arrays requiere la decisión contractual y clasificación de consumidores de D39–D44.
- **EXPLAIN ANALYZE (base local `dev`, 6.630 Disc publicados, 18.940 Rate, 797 Comment; parámetros de usuario sin filas):** en una consulta representativa con orden predeterminado, PostgreSQL usó top-N heapsort y ejecutó los agregados de la página 10 veces; ejecución 43,8 ms. Para el orden por `averageRate`, el SQL equivalente medido calculó la media en el predicado de exclusión para 6.630 Disc y de nuevo para los 4.686 ordenables: secuenciales repetidos sobre Rate, 2.789.414 buffers y 7.857 ms. El count con el mismo predicado tuvo 6.630 ejecuciones de la subconsulta AVG, 1.631.421 buffers y 5.821 ms. Es un cuello de botella demostrado en esta base, no una proyección universal.
- **Optimización aplicada:** el predicado de exclusión `AVG(rate) IS NOT NULL` se sustituyó por `EXISTS` sobre rates con `rate IS NOT NULL`. Es equivalente porque `AVG` es no nula exactamente cuando existe al menos un valor rate no nulo; no cambia el campo ni la fórmula de `averageRate`. En los planes comparables, el listado bajó a 2.864 ms y 1.153.520 buffers; el count, a 10,4 ms y 684 buffers. En ambos casos el planner lee/agrupa los rates no nulos una vez, en vez de escanear Rate por cada Disc para el predicado. El orden por media aún evalúa la subconsulta de AVG por cada Disc ordenable; resolverlo con una agregación agrupada/lateral aumenta la complejidad y queda descartado hasta medir un beneficio adicional.
- **Optimización aplicada:** el count ya no hace join de `disc.rates` cuando no se filtra por `voted`; los casos `voted=true/false` conservan el join y sus filtros. No se eliminaron los joins de estado del query de datos por su payload observable.
- **Ineficiencias restantes y candidatos D45:** los planes muestran lecturas secuenciales repetidas de `rate` para los agregados correlacionados de la página (al menos 10 iteraciones en el caso medido), y scans de Comment por `commentCount`; el orden predeterminado requiere top-N sort. Registrar para D45 y verificar con planes representativos candidatos `rate("discId")`, `comment("discId")`, índices compuestos de estado (`rate`, `favorite`, `pending`, por `userId`/`discId`) e índice para `disc.releaseDate`. No se crea ningún índice aquí. Los scans de artista/Rate/Favorite/Pending por estos tamaños no justifican más cambios sin el plan real del endpoint en cargas típicas.
- **Complejidad revisada/descartada:** averageRate select y ordenación vuelven a recorrer esa media para cada fila ordenable; se mantiene la subconsulta para no introducir una derivada agrupada/lateral sin evidencia suficiente. `averageCover`, `voteCount` y `commentCount` son una definición lógica cada uno; PostgreSQL los ejecuta como subplanes correlacionados y el caso predeterminado medido limita el trabajo a la página. No se fusionan en agregaciones globales sin medir otra carga. No se modifica el mapping final.
- **Hallazgos contractuales:** siguen vigentes los hallazgos D5 y D7: ordenar por averageRate excluye discos sin rate; la respuesta expone `rates`, `favorites`, `pendings` junto a derivados; país ausente se mapea a `{ name: null }`. Se mantiene el contrato, sin hallazgo nuevo que bloquee el cierre.
- **Estado final:** data y count usan los mismos filtros y conjunto listable; raw/entity queda asociado por ID; no queda duplicación segura adicional identificada sin cambiar contrato. D8 permanece pendiente.

### D8 — findRandom: selección de IDs y filtros

- [x] Completada
- **Objetivo:** caracterizar y revisar la selección aleatoria de IDs y sus filtros antes de hidratar los resultados.
- **Alcance:** filtros de genre, country/countryId, year, ep, debut, fecha actual, límite y query inicial de IDs.
- **Fuera de alcance:** hidratación de resultados y estado del usuario.
- **Dependencias:** D0.
- **Criterios de finalización:** el conjunto candidato respeta los filtros y el límite; se mantiene la consulta separada de IDs y se documenta el motivo técnico observado.
- **Verificaciones:** pruebas de filtros y conjunto vacío; revisar SQL en PostgreSQL; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Resultado (2026-10-02):** la consulta inicial proyecta solo `disc.id AS id`, aplica siempre `disc.releaseDate <= :today`, añade los filtros proporcionados y termina con `ORDER BY RANDOM() ASC` y el límite solicitado (default 5). El SQL generado sin conexión para filtros combinados fue `SELECT disc.id AS id FROM disc ... WHERE ... ORDER BY RANDOM() ASC LIMIT 12`; la variante sin país no lleva joins. `ep=false` y `debut=false` se conservan porque se comprueban contra `undefined`; country prevalece sobre countryId si ambos se envían; UUID usa `country.id` y cualquier otro valor usa `country.name`. Una selección vacía retorna `[]` sin iniciar la query posterior. No se alteran estos comportamientos.
- **Candidatos y joins:** `disc.id` es la PK proyectada. Los joins `disc.artist` y `artist.country` son to-one y se usan para el filtro de país; ahora se añaden condicionalmente. Sin `country/countryId`, no hay joins ni multiplicación de IDs. No se modificó la resolución country por UUID/nombre. Los filtros de género, año, ep y debut usan columnas de Disc y no requieren joins.
- **Coste aleatorio:** `ORDER BY RANDOM()` se mantiene; suele requerir asignar claves aleatorias y ordenar los candidatos que cumplen los filtros antes de aplicar el límite. No se midió en esta tarea un coste que justifique sustituirlo; revisar planes cuando haya una incidencia o volumen representativo.
- **Contract finding:** `RandomQueryDto.year` acepta enteros sin mínimo, pero el servicio usa `if (year)`, por lo que `year=0` se acepta y no añade predicado. Se caracteriza sin cambiarlo en D8.
- **Tests:** cobertura de valores por defecto/fecha actual/selección solo de ID/aleatoriedad/límite; filtros aislados y combinados de género, country/countryId por UUID y nombre, año, ep y debut, incluidos false, prioridad country y selección vacía.
- **Comentario actualizado:** la explicación previa afirmaba que la query de IDs no tenía joins, aunque country los añadía, y atribuía la separación al `SELECT DISTINCT` automático de paginación. La query actual usa `limit()` sin `skip/take`, así que esa explicación no describía este QueryBuilder; ahora el comentario refleja selección de IDs y joins condicionales por país.

### Contract finding

**Current behavior:** `year` se valida como entero sin mínimo, pero `findRandom` solo añade `EXTRACT(YEAR ...)` si `year` es truthy; un `year=0` no filtra.

**Problem:** un valor aceptado por el DTO se ignora silenciosamente, aunque es un borde temporal de baja relevancia para discos.

**Impact:** Backend-only.

**Options:**

1. Preserve compatibility.
2. Refactor internally to distinguish `undefined` from zero.
3. Change the DTO validation to reject zero.
4. Coordinate a backend/frontend refactor.

**Recommendation:** preservar y caracterizar el comportamiento en D8; si existe un caller que necesite año cero, decidirlo como ajuste contractual/backend independiente.

**Blocks the current task:** No; la selección conserva exactamente la semántica previa.

### D9 — findRandom: hidratación, agregados y estado

- [x] Completada
- **Objetivo:** cargar solo los datos que requiere la respuesta aleatoria después de elegir IDs.
- **Alcance:** relaciones artista/país/género, estado de usuario y agregados de rates/comments en la consulta de hidratación.
- **Fuera de alcance:** selección aleatoria, opción de rediseñar la fórmula estadística y otros endpoints.
- **Dependencias:** D8.
- **Criterios de finalización:** cada ID seleccionado se hidrata una vez; métricas y estado del usuario coinciden con el baseline; no se vuelven a cargar colecciones completas sin consumidor.
- **Verificaciones:** fixtures con y sin estado/ratings y SQL de hidratación; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Resultado (2026-10-02):** la segunda query ejecuta una sola llamada a `getRawAndEntities()` con `disc.id IN (:...randomIds)` y produce una entidad Disc por ID seleccionado. Las pruebas cubren uno y varios IDs. Con los joins actuales, TypeORM agrupa filas de relaciones por PK de Disc al formar `entities`; las filas raw pueden seguir repetidas.
- **Relaciones:** se mantienen `disc.artist`, `artist.country`, `disc.genre` y los joins seleccionados de `rates`, `favorites` y `pendings` limitados a `userId`. Esas tres colecciones aparecen en la respuesta actual junto a `userRate`, `favoriteId` y `pendingId`, así que no se reducen aquí sin auditoría contractual. `comments` no se carga como colección; solo se consulta su count.
- **Agregados y estado:** quedan caracterizadas las cuatro subqueries existentes: `AVG(rate.rate)`, `AVG(rate.cover)`, `COUNT(rate.id)` filtrado a rate no nulo y `COUNT(comment.id)`. Tests cubren ausencia/presencia de agregados y combinaciones sin estado, rate solo, favorite solo, pending solo y las tres relaciones juntas; todos los joins de estado usan el usuario autenticado.
- **Duplicación:** no se extrajo un helper compartido con `findAll`; las consultas son cortas y una abstracción aumentaría acoplamiento entre endpoints sin reducir una complejidad suficiente. No se cambia código de producción en D9.

### Contract finding

**Current behavior:** la respuesta de `findRandom` incluye las colecciones `rates`, `favorites` y `pendings` seleccionadas para el usuario, además de los valores derivados `userRate`, `favoriteId` y `pendingId`.

**Problem:** parte del payload se solapa con los valores derivados y puede aumentar la respuesta. No hay caracterización completa de consumidores para este endpoint.

**Impact:** Backend + frontend.

**Options:**

1. Preserve compatibility.
2. Refactor internally while keeping the collections in the response.
3. Change the contract to return only projections.
4. Coordinate a backend/frontend refactor.

**Recommendation:** mantener las relaciones actuales y clasificar consumidores en D39–D44 antes de cualquier reducción; los campos derivados no bastan como prueba de que nadie use los arrays.

**Blocks the current task:** No; D9 caracteriza y preserva la respuesta.

### Finding for D10 — asociación de raw con Disc

**Current behavior:** los joins de estado pueden devolver varias filas raw por Disc, mientras TypeORM agrupa `entities` por clave primaria. La asociación posicional anterior podía asignar agregados al disco equivocado.

**Problem:** queda resuelto en D10: el query selecciona `disc.id` como `discId`, el mapping asocia agregados por esa clave y devuelve las entidades en el orden de `randomIds`.

**Impact:** Backend-only.

**Options:**

1. Preserve compatibility.
2. Refactor internally in D10 to associate raw by Disc primary key.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** mantener la asociación por clave estable y preservar el payload, incluidas las colecciones `rates`, `favorites` y `pendings`.

**Blocks the current task:** No; corregido y cubierto por regresiones en D10.

### D10 — findRandom: orden aleatorio y mapping

- [x] Completada
- **Objetivo:** preservar el orden de randomIds y la forma de respuesta al transformar resultados.
- **Alcance:** reordenación tras la consulta IN, asociación raw/entities y mapping final.
- **Fuera de alcance:** algoritmo de aleatoriedad o cardinalidad del endpoint.
- **Dependencias:** D9.
- **Criterios de finalización:** la respuesta conserva el orden decidido por la query de IDs, admite raw vacío/parcial de forma controlada y mantiene campos HTTP.
- **Verificaciones:** prueba con IDs en orden distinto al retorno de base de datos; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Resultado (2026-10-04):** se caracteriza que las entidades pueden volver en orden distinto al de la selección D8; la respuesta se reordena según `randomIds`. `disc.id` se proyecta como `discId` en las filas raw y cada entidad obtiene sus agregados por ID, sin emparejamiento posicional. Las filas raw repetidas por joins conservan la asociación correcta; si falta la fila raw de una entidad, sus agregados usan los defaults actuales (`null` para medias, `0` para counts). La respuesta conserva las relaciones y arrays caracterizados en D9.
- **Tests:** regresión de tres discos con orden de entidades distinto, múltiples filas raw por disco y valores independientes de `averageRate`, `averageCover`, `voteCount`, `commentCount`, `userRate`, `favoriteId` y `pendingId`; caso raw ausente y comprobación de que `discId` no se filtra al payload.
- **Verificaciones:** spec focalizado de Discs: 88 tests pasan. El `pnpm exec jest` configurado no arranca porque el repo declara Yarn como `packageManager`; ejecución directa de Jest con `--testRegex='.*\.spec\.ts$'` evita además el `testRegex` preexistente que usa glob inválido. `git diff --check` pasa.
- **Contrato:** no se cambiaron campos ni relaciones. Se mantiene el hallazgo D9 sobre el payload de `rates`, `favorites` y `pendings`, que requiere clasificación de consumidores antes de cualquier reducción.
- **Siguiente:** D11 permanece pendiente.

### D11 — findOptions

- [x] Completada
- **Objetivo:** hacer explícito el cálculo de opciones por campo sin filtrar por el propio campo solicitado.
- **Alcance:** query agrupada por country/genre/year/ep/debut, filtros ya seleccionados, conversión de tipos, orden aleatorio y límite.
- **Fuera de alcance:** cambiar los campos admitidos o el significado de la selección aleatoria.
- **Dependencias:** D0.
- **Criterios de finalización:** se conservan la omisión del filtro del campo pedido, las filas únicas, las conversiones de año/booleano y el límite validado.
- **Verificaciones:** pruebas por cada valor de field y filtros combinados; inspeccionar SQL agrupado; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Resultado (2026-10-04):** se caracterizan los cinco campos admitidos, los filtros combinados con exclusión del filtro propio, las proyecciones y agrupaciones que conservan valores únicos, conversiones `Number`/`Boolean`, cutoff de fecha, límite y `ORDER BY RANDOM()`. Los joins `artist`/`country` y `genre` se crean solo cuando el campo solicitado o un filtro los requiere; no se modificaron el orden aleatorio ni el contrato.
- **Tests:** cinco casos parametrizados (uno por field) verifican filtros, omisión del filtro propio, joins, select/groupBy y conversiones; casos adicionales cubren límite por defecto, año nulo y ausencia de joins para opciones escalares sin filtros de relaciones.
- **Verificaciones:** spec focalizado de Discs: 95 tests pasan con `./node_modules/.bin/jest src/discs/__tests__/discs.service.spec.ts --runInBand --testRegex='.*\.spec\.ts$'`; `git diff --check` pasa. `pnpm exec jest` no arranca porque el proyecto declara Yarn como `packageManager`.
- **Hallazgo contractual:** el año nulo de un disco con `releaseDate = NULL` puede agruparse y `Number(null)` lo expone como opción `0`; preservado por compatibilidad, sin bloquear D11.
- **Siguiente:** D11.1 completada; D12 permanece pendiente.

### D11.1 — Extraer catálogo a DiscCatalogService

- [x] Completada
- **Objetivo:** separar del `DiscsService` el bloque de catálogo ya caracterizado, una vez estabilizado también `findOptions` en D11.
- **Alcance:** mover únicamente `findAll`, `findRandom` y `findOptions` a `DiscCatalogService`; delegación desde `DiscsService` como fachada; registro de providers e inyección en `DiscModule`.
- **Fuera de alcance:** optimizaciones nuevas, cambios de contrato, frontend, calendario, Home, CRUD, LastFM y Spotify.
- **Dependencias:** D7.1, D10 y D11.
- **Criterios de finalización:** la lógica existe en un solo lugar y la fachada delega; contratos y comportamiento quedan idénticos; los callers internos siguen usando `DiscsService`; la extracción reduce de forma visible la complejidad del servicio principal.
- **Tests:** reutilizar la caracterización existente de catálogo; añadir o mover tests focalizados solo si mejora claridad; mantener pruebas de fachada/controller cuando correspondan y no duplicar expectativas idénticas.
- **Verificaciones:** specs focalizados de servicio/controller aplicables, build y `git diff --check`.
- **Riesgo:** M.
- **Resultado (2026-10-04):** `findAll`, `applyFindAllFilters`, `findRandom`, `findOptions` y sus constantes privadas se movieron a `DiscCatalogService`; `DiscsService` conserva los métodos públicos como fachada. El servicio nuevo inyecta directamente solo el repositorio `Disc`.
- **Tests:** las caracterizaciones existentes ejercitan la implementación extraída a través de la fachada, sin duplicar expectativas; se añadió una prueba de delegación para los tres métodos y cobertura de delegación de `findRandom`/`findOptions` en controller.
- **Verificaciones:** specs focalizados de Discs: 100 tests pasan; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan. `nest build` no pudo limpiar `dist/access-requests` (`EACCES`): `dist` preexistente pertenece a `nobody:nogroup`.
- **Tamaño:** `DiscsService` queda en 887 líneas; `DiscCatalogService` contiene 408 líneas.
- **Siguiente:** D12 permanece pendiente.

### D11.2 — Organizar servicios auxiliares y tests de Discs

- [x] Completada
- **Objetivo:** reorganizar físicamente el módulo `discs` sin cambiar lógica, contratos ni comportamiento.
- **Resultado (2026-10-04):** `DiscCatalogService` quedó en `src/discs/services/`; los specs existentes y el baseline D0 quedaron en `src/discs/__tests__/`, siguiendo la convención explícita de `AGENTS.md` y dejando la raíz del módulo solo con sus archivos principales.
- **Conflicto de estructura:** la arquitectura objetivo provisional de este roadmap describe los servicios auxiliares junto a los archivos principales, mientras que `AGENTS.md` indica `services/`. Se aplicó `AGENTS.md`, de forma conservadora y sin ampliar alcance.
- **Tests:** no se duplicaron suites ni se alteraron sus expectativas funcionales.
- **Verificaciones:** suites focalizadas de Discs: 2 suites y 100 tests pasan; `tsc --noEmit -p tsconfig.build.json` pasa; `git diff --check` pasa.
- **Siguiente:** D12 permanece pendiente.

### D11.3 — Alinear catálogo con la convención por responsabilidad

- [x] Completada
- **Objetivo:** aplicar a `DiscCatalogService` la convención estructural por responsabilidad funcional, incluyendo la suite que caracteriza su lógica.
- **Alcance:** mover el servicio a `catalog/`, mover allí sus tests específicos desde `__tests__/discs.service.spec.ts`, actualizar imports y conservar en la suite raíz solo pruebas de fachada y de responsabilidades que aún viven en `DiscsService`.
- **Fuera de alcance:** extraer otras responsabilidades, modificar producción salvo imports, cambiar lógica, queries, contratos o comportamiento y avanzar a D12.
- **Resultado (2026-10-04):** `DiscCatalogService` y sus tests de catálogo están en `src/discs/catalog/`; la suite raíz conserva delegación/fachada y las pruebas funcionales de métodos que todavía pertenecen a `DiscsService`. No se duplicaron expectativas.
- **Verificaciones:** los tres specs de `src/discs` pasan (100 tests); <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code> pasan.
- **Siguiente:** D12 permanece pendiente.

### Extracciones funcionales posteriores

Añadir una tarea de extracción para cada bloque solo cuando sus tareas de caracterización/refactor estén completadas y sus tests pasen. Los puntos previstos son:

- **Calendar → DiscCalendarService:** D16.1 extrae `findAllByDate` y `findAllByDatePublic` tras D12–D16. Los métodos semanales (`findWeekly`, `getFridayWeekRanges`, `findWeeklyWithoutImage`) se incorporarán después de estabilizar D17–D20 y D21, que caracteriza el uso desde LastFM.
- **Home → DiscHomeService:** después de completar D30–D38; mover `findTopRatedOrFeaturedAndStats` y sus estadísticas relacionadas.
- **Write → DiscWriteService:** después de completar D24–D28 y D22; mover creación, resolución de artista, actualización, eliminación y `updateImage`.
- **Spotify → DiscSpotifyService:** después de completar la caracterización aplicable de `getSpotifyTracks`, `resolveSpotifyAlbum` y `getSpotifyAlbumDetails` —incluida D29 y la cobertura existente—; conservar las integraciones y errores actuales.

Estas extracciones se incorporarán como tareas independientes en ese momento, sin fijar ahora sus IDs ni alterar el orden de las subtareas funcionales actuales. Cada una conservará `DiscsService` como fachada por defecto, actualizará la DI del módulo y aplicará las reglas generales de extracción anteriores.

### D12 — findAllByDate autenticado: filtros y paginación

- [x] Completada
- **Objetivo:** fijar la semántica del calendario autenticado antes de reducir sus joins de colección.
- **Alcance:** query, genre, country/countryId, dateRange, orden por releaseDate/artist y getManyAndCount.
- **Fuera de alcance:** calendario público y payload agrupado.
- **Dependencias:** D0.
- **Criterios de finalización:** se preservan filtros, inclusión de fechas, orden ascendente y respuesta de paginación; no se introduce el corte de fecha de findAll en este endpoint.
- **Verificaciones:** pruebas de filtro/fecha, páginas con joins y count; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Resultado (2026-10-04):** añadida caracterización de filtros aislados y combinados; country por nombre/UUID y precedencia de `country` sobre `countryId`; `BETWEEN` conserva los extremos; `dateRange` con más de dos elementos se ignora. Se preservan `releaseDate ASC, artist.name ASC`, defaults `limit=10/offset=0`, y `take/skip` explícitos. `getManyAndCount()` se invoca una vez sobre el mismo QueryBuilder que contiene filtros y paginación; la prueba comprueba que la página y el total se toman de esa pareja y que el count no se calcula a partir de la longitud de la página. No se añadió el corte `releaseDate <= hoy`.
- **Joins:** se mantienen artist y country (búsqueda/filtro y respuesta), genre (respuesta), rates/favorites/pendings (mapping autenticado D14) y asignations/user/list (D13). No hay un join de esta query que sea claramente eliminable sin afectar los campos actuales de respuesta o los filtros; la query batch de National Release y el mapping se dejan intactos para sus tareas asignadas.

### Contract finding

**Current behavior:** `dateRange` se filtra solo cuando tiene exactamente dos valores, aunque `PaginationDto` admite arrays de dos o más. `country` prevalece sobre `countryId`; un valor con formato UUID filtra por `country.id` y cualquier otro por `country.name`. `offset` no valida enteros ni valores no negativos y `limit` no tiene máximo; `currentPage` usa `floor(offset / limit) + 1` incluso si queda fuera de `totalPages`.

**Problem:** las entradas con más de dos fechas se aceptan y se ignoran silenciosamente; los filtros de país tienen una resolución implícita por formato y la paginación acepta valores fuera de rango semántico.

**Impact:** Backend-only.

**Options:**

1. Preserve compatibility.
2. Refactor internally.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** preservar estas semánticas en D12. Si se quiere rechazar rangos largos o restringir paginación, hacerlo en una tarea contractual independiente porque cambia entradas actualmente aceptadas.

**Blocks the current task:** No; los tests fijan la semántica actual sin modificar el DTO ni el contrato.

- **Verificación ejecutada:** los dos specs de Discs pasan (23 tests); `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan. El comando pnpm no puede ejecutarse porque el proyecto fija Yarn en `packageManager`; Yarn requiere `--ignore-engines` por Node 22 frente a Node 20 declarado. Jest requiere override de `testRegex` y `--runTestsByPath`, ya que el `testRegex` configurado (`src/**/*.spec.ts`) no es una expresión regular válida. No se pudieron usar los comandos canónicos sin esos overrides.

### D13 — findAllByDate autenticado: asignaciones y national release

- [x] Completada
- **Objetivo:** cargar por lote la información de asignaciones y national release que requiere cada disco del calendario.
- **Alcance:** joins de Asignation, User y List; query batch de national_release para la página.
- **Fuera de alcance:** modificar módulos Asignations o National Releases, relaciones de escritura y forma de agrupación.
- **Dependencias:** D12.
- **Criterios de finalización:** asignaciones mantienen id/done/user/list y nationalReleaseId mantiene sus valores; las lecturas adicionales son acotadas al conjunto paginado y no crean N+1.
- **Verificaciones:** fixture con cero/varias asignaciones y national release; contar queries; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Resultado (2026-10-04):** las asignaciones se cargan en la consulta paginada mediante joins de `disc.asignations`, `asignation.user` y `asignation.list`; el mapeo conserva `id`, `done`, `user` y `list`. `nationalReleaseId` se carga con un único SELECT batch cuyos parámetros son los IDs de los discos de la página; para una página vacía no se ejecuta esa lectura.
- **Tests:** añadidos casos para cero, una y varias asignaciones, con y sin `nationalRelease`; se comprueban el contenido asociado por disco, los joins necesarios, el límite de la página y una sola lectura batch sin consultas por disco.
- **Queries:** una operación paginada `getManyAndCount` carga las asignaciones junto con User y List; se añade una consulta batch de `national_release` si la página contiene discos (cero si está vacía). No hay lecturas por cada asignación o disco.
- **Verificaciones:** `yarn test src/discs --runInBand` (3 suites, 114 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan con Node 20.20.2.

### Contract finding

**Current behavior:** cada asignación de calendario devuelve los objetos completos seleccionados de `User` y `List`. Los campos `email`, `password` y `roles` de User están configurados con `select: false`, pero se incluyen otros campos de perfil/administración que no son parte mínima del estado de asignación.

**Problem:** el calendario transporta objetos relacionados más amplios de lo que necesita para exponer `id`, `done`, `user` y `list`; no se verificó aquí qué campos consume el frontend.

**Impact:** backend + frontend.

**Options:**

1. Preservar compatibilidad y mantener los objetos completos.
2. Mantener internamente las relaciones actuales, sin cambiar la respuesta.
3. Definir una proyección pública más pequeña en una tarea contractual.
4. Coordinar una proyección backend con la adaptación y verificación del frontend.

**Recommendation:** preservar compatibilidad en D13. Considerar una tarea contractual independiente para identificar consumidores y acordar la proyección mínima antes de reducir el payload.

**Blocks the current task:** No; las relaciones y el payload actuales se mantienen.

### Contract finding

**Current behavior:** la consulta permite que varias filas `national_release` apunten al mismo `discId`; al construir el mapa, la última fila devuelta establece `nationalReleaseId`, pero el SELECT no tiene orden.

**Problem:** si existen varias filas para un disco, el `nationalReleaseId` resultante no es determinista. El esquema permite la relación many-to-one y no establece unicidad sobre `discId`.

**Impact:** backend + frontend.

**Options:**

1. Preservar compatibilidad mientras se comprueban los datos existentes.
2. Hacer determinista la selección internamente, acordando qué fila debe prevalecer.
3. Cambiar el contrato o la cardinalidad mediante una tarea independiente.
4. Coordinar la regla de selección con los consumidores si dependen de ese ID.

**Recommendation:** conservar la lógica actual en D13 y abrir una tarea contractual/esquema independiente solo si se confirma que hay duplicados o que el dominio exige unicidad por disco.

**Blocks the current task:** No; D13 caracteriza el caso normal de una fila vinculada y no cambia el comportamiento existente para duplicados.

### D14 — findAllByDate autenticado: agrupación y mapping

- [x] Completada
- **Objetivo:** mantener estable el objeto de respuesta agrupado por fecha y sus campos derivados por usuario.
- **Alcance:** mapping de discos y artistas, rate/favorite/pending, nationalReleaseId, asignaciones y envelope de paginación.
- **Fuera de alcance:** el payload resumido del calendario público.
- **Dependencias:** D13.
- **Criterios de finalización:** fechas y orden de grupos coinciden con baseline; campos null y relaciones vacías se preservan; no se filtran columnas adicionales al frontend.
- **Verificaciones:** expectativas de payload para varias fechas y estado de usuario; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Resultado (2026-10-04):** el payload completo conserva el envelope (`totalItems`, `totalPages`, `currentPage`, `limit`, `data`), fechas ISO en orden cronológico y el orden de discos recibido dentro de cada fecha. Cada disco mantiene sus campos/relaciones, con `artist.country.name: null` cuando falta país, `genre` nullable, arrays de relaciones, `userRate`, `favoriteId`, `pendingId`, asignaciones (`id`, `done`, `user`, `list`) y `nationalReleaseId` asociado por `discId`.
- **Tests:** añadido un fixture con tres discos en dos fechas, varios discos en una fecha, relaciones presentes y vacías, estado del usuario, país nulo y asignaciones. Las filas raw de National Release se devuelven en orden inverso para demostrar asociación por clave y no por posición. Añadido test de caracterización para `releaseDate: null`.
- **Verificaciones:** `yarn test src/discs --runInBand` (3 suites, 116 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan con Node 20.20.2.

### Contract finding

**Current behavior:** cada disco devuelve los arrays `rates`, `favorites` y `pendings` filtrados al usuario actual, además de `userRate` (el primer rate), `favoriteId` y `pendingId` derivados de esas relaciones.

**Problem:** las relaciones se cargan y se exponen junto con campos derivados que repiten parte de la misma información. No se ha verificado qué arrays consume el frontend.

**Impact:** backend + frontend.

**Options:**

1. Preservar compatibilidad mientras se identifican los consumidores.
2. Mantener las cargas internas y el payload actual.
3. Cambiar a una respuesta reducida con `userRate`, `favoriteId` y `pendingId` en una tarea contractual.
4. Coordinar una respuesta reducida con la adaptación/verificación del frontend.

**Recommendation:** preservar el payload en D14; clasificar consumidores en D39 antes de considerar omitir los arrays. La alternativa compacta requiere frontend si algún consumidor usa las relaciones completas.

**Blocks the current task:** No; D14 caracteriza el payload actual sin modificar joins ni respuesta.

### Contract finding

**Current behavior:** si un disco con `releaseDate: null` llega a este endpoint, `new Date(null).toISOString()` lo agrupa bajo `1970-01-01`.

**Problem:** la fecha epoch es un valor inesperado para una fecha de lanzamiento ausente y puede presentarse como una fecha real en el calendario.

**Impact:** backend + frontend.

**Options:**

1. Preservar la compatibilidad observada.
2. Mantener el mapping interno mientras se comprueba la presencia de esos discos.
3. Cambiar el contrato en una tarea independiente, acordando si se omiten o se agrupan explícitamente los discos sin fecha.
4. Coordinar el cambio con frontend si debe representar una fecha ausente.

**Recommendation:** conservar el comportamiento en D14 y tratar la fecha ausente en una tarea contractual si se confirma que esos discos aparecen en calendario.

**Blocks the current task:** No; el caso quedó caracterizado sin cambiar el mapping.

### D15 — findAllByDatePublic: filtros y paginación

- [x] Cerrada
- **Objetivo:** caracterizar la consulta pública independientemente del calendario autenticado.
- **Alcance:** genre, country/countryId, dateRange, relaciones de artista/país/género, orden y count.
- **Fuera de alcance:** añadir query de texto, datos de usuario o corte de fecha actual que hoy no existen.
- **Dependencias:** D0.
- **Criterios de finalización:** se conserva el subconjunto actual de filtros y no se cargan rates/favoritos/pendientes por usuario; count y página coinciden.
- **Verificaciones:** pruebas de filtros y respuesta sin autenticación; revisar SQL de consulta y count; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D16 — findAllByDatePublic: mapping

- [x] Cerrada
- **Objetivo:** mantener el payload resumido público y la agrupación por fecha.
- **Alcance:** selección de campos Disc/Artist/Country/Genre, normalización de país null y envelope paginado.
- **Fuera de alcance:** forma del calendario autenticado y nuevos datos públicos.
- **Dependencias:** D15.
- **Criterios de finalización:** el payload expone los campos actuales y no los datos internos omitidos hoy; fechas, países nulos y orden se conservan.
- **Verificaciones:** pruebas de payload con y sin país/género; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D16.1 — Extraer calendario autenticado y público a DiscCalendarService

- [x] Completada
- **Objetivo:** mover fuera de `DiscsService` los dos métodos de calendario ya estabilizados, conservando la fachada y el comportamiento.
- **Alcance:** `findAllByDate`, `findAllByDatePublic`, sus queries, mappings y agrupación; pruebas específicas de D12–D16; provider e inyección de `DiscCalendarService`.
- **Fuera de alcance:** filtros, queries, payloads, otros métodos semanales, `getPublicFilters`, D17 y cualquier otra responsabilidad.
- **Dependencias:** D12–D16.
- **Criterios de finalización:** los dos métodos delegan desde `DiscsService`; `DiscCalendarService` inyecta directamente solo sus dependencias; los tests específicos viven junto al servicio sin duplicación.
- **Verificaciones:** <code>yarn test src/discs --runInBand</code>, <code>tsc --noEmit -p tsconfig.build.json</code>, <code>git diff --check</code> con Node 20 de `.nvmrc`.
- **Riesgo:** M.
- **Resultado (2026-10-04):** `findAllByDate` y `findAllByDatePublic` se movieron a `calendar/`; la fachada conserva ambas firmas y delega, y `DiscModule` registra el servicio nuevo. `DiscCalendarService` inyecta únicamente `Repository<Disc>`. D17 permanece pendiente.
- **Tests:** las suites autenticada y pública D12–D16 quedaron en `calendar/disc-calendar.service.spec.ts`; `__tests__/discs.service.spec.ts` conserva la delegación de fachada, sin duplicar caracterizaciones.
- **Verificaciones:** con Node 20.20.2, las suites de `src/discs` pasan (4 suites, 131 tests), `tsc --noEmit -p tsconfig.build.json` pasa y `git diff --check` pasa.
- **Tamaño:** `DiscsService` queda en unas 670 líneas; `DiscCalendarService` contiene unas 242 líneas.

### D17 — getPublicFilters

- [x] Completada
- **Objetivo:** verificar la selección distinta de géneros y países usados por algún disco.
- **Alcance:** dos queries de getPublicFilters, columnas proyectadas y orden alfabético.
- **Fuera de alcance:** cambiar si se incluyen entidades asociadas solo a discos futuros o sin género.
- **Dependencias:** D0.
- **Criterios de finalización:** se preservan columnas, orden y criterio de asociación; se documenta el coste de distinct/join con el plan si hay evidencia de lentitud.
- **Verificaciones:** pruebas de conjuntos vacíos, duplicados y orden; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** `getPublicFilters` ejecuta una query de géneros unida internamente a `disc`, y otra de países unida internamente a `artist` y `disc`; por eso solo devuelve entidades asociadas a algún disco según las relaciones actuales. No hay filtro de fecha y no se cambió qué discos participan. Se preservan `genre.id/name/color`, `country.id/name/isoCode`, `DISTINCT`, orden ASC por nombre y la respuesta `{ genres, countries }`. Los joins son filtros de asociación y no cargan relaciones; las columnas proyectadas corresponden al payload actual. No se encontró evidencia de coste que justifique intervenir `DISTINCT`.
- **Responsabilidad:** el endpoint `/discs/date/public/filters` sirve exclusivamente las opciones del calendario público. Se recomienda considerar `getPublicFilters` para una microextracción posterior a `DiscCalendarService`; no se movió en D17.
- **Contrato:** no se detectó rareza que requiera cambio. Los géneros y países se derivan de asociaciones con cualquier disco, incluso si su fecha de lanzamiento es futura; no se añadió un filtro temporal.
- **Tests:** añadidas pruebas de conjuntos vacíos, DISTINCT frente a asociaciones repetidas, géneros, países, joins, columnas y orden alfabético en `src/discs/__tests__/discs.service.spec.ts`.
- **Verificaciones:** con Node 20.20.2, `yarn test src/discs --runInBand` (4 suites, 135 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D18 permanece pendiente.

### D17.1 — Mover getPublicFilters a DiscCalendarService

- [x] Completada
- **Objetivo:** trasladar la consulta de filtros públicos a la responsabilidad de calendario, conservando `DiscsService` como fachada y manteniendo el contrato.
- **Alcance:** implementación de `getPublicFilters`, repositorios requeridos, delegación de fachada y tests específicos de D17.
- **Fuera de alcance:** cambios de queries, `DISTINCT`, joins, proyección, orden, semántica o frontend; D18 y siguientes.
- **Dependencias:** D17.
- **Criterios de finalización:** la implementación vive en `DiscCalendarService`; `DiscsService.getPublicFilters()` delega; las pruebas específicas viven junto al servicio y no se duplican.
- **Verificaciones:** `yarn test src/discs --runInBand`, `tsc --noEmit -p tsconfig.build.json` y `git diff --check` con Node 20 de `.nvmrc`.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** la implementación se movió a `calendar/`; `DiscsService` conserva el método público y delega. `Genre` y `Country` se inyectan en `DiscCalendarService` y se quitaron como dependencias innecesarias de la fachada. Las pruebas D17 se trasladaron al spec de calendario; el spec raíz conserva solo la expectativa de delegación, sin duplicar la caracterización.
- **Tamaño:** `DiscsService` queda en 645 líneas y `DiscCalendarService` en 271 líneas.
- **Verificaciones:** con Node 20.20.2, las 4 suites y 135 tests de `src/discs` pasan; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D18 permanece pendiente.

### D18 — Rangos semanales de viernes

- [x] Completada
- **Objetivo:** fijar la regla de semanas del calendario antes de tocar sus consumidores.
- **Alcance:** getFridayWeekRanges y casos de transición entre meses, meses de 28–31 días y años bisiestos.
- **Fuera de alcance:** cambiar el convenio de semanas o formato de etiquetas.
- **Dependencias:** D0.
- **Criterios de finalización:** pruebas expresan que la primera semana empieza el día 1 y las siguientes se alinean con viernes; se conserva el comportamiento de los callers.
- **Verificaciones:** tests unitarios del helper junto a `DiscCalendarService`; <code>yarn test src/discs --runInBand</code>, <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code> con Node 20.
- **Riesgo:** S.
- **Resultado (2026-10-04):** se preserva la regla existente: el primer rango parte del día 1 y termina seis días después del primer viernes (recortado al final del mes); los siguientes empiezan cada viernes y duran hasta siete días. La lógica se movió estructuralmente a `DiscCalendarService`; `findWeekly` y `findWeeklyWithoutImage` la consultan allí. No se tocaron sus queries, agrupación, mapping ni el formato actual de etiquetas (`<desde>-<hasta> <mes abreviado>`).
- **Tests:** añadidos casos para meses de 28, 29, 30 y 31 días, febrero bisiesto, transición diciembre–enero, primer rango desde día 1, continuidad y siguientes rangos alineados con viernes en `src/discs/calendar/disc-calendar.service.spec.ts`.
- **Hallazgo contractual:** el primer rango tiene duración variable, porque absorbe desde el día 1 hasta seis días después del primer viernes; los rangos posteriores son semanas de viernes de hasta siete días. Se conserva por compatibilidad; cualquier cambio de duración o etiqueta requiere una decisión contractual independiente.
- **Verificaciones:** con Node 20.20.2, pasan las 4 suites y 141 tests de `src/discs`; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D19 permanece pendiente.

### D18.1 — Extraer getFridayWeekRanges a helper de Calendar

- [x] Completada
- **Objetivo:** mantener en `DiscCalendarService` las operaciones y ubicar cálculos puros de Calendar en helpers exclusivos.
- **Alcance:** mover `getFridayWeekRanges`, actualizar sus dos consumidores semanales y trasladar junto al helper las pruebas de D18.
- **Fuera de alcance:** cambiar semántica, formato de etiquetas, queries, agrupación, mapping o frontend; avanzar a D19.
- **Dependencias:** D18.
- **Criterios de finalización:** el helper no usa DI, repositorios ni `this`; ambos consumidores lo importan; las expectativas de rango viven solo en el spec del helper; el hallazgo contractual de D18 permanece documentado.
- **Verificaciones:** `yarn test src/discs --runInBand`, `tsc --noEmit -p tsconfig.build.json` y `git diff --check` con Node 20 de `.nvmrc`.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** creada la función pura `getFridayWeekRanges` en `calendar/helpers/`; `findWeekly` y `findWeeklyWithoutImage` importan el helper directamente. Las pruebas específicas de D18 se movieron a `get-friday-week-ranges.spec.ts` y se eliminaron del spec de `DiscCalendarService`. La regla de primer rango variable descrita en el hallazgo contractual de D18 permanece sin cambios.
- **Tamaño:** `DiscCalendarService` queda en unas 271 líneas.
- **Verificaciones:** con Node 20.20.2, pasan las 5 suites y 141 tests de `src/discs`; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D19 permanece pendiente.

### D19 — findWeekly: consulta mensual

- [x] Completada
- **Objetivo:** reducir la carga de filas del calendario semanal manteniendo el conjunto y orden actual.
- **Alcance:** query mensual con Artist/Country/Genre, intervalo de fechas y selección necesaria para la respuesta.
- **Fuera de alcance:** helper de semanas y formato final.
- **Dependencias:** D18.
- **Criterios de finalización:** límites mensuales, orden y discos incluidos coinciden con baseline; no se añaden filtros como releaseDate <= hoy.
- **Verificaciones:** pruebas de límites mensuales, condición `BETWEEN`, joins, selección y orden en `src/discs/__tests__/discs.service.spec.ts`; <code>yarn test src/discs --runInBand</code>, <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Riesgo:** S.
- **Resultado (2026-10-04):** la consulta usa un único `getMany()` con `disc.releaseDate BETWEEN :start AND :end`, inicio local del día 1 y fin local del último día a las 23:59:59.999; `BETWEEN` conserva ambos límites. No se añadió ningún filtro temporal distinto del mes. El parámetro opcional `week` no reduce la consulta SQL: se obtiene el mes completo y el resultado se limita después mediante los rangos ya caracterizados.
- **Joins y selección:** se mantienen los `LEFT JOIN` de `disc.artist`, `artist.country` y `disc.genre`: el nombre del artista también define el orden secundario; país y género aportan campos del payload, y los joins izquierdos preservan discos con relaciones opcionales ausentes. Se proyectan solo los campos usados por el mapping posterior, más las claves primarias necesarias para hidratar entidades relacionadas. No se alteró el payload.
- **Orden y ejecuciones:** `releaseDate ASC`, seguido de `artist.name ASC`; una consulta `getMany()` por llamada, sin paginación ni queries adicionales.
- **Tests:** añadidos casos de mes normal y febrero bisiesto, límites exactos, fechas adyacentes fuera del mes, filtros efectivos, joins, proyección, orden y consulta mensual cuando se solicita una semana.
- **Rendimiento:** traer el mes completo para una petición con `week` puede leer más filas de las que terminan en la respuesta. No hay medición ni plan que demuestre coste relevante; queda como candidato de revisión posterior, sin optimización especulativa en D19.
- **Verificaciones:** con Node 20.20.2, pasan las 5 suites y 146 tests de `src/discs`; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D20 permanece pendiente.

### D20 — findWeekly: grupos y mapping

- [x] Completada
- **Objetivo:** mantener los grupos semanales y los campos entregados por el endpoint.
- **Alcance:** countryCode/countryName, debut, fechas ISO, etiqueta, startDate/endDate y campos del disco.
- **Fuera de alcance:** formato de otras rutas de calendario.
- **Dependencias:** D19.
- **Criterios de finalización:** semana opcional, etiquetas y payload observados quedan cubiertos; la declaración de tipo y la respuesta real se contrastan sin alterar el contrato en esta tarea.
- **Verificaciones:** pruebas de respuesta, semanas, límites, orden y relaciones opcionales en `src/discs/__tests__/discs.service.spec.ts`; <code>yarn test src/discs --runInBand</code>, <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Riesgo:** S.
- **Resultado (2026-10-04):** se caracterizaron los cinco grupos de mayo 2024, incluidos los vacíos, labels como `1-9 may`, fechas ISO con día/mes a dos dígitos, y los límites inclusivos de cada rango. La asignación con rangos disjuntos pone cada disco en un solo grupo. Se conserva el orden de la query (fecha y artista) dentro del grupo; `week` conserva únicamente el grupo indicado y una semana inexistente devuelve `[]`. No se modificaron agrupación ni mapping.
- **Payload observado:** cada disco expone `artistName`, `countryCode`, `countryName`, `name`, `genre`, `genreColor`, `link`, `ep`, `debut`, `image` y `releaseDate`. Relaciones ausentes mantienen los fallbacks actuales: texto vacío, `null` o `false` según el campo.
- **Tests:** añadidas pruebas del payload completo, múltiples discos en una semana y su orden, grupos vacíos, filtro por semana, semana inexistente, límites de todos los rangos, unicidad de asignación y relaciones ausentes.
- **Hallazgo contractual:** el tipo de retorno declarado en `findWeekly` omite `countryCode`, `countryName` y `debut`, aunque el JSON actual sí los incluye. Impacto backend-only (firma TypeScript del servidor); no se cambió el payload ni se ajustó el tipo en D20. Se recomienda preservar compatibilidad y alinear la firma en una tarea de mantenimiento independiente; cualquier cambio del JSON requeriría una decisión contractual explícita.
- **Verificaciones:** con Node 20.20.2, pasan las 5 suites y 150 tests de `src/discs`; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D21 permanece pendiente.

### D20.1 — Calendar helpers cleanup

- [x] Completada
- **Objetivo:** centrar `DiscCalendarService` en operaciones de calendario y extraer transformaciones puras a helpers exclusivos.
- **Alcance:** mover `findWeekly` conservando la fachada; extraer agrupación, mapping, asociación de national releases y cálculo de paginación; mover sus pruebas D19–D20 al spec de Calendar.
- **Fuera de alcance:** cambiar queries, filtros, orden, rangos, agrupación, payload, etiquetas, contratos o frontend; avanzar a D21.
- **Dependencias:** D20.
- **Criterios de finalización:** `findWeekly` mantiene firma y delega desde `DiscsService`; los helpers no usan DI, repositorios ni `this`; los tests específicos viven junto a Calendar sin duplicación; los hallazgos de D18 y D20 siguen documentados.
- **Verificaciones:** `yarn test src/discs --runInBand`, `tsc --noEmit -p tsconfig.build.json` y `git diff --check` con Node 20 de `.nvmrc`.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** `findWeekly` se movió a `DiscCalendarService`, y `DiscsService` conserva la misma firma como fachada delegadora. `getFridayWeekRanges` se reutiliza sin cambios. Los mappings/grupos de calendarios autenticado, público y semanal, el índice de national releases y los metadatos de paginación viven en helpers puros de `calendar/helpers/`. Las pruebas D19–D20 se trasladaron al spec de Calendar; la suite raíz conserva la delegación.
- **Hallazgos:** se mantienen sin cambios la duración variable del primer rango de D18 y la discrepancia documentada de D20 entre el tipo de retorno y los campos runtime `countryCode`, `countryName` y `debut`.
- **Tamaño:** `DiscsService` queda en unas 571 líneas y `DiscCalendarService` en unas 261 líneas.
- **Verificaciones:** con Node 20.20.2, pasan las 5 suites y 150 tests de `src/discs`; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D21 permanece pendiente.

### D20.2 — Catalog helpers cleanup

- [x] Completada
- **Objetivo:** dejar `DiscCatalogService` centrado en queries y orquestación, extrayendo funciones puras sin cambiar comportamiento ni contrato.
- **Alcance:** `findAll`, `findRandom`, `findOptions` y helpers privados asociados; mapping de discos/agregados/estado de usuario, asociación de filas raw, reconstrucción del orden aleatorio y conversión de opciones escalares.
- **Fuera de alcance:** cambios de queries, filtros, joins, orden, paginación, agregados, payload, contratos, rendimiento o frontend; avanzar a D21.
- **Dependencias:** D11.1 y D11.3.
- **Criterios de finalización:** las funciones extraídas no usan DI, repositorios ni `this`; el servicio conserva QueryBuilder y decisiones/coordinación de consulta; las pruebas de helpers viven junto a estos y no duplican expectativas de integración.
- **Verificaciones:** <code>yarn test src/discs --runInBand</code>, <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code> con Node 20 de `.nvmrc`.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** `src/discs/catalog/helpers/catalog.helpers.ts` contiene el mapping común de Disc y agregados, el índice de filas raw por `discId`, la reconstrucción del orden seleccionado en `findRandom` y la conversión de filas de `findOptions`. Las queries, filtros, joins, orden, paginación, selección de agregados y coordinación permanecen en `DiscCatalogService`.
- **Tests:** se trasladaron al spec del helper los casos unitarios de normalización de agregados y estado derivado de `findAll`; se añadieron casos para filas raw repetidas, orden aleatorio sin mutación y conversión/passthrough de opciones. Las caracterizaciones de payload completo y flujo QueryBuilder permanecen en los specs de servicio; no se duplican expectativas idénticas.
- **Hallazgos:** se mantienen documentados sin cambios los hallazgos contractuales de D5–D11 sobre orden por `averageRate`, colecciones expuestas y país nulo; el coste medido y los candidatos de rendimiento de D7.1; el comportamiento `year=0` de D8 y la opción de año nulo convertida a `0` de D11.
- **Tamaño:** `DiscCatalogService` queda en unas 378 líneas; no se fuerza otra división.
- **Estructura:** `catalog/` contiene el servicio y su spec, además de `helpers/catalog.helpers.ts` y `helpers/catalog.helpers.spec.ts`.
- **Verificaciones:** con Node 20.20.2, pasan las 6 suites y 154 tests de `src/discs`; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D21 permanece pendiente.

### D20.3 — Normalizar helpers de Catalog

- [x] Completada
- **Objetivo:** alinear la estructura de helpers de Catalog con la convención usada en Calendar, evitando un helper monolítico.
- **Alcance:** dividir mapping de Disc/agregados/estado, asociación raw por `discId`, reconstrucción del orden de `findRandom` y conversión de opciones de `findOptions`; redistribuir las pruebas junto a cada helper.
- **Fuera de alcance:** cambiar comportamiento, queries, filtros, orden, agregados, payload, contratos, rendimiento, frontend o Calendar; avanzar a D21.
- **Dependencias:** D20.2.
- **Criterios de finalización:** helpers agrupados por responsabilidad coherente; pruebas directas para lógica no trivial sin duplicar la caracterización del servicio; imports actualizados y sin helper monolítico vacío.
- **Verificaciones:** <code>yarn test src/discs --runInBand</code>, <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code> con Node 20 de `.nvmrc`.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** `catalog/helpers/` queda dividido en `map-catalog-disc.ts`, `catalog-raw-rows.ts`, `restore-random-disc-order.ts` y `map-option-rows.ts`. `DiscCatalogService` importa cada helper desde su archivo; queries y decisiones permanecen intactas. Se eliminó `catalog.helpers.ts`.
- **Tests:** las pruebas se redistribuyeron en specs junto a mapping, raw rows, orden aleatorio y opciones. Las expectativas de integración del servicio se mantienen sin duplicar las pruebas unitarias trasladadas.
- **Calendar:** revisión de cobertura sin cambios; `getFridayWeekRanges` tiene spec directo y los mappings de calendarios, asociación de national releases y metadatos de página están cubiertos desde `disc-calendar.service.spec.ts` por payload, grupos y paginación.
- **Verificaciones:** con Node 20.20.2, pasan las 9 suites y 154 tests de `src/discs`; `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D21 permanece pendiente.

### D21 — LastFM: discos sin imagen

- [ ] Pendiente
- **Objetivo:** preservar el contrato interno usado por LastFM para encontrar discos a completar.
- **Alcance:** findWeeklyWithoutImage, sus callers en lastfm.service.ts, rango semanal y selección de id/artista/nombre.
- **Fuera de alcance:** cliente LastFM, política de imágenes y endpoint semanal público.
- **Dependencias:** D18.
- **Criterios de finalización:** se conservan rango, criterio null/vacío de imagen, orden y forma de cada resultado; la llamada de LastFM sigue recibiendo los mismos datos.
- **Verificaciones:** prueba de selección con imagen null/vacía/no vacía y llamada del caller; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/lastfm/lastfm.service.spec.ts --runInBand</code> si se incorpora la prueba de integración.
- **Riesgo:** S.

### D22 — LastFM: actualizar imagen

- [ ] Pendiente
- **Objetivo:** aclarar el resultado de la escritura updateImage sin cambiar el flujo de enriquecimiento.
- **Alcance:** updateImage en DiscsService y su uso desde LastFM.
- **Fuera de alcance:** cambiar proveedor, selección de imagen, concurrencia o payload HTTP.
- **Dependencias:** D21.
- **Criterios de finalización:** persistencia por id y comportamiento ante id inexistente están caracterizados; el caller conserva su flujo y no se añade trabajo a otra entidad.
- **Verificaciones:** prueba de update y efecto en repositorio; suite focalizada de Discs y LastFM cuando exista.
- **Riesgo:** XS.

### D23 — findOne: detalle de disco

- [ ] Pendiente
- **Objetivo:** explicitar las relaciones del detalle y caracterizar el error actual para un disco ausente.
- **Alcance:** findOne, resultado HTTP de GET /discs/:id y su grafo eager actual.
- **Fuera de alcance:** cambiar la respuesta, ocultar campos existentes o modificar eager en toda la aplicación.
- **Dependencias:** D0.
- **Criterios de finalización:** payload completo del detalle queda caracterizado; 404 para id ausente se conserva; cualquier cambio en traducción de errores queda fuera de esta tarea salvo decisión contractual explícita.
- **Verificaciones:** tests de disco existente, inexistente y relaciones opcionales; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D24 — create: POST /discs

- [ ] Pendiente
- **Objetivo:** hacer explícita la construcción, persistencia y manejo de errores de creación básica.
- **Alcance:** método create, CreateDiscDto y respuesta HTTP actual.
- **Fuera de alcance:** createWithArtist, cambios de validación, permisos y nuevos valores por defecto.
- **Dependencias:** D0.
- **Criterios de finalización:** campos admitidos, defaults, relaciones indicadas por DTO y traducción actual de error 23505 quedan cubiertos; no cambia la ruta ni la respuesta.
- **Verificaciones:** pruebas de DTO/servicio/controller y error de conflicto; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** XS.

### D25 — createWithArtist: resolver artista

- [ ] Pendiente
- **Objetivo:** aislar los casos de artista existente, nuevo o ambiguo de la creación del disco.
- **Alcance:** resolveArtist, búsqueda case-insensitive, normalización y countryId de desambiguación.
- **Fuera de alcance:** cambiar la regla de coincidencia, el esquema de Artist o el flujo de Requests.
- **Dependencias:** D0.
- **Criterios de finalización:** cero coincidencias crea artista, una coincidencia reutiliza, varias requieren countryId y país no coincidente crea artista; nameNormalized respeta el formato actual.
- **Verificaciones:** pruebas de los cuatro caminos y error BadRequest; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D26 — createWithArtist: construir y guardar disco

- [ ] Pendiente
- **Objetivo:** hacer explícito el mapeo del DTO compuesto al registro Disc.
- **Alcance:** construcción y save del disco después de resolver artista, valores opcionales y defaults.
- **Fuera de alcance:** crear un caso de uso genérico, transacción nueva o cambiar validaciones HTTP.
- **Dependencias:** D25.
- **Criterios de finalización:** todos los campos del DTO mantienen la conversión/default actual; countryId solo afecta a la resolución del artista; respuesta HTTP coincide con baseline.
- **Verificaciones:** pruebas del mapeo, artista/genre opcionales y fecha; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D27 — update: PATCH /discs/:id

- [ ] Pendiente
- **Objetivo:** clarificar preload, asignación de artista/género, campos opcionales y manejo de errores.
- **Alcance:** update, UpdateDiscDto y response de PATCH.
- **Fuera de alcance:** permitir limpiar relaciones con null si el contrato actual no lo hace; añadir permisos o campos.
- **Dependencias:** D0.
- **Criterios de finalización:** update parcial no borra campos omitidos; artistId/genreId conservan semántica actual; id inexistente sigue siendo 404 y errores de persistencia mantienen su traducción.
- **Verificaciones:** tests de update parcial, relaciones, no encontrado y conflicto; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D28 — remove: DELETE /discs/:id

- [ ] Pendiente
- **Objetivo:** documentar y verificar la eliminación del disco y sus cascadas reales.
- **Alcance:** remove, resultado de delete, migración CascadeDeleteDiscOnArtist1774700000000 y claves externas directas de Disc.
- **Fuera de alcance:** cambiar reglas de cascada, borrar entidades relacionadas no caracterizadas o cambiar el mensaje HTTP.
- **Dependencias:** D0.
- **Criterios de finalización:** id existente devuelve la respuesta actual, id ausente devuelve 404 y efectos de cascada se documentan desde schema/migraciones; toda modificación de cascadas requiere tarea explícita aparte.
- **Verificaciones:** pruebas del resultado y revisión de migraciones/FKs; prueba de integración con PostgreSQL antes de cambiar una regla.
- **Riesgo:** S.

### D29 — getSpotifyTracks

- [ ] Pendiente
- **Objetivo:** reducir las lecturas al mínimo necesario para llamar a Spotify sin cambiar el resultado visible.
- **Alcance:** GET /discs/:id/spotify-tracks, carga de nombre de disco/artista e integración con SpotifyApiService.
- **Fuera de alcance:** cambios de proveedor, errores de Spotify, autenticación o selección de track.
- **Dependencias:** D23.
- **Criterios de finalización:** disco ausente mantiene el error actual; artista ausente usa el nombre vacío actual; argumentos y payload de Spotify no cambian; no se carga el grafo de detalle innecesario.
- **Verificaciones:** mocks de SpotifyApiService para disco presente/ausente; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D30 — homeDiscs: filtros y parámetros SQL

- [ ] Pendiente
- **Objetivo:** eliminar la duplicación accidental al construir filtros para las consultas principales y globales de homeDiscs.
- **Alcance:** dateRange, genreId, country/countryId, valores bind y construcción de cláusulas SQL dinámicas de findTopRatedOrFeaturedAndStats.
- **Fuera de alcance:** cambiar fórmulas, estadísticas por periodo o payload.
- **Dependencias:** D0.
- **Criterios de finalización:** cada valor sigue parametrizado; filtros de query principal y global son equivalentes; los parámetros no cambian de orden o tipo accidentalmente.
- **Verificaciones:** pruebas de filtros individuales/combinados y SQL/params; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D31 — homeDiscs: media global y mediana

- [ ] Pendiente
- **Objetivo:** aislar la query que calcula globalAvgRate y medianVotes para la puntuación ponderada.
- **Alcance:** globalStatsQuery, condiciones de D30, conversión de valores y defaults cuando no hay datos.
- **Fuera de alcance:** fórmula de weightedScore o caché.
- **Dependencias:** D30.
- **Criterios de finalización:** media/mediana y fallback coinciden con baseline con ratings nulos, sin votos y varios discos; filtro temporal/género/país se aplica igual.
- **Verificaciones:** casos de agregación en PostgreSQL; revisar el SQL generado; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D32 — homeDiscs: discos destacados y ranking

- [ ] Pendiente
- **Objetivo:** simplificar la consulta que obtiene los 20 discos rateados o pinned y su orden de puntuación.
- **Alcance:** joins disc/artist/country/genre/rate, HAVING, weightedScore, orden y límite.
- **Fuera de alcance:** estadísticas auxiliares y modificar la fórmula ponderada.
- **Dependencias:** D30, D31.
- **Criterios de finalización:** incluye los mismos discos rateados o pinned; weightedScore, desempates observables, orden y límite mantienen el baseline; joins no multiplican métricas.
- **Verificaciones:** pruebas PostgreSQL con pinned sin votos, ratings repetidos y filtros; revisar EXPLAIN ANALYZE si se propone optimizar el plan.
- **Riesgo:** M.

### D33 — homeDiscs: estado personal

- [ ] Pendiente
- **Objetivo:** cargar la tasa/cover, favorito y pendiente del usuario sin duplicar la fila rankeada.
- **Alcance:** subqueries/joins actuales para userRateId, userFavoriteId, pendingId, userRate y userCover, y su mapeo.
- **Fuera de alcance:** cambiar qué usuario se consulta o exponer nuevas relaciones.
- **Dependencias:** D32.
- **Criterios de finalización:** combinaciones con/sin rate, favorite y pending mantienen identificadores y valores actuales; cada disco sale una sola vez.
- **Verificaciones:** pruebas de estado por usuario y query; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D34 — homeDiscs: totalDiscs y totalVotes

- [ ] Pendiente
- **Objetivo:** precisar el alcance temporal de los contadores generales y reducir lecturas redundantes si la semántica lo permite.
- **Alcance:** las queries de totalDiscs/totalVotes con y sin statsDateRange.
- **Fuera de alcance:** imponer filtros de genre/country o releaseDate al conteo si no aparecen en el comportamiento actual.
- **Dependencias:** D30.
- **Criterios de finalización:** se mantiene la diferencia actual entre la ventana statsDateRange y el caso sin rango; rate null no cuenta como voto; cero datos devuelve cero.
- **Verificaciones:** pruebas de rango, sin rango, fecha borde y rates null; comparación de SQL/count.
- **Riesgo:** S.

### D35 — homeDiscs: top users por rate

- [ ] Pendiente
- **Objetivo:** aislar el ranking de usuarios por número de ratings.
- **Alcance:** topUsersByRates query, statsDateRange, agrupación y mapping.
- **Fuera de alcance:** estadísticas de cover y cambios de desempate/límite.
- **Dependencias:** D30.
- **Criterios de finalización:** cuenta solo rate no null, aplica el rango actual, conserva top 20 y estructura user/rateCount.
- **Verificaciones:** PostgreSQL con empates, nulos y rango de fechas; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D36 — homeDiscs: top users por cover

- [ ] Pendiente
- **Objetivo:** aislar el ranking de usuarios por cantidad de covers valoradas.
- **Alcance:** topUsersByCover query, statsDateRange, agrupación y mapping.
- **Fuera de alcance:** ranking por rate y cambios de contrato.
- **Dependencias:** D30.
- **Criterios de finalización:** cuenta solo cover no null, mantiene el nombre totalCover, rango y top 20 actuales.
- **Verificaciones:** PostgreSQL con cover null/no null y límites temporales; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D37 — homeDiscs: distribución de ratings

- [ ] Pendiente
- **Objetivo:** caracterizar el rango independiente de la distribución y sus valores decimales.
- **Alcance:** distributionDateRange, agrupación por rate, orden y conversión del resultado.
- **Fuera de alcance:** hacer que herede filtros de otra estadística o cambiar la escala de rate.
- **Dependencias:** D30.
- **Criterios de finalización:** solo se agrupan rates no null; se preservan rango, orden ascendente y tipos numéricos del payload.
- **Verificaciones:** casos con escala decimal, sin rates y ambos extremos del rango; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D38 — homeDiscs: mapping y envelope

- [ ] Pendiente
- **Objetivo:** mantener la respuesta combinada al separar la carga de discos de los cuatro grupos de estadísticas.
- **Alcance:** artist/country/genre, usuario, métricas, topUsersByRates, topUsersByCover, ratingDistribution y envelope final.
- **Fuera de alcance:** renombrar claves, cambiar null/0 o dividir la ruta.
- **Dependencias:** D31, D32, D33, D34, D35, D36, D37.
- **Criterios de finalización:** respuesta completa coincide con baseline para todos los subresultados; no se exponen aliases SQL auxiliares nuevos ni se pierden campos.
- **Verificaciones:** expectativa de payload completo con respuestas vacías/parciales; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D39 — Eager loading: inventario y consumidores

- [ ] Pendiente
- **Objetivo:** inventariar el contrato observable y determinar con evidencia qué callers dependen de cada relación eager.
- **Alcance:** eager de Disc.artist, Disc.genre, Disc.favorites, Disc.pendings y Disc.comments; revisar endpoints, callers de Disc en el repositorio y relaciones próximas como Artist.country, Rate.disc y Asignation.disc. Revisar consumidores/frontend cuando su código o evidencia esté disponible; si no puede confirmarse el consumo, clasificar la relación como OBSERVABLE PERO NO CONFIRMADA.
- **Fuera de alcance:** cambiar eager en entidades de otros módulos o cambiar el grafo visible sin pruebas.
- **Dependencias:** D7, D10, D11, D14, D16, D20, D23, D24, D26, D27, D29, D38.
- **Criterios de finalización:** existe una matriz por relación con: endpoint/caller afectado; clasificación REQUERIDA, OBSERVABLE PERO NO CONFIRMADA o NO CONSUMIDA; forma actual de carga; forma explícita prevista; test que protege el comportamiento; y si se puede o no retirar el eager. Cada consumer externo queda cubierto o anotado para su fase propietaria. Una relación no verificada no se marca como NO CONSUMIDA. Solo se acuerda retirar eager cuando los consumidores están identificados y cubiertos; en los demás casos se mantiene.
- **Verificaciones:** revisión de usos de repository.find/findOne y QueryBuilder, pruebas de los consumidores afectados; <code>pnpm build</code>.
- **Riesgo:** M.

### D40 — Eager de Disc.artist

- [ ] Pendiente
- **Objetivo:** quitar la carga automática de artista de Disc solo cuando todos los consumidores necesarios carguen esa relación explícitamente.
- **Alcance:** Disc.artist en disc.entity.ts y consultas identificadas en D39 que dependan del eager.
- **Fuera de alcance:** cambiar Artist.country eager ni modificar respuestas de otros módulos.
- **Dependencias:** D39, D23.
- **Criterios de finalización:** solo si D39 confirma que los consumidores están cubiertos: primero cargar explícitamente artista donde se requiere y probar el payload actual; después retirar eager: true y repetir la regresión. Si hay una relación OBSERVABLE PERO NO CONFIRMADA o un consumidor no cubierto, mantener eager y cerrar sin cambio de producción. Si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo de detalle y endpoints/callers identificados antes y después; pruebas de Discs y de consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** M.

### D41 — Eager de Disc.genre

- [ ] Pendiente
- **Objetivo:** quitar la carga automática de género de Disc si los callers requeridos ya lo seleccionan.
- **Alcance:** Disc.genre y consumidores identificados en D39.
- **Fuera de alcance:** cambiar filtros/opciones de género o la entidad Genre completa.
- **Dependencias:** D39, D23, D11.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente genre donde sea requerido y verificar que el payload actual no cambie. Si queda consumo observable sin confirmar o sin cobertura, mantener eager y cerrar sin cambio de producción. Si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo de los endpoints/callers identificados antes y después; pruebas focalizadas de Discs y consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** S.

### D42 — Eager de Disc.favorites

- [ ] Pendiente
- **Objetivo:** evitar cargar favoritos completos cuando ningún consumidor los necesita, preservando el contenido actualmente observable.
- **Alcance:** Disc.favorites y callers identificados en D39, manteniendo las selecciones del favorito del usuario donde correspondan.
- **Fuera de alcance:** cambiar el módulo Favorites, unicidad o endpoints de favoritos.
- **Dependencias:** D39, D23, D4, D10, D14.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente y caracterizar antes el payload actual, incluyendo la colección si hoy aparece. Para endpoints que solo requieren favoriteId, seleccionar el favorito del usuario sin cargar la colección completa únicamente si la respuesta no la expone. Si hay consumo visible no confirmado, mantener eager y cerrar sin cambio de producción; si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo con varios favoritos, usuario actual y ausente; pruebas de Discs y consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** M.

### D43 — Eager de Disc.pendings

- [ ] Pendiente
- **Objetivo:** impedir lecturas automáticas de todos los pendientes de un disco sin perder el estado del usuario.
- **Alcance:** Disc.pendings y callers auditados en D39.
- **Fuera de alcance:** flujo de escritura de Pendings o cambios de permisos.
- **Dependencias:** D39, D23, D4, D10, D14.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente y caracterizar antes el payload actual, incluyendo la colección si hoy aparece. Para endpoints que solo requieren pendingId, seleccionar el pendiente del usuario sin cargar la colección completa únicamente si la respuesta no la expone. Si hay consumo visible no confirmado, mantener eager y cerrar sin cambio de producción; si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo con pendientes de varios usuarios y ausencia de pending; pruebas de Discs y consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** M.

### D44 — Eager de Disc.comments

- [ ] Pendiente
- **Objetivo:** distinguir los callers que requieren la colección de comentarios de los que solo necesitan el count, sin alterar el payload actual del detalle.
- **Alcance:** Disc.comments y consumidores auditados en D39; conservar el contador donde se calcula por subquery.
- **Fuera de alcance:** módulo Comments, paginación de comentarios y reglas de borrado.
- **Dependencias:** D39, D23.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente y caracterizar antes el payload del detalle u otra ruta que hoy entregue comentarios. Rutas que solo requieren commentCount no traen la colección únicamente si no la exponen actualmente. Si hay consumo visible no confirmado, mantener eager y cerrar sin cambio de producción; si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo del detalle y count con muchos comentarios; pruebas de Discs y consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** M.

### D45 — Índices: inventario de queries y esquema

- [ ] Pendiente
- **Objetivo:** contrastar consultas observadas con índices existentes y decidir si hay una carencia medible.
- **Alcance:** filtros/orden de Disc.releaseDate, Disc.artistId/genreId, rates por discId/userId, comments/favorites/pendings/asignaciones por discId; migraciones que los crean y consultas de D1–D38.
- **Candidatos registrados en D7.1:** `rate(discId)` para agregados por disco; `comment(discId)` para `commentCount`; índices compuestos de estado por `userId`/`discId` en `rate`, `favorite` y `pending`; `disc(releaseDate)` para el filtro/orden frecuente. Contrastar también la necesidad de índices sobre `releaseDate` y campos ordenables con los planes de la aplicación real.
- **Fuera de alcance:** añadir índices por intuición o convertir esta revisión en una migración.
- **Dependencias:** D1–D38.
- **Criterios de finalización:** se reúnen también todos los candidatos registrados durante D1–D38; cada uno se vincula a una query concreta, filtro/join/orden beneficiado, frecuencia/cardinalidad, índice existente, plan actual y decisión. Sin evidencia de beneficio no se propone migración.
- **Verificaciones:** revisar esquema/migraciones y planes representativos con EXPLAIN ANALYZE; registrar parámetros usados.
- **Riesgo:** XS.

### D46 — Índices: migración justificada

- [ ] Pendiente
- **Objetivo:** implementar únicamente los índices que D45 demuestre necesarios.
- **Alcance:** nueva migración TypeORM con up/down limitada a las consultas justificadas; no modificar migraciones históricas.
- **Fuera de alcance:** índices genéricos para cada FK o cambios de query no relacionados.
- **Dependencias:** D45.
- **Criterios de finalización:** cada índice tiene query objetivo y evidencia antes/después; la migración es reversible, no duplica índices existentes y no cambia datos ni contratos. Si D45 no demuestra beneficio, cerrar esta tarea sin migración y documentar la decisión.
- **Verificaciones:** revisar up/down y SQL; ejecutar migración en PostgreSQL de prueba; comparar EXPLAIN ANALYZE antes/después; <code>pnpm build</code>.
- **Riesgo:** M.

### D47 — Limpieza final de Discs

- [ ] Pendiente
- **Objetivo:** retirar duplicación o código/imports obsoletos que queden después de completar las subtareas, sin crear capas innecesarias.
- **Alcance:** src/discs y helpers de Discs creados por tareas anteriores; comentarios que ya no describan el código.
- **Fuera de alcance:** cambios funcionales nuevos o limpieza oportunista de otros módulos.
- **Dependencias:** D1–D46.
- **Criterios de finalización:** no hay responsabilidades mezcladas restantes que se hayan acordado para esta fase; helpers tienen un uso/responsabilidad clara; no se introducen abstracciones genéricas sin consumidor.
- **Verificaciones:** revisar diff completo, <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>, <code>pnpm build</code>.
- **Riesgo:** S.

### D48 — Regresión final de Discs

- [ ] Pendiente
- **Objetivo:** demostrar que el módulo refactorizado mantiene las rutas, contratos y permisos actuales.
- **Alcance:** todos los endpoints y callers internos de Discs cubiertos en la fase, incluyendo LastFM y Spotify.
- **Fuera de alcance:** cambios contractuales nuevos o refactors de fases futuras.
- **Dependencias:** D47.
- **Criterios de finalización:** suite de caracterización/regresión completa, pruebas relacionadas y build pasan; se revisan migraciones y alcance final; quedan documentadas excepciones verificables, sin tareas de Discs implícitas.
- **Verificaciones:** <code>pnpm exec jest src/discs --runInBand</code>, <code>pnpm run test:e2e -- --runInBand</code> si hay e2e aplicables, y <code>pnpm build</code>.
- **Riesgo:** M.

## Fases futuras

Los módulos se priorizan por tamaño observado, cantidad de responsabilidades, consultas repetidas/costosas, integraciones y riesgo. No se desglosan todavía: al iniciar cada fase se inspeccionarán su código, DTOs, entidades, tests y migraciones y se generarán subtareas pequeñas con este mismo formato.

### Fase 2 — Rates, Favorites, Pendings y Comments

- Servicios observados: Rates 541 líneas, Favorites 297, Pendings 256 y Comments 275.
- Candidato prioritario por agregados de puntuación, estado de usuario y patrones de consulta que se repiten en Discs; revisar joins, conteos, eager loading y N+1 entre módulos.
- Mantener cada endpoint y cada métrica como trabajo separado; no centralizarlo en un repositorio genérico.

### Fase 3 — Artists

- Artists tiene 504 líneas y varias consultas de discos, agregados y mapeos de respuesta similares.
- Riesgos principales: carga de Disc/Rate por artista, duplicación de estadísticas y eager de Country; conservar el contrato del catálogo y detalle de artista.

### Fase 4 — Lists

- Lists tiene 1.767 líneas y mezcla administración de listas, integración con WordPress y sincronización/publicación de discos.
- Es de alto riesgo por efectos externos y flujos de sincronización; separar tareas por endpoint/operación, con pruebas de contenido y efectos antes de reorganizar responsabilidades.

### Fase 5 — Festival Playlists

- Festival Playlists tiene 1.682 líneas y combina reglas de playlist con integración externa.
- Revisar llamadas externas, selección y sincronización de discos y comportamiento ante errores; aislar primero el flujo observable y evitar cambios simultáneos de API y proveedor.

### Fase 6 — Contents, Articles, News y publicaciones

- Contents tiene 678 líneas y content-scheduler 348; Articles, News y Videos son módulos conectados al flujo editorial.
- Riesgo por estados, fechas programadas, versiones de contenido y publicación WordPress; detallar cada workflow por transición antes de extraer servicios.

### Fase 7 — Integraciones externas

- Candidatos: TikTok (629 líneas), Spotify (227), Instagram (205), WordPress, Scaping (211), Telegram (146) y LastFM (70).
- Priorizar límites claros de API, credenciales, reintentos, cifrado y efectos externos; preservar contratos y no introducir caché sin evidencia.

### Fase 8 — Versions, Asignations y Requests

- Versions tiene 349 líneas y pruebas existentes; Asignations tiene 281 y Requests 148.
- Revisar workflow/estados, asignaciones de usuarios, transiciones y relaciones con listas/discos; aprovechar las pruebas existentes y mantener las reglas de permisos.

### Fase 9 — Auth y módulos restantes

- Auth tiene 381 líneas y alto impacto transversal por JWT, roles y acceso; requiere caracterización de seguridad antes de modificar guards o contratos.
- Otros candidatos de menor tamaño pero con impacto transversal o persistencia propia: Excel (280 líneas), Links (164), Mail (154), Suggestions (128), Genres (122), Countries (92), Reunions (67), Points (58), Uploads (46) y Access Requests (37).
- Ordenar esos módulos según uso real, duplicación y coste de queries al preparar la fase; agrupar únicamente cuando compartan una responsabilidad demostrable.
