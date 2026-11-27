# Catálogo de salas y recintos

## CON-B03 — Venue genérico para eventos

`Venue.isGeneric` separa puntos genéricos de localidad de espacios reales. Los recintos existentes e importados mantienen `false` por defecto. Un Venue genérico es administrado por `VenuesService.getOrCreateGenericVenue(localityId, manager?)`, usa el nombre canónico de Locality, no guarda coordenadas físicas y se crea/reutiliza solo cuando Event se persiste. Los índices parciales garantizan unicidad por localidad para genéricos y mantienen deduplicación por nombre normalizado + localidad para recintos físicos. Listados físicos, mapa, importación y resolución ordinaria excluyen genéricos. El CRUD no permite modificarlos, trasladarlos o borrarlos.

La migración `1792090000000-CreateEventDomain` contiene el ajuste de Venue junto con el dominio Event. Detalle en [CON-B03](../concerts-festivals/domain.md).

## VEN-B01b — Normalización geográfica con AdministrativeRegion

Estado: implementado en backend; migración y carga inicial preparadas, sin ejecutar.

El modelo definitivo es **Country → AdministrativeRegion → Locality → Venue**. Se reutiliza la entidad `Country`; `AdministrativeRegion` representa una comunidad/ciudad autónoma, región, estado o división equivalente. `Locality` conserva sus coordenadas y el campo de texto opcional `province`; `Venue` mantiene únicamente su FK a `Locality` y puede guardar coordenadas más precisas.

