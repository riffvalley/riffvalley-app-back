# E-CC-9a-BE — Auditoría de `Content.ready`

**Estado:** auditoría completada (2026-10-31). Solo documentación; no cambia código funcional, DTOs, endpoints, permisos, datos ni esquema. La decisión sobre una futura deprecación requiere aprobación funcional.

**Alcance:** revisión estática de entidad, DTOs, servicios, controller, consultas, scheduler, serialización, tests, migraciones y documentación del backend. El checkout `riffvalley-app-front` se consultó en modo lectura únicamente para conocer sus contratos y usos. No se consultaron PostgreSQL, producción ni integraciones externas y no se modificó el frontend.

## Conclusión

`Content.ready` es un booleano independiente y escribible, pero el código no le asigna una semántica editorial comprobable ni lo usa para tomar decisiones de negocio. Es posible persistir `true`, consultarlo mediante un filtro y recibirlo en las respuestas completas de Contents. No condiciona publicaciones, permisos, relaciones, automatizaciones ni estadísticas. El frontend actual conserva el campo en sus tipos, DTOs y fixtures, pero no lo consulta ni lo envía desde la vista de calendario.

La evidencia favorece **deprecarlo progresivamente**, sujeto a una decisión funcional y a comprobar clientes desplegados y política de retención de datos. La falta de consumidores conocidos no demuestra que ningún cliente externo lo use. No se recomienda retirarlo directamente ni afirmar que el historial almacenado carece de valor.

## Definición y persistencia actual

- `Content.ready` es `boolean`; `@Column({ default: false })` implica columna obligatoria y default `false` de TypeORM. No tiene enum, relación, check constraint ni índice propio observado en las migraciones del repositorio.
- La migración [1767807955655-AddReadyToContent.ts](../../src/migrations/1767807955655-AddReadyToContent.ts) añade `content.ready boolean NOT NULL DEFAULT false`; su `down` elimina la columna. No se encontraron migraciones posteriores que la transformen.
- La definición no documenta qué significa `true`. En particular, el código no define si significa «contenido terminado», «listo para publicar», «pendiente de calendarizar» u otra condición.
- La migración permite inferir el valor asignado a las filas existentes al añadir la columna (default `false`), pero no el historial de escrituras posterior ni la distribución actual. Para conocerla habría que consultar una base de datos autorizada; esta auditoría no lo hizo.

## Inventario de escrituras

Las escrituras observadas se concentran en `ContentCreationService` y `ContentLifecycleService`; no apareció escritura SQL directa ni otro servicio que modifique `Content.ready`.

| Operación | Antes → después | Responsable | Tipo y efecto |
|---|---|---|---|
| POST `/contents` con `ready: true` o `false`, sin fecha de publicación resuelta | Valor previo inexistente → valor enviado | `ContentCreationService.create` | Explícita. Persiste el indicador solicitado. Si se omite, queda el default de base de datos `false`. |
| POST `/contents` con `ready: true` o `false` y una fecha resuelta | Cualquier entrada → `false` | `ContentCreationService.create` | Automática. La fecha puede venir del DTO o resolverse desde Article, Video o Riff Valley Playlist asociados en estado `published` con `updateDate`. La asignación de fecha prevalece sobre el DTO. |
| PATCH `/contents/:id` con `ready` sin modificar `publicationDate` | Valor actual → valor booleano enviado | `ContentLifecycleService.update` vía `Object.assign(content, rest)` | Explícita. El DTO permite modificar el indicador sin regla adicional. |
| PATCH con fecha efectiva no vacía en `publicationDate` | Valor actual —incluido un `ready: true` enviado en el mismo PATCH— → `false` | `ContentLifecycleService.update` | Automática. Se ejecuta al recibir una fecha `Date` o string no vacío. |
| PATCH con `publicationDate: null`/vacía | Valor actual, o valor `ready` explícito del mismo PATCH → se conserva ese valor | `ContentLifecycleService.update` | No fuerza `false`: la fecha queda limpia y solo cambia `ready` si el DTO lo trae. En tipos que exigen fecha la validación puede rechazar limpiar la fecha. |

`ready` se valida como booleano estricto en creación y actualización; ausencia se permite y `null`, string o número se rechazan. `UpdateContentDto` hereda esos campos opcionales mediante `PartialType`. Los specs de DTO cubren ambos valores, ausencia y rechazo de tipos inválidos. El spec de lifecycle confirma el reinicio a `false` al establecer fecha. No hay una prueba encontrada que caracterice la precedencia en POST de `ready: true` frente a fecha, ni una prueba específica del PATCH que envíe `ready: true` y fecha juntos.

