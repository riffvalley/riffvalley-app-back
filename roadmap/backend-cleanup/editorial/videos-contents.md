# Backend Cleanup — Editorial: Videos y Contents

**Navegación:** [índice Backend Cleanup](../README.md). Anterior: [Articles, Asignations y Lists](articles-asignations-lists.md). Siguiente: [Reunions, Points y Playlists](reunions-playlists.md).

## BC-LNK-1 — Retirar el módulo editorial Links

- **Estado:** retirado (2026-10-16). Es una baja funcional del módulo, no un cleanup completado. No se avanza a otro módulo de Editorial; Videos y Contents siguen pendientes.
- **Inventario y consumers:** `LinksModule`, controller, service, entidad, DTOs y spec exclusivo vivían en `src/editorial/links/`; `AppModule` lo registraba y el spec de autorización global fijaba sus mutaciones. Lists era la única entidad relacionada: `Link.list` tenía `ON DELETE CASCADE` y `List.links` era `eager` + `cascade`. Contents, Videos y Asignations no importaban Links ni consumían su servicio. En frontend se buscaron referencias ejecutables en `src/`: no hay llamadas a `/links` ni lecturas de `list.links`; el frontend sí consulta `/lists` y consume Asignations. No se encontraron otros imports, fixtures ni scripts del dominio.
- **Contrato observado:** Lists incluía `links` en sus respuestas por la relación eager. La UI actual no lee esa propiedad; retirar la relación elimina ese campo observable de Lists. No se encontraron consumers funcionales conocidos, por lo que la retirada sigue desbloqueada; se conserva el resto del contrato y la lógica de Lists.
- **Contract finding:** **Current behavior:** las lecturas de Lists incluyen `links` por eager loading. **Problem:** se emite una colección de un módulo retirado; el frontend actual no la consume. **Impact:** backend-only según consumers inspeccionados. **Options:** (1) preservar el payload requeriría mantener datos/representación artificial; (2) refactor interno no puede conservar la relación tras borrar la tabla; (3) retirar el campo junto con el contrato Links; (4) coordinar frontend/backend si apareciera un consumer del frontend. **Recommendation:** opción 3, porque no hay consumer funcional conocido. **Blocks the current task:** No.
- **Enlaces homónimos preservados:** no se tocaron los campos `link` de Disc, NationalRelease, Article o Riff Valley Playlist, ni las URLs de WordPress/Spotify/Telegram ni los endpoints de vinculación de playlists.
- **Esquema:** `link` es la tabla propia de la entidad. La relación conocida crea una FK saliente `link.listId → list.id` con `ON DELETE CASCADE`; no hay entidades que apunten a Link. La migración nueva `1791940000000-RemoveEditorialLinks.ts` elimina la tabla sin `CASCADE`, de modo que PostgreSQL rechazará dependencias entrantes inesperadas. Su `down` recrea columnas y FK, pero no recupera filas eliminadas por `up`; no se borraron datos adicionales. La migración está pendiente y no se ejecutó.
- **Archivos retirados:** módulo, controller, service, entidad, DTOs de creación/actualización y spec del controller bajo `src/editorial/links/`. Se retiraron el registro en `AppModule`, la relación de `List` y los casos/imports de autorización del controller eliminado. No se cambió la lógica de Lists, Contents ni Videos. Se conservaron intactos los cambios locales preexistentes del checkout.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/lists src/editorial/contents/contents.service.spec.ts src/editorial/contents/contents.controller.spec.ts src/identity/auth/__tests__/domain-mutation-authorization.spec.ts` — 14 suites, 271 tests y 2 snapshots aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; comprobación estática con reflect-metadata confirma ausencia de LinksModule en `AppModule`, de tabla `link` y de relación `List.links`; búsqueda de imports/clases obsoletos en `src`, `test` y `scripts`; Prettier focalizado; `git diff --check`. El frontend se inspeccionó en solo lectura para inventariar consumers y no se modificó. No se ejecutaron migraciones ni se accedió a PostgreSQL o servicios externos.

## BC-VID-0 — Auditoría del módulo editorial Videos

- **Estado:** auditoría y cleanup completados (2026-10-16); BC-VID-1, BC-VID-2, BC-VID-3, BC-VID-5, BC-VID-6 y BC-VID-7 completadas; BC-VID-4 completó la auditoría contractual. Videos queda **completado** y Contents sigue pendiente. No se avanza a otro módulo.
- **Base y alcance:** rama actual del backend, checkout limpio al inicio. Lectura completa de `src/editorial/videos/`, composición en `AppModule`, relación con Lists y Contents, migraciones locales relevantes, autorización global y specs consumidores. Se inspeccionaron en solo lectura los consumidores directos disponibles en `riffvalley-app-front`; no se modificó ese repositorio. TikTok es una integración independiente y no forma parte de este módulo.
- **Inventario:** `VideosModule` registra `Video`, `VideosController` y `VideosService`; importa Auth, Lists y Contents (este último con `forwardRef`) y exporta VideosService/TypeORM. `Video` tiene `ManyToOne` nullable a User (`user`) y Editor (`editor`) y a List; `Content` es `OneToOne` inversa y conserva el FK único `content.videoId`. El servicio contiene CRUD, filtros, creación de List y creación explícita de Content; no hay integración externa propia.
- **Rutas/contratos:** bajo `/api/videos`, `GET /` lista `Video[]` (default limit 50, máximo 200, offset 0, orden `updatedAt DESC`; filtros `q`, `status`, `type`, `desde`, `hasta`, `userId`); `GET /:id` obtiene detalle; `POST /` crea; `PATCH /:id` actualiza; `DELETE /:id` elimina; `POST /:id/list` crea y vincula una List VIDEO; `POST /:id/content` crea un Content de backlog. Los GET son públicos; todas las mutaciones requieren `riffvalley` (también admite `superadmin` por el guard común). Los IDs de ruta pasan `ParseUUIDPipe` versión 4. DTOs validan enums, longitud del nombre, fechas ISO, UUIDs de escritura y límites de paginación. El filtro `userId` solo valida string y no hay validación cruzada de `desde`/`hasta`.
- **Responsabilidades y dependencias:** las fechas/estados y el catálogo de videos pertenecen a Videos; las Listas VIDEO y sus fechas/calendario son propiedad de Lists y Videos delega la creación a `ListsService.createVideoList`. Videos devuelve la List relacionada en sus consultas y usa Lists para vincularla. El endpoint de Content delega a Contents, crea un backlog sin fecha y exige un usuario asignado; no hay sincronización posterior de estados. Contents también puede crear una entidad Video al crear un Content tipo VIDEO, como comportamiento propio de Contents. Videos bloquea eliminar una entidad que ya tenga Content asociado. No se identificó ciclo Nest: Contents no importa VideosModule ni inyecta VideosService; consume el repositorio de Video. El `forwardRef` de Contents desde Videos no corresponde a una dependencia inversa encontrada.
- **Consumers frontend:** `src/services/videos/videos.ts` llama las rutas de CRUD/list/content. `VideosKanban.vue` consume lista, asignaciones, fechas, estado, creación de Lists y Content; `ContentCalendar.vue` y `VideoActionsModal.vue` actualizan videos asociados a Content. La pantalla del tablero solo necesita el ID de List para navegar, aunque actualmente también consulta `video.list?.id` como fallback. El calendario de Lists VIDEO permanece en el módulo Lists.
- **Persistencia y efectos:** `findAll` y `findOne` cargan explícitamente `user`, `list`, `editor` y `content`. List declara `asignations` eager y Asignation declara `user`/`disc` eager, por lo que la relación List puede ampliar el payload de Video con asignaciones y sus entidades. La migración histórica deja FKs de Video a Users/List y de Content a Video con `NO ACTION`; el borrado de Video comprueba primero Content y después elimina. `createListForVideo` guarda List y luego Video en dos operaciones independientes, sin transacción. La creación explícita de Content solo persiste Content y su FK hacia Video.
- **Pruebas existentes:** no hay specs propios en `src/editorial/videos/`. `domain-mutation-authorization.spec.ts` fija rutas y rol mínimo para las mutaciones de Videos y evalúa el guard común; no cubre llamadas HTTP o respuestas. Tests de Lists prueban `createVideoList` aislado, no su coordinación desde Videos. Tests de Contents cubren el ciclo de creación automática de Video desde Content, no los endpoints de Videos. No se ejecutaron pruebas.

### Hallazgos demostrados

#### VID-F1 — La creación omite los invariantes que sí aplica el cambio de estado (**resuelto por BC-VID-1**)

- **Evidencia:** `src/editorial/videos/videos.service.ts` (create, líneas 53–67; update, 141–158) y `src/editorial/videos/dto/create-video.dto.ts` (status requerido, userId/updateDate opcionales). `update` rechaza pasar a `editing`/`ready` sin usuario y a `published` sin `updateDate`; `create` guarda cualquier combinación válida por enum sin ejecutar esas reglas.
- **Impacto/categoría:** bug funcional, prioridad media, tamaño S. La API permite crear videos en estados que su propia transición equivalente rechazaría, incluidos `published` sin fecha o `editing`/`ready` sin usuario.
- **Propuesta:** aplicar al alta las mismas precondiciones de estado que al cambio, con errores 400 coherentes y pruebas de casos válidos/inválidos. Mantener permisos, DTO y shape HTTP.

#### VID-F2 — IDs relacionados inexistentes llegan directamente a persistencia (**resuelto por BC-VID-2**)

- **Evidencia:** `create` asigna referencias `{ id }` para User, Editor y List y `update` hace lo mismo para User/Editor/List sin resolverlas previamente (`videos.service.ts`, 53–65 y 120–135). La migración `1770800000000-CreateVideoEntity.ts` crea FKs para las tres relaciones y la migración posterior mantiene las FKs como `NO ACTION`. El servicio no captura ni traduce errores de `repo.save` en esas rutas.
- **Impacto/categoría:** bug funcional, prioridad media, tamaño S. Un UUID sintácticamente válido que no exista falla al guardar en vez de producir un `NotFoundException`/404 claro; el error de persistencia no traducido se convierte en error 500. Afecta altas y asignaciones/cambios de relación.
- **Resolución:** Videos traduce a 404 los errores PostgreSQL `23503` solo si la tabla es `video` y el constraint coincide con las FKs conocidas de `userId`, `editorId` o `listId`. Se conservan `null`/omitido como antes y no se agregan consultas de existencia; los errores con otra tabla, constraint o SQLSTATE se propagan.

#### VID-F3 — La creación de List VIDEO y su asociación a Video no es atómica (**resuelto por BC-VID-3**)

- **Evidencia:** `createListForVideo` llama a `ListsService.createVideoList` (que persiste la List en `ListCrudService`) y después guarda la relación en `repo.save(video)` en una operación separada (`videos.service.ts`, 183–200). No comparte `EntityManager` ni compensa el primer save si el segundo falla. La fachada actual de Lists no acepta manager en `createVideoList`.
- **Impacto/categoría:** bug funcional de consistencia, prioridad media, tamaño S. Si falla el segundo guardado después de crear la List, queda una List VIDEO huérfana que el usuario no puede alcanzar desde el Video.
- **Resolución:** `VideosService.createListForVideo` abre una transacción desde el manager del repositorio Video, bloquea y carga el Video dentro de ella, y pasa el mismo `EntityManager` a `ListsService.createVideoList`. La creación de List y el guardado de Video usan repositorios obtenidos de ese manager; cualquier fallo revierte ambas escrituras. El lock evita crear listas duplicadas en peticiones concurrentes. El log de ListCrud queda fuera de la transacción.

#### VID-F4 — El endpoint no permite limpiar User o Editor aunque la UI ofrece esa acción

- **Evidencia:** `VideosKanban.vue` asigna `undefined` al seleccionar vacío y envía `userId: undefined`/`editorId: undefined`; JSON omite esos campos. El backend solo reasigna al recibir un valor truthy (`videos.service.ts`, 120–128), por lo que responde sin error y conserva la relación en base de datos. El frontend queda optimistamente sin asignación hasta que recarga.
- **Impacto/categoría:** contrato funcional backend + frontend. Es una acción visible que aparenta completarse y se revierte tras refrescar.
- **Opciones:** preservar el contrato actual (la UI no debe ofrecer limpiar); refactor interno del backend no puede inferir un campo omitido; cambiar el contrato para que null signifique limpiar; coordinar ambas partes para enviar/aceptar null.
- **Recomendación:** coordinar un cambio backend/frontend donde `null` limpie y la omisión conserve, pero confirmar primero si User debe seguir siendo obligatorio mientras el Video permanece en `editing`/`ready`, o solo al entrar en esos estados como aplica BC-VID-1. Propuesta de trabajo: BC-VID-5.

#### VID-F5 — El campo `link` sigue en el frontend pero ya no existe en Video

- **Evidencia:** la entidad y DTOs backend no declaran `link`; la migración `1770829235721-RemoveVideoLink.ts` elimina la columna. El frontend todavía modela `link`, muestra el campo en `VideosKanban.vue` y lo envía al crear/editar; `VideoActionsModal.vue` y `ContentCalendar.vue` también lo reenvían. La validación global de `main.ts` prohíbe propiedades no declaradas, por lo que una petición que incluya un link produce 400; no puede persistirse.
- **Impacto/categoría:** frontend; la interfaz presenta un campo no soportado por el modelo/contrato actual y, si tiene valor, puede impedir guardar por `forbidNonWhitelisted` en el pipe global.
- **Opciones:** (1) preservar compatibilidad requeriría restaurar el campo en el backend y migrar esquema; (2) refactor interno no puede hacer persistible un campo ausente; (3) restaurar el contrato HTTP para Video; (4) coordinar cambios en ambos repositorios. La alternativa de menor alcance es retirar el campo solo de Video en frontend.
- **Recomendación:** proponer BC-VID-6 frontend-only para retirar `link` de tipos, formularios, vistas y payloads Video; mantener intactos `Article.link` y enlaces de otros dominios. La UI actual no ofrece una capacidad funcional soportada por backend.

#### VID-F6 — La respuesta de Video carga una relación List más amplia de lo que usa el consumer conocido

- **Evidencia:** `Video.list` no es eager, pero `VideosService.findAll` y `findOne` solicitan explícitamente `list`. `List.asignations` es eager y Asignation carga eager `user` y `disc`, ampliando cada Video con la lista y potencialmente todas sus asignaciones. `VideosKanban` solo requiere el ID: usa `listId` y normaliza desde `list.id`; la respuesta de `POST /videos/:id/list` también se lee solo para `response.list.id`. `VideoListDetalle` carga List y Asignations desde sus propios endpoints. `ContentsService.findAll/findOne` carga `video`, `video.user` y `video.editor`, pero no `video.list`.
- **Impacto/categoría:** contrato y posible sobrecarga de payload/consultas; el tamaño real no se midió y los consumidores externos no están confirmados. El frontend tipa `listId`, pero no `list`, y el workaround evidencia que el contrato de Video no entrega directamente el campo escalar declarado.
- **Opciones:** (1) preservar el payload actual; (2) limitar internamente la carga pero conservar `list:{id}`; (3) cambiar a un `listId` escalar y adaptar los consumidores conocidos; (4) coordinar backend/frontend tras revisar posibles consumidores externos. Ninguna reducción debe eliminar `list` sin tratarla como cambio observable.
- **Recomendación:** propuesta BC-VID-7: caracterizar el payload y confirmar consumers antes de decidir entre `list:{id}` mínimo o `listId`; medir una respuesta representativa si se prioriza la reducción. Preservar el contrato hasta esa decisión.

### Tareas propuestas

#### BC-VID-1 — Aplicar invariantes de estado también al crear Videos

- **Estado:** completada (2026-10-16); hallazgo VID-F1 resuelto; prioridad media; tamaño S.
- **Alcance:** validar en `VideosService.create` las precondiciones de estado ya impuestas en `update`, sin duplicar ni debilitar las reglas existentes. Mantener rutas, roles, DTOs y payloads.
- **Exclusiones/dependencias:** no sincronizar estados con Content; no modificar Contents, Lists, frontend, esquema ni migraciones.
- **Aceptación:** creación `editing`/`ready` sin User y `published` sin `updateDate` devuelve 400; combinaciones válidas persisten y mantienen la respuesta actual; tests de servicio fijan ambas clases de casos.
- **Implementación:** `VideosService` comparte una sola validación entre POST y las transiciones de PATCH. POST exige User para `editing`/`ready` y `updateDate` para `published`; no se exige Editor. PATCH conserva la comprobación únicamente al cambiar de estado y sigue exigiendo una fecha explícita al publicar, incluso si el Video ya tenía fecha. `status` no tiene valor por defecto y sigue siendo obligatorio en POST; los campos opcionales omitidos/null conservan su comportamiento anterior. Contents sigue creando Videos `editing` con User y fecha, sin cambios en su implementación.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts src/editorial/contents/contents.service.spec.ts` — 2 suites, 40 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a `videos.service.ts`, `videos.service.spec.ts` y `contents.service.spec.ts`; `git diff --check` aprobado. No se accedió a PostgreSQL ni servicios externos.

