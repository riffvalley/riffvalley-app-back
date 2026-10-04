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
- **DiscCalendarService:** `findAllByDate`, `findAllByDatePublic` y `findWeekly`.
- **DiscEnrichmentService:** selección de discos semanales sin imagen y actualización de su imagen (`findWeeklyWithoutImage`, `updateImage`); reutiliza el helper puro compartido de rangos semanales.
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
- **Home → DiscHomeService:** D38.1, completada tras D30–D38, mueve `findTopRatedOrFeaturedAndStats` y sus estadísticas relacionadas; D38.2 queda para revisar cleanup de helpers.
- **Write → DiscWriteService:** D29.1 la extrae tras completar D24–D28; contiene creación, resolución de artista, actualización y eliminación. `updateImage` permanece en `DiscEnrichmentService`.
- **Spotify → DiscSpotifyService:** D29.3 extrae `getSpotifyTracks` tras D29; `resolveSpotifyAlbum` y `getSpotifyAlbumDetails` permanecen en la fachada hasta caracterizar cualquier extracción futura.

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

- [x] Completada
- **Objetivo:** preservar el contrato interno usado por LastFM para encontrar discos a completar.
- **Alcance:** findWeeklyWithoutImage, sus callers en lastfm.service.ts, rango semanal y selección de id/artista/nombre.
- **Fuera de alcance:** cliente LastFM, política de imágenes y endpoint semanal público.
- **Dependencias:** D18.
- **Criterios de finalización:** se conservan rango, criterio null/vacío de imagen, orden y forma de cada resultado; la llamada de LastFM sigue recibiendo los mismos datos.
- **Verificaciones:** prueba de selección con imagen null/vacía/no vacía y llamada del caller; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/lastfm/lastfm.service.spec.ts --runInBand</code> si se incorpora la prueba de integración.
- **Riesgo:** S.
- **Resultado (2026-10-04):** caracterizado `findWeeklyWithoutImage` sin cambiar su rango ni su criterio: sin `week`, la consulta cubre del día 1 al último día del mes; con `week`, consulta solo los límites inclusivos del rango devuelto por `getFridayWeekRanges`. Una semana inexistente retorna `[]` antes de crear una query. `releaseDate` es de tipo SQL `date`.
- **Query:** una llamada ejecuta una query `getRawMany()`; una semana inexistente ejecuta cero. Aplica `disc.releaseDate BETWEEN :start AND :end`, `(disc.image IS NULL OR disc.image = :empty)` con `empty: ''`, y orden `disc.releaseDate ASC` sin desempate adicional. Solo necesita el `LEFT JOIN disc.artist` para el nombre; la relación ausente conserva el fallback `artistName: ''`.
- **Selección y payload:** se seleccionan `disc.id`, `disc.name` y `artist.name`, que son los campos que consume `LastfmService.fillWeeklyImages` (`id` para `updateImage`, artista y álbum para buscar la imagen). Se sustituyó `leftJoinAndSelect`/`getMany` por join sin hidratar la relación y una proyección raw de esos tres campos; la respuesta interna mantiene exactamente `{ id, artistName, name }[]` y el array vacío.
- **Alcance temporal:** no se consulta necesariamente el mes completo; la semana concreta reduce el rango SQL. Sin `week`, el alcance mensual permite rellenar todos los candidatos del mes. No se alteró esta semántica.
- **Responsabilidad estructural:** aunque usa los rangos semanales del calendario, la selección de discos sin imagen y el payload están determinados por el enriquecimiento de imágenes consumido por LastFM, no por la respuesta del calendario. Se recomienda asociarla al flujo de enriquecimiento LastFM si se revisa su ubicación; D21 no mueve el método ni crea servicios.
- **Rendimiento:** la consulta era una sola, pero seleccionaba todas las columnas de Artist para usar únicamente `artist.name`; ahora proyecta los tres campos usados y conserva un único join izquierdo. No se identificó otro join eliminable.
- **Tests:** añadidos casos de rango mensual y semanal, límites exactos, filtro null/vacío, join y selección, orden, payload con artista ausente, resultado vacío, semana inexistente y conteo de queries.
- **Hallazgos contractuales:** no se detectó una rareza nueva que requiera cambio contractual. El orden solo define `releaseDate ASC`; no define desempate para varios discos con la misma fecha, y se conserva tal cual. `LastfmService` consume exclusivamente los tres campos caracterizados.
- **Verificaciones:** con Node 20.20.2, `yarn test src/discs --runInBand` pasa (9 suites, 160 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D22 permanece pendiente.

### D22 — LastFM: actualizar imagen

- [x] Completada
- **Objetivo:** aclarar el resultado de la escritura updateImage sin cambiar el flujo de enriquecimiento.
- **Alcance:** updateImage en DiscsService y su uso desde LastFM.
- **Fuera de alcance:** cambiar proveedor, selección de imagen, concurrencia o payload HTTP.
- **Dependencias:** D21.
- **Criterios de finalización:** persistencia por id y comportamiento ante id inexistente están caracterizados; el caller conserva su flujo y no se añade trabajo a otra entidad.
- **Verificaciones:** prueba de update y efecto en repositorio; suite focalizada de Discs y LastFM cuando exista.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** `updateImage(id, image)` ejecuta exactamente `discRepository.update(id, { image })` y devuelve `undefined`; no consulta ni devuelve la entidad. El `UpdateResult` se descarta.
- **Acceso y persistencia:** TypeORM localiza el disco por el criterio `id` y hace una única operación UPDATE directa. No carga relaciones ni otros campos; el patch incluye solo `image`. Un id inexistente produce `affected: 0`, pero el método no lo comprueba y resuelve igual que en una actualización correcta; no lanza NotFound.
- **Valores y hooks:** URLs e imagen vacía se pasan sin transformación. La columna `image` es nullable, pero la firma `updateImage(id, image: string)` excluye `null`; en runtime se reenvía `null` al repositorio y la columna admite almacenarlo. `Repository.update` conserva su operación directa y el QueryBuilder emite los eventos genéricos BeforeUpdate/AfterUpdate; no hay hooks ni subscribers declarados para Disc. No se cambió a `save` ni se alteró ese lifecycle.
- **Tests:** añadidos casos para actualización correcta, `affected: 0`, cadena vacía, `null` en runtime, retorno `undefined`, criterio por id, patch exclusivo de imagen y una llamada al repositorio.
- **Responsabilidad conjunta D21–D22:** ambos métodos solo sirven al flujo de completar imágenes: D21 busca candidatos por rango sin imagen y D22 persiste la imagen por id. Se recomienda agrupar la lógica de acceso a datos en una responsabilidad `enrichment/` dentro de Discs, mientras `lastfm/` conserva la integración HTTP/proveedor y orquesta el flujo. Esto es más cohesivo que Calendar (la semana solo acota candidatos) o Write genérico; la extracción queda para una tarea estructural posterior.
- **Hallazgo contractual:** la ausencia de disco se trata como éxito silencioso (`undefined`), indistinguible para el caller de una actualización realizada. El caller LastFM incrementa `updated` tras esa resolución, aunque TypeORM informe `affected: 0`; se preserva esta compatibilidad y no se cambia el flujo en D22.

### Contract finding

**Current behavior:** `updateImage` descarta `UpdateResult` y resuelve `undefined` incluso con `affected: 0`. `LastfmService.fillWeeklyImages` cuenta como actualizado cualquier disco cuyo `updateImage` resuelva.

**Problem:** `updated` puede contar un disco inexistente como actualizado; el caller no puede distinguir persistencia de no-op.

**Impact:** Backend-only.

**Options:**

1. Preserve compatibility.
2. Refactor internamente.
3. Change the contract.
4. Coordinate a backend/frontend refactor.

**Recommendation:** conservar el comportamiento en D22. Si la métrica de `updated` debe reflejar filas afectadas, abordar en una tarea backend independiente con decisión explícita sobre devolver `affected`, lanzar NotFound o mantener un resultado silencioso.

**Blocks the current task:** No; D22 caracteriza y preserva el resultado actual.

- **Nota de tipos:** la columna permite `NULL`, pero `Disc.image` y `updateImage` están declarados como `string`; no se amplió la firma. El test de null documenta el passthrough en runtime con un cast, no cambia el contrato TypeScript.
- **Verificaciones:** con Node 20.20.2, `yarn test src/discs --runInBand` pasa (9 suites, 164 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan.
- **Siguiente:** D23 permanece pendiente.

### D22.1 — Extraer enriquecimiento de imágenes

- [x] Completada
- **Objetivo:** mover la selección de discos sin imagen y su actualización a una responsabilidad cohesionada sin cambiar lógica ni contrato.
- **Alcance:** `findWeeklyWithoutImage`, `updateImage`, providers del módulo y traslado de sus tests D21–D22.
- **Fuera de alcance:** cleanup de helpers, mover `getFridayWeekRanges`, cambios de query/rangos/payload/LastFM o avance a D23.
- **Dependencias:** D21, D22.
- **Criterios de finalización:** `DiscEnrichmentService` inyecta solo lo necesario; `DiscsService` conserva ambas firmas delegando; los tests específicos viven junto a Enrichment; la DI resuelve el provider; contratos y hallazgos D21–D22 permanecen documentados.
- **Verificaciones:** `yarn test src/discs --runInBand`, `tsc --noEmit -p tsconfig.build.json` y `git diff --check` con Node 20.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** movidos únicamente `findWeeklyWithoutImage` y `updateImage` a `DiscEnrichmentService`. El servicio inyecta directamente solo `Repository<Disc>`; `DiscsService` conserva ambas firmas públicas y delega. Se registró `DiscEnrichmentService` como provider de `DiscModule`.
- **Tests:** los diez tests funcionales de D21–D22 se trasladaron a `enrichment/disc-enrichment.service.spec.ts`; `discs.service.spec.ts` conserva una prueba de delegación que comprueba argumentos y resultados. No se duplicaron las caracterizaciones.
- **Comportamiento:** query, proyección, límites temporales, filtros, orden, payload, persistencia, retorno y resultado para id inexistente permanecen sin cambios. No se modificaron LastFM ni `getFridayWeekRanges`; sus helpers quedan para D22.2.
- **Tamaño y estructura:** `DiscsService` queda en 549 líneas; `DiscEnrichmentService` tiene 47. `enrichment/` contiene únicamente `disc-enrichment.service.ts` y `disc-enrichment.service.spec.ts`.
- **Verificaciones:** con Node 20.20.2 pasan `yarn test src/discs --runInBand` (10 suites, 165 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check`.
- **Siguiente:** D23 permanece pendiente.

### D22.2 — Shared helper y cleanup de Enrichment

- [x] Completada
- **Objetivo:** compartir el cálculo puro de rangos semanales entre Calendar y Enrichment y dejar la estructura de Enrichment en el tamaño mínimo claro.
- **Alcance:** mover `getFridayWeekRanges` y su spec a `src/discs/shared/helpers/`, actualizar imports consumidores y retirar código local muerto de Enrichment si no afecta comportamiento.
- **Fuera de alcance:** cambios en rangos, queries, filtros, orden, payload, persistencia, LastFM, frontend o avance a D23.
- **Dependencias:** D22.1.
- **Criterios de finalización:** helper y spec quedan juntos bajo shared; se comprueba pureza y ausencia de dependencia de Calendar/DI/repositorios; Calendar y Enrichment usan el nuevo path; no se extraen helpers triviales de Enrichment; hallazgos D21–D22 permanecen intactos.
- **Verificaciones:** `yarn test src/discs --runInBand`, `tsc --noEmit -p tsconfig.build.json` y `git diff --check` con Node 20.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** movidos `get-friday-week-ranges.ts` y su spec a `src/discs/shared/helpers/`. Los consumidores actualizados son `DiscCalendarService`, `DiscEnrichmentService` y el mapper de grupos semanales, que importa `FridayWeekRange` como tipo.
- **Pureza y reutilización:** `getFridayWeekRanges` y `FridayWeekRange` no dependen de Calendar, NestJS, DI ni repositorios. Su implementación y expectativas no cambiaron. El helper ahora tiene consumidores de las responsabilidades Calendar y Enrichment, por lo que `shared/` responde a reutilización real.
- **Cleanup:** `DiscEnrichmentService` no contiene otro helper puro suficientemente no trivial; el `pad` local se mantiene inline por ser una conversión simple. Se retiraron únicamente dos variables de fecha sin uso; los límites usados por la query permanecen idénticos.
- **Hallazgos:** los hallazgos contractuales de D21–D22 y su recomendación de responsabilidad permanecen documentados sin cambios.
- **Verificaciones:** con Node 20.20.2 pasan `yarn test src/discs --runInBand` (10 suites, 165 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check`.
- **Siguiente:** D23 permanece pendiente.

### D23 — findOne: detalle de disco

- [x] Completada
- **Objetivo:** explicitar las relaciones del detalle y caracterizar el error actual para un disco ausente.
- **Alcance:** findOne, resultado HTTP de GET /discs/:id y su grafo eager actual.
- **Fuera de alcance:** cambiar la respuesta, ocultar campos existentes o modificar eager en toda la aplicación.
- **Dependencias:** D0.
- **Criterios de finalización:** payload completo del detalle queda caracterizado; 404 para id ausente se conserva; cualquier cambio en traducción de errores queda fuera de esta tarea salvo decisión contractual explícita.
- **Verificaciones:** tests de disco existente, inexistente y relaciones opcionales; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Resultado (2026-10-04):** `findOne` conserva el `id` como único filtro y retorna la entidad Disc sin mapping adicional. El detalle incluye `artist.country`, `genre`, `favorites.user`, `pendings.user` y `comments.user`; no carga `rates`, `asignations`, `Comment.replies` ni otras relaciones no eager. Las relaciones opcionales conservan `null` y las colecciones vacías `[]`.
- **Query y joins:** una invocación a `Repository.findOneOrFail` usa `where: { id }` y declara explícitamente el grafo anterior; las selecciones de columnas siguen siendo las predeterminadas de TypeORM, incluidos todos los campos seleccionables de las relaciones cargadas. No hay mapping, escritura, transacción ni efectos secundarios en el método. Con TypeORM 0.3.26, `findOne` configura `take: 1`; usando estrategia de relaciones `join` (predeterminada), la combinación de `take` y joins ejecuta una query distinta para resolver IDs y una segunda para hidratar el resultado. Si el disco no existe, la primera query no retorna ids y no se ejecuta la segunda. El mock de servicio verifica una invocación al repositorio; el número SQL se determinó inspeccionando la implementación instalada de TypeORM, sin conexión a base de datos.
- **Error e input HTTP:** `GET /discs/:id` usa `ParseUUIDPipe` (UUID inválido: 400); un UUID válido se delega sin transformación. Si el disco no existe, el controller propaga el `NotFoundException` generado por el servicio (404, `Disc with id <id> not found`). El `catch` actual convierte también otros errores del repositorio al mismo 404; se caracteriza y conserva, sin ampliar esta tarea a traducción de errores.
- **Tests:** se añadieron caracterizaciones de payload completo con las relaciones eager anidadas, relaciones opcionales (`null`/`[]`), query y grafo declarados, ausencia de disco con status y mensaje, conversión actual de errores de repositorio a 404, delegación HTTP y validación UUID.
- **Responsabilidad estructural:** no aparece una responsabilidad nueva que justifique extracción; `findOne` es una lectura puntual sin mapping ni coordinación adicional.

### Contract finding

**Current behavior:** el detalle carga y serializa todas las filas relacionadas de favorites, pendings y comments, además de sus usuarios; también carga género, artista y país. La ausencia de Disco y cualquier error del repositorio producen el mismo 404.

**Problem:** las tres colecciones pueden ser grandes. Sus joins multiplican filas intermedias; con la estrategia join de TypeORM y `take: 1`, el detalle ejecuta una consulta de IDs y otra de hidratación. El consumo de cada colección en frontend no está confirmado en este repositorio. El 404 indistinguible también puede ocultar una caída de base de datos como si el recurso no existiera.

**Impact:** backend + frontend para reducir o proyectar las colecciones; backend-only para distinguir errores de base de datos de ausencia.

**Options:**

1. Preservar compatibilidad y el 404 actual.
2. Mantener el payload y revisar internamente una estrategia de carga que reduzca la multiplicación, midiendo su coste.
3. Cambiar el payload a proyecciones/paginación o cambiar la traducción de errores.
4. Coordinar la forma del detalle con frontend si deja de incluir colecciones completas.

**Recommendation:** preservar ambos comportamientos en D23. En D39 confirmar consumidores y relaciones; cualquier reducción del payload requiere decisión contractual explícita. Tratar la traducción de errores en una tarea independiente si se decide que los fallos de almacenamiento deben conservar su código 5xx.

**Blocks the current task:** No; el grafo se hizo explícito y ambos comportamientos quedaron caracterizados sin cambiar contrato.

- **Verificaciones:** con Node 20.20.2 pasan `yarn test src/discs --runInBand` (10 suites, 169 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check`.
- **Siguiente:** D24 permanece pendiente.

### D24 — create: POST /discs

- [x] Completada
- **Objetivo:** hacer explícita la construcción, persistencia y manejo de errores de creación básica.
- **Alcance:** método create, CreateDiscDto y respuesta HTTP actual.
- **Fuera de alcance:** createWithArtist, cambios de validación, permisos y nuevos valores por defecto.
- **Dependencias:** D0.
- **Criterios de finalización:** campos admitidos, defaults, relaciones indicadas por DTO y traducción actual de error 23505 quedan cubiertos; no cambia la ruta ni la respuesta.
- **Verificaciones:** pruebas de DTO/servicio/controller y error de conflicto; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** XS.
- **Resultado (2026-10-04):** sin cambios de producción. `POST /discs` sigue delegando el DTO completo a `DiscsService.create`; el servicio hace `discRepository.create(dto)`, una llamada `discRepository.save(disc)` y retorna la misma instancia `disc` después de esperar el guardado. No usa transacción explícita ni modifica la ruta, permisos, DTO o respuesta.
- **Campos y defaults:** `Repository.create` copia `name`, `description`, `image`, `verified`, `link`, `releaseDate`, `ep`, `debut`, `featured` y `pinned` cuando vienen definidos. La instancia nueva mantiene `verified`, `ep`, `debut`, `featured` y `pinned` en `false` si se omiten; description/image/link/releaseDate no tienen inicializador en la entidad y quedan ausentes antes del retorno del ORM. La validación global mantiene `transform`, conversión implícita, whitelist y rechazo de propiedades desconocidas. El DTO acepta payload mínimo `{ name }`; el spec cubre todos sus campos, UUIDs de relación, URL y conversión de releaseDate string a Date.
- **Relaciones y persistencia:** `artistId` y `genreId` son campos admitidos y validados del DTO, pero TypeORM `Repository.create` los ignora porque la entidad declara las relaciones `artist` y `genre` sin propiedades escalares `artistId`/`genreId`, y el servicio no los convierte en relaciones. La comprobación de `Repository.create` real (metadatos TypeORM cargados sin conexión a BD) confirmó que ambos campos no aparecen en la entidad y las relaciones quedan `undefined`. `create` es una construcción en memoria; hay una llamada de escritura `save` (un INSERT lógico), sin lectura, join ni carga de relaciones eager. La llamada de TypeORM puede gestionar su transacción implícita predeterminada; no se añadió transacción.
- **Respuesta y errores:** el método devuelve el objeto construido y `save` puede completar sobre él valores generados como el id. El error PostgreSQL `code === '23505'` conserva `BadRequestException(error.detail)` (400 y detalle del driver). Cualquier otro error de `create` o `save` se registra y se traduce al 500 genérico `An unexpected error occurred`.
- **Tests:** añadidos `src/discs/dto/create-discs.dto.spec.ts` para payload mínimo, todos los campos, fecha convertida, name requerido, whitelist y fecha inválida; pruebas de servicio para defaults, DTO completo, relaciones ignoradas por el servicio, instancia retornada después de save, `23505` y error general/log; prueba de delegación/retorno en controller. El caso de fecha inválida muestra que la conversión implícita produce `Invalid Date` pero la validación actual pasa porque el campo solo tiene `IsOptional`.

### Contract finding

**Current behavior:** el DTO admite `artistId` y `genreId`, pero `create` pasa esos valores directamente a `Repository.create`; TypeORM no asigna las relaciones `artist` ni `genre`, por lo que no se guardan esos vínculos.

**Problem:** el request acepta IDs que parecen seleccionar relaciones, aunque esos campos no influyen en la persistencia. Mapearlos a referencias cambiaría los datos guardados y potencialmente el payload retornado.

**Impact:** backend + frontend.

**Options:**

1. Preservar compatibilidad y documentar que los IDs se ignoran en este endpoint.
2. Refactorizar internamente sin alterar la semántica actual.
3. Acordar y cambiar el contrato para que esos IDs asignen relaciones.
4. Coordinar con frontend la corrección y cualquier diferencia en la respuesta.

**Recommendation:** preservar en D24. Crear una tarea contractual independiente para decidir si `POST /discs` debe asignar estas relaciones, revisar consumidores y caracterizar el response antes de modificar persistencia.

**Blocks the current task:** No; se caracterizó y preservó la semántica actual.

### Contract finding

**Current behavior:** `releaseDate` solo tiene `IsOptional`; el `ValidationPipe` global convierte strings a `Date`, pero no hay `IsDate` ni otra validación de fecha. Un texto inválido se transforma en `Invalid Date` y pasa la validación DTO.

**Problem:** la petición puede llegar a persistencia con una fecha inválida y terminar en el error genérico 500. Añadir validación cambiaría qué requests acepta el endpoint.

**Impact:** backend-only.

**Options:**

1. Preservar la aceptación actual.
2. Ajustar internamente sin efecto observable (no aplica a la validación).
3. Cambiar la validación y el resultado HTTP para fechas inválidas.
4. Coordinar con frontend si cambia la respuesta a esos requests.

**Recommendation:** no cambiar en D24; abordar validación de fecha en una tarea contractual separada con decisión sobre el status de error esperado.

**Blocks the current task:** No; el caso quedó caracterizado y no se modificó la validación.

### Contract finding

**Current behavior:** `POST /discs` no lleva `@Auth()`, mientras `POST /discs/with-artist` sí.

**Problem:** rutas de creación del mismo recurso aplican políticas de acceso distintas. No se encontró evidencia en este módulo sobre si la ruta básica debe ser pública.

**Impact:** Backend-only.

**Options:**

1. Preservar compatibilidad y política actual.
2. Refactorizar internamente sin cambiar guards.
3. Cambiar el acceso y la respuesta 401/403 de la ruta.
4. Coordinar el cambio con los consumidores que crean discos.

**Recommendation:** preservar en D24 y confirmar la política en una revisión de permisos independiente.

**Blocks the current task:** No; D24 no cambia permisos.

- **Responsabilidad estructural:** no hay lógica pura no trivial en `create` que justifique helper. La extracción futura de `DiscWriteService` puede agrupar creación, `createWithArtist`/resolución de artista, update y remove cuando concluya D24–D28; D24 por sí sola no justifica reorganización. `updateImage` ya pertenece a `DiscEnrichmentService` tras D22.1, así que cualquier plan conjunto posterior debe reconciliar esa ubicación antes de mover código.
- **Verificaciones:** con Node 20.20.2 pasan `yarn test src/discs --runInBand` (11 suites, 178 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check`.
- **Siguiente:** D25 permanece pendiente.

### D25 — createWithArtist: resolver artista

- [x] Completada
- **Objetivo:** aislar los casos de artista existente, nuevo o ambiguo de la creación del disco.
- **Alcance:** resolveArtist, búsqueda case-insensitive, normalización y countryId de desambiguación.
- **Fuera de alcance:** cambiar la regla de coincidencia, el esquema de Artist o el flujo de Requests.
- **Dependencias:** D0.
- **Criterios de finalización:** cero coincidencias crea artista, una coincidencia reutiliza, varias requieren countryId y país no coincidente crea artista; nameNormalized respeta el formato actual.
- **Verificaciones:** pruebas de los cuatro caminos y error BadRequest; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Resultado (2026-10-04):** `resolveArtist` permanece privado en `DiscsService`; no se cambió el flujo de `createWithArtist`. Sin coincidencias crea y persiste un artista; una coincidencia reutiliza esa entidad; varias sin `countryId` producen `BadRequestException`; varias con `countryId` reutilizan la que coincida o crean una nueva si ninguna tiene ese país.
- **Búsqueda:** una llamada `artistRepository.find({ where: { name: ILike(artistName) } })` por resolución. `ILike` hace la comparación insensible a mayúsculas/minúsculas; se pasa el nombre original sin añadir `%` o `_`. No hay otra lectura, query de país, join escrito en el método ni paginación. La búsqueda múltiple es necesaria para contar duplicados y seleccionar por `countryId`.
- **Normalización:** al crear se preserva `name` exactamente como llega; `nameNormalized` aplica `normalize('NFD')`, elimina caracteres U+0300–U+036F, pasa a minúsculas y recorta espacios en los extremos. Ejemplo caracterizado: `  Árbol de Ñandú  ` queda como nombre visible sin cambios y `arbol de nandu` normalizado. La misma secuencia está duplicada en las dos ramas que crean artistas; se conserva tal cual.
- **countryId:** sin coincidencias se añade al objeto nuevo solo si es truthy; con una sola coincidencia se ignora incluso si no concuerda; con varias, sin ID se lanza error, con ID coincidente se reutiliza y con ID no coincidente se crea otro artista con ese ID. La ambigüedad mantiene el mensaje `Hay N artistas con el nombre "<artistName>". Especifica countryId para desambiguar.` y status 400.
- **Persistencia y errores:** creación llama una vez a `artistRepository.create` y una vez a `artistRepository.save`, y retorna el resultado de `save`. Reutilización y ambigüedad sin ID no hacen escrituras. No existe `catch` local: errores de `find`, `create` o `save` se propagan sin traducción por `resolveArtist`.
- **Relaciones y selección:** `Artist.country` tiene eager activo; la búsqueda con `find` carga la fila de Artist y la relación Country eager con las columnas seleccionables predeterminadas. `resolveArtist` compara con `countryId` y devuelve Artist para que `createWithArtist` la asigne a Disc; D26 debe caracterizar el response de esa ruta antes de cambiar la carga de Country. No había una lectura claramente prescindible que pudiera eliminarse sin alterar esa entidad retornada.
- **Tests:** cinco casos nuevos de servicio cubren cero coincidencias sin país, una coincidencia con país distinto, ambigüedad y mensaje, coincidencia por país entre duplicados, y creación por país no coincidente. Las expectativas comprueban `ILike`, el valor original, normalización, payload pasado a create/save, identidad retornada y número de llamadas.
- **Responsabilidad estructural:** la resolución, búsqueda y persistencia de Artist forman parte de la escritura de Disc; se mantienen como candidata a `DiscWriteService` tras completar el bloque previsto, sin extracción en D25. La normalización es pura y no trivial por NFD y eliminación de marcas diacríticas, y está duplicada; se documenta como candidata a helper de escritura, sin crear helper ni fragmentar ahora el flujo.

### Contract finding

**Current behavior:** `countryId` solo restringe la selección si existen varias coincidencias por nombre. Si hay una coincidencia, se reutiliza aunque el país solicitado sea distinto; si hay varias y ninguna corresponde, se crea otro Artist con el `countryId` recibido. La búsqueda usa `ILike` con el texto original y sin comodines añadidos.

**Problem:** la semántica de `countryId` varía según el número de coincidencias; además, `%` y `_` contenidos en el nombre conservan el significado de patrón de ILIKE. Un caller puede interpretar `countryId` como filtro estricto o esperar que el nombre siempre sea literal.

**Impact:** backend + frontend.

**Options:**

1. Preservar compatibilidad y documentar la regla actual.
2. Refactorizar internamente preservando todos los casos.
3. Cambiar `countryId` a filtro estricto o escapar comodines como cambio contractual.
4. Coordinar la semántica con los consumidores que envían `artistName` y `countryId`.

**Recommendation:** preservar en D25; si los callers requieren filtro estricto o búsqueda literal, tratarlo en una tarea contractual independiente con evidencia de consumidores.

**Blocks the current task:** No; se cubrieron las ramas actuales sin alterar coincidencias.

### Contract finding

**Current behavior:** la consulta `find` carga Artist con todas las columnas seleccionables y `Artist.country` eager; el objeto Artist encontrado se devuelve desde `resolveArtist` y se usa después como relación de Disc.

**Problem:** se carga Country aunque la comparación usa el campo escalar `countryId`. No se ha caracterizado aún en D26 qué parte de esta relación aparece en el response de `createWithArtist`; retirarla ahora podría cambiar el payload.

**Impact:** backend + frontend si cambia el response.

**Options:**

1. Preservar el objeto actual hasta caracterizar D26.
2. Proyectar internamente los campos necesarios después de probar el payload completo de D26.
3. Cambiar el response para omitir Country si ningún consumidor lo necesita.
4. Coordinar la proyección con frontend si consume `artist.country`.

**Recommendation:** mantener la carga eager en D25. Caracterizar el response de D26 y confirmar consumidores antes de considerar una proyección; el eager de `Artist.country` queda observable pero con consumo externo sin confirmar.

**Blocks the current task:** No; la búsqueda y la selección necesaria se conservan.

- **Verificaciones:** con Node 20.20.2 pasan `yarn test src/discs --runInBand` (11 suites, 183 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check`.
- **Siguiente:** D26 permanece pendiente.

### D26 — createWithArtist: construir y guardar disco

- [x] Completada
- **Objetivo:** hacer explícito el mapeo del DTO compuesto al registro Disc.
- **Alcance:** construcción y save del disco después de resolver artista, valores opcionales y defaults.
- **Fuera de alcance:** crear un caso de uso genérico, transacción nueva o cambiar validaciones HTTP.
- **Dependencias:** D25.
- **Criterios de finalización:** todos los campos del DTO mantienen la conversión/default actual; countryId solo afecta a la resolución del artista; respuesta HTTP coincide con baseline.
- **Verificaciones:** pruebas del mapeo, artista/genre opcionales y fecha; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** S.
- **Resultado (2026-10-04):** sin cambios de producción. `createWithArtist` resuelve primero Artist con las reglas de D25, construye una sola entidad `Disc` con `discRepository.create` y la persiste una vez con `discRepository.save`; devuelve el resultado de `save` sin mapping posterior.
- **Mapeo DTO → Disc:** `discName` pasa a `name`; el Artist resuelto se asigna entero a `artist`; `genreId` truthy se convierte en la referencia `genre: { id }`; `releaseDate` truthy se convierte con `new Date`; `ep` y `debut` usan `?? false`; `link`, `image` y `description` se pasan como están, incluso como `undefined`. `artistName` solo entra en `resolveArtist`; `countryId` solo entra en esa resolución y no pasa al Disc; `genreId` no se copia como campo escalar. El DTO no contiene `verified`, `featured` ni `pinned`, que conservan los defaults `false` de `Disc`.
- **Opcionales y persistencia:** payload mínimo crea con ep/debut false, sin genre ni releaseDate; después de save las columnas Disc nullable ausentes son null. Con opciones presentes se conservan booleans, textos y fecha `Date`. La construcción del Artist existente/nuevo corresponde a D25; en caminos de artista nuevo hay una operación `Artist.find`, `Artist.create` en memoria y `Artist.save`, además de `Disc.create` en memoria y `Disc.save`. Con Artist existente no hay escritura de Artist. No hay lectura/join de Disc ni carga eager tras su save; no se añadió transacción explícita.
- **Respuesta HTTP:** controller delega `POST /discs/with-artist` sin transformar DTO ni response. Se caracteriza el JSON completo simulado tras save: scalar Disc, defaults, nulls, Artist y Country eager cuando el artista vino de `find`, `genre: { id }` cuando se indicó género y ausencia de colecciones eager de Disc no cargadas por `save`. Si se crea Artist en la misma llamada, `Artist.save` no carga `country`; la relación country no aparece en esa respuesta aunque `countryId` esté asignado. Los errores de resolución (incluido BadRequest por ambigüedad) se propagan; `createWithArtist` no añade traducción a errores de persistencia.
- **Tests:** dos casos de servicio cubren artista existente con Country, artista nuevo con countryId, mapeo mínimo/completo, genre/date presentes y ausentes, defaults, objeto pasado a `create`/`save`, número de llamadas y payload serializado completo. Dos tests DTO comprueban payload mínimo y todos los campos admitidos. El controller prueba delegación y propagación del error actual de ambigüedad.
- **Duplicación/candidato estructural:** `create` y `createWithArtist` comparten el patrón repository `create` + `save`, pero sus mappings y errores difieren; no se introduce helper genérico. Cuando se complete D24–D28, ambos métodos pueden vivir en la futura responsabilidad `DiscWriteService`.

### Contract finding

**Current behavior:** el response de `POST /discs/with-artist` omite relaciones eager de Disc porque `save` no las carga; el género asignado desde `genreId` aparece como `{ id }`. `artist.country` aparece cuando se reutiliza un Artist obtenido por `find`, y falta cuando Artist acaba de crearse con `save`.

**Problem:** el payload anidado varía según el camino interno de resolución y difiere del detalle GET, que sí caracteriza relaciones eager. El frontend no está disponible aquí para confirmar qué forma consume. En la rama de reutilización, `Artist.country` supone una relación eager cargada en el `find`; el coste es la carga de Country con sus columnas seleccionables para el/los Artist coincidentes.

**Impact:** backend + frontend.

**Options:**

1. Preservar el payload actual hasta verificar consumidores.
2. Mantener la compatibilidad cargando explícitamente la misma forma en ambos caminos.
3. Cambiar el response a un projection estable con IDs/resúmenes y retirar relaciones accidentales.
4. Coordinar una forma estable del response con frontend.

**Recommendation:** preservar en D26. En D39 confirmar consumidores de eager; cualquier normalización de Country o reducción del payload requiere decisión contractual y pruebas de consumidores.

**Blocks the current task:** No; ambas formas actuales quedaron caracterizadas sin cargar ni ocultar relaciones nuevas.

- **Verificaciones:** con Node 20.20.2 pasan `yarn test src/discs --runInBand` (12 suites, 189 tests), `tsc --noEmit -p tsconfig.build.json` y `git diff --check`.
- **Siguiente:** D27 permanece pendiente.

### D27 — update: PATCH /discs/:id

- [x] Completada
- **Objetivo:** clarificar preload, asignación de artista/género, campos opcionales y manejo de errores.
- **Alcance:** update, UpdateDiscDto y response de PATCH.
- **Fuera de alcance:** permitir limpiar relaciones con null si el contrato actual no lo hace; añadir permisos o campos.
- **Dependencias:** D0.
- **Criterios de finalización:** update parcial no borra campos omitidos; artistId/genreId conservan semántica actual; id inexistente sigue siendo 404 y errores de persistencia mantienen su traducción.
- **Caracterización:** `update` separa `artistId` y `genreId` y llama una vez a `discRepository.preload({ id, ...restDto })`; si no existe entidad lanza `NotFoundException` antes de guardar. Los campos escalares omitidos no aparecen en el patch. `false` y los valores escalares `null` permitidos por `UpdateDiscDto` pasan a `preload`; los IDs de relación truthy se asignan como referencias `{ id }`. IDs omitidos o `null` no reemplazan ni limpian relaciones. Después de `preload` se hace una llamada a `save`; se devuelve la entidad precargada y mutada, no se transforma la respuesta de `save`.
- **Errores:** el error PostgreSQL `23505` de `save` sigue convertido a `BadRequestException` con `detail`; otros errores de `save` se registran y se convierten a `InternalServerErrorException('An unexpected error occurred')`. Errores de `preload` quedan fuera de esa traducción y se propagan sin cambios.
- **Hallazgo de contrato/rendimiento:** `preload` carga la entidad y sus relaciones eager; el PATCH devuelve ese grafo, incluidas Artist/Country, Genre y colecciones eager de favorites, pendings y comments si existen. No se altera la respuesta en esta tarea; ver hallazgo detallado en el cierre de D27 y auditar consumidores en D39–D44 antes de proponer una respuesta menor.
- **Responsabilidad estructural:** `update` es lógica de escritura de Discs y queda como candidata a la futura `DiscWriteService` al completar D24–D28. El mapeo parcial y la asignación de referencias son locales; no justifican helpers genéricos anticipados.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code> (13 suites, 200 tests), <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D28 permanece pendiente.
- **Riesgo:** S.

### D28 — remove: DELETE /discs/:id

- [x] Completada
- **Objetivo:** documentar y verificar la eliminación del disco y sus cascadas reales.
- **Alcance:** remove, resultado de delete, migración CascadeDeleteDiscOnArtist1774700000000 y claves externas directas de Disc.
- **Fuera de alcance:** cambiar reglas de cascada, borrar entidades relacionadas no caracterizadas o cambiar el mensaje HTTP.
- **Dependencias:** D0.
- **Criterios de finalización:** id existente devuelve la respuesta actual, id ausente devuelve 404 y efectos de cascada se documentan desde schema/migraciones; toda modificación de cascadas requiere tarea explícita aparte.
- **Caracterización:** el controller delega `id` directamente y devuelve el resultado sin cambios. El servicio ejecuta únicamente `discRepository.delete({ id })`; no llama `findOne`, `preload` ni `remove`. TypeORM implementa `delete` como DELETE SQL directo, sin cascadas ni operaciones de relaciones en la capa ORM; solo pueden actuar las acciones de FK existentes en la base. Si `DeleteResult.affected === 0`, lanza `NotFoundException('Disc with id <id> not found')`; con filas afectadas devuelve exactamente `{ message: 'Disc with id <id> has been removed' }`. Los errores de persistencia se propagan sin traducción.
- **Migraciones/FKs demostrables en el historial:** `CascadeDeleteDiscOnArtist1774700000000` define `disc.artistId → artist.id ON DELETE CASCADE` (borrar el Artist borra sus Disc; borrar el Disc no borra su Artist). `AddDiscToNationalRelease1774460022329` define `national_release.discId → disc.id ON DELETE NO ACTION`; un NationalRelease enlazado puede impedir el borrado mientras siga referenciándolo.
- **Cascadas declaradas en entidades, pendientes de confirmar en PostgreSQL:** `Favorite.disc`, `Pending.disc`, `Rate.disc`, `Comment.disc` y `Asignation.disc` declaran `onDelete: 'CASCADE'`; para estas FKs entrantes no se halló migración de creación en el historial del repo, cuya tabla base Disc antecede a las migraciones revisadas. No se afirma que la base desplegada tenga estas reglas hasta probarlas con PostgreSQL. `List.discId` es un campo escalar sin relación TypeORM; no declara FK. Las FKs salientes de Disc hacia Artist/Genre no borran esas entidades al borrar Disc.
- **Responsabilidad estructural:** `remove` queda como candidata a la futura `DiscWriteService` junto con las escrituras D24–D27; no se extrae ahora.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code> (13 suites, 204 tests), <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>. Una prueba de integración con PostgreSQL sigue pendiente para verificar las reglas físicas de cascada antes de cambiarlas.
- **Siguiente:** D29 permanece pendiente.
- **Riesgo:** S.

### D29 — getSpotifyTracks

- [x] Completada
- **Objetivo:** reducir las lecturas al mínimo necesario para llamar a Spotify sin cambiar el resultado visible.
- **Alcance:** GET /discs/:id/spotify-tracks, carga de nombre de disco/artista e integración con SpotifyApiService.
- **Fuera de alcance:** cambios de proveedor, errores de Spotify, autenticación o selección de track.
- **Dependencias:** D23.
- **Criterios de finalización:** disco ausente mantiene el error actual; artista ausente usa el nombre vacío actual; argumentos y payload de Spotify no cambian; no se carga el grafo de detalle innecesario.
- **Caracterización y cambio:** antes se llamaba `findOne(id)`, que solicitaba Artist/Country, Genre y favorites, pendings y comments con sus users. Solo se consumían `Disc.name` y `Artist.name`. Ahora una query con `LEFT JOIN` a Artist selecciona únicamente esos dos nombres; QueryBuilder no carga eager relations implícitamente y no se unen las colecciones.
- **Queries:** la lectura anterior usaba `findOne` con `take: 1` y joins; TypeORM ejecuta dos SQL para paginar resultados con joins cuando hay coincidencia (y uno si no encuentra ID). La nueva proyección `getRawOne` hace una lectura SQL, con un join a Artist. No se consulta el grafo de detalle.
- **Contrato preservado:** el artista ausente sigue pasando exactamente `''`; Spotify recibe `(artist.name ?? '', disc.name)`, y su payload se devuelve sin transformación. Disco ausente o error de lectura sigue siendo `NotFoundException('Disc with id <id> not found')`; errores de Spotify se propagan sin cambios. La ruta y permisos no cambian.
- **Hallazgo de rendimiento:** el endpoint cargaba el grafo de detalle solo para leer dos campos; esto aumentaba joins y lecturas sin modificar el payload Spotify. La proyección de nombres es backend-only y no necesita cambios frontend.
- **Responsabilidad estructural:** `getSpotifyTracks` queda dentro de `DiscsService` por ahora; la futura responsabilidad `spotify/` se deja para su secuencia prevista, sin extracción en D29.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code> (13 suites, 207 tests), <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D30 permanece pendiente.
- **Riesgo:** S.

### D29.1 — Extraer DiscWriteService

- [x] Completada
- **Objetivo:** agrupar la escritura de Disc sin cambiar comportamiento ni contratos.
- **Alcance:** `create`, `resolveArtist`, `createWithArtist`, `update` y `remove`; fachada `DiscsService`; provider de `DiscModule`.
- **Resultado:** métodos movidos a `src/discs/write/disc-write.service.ts`. `DiscWriteService` inyecta directamente los repositorios `Disc` y `Artist`; `DiscsService` mantiene y delega las cuatro firmas públicas de escritura. `resolveArtist` sigue privado dentro de Write. No se movieron `findOne` ni `getSpotifyTracks`, ni se añadieron helpers/normalización.
- **Pruebas:** los 23 tests funcionales de D24–D28 están en `write/disc-write.service.spec.ts`; `discs.service.spec.ts` conserva la delegación de fachada. Las pruebas controller→service permanecen junto al controller. Los hallazgos y contratos de D24–D28 se conservan sin cambios.
- **Tamaño:** `DiscWriteService` 149 líneas; `DiscsService` 468 líneas; suite de Write 754 líneas.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code> (14 suites, 208 tests), <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D30 permanece pendiente.

### D29.2 — Mover findOne a DiscCatalogService

- [x] Completada
- **Objetivo:** ubicar la lectura del detalle de Disc en la responsabilidad Catalog sin alterar contrato.
- **Alcance:** mover únicamente `findOne`; mantener `DiscsService.findOne` como fachada.
- **Resultado:** `DiscCatalogService.findOne` reutiliza su `Repository<Disc>`. Se conservan `where: { id }`, el grafo explícito `artist.country`, `genre`, `favorites.user`, `pendings.user` y `comments.user`, `findOneOrFail`, payload y traducción de cualquier error a 404 con el mensaje existente. No se tocaron eager, `getSpotifyTracks` ni `D39–D44`.
- **Pruebas:** las cuatro caracterizaciones de D23 (payload/grafo, relaciones opcionales, ausencia y fallo de repositorio traducido a 404) se trasladaron al spec de Catalog; el spec raíz conserva la delegación de fachada. No se duplicaron.
- **Tamaño:** `DiscCatalogService` 394 líneas; `DiscsService` 454 líneas.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code>, <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D30 permanece pendiente.

### D29.3 — Extraer DiscSpotifyService

- [x] Completada
- **Objetivo:** trasladar la lectura de tracks Spotify a su responsabilidad sin cambiar comportamiento ni contrato.
- **Alcance:** mover únicamente `getSpotifyTracks`; conservar `DiscsService` como fachada y registrar el provider.
- **Resultado:** `DiscSpotifyService` en `src/discs/spotify/disc-spotify.service.ts` inyecta directamente `Repository<Disc>` y `SpotifyApiService`. La query, proyección de `disc.name` y `artist.name`, `LEFT JOIN`, 404 de lectura y argumentos Spotify permanecen iguales. La fachada delega con el mismo `id` y devuelve el resultado intacto.
- **Pruebas:** las cuatro pruebas de D29 se trasladaron a `spotify/disc-spotify.service.spec.ts`; el spec raíz conserva la delegación de fachada. Los tests del controller permanecen junto a éste.
- **Tamaño:** `DiscSpotifyService` 42 líneas; `DiscsService` 432 líneas.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code> (15 suites, 209 tests), <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D30 permanece pendiente.

### D29.4 — Cleanup estructural del bloque D23–D29

- [x] Completada
- **Objetivo:** cerrar la estructura de detalle, escritura y Spotify sin alterar contrato ni comportamiento.
- **Revisión:** `DiscCatalogService.findOne` no contiene lógica pura separable; sus helpers existentes quedan bajo `catalog/helpers/`. `DiscSpotifyService` conserva junta la query y la coordinación Spotify. No se dividió Catalog por tamaño ni se extrajo lógica trivial de Spotify.
- **Helper:** la normalización de nombre visible de D25 estaba duplicada en las dos ramas que crean Artist. Se extrajo la función pura no trivial `normalizeArtistName` a `write/helpers/normalize-artist-name.ts`; elimina marcas diacríticas vía NFD, convierte a minúsculas y recorta extremos como antes. Sus dos ramas siguen usándola y el spec específico caracteriza el resultado.
- **Fachada:** `DiscsService` delega las operaciones ya extraídas de Write, Catalog, Calendar, Enrichment y Spotify. Conserva `Repository<Disc>` para Home/Stats y `SpotifyApiService` para `resolveSpotifyAlbum`/`getSpotifyAlbumDetails`; ambos siguen siendo necesarios. No quedan imports, dependencias ni métodos obsoletos de D23–D29.
- **Hallazgos:** se preservan los hallazgos contractuales, de rendimiento y de arquitectura de D23–D29. No se modifican queries, payloads, errores, permisos, DTOs, eager loading ni frontend. No se inicia D30 ni se mueve Home/Stats.
- **Tamaños:** `DiscsService` 432 líneas; `DiscCatalogService` 394; `DiscWriteService` 140; `DiscSpotifyService` 42.
- **Estructura:** `catalog/` contiene servicio, spec y cuatro helpers con sus specs; `write/` contiene servicio, spec y `helpers/normalize-artist-name.ts` con spec; `spotify/` contiene servicio y spec.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code> (16 suites, 211 tests), <code>tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D30 permanece pendiente.

### D30 — homeDiscs: filtros y parámetros SQL

- [x] Completada
- **Objetivo:** eliminar la duplicación accidental al construir filtros para las consultas principales y globales de homeDiscs.
- **Alcance:** dateRange, genreId, country/countryId, valores bind y construcción de cláusulas SQL dinámicas de findTopRatedOrFeaturedAndStats.
- **Fuera de alcance:** cambiar fórmulas, estadísticas por periodo o payload.
- **Dependencias:** D0.
- **Criterios de finalización:** cada valor sigue parametrizado; filtros de query principal y global son equivalentes; los parámetros no cambian de orden o tipo accidentalmente.
- **Verificaciones:** pruebas de filtros individuales/combinados y SQL/params; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Resultado (2026-10-04):** las queries principal y global aplicaban los mismos filtros, pero duplicaban toda su construcción. Se centralizó en `buildHomeDiscFilters`, que conserva las cláusulas y genera los placeholders con el desplazamiento requerido por el `userId` adicional de la query principal.
- **Caracterización:** el orden es fecha, `genreId`, país; sin `dateRange` se conserva `releaseDate <= today`. Un rango de dos valores enlaza `new Date(startDate)`, `new Date(endDate)` y `today`. `genreId` se enlaza como string. El país es `country || countryId`; un UUID (cualquiera de los dos campos) filtra `c.id`, y otro valor filtra `c.name`; el bind conserva el string recibido. La principal antepone `user.id` como `$1`; la global no lo recibe. Las condiciones restantes equivalen con placeholders desplazados en uno.
- **Hallazgo:** el significado de `country` depende de si su string parece UUID y tiene precedencia sobre `countryId`. Se preserva en D30; se documenta la ambigüedad contractual para decidir por separado si merece una mejora.
- **Tests:** casos sin filtros adicionales, por fecha, género, país nombre/UUID, combinaciones, precedencia/fallback, SQL y tipos/orden de los binds enviados a ambas queries.
- **Verificaciones:** con Node 20.20.2 pasan <code>yarn test src/discs --runInBand</code> (17 suites, 218 tests), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D31 permanece pendiente.

### D31 — homeDiscs: media global y mediana

- [x] Completada
- **Objetivo:** aislar la query que calcula globalAvgRate y medianVotes para la puntuación ponderada.
- **Alcance:** globalStatsQuery, condiciones de D30, conversión de valores y defaults cuando no hay datos.
- **Fuera de alcance:** fórmula de weightedScore o caché.
- **Dependencias:** D30.
- **Criterios de finalización:** media/mediana y fallback coinciden con baseline con ratings nulos, sin votos y varios discos; filtro temporal/género/país se aplica igual.
- **Verificaciones:** casos de agregación en PostgreSQL; revisar el SQL generado; <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.
- **Resultado (2026-10-04):** la query y la conversión se aislaron en `src/discs/home/home-global-stats.ts`; la llamada reutiliza `globalWhere` y `globalParams` de D30. El SQL de la query principal y la fórmula de `weightedScore` no cambiaron.
- **Definición SQL:** por cada `d.id` filtrado, `COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END)` cuenta solo ratings no nulos y `COALESCE(AVG(r.rate), 0)` calcula el promedio de los rates no nulos, sustituyendo por cero los discos sin rates válidos. `LEFT JOIN` y `GROUP BY d.id` mantienen una fila incluso para un disco sin rates. En la query exterior, `AVG(avgRates)` promedia esas medias por disco, incluyendo los ceros de discos sin votos; `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voteCount)` calcula la mediana continua de los recuentos de todos los discos filtrados, incluidos los ceros.
- **NULL, tipos y defaults:** sin discos, ambos agregados PostgreSQL retornan `NULL`. Con `rate` decimal, `AVG` retorna `numeric`; el driver `pg` entrega ese valor como string. `PERCENTILE_CONT` sobre `voteCount` integer retorna `double precision`, entregado por el driver como number. La conversión existente queda igual: `parseFloat(valor) || 0` para `globalAvgRate`, `parseInt(valor, 10) || 1` para `medianVotes`; por tanto NULL/media cero producen 0 y NULL/mediana cero producen 1.
- **PostgreSQL:** con cuatro discos que pasan filtros y fechas inclusivas (tasas válidas 4; 2 y 4; solo una tasa NULL; tasa 5), los valores por disco fueron 4, 3, 0 y 5; PostgreSQL devolvió media global `3.0000000000000000` y mediana de votos `1`. El fixture excluyó fechas fuera del rango, fecha posterior a `today`, otro género y otro país. Sin filas ambos resultados fueron NULL. Para recuentos 0 y 1, la mediana continua fue 0.5.
- **Tests:** cuatro tests del helper cubren SQL/filtros D30, conversión de resultados y defaults; cuatro tests PostgreSQL opcionales con tablas temporales verifican discos múltiples, rating NULL, disco sin votos, filtros, extremos inclusivos de `dateRange`, límite independiente de `today`, ausencia de filas, tipos del driver y mediana fraccionaria. Las tablas son temporales de sesión y no alteran datos persistentes.

### Contract finding

**Current behavior:** `globalAvgRate` es el promedio de los promedios por disco e incluye como cero los discos sin ratings válidos. `medianVotes` usa mediana continua y después `parseInt(..., 10) || 1`.

**Problem:** la media puede bajar por discos sin votos. Una mediana fraccionaria se trunca; si el valor es cero, el fallback la convierte en uno. Ambas decisiones afectan el prior de `weightedScore` y el orden de resultados.

**Impact:** Backend-only.

**Options:**

1. Preservar compatibilidad y la semántica actual.
2. Refactorizar internamente sin cambiar agregados ni conversiones.
3. Cambiar el universo de la media, el tipo de mediana o sus defaults.
4. Coordinar con frontend solo si una futura decisión modifica campos o el contrato expuesto; el cambio actual de ranking se origina en backend.

**Recommendation:** preservar en D31. Decidir cualquier ajuste analítico en una tarea independiente, caracterizando su efecto en el ranking antes de cambiarlo.

**Blocks the current task:** No; la query quedó aislada y sus resultados/efectos actuales se verificaron sin cambiar la semántica.

- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (19 suites, 226 tests; incluye PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D32 permanece pendiente.

### D32 — homeDiscs: discos destacados y ranking

- [x] Completada
- **Objetivo:** simplificar la consulta que obtiene los 20 discos rateados o pinned y su orden de puntuación.
- **Alcance:** joins disc/artist/country/genre/rate, HAVING, weightedScore, orden y límite.
- **Fuera de alcance:** estadísticas auxiliares y modificar la fórmula ponderada.
- **Dependencias:** D30, D31.
- **Criterios de finalización:** incluye los mismos discos rateados o pinned; weightedScore, desempates observables, orden y límite mantienen el baseline; joins no multiplican métricas.
- **Verificaciones:** pruebas PostgreSQL con pinned sin votos, ratings repetidos y filtros; revisar EXPLAIN ANALYZE si se propone optimizar el plan.
- **Riesgo:** M.
- **Resultado (2026-10-04):** se caracterizó la query de producción y no se cambió su SQL. No hay una simplificación con equivalencia demostrable para toda la cardinalidad permitida por las tablas y que, además, preserve la selección no determinista de empates.
- **Membresía y métricas:** tras los filtros principales de D30, `HAVING COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) > 0 OR d."pinned" = true` incluye discos con al menos un rate no nulo y todos los pinned, aunque no tengan votos; excluye discos sin rates válidos que no estén pinned, incluidos los que solo tienen rates NULL. `COUNT(CASE...)` es el número de votos válidos y `COALESCE(AVG(r.rate), 0)` su media por disco. `averageCover` se calcula aparte y no entra en `weightedScore`.
- **Fórmula:** `((COALESCE(AVG(r.rate), 0) * COUNT(valid rates)) + (globalAvgRate * medianVotes)) / (COUNT(valid rates) + medianVotes)`. Los parámetros globales provienen de D31; la expresión SQL y sus defaults permanecen idénticos.
- **Joins y cardinalidad:** Artist, Country y Genre son joins a referencias many-to-one. Rate es one-to-many y aporta las filas que se agregan por disco. Favorite y Pending se unen para el usuario actual; no hay unicidad `(discId, userId)` declarada en entidades/migraciones. `f.id` aparece en el `GROUP BY`, por lo que Favorites duplicados pueden dar varias filas del mismo disco, cada una con el conteo de ratings original. `p.id` no está agrupado: Pendings duplicados multiplican las filas de rate antes del agregado y elevan `voteCount`/`weightedScore`. `commentCount` usa subquery correlacionada y no expande el join. PostgreSQL confirmó cada uno de esos casos.
- **Orden y límite:** únicamente `ORDER BY "weightedScore" DESC`, seguido por `LIMIT 20`. No hay criterio secundario; PostgreSQL no garantiza orden entre scores iguales y, si el empate cruza el límite, tampoco qué filas empatadas quedan. Se conserva esa selección actual.
- **Tests:** cinco pruebas PostgreSQL optativas llaman el método de producción y ejecutan sus queries contra tablas temporales: membership/HAVING, rates repetidos y NULL, filtros D30, score y orden, límites inclusivos, corte `today`, pinned empatados con límite 20, Favorites duplicados y multiplicación de ratings por Pendings duplicados. La prueba de empate verifica el conjunto y el límite sin afirmar orden físico dentro del empate.
- **Rendimiento:** no se propuso ni aplicó optimización SQL; no se ejecutó `EXPLAIN ANALYZE`. No se añade candidato nuevo: `rate(discId)` ya figura para D45 y también cubre el join agregado de este ranking; cualquier cambio de índice/plan queda para D45.

### Contract finding

**Current behavior:** el ranking ordena solo por `weightedScore DESC`; no define desempate. El join de Favorite se agrupa por `f.id`; filas duplicadas pueden repetir un disco. El join de Pending no agrupa por `p.id`; filas duplicadas multiplican los rates agregados y alteran el score. El esquema no declara unicidad por usuario y disco para estos estados.

**Problem:** los scores empatados tienen orden no especificado y pueden cambiar qué discos ocupan los últimos puestos del límite 20. Las filas de Favorite/Pending duplicadas pueden repetir discos o alterar el count/score; quitar joins o agregar restricciones cambiaría el resultado para esos datos.

**Impact:** Backend + frontend.

**Options:**

1. Preservar compatibilidad y ambos comportamientos actuales.
2. Refactorizar internamente solo si se prueba equivalencia también con estados duplicados y empates.
3. Definir un desempate estable o cambiar la deduplicación/membresía como cambio contractual.
4. Coordinar con frontend si se decide cambiar orden o filas que recibe.

**Recommendation:** preservar en D32. Evaluar en tareas independientes si se quieren limpiar estados duplicados, corregir el fanout de Pending y fijar un desempate; los cambios de estado/joins corresponden a una decisión explícita posterior a D33.

**Blocks the current task:** No; D32 caracteriza y conserva el orden, el límite y la cardinalidad vigentes.

- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (20 suites, 231 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D33 permanece pendiente.

### D33 — homeDiscs: estado personal

- [x] Completada
- **Objetivo:** caracterizar y aislar el mapping de tasa/cover, favorito y pendiente del usuario sin alterar la query rankeada.
- **Alcance:** subqueries/joins actuales para userRateId, userFavoriteId, pendingId, userRate y userCover, y su mapeo.
- **Fuera de alcance:** cambiar qué usuario se consulta o exponer nuevas relaciones.
- **Dependencias:** D32.
- **Criterios de finalización:** las combinaciones sin estados duplicados mantienen identificadores y valores; la cardinalidad con duplicados conserva el comportamiento PostgreSQL vigente, incluido el split por Favorite y el fanout de Pending.
- **Verificaciones:** pruebas unitarias del mapping y suite PostgreSQL optativa para estados y cardinalidad.
- **Riesgo:** M.
- **Resultado (2026-10-04):** la SQL, sus joins, `GROUP BY`, ranking y payload no cambiaron. Se extrajo únicamente `mapHomePersonalState` a `src/discs/home/home-personal-state.ts`; el helper conserva el objeto `userRate` condicionado por `userRateId`, las conversiones `parseFloat(...) || null` y los fallbacks actuales de IDs.
- **Selección y mapping:** la query tiene cinco subqueries correlacionadas con el usuario actual y `LIMIT 1`: tres para `rate.id`, `rate.rate` y `rate.cover`, una para `favorite.id` y una para `pending.id`. Ninguna incluye `ORDER BY`; no hay una selección determinista si existen candidatos repetidos. Las tres subqueries de rate son independientes y podrían tomar candidatos distintos. `favoriteId` y `pendingId` usan `id || null`; solo se crea `userRate` cuando `userRateId` es truthy. Rate/cover pasan por `parseFloat(...) || null`, por lo que `NULL`, valores no numéricos y cero se exponen como `null`.
- **Joins y agregados:** Artist, Country y Genre son joins many-to-one. Rate, Favorite y Pending se unen por `discId`, limitando estos dos últimos al usuario actual. El `GROUP BY` incluye `d.id, a.name, g.name, g.color, f.id, c.id, c.name, c."isoCode"`; no incluye `p.id`. Rate alimenta `voteCount`, `averageRate`, `averageCover` y `weightedScore`. Favorite no altera esas métricas cuando cada ID forma su propio grupo, pero Favorites duplicados producen filas repetidas para el mismo disco. Pendings duplicados multiplican uniformemente las filas de Rate antes de agregar: elevan `voteCount` y pueden cambiar `weightedScore`, mientras `averageRate` y `averageCover` permanecen iguales. Esa query queda intacta según el resultado de D32. Con un único registro de cada estado y un rate del usuario, la salida contiene una fila.
- **Tests:** cinco tests unitarios cubren ausencia, rate, cover NULL-rate, favorito, pendiente, combinación, conversiones SQL y defaults. Cinco tests PostgreSQL optativos llaman la query de producción contra tablas temporales y verifican usuario sin estado frente a otros usuarios, rate/cover, favorite y pending individual/combinado, varios rates candidatos, subqueries/`GROUP BY`, una fila sin duplicados, dos filas para Favorite duplicado y fanout/score para Pending duplicado.
- **Rendimiento:** no se modificó la SQL ni se propuso optimización; no se ejecutó `EXPLAIN ANALYZE` ni se encontró candidato nuevo para D45.

### Contract finding

**Current behavior:** las subqueries personales de rate (`id`, `rate`, `cover`), Favorite y Pending usan `LIMIT 1` sin orden. Las tres subqueries de rate se evalúan por separado. El join principal conserva la cardinalidad ya descrita en D32: Favorites repetidos dividen el grupo por `f.id`, mientras Pendings repetidos multiplican las filas de Rate.

**Problem:** con varios rates del mismo usuario/disco, el `userRate` mapeado puede combinar el ID, rate y cover de candidatos distintos, sin una regla estable. Favorite/Pending duplicados también pueden repetir el disco o alterar estadísticas del ranking. Los servicios de creación inspeccionados guardan el registro sin comprobación previa de existencia y el esquema no declara unicidad por usuario/disco.

**Impact:** Backend + frontend para filas/estadísticas duplicadas; backend-only para la selección incoherente de los valores personales dentro del objeto existente.

**Options:**

1. Preservar los resultados actuales para compatibilidad.
2. Refactorizar internamente solo después de definir una selección equivalente y determinista.
3. Cambiar el contrato o la cardinalidad para deduplicar y elegir un rate canónico.
4. Coordinar una refactorización backend/frontend si cambia qué filas recibe la UI.

**Recommendation:** preservar en D33. Si se decide limpiar estados duplicados o fijar una fila canónica de rate, caracterizarlo como cambio independiente de datos/contrato y coordinar la cardinalidad con frontend; no introducir una corrección silenciosa en el refactor actual.

**Blocks the current task:** No; el mapping se aisló sin cambiar selección, ranking, métricas, cardinalidad ni payload.

- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (22 suites, 241 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D34 permanece pendiente.

### D34 — homeDiscs: totalDiscs y totalVotes

- [x] Completada
- **Objetivo:** precisar el alcance temporal de los contadores generales y reducir lecturas redundantes si la semántica lo permite.
- **Alcance:** las queries de totalDiscs/totalVotes con y sin statsDateRange.
- **Fuera de alcance:** imponer filtros de genre/country o releaseDate al conteo si no aparecen en el comportamiento actual.
- **Dependencias:** D30.
- **Criterios de finalización:** se mantiene la diferencia actual entre la ventana statsDateRange y el caso sin rango; rate null no cuenta como voto; cero datos devuelve cero.
- **Verificaciones:** pruebas unitarias de SQL, params y conversión; PostgreSQL para rango, fecha borde, nulos y múltiples rates.
- **Riesgo:** S.
- **Resultado (2026-10-04):** `totalDiscs` y `totalVotes` se cargan en una sola query mediante `loadHomeDiscTotals`. Se redujeron dos lecturas a una sin alterar valores ni tipos expuestos. `totalDiscs` cuenta discos distintos; `totalVotes` cuenta cada rate cuyo `rate IS NOT NULL`.
- **Alcance temporal:** sin `statsDateRange` de dos elementos se cuenta todo el catálogo, incluidos discos con `releaseDate` NULL, y todos sus rates válidos. Con dos elementos, ambos contadores solo consideran discos cuyo `releaseDate BETWEEN start AND end`; PostgreSQL confirma que los extremos son inclusivos. Rates múltiples del mismo disco cuentan individualmente. El rango se enlaza como dos objetos Date, en orden start/end.
- **Filtros:** estos contadores no aplican `dateRange`, `genreId`, `country` ni `countryId` del ranking principal. Solo `statsDateRange` limita por `releaseDate`. No se añadieron esos filtros ni se cambió su semántica.
- **Tipos y defaults:** PostgreSQL devuelve `COUNT` como `bigint`; node-postgres entrega ambos valores como strings. La implementación convierte con `parseInt(value, 10) || 0` y retorna números JS. Las agregaciones devuelven una fila incluso en tablas vacías y ambos resultados son `'0'`, convertidos a `0`.
- **Tests:** tres unitarios verifican una sola llamada, forma de SQL y ausencia de filtros ajenos, binds Date/orden y conversiones/defaults. Tres tests PostgreSQL optativos cubren catálogo completo, varias rates por disco, `rate NULL`, rango con límites exactos, discos fuera de rango y `releaseDate NULL`, cero votos y catálogo vacío.
- **Rendimiento:** no se ejecutó `EXPLAIN ANALYZE`; la reducción de lecturas se verificó por la única llamada al repositorio y el resultado PostgreSQL. No se añade candidato nuevo: `disc(releaseDate)` y `rate(discId)` ya están registrados para D45.

### Contract finding

**Current behavior:** `totalDiscs` y `totalVotes` ignoran los filtros del bloque principal (`dateRange`, género y país). Solo `statsDateRange` filtra ambos contadores por `Disc.releaseDate`; cuando falta, cuentan todo el catálogo, incluso discos sin fecha.

**Problem:** los contadores pueden describir un universo distinto al de los discos filtrados que aparecen junto a ellos, lo que puede resultar confuso si el consumidor interpreta las cifras como totales del resultado principal.

**Impact:** Backend + frontend.

**Options:**

1. Preservar compatibilidad con el alcance actual.
2. Refactorizar internamente la carga sin alterar los universos.
3. Cambiar los contadores para que hereden filtros del ranking.
4. Coordinar con frontend una definición y presentación distintas de los totales.

**Recommendation:** preservar en D34. Si el producto espera cifras del conjunto filtrado, definir ese alcance en una tarea contractual independiente con los consumidores frontend antes de cambiarlo.

**Blocks the current task:** No; la query combinada reproduce ambos universos y la salida actual.

- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (24 suites, 247 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D35 permanece pendiente.

### D35 — homeDiscs: top users por rate

- [x] Completada
- **Objetivo:** aislar el ranking de usuarios por número de ratings.
- **Alcance:** topUsersByRates query, statsDateRange, agrupación y mapping.
- **Fuera de alcance:** estadísticas de cover y cambios de desempate/límite.
- **Dependencias:** D30.
- **Criterios de finalización:** cuenta solo rate no null, aplica el rango actual, conserva top 20 y estructura user/rateCount.
- **Verificaciones:** PostgreSQL con empates, nulos, varios rates del mismo usuario, rango temporal y límite 20.
- **Riesgo:** S.
- **Resultado (2026-10-04):** query y mapping aislados en `src/discs/home/home-top-users-by-rates.ts`; `DiscsService` delega y devuelve la estructura generada sin cambiar el payload.
- **Semántica:** se unen Rate con User y Disc; solo cuentan filas con `r.rate IS NOT NULL`. `COUNT(r.id)` cuenta cada fila de Rate, incluidas varias del mismo usuario/disco. Se agrupa por `u.id, u.username`, se proyectan esos dos campos y `rateCount`, y se ordena únicamente por `rateCount DESC` antes de `LIMIT 20`. Los empates no tienen orden secundario y su orden/membresía al cruzar el límite no está garantizado.
- **Tiempo:** si `statsDateRange` tiene exactamente dos elementos, añade `d."releaseDate" BETWEEN $1 AND $2` con dos valores `Date` en orden inicio/fin; ambos extremos son inclusivos. Sin ese rango, no limita por fecha. No hereda `dateRange`, género ni país del ranking principal.
- **Tipos y mapping:** PostgreSQL `COUNT` retorna `bigint`, recibido por node-postgres como string y convertido con `parseInt(..., 10)`. La salida conserva `{ user: { id, username }, rateCount }`. El ID UUID llega y se expone como string; la firma de retorno de `DiscsService` lo declara actualmente `number`, discrepancia tipada sin efecto sobre el JSON.
- **Tests:** tres unitarios cubren SQL/proyección/agrupación/orden sin desempate, binds de rango y resultado vacío. Cuatro tests PostgreSQL optativos prueban múltiples usuarios, empate sin imponer orden, exclusión de NULL, múltiples rates de un mismo usuario, ambas fechas borde, usuarios/discos fuera del rango, resultado vacío y límite 20.
- **Rendimiento:** no se modificó el plan ni se ejecutó `EXPLAIN ANALYZE`; no se registra candidato nuevo para D45, donde ya constan `rate(discId)`, índices por `userId`/`discId` y `disc(releaseDate)`.

### Contract finding

**Current behavior:** el ranking ordena solo por `rateCount DESC` y limita a 20, sin desempate. La query proyecta `users.id` (UUID) como `user.id` string en runtime, aunque el tipo de retorno de `DiscsService` declara `id: number`.

**Problem:** si hay un empate en el puesto 20, PostgreSQL no garantiza qué usuario queda dentro ni el orden entre empatados. Además, el tipo TypeScript de la fachada no describe el ID que devuelve el esquema.

**Impact:** Backend + frontend para la selección/orden de usuarios empatados; backend-only para la firma TypeScript, ya que el consumidor frontend usa el ID como key y muestra username/count, sin exigir que sea numérico.

**Options:**

1. Preservar el orden indeterminado y el JSON actual.
2. Corregir únicamente la firma TypeScript para reflejar el UUID string sin alterar el JSON.
3. Definir un desempate estable como cambio del ranking.
4. Coordinar cambios con frontend solo si se decide modificar el orden o los usuarios seleccionados.

**Recommendation:** preservar en D35 y abordar la firma de ID como corrección de tipos independiente. Definir un desempate solo si producto necesita estabilidad explícita y tras considerar que puede cambiar la selección actual del top 20.

**Blocks the current task:** No; la query conserva el mismo conteo, límite y orden sin desempate, y el mapping conserva el UUID string observable.

- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 D35_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (26 suites, 254 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D36 permanece pendiente.

### D36 — homeDiscs: top users por cover

- [x] Completada
- **Objetivo:** aislar el ranking de usuarios por cantidad de covers valoradas.
- **Alcance:** topUsersByCover query, statsDateRange, agrupación y mapping.
- **Fuera de alcance:** ranking por rate y cambios de contrato.
- **Dependencias:** D30.
- **Criterios de finalización:** cuenta solo cover no null, mantiene el nombre totalCover, rango y top 20 actuales.
- **Verificaciones:** PostgreSQL con cover NULL/no NULL, rate NULL, empate, rango temporal y límite 20.
- **Riesgo:** S.
- **Resultado (2026-10-04):** query y mapping aislados en `src/discs/home/home-top-users-by-cover.ts`; `DiscsService` delega sin cambiar el payload ni el orden.
- **Semántica:** joins internos de Rate con User y Disc; cuenta cada fila donde `r.cover IS NOT NULL` mediante `COUNT(r.id)`. No exige `rate IS NOT NULL`, por lo que una fila con cover y rate NULL cuenta; varias covers del mismo usuario cuentan individualmente. Agrupa por `u.id, u.username`, proyecta esos campos y `coverCount`, y ordena solo por `coverCount DESC` antes de `LIMIT 20`. Los empates carecen de desempate y el orden/membresía al cruzar el límite no está garantizado.
- **Tiempo:** cuando `statsDateRange` tiene dos valores, filtra por `d."releaseDate" BETWEEN $1 AND $2` con valores `Date` inicio/fin y límites inclusivos. Sin rango no limita por fecha. No hereda los filtros principales `dateRange`, género o país.
- **Tipos y mapping:** PostgreSQL `COUNT` retorna `bigint`, que node-postgres entrega como string; el mapper aplica `parseInt(..., 10)`. El payload conserva `{ user: { id, username }, totalCover }`; User.id se proyecta como UUID string, aunque el tipo de retorno de la fachada lo declara `number`, según el hallazgo anotado en D35.
- **Tests:** tres unitarios verifican SQL, filtro de cover, agrupación, orden sin desempate, binds y mapping vacío. Cuatro tests PostgreSQL optativos cubren varios usuarios, empates, `cover NULL`, cover con rate NULL, múltiples covers por usuario, rango y extremos exactos, discos fuera de rango/con fecha NULL, resultado vacío y límite 20.
- **Rendimiento:** no se cambió el plan ni se ejecutó `EXPLAIN ANALYZE`; no aparece candidato nuevo para D45, que ya registra `rate(discId)`, columnas de estado `userId`/`discId` y `disc(releaseDate)`.

### Contract finding

**Current behavior:** el ranking ordena únicamente por `totalCover DESC` y limita a 20, sin desempate. La salida proyecta `users.id` UUID como string aunque el tipo TypeScript de la fachada indica number.

**Problem:** PostgreSQL no garantiza el orden ni la selección de usuarios empatados cuando el empate cruza el límite 20; la firma tipada tampoco refleja el ID real.

**Impact:** Backend + frontend para orden/selección de empates; backend-only para la discrepancia de tipo, ya que el consumidor usa el ID como key y muestra username/count.

**Options:**

1. Preservar el orden indeterminado y el JSON actual.
2. Corregir la firma TypeScript para UUID string sin cambiar el JSON.
3. Definir un desempate estable como cambio del ranking.
4. Coordinar con frontend si cambia el orden o la selección del top 20.

**Recommendation:** preservar en D36 y tratar la corrección de tipo por separado. Añadir desempate solo tras decidir que la estabilidad justifica modificar la selección actual.

**Blocks the current task:** No; se conservan filtros, conteo, límite, estructura y orden SQL.

- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 D35_POSTGRES_TEST=1 D36_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (28 suites, 261 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D37 permanece pendiente.

### D37 — homeDiscs: distribución de ratings

- [x] Completada
- **Objetivo:** caracterizar el rango independiente de la distribución y sus valores decimales.
- **Alcance:** distributionDateRange, agrupación por rate, orden y conversión del resultado.
- **Fuera de alcance:** hacer que herede filtros de otra estadística o cambiar la escala de rate.
- **Dependencias:** D30.
- **Criterios de finalización:** solo se agrupan rates no null; se preservan rango, orden ascendente y tipos numéricos del payload.
- **Verificaciones:** PostgreSQL con decimales, repetidos, NULL, resultado vacío, rango independiente y ambos extremos.
- **Riesgo:** S.
- **Resultado (2026-10-04):** query y mapping aislados en `src/discs/home/home-rating-distribution.ts`; `DiscsService` delega y conserva el campo `ratingDistribution` del response sin alterar el envelope.
- **Semántica:** participan las filas Rate con `rate IS NOT NULL`, unidas a Disc por `discId`. Se agrupa por el valor numérico exacto `r.rate`; ratings repetidos producen un grupo cuyo count es el número de filas. La query aplica `ORDER BY r.rate` ascendente.
- **Rango independiente:** solo `distributionDateRange` agrega `d."releaseDate" BETWEEN $1 AND $2`, con extremos inclusivos y dos valores Date. No hereda `statsDateRange`, `dateRange`, genre ni country; la función recibe únicamente `distributionDateRange`.
- **Tipos y payload:** PostgreSQL devuelve `numeric(4,2)` como string, conservando la escala en el valor raw (por ejemplo, `'4.50'`), y `COUNT(*)` (`bigint`) como string. El mapping aplica `parseFloat(rateValue)` y `parseInt(count, 10)`, y retorna una lista `{ rate: number, count: number }[]`; sin grupos, devuelve `[]`.
- **Tests:** tres unitarios prueban SQL/filtros independientes, rango y binds, orden y conversión vacía; tres tests PostgreSQL optativos comprueban decimales, agrupación de repetidos, rate NULL, orden ascendente, extremos inclusivos, fecha fuera de rango y NULL, y resultado vacío.
- **Rendimiento:** no se modificó el plan ni se ejecutó `EXPLAIN ANALYZE`; no hay candidato nuevo para D45, donde ya constan `rate(discId)` y `disc(releaseDate)`.
- **Hallazgos:** no se detectó una incompatibilidad nueva. `distributionDateRange` es un filtro independiente explícito y el consumer del Dashboard inspeccionado pasa el rango elegido para las estadísticas también como rango de distribución; se conserva el alcance que permite la API.
- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 D35_POSTGRES_TEST=1 D36_POSTGRES_TEST=1 D37_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (30 suites, 267 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D38 permanece pendiente.

### D38 — homeDiscs: mapping y envelope

- [x] Cerrada (2026-10-04)
- **Objetivo:** mantener la respuesta combinada al separar la carga de discos de los cuatro grupos de estadísticas.
- **Alcance:** artist/country/genre, usuario, métricas, topUsersByRates, topUsersByCover, ratingDistribution y envelope final.
- **Fuera de alcance:** renombrar claves, cambiar null/0 o dividir la ruta.
- **Dependencias:** D31, D32, D33, D34, D35, D36, D37.
- **Resultado:** se extrajo el mapper puro por disco a `src/discs/home/map-home-ranked-disc.ts`; conserva el spread del row SQL, mapping Artist/Country/Genre, estado personal y conversiones numéricas. El envelope mantiene exactamente `discs`, `totalDiscs`, `totalVotes`, `topUsersByRates`, `topUsersByCover` y `ratingDistribution`. Los top users siguen como `{ user: { id, username }, rateCount }` y `{ user: { id, username }, totalCover }`; la distribución sigue como `{ rate, count }`. Totales, métricas de rating/cover, votos, comentarios, conteos, rating y distribución son números; los valores null de métricas por disco se convierten a 0; sin estado personal se devuelven `userRate`, `favoriteId` y `pendingId` como null; relaciones opcionales mantienen objetos Artist/Country/Genre con los campos actuales null. Los arrays estadísticos vacíos permanecen `[]`; respuesta sin filas conserva totales 0.
- **Aliases:** `userId`, `coverCount` y `rateValue` de las queries extraídas se convierten a las claves públicas actuales y no se filtran al envelope. Las columnas y aliases del row de la query principal permanecen observables por `...disc`, incluido `weightedScore`; se conserva este comportamiento histórico y se prueba expresamente.
- **Contrato:** ver hallazgo detallado a continuación. No bloquea D38, que fija el comportamiento actual sin alterarlo.
- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 D35_POSTGRES_TEST=1 D36_POSTGRES_TEST=1 D37_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (32 suites, 273 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D39 permanece pendiente.

### Contract finding

**Current behavior:** cada elemento de `discs` combina los campos de `d.*` con aliases de la query principal porque el mapper hace spread del row completo. Entre ellos se exponen `artistName`, `countryId`, `countryName`, `countryIsoCode`, `genreName`, `genreColor`, `userRateId`, `userFavoriteId`, `voteCount`, `averageRate`, `averageCover`, `userRate`, `userCover`, `commentCount` y `weightedScore`, además de las relaciones y campos derivados mapeados.

**Problem:** el payload repite datos ya representados en `artist`, `genre`, `userRate`, `favoriteId`, `pendingId` y métricas. `weightedScore` también se expone aunque sirve para el orden. No se ha confirmado si callers consumen estos aliases.

**Impact:** backend + frontend.

**Options:**

1. Preservar compatibilidad y clasificar consumidores antes de retirar aliases.
2. Refactorizar internamente solo cuando no cambie el row público; el spread actual mantiene la exposición.
3. Cambiar el contrato retirando aliases redundantes, con decisión y migración explícitas.
4. Coordinar backend/frontend si se confirma que algún consumidor depende de ellos.

**Recommendation:** preservar compatibilidad durante D38 y revisar consumidores antes de una futura reducción contractual; D39–D44 ya requieren el inventario de callers y pueden aportar esa evidencia.

**Blocks the current task:** No. D38 caracteriza y conserva todos los campos observables; retirar aliases queda fuera del alcance aprobado.
- **Riesgo:** M.

### D38.1 — Extraer DiscHomeService

- [x] Completada (2026-10-04)
- **Objetivo:** trasladar la operación Home/Stats a un servicio cohesivo sin cambiar queries, comportamiento ni contrato.
- **Alcance:** `findTopRatedOrFeaturedAndStats`, coordinación D30–D38, fachada `DiscsService` y pruebas de la operación.
- **Fuera de alcance:** cleanup adicional de helpers (D38.2), cambios de contrato o avance a D39.
- **Dependencias:** D30–D38.
- **Resultado:** se creó `src/discs/home/disc-home.service.ts` con el método completo y su coordinación de filtros, ranking, estadísticas y envelope. Inyecta únicamente `Repository<Disc>`. `DiscsService` conserva la firma pública y delega el mismo `paginationDto`, `user` y `genreId`; `DiscModule` registra el nuevo provider. SQL, parámetros, fórmulas, orden, cardinalidad, aliases observables, null/0, errores y payload permanecen intactos.
- **Tests:** la caracterización funcional del método se trasladó a `src/discs/home/disc-home.service.spec.ts`, incluida la comprobación de filtros y parámetros D30 y el envelope D38. Las suites PostgreSQL D32 y D33 ahora llaman `DiscHomeService`. `src/discs/__tests__/discs.service.spec.ts` conserva la prueba de delegación Home; las pruebas unitarias de helpers permanecen junto a sus helpers.
- **Tamaños:** `DiscHomeService` tiene 134 líneas y `DiscsService` 135 líneas. No se realizó cleanup adicional de los helpers.
- **Estructura Home:** servicio/spec de coordinación; helpers de filtros, stats globales, estado personal y mapper, totals, top users por rate/cover y distribución, con sus specs unitarios y PostgreSQL existentes.
- **Hallazgos:** se conservan los hallazgos contractuales de D30–D38, incluido el comportamiento histórico de aliases de la query principal. No se corrigió ninguno.
- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 D35_POSTGRES_TEST=1 D36_POSTGRES_TEST=1 D37_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (32 suites, 274 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D39 permanece pendiente.

### D38.2 — Cleanup estructural de Home

- [x] Completada (2026-10-04)
- **Objetivo:** dejar `DiscHomeService` centrado en la coordinación Home y organizar los helpers por responsabilidad.
- **Alcance:** estructura de `src/discs/home/`, filtros D30 y preparación de fechas compartida por las estadísticas.
- **Fuera de alcance:** cambios de SQL, contratos o hallazgos; no se avanza D39.
- **Resultado:** se movieron `home-disc-filters.ts` y su spec a `home/`, junto a la responsabilidad que los usa. Se añadió `home-date-range.ts` para compartir el fragmento `releaseDate BETWEEN` y la conversión de rangos D34–D37 a los mismos dos binds `Date`; cada loader conserva la posición del fragmento (`WHERE` o `AND`) y su query local. No se descartó ningún helper.
- **Revisión por responsabilidad:** `DiscHomeService` conserva Repository, query/ranking principal y coordinación de filtros, estadísticas y respuesta. `home-global-stats`, `home-personal-state`, `home-totals`, `home-top-users-by-rates`, `home-top-users-by-cover`, `home-rating-distribution` y `map-home-ranked-disc` mantienen límites claros y SQL/mapping específicos. Los loaders de rate y cover comparten forma, pero sus predicados, alias y claves públicas son distintos; se mantienen separados para no crear una abstracción genérica de ranking.
- **Duplicación y cobertura:** se eliminó la repetición del fragmento SQL y de detección/conversión del rango temporal entre totals, ambos top users y distribución. La construcción D30 usa conversión distinta y conserva su política independiente. Cada helper puro tiene spec directo o cobertura cercana; `home-date-range.spec.ts` cubre las condiciones exactas, binds, tipos/orden y rangos incompletos; los specs de los cuatro loaders comprueban su integración. Las pruebas PostgreSQL D31–D37 siguen verificando sus agregados y rangos reales.
- **Limpieza:** no quedaron imports Home en `DiscsService`, variables obsoletas ni código sin uso en los helpers revisados. No se dividió `DiscHomeService`, que permanece cohesionado.
- **Tamaños:** `DiscHomeService`, 133 líneas; `DiscsService`, 135 líneas.
- **Estructura:** `home/` contiene coordinación, filtros, preparación de rango, stats globales, estado personal, totals, rankings por rate/cover, distribución, mapping de disco y los specs unitarios/PostgreSQL asociados.
- **Hallazgos:** se conservan todos los hallazgos D30–D38; ninguno se corrigió.
- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 D35_POSTGRES_TEST=1 D36_POSTGRES_TEST=1 D37_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (33 suites, 277 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D39 permanece pendiente.

### D38.3 — Organizar Home y limpiar imports/dependencias

- [x] Completada (2026-10-04)
- **Objetivo:** organizar `home/` por responsabilidad y eliminar residuos de imports/dependencias sin cambiar comportamiento.
- **Alcance:** estructura Home, rutas de imports, tipos exportados y auditoría de `DiscsService`, `DiscHomeService` y `DiscModule`.
- **Fuera de alcance:** cambios de SQL, contratos, queries o avance a D39.
- **Estructura:** la raíz de `home/` contiene únicamente `disc-home.service.ts` y `disc-home.service.spec.ts`. `loaders/` reúne los loaders de global stats, totals, top users por rates/cover y rating distribution, con sus specs unitarios. `helpers/` reúne filtros, rango de fechas, estado personal y ranked-disc mapping, con sus specs unitarios. `__tests__/` contiene las siete suites PostgreSQL/integración D31–D37.
- **Imports y exports:** se actualizaron las rutas internas tras los movimientos; no quedan imports desde ubicaciones antiguas. `HomeGlobalStats`, `HomeDiscTotals` y `HomeRatingDistributionItem` dejaron de exportarse porque no tienen consumidores externos. Los exports de funciones sí tienen consumidores en la coordinación o los tests.
- **Dependencias:** `DiscsService` inyecta sus siete servicios usados por la fachada. `DiscHomeService` inyecta únicamente `Repository<Disc>`. La lista de providers, `TypeOrmModule.forFeature` y los imports de `DiscModule` ya tenían consumidores reales; no se requirieron cambios en `discs.module.ts`.
- **Comportamiento:** no se modificaron SQL, binds, filtros, fórmulas, ranking, cardinalidad, payload ni semántica null/0. Se conservan los hallazgos D30–D38.
- **Tamaños:** `DiscHomeService`, 133 líneas; `DiscsService`, 135 líneas.
- **Verificaciones:** con Node 20.20.2 pasan <code>D31_POSTGRES_TEST=1 D32_POSTGRES_TEST=1 D33_POSTGRES_TEST=1 D34_POSTGRES_TEST=1 D35_POSTGRES_TEST=1 D36_POSTGRES_TEST=1 D37_POSTGRES_TEST=1 yarn test src/discs --runInBand</code> (33 suites, 277 tests; PostgreSQL local), <code>./node_modules/.bin/tsc --noEmit -p tsconfig.build.json</code> y <code>git diff --check</code>.
- **Siguiente:** D39 permanece pendiente.

### D39 — Eager loading: inventario y consumidores

- [x] Completada (2026-10-04)
- **Objetivo:** inventariar el contrato observable y determinar con evidencia qué callers dependen de cada relación eager.
- **Alcance:** eager de Disc.artist, Disc.genre, Disc.favorites, Disc.pendings y Disc.comments; revisar endpoints, callers de Disc en el repositorio y relaciones próximas como Artist.country, Rate.disc y Asignation.disc. Revisar consumidores/frontend cuando su código o evidencia esté disponible; si no puede confirmarse el consumo, clasificar la relación como OBSERVABLE PERO NO CONFIRMADA.
- **Fuera de alcance:** cambiar eager en entidades de otros módulos o cambiar el grafo visible sin pruebas.
- **Dependencias:** D7, D10, D11, D14, D16, D20, D23, D24, D26, D27, D29, D38.
- **Criterios de finalización:** existe una matriz por relación con: endpoint/caller afectado; clasificación REQUERIDA, OBSERVABLE PERO NO CONFIRMADA o NO CONSUMIDA; forma actual de carga; forma explícita prevista; test que protege el comportamiento; y si se puede o no retirar el eager. Cada consumer externo queda cubierto o anotado para su fase propietaria. Una relación no verificada no se marca como NO CONSUMIDA. Solo se acuerda retirar eager cuando los consumidores están identificados y cubiertos; en los demás casos se mantiene.
- **Verificaciones:** revisión de usos de repository.find/findOne y QueryBuilder, pruebas de los consumidores afectados; <code>pnpm build</code>.
- **Riesgo:** M.

#### Inventario de Disc y consumidores

La carga eager de `Disc` solo aplica automáticamente a operaciones TypeORM `find*`; los QueryBuilder del módulo y de los consumidores relacionados cargan lo que declaran con joins/selects. Las filas agrupan operaciones con la misma evidencia de uso. `OBSERVABLE PERO NO CONFIRMADA` significa que la respuesta incluye la relación pero no se localizó un consumidor verificable para ese payload concreto.

| Relación | Endpoint/caller | Carga actual y presencia en payload | Uso comprobado | Clasificación | Carga explícita que preserva el uso | Test protector existente / faltante | ¿Retirar eager? |
|---|---|---|---|---|---|---|---|
| `Disc.artist` | `GET /discs/:id` (detalle) | `findOneOrFail` declara `artist.country`; retorna `Disc` completo. | Ningún uso de este endpoint localizado en el frontend; la respuesta sí contiene artista. | OBSERVABLE PERO NO CONFIRMADA | Mantener `relations.artist.country` y caracterizar response antes de D40. | `src/discs/catalog/disc-catalog.service.spec.ts` comprueba relaciones; falta fixture de contrato serializado consumido por frontend/API. | No por ahora. |
| `Disc.artist` | `GET /discs`, `/discs/random` (Catalog) | QueryBuilder selecciona `disc.artist` y `artist.country`; mapper devuelve artista/país. | Front usa nombre, imagen y país en `DiscList`, `DiscCardComponent` y llamadas auxiliares; los filtros/orden también usan artista. | REQUERIDA | Mantener joins `artist` y `country` existentes. | Catalog specs caracterizan joins y mapping; frontend no tiene suite de contrato de este response. | Sí, después de D40 si el detalle incierto queda resuelto; QueryBuilder ya carga explícitamente. |
| `Disc.artist` | `GET /discs/date`, `/discs/date/public`, `/discs/weekly` (Calendar) | QueryBuilder selecciona artista/país; semanal selecciona columnas de artista/país. | Front usa artista y país en calendario autenticado, público y semanal. | REQUERIDA | Mantener joins y columnas explícitas de Calendar. | `src/discs/calendar/disc-calendar.service.spec.ts`; falta prueba frontend/API del payload completo. | Sí, después de D40; todos estos callers usan QueryBuilder explícito. |
| `Disc.artist` | `GET /discs/homeDiscs` (Home/Stats) | SQL manual une Artist/Country y el mapper construye `artist`. | Home muestra artista y país. | REQUERIDA | Mantener joins y aliases SQL actuales. | `src/discs/home/disc-home.service.spec.ts`, suites `home-*.postgres.spec.ts`; no aplica eager al SQL manual. | Sí desde el punto de vista de Home; no cambia su query. |
| `Disc.artist` | Enrichment, Spotify tracks, Artists, Favorites, Pendings, Rates, Comments, National Releases, Asignations, Lists/WordPress, Excel, Content scheduler, Scraping | Hay QueryBuilder con join explícito en consultas de lectura; las operaciones `manager.findOne(Disc)`/`discRepository.findOneBy` cargan eager automáticamente. En varias escrituras se retorna la entidad persistida. | Las respuestas de Rates/Favorites/Pendings/Comments/National Releases y Asignations/Lists consumidas por frontend acceden a artista; Enrichment/Spotify lo proyectan en crudo. Para callers de escritura se usa Disc para validar/asignar FK, pero no se consume su árbol eager. | REQUERIDA en respuestas de lectura; NO CONSUMIDA en consultas de Disc usadas solo para validar/escribir; OBSERVABLE PERO NO CONFIRMADA en respuestas de escritura | Mantener joins explícitos para lecturas y revisar cada respuesta TypeORM `find*`/`preload` antes de D40. | Specs de Discs, `rates`, `favorites`, `pendings`, `comments`, `national-releases`, `asignations`, `lists`, `excel` existentes donde hay; faltan pruebas de response en varios módulos. | No globalmente mientras haya responses no confirmadas. |
| `Disc.genre` | `GET /discs/:id` (detalle) | `findOneOrFail` declara `genre`; retorna `Disc` completo. | No se localizó llamada frontend al endpoint detalle; el campo queda observable. | OBSERVABLE PERO NO CONFIRMADA | Mantener `relations.genre` y caracterizar response. | Catalog detail spec verifica que se pide genre; falta consumo extremo a extremo confirmado. | No por ahora. |
| `Disc.genre` | Catalog, Calendar y Home (`/discs`, `/discs/random`, `/discs/options`, `/discs/date*`, `/discs/weekly`, `/discs/homeDiscs`) | QueryBuilder selecciona explícitamente genre cuando devuelve discos; Options devuelve solo filas de opción y se une a genre al pedir/filtrar el campo. | Front usa nombre/id/color en listados, filtros, calendarios y Home. | REQUERIDA | Mantener joins/selecciones explícitas ya presentes. | Catalog/Calendar/Home specs y tests de mapping; falta contrato frontend automatizado. | Sí tras D41 si queda cubierto el detalle; Options solo devuelve proyección explícita. |
| `Disc.genre` | Rates, Favorites, Pendings, Comments, National Releases, Asignations/Lists | Los QueryBuilder de lectura hacen join explícito; `NationalReleases` mapea genre dentro de Disc y Asignations/List devuelve discos relacionados. | El frontend muestra género/color en las vistas de rates/favorites/pendings, comments, national releases y listas. | REQUERIDA | Mantener joins explícitos en cada QueryBuilder propietario. | Specs disponibles en `rates`, `favorites`, `pendings`, `comments`, `national-releases`, `lists`; comprobar individualmente que cubran el campo completo antes de D41. | Sí para esos QueryBuilder; no para respuestas `find*` sin auditoría de payload. |
| `Disc.favorites` | Catalog `/discs`, `/discs/random`; Calendar `/discs/date` | QueryBuilder selecciona solo favoritos del usuario actual. El mapper propaga el array y deriva `favoriteId`. | Front consume `favoriteId`; no se encontraron lecturas del array `disc.favorites` en componentes. El array filtrado es parte observable del JSON actual. | REQUERIDA para derivar `favoriteId`; OBSERVABLE PERO NO CONFIRMADA como array público | Preservar selección del favorito actual y caracterizar si se mantiene el array. | Catalog/Calendar specs cubren mapping y joins parcialmente; falta prueba de shape completa por usuario con/sin favorito. | No hasta caracterizar; posible D42 contractual por exposición del array. |
| `Disc.favorites` | Pendings `/pendings` | QueryBuilder une explícitamente favorito del usuario y el servicio lee `pending.disc.favorites[0].id` para emitir `favoriteId`. | El payload lo consume `DiscList`; se consume el ID derivado, no la colección completa. | REQUERIDA para `favoriteId`; array observable | Mantener join filtrado por `userId` mientras el mapper lea la relación; evaluar después una proyección sin cambiar response. | Falta spec focalizado de `PendingsService.findAllByUser` que pruebe `favoriteId` ausente/presente y el shape. | No hasta tener esa cobertura y caracterizar array. |
| `Disc.favorites` | `GET /discs/:id`; `manager.findOne(Disc)` en Favorites, Pendings, Rates, Comments; `findOneBy` en Asignations; `preload` de Disc | Detalle lo carga explícitamente y lo devuelve; los `find*` disparan eager, aunque varios callers solo comprueban existencia/asignan FK. `preload` se usa para update y retorna la entidad; no se verificó aquí el efecto exacto de eager en esa operación. | Arrays del detalle/update son observables, pero el consumidor del detalle no está confirmado. Los find de validación no leen favorites; Pendings de lectura sí depende de su join explícito señalado arriba. | OBSERVABLE PERO NO CONFIRMADA en respuestas; NO CONSUMIDA en validaciones verificadas | Mantener detail relation explícita; en validaciones no usar la relación en lógica. Revisar `preload` response antes de D42. | Disc Catalog y Write cubren options/relaciones parcialmente; faltan pruebas de payload de update y callers de validación. | No globalmente; posibles optimizaciones internas no deben alterar el payload. |
| `Disc.pendings` | Catalog `/discs`, `/discs/random`; Calendar `/discs/date` | QueryBuilder selecciona solo pendientes del usuario actual; mapper propaga array y deriva `pendingId`. | Front usa `pendingId`; no se encontraron lecturas de `disc.pendings` en componentes. El array actual es observable en esas respuestas. | REQUERIDA para `pendingId`; OBSERVABLE PERO NO CONFIRMADA como array | Mantener la selección del estado del usuario y caracterizar el array antes de considerar cambios. | Catalog/Calendar specs cubren mapper y joins; falta prueba de shape con varios usuarios y ausencia de pending. | No hasta caracterizar; potencial candidato contractual D43. |
| `Disc.pendings` | Pendings `/pendings` (lista del usuario), detalle y `find*` de validación | La lista usa la entidad Pending como raíz y no selecciona `disc.pendings`; detalle la carga expresamente y la devuelve; los `findOne(Disc)` de validación disparan eager. | Lista usa `pending.id` y el favoriteId de Favorites; no usa la colección Disc.pendings. El array de detalle permanece visible, sin consumidor confirmado. | NO CONSUMIDA en lista y validaciones; OBSERVABLE PERO NO CONFIRMADA en detalle/update | No añadir joins en la lista; conservar relations de detalle mientras el contrato no se decida. | Pendings spec focalizada del mapper falta; Catalog detail spec sí comprueba relation solicitada. | No globalmente por la respuesta de detalle no verificada. |
| `Disc.comments` | `GET /discs/:id` (detalle) | `findOneOrFail` declara `comments.user`; devuelve colección completa. | No hay llamada de detalle ni lectura de `disc.comments` identificada en el frontend. La relación es observable en JSON, pero su cliente externo no puede descartarse. | OBSERVABLE PERO NO CONFIRMADA | Mantener `relations.comments.user` hasta verificar consumidores/contrato. | Catalog detail spec verifica la carga y null/empty; falta consumidor extremo a extremo y fixture del JSON. | No; payload visible impide retirada silenciosa. |
| `Disc.comments` | Catalog list/random, Calendar, Home/Stats y listas de Rates/Favorites/Pendings | QueryBuilder no une Disc.comments; calcula `commentCount` mediante subquery/SQL y el mapeo usa el count. | El frontend usa `commentCount` en las tarjetas; no usa arrays de comentarios desde Disc en esos responses. | NO CONSUMIDA (colección); `commentCount` requerido es dato separado | Mantener los conteos actuales; no añadir join de colección. | Catalog/Home specs protegen conteos; Calendar y módulos relacionados necesitan cobertura de payload/count donde falte. | Sí en estas rutas QueryBuilder, cuya carga no depende de eager; retirada global sigue bloqueada por detalle. |

#### Relaciones próximas y callers que reciben Disc

| Relación próxima | Caller/endpoint | Evidencia y clasificación | Protección/cobertura |
|---|---|---|---|
| `Artist.country` (`eager`) | Disc detalle y `find*` con Artist; rates/favorites/pendings/comments; Asignations/Lists/National Releases | Country aparece dentro de `Disc.artist.country`; Catalog/Calendar/Home lo unen explícitamente y el frontend utiliza `name`/`isoCode`. REQUERIDA en esos payloads; no modificar en D39 ni D40. Algunas consultas `find*` lo cargan transitivamente y no se puede quitar su eager sin tarea propia. | Tests Catalog/Calendar/Home y specs de módulos consumidores; cobertura de response incompleta en callers de módulos. |
| `Rate.disc` (`eager`) | Rates `findOne`/listados; respuestas anidadas Rate→Disc | La relación Disc se selecciona en QueryBuilder de listados y aparece en respuestas; frontend lee artista/género del disco en rates/comentarios mensuales. REQUERIDA para esos consumers. Rate.disc no se modifica en D39. | `rates.service.spec.ts` si existe y tests de los callers; comprobar cobertura de la respuesta anidada antes de cualquier fase de Rate. |
| `Asignation.disc` (`eager`) | Asignations `findOne`; listas y publicación WordPress | El frontend de Listas lee `asignation.disc.artist` y `.genre`; WordPress usa identidad/nombre/disco para generar secciones. REQUERIDA. Los endpoints que cargan Asignation por `find*` pueden devolver el árbol Disc eager. No modificar en D39. | `lists.service.spec.ts`/Asignations si existen; falta cubrir el response completo de Asignation en varios callers. |

#### Hallazgo contractual conservado y evaluación D39

Se conservan íntegros los hallazgos contractuales previos del roadmap, incluidos los de D5, D7 y el mapping de `artist.country` ausente. D39 añade evidencia concreta sobre los arrays de estado y comentarios; no cambia el contrato.

### Contract finding

**Current behavior:** El detalle `/discs/:id` solicita y devuelve `favorites`, `pendings` y `comments` completos (incluido usuario en cada relación). Los listados de Catalog/Calendar seleccionan favorito/pendiente del usuario actual, los propagan como arrays y también devuelven `favoriteId`/`pendingId`; el frontend localizado usa esos IDs y `commentCount`, no las colecciones. Pendings además lee Favorites para producir `favoriteId`.

**Problem:** Las relaciones eager generan lecturas de colecciones y el detalle expone datos potencialmente grandes. Para los listados, la UI conocida solo requiere proyecciones personales y el conteo, aunque los arrays son observables en la respuesta actual. No se pudo verificar un consumidor de `/discs/:id` ni clientes externos a este frontend.

**Impact:** Backend + frontend.

**Options:**

1. Preservar compatibilidad hasta verificar callers externos y los payloads completos.
2. Refactorizar internamente cada consulta para cargar explícitamente la relación que usa, manteniendo respuesta.
3. Cambiar contrato de los listados a `favoriteId`, `pendingId` y `commentCount`, y decidir por separado si el detalle omite colecciones.
4. Coordinar una refactorización backend/frontend para consumir proyecciones y retirar campos no usados.

**Recommendation:** Mantener compatibilidad durante D40–D44. La UI encontrada ya trabaja con las proyecciones, así que la reducción de arrays en listados podría ser una mejora contractual coordinada concreta; requiere una decisión independiente y no se realiza en D39. Conservar las colecciones del detalle hasta verificar clientes externos.

**Blocks the current task:** No; el inventario se completa sin cambiar producción. Sí impide retirar ahora los eager de colecciones en D42–D44 sin una decisión contractual y cobertura adicional.

- **Conclusión de retirada:** `Disc.artist` y `Disc.genre` son candidatos técnicos para D40/D41 en las consultas que ya hacen joins explícitos, sujeto a resolver la respuesta de detalle y los callers de `find*`. `Disc.favorites` y `Disc.pendings` no son candidatos a retirada global mientras la respuesta actual exponga arrays y Pendings use Favorites; pueden revisarse por consulta después de caracterizar payloads. `Disc.comments` no se carga en listados QueryBuilder y se necesita como array observable en detalle sin consumidor frontend confirmado; mantener globalmente hasta decisión contractual.
- **Tests faltantes identificados:** caracterización de JSON completo de detalle y update; shape de arrays de Catalog/Calendar con estados presentes/ausentes; caller de Pendings que protege `favoriteId`; responses anidadas de Rates/Asignations en los módulos que no tengan spec de contrato. No se añadieron tests en D39.
- **Verificaciones:** `yarn test src/discs --runInBand` con Node 20.20.2: 26 suites aprobadas, 7 suites PostgreSQL omitidas por sus guards; 249 tests aprobados, 28 omitidos. `yarn test src/excel/excel.service.spec.ts src/lists/list.service.spec.ts --runInBand`: Lists aprobada (15 tests); Excel falló en sus 3 tests porque el módulo de pruebas no registra el `DiscRepository` que requiere `ExcelService`. `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` pasan. `pnpm exec jest` fue rechazado por la configuración `packageManager: yarn@1.22.22`; las pruebas se ejecutaron con Yarn y Node 20, que es el engine declarado.
- **Estado final:** no se cambió ninguna entidad, `eager: true`, query, mapper ni payload. D39 queda cerrada con el fallo de fixture de Excel anotado; D40 permanece pendiente.

### D40 — Eager de Disc.artist

- [x] Completada sin cambio de entidad (2026-10-04)
- **Objetivo:** quitar la carga automática de artista de Disc solo cuando todos los consumidores necesarios carguen esa relación explícitamente.
- **Alcance:** Disc.artist en disc.entity.ts y consultas identificadas en D39 que dependan del eager.
- **Fuera de alcance:** cambiar Artist.country eager ni modificar respuestas de otros módulos.
- **Dependencias:** D39, D23.
- **Criterios de finalización:** solo si D39 confirma que los consumidores están cubiertos: primero cargar explícitamente artista donde se requiere y probar el payload actual; después retirar eager: true y repetir la regresión. Si hay una relación OBSERVABLE PERO NO CONFIRMADA o un consumidor no cubierto, mantener eager y cerrar sin cambio de producción. Si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo de detalle y endpoints/callers identificados antes y después; pruebas de Discs y de consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** M.

#### Cobertura y decisión

- **Detalle:** `DiscCatalogService.findOne` ya pide explícitamente `artist.country` y retorna la entidad con relaciones. El spec existente verifica el árbol `relations` y que el objeto resultante conserva relaciones opcionales; no ejecuta serialización HTTP contra TypeORM ni compara una respuesta real completa. No se añadió otra carga porque ya está declarada.
- **Lecturas Disc ya cubiertas:** Catalog (`findAll`, `findRandom`), Calendar (autenticado, público y semanal), Home/Stats, Enrichment, Spotify, Artists, Favorites/Pendings/Rates/Comments QueryBuilder, y National Releases usan joins/selections explícitos cuando proyectan artista. No se modificaron esas consultas.
- **Otros callers pendientes de cobertura explícita:** `Rate.disc` es eager y sus `findOne`/`findRatesByDisc` devuelven Disc anidado; `Asignation.disc` es eager y `findOne` lo devuelve; las lecturas `List.find*` propagan asignaciones/discos eager y las vistas de Lists usan artista. En esos caminos `Disc.artist` llega por el grafo eager; no hay prueba que fije la respuesta anidada completa ni carga `artist` declarada en el caller propietario.
- **Escrituras pendientes de caracterización:** `POST /rates`, `/favorites`, `/pendings`, `/comments` y creación de Asignation asocian el resultado de `manager.findOne(Disc)` a una entidad que se devuelve. `PATCH /discs/:id` retorna el resultado de `preload`. La API expone esas respuestas, pero no se localizaron specs de respuesta que demuestren si el artista anidado forma parte del JSON actual y que quedaría preservado con carga explícita. Las creaciones de Disc que reciben una entidad Artist ya asignada no dependen de `Disc.artist` eager.
- **Caller interno:** Scraping lee `disc.artist.name` tras `discRepository.findOne`; ese caller necesita Artist explícito si se retira eager y no tiene spec. Excel usa `Disc.findOne` solo para detectar duplicados, sin leer ni devolver el artista.
- **Payloads comparados:** no se pudo comparar una respuesta real pre/post porque la cobertura indicada no está implementada y no se hizo cambio de entidad. El spec de detalle confirma la relación solicitada, no una línea base HTTP completa. No se cambió payload ni frontend.
- **Cambios/tests:** no se añadieron cargas ni tests en D40. Mantener las consultas actuales conserva todas las respuestas. No hay specs en este repo para Rates, Asignations, Favorites, Pendings o Comments que fijen los payloads anidados correspondientes.
- **Bloqueo:** `Disc.artist` sigue **OBSERVABLE PERO NO CONFIRMADA** en respuestas de detalle y escritura, y carece de cobertura completa en Rates/Asignations/Listas. Por el criterio de D40, se mantiene `eager: true` hasta declarar esas cargas en los callers que deban preservarlo y caracterizar sus payloads. No es necesario decidir ni modificar `Artist.country`.
- **Verificaciones con Node 20.20.2:** suite Discs: 26 suites aprobadas y 7 omitidas por guards PostgreSQL (249 tests aprobados, 28 omitidos). Suites focalizadas Catalog detalle + Lists: 2 suites, 96 tests aprobados. Regresión Lists/Excel: Lists 15 tests aprobados; Excel 3 tests fallaron porque su fixture no registra `DiscRepository` (falla preexistente anotada en D39, sin corregir). `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` aprobados.
- **Estado final:** D40 queda cerrada sin cambio de producción porque la evidencia no permite retirar eager de forma segura. D41 permanece pendiente.

### D41 — Eager de Disc.genre

- [x] Completada sin cambio de entidad (2026-10-04)
- **Objetivo:** quitar la carga automática de género de Disc si los callers requeridos ya lo seleccionan.
- **Alcance:** Disc.genre y consumidores identificados en D39.
- **Fuera de alcance:** cambiar filtros/opciones de género o la entidad Genre completa.
- **Dependencias:** D39, D23, D11.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente genre donde sea requerido y verificar que el payload actual no cambie. Si queda consumo observable sin confirmar o sin cobertura, mantener eager y cerrar sin cambio de producción. Si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo de los endpoints/callers identificados antes y después; pruebas focalizadas de Discs y consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** S.

#### Cobertura y decisión

- **Consultas con Genre explícito que se mantienen:** Catalog (`findOne`, listado, random y opciones), Calendar (público/autenticado/semanal), Home/Stats (SQL explícito), Rates/Favorites/Pendings/Comments QueryBuilder, National Releases (`findAll`, público, admin y sugerencias) y `createFromDisc` (`relations: ['artist', 'genre']`). Sus joins/selections ya sostienen el género que consumen; no se modificaron.
- **Callers aún ligados al eager de Disc.genre:** `Rate.findOne` y `findRatesByDisc` devuelven Rate con `Rate.disc` eager; `Asignations.findOne` devuelve `Asignation.disc` eager; `Comments.findCommentsByDisc` incluye `disc` por `relations` y depende de que Disc cargue genre; las lecturas `List.find*` propagan asignaciones/discos eager, y el frontend de Listas muestra genre/color. `DiscWriteService.update` retorna el resultado de `preload`; varias creaciones Rate/Favorite/Pending/Comment/Asignation devuelven la entidad vinculada a un `manager.findOne(Disc)`.
- **Detalle y escrituras:** detalle ya declara `relations.genre`, pero el spec solo comprueba la llamada/opciones y el objeto mockeado, no una respuesta HTTP serializada completa. Las respuestas de `PATCH /discs/:id` y escrituras anidadas no tienen pruebas de payload que fijen la presencia, campos y nullability de `genre`.
- **Pruebas por caller:** el repo tiene suites para Discs y Lists; no hay suites en Rates, Asignations, Comments, Favorites, Pendings ni National Releases que protejan el género anidado. El spec de Lists existente no caracteriza los campos `disc.genre` de sus respuestas.
- **Payloads comparados:** ninguno en un entorno TypeORM/HTTP real antes/después. Los specs existentes cubren joins y mappers en Catalog/Calendar/Home, no todas las respuestas anidadas. No se retiró eager, así que no hubo cambio observable.
- **Cambios/tests:** no se añadieron cargas explícitas ni tests en D41: modificar callers sin una caracterización que pruebe el shape actual no permitiría demostrar compatibilidad.
- **Bloqueo:** `Disc.genre` permanece **REQUERIDA** en varios payloads y **OBSERVABLE PERO NO CONFIRMADA** en detalle/escrituras. Rates, Asignations, Comments y Lists tampoco tienen cobertura de respuesta suficiente. Por el criterio de D41 se conserva `eager: true`; `Genre`, filtros y opciones quedan intactos.
- **Verificaciones con Node 20.20.2:** suite Discs: 26 suites aprobadas y 7 omitidas por guards PostgreSQL (249 tests aprobados, 28 omitidos). Suites focalizadas Catalog + Calendar + Lists: 3 suites, 139 tests aprobados. Regresión Lists/Excel: Lists 15 tests aprobados; Excel 3 tests fallaron porque su fixture no registra `DiscRepository` (falla preexistente anotada en D39, sin corregir). `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` aprobados.
- **Estado final:** D41 queda cerrada sin cambio de producción por cobertura insuficiente; D42 permanece pendiente.

### D42 — Eager de Disc.favorites

- [x] Completada sin cambio de entidad (2026-10-04)
- **Objetivo:** evitar cargar favoritos completos cuando ningún consumidor los necesita, preservando el contenido actualmente observable.
- **Alcance:** Disc.favorites y callers identificados en D39, manteniendo las selecciones del favorito del usuario donde correspondan.
- **Fuera de alcance:** cambiar el módulo Favorites, unicidad o endpoints de favoritos.
- **Dependencias:** D39, D23, D4, D10, D14.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente y caracterizar antes el payload actual, incluyendo la colección si hoy aparece. Para endpoints que solo requieren favoriteId, seleccionar el favorito del usuario sin cargar la colección completa únicamente si la respuesta no la expone. Si hay consumo visible no confirmado, mantener eager y cerrar sin cambio de producción; si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Verificaciones:** comparar payload completo con varios favoritos, usuario actual y ausente; pruebas de Discs y consumidores aplicables; <code>pnpm build</code>.
- **Riesgo:** M.

#### Consumidores, estado personal y decisión

| Caller | ¿Qué obtiene y cómo se carga? | Uso / presencia observable | Cobertura y decisión |
|---|---|---|---|
| Catalog `GET /discs`, `/discs/random` | QueryBuilder hace `leftJoinAndSelect(disc.favorites)` con filtro `favorite.userId = :userId`; el mapper mantiene `disc.favorites` y deriva `favoriteId`. `eager` no se aplica a QueryBuilder. | La UI usa `favoriteId`, no lee el array; aun así el array filtrado actual queda en el JSON por el spread de Disc. | Tests existentes cubren favorito presente/ausente, IDs derivados, array preservado, condición por usuario y múltiples filas favoritas. Sin cambios. |
| Calendar autenticado `GET /discs/date` | QueryBuilder hace join explícito con `favorite.userId = :userId`; mapping mantiene el array y deriva `favoriteId`. | UI usa `favoriteId`; el array filtrado permanece visible en respuesta. | Test existente fija presencia y ausencia de favorito, orden/payload y mapping. Sin cambios. |
| Calendar público y semanal; Home/Stats | QueryBuilder público/semanal no selecciona favorites. Home usa SQL propio y emite `favoriteId` como proyección, no `favorites`. | Colección **NO CONSUMIDA/NO PRESENTE** en estas respuestas; Home requiere solo `favoriteId`. | Tests actuales de Calendar y Home protegen sus respuestas; `eager` no se aplica al QueryBuilder/SQL. Sin cambios. |
| Pendings `GET /pendings` | QueryBuilder selecciona favoritos solo del usuario actual. El servicio devuelve el array `disc.favorites` y lee el primero para `favoriteId`. | UI usa `favoriteId`; el array seleccionado aparece en JSON. | Nuevo `src/pendings/pendings.service.spec.ts` cubre ausencia, una coincidencia, filas duplicadas del usuario actual, array emitido y filtro `userId`. |
| Detalle `GET /discs/:id` | `findOneOrFail` pide explícitamente `favorites.user`; retorna la colección completa de usuarios. | El frontend disponible no llama al detalle; la colección completa es observable y su uso externo no se puede descartar. | El spec de Catalog amplía el fixture a favoritos de dos usuarios y compara la entidad/payload de servicio completo. La carga explícita ya existe. |
| `POST /favorites` y escrituras de Pending/Rate/Comment/Asignation; `PATCH /discs/:id` | `findOne(Disc)`, `findOneBy(Disc)` o `preload` cargan/retienen el grafo actual; algunas respuestas devuelven el `Disc` anidado. En particular Favorite.create está en el módulo Favorites, que queda fuera de alcance. | En escritura, la colección puede seguir presente en JSON aunque la UI no lea el array; los payloads no están caracterizados. | Sin suites que fijen esos payloads. No cambiar esos módulos ni la escritura de Favorite impide garantizar equivalencia retirando el eager. |
| Rates `GET /rates/:id`, `/rates/disc/:discId`; Asignations `GET /asignations/:id`; Listas `GET` | `Rate.disc` y `Asignation.disc` son eager; las consultas `List.find*` también entregan asignaciones/discos eager. Disc.favorites puede aparecer en la entidad anidada. | Respuestas observables con colección; la UI conocida no lee directamente `disc.favorites`, pero no se puede suprimir del JSON durante D42. | No hay tests de payload en Rates/Asignations; Listas tiene suite, pero no caracteriza esa colección. Sin cambios fuera de alcance. |
| Favorites `GET /favorites`, Rates/Favorites QueryBuilder, Comments `GET /comments/disc/:id`, Excel y validaciones Disc | Los QueryBuilder de lectura no cargan `Disc.favorites` salvo Catalog/Calendar/Pendings, y Comments mapea Disc solo a `{ id, name }`. Las comprobaciones de existencia/duplicado usan Disc únicamente como referencia. | Colección **NO CONSUMIDA/NO PRESENTE** en esas respuestas. | Revisado en código; no se añade carga para estos callers. |

- **Tests añadidos:** se amplió el test de detalle para cubrir favoritos de dos usuarios. Se añadió `src/pendings/pendings.service.spec.ts` con ausencia/presencia, múltiples filas y filtro de usuario. Catalog y Calendar ya cubrían el estado personal, por lo que se conservaron sus tests actuales.
- **Cargas explícitas añadidas:** ninguna. Catalog, Calendar, Pendings y detalle ya cargan explícitamente lo que requieren; no se modificaron sus queries.
- **Payloads comparados:** los tests unitarios verifican el objeto devuelto por el servicio, incluidos arrays y `favoriteId`, antes de cualquier cambio. No se hizo comparación pre/post de endpoint real porque el eager se mantiene. En el detalle el spec compara la respuesta completa del servicio con la colección de varios usuarios.
- **Bloqueo:** aunque los consumidores principales de estado personal filtran explícitamente por usuario, el detalle expone toda la colección y varias respuestas anidadas/escrituras pueden propagarla por `find*`/eager. Sus consumidores y payloads no están completamente caracterizados; además, `/favorites` queda fuera de alcance. Retirar eager podría cambiar el JSON, así que se conserva `eager: true`.
- **Verificaciones con Node 20.20.2:** suite Discs: 26 suites aprobadas y 7 omitidas por guards PostgreSQL (249 tests aprobados, 28 omitidos). Suites focalizadas Catalog, helper de estado Catalog, Calendar, Pendings y Lists: 5 suites y 153 tests aprobados. Regresión Lists/Excel: Lists 15 tests aprobados; Excel 3 tests fallaron porque su fixture no registra `DiscRepository` (falla preexistente anotada en D39, sin corregir). `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` aprobados.
- **Estado final:** D42 queda cerrada sin cambio de producción por payloads anidados no cubiertos; D43 permanece pendiente.

### D43 — Eager de Disc.pendings

- [x] Cerrada sin cambio de entidad (2026-10-04)
- **Objetivo:** impedir lecturas automáticas de todos los pendientes de un disco sin perder el estado del usuario.
- **Alcance:** Disc.pendings y callers auditados en D39.
- **Fuera de alcance:** flujo de escritura de Pendings o cambios de permisos.
- **Dependencias:** D39, D23, D4, D10, D14.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente y caracterizar antes el payload actual, incluyendo la colección si hoy aparece. Para endpoints que solo requieren pendingId, seleccionar el pendiente del usuario sin cargar la colección completa únicamente si la respuesta no la expone. Si hay consumo visible no confirmado, mantener eager y cerrar sin cambio de producción; si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Inventario de consumidores y respuesta actual:**

| Endpoint/caller | Necesidad actual | Cómo se carga y presencia en el JSON | Uso confirmado / clasificación | Cobertura D43 |
|---|---|---|---|---|
| Catalog `GET /discs`, `/discs/random` | `pendingId` más colección filtrada | QueryBuilder une `disc.pendings` con `pending.userId = :userId`; el mapper devuelve Disc (incluido `pendings`) y deriva `pendingId`. | El frontend lee `pendingId`; no se localizaron lecturas de `disc.pendings`, pero el array filtrado es observable. `pendingId`: REQUERIDA. Array: OBSERVABLE PERO NO CONFIRMADA. | Specs existentes cubren presente/ausente, aislamiento por usuario y filas raw duplicadas; se preservan join y payload.
| Calendar autenticado `GET /discs/date` | `pendingId` más colección filtrada | QueryBuilder une solo el pendiente del usuario; respuesta conserva el array y deriva `pendingId`. | Front lee `pendingId`; el array es observable sin lectura localizada. `pendingId`: REQUERIDA. Array: OBSERVABLE PERO NO CONFIRMADA. | Spec de payload con pendiente presente y ausente y join por usuario.
| Calendar público/semanal | No requiere colección ni `pendingId` | QueryBuilder no selecciona `disc.pendings`; los tests y mapping del endpoint no exponen el array. | Colección: NO CONSUMIDA en estas respuestas verificadas. | Specs Calendar existentes protegen el payload público/semanal.
| Home/Stats `GET /discs/homeDiscs` | Solo `pendingId` | SQL manual proyecta un pendiente del usuario como `pendingId`; no hidrata la colección. | `pendingId`: REQUERIDA. Colección: NO CONSUMIDA en esta respuesta SQL verificada. | Home usa sus tests de proyección; eager de TypeORM no se aplica al SQL manual.
| Detalle `GET /discs/:id` | Colección completa en el payload | `findOneOrFail` carga `pendings.user` explícitamente y devuelve Disc completo. | Array observable; no se encontró llamada frontend al detalle. `OBSERVABLE PERO NO CONFIRMADA`. | Spec existente compara el objeto completo y ahora incluye pendientes de dos usuarios; también cubre relación vacía.
| Pendings `GET /pendings` | El pendiente de usuario actual, expuesto como `userPending`; no `Disc.pendingId` ni colección | QueryBuilder usa Pending como raíz y une Disc, Artist, Genre y Favorites del usuario. No une `disc.pendings`; QueryBuilder no aplica eager automáticamente. | Colección: NO CONSUMIDA en la consulta/JSON verificados. El ID es `pending.id` asignado como `userPending`, no derivado de `Disc.pendings`. | Spec verifica ausencia de join/propiedad `pendings`, `userPending` y favoriteId con favorites ausentes, presentes y filas múltiples.
| Pendings `POST /pendings` | Devuelve Pending anidado con Disc | `manager.findOne(Disc)` carga eager; el Disc asignado y devuelto puede incluir su colección `pendings`. | Array anidado observable; consumo externo no confirmado: `OBSERVABLE PERO NO CONFIRMADA`. | Spec nueva fija la colección de varios usuarios en el Disc anidado devuelto. No se cambió la escritura.
| Detalle/PATCH de Disc (`findOneOrFail`/`preload`) | Colección completa en la respuesta actual | Detalle declara `relations.pendings.user`; `preload` devuelve el grafo eager registrado por TypeORM. | Payload visible con consumidores no confirmados: `OBSERVABLE PERO NO CONFIRMADA`. | Detalle cubierto; falta fixture de respuesta de PATCH que incluya varios pendientes.
| Rates, Favorites, Comments, Asignations y Lists: escrituras que resuelven Disc; respuestas anidadas `Rate.disc`/`Asignation.disc` | Las validaciones solo necesitan resolver Disc; algunas respuestas retornan Disc anidado | `manager.findOne(Disc)`/`findOneBy` cargan eager. Las respuestas de escritura pueden incluir el árbol; `Rate.disc` y `Asignation.disc` son relaciones eager. Lists también devuelve asignaciones/discos. | La colección no participa en la validación. En respuestas que pueden incluir Disc, el array es observable y no se confirmó su consumo: `OBSERVABLE PERO NO CONFIRMADA`. | No hay cobertura conjunta de payloads para estos callers; no es seguro retirar el eager global.
| Rates `GET` y Favorites `GET` | Solo proyección `pendingId` del usuario | QueryBuilder calcula/selecciona `pendingId` mediante join/subquery; no selecciona `disc.pendings`. | `pendingId`: REQUERIDA donde se proyecta. Colección: NO CONSUMIDA en esas respuestas QueryBuilder verificadas. | Revisados los joins de servicios; sus suites no fijan la colección de respuesta anidada.
| Comments `GET /comments/disc/:id` | Disc reducido a ID/nombre | QueryBuilder une Disc, pero el mapper construye solo `{ id, name }`; no selecciona la colección. | Colección: NO CONSUMIDA en esta respuesta verificada. | Mapping existente revisado; sin cambios.
| Enrichment, Spotify, LastFM y otros consumidores internos | Uso dependiente de cada ruta | SQL/QueryBuilder y proyecciones no requieren eager; las rutas TypeORM `find*` que retornan entidades pueden incluirlo. | Donde se devuelve solo proyección: NO CONSUMIDA. Para retornos de entidad sin contrato interno verificable: `OBSERVABLE PERO NO CONFIRMADA`. | La clasificación D39 se conserva; no todos los payloads de integración tienen test de respuesta.

- **Consumidores `pendingId` frente a colección:** Catalog autenticado y Calendar autenticado necesitan el ID del usuario y mantienen su join filtrado existente; Home, Rates y Favorites proyectan el ID sin cargar la colección. Pendings `GET` utiliza el ID de la entidad raíz Pending como `userPending`. El detalle, el alta de Pending y rutas de escritura/relaciones anidadas pueden incluir arrays completos. La colección del detalle y de los retornos anidados no se sustituye por un ID.
- **Carga explícita añadida:** ninguna. Los consumidores con necesidad confirmada ya declaran sus joins/proyecciones, y no se alteraron consultas.
- **Tests añadidos:** el test de detalle de Catalog ahora compara la colección completa con pendientes de dos usuarios; el spec de Pendings verifica ausencia/presencia de estado personal, duplicados, que el listado no una `disc.pendings` y que `POST /pendings` conserve la colección del Disc anidado. Los tests Catalog y Calendar existentes ya cubren `pendingId` presente/ausente y filtrado por usuario.
- **Comparación de payloads:** se fijaron objetos completos de servicio para el detalle y respuesta anidada de creación. No hubo comparación pre/post de endpoint con TypeORM real porque no se retiró eager. El campo `pendingId` conserva las consultas actuales.
- **Bloqueo:** el detalle y varias escrituras/respuestas anidadas observables incluyen la colección. D39 marca ese payload como no confirmado externamente; faltan pruebas de respuesta para PATCH de Disc y varios consumers de Rates/Favorites/Comments/Asignations/Lists e integraciones. Mantener `eager: true` evita cambiar esos JSON. Reabrir la retirada requiere caracterizar esos callers o una decisión contractual independiente.
- **Verificaciones con Node 20.20.2:** `yarn test src/discs --runInBand`: 26 suites aprobadas, 7 suites PostgreSQL omitidas por guard, 249 tests aprobados y 28 omitidos. Suites focalizadas Catalog, mapper Catalog, Calendar, Pendings y Lists: 5 suites y 154 tests aprobados. No existen suites focalizadas en este checkout para Rates, Favorites, Comments o Asignations. `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` aprobados.
- **Estado final:** D43 queda cerrada sin cambio de entidad; D44 permanece pendiente.
- **Riesgo:** M.

### D44 — Eager de Disc.comments

- [x] Cerrada sin cambio de entidad (2026-10-04)
- **Objetivo:** distinguir los callers que requieren la colección de comentarios de los que solo necesitan el count, sin alterar el payload actual del detalle.
- **Alcance:** Disc.comments y consumidores auditados en D39; conservar el contador donde se calcula por subquery.
- **Fuera de alcance:** módulo Comments, paginación de comentarios y reglas de borrado.
- **Dependencias:** D39, D23.
- **Criterios de finalización:** solo retirar eager si D39 demuestra cobertura completa de consumidores; cargar explícitamente y caracterizar antes el payload del detalle u otra ruta que hoy entregue comentarios. Rutas que solo requieren commentCount no traen la colección únicamente si no la exponen actualmente. Si hay consumo visible no confirmado, mantener eager y cerrar sin cambio de producción; si se clasifica NO CONSUMIDA pero retirarla cambia el payload observable, mantenerla y documentar una futura tarea contractual.
- **Inventario de consumidores:**

| Endpoint/caller | Necesidad actual | Carga actual y presencia de `Disc.comments` | Clasificación de la colección | Cobertura/hallazgo |
|---|---|---|---|---|
| Disc detalle `GET /discs/:id` | Devuelve el disco completo | `findOneOrFail` declara `comments.user`; devuelve todos los comentarios y cada usuario. | **OBSERVABLE PERO NO CONFIRMADA**: no se localizó llamada frontend a este detalle y no se descarta un cliente externo. | El spec fija el payload completo con comentarios de dos usuarios y también la relación vacía. La carga explícita ya existe.
| Catalog `GET /discs`, `/discs/random` | `commentCount` | QueryBuilder define `COUNT(comment.id)` en subquery y no une `disc.comments`; la colección no está en el resultado. Frontend usa el contador. | `commentCount`: **REQUERIDA**. Colección: **NO CONSUMIDA** en estos payloads verificados. | Spec confirma que no existe join/propiedad `comments` y preserva la subquery y el mapping del contador.
| Calendar `/discs/date*`, `/discs/weekly` | Datos de Disc y calendario; no usa colección de comentarios | QueryBuilder selecciona las relaciones declaradas; no une `disc.comments`. La colección no se expone. Calendar no proyecta `commentCount` en estos resultados. | **NO CONSUMIDA** en respuestas verificadas. | Specs protegen el payload Calendar y eliminan internals de las entidades.
| Home/Stats `GET /discs/homeDiscs` | `commentCount` | SQL manual proyecta `(SELECT COUNT(c.id) ... ) AS "commentCount"`; no une ni hidrata la colección. | `commentCount`: **REQUERIDA**. Colección: **NO CONSUMIDA** en el payload SQL. | Spec fija contador y ausencia de `comments`/JOIN a la colección.
| Rates, Favorites y Pendings: listados por usuario | `commentCount` | QueryBuilder usa subquery `COUNT(comment.id)`; QueryBuilder no activa eager loading y ninguno une `disc.comments`. | `commentCount`: **REQUERIDA**. Colección: **NO CONSUMIDA** en estos listados verificados. | Catalog/Home y Pendings tienen cobertura de mapping/shape; no hay suites de Rates o Favorites en este checkout.
| Rates `GET /rates/:id`, `GET /rates/disc/:discId` | Devuelve Rate y Disc anidado | `Rate.disc` es eager; las operaciones repository `find*` pueden propagar el eager recursivo de `Disc.comments`. La colección queda observable. | **OBSERVABLE PERO NO CONFIRMADA**. | No hay spec de Rates que caracterice el payload anidado; necesita fixture antes de cambiar el eager.
| Comments `GET /comments` | Comment con Disc | QueryBuilder une `comment.disc`, no `disc.comments`; QueryBuilder no activa eager loading. La colección inversa no forma parte de la respuesta. | **NO CONSUMIDA** en este resultado verificado. | Código de mapping revisado; no hay suite de Comments en este checkout.
| Comments `GET /comments/disc/:id` | Lista plana de comentarios del disco; Disc se reduce a `{id,name}` | La validación inicial hace `findOne(Disc)` y carga eager pero descarta ese Disc. El `find` de Comment con relación Disc puede cargar la colección inversa por eager; el mapper la elimina del Disc anidado. Los comentarios devueltos son filas raíz, no `Disc.comments`. | La colección inversa: **NO CONSUMIDA** en el payload verificado. Las filas Comment: **REQUERIDAS**. | El mapper excluye el Disc completo; sin spec focalizada en este checkout.
| Comments `POST /comments` | Comment creado con Disc asignado | `manager.findOne(Disc)` carga eager; el objeto Disc asignado se devuelve anidado y puede exponer su colección completa. | **OBSERVABLE PERO NO CONFIRMADA**: el frontend recibe el resultado, pero no se verificó que lea `disc.comments`. | No existe spec de respuesta; preservar eager hasta caracterizarla o una decisión contractual.
| Favorites, Pendings, Rates y Asignations: escrituras | Devuelven la entidad creada con Disc asignado | Sus servicios obtienen Disc mediante `manager.findOne`/`findOneBy` y asignan la instancia a Favorite, Pending, Rate o Asignation. La respuesta puede incluir `Disc.comments`. | **OBSERVABLE PERO NO CONFIRMADA**. | Falta cobertura de respuestas anidadas para esos módulos; no modificar sus escrituras en D44.
| Asignations/Lists `GET` | Devuelve asignaciones y discos para listas/UI | `Asignation.disc` es eager y las lecturas `find*` pueden propagar `Disc.comments`; el frontend conocido usa datos del disco, no la colección de comentarios. | **OBSERVABLE PERO NO CONFIRMADA** por el JSON; consumo de la colección no localizado. | La suite Lists no fija el payload de esta colección; no hay suite de Asignations.
| Disc PATCH y National Releases que adjuntan Disc | Respuestas de entidad o Release con Disc relacionado | `DiscWriteService.update` devuelve el resultado de `preload`; `NationalReleases.createFromDisc`/`linkDisc` pueden guardar o devolver un Disc unido que conserva comentarios eager. | **OBSERVABLE PERO NO CONFIRMADA**. | Faltan tests de respuesta que fijen la colección anidada en esos callers.
| Excel, Scraping, Content scheduler y consultas internas que solo verifican/actualizan Disc | Campos de Disc o FK, sin retorno de esa instancia como respuesta | `findOne` puede cargar la colección, pero el código la descarta/usa Disc internamente y no devuelve ese objeto. QueryBuilder/SQL tampoco aplica eager. | **NO CONSUMIDA** en las rutas internas verificadas. | Inspección estática del caller; sin cambios.

- **Resumen de necesidad:** Catalog, Home, Rates, Favorites y Pendings usan el contador mediante subqueries; Calendar no carga ni devuelve la colección. Los payloads de detalle, escrituras con Disc asignado y relaciones Rate/Asignation pueden incluir el array completo. El endpoint dedicado de Comments devuelve filas de Comment, pero reduce el Disc anidado o lo excluye.
- **Tests añadidos/ajustados:** el detalle de Catalog fija varios comentarios de distintos usuarios; el test existente cubre cero comentarios. Catalog verifica que el listado no una ni devuelva `Disc.comments` y conserve `commentCount`. Home verifica la subquery de contador, ausencia de JOIN y ausencia de la propiedad. Pendings verifica que su QB no cargue ni devuelva la colección.
- **Cargas explícitas añadidas:** ninguna. El detalle ya declara `comments.user`; las rutas de contador mantienen sus subqueries actuales.
- **Comparación de payloads:** se fijó el payload completo del detalle y se protegieron los payloads de Catalog/Home/Pendings. No se comparó antes/después con eager retirado porque los callers anidados de escritura/Rate/Asignation no tienen cobertura suficiente.
- **Bloqueo y hallazgo contractual:** `Disc.comments` es **OBSERVABLE PERO NO CONFIRMADA** en el detalle y en varias respuestas anidadas (`POST /comments`, escrituras con Disc, Rate/Asignation/List y PATCH). Quitar eager alteraría esos JSON salvo que cada caller haga carga explícita; faltan specs de esas respuestas y los consumidores externos no se verifican completamente. Mantener compatibilidad es la opción recomendada. Una reducción intencional de esas colecciones sería un cambio contractual backend + frontend si un cliente las consume; debe decidirse aparte. La carga innecesaria en rutas de validación es una mejora backend-only posible cuando se caractericen sus respuestas.
- **Verificaciones con Node 20.20.2:** `yarn test src/discs --runInBand`: 26 suites aprobadas, 7 suites PostgreSQL omitidas por guard, 249 tests aprobados y 28 omitidos. Suites focalizadas Catalog, mapper Catalog, Calendar, Home, Pendings y Lists: 6 suites y 158 tests aprobados. Comments, Rates, Favorites y Asignations no tienen specs en este checkout. `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` aprobados.
- **Estado final:** D44 queda cerrada sin cambio de entidad porque el payload observable de varios callers no está completamente caracterizado. `Disc.comments` conserva `eager: true`; D45 permanece pendiente.
- **Riesgo:** M.

### D45 — Índices: inventario de queries y esquema

- [x] Cerrada (2026-10-04)
- **Objetivo:** contrastar consultas observadas con índices existentes y decidir si hay una carencia medible.
- **Alcance:** filtros/orden de Disc.releaseDate, Disc.artistId/genreId, rates por discId/userId, comments/favorites/pendings/asignaciones por discId; migraciones que los crean y consultas de D1–D38.
- **Candidatos registrados en D7.1:** `rate(discId)` para agregados por disco (incluye el join de ranking observado en D32); `comment(discId)` para `commentCount`; índices compuestos de estado por `userId`/`discId` en `rate`, `favorite` y `pending`; `disc(releaseDate)` para el filtro/orden frecuente. Contrastar también la necesidad de índices sobre `releaseDate` y campos ordenables con los planes de la aplicación real.
- **Fuera de alcance:** añadir índices por intuición o convertir esta revisión en una migración.
- **Dependencias:** D1–D38.
- **Criterios de finalización:** se reúnen también todos los candidatos registrados durante D1–D38; cada uno se vincula a una query concreta, filtro/join/orden beneficiado, frecuencia/cardinalidad, índice existente, plan actual y decisión. Sin evidencia de beneficio no se propone migración.
- **Verificaciones:** revisar esquema/migraciones y planes representativos con EXPLAIN ANALYZE; registrar parámetros usados.
- **Inventario de entidades/migraciones:** `Disc` declara relaciones Artist/Genre y `releaseDate`, sin `@Index`; Rate, Comment, Favorite, Pending y Asignation tampoco declaran índices. Las migraciones que afectan a Disc/relaciones (sync inicial, debut, cascada Artist → Disc y National Release) no crean índices secundarios para estos campos; PostgreSQL no crea índices automáticamente por las FK. La inspección de `pg_indexes` en `SpamMusicDB` confirma solo PK en `disc`, `rate`, `comment`, `favorite`, `pending`, `asignation`, `artist` y `genre`.
- **Esquema PostgreSQL observado:** PostgreSQL 17.10; estimaciones `reltuples`: disc 6.630 (1.800 kB total), rate 18.938 (2.600 kB), comment 797 (272 kB), favorite 1.679 (264 kB), pending 4.951 (656 kB), asignation 654 (296 kB), artist 6.483 (1.280 kB), genre 80 (32 kB). Hay 18.940 rates, 1.679 favorites y 4.951 pendings con `userId` y `discId`; Asignation tiene `discId` no nulo en 576 de 654 filas. Los datos/plans corresponden a esta base local y a tablas calientes en caché.
- **Planes y decisiones (EXPLAIN ANALYZE, BUFFERS):**

| Candidato/decisión | Query, uso y cardinalidad | Índice actual | Plan y evidencia |
| --- | --- | --- | --- |
| `rate(discId)` — **JUSTIFICADO** | Catalog `findAll`/`findRandom`: AVG(rate), AVG(cover), count no nulo por Disc; varias subqueries por fila de página. Home D32 une Rate por Disc. Rate ~18.940 filas. | PK `rate(id)` únicamente. | Página representativa de 10: dos subplanes hacen `Seq Scan rate`, 18.940 examinadas × 10 loops, 2.460 buffers por subplan; ejecución 17,84 ms. `rate(discId)` permitiría buscar solo las filas del disco y apoyaría el join de ranking. Coste: espacio e I/O de escrituras en ~19k filas. |
| `comment(discId)` — **JUSTIFICADO** | Catalog y Home calculan `commentCount` correlacionado; una ejecución por Disc mostrado (página de 10–20). Comment: 797 filas. | PK `comment(id)` únicamente. | Catalog, página de 10: scan de 797 × 10 loops, 240 buffers y 4,04 ms; cero coincidencias en esos discos recientes. `comment(discId)` evitaría recorrer la tabla por cada Disc. Candidato moderado: tabla pequeña, así que el ahorro local no garantiza mejora global; coste bajo pero no nulo de espacio/escritura. |
| `rate(userId,discId)` — **JUSTIFICADO** | Catalog D4 une Rate personal por ambos campos; Home D33 hace tres subqueries de Rate con `LIMIT 1` por Disc (página máxima 20). | PK únicamente. | Proyección representativa de las cinco subqueries personales de Home, limitada a 20 discos: cada subquery Rate recorrió 18.940 filas en 20 loops, 4.920 buffers por subplan (14.760 combinados), ~0,88–0,90 ms por loop; total 60,87 ms. El usuario con más Rates no tenía estado en esos 20 discos recientes. Lookup puntual por pareja existente: scan de 18.940 filas, 246 buffers, 0,94 ms. Compuesto permitiría index lookup exacto y reduciría scans repetidos; coste de espacio/escritura. |
| `favorite(userId,discId)` — **JUSTIFICADO** | Catalog D4 y Home D33 consultan favorito del usuario por Disc, con `LIMIT 1` y hasta 20 discos. Favorite: 1.679 filas. | PK únicamente. | Subquery Home: Seq Scan × 20, 400 buffers combinados, ~0,078 ms por loop. Pareja puntual: scan de 1.679, 20 buffers, 0,080 ms. La repetición sustenta el compuesto aunque el ahorro absoluto esperado es menor que en Rate; tabla pequeña, coste de escritura/espacio. |
| `pending(userId,discId)` — **JUSTIFICADO** | Catalog D4 une pendiente del usuario; Home D33 proyecta `pendingId` por pareja, hasta 20 discos. Pending: 4.951 filas. | PK únicamente. | Subquery Home: Seq Scan × 20, 1.140 buffers combinados, ~0,216 ms por loop. Pareja puntual: scan de 4.951, 57 buffers, 0,207 ms. Compuesto soporta lookup exacto y búsquedas por `userId` en listados; coste de espacio/escritura. |
| `disc(releaseDate)` — **NO JUSTIFICADO** | Catalog filtra hasta hoy/ordena DESC; Calendar selecciona un mes y ordena ASC; Home usa fecha. Disc: 6.630 filas, 6.630 ≤ `2026-10-04` (2 futuras). | PK únicamente. | Catalog: scan de 6.630 + top-N de 10, 192 buffers, 1,22 ms. Calendar octubre 2026: 5 resultados, scan de 192 buffers y sort, 0,49 ms. La query habitual selecciona prácticamente toda la tabla y el top-N ocupa 25 kB; no compensa indexar con la evidencia actual. |
| `disc(genreId)` — **NO JUSTIFICADO** | Filtro opcional en Catalog/Home/random; Disc 6.630, Genre 80. | PK únicamente. | El género más frecuente devuelve 895 filas en scan; la selección exterior cuesta ~0,7 ms. El EXPLAIN total fue 2,23 ms porque además calculó en la misma query el género más frecuente. Sin volumen/coste suficiente para índice ahora. |
| `disc(artistId)` — **NO JUSTIFICADO** | Join Disc → Artist y filtro `EXISTS` por artista/género; 6.630 Disc, 6.429 artistas distintos. | PK únicamente. | El artista más frecuente devuelve 13 filas de 6.632; EXPLAIN total 3,54 ms incluyendo subplan que encuentra ese artista. No indexar solo por ser FK; no hay carga medida que pruebe beneficio. |
| `asignation(discId)` — **NO JUSTIFICADO** | La query actual `findAndCount` pagina Asignation sin filtro Disc; creación valida Disc usando PK. No se halló filtro de aplicación por `discId`. Tabla 654; 576 con disco. | PK únicamente. | Lookup diagnóstico por Disc más frecuente: scan de 654, cuatro filas, 26 buffers, 0,063 ms. No es query observada del servicio; no añadir índice genérico FK. |

- **Parámetros medidos:** `releaseDate <= 2026-10-04`; Calendar `2026-10-01`–`2026-10-31`; páginas de 10 discos (20 en proyección de estado); género/artista de mayor frecuencia; parejas user/disc existentes y usuario con mayor número de rates. Se omiten UUIDs concretos. No se creó índice de prueba ni se modificó el esquema.
- **Candidatos D1–D38 consolidados:** D3/D5/D6.1/D6.2 registran repetición de `AVG(rate.rate)` al filtrar/ordenar por `averageRate`; D7.1 midió y reemplazó el filtro por `EXISTS`, mantuvo la media y dejó scans repetidos de Rate/Comment como candidatos. `rate(discId)` cubre también el join de ranking de D32. D33 evidencia cinco subqueries personales por Disco; D34–D38 no añaden candidatos. D8 (`RANDOM()`) y D19 (mes completo tras filtrar semana) no aportan evidencia para un índice nuevo. No se encontraron otros candidatos registrados entre D1–D38.
- **Artist trigram:** `1758355724537-SyncEntities.ts` crea `artist_name_normalized_trgm_idx` GIN `gin_trgm_ops`, pero `1758424806274-AddStateToVersionItem.ts` lo elimina en `up` y no lo recrea. No está en el catálogo vivo: solo existe PK en Artist. El filtro de Catalog D1 busca `artist.name`/`disc.name` mediante `ILIKE`, no `artist.name_normalized`; el GIN declarado no cubriría esa query. Se registra la inconsistencia migratoria, sin incorporarla como índice de Disc ni proponer restaurarlo en D46 (búsqueda Artist fuera de este alcance). Los índices de Version, National Release y Spotify Playlist Artist observados en otras migraciones no aplican a estas queries.
- **Recomendación para D46:** comparar antes/después y evaluar una migración reversible con `rate(discId)`, `comment(discId)`, `rate(userId,discId)`, `favorite(userId,discId)` y `pending(userId,discId)`. Scans repetidos justifican probar esos cinco; el beneficio medido más claro está en Rate. D46 deberá verificar beneficio real y coste de escritura/espacio, en especial para Comment/Favorite/Pending, que hoy son tablas modestas.
- **Descartados para D46:** `disc(releaseDate)`, `disc(artistId)`, `disc(genreId)` y `asignation(discId)` quedan **NO JUSTIFICADO** con el tamaño, consultas y planes actuales. No cambia ningún contrato o query de producción; siguen vigentes las decisiones contractuales de D5, D7 y D39–D44.
- **Tests focalizados:** no se tocaron queries ni código de producción; no aplica suite adicional de medición.
- **Verificaciones:** entidades, migraciones y esquema vivo revisados; planes `EXPLAIN ANALYZE` representativos para releaseDate, artistId/genreId, agregados Rate/Comment, estados userId/discId y diagnóstico Asignation registrados; `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` ejecutados al cierre.
- **Estado final:** D45 cerrada. D46 sigue pendiente; no se añadieron índices ni migraciones.
- **Riesgo:** XS.

### D46 — Índices: migración justificada

- [x] Cerrada (2026-10-04)
- **Objetivo:** implementar únicamente los índices que D45 demuestre necesarios.
- **Alcance:** nueva migración TypeORM con up/down limitada a las consultas justificadas; no modificar migraciones históricas.
- **Fuera de alcance:** índices genéricos para cada FK o cambios de query no relacionados.
- **Dependencias:** D45.
- **Criterios de finalización:** cada índice tiene query objetivo y evidencia antes/después; la migración es reversible, no duplica índices existentes y no cambia datos ni contratos. Si D45 no demuestra beneficio, cerrar esta tarea sin migración y documentar la decisión.
- **Verificaciones:** revisar up/down y SQL; ejecutar migración en PostgreSQL de prueba; comparar EXPLAIN ANALYZE antes/después; <code>pnpm build</code>.
- **Migración:** `src/migrations/1791127430930-AddDiscQueryIndexes.ts`, con nombres estables `IDX_rate_disc_id_d46`, `IDX_comment_disc_id_d46`, `IDX_rate_user_disc_d46`, `IDX_favorite_user_disc_d46` y `IDX_pending_user_disc_d46`. `up` crea solo estos cinco B-tree; `down` los elimina en orden inverso. Antes de aplicarla se confirmó que no existía un índice equivalente, aparte de las PKs, en el esquema vivo. No se cambiaron queries/contratos ni migraciones históricas.
- **EXPLAIN ANALYZE antes/después (misma base y parámetros representativos de D45):**

| Índice | Query/plan antes → después | Tiempo y buffers antes → después | Uso y decisión final |
| --- | --- | --- | --- |
| `rate(discId)` | Agregados de página de 10: `Seq Scan rate` (18.940 filas × 10 loops por subquery) → `Bitmap Heap Scan` con `Bitmap Index Scan IDX_rate_disc_id_d46`. | **17,90 ms → 1,91 ms**; 5.112 → ~250 buffers totales en el plan después (rate por disco baja de 4.920 buffers a decenas). | PostgreSQL usa el índice en AVG/count por disco; conservar. |
| `comment(discId)` | `commentCount` para página de 10: `Seq Scan comment` (797 × 10) → `Index Scan IDX_comment_disc_id_d46`. | **1,80 ms → 1,18 ms**; 432 → ~212 buffers. | Índice usado por el contador. Mejora absoluta pequeña en esta tabla y muestra, pero elimina los scans repetidos; conservar. |
| `rate(userId,discId)` | Cinco subqueries personales Home para 20 discos: tres scans completos de Rate, cada uno 20 loops → index scans `IDX_rate_user_disc_d46` en esas tres expresiones. Lookup puntual por pareja: seq scan → index scan. | Home **58,16 ms → 1,54 ms**; 16.492 → ~401 buffers. Pareja **0,94 ms → 0,14 ms** (D45, mismos valores representativos). | PostgreSQL usa el índice en Home y lookup exacto. El join global de Catalog mantiene hash join y seq scan de Rate (5.112 buffers / 6,78 ms antes; 519 buffers / 7,37 ms después para el join completo), sin mejora de tiempo ahí; mantenerlo por las subqueries personales que sí se aceleran. |
| `favorite(userId,discId)` | Subquery `LIMIT 1` de Home, 20 discos: seq scan × 20 → index scan `IDX_favorite_user_disc_d46`; lookup por pareja: seq scan → index scan. | Home contribuye al total de 58,16 → 1,54 ms; buffers del subplan 400 → ~40. Pareja **0,080 ms → 0,034 ms** (D45). | PostgreSQL usa el índice en ambas formas. El join de Catalog usa bitmap por prefijo `userId`, aunque el plan global no reduce el tiempo; conservar. |
| `pending(userId,discId)` | Subquery `LIMIT 1` de Home, 20 discos: seq scan × 20 → index scan `IDX_pending_user_disc_d46`; lookup por pareja: seq scan → index scan. | Home contribuye al total de 58,16 → 1,54 ms; buffers del subplan 1.140 → ~40. Pareja **0,207 ms → 0,018 ms** (D45). | PostgreSQL usa el índice en Home y lookup exacto. En el join global de Catalog mantiene hash/seq scan de Pending por el volumen seleccionado por ese usuario; no se atribuye ahorro a ese plan. Conservar por el acceso personal repetido de Home. |

- **Parámetros y lectura de tiempos:** `releaseDate <= 2026-10-04`, top 10 para agregados, top 20 para la proyección de cinco subqueries personales; mismo usuario con más Rates, género/artista de mayor frecuencia y parejas existentes que D45. No se imprimen UUIDs. Los tiempos son de ejecuciones locales y pueden variar con caché; la caída de filas/buffers y el cambio de scan corroboran los accesos. En Catalog, Rate/Pending siguen en secuencial/hash porque el usuario seleccionado conserva una fracción grande de sus tablas; no se fuerza un scan de índice.
- **Migración y rollback:** el historial local tenía pendiente una migración anterior ajena (`AddDashboardButtonsEnabledToUsers1786507000000`). Para no ejecutarla ni ampliar alcance, se usó TypeORM `MigrationExecutor` limitado a `AddDiscQueryIndexes1791127430930`. `up` aplicó solo D46. `down` eliminó los cinco índices y su registro; se comprobó ausencia. Se volvió a aplicar `up`: los cinco índices y el registro D46 están presentes, y la migración ajena continúa pendiente.
- **Descartes después de medir:** ninguno de los cinco candidatos se quitó; todos son usados por PostgreSQL al menos en el agregado o subquery por el que se justificó. Los índices compuestos de Rate/Pending no se seleccionan en el join global de Catalog, pero sí en el estado personal correlacionado de Home. No se añadieron índices de Disc, Asignation, trigram ni otros.
- **Verificaciones:** `up/down/up` de TypeORM, catálogo de índices e historial comprobados; `EXPLAIN ANALYZE` antes/después con agregados Rate, `commentCount`, cinco estados personales Home, join de estado Catalog y lookups de pareja; suite completa de Discs, `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` ejecutados al cerrar.
- **Estado final:** D46 queda cerrada con cinco índices aplicados en la base local. D47 permanece pendiente.
- **Riesgo:** M.

### D47 — Limpieza final de Discs

- [x] Cerrada (2026-10-04)
- **Objetivo:** retirar duplicación o código/imports obsoletos que queden después de completar las subtareas, sin crear capas innecesarias.
- **Alcance:** src/discs y helpers de Discs creados por tareas anteriores; comentarios que ya no describan el código.
- **Fuera de alcance:** cambios funcionales nuevos o limpieza oportunista de otros módulos.
- **Dependencias:** D1–D46.
- **Criterios de finalización:** no hay responsabilidades mezcladas restantes que se hayan acordado para esta fase; helpers tienen un uso/responsabilidad clara; no se introducen abstracciones genéricas sin consumidor.
- **Verificaciones:** revisar diff completo, <code>pnpm exec jest src/discs/__tests__/discs.service.spec.ts src/discs/__tests__/discs.controller.spec.ts --runInBand</code>, <code>pnpm build</code>.
- **Limpieza realizada:** en `calendar/helpers/map-weekly-discs-to-groups.ts`, `WeeklyDiscPayload` queda como tipo interno porque no tiene consumidores externos; `WeeklyCalendarGroup` sigue exponiendo la misma forma inferida. Se retiró de `DiscsService.getSpotifyTracks` el comentario explicativo que duplicaba palabra por palabra el comentario de la implementación en `DiscSpotifyService`.
- **Revisión estructural:** `DiscsService` permanece como fachada de 132 líneas: no tiene repositorio propio, helpers privados ni lógica duplicada de Catalog, Calendar, Home, Write, Enrichment o Spotify. Inyecta los siete servicios que usa; conserva `SpotifyApiService` para las dos operaciones Spotify aún coordinadas allí y el 404 específico de resolver álbum. Los servicios extraídos mantienen sus dependencias directas. Helpers puros tienen consumidores; `getFridayWeekRanges` se comparte entre Calendar y Enrichment. No se reubicaron ni borraron archivos.
- **Tamaños aproximados:** `DiscsService` 132 líneas; `DiscCatalogService` 394 (varios endpoints caracterizados); `DiscCalendarService` 261; `DiscHomeService` 133; `DiscWriteService` 140; `DiscEnrichmentService` 44; `DiscSpotifyService` 42. Los specs de Catalog y Calendar son extensos por las caracterizaciones de contratos y consultas; permanecen junto a sus responsabilidades y no se fragmentaron sin beneficio demostrable.
- **DiscModule:** sin cambios. Providers: fachada y seis servicios de responsabilidad; `TypeOrmModule.forFeature([Disc, Artist, Genre, Country])` cubre los repositorios inyectados. `AuthModule` y `WordpressModule` siguen siendo necesarios; exporta únicamente `DiscsService`, consumido externamente.
- **Tests y duplicación:** specs raíz de `DiscsService`/controller verifican delegación y límites HTTP; las suites de Catalog, Calendar, Home, Write, Enrichment y Spotify conservan sus pruebas específicas. Los helpers tienen specs junto a ellos. Las siete suites PostgreSQL permanecen en `home/__tests__/` como integración transversal. No se encontraron caracterizaciones completas duplicadas tras las extracciones ni otros exports/helpers/imports sin consumidor demostrable.
- **Migración D46:** revisada sin cambios; `up`/`down` contienen los mismos cinco índices D46 en orden reversible y no hay índices ajenos al alcance.
- **Hallazgos deliberadamente abiertos:** se preservan sin corrección los permisos y contratos observados; las relaciones eager/payloads visibles y consumidores sin confirmar de D39–D44; duplicados Favorite/Pending y su fanout; falta de desempate para ranking/ordenaciones; selección personal de Rate sin orden; semánticas de filtros/fechas como `year=0`, fecha/rangos semanales; y discrepancias entre el tipo de Calendar y campos runtime. También permanecen las decisiones de D5/D7 sobre exclusión de discos sin `averageRate`, arrays observables y país ausente. D47 no cambia queries, permisos, tipos públicos ni payloads.
- **Verificaciones con Node 20.20.2:** suite completa con las siete pruebas PostgreSQL optativas habilitadas: 33 suites y 277 tests aprobados. Suites focalizadas de fachada, controller y Calendar: 3 suites y 65 tests aprobados. `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` y `git diff --check` aprobados. En primer intento, las suites PostgreSQL dieron `EPERM` al conectar desde sandbox; al repetir con acceso local autorizado, todas pasaron.
- **Estado final:** D47 cerrada. D48 permanece pendiente.
- **Riesgo:** S.

### D48 — Regresión final de Discs

- [x] Completada (2026-10-04)
- **Objetivo:** demostrar que el módulo refactorizado mantiene las rutas, contratos y permisos actuales.
- **Alcance:** todos los endpoints y callers internos de Discs cubiertos en la fase, incluyendo LastFM y Spotify.
- **Fuera de alcance:** cambios contractuales nuevos o refactors de fases futuras.
- **Dependencias:** D47.
- **Criterios de finalización:** suite de caracterización/regresión completa, pruebas relacionadas y build pasan; se revisan migraciones y alcance final; quedan documentadas excepciones verificables, sin tareas de Discs implícitas.
- **Verificaciones:** <code>pnpm exec jest src/discs --runInBand</code>, <code>pnpm run test:e2e -- --runInBand</code> si hay e2e aplicables, y <code>pnpm build</code>.
- **Regresión Discs (Node 20.20.2):** `yarn test src/discs --runInBand` con `D31_POSTGRES_TEST=1` … `D37_POSTGRES_TEST=1`: **33 suites y 277 tests aprobados**, incluidas las siete suites PostgreSQL. El primer intento dentro del sandbox no pudo conectar a `127.0.0.1:5432` (`EPERM`); la repetición con acceso local autorizado pasó completa.
- **Consumidores internos:** `yarn test src/lists/list.service.spec.ts src/excel/excel.service.spec.ts src/pendings/pendings.service.spec.ts --runInBand`: Lists y Pendings pasan (**19 tests**). Los **3 tests de Excel fallan** al construir su fixture porque no registra el provider `DiscRepository` requerido por `ExcelService`; es el mismo fallo documentado desde D39, preexistente y ajeno a esta fase, por lo que no se corrigió. No hay specs en el repo para Favorites, Rates, Comments, Asignations o National Releases.
- **E2E:** `test/` contiene `app.e2e-spec.ts` y `excel.e2e-spec.ts`, pero ninguno prueba rutas de Discs; por tanto no hay E2E aplicables a endpoints de Discs y no se ejecutó una suite E2E no relacionada.
- **Contratos y migraciones:** revisión final del diff confirma que `discs.controller.ts`, DTOs de producción, entidades y migraciones históricas no se modificaron en la fase; las rutas y guards actuales permanecen en el controller. La única migración nueva es D46, `1791127430930-AddDiscQueryIndexes.ts`: su `up`/`down` contiene los cinco índices D46 y sus drops inversos; la aplicación, rollback y reaplicación quedaron verificados en D46. No hay migraciones accidentales, temporales ni cambios de `.impeccable/config.json`.
- **Diff final:** los cambios de fase están limitados al refactor y caracterizaciones bajo `src/discs`, el spec de `Pendings` añadido para su caller y la migración D46; no se detectaron imports/configuración obsoletos ni cambios contractuales nuevos sin documentar. No hubo regresiones de Discs que corregir.
- **Estado de servicios:** `DiscsService` 132 líneas (fachada); Catalog 394; Calendar 261; Home 133; Write 140; Enrichment 44; Spotify 42. La estructura final conserva las responsabilidades y specs junto a sus servicios, helpers locales y las siete pruebas PostgreSQL transversales en `home/__tests__/`.
- **Hallazgos contractuales deliberadamente abiertos:** eager loading y arrays/payloads observables o consumidores no confirmados; permisos y respuestas anidadas sin caracterización completa; duplicados Favorite/Pending y fanout; empates sin desempate y Rate personal sin orden; semánticas de filtros/fechas (`year=0`, límites semanales) y discrepancias entre tipos y datos runtime; exclusión de discos sin `averageRate` y mapeo de país ausente. Se conservan las decisiones de D39–D47 sin resolverlas en D48.
- **Verificaciones finales:** suite completa Discs (33/33 suites, 277/277 tests); consumidores Lists/Pendings (19 tests aprobados) y Excel (3 fallos preexistentes descritos); E2E de Discs no aplicables; `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` aprobado; `git diff --check` aprobado; revisión del diff completo realizada.
- **Estado final:** D48 completada y **fase Discs (D0–D48) cerrada** (2026-10-04). No se inició ninguna fase futura.
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
