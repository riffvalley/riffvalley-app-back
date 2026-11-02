# CON-B04f — Validación y rendimiento del importador

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
