# BC-COM — Auditoría inicial de Communications

**Estado:** saneamiento arquitectónico completado por BC-COM-1 y BC-COM-2 (2026-10-21). El hallazgo de seguridad sobre HTML en correos sigue pendiente y no se considera resuelto.
**Base observada:** rama `refactor/community`, 2026-10-21. Se conservaron los cambios locales; el checkout estaba limpio al comenzar.

## Alcance e historial arquitectónico

Communications tiene un módulo NestJS real: `MailModule`, en `src/communications/mail/`. El transporte SMTP pertenece a Integrations y no forma parte del ownership de Communications.

- BA reorganizó Mail bajo `src/communications/mail/` y conservó allí la composición de mensajes.
- La extracción de SMTP creó `src/integrations/smtp-integration/` con `SmtpIntegrationModule` y `SmtpTransportService`. `MailModule` importa ese módulo y exporta `MailService`; Nodemailer y la creación del transporter permanecen en Integrations.
- BC-NR-7 retiró la dependencia que Mail tenía de `CreateNationalReleaseDto`. Actualmente Mail declara `NationalReleaseNotification`, con los campos que necesita, sin importar tipos de Editorial.
- No se encontró un agregador de Communications ni se necesita uno: `AppModule` y los módulos consumidores importan los módulos concretos.

