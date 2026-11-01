# SSE — Sincronización en tiempo real de Content Calendar

Roadmap backend para sincronizar entre editores los cambios de **Content Calendar** mediante Server-Sent Events (SSE). SSE invalida las consultas y, desde v2, adjunta descriptores editoriales efímeros; los registros completos se consultan mediante los endpoints HTTP actuales. El alcance no incluye notificaciones generales, logros ni otras capacidades.

## Estado y alcance

**Primera fase SSE de Content Calendar: COMPLETADA Y CERRADA el 2026-11-01.** El propietario confirmó personalmente que SSE v2 funciona correctamente en Heroku, incluida la sincronización entre editores y los toasts descriptivos. Es aceptación funcional integrada observada por el propietario, no un benchmark ni una certificación de capacidad.

| Tarea                                            | Estado final                                                |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `SSE-1` — Auditoría y decisiones arquitectónicas | Completada y documentada.                                   |
| `SSE-2` — Infraestructura SSE                    | Completada en backend.                                      |
| `SSE-3` — Publicación tras commit                | Completada en backend.                                      |
| `SSE-4` — Cliente SSE y TanStack Query           | Completada en frontend.                                     |
| `SSE-6a-BE` — Contrato descriptivo               | Completada en backend.                                      |
| `SSE-6b-FE` — Toasts descriptivos                | Completada en frontend.                                     |
| `SSE-5` — Aceptación funcional integrada del MVP | Cerrada por aceptación funcional del propietario en Heroku. |

El único contrato vigente es `contents.invalidate` v2. SSE-5 se cierra por aceptación funcional; las pruebas formales de carga y escalabilidad se aplazan conscientemente a `SSE-OPS-1`, seguimiento operativo separado y no bloqueante. No se reabre E-CC.

## 1. SSE-1 — Auditoría y decisiones arquitectónicas

### 1.1 Hechos verificados

**Backend y dominio**

- El prefijo HTTP global es `/api`; CORS usa `AUTH_HTTP_CORS_OPTIONS` y una lista exacta de orígenes. Las peticiones HTTP pasan por `ValidationPipe` global. Véanse [`src/main.ts`](../../src/main.ts) y [`session-http-cors.ts`](../../src/identity/auth/session-http/session-http-cors.ts).
- `ContentsModule` reúne el controlador, la fachada `ContentsService` y las piezas ya separadas `ContentQueryService`, `ContentCreationService` y `ContentLifecycleService`. Usa TypeORM; el contrato de lectura mensual es `GET /api/contents/by-month` y backlog utiliza el endpoint de Contents existente con sus filtros. No se requiere cambiar estos contratos.
- `ContentCreationService.create()` guarda Content y, según tipo, sus entidades auxiliares y List dentro de una transacción TypeORM. La promesa de `manager.transaction()` se resuelve después del commit; una excepción rechaza la promesa y produce rollback.
- `ContentLifecycleService.update()` escribe Content directamente cuando no hay sincronización asociada. Si sincroniza una List o Reunion, la escritura completa está dentro de una transacción. `remove()` puede eliminar Content, List y Reunion en una transacción; en otros casos elimina Content directamente.
- Articles, Videos y Riff Valley Playlists pueden crear un Content de backlog delegando en `ContentsService.create()`. Sus cambios posteriores son independientes de Content según los servicios actuales. No se encontró sincronización de Content al actualizar el estado o los datos de esas entidades. Su eliminación cuando existe Content asociado está bloqueada hasta quitar el Content.
- `ListContentCoordinator.update()` sincroniza las fechas de Content cuando una actualización de List realmente cambia las fechas vinculadas; esa escritura ocurre en una transacción. `removeList()` puede borrar el Content asociado. Cuando recibe un `EntityManager`, participa en la transacción del llamador; por tanto, no puede publicar desde esa rama.
- La eliminación de Reunion asociada delega en `ContentsService.remove()`; la eliminación de Content desde ese camino queda cubierta por el punto común de ciclo de vida. Crear una Reunion desde Content y sincronizar su título/fecha desde Content son efectos secundarios de la misma operación lógica, no eventos separados.
- El scheduler semanal crea Content a través de `ContentsService.create()` y quedaría cubierto por ese punto común.
- Las dependencias incluyen `rxjs` 7.8.1, NestJS 10, Express y TypeORM; no hay paquete de infraestructura EventEmitter instalado ni un bus de eventos de dominio general localizado. RxJS se usa de forma puntual en código existente, no como infraestructura editorial.

**Autenticación y roles**

