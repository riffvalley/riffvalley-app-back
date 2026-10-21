# Backend Cleanup — Editorial: National Releases

**Navegación:** [índice Backend Cleanup](../README.md). Anterior: [Reunions, Points y Playlists](reunions-playlists.md). Siguiente: [Cierre de Editorial](closure.md).

## BC-NR-0 — Auditoría inicial de National Releases

**Estado:** auditoría inicial y cleanup completados (2026-10-20); BC-NR-1 a BC-NR-8 completadas. NationalReleases queda **completado**. Editorial permanece abierto por otros módulos, incluido Contents. No se avanza a la homogeneización transversal.
**Base observada:** rama `refactor/editorial`; checkout limpio al iniciar la auditoría. Se conserva el estado local observado.
**Alcance leído:** `src/editorial/national-releases/` completo (controller, servicio, entidad, módulo, cuatro DTOs y el único spec); composición de `AppModule`; configuración de validación global; migraciones de NationalRelease existentes; consumidores backend en Catalog y Mail. Búsqueda de referencias en backend. No se inspeccionó el frontend, no se ejecutaron tests/build/typecheck, ni se accedió a PostgreSQL o servicios externos.

### Resumen de responsabilidades, contrato y wiring

- `NationalReleasesController` (107 líneas) expone diez handlers bajo `/national-releases`: POST de alta individual o array, POST protegido `from-disc`, POST protegido `bulk`, tres GET públicos (`/`, `/public`, `/:id`), GET `/all` protegido, PATCH protegido `/:id/link-disc`, PATCH protegido `/:id` y DELETE protegido `/:id`. Los IDs de ruta usan `ParseUUIDPipe`; DELETE devuelve 204. `POST /` tiene throttle de cinco solicitudes por minuto y no exige rol. Las operaciones editoriales restantes usan `@Auth(ValidRoles.riffvalley)`; el spec verifica los metadatos de rutas y roles, no la ejecución HTTP.
- `NationalReleasesService` (319 líneas; 11 métodos públicos/privados) combina comprobación de duplicados, altas individuales/en lote, tres variantes de lectura, sugerencias de Disc, alta desde Disc, vinculación/creación de Disc, edición y borrado. El método mayor es `findAllAdmin` (69 líneas); `findAllPublic` (48), `createMany` (37) y `linkDisc` (38). Por tamaño merece revisión de cohesión, pero estas operaciones pertenecen al mismo ciclo de lanzamientos nacionales y la evidencia no justifica extraer una fachada o providers adicionales.
- La entidad (59 líneas) contiene los campos de release, auditoría (`createdAt`/`updatedAt`) y relación nullable ManyToOne a Disc (`eager: false`). Las consultas de lista cargan explícitamente Disc, Artist y Genre; `findOne` no carga la relación. La migración activa de unicidad crea un índice único sobre `LOWER(artistName)`, `LOWER(discName)` y `discType`; no se leyó ni modificó esquema en una base de datos.
- DTOs: el alta común valida nombres/género de 1–100, enum, fecha, URL opcional y URL de hasta 500; `publishAt` es opcional. Alta desde Disc admite aprobación, fecha y overrides de tipo/género/enlace. Link Disc declara opcionales todos los campos de ambas opciones (ID existente o nombre para crear Disc); no expresa exclusión mutua. Update es un `PartialType` del alta más `approved` boolean.
- Composición: `NationalReleasesModule` registra repositorios NationalRelease y Disc, AuthModule y MailModule. No hay dependencia de `NationalReleasesModule` desde los módulos Catalog consumidores ni uso de `forwardRef`; no se observa ciclo de módulos Nest. Sí existe acoplamiento bidireccional a nivel de datos/código: National Releases usa `Repository<Disc>`; Artist Details y Management consultan `Repository<NationalRelease>`, y Disc Calendar lee `national_release` mediante SQL raw. Catalog Import solo registra la entidad en su spec de wiring, sin consumo de producción encontrado.
- El servicio también depende de `MailService`; Mail importa el DTO `CreateNationalReleaseDto` desde Editorial para tipar el aviso, creando una dependencia de fuente inversa a nivel de feature, aunque no una dependencia Nest de módulos ni un ciclo de providers observado. Solo `create` invoca la notificación; `createMany` (usado por ambos endpoints array/bulk) no lo hace. El comportamiento SMTP del alta unitaria atrapa y registra errores, así que el flujo de persistencia no falla por un error de transporte en esta implementación. La diferencia de notificación entre altas individuales y por lote es comprobable, pero su intención no está documentada; no se propone cambiarla sin decidir el contrato de negocio.
- `findAll` y `findAllPublic` repiten filtros y orden de la consulta aprobada; la versión pública proyecta manualmente campos y relaciones, mientras la otra retorna entidades. `findAllAdmin` añade meses pendientes y, para cada release álbum/EP sin Disc vinculado, lanza una query independiente de sugerencia. No hay evidencia de volumen o plan real para concluir que el coste requiere optimización inmediata.
- Pruebas locales: solo `national-releases.controller.spec.ts` (73 líneas), centrado en metadatos de autorización/throttle. No hay spec de servicio, entity/DTO ni wiring del módulo en la carpeta. Artist Details/Management y Disc Calendar tienen pruebas propias de sus proyecciones/uso de IDs; no caracterizan las escrituras, duplicidad, errores HTTP, transacciones o payloads de las rutas de National Releases.

