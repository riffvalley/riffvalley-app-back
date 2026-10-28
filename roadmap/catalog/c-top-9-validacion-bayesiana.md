# C-TOP-9 — Evaluación de un modelo bayesiano estable para TopDiscs

**Estado:** evaluación documental y simulación aislada completadas; sin cambios de producción.
**Fecha:** 2026-10-28.
**Base:** [Auditoría C-TOP-8](c-top-8-auditoria-estadistica-topdiscs.md) y su [simulador](simulate-topdiscs-c-top-8.mjs), ambos leídos antes de comenzar.
**Separación:** C-TOP-7, regresión visual de TopDiscs, permanece pendiente e independiente.

## Conclusión ejecutiva

La alternativa propuesta tiene una definición estadística más clara para un prior común: calcular `C` como la media de valoraciones musicales **vigentes, válidas y deduplicadas por usuario y disco** de discos ya publicados al corte. Un cero es una valoración real; ausencia o `NULL` no son ceros. Esto elimina la dependencia de filtros y la penalización del prior por catálogo sin votos.

Las simulaciones sugieren un rango de confianza `k=5–10` como candidatos para validación: `k=5` deja remontar antes a muestras muy altas pequeñas; `k=10` protege más contra esas muestras y favorece en varios cruces las medias altas con más votos. **No hay datos representativos que permitan escoger un k óptimo.** Recomendación: conservar ambos en un análisis offline y mantener un solo `k` fijo por versión del modelo si se aprueba el cambio. No usar la mediana filtrada actual para derivar k.

Propuesta de universo para C: últimas valoraciones válidas por pareja usuario/disco, solo para discos con `releaseDate <= asOf`, rates en `[0,10]`, incluyendo ceros, excluyendo `NULL`, futuras y duplicados previos. No se encontró una columna de disco oculto/publicado: `verified` no es un filtro del ranking actual y no debe usarse como sinónimo de visibilidad sin definición de producto.

`C` recalculado periódicamente mantendría comparabilidad entre filtros dentro de cada versión, pero no congelaría puntuaciones en el tiempo. Se propone versionar C/k y su universo; como política piloto operativa puede evaluarse un snapshot semanal, sujeto a observar su deriva. Ese intervalo es una hipótesis operativa, no una cadencia validada por datos.

La simulación ficticia muestra diferencias frente al ranking actual, pero no demuestra mejora. No había dataset local adecuado ni se autorizó/confirmó una base aislada, así que no hay resultados observados de la comunidad ni selección concluyente de k.

## Modelos y universo

La familia se mantiene:

```text
Sᵢ = (Rᵢ · vᵢ + C · k) / (vᵢ + k)
```

`Rᵢ` es la media de valoraciones musicales válidas vigentes del disco, `vᵢ` su número de valoraciones, `C` el prior común y `k` los votos equivalentes del prior. En este rango válido, `Sᵢ` queda entre 0 y 10. `k > 0`.

| ID | Modelo | `C` | `k` |
|---|---|---|---:|
| M0 | Media aritmética, referencia | — | — |
| M1 | Bayes actual | Media de medias por disco del filtro, discos sin votos como cero | Mediana de recuentos en el filtro, continua y truncada con fallback 1 |
| M2 | Prior global por voto | Media de rates válidos deduplicados del universo publicado | 3 |
| M3 | Prior global por voto | Igual que M2 | 5 |
| M4 | Prior global por voto | Igual que M2 | 10 |
| M5 | Prior global por voto | Igual que M2 | 15 |
| M6 | Prior global por voto | Igual que M2 | 20 |
| M7 | Control de ponderación por disco | Media de medias **solo de discos votados** del universo publicado | 10 |

M7 cambia únicamente la definición de C frente a M4 y permite ver el efecto de ponderar un disco igual que otro, en vez de dar más peso a cada Rate individual. Los modelos M2–M6 no tratan discos no votados como datos de C. Los discos sin votos no alteran C en M2–M7.

### Universo recomendado para C

