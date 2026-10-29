# CAT-ART-2b — Backend del directorio de artistas

**Estado:** implementación completada el 2026-10-29. CAT-ART-2c/2d y CAT-ART-3/4/5 permanecen pendientes y no se iniciaron.

Las auditorías indicadas como CAT-ART-1 y CAT-ART-2a no estaban disponibles en este checkout. Se revisaron las rutas y servicios actuales de Artist, las entidades Artist/Disc/Genre y la normalización MEDIA-3 en `src/catalog/shared/music-name/normalize-music-name.ts`.

## Endpoint

`GET /api/artists/directory`

Parámetros:

| Parámetro | Tipo    | Default | Regla                                                      |
| --------- | ------- | ------- | ---------------------------------------------------------- |
| `letter`  | string  | `A`     | Uno de `A`–`Z` o `#`; se ignora cuando `q` contiene texto. |
| `q`       | string  | —       | Búsqueda parcial en el catálogo completo.                  |
| `limit`   | integer | `20`    | De 1 a 100.                                                |
| `offset`  | integer | `0`     | Entero desde 0.                                            |

Respuesta:

```json
{
  "totalItems": 1,
  "totalPages": 1,
  "currentPage": 1,
  "limit": 20,
  "data": [
    {
      "id": "uuid",
      "name": "Artist",
      "genre": "Metal",
      "genreColor": "#123456"
    }
  ]
}
```

`genre` y `genreColor` son `null` si el artista no tiene discos, si su disco más reciente no tiene género o si el género no tiene color. No se incluyen otros campos.

## Clasificación, consulta y orden

Se reutiliza la clave `search_name_normalized` de MEDIA-3 y su fallback existente a `name_normalized` para filas sin clave nueva. La clave musical aplica normalización Unicode, por lo que `Á → A`, `Ö → O` y `Ñ → N`. Los artículos iniciales no se eliminan: `The ...` se clasifica bajo T. Los nombres cuyo primer carácter alfabético visible no es una letra se clasifican bajo `#`, incluidos símbolos y números.

Sin `q`, la letra se filtra en PostgreSQL antes del conteo y la paginación. Con `q`, se aplica la búsqueda textual normalizada a todo el catálogo, sin combinarla con `letter`. La página se ordena por clave normalizada con collation `C`, nombre original con collation `C` e ID ascendente.

La lectura usa dos consultas SQL constantes (conteo y página), más una subconsulta lateral correlacionada que obtiene el género del último disco por relación `disc."artistId" = artist.id`; no hace consultas por artista. El último disco se elige por `releaseDate DESC NULLS LAST`, y en fechas iguales por `disc.id ASC`. Así, un disco sin fecha no desplaza a uno fechado; si todos carecen de fecha, gana el ID menor.

No se necesita migración nueva: se reutilizan columnas y relaciones existentes. La consulta requiere que el esquema que ejecute el backend contenga `artist.search_name_normalized` de MEDIA-3; esta tarea no aplicó migraciones ni inspeccionó producción.

## Compatibilidad, detalles y permisos

`GET /api/artists` mantiene intactos su handler, paginación y respuesta. Las rutas administrativas de creación, edición, borrado y borrado de huérfanos conservan sus guards `riffvalley`; no se expone escritura nueva.

`GET /api/artists/:id/details` ya devuelve la discografía completa asociada por Artist ID. Cada disco contiene los campos de Disc cargados por TypeORM, género (`id`, `name`, `color`), cantidad y media de valoraciones; la respuesta incluye además datos básicos del artista, país y novedades nacionales. El orden actual es `releaseDate DESC`; PostgreSQL coloca actualmente los `NULL` primero por defecto y no hay desempate explícito. Se preservó sin cambios para no alterar el contrato de la ficha. La ruta no declara `@Auth()`.

### Contract finding

**Current behavior:** `GET /artists`, `GET /artists/management` y `GET /artists/:id/details` no declaran `@Auth()` en el controlador actual; sí lo declaran las escrituras administrativas con `riffvalley`.

**Problem:** el contexto de CAT-ART-1/2a describe `/artists` como gestión con rol `riffvalley`, pero ese permiso no aparece en el código disponible.

**Impact:** backend + frontend.

**Options:** preservar el código actual; auditar/ajustar permisos en una tarea explícita; coordinar una migración de cliente y permisos.

**Recommendation:** preservar este contrato en CAT-ART-2b y confirmar el permiso esperado en una auditoría posterior, porque los documentos referidos no estaban en el checkout.

**Blocks the current task:** No; el endpoint nuevo es de solo lectura y no modifica la ruta administrativa ni sus escrituras.

## Verificación

- Pruebas unitarias focalizadas: 44 tests en 4 suites aprobados.
- Prueba PostgreSQL aislada: implementada y protegida para la base local `riffvalley_catalog_test_20261015`; no se pudo ejecutar en esta sesión porque PostgreSQL no respondía en `127.0.0.1:55432` y no estaban configuradas sus credenciales de prueba.
- Typecheck (`tsc --noEmit --incremental false`): aprobado.
- Build (`pnpm run build`): aprobado.
- ESLint focalizado (`--no-fix`): aprobado.
- `git diff --check` y comprobación de los enlaces Markdown del roadmap: aprobados.
- No se ejecutaron suites completas, E2E, `pnpm verify`, producción ni inspecciones visuales.
