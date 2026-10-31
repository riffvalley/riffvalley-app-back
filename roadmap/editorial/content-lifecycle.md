# E-CC-8 — Auditoría de eliminación y ciclo editorial (backend)

**Estado:** E-CC-8a-BE auditoría completada; E-CC-8b-BE política aprobada y documentada; E-CC-8c-BE corrección de Video implementada y cubierta por regresiones (2026-10-31). No cambia contrato, permiso ni esquema.

**Alcance y límites:** lectura estática del checkout backend: entidades, migraciones locales, servicios, controllers, consumers backend y specs pertinentes. El frontend se consultó en modo lectura solo en el calendario editorial y su cliente de Contents. No se consultaron bases de datos, producción, WordPress, Spotify ni servicios externos; no se verificó si hay filas históricas compartidas. El archivo local preexistente `test/contents.http` se conservó.

## Resumen ejecutivo

La auditoría E-CC-8a-BE encontró que `DELETE /api/contents/:id` eliminaba Content y, según sus relaciones cargadas, también List o Reunion. E-CC-8c-BE corrige Video: ahora conserva Video, List y Video–List. Los demás efectos por tipo siguen como se detectaron. El endpoint sigue sin distinguirlos en la respuesta; el frontend debe adaptar sus confirmaciones en una fase posterior.

Las relaciones Article, Video, Riff Valley Playlist y Content→List son uno a uno en el código y tienen FK única en las migraciones correspondientes. Content→Reunion es muchos-a-uno y la FK no es única. El riesgo de Reunion compartida está demostrado por código + esquema: la eliminación de una Reunion con otro Content aún apuntando a ella viola la FK `NO ACTION`; PostgreSQL rechaza el segundo write y la transacción revierte también el borrado del Content actual. No hay evidencia de que esto haya ocurrido en datos reales.

Para Lists, el borrado en cascada es relacional y transaccional a nivel de servicio: se elimina List, sus Asignaciones (FK `ON DELETE CASCADE`) y el tracking local de publicación de WordPress almacenado en la fila List. No se borran Discs ni publicaciones remotas. Sin embargo, el FK de Video→List define `ON DELETE SET NULL` en la migración, así que al borrar List se pierde esa asociación del Video, no el Video. Estos efectos no están cubiertos con FKs reales en tests de integración.

## Modelo y cardinalidad

Las FK salientes viven en `content`: `authorId`, `reunionId`, `listId`, `riffValleyPlaylistId`, `articleId` y `videoId`. La tabla Content no tiene cascada de borrado en Article/Playlist/Reunion; las migraciones usan `NO ACTION`, salvo que Video→Content tiene `ON DELETE NO ACTION` en la FK desde Content (eliminar Content sí borra la fila que contiene esa FK). `authorId` usa `SET NULL`.

| Asociación | Lado propietario de FK | Cardinalidad garantizada | Regla de esquema observada |
|---|---|---|---|
| Content–Article | `content.articleId` | Uno a uno, nullable; UNIQUE impide que varios Contents compartan Article | FK `NO ACTION` |
| Content–Video | `content.videoId` | Uno a uno, nullable; UNIQUE impide compartir Video | Migración `FK_content_video` `NO ACTION` (entidad inversa no crea cascada) |
| Content–Riff Valley Playlist | `content.riffValleyPlaylistId` (antes `spotifyId`) | Uno a uno, nullable; UNIQUE impide compartir playlist | FK `NO ACTION` |
| Content–List | `content.listId` | Uno a uno, nullable; UNIQUE impide que varios Contents compartan List | FK `NO ACTION` |
| Content–Reunion | `content.reunionId` | Muchos Contents pueden referenciar una Reunion; no hay UNIQUE | FK `NO ACTION` |
| Video–List | `video.listId` | Muchos Videos pueden apuntar a una List | Migración usa `ON DELETE SET NULL`; la entidad TypeORM no lo declara explícitamente |
| List–Asignation | `asignation.listId` | Una List tiene muchas Asignaciones | FK `ON DELETE CASCADE` |
| Asignation–Disc | `asignation.discId` | Un Disc puede estar en varias Asignaciones | Eliminar Disc borra Asignaciones; eliminar Asignación no borra Disc |
| Reunion–Point | `point.reunionId` | Una Reunion tiene muchos Points | FK `ON DELETE CASCADE` |

