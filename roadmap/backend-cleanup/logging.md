# Logging y Winston

## Alcance y evidencia

Revisión estática de `src/winston.config.ts`, su integración desde `src/main.ts`, llamadas a `Logger` de Nest y los flujos directos de logging relevantes. En la revisión de transportes también se comprobó que `src/standalone.ts` comparte la configuración, y se buscaron referencias en scripts, pruebas, documentación operativa y dependencias. No se revisaron Standalone, TypeORM ni el resto de los módulos como auditorías funcionales; los ejemplos se limitan a llamadas de logging. No se consultaron dynos, logs ni configuración activa de Heroku.

## Funcionamiento actual

`main.ts` crea la aplicación con `WinstonModule.createLogger(winstonConfig)` como `logger` de `NestFactory`. Así, los mensajes del ciclo de vida de Nest y las instancias de `Logger` de Nest usadas por controllers y servicios pasan por Winston. El proveedor `nest-winston` adapta los métodos y contextos de Nest a Winston; no se inicializa un logger Winston independiente en cada módulo.

`winston.config.ts` se aplica igual en cualquier entorno: no consulta `STAGE`, `NODE_ENV` ni otras variables para seleccionar transportes o niveles. Define:

| Transporte | Formato | Nivel efectivo |
| --- | --- | --- |
| Consola | timestamp, tiempo transcurrido (`ms`) y `nestLike('Riff Valley App')`, con `prettyPrint` y colores | El nivel predeterminado de Winston es `info`; no se fija otro nivel |

Con el nivel efectivo predeterminado `info`, los eventos `error`, `warn` e `info` se emiten; `debug` y `verbose` quedan fuera. `log()` de Nest corresponde a `info` en la integración. El formato de consola es legible para personas, no JSON estructurado. No hay selector por entorno ni configuración explícita para desactivar colores en producción. La configuración actual solo contiene el transporte de consola.

Hay `Logger` de Nest en muchos controllers y servicios de Catalog, Community, Editorial, Identity, Integrations, Product y Communications. Sus mensajes incluyen errores de integraciones, resultados de tareas programadas, importaciones, operaciones de listas y eventos de seguridad. Además, la generación de plantillas Excel usa varios `console.log/error` directos y por tanto no recibe formato/contexto de Nest ni niveles controlados por Winston.

La importación manual tiene un tercer flujo independiente: `ManualImportLogger` abre `manual_data.log` en modo append y escribe líneas con timestamp propio. No usa Nest Logger ni Winston, no rota ni cierra explícitamente el stream. El archivo queda ignorado por `*.log` en `.gitignore`.

### Revisión y retirada de los transportes de archivo (2026-10-23)

Antes de BC-LOG-4, los dos `DailyRotateFile` estaban configurados sin condición de entorno. `src/main.ts` (servidor Nest) y `src/standalone.ts` (comandos `check-spotify` y `create-weekly`) comparten la configuración; ni `STAGE`, `NODE_ENV` ni el entorno de Jest seleccionaban transportes distintos. Ahora ambos procesos siguen usando la configuración compartida, que contiene solo `Console`; una prueba focalizada comprueba que no se reintroduzcan transportes de archivo.

La configuración anterior guardaba `logs/error-%DATE%.log` y `logs/combined-%DATE%.log`, con rotación diaria, compresión, segmentos de 20 MB y retención de 14 días. Los 20 MB eran un umbral por segmento, no un límite total. Los eventos `error` se escribían tanto en el archivo de errores como en `combined`, duplicando un subconjunto.

La búsqueda no encontró consumidores de los archivos en servicios, scripts, pruebas ni procedimientos que los lean. La referencia histórica en `roadmap/roles/migration-preflight.md` registra archivos con propietario/permisos incompatibles y un intento de arranque en que Winston no pudo abrir el archivo de errores (`EACCES`). `.gitignore` excluía `logs/` y `*.log` del control de versiones, pero no impedía que los procesos los crearan.

`winston-daily-rotate-file` solo se utilizaba para esos transportes. BC-LOG-4 retiró la importación de efectos secundarios y la dependencia de `package.json`/`yarn.lock`; `winston` y `nest-winston` permanecen para la integración de consola con Nest.

## Llegada a Heroku y duplicidad