1. **Rate vigente:** usar la valoración actual por usuario/disco, no `RateVoteEvent`: el evento conserva cambios históricos y no equivale a una valoración actual adicional.
2. **Deduplicación:** una sola fila por `(userId, discId)`, escogida determinísticamente por última edición/creación y `id` como desempate. La escritura normal ya busca y actualiza el Rate existente bajo un bloqueo; no se encontró constraint única en la base declarada. Duplicados históricos aún requieren medir/limpiar o resolver canónicamente.
3. **NULL:** excluir la fila vigente si su `rate` es `NULL`. La columna y DTO permiten ausencia; no debe recuperarse una antigua nota sin decidir explícitamente qué significa retirar una valoración.
4. **Cero:** incluirlo como voto válido. Excluirlo sesgaría hacia arriba.
5. **Escala:** incluir únicamente rates finitos de 0 a 10, con hasta dos decimales. `CreateRateDto` valida ese rango, pero `decimal(4,2)` por sí solo no impone rango ni precisión máxima de negocio ante escrituras externas/legadas. Sin leer datos no se sabe si hay valores fuera de escala; excluirlos del cálculo y registrar el conteo de anomalías es preferible a distorsionar silenciosamente C.
6. **Fecha del disco:** incluir discos con `releaseDate <= asOf`; excluir fechas futuras y `releaseDate NULL`, coherente con el filtro por defecto actual `releaseDate <= today`. No filtrar por `createdAt` del Rate: el criterio actual es qué disco puede estar publicado, no cuándo votó la persona.
7. **Visibilidad:** no se encontró propiedad `hidden`, `published` o equivalente en `Disc`; tampoco se observa un filtro `verified` en TopDiscs. Por ello no cabe separar discos ocultos basándose en el esquema inspeccionado. Si otro mecanismo determina visibilidad, debe incorporarse al universo solo después de identificarlo.
8. **Pinned:** una bandera editorial no crea una valoración ni cambia C. El pinned sin rates no participa en la media global, aunque pueda continuar apareciendo en el ranking bajo la elegibilidad vigente.

La tabla `rate` se une con `disc` many-to-one para restringir releases. El agregado puede hacerse primero a nivel de voto deduplicado y luego con `SUM(value) / COUNT(*)`; no unir colecciones de Rate, Favorite, Pending, Comment o relaciones de género en ese cálculo. Género/país/periodo de vista no se aplican a C.

### Estabilidad temporal

“Independiente de filtros” y “fijo históricamente” son propiedades distintas. Recalcular C cada semana dejaría iguales los parámetros en año/mes/género/país durante esa versión, pero un C nuevo puede mover todos los scores aunque los discos no cambien. Si se exige reproducir una puntuación histórica, hay que conservar `modelVersion`, corte temporal, C, k y definición de universo del ranking histórico. Con C fijo por versión se conserva trazabilidad; no se congela el score de por vida.

No hay una cadencia estadísticamente elegible con el material local. El análisis offline puede empezar con cortes semanales como experimento operativo y medir `|Cₜ − Cₜ₋₁|`, porcentaje de scores que cambian más de un umbral y desplazamientos de posiciones; después decidir semanal, mensual o por publicación de versión.

## Fuente de datos y límites

No se usó una base ni se consultó producción. La búsqueda local halló `boolintunes_january.json`, que es una lista de discos por fecha, no un dataset de valoraciones. Las suites PostgreSQL de TopDiscs usan tablas temporales con fixtures pequeños y sintéticos; no representan distribución de votos. `CommunityDashboardRatesService` contiene agregaciones por usuario/disco y año, y no es un snapshot completo apropiado para calibrar TopDiscs. Su CTE deduplica el historial para esas estadísticas, pero no proporciona una distribución de la comunidad lista para esta evaluación.

Por tanto, las cantidades que siguen son exclusivamente una simulación ficticia: no indican el C o la mediana de Riff Valley y no sirven para seleccionar un k de producción.

## Simulación reproducible y comprobaciones

Ejecutar el archivo standalone:

```bash
node roadmap/catalog/simulate-topdiscs-c-top-9.mjs
```

No importa código de aplicación, no lee `.env` y no conecta a PostgreSQL. Usa rates ficticios y metadatos inventados para filtros. Incluye los escenarios requeridos, cero como nota real, disco pinned no votado y un disco futuro excluido del prior. También contiene un fixture auxiliar con pares duplicados, nulo y valores fuera de escala.

El simulador ejecuta aserciones al correr:

