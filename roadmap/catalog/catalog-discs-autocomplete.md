# CAT-DISC-5a — Auditoría del autocompletado de búsqueda

**Estado:** auditoría CAT-DISC-5a completada el 2026-10-29. Implementación backend CAT-DISC-5b completada el 2026-10-29; contrato y verificaciones registrados abajo. CAT-DISC-5c y 5d siguen pendientes y no se han iniciado.

**Alcance:** búsqueda de Catalog en la página de DiscList, sus seis modos, opciones, navegación a disco y contrato de sugerencias. El frontend se inspeccionó en el checkout hermano `../riffvalley-app-front`; el backend, en este repositorio. No se hicieron llamadas HTTP ni se accedió a producción.

## 1. Arquitectura actual

La ruta real de la vista es `/disc-list` (`name: DiscList`, protegida por sesión) y carga `src/modules/catalog/discs/presentation/views/DiscListView.vue`. No existe una ruta `/disc/list`; esa es la descripción funcional del brief, no el path implementado.

La vista compone el buscador superior, `DiscListExplorationFilters`, seis modos (`all`, `rates`, `covers`, `comments`, `favorites`, `pendientes`), orden, resultados y scroll infinito. `useDiscListCoordinator` conserva en estado local la búsqueda, modo, semana, país, géneros, orden y offset. El input llama directamente a `setSearchQuery`; cada cambio de texto actualiza la identidad de consulta, reinicia resultados/paginación y carga el listado en vivo con los filtros actuales. Las solicitudes de resultados y opciones usan generaciones e identidad de consulta para descartar respuestas obsoletas. La paginación es por `offset/limit`, con carga automática al acercarse al final.

La ruta no serializa búsqueda, filtros, modo ni página en la URL. El coordinador envía `query` como texto libre a `GET /api/discs/list`; las seis ramas de resultados reciben la búsqueda, aunque cada modo tiene su lector propietario. Las opciones se consultan aparte en `GET /api/discs/list/options` y dependen del contexto de modo y filtros.

El endpoint de lista y el endpoint de opciones no aceptan hoy un filtro `artistId`. La consulta general de Catalog aplica una búsqueda parcial normalizada sobre título de disco **o** nombre de artista. Las ramas personales de Rates, Covers, Comments, Favorites y Pendientes aplican el mismo criterio parcial en sus readers. Por tanto, convertir la selección de un artista en una cadena de búsqueda no representa una identidad inequívoca. El texto sigue siendo el criterio actual de búsqueda libre; las sugerencias serán una capa concurrente y no sustituirán ni retrasarán ese flujo.

## 2. Componentes y endpoints reutilizables

### Frontend

- `DiscListView.vue` contiene el campo superior con etiqueta accesible, limpieza y `setSearchQuery`; `DiscListExplorationFilters.vue` recibe y emite el mismo `searchQuery` para la vista compacta de filtros. El listado se actualiza mientras se escribe. En CAT-DISC-5c se debe conservar un único estado de texto y no rediseñar esos filtros.
- `useDiscListCoordinator.ts` ya coordina filtros, resultados, paginación y descartes de respuestas tardías; es el punto de integración apropiado para el artista seleccionado como criterio adicional y para el ciclo de vida independiente de sugerencias. Escribir continúa llamando al flujo de listado existente; abrir/cerrar o recibir sugerencias no debe reiniciar ni volver a solicitar el listado.
- `DiscListGenreSelect.vue` implementa combobox/listbox, selección con teclado, Escape y estados vacíos. `SearchableSelect.vue` también tiene patrón de lista y soporte de teclado, aunque tiene un API/estilo de selector de opciones finitas. No hay un componente de autocomplete remoto de dos secciones. Se pueden reutilizar convenciones accesibles y utilidades visuales, pero la lista de sugerencias requerirá una presentación específica.
- `DiscCardComponent.vue` abre `DiscDetail` como modal y proporciona `discData` con `id`, `name`, `image`, `releaseDate`, artista, enlace y medias. No se encontró una ruta frontend de ficha individual de disco.

### Backend

