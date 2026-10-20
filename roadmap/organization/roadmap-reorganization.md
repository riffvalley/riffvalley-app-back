# BC-ROADMAP-1 — Inventario y propuesta de reorganización

**Fecha de referencia:** 2026-10-20
**Rama inspeccionada:** `refactor/editorial`
**Alcance:** planificación documental únicamente. No se han movido ni editado documentos previos.

## Resumen del inventario

`roadmap/` contiene 17 documentos Markdown de origen (1.914.185 bytes y 10.331 líneas en total), una carpeta de evidencia y una imagen JPEG de 55.749 bytes. El índice maestro está fuera de esa carpeta, en `roadmap.md`. Los tamaños son exactos al momento del inventario; “aprox.” se usa en la tabla para facilitar lectura. Este documento de planificación se excluye del total inventariado.

La distribución observada al levantar este inventario era plana: 17 documentos Markdown en la raíz, con solo `catalog-regression-evidence/` como subcarpeta. Tras completar los cortes 0 y 1, algunos documentos ya están agrupados bajo índices locales. Los grupos funcionales originales eran Catalog (1 roadmap), Community (1), Roles (7), Spotify (3), Integrations (2), arquitectura transversal (1), saneamiento transversal (1) y una auditoría de regresión histórica (1). La documentación de Editorial aparece sobre todo dentro de `backend-cleanup.md`.

| Responsabilidad actual | Documentos |
|---|---:|
| Roles | 7 |
| Spotify | 3 |
| Integrations (incluido cleanup) | 2 |
| Catalog (roadmap y auditoría de regresión) | 2 |
| Community | 1 |
| Arquitectura backend | 1 |
| Saneamiento backend transversal (`backend-cleanup.md`) | 1 |
| **Total** | **17** |

Por estado predominante, 10 son documentos de áreas o fases completadas que conservan evidencia, 3 son registros principalmente históricos y 4 son mixtos (arquitectura, cleanup, Catalog y contrato de Roles). Esta clasificación no equivale a borrar o archivar historial: los documentos completados también contienen decisiones vigentes y relaciones necesarias.

## Inventario documento por documento

En “entradas” se enumeran referencias encontradas en `AGENTS.md`, `README.md`, `roadmap.md`, `CLAUDE.md`, `docs/**/*.md` y otros documentos de `roadmap/`; la búsqueda se hizo por nombre de archivo, además de revisar enlaces y menciones en el índice. Una referencia de auditoría puede ser textual o histórica y no necesariamente un enlace Markdown activo.

