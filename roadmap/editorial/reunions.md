# R-1-BE — Auditoría de Reunions y reutilización de SSE

Auditoría documental de Reunions/Points y plan mínimo para sincronizar los puntos entre editores. No implementa cambios funcionales, endpoints, migraciones ni eventos.

## Estado

**R-1-BE completada el 2026-11-01.** Se revisó el backend y, en modo de solo lectura, el frontend. No se modificó código funcional ni el repositorio frontend.

**R-2-BE completada el 2026-11-01.** Se retiró el decorador TypeORM impropio del DTO, se amplió la caracterización automatizada y se confirmó que la arquitectura actual no necesita extracciones de servicios ni cambios funcionales. No hubo cambios de endpoints, DTOs públicos, permisos, migraciones, cardinalidad, orden, Contents ni SSE.

| Tarea                                                     | Estado                                              | Alcance                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R-1-BE — Auditoría de arquitectura, contratos y SSE       | Completada; este documento                          | Hechos, riesgos, decisiones pendientes y secuencia propuesta.                                                    |
| R-2-BE — Refactorización localizada de Reunions y Points  | Completada; cierre abajo                            | Corregir deuda confirmada y caracterizar contratos sin cambiar comportamiento HTTP o de negocio.                 |
| R-3-BE — SSE global de cambios confirmados                | Completada; cierre abajo                            | Una conexión por vista, invalidación genérica y transporte/ciclo de vida compartido.                             |
| R-4-FE — Refactorización e integración TanStack Query/SSE | Pendiente; trabajo separado en riffvalley-app-front | Queries tipadas, invalidación remota y protección de borradores/formularios locales.                             |
| R-5 — Validación integrada y cierre                       | Pendiente                                           | Comprobar contratos, rollback/publicación, autorización, reconexión y reconciliación HTTP en ambos repositorios. |

## 1. Arquitectura actual — hechos comprobados

- Reunions vive bajo editorial: [ReunionsModule](../../src/editorial/reunions/reunions.module.ts) registra ReunionService y ReunionController. Points está en un módulo anidado, [PointsModule](../../src/editorial/reunions/points/points.module.ts), con PointService y PointController. No hay capa de aplicación o lector adicional.
- ReunionService hace CRUD, carga los puntos para lecturas y decide cómo eliminar una reunión asociada a Content. PointService valida y cambia la asociación con Reunion, y hace CRUD de puntos. Los dos servicios usan repositorios TypeORM.
- ReunionsModule importa ContentsModule y ContentsService; el servicio también inyecta el repositorio Content. En cambio ContentsModule accede directamente a los repositorios Reunion y Point, sin importar ReunionsModule ni PointsModule. No hay dependencia circular de Nest ni forwardRef entre estos módulos; sí hay dependencia de dominio asimétrica y acoplamiento de ciclo de vida desde Reunions hacia Contents.
- Los specs de controladores, servicios, DTOs, módulos y entidades están dentro de **tests**. Se revisaron pruebas de integración por mocks de repositorios; no se encontró una suite HTTP/PostgreSQL específica de Reunion.
- No hay repositorio propio ni tabla relacional de usuarios en Reunion o Point. El único autor encontrado es Content.author y no se proyecta como propiedad de Reunion. Point conserva título, texto, estado done y createdAt.

## 2. Modelo y relación con Content

- Reunion persiste en reunions con UUID, title/titulo, date/fecha, description, createdAt y updatedAt. TypeORM expone una relación uno-a-muchos a points con cascade de persistencia.
- Point persiste en points con UUID, titulo, content (texto que el frontend presenta como contenido con saltos de línea), done nullable y createdAt. ManyToOne a Reunion tiene ON DELETE CASCADE. No hay columna posición, número de orden ni relación con User.
- Content contiene reunionId nullable y una relación ManyToOne a Reunion; la FK creada por [AddReunionToContent](../../src/migrations/1765995329057-AddReunionToContent.ts) usa ON DELETE NO ACTION. Por tanto, la base de datos no permite borrar directamente una Reunion aún referenciada por Content. La cardinalidad permite técnicamente varios Content para una Reunion; no hay restricción unique que lo impida.
- Las migraciones verificadas documentan la incorporación de reunionId, el cambio de nombres físicos title/date y la adición de description en [UpdateReunionEntity](../../src/migrations/1766153919069-UpdateReunionEntity.ts), y la normalización de createdAt/updatedAt en [AddUpdatedAtToReunion](../../src/migrations/1779176693909-AddUpdatedAtToReunion.ts). No se encontró una migración de posición de Points ni una tabla de asignación de usuarios.

