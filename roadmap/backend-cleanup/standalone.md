# Revisión de `standalone.ts`

## Investigación final de `check-spotify` (2026-10-23)

Se compararon los archivos del release activo de Heroku con el checkout y se revisaron los logs del job. No se ejecutó manualmente la importación ni se consultó o modificó PostgreSQL. No se ejecutaron tests, gateways, migraciones ni despliegues; solo se modificó este documento.

**Resultado:** el release de producción usa el mismo `standalone.ts`, `DiscLinkMaintenanceService`, `SpotifyClientCredentialsService` y `AppModule` que el checkout. El `0` reportado significa que no se guardó ningún enlace/imágen de Spotify o Bandcamp como resultado aceptado. En los mensajes retenidos, 120 búsquedas alternativas encontraron discos de otro artista y fueron rechazadas por el validador; para el resto no hay suficiente detalle de logs para clasificar cada intento. El código de estado 0 no demuestra éxito: el CLI y el servicio absorben errores. El contexto CLI también activa los cron, aunque ninguno adicional llegó a ejecutarse durante esta invocación de 57 segundos.

## Qué hace y cómo arranca

`src/standalone.ts` es un punto de entrada CLI compilado por Nest junto al resto de `src/` como `dist/standalone.js`. `package.json` publica `console: node dist/standalone`; se le pasa la operación como primer argumento:

- `yarn console check-spotify`: resuelve `DiscLinkMaintenanceService` desde Nest y actualiza enlaces e imágenes de discos mediante Spotify/Bandcamp.
- `yarn console create-weekly`: resuelve `ContentSchedulerService` y crea el contenido semanal.

Para ambos comandos llama `NestFactory.createApplicationContext(AppModule)`, sin servidor HTTP, y usa el logger Winston compartido. Al crear `AppModule` también carga su configuración y módulos Nest y TypeORM. No es una tarea cron por sí misma: sus comandos invocan métodos; los cron reales están en los servicios y se registran al iniciar la aplicación.

## Referencias y consumidores

| Referencia | Evidencia encontrada | Lectura |
| --- | --- | --- |
| `package.json` | Script `console` apunta a `node dist/standalone`. | Entrada ejecutable/manual mantenida en el proyecto. |
| `src/catalog/discs/maintenance/disc-link-maintenance.service.ts` | `runDailyLinkMaintenance()` es llamado por el cron diario y por el CLI; delega en `checkMissingSpotifyLinks()`. La ruta administrativa llama a este último directamente y conserva su logging detallado. El cron se ejecuta a las 06:00 de Madrid. | El comando duplica una vía operativa para el mismo servicio, no su implementación. |
| `src/editorial/contents/content-scheduler.service.ts` | `createWeeklyContent()` está decorado con cron semanal y contiene su guard de lunes. | El comando puede invocar manualmente la misma operación semanal. |
| `src/app.module.ts` | Registra `ScheduleModule`; los jobs se habilitan salvo la condición específica `STAGE=dev` y `DISABLE_SCHEDULED_TASKS=true`. | El contexto CLI compone el mismo AppModule y, por ello, registra también los cron. Una invocación coincidente con la hora de un cron podría ejecutar ambas vías. No se ejecutó para comprobar efectos. |
| `Procfile` | Solo declara `web: yarn start:prod`. | Heroku inicia la API vía `dist/main`, no vía `standalone`. |
| Heroku, consultado el 2026-10-23 | Release activo `v345`, deploy `c860e56a`; los logs muestran `scheduler.2351` ejecutando `npm run console check-spotify`. Las API de GitHub del commit devuelven los mismos blob hashes que los archivos locales: `standalone.ts` `7ff1aaeaf621cafb3d8cae9bc3a5b888a5ac93c9`; Disc maintenance `eb11f4a4f830a57487e98c3d7bd30755fec09caa`; `AppModule` `8a74467796f7fc8c8ed89d73007ccf42953d2eb5`; Spotify client `4a8a23e97c2922ec496e008004cbb353ff8844e0`. | El checkout local coincide con el código relevante desplegado en el release que ejecutó el job. No hay divergencia de versión que explique el resultado. |
| Scripts, tests y CI | Búsqueda de referencias en `scripts/`, `test/` y `.github/workflows/backend-quality.yml`; no hay invocaciones de `console`/`dist/standalone` ni tests del bootstrap. CI solo ejecuta `yarn verify`. | No forma parte de pruebas o automatización CI conocidas. |
| Documentación | Hay referencias históricas/operativas en auditorías de Editorial, Catalog, roles y Spotify; documentan los dos comandos como capacidad manual y su relación con los cron. | Documentación coherente con el uso previsto; no acredita ejecuciones reales. |

No se encontró un comando separado para build/desarrollo de `standalone`: `yarn build` lo compila por el `include` `src/**/*.ts`; el comando de paquete requiere el artefacto compilado. No se pudieron inspeccionar definiciones/historiales del add-on ni registros para probar invocaciones manuales recientes.

