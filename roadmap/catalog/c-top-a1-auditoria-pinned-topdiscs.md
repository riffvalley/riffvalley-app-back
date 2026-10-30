# C-TOP-A1 — Auditoría backend de discos pinned en Top Discs

**Estado:** auditoría completada el 2026-10-30; sin cambios funcionales.
**Alcance:** `GET /api/discs/topDiscs`, `GET /api/discs/topDiscs/options` y el endpoint legacy `GET /api/discs/homeDiscs`.
**Verificaciones:** inspección de código, pruebas existentes y referencias. No se ejecutaron suites, build, migraciones, consultas SQL ni comprobaciones visuales.

## Resultado

Las reglas solicitadas no están implementadas de forma uniforme:

| Caso | `/topDiscs` | `/topDiscs/options` | `/homeDiscs` legacy |
|---|---|---|---|
| Rate vigente válida, no pinned | Elegible | Aporta país/género | Elegible |
| Rate vigente válida, pinned | Elegible; sin efecto de `pinned` | Aporta país/género | Elegible |
| Pinned sin Rate vigente válida | **Excluido** | **Excluido** | Elegible |
| No pinned sin Rate vigente válida | Excluido | Excluido | Excluido, salvo que tenga algún Rate no nulo histórico |

En el endpoint oficial y sus opciones, el predicado `buildTopDiscEligibilityPredicate` exige `EXISTS` en `valid_current_rates`. Esa CTE deduplica por `(discId, userId)` eligiendo `editedAt DESC NULLS LAST`, `createdAt DESC`, `id DESC`, y después admite únicamente `rate BETWEEN 0 AND 10`. Por ello, cero cuenta como Rate válida; el Rate vigente nulo o fuera de rango no convierte el disco en elegible aunque una fila duplicada anterior fuera válida. Rates sin usuario se excluyen de la deduplicación y del voto válido.

La regla de producto de esta auditoría requiere que `pinned = true` baste para la elegibilidad aunque no haya voto válido. El código oficial refleja la decisión anterior de C-TOP-10, que expresamente excluyó esa posibilidad; la diferencia es una decisión pendiente de implementación/contrato, no un defecto accidental respecto a la documentación histórica.

## Puntuación, orden y payload

- En `/topDiscs`, el score para discos elegibles se calcula como `(R × v + C × 4) / (v + 4)`, donde `R` y `v` usan Rates vigentes válidas y `C` es el promedio global por voto válido publicado. `pinned` no aparece en la fórmula ni aporta bonificación.
- Como el SQL oficial exige al menos una Rate válida, no produce filas oficiales con cero votos y no les asigna score. Actualmente, cuando `C` no existe, devuelve cero filas: `candidate_discs` exige `gp."globalAvgRate" IS NOT NULL`, y el ranking une internamente `disc_rate_stats`. Para satisfacer la regla solicitada de pinned elegible sin inventar un score, C-TOP-B1 tendría que permitir candidatos pinned aunque `C` sea `NULL` y preservar `weightedScore = NULL`/ausente para ellos.
- Si se incluye un pinned sin votos en el ranking oficial, la corrección mínima debe dejar su puntuación sin valor estadístico (`NULL`/ausente en `weightedScore`), en lugar de aplicarle un valor sintético o el prior como si fuera una observación. El `averageRate` actual se expone como `0` mediante `COALESCE`; se debe leer junto a `voteCount` para distinguirlo de una media observada de cero. El mapper convierte también `voteCount` a número.
- El DTO actual es un objeto de respuesta inferido de `DiscTopResult` y `mapHomeRankedDisc`, sin DTO de respuesta dedicado. `weightedScore` se conserva por el spread de la fila SQL (normalmente `numeric` de PostgreSQL como string en el driver); el mapper no lo convierte. `averageRate` se convierte a `number`, y para valores nulos da `0`.
- El orden oficial actual es `weightedScore DESC, d.id ASC`, determinista para empates. Como hoy no mezcla discos sin voto, no necesita criterio de prioridad por votos. Si se incorporan pinned sin voto, el comportamiento esperado de esta auditoría exige que toda fila con `voteCount > 0` preceda a las filas pinned con `voteCount = 0`; dentro de cada grupo se puede conservar el score y el desempate por ID. El score bayesiano de discos con votos debe permanecer intacto.
- La ordenación ocurre en PostgreSQL antes de `LIMIT`. El backend entrega la lista ordenada, pero no determina qué componente visual representa cada disco.

