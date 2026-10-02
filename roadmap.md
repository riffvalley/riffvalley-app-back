# Backend Refactor Roadmap

## Objetivos

Refactorizar progresivamente el backend de Riff Valley para mejorar su mantenibilidad, aplicar SOLID con pragmatismo, reducir duplicación y coste de consultas y evitar cargas de datos innecesarias, preservando el comportamiento actual.

La primera fase usa Discs como piloto. La inspección inicial encontró un servicio de 1.235 líneas, consultas SQL y QueryBuilder mezcladas, mapeos de respuesta repetidos y relaciones eager en Disc. No se encontraron pruebas específicas de Discs. Las tareas siguen pendientes hasta que exista evidencia para cerrarlas.

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
- Priorizar SRP, sin convertir cada método en una clase o capa.
- No introducir DDD por capas, arquitectura hexagonal, CQRS, use cases, puertos/adaptadores, repositorios abstractos genéricos ni interfaces sin necesidad concreta.
- No introducir use cases por operación, command/query buses, Redis ni capas nuevas por razones estéticas.
- Crear helpers o servicios auxiliares solo cuando tengan una responsabilidad cohesionada y reutilizable.
- No extraer clases únicamente porque un archivo sea grande. Simplificar por responsabilidad y facilitar pruebas.
- Mantener la inyección de dependencias de NestJS y TypeORM existentes salvo que una tarea concreta justifique otra cosa.
- Aplicar SOLID pragmáticamente: priorizar SRP, reducir duplicación, aclarar dependencias y mantener métodos comprensibles y responsabilidades cohesionadas.

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
- Antes de cerrar una fase, ejecutar las pruebas relacionadas y el build: <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>, <code>pnpm exec jest src/discs/discs.controller.spec.ts --runInBand</code> cuando aplique, y <code>pnpm build</code>.
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
- **Verificaciones:** <code>pnpm exec jest src/discs/discs.service.spec.ts src/discs/discs.controller.spec.ts --runInBand</code>; revisar las rutas y decoradores de Auth en discs.controller.ts; <code>pnpm build</code>.
- **Riesgo:** S.
- **Nota de baseline (2026-10-02):** El repo usa Yarn 1.22.22. Los specs focalizados pasan; el `nest build` canónico no puede limpiar `dist/access-requests` (propiedad de `nobody`) y la compilación emitida en `/tmp` revela usos de `Express.Multer` sin tipo en cinco archivos preexistentes fuera de Discs. No se alteraron para cerrar D0.

### D1 — findAll: filtros

- [x] Completada
- **Objetivo:** hacer comprensible y verificable la aplicación de búsqueda, fechas, género, país y estado de voto sin alterar su semántica.
- **Alcance:** filtros de findAll en discs.service.ts y los casos de PaginationDto usados por ese endpoint; consistencia con la consulta de resultados y la de count.
- **Fuera de alcance:** joins de respuesta, agregados, orden y paginación.
- **Dependencias:** D0.
- **Criterios de finalización:** cada filtro mantiene el resultado actual; country/countryId conserva la resolución por UUID o nombre; voted y votedType mantienen sus valores admitidos y su comportamiento actual.
- **Verificaciones:** pruebas de filtros combinados y aislados en discs.service.spec.ts; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D2 — findAll: joins y datos seleccionados

- [x] Completada
- **Objetivo:** priorizar la eliminación de joins innecesarios, evitar relaciones sin consumidor y evitar duplicación de filas manteniendo queries comprensibles.
- **Alcance:** joins de Disc, Artist, Country y Genre en findAll; evaluar selección explícita de campos únicamente si tiene beneficio claro.
- **Fuera de alcance:** Rate/Favorite/Pending por usuario, agregados, formato final y otros endpoints.
- **Dependencias:** D0, D1.
- **Criterios de finalización:** cada join tiene un consumidor identificado; se preservan todos los campos HTTP actuales y no aparecen N+1 ni duplicación de filas. La selección parcial de entidades no es un objetivo: no adoptarla si produce entidades ambiguamente hidratadas, reconstrucción compleja o mapping menos mantenible; limitar columnas solo cuando el beneficio sea claro.
- **Verificaciones:** pruebas de respuesta completa y nulos; inspeccionar SQL generado y número de queries en fixture; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D3 — findAll: agregados