| Ruta actual | Tamaño / líneas | Propósito y responsabilidad | Estado observado | Relaciones entrantes; relaciones salientes y solapamiento |
|---|---:|---|---|---|
| `roadmap/backend-architecture.md` | ≈96 KB / 484 | Inventario de módulos, ownership, dependencias, árbol objetivo y traslados estructurales NestJS. | Mixto: BA-1–BA-14.B constan cerradas; conserva decisiones, evidencias y límites históricos. | Entradas: `roadmap.md`, `backend-cleanup/README.md`, `backend-cleanup/catalog.md` y `backend-cleanup/quality-gates.md`. Salientes: roadmaps Catalog, Community e Integrations. Se cruza con Backend Cleanup al identificar módulos, pero uno trata ownership físico y el otro saneamiento interno. |
| `roadmap/backend-cleanup/README.md` | ≈12 KB / 128 | Objetivo, reglas generales, procedimiento, orden e inventario de los 40 módulos. | Activo como índice y guía global; registra cierres de Catalog y mantiene Editorial abierto en sus documentos. | Entradas: `AGENTS.md`, `roadmap.md`, README Catalog. Salidas a Catalog, Editorial y Quality Gates. |
| `roadmap/backend-cleanup/catalog.md` | ≈177 KB / 1.015 | Auditorías de Catalog desde Artists hasta Discs, con hallazgos, tareas y evidencia BC-CAT. | Mixto: tareas cerradas y Discs en cleanup; conserva todo el historial de Catalog. | Entradas: índice Backend Cleanup, índice/roadmap Catalog y Architecture. Enlaza a Catalog y Architecture; no sustituye sus planes de ownership. |
| `roadmap/backend-cleanup/editorial/articles-asignations-lists.md` | ≈161 KB / 919 | Auditorías de Articles, Asignations y Lists, BC-LST-11 e historial relacionado. | Mixto; incluye trabajo completado y decisiones/hallazgos históricos. | Entrada desde el índice Backend Cleanup; enlaza con las otras partes editoriales. Conserva IDs y auditorías del puente original. |
| `roadmap/backend-cleanup/editorial/videos-contents.md` | ≈91 KB / 474 | BC-LNK-1 y auditorías de Videos y Contents. | Mixto; conserva cierres e historial. | Entrada desde el índice Backend Cleanup; enlaza con Articles/Lists y Reunions/Playlists. |
| `roadmap/backend-cleanup/editorial/reunions-playlists.md` | ≈132 KB / 462 | Auditorías y ownership de Reunions, Points y playlists editoriales. | Mixto; conserva decisiones e historial. | Entrada desde el índice Backend Cleanup; enlaza con Videos/Contents y National Releases. |
| `roadmap/backend-cleanup/editorial/national-releases.md` | ≈36 KB / 185 | Auditoría BC-NR e historial de National Releases. | Mixto; conserva tareas, decisiones y estados registrados. | Entrada desde el índice Backend Cleanup; enlaza con Reunions/Playlists y Cierre de Editorial. |
| `roadmap/backend-cleanup/editorial/closure.md` | ≈73 KB / 301 | BC-ED-0, BC-ED-9, BC-ED-10, trabajo pendiente y criterios de cierre. | Activo y mixto; Editorial permanece expresamente abierto. | Entrada desde el índice Backend Cleanup; enlaza a `quality-gates.md` para la norma transversal. |
| `roadmap/backend-cleanup/quality-gates.md` | ≈22 KB / 100 | Norma estructural obligatoria de NestJS y Quality Gate; plan completo BC-QG2. | Mixto: BC-QG2 completado, mantiene reglas generales vigentes e historial. | Entradas: `roadmap.md`, `AGENTS.md`, Architecture, índices Backend Cleanup y Catalog; enlaces a README y Cierre Editorial. |
| `roadmap/catalog/regression-2026-10-15.md` (antes `roadmap/catalog-regression-2026-10-15.md`) | ≈117 KB / 717 | Registro de regresión pre-merge de Catalog: ramas, pruebas, DB, migraciones, riesgos y recomendación operativa, con evidencia visual. | Histórico, fechado; conserva decisiones y evidencia de una rama concreta. | Índice entrante: `roadmap/catalog/README.md`. Enlaza a `regression-evidence/excel-selector-blocked.jpg` y al cierre de Roles; menciona `backend-cleanup.md`. Solapa con pruebas/cierres de Catalog y Roles, pero aporta fotografía de integración propia. |
| `roadmap/catalog/catalog.md` (antes `roadmap/catalog.md`) | ≈282 KB / 2.100 | Ownership de Catalog y planificación/cierre detallado de Artists, Countries, Genres, Import, Last.fm Catalog, Overview y Discs. | Mixto: ownership y varias fases constan cerrados; conserva decisiones contractuales y trabajo pendiente/histórico de Discs y otros módulos. | Entradas: índice local, `backend-architecture.md`, `backend-cleanup/catalog.md` y `roadmap/integrations/spotify/inventory.md`; el índice maestro llega vía `roadmap/catalog/README.md`. Salientes a `backend-cleanup/catalog.md`, Architecture e inventario Spotify. Solapa con las auditorías Catalog de `backend-cleanup/catalog.md`; sus decisiones y D-tasks no deben fusionarse ni sustituirse. |
| `roadmap/community/community.md` (antes `roadmap/community.md`) | ≈68 KB / 462 | Plan y registro de reorganización/saneamiento de Comments, Requests, Favorites, Pendings y Rates. | Completado (2026-10-05), con decisiones diferidas conservadas. | Entradas: `roadmap.md` mediante `roadmap/community/README.md`, y `docs/architecture/community-inventory.md`. `backend-architecture.md` describe el cierre sin citar ruta. Salidas al inventario de arquitectura y al documento de inventario comunitario. Solapamiento bajo; el documento de `docs/` complementa A.1. |
| `roadmap/integrations/cleanup.md` (antes `roadmap/integrations-cleanup.md`) | ≈63 KB / 295 | Auditoría y saneamiento de módulos de proveedores externos, con hallazgos por proveedor. | Completado IC-0–IC-8 (2026-10-14); conserva hallazgos fuera de alcance. | Entradas: `roadmap.md`, `backend-architecture.md`. Se relaciona con Integrations y Spotify; el primero define agrupación/traslados y este registra saneamiento de proveedores. |
| `roadmap/integrations/integrations.md` (antes `roadmap/integrations.md`) | ≈45 KB / 260 | Ownership, inventario y migración de integraciones externas a `src/integrations/`. | Completado I.0–I.8 (2026-10-14); se conservan criterios y recomendaciones. | Entradas: `roadmap.md`, `backend-architecture.md`, `roadmap/integrations/spotify/roadmap.md`. Salida a Spotify S.9. Solapa parcialmente con `roadmap/integrations/cleanup.md`, con focos distintos: ubicación y agrupación frente a auditoría interna. |
| `roadmap/roles/contract.md` (antes `roadmap/roles-contract.md`) | ≈48 KB / 214 | Contrato jerárquico vigente de roles, permisos y decisiones históricas supersedidas. | Mixto: contrato implementado; apéndices conservan diseño multirol y decisiones históricas. | Entradas: `roles/roles.md`, `roles/inventory.md`, `roles/endpoints-audit.md`, `roles/frontend-contract.md`. Salidas a auditorías, contrato frontend y producción. Complementa `roles/roles.md`; repite parte de las matrices que los inventarios congelan en su fecha. |
| `roadmap/roles/endpoints-audit.md` (antes `roadmap/roles-endpoints-audit.md`) | ≈179 KB / 452 | Auditoría y regresión de autorización/rutas, con matriz cuantitativa y cambios R.14. | Completado R.14a–R.14f; asuntos fuera de alcance siguen como observaciones. | Entradas: `backend-architecture.md`, `roles/roles.md`, `roles/contract.md`, `roles/frontend-contract.md`. Tiene grandes matrices históricas y resultados actuales; se cruza con `roles/contract.md` en permisos, pero el propósito es auditoría de endpoints. |
| `roadmap/roles/frontend-contract.md` (antes `roadmap/roles-frontend-contract.md`) | ≈23 KB / 158 | Contrato HTTP de Auth/roles para consumidores frontend y estado de adopción. | Completado; frontend y backend desplegados según su registro. | Entradas: `roles/roles.md`, `roles/contract.md`, `roles/endpoints-audit.md`, `roles/migration-preflight.md`, `roles/production-deployment.md`. Solapa en reglas de rol, pero registra el contrato y coordinación frontend. |
| `roadmap/roles/inventory.md` (antes `roadmap/roles-inventory.md`) | ≈43 KB / 165 | Inventario R.1 del modelo multirol previo: fuentes, endpoints, autorizaciones y riesgos. | Histórico; R.1 completada y el modelo quedó supersedido. | Entradas: `roles/roles.md`, `roles/contract.md`, `roles/endpoints-audit.md`. Evidencia de partida deliberadamente histórica; parte de las matrices se repite en la auditoría final. |
| `roadmap/roles/migration-preflight.md` (antes `roadmap/roles-migration-preflight.md`) | ≈56 KB / 320 | Preflight local y pruebas efímeras de migración del diseño de rol único; decisiones operativas previas. | Histórico; el registro declara que producción/postflight se completaron después. | Entradas: `backend-architecture.md`, `roles/roles.md`, `roles/frontend-contract.md`, `roles/production-deployment.md`. Complementa, no reemplaza, el cierre de producción. Conserva estados antiguos supersedidos. |
| `roadmap/roles/production-deployment.md` (antes `roadmap/roles-production-deployment.md`) | ≈76 KB / 526 | Preflight, secuencia de corte, migración PostgreSQL y cierre del despliegue de roles. | Completado el 2026-10-14; evidencia operativa histórica. | Entradas: `roles/roles.md`, `roles/contract.md`, `roles/frontend-contract.md`, `roles/migration-preflight.md`, y auditoría de Catalog. Principal fuente de evidencia de producción; debe seguir enlazada desde el roadmap de Roles. |
| `roadmap/roles/roles.md` (antes `roadmap/roles.md`) | ≈46 KB / 232 | Índice del proyecto de roles, tareas R.* y resultados del contrato singular. | Completado, con historia de subtareas y planes reemplazados. | Entradas: `roadmap.md`, documentos auxiliares de Roles. Enlaza a `roles/inventory.md`, `roles/contract.md`, `roles/migration-preflight.md`, `roles/frontend-contract.md` y `roles/production-deployment.md`. Es el documento guía del conjunto, no un duplicado de los anexos. |
| `roadmap/integrations/spotify/classification.md` (antes `roadmap/spotify-classification.md`) | ≈10 KB / 65 | Clasificación/ownership de referencias Spotify y resultado de S.3–S.6. | Completado e histórico. | Entradas: `roadmap/integrations/spotify/roadmap.md`, `roadmap/integrations/spotify/inventory.md`, `backend-architecture.md`. Complementa el inventario y el roadmap; conservar decisiones S.*. |
| `roadmap/integrations/spotify/inventory.md` (antes `roadmap/spotify-inventory.md`) | ≈35 KB / 198 | Inventario técnico de persistencia, módulos, rutas, servicios, configuración y consumidores Spotify. | Completado e histórico (S.1). | Entradas: `roadmap/integrations/spotify/roadmap.md`, `roadmap/integrations/spotify/classification.md`, `backend-architecture.md`. Complementa clasificación; hay referencias también desde `catalog/catalog.md`. No debe confundirse playlist local con integración externa. |
| `roadmap/integrations/spotify/roadmap.md` (antes `roadmap/spotify.md`) | ≈25 KB / 145 | Roadmap de separación de playlist local e integración Spotify, con fases S.1–S.9. | Completado; conserva tareas y registros históricos. | Entradas: `roadmap.md`, `roadmap/integrations/integrations.md`, `roadmap/integrations/spotify/classification.md` e `roadmap/integrations/spotify/inventory.md`. Principal índice del conjunto Spotify y dependencia documental de Integrations. |