El legacy mantiene otra semántica: permite `pinned = true OR EXISTS(rate.rate IS NOT NULL)`, sin deduplicar Rates ni validar rango. Para pinned sin Rates no nulos, `COUNT` es 0, `averageRate` sale 0 y su `weightedScore` es el prior histórico filtrado (`globalAvgRate`, con `medianVotes` mínimo/fallback 1). El mapper conserva ese score crudo. La auditoría no recomienda alterar esta ruta sin necesidad y contrato demostrados.

## Filtros y opciones

En las dos rutas de ranking se construyen los filtros de presentación antes del predicado de elegibilidad:

- Fecha: `releaseDate <= hoy`; con rango, `BETWEEN inicio AND fin` inclusivo y además `releaseDate <= hoy`.
- Género: `d.genreId = genreId` cuando se proporciona.
- País: `country` tiene precedencia sobre `countryId`; UUID compara `c.id`, otro texto compara `c.name`.

Así, el legacy también limita pinned por fecha, país y género. Si se añade pinned a la elegibilidad oficial, esos filtros ya están aplicados y seguirían limitándolo; deben mantenerse así.

`/topDiscs/options` comparte `CURRENT_RATES_CTE` y `buildTopDiscEligibilityPredicate` con el ranking oficial, sin incluir `pinned`. Por tanto, países y géneros presentes solo en discos pinned sin Rates válidas no aparecen. Las opciones no se restringen al límite del ranking: devuelven dimensiones distintas y ordenadas. Países se filtran por el género seleccionado e ignoran el propio país; géneros se filtran por país seleccionado e ignoran el propio género.

**Discrepancia:** con las reglas de esta auditoría, las opciones también deben considerar discos elegibles solo por `pinned`; actualmente los omiten. Impacta exclusivamente la lógica backend de opciones. El formato de respuesta no necesita cambiar.

## Límites y llegada al frontend

- `/topDiscs`: `OFFICIAL_TOP_DISCS_LIMIT = 11`; el SQL ordena primero y aplica `LIMIT 11` después.
- `/homeDiscs`: `LEGACY_HOME_DISCS_LIMIT = 20`; también ordena primero y limita después.
- Si existen al menos 11 discos con Rates válidas, los 11 slots oficiales actuales se ocupan antes de que un pinned sin votos pueda aparecer; actualmente, de todos modos, esos pinned no son candidatos. Con menos de 11 discos con votos, la regla esperada permitiría completar los slots disponibles con pinned sin votos.
- El límite de 11 es el estado actual intencional confirmado al cerrar C-TOP-7; 20 fue el contrato/estado histórico de C-TOP-10/C-TOP-11. La referencia actual de 20 corresponde únicamente al endpoint legacy.
- El legacy sí puede devolver pinned sin votos dentro de sus 20 resultados, ordenados por su score histórico; no ofrece prioridad garantizada a los que tienen votos.

La diferencia respecto al requisito de incluir pinned sin votos afecta al backend. La presentación visual de esos resultados y cualquier lugar de componente corresponde al frontend y queda fuera de esta auditoría. No se inspeccionó ni modificó frontend.

## Cobertura existente inspeccionada

Las pruebas cubren buena parte de la semántica SQL, aunque las suites PostgreSQL opt-in no se ejecutaron en esta auditoría:

- `/topDiscs`: `home-ranking.postgres.spec.ts` comprueba voto válido pinned/no pinned, cero válido, ausencia de pinned sin voto, Rates nulas, duplicados y valores inválidos, Rate sin usuario, filtros, desempate por ID y límite 11. Los fixtures tienen explícitamente `Pinned no votes` y `Pinned NULL only`; ambos se esperan fuera del endpoint oficial.
- `/homeDiscs`: la misma suite comprueba la elegibilidad histórica por Rate no nula o `pinned`, límite 20 y orden determinista por score e ID; la condición admite pinned sin Rate no nula.
- Opciones: la prueba PostgreSQL titulada “including zero-rate and pinned discs” sí verifica una opción procedente de un disco con voto cero, pero excluye explícitamente país/género que existen solo en `Pinned no votes`. La prueba unitaria de `load-top-disc-options` también asegura que el SQL no consulta `pinned`.
- Servicio: `disc-top.service.spec.ts` afirma los límites 11/20 y la divergencia del predicado oficial y legacy. Helper de mapeo cubre `voteCount=0`, `averageRate=null → 0` y conserva el `weightedScore` crudo, pero no caracteriza una respuesta SQL oficial con pinned sin voto, porque hoy el SQL no puede devolverla.
- Controller: specs comprueban las rutas y delegación de los endpoints oficial, legacy y opciones; no añaden cobertura de elegibilidad.

No se identificó cobertura unitaria/PostgreSQL que exija que pinned sin voto aparezca en `/topDiscs`, que pinned sin Rate válida alimente opciones, que Rate nula/inválida de pinned se trate como pinned elegible en el ranking oficial, ni que las filas con votos tengan prioridad sobre pinned sin votos. Estas son lagunas alineadas con la implementación actual, no pruebas fallidas.

## Discrepancias y trabajo posterior

| Discrepancia | Actual | Esperado | Causa localizada | Impacto | Corrección mínima recomendada | Afecta |
|---|---|---|---|---|---|---|
| Pinned sin votos en ranking | `/topDiscs` los excluye, incluso si no hay ningún voto válido global | Incluirlos mientras pasen fecha/país/género | `buildTopDiscEligibilityPredicate` solo busca en `valid_current_rates`; `candidate_discs` exige prior global no nulo y el SELECT exige `INNER JOIN disc_rate_stats` | Pinned sin votos no llegan al frontend | Cambiar elegibilidad oficial a Rate válida OR `d.pinned = true`; permitir pin candidates con `C = NULL` y mantener filtros; preservar CTE/prior para el resto | Backend |
| Opciones para pinned-only | No añaden países/géneros exclusivos de esos discos | Incluir opciones de todo disco elegible por Rate válida o pinned | El loader de opciones reutiliza el mismo predicado de Rates, sin `pinned` | Filtros no pueden seleccionar pinned-only por su género/país | Compartir/ajustar el predicado de opciones al mismo universo de elegibilidad aprobado | Backend |
| Prioridad al truncar el ranking | Solo ordena por score e ID; pinned sin votos no está presente | Filas con votos válidos primero; pinned sin votos después | `ORDER BY weightedScore DESC, d.id ASC`; no hay segmento de cero votos | Una incorporación sin criterio explícito podría desplazar votados o hacer el orden ambiguo | Añadir primero una clave `voteCount > 0`, luego conservar score e ID estable dentro de grupos | Backend |
| Score y media para pinned sin voto | No hay fila oficial; mapper por sí solo convertiría `averageRate` nulo a 0 y conservaría `weightedScore` | No score observado/sintético; indicar ausencia mediante `voteCount = 0` y score sin valor | SQL de ranking espera `disc_rate_stats`; helper de mapper convierte media nula a 0 | Al incluirlos habría que precisar el valor serializado de score para que consumidores distingan ausencia | Mantener `averageRate = 0` solo como contrato existente, conservar `voteCount = 0` y dejar score SQL `NULL`/ausente; verificar el JSON y consumidores en la tarea de implementación | Backend; posible coordinación del consumidor |

### Contract finding

**Current behavior:** `/topDiscs` y opciones excluyen pinned sin Rates vigentes válidas; `/homeDiscs` legacy incluye pinned sin Rate no nula y conserva 20 resultados.

**Problem:** el endpoint oficial no satisface la regla solicitada de pinned elegible por sí mismo; las opciones tampoco exponen dimensiones de esos discos. Cambiar solo el ranking deja filtros incompletos. El límite oficial 11 puede ocultar pinned si ya hay suficientes discos votados.

**Impact:** backend para elegibilidad, opciones, orden y carga. La representación visual sigue siendo frontend.

