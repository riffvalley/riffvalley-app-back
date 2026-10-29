# MEDIA-3b.6a — Auditoría de duplicados e identidad musical

**Estado:** auditoría documental MEDIA-3b.6a completada el 2026-10-28. La implementación acotada de MEDIA-3b.6b en Catalog se completó el 2026-10-29; no cierra los hallazgos P1 de Requests ni Excel, que permanecen abiertos por ownership y alcance. MEDIA-3b.6 global no se declara cerrada mientras queden esos P1.

## 1. Resumen ejecutivo

Al iniciar MEDIA-3b.6b, la búsqueda normalizada de MEDIA-2/3 recuperaba candidatos; no intervenía por sí sola en escrituras. `ArtistWriteService`, los imports, Requests y `DiscWriteService.createWithArtist` mantenían criterios legacy. Las columnas `search_name_normalized` no son únicas ni participan en constraints.

Hay riesgos concretos anteriores a MEDIA-2 que MEDIA-3b.6b debe decidir: Requests e imports pueden reutilizar un Artist arbitrario entre filas con la misma clave legacy; `DiscWriteService.createWithArtist` usa coincidencia `ILIKE` exacta, reutiliza automáticamente un único resultado y puede interpretar `%`/`_` como comodines; la importación manual marca como duplicado un Disc del mismo artista/título aunque fecha o formato difieran. Requests, por su parte, crea Disc sin comprobar duplicados. No se ha demostrado daño en datos ni se ha consultado producción.

La búsqueda de sugerencias de National Releases sigue siendo solo una sugerencia sin enlace persistido. Sus resultados `LIMIT 1` no son deterministas ante múltiples coincidencias. Las decisiones editoriales y los imports no se modificaron.

**Prioridad:** no se identificó P0. Se registran dos P1 de identidad/rechazo, y riesgos P2 de duplicación, sugerencia ambigua, concurrencia y cobertura. Las prioridades describen riesgo estático reproducible en la lógica; no implican que haya ocurrido en datos reales.

## 2. Método, límites y ownership

Se revisaron estado Git, entidades, migraciones, normalizadores, helpers MEDIA-3b.4/3b.5, escritores, imports, Requests, National Releases, búsquedas por nombre y specs existentes. La rama estaba limpia en `main`, HEAD `15e3edb03651bb5e530369223ac4dd9ef4ef2972` (`feat(search): normalize secondary music readers`), sincronizada con `origin/main` al iniciar.

Ownership inspeccionado: Catalog posee Artist, Disc, sus escritores y `catalog/import`; Community posee Requests; Editorial posee National Releases. Esta auditoría no recomienda mover servicios ni crear dependencias entre esos dominios. Rates/Last.fm consume una búsqueda exacta de candidatos de Catalog, pero no persiste asociaciones. Community Rates/Covers/Comments/Favorites/Pendings y operaciones ordinarias de Disc que reciben IDs trabajan por ID, relación, fecha o filtro estructurado.

Se leyó [política de normalización](music-search-normalization.md), [diseño SQL](music-search-sql-design.md), [auditoría inicial](music-search-audit.md), [roadmap de matching](music-search-matching.md), `normalize-music-name.ts`, `music-name-search.ts` y los cambios documentados de MEDIA-3b.4/3b.5.

La normalización MEDIA-2 transforma el texto para búsqueda (Unicode NFKD, equivalencias acotadas, puntuación y espacios); variantes de artículos son alternativas de recuperación. Las funciones documentan expresamente que una coincidencia no establece identidad. La clave legacy `Artist.nameNormalized` procede de otra política y no debe tratarse como equivalente.

## 3. Inventario de decisiones