### Evidencia no Markdown

| Ruta | Tamaño / líneas | Propósito y estado | Relaciones |
|---|---:|---|---|
| `roadmap/catalog/regression-evidence/excel-selector-blocked.jpg` (antes `roadmap/catalog-regression-evidence/excel-selector-blocked.jpg`) | 55.749 bytes / no aplica | Captura probatoria de la regresión de Catalog del 2026-10-15; histórica. | Enlazada desde `regression-2026-10-15.md` y `README.md`; permanece junto al informe. |

## Índices y referencias existentes

- `roadmap.md` es el índice maestro actual. Enlaza Catalog, Community, Roles, Spotify, Integrations, Integrations Cleanup y Backend Cleanup mediante sus índices locales, y enlaza directamente Backend Architecture; además resume los estados de área y conserva numeración histórica de fases.
- `AGENTS.md` enlaza a `roadmap/backend-cleanup/README.md` para el inventario de 40 módulos y a `roadmap/backend-cleanup/quality-gates.md` para los criterios transversales y BC-QG2; conserva las cifras históricas de 201 infracciones (46 Editorial y 155 resto). Editorial está organizado bajo `roadmap/backend-cleanup/editorial/` y permanece abierto.
- `README.md` no contiene referencias a documentos de `roadmap/`; su única mención de roadmap en búsquedas no lleva a esos documentos. `CLAUDE.md` no contiene referencias a los documentos inventariados.
- `docs/architecture/community-inventory.md` enlaza ahora a `roadmap/community/community.md`; el enlace se actualizó al ejecutar el corte 2.
- El informe histórico conserva sus referencias al backend cleanup y al cierre de Roles. El corte 1 trasladó el informe y la evidencia, actualizó sus menciones de ruta y corrigió el enlace de la imagen a `regression-evidence/excel-selector-blocked.jpg` relativo al informe.
- Las referencias entre los roadmaps de Catalog, Roles, Spotify, Integrations y Architecture son numerosas y aparecen en la tabla documento por documento. Cada corte de ejecución debe buscar tanto enlaces Markdown como menciones de ruta en texto/código; los paths que documentan estado histórico de código se preservan como evidencia salvo que la referencia al propio documento cambie.