- [ ] Pendiente
- **Objetivo:** aislar y hacer comprobables averageRate, averageCover, voteCount y commentCount.
- **Alcance:** subconsultas/agregados de rate y comment de findAll y su lectura desde el resultado raw.
- **Fuera de alcance:** estadísticas de homeDiscs, filtros de voted y cambios de fórmula.
- **Dependencias:** D0, D2.
- **Criterios de finalización:** se preserva exactamente la semántica de averageRate, averageCover, voteCount y commentCount, incluidos casos sin datos, decimales y null/0. Cada agregado tiene una única definición lógica en la consulta y no se duplica accidentalmente para distintos puntos del mapping; no se impone una estrategia física al optimizador.
- **Verificaciones:** pruebas con cero, uno y varios rates/comentarios y valores nulos; revisar SQL; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D4 — findAll: estado del usuario

- [ ] Pendiente
- **Objetivo:** cargar y exponer el rate, favoriteId y pendingId del usuario autenticado sin multiplicar filas.
- **Alcance:** joins de rate/favorite/pending restringidos al usuario en findAll y sus campos derivados.
- **Fuera de alcance:** estadísticas globales, escritura de esas relaciones y otros listados.
- **Dependencias:** D0, D2.
- **Criterios de finalización:** usuario con y sin cada relación recibe los mismos valores actuales; una relación de usuario no duplica discos ni altera voteCount.
- **Verificaciones:** pruebas de combinaciones con y sin rate/favorite/pending; inspección de SQL y resultado raw; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D5 — findAll: ordenación

- [ ] Pendiente
- **Objetivo:** ordenar de forma clara y segura por los campos permitidos, manteniendo el orden predeterminado.
- **Alcance:** parsing de orderBy, allowlist de campos y dirección, incluyendo disc.averageRate.
- **Fuera de alcance:** filtros, agregados y paginación.
- **Dependencias:** D0, D1.
- **Criterios de finalización:** se preservan los campos y el orden por defecto observados; entradas no admitidas no introducen SQL ni cambian silenciosamente la selección de discos; queda cubierto el desempate si ya es observable.
- **Verificaciones:** pruebas por campo, dirección, varios criterios y entrada inválida; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D6 — findAll: paginación y count

- [ ] Pendiente
- **Objetivo:** asegurar que la página y totalItems reflejan los mismos filtros sin contar relaciones de usuario como discos adicionales.
- **Alcance:** take/skip, consulta totalItems, totalPages/currentPage y límites por defecto.
- **Fuera de alcance:** cambio de convención de paginación o de contrato.
- **Dependencias:** D0, D1.
- **Criterios de finalización:** límites, offset, páginas vacías y filtros combinados coinciden con baseline; el count no incluye el límite de página y no cambia por joins de colección.
- **Verificaciones:** pruebas de página inicial/final/vacía y total exacto; comparar SQL de datos y count; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D7 — findAll: mapping de respuesta

- [ ] Pendiente
- **Objetivo:** evitar que índices de raw y entities se desalineen y hacer explícita la adaptación a la respuesta HTTP vigente.
- **Alcance:** mapping de discs, artista/país, estado de usuario y agregados; helper local solo si expresa esta responsabilidad.
- **Fuera de alcance:** cambiar nombres, tipos o presencia de campos de respuesta.
- **Dependencias:** D2, D3, D4, D6.
- **Criterios de finalización:** payloads caracterizados coinciden incluidos null/0, relaciones vacías y campos de artista/país; el mapping no depende de coincidencia accidental de índices tras ordenar.
- **Verificaciones:** snapshots/expectativas explícitas de payload; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D8 — findRandom: selección de IDs y filtros