#### BC-VID-2 — Traducir referencias relacionadas inexistentes

- **Estado:** completada (2026-10-16); hallazgo VID-F2 resuelto; prioridad media; tamaño S.
- **Alcance implementado:** en POST/PATCH, traducir a 404 las violaciones FK conocidas para User, Editor y List; preservar omisión/null según el contrato vigente y no añadir consultas de existencia.
- **Exclusiones/dependencias:** no modificar módulos/contratos de Lists o Contents, esquema/migraciones ni frontend. Implementar solo la validación del lado Videos.
- **Aceptación:** IDs válidos siguen asignándose; UUIDs inexistentes generan 404 estable solo para las FKs conocidas de `video`; null/omitido conserva su semántica; errores de validación siguen en 400 y fallos de persistencia no relacionados se propagan sin filtrar datos del driver.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts src/editorial/contents/contents.service.spec.ts` — 2 suites, 55 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a `videos.service.ts` y `videos.service.spec.ts`; `git diff --check`. No se accedió a PostgreSQL ni servicios externos.

#### BC-VID-3 — Hacer atómica la creación de List VIDEO desde Video

- **Estado:** completada (2026-10-16); hallazgo VID-F3 resuelto; prioridad media; tamaño S.
- **Alcance implementado:** componer creación de List VIDEO y asociación a Video con el mismo `EntityManager` transaccional; extender de forma opcional y compatible la fachada de Lists y su servicio CRUD para aceptar el manager.
- **Exclusiones/dependencias:** Lists permanece completado y no se reorganiza; no cambiar los defaults, nombres, rutas, permisos, respuesta, Content ni publicación externa.
- **Aceptación:** éxito persiste List VIDEO y FK de Video; fallo al crear List no modifica Video; fallo al guardar Video revierte la List; los errores y defaults actuales se conservan; Video se bloquea durante la comprobación para evitar duplicados concurrentes.
- **Verificaciones ejecutadas:** `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts src/editorial/lists/application/__tests__/list-crud.service.spec.ts src/editorial/contents/contents.service.spec.ts` — 3 suites, 82 tests aprobados; `yarn --ignore-engines build`; `yarn --ignore-engines exec tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; revisión de wiring confirma que Videos importa Lists y que Lists no importa Videos; Prettier limitado a los archivos de Videos y Lists modificados; `git diff --check`. No se accedió a PostgreSQL ni servicios externos.

**Verificaciones BC-VID-0:** revisión estática de implementación, entidades, DTOs, wiring Nest, migraciones locales, autorización y specs pertinentes; búsqueda de consumidores frontend en solo lectura. Solo se actualizó `roadmap/backend-cleanup.md`. No se ejecutaron tests, build, typecheck ni se accedió a PostgreSQL o servicios externos. `git diff --check -- roadmap/backend-cleanup.md` se ejecutará al cierre.

## BC-VID-4 — Auditoría de contratos frontend/backend de Videos

- **Estado en ese cierre intermedio:** auditoría completada (2026-10-16); no se modificó código ni pruebas. Videos permanecía **en cleanup** antes de cerrar BC-VID-7; Contents y el resto de módulos permanecían pendientes.
- **Base y alcance:** inspección de solo lectura de los dos repositorios en la rama `refactor/editorial`. El backend contiene cambios locales previos de BC-VID-1/2/3 y Contents spec; el frontend también tiene cambios locales, incluido `.impeccable/config.json` y un cambio en `services/contents/contents.ts` que solo retira `ContentList.free`, sin relación con Video. Se conservaron todos. No se encontró `AGENTS.md` en la raíz ni dentro del frontend.
- **Verificaciones:** no se ejecutaron tests, build ni typecheck; no se accedió a PostgreSQL ni servicios externos. `git diff --check -- roadmap/backend-cleanup.md` se ejecutó tras documentar los hallazgos.

### Contract finding — Desasignación de User y Editor

- **Current behavior:** `VideosKanban.vue` y `VideoActionsModal.vue` muestran opciones vacías para User y Editor. Al seleccionarlas, el frontend convierte el valor a `undefined`; `ContentCalendar.vue` reenvía esos valores y la serialización JSON omite las propiedades. `UpdateVideoDto` hereda `@IsOptional`, que permite `null`, pero `VideosService.update` solo asigna User/Editor si sus IDs son truthy. Por tanto, `null` y omisión no cambian la relación y la UI puede aparentar que limpió la asignación hasta que se recarga.
- **Problem:** no se puede desasignar desde las dos superficies de edición. La entidad TypeORM declara ambas relaciones `nullable: true`; la limitación está en el payload y en la rama PATCH, no en el modelo.
- **Impact:** backend + frontend.
- **Business rule:** BC-VID-1 exige User al crear `editing`/`ready` y al transicionar hacia esos estados. En PATCH la validación se ejecuta únicamente si cambia el estado; no exige que el User permanezca asignado en cada actualización. Debe decidirse si se permite limpiar User mientras el Video permanece en `editing`/`ready`, o si se requiere cambiarlo en el mismo PATCH a un estado que no exija User. Editor no tiene esa precondición. El endpoint de creación de Content sigue exigiendo un User.
- **Options:** 1. Preservar compatibilidad y retirar la opción de desasignar de la UI. 2. Refactor interno sin cambiar payload: no puede distinguir la intención porque el campo omitido significa no modificar. 3. Definir `null` como limpieza en PATCH, manteniendo omitido como no-op. 4. Coordinar backend/frontend para que ambas superficies envíen `null` y manejen el resultado/error.
- **Recommendation:** coordinar BC-VID-5 después de confirmar la regla de User para `editing`/`ready`. El backend debería distinguir `undefined` de `null`; el frontend enviaría `null` al limpiar y restauraría el estado anterior si el PATCH falla. Para preservar la regla existente, rechazar limpiar User mientras el estado final siga requiriéndolo, permitiendo una transición simultánea fuera de `editing`/`ready`; confirmar esta interpretación antes de implementar.
- **Regression tests:** PATCH con User/Editor UUID los asigna; `null` los limpia; omitido los conserva; errores restauran la UI; rechazo 400 al limpiar User bajo la regla acordada; limpieza junto a transición válida; no cambia la validación de transición ni el requisito de User para crear Content.
- **Compatibility risk:** aceptar `null` como limpieza introduce una operación observable nueva. Mantener exactamente la semántica de campos omitidos evita afectar a consumidores antiguos.
- **Blocks the current audit:** No; no se cambió el contrato.