### Hallazgos funcionales

#### NR-F1 — La lectura individual pública devuelve también releases no aprobados (resuelto por BC-NR-2)

- **Ubicación:** `national-releases.controller.ts` (`GET /:id`) y `national-releases.service.ts:280-285`; comparación con `findAll`/`findAllPublic` en `:74-104`.
- **Evidencia comprobada:** `GET /:id` no lleva `@Auth`; `findOne` busca solo por ID y devuelve la entidad completa, sin condición `approved = true`. Ambas listas públicas filtran explícitamente por aprobados. Por tanto, con un UUID válido, el handler individual también serializa una fila pendiente, incluyendo `approved`, `publishAt` y timestamps.
- **Problema/consecuencia:** el estado de aprobación no protege la lectura individual; la ruta permite consultar datos antes de su publicación y difiere del criterio de las listas públicas.
- **Categoría / prioridad / tamaño:** bug funcional y contrato; media; S.
- **Propuesta y resolución:** conservar ruta y respuesta para filas aprobadas, y tratar como no encontrada una fila no aprobada en lectura pública. BC-NR-2 la implementó mediante una búsqueda pública que filtra `approved = true`; el lookup interno sin filtro sigue atendiendo update/remove.
- **Consumers y riesgos:** el wrapper frontend `getNationalRelease` no tiene callsites en el checkout inspeccionado. `NationalReleasesAdmin.vue` carga pendientes por `/all` y edita los objetos del listado, así que no depende del detalle público para pendientes. Los campos del payload de aprobados se conservaron. Consumers externos no presentes en esos repositorios no se verificaron.
- **Hecho frente a hipótesis:** el bypass previo y la regla implementada se demuestran en código/tests; la ausencia de uso aplica a los callsites frontend buscados, no demuestra ausencia de integraciones externas.

#### NR-F2 — Update permite intentar duplicados y deja que el índice se manifieste como error interno

- **Ubicación:** `national-releases.service.ts:287-294`; `checkDuplicate` en `:301-317`; migración `1781812928411-UpdateNationalReleaseUniqueConstraintIncludeDiscType.ts`.
- **Evidencia comprobada:** create y createFromDisc comprueban duplicados por artista/disco ignorando mayúsculas y considerando tipo. Update aplica cualquier campo del DTO y guarda sin esa comprobación. La base tiene índice único case-insensitive sobre las mismas tres claves; una edición conflictiva llega al error de persistencia en vez del `BadRequestException` usado por las altas.
- **Problema/consecuencia:** el contrato de actualización no traduce el conflicto conocido al error HTTP de duplicado de las altas y el caso no tiene cobertura de servicio.
- **Categoría / prioridad / tamaño:** bug funcional; media; S.
- **Propuesta:** caracterizar update sin cambios, cambio válido y colisión ignorando mayúsculas; comprobar la clave contra otros IDs (excluyendo la propia fila) y mantener una respuesta 400 coherente también ante carrera contra el índice único.
- **Dependencias y riesgos:** preservar los criterios y mensaje/código HTTP establecidos por las altas salvo decisión explícita; no requiere migración.
- **Hecho frente a hipótesis:** omisión del precheck y restricción DB constan en código versionado; no se verificaron filas duplicadas en datos reales.

#### NR-F3 — Los POST de alta no validan sus cuerpos con el ValidationPipe global