Referencias: [historial Backend Architecture](../backend-architecture.md), [historial de extracción SMTP](../integrations/integrations.md#correo-smtp) y [auditoría de National Releases, donde se documentó BC-NR-7](editorial/national-releases.md).

## Inventario de capacidades

| Capacidad                              | Implementación actual                                                      | Efectos y consumidores                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aviso de solicitud de acceso           | `MailService.sendAccessRequestNotification(email, alias)`                  | Envía a `contacto@riffvalley.es`; `AccessRequestsService` lo llama desde el POST público limitado por throttle. El consumer captura el error y aun así responde con éxito. |
| Aviso de lanzamiento nacional          | `MailService.sendNationalReleaseNotification(NationalReleaseNotification)` | Envía a `MAIL_TO`; el envío falla con log y se absorbe dentro de MailService. National Releases lo llama en `create` individual; el alta por lote no lo llama.             |
| Recordatorio de reautorización Spotify | `MailService.sendSpotifyReauthorizationReminder(...)`                      | Destinatario específico o fallback a `MAIL_TO`; si no hay destinatario devuelve `false` y no envía. El error de transporte se propaga al caller.                           |
| Recordatorio de reautorización TikTok  | `MailService.sendTiktokReauthorizationReminder(...)`                       | Misma política de fallback, con variable específica TikTok; el error de transporte se propaga al caller.                                                                   |

El módulo no tiene controller, rutas HTTP, DTO HTTP, entidad, repositorio ni acceso a TypeORM. `MailService` es su único provider funcional y contrato exportado; `NationalReleaseNotification` es un tipo de aplicación declarado junto al servicio. El módulo importa `SmtpIntegrationModule` y el spec de esa integración caracteriza el wiring.

Consumers directos de Mail encontrados: Access Requests, Editorial/National Releases, Editorial/Festival Playlists y Integrations/TikTok. Los dos últimos usan Mail para recordatorios OAuth programados. Los envíos consumen `SmtpTransportService`, cuyo adaptador usa `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER` y `MAIL_PASS`; `MAIL_TO`, `SPOTIFY_REAUTH_NOTIFICATION_EMAIL` y `TIKTOK_REAUTH_NOTIFICATION_EMAIL` gobiernan destinatarios. Las variables están documentadas en `.env.template`. La auditoría no leyó credenciales ni abrió conexiones externas.

## Revisión técnica

- **Cohesión y DI:** Mail compone cuatro mensajes de aplicación y delega el transporte. `MailModule` importa el módulo que exporta `SmtpTransportService` y exporta solo `MailService`. Los consumidores importan `MailModule`; no registran una segunda instancia en producción. No se detectó ciclo Nest ni dependencia runtime de Mail hacia un feature externo.
- **Contratos:** no hay contrato HTTP propio. Las firmas públicas de MailService, remitentes/destinatarios, asuntos, contenidos y resultados `Promise<void | boolean>` son contratos internos observables por sus consumers. El comportamiento individual frente a bulk de National Releases y las políticas de error descritas arriba deben conservarse durante saneamiento.
- **Validación y errores:** las entradas de solicitud de acceso tienen `IsEmail`, longitudes y campos requeridos. National Releases valida longitudes, enum, fecha y URL antes de llamar Mail. Mail no valida configuración ni escapa HTML. Los errores SMTP se manejan de forma distinta entre mensajes/consumidores; no se propone homogeneizarlos como refactor porque cambia comportamiento.
- **Mocks y fixtures:** `mail.service.spec.ts` prueba los cuatro mensajes, fallback de destinatario y ausencia de envío; además verifica que el aviso de acceso repropaga internamente el error, que National Releases lo absorbe y registra, y el caso de recordatorio Spotify sin destinatario. El mock de `SmtpTransportService` es un `jest.fn()` sin firma tipada y se inyecta mediante `as any`; el spec no construye `TestingModule`. SMTP tiene tests separados de configuración/envío/error y de resolución Nest. Los consumers tienen caracterizaciones adicionales de correo.
- **Cobertura y servicios reales:** no se observó un test de Mail que envíe correo real; los specs simulan `sendMail`. La suite de `TiktokService` y los tests de OAuth también usan dobles locales. No hacen falta PostgreSQL, SMTP, Spotify ni TikTok reales para la cobertura focalizada.

### Hallazgo funcional separado del saneamiento

**Current behavior:** Mail interpola en HTML los valores de solicitud de acceso y de lanzamiento nacional, incluido el enlace opcional, sin escape HTML. Los DTOs de entrada admiten texto suministrado por usuarios; el HTML resultante se envía como email.

**Problem:** contenido marcado por el usuario puede alterar el cuerpo HTML de la notificación y, para el enlace, el atributo `href`. Es un riesgo de inyección en el correo que recibe el equipo.

**Impact:** backend-only.

**Options:** conservar la presentación escapando texto y atributo; refactorizar internamente la composición con un escape contextual probado; cambiar el contenido del email requiere decisión de producto aparte.

**Recommendation:** abrir un cambio funcional pequeño independiente que escape cada contexto y añada pruebas con markup y comillas, preservando el texto visible para entradas normales. No mezclarlo con el traslado del spec ni la sustitución del `any`.

**Blocks the current task:** No; BC-COM documenta el riesgo, pero no cambia comportamiento.

## Quality Gates observados en la auditoría inicial

Se ejecutaron los validadores actuales contra el checkout. Los resultados locales atribuibles a Communications son:

| Gate          | Deuda de Communications                                                                                                                                                                                                                                                         | Estado del gate global                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estructura    | `src/communications/mail/mail.service.spec.ts` está fuera de `__tests__/`. El baseline registra dos hallazgos sobre la misma ruta: `spec-outside-tests` y `module-root-file` (el spec también es un archivo no permitido en la raíz del módulo). Es un único archivo que mover. | 40 módulos; 97 infracciones históricas, 0 nuevas, 0 obsoletas.                                                                                                 |
| Tipado seguro | 1 `explicit-any` en `mail.service.spec.ts:24` (`new MailService({ sendMail } as any)`). 0 dobles aserciones; 0 supresiones.                                                                                                                                                     | 225 infracciones históricas, 0 nuevas, 0 obsoletas, 0 duplicadas.                                                                                              |
| ESLint        | 0 diagnósticos en `src/communications/**`. También se comprobó `src/integrations/smtp-integration/**`: 0 diagnósticos.                                                                                                                                                          | 1.439 diagnósticos globales, 0 nuevos, 0 obsoletos, 0 duplicados. La deuda de SMTP es ownership de Integrations, aunque en esta captura no tiene diagnósticos. |
| Typecheck     | 0 diagnósticos del árbol actual.                                                                                                                                                                                                                                                | `tsconfig.json`: 0 errores, sin baseline de errores.                                                                                                           |

En estructura, `module-root-file` y `spec-outside-tests` son dos reglas aplicadas al mismo spec, no dos archivos ni dos cambios independientes. Los conteos de otros dominios no se atribuyen a Communications: por ejemplo, `src/integrations/tiktok-integration/tiktok.service.spec.ts` tiene deuda de tipado bajo Integrations, y cualquier infracción del adaptador SMTP se asignaría a Integrations.

En la captura inicial de la auditoría, el baseline de tipado seguro v2 contenía exactamente la entrada de Communications descrita arriba. El baseline ESLint no tenía entradas para Communications ni SMTP. No se modificaron baselines ni validadores durante esa auditoría. Tras BC-COM-1/2, Communications tiene cero entradas en los tres baselines.

## Suites y verificaciones focalizadas

La primera ejecución de suites en sandbox alcanzó 19 suites aprobadas y 4 suites HTTP editoriales bloqueadas por `listen EPERM` al abrir sockets locales. Se repitió fuera del sandbox; no se accedió a servicios externos. Resultado final del comando focalizado que cubrió Mail, SMTP y consumers directos: **23 suites y 134 tests aprobados**.

Suites cubiertas: Mail (6 tests), SMTP transport/module, Access Requests, National Releases, autorización Spotify y TikTok. Las solicitudes HTTP de los specs usan el listener local de prueba, y sus servicios/repositories y transportes externos son mocks. No se ejecutaron suites E2E generales, PostgreSQL, SMTP, Spotify ni TikTok reales.

Comprobaciones adicionales: `node scripts/structural-quality-gate.js`, `node scripts/type-safety-quality-gate.js`, `node scripts/eslint-quality-gate.js`, `node scripts/typecheck-quality-gate.js` y ESLint focalizado sobre Mail/SMTP. Todos los gates aceptaron su baseline actual. `git diff --check` y la comprobación de enlaces de este documento se ejecutan al cerrar BC-COM.

## Roadmap de saneamiento

Los cortes se limitan a la única deuda comprobada de Communications. No incluyen SMTP, consumers, cambios de comportamiento, una reorganización de servicios ni trabajo de Community.

1. **[x] BC-COM-1 — Ubicar el spec y tipar su doble (XS; completado 2026-10-21).** **Objetivo y alcance:** mover `mail.service.spec.ts` a `src/communications/mail/__tests__/mail.service.spec.ts` y reemplazar `as any` por un doble local tipado que satisfaga el contrato de `SmtpTransportService.sendMail`. Corregir únicamente imports necesarios por el movimiento. No cambiar producción, casos probados, mensajes ni política de errores. **Resultado:** el spec se construye con `TestingModule` y `jest.MockedFunction<SmtpTransportService['sendMail']>`. Se retiraron las entradas estructurales `module-root-file` y `spec-outside-tests` de la ruta anterior y la entrada de tipado `explicit-any`; ninguna quedó obsoleta ni apareció deuda nueva. **Verificaciones:** suite Mail (1 suite, 6 tests); `yarn quality:structure` (40 módulos, 95 entradas históricas, 0 nuevas/obsoletas); `yarn quality:types` (224 entradas históricas, 0 nuevas/obsoletas/duplicadas); `yarn quality:lint` (1.439 diagnósticos globales, 0 nuevos/obsoletos/duplicados); `yarn quality:typecheck` (0 errores); ESLint focalizado sin diagnósticos; `git diff --check`. No se cambió producción ni se accedió a PostgreSQL o servicios externos.
2. **[x] BC-COM-2 — Verificación final y cierre de Communications (XS; completado 2026-10-21).** **Objetivo y alcance:** verificar BC-COM-1, wiring, consumidores y gates, y cerrar el saneamiento documental. **Dependencias:** BC-COM-1. **Resultado:** Communications tiene cero entradas en los baselines de estructura, tipado seguro y ESLint. `MailModule` sigue exportando `MailService`; importa `SmtpIntegrationModule`, que exporta `SmtpTransportService`. El adaptador Nodemailer permanece bajo Integrations y los consumers de Access Requests, National Releases, Festival Playlists/Spotify y TikTok mantienen sus imports de `MailModule`/`MailService`. No se modificaron contratos ni comportamiento: el cambio ejecutable de BC-COM-1 solo reubicó y tipó el spec; BC-COM-2 no cambió código.

   **Verificaciones:** `yarn verify` completo aprobado, con estructura (40 módulos; 95 infracciones históricas; 0 nuevas/obsoletas), tipado seguro (224 históricas; 0 nuevas/obsoletas/duplicadas), ESLint (1.439 globales; 0 nuevas/obsoletas/duplicadas), typecheck (0 errores), pruebas de gates, build y suites unitarias. Jest: **180 suites aprobadas, 10 omitidas de 190; 1.717 tests aprobados, 52 omitidos de 1.769; 2 snapshots aprobados**. Las omisiones corresponden a guardas de pruebas de integración que requieren PostgreSQL; no se conectó a PostgreSQL. ESLint focalizado Communications: 0 diagnósticos. Prettier focalizado, enlaces relativos y `git diff --check` aprobados. No se accedió a Heroku ni a servicios externos.

   **Riesgo pendiente:** permanece el hallazgo de interpolación de contenido suministrado por usuarios en HTML de correos sin escape. No se corrigió ni se marcó como resuelto. Debe evaluarse antes de desplegar cambios que afecten a esos correos.

No hay corte de corrección ESLint: la captura actual tiene cero diagnósticos atribuibles a Communications. El hallazgo de seguridad de HTML requiere su propio alcance y pruebas de comportamiento y permanece separado del saneamiento cerrado.