- `@Auth(ValidRoles.riffvalley)` aplica Passport JWT y `UserRoleGuard`. La estrategia acepta exclusivamente `Authorization: Bearer …`, valida usuario activo y `credentialVersion`; el guard vuelve a consultar la identidad y verifica el rol. La jerarquía sitúa `riffvalley` y `superadmin` por encima de `user` y `collaborator`.
- El flujo de sesión renovable del cliente emite un access token JWT de 15 minutos y un refresh token opaco en cookie HttpOnly, Secure, con política SameSite y ruta `/api/auth`. Login, refresh y logout tienen además validación de origen/metadatos y protección CSRF propia. La configuración JWT general conserva una expiración de 8 horas para los caminos que la usen.
- El logout revoca la sesión y limpia la cookie de refresh. El JWT de acceso no lleva actualmente un identificador de sesión consultado en cada petición; la autenticación/rol se evalúan al iniciar la petición, no continuamente dentro de una respuesta abierta. Decisión aprobada e implementada: limitar cada stream a 10 minutos, por debajo del access token renovable de 15 minutos, y volver a autenticar al reconectar. Se acepta expresamente que la revocación remota no cierre el stream antes del cierre programado; no hay revalidación periódica ni extensión de Identity en el MVP.
- El refresh token no autentica peticiones de Contents y la cookie no se envía a una ruta fuera de `/api/auth`. No existe cookie de access token para `EventSource`.

**Frontend (consulta de solo lectura)**

- El calendario mantiene query keys aisladas por usuario, generación de sesión y rol. Hay una query por mes y otra para backlog en [`contentCalendarQueries.ts`](../../../riffvalley-app-front/src/modules/editorial/content-calendar/application/contentCalendarQueries.ts).
- Las mutaciones centralizan invalidación de la raíz de Content Calendar en `useContentCalendarOperations.ts`; operaciones con Lists también invalidan consultas de detalles. El cliente TanStack Query desactiva `refetchOnWindowFocus` y `refetchOnReconnect` globalmente.
- La sesión frontend guarda el access token en el estado de autenticación y lo añade como Bearer a Axios. La renovación pasa por `sessionAuthTransport` y el coordinador de sesiones entre pestañas. Las query keys privadas incluyen la identidad de sesión para evitar mezclar cachés.
- `ContentCalendar.vue` conserva modales de edición y selección con estado local; las operaciones mantienen IDs de contenidos pendientes y reconciliaciones para movimientos inciertos. Esto hace importante que SSE invalide y vuelva a consultar sin escribir datos directamente en caché ni sobrescribir borradores abiertos.

**Heroku**