- `GET /api/artists/search/by-name?name=...` (`ArtistsController` → `ArtistSearchService.findByName`) busca con `buildMusicNamePartialPredicate` sobre las claves normalizadas, pero ordena alfabéticamente y devuelve todos los artistas coincidentes con sus discos, país y proyecciones de métricas. Hace una consulta de artistas y otra agrupada de discos; no es N+1, aunque el payload y el conjunto no son adecuados para el límite ligero del autocomplete.
- `GET /api/discs/list` y `/api/discs/list/options` implementan los seis modos. El primero requiere autenticación y valida query/filtros; ambos reciben el mismo contexto funcional. Sus contracts se encuentran en `src/catalog/discs/list/dto/disc-list-contracts.dto.ts`.
- `GET /api/discs/:id` delega en `DiscCatalogService.findOne`. Carga disco, artista/país, género, favoritos/usuarios, pendientes/usuarios y comentarios/usuarios; no conviene llamarlo por cada sugerencia ni usarlo para poblar el desplegable.
- `normalizeMusicName` y `buildMusicNamePartialPredicate` / `buildMusicNameMultiColumnPartialPredicate` son la reutilización adecuada para recuperar candidatos con variantes de escritura. `normalizeMusicName('MØL')` produce `mol`; la clave sirve para recuperación de candidatos y no establece identidad.

## 3. Contrato API y decisión CAT-DISC-5b

**Decisión implementada en CAT-DISC-5b:** usar un endpoint dedicado autenticado `GET /api/discs/list/suggestions?query=<texto>`. Se evaluó extender `GET /api/discs/list` con `includeSuggestions=true`, pero la vista hace una consulta de listado en vivo por cada cambio de texto y las sugerencias deben esperar un debounce independiente de unos 250 ms. Usar el mismo endpoint obligaría a escoger entre incluir sugerencias en cada consulta de lista (consultas prematuras y más costosas) o repetir la consulta de lista al terminar el debounce (consulta duplicada, con riesgo para offset, paginación y carga infinita). El endpoint dedicado evita volver a solicitar la página y mantiene intacto su contrato; añade una sola petición ligera por texto estable. Sus búsquedas comparten normalización, pero no duplican la carga/paginación del listado. No se mantienen ambas alternativas.

Catalog es ownership interno, no una familia pública de rutas; mantener la ruta bajo `/api/discs/list` evita introducir un namespace público nuevo. `DiscListSuggestionsService` consulta candidatos de artistas y discos en paralelo, con proyección acotada; no delega en `findByName`, que carga payload de artista y discos sin límites de autocomplete. La consulta de discos une Artist una vez para recuperar ID, nombre e imagen, sin N+1. Las sugerencias se buscan globalmente en Catalog, independientemente de modo, filtros y offset; no se derivan de la página actual.

Contrato implementado (sin envoltorio de paginación):

```json
{
  "artists": [{ "id": "uuid", "name": "MØL", "image": null }],
  "discs": [
    {
      "id": "uuid",
      "title": "Jord",
      "artistId": "uuid",
      "artistName": "MØL",
      "image": null
    }
  ]
}
```

`image` es anulable. No incluir descripciones, métricas comunitarias, relaciones de usuario, discos anidados ni entidades completas. Los discos deben estar disponibles para el catálogo público/listado (`releaseDate <= hoy`), sin filtrar por portada, enlace, `pinned` u otras reglas de elegibilidad pendientes de CAT-DISC-4c. Los artistas y discos son candidatos del catálogo por el texto y no dependen de modo, filtros ni offset; los filtros existentes siguen determinando las tarjetas mostradas. Límites invariables: máximo 3 artistas y 5 discos. Sin parámetros de límite ni campos de paginación. Si `query` está ausente, vacío o queda por debajo del umbral normalizado, responder con `{ "artists": [], "discs": [] }` sin ejecutar consultas.

La consulta trata el texto como literal escapado para `LIKE`, normalizado con la infraestructura compartida y con fallback acotado para registros legacy cuya clave normalizada sea `NULL`. El mínimo son dos caracteres Unicode después de `trim` y normalización; una entrada ausente o menor devuelve secciones vacías sin consultar repositorios. Las lecturas no escriben entidades ni crean asociaciones. `GET /api/discs/list` conserva exactamente su envelope actual (`totalItems`, `totalPages`, `currentPage`, `limit`, `data`), sus criterios y su paginación; no recibe `includeSuggestions`.

## 4. Flujo de selección de artistas

