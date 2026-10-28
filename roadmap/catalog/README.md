# Catalog

Índice local de planificación y registros de Catalog. Los documentos y la evidencia están organizados aquí tras completar el corte 1.

**Estado:** Catalog completado formalmente por BC-CAT el 2026-10-20. El historial de ownership y las decisiones contractuales se conservan en [Roadmap de Catalog](catalog.md); las verificaciones de cierre están en [Backend Cleanup — Catalog](../backend-cleanup/catalog.md).

## Documentos actuales

- [Roadmap de Catalog](catalog.md) — ownership, planificación de Artists, Countries, Genres, Import, Last.fm Catalog, Overview y Discs. Conserva decisiones, tareas e historial.
- [Regresión de Catalog del 2026-10-15](regression-2026-10-15.md) — registro histórico de pruebas de integración y recomendaciones pre-merge.
- [Evidencia: selector de archivo bloqueado](regression-evidence/excel-selector-blocked.jpg) — captura asociada al informe de regresión.
- [C-TOP-8 — Auditoría estadística de TopDiscs](c-top-8-auditoria-estadistica-topdiscs.md) — fórmula, universo estadístico, simulaciones reproducibles y recomendación; sin cambios de producción. C-TOP-7, regresión visual, continúa pendiente.
- [C-TOP-9 — Evaluación de un modelo bayesiano estable](c-top-9-validacion-bayesiana.md) — comparación de priors y k, simulación con aserciones y propuesta de validación; sin cambios productivos. C-TOP-7 continúa pendiente e independiente.
- [C-TOP-10 — Implementación bayesiana estable de TopDiscs](c-top-10-implementacion-bayesiana-topdiscs.md) — modelo aprobado con prior por voto, `k = 4`, deduplicación determinista y elegibilidad estadística separada de `pinned`.
- [C-TOP-11 — Validación PostgreSQL del modelo bayesiano TopDiscs](c-top-11-validacion-postgresql-topdiscs.md) — pruebas SQL sobre PostgreSQL 17.10 aislado en Docker, verificación de deduplicación/elegibilidad/filtros y planes `EXPLAIN (ANALYZE, BUFFERS)` con fixtures sintéticos. C-TOP-7 permanece pendiente.

## Destinos previstos

Destinos actuales tras el corte 1: `roadmap/catalog/catalog.md`, `roadmap/catalog/regression-2026-10-15.md` y `roadmap/catalog/regression-evidence/excel-selector-blocked.jpg`.

## Auditoría transversal relacionada

- [Auditorías de Catalog en Backend Cleanup](../backend-cleanup/catalog.md) — evidencia técnica por módulo, complementaria a este roadmap.
- [Índice Backend Cleanup](../backend-cleanup/README.md) — método, inventario global y navegación a Catalog y Editorial.
- [Quality Gates de Backend Cleanup](../backend-cleanup/quality-gates.md) — norma estructural y registro BC-QG2; Editorial se completó por BC-ED-0, con cero infracciones editoriales en los baselines.
