# C-TOP-11 — Validación PostgreSQL del modelo bayesiano TopDiscs

**Estado:** completada con PostgreSQL local aislado y fixtures sintéticos.
**Fecha:** 2026-10-28.
**Base:** implementación C-TOP-10; fórmula y elegibilidad aprobadas sin cambios.
**Alcance:** ejecución SQL real de prior, ranking y opciones; pruebas D31–D33; planes de ejecución. No incluye calibración con datos reales ni la regresión visual C-TOP-7.

## Infraestructura e aislamiento

- Docker Engine 29.6.1 ejecutó el contenedor dedicado `riffvalley-topdiscs-test-pg-20261028`, imagen `postgres:17`, servidor PostgreSQL 17.10 (`server_version_num = 170010`). El puerto se publicó solo en `127.0.0.1:55433`; el almacenamiento es un volumen Docker anónimo, sin bind mounts.
- La base `riffvalley_topdiscs_test` y el rol `riffvalley_topdiscs_test` se crearon dentro de ese contenedor. Una conexión SQL confirmó `current_database()`, `current_user`, el puerto interno 5432 y la versión 17.10.
- El rol de las pruebas no es superusuario, no puede crear roles ni bases, tiene `CONNECT` y `TEMP` sobre la base, y no puede crear objetos persistentes ni objetos en `public`. La comprobación también exigió que `public` no tuviera relaciones persistentes.
- El contenedor preexistente `spammusicdb` pertenece al proyecto Compose `spammusic-back` y usa el puerto 5432. `.env` del backend identifica `SpamMusicDB` como la base habitual de desarrollo. No se consultó el contenido de esa base, no se conectaron las pruebas a ella y no se modificó ningún dato o contenedor ajeno.
- Las suites D31–D33 crean únicamente tablas y fixtures `TEMP` en sus propias conexiones. No fue necesario ejecutar migraciones, crear esquema permanente ni copiar datos. Las pruebas rechazan cualquier host, puerto, base, rol o configuración distintos del destino dedicado.
- No se guardan credenciales en este documento ni en el repositorio. Para repetir la ejecución, proporciona en el entorno los valores de conexión exclusivos de la base aislada y los opt-ins `D31_POSTGRES_TEST=1`, `D32_POSTGRES_TEST=1` y `D33_POSTGRES_TEST=1`; no reutilices `.env` de desarrollo. La guarda vuelve a comprobar destino, identidad, versión y permisos antes de crear las tablas temporales.

Comando de las tres suites SQL, una vez exportadas las variables seguras del destino aislado:

```bash
pnpm exec jest --runInBand \
  src/catalog/discs/top/__tests__/home-global-stats.postgres.spec.ts \
  src/catalog/discs/top/__tests__/home-ranking.postgres.spec.ts \
  src/catalog/discs/top/__tests__/home-personal-state.postgres.spec.ts
```

