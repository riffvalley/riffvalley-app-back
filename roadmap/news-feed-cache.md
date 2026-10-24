# NEWS-CACHE-01 — Caché en memoria del feed público

## Objetivo y alcance

Reducir consultas repetidas de `GET /api/news/feed` con una caché en memoria del proceso NestJS. Este documento diseña el cambio; no implementa caché agregada ni invalidaciones. El contrato público, los feeds por fuente, las integraciones y el frontend quedan fuera de cualquier modificación hasta aprobar las tareas propuestas.

## Implementación actual

`NewsController.getFeed()` atiende `GET /api/news/feed` y delega directamente en `NewsService.getFeed()`. `main.ts` aplica el prefijo global `/api`, así que la ruta publicada es `/api/news/feed`.

`NewsController.getFeed()` no recibe query, usuario, permisos ni cabeceras. La ruta no tiene `@Auth()` y `getFeed()` no recibe argumentos. El resultado actual siempre conserva la forma `{ posts: FeedPost[] }`; no debe cachearse por usuario ni incluir datos privados. Los otros endpoints de News tienen sus propios filtros y permisos, pero no participan en esta respuesta.

En cada generación de `getFeed()`, `Promise.all` inicia a la vez:

1. Una consulta TypeORM a `News` con `status = published`, orden `createdAt DESC` y `take: 2`.
2. La lectura de posts públicos de WordPress, a través de `fetchWordPressPosts()`.
3. La lectura de hasta seis posts del canal Telegram `conciertosrockmetal`.

Después distribuye el espacio según cuántas noticias propias encuentre: con 2 propias reserva como máximo 2 a WordPress y 2 a Telegram; con 1 propia permite 3 de WordPress y 2 de Telegram; sin propias permite 3 de cada fuente. Mapea cada fuente a `FeedPost`, concatena, ordena todas las entradas por fecha descendente y devuelve como máximo seis. Los feeds por fuente (`getSourceFeed`) no son parte de esta ruta.

La integración usa identificadores posicionales (`wp-0`, `tg-0`) en los mapeos; títulos o fechas ausentes reciben fallback (`''` o la hora actual), e imágenes de WordPress ausentes o con estructura inesperada quedan como `null`. La caché debe guardar la respuesta ya compuesta para preservar exactamente este orden, forma y comportamiento observable.

## Flujo y dependencias

```text
GET /api/news/feed (público, sin parámetros)
  └─ NewsController.getFeed()
      └─ NewsService.getFeed()
          ├─ TypeORM: 2 News publicadas, createdAt DESC
          ├─ NewsService.fetchWordPressPosts()
          │   └─ WordpressService.getPublicPosts()
          │       └─ fetch anónimo a WordPress REST: posts?_embed&per_page=6
          ├─ TelegramService.getChannelPosts('conciertosrockmetal', 6)
          │   └─ fetch HTML de https://t.me/s/conciertosrockmetal
          │       └─ parseo HTML con Cheerio
          └─ mapeo, distribución, orden descendente por fecha y límite 6
```

WordPress y Telegram hacen transporte HTTP con `fetch` global de Node. No hay timeout explícito ni política común de cancelación en estos métodos. WordPress devuelve `null` ante status HTTP no exitoso y puede propagar fallos de red o parseo; News registra y transforma `null` o excepciones en `[]`. Telegram transforma status no exitoso, fallo de red o fallo de parseo en `[]`. La consulta local de TypeORM sí puede rechazar `getFeed()` porque `Promise.all` propaga su error.

Hay cachés previas a la propuesta:

- `NewsService.fetchWordPressPosts()` conserva respuestas WordPress válidas durante 10 minutos. No conserva `null` ni excepciones, pero no comparte una petición en curso, por lo que llamadas simultáneas en frío pueden repetir el HTTP.
- `TelegramService.getChannelPosts()` conserva el array parseado durante 15 minutos por canal. No conserva el fallo HTTP/de red y no comparte una petición en curso.
- El feed agregado no está cacheado: incluso con proveedores dentro de sus TTL, cada solicitud ejecuta la consulta local, composición y ordenación.