**Riesgo de relación:** ReunionService.deleteReunion busca un único Content por reunionId y delega el borrado de ese Content. Si hay más de una referencia, ContentLifecycleService intenta borrar la Reunion y las demás FK pueden hacer fallar y revertir la transacción. R-2 caracteriza la delegación y el rollback al propagarse un error de restricción simulado, además de comprobar los metadatos actuales de relación; no ejecuta PostgreSQL para demostrar la restricción real. No cambiar la cardinalidad ni la regla de borrado sin decisión funcional.

## 3. Contratos HTTP y permisos actuales

El prefijo global es /api. Todos los GET enumerados son públicos en los controladores; POST/PATCH/DELETE requieren @Auth(ValidRoles.riffvalley), que admite también el rol superior según la jerarquía de Identity.

| Ruta          | Método | Permiso    | Respuesta y efecto observable                                                                                                     |
| ------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| /reunions     | GET    | Público    | Lista Reunion con todos sus Points y fecha descendente; no pagina aunque el cliente envíe limit/offset.                           |
| /reunions/:id | GET    | Público    | Una Reunion con todos sus Points. 404 si no existe.                                                                               |
| /reunions     | POST   | riffvalley | Crea Reunion desde titulo, fecha y description opcional; devuelve la entidad.                                                     |
| /reunions/:id | PATCH  | riffvalley | Actualiza parcialmente titulo, fecha o description; devuelve la entidad con Points.                                               |
| /reunions/:id | DELETE | riffvalley | Borra la Reunion y Points en cascada; si hay Content asociado, elimina Content por su ciclo de vida. Devuelve sin body explícito. |
| /points       | GET    | Público    | Lista todos los Points con su Reunion; carga todo el conjunto.                                                                    |
| /points/:id   | GET    | Público    | Un Point con Reunion. 404 si no existe.                                                                                           |
| /points       | POST   | riffvalley | Crea punto con titulo, reunionId UUID v4 y content/done opcionales; valida existencia de Reunion y devuelve el Point guardado.    |
| /points/:id   | PATCH  | riffvalley | Cambia parcialmente titulo/content/done; también permite reasignar reunionId existente. Devuelve el Point guardado.               |
| /points/:id   | DELETE | riffvalley | Elimina un Point; 404 si no existía.                                                                                              |

Los DTOs usan ValidationPipe global con whitelist/forbidNonWhitelisted/transform. Los campos de Reunion se validan razonablemente; Point valida título, UUID, texto y booleano. Hallazgo puntual: [CreatePointDto](../../src/editorial/reunions/points/dto/create-points.dto.ts) importa y aplica el decorador TypeORM @Column a una propiedad del DTO, que no tiene efecto en la persistencia ni pertenece al contrato de validación. No se propone ampliar las rutas.

### Contract finding

**Current behavior:** GET /reunions y GET /points, incluido GET /points/:id, son públicos y retornan puntos completos; los cambios requieren rol riffvalley. Las reuniones no tienen visibilidad restringida en el modelo.

**Problem:** una suscripción SSE autenticada por reunión no debe tratar el identificador recibido como autorización ni filtrar los puntos a partir del parámetro sin comprobar que la Reunion existe. Los GET públicos también significan que el stream no introduce una frontera de confidencialidad por reunión distinta de la política actual.

**Impact:** backend + frontend.

**Options:** preservar lecturas HTTP actuales y autorizar el SSE con el rol existente más lookup de Reunion; cambiar la visibilidad HTTP en una tarea funcional separada; o añadir permisos por reunión, que no existen hoy.

**Recommendation:** mantener el contrato HTTP y exigir @Auth(ValidRoles.riffvalley) en el stream; validar que Reunion existe antes de abrir la conexión. Mantener la conexión acotada por reunión. Documentar que el guard verifica identidad al inicio, no de forma continua; reutilizar el cierre máximo de 10 minutos y reconexión del SSE existente.

**Blocks the current task:** No. Es requisito de diseño para R-3, no requiere cambiar los permisos actuales.

## 4. Ciclo de vida de Points