- [ ] Pendiente
- **Objetivo:** caracterizar y simplificar la selección aleatoria de IDs que evita paginar una consulta con joins y ORDER BY RANDOM().
- **Alcance:** filtros de genre, country/countryId, year, ep, debut, fecha actual, límite y query inicial de IDs.
- **Fuera de alcance:** hidratación de resultados y estado del usuario.
- **Dependencias:** D0.
- **Criterios de finalización:** el conjunto candidato respeta los filtros y el límite; se mantiene la consulta separada de IDs y se documenta el motivo técnico observado.
- **Verificaciones:** pruebas de filtros y conjunto vacío; revisar SQL en PostgreSQL; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D9 — findRandom: hidratación, agregados y estado

- [ ] Pendiente
- **Objetivo:** cargar solo los datos que requiere la respuesta aleatoria después de elegir IDs.
- **Alcance:** relaciones artista/país/género, estado de usuario y agregados de rates/comments en la consulta de hidratación.
- **Fuera de alcance:** selección aleatoria, opción de rediseñar la fórmula estadística y otros endpoints.
- **Dependencias:** D8.
- **Criterios de finalización:** cada ID seleccionado se hidrata una vez; métricas y estado del usuario coinciden con el baseline; no se vuelven a cargar colecciones completas sin consumidor.
- **Verificaciones:** fixtures con y sin estado/ratings y SQL de hidratación; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D10 — findRandom: orden aleatorio y mapping

- [ ] Pendiente
- **Objetivo:** preservar el orden de randomIds y la forma de respuesta al transformar resultados.
- **Alcance:** reordenación tras la consulta IN, asociación raw/entities y mapping final.
- **Fuera de alcance:** algoritmo de aleatoriedad o cardinalidad del endpoint.
- **Dependencias:** D9.
- **Criterios de finalización:** la respuesta conserva el orden decidido por la query de IDs, admite raw vacío/parcial de forma controlada y mantiene campos HTTP.
- **Verificaciones:** prueba con IDs en orden distinto al retorno de base de datos; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D11 — findOptions

- [ ] Pendiente
- **Objetivo:** hacer explícito el cálculo de opciones por campo sin filtrar por el propio campo solicitado.
- **Alcance:** query agrupada por country/genre/year/ep/debut, filtros ya seleccionados, conversión de tipos, orden aleatorio y límite.
- **Fuera de alcance:** cambiar los campos admitidos o el significado de la selección aleatoria.
- **Dependencias:** D0.
- **Criterios de finalización:** se conservan la omisión del filtro del campo pedido, las filas únicas, las conversiones de año/booleano y el límite validado.
- **Verificaciones:** pruebas por cada valor de field y filtros combinados; inspeccionar SQL agrupado; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D12 — findAllByDate autenticado: filtros y paginación

- [ ] Pendiente
- **Objetivo:** fijar la semántica del calendario autenticado antes de reducir sus joins de colección.
- **Alcance:** query, genre, country/countryId, dateRange, orden por releaseDate/artist y getManyAndCount.
- **Fuera de alcance:** calendario público y payload agrupado.
- **Dependencias:** D0.
- **Criterios de finalización:** se preservan filtros, inclusión de fechas, orden ascendente y respuesta de paginación; no se introduce el corte de fecha de findAll en este endpoint.
- **Verificaciones:** pruebas de filtro/fecha, páginas con joins y count; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D13 — findAllByDate autenticado: asignaciones y national release

- [ ] Pendiente
- **Objetivo:** cargar por lote la información de asignaciones y national release que requiere cada disco del calendario.
- **Alcance:** joins de Asignation, User y List; query batch de national_release para la página.
- **Fuera de alcance:** modificar módulos Asignations o National Releases, relaciones de escritura y forma de agrupación.
- **Dependencias:** D12.
- **Criterios de finalización:** asignaciones mantienen id/done/user/list y nationalReleaseId mantiene sus valores; las lecturas adicionales son acotadas al conjunto paginado y no crean N+1.
- **Verificaciones:** fixture con cero/varias asignaciones y national release; contar queries; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D14 — findAllByDate autenticado: agrupación y mapping