| Dominio / propietario | Archivo y método | Entrada y comparación | Decisión actual | Cobertura / riesgo |
|---|---|---|---|---|
| Catalog / Artists | `src/catalog/artists/write/artist-write.service.ts` — `create`, `update` | Nombre recibido; calcula `nameNormalized` y `searchNameNormalized`, guarda | Crea o actualiza; no hace lookup previo ni deduplica. Convierte PostgreSQL `23505` en 400 si otra restricción lo provoca. | `artist-write.service.spec.ts` caracteriza guardado y error 23505; no prueba nombres duplicados contra PostgreSQL. |
| Catalog / Discs | `src/catalog/discs/write/disc-write.service.ts` — `create`, `update` | ID de Artist; no compara nombres | Asocia la relación por ID y guarda; no busca duplicados de Disc. | Spec caracteriza relación por ID. Sin regla de deduplicación. |
| Catalog / Discs | `DiscWriteService.createWithArtist` → `resolveArtist` | Nombre Artist con `ILike(artistName)`; país solo para desambiguar varias filas | Cero resultados: crea Artist. Uno: reutiliza. Varios: exige `countryId`; reusa el del mismo país o crea otro. Después crea Disc. | Tests cubren cero/uno/varios y país; no cubren comodines ni homónimos conceptuales indistinguibles con una sola fila. |
| Catalog / Import manual | `src/catalog/import/manual/import/catalog-import.service.ts` — operación transaccional por fila | Artist `nameNormalized`; Disc con `ILike(discName.trim())` y `artist.id` | Reutiliza el primer Artist encontrado o crea; si existe Disc lo clasifica como existente/duplicado y no crea otro. | Spec prueba intercalado, títulos repetidos y duplicado; no prueba fecha/formato diferentes ni ambigüedad Artist. |
| Catalog / Import Excel | `src/catalog/import/excel/import/excel-import.service.ts` — operación transaccional por fila | Artist `nameNormalized` y `countryId` solo si viene; Disc igualdad exacta de `name`, `artist.id` y `releaseDate` solo si viene | Reutiliza el primer Artist coincidente o crea. Si Disc coincide con esos criterios, clasifica duplicado; si no, crea. `ep` no forma parte de la consulta. | Spec verifica fecha opcional y no actualizar existentes; faltan ambigüedad y casos de formato/edición. |
| Community / Requests | `src/community/requests/requests.service.ts` — `approve` | Artist `nameNormalized`; sin país en el lookup. Disc sin lookup de existencia | Dentro de transacción, reusa el resultado de `findOne` o crea Artist, crea siempre Disc y marca solicitud aprobada. | Specs cubren creación/reutilización y estado; no duplicado de Disc ni varias filas con clave Artist común. |
| Editorial / National Releases | `src/editorial/national-releases/national-releases.service.ts` — `checkDuplicate`, create/update/`createFromDisc` | Texto `LOWER(artistName)`, `LOWER(discName)`, `discType` | Rechaza registro editorial duplicado. No es deduplicación de la entidad Disc; no incluye fecha ni `discId`. Índice único PostgreSQL aplica la misma terna. | Specs cubren conflicto case-insensitive; no concurrencia real. |
| Editorial / National Releases | `linkDisc` | `discId` explícito, o crea Disc por nombre y `artistId`/`genreId` opcionales | Carga y asocia por ID si se aporta; no compara artista del Disc con `artistName` del release. Si se aporta nombre, crea Disc, no hace lookup de duplicado. | Specs cubren rutas/transacción; falta prueba de Artist discrepante. La decisión de ID es editorial/manual, no matching textual automático. |
| Editorial / National Releases | `findSuggestedDiscs` / `buildDiscSuggestionQuery` | Claves normalizadas de título y Artist; fallback exacto `LOWER` para claves NULL | Recupera como máximo una sugerencia por release con `LIMIT 1`; no modifica `discId` ni guarda el resultado. | Specs verifican SQL y contrato candidato; sin orden determinista ni PG específico de varias coincidencias. |
| Catalog / ArtistCatalog | `src/catalog/artists/catalog/artist-catalog.service.ts` — `findExactNameMatches` | Claves normalizadas y comparación MEDIA-2 | Devuelve Artist solo si hay exactamente un candidato; cero o más de uno se convierten en resultado vacío. Rates/Last.fm consume estas sugerencias; no persiste asociación. | Spec de servicio; no hay decisión de escritura. Protección actual contra homónimos en este consumidor. |
| Catalog / Artist details y orphans | `artist-details.service.ts`, `artist-orphans.service.ts` | Correlación de release editorial por nombre `LOWER`, ID de Artist para detalle | Presenta/omite relaciones editoriales y cuenta; no reutiliza ni crea entidad. | Ya cubierto por MEDIA-3b.4 en lectores; cambio aquí alteraría una regla de relación/conteo, no identidad de catálogo. |
| Catalog / Disc maintenance, integración | `src/catalog/discs/maintenance/disc-link-maintenance.service.ts` | Disc por ID y lookup remoto Spotify/Bandcamp | Enriquecimiento y persistencia de enlaces/medios, no resolución interna de identidad examinada para esta fase. | Diferido a MEDIA-4–6 y CAT-DISC-4c.1; no se audita aquí el matching proveedor. |

No se encontraron autocompletados de Requests ni otro `findOrCreate` musical aparte de los anotados. `SuggestionsService` almacena texto libre y no consulta Artist/Disc. Calendar y los filtros Community cubiertos por MEDIA-3b.4/3b.5 son lecturas estructuradas o candidatos ya cubiertos, no decisiones de escritura.

## 4. Artist

`ArtistWriteService.create/update` no impide nombres iguales ni equivalentes. `nameNormalized` se calcula con `normalizeForSearch`; `searchNameNormalized` con MEDIA-2. El esquema/migraciones inspeccionados no declaran unicidad en ninguno. Por eso los homónimos son posibles y la clave legacy compartida tampoco garantiza un único resultado.