### Coherencia de `ready = false` al asignar fecha

El comportamiento existe en creación y actualización y no se modifica aquí. Su significado no es deducible de la regla: si `ready` significara «listo para publicarse», asignar una fecha no explicaría por sí solo ponerlo en falso; si significara «sin fecha/por programar», se acercaría a esa intención, aunque el campo no se llama ni se usa como indicador de planificación. Hay además una asimetría documentada: al quitar la fecha no se vuelve a `true`; se conserva el valor que resulte de la operación. Por eso no puede afirmarse que `ready` sea un derivado de `publicationDate`.

## Inventario de lecturas y procesos

- **Filtro:** `GET /contents?ready=true|false` convierte solo esos literales a booleano. Otro valor se interpreta como ausencia del filtro. `ContentQueryService.findAll` agrega `where.ready` cuando el argumento está definido; los tests fijan la condición del repositorio. El endpoint no habilita una operación que dependa del estado: solo devuelve filas filtradas.
- **Respuesta:** las consultas completas usan entidades TypeORM y serializan `ready` junto con el resto de propiedades de Content. Esto aplica a `GET /contents`, `GET /contents/:id`, `GET /contents/by-month` y a los objetos Content que retornan POST/PATCH. El campo no se usa en la lógica posterior.
- **Relaciones en recursos públicos:** Articles, Videos y playlists pueden cargar Content internamente, pero sus controllers pasan las respuestas por `toPublicContentReference`, que reduce la relación a `{ id }`. No exponen `ready` en ese contrato resumido. No se halló otra proyección, exportación ni integración que lo lea.
- **Frontend conocido:** `getContents()` solo envía opcionalmente `backlog`; no manda `ready`. El calendario usa `/contents` y no lee `content.ready`. No se encontraron llamadas a `/contents?ready=...` en el checkout actual. El tipo `Content` declara `ready` obligatorio, `ContentRef` lo declara opcional y los tipos de creación/actualización permiten enviarlo; un test de servicio incluye `ready: true` en una respuesta de ejemplo. En el calendario aparece en fixtures como dato no interpretado. Las etiquetas «Ready» encontradas en los modales de Article/Video corresponden a los estados de esas entidades, no a `Content.ready`.
- **Backend automático:** `ContentSchedulerService` crea semanalmente una Reunion con fecha y no pasa `ready`; por la regla de creación se persiste `false`. El cron no consulta ni activa el indicador. No hay scheduler, listener, guard, validación, autorización, estado de publicación, estadísticas ni exportación que lea `Content.ready`.
- **Consumidores desconocidos:** no puede descartarse que scripts, aplicaciones desplegadas u otros clientes HTTP fuera de los repositorios accesibles usen el filtro, envíen el campo o esperen recibirlo.

## Comparación con estados y otros datos

- **Article:** `Article.status` es un enum con transiciones (`not_started`, `in_progress`, `editing`, `ready`, `published`) y reglas propias para responsable/fecha. Cambiar su estado no sincroniza `Content.ready`.
- **Video:** `Video.status` también tiene un enum y reglas propias; no sincroniza ni depende de `Content.ready`.
- **List:** `List.status` posee su propio ciclo, separado. La sincronización de fechas entre Content y List no sincroniza los estados.
- **Fechas:** `publicationDate` representa una fecha y participa en validaciones/consultas de calendario. La fecha establecida pone `ready=false`, pero la fecha no se deriva de `ready` ni hay equivalencia entre ambos.
- **Backlog:** `backlog` es otro booleano independiente con filtro propio, usado para organizar Contents en frontend. Ninguna regla observada equipara backlog y ready.

Así, `Content.ready` no duplica formalmente los enums de Article/Video/List: son campos distintos y no están sincronizados. Sin embargo, tampoco se acredita una fase editorial propia, y el valor booleano puede discrepar del estado del recurso asociado sin bloquear ni corregir operaciones. La hipótesis de que sea un resto de una implementación anterior no puede confirmarse solo con el código actual.

## Contratos HTTP y riesgo de retirada

Tras E-CC-3, las consultas de Contents requieren `@Auth(ValidRoles.riffvalley)`; el rol autorizado incluye el acceso editorial esperado para `riffvalley` y `superadmin`. Por tanto, los contratos de Contents no son lecturas públicas anónimas, pero siguen siendo contratos HTTP para clientes autorizados.