## Evaluación de solapamientos

1. **Backend Cleanup frente a roadmaps de área:** es el mayor solapamiento. Registra auditorías, hallazgos, decisiones y ejecuciones para Catalog y Editorial; `catalog.md`, `community.md`, Roles, Spotify e Integrations conservan sus propios IDs y cierres. En la reorganización, separar físicamente por dominio y enlazar evidencia relacionada; no fusionar tareas ni borrar una versión porque parezca repetida.
2. **Arquitectura frente a Cleanup:** ownership/movimiento físico vs. cohesión, contratos y saneamiento interno. Se relacionan y pueden citarse; no forman una sola planificación.
3. **Integrations frente a Integrations Cleanup y Spotify:** Integrations define ownership y traslado de proveedores; Cleanup audita implementación; Spotify contiene el trabajo específico previo y su historial. Mantenerlos separados con índices cruzados.
4. **Roles:** `roles/roles.md` dirige; `roles/inventory.md` congela la base; `roles/contract.md` fija el modelo vigente y supersede el modelo multirol; `roles/endpoints-audit.md` fija el alcance R.14; `roles/migration-preflight.md` y `roles/production-deployment.md` conservan evidencia de preparación/corte; `roles/frontend-contract.md` fija el contrato consumidor. Los estados pasados contradictorios son deliberados y no se reescriben.
5. **Catalog y reporte de regresión:** comparten componentes e información del branch/pre-merge, pero el reporte es evidencia temporal de integración, no una fase de Catalog. Mantener histórico y mover su imagen de forma conjunta.