- [ ] Pendiente
- **Objetivo:** mantener estable el objeto de respuesta agrupado por fecha y sus campos derivados por usuario.
- **Alcance:** mapping de discos y artistas, rate/favorite/pending, nationalReleaseId, asignaciones y envelope de paginación.
- **Fuera de alcance:** el payload resumido del calendario público.
- **Dependencias:** D13.
- **Criterios de finalización:** fechas y orden de grupos coinciden con baseline; campos null y relaciones vacías se preservan; no se filtran columnas adicionales al frontend.
- **Verificaciones:** expectativas de payload para varias fechas y estado de usuario; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D15 — findAllByDatePublic: filtros y paginación

- [ ] Pendiente
- **Objetivo:** caracterizar la consulta pública independientemente del calendario autenticado.
- **Alcance:** genre, country/countryId, dateRange, relaciones de artista/país/género, orden y count.
- **Fuera de alcance:** añadir query de texto, datos de usuario o corte de fecha actual que hoy no existen.
- **Dependencias:** D0.
- **Criterios de finalización:** se conserva el subconjunto actual de filtros y no se cargan rates/favoritos/pendientes por usuario; count y página coinciden.
- **Verificaciones:** pruebas de filtros y respuesta sin autenticación; revisar SQL de consulta y count; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D16 — findAllByDatePublic: mapping

- [ ] Pendiente
- **Objetivo:** mantener el payload resumido público y la agrupación por fecha.
- **Alcance:** selección de campos Disc/Artist/Country/Genre, normalización de país null y envelope paginado.
- **Fuera de alcance:** forma del calendario autenticado y nuevos datos públicos.
- **Dependencias:** D15.
- **Criterios de finalización:** el payload expone los campos actuales y no los datos internos omitidos hoy; fechas, países nulos y orden se conservan.
- **Verificaciones:** pruebas de payload con y sin país/género; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D17 — getPublicFilters

- [ ] Pendiente
- **Objetivo:** verificar la selección distinta de géneros y países usados por algún disco.
- **Alcance:** dos queries de getPublicFilters, columnas proyectadas y orden alfabético.
- **Fuera de alcance:** cambiar si se incluyen entidades asociadas solo a discos futuros o sin género.
- **Dependencias:** D0.
- **Criterios de finalización:** se preservan columnas, orden y criterio de asociación; se documenta el coste de distinct/join con el plan si hay evidencia de lentitud.
- **Verificaciones:** pruebas de conjuntos vacíos, duplicados y orden; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** XS.

### D18 — Rangos semanales de viernes

- [ ] Pendiente
- **Objetivo:** fijar la regla de semanas del calendario antes de tocar sus consumidores.
- **Alcance:** getFridayWeekRanges y casos de transición entre meses, meses de 28–31 días y años bisiestos.
- **Fuera de alcance:** cambiar el convenio de semanas o formato de etiquetas.
- **Dependencias:** D0.
- **Criterios de finalización:** pruebas expresan que la primera semana empieza el día 1 y las siguientes se alinean con viernes; se conserva el comportamiento de los callers.
- **Verificaciones:** tests unitarios del helper desde discs.service.spec.ts; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D19 — findWeekly: consulta mensual

- [ ] Pendiente
- **Objetivo:** reducir la carga de filas del calendario semanal manteniendo el conjunto y orden actual.
- **Alcance:** query mensual con Artist/Country/Genre, intervalo de fechas y selección necesaria para la respuesta.
- **Fuera de alcance:** helper de semanas y formato final.
- **Dependencias:** D18.
- **Criterios de finalización:** límites mensuales, orden y discos incluidos coinciden con baseline; no se añaden filtros como releaseDate <= hoy.
- **Verificaciones:** fixtures en principio/final de mes y sin relaciones opcionales; SQL generado; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D20 — findWeekly: grupos y mapping

- [ ] Pendiente
- **Objetivo:** mantener los grupos semanales y los campos entregados por el endpoint.
- **Alcance:** countryCode/countryName, debut, fechas ISO, etiqueta, startDate/endDate y campos del disco.
- **Fuera de alcance:** formato de otras rutas de calendario.
- **Dependencias:** D19.
- **Criterios de finalización:** semana opcional, etiquetas y payload observados quedan cubiertos; la declaración de tipo y la respuesta real se contrastan sin alterar el contrato en esta tarea.
- **Verificaciones:** prueba de respuesta por mes/semana y comparación con baseline; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D21 — LastFM: discos sin imagen

