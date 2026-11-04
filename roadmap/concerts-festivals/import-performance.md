# CON-B04f — Validación y rendimiento del importador

## CON-F12d — auditoría profunda del flujo de importación masiva

El benchmark PostgreSQL aislado ejecutado para la auditoría, escenarios no medibles y límites A/B/C están en [con-f12d-import-strategies.md](con-f12d-import-strategies.md#5-rendimiento-y-límites). No hay ejecución de A/C ni de “existente sin cambios/con diferencias”: el código actual es create-only y no implementa igualdad semántica. Los resultados nuevos se detallan allí para no confundirlos con las mediciones históricas de CON-F12b/12c.

## Entorno reproducible

La validación usa exclusivamente Docker Compose, con nombres dedicados al trabajo:

- PostgreSQL `16.14` (`postgres:16.14`), la versión documentada para producción del proyecto.
- Runner `node:24-bookworm-slim`, pnpm `11.28.7` y dependencias fijadas por `pnpm-lock.yaml`.
- Fixture HTTP de geocodificación local en `127.0.0.1:55473`; no llama a Nominatim público.
- Proyecto `con-b04f-validation`, volumen `con_b04f_postgres_data` y puerto de PostgreSQL `127.0.0.1:55472`.
- Bases temporales `con_b04a_con_b04f_receipts` y `con_b04f_events`.

Comando reproducible desde la raíz del repositorio:

```bash
bash scripts/con-b04f/validate-docker.sh
```

El script construye el runner, espera a que PostgreSQL y el mock estén sanos, ejecuta `pnpm run verify`, y después ejecuta las suites PostgreSQL de recibos, migraciones y el servicio de importación. Sus comprobaciones impiden reutilizar accidentalmente recursos Compose con el mismo nombre; el `trap` elimina únicamente sus contenedores, red y volumen, incluso si una fase falla. Para limpiar explícitamente tras interrumpir Docker/Compose:

```bash
docker compose -p con-b04f-validation -f docker-compose.con-b04f.yml down --volumes --remove-orphans
```

No se conectó `SpamMusicDB`, PostgreSQL del host, una base remota ni servicios externos. No se hicieron pruebas visuales ni cambios en frontend.

## Migraciones e integridad PostgreSQL

La integración ejecutó las migraciones reales:

1. `1792070000000-CreateVenueCatalog`
2. `1792080000000-CreateLocalityAliases`
3. `1792090000000-CreateEventDomain`
4. `1792100000000-CreateTours`
5. `1792110000000-AddTourToEventArtists`
6. `1792120000000-PrepareTourNamesAndImportReceipts`
7. `1792130000000-ScopeImportReceiptsByOperation`

La cadena histórica completa no se pudo reproducir desde una base vacía: depende de tablas preexistentes de Country, Artist y User. La suite crea esas tres tablas mínimas y luego ejecuta el tramo real de migraciones de Venue/Event/Tour/importación en una transacción de migración. Por tanto, los resultados validan ese tramo de PostgreSQL y no afirman que el historial entero de migraciones arranque desde cero.

La inspección real comprobó los índices únicos de Venue físico/genérico, Tour normalizado, posición EventArtist y recibos por operación; las FKs restrictivas y checks de Venue, Tour y EventArtist; y los triggers que solo permiten `EventArtist.tourId` en festivales y protegen el cambio de tipo del Event. El escenario de gira creó tres conciertos con un único Tour, tres EventArtist independientes y sin duplicados. También se cubrieron Venue genérico y físico, festivales y asociaciones por actuación sin crear `TourArtist`, restricciones de claves foráneas y posiciones, rollback conjunto de Artist/Event/EventArtist y recibos.

## Integraciones y concurrencia

Suites ejecutadas contra las dos bases Docker: recibos PostgreSQL (5 pruebas), integridad/migraciones (3) e importador/línea de artistas (9), **17 pruebas aprobadas**. Incluyeron reintento exacto, identidad de operación separada, contenido de recibo, creación parcial, error/rollback, tres conciertos de una gira, conflictos de participación, duplicado de festival, excepción de festival de varios días, localidad nueva mediante mock y ampliación confirmada aditiva e idempotente.

Escenarios concurrentes reales con conexiones PostgreSQL:

- Dos expansiones del mismo lineup asignaron las posiciones `[1, 2, 3, 4, 5]`, sin duplicados. En la captura se observó un máximo de un backend esperando lock, duración 82 ms y cero deadlocks.
- Creación simultánea de la misma identidad Artist/Venue/Tour produjo una sola fila por entidad; una fila se creó y la otra quedó en conflicto explícito de Tour, sin escritura parcial del segundo intento.
- Dos importaciones simultáneas incompatibles para el mismo artista y fecha dieron una creación y un conflicto, un solo Event y ningún Venue auxiliar para la fila rechazada.
- La suite de recibos verificó retries concurrentes sobre una identidad mediante la restricción y bloqueo PostgreSQL; no se duplicó el recibo.
- `pg_stat_database.deadlocks` no aumentó en los escenarios medidos. Las métricas son de fixtures sintéticos pequeños y no representan capacidad de producción.

## Benchmarks

### CON-F12b — cargas acumuladas hasta 5.000 filas

El runner reproducible es `bash scripts/con-f12b/benchmark-docker.sh`. Usa PostgreSQL 16.14, Node 24 y pnpm 11.28.7 en el proyecto aislado `con-f12b-validation`; se niega a reutilizar contenedores o volúmenes existentes y su `trap` elimina solo los recursos creados por ese proyecto. No se conecta a `SpamMusicDB` ni a servicios remotos. El proyecto CON-B04f y su volumen no se tocan.

La suite opt-in `events-import.postgres.integration.spec.ts` envía tamaños acumulados de 100, 500, 1.000, 2.000 y 5.000 como requests de hasta 100 filas, siguiendo el límite actual. El fixture combina artistas repetidos y nuevos, localidades/venues compartidos, tours compartidos dentro del request, festivales de varios días, duplicados y conflictos internos, una colisión persistida y retries idempotentes. Comprueba que las filas terminan en `created` o `conflict`, y registra por tamaño el tiempo, consultas SQL, transacciones observadas como `BEGIN`/`START TRANSACTION`, errores SQL, variación aproximada de RSS y el coste/consultas de repetir recibos.

Para ejecutar solo este banco: `CON_F12B_STRESS_ONLY=1 bash scripts/con-f12b/benchmark-docker.sh`. El runner activa `CON_F12B_STRESS=1`; ambas variables están desactivadas en Jest normal porque el escenario de 5.000 filas es intencionadamente largo. El JSON de mediciones se imprime como `[CON-F12b stress benchmark]`. Las cifras son de PostgreSQL Docker local con datos sintéticos; la RSS muestreada tras cada request es una aproximación y no representa el pico instantáneo.

Se ejecutó dos veces en proyectos PostgreSQL efímeros con los mismos fixtures. La tabla usa la segunda ejecución (la primera queda representada por el intervalo de tiempo); el contador SQL fue idéntico en ambas. «Consultas previas/optimizadas» es una comparación del preflight de Tour y la lectura de candidatos de conflicto: el previo se calcula con el número de nombres y requests del fixture, mientras la columna total SQL sí se midió en PostgreSQL.

| Filas | Requests | Consultas previas → optimizadas en esas fases | SQL total observado | Transacciones | Conflictos | Duración observada | RSS delta aprox. | Retry (ms / SQL) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 1 | 9 → 5 | 1.429 | 98 | 2 | 535–691 ms | 9 MiB | 20 / 4 |
| 500 | 5 | 45 → 25 | 7.101 | 489 | 11 | 2.683–2.810 ms | 22 MiB | 64 / 20 |
| 1.000 | 10 | 90 → 50 | 14.216 | 979 | 21 | 5.424–5.518 ms | 19 MiB | 117 / 40 |
| 2.000 | 20 | 180 → 100 | 28.446 | 1.959 | 41 | 11.533–11.605 ms | 39 MiB | 254 / 80 |
| 5.000 | 50 | 450 → 250 | 71.136 | 4.899 | 101 | 42.452–42.992 ms | 221 MiB | 961 / 200 |

Las dos fases agrupadas ahorran cuatro SELECT netos por request en este fixture: ocho Tours individuales se convierten en uno, mientras los candidatos existentes pasan de una consulta amplia a cuatro grupos de 25 filas. El total crece casi linealmente por la persistencia segura e individual de eventos. La RSS no es pico: se comparó lectura inicial con muestreo después de cada request y depende de la retención de objetos por el runner. No hay medición end-to-end del commit previo; esta tabla no atribuye ahorro de tiempo total al cambio.

### CON-F12c — límite HTTP de 50 filas y medición PostgreSQL

El banco opt-in anterior se amplió para enviar como máximo 50 filas por petición. Con `CON_F12B_STRESS_ONLY=1 bash scripts/con-f12b/benchmark-docker.sh` se ejecutan los escenarios de una petición (1/10/25/50) y las cargas acumuladas, incluido 600 eventos en 12 peticiones. El runner ejecutó migraciones reales y PostgreSQL 16.14 local en Docker efímero, aislado de producción; el proceso secuencial se probó con TypeORM y SQL real. Las duraciones son del servicio `EventsImportBatchService` con TypeORM/PostgreSQL: no incluyen transporte HTTP, autenticación, parsing ni latencia de red Heroku. Se ejecutó el mismo conjunto dos veces durante el trabajo: las mediciones por tamaño individual se tomaron en la segunda ejecución. `elapsedMs`, SQL, transacciones y errores son mediciones; las consultas “anteriores” son estimaciones estáticas del flujo previo, no una ejecución del código anterior. RSS es una aproximación de memoria residente muestreada, no el pico.

| Filas de una petición | Requests | Duración observada | SQL observado | Transacciones | Errores SQL | Delta RSS aprox. |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 8,62–27,05 ms | 18 | 1 | 0 | 0–0,125 MiB |
| 10 | 1 | 53,33–83,00 ms | 144 | 10 | 0 | 0–4,375 MiB |
| 25 | 1 | 129,63–182,83 ms | 354 | 25 | 0 | 0–0,375 MiB |
| 50 | 1 | 283,89–308,40 ms | 705 | 50 | 0 | 0,375–4,50 MiB |

El fixture de estas mediciones reusó una Locality, un Venue y Artist existentes, con una fecha distinta por fila. El escenario acumulado más cercano al volumen habitual creó 575 eventos y detectó 25 conflictos en 600 entradas: 12 requests, 3.108,79–3.195,52 ms en total, 8.338 consultas SQL, 575 transacciones, cero errores SQL y delta RSS aproximado de 5,375–8,125 MiB. El retry del mismo conjunto empleó 88–90,04 ms y 48 consultas; reprodujo las 575 filas confirmadas. En el estrés de 5.000 entradas se crearon 4.799 eventos y hubo 201 conflictos: 100 requests, 42.159,56–43.293,78 ms acumulados, 69.586 consultas, 4.799 transacciones, cero errores SQL y delta RSS aproximado de 375,03–415,56 MiB. Ese tiempo acumulado excede 30 segundos porque corresponde a cien peticiones secuenciales en un único proceso de benchmark, no a una petición HTTP.

Para las consultas de preflight de este fixture de 50 filas, la lectura anterior de Tour correspondería a 5 SELECT (uno por Tour distinto) y la optimizada ejecutó 1; los candidatos de conflicto pasan de 1 consulta global histórica a 2 grupos limitados a 25 entradas. El límite de 25 evita una lista de parámetros excesiva y limita candidatos, con el coste de un SELECT adicional en requests de 26–50 filas. No se midió un baseline ejecutando el commit anterior en el mismo banco; no se atribuye mejora total de duración o SQL al cambio de CON-F12b.

Los resultados locales dejan margen amplio respecto al router de 30 segundos, pero no predicen latencia de Heroku Basic/PostgreSQL essential-0: red, carga concurrente y cardinalidad real pueden cambiar el tiempo. El llamador debe conservar la opción de enviar lotes menores. La interrupción HTTP no cancela una transacción ya confirmada; la idempotencia por fila permite repetir el lote sin duplicar los eventos confirmados. No se ejecutó contra producción.

Cada tamaño se repitió tres veces sobre el PostgreSQL Docker; la tabla muestra el promedio de duración total y el conteo SQL por llamada. Las llamadas son al servicio real `EventsImportBatchService`, con TypeORM/SQL real, no mocks.

| Filas | A: localidades conocidas, entidades existentes (ms / SQL) | B: Artist/Venue/Tour compartidos (ms / SQL) | C: conflictos en lote (ms / SQL) | Reintento idempotente (ms / SQL) | D: localidad nueva, fixture local (ms / SQL) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 234 / 287 | 227 / 309 | 11 / 4 | 6 / 1 | 553 / 302 |
| 50 | 359 / 707 | 409 / 759 | 17 / 4 | 7 / 1 | 429 / 722 |
| 100 | 941 / 1.407 | 935 / 1.509 | 57 / 4 | 12 / 1 | 1.294 / 1.422 |

El escenario A distribuyó las filas entre Madrid, Barcelona, Bilbao y Valencia, con Locality y Venue físico previamente insertados. El contador del fixture permaneció sin cambios durante los nueve lotes A (**cero llamadas de geocodificación**). El escenario B reutilizó el mismo artista, Venue y nombre de Tour; cada importación creó un Tour para sus filas. El escenario C mezcló filas simultáneas incompatibles para el artista/fecha y rechazó todas las filas de cada lote conflictivo. En D, las filas de cada lote compartieron una Locality nueva y el resolutor agrupó la preparación: se recibió exactamente una petición al fixture para 20, 50 y 100 filas por repetición. Todos los casos registraron cero errores SQL.

La referencia orientativa de menos de dos segundos para 20 conciertos se cumplió: escenario A promedió 234 ms y el escenario B 227 ms. Los promedios de consultas por fila son aproximadamente 14 para A y 15 para B; el conteo escala casi linealmente al aumentar filas. La medición registra consultas totales de TypeORM por llamada. No se añadieron instrumentación ni consultas de diagnóstico a producción para separar cada consulta por fase; no se hicieron `EXPLAIN ANALYZE` de índices nuevos porque las mediciones no mostraron una regresión que justificase proponerlos.

No se optimizaron consultas ni se modificó el comportamiento productivo: los lotes quedaron por debajo de los umbrales orientativos y la integridad transaccional se conservó. La ampliación de breakdown SQL por fase y la medición con cardinalidad representativa quedan para una tarea de rendimiento si el uso real las justifica.

## Verificaciones generales

`pnpm run verify` pasó completo dentro del runner Docker:

- Jest: 303 suites aprobadas; 34 omitidas por sus condiciones de ejecución. 2.896 tests aprobados y 182 omitidos; 2 snapshots aprobados.
- Gate estructural: 53 módulos, 9 hallazgos históricos, cero nuevos.
- Tipado seguro: 5 históricos, cero nuevos.
- ESLint de solo lectura: 832 históricos, cero nuevos.
- Typecheck: cero errores; quality build, dependencias runtime y build Nest aprobados.
- `git diff --check`: aprobado.

Las suites opt-in de PostgreSQL se ejecutaron además por el script con variables de entorno explícitas y destino loopback/nombre/user de base comprobados por los tests. La ejecución no usa los flags de integración durante Jest unitario.

## Riesgos pendientes

- No se verificó el historial completo de migraciones desde cero, solo `179207`–`179213` sobre las tablas prerrequisito mínimas ya documentadas.
- Las mediciones usan Docker local y datos sintéticos; no sustituyen una prueba de carga representativa ni revelan límites de I/O o CPU en producción.
- El conteo SQL es total por llamada y no está desglosado en preflight/materialización/persistencia.
- No se consultó producción para validar su versión actual; PostgreSQL 16.14 se eligió porque es la versión registrada en la documentación de despliegue del repositorio.
- No se implementaron cambios de rendimiento, frontend, CON-F08 ni CON-F09.