- comprobación de fórmula cerrada y de C como suma/cantidad de votos válidos;
- el disco vacío no cambia C, el cero sí puede participar, la fecha futura no;
- deduplicación determinista por usuario/disco, exclusión de NULL/fuera de `[0,10]` y conservación de cero;
- todos los scores de la población sintética quedan en `[0,10]`;
- el score de un disco de 3 votos y media 10 no cambia bajo filtros año, mes, género y país cuando C/k no cambian;
- el modelo actual sí demuestra sensibilidad del mismo disco a filtros en estos escenarios;
- más valoraciones excelentes suben el score gradualmente, sin umbral discontinuo;
- discos con el mismo R y v empatan; el simulador confirma que el desempate por ID es determinista. La frecuencia real de empates no se puede estimar sin datos de la comunidad.

### Parámetros sintéticos

El universo contiene 12 discos publicados, 272 ratings sintéticos válidos (efectivamente uno por usuario/disco) y un disco futuro excluido. M1 da `C=6.2083`, mediana SQL `10`, `m=10`. M2–M6 usan C por voto `6.8658`; M7 usa C por media de discos votados `6.7727`. La diferencia entre M2 y M7 en este conjunto es pequeña (`0.0931`), pero ambos criterios pueden divergir más si unos pocos discos acumulan una proporción grande de votos.

### Scores, posiciones y delta frente a M1

Cada celda contiene `puntuación/posición/Δ`; para M1, solo score/posición. `Δ = puesto M1 − puesto del método`, positivo significa que el candidato sube puestos. La lista incluye el pinned sin votos, que el SQL actual deja competir.

| ID | Escenario | v | R | M0 media | M1 actual | M2 k3 | M3 k5 | M4 k10 | M5 k15 | M6 k20 | M7 disco k10 |
|---|---|---:|---:|---|---|---|---|---|---|---|---|
| A | Un voto 10 | 1 | 10 | 10.000/1/+6 | 6.553/7 | 7.649/6/+1 | 7.388/7/0 | 7.151/7/0 | 7.062/7/0 | 7.015/7/0 | 7.066/7/0 |
| B | 3 votos, media 10 | 3 | 10 | 10.000/2/+4 | 7.083/6 | 8.433/3/+3 | 8.041/4/+2 | 7.589/5/+1 | 7.388/6/0 | 7.275/6/0 | 7.517/5/+1 |
| C | 5 votos, media 9.5 | 5 | 9.5 | 9.500/3/+2 | 7.306/5 | 8.512/1/+4 | 8.183/2/+3 | 7.744/4/+1 | 7.524/4/+1 | 7.393/5/0 | 7.682/4/+1 |
| D | 10 votos, media 9 | 10 | 9 | 9.000/4/-1 | 7.604/3 | 8.507/2/+1 | 8.289/1/+2 | 7.933/2/+1 | 7.719/3/0 | 7.577/3/0 | 7.886/2/+1 |
| E | 20 votos, media 8.5 | 20 | 8.5 | 8.500/5/-4 | 7.736/1 | 8.287/4/-3 | 8.173/3/-2 | 7.955/1/0 | 7.800/1/0 | 7.683/1/0 | 7.924/1/0 |
| F | 50 votos, media 8 | 50 | 8 | 8.000/6/-4 | 7.701/2 | 7.936/5/-3 | 7.897/5/-3 | 7.811/3/-1 | 7.738/2/0 | 7.676/2/0 | 7.795/3/-1 |
| G | 100 votos, media 7.5 | 100 | 7.5 | 7.500/7/-3 | 7.383/4 | 7.482/7/-3 | 7.470/6/-2 | 7.442/6/-2 | 7.417/5/-1 | 7.394/4/0 | 7.434/6/-2 |
| H | 20 votos divididos 0/10 | 20 | 5 | 5.000/8/+1 | 5.403/9 | 5.243/9/0 | 5.373/9/0 | 5.622/9/0 | 5.800/9/0 | 5.933/10/-1 | 5.591/9/0 |
| I | 50 votos divididos 2/8 | 50 | 5 | 5.000/9/+1 | 5.201/10 | 5.106/10/0 | 5.170/10/0 | 5.311/10/0 | 5.431/11/-1 | 5.533/11/-1 | 5.295/10/0 |
| J | 10 votos, media 2 | 10 | 2 | 2.000/10/+2 | 4.104/12 | 3.123/12/0 | 3.622/12/0 | 4.433/12/0 | 4.919/12/0 | 5.244/12/0 | 4.386/12/0 |
| K | 3 votos de cero | 3 | 0 | 0.000/11/0 | 4.776/11 | 3.433/11/0 | 4.291/11/0 | 5.281/11/0 | 5.722/10/+1 | 5.970/9/+2 | 5.210/11/0 |
| L | Pinned sin votos | 0 | — | 0.000/12/-4 | 6.208/8 | 6.866/8/0 | 6.866/8/0 | 6.866/8/0 | 6.866/8/0 | 6.866/8/0 | 6.773/8/0 |

