# Roadmap de Spotify

## Contexto

En el backend, el nombre Spotify se usa para dos conceptos distintos: la playlist propia de Riff Valley y el código que integra con la API externa de Spotify. Antes de reorganizar ese código hay que identificar sus referencias, dependencias, contratos y consumidores.

## Objetivo

Separar de forma gradual el dominio `RiffValleyPlaylist` de la integración externa Spotify. La secuencia cierra primero el trabajo backend; solo después planifica y aborda la adaptación y regresión del frontend.

## Reglas generales

- Avanzar una subtarea cada vez y cerrarla con evidencia antes de empezar la siguiente.
- No mezclar el rename del dominio con la reorganización de la integración externa.
- Preservar comportamiento y contratos salvo decisión explícita; reportar cualquier hallazgo contractual relevante antes de cambiar su comportamiento, siguiendo `AGENTS.md`.
- No tocar Last.fm en esta ruta.
- No crear todavía abstracciones genéricas para proveedores externos.
- S.1 y S.2 son inventario/clasificación; S.3 migra juntos los contratos backend y sus consumers frontend cuando haga falta para quitar la ambigüedad.
- En verificaciones de JavaScript/TypeScript, usar Yarn, respetando la versión y los comandos compatibles con este repositorio.
- Aplicar la regla Impeccable habitual: reportar hallazgos preexistentes, de atribución desconocida o fuera de alcance; no corregirlos ni suprimirlos, no modificar `.impeccable/config.json` y corregir únicamente regresiones demostrablemente introducidas por la subtarea actual.
- Mantener las tareas acotadas y reversibles; no introducir capas, servicios o carpetas vacías por estética.
- Todas las subtareas permanecen pendientes hasta completar sus criterios de aceptación.

## Criterio de cierre

El backend y frontend distinguen inequívocamente la playlist de Riff Valley de la integración externa Spotify. S.4 migra la persistencia física local y verifica metadata, constraints, relaciones, DI y SQL. S.5 centraliza el ownership del proveedor externo sin cambiar contratos. El roadmap completo se cierra cuando S.1–S.9 estén aceptadas.

## S.1 — Inventariar todo lo relacionado con Spotify

- [x] **Estado:** Completada
- **Objetivo:** localizar todas las referencias backend relacionadas con Spotify sin modificar producción.
- **Alcance:** inventariar entidad actual, módulos, services, controllers, DTOs, tests, relaciones, imports, rutas, SQL y consultas manuales, configuración y tokens, llamadas externas y consumidores backend. Registrar archivos, símbolos, flujo de datos y relaciones entre referencias; incluir scripts y migraciones relevantes si existen.
- **Fuera de alcance:** renombres, movimiento de código, cambios de comportamiento, contratos, esquema o frontend.
- **Dependencias:** ninguna.
- **Criterios de aceptación:** el inventario cubre todas las categorías del alcance; cada referencia tiene ubicación y contexto suficientes para clasificarla en S.2; producción permanece sin cambios.
- **Verificaciones:** búsquedas de referencias sensibles a mayúsculas/minúsculas y nombres relacionados; revisión manual de resultados, configuración, queries, imports y consumidores backend; `git diff --check`.
- **Tamaño estimado:** S.
- **Resultado:** inventario backend documentado en [spotify-inventory.md](spotify-inventory.md). Incluye entity y tabla física, relaciones, módulos/DI, controllers y rutas, services/clientes y llamadas externas, DTOs, configuración sin valores secretos, consumidores, consultas, tests, migraciones y referencias ambiguas o documentales del repositorio.

## S.2 — Clasificar referencias

- [x] **Estado:** Completada
- **Objetivo:** decidir a qué concepto pertenece cada referencia encontrada en S.1, sin renombrar todavía.
- **Alcance:** clasificar individualmente las referencias como `RiffValleyPlaylist`, integración externa Spotify o referencia ambigua que necesite decisión; registrar la justificación y las dependencias/imports relevantes.
- **Fuera de alcance:** cambiar nombres, ubicación, DI, contratos, persistencia o frontend.
- **Dependencias:** S.1.
- **Criterios de aceptación:** todas las referencias relevantes del inventario tienen una clasificación; cada ambigüedad incluye la pregunta concreta y opciones razonables; las decisiones necesarias para S.3 y S.5 quedan documentadas antes de tocar las referencias afectadas.
- **Verificaciones:** contraste de cada clasificación con su uso real y sus consumidores; revisión de que no haya cambios de producción; `git diff --check`.
- **Tamaño estimado:** XS.
- **Resultado:** clasificación, ownership y nomenclatura objetivo documentados en [spotify-classification.md](spotify-classification.md). Las decisiones iniciales de conservar rutas y nombres JSON locales se revisaron y superaron en S.3 con la migración coordinada de consumers.