## Comparación acotada con `main.ts`

### Versión desplegada y resultado observado

El release `v345` (`c860e56a`) se desplegó a las 23:56:25 UTC del 22 de octubre, antes del job del día 23. Se leyeron los cuatro archivos relevantes en ese commit mediante GitHub y se compararon sus hashes con el checkout; coinciden exactamente. La cifra no se explica por una versión vieja de `standalone.ts`, del servicio, del cliente Spotify ni de `AppModule`.

Heroku Scheduler inició `npm run console check-spotify` el 23 de octubre a las 05:00:15 UTC (07:00:15 en Europe/Madrid). El servicio seleccionó 140 discos con `releaseDate <= today` y `link` nulo, vacío, `No se encontró el álbum` o `Error al realizar la búsqueda`. El proceso terminó el ciclo y registró `Daily check completed. Updated links for 0 discs.` a las 05:01:28 UTC; Heroku informa salida 0 a las 05:01:31 UTC.

El contador `updatedCount` aumenta solo después de `discRepo.save()` en una coincidencia aceptada de Spotify (búsqueda estricta o alternativa) o Bandcamp. Por tanto, cero sí significa que no se guardó ningún enlace como importación exitosa. La asignación de la marca `No se encontró el álbum` también puede llamar `discRepo.save()`, pero no incrementa `updatedCount` ni produce un mensaje `Updated ... link`: el resumen no cuenta todos los cambios de fila, solo enlaces aceptados.

En los logs retenidos no aparece ningún `Updated Spotify link...` ni `Updated Bandcamp link...`. Sí aparecen al menos 120 secuencias de fallback y 120 respuestas de Spotify donde el primer álbum devuelto era de otro artista; el código las rechaza antes de guardar. No aparecen errores explícitos de token, excepción de disco ni respuesta HTTP no exitosa de Bandcamp. Los logs disponibles no permiten clasificar individualmente los 20 candidatos restantes. El resultado observado es compatible con cero coincidencias aceptadas; no hay evidencia de un fallo de escritura ni de un contador que no se incremente.

En el código del release v345 inspeccionado durante el incidente, `SpotifyClientCredentialsService.searchAlbumsByRawQuery()` devolvía `response.json()` sin revisar `response.ok`. Una respuesta Spotify 4xx/5xx con JSON de error podía quedar con `albums` ausente y tratarse como búsqueda vacía, continuar por Bandcamp/consulta flexible y escribir la marca de no encontrado. No se puede afirmar que esto causara el cero de aquella ejecución, porque no se registraron status HTTP; la clasificación ya quedó corregida en el cambio documentado abajo.

Los dos puntos de entrada crean una aplicación Nest con `AppModule` y usan `WinstonModule.createLogger(winstonConfig)`. La configuración/logger es compartida; no hay una segunda configuración de logging. El modo de Nest es distinto a propósito: `main.ts` llama `NestFactory.create()` y configura HTTP, escucha en el puerto; `standalone.ts` llama `createApplicationContext()` y no expone servidor HTTP. No repite el prefijo, CORS, pipes ni configuración Express de `main.ts`, que no corresponden al CLI.

`NestFactory.createApplicationContext()` inicializa el contexto Nest y ejecuta hooks de módulo/aplicación. `ScheduleExplorer` registra los métodos `@Cron()` y `SchedulerOrchestrator.onApplicationBootstrap()` monta e inicia los jobs. El `AppModule` desplegado coincide con el local y configura `cronJobs: true` fuera de `STAGE=dev` con `DISABLE_SCHEDULED_TASKS=true`; la configuración productiva usa `STAGE=prod`. Por tanto, el proceso `check-spotify` sí registró los siete cron de los módulos cargados.

En esta ejecución no se observa que otro cron llegara a correr: el proceso duró desde 05:00:15 hasta 05:01:31 UTC. Los dos cron de sincronización `*/10` tenían el siguiente tick a las 05:10 UTC; los demás cron horarios/semanales no vencían en esa ventana. Los logs del dyno Scheduler no muestran actividad de Instagram, TikTok, Spotify OAuth ni Content Scheduler. Es un riesgo de ejecución adicional si un futuro comando se prolonga hasta un tick, no la causa del cero observado.

`ScheduleModule.forRoot({ cronJobs: false })` es el mecanismo existente para impedir el registro de cron. La corrección de aislamiento propuesta es que Standalone marque un modo CLI explícito y solicite `DISABLE_SCHEDULED_TASKS=true`, y que `AppModule` acepte esa combinación al calcular `cronJobs`. No se debe forzar `STAGE=dev`: `typeOrmOptions()` usa `STAGE` para PostgreSQL SSL. El proceso web no define el marcador CLI y conserva sus cron actuales.

## Ubicación, obsolescencia y dependencias