### Interpretación de sensibilidad

- **Una nota excelente:** M0 la coloca primera. M1 y los modelos globales contraen el score; con `k=3` queda sexta, mientras `k=5–20` queda séptima en esta tabla. La posición absoluta es consecuencia del grupo ficticio.
- **Cruce entre votos excelentes y buenos:** con `k=3`, el disco de cinco votos y media 9.5 ocupa el primer puesto; con `k=5`, el disco de diez votos y media 9 ocupa el primero; con `k≥10`, el disco de veinte votos y media 8.5 queda primero. M1 pone el disco de 20 votos primero porque en este universo su `C=6.2083`, `m=10` produce score 7.736 frente a 7.604 para la media 9 con diez votos. Es un ejemplo claro de por qué el parámetro y universo importan.
- **Valores bajos y ceros:** más k acerca una muestra negativa al prior, elevando su score. Por ejemplo, tres ceros pasan de 3.433 (`k=3`) a 5.970 (`k=20`). Esto no borra que su media observada sea cero; muestra incertidumbre bajo el modelo.
- **Opiniones divididas:** la fórmula solo ve media y cantidad. Dos poblaciones con el mismo `R` y `v` obtienen la misma puntuación aunque una sea polarizada y otra homogénea. Medir polarización exigiría otro indicador y una decisión de producto; no se añade al ranking aquí.
- **Remontada:** la puntuación cambia de forma continua conforme se agregan votos; no hay salto especial al llegar a 3, 5 o 10. Para un conjunto repetido de notas 10 y `k=10`, el script comprueba incremento continuo para 1, 3, 5 y 10 votos.
- **k:** `k=3` deja más influencia a grupos pequeños; `k=15–20` aplaza más su convergencia. Ninguno se declara mejor por esta tabla.

## Comparabilidad entre filtros

El script simula filtros `Todos`, año 2024, mes 2024-02, género rock y país US sobre el disco B (3 votos de 10). En los cinco casos M2–M6 conservan C=`6.8658`; con `k=10`, su score queda `7.5891`. La puntuación no depende del subconjunto usado para mostrar competidores.

En M1, el fixture muestra:

| Vista | C local | m local | Score del disco B |
|---|---:|---:|---:|
| Todos | 6.2083 | 10 | 7.0833 |
| Año 2024 | 6.2143 | 3 | 8.1071 |
| Mes 2024-02 | 6.5000 | 3 | 8.2500 |
| Género rock | 6.2143 | 3 | 8.1071 |
| País US | 6.7500 | 4 | 8.1429 |

Los filtros sí pueden cambiar qué competidores se muestran y, por tanto, la **posición**; el requisito de invariancia es para el score del disco dado el mismo snapshot de sus votos y el mismo par versionado C/k, no para su puesto.

Si C se recalcula entre peticiones, igualdad entre vistas en momentos diferentes no se garantiza. Para consistencia dentro de una petición/version, el prior debe leerse de un snapshot completo (C, k, universo, versión y fecha de corte publicados atómicamente) y no mezclarse con valores de caché distintos. Si se calcula online en SQL, el prior y la query de ranking deberían compartir una sentencia o snapshot transaccional. El servicio actual carga global stats y ranking en dos queries separadas, por lo que un voto concurrente puede cambiar sus datos entre ambas; hay que resolverlo al implementar, no en esta evaluación.

## Discos pinned sin votos