- **Ubicación:** `national-releases.controller.ts:30-46`; DTO `CreateNationalReleaseDto`; `src/main.ts:37-41`.
- **Evidencia comprobada:** `create` declara una unión `CreateNationalReleaseDto | CreateNationalReleaseDto[]`, cuyo metatype reflejado es `Object`; `createBulk` declara `CreateNationalReleaseDto[]`, cuyo metatype es `Array`. Ninguno usa `ParseArrayPipe` ni `@ValidateNested`/`@Type`. El ValidationPipe global habilita whitelist y forbidNonWhitelisted, pero no convierte esos metatypes en instancias validadas de `CreateNationalReleaseDto` ni valida cada elemento del array.
- **Problema/consecuencia:** tanto el alta singular como las altas en array pueden pasar al servicio sin reglas de longitud, enum, fecha y URL, exponiendo persistencia a errores de runtime/SQL y evitando el rechazo temprano de propiedades no declaradas.
- **Categoría / prioridad / tamaño:** bug funcional/validación; alta; S.
- **Propuesta:** añadir una caracterización HTTP de elementos válidos/inválidos/propiedades extra para ambas rutas; aplicar validación de cada elemento preservando las rutas actuales, el formato array aceptado en POST `/` y el contrato de respuesta/error acordado.
- **Dependencias y riesgos:** verificar primero el comportamiento real del ValidationPipe en el contexto Nest del proyecto. Evitar cambiar inadvertidamente el POST singular o el throttle.
- **Hecho frente a hipótesis:** ausencia de pipe/decoradores y metadatos `Object`/`Array` son hechos; la respuesta observable exacta requiere prueba HTTP focalizada.

#### NR-F4 — La edición de filtros de fecha y aprobación acepta valores malformados como filtros ausentes

- **Ubicación:** `national-releases.controller.ts:47-76`.
- **Evidencia comprobada:** `month`/`year` se convierten con `parseInt` sin validación. Si el valor no inicia con dígitos, produce `NaN`, que el servicio trata como ausente mediante `if (month)`/`if (year)`; `approved` solo se convierte si coincide exactamente con `true` o `false`, y cualquier otro string equivale a no filtrar.
- **Problema/consecuencia:** un parámetro inválido puede producir una lista más amplia que la solicitada en lugar de un 400; mes fuera de rango no se rechaza explícitamente.
- **Categoría / prioridad / tamaño:** bug funcional/contrato de filtro; baja; S.
- **Propuesta:** caracterizar y validar parámetros enteros, rango mensual y booleano permitido para los endpoints públicos/admin, definiendo error 400 para valores no válidos y manteniendo ausencia como ausencia.
- **Dependencias y riesgos:** cambio visible para callers que actualmente envíen filtros inválidos; revisar callers antes del cambio.
- **Hecho frente a hipótesis:** coerciones y semántica están demostradas por el controller/servicio; el uso actual de valores inválidos por callers es desconocido.

#### NR-F5 — Link Disc deja crear un Disc huérfano si falla el guardado de la relación

- **Ubicación:** `national-releases.service.ts:241-278`.
- **Evidencia comprobada:** en la opción por nombre se guarda el nuevo Disc (línea 269) y después se guarda el NationalRelease apuntando a él (líneas 276-277), en escrituras separadas sin transacción. Si falla la segunda escritura, la primera ya persistió. La FK `national_release.discId` solo impide referencias inválidas; no revierte la creación anterior.
- **Problema/consecuencia:** una respuesta de error puede dejar un Disc sin vincular, como estado parcial del flujo de enlace.
- **Categoría / prioridad / tamaño:** bug funcional/consistencia; media; M.
- **Propuesta:** caracterizar fallo de segunda escritura y hacer atómico el alta de Disc + actualización de NationalRelease usando manager/query runner transaccional; mantener el flujo de vincular un Disc existente sin escrituras extra.
- **Dependencias y riesgos:** aplicar el criterio de transacción ya usado por el proyecto; probar rollback y estado exitoso con repositorios/manager falsos, sin PostgreSQL real en test unitario.
- **Hecho frente a hipótesis:** orden y ausencia de transacción son hechos; la presencia de Disc huérfanos en una base real no se investigó.

#### NR-F6 — Link Disc acepta simultáneamente ID y nombre aunque implementa solo la opción ID