- [ ] Pendiente
- **Objetivo:** preservar el contrato interno usado por LastFM para encontrar discos a completar.
- **Alcance:** findWeeklyWithoutImage, sus callers en lastfm.service.ts, rango semanal y selección de id/artista/nombre.
- **Fuera de alcance:** cliente LastFM, política de imágenes y endpoint semanal público.
- **Dependencias:** D18.
- **Criterios de finalización:** se conservan rango, criterio null/vacío de imagen, orden y forma de cada resultado; la llamada de LastFM sigue recibiendo los mismos datos.
- **Verificaciones:** prueba de selección con imagen null/vacía/no vacía y llamada del caller; <code>pnpm exec jest src/discs/discs.service.spec.ts src/lastfm/lastfm.service.spec.ts --runInBand</code> si se incorpora la prueba de integración.
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
- **Verificaciones:** tests de disco existente, inexistente y relaciones opcionales; <code>pnpm exec jest src/discs/discs.service.spec.ts src/discs/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D24 — create: POST /discs

- [ ] Pendiente
- **Objetivo:** hacer explícita la construcción, persistencia y manejo de errores de creación básica.
- **Alcance:** método create, CreateDiscDto y respuesta HTTP actual.
- **Fuera de alcance:** createWithArtist, cambios de validación, permisos y nuevos valores por defecto.
- **Dependencias:** D0.
- **Criterios de finalización:** campos admitidos, defaults, relaciones indicadas por DTO y traducción actual de error 23505 quedan cubiertos; no cambia la ruta ni la respuesta.
- **Verificaciones:** pruebas de DTO/servicio/controller y error de conflicto; <code>pnpm exec jest src/discs/discs.service.spec.ts src/discs/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** XS.

### D25 — createWithArtist: resolver artista

- [ ] Pendiente
- **Objetivo:** aislar los casos de artista existente, nuevo o ambiguo de la creación del disco.
- **Alcance:** resolveArtist, búsqueda case-insensitive, normalización y countryId de desambiguación.
- **Fuera de alcance:** cambiar la regla de coincidencia, el esquema de Artist o el flujo de Requests.
- **Dependencias:** D0.
- **Criterios de finalización:** cero coincidencias crea artista, una coincidencia reutiliza, varias requieren countryId y país no coincidente crea artista; nameNormalized respeta el formato actual.
- **Verificaciones:** pruebas de los cuatro caminos y error BadRequest; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D26 — createWithArtist: construir y guardar disco

- [ ] Pendiente
- **Objetivo:** hacer explícito el mapeo del DTO compuesto al registro Disc.
- **Alcance:** construcción y save del disco después de resolver artista, valores opcionales y defaults.
- **Fuera de alcance:** crear un caso de uso genérico, transacción nueva o cambiar validaciones HTTP.
- **Dependencias:** D25.
- **Criterios de finalización:** todos los campos del DTO mantienen la conversión/default actual; countryId solo afecta a la resolución del artista; respuesta HTTP coincide con baseline.
- **Verificaciones:** pruebas del mapeo, artista/genre opcionales y fecha; <code>pnpm exec jest src/discs/discs.service.spec.ts src/discs/discs.controller.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D27 — update: PATCH /discs/:id

- [ ] Pendiente
- **Objetivo:** clarificar preload, asignación de artista/género, campos opcionales y manejo de errores.
- **Alcance:** update, UpdateDiscDto y response de PATCH.
- **Fuera de alcance:** permitir limpiar relaciones con null si el contrato actual no lo hace; añadir permisos o campos.
- **Dependencias:** D0.
- **Criterios de finalización:** update parcial no borra campos omitidos; artistId/genreId conservan semántica actual; id inexistente sigue siendo 404 y errores de persistencia mantienen su traducción.
- **Verificaciones:** tests de update parcial, relaciones, no encontrado y conflicto; <code>pnpm exec jest src/discs/discs.service.spec.ts src/discs/discs.controller.spec.ts --runInBand</code>.
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
- **Verificaciones:** mocks de SpotifyApiService para disco presente/ausente; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D30 — homeDiscs: filtros y parámetros SQL

