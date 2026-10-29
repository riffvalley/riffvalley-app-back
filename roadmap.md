# Backend Refactor Roadmap

## Contexto

Roadmap de reorganización progresiva del backend de Riff Valley para mejorar la mantenibilidad, reducir duplicación y coste de consultas cuando haya evidencia, y preservar el comportamiento observable. El detalle se mantiene por área para que cada iteración pueda revisarse sin concentrar toda la planificación en este índice.

## Reglas globales

- Dividir el trabajo en subtareas pequeñas, revisables y reversibles; caracterizar primero el comportamiento y los consumidores afectados.
- No mezclar refactor interno, cambio de contrato y cambio de esquema en una misma tarea.
- Preservar contratos y comportamiento existentes salvo decisión explícita; registrar hallazgos ajenos al alcance sin resolverlos automáticamente.
- Mantener la arquitectura NestJS/TypeORM comprensible y cohesionada; no añadir capas o abstracciones sin una necesidad concreta.
- Corregir únicamente problemas demostrablemente introducidos por la tarea en ejecución. Los hallazgos preexistentes, desconocidos o fuera de alcance se reportan sin corregirlos ni suprimirlos, y sin modificar `.impeccable/config.json` para satisfacer un hook.

## Roadmaps por área

- [Catalog](roadmap/catalog/README.md) — ownership de Catalog y planificación de Discs, Artists, Genres, Countries e integración de Catalog; CAT-DISC-5a (auditoría), 5b (sugerencias) y 5b.1 (filtro exacto por artista en seis modos) completadas; 5c–5d pendientes.
- [MEDIA — Búsqueda y matching musical](roadmap/catalog/music-search-matching.md) — MEDIA-1, MEDIA-2, MEDIA-3a y MEDIA-3b.1–3b.5 completadas; readers Catalog, búsquedas Community de DiscList y sugerencias revisables National Releases usan claves normalizadas con fallback legacy solo para claves NULL; PostgreSQL 17 aislado aprobado. La medición representativa queda en MEDIA-3b.7 ([auditoría](roadmap/catalog/music-search-audit.md), [política](roadmap/catalog/music-search-normalization.md), [diseño SQL](roadmap/catalog/music-search-sql-design.md)); MEDIA-3b.6–3b.8, MEDIA-4–MEDIA-6 y MEDIA-8 pendientes, MEDIA-7 descartada.
- [Community](roadmap/community/README.md) — Comments, Requests, Favorites, Pendings y Rates como capacidades de interacción y contribución al catálogo.
- [Roles](roadmap/roles/README.md) — inventario, contrato de permisos, adaptación progresiva y migración de roles de usuario.
- [Spotify](roadmap/integrations/spotify/README.md) — separación del dominio de la playlist de Riff Valley y la integración con la API externa de Spotify.
- [Integrations](roadmap/integrations/README.md) — agrupación e inventario progresivo de integraciones externas bajo `src/integrations/`.
- [Integrations Cleanup](roadmap/integrations/README.md#integrations-cleanup) — auditoría interna y saneamiento progresivo de las ocho integraciones.
- [Backend Architecture](roadmap/backend-architecture.md) — inventario global de módulos, ownership propuesto, árbol objetivo y plan futuro de reorganización física sin cambios de comportamiento.
- [Backend Cleanup](roadmap/backend-cleanup/README.md) — reglas, inventario global y auditorías de Catalog, Editorial y Communications; [Quality Gates](roadmap/backend-cleanup/quality-gates.md) conserva la norma estructural y BC-QG2. Editorial quedó completado por BC-ED-0 (2026-10-20) y Communications por BC-COM-2 (2026-10-21).
- [NEWS-CACHE-01 — caché del feed público](roadmap/news-feed-cache.md) — análisis y plan para cachear `/api/news/feed` en memoria por proceso, sin implementar todavía.
- [BC-ID-9 — retirada de autenticación legacy](roadmap/backend-cleanup/identity-legacy-retirement.md) — inventario y plan de retirada del login sin negociación, preservando `refresh-v1`.

## Estado de alto nivel

- **Catalog:** completado formalmente por BC-CAT (2026-10-20): QG-1–QG-18 cerradas, cero infracciones en sus tres baselines, `yarn verify` aprobado y C5 confirmado mediante la composición directa de los siete módulos. DIS-F5 y D5 permanecen como decisiones contractuales documentadas, sin bloquear el cierre. Véase el [registro de cierre](roadmap/backend-cleanup/catalog.md).
- **Community:** cerrada (2026-10-05). Migración estructural y saneamiento G.1–G.7 completados; regresión backend y regresión manual frontend completadas sin incidencias. No quedan subtareas pendientes en su roadmap; los desacoplamientos Catalog ↔ Community y Auth → Rate siguen aplazados.
- **Editorial:** completado por BC-ED-0 (2026-10-20). BC-ED-1–10 completados, sin bloqueos activos; Links retirado por BC-LNK-1. Véase el [cierre formal](roadmap/backend-cleanup/editorial/closure.md).
- **Communications:** saneamiento completado por BC-COM-1/2 (2026-10-21); `yarn verify` aprobado y cero deuda en los tres baselines. El hallazgo de interpolación de contenido de usuarios en HTML de correo sin escape permanece pendiente de revisión de seguridad antes de desplegar cambios que afecten a esos correos. Véase la [auditoría y cierre](roadmap/backend-cleanup/communications.md).
- **Roles:** roadmap funcional completado. Backend y frontend desplegados, PostgreSQL usa `users.role` y la secuencia de producción quedó verificada; las comprobaciones adicionales de permisos con cuentas editoriales y administrativas se conservan como observaciones, no como fases obligatorias. Véase [cierre de roles](roadmap/roles/roles.md).
- **Fase 4 — Lists:** administración de listas, integración WordPress y sincronización/publicación de discos; considerar primero los efectos externos.
- **Fase 5 — Festival Playlists:** reglas de playlist e integración externa; revisar selección y sincronización de discos y manejo de errores.
- **Fase 6 — Contents, Articles, News y publicaciones:** workflows editoriales, estados, fechas programadas, versiones y publicación WordPress.
- **Fase 7 — Integraciones externas:** completada (2026-10-14); I.0–I.8 cerradas. Véase [Integrations](roadmap/integrations/integrations.md) para la evidencia y las limitaciones de regresión.
- **Integrations Cleanup:** completada (2026-10-14); IC-0–IC-8 cerradas. Véase [Integrations Cleanup](roadmap/integrations/cleanup.md) para la evidencia y los hallazgos conservados fuera de alcance.
- **Fase 8 — Versions y Asignations:** workflows, estados, asignaciones y transiciones. Requests figuraba históricamente en esta agrupación; su planificación y ownership actuales están en [Community](roadmap/community/README.md).
- **Fase 9 — Auth y módulos restantes:** caracterizar primero el impacto transversal de Auth y ordenar los módulos restantes por uso, duplicación y coste de consultas.

## Notas de organización

La numeración histórica de fases y subtareas se conserva en los documentos de área. `roadmap.md` funciona como índice maestro; las decisiones y criterios específicos permanecen en su roadmap correspondiente.
