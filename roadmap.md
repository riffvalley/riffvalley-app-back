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

- [Catalog](roadmap/catalog.md) — ownership de Catalog y planificación de Discs, Artists, Genres, Countries e integración de Catalog.
- [Community](roadmap/community.md) — Comments, Requests, Favorites, Pendings y Rates como capacidades de interacción y contribución al catálogo.

## Estado de alto nivel

- **Catalog:** C5 declara cerrada la fase de ownership de Catalog (2026-10-04). La planificación detallada de Discs permanece en su documento; su última nota de cierre deja D48 pendiente.
- **Community:** iteración completa planificada; A.1–F.3 no ejecutadas.
- **Fase 4 — Lists:** administración de listas, integración WordPress y sincronización/publicación de discos; considerar primero los efectos externos.
- **Fase 5 — Festival Playlists:** reglas de playlist e integración externa; revisar selección y sincronización de discos y manejo de errores.
- **Fase 6 — Contents, Articles, News y publicaciones:** workflows editoriales, estados, fechas programadas, versiones y publicación WordPress.
- **Fase 7 — Integraciones externas:** TikTok, Spotify, Instagram, WordPress, Scaping, Telegram y LastFM; priorizar límites de API, credenciales, reintentos y efectos externos.
- **Fase 8 — Versions y Asignations:** workflows, estados, asignaciones y transiciones. Requests figuraba históricamente en esta agrupación; su planificación y ownership actuales están en [Community](roadmap/community.md).
- **Fase 9 — Auth y módulos restantes:** caracterizar primero el impacto transversal de Auth y ordenar los módulos restantes por uso, duplicación y coste de consultas.

## Notas de organización

La numeración histórica de fases y subtareas se conserva en los documentos de área. `roadmap.md` funciona como índice maestro; las decisiones y criterios específicos permanecen en su roadmap correspondiente.