### Contract finding — Campo `Video.link` obsoleto

- **Current behavior:** el frontend declara `link` en `Video` y `CreateVideoDto`; `VideosKanban.vue` incluye input, enlace de tarjeta y propiedad en POST/PATCH; `VideoActionsModal.vue` carga y edita el campo y emite `link` en `update-video`; `ContentCalendar.vue` lo reenvía al PATCH de Video. Cuando el valor está vacío, `undefined` se omite al serializar. Cuando tiene valor, el pipe global (`whitelist` + `forbidNonWhitelisted`) rechaza la propiedad con 400.
- **Backend evidence:** la entidad `Video` y sus DTOs actuales no declaran `link`; la migración `1770829235721-RemoveVideoLink.ts` quita la columna. No hay tests específicos de Video que caractericen ese campo ni pruebas frontend de Video encontradas en el árbol inspeccionado.
- **Problem:** un control visible ofrece una propiedad que nunca se persiste y puede hacer fallar el guardado completo del Video o del formulario de Content.
- **Impact:** frontend; el contrato backend ya excluye el campo.
- **Options:** 1. Preservar la situación, con el riesgo actual de 400 cuando el campo tiene contenido. 2. Refactor interno del backend no resuelve la incompatibilidad. 3. Restaurar el contrato requiere entidad, DTO y migración, fuera de esta auditoría. 4. Retirar el campo en frontend en todo el flujo Video.
- **Recommendation:** BC-VID-6 frontend-only para retirar el campo de los tipos, formularios, vistas, normalización y payloads exclusivos de Video. No retirar `Article.link` ni enlaces de otros dominios.
- **Regression tests:** verificar que crear/editar Video y actualizar Video desde Content no envían `link`; conservar el flujo `Article.link`; una búsqueda de referencias de Video no debe dejar controles o payloads colgantes.
- **Compatibility risk:** bajo en backend, que ya no admite el campo; se elimina una UI sin persistencia. Confirmar que el producto no pretenda reintroducir enlaces de video antes de retirar el control.
- **Blocks the current audit:** No.

### Contract finding — Relación `Video.list` sobredimensionada

- **Current behavior:** `Video.list` no es eager por sí sola; `VideosService.findAll` y `findOne` solicitan `user`, `list`, `editor` y `content`. Esos métodos respaldan GET `/videos` y GET `/videos/:id`; `create`, `update`, `createListForVideo` y `createContentForVideo` terminan en `findOne`, por lo que sus respuestas también llevan la relación. `List` serializa sus columnas y su colección eager `asignations`; cada Asignation incluye sus campos propios y las relaciones eager `user` y `disc`. `Disc` marca eager `artist`, `genre`, `favorites`, `pendings` y `comments`; `Artist.country` también es eager. La configuración TypeORM no establece otra `relationLoadStrategy`, por lo que no hay evidencia local de una estrategia de carga que reduzca estas relaciones. `createListForVideo` primero usa solo `relations: ['list']` para la comprobación transaccional, pero su respuesta final vuelve a `findOne`.
- **Known consumers:** En el frontend inspeccionado, `VideosKanban.vue` navega usando `list.id`, normaliza ese valor a `listId` y lee `response.list.id` tras crear la List. `VideoListDetalle.vue` obtiene List y Asignations por endpoints propios. `ContentCalendar.vue` no depende de `video.list`; el `ContentsService` carga la relación `video` desde Content, pero `Video.list` no es eager y no solicita esa relación. En backend, Videos solo tiene su controller como consumidor del servicio; Contents accede al repositorio de Video para operaciones propias y no solicita `video.list`. Los tests de Video fijan que la respuesta de creación de List contiene `list.id`, pero no caracterizan el shape completo de GET listado/detalle. No se confirmó ningún consumidor externo.
- **Cost and evidence:** la expansión tiene coste estructural: una consulta de listado puede incluir una colección de asignaciones por cada Video y relaciones asociadas a cada asignación/Disc; con varias colecciones, crece el volumen de filas/materialización. `GET /videos` admite hasta 200 resultados. No se capturó SQL ni payload representativo ni se midió el coste con datos; por tanto, no hay una regresión de rendimiento demostrada. La multiplicidad indica un riesgo de escalado, no evidencia suficiente para cambiar la respuesta o justificar el coste de una proyección alternativa.
- **Contract finding:** **Current behavior:** respuestas Video incluyen el objeto `list` con sus relaciones eager transitivas; Kanban obtiene de él el ID que el frontend modela como `listId`. **Problem:** se carga y serializa más información de la que usa el consumer conocido, con posible coste creciente, pero no medido. **Impact:** backend + frontend si cambia el payload; consumidores externos permanecen sin confirmar. **Options:** (1) conservar la respuesta actual; (2) restringir la carga a `list:{id}`, que elimina propiedades observables; (3) cambiar a `listId` explícito y adaptar frontend; (4) coordinar un cambio backend/frontend tras medir y obtener inventario más completo. **Recommendation:** opción 1. No hay rendimiento demostrado que justifique el cambio, y ni la opción 2 ni la 3 preservan el contrato observable. No añadir DTO de respuesta: hoy fijaría otro shape HTTP sin beneficio medido y exigiría caracterización/cambios de compatibilidad. Si aparece evidencia cuantitativa de coste, abrir una decisión contractual independiente y conservar consumidores desconocidos hasta confirmarlos.
- **Compatibility risk:** medio/alto para cualquier reducción: el objeto `list`, Asignations y los datos eager de User/Disc son observables; el backend publica GET de Videos sin autenticación y el inventario de consumers externos está incompleto. Tests actuales no protegen el payload completo.
- **Blocks the current audit:** No; la opción A cierra BC-VID-7 sin alterar contrato ni código.

### Propuestas de continuación

#### BC-VID-5 — Habilitar desasignación explícita de User y Editor

- **Estado:** completada (2026-10-16); prioridad media; tamaño S. En ese cierre intermedio, Video seguía en cleanup a la espera de BC-VID-7.
- **Reglas implementadas:** en PATCH, campo omitido conserva la relación, UUID válido la asigna y `null` la elimina. Editor se puede limpiar en cualquier estado. User solo se puede limpiar si el estado resultante no es `editing` ni `ready`; estado y responsable se validan conjuntamente. Se conserva `updateDate` explícito al cambiar a `published`.
- **Frontend:** Kanban envía `null` al limpiar y revierte el cambio visual si falla; los formularios del calendario solo incluyen User/Editor si cambiaron, restauran sus valores ante rechazo y muestran el mensaje del backend.
- **Exclusiones respetadas:** no se modificaron `Video.link`, rutas, permisos, entidades, migraciones, sincronización con Content, otras relaciones/formularios ni `.impeccable/config.json`. En ese momento BC-VID-6/7 y Contents seguían pendientes.
- **Verificaciones ejecutadas:** backend `yarn --ignore-engines test --runInBand src/editorial/videos/videos.service.spec.ts` — 1 suite, 54 tests aprobados (incluye regresiones BC-VID-1/2, UUID válidos/inexistentes, omisión/null y ausencia de persistencia ante 400); `yarn --ignore-engines build`; `yarn --ignore-engines run tsc --noEmit --incremental false -p tsconfig.build.json --pretty false`; Prettier limitado a los dos archivos backend modificados. Frontend `yarn vitest run src/views/contentCalendar/components/VideoActionsModal.test.ts src/views/videos/VideosKanban.test.ts` — 2 suites, 5 tests aprobados; `yarn build`. `git diff --check` aprobado en ambos repositorios. Detector Impeccable sin hallazgos. No se accedió a PostgreSQL ni servicios externos.

#### BC-VID-6 — Retirar `link` del dominio Video en frontend

- [x] **Completada (2026-10-16); frontend-only.** Se retiró `link` de los tipos `Video`/`CreateVideoDto`, de los controles y vistas del Kanban y del calendario, y de los payloads POST/PATCH. Se conservaron Article y los enlaces de otros dominios.
- **Pruebas:** creación y edición desde VideosKanban comprueban ausencia de `link` y conservación de nombre, tipo, estado, fecha y usuario; VideoActionsModal comprueba que no ofrece el control y conserva sus campos soportados. Se mantienen las pruebas de asignaciones/error HTTP del Kanban y restauración de asignaciones del calendario.
- **Verificaciones:** `yarn vitest run src/views/videos/VideosKanban.test.ts src/views/contentCalendar/components/VideoActionsModal.test.ts` — 2 suites, 8 tests aprobados; `yarn build`; `yarn vue-tsc --noEmit`; búsqueda de referencias funcionales obsoletas en los archivos de Video; `git diff --check`.
- **Exclusiones respetadas:** no se modificó backend, BC-VID-7, `.impeccable/config.json`, rutas, permisos ni enlaces de otros dominios. En ese cierre intermedio, Videos seguía **en cleanup** por BC-VID-7 y Contents seguía pendiente.

#### BC-VID-7 — Reducir y explicitar la relación List en el contrato Video

- **Estado:** completada (2026-10-16); decisión A, conservar comportamiento actual; Videos queda **completado**.
- **Decisión y justificación:** se conserva `Video.list` junto con el grafo eager de List/Asignations/User/Disc. Existe una expansión estructural y un posible coste de escalado, pero no se midieron SQL ni payload con datos representativos; el inventario externo tampoco está cerrado. Reducir la carga a `list:{id}` o reemplazarla por `listId` cambia campos observables, así que no se puede asegurar compatibilidad. No hay evidencia suficiente para aprobar ese cambio ni para introducir un DTO explícito. La decisión podrá revisarse con métricas y consumidores confirmados en una tarea contractual independiente.
- **Consumers y tests revisados:** Kanban usa `list.id` para completar `listId` y navegación, y `response.list.id` al crear la lista; el detalle carga List/Asignations desde sus endpoints. Contents no solicita `video.list`; las specs de Videos comprueban la presencia de `list.id` en el resultado de creación, no el payload completo de listado/detalle. Consumers externos no confirmados.
- **Compatibilidad/riesgo:** se preservan payload y consultas actuales; permanece sin cuantificar el coste de expansión y sin inventariar posibles consumers externos. No se modifica contrato HTTP.
- **Verificaciones BC-VID-7:** lectura estática de consultas, entidades, DTOs, serialización implícita, rutas, frontend y tests existentes; se actualizó únicamente este roadmap. `git diff --check -- roadmap/backend-cleanup.md`. No se ejecutaron tests, build ni typecheck; no se accedió a PostgreSQL ni servicios externos.