La selección debe guardar `selectedArtist = { id, name }` y filtrar mediante `artistId` (UUID validado), nunca reemplazar `query` por `name`. El texto escrito se conserva y sigue aplicando su búsqueda general en vivo; el `artistId` añade precisión de identidad y el backend debe propagarlo a resultados y opciones de los seis modos, usando la relación/columna de artista existente. Es un criterio adicional combinable con texto, fecha, país, género, orden y modo. La selección debe reiniciar el offset y la página visible como hace cualquier criterio nuevo, conservar scroll infinito y demás filtros, y descartar resultados anteriores por la identidad/generación existente.

Al seleccionar una sugerencia, mantener el texto libre y mostrar el artista elegido como selección removible junto al campo o dentro de él, sin cambiar su valor textual. Como la sugerencia se obtuvo a partir de ese texto, la consulta existente ya acepta coincidencias en el nombre del artista; `artistId` evita que otros artistas con claves equivalentes se mezclen. Al retirar la selección, el listado continúa con el texto y los filtros que estaban activos. Si se edita el texto después de la selección, puede limpiarse la selección de artista para evitar una combinación sorprendente, pero la búsqueda libre nunca se detiene. «Ver todos los resultados» limpia solo una selección de artista activa y conserva el texto; sin esa selección, cierra el menú sin volver a cargar la lista. Enter sin opción activa conserva el texto y los resultados en vivo, pudiendo cerrar el menú sin emitir una petición de listado redundante. Enter con una sugerencia activa selecciona esa opción.

`MØL` debe filtrarse por su ID exacto. Si existen artistas con nombres equivalentes normalizados, siguen siendo sugerencias distintas con IDs distintos; elegir una no debe combinar sus discos. La normalización recupera candidatos; la selección por ID define a qué artista se refiere la acción. No proponer unicidad nueva ni asociar registros por coincidencia textual.

El estado del artista seleccionado sería local en CAT-DISC-5c, igual que los filtros actuales: hoy la URL no persiste ni restaura búsqueda, modo, filtros o paginación. Si más adelante se decide hacer compartibles las búsquedas, habrá que diseñar serialización de `artistId` expresamente; esta auditoría no propone cambiarla.

## 5. Navegación a discos

En el frontend actual no existe una página o ruta de ficha individual. La acción de una tarjeta usa el modal `DiscDetail`, por lo que la opción disponible hoy para «navegar directamente a su ficha» es abrir ese modal directamente desde la sugerencia para el ID elegido y cerrar el desplegable. El handoff debe reutilizar el mismo comportamiento de detalle y sus datos mínimos, no navegar a una ruta inventada ni montar una tarjeta completa para simular el clic.

Antes de CAT-DISC-5c, confirmar en el componente/modal su fuente de datos y si requiere `link` además de `id`, `name`, `image` y artista. No cargar el `GET /api/discs/:id` actual por cada sugerencia: su respuesta incluye relaciones comunitarias. Si no se puede abrir `DiscDetail` de forma directa con la proyección existente, documentar una carga única al seleccionar, separada de la API de sugerencias; no ampliar el payload de sugerencias con relaciones completas.

## 6. Orden de relevancia y límites

Aplicar ranking determinista dentro de cada sección, con límite 3/5 separado:

1. Coincidencia exacta de clave normalizada.
2. Prefijo normalizado.
3. Coincidencia parcial normalizada.
4. Desempate estable por nombre visible y luego ID.

Para discos, priorizar coincidencia en título sobre coincidencia únicamente en artista; si no hay suficientes títulos candidatos, completar con discos cuyo artista coincide. No mezclar artistas y discos en un ranking común porque la UI tiene secciones fijas. La clave normalizada compartida permite que `mol` recupere `MØL`; no se debe inferir identidad desde este orden.

`buildMusicNameSuggestionRank` parametriza rangos compartidos: coincidencia exacta normalizada, prefijo y coincidencia parcial; luego evalúa las variantes opcionales de artículos. Para discos, en cada calidad de coincidencia el título precede al nombre del artista. El nombre visible y el UUID resuelven empates determinísticamente. Las dos consultas aplican límites fijos 3/5 con orden explícito antes de limitar. No hay deduplicación por nombre normalizado: candidatos con IDs distintos siguen siendo distintos. No se introducen búsqueda difusa, reglas de identidad, migraciones ni índices.

