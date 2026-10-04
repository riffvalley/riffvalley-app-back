# D0 — Baseline de Discs

Este inventario describe el estado leído antes de cualquier refactor. El prefijo global de la API es `/api`; las rutas de la tabla se expresan bajo ese prefijo.

## Rutas y permisos actuales

`@Auth()` aplica `AuthGuard()` de Passport y `UserRoleGuard`. Sin roles enumerados, el segundo guard permite cualquier usuario autenticado. `@GetUser()` obtiene `request.user`. No hay guards a nivel de controller.

| Método y ruta | Servicio | Auth / guards | Parámetros y validación relevante |
| --- | --- | --- | --- |
| `POST /api/discs` | `create` | Pública | `CreateDiscDto` en body; validación global |
| `POST /api/discs/with-artist` | `createWithArtist` | JWT + `UserRoleGuard`, cualquier rol autenticado | `CreateDiscWithArtistDto` en body |
| `GET /api/discs/weekly` | `findWeekly` | Pública | `WeeklyQueryDto` en query |
| `GET /api/discs/random` | `findRandom` | JWT + `UserRoleGuard`, cualquier rol autenticado; usuario por `@GetUser()` | `RandomQueryDto` en query |
| `GET /api/discs/options` | `findOptions` | JWT + `UserRoleGuard`, cualquier rol autenticado | `OptionsQueryDto` en query |
| `GET /api/discs/date` | `findAllByDate` | JWT + `UserRoleGuard`, cualquier rol autenticado; usuario por `@GetUser()` | `PaginationDto` en query |
| `GET /api/discs/date/public` | `findAllByDatePublic` | Pública | `PaginationDto` en query |
| `GET /api/discs/date/public/filters` | `getPublicFilters` | Pública | Sin parámetros |
| `GET /api/discs/homeDiscs` | `findTopRatedOrFeaturedAndStats` | JWT + `UserRoleGuard`, cualquier rol autenticado; usuario por `@GetUser()` | `TopStatsQueryDto` en query; también pasa `genreId` |
| `GET /api/discs` | `findAll` | JWT + `UserRoleGuard`, cualquier rol autenticado; usuario por `@GetUser()` | `PaginationDto` en query |
| `GET /api/discs/:id` | `findOne` | Pública | `ParseUUIDPipe` para `id` |
| `GET /api/discs/:id/spotify-tracks` | `getSpotifyTracks` | Pública | `ParseUUIDPipe` para `id` |
| `PATCH /api/discs/:id` | `update` | Pública | `ParseUUIDPipe` para `id`; `UpdateDiscDto` en body |
| `DELETE /api/discs/:id` | `remove` | Pública | `ParseUUIDPipe` para `id` |

La validación global activa `transform`, conversión implícita, `whitelist` y `forbidNonWhitelisted`. Los parámetros de ruta solo declaran `ParseUUIDPipe` donde aparece indicado.

## Defaults y semántica DTO relevantes

- `PaginationDto` no declara defaults de clase. `findAll` usa `limit = 10` y `offset = 0`; `offset` se convierte a número, pero el DTO no le aplica `@IsInt` ni mínimo. `limit` debe ser positivo y tampoco tiene máximo. `orderBy` es texto libre a nivel DTO. `dateRange` y otros rangos convierten arrays a fechas, requieren al menos dos elementos y el servicio de `findAll` solo usa `dateRange` si su longitud es exactamente dos.
- `RandomQueryDto.limit` usa el default de servicio `5`, acepta positivos hasta `50`; `OptionsQueryDto.limit` usa el default `3`, acepta positivos hasta `10`.
- `RandomQueryDto` y `OptionsQueryDto` transforman `ep`/`debut` únicamente para los literales `true` y `false`. Ausencia queda como `undefined`; los valores explícitos `false` se conservan.
- `WeeklyQueryDto` requiere mes entre 1–12 y año desde 2020; `week` es opcional y, si llega, debe estar entre 1–4.
- `TopStatsQueryDto` hereda `PaginationDto`; `genreId` valida UUID versión 4. `country` y `countryId` son strings opcionales.
- Los flags del DTO de creación son opcionales. La entidad `Disc` inicializa `verified`, `ep`, `debut`, `featured` y `pinned` a `false`; `createWithArtist` establece además `ep` y `debut` a `false` si faltan.