`cascade: true` de TypeORM en `List.asignations` y `Reunion.points` es persistencia ORM de la relación; la consecuencia al borrar la fila padre está además declarada en sus FKs `CASCADE`. La exclusividad de Article/Video/Playlist/List no equivale por sí misma a ownership editorial. `Content.type` es un enum, pero no impone que el tipo concuerde con las relaciones opcionales ni que una relación concreta sea exclusiva por tipo.

## Matriz detectada por la auditoría (antes de E-CC-8c-BE)

| Tipo | Recurso relacionado | Relación real | `DELETE Content` actual y sobrevivientes | Asignaciones / tracking / referencias / compartición | Consecuencia intencional y riesgo demostrado |
|---|---|---|---|---|---|
| `article` | Article | Content→Article one-to-one por FK UNIQUE nullable | Borra Content; Article y sus campos (estado, responsables, enlace, timestamps) sobreviven. No hay llamada a ArticlesService. | No hay List desde el camino estándar de creación. La FK impide compartir un Article entre Contents, aunque el servicio no valida por tipo en el modelo. | Consistente con nota de independencia actual y con DELETE Article bloqueado mientras exista Content. La planificación desaparece dejando Article reutilizable. |
| `photos` | Ninguno | Sin FK de recurso específico | Borra solo Content. | No hay asignaciones ni tracking asociados por el modelo Content. Los datos/fotos pueden existir en otro sistema, fuera de estas relaciones. | El endpoint elimina toda la representación backend disponible de esa planificación; no hay entidad local de recurso que proteger. No se demostró borrado de archivos externos. |
| `riff_valley_playlist` | Riff Valley Playlist | Content→Playlist one-to-one por FK UNIQUE nullable | Borra Content; Playlist, su metadata, artistas asociados y `spotifyPlaylistId` sobreviven. No hay llamada a Spotify. | No se puede compartir esa playlist con otro Content por el UNIQUE; las asociaciones locales de artistas no se borran. Spotify remoto queda fuera del flujo. | Coincide con independencia de estados descrita en Lifecycle. El usuario pierde planificación, no la playlist; el mensaje genérico no distingue ambas cosas. |
| `radar` | List (semanal) | Content→List one-to-one por FK UNIQUE nullable | En transacción, borra Content y luego List mediante `ListsService.removeList`. | Borrar List elimina Asignaciones por FK CASCADE y los campos locales WordPress (`wpPostId`, URL, discos/posts JSON). Discs sobreviven. Video.list, si apunta a la misma List, se pone a null según la migración. No se borran posts WordPress remotos. | El borrado de lista puede ser una acción editorial deliberada; perder asignaciones/tracking local es irreversible desde el backend. El Content estándar impide compartir la misma List, pero la List puede ser referenciada por Video. |
| `best` | List (mensual) | Igual que Radar | Igual que Radar; no hay rama específica por `type` al borrar. | Mismos efectos de Asignaciones, Disc, tracking WordPress y Video.list. | Mismos riesgos. No existe prueba que establezca una semántica distinta para Best. |
| `video` | Video y potencialmente List vía Content.list | Content→Video one-to-one; Video→List many-to-one; Content.list también puede existir | **Antes:** borraba Content y List. **Después:** E-CC-8c-BE borra Content y conserva Video, List y Video–List. | No se delega en `ListsService.removeList`; asignaciones y tracking local de List se conservan junto con la relación Video–List. | La creación normal de Video crea Content, pero ambos recursos siguen independientes. |
| `reunion` | Reunion, con Points | Content→Reunion muchos-a-uno, no UNIQUE | Borra Content y ejecuta `DELETE Reunion` dentro de la transacción; Points se eliminan por cascada FK. | Si ningún otro Content referencia Reunion, se borran todos sus Points. Si otro Content la referencia, FK `NO ACTION` rechaza borrar Reunion; falla toda la transacción, conservando Content y Reunion. | La creación de una Reunion nueva con Content y Points es atómica, pero existe creación con `reunionId` ya existente. La eliminación incondicional es incompatible con reutilización permitida y da error de persistencia al compartir. |

“Supervivientes” describe persistencia local del recurso; no garantiza que continúe accesible desde el calendario si se borró su Content.

## Radar y Best: efectos comprobados

`ContentLifecycleService.remove` carga `list`, elimina Content y delega la eliminación de List al coordinador usando el mismo `EntityManager`. La ruta común de `ListsService.removeList` también elimina cualquier Content ligado antes de eliminar List. No hay branching por `RADAR`/`BEST` dentro de `remove`; cualquier Content que tenga `list` dispara el mismo efecto.