No existe operación HTTP de ordenación o cambio de posición. El orden de salida no se declara en la relación ni en find/findOne; por tanto, SQL no garantiza orden estable. El frontend mantiene el orden recibido, añade el punto creado al final y, en otras vistas, vuelve a consultar la Reunion. No inventar una operación de reorder en esta fase.

| Mutación         | Endpoint / servicio                                     | Escrituras y transacción                                                                                                                                                                                | Confirmación y datos para el cliente                                                                                                                  |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crear Point      | POST /api/points → PointService.createPoint             | Busca Reunion, crea Point asociado y hace repository.save; no abre transacción explícita. Una escritura.                                                                                                | Promise de save resuelta antes de responder: confirmado. Retorna el Point guardado (id, reunion, campos y createdAt); el editor conoce reunionId.     |
| Editar campos    | PATCH /api/points/:id → PointService.updatePoint        | Carga Point con Reunion, asigna titulo/content/done y guarda; una escritura, sin transacción explícita.                                                                                                 | Tras resolver save. Retorna Point guardado; UI usa título/texto/estado.                                                                               |
| Reasignar Point  | PATCH /api/points/:id → PointService.updatePoint        | Puede buscar Reunion nueva y actualizar la FK del Point en la misma escritura final. Sin transacción explícita de aplicación.                                                                           | Tras resolver save. Hay que refrescar la lista de la reunión vieja y la nueva; el DTO de respuesta incluye la Reunion nueva.                          |
| Eliminar Point   | DELETE /api/points/:id → PointService.deletePoint       | DELETE por id; una escritura, sin transacción explícita.                                                                                                                                                | Tras resolver delete; 404 si affected=0. No devuelve el Point borrado, así que el cliente debe conservar antes su reunionId para actualizar UI/cache. |
| Cambiar done     | PATCH /api/points/:id → PointService.updatePoint        | Es el mismo PATCH; no hay endpoint/servicio específico. Guarda solo done si ese es el body.                                                                                                             | Tras resolver save. Frontend actualiza optimistamente su copia local y muestra error si falla, sin revertir explícitamente el valor previo.           |
| Eliminar Reunion | DELETE /api/reunions/:id → ReunionService.deleteReunion | Si hay Content, ContentLifecycleService elimina Content y Reunion dentro de transacción; ON DELETE CASCADE elimina Points. Si no hay Content, una sentencia DELETE Reunion activa la cascada de Points. | Sin body explícito al completar. El cliente ya tiene el id de Reunion para quitarla de la lista y cerrar la edición.                                  |

El POST/PATCH de Point y PATCH de Reunion son una escritura cada uno; no se justifica envolverlos en una transacción de aplicación hasta que se añadan efectos de varias filas. La creación de Reunion no guarda Points. La creación desde Content sí crea dos Points predeterminados dentro de la transacción que crea Content+Reunion. No hay relación por usuario, estado adicional ni lote de mutación de puntos expuesto por HTTP.

## 5. Content Calendar: propiedad y sincronización

- Crear un Content de tipo reunion es propiedad de ContentCreationService, no del endpoint POST /reunions. En una misma transacción crea Reunion con título/fecha derivados de Content y dos puntos predeterminados (“Asignar Radar semanal” y “Crónicas y artículos pendientes”), enlaza ambos y guarda Content. Si se proporciona reunionId existente, lo enlaza y no crea ni modifica Points.
- Actualizar Content vinculado es propiedad de ContentLifecycleService. Si el tipo es reunion o tiene reunionId, Content y Reunion se sincronizan en transacción: nombre pasa a titulo y publicationDate a fecha. La relación se conserva; cambiar/limpiar reunionId actualiza la referencia de Content según el DTO vigente.
- Eliminar Content con Reunion carga la relación y, dentro de la misma transacción, elimina Content y luego Reunion; la cascada SQL elimina sus Points. Después de commit publica un único contents.invalidate v2 de Content eliminado. El fallback genérico de calendario también pertenece al publicador actual.
- Eliminar Reunion directamente, si hay Content, delega en ContentsService.remove(); por ese camino se conserva exactamente el comportamiento anterior y se produce la única invalidación v2 que corresponde al Content realmente eliminado. Si no hay Content, solo se elimina Reunion/Points y no hay cambio de Content que invalidar.
- Editar Reunion directamente no actualiza Content. Por ello no se debe invalidar el calendario ante una mutación de Point ni por un cambio aislado de Reunion: la representación de Content no ha cambiado. Si una operación real de Content elimina su Reunion, el evento existente de Content cubre la operación; un evento separado de Points/Reunions para esa misma cascada sería redundante para el editor que ya consume el evento del calendario.