| Política | Consecuencia |
|---|---|
| Incluirlos con score `C` | Mantiene elegibilidad y compatibilidad actuales; un disco sin observación ocupa un puesto estadístico como si tuviera la media global. Puede desplazar discos votados alrededor de C y confunde selección editorial con puntuación colectiva. |
| Incluirlos sin puntuación observada | Mantiene la presencia, pero ordenar `NULL` requiere una regla explícita; seguirían dentro del ranking presentado. |
| Separar destacado manual de clasificación estadística | Distingue curación de votos y evita afirmar que el pin tiene score observado. Cambia la presentación/lista y requiere coordinación del contrato consumidor. |

**Recomendación prospectiva:** mantener la elegibilidad actual durante una prueba shadow; si se adopta el algoritmo, separar los destacados manuales del ranking basado en votos o etiquetarlos como destacados fuera de la ordenación estadística. No cambiar esa política en C-TOP-9. `averageRate=0, voteCount=0` no debe describirse como media observada cero.

## Datos, duplicados y valores no válidos

- La escritura de Rate actualiza un Rate existente por usuario/disco bajo advisory lock, pero no hay constraint única inspeccionada. Si hay pares duplicados históricos, agregarlos tal cual hace que una persona pese varias veces. Para C se recomienda una sola valoración actual por usuario/disco. Debe elegirse y documentarse desempate y semántica de un último `NULL`; no borrar ni reparar datos dentro de la evaluación.
- El Dashboard de Community ya usa `DISTINCT ON (userId, discId)` para una estadística anual, pero filtra NULL antes de escoger fila. Eso no necesariamente equivale a “tomar última fila actual y luego excluir NULL”. Se necesita decidir cuál semántica de edición representa la valoración presente; no copiar una query ajena automáticamente.
- Los Rates invalidos fuera de escala no se pueden cuantificar sin dataset. En una implementación, filtrar `[0,10]` evita que C y R rompan la escala; además registrar conteo/IDs para una futura corrección de datos separada.
- No se encontró concepto/columna de “oculto” en `Disc`. Si existe control de visibilidad fuera de esta entidad, verificarlo antes de fijar el universo.

## Rendimiento e integración técnica

El prior por voto es una agregación global simple sobre Rate vigente unido a Disc con predicado de lanzamiento y filtro válido, no necesita unir dimensiones de presentación. Frente al `home-global-stats` actual, elimina agrupación y percentil por disco, aunque la deduplicación histórica puede requerir ordenación. El costo real depende de cardinalidades y plan; no se midió ni se propone índice.

Alternativas de ejecución cuando haya aprobación:

1. **Recalcular por request:** una lectura global sin filtros de vista; simple y siempre actualizado, pero agrega todos los Rates y puede observar un snapshot distinto del ranking si queda en una query separada.
2. **Calcular C dentro de la sentencia de ranking:** un solo snapshot SQL y sin caché, pero repite agregado global en cada llamada y exige revisión de plan.
3. **Snapshot/cache versionado:** barato por request y parámetros iguales en filtros; requiere refresco atómico, versión legible y política para retraso/invalidación. Triggerar recomputación ante cambios válidos y cuando un disco cruza la fecha de publicación puede ser más trabajo que un refresh periódico. No cachear por género/país/año: se perdería el objetivo de estabilidad.

No hay medida de carga actual que justifique cache o tabla materializada. D46 ya añadió índices de Rate para otras consultas; no se asume que sean suficientes para deduplicar latest-per-user/disc. Revisar `EXPLAIN (ANALYZE, BUFFERS)` con PostgreSQL desechable y cardinalidad representativa antes de elegir la implementación. No se agregaron dependencias, índices ni migraciones.

### Impacto esperado en consumidores

- `GET /api/discs/topDiscs` y el alias legacy `GET /api/discs/homeDiscs` delegan al mismo método y reciben el mismo nuevo orden/score si se cambiara su lógica. El shape puede mantenerse, pero `weightedScore` y las posiciones son observables; es regresión de orden y requiere aprobación/caracterización.
- La vista actual conserva su límite visible de 11 según C-TOP-8; API solicita 20. El algoritmo solo alteraría scores y orden; no es necesario cambiar límite/rutas para evaluar.
- `CommunityDashboardRatesService` calcula estadísticas anuales/de participación por separado. No reutiliza el weightedScore de TopDiscs y no debería cambiar por una modificación interna del prior. Comprobar consumers end-to-end antes de desplegar, pero no adaptar Dashboard/Community en este trabajo.

## Recomendación