`src/` es razonable para este entrypoint: Nest compila sus fuentes a `dist/`, y el script de paquete apunta al resultado. El inventario de arquitectura ya clasifica `standalone.ts` junto a `main.ts`, `AppModule` y otros archivos de arranque, no como módulo de negocio. Moverlo a `scripts/` exigiría introducir otra ruta de compilación o ejecución TS y cambiar el comando; no elimina una dependencia ni una responsabilidad. El validador estructural lo registra hoy como excepción histórica `module-root-file` en `scripts/structural-quality-gate.baseline.json`, pues no es archivo permitido en la raíz de un módulo Nest detectado. No añadir otra excepción ni moverlo solo para ocultar esa entrada.

No se identifican dependencias exclusivas de `standalone.ts`: `@nestjs/core`, `nest-winston` y `winston` también sostienen la aplicación; `AppModule` y sus módulos usan dependencias del runtime. No hay paquetes importados por el CLI que justifiquen retirar una dependencia del proyecto.

### Fallos y código de salida de `check-spotify`

En `standalone.ts`, una excepción que escape del método se registra en `catch`, pero el flujo termina con `process.exit(0)`. En `DiscLinkMaintenanceService`, errores de consulta/token y errores por disco se capturan y el método retorna `void`; la falta de token también retorna sin señal de error. Ahora `searchAlbumsByRawQuery()` comprueba `response.ok` y propaga el status HTTP. El mantenimiento registra el error y sigue intentando Bandcamp después de un fallo de la búsqueda estricta; Bandcamp diferencia errores HTTP/conexión de una respuesta válida sin resultados y el flujo conserva la búsqueda Spotify amplia como fallback. El estado de salida de Standalone sigue sin distinguir ejecución válida de error, por lo que Scheduler aún puede recibir estado 0 ante un fallo operativo.

No hay evidencia en los logs retenidos de que estas vías de error ocurrieran en la ejecución analizada. Sí hay un defecto comprobable de reporte de estado y de clasificación de respuestas HTTP; debe corregirse sin tratar una búsqueda válida sin coincidencias como fallo operativo. `updatedCount=0` en sí no es un bug del contador ni evidencia de que el proceso se interrumpiera.

### Logging de `check-spotify` (2026-10-23)

La ruta de `standalone.ts` usa `runDailyLinkMaintenance()`, igual que la ejecución programada, para emitir una sola línea de inicio con el número de discos pendientes y un resumen final con enlaces guardados, búsquedas sin coincidencia y errores de consulta. El resumen no emite detalles por disco; `checkMissingSpotifyLinks()` conserva sus mensajes detallados cuando se invoca sin opciones desde las operaciones manuales. Si falla la consulta inicial de discos, no hay un número real que mostrar al inicio y se escribe únicamente el resumen final con un error.

`searchAlbumsByRawQuery()` rechaza respuestas Spotify no exitosas antes de parsear el cuerpo. `searchBandcamp()` devuelve un resultado tipado como `found`, `not-found` o `error`; errores HTTP y de conexión incrementan errores de consulta en el runner y no se tratan como una respuesta Bandcamp vacía. Después de un fallo de Spotify estricto se intenta Bandcamp; después de un error o ausencia válida en Bandcamp se conserva la búsqueda Spotify amplia. No se añaden logs por disco en el modo de resumen.

Los contadores se basan en resultados observables: enlaces guardados tras una coincidencia aceptada, no coincidencias tras una búsqueda amplia válida sin resultado aceptable y errores de proveedor/consulta atrapados. Pueden coexistir un error de un proveedor y un guardado o no-match posterior si el fallback completa el flujo. Un error de la búsqueda inicial de discos o de token también se refleja como error, aunque no pueda emitirse un inicio con cantidad si la consulta inicial falla.

## Tareas propuestas

1. **BC-STANDALONE-1 — No registrar cron en el proceso CLI (S).** Standalone establece un marcador de modo CLI y solicita `DISABLE_SCHEDULED_TASKS=true`; `AppModule` usa esa combinación para pasar `cronJobs: false` sin cambiar `STAGE`. **Aceptación:** prueba focalizada confirma cron desactivados en `check-spotify` y activos en el proceso web con configuración actual; no se altera TypeORM ni se ejecutan trabajos.
2. **BC-STANDALONE-2 — Propagar el estado de ejecución al runner (S).** La distinción de no-resultados y errores HTTP/conexión de Spotify y Bandcamp quedó implementada y probada el 2026-10-23; permanece pendiente que `checkMissingSpotifyLinks()` devuelva un resultado mínimo y que el runner cierre el contexto en `finally` y devuelva 0 para una ejecución válida (aunque no encuentre enlaces) y distinto de cero ante errores de token, API, consulta o escritura. Retirar el `process.exit(0)` forzado para que Scheduler reciba ese estado. **Aceptación pendiente:** pruebas focalizadas cubren fallo de consulta/escritura, cierre del contexto y propagación del estado; el endpoint HTTP conserva su payload y un no-match no se informa como error operativo. No llamar servicios reales.

La eliminación o el traslado fuera de `src/` no se propone: el job de producción consume `check-spotify` directamente.