- **Ubicación:** `dto/link-disc.dto.ts` y `national-releases.service.ts:251-274`.
- **Evidencia comprobada:** todos los campos de ambas alternativas son opcionales y no hay validación de exclusión mutua. Si llegan `discId` y `name`, el servicio toma la rama `discId` y omite la creación, sin informar que el resto del body fue ignorado.
- **Problema/consecuencia:** el input admite dos intenciones incompatibles y la precedencia silenciosa puede hacer que el editor crea que creó/vinculó los valores enviados por nombre.
- **Categoría / prioridad / tamaño:** bug funcional/validación; baja; S.
- **Propuesta:** probar los estados sin opción, solo ID, solo nombre y ambas; rechazar explícitamente combinaciones ambiguas y conservar los dos flujos válidos.
- **Dependencias y riesgos:** el caso de body combinado pasaría a 400; verificar consumidores antes del cambio.
- **Hecho frente a hipótesis:** aceptación y rama elegida se comprueban por DTO/servicio; no se sabe si callers actuales envían ambos.

### Contract finding

**Current behavior:** `GET /api/national-releases` y `/public` solo incluyen aprobados. `GET /api/national-releases/:id` es público, devuelve una entidad sin filtrar aprobación y expone sus campos de estado/auditoría.

**Problem:** el endpoint de detalle permitía leer releases pendientes con un ID conocido y presentaba una regla de publicación distinta a ambos listados públicos. En el frontend presente, el wrapper `getNationalRelease` no tiene callsites; `NationalReleasesAdmin.vue` obtiene pendientes mediante `/all` y edita la fila del listado. No se encontró consumer frontend de la ruta de detalle.

**Impact:** backend para los consumers backend/frontend hallados; no se descartan consumers externos no disponibles en los repositorios inspeccionados.

**Options:**

1. Preservar acceso actual; mantiene compatibilidad pero también el acceso anónimo a pendientes.
2. Refactorizar internamente sin cambiar el contrato; no elimina la diferencia de publicación.
3. Cambiar la regla de `GET /:id` para limitarla a aprobados, con 404 para pendientes; conserva ruta/payload de filas públicas aprobadas, cambia el resultado para IDs pendientes.
4. Coordinar una lectura protegida para gestión editorial y dejar la ruta pública restringida a aprobados, si el frontend necesita detalle de pendientes.

**Recommendation:** opción 3. La revisión del frontend actual confirma que gestión no obtiene pendientes por esta ruta. La respuesta de releases aprobados conserva su payload completo; no se elimina ningún campo.

**Blocks the current task:** No. BC-NR-2 resuelve el hallazgo y conserva intacto el flujo de gestión de pendientes que usa `/all`.

### Hallazgos arquitectónicos y de cobertura

#### NR-A1 — Dependencia de Mail hacia un DTO de Editorial

- **Ubicación:** `src/communications/mail/mail.service.ts:3,38-40`; `src/editorial/national-releases/national-releases.service.ts:13,25,28-32`.
- **Evidencia comprobada:** NationalReleases llama a MailService para notificar el alta; MailService importa el DTO de Editorial para firmar su método. No hay dependencia de `NationalReleasesModule` desde MailModule ni ciclo de providers Nest.
- **Problema/consecuencia:** el módulo transversal de comunicaciones acopla su API pública a un DTO HTTP de un feature editorial; el source graph vuelve de Communications hacia Editorial.
- **Categoría / prioridad / tamaño:** arquitectura; baja; S.
- **Propuesta:** desacoplar el contrato del aviso del DTO HTTP (p. ej. datos de notificación propios de Mail o un input estructural limitado) y conservar el contenido/comportamiento del correo.
- **Dependencias y riesgos:** alinear tipos y pruebas de Mail y National Releases; no extraer capas adicionales.
- **Hecho frente a hipótesis:** import y uso de tipo verificados; el import es solo de tipo en el código y no demuestra un ciclo runtime.

#### NR-A2 — Sugerencias admin ejecutaban una consulta por cada release sin Disc (resuelto por BC-NR-8)

- **Ubicación:** `national-releases.service.ts:176-198`.
- **Evidencia comprobada:** antes, cada resultado álbum/EP sin `discId` producía una consulta propia; la lista admin no tiene paginación en este handler. El benchmark local confirmó crecimiento de 12 a 62 consultas al pasar de 10 a 60 elegibles.
- **Problema/consecuencia:** los viajes repetidos elevaban el tiempo de listados grandes. El benchmark sobre el mismo dataset midió 5.027 ms frente a 4.039 ms para 10 releases y 18.912 ms frente a 7.760 ms para 60.
- **Categoría / prioridad / tamaño:** arquitectura/performance; baja; M para una modificación condicionada a evidencia.
- **Resolución:** BC-NR-8 conserva los criterios de matching y selección, y agrupa resolución/hidratación en hasta dos queries de Disc. No se añadieron índices.
- **Dependencias y riesgos:** la validación usó una base local aislada con esquema mínimo y 60 releases elegibles; los tiempos absolutos no representan producción y el plan hace scans secuenciales por no tener índices lower-case.
- **Hecho frente a hipótesis:** crecimiento de consultas, reducción de tiempo en listados medianos/grandes y equivalencia de respuesta se midieron en PostgreSQL local. El volumen real de producción no se conoce.