- `AdministrativeRegion` tiene nombre y nombre normalizado, país obligatorio, código opcional y auditoría. La identidad del nombre normalizado y la unicidad del código se limitan al país. No hay endpoint de borrado; la FK restrictiva impide perder regiones con localidades.
- `Locality` pertenece a una región; no copia el país. Su identidad de base de datos combina región + nombre normalizado + provincia normalizada. En la resolución, si se omite provincia se reutiliza una única coincidencia de la región; nombres homónimos en varias provincias se rechazan como ambiguos. La normalización solo pliega mayúsculas, acentos y espacios, no puntuación.
- La API permite localidades internacionales. No se crean provincias ni catálogos nacionales completos.
- `GET /api/administrative-regions` admite `countryId`, `query`, `limit` y `offset`; `GET /api/administrative-regions/:id` consulta el detalle; `POST` y `PATCH` requieren `riffvalley` o superior. El país de una región queda fijado al crearla.
- `POST /api/localities/resolve` acepta `name`, `administrativeRegionId` (preferente) y `province` opcional; alternativamente admite `administrativeRegion` + `countryId`. Si se aportan ID de región y país, deben coincidir. Solo crea/recupera localidad y consulta Nominatim cuando faltan coordenadas.
- `GET /api/venues` conserva filtros existentes y añade `administrativeRegionId`; también admite localidad y país. `GET /api/venues/map` devuelve ID, nombre, tipo, localidad, provincia, región, país, coordenadas efectivas y precisión. Venue prevalece sobre Locality y ninguna de estas consultas llama a Nominatim ni genera consultas N+1.
- La limitación global de Nominatim (1 petición/segundo) y su atribución se mantienen; el flujo actual de nombres y su política de alias se especifican en VEN-B02b.
- `pnpm run seed:spanish-regions` sincroniza idempotentemente las 17 comunidades y dos ciudades autónomas sobre el registro España ya existente. Usa códigos INE `01`–`19` ([fuente oficial del INE](https://www.ine.es/en/daco/daco42/codmun/cod_ccaa_en.htm)); nunca crea un Country ni consulta Nominatim. Revisa la configuración de base de datos antes de ejecutarlo.

### Migración VEN-B01b

La migración `1792070000000-CreateVenueCatalog` incluye el esquema final. Una consulta previa de solo lectura a Heroku (`ddddmrfqbqstju`, 2026-11-02) no encontró su nombre en el ledger; esa base no se modificó en esta tarea.

El 2026-11-02 se aplicaron en la base local `SpamMusicDB` (contenedor `spammusicdb`, PostgreSQL 17) las 13 migraciones que mostraba pendientes el ledger, de `CreateAuthSessionPersistence1791950000000` a `CreateVenueCatalog1792070000000`. Se ejecutaron en una transacción. `db:status` y `db:check` posteriores confirmaron cero pendientes; una consulta de solo lectura confirmó las tablas geográficas y de Venue, el índice único `UQ_venues_locality_name_normalized` y las columnas de las migraciones anteriores. El ledger registra 106 aplicadas frente a 105 migraciones compiladas: incluye la entrada histórica `UpdateListStatusEnum1766066905027`, cuyo archivo no está en este checkout. No se verificaron otros entornos.

### Contratos y límites conocidos

La respuesta de Venue carga su jerarquía geográfica (localidad → región → país). La proyección ligera del mapa evita exponer entidades completas. La asociación de conciertos queda fuera de este dominio por ahora.

## VEN-B01 — Auditoría inicial

Auditoría realizada antes de implementar, el 2026-11-01.

Las decisiones de modelado y contrato de este apartado reflejan el diseño original de VEN-B01; la jerarquía y el contrato geográfico vigentes quedan sustituidos por VEN-B01b, descrito arriba.

- No existen entidades ni módulos de `Venue`, `Locality`, ciudad, provincia o ubicación. Tampoco se encontraron coordenadas, cliente de geolocalización ni llamadas a Nominatim en `src/`.
- `src/catalog/countries/entities/country.entity.ts` ofrece una entidad `Country` reutilizable con ID UUID, nombre y código ISO opcional. No contiene países precargados ni divisiones administrativas. Se reutilizará como país de cada localidad; no se creará un catálogo paralelo.
- No existe una estructura internacional reutilizable para localidad/provincia. `Locality` guardará el nombre de municipio, una división administrativa opcional en texto (provincia/estado/región según el país), el país relacionado y coordenadas opcionales. La deduplicación incluirá país, división y nombre normalizados.
- Artistas almacenan su imagen como URL nullable; no hay un flujo común de subida que aplique a recintos. `Venue.image` será nullable.
- Los módulos de catálogo usan entidades TypeORM en `entities/`, DTOs en `dto/`, specs bajo `__tests__/`, controladores con `@Auth(ValidRoles.riffvalley)` para escrituras y paginación `limit/offset`. El prefijo global `/api`, la validación global y `synchronize: false` / `migrationsRun: false` ya están configurados.
- La jerarquía verificada es `user < collaborator < riffvalley < superadmin`. Se usará `riffvalley` como mínimo editorial para crear, editar y borrar; las consultas de catálogo seguirán el patrón de lectura existente (sin exigir rol).
- La migración se añadirá como una migración TypeORM nueva, sin tocar historial. No se ejecutará contra una base de datos en esta tarea.

## Decisiones iniciales de VEN-B01 (históricas)

- `Venue` tendrá relación obligatoria a `Locality`; país y división administrativa se consultan mediante esa relación y no se copian en cada recinto.
- Las coordenadas del recinto prevalecen sobre las de la localidad. Las proyecciones de mapa indicarán `venue`, `locality` o `unavailable` como precisión.
- Nominatim solo se consultará mediante una operación explícita para resolver coordenadas de una localidad. Los listados, detalles y mapa no harán peticiones externas.
- La limitación de una petición por segundo se coordina mediante un advisory lock de PostgreSQL compartido y una fila persistente con el instante de llamada. El lock se mantiene durante la espera y la petición, y la marca de tiempo se confirma antes de salir a la red; cubre varias instancias Heroku y reinicios. La espera por el lock vence a los 10 segundos; si se supera o la coordinación no está disponible, la geolocalización falla de forma controlada.
- La URL base y el identificador HTTP del cliente serán configuración. El resultado se cacheará en `Locality`; la respuesta indicará atribución OpenStreetMap.
- La identidad local normaliza Unicode (descomposición de acentos), espacios y mayúsculas y combina país + división administrativa + nombre. No se fuerza unicidad por nombre de recinto; se detectarán candidatos potencialmente duplicados por nombre normalizado y localidad.
- La eliminación de localidades con recintos asociados se impedirá con FK restrictiva. La eliminación de recintos se permite solo mientras no existan asociaciones; se documenta que futuros eventos deberán bloquear el borrado.

## Contratos actuales de catálogo

`GET /api/venues` se pagina con `limit/offset` y permite buscar por nombre y filtrar por localidad, provincia, región (`administrativeRegionId`), país (`countryId`), tipo y estado. `GET /api/venues/:id`, `POST /api/venues`, `PATCH /api/venues/:id`, `DELETE /api/venues/:id` y `GET /api/venues/map` mantienen los contratos de VEN-B01. `POST /api/venues/resolve-batch` recibe pares `{name, localityId}` y devuelve `venue: null` si no hay coincidencia exacta normalizada dentro de esa localidad. Las escrituras de recintos y la resolución/geocodificación de localidades requieren `riffvalley` o superior; las lecturas de catálogo siguen el patrón abierto existente.

`POST /api/localities/resolve` requiere región por ID o nombre + país y acepta provincia opcional. Responde con el estado de geocodificación `cached`, `geocoded`, `not_found`, `ambiguous` o `unavailable`; si no encuentra coordenadas fiables conserva la localidad para permitir un reintento. La proyección de mapa paginada contiene ID, nombre, tipo, localidad, provincia, región, país, coordenadas efectivas y precisión (`venue`, `locality`, `unavailable`). No consulta Nominatim.

Las respuestas de mapa y geolocalización incluyen atribución visible `© OpenStreetMap contributors` y enlace a los derechos de autor; los datos derivados siguen la licencia ODbL. La implementación sigue la [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).

La FK de Venue a Locality y de Locality a AdministrativeRegion es `RESTRICT`; la región también protege la referencia a Country. No existe todavía una asociación a conciertos, así que el borrado de un recinto es posible mientras no haya FK de eventos; cuando se añada, los eventos deberán impedir el borrado físico o migrarse explícitamente. No hay unicidad por nombre global: el nombre normalizado es único dentro de la localidad.

## VEN-B02 — Importación masiva por localidad

Estado: implementada en backend. No requiere migración adicional.

`POST /api/venues/import-batch` requiere rol mínimo `riffvalley`. Recibe `{ "localityId": "<uuid>", "venues": [{ "name": "Sala Ejemplo", "type": "concert_hall" }] }`. `localityId` debe existir; no se crea ni geocodifica una localidad durante la operación. Cada fila solo requiere nombre y admite `type` opcional (por defecto `concert_hall`). Se admiten de 1 a 100 filas; la forma del cuerpo, el UUID y el tamaño del lote son errores generales HTTP 400. Las filas se validan independientemente y las inválidas se devuelven como `failed`.

La respuesta tiene `summary` (`total`, `created`, `existing`, `duplicates`, `failed`) y `results` en orden original, cada una con `index`, `name`, `status`, y `venueId` cuando se pudo resolver. Los estados son `created`, `existing`, `duplicate_in_batch` y `failed`; las filas fallidas incluyen un mensaje de validación o error de persistencia.

La deduplicación usa `normalizeGeography` (acentos, mayúsculas y espacios) y el par localidad + `nameNormalized`, sin similitud aproximada ni cruces entre localidades. Una consulta agrupada carga los existentes antes de escribir. La restricción única PostgreSQL `UQ_venues_locality_name_normalized` sigue siendo la autoridad ante concurrencia; cada inserción es una escritura individual y atómica, y un conflicto 23505 se resuelve consultando el registro exacto para responder `existing`. Los datos/tipo de un recinto existente nunca se actualizan. Las filas repetidas en el mismo lote se marcan como `duplicate_in_batch` y apuntan al mismo ID cuando la primera fila se creó o reutilizó.

La normalización y persistencia central se comparte con `POST /api/venues`. El futuro importador de conciertos podrá resolver la localidad y reutilizar los mismos criterios sin acoplar este módulo al dominio de conciertos. La importación no llama a Nominatim.

## VEN-B02b — Alias y resolución inteligente de localidades

Estado: implementado en backend; migración creada y pendiente de aplicación fuera de esta tarea. No se ejecutó en producción ni en otras bases remotas.

`Locality.name` sigue siendo el nombre canónico de Riff Valley. `LocalityAlias` guarda nombres alternativos en `locality_aliases`, asociados a una sola localidad, con forma normalizada, idioma opcional y tipo `linguistic` o `alternate`. `old_name`, códigos y otros campos de Nominatim no se importan como alias. Se aceptan `name:<idioma>` y `alt_name` (incluida su variante lingüística) solo cuando la ficha candidata ya coincide con la localidad, región y país requeridos. Nominatim recibe `namedetails=1` y `accept-language` configurable (`NOMINATIM_ACCEPT_LANGUAGE`, por defecto `es,ca,eu,gl`). Se realiza una única consulta bajo el mismo limitador global; se mantiene la atribución OSM y el uso queda sujeto a su [política pública](https://operations.osmfoundation.org/policies/nominatim/) y ODbL.

`POST /api/localities/resolve` busca primero el nombre principal dentro de la región y provincia indicadas; si no hay coincidencia, busca alias normalizados dentro de esa misma región/provincia. Una única coincidencia reutiliza el mismo ID sin llamar al proveedor si ya hay coordenadas. Varias candidatas devuelven HTTP 201 (el estado de éxito habitual del POST) con `locality: null` y `geocoding.status: "ambiguous"`, incluso para nombres principales homónimos sin provincia. Las localidades homónimas en regiones diferentes no se cruzan. No se usa similitud textual.

Si hace falta Nominatim, el resultado debe identificar de forma única la localidad y traer `osm_type` y `osm_id` válidos. Antes de persistir coordenadas/identidad, se consulta ese par global: una identidad ya guardada reutiliza la localidad existente cuando la fila actual es nueva/provisional. La restricción única `UQ_localities_osm_reference` es la autoridad ante carreras; el conflicto concurrente se recupera consultando la identidad ganadora. Si el nombre ya existía como entidad independiente, una identidad OSM perteneciente a otra fila devuelve HTTP 400 para revisión manual; no fusiona ni borra datos previos. Una identidad incompatible entre regiones o provincias también devuelve HTTP 400 controlado. No se usa `place_id` ni coordenadas como identidad. Si el proveedor falla o no puede demostrar una coincidencia, se conserva el comportamiento anterior y la localidad queda disponible para reintento, sin fusión heurística.

La denominación introducida se guarda como alias cuando Nominatim resuelve una identidad cuya localidad canónica ya existe. Los alias de proveedor se guardan después de validar identidad y contexto. Los alias importados solo son únicos por localidad; el mismo texto puede coincidir con el nombre principal de otra localidad, y la búsqueda principal tiene precedencia. Si varios alias son compatibles con el contexto, la API responde ambiguo y no elige uno.

Operación administrativa (mínimo `riffvalley`): `POST /api/localities/:id/aliases` recibe `{name, language?, kind?}`; `DELETE /api/localities/:id/aliases/:aliasId` retira solo el alias. El alta normaliza, valida longitud/idioma, es idempotente ante repetición y rechaza otra asociación de alias que produzca ambigüedad en la misma región/provincia. Nunca cambia el nombre canónico ni elimina la localidad.

La migración `1792080000000-CreateLocalityAliases` añade tabla e índices sin backfill ni fusión de registros. No se hizo inventario de duplicados existentes ni se aplicó la migración; registros históricos potencialmente duplicados requieren revisión manual.

### Contratos conservados

El endpoint de Venue y `POST /api/venues/import-batch` mantienen su contrato: importan por `localityId` existente y no resuelven ni crean localidades. La respuesta habitual de `/localities/resolve` conserva `{locality, geocoding, attribution?}`; la nueva respuesta ambigua local conserva `locality: null` y `geocoding.status: "ambiguous"`. No se modificó el frontend.

Las pruebas focalizadas cubren validación general y por fila, valores predeterminados, resultados ordenados, deduplicación local/global, preservación de fichas existentes y recuperación ante una carrera de índice único. No se ejecutó una base PostgreSQL real como parte de las pruebas unitarias.

## Tareas posteriores

- **VEN-F02 — Importador visual de salas.** Siguiente tarea del roadmap; consumirá el catálogo y resolución de localidad ya preparados.
- Interfaz administrativa de salas y recintos.
- Fichas públicas.
- Mapa interactivo con Leaflet y agrupación de marcadores que compartan coordenadas.
- Integración de Venue con el importador de conciertos.
- Asociación de conciertos con recintos.
- Estadísticas e historial de eventos por recinto.
- Integración futura del importador de conciertos con la resolución exacta de Venue por localidad.
