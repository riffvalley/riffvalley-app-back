# C-TOP-8 — Auditoría estadística de TopDiscs

**Estado:** auditoría completada; no se cambió producción.
**Fecha:** 2026-10-28.
**Alcance:** `GET /api/discs/topDiscs`, la puntuación SQL de `DiscTopService` y sus parámetros estadísticos. El servicio devuelve hasta 20 filas; la vista actual presenta 11.
**Separación de tareas:** C-TOP-7 (regresión visual de TopDiscs) sigue pendiente y no forma parte de este cierre. C-TOP-8 es una auditoría estadística independiente.

## Resumen ejecutivo

- La fórmula final de shrinkage bayesiano está implementada coherentemente con la media y el número de rates no nulos agregados en cada fila, y se ordena por esa puntuación sin redondeo SQL prematuro.
- Los parámetros actuales no representan una media global de todos los votos: `globalAvgRate` es la media no ponderada de las medias por disco, asignando cero a cada disco sin votos. `medianVotes` es la mediana continua de los recuentos de rates de todos los discos filtrados y luego se trunca a entero con fallback 1.
- Ambos parámetros cambian con fecha, género o país. El release-date y los filtros de presentación se aplican también al universo estadístico; `pinned` no filtra ese universo.
- No se halló fanout accidental en la query vigente por Artist, Country, Genre, Favorite o Pending. Rate se agrega una vez por fila SQL; filas Rate repetidas para un usuario/disco, si las hay, cuentan como votos separados por el modelo actual.
- La limitación estadística más relevante es la definición del prior y del factor de confianza, no una discrepancia algebraica en la fórmula. No hay un dataset representativo confirmado en este checkout, así que no se concluye que otro método sea superior.

## Implementación vigente y fórmula

Para un disco `i`, sean:

- `nᵢ`: `COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END)`, el número de filas Rate con valoración no nula.
- `μᵢ`: `AVG(r.rate)`, media de las valoraciones no nulas del disco. La query la expone como `COALESCE(..., 0)`.
- `μ₀`: `globalAvgRate`, definido abajo.
- `m`: `medianVotes`, definido abajo después de la conversión TypeScript.
- `Sᵢ`: `weightedScore`.

La query principal calcula:

```text
Sᵢ = (μᵢ · nᵢ + μ₀ · m) / (nᵢ + m)
```

Es una media ponderada entre la media observada del disco y el prior `μ₀`; cada rate válido añade una unidad de peso y el prior añade `m` unidades. Con `nᵢ = 0`, `μᵢ` queda como 0 por `COALESCE`, pero el score es `μ₀` cuando `m > 0`. Si el universo no devuelve filas, las conversiones dejan `μ₀ = 0`, `m = 1`.

La media global SQL se calcula así:

```text
μ₀ = AVG( μⱼ para cada disco j del universo; μⱼ = 0 si j no tiene rates no nulos )
```

Por tanto, cada disco cuenta una vez, sin ponderación por cantidad de votos. Los discos sin votos reducen esa media al contribuir con cero. Esto no equivale a `SUM(rate) / COUNT(rate)` sobre todos los votos.

La mediana SQL es `PERCENTILE_CONT(0.5)` aplicada a `voteCount` por disco sobre el mismo conjunto filtrado, incluidos recuentos cero. PostgreSQL devuelve mediana continua, potencialmente fraccionaria; el loader la convierte con `Number.parseInt(String(value), 10) || 1`. El truncamiento ocurre hacia cero; cero y `NULL` terminan en 1. Ejemplos: 0.5 → 1 por fallback; 1.5 → 1; 2.5 → 2; 6.5 → 6.

### Escala, nulos y selección

