# Importador de conciertos y festivales

## CON-B03b — Giras

Implementado en backend como una relación explícita Tour 1:N Event, limitada a conciertos. El modelo, las rutas, la respuesta paginada del detalle, la política de homónimos y la migración están documentados en [domain.md](domain.md). Cada fecha conserva su propio lineup; la selección y el autocompletado entre filas serán parte de la interfaz/importador futuro.

## CON-B03c — Giras en actuaciones de festivales

Implementado en backend. Cada `EventArtist` de festival puede asociarse explícitamente a una gira, manteniendo `Event.tourId` para conciertos. No se introduce `TourArtist` ni se infiere la asociación por artista o nombre. Se admiten artistas no catalogados, se validan referencias y cambios de tipo, y Tour detalle pagina y mezcla conciertos con actuaciones de festival identificadas por artista. Las migraciones Event Domain, Tours y Tour por actuación están aplicadas y verificadas en la base local `SpamMusicDB`; no se ejecutaron en remoto. La integración de `tourId` en el importador queda para CON-B04 y las tareas frontend posteriores.

El endpoint `PATCH /api/events/:eventId/artists/:eventArtistId` permite asociar, cambiar o retirar la gira de una única actuación con `tourId: uuid|null`; requiere `riffvalley` o superior y no modifica el resto del lineup. El endpoint de detalle de Tour devuelve el ID de EventArtist junto a los datos del artista y festival.

### Funcionalidad futura del frontend

**Asociación de giras desde la ficha de un festival.** Mostrar un selector de gira junto a cada artista, permitir buscar y elegir giras existentes y quitar la asociación mediante el PATCH individual. No forma parte de CON-B03c; se abordará con las fichas y funcionalidades de festivales.

## CON-B03 — Dominio de eventos y Venue genérico

Implementado en backend. El modelo, contrato definitivo, auditoría de dominios, política transaccional, permisos y migración están documentados en [domain.md](domain.md). Esta fase establece la API básica, pero no implementa el importador masivo ni modifica el frontend.

## CON-B01 — Resolución de artistas por lotes

**Estado:** completada el 2026-11-01. Implementada en backend; verificaciones unitarias y de calidad ejecutadas.

**Endpoint:** `POST /api/artists/resolve-batch` (lectura pública, misma política de acceso que las lecturas públicas del catálogo).

**Entrada:** `{ "names": ["Architects", "Spiritbox", "Banda Desconocida"] }`.

**Salida:** un elemento por nombre, conservando texto y orden: `{ "results": [{ "name": "Architects", "artist": { "id": "<uuid-real>", "name": "Architects" } }, { "name": "Spiritbox", "artist": { "id": "<uuid-real>", "name": "Spiritbox" } }, { "name": "Banda Desconocida", "artist": null }] }`.

**Coincidencia:** reutiliza `normalizeMusicName` y `compareNormalizedMusicNames` del catálogo. Se ignoran caja, espacios periféricos, formas Unicode compatibles, diacríticos latinos, puntuación y separadores que la normalización actual transforma; se aplican las variantes existentes de artículo inicial inglés. Se buscan claves normalizadas exactas, sin similitud parcial. No hay mecanismo fiable de alias independiente en el modelo actual.

**Ausencias y ambigüedad:** artista inexistente o con más de un candidato normalizado devuelve `artist: null`. No se crean ni actualizan registros.

**Validación:** hasta 100 nombres; cada nombre debe ser texto no vacío después de trim y tener como máximo 100 caracteres. Se permite un array vacío.

**Rendimiento:** una consulta por lote a `artist`, con proyección limitada a `id` y `name`; sin cargar discografía ni catálogo completo. Los nombres repetidos comparten la consulta y conservan su lugar en el resultado. La migración `1792060000000` añade un B-tree parcial en `search_name_normalized` para las búsquedas exactas. No se midió `EXPLAIN ANALYZE` con datos de producción.

### Siguiente tarea

Integrar la resolución con la columna `Lineup` del importador en el frontend. No forma parte de CON-B01.

## VEN-B01 / VEN-B01b — Catálogo de salas y dominio geográfico

El catálogo backend independiente de recintos y la jerarquía `Country → AdministrativeRegion → Locality → Venue` están documentados en [roadmap/venues/README.md](../venues/README.md). VEN-B01b prepara el dominio geográfico y los filtros/mapa; VEN-B02 implementa `POST /api/venues/import-batch`; VEN-B02b reconoce alias de localidad e identidades OSM. CON-B03 añade Venues genéricos de localidad y una API básica de Event. La futura integración del importador deberá enviar nombre y `localityId` a la resolución ordinaria, que continúa excluyendo genéricos como salas físicas.