**Options:** preservar la decisión C-TOP-10; cambiar internamente el universo oficial y de opciones manteniendo rutas/payload; o coordinar cambios de contrato solo si se necesita modificar la serialización de score. El legacy no necesita cambio demostrado.

**Recommendation:** abrir C-TOP-B1 para una corrección backend acotada que incorpore pinned al ranking y opciones, priorice discos con votos al aplicar el límite, mantenga la fórmula k=4 y defina `weightedScore` nulo/ausente para cero votos. Caracterizar primero la respuesta y revisar consumidores del score; preservar `/homeDiscs`.

**Blocks the current task:** No. C-TOP-A1 es solo auditoría y queda completada.

**Siguiente paso:** hace falta C-TOP-B1 antes de dar por satisfechas las reglas en backend; después podrá pasarse al frontend para revisar la representación visual de la lista completa recibida.

## Resolución C-TOP-B1 (2026-10-30)

La implementación posterior cambió únicamente el ranking oficial y sus opciones:

- La elegibilidad es ahora `EXISTS(valid_current_rates) OR pinned = true`; las fechas, país y género siguen restringiendo ambos grupos.
- `current_rates` conserva el desempate por `editedAt DESC NULLS LAST`, `createdAt DESC`, `id DESC`; solo la Rate ganadora se valida en rango inclusivo 0–10.
- Los discos con votos válidos conservan la fórmula k=4 y su orden por score descendente e ID ascendente. Se ordena primero el grupo con `voteCount > 0`; pinned sin votos queda después por ID ascendente.
- Para pinned sin votos el endpoint oficial devuelve `voteCount: 0`, `averageRate: null` y `weightedScore: null`. Un promedio observado de cero sigue siendo `averageRate: 0` con `voteCount > 0`.
- Si no hay prior global, el ranking oficial devuelve los pinned elegibles con puntuación nula. El límite sigue en 11 y se aplica después de ordenar.
- Las opciones de país y género incluyen el universo compartido de votos válidos o pinned; se mantienen deduplicadas, ordenadas y con los filtros cruzados existentes.
- `/homeDiscs` no recibió cambios de SQL, elegibilidad, límite ni payload observable.

Las pruebas focalizadas unitarias pasaron. La suite `home-ranking.postgres.spec.ts` fue actualizada para verificar los casos SQL, pero las suites PostgreSQL opt-in quedaron omitidas porque no se confirmó un destino aislado autorizado; esos casos no se consideran aprobados. La comprobación PostgreSQL real queda pendiente.

**C-TOP-F1:** el backend garantiza que, si hay al menos tres discos votados, los tres primeros resultados son votados. Si hay menos de tres, los pinned sin votos pueden aparecer en ese prefijo; la selección y presentación visual del Top 3 corresponde a F1.

## Archivos inspeccionados

- `src/catalog/discs/discs.controller.ts`
- `src/catalog/discs/discs.service.ts` (fachada/delegación)
- `src/catalog/discs/top/disc-top.service.ts`
- `src/catalog/discs/top/helpers/top-disc-predicates.ts`
- `src/catalog/discs/top/helpers/home-disc-filters.ts`
- `src/catalog/discs/top/helpers/legacy-home-disc-eligibility.ts`
- `src/catalog/discs/top/helpers/legacy-home-disc-filters.ts`
- `src/catalog/discs/top/loaders/home-global-stats.ts`
- `src/catalog/discs/top/loaders/legacy-home-global-stats.ts`
- `src/catalog/discs/top/loaders/load-top-disc-options.ts`
- `src/catalog/discs/top/helpers/map-home-ranked-disc.ts`
- `src/catalog/discs/top/types/disc-top-options.ts`
- `src/catalog/discs/entities/disc.entity.ts`
- `src/catalog/discs/top/__tests__/disc-top.service.spec.ts`
- `src/catalog/discs/top/__tests__/home-ranking.postgres.spec.ts`
- `src/catalog/discs/top/helpers/__tests__/map-home-ranked-disc.spec.ts`
- `src/catalog/discs/top/loaders/__tests__/load-top-disc-options.spec.ts`
- `src/catalog/discs/__tests__/discs.controller.spec.ts`
- Roadmap C-TOP-8, C-TOP-10 y C-TOP-11.