## Auditoría BC-CNT-0 — Editorial / Contents

**Estado:** BC-CNT-0 completada (2026-10-16); BC-CNT-1–BC-CNT-12 completadas; CNT-F1–CNT-F7 tienen resolución documentada y CNT-F7 implementado por BC-CNT-8. Contents está **completado** tras la revisión arquitectónica final y la organización de pruebas por BC-CNT-12. Los demás módulos conservan sus estados previos; Links sigue retirado. No se avanzó a otro módulo Editorial.
**Base observada:** rama actual y estado local del checkout. Se conservaron los cambios locales preexistentes; no se atribuyen a esta auditoría.
**Alcance:** AGENTS.md, roadmaps de Cleanup y Architecture; implementación completa de `src/editorial/contents/`; DTOs, entidad/relaciones, composición, consumidores backend directos y pruebas existentes; contratos públicos de Articles, Lists, Videos y Reunions. No se inspeccionó frontend ni se accedió a servicios externos o PostgreSQL. Solo se actualizó este roadmap.

### Inventario, arquitectura y contratos

- `ContentsModule` registra Content, User, Reunion, Point, RiffValleyPlaylist, Article, Video, Disc y List; importa Lists, Points, Spotify Integration y Auth; exporta `ContentsService`. `AppModule` registra el módulo. `ContentSchedulerService` es el segundo provider. La entidad `Content` tiene relaciones nullable a List, RiffValleyPlaylist, Article y Video; author es nullable/eager; reunion es nullable/no eager, con FK `reunionId`. `ready` y `backlog` son booleanos no-null con default false.
- `ContentsController` expone `POST /contents`, `GET /contents`, `GET /contents/:id`, `GET /contents/by-month?year=&month=`, `PATCH /contents/:id`, `DELETE /contents/:id` y `POST /contents/trigger-daily-link-update`. Las lecturas son públicas; creación, edición, borrado y trigger requieren mínimo `riffvalley`. Los IDs no usan `ParseUUIDPipe`. GET lista por `publicationDate DESC`; `ready` y `backlog` aceptan únicamente las cadenas literales `true`/`false` y el resto se interpreta como filtro ausente. El endpoint mensual usa `parseInt` sin validar parámetros.
- `CreateContentDto` valida enum/título, fechas ISO y UUIDs opcionales; `UpdateContentDto` es `PartialType`. `ready` y `backlog` no tienen `@IsBoolean`; `@IsOptional` también permite null. La validación global elimina campos desconocidos y rechaza propiedades no permitidas.
- `ContentsService` tiene 724 líneas y nueve dependencias inyectadas (ocho repositorios y ListsService). Responsabilidades actuales: altas por tipo con creación opcional de entidades editoriales, lectura/agenda, actualización y sincronización de fechas Content/List y Content/Reunion, borrado coordinado y búsquedas inversas por Article/Video/Playlist. Es una fachada de coordinación interdominio con varias escrituras y políticas por tipo. El tamaño por sí solo no demuestra que deba dividirse; aunque es grande, las operaciones descritas forman la coordinación de Content y no hay evidencia suficiente para ordenar una extracción de ContentsService antes de corregir los invariantes concretos.
- `ContentSchedulerService` tiene 323 líneas y dos tareas funcionales diferentes: recuperación diaria de enlaces de Discs vía Spotify/Bandcamp y generación semanal de Content/Reunion mediante ContentsService. Sus dependencias incluyen Disc, Spotify, User y ContentsService. Ambas tareas comparten el mecanismo de cron, pero tienen efectos/owners distintos; se registra la separación como candidato arquitectónico sin cambio automático.
- Ciclos: Articles, Videos y Reunions importan Contents con `forwardRef` y sus servicios consumen ContentsService. Contents importa Lists con `forwardRef`, pero ListsModule solo registra el repositorio Content y no importa ContentsModule ni inyecta ContentsService; el `forwardRef` de ese par no corresponde a un ciclo Nest observado. Riff Valley Playlists consume Contents, sin importación inversa. Contents importa Points para inyectar su repositorio; Points no importa ContentsModule.
- Consumers directos: ArticlesService crea Content y consulta el Content asociado antes de eliminar Article; VideosService hace lo mismo para Video; RiffValleyPlaylistService crea Content y protege la eliminación de playlist asociada; ReunionService delega borrado de Content a ContentsService; Lists usa la entidad/repository Content y sincroniza fechas en sentido inverso; el scheduler crea Content REUNION semanal. `standalone.ts` registra ContentSchedulerService.
- Articles ofrece CRUD en `/articles` y `POST /articles/:id/content`; Lists mantiene CRUD, calendarios por tipo/periodo y publicación WordPress; Videos ofrece CRUD, `POST /videos/:id/list` y `POST /videos/:id/content`; Reunions ofrece CRUD. Las mutaciones de estos módulos requieren `riffvalley` y las lecturas principales son públicas. Los contratos completados de Articles, Lists y Videos no se proponen cambiar. Article/Video/Playlist pueden seguir existiendo tras borrar Content; los servicios de Article y Video impiden borrar una entidad mientras haya Content asociado.
- `Content.findAll`/`findOne`/`findByMonth` devuelven entidades con relaciones de autor, lista y asignaciones, playlist, Article y Video; varias relaciones transitivas son eager. Se conserva todo el payload observable. No se inspeccionaron consumidores frontend ni se propone reducir las relaciones.

### Coordinación editorial y persistencia

- RADAR y BEST exigen `publicationDate`, crean List WEEK/MONTH y guardan Content, List y asociación final con un mismo `EntityManager` transaccional. La actualización de fechas de Content/List también comparte manager cuando hay cambio sincronizado. El borrado iniciado en Contents elimina Content y List con el manager compartido. Estas garantías de BC-LST-2 y la aceptación/uso del manager de borrado de BC-LST-7 se mantienen; no se propone modificar Lists.
- VIDEO crea Video en estado `editing` con author y fecha; ARTICLE crea Article `editing`; RIFF_VALLEY_PLAYLIST crea playlist `editing`; REUNION crea Reunion y dos Points predeterminados. Estas entidades secundarias se guardan antes del Content y fuera de su transacción. Los flujos Article/Video manuales de los módulos propietarios también usan ContentsService. La relación Content↔Article/Video/Playlist es independiente después del enlace, conforme a los cambios ya completados; no se propone resincronizar sus estados.
- Al crear, se comprueba existencia de author y de Reunion si se pasó `reunionId`; Article, Video y RiffValleyPlaylist solo se buscan para sincronizar fecha si existen, pero la ausencia no se rechaza antes de asignar la referencia. Al cambiar Content, las fechas y el título se guardan primero en Content y luego se copian a Reunion en otra operación. Al borrar, Content/List se transaccionan, pero el borrado de Reunion ocurre después y fuera de ese manager. No hay llamadas externas dentro de estas transacciones.
- `ContentType.REUNION` exige fecha y siempre crea Reunion/Points nuevos. Si también recibe `reunionId`, primero valida la Reunion indicada y la asigna, pero luego crea otra Reunion y reemplaza la asociación; el `reunionId` aceptado no queda vinculado al Content.
- Estados/fechas: RADAR, BEST y REUNION exigen fecha válida al crear y al actualizar; cambiar tipo a uno de estos también valida la fecha existente. Las fechas close/list son opcionales/nullables. Campo omitido en PATCH conserva el valor; null puede limpiar close/list y fechas de tipos sin requisito. Actualizar publicationDate pone `ready=false` cuando se establece fecha. List WEEK/MONTH/VIDEO sincroniza fechas permitidas por Lists; BC-LST-2 cubre null y omisión. La agenda mensual extiende el rango siete días a ambos lados del mes y no valida límites del calendario.
- No se encontraron operaciones externas dentro de las transacciones locales Content/List. Persistencia de las sincronizaciones con Reunion y de las altas secundarias sí ocurre en varias escrituras locales sin atomicidad. Los puntos tienen `onDelete: CASCADE` desde Reunion; la relación inversa Reunion declara cascade. Las relaciones Article, Video y Playlist no se borran al eliminar Content por la independencia ya decidida.

### Pruebas y cobertura

- Hay dos specs de ContentsService (313 líneas): caracterizan transacción/fechas/rollback de Content+List, requisitos de fecha de RADAR/BEST/REUNION, creación semanal/mensual de List y creación automática de Video. No caracterizan altas automáticas de Article/Playlist/Reunion/Points, referencias inválidas, errores de repositorio, borrado/rollback de Reunion, sincronización fallida Content/Reunion ni booleanos inválidos/null.
- `contents.controller.spec.ts` (84 líneas) caracteriza ruta, rol mínimo y delegación del trigger; `domain-mutation-authorization.spec.ts` cubre roles/rutas de las mutaciones Contents. No hay prueba HTTP de CRUD, DTO/pipes ni respuestas completas/relaciones. `content-scheduler.service.spec.ts` (151 líneas) prueba el transporte de Spotify/Bandcamp con fetch simulado, no la creación semanal del contenido. No se ejecutaron las suites.
- La ausencia de cobertura en CRUD/rollback es una carencia, no por sí sola un defecto. Las tareas se limitan a los casos con resultado inconsistente o error de persistencia concreto descritos abajo.

### Hallazgos demostrados

#### CNT-F1 — Referencias de Article, Video o Playlist inexistentes llegan a la FK

- **Ubicación:** `src/editorial/contents/contents.service.ts:97-158`; asignación de relaciones en `:169-175`; relaciones de Content en `src/editorial/contents/entities/content.entity.ts:68-86`.
- **Evidencia (hecho de código):** se consultan Article, Video y RiffValleyPlaylist solo para importar su fecha si la consulta encuentra entidad. Si la referencia UUID válida no existe, el servicio continúa asignando `{id}` y guarda Content con la FK. A diferencia de author y reunion, no produce NotFoundException. La violación FK no se traduce en error HTTP de dominio en Contents.
- **Consecuencia:** una referencia inválida alcanza persistencia y puede responder como error interno en vez de 404/400 estable.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Corrección propuesta:** validar cada ID proporcionado y devolver NotFoundException antes de persistir; mantener la sincronización de fechas existente y las semánticas para campo omitido/null.
- **Dependencias y riesgos:** solo Contents; Article/Video/List permanecen completados. Caracterizar IDs válidos e inexistentes por cada tipo y confirmar status HTTP. No introducir cambios en esos módulos.
- **Estado:** resuelto por BC-CNT-1 (2026-10-16). Las búsquedas que ya se hacían para importar fechas ahora producen `NotFoundException` si falta la entidad, antes de `contentRepo.create` o cualquier escritura. No se añadió una consulta ni se tradujeron errores SQL generales.