### Tareas propuestas, ordenadas y no implementadas

#### Correcciones funcionales

1. **[x] BC-NR-1 — Validar los cuerpos de alta (S, bug funcional, prioridad alta). Completada el 2026-10-20.** **Dependencias:** BC-NR-0. Se añadió un pipe local al controller que fuerza validación DTO para alta singular y valida cada elemento de los arrays en POST `/` y POST `/bulk`, rechazando también cuerpo ausente/null y elementos null. Mantiene whitelist, rechazo de propiedades extra, transform e implicit conversion del ValidationPipe global. Rutas, throttle, permisos, forma singular/array y respuestas de éxito no cambian; no se modificó el servicio. **Pruebas:** suite HTTP focalizada cubre alta singular y array en root, enum/fecha/URL inválidas, propiedades extra, rechazo previo a invocar el servicio y la ruta bulk protegida; la suite de metadata confirma los roles y throttle.
2. **[x] BC-NR-2 — Restringir el detalle público por aprobación (S, bug funcional/contrato, prioridad media). Completada el 2026-10-20.** **Dependencias:** BC-NR-0 y decisión consumer del Contract finding. El GET público ahora llama a una búsqueda específica que exige `approved: true`; filas aprobadas conservan el objeto de entidad y payload actuales, mientras pendientes/ausentes devuelven 404. La búsqueda interna `findOne` sigue sin filtro de aprobación para que update/remove de filas pendientes no cambien. No se modifican rutas, permisos, entidad ni frontend. La inspección frontend encontró que `getNationalRelease` no tiene callsites y que NationalReleasesAdmin carga pendientes por `/all` y edita los objetos recibidos; no hizo falta una ruta protegida adicional. **Pruebas:** regresión HTTP de ruta/payload aprobado y 404 pendiente; pruebas del filtro TypeORM y preservación del lookup interno pendiente.
3. **[x] BC-NR-3 — Mantener el error de duplicado al actualizar (S, bug funcional, prioridad media). Completada el 2026-10-20.** **Dependencias:** BC-NR-0. La actualización comprueba duplicados con comparación case-insensitive y excluye el ID actual; mantiene la excepción 400 y su mensaje establecidos para altas. También traduce la violación concurrente del índice único `UQ_national_release_artist_disc_type` a ese mismo 400 y deja propagarse otros errores de persistencia. No cambia rutas, permisos, respuestas de éxito, altas, migraciones ni servicios externos.
4. **[x] BC-NR-4 — Hacer atómica la creación de Disc y su vínculo (M, bug funcional/consistencia, prioridad media). Completada el 2026-10-20.** **Dependencias:** BC-NR-0. La rama que crea un Disc guarda el nuevo Disc y el release vinculado mediante repositorios obtenidos del mismo manager transaccional; un error al guardar el release aborta la operación y revierte el Disc. El camino de vincular un Disc existente conserva su lookup con Artist/Genre y guarda el release una vez sin abrir esta transacción. Rutas, permisos, respuesta de éxito y errores HTTP siguen iguales.
5. **[x] BC-NR-5 — Rechazar opciones ambiguas de link-disc (S, bug funcional/validación, prioridad baja). Completada el 2026-10-20.** **Dependencias:** BC-NR-0. El DTO y el servicio exigen exactamente una alternativa: `discId` o datos de Disc nuevo con `name`. La ausencia de opción, los datos de Disc sin nombre y el envío de ambas alternativas devuelven 400; los IDs mal formados se rechazan en DTO. Un `discId` válido pero inexistente conserva el 404 controlado. Las rutas, permisos, respuestas válidas y transacción de BC-NR-4 se mantienen.
6. **[x] BC-NR-6 — Validar filtros month/year/approved (S, bug funcional/contrato, prioridad baja). Completada el 2026-10-20.** **Dependencias:** BC-NR-0. En GET `/`, `/public` y `/all`, `month` debe ser entero 1–12; `year`, año de calendario entero 1–9999; `approved`, booleano literal `true` o `false`. Valores vacíos, mal formados, fraccionarios, fuera de rango o repetidos devuelven 400; filtros omitidos siguen pasando `undefined` y conservan su semántica. La inspección del consumer confirmó que NationalReleasesAdmin ofrece mes, año 2025/2026 o Todos y envía `approved` booleano solo para pendientes; no se encontraron consumers frontend de las listas públicas. Sin cambios frontend, rutas, permisos ni servicio.