`ready` forma parte de la entidad devuelta por las respuestas completas de Contents, de los DTOs de POST/PATCH y del parámetro de filtro de `GET /contents`. El servicio frontend tipa y permite el campo, aunque el cliente comprobado no lo manda ni interpreta actualmente. El DTO estricto rechaza `ready` en clientes que lo sigan enviando si se elimina sin transición. Omitirlo de respuestas también puede afectar a clientes que lo requieran. Retirar el filtro rompe a consumidores que lo usen, aun si no se encontraron dentro del frontend actual. La proyección pública resumida de Article/Video/Playlist ya excluye la propiedad.

### Contract finding

**Current behavior:** Content devuelve `ready`; POST/PATCH admiten un booleano y `GET /contents` filtra por literales `ready=true|false`. Los clientes frontend inspeccionados conservan el campo en tipos, pero no lo usan en operaciones del calendario.

**Problem:** el contrato expone una bandera cuya semántica no está documentada y que no condiciona ninguna operación interna.

**Impact:** backend + frontend y cualquier cliente autorizado externo no inspeccionado.

**Options:** preservar contrato y uso actual; redefinir el campo con semántica y transiciones explícitas; deprecar el filtro/campo de forma progresiva y retirarlos solo tras migrar clientes.

**Recommendation:** mantener compatibilidad durante una fase de deprecación aprobada. No retirar ni alterar el contrato en esta auditoría; primero confirmar clientes fuera de los dos checkouts y decidir el tratamiento del historial.

**Blocks the current task:** No; la auditoría queda completa. Sí bloquea cualquier borrado de contrato/esquema hasta obtener esas decisiones.

## Riesgos de eliminarlo

1. Ruptura de POST/PATCH para clientes que todavía manden `ready`, y rechazo por `ValidationPipe` con `forbidNonWhitelisted` cuando la propiedad deje de pertenecer al DTO.
2. Cambio de forma en respuestas completas para consumidores que esperan un booleano.
3. Desaparición del filtro `GET /contents?ready=...` y cualquier flujo de soporte/manual fuera de los repositorios actuales.
4. Pérdida irreversible de la distribución histórica de la bandera si se elimina la columna; no se ha comprobado si hay filas `true` ni qué valor representa para negocio.
5. Eliminar primero almacenamiento o contrato sin migración coordinada podría dejar clientes desplegados en errores de validación o comportamientos silenciosamente distintos.

No hay riesgo identificado de detener cron/publicaciones/estadísticas por su valor, porque el código revisado no condiciona esos procesos a `ready`.

## Alternativas

| Alternativa | Ventajas | Inconvenientes y riesgos | Frontend / backend | Compatibilidad y pruebas requeridas |
|---|---|---|---|---|
| **A. Mantener** | No rompe DTO, filtro ni respuestas; conserva datos y flexibilidad manual. | Mantiene semántica ambigua y una regla automática (`publicationDate` ⇒ `false`) que no está explicada por un flujo consumidor. | Frontend: conserva tipos. Backend: conserva columna y lógica. | Compatibilidad máxima. Mantener tests de DTO, filtro, serialización y reset por fecha; documentar qué uso se espera. |
| **B. Redefinir** | Puede dar una responsabilidad editorial explícita si producto necesita una confirmación/etapa distinta de Article/Video/List. | Antes se necesita decidir significado, quién lo modifica, transición al asignar/quitar fecha, alcance por tipo, relación con estados asociados y comportamiento en historiales contradictorios. Si se hace sin ello, se formaliza una semántica inventada. | Frontend y backend coordinados para UI, validaciones y reglas; posiblemente migración de datos, según significado. | Compatible solo si conserva el contrato o añade transición; tests de estado inicial/transiciones, combinación con fechas y estados asociados, serialización, filtro y migración si aplica. |
| **C. Deprecar** | Elimina gradualmente una bandera sin consumidores funcionales demostrados y evita mantener un segundo indicador editorial sin reglas. | No hay datos actuales ni telemetría de clientes externos. Retirar directamente puede romper clientes autorizados y elimina historial. Necesita ventana de transición y decisión sobre los valores existentes. | Frontend: retirar tipos/campos si se confirma que no se usan. Backend: marcar/documentar deprecación, después retirar filtro/DTO/respuesta y finalmente columna. | No compatible si se retira en un solo paso. Requiere inventariar clientes y observabilidad/aviso, pruebas de compatibilidad durante la transición, luego tests HTTP de rechazo/ausencia esperados y migración reversible/planificada. |