1. **C:** preferir media por voto vigente, deduplicada, de rates válidos en `[0,10]` sobre discos publicados hasta un `asOf` definido. Es más directa como promedio de preferencias registradas que la media de medias con ceros. Validar la semántica de duplicados/NULL y presencia antes de implementarla.
2. **k:** no hay óptimo medido. Llevar `k=5` y `k=10` a validación offline como shortlist; el rango provisional `5–10` es un punto inicial de decisión, no una conclusión estadística. `k=3` es más permisivo con muestras pequeñas; 15/20 más conservadores.
3. **Fijo o variable:** mantener k fijo dentro de una versión; no derivarlo de la mediana de votos filtrada. Solo recalibrar después de comparar en snapshots históricos y publicar nueva versión.
4. **Cadencia de C:** refresco versionado común a todas las vistas. Semanal es un piloto operativo razonable para medir deriva, no un intervalo respaldado por el dataset actual. Ajustar tras medir estabilidad y volumen de cambios.
5. **Pinned sin votos:** no confundir con score empírico; conservar elegibilidad durante shadow y luego valorar listado/etiqueta editorial separado, que requiere contrato y presentación coordinados.
6. **Diferencia frente a hoy:** C pasa de media de medias con no-votos como cero a media por voto deduplicada; k pasa de mediana truncada, filtro-dependiente, a valor explícito versionado. Desaparece la influencia de un disco nuevo sin votos en C/m. Los scores pueden moverse globalmente, y el orden puede cambiar; la simulación lista cruces ficticios.
7. **Riesgos:** prior sesgado si universe incluye ratings duplicados, artistas ocultos o futuros; notas fuera de escala; C desactualizado; mezcla de versiones; impacto de score pinned; y diferencias en orden que verá el frontend/legacy.
8. **Validación:** snapshot anonimizado/aislado, backtest temporal (calcular C/k en corte T, evaluar estabilidad y error frente a votos posteriores), segmentos por votos, filtros y cohortes release-date, sensibilidad de puestos y comparación humana; excluir filtraciones temporales. Probar k en cuadrícula predefinida, no seleccionar a partir de un solo ranking estático.
9. **Dashboard y legacy:** legacy `/homeDiscs` sí cambia porque comparte handler; Dashboard comunitario no comparte este cálculo según el código inspeccionado. Mantener contratos y comunicar delta de scores/posiciones antes de desplegar.
10. **Decisión:** recomiendo avanzar a una validación offline de M2–M6, sin adoptar aún. No ajustar la fórmula actual hasta conseguir dataset representativo y acordar pinned/duplicados/actualización temporal.

Estas son conclusiones de diseño y evidencia de código. Los efectos en la tabla son simulaciones; distribución real, estabilidad y calidad predictiva siguen pendientes.

## Plan posterior propuesto

1. Acordar deduplicación, NULL, definición de disco publicado y política pinned.
2. Obtener/crear snapshot anonimizado permitido con último Rate vigente y releaseDate; documentar cobertura, duplicados, nulos y fuera de rango.
3. Ejecutar backtest por cortes temporales para C por voto y C por disco, `k={3,5,10,15,20}`; reportar drift, swaps, top-11/top-20 y error frente a ratings nuevos sin tratarlos como “verdad musical”.
4. Diseñar versionado/cadencia y comprobar SQL/plan en PostgreSQL aislado; medir snapshot/cache versus cálculo online.
5. Presentar tabla de delta actual y cambio pinned a aprobación antes de modificar producción o frontend.

## Archivos y verificaciones

- Nuevo: `roadmap/catalog/c-top-9-validacion-bayesiana.md`.
- Nuevo: `roadmap/catalog/simulate-topdiscs-c-top-9.mjs`, simulador sintético con aserciones ejecutadas.
- Índice y roadmap de Catalog actualizados; C-TOP-7 permanece pendiente.
- No se modificaron producción, contratos, frontend, Dashboard, Community, datos, rutas, dependencias ni migraciones.
- Dataset: ninguno representativo. No se consultó base local ni producción.
- Ejecutado: `node roadmap/catalog/simulate-topdiscs-c-top-9.mjs`; aserciones incluidas aprobadas.
- Ejecutado: comprobación de enlaces Markdown relativos en README, roadmap e informe; todos los destinos existen.
- Ejecutado: `git diff --check` aprobado.