#### CNT-F2 — Alta de Content y entidades secundarias no es atómica para varios tipos

- **Ubicación:** `src/editorial/contents/contents.service.ts:179-279, 281-315`.
- **Evidencia (hecho de código):** Article, Video, RiffValleyPlaylist y Reunion/Points se guardan antes del Content con repositorios globales, fuera de transacción. Solo RADAR/BEST guardan su par Content/List con manager común. Si falla un save posterior, las altas secundarias previas permanecen sin Content asociado; para REUNION puede quedar Reunion sin Content o sin los Points previstos.
- **Consecuencia:** fallos de persistencia dejan entidades de trabajo huérfanas o una Reunion parcialmente configurada aunque el POST de Content falle.
- **Categoría / prioridad / tamaño:** bug funcional de consistencia; media; M.
- **Corrección propuesta:** definir el conjunto de entidades secundarias por tipo y persistirlo junto con Content bajo un único manager local; propagar ese manager a todos los saves relacionados. Mantener intacta la transacción RADAR/BEST y los defaults actuales.
- **Dependencias y riesgos:** Contents y repositorios/entities de Article, Video, RiffValleyPlaylist, Reunion y Point. Riesgo de tocar relaciones/cascadas al mover el orden de persistencia; no alterar contratos ni servicios de módulos completados. Caracterizar rollback en cada rama.
- **Estado:** resuelto por BC-CNT-4 (2026-10-16). Las altas de Content y sus entidades secundarias auto-creadas usan el mismo manager transaccional, incluidos Reunion y sus Points.

#### CNT-F3 — `reunionId` aceptado se ignora al crear Content tipo REUNION

- **Ubicación:** DTO `src/editorial/contents/dto/create-content.dto.ts:38-40`; `src/editorial/contents/contents.service.ts:87-95, 249-279`.
- **Evidencia (hecho de código):** el DTO permite `reunionId`; el servicio valida y asigna esa relación. Si `type` es REUNION, crea otra Reunion y reemplaza `content.reunion`/`reunionId`. La Reunion recibida no se asocia y queda sin el Content esperado.
- **Consecuencia:** el campo aceptado no cumple su intención aparente y puede dejar una Reunion previa sin relación; además se crean Reunion/Points duplicados para un solo alta solicitada.
- **Categoría / prioridad / tamaño:** bug funcional; media; XS.
- **Corrección implementada por BC-CNT-1:** reutilizar la Reunion indicada para tipo REUNION sin generar otra; preservar la creación automática cuando se omite `reunionId`.
- **Dependencias y riesgos:** solo Contents, aunque consume Reunion. Se mantienen las asociaciones de `reunionId` en otros tipos.
- **Decisión y estado:** resuelto por BC-CNT-1 (2026-10-16). Si se proporciona `reunionId` para tipo REUNION se reutiliza la entidad existente y no se crean una segunda Reunion ni Points por defecto; si se omite, se conserva la creación automática anterior.

#### CNT-F4 — Campos booleanos aceptan valores que no son booleanos

- **Ubicación:** `src/editorial/contents/dto/create-content.dto.ts:53-57`; columnas no-null en `src/editorial/contents/entities/content.entity.ts:88-92`; pipe global en `src/main.ts`.
- **Evidencia (hecho de código):** `ready` y `backlog` solo llevan `@IsOptional`, sin `@IsBoolean`. El pipe global permite ambos campos porque tienen metadata de validación, pero no comprueba tipo; `null`, strings y números pueden llegar a `create`/`update`. Las columnas no aceptan null y ContentService asigna el valor directamente.
- **Consecuencia:** payloads que no representan booleanos pueden provocar persistencia inválida o almacenar conversiones inesperadas en vez de un 400 de validación consistente.
- **Categoría / prioridad / tamaño:** bug funcional/validación; media; XS.
- **Corrección implementada por BC-CNT-2:** `ready` y `backlog` validan tipos booleanos estrictos; null se rechaza y los campos omitidos conservan la semántica previa. Se preserva el tipo JSON frente a la conversión implícita global, también en PATCH.
- **Estado:** resuelto por BC-CNT-2 (2026-10-16). POST/PATCH responden 400 para null, string y número antes de llegar a persistencia; `true`/`false` se conservan. No cambia esquema ni contrato de permisos.

#### CNT-F5 — Sincronización y borrado Content/Reunion pueden quedar parciales

- **Ubicación:** `src/editorial/contents/contents.service.ts:493-602, 605-632`.
- **Evidencia (hecho de código):** en actualización, Content se guarda (a veces dentro de Content/List) antes de guardar la Reunion sincronizada. En borrado, Content o el par Content/List se elimina antes de `reunionRepo.delete`, fuera de la transacción. Un error en el segundo save/delete devuelve error después de persistir el primer cambio, dejando fecha/título divergentes o Reunion sin Content.
- **Consecuencia:** una operación reportada como fallida puede dejar calendario y evento/Reunion en estados diferentes; el delete puede dejar una Reunion huérfana.
- **Categoría / prioridad / tamaño:** bug funcional de consistencia; media; S.
- **Corrección propuesta:** cuando exista sincronización/borrado de Reunion, usar un solo manager para todas las escrituras locales involucradas, incluyendo el manager transaccional ya usado por Content/List cuando corresponda. No sincronizar estados de Article/Video/Playlist ni crear transacciones distribuidas.
- **Dependencias y riesgos:** Contents, Reunion y Points (cascade). BC-LST-2 ya deja fuera deliberadamente esta sincronización; la nueva tarea debe cubrir solo Content/Reunion y conservar sus reglas/relaciones. Requiere cobertura de fallo del segundo save/delete y rollback.
- **Estado:** resuelto por BC-CNT-5 (2026-10-16). Las actualizaciones que sincronizan Content/Reunion y los borrados de Content/Reunion usan una misma transacción local; el borrado conserva la cascada de Points.

#### CNT-F6 — Parámetros de calendario mensual no se validan

- **Ubicación:** `src/editorial/contents/contents.controller.ts:39-43`; rango en `src/editorial/contents/contents.service.ts:660-690`.
- **Evidencia (hecho de código):** `parseInt` acepta prefijos (`2026x` → 2026), y no hay validación de presencia, año o mes 1–12. Valores incompletos generan fechas inválidas; meses 0/13 se normalizan a otro año/mes por `Date`.
- **Consecuencia:** la URL puede devolver un periodo distinto al solicitado o producir un error de query sin respuesta 400 uniforme.
- **Categoría / prioridad / tamaño:** bug funcional; baja; XS.
- **Corrección propuesta:** DTO de query con enteros y rango mensual explícito; conservar exactamente el rango de calendario actual para entradas válidas.
- **Dependencias y riesgos:** contrato de error para `/contents/by-month`; no altera consultas ni orden válidos.
- **Estado:** resuelto por BC-CNT-3 (2026-10-16). El DTO de query exige year/month enteros completos y acota month a 1–12 antes de invocar el servicio.

#### CNT-F7 — El job diario de enlaces de Disc está alojado en el scheduler de Contents

- **Ubicación:** `src/editorial/contents/content-scheduler.service.ts`; provider de `ContentsModule`; ruta manual en `ContentsController`; comandos en `src/standalone.ts`.
- **Evidencia (hecho):** el mismo provider contiene dos cron jobs. El semanal crea Content/Reunion con `ContentsService`; el diario consulta Disc liberados con link ausente o marcador de error, busca en Spotify y Bandcamp, y guarda `link`, `image` y `verified` mediante el repositorio de Disc. Este job no lee ni modifica Content.
- **Consecuencia:** el ownership de mantenimiento de Disc queda en Editorial y `ContentsModule` registra un repositorio y una integración que solo requiere ese job. Los dos jobs tienen calendarios, datos y efectos distintos.
- **Categoría / prioridad / tamaño:** arquitectura; baja; S.
- **Decisión de BC-CNT-6:** asignar el job diario a Catalog/Discs; mantener el job semanal en Editorial/Contents. BC-CNT-8 implementa la extracción sin cambiar el contrato ni el comportamiento del job.
- **Impacto/compatibilidad:** backend-only. Conservar `POST /contents/trigger-daily-link-update`, su mínimo `riffvalley`, respuesta y ejecución síncrona; conservar los comandos `check-spotify` y `create-weekly`, además de los cron existentes y su zona horaria.
- **Estado:** ownership decidido por BC-CNT-6 y extracción implementada por BC-CNT-8 (2026-10-16). El mantenimiento diario queda bajo Catalog/Discs; el job semanal permanece en Contents.

### Decisiones sin tarea contractual

- Lecturas Contents son públicas y mutaciones exigen `riffvalley`; se mantiene. No hay evidencia en el backend de que esa diferencia sea accidental.
- No se modifica la autonomía de Article/Video/Playlist respecto a Content, ni se propone volver a sincronizar estados publicados. Esto preserva BC-ART/BC-VID y el diseño de creación explícita ya documentado.
- Las fechas de calendario RADAR/BEST/REUNION y su sincronización con Lists respetan BC-LST-2. No se reabre una tarea de Lists ni se cambia el calendario de Videos.
- La relación Reunion/Content y las colecciones eager son payload observable; no se propone reducirlas. No se pudo confirmar consumidores externos.
- El job semanal que crea Content/Reunion permanece en Editorial. BC-CNT-6 recomienda asignar el job diario de enlaces de Disc a Catalog, porque consulta y modifica Disc y usa integraciones Spotify/Bandcamp sin coordinar Content. BC-CNT-8 mueve su provider a Catalog y conserva los consumidores y contratos.

### Tareas propuestas

#### BC-CNT-1 — Validar referencias de entidades asociadas (S, prioridad media)

- **Estado:** completada (2026-10-16); CNT-F1 y CNT-F3 resueltos; prioridad media; tamaño S.
- **Alcance implementado:** validar Article, Video y RiffValleyPlaylist con las búsquedas ya existentes; devolver 404 antes de crear o guardar Content si falta una referencia. Para tipo REUNION, reutilizar el `reunionId` existente si se proporciona; sin ID se preserva la creación automática de Reunion y sus Points.
- **Exclusiones:** no se modificaron Articles, Videos, Lists, rutas, permisos, entidades ni migraciones. Se conservaron las fechas importadas inicialmente desde entidades publicadas y las transacciones Content/List.
- **Pruebas:** referencias existentes para los tres tipos conservan asociación; fechas de publicación iniciales se sincronizan; las tres referencias inexistentes devuelven 404 sin crear ni persistir entidades; lookup repository error se propaga sin traducción; Reunion existente para tipo REUNION se reutiliza; sin ID se mantienen Reunion y Points automáticos; Reunion inexistente conserva su 404.
- **Verificaciones:** Yarn focalizado — 5 suites y 147 tests aprobados (`contents.service`, `contents.controller`, `videos.service`, `articles.controller` y `riff-valley-playlist.service`); build; typecheck `tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier limitado a los dos archivos Contents modificados. No se accedió a PostgreSQL ni servicios externos.
- **Riesgo/compatibilidad:** se corrige el caso antes silencioso donde `reunionId` proporcionado se ignoraba para tipo REUNION; el campo ahora conserva su intención y la creación automática solo ocurre al omitirlo. Errores de lectura/persistencia distintos de “no existe” siguen propagándose.

#### BC-CNT-2 — Validar `ready` y `backlog` como booleanos (XS, prioridad media)

- **Estado:** completada (2026-10-16); CNT-F4 resuelto.
- **Alcance:** hacer que DTO/pipeline rechace valores no booleanos, definir null como inválido y mantener omitido/default/no-op.
- **Exclusiones:** no cambiar columnas, defaults, otras fechas ni permisos.
- **Aceptación:** booleanos verdaderos/falsos se conservan en POST/PATCH; omitido conserva el comportamiento actual; null, string y número dan 400 sin invocar persistencia.
- **Implementación y pruebas:** se añadieron `@IsBoolean()` con preservación del tipo recibido pese a la conversión implícita global; null se transforma en un valor inválido para que la validación no lo omita en `PartialType`. Pruebas de DTO caracterizan POST/PATCH para `true`, `false`, omitido, null, string y número; los rechazos ocurren en ValidationPipe antes de invocar controller/servicio.
- **Verificaciones:** Yarn focalizado de `src/editorial/contents` (4 suites, 50 tests); build; typecheck `tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier limitado al DTO y su spec; `git diff --check`. No se accedió a PostgreSQL ni servicios externos.