## 6. Deuda y propuestas localizadas

1. **Concentración de lifecycle de Points:** crear, editar, reasignar y eliminar vive en PointService; `done` no tiene caso de uso propio y no hay una operación de ordenación. Conservar un único servicio pequeño. Si R-2 extrae operaciones, hacerlo solo alrededor del comportamiento común confirmado, sin un servicio por endpoint.
2. **Frontera Contents/Reunions:** ReunionService depende de ContentsService solo para borrado coordinado, y Contents accede a entidades/repositorios de Reunion/Point directamente para creación, sincronización y borrado. No hay ciclo de Nest, pero dos dominios son propietarios de operaciones cruzadas. Mantener Contents como dueño de las mutaciones Content+Reunion que necesitan atomicidad; reducir el acoplamiento del borrado directo solo si se puede conservar la misma transacción, publicación única y semántica de FK. No mover lógica transaccional a Reunion sin caracterizar rollback.
3. **Puntos sin orden contractual:** la respuesta depende de orden no especificado; antes de añadir orden explícito o persistido, confirmar si el usuario necesita reordenar. No añadir columna/migración en R-2/R-3.
4. **DTO:** quitar @Column de CreatePointDto y mantener validaciones/campos/serialización iguales; corregir en un cambio con su prueba focalizada.
5. **Lecturas amplias:** GET /reunions carga Points para todas las filas y GET /points carga Reunion para todos los puntos. La pantalla de lista usa GET /reunions y necesita points para contadores/previsualización, por lo que la relación eager de esa consulta es observable. No hay paginación real aunque el frontend envía limit/offset. No cambiar payload ni paginar sin decidir contrato/consumidores; GET /points sin consumidor localizado requiere confirmar antes de marcarlo muerto.
6. **Pruebas:** R-2 añadió cobertura de reasignación confirmada, validación de destino y no-op, CRUD/404, rutas y permisos, creación de Content con sus dos Points predeterminados, reutilización de Reunion existente, rollback transaccional simulado y metadatos de cascada/FK. No hay PostgreSQL de prueba aislado configurado para demostrar restricciones reales; no se conectó a servicios reales.
7. **Duplicación frontend observada, solo lectura:** EditReunion.vue y ReunionEditModal.vue repiten carga y edición de puntos. El servicio reunions.ts declara helpers alternativos para Points, uno de ellos usa POST /reunions/:id/points, ruta inexistente; el flujo activo usa services/points/point.ts y POST /points. Tipos/helpers usan any. Mantener como candidato FE: confirmar referencias/rutas antes de eliminar legacy.

No se encontró evidencia suficiente para declarar código muerto, una consulta particular innecesaria o una necesidad de transacción adicional en operaciones de un solo Point. Tampoco se recomienda CQRS, microservicios, event sourcing, Redis, persistencia de eventos ni nuevo esquema.

## 7. Reutilización de SSE

La infraestructura de Content Calendar en [ContentCalendarRealtimeModule](../../src/editorial/contents/realtime/content-calendar-realtime.module.ts) está compuesta por:

- ContentCalendarEventPublisher: Subject RxJS en memoria, API subscribe/unsubscribe, contadores y publicación segura con fallback. Al destruir módulo completa el Subject.
- ContentCalendarStreamService: gestiona streams activos, evento inicial de invalidación, heartbeat cada 25 s, duración máxima de 10 min, backpressure, errores y cierre/limpieza de listeners, timers y suscripción al shutdown. Mantiene métricas de conexiones.
- ContentCalendarEventsController: GET /api/contents/events protegido por el rol riffvalley.
- Contrato v2 y encoder SSE específicos de Content Calendar: contents.invalidate. El módulo de Contents exporta el módulo de realtime; no hay bus global ni Redis.
- El cliente frontend usa fetch Bearer, renueva sesión al 401, reintenta, aborta al terminar la sesión y no usa EventSource nativo. Es una base reusable para el transporte y el ciclo de vida, no para cambiar el contrato de calendario.

### Decisión funcional definitiva para R-3-BE