## S.3 — Renombrar dominio a `RiffValleyPlaylist`

- [x] **Estado:** Completada
- **Objetivo:** renombrar únicamente el concepto de dominio que representa la playlist de Riff Valley.
- **Alcance:** completado en backend y frontend. Se renombraron/movieron referencias locales, relaciones Content/User y asociación de artistas; las rutas CRUD locales y los campos JSON relacionados migraron con todos los consumers identificados. Integración externa conservada en su ownership actual.
- **Fuera de alcance:** reorganizar integración Spotify externa (S.5/S.6); migrar tabla/FKs físicos históricos; completar la verificación integral planificada en S.4/S.7/S.9.
- **Dependencias:** S.1 y S.2; las decisiones iniciales sobre compatibilidad se actualizaron tras revisar consumers.
- **Criterios de aceptación:** `RiffValleyPlaylist` es el único nombre de dominio activo local; rutas y payloads distinguen el recurso propio de Spotify externo; asociaciones, DI, consumers y persistencia quedan caracterizados; referencias locales restantes se justifican por persistencia histórica.
- **Verificaciones:** suites focalizadas y builds/typecheck con Yarn; búsqueda global de `spotify` y `RiffValleyPlaylist`; `git diff --check`. Resultados registrados en el cierre de S.3.
- **Resultado y evidencia:** suites focalizadas 5/5 (40 tests) y suite externa Spotify 1/1 (7 tests) pasan; `tsc --noEmit` backend y build frontend pasan. Suite backend completa: 77 suites pasan, 3 fallan fuera de S.3 (aserción de `DiscCatalogService` y fixtures de DI en `VersionsController`/`VersionsService`); al ejecutarla sin elevación también falla la suite HTTP Spotify por `EPERM`, pero pasa con elevación. El backend no define `yarn verify`; `yarn build` no puede limpiar `dist/access-requests` por `EACCES` incluso con elevación, mientras `tsc --noEmit` finaliza correctamente. `git diff --check` pasa en ambos repositorios. Detector Impeccable informa el hallazgo preexistente `gray-on-color` en `EditContentModal.vue:113`, fuera del cambio de copy S.3.
- **Tamaño estimado:** M.

## S.4 — Migrar y verificar persistencia física tras el rename

- [x] **Estado:** Completada (2026-10-05)
- **Objetivo:** retirar nombres físicos `spotify*` que identificaban persistencia local, manteniendo datos, relaciones y contratos.
- **Alcance:** renombrar tablas/columna/FKs/unique/indexes/enums de RiffValleyPlaylist; fijar metadata TypeORM; actualizar SQL manual; comprobar relaciones entrantes/salientes, DI, migración reversible y `ContentType`.
- **Fuera de alcance:** reescribir migraciones históricas, cambiar contratos HTTP/frontend, renombrar columnas de IDs Spotify externos o reorganizar la integración externa.
- **Dependencias:** S.3.
- **Criterios de aceptación:** schema y metadata coinciden; renames preservan IDs/datos y reglas de FK; `ContentType` queda intacto; no quedan nombres físicos activos `spotify*` para el dominio local; pruebas y typecheck pasan o los fallos preexistentes quedan atribuidos.
- **Verificaciones:** tests focalizados de metadata/migración, servicios y DI con Yarn; inspección de metadata TypeORM; conexión PostgreSQL únicamente a entorno local/no producción si está configurada con seguridad; `yarn --ignore-engines tsc --noEmit`; `git diff --check`.
- **Resultado y evidencia:** la migración `1791300000000-RenameRiffValleyPlaylistPersistence` renombra en sitio tablas, columna Content, FKs, unique constraints, índice y enums, con `down` inverso. Metadata TypeORM se construye sin conectar a DB y coincide con los nombres de destino; `ContentType` permanece en `content_type_enum`; Artist Orphans consulta la tabla nueva. Se corrigió `LegendModal.vue` para nombrar el tipo como “Playlist de Riff Valley”, remate directo de la etiqueta local que S.3 ya había cambiado en Content y backlog. Tests focalizados: 15 suites/89 tests pasan. `yarn --ignore-engines tsc --noEmit --tsBuildInfoFile /tmp/riff-valley-tsconfig.tsbuildinfo` pasa. El comando exacto sin `--tsBuildInfoFile` no pudo escribir `dist/tsconfig.tsbuildinfo` por `EACCES`. `git diff --check` pasa. No se ejecutaron migraciones porque no hay `psql`, cliente `pg_isready` ni socket PostgreSQL local detectable; no fue posible validar contra una DB real.
- **Tamaño estimado:** S.