#### BC-CNT-3 — Validar parámetros de agenda mensual (XS, prioridad baja)

- **Estado:** completada (2026-10-16); CNT-F6 resuelto.
- **Alcance:** validar year/month completos y month 1–12 en `/contents/by-month`.
- **Exclusiones:** no cambiar ventanas de siete días, filtros, orden, respuesta ni permisos.
- **Aceptación:** periodos válidos conservan el resultado/rango actual; ausentes, parciales y fuera de rango devuelven 400.
- **Dependencias/riesgos:** resuelve CNT-F6; solo Contents.
- **Implementación y pruebas:** se añadió un DTO de query con enteros estrictos, año dentro del rango admitido por `Date` (100–275759) y mes 1–12. El controller delega los números ya validados y conserva ruta, respuesta, acceso público y servicio/rango. Pruebas con ValidationPipe cubren enero/diciembre, parámetros ausentes, prefijos/parciales, fracciones y límites inválidos; la prueba del controller fija la delegación.
- **Verificaciones:** Yarn focalizado de `src/editorial/contents` (5 suites, 64 tests); build; typecheck `tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier de los cuatro archivos propios; `git diff --check`. Se usó `--ignore-engines` porque el entorno ejecuta Node 22.23.1 y el proyecto declara Node 20.x. No se accedió a PostgreSQL ni servicios externos.

#### BC-CNT-4 — Persistir Content con sus entidades secundarias de forma atómica (M, prioridad media)

- **Estado:** completada (2026-10-16); CNT-F2 resuelto.
- **Alcance:** transacción local por alta para Content y entidades auto-creadas ARTICLE, VIDEO, RIFF_VALLEY_PLAYLIST o REUNION/Points.
- **Exclusiones:** la pareja RADAR/BEST–List ya está transaccional por BC-LST-2 y debe preservarse; no modificar defaults ni endpoints de módulos completados.
- **Aceptación:** éxito persiste todo el agregado correspondiente; fallo simulado en cada write revierte todos los writes de esa alta; los casos de asociación a entidades existentes no crean registros secundarios.
- **Dependencias/riesgos:** resuelve CNT-F2; revisar providers/repositories y cascadas Reunion↔Points antes de elegir saves explícitos o cascade. Sin migraciones ni PostgreSQL durante la preparación.
- **Implementación y pruebas:** ARTICLE, VIDEO, RIFF_VALLEY_PLAYLIST y REUNION guardan el Content y sus secundarios auto-creados con repositorios del mismo `EntityManager`. Reunion y sus Points se guardan explícitamente en esa transacción. Asociaciones existentes no crean secundarios. RADAR/BEST mantiene el guardado Content/List y el orden previo dentro de su transacción. Pruebas cubren éxito y fallo de cada write en las cuatro ramas, así como asociaciones existentes sin duplicación.
- **Verificaciones:** Yarn focalizado `src/editorial/contents` (5 suites, 77 tests); `yarn build`; `yarn tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier en los dos archivos propios; `git diff --check`. Se usó `--ignore-engines`. No se accedió a PostgreSQL ni servicios externos.
- **Riesgo/compatibilidad:** se conserva el orden y contrato RADAR/BEST–List, los defaults editoriales, permisos y respuestas. No se hicieron migraciones.

#### BC-CNT-5 — Sincronizar Content y Reunion en una transacción (S, prioridad media)

