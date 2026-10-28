# C-TOP-10 — Implementación bayesiana estable de TopDiscs

**Estado en el hito C-TOP-10:** implementación backend y verificaciones locales completadas; PostgreSQL opt-in pendiente en ese momento.
**Fecha:** 2026-10-28.
**Decisión:** prior global por voto y shrinkage fijo `k = 4`.
**Alcance:** SQL y pruebas de `GET /api/discs/topDiscs`, sus opciones dinámicas y el alias legacy `/api/discs/homeDiscs`.

## Modelo implementado

Para cada disco elegible se calcula:

```text
S = (R × v + C × 4) / (v + 4)
```

- `R` y `v` proceden de las valoraciones musicales vigentes válidas del disco.
- `C = SUM(votos válidos vigentes publicados) / COUNT(votos válidos vigentes publicados)`.
- `k = 4` se centraliza como `TOP_DISCS_PRIOR_STRENGTH`; no depende de filtros ni de estadísticas de cada periodo.
- La media observada se sigue exponiendo en `averageRate`; `weightedScore` conserva la puntuación bayesiana SQL sin redondeo previo.
- Se mantiene el orden `weightedScore DESC, d.id ASC` y el límite de 20.

`C` se calcula por voto, no como media de medias de discos. El universo incluye todo disco con `releaseDate <= hoy`, sin filtros de país, género o periodo de TopDiscs. Un voto cero participa; los valores nulos y fuera del rango 0–10 no participan. Los discos sin votos no aportan ceros. Los eventos históricos de Rate no se consultan.

Si no hay votos válidos publicados, `C` queda `NULL`; la consulta devuelve cero discos. No hay división por cero ni puntuación sintética.

## Rate vigente y duplicados

La entidad `Rate` no declara unicidad de `(discId, userId)`. La escritura actual serializa altas por usuario/disco mediante advisory lock y, cuando encuentra un Rate, actualiza ese registro en el mismo sitio. Como los datos históricos o manuales todavía pueden contener duplicados, TopDiscs conserva un registro por par mediante este orden determinista:

1. `editedAt DESC NULLS LAST` — el cambio más reciente representa el valor vigente.
2. `createdAt DESC` — desempata por creación más reciente.
3. `id DESC` — desempate final estable.

Primero se elige el registro vigente y después se comprueba si su valoración musical está entre 0 y 10. Así, un duplicado más reciente nulo o inválido no reactiva una valoración anterior. Rates sin `userId` no representan un voto deduplicable y se excluyen. No se modifican datos ni se añaden restricciones o migraciones.

## Elegibilidad y opciones

El predicado compartido del ranking y `GET /api/discs/topDiscs/options` ahora acepta únicamente discos presentes en `valid_current_rates`:

- Con uno o más votos musicales válidos, el disco participa, esté o no pinned.
- `pinned` no cambia puntuación ni elegibilidad y permanece disponible para usos editoriales fuera del ranking.
- Pinned sin votos válidos, discos sin votos y discos con solo Rates nulas quedan excluidos.
- Un voto válido de cero sí hace elegible al disco.

Las opciones siguen devolviendo una sola respuesta con países y géneros, ordenados y sin duplicados. Países usan periodo y género seleccionado e ignoran país; géneros usan periodo y país seleccionado e ignoran género. No ejecutan puntuaciones ni aplican el límite Top 20. El JSON y validaciones existentes no cambian.

La búsqueda de consumidores confirmó que el predicado compartido se usa solo en el ranking TopDiscs y sus opciones; otros dominios no heredan el cambio de elegibilidad.

## Consistencia y SQL

La CTE `current_rates` deduplica una sola vez por sentencia; `valid_current_rates` aplica la escala musical y alimenta el prior, la elegibilidad y los agregados individuales. El prior y el ranking se calculan dentro de la misma sentencia PostgreSQL, por lo que leen un mismo snapshot de esa sentencia. Las métricas auxiliares ya existentes continúan en sus loaders independientes.

Los agregados por disco se restringen a candidatos elegibles. `Rate` no se combina con dimensiones uno-a-muchos para calcular votos; artistas, países y géneros conservan sus joins many-to-one. `averageCover` sigue siendo una estadística auxiliar y se agrega por disco por separado. No se carga Rate en Node, no se hacen consultas por disco y no se agregan índices, caché, trabajos programados ni tablas estadísticas.

No se ejecutó `EXPLAIN ANALYZE`: no se confirmó una base PostgreSQL aislada y representativa. La CTE de votos vigentes y el prior requieren recorrer el conjunto de Rates publicado; su coste real queda por medir con datos representativos. Los índices existentes para `rate(discId)` y `rate(userId, discId)` no se modifican.

## Compatibilidad e impacto

- `/api/discs/topDiscs` conserva autenticación, DTO, filtros, payload, códigos HTTP y límite.
- `/api/discs/homeDiscs` conserva su `@deprecated`, permanece operativa y delega en la misma implementación. No se añade aviso HTTP ni fecha de retirada.
- El contenido observable de ambas rutas cambia deliberadamente en puntuación, orden y elegibilidad.
- No se encontró una referencia backend de Dashboard a `/homeDiscs` en este repositorio. Un consumidor de Dashboard que llame esa ruta recibirá el nuevo ranking; no se cambió su código ni sus estadísticas propias, y su presentación/datos externos no se verificaron aquí.
- No se modificaron frontend, Community, rutas, formatos ni atributos editoriales.

## Decisiones anteriores y límites

C-TOP-8 describía la elegibilidad `votos OR pinned` y un prior filtrado por vista; C-TOP-9 simulaba varias alternativas de k y prior, y proponía validación offline adicional. Esas descripciones se conservan como historial de auditoría. Para producción, sus propuestas de elegibilidad o calibración que difieran de este acuerdo quedan supersedidas por C-TOP-10: `pinned` no concede elegibilidad y `k=4` es el valor inicial aprobado. La elección se adapta provisionalmente a la participación habitual estimada; no constituye validación estadística definitiva. Revisar k en el futuro con datos representativos.

C-TOP-7 permanece pendiente como regresión final de la vista y no forma parte de esta tarea.

## Verificaciones

- Regresión de `src/catalog/discs/top` y compatibilidad del controller oficial/legacy: 12 suites aprobadas, 57 tests aprobados; las 7 suites y 30 tests PostgreSQL opt-in se omitieron.
- Nest build y gate de runtime dependencies: aprobados.
- Typecheck: 0 errores; gate estructural: 0 nuevos (9 hallazgos históricos); gate de tipado seguro: 0 nuevos (5 históricos); gate de ESLint: 0 nuevos (839 diagnósticos baseline).
- ESLint focalizado y `git diff --check`: aprobados.
- La integración PostgreSQL y `EXPLAIN ANALYZE` siguen pendientes; no se confirmó ni consultó una base aislada.

**Actualización posterior:** C-TOP-11 completó la validación del SQL y de los planes PostgreSQL en una base Docker local aislada con fixtures sintéticos. Véase [el informe C-TOP-11](c-top-11-validacion-postgresql-topdiscs.md); no hubo cambios al algoritmo aprobado.

**Ajuste posterior de contrato:** el límite SQL del ranking bajó de 20 a 11 discos para alinear la respuesta backend con las 11 posiciones mostradas. El límite de 20 descrito arriba corresponde a la implementación original de C-TOP-10.