## S.5 — Identificar y agrupar la integración real de Spotify

- [x] **Estado:** Completada (2026-10-05)
- **Objetivo:** reunir coherentemente solo el código que consume la API externa de Spotify.
- **Alcance:** mover, cuando existan, cliente HTTP, autenticación y tokens, búsquedas, álbumes, artistas, imágenes, enlaces, top tracks, market y mappers/adapters Spotify. Actualizar imports y DI estrictamente necesarios, manteniendo la lógica y los contratos.
- **Fuera de alcance:** código de dominio `RiffValleyPlaylist`; integración Last.fm; abstracciones genéricas de proveedores; cambios de comportamiento, rutas, payloads o frontend.
- **Dependencias:** S.2 y S.4; cualquier referencia ambigua que afecte el movimiento debe tener decisión documentada. La ubicación destino se decide a partir de la estructura real inventariada, no por anticipado.
- **Criterios de aceptación:** cada pieza trasladada consume realmente Spotify API y su ownership queda claro; no se duplica implementación; dependencias y configuración/tokens funcionan desde la ubicación final; contratos y efectos externos se preservan.
- **Verificaciones:** suites focalizadas de API Client Credentials, OAuth, scheduler, fachada HTTP, Festival Playlists, Catalog DI y consumidores; typecheck con Yarn y `git diff --check`.
- **Resultado y evidencia:** `src/spotify-integration/SpotifyIntegrationModule` agrupa la API pública externa, Client Credentials compartido, API de cuenta autenticada, OAuth, entity `SpotifyConnection` y `TokenCryptoService`. `SpotifyApiService` salió de Wordpress; controllers/DTOs y sus rutas se movieron sin alterar paths; Catalog, Lists, Contents y Festival Playlists importan el módulo según sus necesidades. El scheduler conserva el job, sus queries estricta/amplia y el fallback Bandcamp; únicamente delega token/transporte Spotify. `FestivalPlaylistsService` conserva orquestación, reglas de tokens y estado local, protected/shared tracks, matching, scopes/state/lifecycle y setlist.fm; delega endpoints y paginado remotos. `WordpressModule` ya solo posee Wordpress. Suites focalizadas: 11 suites/96 tests pasan (10 suites dentro del sandbox y la suite HTTP de 7 tests con permiso para abrir listener local). `yarn --ignore-engines tsc --noEmit --tsBuildInfoFile /tmp/riff-valley-s5-tsconfig.tsbuildinfo` y `git diff --check` pasan. El comando typecheck sin ruta alternativa falló al intentar escribir `dist/tsconfig.tsbuildinfo` por permisos; sin incrementar (`--incremental false`) también pasa. No hay cambios de esquema ni migraciones en S.5. Al cerrar S.5, S.6 y S.7 aún estaban pendientes.
- **Tamaño estimado:** M.

## S.6 — Normalizar estructura backend de la integración Spotify

- [x] **Estado:** Completada (2026-10-05)
- **Objetivo:** revisar y ordenar la estructura resultante siguiendo las convenciones vigentes del backend.
- **Alcance:** ajustar nombres y ubicación de módulos, services, clientes, helpers y tests ya existentes de acuerdo con responsabilidades cohesivas y el volumen real de código; actualizar referencias afectadas.
- **Fuera de alcance:** añadir capas o carpetas vacías, abstraer proveedores genéricamente, modificar la lógica externa, dominio, contratos, Last.fm o frontend.
- **Dependencias:** S.5.
- **Criterios de aceptación:** cada pieza tiene ownership claro y organización consistente con `AGENTS.md`; no quedan duplicaciones o referencias obsoletas introducidas por la reorganización; no hay estructura ornamental.
- **Verificaciones:** revisar árbol de archivos, imports, DI y suites focalizadas con Yarn; typecheck/build backend disponible con Yarn; `git diff --check`.
- **Resultado y evidencia:** `src/spotify-integration/` queda organizado en `api/`, `http/` (incluye `dto/`) y `oauth/`, más el módulo y una superficie pública pequeña `index.ts`. La API de lectura con Client Credentials se llama `SpotifyPublicApiService`; `SpotifyAccountApiService` conserva operaciones remotas autenticadas; OAuth, `SpotifyConnection` y `TokenCryptoService` permanecen juntos bajo `oauth/`. Los consumidores importan providers por la frontera explícita del módulo. `src/spotify/` ya no existe y `WordpressModule` solo registra/exporta WordPress. Una prueba de contratos `/api/discs/spotify/album` quedó en Catalog para evitar que la suite de integración Spotify importe su controller. No cambiaron rutas, payloads, schema, migraciones ni frontend. Tests focalizados: 13 suites/111 tests pasan, incluida la suite HTTP local; `yarn --ignore-engines tsc --noEmit --tsBuildInfoFile /tmp/riff-valley-s6-tsconfig.tsbuildinfo` pasa; `git diff --check` pasa. Al cerrar S.6, S.7 aún estaba pendiente.
- **Tamaño estimado:** S.