- [ ] Pendiente
- **Objetivo:** eliminar la duplicación accidental al construir filtros para las consultas principales y globales de homeDiscs.
- **Alcance:** dateRange, genreId, country/countryId, valores bind y construcción de cláusulas SQL dinámicas de findTopRatedOrFeaturedAndStats.
- **Fuera de alcance:** cambiar fórmulas, estadísticas por periodo o payload.
- **Dependencias:** D0.
- **Criterios de finalización:** cada valor sigue parametrizado; filtros de query principal y global son equivalentes; los parámetros no cambian de orden o tipo accidentalmente.
- **Verificaciones:** pruebas de filtros individuales/combinados y SQL/params; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** M.

### D31 — homeDiscs: media global y mediana

- [ ] Pendiente
- **Objetivo:** aislar la query que calcula globalAvgRate y medianVotes para la puntuación ponderada.
- **Alcance:** globalStatsQuery, condiciones de D30, conversión de valores y defaults cuando no hay datos.
- **Fuera de alcance:** fórmula de weightedScore o caché.
- **Dependencias:** D30.
- **Criterios de finalización:** media/mediana y fallback coinciden con baseline con ratings nulos, sin votos y varios discos; filtro temporal/género/país se aplica igual.
- **Verificaciones:** casos de agregación en PostgreSQL; revisar el SQL generado; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
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
- **Verificaciones:** pruebas de estado por usuario y query; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
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
- **Verificaciones:** PostgreSQL con empates, nulos y rango de fechas; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D36 — homeDiscs: top users por cover

- [ ] Pendiente
- **Objetivo:** aislar el ranking de usuarios por cantidad de covers valoradas.
- **Alcance:** topUsersByCover query, statsDateRange, agrupación y mapping.
- **Fuera de alcance:** ranking por rate y cambios de contrato.
- **Dependencias:** D30.
- **Criterios de finalización:** cuenta solo cover no null, mantiene el nombre totalCover, rango y top 20 actuales.
- **Verificaciones:** PostgreSQL con cover null/no null y límites temporales; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D37 — homeDiscs: distribución de ratings

- [ ] Pendiente
- **Objetivo:** caracterizar el rango independiente de la distribución y sus valores decimales.
- **Alcance:** distributionDateRange, agrupación por rate, orden y conversión del resultado.
- **Fuera de alcance:** hacer que herede filtros de otra estadística o cambiar la escala de rate.
- **Dependencias:** D30.
- **Criterios de finalización:** solo se agrupan rates no null; se preservan rango, orden ascendente y tipos numéricos del payload.
- **Verificaciones:** casos con escala decimal, sin rates y ambos extremos del rango; <code>pnpm exec jest src/discs/discs.service.spec.ts --runInBand</code>.
- **Riesgo:** S.

### D38 — homeDiscs: mapping y envelope

- [ ] Pendiente
- **Objetivo:** mantener la respuesta combinada al separar la carga de discos de los cuatro grupos de estadísticas.
- **Alcance:** artist/country/genre, usuario, métricas, topUsersByRates, topUsersByCover, ratingDistribution y envelope final.
- **Fuera de alcance:** renombrar claves, cambiar null/0 o dividir la ruta.
- **Dependencias:** D31, D32, D33, D34, D35, D36, D37.
- **Criterios de finalización:** respuesta completa coincide con baseline para todos los subresultados; no se exponen aliases SQL auxiliares nuevos ni se pierden campos.
- **Verificaciones:** expectativa de payload completo con respuestas vacías/parciales; <code>pnpm exec jest src/discs/discs.service.spec.ts src/discs/discs.controller.spec.ts --runInBand</code>.
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
- **Verificaciones:** revisar diff completo, <code>pnpm exec jest src/discs/discs.service.spec.ts src/discs/discs.controller.spec.ts --runInBand</code>, <code>pnpm build</code>.
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