- `Rate.rate` es `decimal(4,2)`, nullable. El DTO de creación permite `0` a `10`, con hasta dos decimales; la escala de valoración es 0–10. La columna por sí sola no impone el rango, pero la escritura validada sí.
- `rate IS NOT NULL` define un voto. Cero es voto válido; no se filtra como falsy en SQL. Rate NULL no entra en `AVG` ni en `voteCount`.
- El ranking principal admite discos con al menos un rate no nulo **o** `pinned = true`, siempre que superen el filtro de fecha/género/país. Pinned sin votos aparece con score `μ₀`; pinned no recibe peso especial adicional.
- El universo de parámetros incluye todos los discos que pasan los filtros de `buildHomeDiscFilters`, incluso sin rates y sin estar pinned. La query de parámetros no aplica la condición de elegibilidad `rated OR pinned`.
- Artist, Country y Genre se unen por referencias many-to-one a sus IDs; no multiplican filas si se respeta la integridad referencial. Rate se une una vez por `discId`; cada fila Rate válida cuenta una vez. La elegibilidad se comprueba mediante `EXISTS`, sin JOIN adicional. Favorite y Pending se consultan mediante subqueries escalares con `LIMIT 1`; Comment usa una subquery `COUNT`, así que no expanden el grupo principal.
- No se observó una restricción única `(discId, userId)` en `Rate`. Si existen rates duplicados por persona/disco, cuentan como observaciones separadas; no es un fanout de los joins actuales, sino una semántica/dato de origen que merece confirmación antes de llamarlos votos independientes.

### Precisión, mapper y orden

- PostgreSQL calcula `AVG` y `weightedScore` usando `numeric`; el prior se convierte primero a `number` de JavaScript mediante `parseFloat` y se interpola como literal SQL. Eso puede perder precisión decimal extrema del agregado global a la precisión de un `number` JS. Las valoraciones solo admiten centésimas, así que el efecto práctico esperado es pequeño, pero no se midió con datos reales.
- No se aplica `ROUND` a `weightedScore` antes de ordenar. PostgreSQL ordena por el valor SQL calculado; `d.id ASC` resuelve empates. La query limita a 20.
- El mapper convierte `averageRate` a `number`, conserva `voteCount` como entero y deja `weightedScore` en el valor crudo de PostgreSQL por el spread de la fila. En el test unitario fixture ese campo es string. No está verificado aquí cómo lo formatea o compara el frontend ni si el valor visible coincide en decimales con el valor ordenado.
- `averageRate` nulo se expone como 0, aunque para un disco sin votos la media estadística real está indefinida. En las filas elegibles esto afecta principalmente a pinned sin votos. Distinguir ese 0 de una media observada 0 requiere mirar `voteCount`.

## Universos estadísticos y filtros

`buildHomeDiscFilters` construye las mismas condiciones y binds para la query global y el ranking:

| Filtro | ¿Afecta `μ₀` y `m`? | Semántica observada |
|---|---:|---|
| Fecha de lanzamiento | Sí | Rango inclusivo `BETWEEN start AND end` y además `releaseDate <= today`; sin rango, solo `releaseDate <= today`. Es un filtro por fecha del disco, no por fecha de creación/edición del voto. |
| Género | Sí | `d.genreId = genreId`. |
| País | Sí | `country || countryId`; UUID filtra `c.id`, otro valor filtra `c.name`. |
| Elegibilidad de ranking | No | `rated OR pinned` solo restringe las filas finales, no el prior/mediana. |
| `pinned` | No | No aparece en la query estadística. Un pinned sin votos forma parte de todos modos porque la query incluye todo disco filtrado; su bandera no cambia su tratamiento. |
| Usuario actual | No | Solo se usa en las subqueries de estado personal de la query principal. |
| Periodos auxiliares de estadísticas | No | `statsDateRange` y `distributionDateRange` alimentan loaders separados y no alteran score ni ranking. |

La puntuación de un disco no es absoluta: al cambiar filtros puede cambiar `μ₀` y `m`, aunque las valoraciones del disco permanezcan iguales. La posición también cambia por los candidatos que entran/salen y por su score. Conviene separar tres conceptos:

1. **Media real (`μᵢ`)**: promedio de los rates no nulos de ese disco.
2. **Puntuación bayesiana (`Sᵢ`)**: media real contraída hacia `μ₀` según `nᵢ` y `m`.
3. **Posición**: orden relativo de `Sᵢ` entre los resultados elegibles, con ID ascendente en empate.

Para un ranking filtrado que pretende representar preferencias dentro de ese filtro, un prior relativo puede tener sentido. Para comparar puntuaciones entre filtros, un prior estable es más interpretable. Se recomienda decidir explícitamente cuál de esos dos productos se quiere; no cambiarlo en esta auditoría.

## Revisión de errores y límites demostrados

### Comprobaciones contra la implementación actual

- **SQL frente a fórmula:** coinciden algebraicamente: `AVG(rate) * count` recupera la suma de votos, y el prior se añade con peso `m`. El mismo conteo no nulo alimenta `nᵢ` y `voteCount`.
- **Duplicación por JOIN:** no se halló multiplicación en la SQL vigente: dimensiones many-to-one, una tabla de Rate agregada por disco, y estados personales como subqueries. Notas históricas D32 mencionan joins Favorite/Pending y fanout; ese detalle no describe esta versión de `src/catalog/discs/top/disc-top.service.ts` y no debe trasladarse como bug vigente.
- **NULL y cero:** correctamente se excluyen NULL y se conservan ceros en conteo y media.
- **Pinned:** no altera `μ₀`/`m` por su bandera. Un disco sin votos sí puede influir en `μ₀` como cero y en `m` como recuento cero, tanto pinned como no pinned; solo el pinned sin votos puede aparecer como resultado.
- **Sesgo por muestra pequeña:** demostrado por la fórmula y la simulación: ratings extremos con poco `n` se contraen más hacia el prior. Es el comportamiento esperado de shrinkage, aunque la intensidad depende de `m`.
- **Redondeo:** no hay redondeo temprano de score ni redondeo de media por disco. Sí hay conversión de prior `numeric → JS number` y truncamiento/fallback de mediana antes de construir la query principal.
- **Empates:** desempate estable por `d.id ASC` en el SQL vigente.
- **Discrepancia histórica:** la documentación D32 antigua registra `ORDER BY weightedScore DESC` sin desempate y joins de Favorite/Pending. El código consultado ahora ordena por score e ID y no contiene esos joins. Este documento prioriza la inspección vigente; no actualiza ni reinterpreta resultados históricos de sus pruebas.
- **Frontend:** sin acceso a la aplicación frontend en esta auditoría no se pudo verificar la representación de `weightedScore`, los decimales visibles ni que la lista de 11 coincida con el límite API 20. Queda como verificación pendiente si se modifica el formato/semántica.

### Hallazgos confirmados frente a decisiones discutibles

**Confirmados en código:** media global filtrada que incluye ceros para discos sin votos; media de medias por disco con peso igual; mediana sobre todas las filas filtradas y con ceros; mediana continua luego truncada; score filtrado; elegibilidad pinned/rated aplicada después de calcular parámetros; dependencia de precisión de `number` para el prior.

**No demostrados como bug:** que esas definiciones sean injustas para la comunidad; que un prior filtrado sea incorrecto para el producto; que la mediana truncada empeore materialmente la clasificación con el volumen actual; que duplicados de Rate existan en datos representativos; o que el frontend muestre un número inconsistente.

## Alternativas evaluadas

Se usa la misma familia de shrinkage simple para que la comparación sea interpretable:

| Método | Definición | Favorece / penaliza | Lectura |
|---|---|---|---|
| A. Media aritmética | `Sᵢ = μᵢ` | Favorece mucho resultados extremos con pocos votos. | Transparente, pero una sola nota 10 supera muestras más representativas de nota 8. |
| B. Bayes actual | Fórmula actual, `μ₀` y `m` del filtro. | Modera muestras pequeñas; el efecto se recalibra con cada filtro. | Implementación algebraica correcta; prior y confianza tienen semántica discutible. |
| C. Bayes con parámetros globales estables | Misma fórmula; `μ₀` y `m` fijos/globales independientes de filtros de presentación. | Mantiene escala comparable entre filtros; puede contraer una categoría específica hacia un promedio ajeno. | Mejor si score absoluto comparable es requisito; la definición del universo y actualización del prior debe acordarse. |
| D. Bayes con `k` alternativo | Misma fórmula con `μ₀` estable y `k` fijo/calibrado (simulación ilustra 5 y 10); también podría probarse una curva de confianza derivada de datos, sin cambiar el núcleo. | `k` mayor contrae más las muestras pequeñas; `k` menor les da voz antes. | Fijar k es simple y auditable; seleccionar valor requiere validación retrospectiva y criterio de producto. |

La alternativa estadística más sencilla que merece una comparación posterior es definir `μ₀` como el promedio **por voto** de rates no nulos sobre un catálogo de referencia estable, en vez de promedio de medias por disco con ceros. Eso cambia la contribución relativa de discos muy votados y elimina el efecto artificial de añadir discos sin votos al prior. No es una fórmula de score nueva; es una definición del prior. No se recomienda una fórmula más sofisticada sin datos que demuestren una mejora.

## Simulación reproducible

El script [simulate-topdiscs-c-top-8.mjs](simulate-topdiscs-c-top-8.mjs) genera únicamente discos inventados en memoria, no importa Nest, no lee `.env` y no conecta a base de datos. Ejecutar:

```bash
node roadmap/catalog/simulate-topdiscs-c-top-8.mjs
```

Casos incluidos: 1, 3 y 10 votos excelentes; 50 y 100 votos de 8; 100 votos divididos 50/50 entre 0 y 10; 3 negativos; 2 ceros; 20 votos mixtos; y un pinned sin votos. La media real del pinned es indefinida (`—`); el SQL usa cero para la fórmula. Todos los puestos simulan la lista completa, sin límite de 11/20.

Parámetros del fixture completo: `μ₀ = 5.6`; mediana SQL de recuentos `6.5`; `m = 6` tras el `parseInt` vigente. Para C/D se fijó a efectos ilustrativos `μ₀ = 6.5`, valor convencional sintético, con `k=5` y `k=10`; no es un parámetro recomendado ni medido en Riff Valley. Los IDs alfabéticos desempatan en la simulación.

| ID | Caso | Votos | Media real | A: score / puesto / Δ | B actual: score / puesto | C k=5: score / puesto / Δ | D k=10: score / puesto / Δ |
|---|---|---:|---:|---:|---:|---:|---:|
| A | Un voto excelente | 1 | 10 | 10.000 / 1 / +4 | 6.229 / 5 | 7.083 / 5 / 0 | 6.818 / 5 / 0 |
| B | Tres votos excelentes | 3 | 10 | 10.000 / 2 / +2 | 7.067 / 4 | 7.813 / 4 / 0 | 7.308 / 4 / 0 |
| C | Diez votos excelentes | 10 | 10 | 10.000 / 3 / -2 | 8.350 / 1 | 8.833 / 1 / 0 | 8.250 / 1 / 0 |
| D | Cincuenta votos buenos | 50 | 8 | 8.000 / 4 / -1 | 7.743 / 3 | 7.864 / 3 / 0 | 7.750 / 3 / 0 |
| E | Cien votos buenos | 100 | 8 | 8.000 / 5 / -3 | 7.864 / 2 | 7.929 / 2 / 0 | 7.864 / 2 / 0 |
| F | Cien divididos 0/10 | 100 | 5 | 5.000 / 6 / +2 | 5.034 / 8 | 5.071 / 8 / 0 | 5.136 / 9 / -1 |
| G | Tres negativos | 3 | 0 | 0.000 / 8 / +2 | 3.733 / 10 | 4.063 / 10 / 0 | 5.000 / 10 / 0 |
| H | Dos valoraciones cero | 2 | 0 | 0.000 / 9 / 0 | 4.200 / 9 | 4.643 / 9 / 0 | 5.417 / 8 / +1 |
| I | Pinned sin votos | 0 | — | 0.000 / 10 / -4 | 5.600 / 6 | 6.500 / 6 / 0 | 6.500 / 6 / 0 |
| J | Veinte mixtos (media 5) | 20 | 5 | 5.000 / 7 / 0 | 5.139 / 7 | 5.300 / 7 / 0 | 5.500 / 7 / 0 |