## S.7 — Regresión backend y cierre

- [x] **Estado:** Completada (2026-10-05)
- **Objetivo:** verificar de forma conjunta que el backend conserva comportamiento y contratos después de separar los dos conceptos.
- **Alcance:** regresión de suites focalizadas, DI, imports, rutas, persistencia, contratos y consumidores backend; búsqueda final de referencias ambiguas; documentar hallazgos y evidencia de cierre.
- **Fuera de alcance:** ampliar contratos, cambiar frontend, abordar Last.fm o iniciar abstracciones de proveedores.
- **Dependencias:** S.3, S.4, S.5 y S.6.
- **Criterios de aceptación:** suites y verificaciones aplicables pasan o sus fallos preexistentes quedan identificados; NestJS resuelve la DI; no quedan imports obsoletos ni referencias ambiguas sin decisión; los contratos y efectos externos observados permanecen preservados.
- **Verificaciones:** suites focalizadas de playlist, integración y consumidores con Yarn; typecheck/build backend disponible con Yarn; revisión de rutas/contratos y búsqueda de referencias; `git diff --check`.
- **Resultado y evidencia:** confirmados ownership y dependencias de App, RiffValleyPlaylist, Spotify Integration, Festival Playlists, Contents, Catalog/Discs, Lists y Wordpress; Wordpress no posee Spotify, no hay `src/spotify/` ni `SpotifyModule`, y no hay dependencias runtime de integración hacia consumers. Metadata TypeORM de playlist, Content, User y asociación pasa sus pruebas; migrations `179122...` → `179130...` tienen renames en sitio y rollback inverso. No hay PostgreSQL local detectable, por lo que no se ejecutaron migraciones ni se verificó schema contra DB real. Se añadieron pruebas HTTP reales del router Nest para listado/festivals/genres/random/CRUD/Content, de cache/expiración Client Credentials y de Lists (selección manual/fallback, iframe y publicación WordPress). Suites focalizadas: 22 suites/155 tests pasan; HTTP pasa con permiso de listener local. Suite completa: 84 suites pasan, 8 se omiten y 3 fallan (646 tests pasan, 30 se omiten, 3 fallan): una aserción antigua de `DiscCatalogService.findAll` y los fixtures DI de `VersionsController`/`VersionsService`, los mismos fallos ajenos ya documentados en S.3; no hay fallos Spotify. `yarn --ignore-engines tsc --noEmit --tsBuildInfoFile /tmp/riff-valley-s7-tsconfig.tsbuildinfo` pasa. `yarn --ignore-engines build` falla al borrar `dist/access-requests` con `EACCES`, igual que el límite de permisos ya observado; no se cambiaron permisos y el typecheck/tests pasan. `git diff --check` pasa. Búsqueda runtime no encuentra nombres locales legacy ni transporte Spotify disperso; las coincidencias restantes están en migraciones históricas/rollback, documentación histórica o representan Spotify remoto. No se corrió Impeccable: esta subtarea no modifica UI y no se encontró configuración/herramienta local del detector. El aviso `AuthGuard`/`PassportModule` continúa en una suite HTTP que pasa y queda fuera de alcance. No se hicieron cambios de producción, rutas, contratos, schema o frontend.
- **Tamaño estimado:** M.

## S.8 — Adaptación frontend

