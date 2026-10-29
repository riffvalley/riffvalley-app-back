# CAT-DISC-6b — Persistencia y API de filtros guardados

**Estado:** backend completado y verificado el 2026-10-29. CAT-DISC-6c y 6d no iniciadas.
**Diseño de referencia:** [CAT-DISC-6a — Auditoría y diseño de filtros guardados](../../riffvalley-app-front/roadmap/catalog-discs-saved-filters-design.md).
**Alcance:** persistencia, API y pruebas backend. No cambia los lectores, contratos ni consultas de DiscList; no inicia trabajo de frontend.

## Contrato implementado

Base: `/api/discs/list/saved-filters`. Todas las operaciones usan `@Auth()` y toman `user.id` de la sesión. El body no admite `userId`; ninguna respuesta expone el propietario.

| Método | Ruta | Comportamiento |
|---|---|---|
| `GET` | `/api/discs/list/saved-filters` | Devuelve solo los filtros del usuario, en orden estable por `createdAt ASC, id ASC`. |
| `POST` | `/api/discs/list/saved-filters` | Crea y devuelve el recurso (`201`). Body: `{ "name", "filters" }`. |
| `PATCH` | `/api/discs/list/saved-filters/:id` | Actualiza nombre, criterios o ambos. Body vacío responde `400`; recurso ajeno o inexistente responde `404`. |
| `DELETE` | `/api/discs/list/saved-filters/:id` | Elimina y devuelve `204`; recurso ajeno o inexistente responde el mismo `404`. |

La respuesta contiene `id`, `name`, `filters`, `missingGenreIds`, `countryMissing`, `createdAt` y `updatedAt`. `filters` tiene siempre las cuatro claves canónicas:

```json
{
  "genreIds": [],
  "countryId": null,
  "yearFrom": null,
  "yearTo": null
}
```

`genreIds` admite varios UUID v4 únicos y conserva la semántica OR que ya aplica DiscList. `countryId` es un UUID v4 o `null`. `yearFrom` y `yearTo` son enteros independientes entre 1 y 9999 o `null`; si ambos existen, el inicio no puede superar el final. Se aceptan combinaciones parciales. El contrato no persiste búsqueda, artista, modo, orden, paginación ni periodos de mes/semana, y no añade endpoint de búsqueda/aplicación.

## Persistencia y decisiones

- `SavedDiscFilter` usa la tabla `saved_disc_filters`: UUID, `user_id`, nombre varchar(60), configuración JSONB y fechas `timestamptz`.
- La migración `CreateSavedDiscFilters1792030000000` crea una FK a `users(id)` con `ON DELETE CASCADE` y un índice `(user_id, created_at, id)`. Es aditiva y reversible. No se ha ejecutado fuera de PostgreSQL efímero local.
- El nombre se recorta, debe contener algún carácter no blanco y admite hasta 60 caracteres. Se permiten nombres duplicados, incluso con diferencias solo de mayúsculas.
- El límite es 20 por usuario. Crear toma `SELECT id FROM users WHERE id = $1 FOR UPDATE`, cuenta dentro de la misma transacción y guarda antes de liberar el lock. Las creaciones concurrentes del mismo usuario quedan serializadas; el intento que supera el límite recibe `409` con código `SAVED_DISC_FILTER_LIMIT_REACHED`.
- Todas las lecturas, actualizaciones y eliminaciones aplican simultáneamente `id` y `userId`; no se confirma la existencia de IDs ajenos.
- Géneros y países se guardan como UUID dentro de JSONB, sin FK ni reparación automática. La respuesta compara las referencias con los catálogos: conserva intactos los IDs ausentes y expone `missingGenreIds`/`countryMissing` para que el frontend los advierta y permita editarlos.
- El `ValidationPipe` global rechaza propiedades desconocidas (`whitelist` + `forbidNonWhitelisted`). Los DTO validan UUID, duplicados de género, nombre, años y rango.

## Verificación

- Suites focalizadas: 5 suites / 17 tests aprobados (DTO, servicio, controller, migración y PostgreSQL).
- PostgreSQL 17 efímero: migración `up`/`down`, escritura y lectura JSONB, índice/FK y carrera de 20 creaciones; quedaron exactamente 20 filtros y una solicitud concurrente fue rechazada. El contenedor de prueba se detuvo y eliminó al terminar.
- `pnpm exec tsc --noEmit --incremental false`: aprobado.
- `pnpm run build`: aprobado, incluido el control de dependencias runtime.
- ESLint sin autofix en archivos focalizados: aprobado.
- `git diff --check`: aprobado.
- No se ejecutaron `pnpm verify`, suites completas, migraciones de producción ni comandos de Heroku.

## Pendiente

CAT-DISC-6c puede implementar la interfaz contra este contrato. CAT-DISC-6d debe ejecutar la regresión coordinada backend/frontend y cerrar CAT-DISC-6; no forma parte de 6b.
