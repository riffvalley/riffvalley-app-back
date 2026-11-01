# RM-5 — SSE descriptivo de Radar y Mejores del Mes

Roadmap backend para las vistas de Lists `/discos/radar/:id` y `/discos/mejores/:id`. El canal SSE anuncia altas y eliminaciones de asignaciones con disco en Lists `week`/`month` y transiciones de posición elegibles dentro de un mismo Radar. No sustituye los endpoints HTTP como fuente de estado.

## Estado

| Hito     | Estado                     | Alcance                                                                                                                                               |
| -------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| RM-5a-BE | Completado el 2026-11-01   | Auditoría de propiedad, escrituras, transacciones y semántica de asignaciones.                                                                        |
| RM-5b-BE | Implementado el 2026-11-01 | Endpoint global, contrato `lists.invalidate` v1, emisión tras commit y pruebas backend; ampliado con transición `null → N` y eliminación descriptiva. |
| RM-5c-FE | Pendiente                  | Cliente SSE autenticado, filtrado por lista y actualización de consultas.                                                                             |
| RM-5d    | Pendiente                  | Validación integrada y operativa posterior a la adopción frontend.                                                                                    |

## Arquitectura y contrato

- Endpoint: `GET /api/lists/events`, protegido con Bearer JWT y `@Auth(ValidRoles.riffvalley)`. La jerarquía actual admite también `superadmin`.
- El controlador estático `events` precede a `:id` en `ListsController`.
- `ListsRealtimeModule` contiene un publisher RxJS en memoria y un stream que reutiliza `EditorialSseTransport`. No se reutilizan ni alteran publishers o contratos de Reunions y Content Calendar.
- El transporte común conserva heartbeat de 25 segundos, duración máxima de diez minutos, limpieza de conexiones, manejo de backpressure y cierre durante shutdown.
- El envelope es `lists.invalidate`, versión `1`, sin compatibilidad con contratos previos. La conexión comienza con `{ reason: "initial" }`; los cambios descriptivos llevan `reason: "change"` y una de estas acciones: `assignment.created`, `assignment.placed`, `assignment.moved`, `assignment.unplaced` o `assignment.deleted`.
- El payload incluye referencias mínimas: actor autenticado, usuario asignado nullable, `{id,type}` de la lista, `assignmentId`, `discId`, `artistName`, posición nueva o posiciones anterior/nueva según la acción, y `sourceId` opcional. No serializa entidades, email, texto editorial ni metadatos de disco.
- `actor` es el usuario que ejecutó la mutación; `assignee` es el usuario de la asignación; `artistName` es el nombre de `Disc.artist`. El controlador toma el actor de `GetUser()`, no del body. `X-Riff-Valley-Client-Id` solo se acepta si tiene formato UUID.

## Acciones y posiciones

| Escritura confirmada                           | Acción                | Condición                                                                                                      |
| ---------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Crear asignación con disco en `week` o `month` | `assignment.created`  | Conserva `newPosition` tal como quedó persistida; no genera además `placed` aunque nazca en posición positiva. |
| `0 → N`, `N > 0`                               | `assignment.placed`   | Misma lista de tipo `week`, asignación con disco.                                                              |
| `null → N`, `N > 0`                            | `assignment.placed`   | Misma lista de tipo `week`, asignación con disco; conserva `previousPosition: null`.                           |
| `N → M`, `N,M > 0`, `N ≠ M`                    | `assignment.moved`    | Misma lista de tipo `week`, asignación con disco.                                                              |
| `N → 0`, `N > 0`                               | `assignment.unplaced` | Misma lista de tipo `week`, asignación con disco.                                                              |
| Eliminar asignación con disco                  | `assignment.deleted`  | Lista `week` o `month`; conserva la última `previousPosition` de la asignación.                                |

`null` no se interpreta como bandeja. Ahora `null → N positivo` se anuncia como primera colocación; `1 → null`, `null → 0` y `0 → null` siguen sin clasificarse. Los eventos conservan explícitamente `0` y `null`; no se convierten en un valor alternativo.

Creaciones, actualizaciones y eliminaciones se publican después de resolver la transacción. Una excepción, rollback, fallo de validación/capacidad o posición sin cambio no publica. Los cambios combinados producen como máximo el evento de posición elegible. La publicación sucede antes de la sincronización posterior con WordPress y no depende de su resultado.

## Exclusiones y fallback

No se publican eventos por cambiar usuario sin movimiento, `done`, descripción, otros metadatos, `Disc.pinned`, CRUD de Lists, WordPress, votos, listas `special`/`video` ni asignaciones sin disco. La eliminación descriptiva solo cubre asignaciones con disco de listas `week`/`month`. La implementación no introduce reglas de negocio, migraciones, cambios HTTP, cambios de permisos de mutaciones, Redis o transporte multi-instancia.

Si una escritura elegible ya quedó confirmada pero faltan actor o metadatos descriptivos necesarios, el publisher registra un identificador de error seguro y emite `reason: "change"` genérico con la referencia de lista disponible. No inventa valores ni altera la respuesta HTTP. La sincronización inicial no usa el fallback.

## Publicación y límites de distribución

La suscripción es global: el servidor no abre streams por lista ni filtra por usuario asignado. Cada evento describe la lista para que el cliente elija qué vista invalidar. El publisher vive en memoria del proceso; no hay replay durable, outbox ni difusión entre instancias. La reconexión debe recuperar estado desde los GET actuales. Una operación confirmada puede quedar sin aviso si el proceso termina antes de publicar; el SSE es una señal efímera, no un registro de auditoría.

## Pruebas y verificación

- Pruebas de servicio: creación Radar y mensual con posiciones `0`, positiva y `null`; ausencia de disco/tipo elegible; fallback y error de creación; transiciones `0→1`, `null→1`, `1→2`, `2→0`; no-op y transiciones restantes con `null`; eliminación elegible/no elegible y fallo transaccional; cambio de lista o lista mensual; cambios combinados y exclusivos; capacidad y rollback.
- Pruebas del contrato: actor/asignado/artista diferenciados, referencias de lista/asignación/disco, posiciones y sourceId, fallback sin datos descriptivos y ausencia de campos editoriales/privados.
- Pruebas del endpoint: Bearer, jerarquía de roles, evento inicial, cabeceras, precedencia de la ruta estática y limpieza al desconectar o cerrar la aplicación.
- El stream prueba el heartbeat, timeout de diez minutos y liberación de suscripciones. La regresión conserva el límite de cuatro discos, transacciones, bloqueos y sincronización WordPress de las suites de Lists existentes.
- **Jest focalizado RM-5:** 14 suites y 212 tests aprobados para Lists, Asignations, Reunions y Content Calendar, incluidos los endpoints HTTP SSE y el ciclo de vida del stream.
- **Ampliación RM-5 de posiciones y eliminaciones:** 2 suites/73 tests focalizados aprobados; incluye `null → N` positivo y eliminación con actor, asignado, artista, lista, posición anterior y `sourceId`.
- **`pnpm run verify`:** aprobado tras la ampliación. 277 suites y 2.736 tests aprobados; 31 suites y 165 tests omitidos por configuración. Typecheck: cero errores; build y runtime dependency gate aprobados.
- **Gates:** 0 infracciones nuevas en estructura (9 históricas baselined), tipado seguro (5 históricas) y ESLint (832 históricas). Prettier focalizado y `git diff --check` aprobados.
- No se usó PostgreSQL ni se ejecutaron migraciones.