`DiscWriteService.resolveArtist` trata la cantidad de resultados `ILIKE` como señal de desambiguación: con uno asume identidad; con varios exige país. Es una protección parcial demostrada por código, pero el nombre no basta para distinguir otro Artist homónimo si solo hay una fila. `ILIKE` recibe el nombre sin escapar `%` ni `_`, que PostgreSQL trata como comodines: una entrada con esos caracteres puede ampliar el conjunto. Este flujo puede crear Disc ligado a la resolución elegida; la asociación es irreversible hasta que alguien la corrija.

Requests e imports hacen lookup por `nameNormalized` con `findOne`. Manual no limita por país; Excel lo limita solo si hay país de entrada; Requests no usa país para resolver. Si más de un Artist comparte la clave, el código no pide selección ni impone orden/criterio de desempate. El `findOne` elige un registro según la consulta del ORM/DB; no se encontró garantía de identidad. Requests crea Disc ligado a ese Artist y aprueba la solicitud.

El nombre `MOL`/`MØL` se normaliza a clave MEDIA-2 equivalente para búsqueda, pero los escritores actuales no usan esa clave para resolver. Cambiar esos lookups a la clave nueva ampliaría los candidatos y **no** autorizaría su reutilización automática.

## 5. Disc

`Disc` tiene `name`, Artist por relación, `releaseDate`, `ep` y otros campos editoriales; no hay constraint único de título+Artist, ni sobre `search_name_normalized`. `DiscWriteService.create` y `update` requieren/actualizan relaciones por ID cuando se aportan, sin búsqueda textual de duplicado. `createWithArtist` crea un Disc tras resolver Artist y tampoco busca otro Disc existente.

Import manual considera duplicado únicamente por Artist ID y `ILIKE` del título recortado. No usa fecha, `ep` ni identificadores externos. Puede clasificar como existente un álbum/EP con título igual y fecha/formato diferentes. Import Excel compara título exacto case-sensitive, Artist ID y fecha solo cuando la fecha está presente; omite `ep` y edición. Sin fecha, una coincidencia de título+Artist basta; con fecha distinta puede crear otro registro.

Requests aprueba creando siempre un Disc nuevo. No existe consulta de duplicados de Disc ni rechazo por título. Esto puede duplicar un lanzamiento ya catalogado. No es una regla de identidad implementada ni se modifica en esta auditoría.

National Releases distingue el duplicado del registro editorial de la identidad de Disc. La terna textual de release y tipo no debe reutilizarse como clave global de álbum.

## 6. Imports

Los dos importadores de Catalog usan transacciones por fila y llamadas de escritura, no readers de candidatos. Manual crea/reusa Artist por `nameNormalized`, sin país; deduplica Disc por ILIKE título y Artist ID. Excel resuelve Artist por clave legacy y país opcional; deduplica por título exacto, Artist ID y fecha opcional. Ambos crean Disc con claves MEDIA-2 dual-write; esa escritura no cambia sus comparaciones de duplicado.

No seleccionan entre candidatos visualmente ni exponen ambigüedad. Si un lookup de Artist encuentra más de una fila, `findOne` no convierte la ambigüedad en revisión. Los tests actuales simulan estas consultas pero no detectan homónimos en PostgreSQL. Los imports requieren decisión de dominio propia: propuestas para MEDIA-3b.6b no deben reemplazar reglas de resultado por fila sin caracterización y aprobación.

## 7. Requests

La creación/edición almacena cadenas libres y estado; no hay autocompletado de catálogo identificado. `approve` busca/crea Artist por clave legacy sin country, crea Disc sin consulta previa y cambia status a `APPROVED` en la transacción. La nueva clave normalizada solo se escribe, no decide. No se debe cambiar la aprobación por coincidencia MEDIA-2 ni rechazar una solicitud porque su candidato normalizado coincida.

Un plan de corrección debe separar explícitamente selección de Artist, revisión/aprobación y duplicado de Disc. Cambios de aprobación/editoriales quedan fuera de una implementación limitada a lectores de Catalog y requieren aprobación de dominio Community.

## 8. National Releases

`findSuggestedDiscs` busca candidatos usando título y artista normalizados, con fallback exacto a `LOWER` para filas `NULL`. El código comenta que el candidato requiere revisión humana y no se enlaza allí. `LIMIT 1` sin `ORDER BY` puede devolver Disc distinto entre planes/ejecuciones si varios candidatos comparten claves; la sugerencia es ambigua aunque no se persista automáticamente.

