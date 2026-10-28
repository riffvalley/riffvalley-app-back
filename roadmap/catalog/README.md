# Catalog

Índice local de planificación y registros de Catalog. Los documentos y la evidencia están organizados aquí tras completar el corte 1.

**Estado:** Catalog completado formalmente por BC-CAT el 2026-10-20. La evolución independiente de DiscList se registra en [Roadmap de Catalog](catalog.md); CAT-DISC-3b define sus contratos y CAT-DISC-3c registra la implementación backend. Las verificaciones de cierre BC-CAT están en [Backend Cleanup — Catalog](../backend-cleanup/catalog.md).

## Estado de TopDiscs

C-TOP-7 completada; TopDiscs **COMPLETADO Y CERRADO**. La ruta oficial `/topDiscs` devuelve hasta 11 discos. La ruta legacy `/homeDiscs` conserva por separado el comportamiento anterior y su límite de 20 hasta que se retire.

## Documentos actuales

- [Roadmap de Catalog](catalog.md) — ownership, planificación de Artists, Countries, Genres, Import, Last.fm Catalog, Overview y Discs. Conserva decisiones, tareas e historial.
- [MEDIA — Búsqueda y matching musical](music-search-matching.md) — MEDIA-1, MEDIA-2, MEDIA-3a y MEDIA-3b.1–3b.3 completadas; migración/backfill validados con fixtures sintéticos en PostgreSQL temporal aislado; ninguna base persistente modificada; [auditoría](music-search-audit.md), [política de normalización](music-search-normalization.md), [diseño SQL](music-search-sql-design.md); MEDIA-3b.4–3b.8, MEDIA-4–MEDIA-6 y MEDIA-8 pendientes, MEDIA-7 descartada por decisión del usuario.
- [CAT-DISC-3b — Contratos de DiscList](cat-disc-3b-contratos-disc-list.md) — arquitectura de fachada, DTOs, tipos, ownership y seguridad.
- [CAT-DISC-3c — Implementación backend de DiscList](cat-disc-3c-implementacion-disc-list.md) — fachada, endpoint autenticado, lectores propietarios y verificaciones.
- [CAT-DISC-3d — Opciones dinámicas de DiscList](cat-disc-3d-opciones-disc-list.md) — endpoint autenticado, opciones por modo y usuario, filtros cruzados y validación PostgreSQL aislada.
- [CAT-DISC-4c.1a — Auditoría de medios y elegibilidad](catalog-discs-media-eligibility-audit.md) — investigación documental de Spotify, Bandcamp, persistencia de portadas/enlaces y la regla OR; CAT-DISC-4c.1b queda como implementación posible posterior.
- [Regresión de Catalog del 2026-10-15](regression-2026-10-15.md) — registro histórico de pruebas de integración y recomendaciones pre-merge.
- [Evidencia: selector de archivo bloqueado](regression-evidence/excel-selector-blocked.jpg) — captura asociada al informe de regresión.
- [C-TOP-8 — Auditoría estadística de TopDiscs](c-top-8-auditoria-estadistica-topdiscs.md) — fórmula, universo estadístico, simulaciones reproducibles y recomendación; sin cambios de producción. Su estado de C-TOP-7 refleja la fecha histórica del informe; la tarea quedó completada después.
- [C-TOP-9 — Evaluación de un modelo bayesiano estable](c-top-9-validacion-bayesiana.md) — comparación de priors y k, simulación con aserciones y propuesta de validación; sin cambios productivos.
- [C-TOP-10 — Implementación bayesiana estable de TopDiscs](c-top-10-implementacion-bayesiana-topdiscs.md) — modelo aprobado con prior por voto, `k = 4`, deduplicación determinista y elegibilidad estadística separada de `pinned`.
- [C-TOP-11 — Validación PostgreSQL del modelo bayesiano TopDiscs](c-top-11-validacion-postgresql-topdiscs.md) — pruebas SQL sobre PostgreSQL 17.10 aislado en Docker, verificación del ranking oficial, filtros y planes con fixtures sintéticos. La nota de corrección registra la restauración independiente de `/homeDiscs`.

## Destinos previstos

Destinos actuales tras el corte 1: `roadmap/catalog/catalog.md`, `roadmap/catalog/regression-2026-10-15.md` y `roadmap/catalog/regression-evidence/excel-selector-blocked.jpg`.

## Auditoría transversal relacionada

- [Auditorías de Catalog en Backend Cleanup](../backend-cleanup/catalog.md) — evidencia técnica por módulo, complementaria a este roadmap.
- [Índice Backend Cleanup](../backend-cleanup/README.md) — método, inventario global y navegación a Catalog y Editorial.
- [Quality Gates de Backend Cleanup](../backend-cleanup/quality-gates.md) — norma estructural y registro BC-QG2; Editorial se completó por BC-ED-0, con cero infracciones editoriales en los baselines.