La decisión posterior a R-1 sustituye la recomendación de streams individuales por reunión: Reunions se muestra y gestiona desde una vista conjunta, por lo que habrá **una única conexión por instancia activa de esa sección**.

- Endpoint global: `GET /api/reunions/events`, registrado antes de `GET /api/reunions/:id`.
- Contrato único `reunions.invalidate` v1, con `reason: initial | change`; payload sin identificadores, contenido de Points ni datos personales.
- Cualquier cambio confirmado de cualquier Reunion o Point invalida genéricamente las queries raíz de Reunions. No hay filtrado por reunión, salas, suscripciones dinámicas ni eventos descriptivos.
- `/api/contents/events` y `contents.invalidate` v2 siguen siendo independientes e intactos. Solo se reutilizan transporte y ciclo de vida SSE; los publishers y contratos continúan siendo específicos de cada dominio.
- El transporte compartido conserva heartbeat de 25 s, duración máxima de 10 min, backpressure, cancelación, limpieza, cierre y métricas. No se crea un bus global.
- La publicación es best-effort y ocurre una vez por operación lógica, después de completar el commit. Nunca se publica desde una rama subordinada que use un `EntityManager` externo ni después de rollback.

Las recomendaciones anteriores de endpoint por `reunionId`, validación de existencia de una reunión al abrir el stream, filtrado de destinatarios, payload con `reunionId(s)` y evento separado de eliminación quedan **superadas** por esta decisión.

## 8. Contrato definitivo y audiencia

El contrato tipado y discriminado tiene una sola forma:

```text
event: reunions.invalidate
data: {"type":"reunions.invalidate","version":1,"reason":"initial"}

event: reunions.invalidate
data: {"type":"reunions.invalidate","version":1,"reason":"change"}
```

Todos los editores autorizados conectados reciben la misma invalidación global. No incluir `reunionId`, `reunionIds`, Point, título, texto, estado, editor ni datos personales. El cliente recupera los datos por HTTP/TanStack Query; no hay historial ni replay.

Crear, editar, cambiar `done`, reasignar y eliminar Point produce una invalidación única tras persistir. Las operaciones sin cambios detectables no publican; errores, 404 y validaciones fallidas tampoco. La reasignación sigue siendo compatible y no requiere comunicar origen o destino porque se invalida la raíz completa.

Las mutaciones de Content que crean una Reunion con puntos predeterminados, sincronizan realmente título/fecha o eliminan Reunion publican una invalidación global después del commit completo. Crear con puntos predeterminados emite una vez, no una vez por Point. Vincular una Reunion existente sin modificar campos consumidos por la vista no emite. Una cascada no publica desde la rama subordinada.

El publisher no propaga errores al request después de que la escritura se confirmó. Se conserva el evento de calendario cuando corresponda, pero las operaciones aisladas de Reunions/Points nunca se publican en Content Calendar.

## 9. Impacto frontend — inspección de solo lectura

- Vistas encontradas: [ListReunion.vue](../../../riffvalley-app-front/src/views/reunions/ListReunion.vue), [EditReunion.vue](../../../riffvalley-app-front/src/views/reunions/EditReunion.vue), [ReunionTable.vue](../../../riffvalley-app-front/src/views/reunions/components/ReunionTable.vue) y [ReunionEditModal.vue](../../../riffvalley-app-front/src/views/reunions/components/ReunionEditModal.vue). La lista crea Reunion mediante POST /contents (tipo reunion), luego obtiene GET /reunions. Los editores leen GET /reunions/:id y mutan puntos por /points.
- Los servicios están en [reunions.ts](../../../riffvalley-app-front/src/services/reunions/reunions.ts) y [point.ts](../../../riffvalley-app-front/src/services/points/point.ts). El contrato frontend está traducido del español del backend a title/date, pero usa any para points, payloads y mappers. Hay helpers alternativos con POST /reunions/:id/points que no corresponde al controlador backend; el flujo activo verificado importa el servicio /points. El GET /reunions activo envía limit/offset que el backend ignora.
- Reunions mantiene estado remoto en arrays/ref locales y vuelve a cargar por servicios Axios; aunque TanStack Vue Query está instalado y usado en otros módulos, no hay useQuery/useMutation de TanStack en las rutas/servicios de Reunions. No se encontraron tests frontend dedicados a Reunion/Point.
- Realtime para R-4-FE: al recibir el evento global, invalidar la raíz de queries de Reunions vía TanStack Query. El SSE no debe escribir directamente el contenido remoto en estado local.
- Hay formularios editables abiertos con borradores en ReunionEditModal/EditReunion y modal de Point. Para no sobrescribirlos, separar datos de servidor de borrador local; invalidar/refetch sin copiar automáticamente datos a campos dirty; reconciliar solo al cerrar/guardar/cancelar o mostrar que llegó una actualización remota. Las listas pueden reflejar invalidación/refetch. Ignorar o reconocer eventos propios solo si sourceId o un identificador de mutación se adopta deliberadamente; R-3 no requiere meter datos completos en eventos.
- Mantener frontend como cambio separado R-4-FE. Reutilizar el cliente de fetch Bearer, ciclo de sesión y reconexión que usa el SSE de Content Calendar, adaptado a una URL/event parser tipado del dominio. No usar EventSource con token en query string.