Por tanto, la consulta a la base de datos y el trabajo de composición ocurren en cada llamada. Los HTTP externos pueden evitarse por separado si sus cachés siguen vigentes, pero en expiración concurrente pueden duplicarse. No hay evidencia medida que permita afirmar cuánto cuesta cada tramo en producción; el coste externo es la motivación reportada para el cambio, y los sitios de red son WordPress y `t.me`.

## Punto de integración recomendado

Introducir el estado de la caché en `NewsService.getFeed()`, en torno a la generación que ahora inicia `Promise.all`, y almacenar el resultado público completo `{ posts }`. Mantiene un único punto para el endpoint agregado y evita acoplar la política de ese endpoint a los clientes WordPress/Telegram, sus otros consumidores o `getSourceFeed()`.

La decisión posterior a NEWS-CACHE-01.2 es utilizar `lru-cache` como dependencia directa para almacenamiento acotado, TTL, invalidación y coalescencia por clave. No está declarada directamente en `package.json`: el lockfile contiene versiones transitivas `10.4.3` y `5.1.1`, así que no se debe importar ninguna de ellas como dependencia implícita.

## CACHE-01 — Evaluación y decisión de librería (2026-10-24)

### Estado del proyecto revisado

- `package.json` requiere Node `24.x` y fija pnpm `11.28.7`. En el entorno de verificación consultado se usó Node `24.22.1`.
- NestJS instalado: `@nestjs/common`, `@nestjs/core` y `@nestjs/platform-express` están en `10.4.20` (rangos declarados `^10.x`).
- No hay dependencia directa ni uso de `lru-cache`, `cache-manager` o `@nestjs/cache-manager`.
- News ya mantiene una caché WordPress con `Map` y TTL de 10 minutos; Telegram mantiene otra con `Map` y TTL de 15 minutos. Spotify conserva su token en estado del servicio. Son cachés locales a instancias de servicios, no un almacén reutilizable.