## Estructura propuesta

Conservar `roadmap.md` como puerta de entrada en la raíz del repositorio. Dentro de `roadmap/`, usar una carpeta por responsabilidad real, índices `README.md` solo cuando un conjunto tenga varios documentos y una subcarpeta de organización para el propio plan. La siguiente es la ubicación objetivo, no un cambio ejecutado por este documento:

```text
roadmap/
  organization/
    roadmap-reorganization.md
  backend-architecture.md
  backend-cleanup/
    README.md
    catalog.md
    editorial/
      articles-asignations-lists.md
      videos-contents.md
      reunions-playlists.md
      national-releases.md
      closure.md
    quality-gates.md
  catalog/
    README.md
    catalog.md
    regression-2026-10-15.md
    regression-evidence/
      excel-selector-blocked.jpg
  community/
    README.md
    community.md
  roles/
    README.md
    roles.md
    contract.md
    endpoints-audit.md
    frontend-contract.md
    inventory.md
    migration-preflight.md
    production-deployment.md
  integrations/
    README.md
    integrations.md
    cleanup.md
    spotify/
      README.md
      roadmap.md
      inventory.md
      classification.md
```

Los índices de Community y Backend Cleanup aportan navegación entre documentos/partes; Roles e Integrations tienen suficientes documentos para índice local. Catalog recibe índice porque agrupa su roadmap y un informe histórico con evidencia. Spotify es subcarpeta de Integrations por ownership actual de proveedor, y su README hará explícito que el historial también cubre el dominio propio `RiffValleyPlaylist`. `backend-architecture.md` permanece en la raíz como informe transversal único hasta que exista otro documento que justifique una carpeta propia; no se crea un directorio con un solo archivo por estética.

### División propuesta de `backend-cleanup.md`

Ubicación definitiva: `roadmap/backend-cleanup/`. El índice conservará objetivo general, reglas, procedimiento, criterios, orden/estado de módulos y vínculos a cada parte. El contenido de auditoría se trasladará íntegro, en cortes por dominio, conservando IDs, texto, tablas, estados, dependencias, decisiones, hallazgos y comprobaciones.