## 10. Riesgos y decisiones pendientes

1. Confirmar si una Reunion debe tener como máximo un Content. El modelo actual no lo fuerza; modificar cardinalidad, FKs o borrado requiere política de producto y migración aparte.
2. No hay orden explícito de Points. Mantener orden actual no garantiza estabilidad; decidir si basta la secuencia incidental o se necesita capacidad de ordenación en otra fase.
3. El guard SSE autentica/autorización una sola vez al abrir; con revocación de rol durante el stream, el cierre máximo de 10 minutos limita la vigencia. Reutilizar exactamente la política vigente, salvo que el producto pida revocación más inmediata.

## 11. Secuencia mínima

### R-2-BE — Refactorización backend localizada

- **Completada el 2026-11-01.** Se quitó `@Column` y su import de `CreatePointDto`; se mantuvieron validadores y campos. Se ampliaron pruebas de servicios, controller, DTO, metadatos y ciclo de vida de Contents.
- PointService conserva creación, lectura, actualización, reasignación y borrado. La reasignación valida la Reunion de destino antes de mutar/guardar; si no existe, responde 404 y no persiste. La respuesta guardada sigue incluyendo la relación `reunion` y no expone `reunionId` como campo adicional.
- DELETE de Reunion sin Content sigue usando la cascada SQL de Points. Con Content, delega exclusivamente en Contents, donde Content y Reunion se eliminan en la transacción existente; un error de eliminación se propaga y el doble transaccional local comprueba rollback. Para varias referencias, el test simula el error de FK: la restricción real no se ejecutó en PostgreSQL.
- Content de tipo Reunion sigue creando Reunion, los dos Points (“Asignar Radar semanal” y “Crónicas y artículos pendientes”) y Content en un mismo EntityManager transaccional. La prueba verifica asociaciones, reuse de `reunionId` existente sin recrear Points y rollback cuando falla cada escritura auxiliar.
- No se extrajeron servicios ni se modificaron ReunionService, PointService, módulos o Contents: cada responsabilidad ya está localizada y mover la escritura de defaults perdería el EntityManager transaccional o duplicaría lógica. No hubo cambio de orden, permisos, contratos, cascadas, esquema ni SSE.
- **Verificación:** 8 suites focalizadas, 77 pruebas; `pnpm run verify` pasó, incluidas 273 suites/2.681 pruebas unitarias, typecheck (0 errores), build, gates de estructura/tipado/ESLint/runtime. ESLint conserva 832 diagnósticos históricos y reporta 0 nuevos. Prettier `--check` y `git diff --check` pasaron.
- **Limitaciones:** las relaciones y rollback de constraint se caracterizaron con metadatos y dobles locales; no se probó el comportamiento real de claves foráneas contra PostgreSQL. El orden de Points continúa sin garantía contractual. El trabajo queda listo para R-3 sin emitir eventos.

### R-3-BE — SSE global de Reunions