#### Reorganizaciones arquitectónicas

7. **[x] BC-NR-7 — Desacoplar el contrato de Mail del DTO editorial (S, arquitectura, prioridad baja). Completada el 2026-10-20.** **Dependencias:** BC-NR-0. Mail define `NationalReleaseNotification` con solo los campos que consume y deja de importar DTOs de Editorial. Se preservan subject, destinatario, campos HTML, manejo/log de errores y la llamada de alta existente. NationalReleasesModule conserva MailModule como import y no duplica el provider. No se extraen capas adicionales.
**Caracterización completada de `findAllAdmin` (2026-10-20; BC-NR-8a):** `national-releases.suggestions.spec.ts` cubre cero resultados, un release elegible y varios releases elegibles, además de resultados vinculados y singles que no generan sugerencia. Con el filtro admin por defecto el servicio emite dos consultas base y, en paralelo, una consulta de Disc por cada álbum/EP sin vínculo (fan-out `2 + N`). Las pruebas preservan orden, coincidencia, `null` y el campo `suggestedDisc`. Esto caracteriza el número y el resultado de las consultas, no el rendimiento SQL.

8. **[x] BC-NR-8 — Agrupar sugerencias de Disc y comparar su coste real en PostgreSQL local (M, performance, prioridad baja). Completada el 2026-10-20.** **Dependencias:** caracterización BC-NR-8a completada. En el baseline confirmado en PostgreSQL se ejecuta una consulta base para releases, otra para meses pendientes y una búsqueda por álbum/EP no vinculado (`2 + N`). La base de desarrollo configurada estaba vacía, así que el conjunto se generó en la base aislada `riffvalley_nr8_bench_20261020` del mismo PostgreSQL local, con un esquema mínimo de las entidades consultadas. No se aplicaron migraciones ni se tocaron entidades.

**Estrategia implementada:** una consulta TypeORM `Repository.query` usa `UNNEST` y `LEFT JOIN LATERAL` para resolver cada release en un viaje, manteniendo las comparaciones `LOWER(name)`/`LOWER(artist.name)` y el `LIMIT 1` sin orden explícito de la búsqueda anterior. Una segunda consulta agrupada del repositorio hidrata solo los IDs elegidos y carga `artist`/`genre` como antes. No se carga la tabla Disc indiscriminadamente, no se alteran entidades/migraciones/rutas/respuestas ni otras operaciones del servicio. La suite compara `suggestedDisc` para ausencias, resultados, filas ya vinculadas, singles, orden y la selección devuelta para múltiples coincidencias; también verifica el conteo acotado.

**Dataset reproducible:** releases elegibles con fecha única de 2026, tipo alterno álbum/EP y artista/disco propios; los índices de release `i % 3 != 1` tienen candidato, y los demás solo un distractor con el artista equivocado. En `i % 10 == 0` se crean dos Disc con el mismo nombre/artista para caracterizar coincidencias múltiples. Cada conjunto añade un álbum vinculado y un single no vinculado. El conjunto de 60 tiene 62 releases en total, 61 sin Disc (60 álbum/EP elegibles y 1 single), 40 sugerencias, 20 álbumes/EP sin candidato y 6 pares con dos Disc coincidentes. No hay índices de búsqueda lower-case en el esquema de benchmark.

**Comparación PostgreSQL (filtro admin por defecto; mediana de 6 ejecuciones secuenciales después de una comparación inicial):**

| Releases elegibles sin vínculo | Antes, consultas | Después, consultas | Después, búsquedas/hidrataciones Disc |
| ---: | ---: | ---: | ---: |
| 0 | 2 | 2 | 0 |
| 1, con candidato | 3 | 4 | 1 / 1 |
| 10, 7 candidatos | 12 | 4 | 1 / 1 |
| 60, 40 candidatos | 62 | 4 | 1 / 1 |