| Documento de destino | Secciones actuales a trasladar (rangos de encabezados de origen) | Responsabilidad |
|---|---|---|
| `backend-cleanup/README.md` | `## Objetivo y alcance` hasta `## Orden inicial y estado` (líneas 3–114) | Reglas y método global, inventario de estado por módulo y navegación. Evitar duplicar el texto fuente: moverlo literalmente y añadir enlaces. |
| `backend-cleanup/catalog.md` | `## Auditoría 1 — Catalog / Artists` hasta antes de `## Auditoría 2 — Editorial / Articles` (líneas 115–1125) | Artists, Countries, Genres, CatalogImport, LastfmCatalog, CatalogOverview y Discs (BC-CAT). |
| `backend-cleanup/editorial/articles-asignations-lists.md` | Auditoría de Articles, Asignations, Lists, hallazgos históricos, BC-LST-11 y cierre histórico BC-0 (líneas 1126–2040) | Primer grupo de responsabilidades Editorial; no renumerar la histórica “Auditoría 2”. |
| `backend-cleanup/editorial/videos-contents.md` | BC-LNK-1, Videos y Contents (líneas 2041–2510) | Links, Videos y Contents; preservar orden e identificadores. |
| `backend-cleanup/editorial/reunions-playlists.md` | Reunions/Points y Playlists (líneas 2511–2968) | Reuniones, puntos y playlists editoriales, incluyendo auditorías y ownership. |
| `backend-cleanup/editorial/national-releases.md` | BC-NR-0 hasta antes de BC-ED-0 (líneas 2969–3149) | Auditoría y tareas de National Releases. |
| `backend-cleanup/editorial/closure.md` | BC-ED-0, incluidos BC-ED-9 y BC-ED-10 (líneas 3150–3461) | Estado abierto de Editorial, hallazgos, trabajo pendiente y saneamiento de Editorial. Editorial permanece abierto. |
| `backend-cleanup/quality-gates.md` | Sección “Norma estructural obligatoria y Quality Gate del backend”, temporalmente conservada en `editorial/closure.md` tras el corte 6, más BC-QG2 desde el puente | Material transversal de Quality Gates. En el corte 7 mover íntegramente la subsección desde `closure.md` y BC-QG2 desde el puente; no duplicar sus cuerpos. |

Los rangos son referencias de lectura a la versión del 2026-10-20; al ejecutar se usarán encabezados y límites de sección, no offsets rígidos. La división evita inventar capas de código: solo refleja ownership existente y la responsabilidad transversal del gate.

## Plan de migración en cortes pequeños

Cada corte futuro será documental, reversible y revisable por separado. En cada uno se comparará el antes/después por contenido e IDs; mover equivale a copiar literalmente y retirar la fuente solo tras comparar. Los cambios de enlaces ocurren en el corte correspondiente. Las rutas que describen versiones históricas del código no se “corrigen” como si fueran enlaces rotos.