## Recomendación y aprobaciones pendientes

**Recomendación técnica:** alternativa **C, deprecación progresiva**, porque el código no demuestra una responsabilidad funcional propia, el frontend actual no consume el valor y la única lectura activa es filtrado de resultados. La recomendación es condicional: una decisión funcional debe confirmar que no existe una necesidad editorial diferenciada y que los clientes desplegados se pueden migrar. Si producto confirma que se requiere una segunda señal de preparación independiente de Article/Video/List, elegir B y especificar su semántica antes de cambiar reglas.

Pendiente de aprobación funcional:

1. ¿Se necesita realmente un concepto de preparación propio de Content, separado del estado de Article, Video o List?
2. Si no, ¿se autoriza iniciar la deprecación del campo y filtro, con periodo de compatibilidad y coordinación de clientes?
3. ¿Se requiere preservar o analizar valores históricos antes de eliminar la columna?
4. ¿Debe conservarse `ready=false` al establecer `publicationDate` durante el periodo de deprecación? La auditoría no altera esa regla.

## Roadmap backend

### E-CC-9a-BE — Auditar `Content.ready`

- **Estado:** completada (2026-10-31); documentación solamente.
- **Resultado:** no se encontró responsabilidad operacional demostrada; filtro disponible, contrato actualizado en tipos frontend, semántica sin definir y distribución real de datos desconocida.
- **Recomendación:** C condicional; confirmar clientes/histórico y obtener aprobación funcional antes de retirar cualquier parte del contrato o el esquema.
- **No incluye:** implementación, cambios frontend, modificación de `ready`, otras tareas E-CC ni consultas a PostgreSQL.

### E-CC-9b-BE — Deprecar `Content.ready` (condicional; pendiente de aprobación)

- **Estado:** propuesta pendiente. No autorizada para implementación.
- **Condición de inicio:** aprobación funcional explícita de C, confirmación de clientes consumidores y decisión de retención/migración del historial.
- **Alcance futuro posible:** plan de deprecación compatible del campo en DTO/respuesta y del filtro; retirar escrituras y regla automática después de migrar clientes; retirar la columna mediante migración final una vez agotada la ventana de compatibilidad. El orden y los hitos deben detallarse tras aprobar la decisión.
- **Aceptación futura:** ningún consumidor confirmado depende del campo/filtro; periodo de transición cumplido; regresiones de contrato cubiertas; migración de base de datos revisada y reversible según política; distribución histórica tratada conforme a decisión.

La implementación frontend del filtro «Mis eventos» sigue siendo una tarea independiente **E-CC-9** en el roadmap frontend. No es E-CC-9b-BE y no depende de `Content.ready`.

## Referencias revisadas

- Entidad, DTO y rutas: [content.entity.ts](../../src/editorial/contents/entities/content.entity.ts), [create-content.dto.ts](../../src/editorial/contents/dto/create-content.dto.ts), [contents.controller.ts](../../src/editorial/contents/contents.controller.ts), [contents.service.ts](../../src/editorial/contents/contents.service.ts).
- Escrituras y consultas: [content-creation.service.ts](../../src/editorial/contents/application/content-creation.service.ts), [content-lifecycle.service.ts](../../src/editorial/contents/application/content-lifecycle.service.ts), [content-query.service.ts](../../src/editorial/contents/application/content-query.service.ts), [content-scheduler.service.ts](../../src/editorial/contents/content-scheduler.service.ts).
- Serialización de relaciones: [public-content-reference.ts](../../src/editorial/contents/serialization/public-content-reference.ts), controllers de Articles, Videos y Riff Valley Playlists.
- Persistencia y pruebas: [migración de ready](../../src/migrations/1767807955655-AddReadyToContent.ts), specs de DTO, query service y lifecycle bajo `src/editorial/contents/**/__tests__/`.
- Frontend, solo lectura: `riffvalley-app-front/src/services/contents/contents.ts`, `src/services/contents/contents.test.ts`, `src/modules/editorial/content-calendar/**` y su [roadmap](../../../riffvalley-app-front/roadmap/editorial/content-calendar.md) (referencia contextual; fuera del repositorio de cambios).
- Registro previo: [auditoría de acceso a Contents](../backend-cleanup/editorial/contents-access-control.md) y [ciclo editorial E-CC-8](content-lifecycle.md).