La suite D32 también ejecuta `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sobre el SQL generado por `DiscTopService` para ranking y opciones.

## Resultados funcionales

Se ejecutaron **3 suites PostgreSQL, 19 tests aprobados y 0 omitidos**. Los resultados se compararon con valores calculados de los fixtures, no con otro helper de producción.

| Validación | Resultado observado en PostgreSQL |
|---|---|
| Prior global D31 | `C = 5` al contar únicamente las Rates vigentes válidas del disco publicado; `NULL`, escala inválida, usuario nulo y disco futuro no aportaron votos. El cero sí se contó. |
| Sin votos válidos globales | El agregado devolvió `NULL`; el ranking devolvió cero filas. No hubo división por cero ni score `NaN`. |
| Fórmula y k | Para los casos de 1, 4 y 20 votos, los scores coincidieron con `(R × v + C × 4) / (v + 4)`. `averageRate` conservó la media observada y el SQL mantuvo decimales sin redondeo previo. |
| Duplicados | `editedAt DESC NULLS LAST`, después `createdAt DESC` y `id DESC` eligieron una sola fila. Se probaron empate de edición, desempate por creación e igualdad de ambas fechas. El valor se validó después de elegir la fila: una fila actual `11` no recuperó la anterior `7`; lo mismo aplica a `NULL`. |
| Rates sin usuario | Se excluyeron del prior y no hicieron elegible un disco. |
| Elegibilidad | Disco votado incluido con y sin `pinned`; `pinned` no alteró el score. Pinned sin voto válido, sin votos, solo nulos, solo inválidos y Rate sin usuario quedaron fuera. El cero hizo elegible al disco. Releases futuros quedaron fuera del ranking/prior vigente. |
| Agregados y relaciones | Varias Rates conservaron su recuento/AVG; Favorites y Pendings duplicados no multiplicaron filas ni votos. |
| Opciones dinámicas | La consulta única devolvió países y géneros de discos votados, deduplicados y ordenados. Excluyó dimensiones presentes solo en pinned sin votos o Rates inválidas; comprobó filtros cruzados, cero, fechas inclusivas, futuro, resultados vacíos y opciones sin límite Top 20. |
| Comparabilidad | El mismo disco produjo exactamente el mismo score entre semana, mes, año, Todos, solo país y solo género con idéntico corte de fecha y votos. |
| Orden y contrato | Durante C-TOP-11, `weightedScore DESC, d.id ASC` y `LIMIT 20` se ejecutaron en PostgreSQL. Las pruebas de controller verificaron delegación de la ruta oficial, alias legacy y opciones. |

No se encontró defecto reproducible en el SQL productivo durante esta validación y no se modificó el algoritmo. Se actualizaron fixtures y expectativas obsoletos de D32/D33 que todavía trataban pinned sin votos como elegible o exigían las subconsultas personales anteriores a C-TOP-10. Una expectativa de score se corrigió para usar el prior global real del fixture.

## Consistencia temporal

El prior global y los votos individuales del ranking se leen en una sola sentencia SQL; PostgreSQL aplica a esa sentencia un snapshot de lectura común. El `asOf` se construye una sola vez por llamada y se reutiliza para candidatos y prior. No se asumió un snapshot compartido por los loaders auxiliares que ejecutan sentencias separadas. Las opciones no calculan C.

`C` puede cambiar entre peticiones al variar Rates vigentes, el catálogo publicado al corte o la validez de los votos. En una petición de ranking, no cambia entre discos ni filtros porque se calcula una vez en esa sentencia y no usa el subconjunto filtrado. No se añadió caché, versionado operativo ni transacción global.

## Planes y coste medido

El test cargó en tablas temporales **2.500 discos y 8.750 Rates**, una por pareja sintética usuario/disco, en dos países y dos géneros. Diez discos forman la semana pequeña de mayo; 1.500 la semana grande de junio y el año 2024; el resto se distribuye entre 2016 y 2023. Se ejecutó `ANALYZE` sobre las tablas temporales antes de medir. Los tiempos siguientes son milisegundos de una ejecución observada en este equipo y dataset:

| Consulta / filtro | Filas de salida | Planning | Execution | Buffers locales hit / read |
|---|---:|---:|---:|---:|
| Ranking, semana pequeña | 10 | 3,221 | 19,971 | 8.534 / 0 |
| Ranking, semana grande | 20 (límite) | 2,534 | 838,048 | 15.268 / 0 |
| Ranking, año | 20 (límite) | 2,444 | 731,076 | 15.318 / 0 |
| Ranking, Todos | 20 (límite) | 2,505 | 1.717,792 | 20.268 / 0 |
| Ranking, país + género | 20 (límite) | 2,020 | 24,300 | 13.777 / 0 |
| Opciones, año | 4 dimensiones | 0,288 | 6,807 | 137 / 0 |
| Opciones, semana grande | 4 dimensiones | 0,322 | 7,262 | 137 / 0 |
| Opciones, Todos | 4 dimensiones | 0,333 | 7,834 | 137 / 0 |
| Opciones, país + género | 2 dimensiones | 0,361 | 7,393 | 139 / 0 |

Los planes tuvieron nodo raíz `Limit` para ranking y `Sort` para opciones. Al ser tablas `TEMP`, PostgreSQL reportó cero buffers compartidos y cero lecturas locales desde disco; el trabajo quedó en buffers locales de sesión. La deduplicación y el prior global inspeccionan el universo completo de Rates, por lo que filtros de periodo selectivos no eliminan ese coste. En este fixture el ranking de semana grande/año tomó ~0,84 s y Todos ~1,67 s, frente a ~19–25 ms en semana pequeña/filtros cruzados; opciones se mantuvo alrededor de 7–8 ms.

Estas cifras sirven para comparar escenarios de este fixture, **no para estimar producción**: las tablas temporales no reproducen cardinalidad, índices, cachés, concurrencia ni distribución real. No se añadieron índices ni caché. La consulta de semana pequeña procesó 8.534 buffers locales y tomó 20 ms; los periodos amplios, que sostienen el prior global independiente de filtros, tomaron 0,73–1,72 s y hasta 20.268 buffers locales. La principal hipótesis a medir con un dataset representativo es el coste de ordenar/deduplicar todas las Rates para `current_rates` y reutilizarlo en el prior y agregados. No hay evidencia suficiente para proponer un cambio productivo.

## Compatibilidad, verificaciones y límites

- `GET /api/discs/topDiscs` y `GET /api/discs/homeDiscs` conservan contrato, autenticación y filtros. La entrada legacy es independiente y mantiene `@deprecated`; ambas delegan en el núcleo estadístico común. `GET /api/discs/topDiscs/options` conserva su contrato. Las pruebas de controller validaron rutas, DTOs y delegación; no se levantó un servidor HTTP ni se hicieron llamadas de red.
- No se modificó Dashboard. Si un consumidor de Dashboard usa `/homeDiscs`, recibirá deliberadamente el nuevo orden, scores y elegibilidad de TopDiscs; sus componentes y estadísticas independientes no se tocaron.
- Tests focalizados de TopDiscs, controller y servicio: **13 suites aprobadas, 68 tests aprobados**; las 7 suites PostgreSQL dentro de esa ejecución sin opt-ins se omitieron. D31–D33 se ejecutaron aparte, en PostgreSQL real, con 19/19 aprobados. Los specs del controller imprimieron un aviso de `AuthGuard` sobre `PassportModule`; las expectativas y suites pasaron y no se modificó autenticación.
- Nest build/runtime dependency gate: aprobado (484 archivos compilados; 26 módulos externos de producción declarados/cargados). Typecheck: 0 errores. Gate estructural: 0 hallazgos nuevos (9 históricos). Gate de tipado seguro: 0 nuevos (5 históricos). `git diff --check`: aprobado.
- ESLint focalizado: aprobado después de corregir cuatro infracciones de formato detectadas en pruebas nuevas. Gate global ESLint: 839 diagnósticos baseline, 0 nuevos, 0 obsoletos y 0 entradas duplicadas.
- `pnpm run verify` se inició como comprobación adicional; fue interrumpido tras aprobar `test:quality-build`, antes de terminar la secuencia completa. No se registra como aprobado. Los gates `quality:structure`, `quality:types`, `quality:lint`, `quality:typecheck`, el build Nest y las pruebas focalizadas se ejecutaron por separado y pasaron.
- No se ejecutaron D34–D37, e2e HTTP, la regresión visual C-TOP-7 ni pruebas con datos reales. No se utilizó producción ni PostgreSQL remoto. El score estable entre filtros no significa que sea históricamente inmutable: nuevas o corregidas valoraciones pueden mover C y todos los scores.

En la fecha de cierre de C-TOP-11, C-TOP-7 seguía pendiente e independiente. C-TOP-11 validó ejecución SQL y consistencia funcional; no calibró el modelo con datos representativos ni seleccionó k óptimo.

**Ajustes posteriores:** el límite SQL de ambas rutas se redujo de 20 a 11 discos; la prueba PostgreSQL de empate verifica que, entre 25 candidatos iguales, cada ruta devuelve los primeros 11 por ID. Sus entradas de controller/service son independientes para poder retirar la legacy por separado, mientras el cálculo estadístico interno permanece compartido. La repetición de D32 pasó 12/12 y `EXPLAIN` devolvió 11 filas en los escenarios limitados; en esa corrida, Todos tardó 1,323 s y la semana pequeña 17,8 ms sobre el mismo fixture. El límite de 20 en la tabla histórica de resultados y planes refleja la ejecución original de C-TOP-11.

**Cierre posterior de C-TOP-7 (2026-10-28):** el usuario confirmó que la reducción del límite efectivo de 20 a 11 es intencionada y definitiva. La discrepancia quedó resuelta; C-TOP-7 se completó y TopDiscs quedó cerrado. Las cifras/planes con 20 filas de este informe son la ejecución histórica anterior al ajuste. Las limitaciones visuales, de sesión real y de contraste se registran en el roadmap frontend; no se presentan como verificaciones superadas ni bloqueos funcionales.