## 7. Estados UX y accesibilidad

- Debounce de aproximadamente 250 ms después de la última entrada únicamente para la petición de sugerencias. El listado conserva su actualización en vivo actual al escribir y no espera ese debounce.
- Umbral recomendado: 2 caracteres tras `trim` y normalización. Reduce resultados amplios en una búsqueda parcial; `mol` satisface el umbral. Enter/«Ver todos los resultados» conserva la búsqueda general incluso con menos caracteres.
- Con menos del umbral, no pedir sugerencias y cerrar/limpiar la lista. Cancelar el timer y abortar la solicitud anterior cuando sea posible; además comparar una generación o texto normalizado vigente antes de aplicar una respuesta, como protección frente a clientes/transporte sin cancelación efectiva.
- Estados explícitos: carga (`role=status`, texto breve y spinner decorativo), vacío (mensaje único si ambas secciones están vacías), error (mensaje y opción de reintento; no bloquear Enter ni la búsqueda actual), y resultados agrupados bajo «Artistas» y «Discos». Una sección vacía se puede omitir; mantener la acción «Ver todos los resultados» cuando el texto sea válido.
- Input con nombre accesible persistente y `role=combobox`, `aria-autocomplete=list`, `aria-expanded`, `aria-controls` y `aria-activedescendant`. Una única `listbox` con grupos `role=group` y nombres accesibles, opciones `role=option` con `aria-selected`; no anidar dos listboxes ni convertir encabezados/estados en opciones.
- Flechas arriba/abajo mueven el activo entre las opciones de ambas secciones; Enter selecciona la opción activa o, sin activa, ejecuta búsqueda general; Escape cierra sugerencias y devuelve el foco al input. Ratón y toque activan la misma selección; opciones con altura táctil suficiente y sin depender de hover.
- En móvil, desplegable dentro del ancho del buscador, scroll vertical limitado a la lista y texto de título/artista truncado sin ocultar el foco. No alterar el diseño de filtros ni la interacción del panel responsive existente.

## 8. Riesgos y compatibilidad

- **Identidad ambigua:** las coincidencias normalizadas/contains no son únicas. El ID del artista debe ser el filtro seleccionado y permanecer intacto hasta deselección; nunca convertir la coincidencia textual en asociación.
- **Seis modos y opciones:** añadir `artistId` solo a `all` dejaría incoherentes las bibliotecas personales y sus contadores/opciones. Hay que propagarlo por criterios, DTOs y cinco readers personales además del catálogo, junto con consulta de opciones.
- **Carga y límites:** el listado ya hace una búsqueda normalizada en vivo mientras se escribe. Las sugerencias añaden lecturas para devolver candidatos específicos; reutilizar el endpoint de Artist por nombre devolvería todo el catálogo asociado a coincidencias y más datos de los necesarios. Mantener un endpoint de sugerencias ligero evita volver a pedir el listado, pero no elimina el trabajo SQL compartido por ambas consultas. Derivar sugerencias del resultado paginado actual reduciría una llamada en algunos casos, aunque omitiría artistas/discos por modo, filtros y límite de página. Se recomienda no refactorizar ni ampliar el contrato del listado en 5a; en 5b comparar el coste de las consultas acotadas y considerar reutilizar internamente predicados/proyecciones, sin una segunda solicitud de lista por causa del desplegable.
- **Detalle:** no hay ruta de ficha; el modal actual usa datos del disco y consulta información de Spotify. La selección debe confirmar datos necesarios y evitar el endpoint de detalle sobredimensionado para la lista de sugerencias.
- **Compatibilidad:** mantener intacto `query` para la búsqueda en vivo y Enter, y añadir el filtro UUID como parámetro opcional. Sin selección, petición y respuesta actuales no cambian. La selección añade un criterio sin retirar texto, filtros ni modo. No cambiar el estado de URL, los filtros existentes, la paginación más allá del reinicio normal al cambiar criterios ni la autenticación general de la lista.
- **Normalización:** soportar datos cuya clave nueva sea `NULL` con el fallback existente. Las claves normalizadas son auxiliares de búsqueda; cualquier desalineación de datos es asunto de candidatos, no permiso para escribir/normalizar entidades en tiempo de lectura.
- **Búsqueda obsoleta:** tecleo rápido, cierre del menú, cambio de modo/sesión o selección mientras llega una respuesta pueden producir resultados fuera de contexto; cancelar y descartar por identidad/generación antes de pintar.
- **Verificación:** frontend y backend viven en repositorios separados. Las pruebas de contrato deben comprobar orden/límites, `mol` → `MØL`, filtro exacto por ID en los seis modos, filtros combinados, estado vacío/error, teclado y descarte de respuestas obsoletas. No se ejecutaron pruebas en esta auditoría.