- **Estado:** completada (2026-10-16); CNT-F5 resuelto.
- **Alcance:** transaccionar actualizaciones sincronizadas y borrados de Content/Reunion, incluyendo Content/List si participa, usando el mismo manager.
- **Exclusiones:** no modificar Lists fuera del manager opcional ya establecido, ni Article/Video/Playlist, schema, contratos o efectos externos.
- **Aceptación:** éxito mantiene fecha/título y borrado acordes; el fallo de cualquier segundo write deja ambas entidades como estaban; cascada de Points continúa respetada.
- **Dependencias/riesgos:** resuelve CNT-F5 y se basa en el límite explícitamente pendiente de BC-LST-2. Caracterizar especialmente el flujo `ReunionService.deleteReunion()` → `ContentsService.remove()` para evitar cambios de contrato.
- **Implementación y pruebas:** las actualizaciones de Content con sincronización de Reunion ejecutan el save de Content, la sincronización opcional de List y el save de Reunion con repositorios del mismo manager. El borrado usa una transacción común para Content, List cuando participa y Reunion; `ReunionService.deleteReunion()` conserva su llamada existente a `ContentsService.remove()`, y la eliminación de Reunion sigue respetando la cascada de Points. Pruebas cubren actualización Content/Reunion, rollback cuando falla el segundo save/delete, uso de un manager común con Content/List/Reunion y borrado de Content con Reunion asociada.
- **Verificaciones:** Yarn focalizado `src/editorial/contents` (5 suites, 82 tests); build; typecheck `tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier limitado a `contents.service.ts` y `contents.service.spec.ts`; `git diff --check`. Se usó `--ignore-engines`. No se accedió a PostgreSQL ni servicios externos.
- **Riesgo/compatibilidad:** se conservan rutas, permisos, respuestas, reglas editoriales, orden de operaciones y llamadas desde `ReunionService`; no hubo cambios de schema ni migraciones.

#### BC-CNT-6 — Auditar el ownership del job diario de enlaces de Disc (S, prioridad baja)

- **Estado:** completada (2026-10-16); CNT-F7 con decisión registrada.
- **Motivo:** `ContentSchedulerService` combina el cron semanal que crea Content/Reunion con la búsqueda diaria de enlaces de Disc en Spotify/Bandcamp. Esta última operación lee y escribe Disc y no coordina entidades Content; es una responsabilidad distinta y dependiente de Catalog/Spotify.
- **Alcance:** revisar owners y consumers del trigger manual, configuración cron y standalone, dependencias de Spotify/Bandcamp, repositorio Disc y tests existentes; proponer el destino/contrato del job y una migración incremental si se justifica.
- **Exclusiones:** esta tarea no mueve providers ni rutas, no cambia horarios, permisos, respuestas, lógica de búsqueda, persistencia ni integración; no modifica Catalog, Spotify ni frontend.
- **Aceptación:** decisión explícita de conservar o extraer el job, con diagrama de dependencias, consumers, riesgos de cron/DI y caracterización requerida antes de implementación. El job semanal de Content queda dentro del ownership Editorial salvo evidencia contraria.
- **Dependencias/riesgos:** ninguna; es una auditoría de arquitectura independiente de CNT-F1–CNT-F6. No ejecutar el job ni llamar a Spotify/Bandcamp.
- **Consumers y contratos observados:** el cron diario y `standalone check-spotify` llaman `checkMissingSpotifyLinks`; el cron semanal y `standalone create-weekly` llaman `createWeeklyContent`. `POST /contents/trigger-daily-link-update` es el único consumer HTTP hallado: exige `riffvalley`, espera a que termine el job y devuelve `{ message: 'Daily link update triggered' }`. `ScheduleModule.forRoot()` se registra en `AppModule`; ambos crons usan `Europe/Madrid` (diario 06:00, semanal lunes 08:00, además del guard de lunes).
- **Diagrama actual:**

  ```text
  AppModule ── ScheduleModule.forRoot()
    └─ ContentsModule ── ContentSchedulerService
         ├─ @Cron diario 06:00 ── Disc repository ── Spotify Client Credentials
         │                                      └── Bandcamp fetch
         ├─ @Cron lunes 08:00 ── ContentsService ── Content/Reunion/Points
         └─ ContentsController ── POST /contents/trigger-daily-link-update
                                      └─ checkMissingSpotifyLinks()
  standalone check-spotify ────────────────┘
  standalone create-weekly ────────────────┘
  ```

- **Decisión y destino recomendado:** extraer solo la tarea diaria a un `DiscLinkMaintenanceService` bajo `src/catalog/discs/maintenance/`, registrado y exportado por `DiscModule`. Mantener `ContentSchedulerService` con `UserRepository` y `ContentsService` para el job semanal. Contents puede importar `DiscModule` para que el controller conserve la ruta; el provider de Catalog no necesita importar Contents ni formar un ciclo.
- **Opciones consideradas:** conservar ambos jobs en Contents evita cambios de DI, pero mantiene el acceso a Disc/Spotify/Bandcamp en un scheduler editorial; extraer el job diario a Catalog alinea el owner con la entidad que modifica y conserva el controller y el contrato HTTP como fachada. Se recomienda la extracción interna en la revisión final, sin cambiar contratos.
- **Diagrama destino propuesto:**

  ```text
  AppModule ── ScheduleModule.forRoot()
    ├─ ContentsModule ── ContentSchedulerService ── @Cron semanal ── ContentsService
    │                    └─ ContentsController ── POST existente ── DiscModule
    └─ DiscModule ── DiscLinkMaintenanceService
         ├─ @Cron diario ── Disc repository
         ├─ Spotify Client Credentials / Bandcamp fetch
         ├─ ContentsController ── checkMissingSpotifyLinks()
         └─ standalone check-spotify
  standalone create-weekly ── ContentSchedulerService
  ```

- **Riesgos y caracterización previa a extraer:** mantener el registro único del cron en el módulo incluido por `AppModule`, su timezone/expresión y el singleton visible para Nest Schedule; resolver `standalone.ts` desde el provider de Catalog sin renombrar comandos; mantener endpoint, guard, ejecución síncrona y payload. Mover junto al método su prueba de transporte, y ampliar caracterización local con fetch simulado para metadatos del cron, cero resultados, query/filtros de Disc, marcadores de link, errores por Disc y parsing de resultado Bandcamp. No ejecutar integraciones reales.
- **Verificaciones de auditoría:** revisión estática de providers, imports, crons en código, `AppModule`, guard/payload de ruta, `standalone.ts`, entidades/repositorios y tests existentes. Yarn focalizado `src/editorial/contents` (5 suites, 82 tests); build; typecheck `tsc --noEmit --incremental false -p tsconfig.build.json`; `git diff --check`. No se añadieron pruebas al no cambiar el runtime. El Prettier de las adiciones aisladas es consistente; el check del roadmap completo falla por formato ya presente en `HEAD` (confirmado sobre el archivo base). No se accedió a PostgreSQL ni se llamaron servicios externos.
- **Resultado:** CNT-F7 queda resuelto como decisión de ownership; la extracción se difiere a la revisión arquitectónica final. Contents no se marca completado.

#### BC-CNT-7 — Planificar la reorganización de Contents (M, prioridad baja)

- **Estado:** auditoría completada (2026-10-16). Se documenta un plan incremental BC-CNT-8 a BC-CNT-11; no se cambió código ni pruebas. Contents permanece **en cleanup**.
- **Base revisada:** `AGENTS.md`, este roadmap, `roadmap/backend-architecture.md`; implementación completa de `src/editorial/contents/`, `ContentsModule`, entidad/DTOs y pruebas; consumidores backend directos; `AppModule`, `standalone.ts`, `DiscModule`, `PointsModule`, `ReunionsModule` y módulos relacionados; patrón de fachada y estructura vigente de Lists. No se inspeccionó frontend.
- **Inventario de `ContentsService` (708 líneas, nueve dependencias inyectadas):** `create` (≈243 líneas; reglas de fecha, asociaciones y altas secundarias transaccionales); `findAll` (≈23), `findOne` (≈24), `findByMonth` (≈33), tres búsquedas inversas por RiffValleyPlaylist/Article/Video (≈6–8 cada una) y `getDefaultAuthorId` (≈11); `update` (≈242; reglas editoriales, fechas y sincronización Content/List/Reunion); `remove` (≈54; borrado coordinado). Las consultas cargan relaciones que forman parte del payload observable. `assignDateIfChanged` y `dateValuesMatch` son helpers pequeños del ciclo de vida, no justifican un módulo propio.
- **Inventario de `ContentSchedulerService` (323 líneas):** constructor con UserRepository, ContentsService, DiscRepository y SpotifyClientCredentialsService; `checkMissingSpotifyLinks` (job diario, ≈150 líneas) con normalización, búsqueda Spotify y fallback/parsing Bandcamp (helper ≈80 líneas); `createWeeklyContent` (job semanal, ≈52 líneas). Los dos jobs tienen datos, efectos y ownership distintos; tras mover el job de Disc quedaría un scheduler editorial de aproximadamente 75–85 líneas.
- **Responsabilidades recomendadas:** separar lecturas y calendario como consultas de Content; mantener las reglas editoriales dentro de los casos de uso de creación/actualización que las aplican; agrupar update/remove como ciclo de vida por su escritura coordinada; mantener create separado por sus altas secundarias y transacción de creación. No crear un servicio separado para una sola consulta de calendario ni para helpers de fecha. Mantener Content/List/Reunion dentro del mismo EntityManager de las operaciones ya transaccionales por BC-CNT-4/5.
- **Consumers y firmas a conservar:** el controller invoca create/findAll/findOne/findByMonth/update/remove; ArticlesService y VideosService crean Content y usan sus búsquedas inversas; RiffValleyPlaylistService crea Content y consulta su asociación; ReunionService llama `ContentsService.remove`; el cron semanal llama `create`. Mantener las diez firmas públicas actuales de `ContentsService` como forwarding facade; las fachadas y consumers existentes no deben conocer los providers internos.
- **NestJS y ciclos observados:** ArticlesModule, VideosModule, RiffValleyPlaylistsModule y ReunionsModule consumen Contents; solo Reunions depende circularmente de Contents mediante `forwardRef`. `ContentsModule → ListsModule` no es un ciclo: Lists registra `Content` y no importa Contents ni inyecta su servicio. Sí hay un ciclo de módulos indirecto `ContentsModule → PointsModule → ReunionsModule → ContentsModule`; Contents necesita `PointRepository`, no `PointService`. En la extracción de creación, se puede registrar `Point` en el `TypeOrmModule.forFeature` local de Contents y retirar `PointsModule` de sus imports, comprobando que el ciclo desaparezca sin cambiar providers/exports de Points ni su módulo. No cambiar el `forwardRef` de Lists como parte de una limpieza incidental. `DiscModule` no importa Contents; Contents puede importar/exportar el provider de mantenimiento de Disc sin formar ciclo. `AppModule` ya compone ambos módulos y registra `ScheduleModule.forRoot()`.
- **Patrón/estructura:** seguir Lists: facade exportada, servicios de aplicación cohesionados como providers internos y specs junto a su responsabilidad; exportar únicamente `ContentsService` para el uso normal. Estructura destino propuesta:

  ```text
  src/editorial/contents/
    contents.controller.ts
    contents.module.ts
    contents.service.ts                 # fachada pública
    content-scheduler.service.ts        # cron semanal Content/Reunion
    content-scheduler.service.spec.ts
    __tests__/
      contents.controller.spec.ts
      contents.service.spec.ts
    application/
      content-creation.service.ts
      content-query.service.ts
      content-lifecycle.service.ts
      __tests__/
        content-creation.service.spec.ts
        content-query.service.spec.ts
        content-lifecycle.service.spec.ts
    dto/
    entities/

  src/catalog/discs/
    maintenance/
      disc-link-maintenance.service.ts
      disc-link-maintenance.service.spec.ts
  ```

  No crear un `domain/` o `shared/` nuevo por anticipado; las reglas editoriales actuales no son helpers compartidos demostrados. Mantener las pruebas DTO en `dto/`. La carpeta `maintenance/` se justifica por el nuevo caso de uso de catálogo y su prueba.
- **Tamaño final estimado:** la fachada quedaría aproximadamente en **100–150 líneas**, con constructor, contratos y diez wrappers. La estimación no es cuota de líneas: se revisa al terminar los movimientos, como se hizo con Lists (170 líneas). El scheduler semanal quedaría en ≈75–85 líneas. El tamaño agregado no justifica dividirlo más.
- **Riesgos generales:** cambiar relaciones/options de TypeORM al mover consultas puede alterar payload, orden o NotFound/null; mover un método transaccional y dejar un save en el repositorio global puede romper rollback/manager común; duplicar la implementación en la fachada y el provider crea divergencia; registrar un cron en más de un provider puede duplicar ejecuciones; resolver la CLI por el provider equivocado rompe el comando aunque el endpoint siga funcionando; mover providers puede alterar scope DI o iniciar ciclos nuevos. Antes de extraer, caracterizar comportamiento y consumidores; después comprobar wiring/imports/exports y que exista un solo cron propietario.
- **Límites de esta auditoría:** no se modificaron implementación, pruebas, entidades, migraciones, frontend ni otros módulos; no se ejecutaron jobs, tests, build ni typecheck; no se accedió a PostgreSQL ni servicios externos. Se actualizó únicamente este roadmap.

#### BC-CNT-8 — Extraer mantenimiento diario de enlaces de Disc a Catalog (S, prioridad baja)

- **Estado:** completada (2026-10-16); CNT-F7 implementado. Contents sigue en cleanup por BC-CNT-9 a BC-CNT-11.
- **Responsabilidad/métodos:** mover `checkMissingSpotifyLinks`, la normalización y el parsing/fallback Bandcamp desde `ContentSchedulerService` a un `DiscLinkMaintenanceService` en `src/catalog/discs/maintenance/`. Mantener cron diario 06:00 `Europe/Madrid` allí; conservar `ContentSchedulerService.createWeeklyContent` y el cron semanal lunes 08:00 con su guard actual en Contents.
- **Archivos afectados:** nuevo servicio y spec bajo `src/catalog/discs/maintenance/`; provider/export de `src/catalog/discs/discs.module.ts`; wiring de `src/editorial/contents/contents.module.ts` y `contents.controller.ts`; `src/editorial/contents/content-scheduler.service.ts` y su spec; `src/standalone.ts`; specs de controller/scheduler. No se cambiaron Disc entity ni migraciones.
- **Dependencias/consumidores:** `DiscLinkMaintenanceService` usa únicamente DiscRepository y SpotifyClientCredentialsService. DiscModule registra y exporta el provider; ContentsModule importa DiscModule para que el controller mantenga la ruta manual sin cambiar su respuesta síncrona. `standalone check-spotify` obtiene el provider de Catalog; `create-weekly` sigue obteniendo ContentSchedulerService. El provider de Catalog no importa Contents y el servicio diario ya no está registrado en Contents.
- **Implementación:** se movieron `checkMissingSpotifyLinks`, `normalizeString` y `searchBandcamp` sin reescribir la consulta, filtros, fallback, marcadores de estado, resultados ni manejo de errores. `ContentSchedulerService` conserva `createWeeklyContent`, su guard de lunes y cron. Se eliminó de Contents el repositorio Disc y la importación directa de Spotify que solo se necesitaban para el job diario.
- **Aceptación/regresiones:** cron diario único `0 6 * * *` en `Europe/Madrid`; cron semanal sin cambios (`0 8 * * 1`, `Europe/Madrid`); ruta `POST /contents/trigger-daily-link-update`, rol mínimo `riffvalley`, espera, respuesta y propagación de rechazos preservados; comandos `check-spotify` y `create-weekly` conservados. Tests cubren proveedor/cron único, weekly create/guard, autorización/delegación/respuesta/error, filtros/joins Disc, actualizaciones Spotify, no-match, fallo del token y parsing Bandcamp simulado. No se ejecutaron integraciones reales.
- **Tamaño:** S.
- **Verificaciones:** Yarn focalizado (3 suites, 14 tests); `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier check limitado a los nueve archivos TypeScript propios; `git diff --check`. Wiring e imports se comprobaron mediante spec de metadata de módulos y revisión del código; `standalone.ts` conserva ambos nombres de comando. Sin acceso a PostgreSQL ni servicios externos.
- **Resultado:** Catalog/Discs es el propietario del mantenimiento diario; CNT-F7 queda implementado además de decidido. Contents permanece en cleanup y BC-CNT-9 a BC-CNT-11 siguen pendientes.

#### BC-CNT-9 — Extraer consultas y calendario de Content (S, prioridad baja)