## Relaciones y migraciones

- `Disc.artist` y `Disc.genre` son `ManyToOne` eager. `Artist.country` también es eager. `Disc.favorites`, `Disc.pendings` y `Disc.comments` son colecciones `OneToMany` eager. `Disc.rates` y `Disc.asignations` no son eager.
- `findOne` usa `findOneByOrFail` y devuelve la entidad, por lo que las relaciones eager forman parte del payload observable de ese método. Los consumidores de cada colección requieren clasificación en D39 antes de cualquier cambio de eager loading.
- Migraciones directas relevantes: `1765977651750-AddDebutToDisc` añade `disc.debut` nullable; `1781877565339-AddPinnedToDisc` añade `disc.pinned` con `NOT NULL DEFAULT false`; `1774700000000-CascadeDeleteDiscOnArtist` cambia la FK `disc.artistId` a `ON DELETE CASCADE`; `1774460022329-AddDiscToNationalRelease` añade `national_release.discId` nullable con FK hacia `disc.id` y `ON DELETE NO ACTION`.
- No se encontró en `src/migrations` una migración que cree la tabla base `disc`; su creación precede al historial de cambios revisado. La migración `1758355724537-SyncEntities.ts` no es un baseline de tablas: añade `artist.name_normalized` y el índice GIN trigram `artist_name_normalized_trgm_idx`, usado indirectamente por búsquedas de artista. No se hizo análisis de índices D45.

## Hallazgos contractuales

### Hallazgo: permisos distintos en rutas de escritura

**Current behavior:** `POST /discs/with-artist` exige autenticación, mientras que `POST /discs`, `PATCH /discs/:id` y `DELETE /discs/:id` no declaran `@Auth()`.

**Problem:** Las mutaciones tienen una política de acceso inconsistente en el controller.

**Impact:** Backend-only.

**Options:**

1. Preserve compatibility: dejar los permisos actuales mientras se caracteriza Discs.
2. Refactor internally: no resuelve la diferencia de acceso.
3. Change the contract: aplicar una política explícita a las rutas de escritura en una tarea independiente.
4. Coordinate a backend/frontend refactor: no parece necesario salvo que se confirme un cambio en el uso de estas rutas.

**Recommendation:** Preservar en D0 y evaluar los permisos en una tarea independiente con decisión explícita; este baseline no permite inferir si el acceso público es intencional.

**Blocks the current task:** No; D0 registra la política sin cambiarla.

### Hallazgo: relaciones eager expuestas por `findOne`

**Current behavior:** La entidad carga eager `artist`, `genre`, `favorites`, `pendings` y `comments`; `Artist.country` también es eager. `findOne` devuelve la entidad cargada.

**Problem:** Una lectura por ID incluye relaciones y colecciones completas aunque el caller solo solicite un disco. Su coste crece con favorites, pendings y comments; no se han confirmado aquí los consumidores de esas colecciones.

**Impact:** Backend + frontend, pendiente de confirmar los consumidores.

**Options:**

1. Preserve compatibility: mantener las relaciones en la respuesta hasta clasificar consumidores.
2. Refactor internally: cargar explícitamente relaciones necesarias y demostrar payload idéntico antes de retirar eager.
3. Change the contract: reducir las relaciones expuestas en una tarea contractual independiente si no tienen consumidor.
4. Coordinate a backend/frontend refactor: usar proyecciones como `favoriteId`, `pendingId` o `commentCount` si los consumidores requieren esos datos y no las colecciones.

**Recommendation:** Mantener compatibilidad y seguir la secuencia D39–D44; una proyección requeriría confirmar y posiblemente adaptar consumidores frontend.

**Blocks the current task:** No; D0 solo registra el comportamiento y el coste potencial.

## Alcance de specs D0

Los specs comprueban el montaje de dependencias, los errores básicos de lookup, una delegación de servicio que usa usuario autenticado y la identidad de la respuesta del servicio. No caracterizan todavía las queries ni los contratos específicos asignados a D1–D38.