- La documentación actual de Heroku describe una ventana inicial de 30 segundos para enviar respuesta y, una vez empieza el streaming, un timeout rodante de 55 segundos que se reinicia con cada byte; una conexión sin actividad durante ese intervalo termina. Se documenta un heartbeat de 25–30 s para dejar margen. [HTTP Routing — Heroku Dev Center](https://devcenter.heroku.com/articles/http-routing).
- El router Common Runtime admite múltiples conexiones simultáneas, pero esto no fija la capacidad de esta aplicación, del dyno contratado, del plan ni del proceso. El tipo/tamaño del dyno y métricas reales de memoria/CPU no se han verificado en esta auditoría.
- `main.ts` no instala middleware de compresión; la respuesta SSE añade `no-transform`, solicita no-buffering mediante `X-Accel-Buffering: no` y vacía el buffer de compresión solo si la respuesta expone `flush()`.

### 1.2 Puntos exactos de emisión tras el commit

La regla de implementación es **una señal por operación lógica confirmada**, y ninguna señal si falla/ocurre rollback. SSE no debe publicarse dentro de una transacción TypeORM: un `Subject.next()` no se puede deshacer.

| Operación lógica                                                                     | Punto de persistencia y emisión propuesto                                                                                                                                    | Cobertura / condición                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Crear Content, incluido desde Articles/Videos/Playlists y scheduler                  | `ContentCreationService.create()`: esperar el resultado de `manager.transaction(...)`; publicar la invalidación después de su resolución                                     | Toda la operación Content + entidades/lista auxiliares ya hizo commit. Si rechaza, no emitir.                                                                                                                                                                |
| Actualizar Content, incluida programación, retirada al backlog y movimiento de fecha | `ContentLifecycleService.update()`: esperar el resultado de la rama transaccional o del `save()` no transaccional y emitir después de que resuelva                           | Un evento para la operación aunque cambien Content + List/Reunion. Preferir no emitir si el patch no produce cambio persistido.                                                                                                                              |
| Eliminar Content                                                                     | `ContentLifecycleService.remove()`: emitir solo después de que resuelva `transaction(...)` o `remove()`                                                                      | Si cae la transacción, no emitir. Incluye la eliminación de Reunion y, cuando la regla actual aplica, de List dentro de la misma transacción.                                                                                                                |
| Actualizar fechas de Content desde Lists                                             | `ListContentCoordinator.update()`: devolver internamente un resultado tipado con `contentChanged`; publicar después de que resuelva la transacción que guarda List y Content | Sin evento si cambió solo List o si las fechas de Content no cambiaron.                                                                                                                                                                                      |
| Eliminar List con Content asociado por la ruta independiente de Lists                | `ListContentCoordinator.removeList()` sin `EntityManager`: publicar después de que resuelva su transacción, solo si eliminó Content                                          | Cuando recibe `EntityManager` de `ContentLifecycleService.remove()`, no publicar; el llamador publica una sola vez al final de su operación global.                                                                                                          |
| Cambios de Article, Video, Riff Valley Playlist o Reunion                            | Ningún punto adicional observado                                                                                                                                             | Sus cambios no actualizan Content en el comportamiento actual. La creación desde Article/Video/Playlist y la creación/eliminación delegada por Reunion quedan cubiertas por Content lifecycle. Revisar si una futura modificación altera esta independencia. |

Antes de SSE-3, caracterizar los caminos transaccionales existentes con pruebas locales: éxito, excepción antes del commit, rollback en escritura auxiliar y llamada anidada con manager. La emisión posterior al commit deja una pequeña ventana donde el proceso podría terminar antes de notificar; es aceptable para avisos efímeros porque la conexión/reconexión recupera el estado por HTTP. No se propone outbox persistente en el MVP.

### 1.3 Recomendación de transporte y autenticación

**Recomendación: SSE unidireccional consumido mediante `fetch` y `ReadableStream` en el navegador**, con el access JWT actual en el header Bearer. Mantener el modelo de autenticación existente y reutilizar su renovación coordinada.

- `EventSource` nativo no permite establecer `Authorization`. La alternativa de poner JWT en query string queda descartada: puede acabar en logs, trazas, historial o telemetría. No añadir una cookie de access token ni un mecanismo paralelo.
- La cookie actual es solo de refresh, tiene path `/api/auth` y no autoriza Contents; por tanto, enviar `credentials: include` al stream no resuelve la autenticación. Un token cookie requeriría un cambio explícito al protocolo de sesión y revisar CSRF/orígenes.
- `fetch` permite el Bearer y leer el stream con APIs del navegador sin dependencias. En una respuesta 401, cerrar el reader, pedir renovación por el flujo actual (incluido su lock entre pestañas), obtener el token renovado y reconectar. No reutilizar ni copiar por separado la lógica de refresh de Axios: SSE-4 debe exponer/reusar un coordinador común en frontend.
- Mantener la ruta bajo el mismo origen de API y aplicar `@Auth(ValidRoles.riffvalley)`. Para cross-origin, `Authorization` exige preflight; el allowlist exacto ya autoriza ese header y credenciales, pero debe confirmarse el origen final del calendario y que no se introduzca wildcard. CORS del navegador no sustituye al guard.
- Cerrar la conexión al logout/cambio de usuario o generación de sesión en esa pestaña. Cada conexión termina como máximo a los 10 minutos; la autorización remota revocada puede permanecer activa hasta ese cierre. No se hacen consultas periódicas de sesión ni se añade revocación inmediata.
- El servidor escucha `request.aborted` y los eventos `response.close`, `response.finish` y `response.error`; no usa `request.close`, que también puede indicar que el GET ya se leyó por completo. Cada cierre cancela timers/suscripción y retira listeners/referencias.

### 1.4 Contrato de eventos vigente

El único contrato activo es el envelope editorial v2 `contents.invalidate`, documentado completamente en [`SSE-6a-BE`](#sse-6a-be-contrato-descriptivo-v2-para-content-calendar). El cambio inicial de v1 a v2 fue inmediato y sin negociación; v1 se conserva en este documento solo como antecedente histórico de SSE-2/SSE-3, no como alternativa de interoperabilidad.

El evento inicial v2 invalida el calendario sin habilitar un aviso. Los cambios v2 describen `action`, `actor`, `content` y `changes`; `sourceId` es opcional y efímero. El stream no contiene registros completos ni historial: HTTP sigue siendo la fuente de verdad y la recuperación ocurre mediante TanStack Query.

### 1.5 Ubicación del emisor en NestJS y evolución horizontal

Las subsecciones 1.5–1.9 conservan análisis y propuestas de la auditoría inicial, no una lista de tareas abiertas de la primera fase. Las decisiones y el comportamiento implementados se resumen en 1.10 y en las tareas completadas de la sección 2; las pruebas de capacidad descritas en 1.9 se aplazan a SSE-OPS-1.

- Mantener la propiedad de este canal en `ContentsModule`, en un área concreta `contents/realtime/`: un controlador de stream separado y un servicio de suscripción/emisión con interfaz pequeña. El servicio de dominio publica el aviso; el controlador solo autentica, escribe protocolo SSE y gestiona ciclo de vida.
- Definir una frontera de publisher estable (por ejemplo, contrato `ContentCalendarEventPublisher`) e inyectarla en creación/ciclo de vida/coordinación de Lists. El adaptador MVP usa un `Subject` RxJS en memoria. No hacer que las mutaciones dependan de `Subject` directamente; esa frontera permite un adaptador distribuido sin rehacer reglas de Contents.
- Con un dyno web, un emisor local llega a todos los streams de ese proceso. La auditoría inicial tomó 9 editores y picos de 11–12 conexiones como estimación de planificación, no como capacidad medida o validada. La instancia no guarda eventos ni necesita base de datos.
- Con varios dynos, cada router distribuye conexiones y una mutación puede aterrizar en un proceso distinto al de sus suscriptores: un `Subject` local dejaría clientes sin aviso. Entonces añadir transporte entre instancias (Redis Pub/Sub es opción inicial) detrás del publisher, publicar después del commit y suscribir cada dyno. Redis Pub/Sub también es efímero: una caída puede perder mensajes; si se necesita entrega durable, orden o replay se reevalúa outbox/stream persistente. En todos los casos el cliente debe poder recuperar por HTTP.
- No introducir Redis hoy. El hito para hacerlo es habilitar más de un dyno web con SSE activo, o medir pérdida/aislamiento entre instancias, no alcanzar una cifra arbitraria de conexiones en un proceso.

### 1.6 Escalabilidad, Heroku y estimaciones

No hay mediciones del dyno actual, huella por conexión ni benchmark del proceso; por ello no se atribuyen límites ni costes exactos. Cada escenario siguiente es una matriz de medición, no un límite técnico.

| Streams simultáneos | Lectura proporcional                                                                                                                          | Decisión de esta fase                                                                                          |
| ------------------: | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
|                  12 | Escenario de referencia de la planificación inicial                                                                                           | No medido; forma parte del benchmark aplazado a SSE-OPS-1.                                                     |
|                  50 | Mayor retención de sockets y timers; el emisor y el tráfico siguen ligados al número de procesos                                              | Ensayo intermedio para descubrir tendencia y fugas, no representa usuarios actuales.                           |
|                 100 | Medir memoria incremental y efecto de reconexiones concurrentes; evitar tormenta al reiniciar                                                 | Ensayo de capacidad del proceso/dyno concreto. No inferir estabilidad por router Heroku.                       |
|                 500 | Prueba de estrés/planificación, probablemente con generador separado y ramp-up; vigilar conexiones, CPU, RSS, latencias y peticiones normales | No asumir viable en el dyno contratado; usar resultados para decidir límites, más dynos o transporte dedicado. |

Orientación de recursos (estimación, no capacidad): mantener socket/respuesta, objetos de suscripción y callback por cliente; no hacer consulta SQL por heartbeat ni por evento. El coste de CPU de una conexión ociosa debe ser bajo con timer compartido para el heartbeat y un solo Subject; un timer independiente por conexión multiplica trabajo y no se recomienda. Medir `ΔRSS / conexiones` y `ΔheapUsed / conexiones` al estabilizar cada escalón y durante el cierre; el valor incluye ruido del proceso y del generador. El tráfico de heartbeat se calcula en el test a partir de bytes reales: `conexiones × bytes por heartbeat / intervalo`, incluyendo framing y protocolo. No es posible dar MB/s fiables sin capturar esos valores.

Riesgos operativos y mitigaciones:

- **Timeout de streaming:** primer byte rápidamente tras autenticar, heartbeat inicial de 25 s (ajustable entre 25–30 s tras confirmar el router y proxies de la ruta), y prueba mayor que la ventana documentada de 55 s.
- **Reinicio/deploy/dyno cycling:** sockets se cortan; detectar fin del stream, reconectar con backoff exponencial y jitter, y limitar clientes reintentando. Tras cada apertura volver a invalidar Queries.
- **Desconexión sin detección inmediata:** TCP puede tardar en notificar. El siguiente write/heartbeat, `close` y cancelación del reader limpian; no almacenar colas por cliente.
- **Recursos y concurrencia normal:** comprobar que requests REST, auth/refresh y mutaciones mantienen latencia mientras streams están abiertos. Un proceso Node puede atender I/O concurrente, pero CPU síncrona o heap agotado sí afecta a todo el dyno.
- **Varios dynos:** distribución por conexión y proceso emisor local no bastan; se necesita bus por proceso o afinidad persistente (no recomendada como solución de eventos).
- **Red de cliente:** reintentos sincronizados tras reinicio generan picos; añadir backoff con jitter y limpiar listeners al desmontar el componente/cerrar sesión.

La evaluación inicial es que 12 conexiones persistentes son proporcionadas y se espera que puedan compartir el dyno web existente, pero la viabilidad debe cerrarse con medición en un entorno representativo. No se ha verificado plan, tipo de dyno, memoria disponible o coste. No afirmar coste monetario ni que 50/100/500 sean límites.

### 1.7 Heartbeat y recuperación de estado

1. El cliente inicia `fetch` con Bearer; el servidor autentica/autoriza y configura cabeceras SSE no-cache y sin buffering si el proxy del despliegue lo requiere.
2. El servidor envía una invalidación inicial después de preparar la respuesta. La conexión debe producir byte antes del límite inicial de Heroku.
3. Enviar comentario heartbeat cada 25 s como valor inicial. Confirmar que middleware, compresión y todos los saltos de red no almacenan esos bytes.
4. Detectar cierre en ambos extremos y liberar observer, listeners y timers. No mantener buffer o historial por cliente.
5. Reconectar con backoff exponencial con jitter y un máximo configurable; recuperar la sesión con el flujo frontend actual si venció JWT y volver a suscribir solo si el rol sigue autorizado.
6. Al abrir o reabrir el stream, invalidar calendario y backlog; se recupera cualquier evento perdido mediante HTTP. El stream no promete entrega al menos una vez, orden global ni replay. No implementar historial persistente en MVP.

### 1.8 Integración propuesta con TanStack Query y concurrencia

- Al recibir un mensaje, validar estructura, `type` y `version`; agrupar avisos breves (p. ej. debounce de 100–250 ms, ajustado con UX y tests) en una invalidación de `contentCalendarQueryKeys.root(userId, generation, role)`. Eso cubre mes y backlog sin duplicar estado remoto.
- Usar `invalidateQueries`; dejar que las funciones query existentes vuelvan a consultar los endpoints de Contents. No parchear cache ni insertar contenidos del payload SSE.
- Volver a invalidar al conectar, reconectar y restaurar conectividad. En sesión cerrada o cambiada, cerrar stream y no usar claves del usuario anterior. Mantener el aislamiento actual de query keys.
- Para un Content con operación local pendiente, un evento entrante no debe cambiar el formulario ni la posición optimista. El contrato v2 puede incluir `content.id` y `sourceId` para correlacionar el cambio; la vista conserva la supresión durante operaciones pendientes, la respuesta HTTP sigue siendo la autoridad y no se acepta el payload como reemplazo del formulario abierto.
- La sincronización visual no resuelve conflictos de escritura. Dos editores pueden guardar sobre el mismo valor; se preserva la semántica HTTP existente y no se añaden locks, versiones de entidad ni edición colaborativa. Informar al editor de un cambio detectado durante su edición podría considerarse después, sin sobrescribir el formulario.
- Validar que el refetch no interfiera con cancelación de queries, `pendingContentIds`, reversión/reconciliación de drag-and-drop ni respuestas inciertas. La invalidación remota no reemplaza el camino de confirmación de cada mutación local.

### 1.9 Pruebas de carga y observabilidad

Preparar un script de carga aislado (sin dependencia nueva si Node y herramientas de prueba instaladas bastan), configurado contra un entorno local/staging no productivo y usuarios de prueba con rol autorizado. No invocar Heroku producción ni cargar PostgreSQL de producción.

Escalera reproducible: 12, 50, 100 y 500 conexiones; ramp-up y ramp-down documentados; cada escalón se mantiene más de varios heartbeats y repite conexión/desconexión. Registrar versión de Node, dyno/entorno, memoria asignada, build, región, parámetros, cliente generador y duración. Separar proceso/generador de carga de la medición del backend.

Medir:

- conexiones abiertas/cerradas por proceso y total, duración y causa de cierre;
- RSS, heap usado, external memory, GC, utilización de CPU y event-loop lag;
- frecuencia de heartbeat y bytes transmitidos; listeners/timers activos tras desconexión y tras ciclos repetidos;
- latencia commit→recepción en cliente con timestamp de prueba (no incluir timestamp ni datos sensibles en payload productivo);
- tasa de error, reconexión, tiempo hasta recuperar calendario y tormenta de reintentos;
- p50/p95/p99 y error rate de endpoints REST normales, login/refresh y mutaciones con streams activos;
- eventos emitidos solo tras operaciones confirmadas, cero señales tras rollback y distribución cuando se simule más de un proceso.

El umbral no se fija con números inventados: primero obtener línea base sin SSE y capacidad real del plan; después acordar un margen operativo con el propietario. Escalar si el RSS sostenido amenaza la cuota/causa reinicios, aumenta event-loop lag o p95/error rate respecto a la línea base, o el canal no mantiene conexiones/reconexiones dentro de la ventana de servicio acordada. Comparar tendencias por conexión y comportamiento bajo ráfagas; no usar solo el éxito de abrir 500 sockets.

### 1.10 Coste, riesgos y decisiones pendientes

**Coste esperado:** el MVP no requiere proveedor o base de datos nueva. Añade memoria por socket, actividad periódica de heartbeat, CPU de parseo y mantenimiento, y reduce capacidad disponible del dyno para requests si existe presión de recursos. Más dynos pueden aumentar coste de alojamiento; un bus distribuido añade operación, monitorización y coste de servicio. El importe no puede calcularse sin el plan y mediciones reales.

**Decisiones finales:** Fetch streaming con Bearer existente; publisher RxJS en memoria; contrato exclusivo `contents.invalidate` v2; publicación tras commit y una vez por operación lógica; heartbeat de 25 s; duración máxima de 10 min; backoff con jitter; HTTP como recuperación autoritativa; sin Redis ni persistencia de eventos en la primera fase.

**Seguimiento fuera de la primera fase:** benchmark formal de 12/50/100/500 conexiones, mediciones cuantitativas de memoria/CPU/latencia y pruebas de estrés/reconexión masiva no constan como ejecutados. Se aplazan conscientemente a `SSE-OPS-1 — Benchmark operativo`; no bloquean la aceptación funcional del MVP. La confirmación del propietario en Heroku no certifica capacidad ni escalabilidad.

**Riesgos principales:** autorización que cambia durante conexión activa; eventos perdidos al terminar el proceso o durante un futuro fallo de bus; invalidaciones repetidas durante formularios abiertos; reconexiones en ráfaga; memoria/CPU del dyno no medida; tests de integración que no caractericen todos los commits y rollbacks. Ninguno justifica persistir eventos en la fase inicial si la reconexión vuelve a consultar datos actuales.

## 2. Roadmap de implementación

### SSE-2 — Infraestructura backend de conexión, autenticación y heartbeat

**Completada el 2026-11-01.** Implementación en `src/editorial/contents/realtime/`:

- Ruta `GET /api/contents/events`, registrada antes de la ruta dinámica de Contents y protegida por `@Auth(ValidRoles.riffvalley)`. La jerarquía existente incluye `superadmin`.
- Publisher local RxJS encapsulado (`ContentCalendarEventPublisher`) en `ContentCalendarRealtimeModule`, exportado a través de `ContentsModule` como frontera para SSE-3. No se conecta a ninguna mutación en esta fase.
- Envelope inicial `contents.invalidate` v1 como antecedente histórico; fue sustituido por v2 en SSE-6a-BE, sin negociación ni compatibilidad. El envío inicial no consulta la base de datos y no usa `id:` SSE ni replay.
- Heartbeat compartido cada 25 segundos y máximo de 10 minutos por stream; finalización libera la suscripción y timers. `beforeApplicationShutdown` cierra los streams antes de que Nest cierre el adaptador HTTP; `main.ts` habilita los shutdown hooks.
- CORS global sin cambios; una prueba HTTP verifica el preflight `Authorization` contra un origen ya autorizado.
- Logs y contadores locales cubren streams activos/abiertos/cerrados, motivo de cierre, errores y publicaciones, sin registrar tokens ni identidad.
- Limitación aceptada: una revocación remota no finaliza inmediatamente una conexión; el cierre por timeout la limita a 10 minutos. El frontend renueva el Bearer durante SSE-4.
- No hay Redis, persistencia de eventos, cambios de Identity, cambios de frontend ni emisión desde servicios de negocio.

**Verificación:** `pnpm run verify` completó los gates; 272 suites unitarias pasaron (31 omitidas por configuración) y 2.645 tests pasaron (165 omitidos). Después se repitieron las suites SSE, Contents y autorización: 133 tests pasaron, incluida una prueba HTTP de apagado ordenado. Typecheck: 0 errores; ESLint: 0 hallazgos nuevos; gate estructural: 0 infracciones nuevas; build aprobado. Prettier, ESLint focalizado y `git diff --check` aprobados. El inventario de gates sigue mostrando infracciones históricas ya baselined en otros archivos.

### SSE-3 — Publicación tras mutaciones confirmadas

**Completada el 2026-11-01.** Se reutiliza `ContentCalendarEventPublisher`; los servicios de dominio no dependen de `Subject`. El publisher y su stream viven en `ContentCalendarRealtimeModule`, importado por Contents y Lists, lo que comparte una sola instancia sin crear una importación circular entre esos módulos.

- `ContentCreationService.create()` publica una vez después de resolver la transacción que guarda Content y cualquier Article, Video, Playlist, Reunion, Points o List auxiliar. Las creaciones delegadas desde Articles, Videos, Riff Valley Playlists y el scheduler pasan por este punto común.
- `ContentLifecycleService.update()` publica después del `save()` o de la transacción completa que puede incluir sincronización de List/Reunion. Compara una proyección local de campos de Content Calendar y no publica si el patch no produjo un cambio observable. No añade consultas para decidirlo.
- `ContentLifecycleService.remove()` publica una vez tras la eliminación directa o el commit de Content + List/Reunion. Si una restricción o escritura auxiliar provoca rollback, no publica. Las reglas de conservación/eliminación de entidades relacionadas permanecen intactas.
- `ListContentCoordinator.update()` publica solo si sincronizó y guardó realmente Content; el resultado interno tipado sale de la transacción y se publica después del commit. Los cambios de nombre/descripción/relaciones de List que no cambian Content no notifican.
- `ListContentCoordinator.removeList()` publica después del commit únicamente si borró Content asociado. Con un `EntityManager` externo no publica; `ContentLifecycleService.remove()` es el propietario y emite una sola vez después de su transacción.
- El publisher expone `publishInvalidationSafely()`: si falla la publicación posterior al commit, registra `event=content_calendar_invalidation_publish_failed` sin información editorial y mantiene exitosa la mutación ya confirmada. No hay reintentos, outbox ni persistencia.
- En la entrega original de SSE-3 el sobre era `contents.invalidate` v1; SSE-6a-BE lo sustituyó de inmediato por v2. Los eventos siguen siendo efímeros y conexión/reconexión recuperan la vista mediante HTTP.

**Pruebas:** suites focalizadas de creación/lifecycle de Contents, `ListContentCoordinator` y publisher verifican emisión tras commit, ausencia en fallos/rollback, actualizaciones sin cambios, sincronización de fechas, eliminación ligada/no ligada, rama con manager externo y contención/log de fallo del publisher. Los flujos delegados continúan cubiertos por los servicios comunes; no se añaden publicadores específicos.

**Verificaciones:** suites focalizadas de creación/lifecycle/Lists/publisher: 68 pruebas pasaron; wiring Nest/Lists/SSE: 35 pruebas pasaron. `pnpm run verify`: 272 suites pasaron y 2.654 pruebas pasaron; 31 suites y 165 pruebas omitidas por configuración. Typecheck: 0 errores; build y gate de dependencias runtime aprobados; ESLint: 0 hallazgos nuevos (832 históricos baselined); estructura: 0 infracciones nuevas (9 históricas baselined). `git diff --check` aprobado. Los archivos tocados se formatearon con Prettier.

### SSE-6a-BE — Contrato descriptivo v2 para Content Calendar

**Completada el 2026-11-01.** Esta tarea reemplaza el envelope v1 sin negociación ni adaptador legacy. Mantiene `GET /api/contents/events`, `contents.invalidate`, el publisher RxJS en memoria, Bearer JWT, rol mínimo `riffvalley`, heartbeat de 25 s y cierre máximo de 10 minutos.

El evento editorial tiene `type: "contents.invalidate"`, `version: 2`, `reason: "change"`, `action`, `actor`, `content` y `changes`; `sourceId` es opcional. La unión discriminada fija los campos por acción:

```json
{
  "type": "contents.invalidate",
  "version": 2,
  "reason": "change",
  "action": "moved",
  "actor": { "kind": "user", "id": "user-uuid", "displayName": "María" },
  "content": { "id": "content-uuid", "title": "Radar semanal" },
  "changes": { "previousDate": "2026-10-30", "newDate": "2026-11-01" },
  "sourceId": "calendar-tab-1"
}
```

| Acción        | Transición persistida                      | `changes`                                                    |
| ------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `created`     | Nuevo Content                              | `newDate` (fecha civil o `null`)                             |
| `updated`     | Cambios relevantes sin transición de fecha | `fields`, solo nombres de campos sin sus valores editoriales |
| `scheduled`   | Sin fecha → con fecha                      | `newDate`                                                    |
| `moved`       | Una fecha → otra fecha                     | `previousDate`, `newDate`                                    |
| `unscheduled` | Con fecha → sin fecha                      | `previousDate`                                               |
| `deleted`     | Content eliminado                          | `previousDate` (fecha civil o `null`)                        |

La sincronización inicial es `{"type":"contents.invalidate","version":2,"reason":"initial"}`; no lleva actor, contenido ni acción. Si falla la resolución descriptiva después del commit, se envía la invalidación genérica v2 `reason: "change"`, sin inventar una acción. Los errores de publicación se registran con un código sin identidad ni datos editoriales y no alteran la respuesta de la mutación.

El actor procede de `@GetUser()` sobre la identidad validada: ID y `User.username` público. Las operaciones automáticas usan la identidad explícita `system` (“Proceso automático”). Las delegaciones de Articles, Videos, Riff Valley Playlists, Reunion y Lists conservan el contexto de la petición cuando la ruta lo tiene. El actor nunca se toma del DTO ni del autor del Content.

Los títulos vienen del `Content.name`, único campo que muestra el calendario en sus eventos de todos los tipos. En los Contents delegados, Article, Video y Riff Valley Playlist copian su `name`; Photos, Radar y Best usan el nombre del propio Content. Reunion persiste además `Reunion.titulo`, que el ciclo de Content sincroniza desde el nombre del Content; el calendario sigue mostrando `Content.name`. La resolución central recorta espacios y, si no hay nombre, usa una etiqueta legible del tipo (o “Contenido editorial”). No consulta relaciones ni añade lecturas. El borrado conserva ID, nombre, tipo y fecha antes de borrar; el evento posterior al commit solo serializa ID y descriptor.

Las fechas del envelope son civiles `YYYY-MM-DD`, extraídas del prefijo de la fecha ISO que ya consume Content Calendar; no se interpreta la hora ni se desplaza a otra zona. Los cambios `publicationDate` determinan las transiciones; las reglas actuales que exigen fecha para Radar, Best y Reunion permanecen intactas. Lists publica únicamente si guardó un Content sincronizado o si eliminó el Content asociado; el cambio de una List sin efecto en Content no emite. La rama con `EntityManager` externo no emite; el llamador publica al terminar la operación lógica.

`X-Content-Calendar-Client-Id` es un identificador efímero opcional generado por la instancia cliente, validado por formato y propagado como `sourceId`. No identifica ni autoriza al usuario. Se permite en CORS para que las mutaciones cross-origin puedan incluirlo. El consumidor frontend lo compara para silenciar el aviso de la pestaña que inició la operación. No se modifica Axios de forma general.

SSE-6a-BE no cambia persistencia, reglas editoriales, autenticación del stream, heartbeat ni duración; no añade migraciones, Redis, colas, Web Push ni notificaciones persistentes. El cambio v1→v2 fue inmediato; solo se acepta v2. SSE-6b-FE y la aceptación funcional integrada quedaron cerradas el 2026-11-01.

**Pruebas y gates:** cobertura del publisher, stream HTTP, creación/lifecycle de Contents, Lists, rutas de delegación y CORS; incluye acciones, actor usuario/sistema, títulos por tipo, fecha civil, `sourceId`, ausencia de campos sensibles, commit/rollback, emisión única y fallback genérico. `pnpm run verify` aprobado: 272 suites y 2.672 tests pasaron; 31 suites y 165 tests omitidos por configuración. Después se repitió el test del publisher actualizado: 23 tests pasaron. Typecheck: 0 errores; build/runtime dependencies aprobados; ESLint: 0 hallazgos nuevos (832 históricos baselined); estructura: 0 infracciones nuevas (9 históricas baselined). Prettier focalizado y `git diff --check` aprobados. No se ejecutó E2E porque la tarea no requiere servicios externos.

### SSE-4 — Contrato y adaptación frontend (cross-repo)

**Completada el 2026-11-01** en `riffvalley-app-front`. El consumidor Fetch/ReadableStream reutiliza Identity, valida exclusivamente v2, compara `sourceId`, invalida TanStack Query y recupera mediante HTTP. La vista abre el stream solo mientras Content Calendar está montado, respeta ciclo de sesión y «Mis eventos», y presenta toasts con Vue Sonner después de cambios visibles confirmados por refetch. La implementación, pruebas y límites están en [`roadmap frontend`](../../../riffvalley-app-front/roadmap/editorial/content-calendar-realtime.md) y [`documentación del módulo`](../../../riffvalley-app-front/docs/frontend/modules/content-calendar-realtime.md).

### SSE-6b-FE — Toasts editoriales descriptivos v2

**Completada el 2026-11-01** en `riffvalley-app-front`. Se muestran actor, acción, Content y fecha cuando corresponde; el origen de la pestaña actual se suprime, se respeta «Mis eventos» y los lotes se agrupan sin perder invalidaciones. Se reutiliza Vue Sonner; no se añadió una dependencia de notificaciones.

### SSE-5 — Aceptación funcional integrada del MVP

**Cerrada el 2026-11-01 por aceptación funcional del propietario del proyecto.** El propietario confirmó personalmente que SSE v2 funciona en Heroku, con sincronización entre editores y toasts descriptivos. La aceptación comprende el funcionamiento integrado observado de la conexión autenticada, recepción de eventos, actualización con TanStack Query, toasts de Vue Sonner y Content Calendar general. No se inventa un informe manual de escenarios ni se afirma que el agente realizara pruebas visuales.

**No acreditado y aplazado:** benchmark formal de 12/50/100/500 conexiones, mediciones de memoria/CPU/latencia, estrés y reconexión masiva. El proyecto decide conscientemente aplazarlos a un seguimiento operativo independiente `SSE-OPS-1 — Benchmark operativo`. No bloquean el cierre funcional del MVP ni certifican capacidad o escalabilidad. Redis Pub/Sub solo se reconsidera si el despliegue multi-dyno lo requiere.

La primera fase no incluye historial de actividad, entrega a usuarios desconectados ni persistencia de notificaciones. Evoluciones posibles posteriores —SSE de cambios internos de Lists, notificaciones personales, persistencia/historial, Web Push, ámbitos de suscripción y distribución multi-dyno— quedan fuera de esta fase. Los futuros ajustes visuales pequeños de Content Calendar también serán tareas independientes; no reabren E-CC ni SSE.

## Referencias internas

- [`ContentsModule`](../../src/editorial/contents/contents.module.ts), [`ContentsController`](../../src/editorial/contents/contents.controller.ts), [`ContentCreationService`](../../src/editorial/contents/application/content-creation.service.ts), [`ContentLifecycleService`](../../src/editorial/contents/application/content-lifecycle.service.ts), [`ListContentCoordinator`](../../src/editorial/lists/application/list-content-coordinator.service.ts).
- [`Auth`](../../src/identity/authorization/decorators/auth.decorator.ts), [`JwtStrategy`](../../src/identity/authorization/strategies/jwt.strategy.ts), [`ValidRoles`](../../src/identity/authorization/interfaces/valid-roles.ts), [`auth-session-contract.dto.ts`](../../src/identity/auth/dto/session-auth-contract.dto.ts), [`sessions.service.ts`](../../src/identity/sessions/sessions.service.ts).
- Frontend, solo lectura: [`contentCalendarQueries.ts`](../../../riffvalley-app-front/src/modules/editorial/content-calendar/application/contentCalendarQueries.ts), [`useContentCalendarOperations.ts`](../../../riffvalley-app-front/src/modules/editorial/content-calendar/application/useContentCalendarOperations.ts), [`sessionAuth.ts`](../../../riffvalley-app-front/src/modules/identity/auth/api/sessionAuth.ts), [`queryClient.ts`](../../../riffvalley-app-front/src/app/queryClient.ts).
- Roadmap previo de Content Calendar frontend: [`content-calendar.md`](../../../riffvalley-app-front/roadmap/editorial/content-calendar.md). Fuera del alcance de cambios de esta auditoría.