`Δ = puesto en B − puesto en el método de esa columna`; positivo significa que el método alternativo sube posiciones frente al ranking actual. El empate de medias en A se resuelve por ID sintético. El script imprime scores y puestos de los cuatro métodos, deltas y sensibilidad completa.

Sensibilidad del disco B (tres 10): score actual `7.0667`; con prior estable sintético 6.5, `k=5 → 7.8125`, `k=10 → 7.3077`, `k=20 → 6.9565`. A medida que k aumenta, un buen disco pequeño se aproxima al prior; ese movimiento puede subirlo o bajarlo según prior y media propia.

Para el mismo disco B al cambiar solo el universo estadístico del fixture, el método actual da: universo completo (`μ₀=5.6`, `m=6`, score `7.0667`); solo discos votados (`μ₀=6.2222`, `m=10`, score `7.0940`); grupo sintético pequeño (`μ₀=4`, `m=2`, score `7.6`). El grupo pequeño da score mayor porque su mediana baja y, con media 10, el peso de la observación excelente supera la reducción del prior. La clasificación de cada método depende también de los competidores filtrados.

La media aritmética coloca el único 10 por encima de discos con 10, 50 o 100 votos cuya media es menor; el Bayes lo contrae. En sentido inverso, un valor cero con pocas observaciones se contrae hacia arriba. Con 100 votos divididos, la media permanece en 5 y el ajuste es pequeño. Esto ilustra comportamiento matemático, no evidencia de precisión predictiva ni superioridad de un método.

## Datos representativos y pruebas SQL

No se identificó en los archivos inspeccionados un fixture de votos representativo de la comunidad. Las suites PostgreSQL opcionales existentes crean tablas temporales, pero están diseñadas para caracterizar condiciones y fixtures pequeños; no se ejecutaron porque el entorno de base de datos local no está confirmado como aislado/autorizado para esta tarea. No se consultó producción ni base local, no se modificaron filas ni se ejecutaron migraciones.

La lectura del SQL y el historial D31/D32 verifican la semántica estructural, pero la verificación con PostgreSQL aislado, sus tipos reales y EXPLAIN queda pendiente. Las pruebas históricas no bastan para validar fairness estadística ni distribución productiva, y algunos detalles D32 ya no coinciden con la query actual como se anota arriba.

## Rendimiento y riesgos SQL

Por cada llamada del endpoint se ejecutan consultas separadas para parámetros globales, ranking, totales, usuarios activos, covers y distribución. Esta auditoría cubre el ranking y sus parámetros; esos loaders adicionales no se fusionaron ni se midieron.

- La query de `μ₀`/`m` recorre el conjunto filtrado de discos y agrega rates agrupados por disco. Su orden de trabajo depende del número de discos/rates que sobreviven a fecha, género y joins de país.
- La principal vuelve a unir rates y calcula `COUNT`, dos `AVG` y score agrupado; luego ordena por score y UUID y limita 20. El cálculo de score por fila agregada es barato comparado con los scans/agregados y sort.
- El subquery correlacionado de `commentCount` y las cinco búsquedas personales con `LIMIT 1` son candidatos a inspección si el plan los muestra dominantes; su coste depende de índices y cardinalidad no verificados aquí.
- `PERCENTILE_CONT` ordena el conjunto de recuentos por disco para obtener mediana. No se puede afirmar que sea cuello de botella sin volumen/plan; en colecciones pequeñas el coste puede ser irrelevante.
- Filters `dateRange`, género y país restringen ambos agregados principales. No hay agregados cacheados/reutilizados entre llamadas.
- D46 ya registra índices para `rate(discId)` y `rate(userId, discId)`; esta auditoría no valida ni cambia esos índices.