| Corte | Archivos de origen → destino | Referencias que actualizar | Verificaciones |
|---|---|---|---|
| 0. Preparar navegación — **completado (2026-10-20)** | Creados los índices: `catalog/README.md`, `community/README.md`, `roles/README.md`, `integrations/README.md`, `integrations/spotify/README.md` y `backend-cleanup/README.md`; `roadmap.md` se mantiene como índice maestro. | `roadmap.md` enlaza a los índices actuales; cada índice apunta a documentos existentes. Los destinos de cortes futuros se documentan como texto y no sustituyen enlaces funcionales. | Enlaces relativos comprobados en los 6 índices y `roadmap.md`; los 17 documentos originales siguen accesibles; los índices incluyen los documentos previstos; `git diff --check` pasa. Editorial sigue abierto. |
| 1. Catalog y regresión — **completado (2026-10-20)** | Movidos `roadmap/catalog.md` → `roadmap/catalog/catalog.md`, `roadmap/catalog-regression-2026-10-15.md` → `roadmap/catalog/regression-2026-10-15.md` y `roadmap/catalog-regression-evidence/excel-selector-blocked.jpg` → `roadmap/catalog/regression-evidence/excel-selector-blocked.jpg`. | Actualizados `roadmap.md` (mediante el índice local), `roadmap/catalog/README.md`, `backend-architecture.md`, `backend-cleanup.md`, `integrations/spotify/inventory.md` y las menciones/enlaces internos del informe. | Comparación de integridad de los dos documentos y hash de la imagen; búsqueda global de rutas; enlaces relativos e imagen verificados; Prettier en los índices y rangos editados, y `git diff --check` pasan. El check de Prettier de documentos completos informa diferencias en tablas de seis documentos largos; también aparecen en las copias originales de Catalog y del informe. No se reformatearon para preservar el contenido y limitar los cambios a las rutas. Sin cambios de tareas ni identificadores. |
| 2. Community — **completado (2026-10-20)** | Movido `roadmap/community.md` → `roadmap/community/community.md`; contenido idéntico. | Actualizados `roadmap/community/README.md`, `roadmap.md` y `docs/architecture/community-inventory.md`. Se buscó `roadmap/backend-architecture.md`; describe el estado de Community pero no contiene una ruta al documento que requiriera cambio. | Comparación SHA-256 antes/después; búsqueda global de ruta anterior; enlaces Markdown y referencias entrantes verificados; Prettier focalizado y `git diff --check` pasan. Estados A./G. sin cambios; Editorial sigue abierto. |
| 3. Roles — **completado (2026-10-20)** | Movidos `roles.md` → `roles/roles.md`, `roles-contract.md` → `roles/contract.md`, `roles-endpoints-audit.md` → `roles/endpoints-audit.md`, `roles-frontend-contract.md` → `roles/frontend-contract.md`, `roles-inventory.md` → `roles/inventory.md`, `roles-migration-preflight.md` → `roles/migration-preflight.md` y `roles-production-deployment.md` → `roles/production-deployment.md`. | Actualizados `roadmap.md`, `backend-architecture.md`, reporte Catalog, `.agents/skills/database-migrations/references/project-context.md`, índice local y enlaces/menciones entre los siete documentos. | Comparación original/trasladado admitiendo solo rutas; IDs R./P., tablas, estados, matriz y registro de producción conservados; grafo de enlaces entre Roles y referencias entrantes verificados; búsqueda global de rutas anteriores; Prettier focalizado y `git diff --check`. Editorial sigue abierto; corte 4 completado y corte 5 pendiente. |
| 4. Spotify e Integrations — **completado (2026-10-20)** | Movidos `integrations.md` → `integrations/integrations.md`, `integrations-cleanup.md` → `integrations/cleanup.md`, `spotify.md` → `integrations/spotify/roadmap.md`, `spotify-inventory.md` → `integrations/spotify/inventory.md` y `spotify-classification.md` → `integrations/spotify/classification.md`. | Actualizados `roadmap.md`, índices locales, `backend-architecture.md`, `catalog/catalog.md`, documentos de Roles si los referían, referencias entrantes y enlaces cruzados Integrations/Spotify. | Comparación de los cinco documentos con ajustes solo de rutas; identificadores S./I./IC., estados, dependencias, decisiones e historial conservados; distinción `RiffValleyPlaylist`/proveedor Spotify y separación del cleanup preservadas; enlaces y rutas verificadas; Prettier focalizado y `git diff --check`. Editorial sigue abierto; corte 5 pendiente. |
| 5. Backend Cleanup: cabecera y Catalog — **completado (2026-10-20)** | Extraída la cabecera, objetivo, reglas, procedimiento e inventario de módulos a `backend-cleanup/README.md`; trasladadas las auditorías de Artists a Discs a `backend-cleanup/catalog.md`; `backend-cleanup.md` permanece como puente con el resto de Editorial y Quality Gates. | Actualizados `AGENTS.md`, `roadmap.md`, los índices de Backend Cleanup/Catalog, `roadmap/catalog/catalog.md` y `backend-architecture.md`. Las menciones históricas al puente se conservan porque sigue accesible y contiene trabajo pendiente. | Comparación exacta de las secciones; 40 filas del inventario y registro de 201 infracciones (46/155) preservados; BC-CAT, estados, dependencias y decisiones idénticos; cuerpo único por sección; enlaces y accesibilidad del puente comprobados; Prettier focalizado y `git diff --check`. Editorial continúa abierto; corte 6 pendiente. |
| 6. Backend Cleanup: Editorial — **completado (2026-10-20)** | Trasladadas íntegramente las cinco partes a `backend-cleanup/editorial/`: Articles/Asignations/Lists, Videos/Contents, Reunions/Points/Playlists, National Releases y Cierre. El puente conserva BC-QG2. La subsección “Norma estructural obligatoria y Quality Gate del backend” permanece íntegra y accesible en `editorial/closure.md` hasta el corte 7. | Actualizados el índice Backend Cleanup, `roadmap.md`, `AGENTS.md`, `backend-architecture.md`, el índice Catalog y enlaces de navegación entre partes. Se conservaron las rutas vigentes a los otros roadmaps. | Comparación exacta de los cinco cuerpos originales; continuidad de encabezados/IDs, contenido único, BC-QG2 íntegro en el puente, sección transversal íntegra en Cierre, Editorial abierto y enlaces relativos/entrantes/salientes verificados; Prettier focalizado y `git diff --check`. Corte 7 pendiente. |
| 7. Quality Gates e índices finales — **completado (2026-10-20)** | Trasladados íntegramente a `backend-cleanup/quality-gates.md` BC-QG2 y la subsección “Norma estructural obligatoria y Quality Gate del backend”; retirado `roadmap/backend-cleanup.md` tras probar cobertura, contenido único y enlaces. | Actualizados `roadmap/backend-cleanup/README.md`, `roadmap.md`, `AGENTS.md`, `backend-architecture.md`, los índices de Catalog y las referencias activas restantes. Se conservaron menciones históricas explícitas de la ruta original. | Reconstrucción íntegra del contenido fuente en sus destinos; BC-QG2, la sección estructural y BC-ED-9/10 comparados; 756 identificadores BC en el mismo orden; enlaces documentales y de evidencia resueltos; 17 documentos originales con destinos identificados; imagen accesible; Prettier focalizado y `git diff --check`. Editorial permanece abierto; reorganización documental completada. |