- **Estado:** completada (2026-10-16). Contents continúa **en cleanup** por BC-CNT-10 y BC-CNT-11.
- **Responsabilidad/métodos:** crear `ContentQueryService` para `findAll`, `findOne`, `findByMonth`, `findOneByRiffValleyPlaylistId`, `findOneByArticleId`, `findOneByVideoId` y `getDefaultAuthorId`. El calendario mensual es una consulta y se agrupa aquí; no crear otro servicio de calendario. Mantener wrappers con las mismas firmas y tipos en ContentsService.
- **Archivos afectados:** nuevo `application/content-query.service.ts` y spec adyacente; `contents.service.ts`, `contents.module.ts`, `contents.service.spec.ts`, suites de controller y consumidores que fijan su contrato. No cambiar controller ni DTO.
- **Dependencias/consumidores:** ContentRepository y UserRepository. Consumers: controller, ArticlesService, VideosService y RiffValleyPlaylistService; mantener `ReunionService` independiente. El provider interno no debe inyectar la fachada.
- **Riesgos y aceptación:** conservar íntegros filtros `ready/backlog`, relaciones explícitas/eager y payload, 404 de findOne, null de búsquedas inversas, orden DESC, rango de `findByMonth` ±7 días y selección del usuario default por UUID ascendente. Tests focalizados fijan opciones/repositorio, resultados y casos ausentes; spec de fachada verifica forwarding y firmas sin duplicar caracterizaciones.
- **Implementación:** los siete métodos y sus consultas se trasladaron a `application/ContentQueryService`; `ContentsService` conserva las firmas públicas como wrappers. La consulta mensual mantiene joins, extremos inclusivos y rango local ±7 días; se conservan filtros, orden, relaciones, errores y nulls. El provider se registra una vez en `ContentsModule`, no se exporta y solo depende de Content/User repositories.
- **Verificaciones BC-CNT-9:** Yarn focalizado en Contents, Articles, Videos y RiffValley Playlists (7 suites, 184 tests); `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier check de archivos TypeScript propios; spec DI de `ContentQueryService` con repositorios simulados y chequeo de registro único; `git diff --check`. No se accedió a PostgreSQL ni servicios externos.
- **Tamaño:** S.

#### BC-CNT-10 — Extraer la creación transaccional de Content (M, prioridad media)

- **Estado:** completada (2026-10-16). Contents continúa **en cleanup** por BC-CNT-11 y la revisión arquitectónica final.

- **Responsabilidad/métodos:** mover `create` y sus reglas/flujo de asociación a `ContentCreationService`; no extraer cada tipo o regla a clases separadas. Mantener Content y entidades secundarias bajo el manager de BC-CNT-4; conservar la transacción RADAR/BEST–List con `ListsService` y el manager compartido.
- **Archivos afectados:** nuevo `application/content-creation.service.ts` y spec; `contents.service.ts`, `contents.module.ts` y tests focalizados de creación. Ajuste DI acotado: añadir `Point` al `forFeature` de Contents y retirar `PointsModule` de imports si se confirma por wiring que solo se utilizaba para exportar `PointRepository`. No editar `PointsModule`, `ReunionsModule`, entidades ni otros dominios.
- **Dependencias/consumidores:** Content/User/Reunion/Point/RiffValleyPlaylist/Article/Video/List repositories y ListsService. Consumers que continúan usando la fachada: controller, ArticlesService, VideosService, RiffValleyPlaylistService y scheduler semanal. Provider interno no depende de ContentsService. El reemplazo de PointsModule elimina el ciclo `Contents → Points → Reunions → Contents`; el ciclo directo Reunions–Contents permanece por el contrato actual.
- **Riesgos y aceptación:** conservar validaciones de author/asociaciones, tipos y fechas, defaults, orden de escritura, relaciones y resultado; errores por asociaciones inexistentes antes de persistir; rollback de Content y cada entidad secundaria en fallos; no duplicar Reunion/Points cuando se reutiliza reunionId; conservar manager RADAR/BEST–List. Wiring test confirma la disponibilidad de todos los repositorios y que Contents ya no importa PointsModule; pruebas de creación mantienen los casos BC-CNT-1/2/4 relevantes.
- **Implementación:** `ContentsService.create` delega en `ContentCreationService`; el provider interno no depende de la fachada. Las validaciones editoriales y de autor, sincronización inicial de publicación, asociaciones existentes, altas automáticas de Article/Video/RiffValleyPlaylist/Reunion/Points y resultado se conservaron. Content, entidades secundarias y el alta RADAR/BEST–List siguen usando el manager de la transacción original. `ContentsModule` registra `Point` en su `forFeature`, elimina su import de `PointsModule` y registra `ContentCreationService` una sola vez; no se cambió PointsModule ni el ciclo directo Reunions–Contents.
- **Pruebas y verificaciones BC-CNT-10:** Yarn focalizado para Contents, Articles, Videos, RiffValley Playlists y Reunions (11 suites, 207 tests); suite HTTP de Playlists (1 suite, 2 tests, ejecutada con socket local autorizado); `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier check limitado a los archivos TypeScript propios; spec del módulo para provider único y ausencia de `PointsModule`; `git diff --check`. Sin acceso a PostgreSQL ni servicios externos.
- **Tamaño y fachada:** `ContentsService` conserva las diez firmas públicas y tiene 369 líneas. `create` es wrapper; `update` y `remove` permanecen en la fachada hasta BC-CNT-11; consultas siguen delegadas en `ContentQueryService`.

#### BC-CNT-11 — Extraer actualización y borrado coordinados de Content (M, prioridad media)

- **Estado:** completada (2026-10-16); cierre arquitectónico de Contents registrado por BC-CNT-12.

- **Responsabilidad/métodos:** mover `update`, `remove` y helpers privados de comparación/asignación de fechas a `ContentLifecycleService`. Mantener ambos métodos juntos: son las escrituras del ciclo de vida que sincronizan Content con List/Reunion; no extraer reglas/helpers triviales por separado.
- **Archivos afectados:** nuevo `application/content-lifecycle.service.ts` y spec; `contents.service.ts`, `contents.module.ts`, specs de Contents y, para integración, el spec de `ReunionService` solo si hace falta fijar su delegación existente. No editar el módulo o servicio List/Reunion.
- **Dependencias/consumidores:** Content/User/Reunion/List repositories y ListsService; depender de `ContentQueryService` si se reutiliza el lookup completo de `findOne`, sin inyectar ContentsService ni crear ciclo. Consumers conservan facade: controller para PATCH/DELETE y ReunionService para `remove`.
- **Riesgos y aceptación:** mantener PATCH omitido vs null, reglas por ContentType, `ready=false` al establecer publicationDate, cambios permitidos de fechas List, independencia de estados Article/Video/Playlist, relaciones/payload del lookup, 404, y manager común Content/List/Reunion para sincronización y rollback según BC-CNT-5. El borrado mantiene la cascada de Points y el contrato de `ReunionService.deleteReunion()` → `ContentsService.remove()`. Pruebas focalizadas para campos omitidos/null, fechas/tipos, List/Reunion, errores del segundo write y rollback; la fachada prueba forwarding.
- **Implementación:** `update`, `remove` y los helpers `dateValuesMatch`/`assignDateIfChanged` se movieron a `ContentLifecycleService`. El lookup de actualización usa `ContentQueryService`; el servicio no llama a `ContentsService`. Se preservaron validaciones, contratos, reglas de fechas/estado, carga de relaciones y escrituras Content/List/Reunion con manager común. `ContentsModule` registra el provider una vez y solo exporta la fachada; no se modificaron módulos de Lists/Reunions, contratos, permisos ni entidades.
- **Pruebas y verificaciones BC-CNT-11:** Yarn focalizado Contents, Lists, Reunions, Articles, Videos y RiffValley Playlists: 25 suites y 393 tests pasaron; la suite HTTP de Playlists pasó aparte (2 tests, socket local autorizado); build; typecheck `tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier limitado a TypeScript propio; spec de wiring para provider único y repositorios registrados; `git diff --check`. No se accedió a PostgreSQL ni servicios externos.
- **Fachada:** `ContentsService` conserva sus diez firmas públicas como wrappers, sin lógica de negocio propia, en 63 líneas.
- **Tamaño:** M.

#### BC-CNT-12 — Cierre arquitectónico y organización de Contents (S, prioridad baja)

- **Estado:** completada (2026-10-16). Contents queda **completado**.
- **Organización final:** `ContentsModule`, `ContentsController` y `ContentsService` permanecen en la raíz; `ContentSchedulerService` y su spec permanecen allí por ser el cron semanal de Contents. Las specs de fachada, módulo y controller están en `contents/__tests__/`; las specs de `ContentCreationService`, `ContentLifecycleService` y `ContentQueryService` están en `application/__tests__/`. DTOs, entidades y specs DTO conservan sus carpetas.
- **Cierre arquitectónico:** ContentsService tiene 63 líneas y solo delega sus firmas públicas. ContentsModule registra una vez Scheduler, Query, Creation y Lifecycle, exporta solo la fachada y registra localmente las entidades necesarias. Los servicios de aplicación no llaman a la fachada; Lifecycle depende de Query y ListsService. No se introdujeron ciclos: se mantiene únicamente la relación directa ya documentada entre Reunions y Contents. Las transacciones Content/List/Reunion permanecen en Lifecycle. El cron semanal continúa en Contents y el diario de Disc en Catalog/Discs.
- **Contratos:** no se modificaron lógica, rutas, permisos, respuestas, DTOs de runtime, entidades ni migraciones. Los cambios de este cierre se limitaron a ubicación de specs, sus imports y este roadmap.
- **Verificaciones BC-CNT-12:** descubrimiento de 9 suites en Contents con Jest; 25 suites y 393 tests de Contents, Lists, Reunions, Articles, Videos y RiffValley Playlists pasaron; suite HTTP de Playlists (2 tests) y spec de mantenimiento diario de Disc en Catalog (5 tests) pasaron por separado; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier limitado a los seis specs movidos; `git diff --check`; búsqueda de imports antiguos sin resultados. No se accedió a PostgreSQL ni servicios externos reales.
- **Resultado:** BC-CNT-1 a BC-CNT-12 cerradas; Contents pasa de cleanup a completado. No se inicia trabajo en otro módulo; Links permanece retirado.

- **Orden recomendado:** BC-CNT-8 va primero y aislado por cruzar a Catalog/Spotify y modificar scheduler/CLI; después BC-CNT-9, BC-CNT-10 y BC-CNT-11 para estabilizar consultas compartidas antes de los casos de escritura. No combinar BC-CNT-8 con extracciones de Contents. Tras BC-CNT-11 realizar revisión de wiring, coherencia de fachada, pruebas movidas y diff; solo entonces decidir si Contents pasa a completado. No crear tareas adicionales para mover carpetas: cada extracción coloca su spec junto a la responsabilidad.
- **Criterio arquitectónico final:** Contents puede quedar con `ContentsService` como fachada ligera cuando delegue las diez firmas públicas, `ContentSchedulerService` mantenga solo el cron semanal y `ContentsModule` registre los providers internos sin exponerlos a módulos consumidores. Verificar con consumidor real y pruebas de módulo que no hay ciclos nuevos; conservar el ciclo Reunions–Contents solo mientras su llamada pública siga siendo necesaria.
- **Verificaciones BC-CNT-7:** inventario estático de métodos, líneas, dependencias y consumidores; revisión de imports/providers NestJS, manager transaccional y suites existentes; actualización exclusiva de `roadmap/backend-cleanup.md`; `git diff --check -- roadmap/backend-cleanup.md`. No se ejecutaron pruebas, build ni typecheck, jobs ni operaciones con PostgreSQL/servicios externos.
- **Resultado:** BC-CNT-7 completada; se proponen BC-CNT-8 a BC-CNT-11. Contents permanece **en cleanup**; no se inicia otro módulo.

**Verificaciones BC-CNT-0:** revisión estática de código, DTOs, rutas/roles, metadata de entidad, composición y consumers backend; lectura de specs sin ejecutarlas; comparación con garantías BC-LST-2, BC-LST-7 y BC-VID-3. No se accedió a PostgreSQL, WordPress, Spotify, Heroku ni servicios externos. `git diff --check -- roadmap/backend-cleanup.md` se ejecutó al cerrar la auditoría.
