# Backend Cleanup

## Navegación de la migración documental

Este índice conserva el objetivo, las reglas, el procedimiento y el inventario global de módulos. Las auditorías de Catalog están en [catalog.md](catalog.md). Editorial se organiza por responsabilidad:

### Editorial

- [Articles, Asignations y Lists](editorial/articles-asignations-lists.md) — auditorías, BC-LST-11 e historial relacionado.
- [Videos y Contents](editorial/videos-contents.md) — BC-LNK-1 y auditorías de Videos y Contents.
- [Reunions, Points y Playlists](editorial/reunions-playlists.md) — auditorías y ownership de estas capacidades editoriales.
- [National Releases](editorial/national-releases.md) — auditoría BC-NR e historial asociado.
- [Cierre de Editorial](editorial/closure.md) — BC-ED-0, BC-ED-9 y BC-ED-10; Editorial completado formalmente tras confirmar que no hay bloqueos pendientes.

Las normas transversales y el plan BC-QG2 están en [Quality Gates](quality-gates.md). BC-ED-0 cierra Editorial sin cambiar el estado de otros dominios.

### Community

- [Cierre de Community](community.md) — BC-COMM-0–9 completadas; saneamiento verificado, cero entradas Community en los tres baselines y riesgos contractuales diferidos documentados (2026-10-21).

### Communications

- [Mail](communications.md) — BC-COM-1/2 completados; el hallazgo de seguridad HTML sigue pendiente.

## Objetivo y alcance

Auditar progresivamente los módulos del backend después de completar Backend Architecture. Esta fase revisa responsabilidades, dependencias, calidad, consultas, contratos y pruebas; convierte solo los problemas demostrados en tareas pequeñas y verificables. La reorganización física ya cerrada no se reabre por defecto.

La planificación es incremental. Se trabaja en un dominio cada vez y no se auditan todos los módulos de antemano. El primer dominio es Catalog y el primer módulo revisado es Artists. El roadmap registra auditorías, decisiones, tareas pendientes y hallazgos históricos que requieren clasificación futura.

La auditoría no implementa mejoras. En tareas posteriores se cambia únicamente aquello que quede expresamente incluido en la tarea activa.

## Reglas generales de intervención

- No modificar código de producción, tests ni fixtures durante una auditoría. La auditoría puede leer tests existentes, pero no añadirlos ni corregirlos.
- Conservar los cambios locales presentes en el checkout. La evidencia se refiere al estado observado y distingue modificaciones locales de comportamiento anterior cuando se puede.
- No corregir hallazgos preexistentes, de atribución desconocida o fuera del alcance de la tarea activa.
- No crear abstracciones sin una responsabilidad concreta, no dividir servicios por tamaño y no introducir DDD u otras capas por obligación.
- No mezclar cambios de implementación, cambios de contrato y cambios de esquema. Los bugs funcionales se planifican aparte de las refactorizaciones arquitectónicas.
- Preservar contratos observables como rutas, permisos, validación, payloads, relaciones, orden, paginación, errores y efectos secundarios salvo decisión explícita.
- Tratar relaciones eager como parte observable de la respuesta hasta identificar sus consumidores. No retirarlas durante una limpieza sin caracterización y carga explícita equivalente.
- Revisar la SQL con evidencia antes de optimizarla. No añadir índices por intuición; medir con parámetros y datos representativos.
- No ejecutar migraciones, seeds ni operaciones contra PostgreSQL, APIs u otros servicios reales durante las auditorías.
- No modificar `.impeccable/config.json` para silenciar hallazgos.
- Cuando la evidencia sugiera una mejora de contrato, registrar comportamiento actual, consumidores conocidos, impacto backend/frontend, opciones y recomendación. No iniciar una migración contractual o tarea cross-repository automáticamente.

## Procedimiento por módulo

1. Leer el módulo completo: controllers, DTOs, entidades, servicios, helpers, providers y composición Nest.
2. Localizar consumidores directos en producción: imports, repositorios/entidades inyectados, llamadas a servicios, relaciones y composición en `AppModule`.
3. Revisar responsabilidades y dependencias; identificar ciclos, dependencias de otros dominios, acceso directo a entidades externas y límites entre módulos.
4. Revisar validaciones, tipos, errores, duplicación demostrable, código muerto, consultas y complejidad accidental.
5. Leer las pruebas existentes pertinentes y compararlas con rutas, permisos, casos límite y payloads. No ejecutarlas salvo que una tarea de implementación posterior lo pida; tampoco modificarlas durante la auditoría.
6. Separar hechos comprobados de hipótesis. Registrar los hechos con archivo/línea y efecto concreto; dejar las hipótesis como investigación pendiente y no convertirlas en tareas de corrección.
7. Crear tareas solo cuando exista beneficio demostrado. Priorizar XS/S; dividir M/L cuando los pasos puedan cerrar sin estados intermedios incorrectos.
8. Actualizar el estado del módulo. «Auditado» significa que la revisión terminó, no que sus tareas estén implementadas.

### Registro de hallazgos

Cada hallazgo incluye identificador estable, ubicación, evidencia, problema/consecuencia, categoría (`arquitectura`, `calidad`, `testing` o `bug funcional`), prioridad (`alta`, `media`, `baja`), tamaño (`XS`, `S`, `M`, `L`), propuesta, dependencias y riesgos. Se indica explícitamente si la evidencia es un hecho o una hipótesis.

### Criterios de módulo auditado

Un módulo queda **auditado** cuando:

- se leyó su implementación completa y se identificaron sus consumers directos conocidos;
- se revisaron endpoints, permisos, DTOs y relaciones observables aplicables;
- se consultaron las pruebas existentes y se documentaron huecos relevantes, sin añadir pruebas;
- cada finding tiene evidencia y clasificación, o se documenta por qué no justifica una tarea;
- sus tareas futuras tienen alcance, exclusiones, dependencias, aceptación, verificaciones y tamaño;
- no se ejecutó ningún cambio de producción como parte de la auditoría.

Un módulo queda **completado** solo después de cerrar todas las tareas aprobadas de su revisión, documentar verificaciones y riesgos pendientes, y comprobar que no quedan tareas activas de ese módulo. «Completado» no significa que todo hallazgo histórico o contractual haya sido resuelto.

## Orden inicial y estado

La secuencia se amplía después de cada dominio; no constituye una orden para auditar todos los módulos a la vez. Los 40 módulos funcionales identificados por Backend Architecture aparecen con su estado actual en las tablas siguientes y en los cierres enlazados. AppModule y archivos de arranque no se consideran módulos funcionales.

| Orden | Dominio                   | Módulos previstos                                                                                                                | Estado                                                                                                                                                                  |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Catalog                   | Artists, Countries, Genres, Discs, CatalogImport, CatalogOverview, LastfmCatalog                                                 | **Completado** por BC-CAT (2026-10-20); QG-1–QG-18 completadas, cero entradas Catalog en los tres baselines y `yarn verify` aprobado                                    |
| 2     | Community                 | Comments, Favorites, Pendings, Rates, Requests                                                                                   | **Completado** por BC-COMM-9 (2026-10-21); cero deuda Community en los tres baselines y `yarn verify` aprobado en [community.md](community.md)                              |
| 3     | Editorial                 | Articles, Asignations, Contents, SpotifyPlaylists, Links, Lists, NationalReleases, Points, Reunions, RiffValleyPlaylists, Videos | **Completado** por BC-ED-0; diez módulos activos completados, Links retirado por BC-LNK-1, BC-ED-1–10 completados y cero infracciones editoriales en los tres baselines |
| 4     | Product                   | News, Suggestions, Versions                                                                                                      | Pendiente                                                                                                                                                               |
| 5     | Identity                  | Auth, AccessRequests                                                                                                             | Pendiente                                                                                                                                                               |
| 6     | Integrations              | CloudflareR2, Instagram, LastfmIntegration, SMTP, Spotify, Telegram, TikTok, WordPress                                           | Pendiente                                                                                                                                                               |
| 7     | Platform / Infrastructure | I18n, Seeds, Uploads                                                                                                             | Pendiente                                                                                                                                                               |
| 8     | Communications            | Mail                                                                                                                             | **Completado** por BC-COM-1/2 (2026-10-21); cero deuda en los tres baselines y `yarn verify` aprobado. Hallazgo de seguridad HTML pendiente.                            |

### Estado detallado por módulo

Estados válidos: **pendiente**, **auditado**, **en cleanup**, **completado** y **retirado** (módulo eliminado del producto, no cleanup completado). Solo cambia al avanzar explícitamente por una auditoría o tarea aprobada.

| Dominio                   | Módulo              | Estado     |
| ------------------------- | ------------------- | ---------- |
| Catalog                   | Artists             | completado |
| Catalog                   | Countries           | completado |
| Catalog                   | Genres              | completado |
| Catalog                   | Discs               | completado |
| Catalog                   | CatalogImport       | completado |
| Catalog                   | CatalogOverview     | completado |
| Catalog                   | LastfmCatalog       | completado |
| Community                 | Comments            | completado |
| Community                 | Favorites           | completado |
| Community                 | Pendings            | completado |
| Community                 | Rates               | completado |
| Community                 | Requests            | completado |
| Editorial                 | Articles            | completado |
| Editorial                 | Asignations         | completado |
| Editorial                 | Contents            | completado |
| Editorial                 | SpotifyPlaylists    | completado |
| Editorial                 | Links               | retirado   |
| Editorial                 | Lists               | completado |
| Editorial                 | NationalReleases    | completado |
| Editorial                 | Points              | completado |
| Editorial                 | Reunions            | completado |
| Editorial                 | RiffValleyPlaylists | completado |
| Editorial                 | Videos              | completado |
| Product                   | News                | pendiente  |
| Product                   | Suggestions         | pendiente  |
| Product                   | Versions            | pendiente  |
| Identity                  | Auth                | pendiente  |
| Identity                  | AccessRequests      | pendiente  |
| Integrations              | CloudflareR2        | pendiente  |
| Integrations              | Instagram           | pendiente  |
| Integrations              | LastfmIntegration   | pendiente  |
| Integrations              | SMTP                | pendiente  |
| Integrations              | Spotify             | pendiente  |
| Integrations              | Telegram            | pendiente  |
| Integrations              | TikTok              | pendiente  |
| Integrations              | WordPress           | pendiente  |
| Platform / Infrastructure | I18n                | pendiente  |
| Platform / Infrastructure | Seeds               | pendiente  |
| Platform / Infrastructure | Uploads             | pendiente  |
| Communications            | Mail                | completado |

**Composición y cierre de Catalog (2026-10-20):** `AppModule` importa directamente sus siete módulos funcionales: `ArtistsModule`, `CountriesModule`, `GenresModule`, `DiscModule`, `CatalogImportModule`, `CommonModule` (overview) y `LastfmModule`. Esta composición satisface C5; no se necesita un `CatalogModule` agregador. Las dependencias cruzadas de servicios se expresan mediante imports/exports Nest concretos, en particular `DiscModule` para Last.fm, Editorial Contents y el bootstrap standalone. BC-CAT cerró formalmente Catalog después de completar QG-1–QG-18 y verificar los tres baselines y `yarn verify`; véase el [registro de cierre](catalog.md).