## 9. Plan posterior

- **CAT-DISC-5b — Backend (completada el 2026-10-29):** endpoint dedicado autenticado de sugerencias con límites fijos, ranking y proyección. Implementación y verificaciones abajo. El listado existente y sus seis modos no cambian. La propagación de `artistId` para filtrar el listado queda como parte backend coordinada de CAT-DISC-5c antes de conectar la selección del frontend; no se empezó en 5b para mantener esta entrega limitada a sugerencias.
- **CAT-DISC-5c — Frontend:** añadir wrapper tipado y autocomplete agrupado bajo el campo actual; debounce de sugerencias, teclado/ARIA, cancelación y estados. La entrada sigue actualizando en vivo el listado existente y no provoca una segunda carga de resultados al aparecer/cerrar sugerencias. Integrar selección por ID como criterio adicional y modal de detalle; preservar Enter sin opción activa, «Ver todos los resultados», filtros, URL, paginación y seis modos.
- **CAT-DISC-5d — Regresión y cierre:** comprobar contratos backend y wrappers frontend, selección exacta MØL, seis modos con filtros combinados, límites/orden, carrera y cancelación, accesibilidad de teclado y uso móvil; verificar la navegación al detalle, documentar limitaciones entre repositorios y cerrar CAT-DISC-5 solo tras evidencia.

## Verificación de CAT-DISC-5a

Auditoría de solo lectura de los archivos y rutas indicados en las secciones anteriores; sin tráfico de red, base de datos o producción. Se validan enlaces Markdown y `git diff --check` al cierre de la tarea.

## Implementación y verificación de CAT-DISC-5b

- **Endpoint:** `GET /api/discs/list/suggestions?query=<texto>`, autenticado por la protección de `DiscsController`. Responde `{ artists, discs }`; no cambia el contrato de `GET /api/discs/list` ni agrega `includeSuggestions`.
- **Campos:** artista `{ id, name, image }`; disco `{ id, title, artistId, artistName, image }`. La sección determina el tipo de candidato; `image` puede ser `null`. No se cargan relaciones comunitarias ni entidades completas.
- **Consultas:** `DiscListSuggestionsService` reutiliza `normalizeMusicName`, `buildMusicNamePartialPredicate`, `buildMusicNameMultiColumnPartialPredicate`, `getMusicNameSearchKeys` y `escapeLikeLiteral`. Ejecuta una lectura acotada de artistas y una lectura de discos con join único a Artist; la segunda mantiene la visibilidad vigente del catálogo mediante `releaseDate <= hoy`. No usa la página, modo o filtros del listado.
- **Pruebas:** suites focalizadas de controller, DTO, listado, servicio de sugerencias y ranking: 53 pruebas aprobadas. Jest completo: 2.350 aprobadas, 0 fallidas y 127 omitidas, en 239 suites aprobadas y 20 omitidas. El test PostgreSQL aislado se añadió con activación explícita, pero no se ejecutó porque no estaba disponible su servidor local de pruebas en `127.0.0.1:55432`; no hubo conexión a producción.
- **Calidad:** typecheck directo aprobado; structural, type-safety, ESLint y typecheck quality gates aprobados; Nest build y runtime dependency check aprobados; ocho suites de pruebas de los quality gates aprobadas; `git diff --check` pendiente al cierre. `pnpm run verify` no pudo arrancar porque el entorno local de pnpm devolvió `unable to open database file`; se ejecutaron directamente sus controles aplicables.
- **Límite pendiente:** el SQL no se validó contra PostgreSQL en esta sesión por falta del servidor aislado. El test de integración queda listo para ejecutarse en ese entorno antes del cierre global si se requiere evidencia SQL real. La interfaz CAT-DISC-5c deberá llamar a este endpoint tras su debounce independiente, conservar el flujo de listado en vivo y consumir el payload ligero descrito arriba.