| Releases elegibles sin vínculo | Antes, mediana ms | Después, mediana ms | Igualdad exacta |
| ---: | ---: | ---: | :--- |
| 0 | 1.169 | 1.224 | Sí |
| 1, con candidato | 1.751 | 2.186 | Sí |
| 10, 7 candidatos | 5.027 | 4.039 | Sí |
| 60, 40 candidatos | 18.912 | 7.760 | Sí |

La comparación serializó la respuesta completa de la implementación anterior y `findAllAdmin` optimizado sobre las mismas filas; fue idéntica en los cuatro tamaños, incluidos `suggestedDisc`, casos sin candidato, linked/single, orden por fecha y coincidencias múltiples. Los tiempos no mejoran para 0–1 elegibles por el coste fijo del segundo query agrupado de hidratación cuando hay match; en 10 y 60 bajaron ~20% y ~59%. El conjunto es pequeño y local; los tiempos absolutos no predicen producción.

**Planes:** en el esquema controlado, la consulta anterior individual de sugerencia (incluye Disc/Artist/Genre) eligió scans secuenciales de Disc y Artist y `genre_pkey`; con dos filas coincidentes devolvió ambas al executor, del que `getOne()` hidrata la primera. Plan: 7 shared buffers, `Execution Time 0.059 ms`. La consulta agrupada con LATERAL sobre 60 claves hizo 60 iteraciones de `Limit`, scans secuenciales de Disc/Artist y 120 shared buffers en total; `Execution Time 2.091 ms`. Es un plan de una consulta agrupada, no comparable por sí solo con la suma de 60 planes individuales; la comparación de extremo a extremo refleja la reducción de round trips. No se añadieron índices.

**Destino y preparación:** `.env` de desarrollo apunta a `localhost:5432/SpamMusicDB`; PostgreSQL 17.10 respondió en `172.20.0.2`, `transaction_read_only=off`. `SpamMusicDB` contiene 0 tablas, por tanto 0 National Releases y 0 releases sin Disc; no se alteró. Una base separada `riffvalley_nr8_bench_20261020` recibió únicamente esquema mínimo y datos sintéticos reproducibles para esta medición. No se conectó a producción ni servicios externos. El intento inicial de `yarn --ignore-engines migration:run` contra `SpamMusicDB` vacía abortó durante descubrimiento, antes de ejecutar SQL: el glob de `src/data-source.ts` carga `1791920000000-MigrateUsersToSingleRole.spec.ts` como migración (`ReferenceError: describe is not defined`). No se repitió ni revirtió; no hubo cambios de esquema en `SpamMusicDB`.

**Bloqueo de preparación:** se intentó `yarn --ignore-engines migration:run` solo contra esa base local vacía; TypeORM abortó durante el descubrimiento antes de ejecutar migraciones porque el glob de `src/data-source.ts` también carga `1791920000000-MigrateUsersToSingleRole.spec.ts` como migración (`ReferenceError: describe is not defined`). No se aplicó ninguna migración ni se escribió esquema/datos. No se repitió ni revirtió el runner. La base permanece sin esquema y no se generó dataset.

**Criterios de aceptación:** cumplidos en la base local aislada: dataset controlado, métricas antes/después, número de consultas acotado, planes y equivalencia exacta incluidos seis casos de coincidencia múltiple. La suite automatizada añade cobertura de `null`, vinculados, singles, orden y un listado de 60 releases sin crecimiento de consultas. No se avanzó a homogeneización transversal.

**No se propone extracción de servicios por tamaño:** aunque el servicio está en 319 líneas, el flujo principal es cohesivo y la evidencia actual no justifica fachada, loaders genéricos ni carpeta auxiliar. Revisitarlo solo si una corrección aprobada introduce responsabilidades autónomas.