- **Completada el 2026-11-01.** Se implementó `GET /api/reunions/events`, protegido con `@Auth(ValidRoles.riffvalley)` y Bearer JWT existente. `superadmin` accede por la jerarquía de roles. El stream envía una invalidación inicial inmediata y no consulta Reunion ni PostgreSQL al abrir.
- Contrato definitivo: `reunions.invalidate` v1 con `reason: initial | change`; payload genérico sin IDs ni datos de reunión/punto. Sin replay, historial, filtrado por reunión, salas ni suscripciones dinámicas.
- Se extrajo `EditorialSseTransport` bajo `EditorialRealtimeModule` para cabeceras, heartbeat de 25 s, timeout de 10 min, backpressure, abort/desconexión, limpieza, errores, shutdown y métricas por dominio. Content Calendar conserva su publisher/contrato v2, endpoint y contadores independientes; sus pruebas HTTP y de ciclo de vida pasan.
- `ReunionsEventPublisher`, su contrato, controlador y stream pertenecen a Reunions. ReunionService publica tras crear, cambios efectivos y eliminación directa; PointService publica tras crear, cambios efectivos, reasignar y borrar. Los no-op no emiten.
- ContentCreationService publica una vez tras el commit al crear una Reunion con los dos puntos iniciales; asociar una Reunion existente no publica. ContentLifecycleService publica tras commit al sincronizar realmente título/fecha o eliminar Reunion. Las eliminaciones delegadas publican una sola vez desde el ciclo de vida de Contents.
- Todas las notificaciones son best-effort y quedan fuera de la transacción. Rollback, errores de escritura, 404, validación fallida y operaciones sin cambios efectivos no emiten. Las mutaciones aisladas de Reunions/Points no publican en Content Calendar.
- **Verificación:** `pnpm run verify` pasó: 275 suites aprobadas y 2.691 tests aprobados (31 suites y 165 tests omitidos por configuración), typecheck con 0 errores, build y runtime dependency gate correctos, structural gate con 0 infracciones nuevas, type-safety gate con 0 nuevas y ESLint con 0 nuevas (832 históricas). Pruebas focalizadas de Reunions, Contents y SSE de ambos dominios: 15 suites, 135 tests aprobados. Prettier `--check` y `git diff --check` verificados.
- **Limitación:** los publishers en memoria notifican conexiones atendidas por la misma instancia del proceso; no se añadió transporte entre dynos, según la restricción de no introducir Redis. No se accedió a producción. R-4-FE y R-5 siguen pendientes.

### R-4-FE — cambio separado en riffvalley-app-front

- Sustituir estado remoto legacy de Reunions por queries tipadas TanStack Query y servicios con tipos concretos; confirmar referencias antes de eliminar helpers legacy o elegir una sola superficie de edición.
- Integrar el stream global de Reunions con auth Bearer y renovación actual; invalidar la raíz de queries de Reunions y recuperar siempre los datos por HTTP. Mantener una conexión por vista activa y cerrarla al abandonar la sección.
- Conservar formularios/drafts abiertos ante refetch remoto; añadir pruebas de parser, invalidación por reunión origen/destino, desconexión y draft sin sobrescritura.

### R-5 — validación integrada

- Verificar que las operaciones existentes y permisos no cambiaron, los editores autorizados reciben invalidaciones globales de Reunions, Content Calendar mantiene exactamente su contrato v2 y cambios aislados de Points no generan eventos de Content.
- Confirmar eliminación de Content/Reunion, recuperación por 404, reintentos, HTTP como fuente de verdad y separación de PRs backend/frontend.

## Referencias inspeccionadas

- Backend Reunions/Points: src/editorial/reunions/reunions.module.ts, reunions.controller.ts, reunions.service.ts, entities/reunion.entity.ts, dto/_; points/points.module.ts, points.controller.ts, points.service.ts, points/entities/point.entity.ts, points/dto/_; sus **tests**.
- Contenido/ciclo de vida: src/editorial/contents/entities/content.entity.ts, contents.controller.ts, contents.module.ts, application/content-creation.service.ts, application/content-lifecycle.service.ts y tests de creación/ciclo de vida.
- SSE actual: src/editorial/contents/realtime/content-calendar-realtime.module.ts, content-calendar-event-publisher.service.ts, content-calendar-stream.service.ts, content-calendar-events.controller.ts, contracts/content-calendar-event.contract.ts y tests realtime.
- Migraciones: 1765995329057-AddReunionToContent.ts, 1765995817204-AddDescriptionToReunion.ts, 1766153919069-UpdateReunionEntity.ts, 1779176693909-AddUpdatedAtToReunion.ts.
- Frontend en solo lectura: riffvalley-app-front/src/views/reunions/\*, src/services/reunions/reunions.ts, src/services/points/point.ts, y cliente SSE src/modules/editorial/content-calendar/application/contentsEventsClient.ts.