`linkDisc` con `discId` explícito asocia por ID, sin validar que Artist de Disc concuerde con `artistName` del release. Es una decisión manual por ID, no efecto de MEDIA-2. Con `name`, crea Disc nuevo con Artist ID opcional, sin reutilización textual. `checkDuplicate` decide duplicidad editorial con texto case-insensitive y `discType`; la fecha no participa. No se propone alterar reglas de publicación o aprobación.

## 9. Matriz de colisiones

| Caso | Protección actual | Riesgo / clasificación |
|---|---|---|
| `MOL` / `MØL` | En lectores MEDIA-3, clave equivalente solo recupera candidato. Los escritores siguen en key legacy o nombre literal. | Si se amplía a escritores, la coincidencia no permite reutilización automática. P2 como riesgo de diseño futuro; protegido actualmente por no usar la nueva clave en decisión. |
| `The Secrets of Pandora` / `Secrets of Pandora` | Variantes se usan en recuperación; no en importaciones o escritura. | No es identidad; una decisión futura basada solo en variante puede reutilizar mal. P2. |
| Dos Artists con mismo nombre | `createWithArtist` rechaza varias coincidencias sin país y permite ID explícito en Disc create; `findExactNameMatches` retorna ninguno si múltiples. | Requests/import `findOne` puede escoger una fila; `createWithArtist` acepta sin confirmación única coincidencia. P1. |
| Título igual, Artist distinto | Manual/Excel incluyen Artist ID en lookup; Requests no hace lookup. | Requests puede duplicar Disc, no asociar a otro Artist por título. P2. |
| Dos títulos iguales del mismo Artist | Manual los declara duplicados por título case-insensitive; Excel según título exacto y fecha opcional; Requests los crea. | Política inconsistente; puede ocultar/rechazar ediciones o crear duplicados. P1 (manual) / P2 (inconsistencia). |
| LP y EP de título semejante | Manual/Excel no incluyen `ep` en lookup; Requests no deduplica. | Manual puede tratar formatos como duplicado. P1. |
| Original y deluxe | No usa identificador externo ni edición; sólo título/Artist y, Excel, fecha opcional. | Títulos iguales pueden confluir en import manual o Excel sin fecha. P2. |
| Puntuación distinta | MEDIA-2 convierte puntuación a separadores; writers no emplean esa clave como identidad. | Futura ampliación de escritura podría colisionar; hoy depende de la regla local de cada flujo. P2. |
| Clave normalizada vacía | Helpers de búsqueda no consultan cuando la clave está vacía; escritores/legacy lookups tienen contratos de entrada distintos y no hay política única. | No se demuestra consulta amplia, pero no hay protección transversal al crear o resolver. P2; probar cada DTO/import. |
| Varios candidatos | Artist Catalog rechaza ambigüedad; National suggestion selecciona un `LIMIT 1`; imports/Requests usan `findOne`; DiscWrite de nombre requiere país solo si ve >1. | Respuestas divergentes: revisión, selección no determinista o asociación automática. P1/P2 según escritura. |

No se detectó matching difuso. No se infiere identidad por similitud parcial.

## 10. PostgreSQL, constraints y concurrencia

- `Artist.nameNormalized` es `text NOT NULL`; el índice histórico asociado no es único. La entidad no declara unicidad. `search_name_normalized` de Artist y Disc es nullable y las migraciones de MEDIA-3 solo añaden columnas; no crean índices ni constraints únicos.
- Disc no tiene restricción única por título, Artist, fecha o tipo en las migraciones inspeccionadas. La relación Disc→Artist es FK (`ManyToOne`, `ON DELETE CASCADE`); valida existencia del ID, no identidad semántica.
- National Releases sí mantiene un índice único funcional `LOWER(artistName), LOWER(discName), discType` (la migración posterior incluye `discType`). El servicio también preconsulta y convierte el conflicto concurrente `23505` en 400. Es unicidad editorial, no identidad de álbum.
- `ArtistWriteService` y `DiscWriteService` capturan `23505`, pero no se encontró un constraint musical que convierta nombres o claves de búsqueda en únicos.
- Imports y Requests hacen read-then-write dentro de transacción, pero no bloquean por clave ni hay unicidad de Artist/Disc que serialice la misma identidad. Es **hipótesis reproducible bajo concurrencia**, no ejecución observada: dos transacciones pueden ver ausencia y crear registros distintos. No se ejecutó una prueba de concurrencia ni PostgreSQL en esta tarea.

No se inspeccionó ninguna base de datos local/producción ni se ejecutaron migraciones.

## 11. MEDIA-3b.4/3b.5: garantía y límite

Catalog exact-name Artist reduce resultados a una coincidencia única. Las búsquedas parciales de Catalog y los filtros/sugerencias secundarios normalizados de MEDIA-3.5 recuperan candidatos; no llaman a escritores, no aprueban Requests y no guardan relaciones. `findSuggestedDiscs` es candidato no persistido, con el límite de selección arbitraria indicado. No se identificó cambio indirecto en reglas de aprobación, creación o duplicación introducido por esos lectores.