## Criterios de integridad para la ejecución futura

- Preservar todos los identificadores y su texto asociado: tareas, subtareas, hallazgos, estados, dependencias, decisiones, contratos, evidencias, limitaciones y notas históricas. No resumir ni eliminar apartados aunque estén completados o supersedidos.
- Mantener el historial dentro del documento temático más cercano; no separar por “activo/completado” salvo que aumente claramente la navegación. Los estados se reflejan en índices, sin reescribir estados históricos.
- Mantener Editorial expresamente abierto hasta que su propio roadmap indique su cierre. La reorganización documental no cuenta como cierre técnico.
- Conservar la jerarquía NestJS por módulos/capacidades y el principio actual de arquitectura modular; no proponer DDD ni reorganizar producción como consecuencia de la clasificación documental.
- No tocar código, tests, Quality Gates, baselines, CI, frontend, servicios externos ni `.impeccable/config.json` durante esta planificación ni en la ejecución documental.
- Antes de borrar un origen, verificar cobertura de contenido por destino y enlaces entrantes. Conservar citas históricas que sean evidencia aunque mencionen paths antiguos del código.

## Verificación de este inventario

- Se enumeraron recursivamente los archivos de `roadmap/`: 17 `.md`, una imagen `.jpg` y una carpeta de evidencia; no se detectaron otros subdirectorios con contenido.
- Se comprobaron bytes y líneas de cada documento Markdown preexistente; total observado: 1.914.185 bytes y 10.331 líneas. Los 17 documentos originales tienen destinos identificados tras los cortes, y la evidencia de Catalog sigue accesible.
- Se inspeccionaron `AGENTS.md`, `README.md`, `CLAUDE.md`, `roadmap.md`, `docs/**/*.md` y referencias de los roadmaps. Los destinos entrantes están consignados en el inventario y la sección de referencias.
- El alcance BC-ROADMAP-1 añadió esta propuesta. BC-ROADMAP-2.0 preparó los índices locales. BC-ROADMAP-2.1 ejecutó el corte 1 de Catalog y BC-ROADMAP-2.2 ejecutó el corte 2 de Community y BC-ROADMAP-2.3 ejecutó exclusivamente el corte 3 de Roles y BC-ROADMAP-2.4 ejecutó exclusivamente el corte 4 de Spotify e Integrations y BC-ROADMAP-2.5, BC-ROADMAP-2.6 y BC-ROADMAP-2.7 ejecutaron exclusivamente los cortes 5, 6 y 7 de Backend Cleanup, respectivamente. La reorganización documental está completada; Editorial permanece abierto y pendiente de su trabajo técnico independiente.