- [x] **Estado:** Completada (2026-10-05)
- **Objetivo:** planificar y ejecutar, tras cerrar el backend, los ajustes frontend que sean realmente necesarios para reflejar la separación de nombres sin romper la integración.
- **Alcance:** localizar consumidores frontend afectados por las rutas, tipos, nombres o imports backend confirmados; preservar los contratos vigentes salvo decisión explícita y registrar cualquier mejora contractual como decisión separada.
- **Fuera de alcance:** iniciar cambios antes de cerrar S.7, rediseñar contratos por conveniencia, modificar integración Last.fm o ampliar el alcance a consumidores no relacionados.
- **Dependencias:** S.7 y acceso al repositorio frontend; cualquier cambio contractual requiere decisión explícita previa.
- **Criterios de aceptación:** consumidores afectados quedan inventariados y adaptados solo si el cambio backend lo requiere; no hay dependencias frontend/backend sin resolver; contratos y comportamiento quedan alineados.
- **Verificaciones:** suites focalizadas y typecheck/build frontend con Yarn; revisión de llamadas, tipos e imports relacionados; `git diff --check` en el repositorio frontend.
- **Resultado y evidencia:** el frontend separa CRUD/modelo local en `services/riff-valley-playlists` y rutas/views `/riff-valley-playlists/...`, mientras `services/spotify` conserva búsquedas externas, OAuth y sync remota; Content usa `riffValleyPlaylist`/`riffValleyPlaylistId` y Artist Management `riffValleyPlaylists`. Se corrigió el comentario de Artist Management que atribuía esa colección local a Spotify, el callback documentado en README a la ruta nueva y `CLAUDE.md`, que describía Client Credentials/secretos como frontend pese a que los helpers actuales llaman al backend. Las rutas/payloads vigentes no se modificaron. Las coincidencias runtime restantes `spotify*` representan proveedor externo/IDs externos; las menciones históricas permanecen en changelog. El callback OAuth `?spotify=connected|error` se consume en la vista de festivales; no se encontró consumer de `?tiktok=...` (solo el enlace social de TikTok), así que queda sin confirmar y no se añadió comportamiento. `yarn build` pasa (con avisos de Browserslist desactualizado, CSS `.flex-[2]` y chunk >500 kB, cuya atribución no se determinó); no hay suites de test configuradas/encontradas en el frontend. `git diff --check` pasa. El frontend ya tenía cambios locales de S.3 sin commit; se preservaron.
- **Tamaño estimado:** S.

## S.9 — Regresión frontend

- [x] **Estado:** Completada (2026-10-05)
- **Objetivo:** validar la integración frontend final una vez completada S.8.
- **Alcance:** ejecutar regresión focalizada de pantallas y flujos que consumen la playlist de Riff Valley o datos de Spotify; revisar errores de red, tipado, estados vacíos y enlaces/datos afectados.
- **Fuera de alcance:** cambios backend, nuevas funciones o cambios de contrato no acordados.
- **Dependencias:** S.8.
- **Criterios de aceptación:** suites y comprobaciones aplicables pasan; flujos frontend afectados mantienen el comportamiento esperado con el backend actualizado; defectos preexistentes o ajenos quedan documentados sin incorporarse automáticamente al alcance.
- **Verificaciones:** suites focalizadas, typecheck/build y verificaciones de interfaz pertinentes ejecutadas con Yarn; `git diff --check` en el repositorio frontend.
- **Resultado y evidencia:** cerrada la regresión conjunta. Backend: 21 suites focalizadas/143 tests pasan; las 3 suites HTTP que inicialmente recibieron `EPERM` en sandbox se repitieron con permiso de listener local y pasan (9 tests). Suite completa: ejecución sandbox reportó 81 suites aprobadas, 8 omitidas y 6 fallidas (637 tests aprobados, 30 omitidos, 12 fallidos); 3 suites/9 fallos eran solo `listen EPERM` y pasaron al repetirlas localmente. Resultado atribuido: 84 suites aprobadas, 8 omitidas, 3 fallidas (646 tests aprobados, 30 omitidos, 3 fallidos). Las 3 fallidas son la aserción de `DiscCatalogService.findAll` y fixtures DI de `VersionsController`/`VersionsService`, mismos fallos preexistentes registrados en S.7; no hay fallo Spotify. Typecheck exacto solicitado pasa. Build backend vuelve a detenerse al borrar `dist/access-requests` con `EACCES`; no se cambiaron permisos. Frontend: `yarn build` pasa (Browserslist, CSS `.flex-[2]` y chunk >500 kB siguen como warnings sin atribución a esta ruta); package.json no tiene script de test y no se encontraron tests frontend; vue-tsc corre como parte del build. `git diff --check` pasa en ambos repositorios. Metadata TypeORM y tests de las migraciones confirman los nombres finales; no hay `psql` ni `pg_isready`, así que no se inspeccionó PostgreSQL real ni se ejecutaron migraciones. Búsquedas globales no encuentran restos runtime locales legacy ni transporte Spotify fuera de `src/spotify-integration/`; las coincidencias históricas quedan en inventario/migraciones y las restantes identifican Spotify remoto/OAuth. El aviso `AuthGuard`/`PassportModule` aparece en suite HTTP que pasa. El callback TikTok sigue documentado pero no tiene consumer frontend confirmado y permanece fuera de esta ruta. S.1–S.9 quedan completadas; no se abren nuevas tareas Spotify.
- **Tamaño estimado:** S.