No se ejecutó `EXPLAIN ANALYZE`, ya que requiere un PostgreSQL aislado y datos representativos que no están confirmados. No se propone agregar índices, caché ni reescribir SQL en esta tarea.

## Evaluación y recomendación

**¿Está correctamente implementada?** Sí, la ecuación SQL corresponde a la shrinkage descrita y sus agregados no muestran duplicación accidental en la versión vigente. La definición de `μ₀`/`m`, truncamiento de mediana y conversiones son elecciones observables que merecen decisión de producto; no son errores algebraicos.

**¿Es justa con pocos votos / penaliza discos nuevos?** Contrae más los discos con pocas valoraciones hacia el prior. Eso reduce el premio a muestras extremas y también eleva valoraciones bajas pequeñas. Un disco nuevo pinned sin votos recibe el prior, no un cero bayesiano, pero se expone `averageRate=0` separado. No podemos juzgar intensidad como justa sin distribución y objetivo comunitario.

**¿Debe recalcularse el prior por filtro?** Solo si el score debe representar una categoría/periodo en su propio contexto. Si se desea comparar scores entre vistas, filtros o momentos, mantener parámetros globales estables es más coherente. Actualmente score y rango son relativos al universo filtrado.

**¿Qué representa mejor preferencias colectivas?** Para nota media colectiva, la media por voto no nulo da a cada voto el mismo peso. Para ordenar discos con muestras pequeñas, una shrinkage hacia esa media de referencia evita extremos de una nota; el nivel de contracción requiere validación. El prior actual de medias por disco iguala discos poco/muy votados y añade ceros de discos sin votos, por lo que no representa directamente la media de preferencias por voto.

**Parámetros recomendables:** no fijar `k=5` o `k=10` con esta simulación. Definir primero el universo de referencia estable, preferiblemente votos no nulos hasta una fecha de corte explícita; luego comparar una cuadrícula sencilla `k ∈ {3, 5, 10, 20}` contra el método actual en snapshots históricos aislados. Elegir por estabilidad de ranking y capacidad de predecir valoraciones futuras, con regla de fairness/negocio acordada, no por conveniencia de una tabla sintética. Como fallback de producto, reportar `mean`, `score`, `voteCount` por separado.

**¿Merece cambiarlo?** La auditoría no justifica un cambio inmediato de producción. Sí justifica una decisión posterior sobre el significado del score (relativo al filtro o estable) y una validación offline con snapshot anonimizado/representativo. No se recomienda alterar el método antes de eso.

## Posibles tareas posteriores

1. **C-TOP-9 — Definir universo y significado del score:** acuerdo de producto sobre score relativo al filtro frente a score estable; definir si el prior es media por voto o media por disco y cómo tratar discos sin votos.
2. **C-TOP-10 — Validación offline:** con dataset anonimizado confirmado, reproducir los rankings por periodos/slices, evaluar estabilidad frente a nuevos votos y comparar `k` simple en validación temporal. Sin escribir en base.
3. **C-TOP-11 — Confirmación SQL/plan aislado:** ejecutar tests existentes y `EXPLAIN (ANALYZE, BUFFERS)` solo sobre PostgreSQL desechable autorizado y volumen representativo; revisar si subqueries/indexes dominan.
4. **C-TOP-12 — Implementación, solo con decisión aprobada:** caracteriza contrato, compara payload/posiciones y coordina formato con frontend si afecta visualización; no es parte de C-TOP-8.

## Archivos y verificaciones

- Código productivo y contrato HTTP: sin cambios.
- Frontend, Dashboard, Community, datos y migraciones: sin cambios.
- Añadidos este documento y el script aislado de simulación.
- Verificación ejecutada: `node roadmap/catalog/simulate-topdiscs-c-top-8.mjs`; salida reproducible inspeccionada.
- No se ejecutaron suites de test, build, consultas a PostgreSQL ni migraciones.
- `git diff --check` aprobado.