La transacción protege los writes locales Content/List. La lista de Asignaciones se borra por FK CASCADE, lo cual borra los vínculos y su `done`, posición, descripción, datos manuales de Spotify/genre y anotaciones; no borra Disc. La fila List contiene tracking/snapshot WordPress que se pierde con ella. No se encontró llamada al publisher de WordPress durante el DELETE: las publicaciones remotas no se eliminan y su estado puede quedar sin referencia local. `Video.list` no bloquea esta operación porque la migración estableció `SET NULL`; el Video permanece, desconectado de esa List.

Las pruebas de `ListContentCoordinator` fijan que DELETE List borra Content y List en una transacción simulada y que revierte ante fallos simulados. `ContentLifecycleService` comprueba que se llama al coordinador. No hay test con FK/DB que compruebe CASCADE de Asignaciones, `SET NULL` de Video ni pérdida de tracking. El endpoint DELETE List por sí mismo tampoco equivale actualmente a borrar solo la List: elimina también su Content.

## Reunions compartidas

La relación TypeORM es `ManyToOne` desde Content; la migración crea solo FK `content.reunionId → reunions.id`, sin índice único. Creation permite recibir un `reunionId` existente incluso con type `reunion`, y `ReunionService.deleteReunion` solo busca un Content arbitrario con ese ID, no cuenta todos los registros.

Al borrar uno de varios Contents que comparten Reunion: se borra primero ese Content dentro de la transacción; después `DELETE Reunion` encuentra aún otra FK y PostgreSQL lo rechaza (`NO ACTION`). No se borra la Reunion ni se rompen otros Contents porque la transacción revierte el primer delete. En Nest el error de FK no se traduce en una excepción de dominio en esta ruta, por lo que el efecto observable esperado es error 500 genérico (pendiente de confirmar con integración aislada); no es un borrado parcial confirmado.

Los specs separan el flujo normal de List y el de Reunion. La regresión de Reunion compartida simula un rechazo del segundo write, comprueba que el error se propaga y que la transacción de prueba no confirma el borrado previo de Content. Los dobles no implementan constraints PostgreSQL: el error 500 genérico del FK `NO ACTION` sigue siendo el resultado esperado hasta que una integración aislada confirme el mapeo HTTP. No se cambia la cardinalidad ni se elimina automáticamente otro Content.

## Endpoint y consumidores

- `DELETE /api/contents/:id`, `ContentsController.remove`; protegido con `@Auth(ValidRoles.riffvalley)`. El guard controla roles, no propiedad del registro. No hay permiso adicional por tipo ni UUID pipe en ese parámetro.
- Retorna `Promise<void>`; Nest responde normalmente **200 con cuerpo vacío** para `@Delete` sin `@HttpCode`. El cliente frontend lo trata como `Promise<void>`. No se encontró test de contrato HTTP para el DELETE de Contents que fije status/body.
- NotFound del Content es 404. Los fallos transaccionales se propagan; el error FK de Reunion no tiene traducción específica y se espera 500 genérico. No se cambia autorización ni contrato en esta investigación.
- Frontend `useContentCalendarOperations` llama el mismo `deleteContent(id)` desde la confirmación general del calendario, modales por tipo y backlog. Mensajes: “eliminar evento”/“eliminar el evento” sin indicar borrado de List/Asignaciones/tracking ni preservación de Article/Video/Playlist; tras 200 invalida calendario y muestra éxito. Error genérico “No se pudo eliminar el evento”.
- RadarActionsModal ofrece una acción separada “eliminar Lista” si hay List; llama DELETE List. Aun así, el backend `DELETE Content` también borra la List asociada. Los tests de frontend comprueban que se invoca `deleteContent`, no qué entidades backend sobreviven.
- ArticlesService, VideosService y RiffValleyPlaylistService bloquean DELETE del recurso si Content sigue asociado, con 400 y mensaje para eliminar Content primero. Esta protección es lógica de aplicación; FK `NO ACTION` actúa además de barrera para borrado directo. Sus endpoints de creación pueden crear Content de backlog. ReunionService hace el camino opuesto: borrar Reunion con Content delega a `ContentsService.remove`, que elimina Content y Reunion.
- Otras referencias inspeccionadas: Content se incluye como referencia resumida en listados/recursos de Article, Video y playlist; Reunion no se carga en las consultas normales de Content y se expone en módulo propio; List se usa también por Video y Asignaciones. No se encontró sincronización remota de WordPress/Spotify en `ContentLifecycleService.remove`.