Las columnas normalizadas dual-write son visibles también desde servicios de escritura, pero su presencia no las convierte en claves de identidad. No cambiar `Artist.nameNormalized`.

## 12. Pruebas actuales y huecos

**Suites existentes revisadas:** `artist-write.service.spec.ts`, `disc-write.service.spec.ts`, `catalog-import.service.spec.ts`, `excel-import.service.spec.ts`, `requests.service.spec.ts`, `national-releases.update.spec.ts`, `national-releases.link-disc.transaction.spec.ts`, `national-releases.suggestions.spec.ts`, `build-disc-suggestion-query.spec.ts` y `artist-catalog.service.spec.ts`.

Cubren escrituras, elección de Artist por cantidad/país en `createWithArtist`, resolución legacy de imports/Requests, errores duplicados editoriales y que sugerencias produzcan SQL candidate-only. No cubren colisiones normalizadas múltiples en escrituras ni constraints reales para Artist/Disc. No hay prueba PG de duplicado/concurrencia de estos flujos. Las pruebas MEDIA-3b.3 de migración/backfill no caracterizan identidad.

### Propuestas para MEDIA-3b.6b (sin añadir ahora)

| Caso | Nivel sugerido | Aserción que protege |
|---|---|---|
| Artista con nombre idéntico | Unidad + PG | Confirmar contrato de homónimos permitido; crear no elige automáticamente un ID. |
| Artista con nombre MEDIA-2 equivalente (`MOL`/`MØL`) | Unidad | Recuperar candidatos, exigir elección explícita antes de persistir asociación. |
| Dos artistas homónimos | Unidad + PG | Requests/import nunca enlaza silenciosamente el primer resultado; `createWithArtist` conserva ambigüedad/país. |
| Disc idéntico con Artist distinto | Unidad | La decisión de duplicado siempre considera Artist ID donde corresponda. |
| Disc homónimo del mismo Artist | Unidad + PG | Diferenciar versiones/tipo/fecha conforme a política aprobada, sin rechazo automático por clave sola. |
| Variante de artículo | Unidad | Sugiere candidatos; no crea, enlaza ni rechaza automáticamente. |
| Ediciones alternativas | Unidad | Original/deluxe/remaster se revisan con datos disponibles; no inventar identidad por título. |
| Varios candidatos compatibles | Unidad + PG | Resultado es selección humana/ambigüedad, sin depender de orden incidental. |
| Import con coincidencia ambigua | Unidad + PG | Estado/error de fila explícito y rollback/conservación consistente, según política aprobada. |
| Aprobación con candidato ambiguo | Unidad | No aprueba ni asocia por coincidencia normalizada sola; requiere contrato Community aprobado. |
| Inserciones concurrentes | PostgreSQL aislado | Dos transacciones de import/approval no producen asociación errónea o duplicado no previsto bajo política acordada. |
| Clave normalizada vacía | Unidad + PG si hay SQL | No ampliar consulta ni escoger/crear identidad sin validación específica. |

Las pruebas PG propuestas usarían schema/fixtures sintéticos; ninguna debe acceder a producción.

## 13. Hallazgos priorizados

### P1 — Lookup por clave legacy reutiliza Artist ambiguo en Requests e imports

**Evidencia:** `RequestsService.approve`, `CatalogImportService` y `ExcelImportService` usan `findOne({ nameNormalized })`; Requests/manual no filtran por país, Excel solo cuando se entrega país. La entidad y migraciones no imponen unicidad en esa clave. Los specs prueban un resultado, no múltiples.

**Condición/consecuencia:** existen dos Artists homónimos o que comparten la clave legacy y se aprueba/importa otro lanzamiento; el Disc queda ligado al resultado que `findOne` retorne, sin revisión. **Riesgo:** asociación incorrecta y persistente. No hay evidencia de que ocurriera históricamente.

**Propuesta:** definir política por dominio para cero/uno/múltiples candidatos y permitir selección explícita o error/revisión ante ambigüedad. No reemplazar por igualdad MEDIA-2 con auto-reuse. **Tamaño:** M (Catalog imports), M–L (Requests requiere decisión Community). **Owner:** Catalog Import / Community Requests, por separado.

### P1 — Import manual rechaza títulos iguales sin distinguir lanzamiento

**Evidencia:** `CatalogImportService` devuelve estado existing/duplicate cuando Artist ID y `ILike(trim(title))` coinciden; ignora releaseDate y `ep`. `%` y `_` tampoco se escapan en ese lookup y PostgreSQL los interpreta como comodines. Excel y Requests adoptan criterios distintos.