**Verificaciones BC-NR-0:** lectura estática de implementación, DTOs, entidad, composición Nest, rutas/roles, relaciones, migraciones y consumers backend; lectura de las pruebas pertinentes; actualización exclusiva de `roadmap/backend-cleanup.md`; `git diff --check` pasó. No se ejecutaron tests/build/typecheck ni se accedió a PostgreSQL o servicios externos reales.
**Verificaciones BC-NR-1:** `yarn --ignore-engines test --runInBand src/editorial/national-releases/national-releases.validation.routes.spec.ts src/editorial/national-releases/national-releases.controller.spec.ts` (2 suites, 12 tests); ESLint de los dos archivos propios del cambio; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado; `git diff --check`. La suite HTTP usó socket local y mocks, sin PostgreSQL ni servicios externos. El ESLint inicial que incluyó el spec de autorización existente detectó su uso previo de `Function`; se conservó intacto y el lint final se limitó a los archivos propios del cambio.
**Verificaciones BC-NR-2:** `yarn --ignore-engines test --runInBand` con las cuatro suites de National Releases (4 suites, 17 tests), incluyendo regresión de permisos, validación BC-NR-1, contrato HTTP y filtro del repositorio; ESLint de los cinco archivos propios de National Releases; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado; `git diff --check`. Las pruebas HTTP usaron socket local y mocks; no se accedió a PostgreSQL ni servicios externos. Inspección estática de los consumers frontend del wrapper y del listado administrativo; frontend sin cambios.
**Verificaciones BC-NR-3:** `yarn --ignore-engines test --runInBand` con las cinco suites focalizadas de National Releases (5 suites, 24 tests), incluyendo update sin cambios, clave libre, conflicto case-insensitive en otro ID, carrera de índice único, propagación de errores ajenos y regresiones de create/createFromDisc; suites de permisos/contratos HTTP también pasan. ESLint focalizado en `national-releases.service.ts` y `national-releases.update.spec.ts`; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado; `git diff --check`. Las pruebas usaron mocks y socket local; no se accedió a PostgreSQL ni servicios externos.
**Verificaciones BC-NR-4:** `yarn --ignore-engines test --runInBand` con las siete suites focalizadas de National Releases (7 suites, 29 tests), incluyendo creación/vínculo transaccional, rollback simulado ante error de guardado, persistencia de Disc existente, error not-found y contrato HTTP 500 sin cambio. ESLint focalizado en los tres archivos propios del cambio; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado; `git diff --check`. Se usaron mocks y socket local, sin PostgreSQL ni servicios externos.
**Verificaciones BC-NR-5:** `yarn --ignore-engines test --runInBand` con las siete suites focalizadas de National Releases (7 suites, 38 tests), incluyendo ambos caminos válidos, ausencia/ambigüedad de opción, atributos sin nombre, UUID inválido y Disc inexistente; HTTP confirma 400 antes del servicio para cuerpos inválidos y preserva la respuesta de éxito. ESLint focalizado en DTO, servicio y specs propios de link-disc; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado; `git diff --check`. Se usaron mocks y socket local, sin PostgreSQL ni servicios externos.
**Verificaciones BC-NR-6:** `yarn --ignore-engines test --runInBand` con las ocho suites focalizadas de National Releases (8 suites, 53 tests), incluyendo ausencia, límites mensuales/anuales, valores inválidos y combinaciones en las tres rutas; permisos/contratos y validaciones/transacciones BC-NR-1 a BC-NR-5 permanecen cubiertos. ESLint focalizado en controller y spec de filtros; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado; `git diff --check`. Las pruebas HTTP usaron mocks y socket local; sin PostgreSQL ni servicios externos.
**Verificaciones BC-NR-7:** `yarn --ignore-engines test --runInBand src/editorial/national-releases src/communications/mail/mail.service.spec.ts` (11 suites, 61 tests); ESLint en los cuatro archivos propios del cambio; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado en los cuatro archivos propios del cambio; `git diff --check`. Las pruebas HTTP usaron socket local y mocks, sin PostgreSQL ni servicios externos reales. La comprobación Prettier del documento completo señaló formato preexistente en otras partes de `roadmap/backend-cleanup.md`; se preservó sin reformatear el documento entero.
**Verificaciones BC-NR-8:** `yarn --ignore-engines test --runInBand src/editorial/national-releases src/communications/mail/mail.service.spec.ts` (12 suites, 65 tests); ESLint de `national-releases.service.ts` y `national-releases.suggestions.spec.ts`; `yarn --ignore-engines build`; `yarn --ignore-engines tsc --noEmit --incremental false -p tsconfig.build.json`; Prettier focalizado; `git diff --check`. Las suites HTTP usaron socket local y mocks. La medición adicional usó PostgreSQL 17.10 local, base aislada y schema/datos sintéticos; no ejecutó tareas programadas ni integraciones. El intento de migración en la base dev vacía abortó antes de DDL y no alteró esa base. No se accedió a producción ni a servicios externos.
**Resultado y criterios de cierre:** BC-NR-1 a BC-NR-8 quedan completadas y no quedan tareas aprobadas activas para National Releases. El criterio de cierre del módulo se cumple; NationalReleases pasa a **completado**. Editorial permanece abierto porque otros módulos, incluido Contents, siguen en cleanup. No se avanza a la homogeneización transversal.