### Contract finding — DELETE Content tiene efectos por tipo

**Current behavior:** un endpoint protegido con un solo ID elimina Content y, según el tipo, puede eliminar List (+ asignaciones/tracking local) o Reunion (+ Points); Article, Video y Playlist sobreviven. La excepción de Video conserva también List desde E-CC-8c-BE.

**Problem:** la confirmación “eliminar evento” no refleja los efectos variables, y no existe una operación de Content que elimine únicamente la entrada editorial de modo uniforme.

**Impact:** backend + frontend; con potencial de perder datos locales de List y de bloquear la eliminación de Reunions compartidas.

**Options:** preservar las reglas aprobadas con copy preciso; hacer DELETE Content eliminar solo el Content; crear comandos explícitos separados para planificación y recurso.

**Recommendation:** se aprobó conservar las reglas actuales por tipo, con la excepción de Video ya implementada. El frontend debe explicar List/Asignaciones/tracking en Radar/Best, Reunion/Points, Video/List y la conservación de Article/Playlist en sus confirmaciones.

**Blocks the current task:** No; la política y la corrección backend están completadas. La adaptación del copy queda pendiente de la fase frontend E-CC-8.

## Política definitiva aprobada — E-CC-8b-BE

Se mantienen las reglas actuales de eliminación por tipo. La única corrección funcional autorizada en E-CC-8c-BE es que borrar Content tipo `video` no borre su List. No se introduce soft delete, no se cambia el esquema, las cascadas ni las FKs, y no se separan las operaciones coordinadas existentes.

| Tipo | Efecto al borrar Content |
|---|---|
| `article` | Elimina Content; conserva Article. |
| `photos` | Elimina únicamente Content; no limpia almacenamiento externo. |
| `riff_valley_playlist` | Elimina Content; conserva Playlist y sus asociaciones; no llama a Spotify. |
| `radar` | Elimina Content y List; las asignaciones y tracking local de List se eliminan por las consecuencias actuales. Discs sobreviven y no se borran posts remotos de WordPress. |
| `best` | Igual que Radar: elimina Content y List, con asignaciones y tracking local; Discs y posts remotos sobreviven. |
| `video` | Elimina Content; conserva Video, List, la relación Video–List, asignaciones, tracking y demás relaciones del Video. |
| `reunion` | Elimina Content y Reunion; Points se eliminan por la cascada existente. Si otra fila Content referencia Reunion, `NO ACTION` rechaza el borrado y la transacción revierte; el error se propaga. |

La entidad Content puede llevar `list` y Video puede llevar su propia relación `list`; ambas referencias pueden coexistir. La corrección salta la eliminación coordinada de List cuando `content.type === video`, pero mantiene la transacción de Content cuando Content tiene List. Radar/Best siguen usando el coordinador de Lists sin cambios.

La eliminación directa de List conserva su coordinación vigente y también elimina Content enlazado mediante una transacción. No se aprobó cambiar ese contrato. Si futuros casos producen una contradicción funcional entre DELETE List y DELETE Video Content, se debe registrar como decisión pendiente sin ampliar esta corrección.

No se modifican ruta, método, body, respuesta, autorización, jerarquía de roles, semántica existente de errores, GET protegidos, proyecciones públicas, validaciones de fecha, programación ni `Content.ready`. National Releases y el calendario de lanzamientos quedan fuera de alcance. La política de confirmaciones por tipo depende de una fase frontend posterior; no se editaron archivos frontend.

## Tests y límites de verificación

Los specs focalizados cubren eliminación Content+List+Reunion transaccional, rollback ante fallo secundario, 404, Video con y sin List, conservación de `Video.list`, asignaciones y tracking modelados, eliminación efectiva de Content, Radar y Best eliminando List, y DELETE List coordinado con Content con rollback. La Reunion compartida se cubre simulando el rechazo de FK durante el segundo write: el error se propaga y la transacción simulada revierte el borrado de Content. Los dobles no ejecutan PostgreSQL ni prueban físicamente las FKs/CASCADE/SET NULL; no se accede a bases de datos en esta tarea.

Los tests existentes de Article/Photos/Playlist y el contrato de controlador/autorización se revisan y se extienden solo donde falta cobertura focalizada; no se alteran permisos ni contratos. La adaptación de los diálogos de confirmación del calendario queda pendiente en frontend, con copy que detalle Radar/Best, Reunion, Video y Article/Playlist según sus consecuencias reales.

## Registro de tareas