**Condición/consecuencia:** mismo artista publica álbum/EP, edición o lanzamiento distinto con mismo título, y entra por manual import; la fila no crea Disc. **Riesgo:** falso duplicado/pérdida de entrada. No se ha probado con datos reales.

**Propuesta:** acordar identidad Disc por flujo y caracterizar campos disponibles antes de ampliar el criterio; tratar los metacaracteres como literales si ese es el contrato de entrada. La clave MEDIA-2 solo propone candidatos. **Tamaño:** M. **Owner:** Catalog Import.

### P1 — `createWithArtist` hace asociación automática con un solo resultado `ILIKE`

**Evidencia:** `DiscWriteService.resolveArtist` devuelve directamente el único Artist `ILIKE` encontrado, luego guarda Disc con esa FK. El filtro no escapa `%` y `_` de la entrada; prueba de servicio no cubre comodines ni un homónimo no distinguible.

**Condición/consecuencia:** un nombre coincidente no basta para identidad (o incluye comodines SQL); un Artist candidato único se reutiliza automáticamente. Con múltiples resultados, la rama requiere país, protección parcial. **Riesgo:** vínculo incorrecto; mayor si se sustituye el filtro por normalización MEDIA-2 y aparecen más candidatos.

**Propuesta:** preservar la selección por ID/country ya disponible y caracterizar casos de ambigüedad y literales especiales; no permitir que nueva clave convierta candidato en asociación. **Tamaño:** S–M. **Owner:** Catalog / Disc Write.

### P2 — Requests crea Disc sin verificar duplicidad

**Evidencia:** `RequestsService.approve` siempre guarda Disc tras resolver Artist; no consulta por título/Artist, y no hay unique constraint Disc. Test caracteriza la creación, no duplicado.

**Consecuencia:** aprobar solicitud de un lanzamiento ya existente crea otra fila. **Riesgo:** duplicación catalogal; no se demuestra falso rechazo ni asociación incorrecta. **Propuesta:** decidir separadamente si debe advertir, ofrecer candidato o permitir repetición; nunca rechazar solo por normalización. **Tamaño:** M. **Owner:** Community Requests (requiere decisión editorial).

### P2 — Import Excel usa criterio distinto y omite `ep`

**Evidencia:** nombre exacto case-sensitive, Artist ID y fecha solo si viene; `ep` no participa. Manual usa case-insensitive sin fecha. **Consecuencia:** resultados diferentes entre canales, posible falso duplicado cuando falta fecha o duplicado cuando difiere casing. **Propuesta:** aprobar política de import por fila y testear casos cruzados antes de armonizar. **Tamaño:** M. **Owner:** Catalog Import.

### P2 — National Releases selecciona sugerencia arbitraria

**Evidencia:** consulta `LEFT JOIN LATERAL`, `LIMIT 1`, sin `ORDER BY`. No escribe asociación. **Consecuencia:** UI puede mostrar un Disc de varios compatibles y sugerir una revisión equivocada. **Propuesta:** si MEDIA-3b.6b incluye Editorial, mostrar ambigüedad/lista o desempate determinista para revisión; no auto-link. **Tamaño:** S–M. **Owner:** Editorial National Releases; aprobar alcance aparte.

### P2 — Read-then-write puede duplicar en concurrencia

**Evidencia:** las consultas y saves están en transacciones, no hay lock por clave ni unicidad Artist/Disc. **Consecuencia:** dos importaciones/aprobaciones simultáneas pueden observar ausencia y crear dos filas. **Tipo:** riesgo estático; no reproducido. **Propuesta:** primero acordar identidad; luego prueba PostgreSQL aislada y protección apropiada sin unique de clave sola. **Tamaño:** M–L. **Owner:** cada flujo de escritura.

### P3 — Cobertura de colisiones insuficiente

Hay specs unitarios amplios pero la mayoría fija una única fila mock. Faltan homónimos, clave nueva equivalente, ediciones, tipos, ambigüedad y PostgreSQL concurrente. **Propuesta:** introducir los casos de §12 únicamente junto a cambios aprobados. **Tamaño:** S–M por flujo. **Owner:** dominio afectado.

## 14. Riesgos residuales y límites

- No se midió ocurrencia ni daño en datos; no se consultó producción ni base local.
- Los lectores candidate-only pueden mostrar candidatos ambiguos; solo se encontró el `LIMIT 1` de National Releases como selección arbitraria en la nueva ruta.
- Las claves legacy, los campos opcionales y errores por fila no forman política uniforme entre imports y Requests.
- Puntuación y variantes de artículo amplían igualdad de texto; no hay evidencia para usarlas como claves de unicidad.
- Spotify, Bandcamp, Last.fm enriquecimiento automático, reconciliaciones y CAT-DISC-4c quedan fuera de esta auditoría de identidad interna.