La evaluación se contrastó con la [documentación de lru-cache](https://github.com/isaacs/node-lru-cache), la [documentación de cache-manager](https://cacheable.org/docs/cache-manager/), la [guía oficial de caching de NestJS](https://docs.nestjs.com/techniques/caching) y los [peer dependencies publicados de @nestjs/cache-manager 3.1.3](https://github.com/nestjs/cache-manager/blob/3.1.3/package.json).

### Comparación

| Alternativa | Compatibilidad y mantenimiento | TTL y memoria | Single-flight e invalidación | Ajuste para News |
| --- | --- | --- | --- | --- |
| `lru-cache` | Librería TypeScript mantenida; la versión consultada `11.5.2` declara Node `20 || >=22`, compatible con Node 24. No depende de Nest. | TTL en milisegundos, límite por cantidad (`max`) y opcionalmente tamaño (`maxSize`). Los elementos caducados se tratan como ausentes al consultarlos; el TTL no hace limpieza proactiva por defecto. | `fetchMethod` permite `fetch()` asíncrono con llamadas concurrentes coalescidas por clave. Tiene `delete()`/`clear()` y opciones para retener/servir stale al fallar la carga; el plazo máximo de recuperación requiere lógica propia. | Mejor ajuste: un valor acotado, una dependencia directa y control explícito sobre cuándo se guarda el resultado. |
| `cache-manager` | Librería genérica TypeScript activa. La documentación actual usa `Keyv` y permite almacenes intercambiables. | TTL por clave; el valor por defecto está en memoria, pero el límite de tamaño depende del almacén configurado. Se puede integrar `lru-cache` o `CacheableMemory` como store, añadiendo configuración/adaptador. | `wrap()` combina lectura/generación y la rama actual incorpora coalescencia de promesas; `del()` y `clear()` sirven para invalidar. Errores de la función rechazan; una respuesta parcial que resuelva normalmente se almacenaría. El refresco por umbral es en segundo plano y no se necesita aquí. | Válida si se prioriza la abstracción de varios stores; introduce `Keyv` y más superficie de configuración que el caso actual requiere. |
| `@nestjs/cache-manager` | Integración oficial de Nest sobre `cache-manager`; la versión `3.1.3` declara compatibilidad con Nest 9, 10 y 11, y requiere `cache-manager >=6`, `keyv >=5` y RxJS `^7.8.1`. El proyecto usa Nest 10.4.20. | Usa la política de almacenes de `cache-manager`; por defecto queda en memoria. Para límite explícito se debe seleccionar/configurar un store acotado. | Expone el cache manager vía `CacheModule`/DI y hereda las operaciones de `cache-manager`; no aporta una regla de negocio para rechazar `complete: false` ni un límite de stale. | Buena integración Nest si se van a estandarizar varios stores o módulos ya; innecesaria para el feed por sí solo y añade la integración más dependencias. |

### Decisión

Elegir `lru-cache@11.5.2` (rango de instalación propuesto: `^11.5.2`) como dependencia directa. Es compatible con Node 24, evita acoplar un helper genérico a Nest y permite una caché local al proceso con un máximo explícito. Para el feed la instancia tendrá una única clave y `max: 1`; si otro caso usa varias claves, debe fijar un máximo adecuado a su propio volumen.

El uso futuro debe mantener el resultado tipado como `{ posts, complete }` dentro del servicio. La respuesta pública seguirá recibiendo únicamente `{ posts }`. La función de carga de `fetch()` debe rechazar explícitamente cuando `complete` sea `false`; no debe resolver con ese objeto ni llamar a `set()`. Así el estado parcial no sustituye una respuesta válida. Una fuente vacía con `complete: true` sí es cacheable. TypeORM continúa propagando sus rechazos.

`lru-cache` coalesce cargas `fetch()` concurrentes para la misma clave. En el read-through se debe dejar desactivada la devolución stale en una carga normal para que la petición tras el TTL espere la renovación. La invalidación futura puede llamar a `delete()` para la clave del feed. Para recuperación limitada del valor caducado, se conserva como trabajo posterior: la librería tiene opciones stale en caso de rechazo, pero no define por sí sola una ventana máxima de stale. La implementación tendrá que guardar/comprobar el vencimiento de esa ventana y no extenderlo por fallos repetidos.

No crear un framework interno ni mover cachés de WordPress/Telegram a esta librería dentro de esta tarea. Para News se inyectará una instancia tipada desde su módulo. Cuando se incorpore un segundo consumidor real (por ejemplo Spotify o Last.fm), se podrá exportar un proveedor singleton desde un módulo Nest pequeño de infraestructura común; las claves deben ser namespaced y cada consumidor debe establecer su límite. No crear ahora un módulo común vacío ni compartir una única clave o TTL entre dominios.

`cache-manager` sigue siendo una alternativa si más adelante se decide soportar distintos stores con una API común; su `wrap()` no elimina la obligación de validar `complete` antes de guardar. `@nestjs/cache-manager` es compatible con el Nest instalado, pero añade valor principalmente si se adopta esa abstracción de stores a nivel de aplicación.

## Política propuesta

- Caché local al singleton `NewsService` de cada proceso NestJS, clave única porque el endpoint agregado no varía por entrada.
- TTL inicial de 10 minutos medido desde la generación satisfactoria.
- En caché vigente, devolver la respuesta almacenada sin consulta local ni llamadas a servicios.
- En ausencia o expiración, iniciar generación bajo demanda. Guardar una única promesa en curso y devolverla a todas las peticiones concurrentes (*single-flight*); limpiar esa referencia tanto en éxito como en error.
- Guardar un feed solo tras completar correctamente la generación. Los rechazos (por ejemplo, la consulta TypeORM) no crean ni reemplazan una entrada válida y se propagan con el comportamiento actual.
- Conservar el último feed válido solo durante una ventana de recuperación acotada después de un fallo de renovación; si se devuelve ese valor, mantener el contrato `{ posts }`. Como propuesta proporcional, permitir hasta 10 minutos adicionales de *stale-if-error* y después propagar el error. El plazo debe empezar con la primera expiración/fallo, no reiniciarse ilimitadamente ante fallos repetidos.
- No hacer refresh de fondo ni cron: la primera petición tras expirar renueva y espera a esa operación; la caché vive y desaparece con el proceso/dyno.
- Evitar exponer referencias mutables: cachear una copia de la respuesta final y devolver una copia superficial de `{ posts }` y de cada `FeedPost` (los campos del feed son escalares). No reutilizar arrays mutables internos de WordPress o Telegram.

### Resultados parciales de fuentes externas

Hoy los servicios de proveedor convierten errores externos en arrays vacíos. `getFeed()` no puede diferenciar «proveedor falló» de «proveedor no tiene posts» y sigue resolviendo con las demás fuentes. En consecuencia, el requisito literal de no almacenar resultados causados por errores no puede satisfacerse con solo envolver `getFeed()` sin cambiar el comportamiento interno o hacer que la generación indique su estado.

Recomendación: en la futura implementación, mantener idéntica la respuesta pública, pero permitir que la ruta interna de generación conozca si un proveedor falló; guardar respuestas completas y legítimamente vacías, no guardar resultados parciales marcados por error. Ante un refresh que produzca error de base de datos o fallo externo marcado, devolver el último feed válido dentro de la ventana acordada y propagar el fallo cuando ya no esté disponible. No asumir que cualquier lista vacía es un error. La decisión de comunicar este estado internamente quedó registrada en NEWS-CACHE-01.1 y se implementó en NEWS-CACHE-01.2.

## Frescura e invalidación

El feed combina tres tipos de dato:

- News local publicada: `NewsService.create`, `update` y `remove` son las mutaciones del módulo. Un alta puede publicarse directamente según el DTO; una edición puede cambiar status o contenido, y una eliminación puede retirar la entrada. Una caché agregada puede quedar desactualizada hasta 10 minutos; esas escrituras justifican invalidación inmediata si se prioriza reflejar cambios administrativos al instante.
- WordPress público: la integración puede crear posts (`createPost`, incluso con estado `publish`) y actualizar contenido (`updatePostContent`) desde los flujos de publicación/reconciliación de Lists. Esas operaciones pueden cambiar el feed que lee `getPublicPosts`; como News y Lists comparten el transporte pero no la instancia de `NewsService`, invalidar el feed desde el escritor requeriría coordinación adicional. No introducir esa coordinación en esta tarea de análisis.
- Telegram: no se encontró escritura interna del canal desde este backend. El origen se actualiza externamente y no existe invalidación push en el flujo inspeccionado.

El TTL de 10 minutos es razonable como punto de partida para una reducción de carga, pero no asegura frescura exacta: el cache Telegram subyacente ya dura 15 minutos y WordPress tiene su propio TTL de 10 minutos. Una renovación agregada puede recibir una fuente todavía cacheada; por los tiempos relativos de expiración, el cambio externo puede tardar más de 10 minutos en verse. Los posts externos son informativos, no datos por usuario; no se identificó información de usuario que deba excluirse del cache.

No implementar invalidaciones ahora. Para una primera entrega puede aceptarse la ventana máxima y dejar invalidación inmediata como tarea separada, especialmente para CRUD local y las publicaciones WordPress del propio backend. Toda invalidación desde Lists deberá seguir siendo local al proceso y no crear infraestructura compartida.

## Riesgos y límites

- **Memoria:** una sola respuesta de hasta seis elementos limita el número de entradas; el tamaño de `body` local y de strings externas no tiene límite explícito aquí. Mantener solo el valor actual y un último valor válido, sin histórico ni claves por usuario.
- **Concurrencia:** el *single-flight* debe cubrir peticiones al endpoint durante la regeneración; cada dyno tendrá su propia promesa y su propia caché.
- **Escalado Heroku:** varios dynos generan sus propias cachés y pueden renovar en paralelo; no hay coherencia ni single-flight entre dynos. Esto es aceptable para una caché oportunista de 10 minutos, pero la reducción de requests externos escala aproximadamente por proceso, no globalmente.
- **Mutación accidental:** arrays u objetos compartidos pueden ser alterados por consumidores dentro del proceso. Copiar en almacenamiento y lectura evita que una referencia de respuesta cambie el valor conservado.
- **Primer llenado:** si la generación falla antes de haber feed válido, no hay stale para servir; el rechazo conserva el comportamiento actual de error de base de datos. Los errores de proveedor actualmente se degradan a feeds parciales y requieren la decisión anterior para no confundirlos con éxitos.
- **Renovación fallida:** conservar la última respuesta evita vaciar el feed ante fallos temporales, pero requiere un límite de stale para evitar servir indefinidamente contenido obsoleto.
- **Alcance de una caché global:** es seguro en el endpoint actual: no acepta identidad, parámetros ni filtros y devuelve una selección pública idéntica para todos. Si en el futuro el feed depende de usuario, permisos, idioma o query, esta clave única dejaría de ser segura y deberá revisarse antes de variar el contrato.
- **Transporte:** no hay timeout explícito en los fetch inspeccionados. Una promesa que tarde puede mantener la regeneración compartida pendiente; añadir timeouts sería un cambio independiente de comportamiento y no se incluye aquí.

## Decisión registrada para la implementación

1. **Fallo externo frente a respuesta parcial cacheable:** resuelto en NEWS-CACHE-01.1. La generación interna marcará errores de proveedor; el payload público seguirá degradando a las fuentes que respondan correctamente o `{ posts: [] }` si ambas fallan, y la futura caché no guardará generaciones incompletas. Las fuentes legítimamente vacías sí contarán como completas. No se altera el contrato HTTP.

La ventana stale propuesta (10 minutos adicionales) puede ajustarse durante la tarea de implementación sin cambiar el contrato. Las invalidaciones inmediatas no bloquean el primer cache read-through si se acepta explícitamente el TTL; deben planificarse aparte si la frescura de mutaciones necesita ser inmediata.

## Subtareas propuestas

### NEWS-CACHE-01.1 — Caracterizar el contrato y fallos internos (S)

- **Estado:** Completada (2026-10-24). La caracterización confirma que el feed puede resolver con resultados parciales ante fallos externos; se adopta la decisión de cachear únicamente generaciones completas, manteniendo intacto el payload parcial actual.
- **Dependencias:** ninguna.
- **Alcance:** añadir/ajustar pruebas del servicio para congelar forma y máximo de seis posts, distribución por número de noticias propias, orden global, una fuente legítimamente vacía, fallo TypeORM y fallos WordPress/Telegram degradados. No cambiar controlador, DTO ni payload.
- **Criterios de aceptación:** las pruebas muestran qué errores rechazan `getFeed()` y cuáles producen feeds parciales; se aprueba la decisión de si esos parciales se guardan antes de seguir.
- **Verificaciones:** suites unitarias focalizadas de News, sin DB ni APIs reales; quality typecheck focalizado o `pnpm run quality:typecheck` si cambia TypeScript.

**Comportamiento de errores caracterizado:** WordPress responde `null` para status HTTP no exitoso y puede rechazar errores de red o parseo JSON; `NewsService` registra excepciones y degrada ambos casos a una fuente vacía. Un JSON exitoso con forma inesperada pasa sin validación desde `WordpressService`; una forma no iterable puede hacer que `getFeed()` rechace durante la composición. Telegram convierte status HTTP no exitosos, rechazo de `fetch`/lectura y errores de parseo en `[]`; HTML sin posts y HTML con estructura inesperada producen ambos `[]`, y ambos resultados se cachean por su TTL actual. El código actual no distingue una página de canal legítimamente vacía de un cambio de markup, por lo que clasificar ese caso como completo requiere validar la estructura reconocible del HTML. No hay timeout explícito en los métodos HTTP inspeccionados; los tests modelan timeout como rechazo del transporte, sin añadir política de timeout. En fallos externos parciales `getFeed()` conserva la fuente que sí respondió; si fallan ambas fuentes mediante esos fallbacks, resuelve con `{ posts: [] }` (o solo con News local). Si falla TypeORM, `Promise.all` rechaza.

**Decisión para NEWS-CACHE-01.2:** comunicar el estado de completitud como metadato interno, separado del payload HTTP. La opción mínima es que los lectores internos devuelvan un resultado tipado como `{ posts, complete }` (o `{ data, failed }`), y que las fachadas existentes sigan exponiendo sus arrays actuales a sus consumers; `NewsService` consumiría la variante interna con estado para WordPress y Telegram. Una respuesta WordPress HTTP exitosa debe comprobar que su JSON sea una lista; una respuesta Telegram vacía solo debe marcarse completa cuando la estructura de página reconocida sea válida. Una fuente vacía legítimamente obtenida marca `complete: true`; fallo de transporte/status/parseo/validación marca `complete: false`. La agregación sigue devolviendo hoy exactamente `{ posts }`, incluso si es parcial, pero la futura caché solo almacena cuando todas las fuentes requeridas completaron correctamente. No se implementó este mecanismo en NEWS-CACHE-01.1.

### NEWS-CACHE-01.2 — Distinguir generaciones completas y parciales (S)

- **Estado:** Completada (2026-10-24). News y las lecturas internas de WordPress/Telegram exponen estado tipado de éxito; el handler sigue respondiendo solo `{ posts }`. No se implementó caché agregada ni single-flight.
- **Dependencias:** NEWS-CACHE-01.1 (completada; decisión sobre resultados parciales registrada).
- **Alcance:** comunicar internamente si WordPress y Telegram entregaron una respuesta válida, manteniendo las fachadas consumidoras y el payload público actuales. Una fuente vacía válida cuenta como éxito; status HTTP fallido, error de transporte/parseo o estructura inválida no.
- **Criterios de aceptación:** `NewsService` compone feeds completos o parciales y expone internamente un indicador `complete`; `getFeed()` conserva `{ posts }`; TypeORM sigue propagando errores; las cachés y sus TTL actuales permanecen sin cambios.
- **Verificaciones:** suites unitarias focalizadas sin DB ni APIs reales; `pnpm run quality:typecheck`, `pnpm run quality:types`, `pnpm run quality:lint` y `pnpm run verify`.

### NEWS-CACHE-01.3 — Implementar caché local con lru-cache (S)

- **Estado:** Completada (2026-10-24). `lru-cache@11.5.2` mantiene una clave (`max: 1`) con TTL de 600.000 ms. Su `fetch()` coalesce las generaciones por clave; fallos de loader rechazan y liberan el in-flight. Las generaciones parciales se transportan mediante un error interno tipado con sus posts, se devuelven sin alterar `{ posts }` y no se almacenan. Se fija un timeout de 30 segundos para liberar el read-through ante una generación que no termina.
- **Dependencias:** NEWS-CACHE-01.2 (completada).
- **Alcance realizado:** dependencia directa exacta `lru-cache@11.5.2`; una instancia propiedad de `NewsService`, clave global única, TTL de 10 minutos y copia de posts al almacenar/devolver. El cargador reutiliza `getFeedGeneration()` y guarda solo resultados completos. No se modificaron controladores ni integraciones.
- **Criterios de aceptación:** un hit no llama repositorio ni fuentes; expiración regenera; concurrentes de la misma clave comparten una generación; resultados `complete: false` se devuelven a todos los consumidores concurrentes sin guardarse; fallos TypeORM se propagan y permiten reintento; cargas que no terminan liberan la generación compartida al agotarse el timeout; la respuesta sigue teniendo forma `{ posts }`.
- **Verificaciones:** tests focalizados News (24 tests aprobados); `pnpm run quality:typecheck`; `pnpm run build`; `pnpm run verify` (206 suites aprobadas, 14 omitidas; 2056 tests aprobados, 90 omitidos); `git diff --check`. Sin conexiones a servicios externos.
- **Límite conocido:** el timeout de 30 segundos libera la promesa de caché y permite reintentar, pero no cancela las peticiones WordPress/Telegram ya iniciadas porque sus servicios no aceptan `AbortSignal`. No se implementaron stale fallback ni invalidaciones.

### NEWS-CACHE-01.4 — Servir último valor válido ante error de refresh (XS/S, opcional)

- **Estado:** Completada (2026-10-24). Se conservan hasta 20 minutos adicionales los feeds completos ya expirados; la antigüedad se mide desde su generación original y no se renueva con fallos repetidos.
- **Dependencias:** NEWS-CACHE-01.3.
- **Alcance realizado:** TTL normal de 10 minutos más una ventana máxima de recuperación de 20 minutos desde la expiración. Cada valor completo lleva `generatedAt`; solo se recupera si su edad original no supera 30 minutos. La renovación continúa bajo demanda y el `fetch()` de `lru-cache` sigue coalesciendo concurrentes.
- **Política de errores:** los errores parciales tipados y el timeout pueden recuperar el último feed completo dentro del límite; sin fallback válido, las generaciones parciales conservan su respuesta pública y los timeouts rechazan. Los errores de TypeORM siguen propagándose. Las generaciones completas nuevas reemplazan el valor anterior.
- **Interacción con `lru-cache@11.5.2`:** `noDeleteOnFetchRejection: true` conserva el valor expirado sin cambiar su TTL ni su marca `generatedAt`; tras un error recuperable, una lectura explícita con `allowStale: true` y `noDeleteOnStaleGet: true` permite aplicar el máximo de edad. No se habilita `allowStaleOnFetchRejection`, porque suprime el rechazo del loader y podría ocultar errores de TypeORM. El stale conservado físicamente más allá de 30 minutos nunca se sirve.
- **Criterios de aceptación cumplidos:** hit vigente no regenera; expiración intenta una única renovación compartida; refresh completo reemplaza; fallo parcial sirve fallback vigente o el parcial sin fallback; fallos consecutivos no amplían el límite; concurrencia recibe el mismo fallback; TypeORM rechaza; el timeout libera el loader, permite reintento y descarta el resultado tardío.
- **Verificaciones:** tests focalizados de News (29 tests aprobados); `pnpm run quality:typecheck`; `pnpm run build`; `pnpm run verify` (206 suites aprobadas, 14 omitidas; 2061 tests aprobados, 90 omitidos); `git diff --check`. Sin conexiones a servicios externos.
- **Límite conocido:** el timeout libera la promesa de caché pero no cancela solicitudes WordPress/Telegram ya iniciadas; sus integraciones no aceptan `AbortSignal`. No se añadieron invalidaciones.

### NEWS-CACHE-01.5 — Invalidación por mutaciones internas (S, separada)

- **Estado:** Completada (2026-10-24). Las mutaciones locales invalidan después de persistir y la invalidación elimina también cualquier fallback stale anterior a la escritura.
- **Dependencias:** NEWS-CACHE-01.3 y NEWS-CACHE-01.4 (completadas).
- **Operaciones que invalidan:** crear News con `status = published`; pasar una News de borrador a publicada o viceversa; modificar `title`, `body`, `image` o `type` de una News publicada; eliminar una News publicada. Son los campos usados para seleccionar/mapear las hasta dos noticias internas de `getFeedGeneration()`.
- **Operaciones que no invalidan:** crear o editar borradores sin publicarlos; editar únicamente `publishDate` (el feed ordena/serializa `createdAt`, no `publishDate`); guardar valores iguales a los actuales; eliminar un borrador. La consulta previa de `update`/`remove` permite distinguir las transiciones de estado y la visibilidad real.
- **Concurrencia y stale:** tras un `save`/`delete` correcto, `NewsService` incrementa una versión y llama a `feedCache.delete()`. La librería aborta la carga asociada a la clave; las solicitudes que estaban esperando detectan el cambio de versión y reintentan usando el `fetch()` compartido actual. La carga abortada no puede escribir su valor tardío. El borrado retira el último valor completo, así que no se puede recuperar stale anterior a la mutación. Errores de escritura y operaciones no relevantes no alteran caché ni versión.
- **Contrato:** no cambia la respuesta de las mutaciones ni el payload público `{ posts }`; TTL normal de 10 minutos, recuperación máxima de 30 minutos desde generación original y single-flight permanecen iguales.
- **Verificaciones:** tests focalizados News (35 tests aprobados); `pnpm run quality:typecheck`; `pnpm run quality:lint` (839 diagnósticos baseline, 0 nuevos); `pnpm run build`; `pnpm run verify` (206 suites aprobadas, 14 omitidas; 2067 tests aprobados, 90 omitidos); `git diff --check`. Node 24.22.1 y pnpm 11.28.7. Sin PostgreSQL ni servicios externos.
- **Limitación de instancia:** la caché es local a cada proceso/dyno. Una escritura invalida solo la instancia que ejecutó la mutación; otros dynos pueden conservar sus entradas hasta que expiren. Esta tarea no añade coordinación distribuida.
- **WordPress y Lists:** invalidar el feed agregado no limpia el TTL interno de 10 minutos de WordPress; una publicación iniciada desde Lists puede seguir leyendo la respuesta WordPress anterior y reconstruir el agregado con ella. Siguiente acción mínima: en una tarea independiente, añadir un método explícito de invalidación de la caché de lectura pública de `WordpressService` y coordinarlo tras el éxito de `createPost`/`updatePostContent`, junto con la invalidación local del agregado. No se implementa aquí.
- **Telegram:** los posts externos siguen dependiendo de su TTL interno de 15 minutos; las mutaciones locales no invalidan esa caché.

### NEWS-CACHE-01.6 — Invalidar cachés tras publicaciones WordPress desde Lists (S)

- **Estado:** Completada (2026-10-24). Completa la coordinación WordPress señalada en NEWS-CACHE-01.5.
- **Flujo:** `WeeklyListPublisherService` y `MonthlyListPublisherService` delegan escrituras confirmadas en `ListWordPressReconciliationService`; esta utiliza `WordpressService`. La caché pública de WordPress que usa el feed es `NewsService.wpCache` (10 minutos), y la caché agregada vive también en `NewsService` (10 minutos más recuperación máxima hasta los 30 minutos desde generación original).
- **Invalidación realizada:** después de crear una entrada cuya respuesta confirmada tiene `status = publish`, o de actualizar contenido de una entrada que Lists ya leyó como publicada, `ListWordPressReconciliationService` llama `NewsService.invalidateWordPressAndNewsFeedCaches()`. Una escritura de resultado incierto solo invalida si la reconciliación confirma el post publicado. El método primero incrementa la versión de lectura de WordPress y limpia `wpCache`; luego invalida el agregado de News. Rechazos y posts draft no invalidan.
- **Integración Nest:** `NewsModule` exporta `NewsService` y `ListsModule` lo importa. No hay importación inversa desde News a Lists ni sistema global de eventos.
- **Concurrencia:** las lecturas WordPress en curso solo rellenan `wpCache` si su versión sigue vigente. La invalidación agregada elimina la entrada, aborta el `fetch()` en curso y hace que los consumidores que esperaban una respuesta reintenten con la generación compartida posterior. Una generación o fallback stale anterior a la publicación no puede repoblarse ni servirse en esa instancia.
- **Compatibilidad:** no se cambia la secuencia ni el contenido de publicación, los TTL, las rutas o `{ posts }`. Otros consumidores de `WordpressService` no cambian. No se añaden dependencias.
- **Verificaciones:** tests focalizados (75 aprobados); typecheck; lint (839 diagnósticos baseline, 0 nuevos); build; `pnpm run verify` (206 suites aprobadas, 14 omitidas; 2074 tests aprobados, 90 omitidos); `git diff --check`. Node 24.22.1 y pnpm 11.28.7. Sin publicación externa.
- **Límite:** la invalidación de memoria afecta solo al dyno que procesa la publicación. Otros dynos conservan sus cachés hasta expiración. Telegram conserva su TTL de 15 minutos. No hay infraestructura distribuida para propagar invalidaciones.