### E-CC-8a-BE — Reconstruir comportamiento DELETE Content

- **Estado:** completada como auditoría estática (2026-10-31); no cambia la refactorización de Contents cerrada por BC-CNT-12 ni el estado formal de Backend Cleanup Editorial.
- **Hallazgos:** política dependiente de tipo; List pierde Asignaciones/tracking local; Content→Reunion permite referencias compartidas mientras el servicio borra Reunion de forma incondicional, lo que hace fallar y revertir el DELETE al compartir.
- **Evidencia:** entidades, migraciones y servicios de Content/List/Reunion/Article/Video/Playlist; specs existentes; consumidor frontend inspeccionado read-only.
- **Exclusiones:** datos/BD de producción, código runtime, tests nuevos, migraciones, permisos, contratos HTTP, frontend, National Releases y calendario de lanzamientos.
- **Verificaciones:** referencias Markdown, checker disponible, `git diff --check`; no ejecutar suite backend.

### E-CC-8b-BE — Aprobar política de ciclo de vida

- **Estado:** completada (2026-10-31), según la decisión funcional entregada para esta tarea.
- **Decisión:** matriz definitiva por siete tipos documentada arriba; se mantienen las reglas existentes excepto Video. Reunion compartida conserva rechazo y rollback. DELETE directo de List conserva el comportamiento coordinado. Sin cambios de contratos o permisos.
- **Dependencia pendiente:** el frontend debe actualizar las confirmaciones de eliminación en su fase E-CC-8; se consultó solo en modo lectura y no se modificó.

### E-CC-8c-BE — Implementar política aprobada

- **Estado:** completada (2026-10-31).
- **Implementación:** Content tipo Video no delega en `ListsService.removeList`; si tiene List, Content sigue eliminándose dentro de una transacción y Video/List quedan intactos. Los demás tipos conservan su rama previa.
- **Regresiones:** Video con/sin List, relación Video–List y datos de List; Radar/Best; rollback simulado de Reunion compartida; coordinación de borrado directo de List.
- **Contrato y exclusiones:** sin cambios en ruta/respuesta/permisos/esquema/fechas/programación y sin cambios frontend. No se accedió a PostgreSQL de producción ni se ejecutaron migraciones.

## Referencias revisadas

- Modelo y ciclo: `src/editorial/contents/entities/content.entity.ts`, `src/editorial/contents/application/content-lifecycle.service.ts`, `src/editorial/contents/application/content-creation.service.ts`, `src/editorial/contents/contents.controller.ts`.
- Relaciones: `src/editorial/{articles,videos,lists,reunions,playlists/riff-valley-playlists}/entities/`; `src/editorial/lists/asignations/entities/asignations.entity.ts`; migraciones `1766137719115-AddListToContent`, `1765995329057-AddReunionToContent`, `1766398035718-RefactorArticlesAndSpotifyEnglishFields`, `1770800000000-CreateVideoEntity`, `1770829235721-RemoveVideoLink`, `1766205233604-AddSpotifyRelationToContent`, `1791300000000-RenameRiffValleyPlaylistPersistence`, `1772646475219-AddCascadeDeleteToUserRelations`.
- Coordinación y consumidores: `src/editorial/lists/application/list-content-coordinator.service.ts`, `src/editorial/reunions/reunions.service.ts`, servicios de Articles/Videos/Riff Valley Playlists y módulos/controllers correspondientes.
- Tests: `contents/application/__tests__/content-lifecycle.service.spec.ts`, `contents/application/__tests__/content-creation.service.spec.ts`, `contents/__tests__/contents.service.spec.ts`, `contents/__tests__/contents.controller.spec.ts`, `lists/application/__tests__/list-content-coordinator.service.spec.ts`, `reunions/__tests__/reunions.service.spec.ts` y specs de servicio Article/Video/Playlist.
- Frontend solo lectura: `src/modules/editorial/content-calendar/application/useContentCalendarOperations.ts`, `presentation/views/ContentCalendar.vue`, modales Radar/Backlog, tests de caracterización y `src/services/contents/contents.ts`.
- Arquitectura previa preservada: `roadmap/backend-cleanup/editorial/videos-contents.md` (BC-CNT-11/12 completadas; esta política de producto es trabajo separado).
- Dependencia frontend pendiente: `riffvalley-app-front/roadmap/editorial/content-calendar.md`; adaptar las confirmaciones de eliminación según la matriz aprobada, sin alterar los cambios backend de esta tarea.