## 15. Correcciones mínimas recomendadas para MEDIA-3b.6b

### Catalog propio

1. Priorizar protecciones para `DiscWriteService.createWithArtist`: probar el límite entre búsqueda textual y asociación, preservar selección explícita/desambiguación ya existente y escapar metacaracteres donde el contrato los considere literales.
2. Definir el criterio de duplicado manual frente a álbum/EP, fecha/edición antes de cambiar consulta; caracterizar con tests y preservar respuesta por fila.
3. Añadir pruebas de ambigüedad en manual/Excel y no elegir `findOne` arbitrario; la corrección requiere política aprobada sobre error/revisión/country.
4. No añadir unicidad sobre `search_name_normalized` ni un servicio general de deduplicación.

### Otros dominios (no incluir automáticamente)

- **Requests:** decidir con Community cómo detener o revisar una aprobación cuando Artist es ambiguo y qué hacer con Disc candidato existente; no cambiar permisos/status/editorial sin aprobación explícita.
- **National Releases:** decidir si la sugerencia devuelve una lista/ambigüedad o mantiene un candidato único para revisión; preservar los checks y constraints de duplicado editorial.
- **Imports:** política coordinada de resultados por fila, sin reemplazar automáticamente entidades por key normalizada.
- **Spotify/Bandcamp/Last.fm y jobs:** mantenerlos en MEDIA-4–6/CAT-DISC-4c.1.

## 16. Estado y decisiones pendientes al cierre de 6a

MEDIA-3b.6 se separa: esta fase **6a está completada documentalmente**; **6b sigue pendiente de revisión/aprobación**, no iniciada. Propuesta inicial: limitar 6b a protecciones Catalog (casos `createWithArtist`, ambigüedad de import y decisión explícita de falso duplicado manual); tratar Requests y National Releases como subdecisiones de sus propietarios, sin ampliar 6b automáticamente.

Pendiente de aprobación:

1. ¿Pueden existir homónimos Artist como entidades válidas y qué datos permiten confirmarlos?
2. ¿Qué campos distinguen Disc duplicado para manual y Excel (Artist ID, título, fecha, `ep`, edición/ID externo)?
3. ¿Debe una aprobación de Requests con múltiples Artists o Disc candidatos pedir revisión, fallar, o continuar?
4. ¿National Releases debe mostrar todos los candidatos compatibles y conservar aprobación manual?
5. ¿Se incluye una prueba de concurrencia PG aislada en 6b, una vez fijada la política?

No es necesario resolver estas preguntas para cerrar la auditoría; sí antes de cambiar cada regla correspondiente.

## 17. Casos diferidos desde 6a

- MEDIA-3b.6b: protecciones mínimas aprobadas; pendiente en la fecha de cierre de la auditoría 6a. Su resultado se registra en la sección 19.
- MEDIA-3b.7: EXPLAIN y rendimiento PostgreSQL con datos/fixtures representativos; pendiente.
- MEDIA-3b.8: revisión de despliegue y cierre; pendiente.
- MEDIA-4–6: matching de Spotify/Bandcamp e integraciones/enriquecimiento; pendiente.
- CAT-DISC-4c.1b: decisiones/implementación de elegibilidad y medios, según roadmap propio; no iniciada.

## 18. Verificaciones de MEDIA-3b.6a

- Inspección documental de fuentes, entidades, migraciones y specs existentes; no se ejecutaron suites, build ni consultas PostgreSQL porque no se modificó SQL/código y la tarea es exclusivamente documental.
- Enlaces Markdown locales de los documentos cambiados comprobados; consistencia de estados revisada en los roadmaps.
- `git diff --check`: sin errores.
- Confirmación final de cambios limitada a seis documentos de roadmap: este informe y los cinco índices/roadmaps solicitados.

## 19. Implementación MEDIA-3b.6b — 2026-10-29

### Alcance y P1 abordados

La implementación se limitó a los tres riesgos de Catalog autorizados. No modifica Requests, Excel, National Releases, proveedores externos, entidades, migraciones, índices, contratos públicos ni reglas editoriales.

