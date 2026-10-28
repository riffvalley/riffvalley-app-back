# CAT-DISC-3h — Multiselección de géneros con OR en backend

**Estado:** implementación y validaciones completadas el 2026-10-28. No se inicia CAT-DISC-3e ni se modifica frontend.

## Contrato HTTP

Los endpoints nuevos `GET /api/discs/list` y `GET /api/discs/list/options` aceptan `genreIds` como una lista CSV de UUID v4:

```text
?genreIds=id1,id2,id3
```

También se acepta un array que el parser HTTP entregue como valores repetidos. Se recortan duplicados y se normalizan UUID a minúsculas; cada elemento debe ser un UUID v4. Una cadena vacía o un elemento vacío es 400. Una lista vacía no agrega filtro.

Se eligió CSV porque es compacto, inequívoco para UUID (no contienen comas) y se puede enviar con Axios mediante `params: { genreIds: ids.join(',') }`, sin configurar `paramsSerializer`. El máximo es dinámico: la fachada consulta el número actual de filas de `genre` y rechaza una selección mayor. Solo consulta el conteo cuando `genreIds` no está vacío. Así se pueden seleccionar todos los géneros reales sin fijar un límite arbitrario ni dejar que una lista mayor que el catálogo aumente el tamaño del `IN`.

`genreId` sigue aceptándose en ambos endpoints. Precedencia: si `genreIds` está presente, el conjunto (aunque vacío) prevalece y `genreId` se ignora; si no está presente, se aplica `genreId` como filtro único. No se mezclan ambos valores. Los endpoints legacy no reciben `genreIds` ni cambian su DTO público.

## Semántica, ownership y filtros cruzados

El contrato interno comparte la selección entre `DiscListService`, Catalog, los cuatro readers y `applyDiscListFilters`. El SQL filtra la FK real `disc.genreId` mediante parámetros TypeORM (`IN (:...discListGenreIds)`), que representa OR. El filtro singular legacy se usa solo cuando no existe `genreIds`. No hay joins nuevos por género: la relación de Disc con Genre es many-to-one y cada disco mantiene un único género principal.

Modo, usuario autenticado, texto, fechas y país continúan combinándose con AND. Se conserva el usuario de `@GetUser()`, las reglas de elegibilidad, unidad de conteo, orden, empates y permisos de cada owner. Comments conserva filas por comentario; Rates/Covers filtran la columna que les corresponde; Favorites/Pendings siguen limitados al usuario.

Para options, countries respeta la selección OR y omite `countryId`; genres respeta `countryId` y omite todo el filtro de género. Las opciones siguen consultando el universo elegible completo, sin `limit` ni dependencia de la página.

## Verificación PostgreSQL aislada

La suite `disc-list-options.postgres.integration.spec.ts` se ejecutó con PostgreSQL 17 Docker aislado `riffvalley_topdiscs_test` en `127.0.0.1:55433`. La suite verifica destino, rol/permisos y ausencia de relaciones persistentes en `public`; todos los fixtures y tablas son temporales por conexión. No se ejecutaron migraciones ni se accedió a bases de desarrollo, preproducción o producción.

Resultados: **4/4 tests PostgreSQL aprobados**. Además de opciones dinámicas, la suite invoca los QueryBuilders propietarios reales para `all`, `rates`, `covers`, `comments`, `favorites` y `pendientes`, con dos géneros. Verifica filtros de texto/fecha/país, OR incluso cuando también llega `genreId`, totales, página con offset, no coincidencias, aislamiento entre usuarios, y que dos comentarios del mismo disco sigan contando como dos filas. Los fixtures confirman la diferencia entre rating musical y rating de portada.

La SQL del listado CAT-DISC-3c queda validada contra PostgreSQL aislado con estos fixtures sintéticos. Los tests no son un benchmark de producción ni aportan planes representativos para decidir índices; no se añadieron índices ni caché.

## Tests y gates

- Suites focalizadas de DTO, fachada, controller, Catalog, readers y los cuatro servicios Community: **10 suites / 198 tests aprobados**.
- PostgreSQL options + SQL del listado de los seis modos: **1 suite / 4 tests aprobados**.
- `pnpm run verify`: **aprobado**, incluye **231 suites / 2.256 tests**, 17 suites y 114 tests opt-in omitidos, 2 snapshots, typecheck y Nest build.
- ESLint focal de solo lectura: aprobado. Gate global: **839 diagnósticos históricos, 0 nuevos**.
- Gate estructural: **9 históricos, 0 nuevos**. Gate de tipado seguro: **5 históricos, 0 nuevos**. No se modificaron baselines.
- `git diff --check`: aprobado. La inspección documental confirma enlaces Markdown locales de CAT-DISC-3h, actualización del índice y precondición de listado corregida en CAT-DISC-3d.
- No se cambió código de controller, Identity ni endpoints legacy. No se tocó frontend.

## Alcance, riesgos y preparación frontend

Archivos productivos afectados: DTO/servicio/fachada de DiscList; filtro compartido de Community; criterios internos y lectores propietarios; `DiscCatalogService` para `all` y sus options. Las pruebas de DTO, fachada y PostgreSQL se ampliaron. No hay migraciones ni dependencias nuevas.

Riesgo residual: falta en este checkout `roadmap/catalog/cat-disc-3a-auditoria-consumidores-contratos.md`, por lo que se verificaron los contratos documentados en 3b–3d y el código actual, pero no se pudo releer esa auditoría. La validación dinámica añade una consulta `COUNT(*)` simple a `genre` cuando se envía una selección no vacía; no se midió el impacto con carga representativa. La selección no introduce duplicados por joins ni cambia totales/paginación en las pruebas.

CAT-DISC-3h no completa integración frontend. CAT-DISC-3e sigue pendiente y deberá resolver antes la identidad de sesión del modo `all`, según 3b–3d. La validación PostgreSQL que bloqueaba esa precondición técnica ya se ha ejecutado.