El `Console` transport de Winston escribe los eventos del logger a la salida estándar o de error del proceso. La documentación de Heroku confirma que recoge lo que la aplicación escribe en `stdout` o `stderr` y lo incorpora al flujo de logs ([Heroku Dev Center: Logging](https://devcenter.heroku.com/articles/logging)). El `Procfile` inicia `node dist/main`, por lo que esa integración corresponde al proceso web documentado. El flujo de consola permanece aunque se retiren los transportes de archivo.

Los transportes de archivo retirados escribían en el filesystem local bajo `logs/` y no reenviaban contenido a Heroku. El filesystem de una dyno es efímero, así que esos archivos no eran un destino de retención fiable ni sustituían a los logs de consola; un log drain externo sería otra configuración y no se verificó si existe.

Winston envía ahora sus eventos únicamente al transporte de consola; no hay copias de archivos Winston. Sí existen duplicaciones de mensajes en el código: por ejemplo, la descarga Excel informa de progreso desde el servicio y el controller, y en el error puede imprimirlo con `Logger.error` y de nuevo con `console.error`. La importación manual tampoco aparece en Heroku porque solo escribe en su archivo dedicado, salvo que ocurra un fallo síncrono de escritura que se envía a `console.error`.

## Riesgos y oportunidades observados

- **Riesgo de exposición en errores externos.** El servicio de Instagram registra `JSON.stringify(body.error ?? body)` en fallos de API y convierte excepciones a texto. La renovación usa una URL con `access_token`; una excepción de red puede incorporar una URL o contexto del request, y un cuerpo de error no debería considerarse sanitizado. No se confirmó que una credencial se haya emitido en logs, pero el patrón permite esa posibilidad. El almacenamiento de token también registra el cuerpo textual de respuesta de Heroku cuando el PATCH falla. Conviene limitar esos mensajes a proveedor, estado y código/mensaje filtrado, nunca URL, cabeceras, token ni cuerpo arbitrario.
- **Ruido operativo.** Excel escribe múltiples pasos internos por petición (creación de hojas/columnas, lecturas, buffer, tipo y respuesta). El controller repite parte de esa información. La tarea programada de Spotify registra URLs de búsqueda y pasos/resultados por disco; para lotes, esto puede dominar los logs y revelar términos de búsqueda. No es necesario emitir cada paso exitoso a nivel `info` en producción.
- **Formato no homogéneo.** Mensajes interpolados como texto, `console.*` y el archivo manual tienen esquemas distintos. No hay campos consistentes (`event`, `service`, `request_id`, `operation_id`) ni objetos JSON en consola. El evento de rechazo de refresh ya incluye algunos campos estructurados como texto y valida la forma de request/operation IDs; es una buena base, pero sigue siendo una sola cadena.
- **Retención desigual.** Winston ya no escribe archivos locales; el archivo de la importación manual no rota. La retención real del flujo Heroku depende de la plataforma/drains, que no se comprobó en esta revisión.
- **Nivel igual para todos los entornos.** Al no definir niveles por entorno, el nivel efectivo es `info` tanto local como producción. Los mensajes `debug`/`verbose` no aparecen, pero sí todo el detalle `info` de los ejemplos.

## ¿Mantener Winston?

Winston aporta actualmente integración con Nest y formato configurable en el transporte de consola. El logger nativo de Nest también cubre niveles, contexto y salida a consola, pero cambiarlo no es necesario para retirar los archivos.

**Decisión aplicada:** mantener Winston solo con el transporte `Console` y sin `winston-daily-rotate-file`. Los logs siguen en `stdout`/`stderr`; no se conservan copias locales rotativas. Sustituir Winston por el logger nativo de Nest sigue siendo un cambio independiente y no está justificado por esta limpieza.

## Clasificación de recomendaciones

### Necesarias: problemas reales que conviene corregir

1. **Sanear errores de proveedores antes de registrarlos.** No incluir cuerpos arbitrarios de Instagram/Heroku ni excepciones que puedan contener URLs con credenciales. Mantener identificadores de proveedor, estado HTTP y un mensaje filtrado; añadir contexto operativo seguro cuando exista.
2. **Hacer visible el resultado de importación manual por el flujo estándar.** Sus registros actuales quedan únicamente en `manual_data.log`, fuera de Heroku. Si el log se necesita para operación, migrar las entradas a `Logger` de Nest (conservar el contenido funcionalmente útil) o emitirlas también al flujo estándar; retirar el writer dedicado solo después de comprobar que no hay consumidor del archivo.

### Opcionales: beneficio concreto

1. **Reducir logs `info` de alto volumen.** Quitar pasos deterministas y mensajes duplicados de Excel; en mantenimiento Spotify, emitir un resumen por ejecución y reservar detalle por disco/URL para diagnóstico controlado. La URL debería omitirse incluso en diagnóstico si puede transportar credenciales.
2. **Definir niveles por entorno de forma explícita.** Por ejemplo, `info` en producción y `debug` local cuando se necesite. Añadir el filtro por nivel después de clasificar los mensajes; bajar indiscriminadamente el nivel podría ocultar avisos y fallos recuperables.
3. **Estandarizar JSON en consola.** Usar objetos con campos estables (`level`, `timestamp`, `context`, `event` y campos seguros), sin `prettyPrint` ni color en producción. Esto mejora búsqueda/filtros y correlación, pero requiere adaptar mensajes gradualmente; no es condición para seguir usando Heroku Logs.
4. **Reubicar la configuración en `src/config/`.** Esa carpeta ya contiene configuración de infraestructura (`typeorm-options.ts`); `src/config/winston.config.ts` agrupa mejor la política de logging y evita que un archivo de configuración quede en la raíz de `src`. Es una mejora de organización, no un bug.
5. **[x] Eliminar los transportes rotativos y su dependencia (BC-LOG-4, completada 2026-10-23).** No se encontraron consumidores de los archivos locales; la consola ya cubre el flujo local y Heroku. La retirada reduce duplicación, escrituras al filesystem y superficie de configuración sin alterar mensajes ni niveles.

### Innecesarias: cambios que no compensan su complejidad

- Sustituir Winston inmediatamente por Nest Logger solo para “simplificar”: no corrige la calidad de mensajes y requiere validar muchos callers; la decisión se justifica únicamente si se retiran los transportes especiales.
- Añadir un agregador, agente, transporte de red o dependencia de logging: no hay evidencia de que el flujo de consola de Heroku sea insuficiente ni se comprobó una necesidad de búsqueda/retención externa.
- Migrar todos los mensajes a JSON en un único cambio grande. El valor está en un esquema incremental para eventos operativos importantes, no en reescribir cada cadena histórica.
- Mantener el transporte `error` separado en Heroku como si aportara una copia persistente: duplica localmente los errores que ya están en `combined` y no los envía a Logplex.

## Tareas propuestas

| ID | Tamaño | Alcance | Criterio de aceptación |
| --- | --- | --- | --- |
| [x] BC-LOG-1 — Filtrar datos de errores de Instagram (completada 2026-10-23) | S | Ajustar solo los registros de errores de la integración Instagram/almacenamiento de token para omitir URLs autenticadas, tokens y cuerpos arbitrarios, conservando HTTP status y mensajes/códigos seguros. | Los logs de Graph incluyen status y campos diagnósticos permitidos; la persistencia Heroku extrae solo mensaje/ID o texto filtrado. Las pruebas focalizadas comprueban que el token Instagram, el token API Heroku, bearer credentials y valores de parámetros sensibles no aparecen. Sin cambios de respuestas ni comportamiento de integración. Verificación: 21 pruebas focalizadas, build, typecheck, quality:types y Prettier aprobados. Lint focal conserva un `prefer-const` preexistente en el spec (`service` en el test de refresh), sin tocarlo. `quality:lint` global falla por seis hallazgos nuevos del checkout: cinco en el spec de auth que ya estaba modificado antes de esta tarea y ese mismo `prefer-const`. |
| BC-LOG-2 — Unificar la visibilidad de importación manual | S | Registrar eventos operativos necesarios mediante logger Nest y retirar el archivo ad hoc solo tras buscar consumidores y caracterizar los mensajes útiles. | Los eventos útiles llegan a stdout/stderr local y Heroku; no queda dependencia funcional de `manual_data.log`; el stream actual se cierra/elimina con el writer. |
| BC-LOG-3 — Recortar ruido de importación Excel | XS | Quitar duplicados e instrumentación de pasos internos, manteniendo errores y resumen/contadores de importación. | Una descarga Excel no registra pasos internos redundantes; fallos conservan un único mensaje accionable; no se cambian respuestas HTTP. |
| [x] BC-LOG-6 — Resumir el mantenimiento diario de enlaces musicales (completada 2026-10-23) | S | El cron de Spotify/Bandcamp invoca el método compartido con `summaryOnly: true`; el método mantiene el logging detallado como opción predeterminada para el endpoint administrativo y `check-spotify`. Silenciar detalles por disco en Spotify y Bandcamp; contar actualizaciones guardadas como correctas y resultados sin enlace o con error de elemento como fallidos. | Una ejecución diaria completada emite solo `Importación diaria completada: X correctos, Y fallidos`; fallos operativos de token/consulta emiten un solo error. No cambia el procesamiento, las marcas guardadas ni las respuestas. 14 pruebas focalizadas aprobadas; también build, typecheck, quality:types, quality:structure, lint focal y Prettier. |
| [x] BC-LOG-4 — Eliminar transportes rotativos de Winston (completada 2026-10-23) | XS | Retirar los dos `DailyRotateFile`, su importación de efectos secundarios y `winston-daily-rotate-file` de `package.json`/`yarn.lock`; conservar la consola compartida por `main.ts` y `standalone.ts`. No cambiar mensajes, niveles ni procesos. | La configuración contiene solo el transporte `Console`; `main.ts` y `standalone.ts` siguen usando Winston con esa configuración; no quedan usos del paquete de rotación ni se crean archivos Winston. `yarn test:unit --runInBand src/__tests__/winston.config.spec.ts`, `yarn build`, `yarn quality:typecheck` y la búsqueda de referencias aprobados. `yarn quality:types` informa 0 infracciones nuevas. ESLint focal pasa para el spec; en `winston.config.ts` persisten 12 errores `prettier/prettier` de indentación que ya tenía el archivo antes del cambio y que no se reformatearon. |
| BC-LOG-5 — Formato estructurado gradual | S | Empezar con eventos de seguridad e integraciones operativas usando objetos/campos JSON seguros en consola. | Eventos seleccionados se filtran por campos estables; no contienen datos sensibles; los logs siguen visibles en Heroku y los mensajes no migrados continúan legibles. |

BC-LOG-1 se completó en el checkout con cambios limitados a los mensajes de error de Instagram y pruebas focalizadas; el resultado de las verificaciones queda registrado en el cierre de la tarea. BC-LOG-6 se completó limitando el resumen al cron diario, con logging manual predeterminado preservado y catorce pruebas focalizadas aprobadas. BC-LOG-2 sigue pendiente por visibilidad incompleta de importación manual. BC-LOG-3 sigue pendiente como reducción de ruido de Excel. BC-LOG-4 se completó retirando los transportes de archivo y la dependencia de rotación, con la consola compartida preservada. BC-LOG-5 solo compensa si se usarán filtros/correlación estructurada y puede diferirse sin bloquear las tareas anteriores.

## Auditoría de logs recientes de Heroku (2026-10-23)

Consulta de solo lectura: `heroku logs --app spammusic-back --num 1500`. La muestra cubre 1.500 líneas desde el 2026-10-22 19:44:39 hasta las 22:26:34 UTC (2 h 42 min), no un día completo. Los contadores siguientes son líneas de esa muestra; los valores de usuario, IP, request ID y tokens no se copian a esta auditoría.

El recorte temporal incluye ejecuciones de los crons de 10 minutos de TikTok e Instagram, pero no incluye la ventana del cron diario de Spotify de las 06:00 Europe/Madrid ni el cron editorial semanal. Por ello no se puede medir la frecuencia real de esos dos procesos en producción a partir de esta consulta.

La prioridad indica el orden de las correcciones recomendadas: P1 requiere atención operativa, P2 es la siguiente limpieza de código/diagnóstico y P3 es de bajo volumen. «Conservar» significa que la muestra no justifica reducir esos mensajes.

| Origen | Frecuencia observada | Recomendación | Prioridad |
| --- | ---: | --- | --- |
| NestJS: bootstrap y registro de rutas | 740 líneas en 2 arranques: 506 mapas de rutas de `RouterExplorer`, 70 grupos de controllers de `RoutesResolver`, 160 inicializaciones de módulos y 4 mensajes de ciclo de vida. | Reducir en producción solo los mapas de rutas y controllers, que son repetitivos y están definidos en el código. Conservar mensajes de inicio, inicialización útil, warnings y errores. | P2 — media |
| TypeORM | 62 líneas `TypeOrmModule dependencies initialized`, incluidas en las 160 inicializaciones de Nest; 0 consultas SQL registradas. | No activar logging de consultas. Mantener el diagnóstico de conexión/inicialización y los errores del ORM. `src/config/typeorm-options.ts` no habilita `logging`; `src/data-source.ts` lo habilita solo para el DataSource de migraciones no productivo, no para el servidor Nest. | — conservar |
| HTTP del router Heroku | 419 líneas: 257 GET, 143 OPTIONS, 16 POST y 3 PATCH. Estados: 172×200, 146×204, 75×304, 9×401, 7×404, 6×403, 3×201 y 1×400; ningún 5xx. | Conservar: aporta ruta, estado y latencia que no aparecen en un logger HTTP propio del backend. Las 143 preflight OPTIONS son rutinarias, pero no las genera Nest ni se pueden quitar cambiando mensajes del backend. | — conservar |
| Crons e integraciones externas | 31 resúmenes de éxito: 16 TikTok y 15 Instagram. No aparecieron errores de proveedores ni mensajes por elemento. | Conservar un resumen por ejecución. Es el nivel adecuado; no bajar ni eliminar estos resultados. El cron diario de Spotify no estuvo dentro de la ventana de muestra. | — conservar |
| Seguridad y sesiones del backend | 10 eventos: 6 `auth_refresh_rejected` con motivo `csrf_expired`, 1 sesión creada y 3 rotaciones de refresh. | Conservar. Son eventos de seguridad/auditoría y sirven para correlación; no registran tokens. Los UUID de sesión/usuario deben seguir limitados a logs con acceso controlado. | P1 — conservar |
| Operaciones de negocio (`RequestsService`) | 2 logs de éxito: creación de artista y disco desde una petición. | El estado creado se puede consultar en el catálogo de App. El mensaje no aporta actor ni detalle de fallo, pero el volumen observado es bajo; no justifica una tarea aparte. Si se conserva como auditoría, completar el evento con un actor durable en una iniciativa específica, no con más logs de texto. | P3 — baja |
| Heroku Logplex: error L10 de drain | 268 mensajes de overflow; los mensajes contabilizan 930 entradas descartadas del drain, sin atribución a un proceso concreto. | Investigar el receptor del drain y su capacidad/latencia. Heroku define L10 como una tasa de producción superior a la recepción: puede deberse al consumidor o a una ráfaga; Logplex descarta mensajes para recuperar el flujo. Bajar logs rutinarios puede aliviar ráfagas, pero no confirma ni resuelve por sí solo un receptor saturado. Conservar las alertas L10 hasta corregir el destino. ([Heroku Error Codes](https://devcenter.heroku.com/articles/error-codes)) | P1 — alta |
| Heroku control plane y ciclo de vida de dyno | 12 eventos `app[api]` (4 sesiones de logs, 2 builds iniciados, 2 completados, 2 deploys y 2 releases) y 12 eventos `heroku[web]`. Diez de los eventos `app[api]` contienen correo de cuenta. | No son logs del backend y no se deben filtrar desde Winston. Los eventos de administración contienen correo; los del router incluyen IP pública y URL con query string. Tratar como metadatos de plataforma: limitar acceso/retención y evitar secretos o datos personales en query strings. ([Heroku Logging](https://devcenter.heroku.com/articles/logging)) | P2 — media |

La muestra no contiene mensajes de error `ERROR` emitidos por `app[web.1]`; sí contiene los 6 warnings de seguridad anteriores. Las respuestas 401/403/404 del router son observables para diagnóstico y no deben borrarse como “ruido” sin distinguir credenciales vencidas, solicitudes inválidas y escaneos. Las 268 líneas L10 son mensajes distintos del sistema de logging, no duplicados creados por Winston.

### Mensajes redundantes o posibles exposiciones

- `main.ts` conecta el logger de Nest con Winston, pero no instala middleware que registre cada petición/respuesta. Las entradas HTTP citadas arriba las genera el router de Heroku, no un logger duplicado del backend.
- No se observaron consultas SQL, portada/disco por disco ni errores de importación en esta muestra. El cron diario de discos está configurado para emitir el resumen único de BC-LOG-6, pero su ejecución no quedó en la ventana consultada. La instrumentación detallada de Excel sigue en código, aunque no se observó uso de ese endpoint en esta captura.
- No se encontraron credenciales o tokens en las líneas de `app[web.1]` de la muestra. Hay una superficie de riesgo futura en errores externos: TikTok serializa cuerpos de proveedor y excepciones (`tiktok-videos.service.ts`, `tiktok-api.service.ts`), mientras WordPress registra el cuerpo textual de respuesta ante fallos (`wordpress.service.ts`). No hubo errores de esos proveedores en la muestra; limitar esos datos a status/código/mensaje permitido conserva diagnóstico sin volcar respuestas arbitrarias.
- Los dos logs de `RequestsService` describen objetos de catálogo que App puede mostrar, pero no son un registro de auditoría completo ni tuvieron frecuencia alta. No los quitaría como prioridad inmediata. Los eventos de autenticación y rotación de sesión no son redundantes con el estado visible de una entidad y deben permanecer.
- Los logs de control plane de Heroku incluyen email de cuenta y los de router IP/query string. No son modificables desde código backend; en la muestra no se detectaron valores de credenciales en esas rutas.

### Orden de limpieza recomendado

1. **Atender primero los L10 del drain.** Identificar el destino que corresponde al token de drain mostrado por Logplex, consultar su capacidad y latencia, y corregir el receptor si está saturado. Después, comparar una nueva ventana para confirmar que dejaron de perderse logs. No se cambió configuración de Heroku durante esta auditoría.
2. **Reducir mapas de rutas de Nest en producción.** Conservar startup, errores y warnings; suprimir únicamente el registro informativo repetido de cada ruta/controller. Es la mayor fuente de líneas repetitivas del backend durante arranques.
3. **Limitar datos de fallos de proveedores.** Mantener status/código/mensaje seguro y el resumen operativo; no serializar cuerpos arbitrarios ni errores de red completos. No cambiar flujos de integración ni respuestas.
4. **Mantener el resto por ahora.** Los resúmenes de cron, eventos de sesión/seguridad, errores operativos y métricas de router son útiles; las operaciones de negocio de bajo volumen no justifican trabajo separado. Repetir la captura durante las horas de los crons diarios antes de ajustar sus registros.

### Tareas añadidas a partir de la muestra

| ID | Tamaño | Alcance | Criterio de aceptación |
| --- | --- | --- | --- |
| [x] BC-LOG-7 — Reducir el ruido de registro de rutas de Nest en producción (completada 2026-10-23) | S | En `STAGE=prod`, filtrar únicamente nivel `info` con contexto `RoutesResolver` o `RouterExplorer`; el filtro usa el transporte/configuración Winston existente. En desarrollo no filtrar. | Se omiten los mapas de 253 rutas y 35 grupos de controller por instancia observados. Warnings, errores, inicialización de módulos, confirmación de arranque y demás contextos permanecen; no cambia el registro real de rutas. Tres pruebas focalizadas prueban selección de contexto/nivel y modo de desarrollo. Build, typecheck y quality:types aprobados; ESLint focal sigue mostrando los 12 errores `prettier/prettier` preexistentes del resto de `winston.config.ts`, sin nuevos hallazgos. |
| [x] BC-LOG-8 — Resolver pérdidas L10 del log drain de Heroku (completada 2026-10-23) | S | Tras la decisión de usar solo Logplex, retirar los tres drains directos y destruir el add-on Papertrail que provisionaba el cuarto, después de confirmar que no aporta recursos usados por la aplicación. | `heroku drains` queda vacío; los add-ons PostgreSQL y Scheduler permanecen. El tail de Heroku sigue devolviendo logs de aplicación y plataforma; en una ventana nueva de 35 s no hay L10. No se conservan logs externos ni se añade un drain alternativo. |
| [x] BC-LOG-9 — Limitar payloads de errores de TikTok y WordPress (completada 2026-10-23) | S | TikTok registra status HTTP y solo `code`, `message` saneado y `log_id`; las excepciones del sync y el warning de sincronización omitida sanea credenciales y limita el texto. WordPress registra contexto, status y solo los campos JSON `code`/`message` saneados; omite texto plano, el resto del JSON y los errores completos. | Cinco pruebas focalizadas de logging comprueban status/contexto, diagnósticos permitidos y ausencia de tokens, credenciales y cuerpos completos. Respuestas públicas, excepciones HTTP, contratos HTTP públicos de publicación y procesamiento permanecen intactos. 62 pruebas focalizadas, build, typecheck, quality:types y ESLint focal aprobados. |

BC-LOG-7 se completó en `src/winston.config.ts` y su prueba focalizada; no cambia las rutas ni la configuración de Heroku. BC-LOG-8 se completó retirando los drains y dejando Logplex como destino único, según la decisión operativa documentada al final. BC-LOG-9 se completó en los mensajes de error de TikTok y WordPress, con respuestas y flujos funcionales intactos. La muestra corta impide valorar la frecuencia del cron diario de Spotify, del cron editorial semanal y de importaciones Excel.

### Seguimiento BC-LOG-8: drains y correlación de L10 (2026-10-23)

Consultas de solo lectura: `heroku drains --app spammusic-back --json` y una nueva captura de `heroku logs --app spammusic-back --num 1500`. No se modificó configuración. El listado contiene cuatro drains: dos destinos de SolarWinds/Papertrail (HTTPS y Syslog+TLS) y dos de Better Stack (HTTPS y Syslog+TLS). Los detalles de URL, credenciales y tokens se omitieron. Los 229 L10 de esta captura hacen referencia al mismo token de drain: Better Stack Syslog+TLS; los otros tres destinos no aparecen como origen de avisos L10. Esto descarta que sean avisos duplicados de Winston o de varios drains. La documentación de Heroku define L10 como mensajes producidos temporalmente a mayor ritmo que el que puede recibir el consumidor; cita tanto capacidad del consumidor como ráfagas de salida como causas comunes ([Heroku Error Codes — L10](https://devcenter.heroku.com/articles/error-codes#l10---drain-buffer-overflow)).

La captura cubre 1.500 líneas entre 2026-10-22 20:31:53 y 22:34:09 UTC (2 h 2 min): 229 L10 que contabilizan 914 mensajes descartados. La captura previa de esta auditoría observó 268/930 en otra ventana; son ventanas móviles distintas y no deben sumarse. En la nueva muestra los L10 aparecen en 23 de 25 intervalos de cinco minutos, desde el funcionamiento ordinario y a lo largo de casi toda la ventana. Solo 32 avisos (504 mensajes descartados) cayeron en los cinco minutos posteriores a dos arranques de la dyno; los 197 restantes (410 descartes) ocurrieron fuera de esas ventanas. Por tanto, los arranques agravan el problema, pero no explican la pérdida completa.

Cada uno de los dos minutos de arranque concentró unas 375 líneas `app[web.1]`, principalmente el bootstrap y los mensajes de registro de rutas de Nest. El resto de la ventana también mantiene L10 aun sin esas ráfagas. La evidencia confirma que el drain Better Stack recibe por debajo del ritmo generado durante esos periodos y que las ráfagas del backend elevan la pérdida; no permite distinguir si el factor sostenido es un límite de ingesta, latencia o indisponibilidad del receptor. Los logs disponibles no exponen métricas internas de Better Stack.

**Acción mínima recomendada:** pedir al propietario de Better Stack que revise límites, latencia y errores de ingesta del destino Syslog+TLS alrededor de los horarios observados; en paralelo, aplicar BC-LOG-7 para quitar los mapas de rutas informativos de Nest en producción y bajar la ráfaga de arranque sin ocultar errores ni warnings. Mantener los cuatro drains hasta confirmar con el proveedor si ambos destinos por servicio se necesitan; la evidencia actual no justifica eliminar ninguno. Después, repetir una captura de Heroku y verificar el cese de L10, la entrega de mensajes operativos y la ausencia de aumento de volumen en los otros drains. No se ha hecho esta intervención ni se ha cambiado la configuración de producción.

### Seguimiento tras el despliegue v343 (commit `67f330f4`, 2026-10-23)

Consultas de solo lectura: `heroku releases --app spammusic-back`, `heroku logs --app spammusic-back --num 1500` y `heroku drains --app spammusic-back --json`. El release actual es v343 y corresponde al commit `67f330f4`, creado a las 2026-10-23 01:15:08 CEST (2026-10-22 23:15:08 UTC). La captura disponible termina a las 23:17:03 UTC: solo cubre 1 min 55 s posteriores al release, no 24 horas. Se excluyeron todas las líneas anteriores a v343; no se mezclaron con el recuento posterior. Se omitieron URLs de drains, tokens, IP y datos de usuarios.

| Origen / tipo | Frecuencia tras v343 | Observación |
| --- | ---: | --- |
| Backend `app[web]` | 85 líneas (44,3/min) | 80 inicializaciones de módulos Nest, un mensaje de aplicación iniciada y cuatro mensajes de aplicación adicionales. No aparecieron `RoutesResolver` ni `RouterExplorer`. |
| Heroku Logplex L10 | 10 avisos (5,2/min), 94 mensajes descartados según los contadores de los avisos | Los diez se atribuyen al drain Better Stack Syslog+TLS. Un aviso contabiliza 82 descartes; los otros nueve, 12 en total. |
| Ciclo de vida de dyno `heroku[web]` | 6 líneas (3,1/min) | Reinicio, transición de estado y parada/salida de procesos asociados al release. |
| Heroku `app[api]` | 3 líneas (1,6/min) | Eventos del release/control plane; no los genera el backend. |
| Router HTTP de Heroku | 0 | No hubo líneas `heroku[router]` en el tramo capturado. |
| Crons e integraciones | 0 resúmenes identificables | No aparecieron resúmenes diarios de Spotify/Bandcamp ni resúmenes de TikTok o Instagram. La ventana de menos de dos minutos no permite inferir su ejecución o frecuencia. |

#### Comparación normalizada con la auditoría anterior

Las referencias pre-v343 proceden de las capturas documentadas arriba: los listados de rutas, de la auditoría de 1.500 líneas entre 19:44:39 y 22:26:34 UTC (2 h 41 min 55 s), y L10, del seguimiento BC-LOG-8 de 1.500 líneas entre 20:31:53 y 22:34:09 UTC (2 h 2 min 16 s). Sus duraciones difieren, por lo que se muestran tasas por hora. La tasa posterior de L10 está concentrada en la ráfaga del release y no debe interpretarse como tasa estable.

| Métrica | Antes de v343 | Después de v343 | Lectura |
| --- | ---: | ---: | --- |
| Listados `RoutesResolver` | 70 (25,9/h) | 0 observados | La supresión de BC-LOG-7 funciona durante el arranque incluido en esta muestra. |
| Listados `RouterExplorer` | 506 (187,5/h) | 0 observados | No reaparecen los mapas de rutas informativos. |
| L10 | 229 (112,4/h) | 10 (312,6/h) | Continúan; el valor posterior se calcula sobre solo 115 s del despliegue y no es comparable como carga sostenida. |
| Mensajes descartados por L10 | 914 (448,5/h) | 94 (2.938,4/h) | La muestra posterior incluye una ráfaga con 82 descartes en un aviso. No demuestra una regresión sostenida ni permite confirmar que el drain ya esté sano. |

Los L10 posteriores empiezan unos 51 s después del mensaje de Nest que confirma el arranque y continúan hasta el final de la captura, unos 91 s después. Esto confirma que la pérdida no desapareció con BC-LOG-7: el drain Better Stack Syslog+TLS sigue afectado. Sin una ventana que incluya funcionamiento ordinario y crons, no se puede determinar si ahora la pérdida ocurre fuera de los arranques ni atribuirla al volumen habitual o a la capacidad/latencia del receptor. La ráfaga de 82 descartes merece correlación con las métricas de ingesta de Better Stack alrededor de las 23:17 UTC.

No hay evidencia en este tramo para proponer más cambios de logging: el arranque conserva las inicializaciones y la confirmación de Nest, mientras los listados de rutas están ausentes. Tampoco hubo suficiente tiempo de operación para valorar los resúmenes de cron o señalar otros mensajes repetitivos. **Recomendación:** mantener BC-LOG-8 abierto y solicitar al propietario de Better Stack que revise esa ráfaga; repetir la medición tras disponer de al menos una ventana representativa de 24 horas. No cerrar todavía la limpieza completa del logging: la reducción de ruido de rutas está confirmada en esta muestra, pero la pérdida L10 permanece como problema operativo concreto.

### Seguimiento de recepción HTTPS y drains (2026-10-23)

Se consultaron en modo lectura `heroku drains --app spammusic-back --json` y los últimos 1.500 logs. Los cuatro drains siguen configurados: Papertrail HTTPS (asociado al add-on), Better Stack HTTPS (directo), Better Stack Syslog+TLS (directo) y Papertrail Syslog+TLS (directo). Los dos destinos de Better Stack reciben el flujo de Logplex; por tanto, duplican los mismos eventos de origen. No se modificó ningún drain.

En la captura, todos los L10 identificables corresponden al token del drain Better Stack Syslog+TLS; no hay un aviso L10 atribuido al drain HTTPS. El tramo posterior a v343 disponible abarca 6 min 53 s, con 13 avisos L10 que suman 97 descartes. Esto confirma que el Syslog+TLS continúa siendo el destino con pérdidas, pero la ausencia de L10 en HTTPS no demuestra por sí sola que Better Stack haya indexado todos sus mensajes.

No hay acceso desde esta sesión a la fuente, Live Tail ni métricas de ingesta de la cuenta Better Stack, así que no se pudieron comprobar mensajes recientes de backend/router/plataforma, respuestas de ingesta, cuotas ni errores de autenticación o parsing. La documentación oficial recomienda para Heroku una fuente por aplicación y un drain HTTPS; Heroku entrega los mensajes HTTPS en lotes y puede reintentar ante fallo de red o respuesta no exitosa. La ingesta HTTP de Better Stack también puede rechazar solicitudes por cuota, token, formato o tamaño, condiciones que solo se pueden descartar consultando esa fuente. Referencias: [integración Heroku de Better Stack](https://betterstack.com/docs/logs/heroku/), [drains HTTPS y Syslog de Heroku](https://devcenter.heroku.com/articles/log-drains), [ingesta HTTP de Better Stack](https://betterstack.com/docs/logs/ingesting-data/http/logs/).

**Resultado de esa auditoría previa:** entonces no se retiró el drain Syslog+TLS porque el criterio de seguridad —confirmar la recepción y cobertura en la fuente HTTPS— no pudo validarse. En ese momento, el siguiente paso era revisar en Live Tail/ingesta el origen HTTPS, los mensajes de `app`, `heroku[router]` y ciclo de vida de dynos, además de cuota, errores y retención. La decisión posterior de utilizar exclusivamente Logplex y su ejecución se documentan en el cierre operativo siguiente.

### Cierre operativo BC-LOG-8: solo Logplex (2026-10-23)

Por decisión explícita se retiraron los cuatro destinos externos. Antes del cambio se verificó que Papertrail era un add-on de logging, con una sola asociación (`spammusic-back`), sin variables de configuración expuestas por el add-on ni referencias en `src/`, `test/`, `scripts/`, `package.json` o `.env.template`. Los add-ons PostgreSQL y Scheduler son independientes y no se tocaron.

Se eliminaron directamente Better Stack HTTPS, Better Stack Syslog+TLS y Papertrail Syslog+TLS; se destruyó el add-on Papertrail para retirar el drain HTTPS que gestionaba. La consulta posterior confirmó `heroku drains` vacío y que solo siguen provisionados PostgreSQL y Scheduler. No se reiniciaron dynos ni se desplegó una versión.

`heroku logs --tail --app spammusic-back` devolvió eventos `app[web]` y `heroku[web]` del buffer (81 y 1 respectivamente). Ese primer resultado también contenía avisos L10 históricos del periodo anterior a la retirada. En una ventana estrictamente posterior de 35 segundos hubo un evento nuevo y cero L10. Con los cuatro drains eliminados ya no existe un destino externo al que atribuir nuevos avisos L10; la ventana corta solo confirma que no apareció uno durante esa observación, no es una medición prolongada.

La decisión final es utilizar únicamente Logplex. Esto elimina la pérdida L10 asociada al drain y también la persistencia/búsqueda externa: Heroku conserva solo su historial limitado de logs recientes, no un archivo de largo plazo. El historial que estaba en Papertrail no se migró ni se preserva mediante esta configuración.