1. **`DiscWriteService.createWithArtist` — corregido en el ownership de Catalog.** La resolución exacta compara el nombre literalmente (case-insensitive) y ya no permite que `%`, `_` o `\\` amplíen la consulta. La búsqueda normalizada MEDIA-2 y el fallback legacy para clave `NULL` recuperan candidatos; un candidato normalizado no exacto nunca se reutiliza automáticamente. Si hay candidatos normalizados distintos del nombre literal, la operación conserva el error HTTP 400 existente y solicita revisión. Los múltiples nombres literalmente iguales mantienen el desempate por país existente. No se cambia el nombre original ni se fusionan artistas.
2. **Import manual — protección parcial del riesgo de identidad Artist y corrección del duplicado Disc.** La resolución recoge todos los candidatos legacy en vez de escoger el primero. Solo un candidato se reutiliza; varios requieren un país que identifique exactamente uno. Ambigüedad o coincidencia únicamente MEDIA-2 producen el resultado fallido por fila ya existente (`INVALID_INPUT`), sin escribir. No se modifica el contrato del resultado. El duplicado Disc ahora usa comparación literal case-insensitive de título, Artist ID y formato `ep`; la fecha no distingue automáticamente entidades porque puede representar reediciones. Álbum y EP con igual título pueden coexistir. No se infiere identidad de ediciones deluxe ni reediciones.
3. **Comodines y caracteres originales.** Las comparaciones de título usan igualdad literal SQL, por lo que `%`, `_` y `\\` no actúan como patrones. Las escrituras conservan los textos originales y las claves MEDIA-2 existentes.

### P1 que siguen abiertos

- **Requests:** `RequestsService.approve` mantiene el lookup ambiguo `findOne(nameNormalized)` y la aprobación actual. No se cambió por el límite explícito de no modificar aprobación/Community. Requiere una tarea de Community que defina cómo se expresa la selección o revisión sin inventar un contrato.
- **Import Excel:** mantiene la resolución legacy `findOne` y puede elegir un Artist entre homónimos. No se refactorizó el flujo Excel; necesita trabajo propio de Catalog Import con una decisión de resultado por fila compatible.
- **Regla de identidad del lanzamiento:** no se acordó una clave que resuelva fecha, formato, reedición y edición deluxe. El import manual conserva duplicado por Artist + título + formato, sin usar fecha. La diferencia de fecha por sí sola no permite crear otro registro.

Por tanto, quedan corregidos los riesgos directos de `createWithArtist` y del falso duplicado manual por título sin formato; la parte de Artist del import manual ya no selecciona arbitrariamente. **No se afirma que todos los P1 de la auditoría estén resueltos ni se cierra MEDIA-3b.6 global.**

### Riesgos residuales y concurrencia

- `createWithArtist` conserva el contrato 400 al no poder presentar una selección de candidatos; no se añadió endpoint, DTO ni respuesta. La fila manual conserva el contrato de error por fila.
- Lecturas y escrituras siguen siendo read-then-write. Sin restricciones únicas por nombre (que serían incorrectas para homónimos legítimos) o una decisión de locking local, una carrera aún puede crear duplicados. No se promete eliminación global de duplicados.
- La importación manual trata `ep IS NULL` como álbum (`false`) para compatibilidad; datos de formato desconocido pueden requerir revisión. La fecha no se usa como identidad.
- Claves normalizadas `NULL` solo se usan para recuperar candidatos mediante el fallback legacy; no habilitan reutilización automática cuando el nombre original no coincide literalmente.

### Pruebas y validación

- Tests unitarios de `DiscWriteService` e import manual cubren cero/uno/varios candidatos, homónimos, país, equivalencia Unicode `MOL`/`MØL`, variantes de artículo, entrada vacía, clave `NULL`, `%`/`_` literales, texto original, Album/EP y fecha distinta. También comprueban que no se guarda una asociación al candidato normalizado ambiguo.
- PostgreSQL 17 local aislado ejecutó **7/7** pruebas de `catalog-postgres.integration.spec.ts`, con fixtures sintéticos para colisiones normalizadas, comodines, claves `NULL`, títulos, formato y fechas. No se consultó producción ni se ejecutaron migraciones/backfill.
- En esta tarea pasaron los tests focalizados, Nest build, TypeScript `--noEmit`, ESLint y Prettier focalizados, gates estructural y de tipado seguro, y `git diff --check`. Los comandos `pnpm run quality:typecheck/structure/types` no terminaron correctamente por bloqueo de la base SQLite de pnpm; se ejecutaron directamente sus comprobaciones equivalentes, que pasaron. Prettier se ejecutó desde el binario local tras el mismo error de apertura SQLite de pnpm.
- No se cambió ningún contrato HTTP, permiso, regla de aprobación, esquema o dato histórico. No hay índices ni migraciones nuevos.

### Trabajo diferido y estado

Requests y Excel siguen pendientes en sus dominios; la sugerencia de National Releases con `LIMIT 1`, la creación de Disc durante Requests, las reglas editoriales y riesgos P2/concurrencia siguen intactos. No se inicia MEDIA-3b.7.

**Estado final:** protecciones aprobadas dentro de Catalog implementadas y verificadas. MEDIA-3b.6b queda completada **solo para su alcance Catalog**; MEDIA-3b.6 global conserva P1 abiertos en Requests y Excel. MEDIA-3b.7 y MEDIA-3b.8 siguen pendientes.
