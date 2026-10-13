# Roadmap de Integrations

## Contexto

Las responsabilidades de conexión con proveedores externos deben tener una frontera física clara, sin convertirla en un módulo NestJS común ni mover los dominios que consumen esos proveedores. Este roadmap organiza el trabajo para introducir `src/integrations/` y migrar solo código cuyo ownership principal sea la comunicación con sistemas externos.

El trabajo permanece pendiente hasta completar los criterios de cada tarea. Este documento planifica el trabajo; no realiza el inventario I.1 ni implementa movimientos.

## Objetivo y convenciones

- Crear `src/integrations/` como frontera física únicamente; no crear `IntegrationsModule`, `IntegrationService` ni un registry genérico.
- Nombrar cada carpeta `<provider>-integration`, por ejemplo `spotify-integration`, `wordpress-integration` y `tiktok-integration`.
- Nombrar cada módulo NestJS `<Provider>IntegrationModule`, por ejemplo `SpotifyIntegrationModule`, `WordpressIntegrationModule` y `TiktokIntegrationModule`. Si el proyecto demuestra una convención de casing distinta, registrar la decisión antes de aplicarla.
- Mantener fuera de `integrations/` los dominios y features consumidores, como `festival-playlists/`, `catalog/`, `contents/` y `lists/`.
- No anticipar proveedores futuros con abstracciones multi-provider. Last.fm y LanguageTool solo se incorporarán si existe código concreto que cumpla el criterio de ownership.
- Preservar rutas, payloads, comportamiento y efectos externos durante migraciones internas. Registrar antes cualquier hallazgo contractual relevante, siguiendo `AGENTS.md`.
- Reportar hallazgos preexistentes, desconocidos o fuera de alcance; no corregirlos ni suprimirlos ni modificar `.impeccable/config.json` para satisfacer un hook.

## Criterio de ownership

Una pieza pertenece a `src/integrations/<provider>-integration/` si su responsabilidad principal es comunicarse con un sistema externo. Incluye API clients, OAuth y gestión de tokens del proveedor, adapters específicos, manejo de webhooks del proveedor y DTOs/tipos estrictamente externos.

No incluye reglas de negocio, orquestación de features, Catalog, Contents, Festival Playlists, Lists, lógica editorial ni lógica de publicación que consume una integración. Una llamada pequeña, exclusiva de una feature y sin complejidad independiente puede permanecer en esa feature.

## Tareas

### I.1a — Inventario de integraciones con módulos propios

- **Estado:** Pendiente.
- **Objetivo:** localizar y caracterizar Spotify, WordPress y TikTok para preparar decisiones de ownership y migración.
- **Alcance:** por proveedor, documentar ubicación, módulos, services, controllers, entities, OAuth/auth, DTOs, configuración, consumers y tests; indicar si es una integración o una llamada puntual de una feature. No mover código.
- **Dependencias:** ninguna.
- **Criterio de DONE:** cada categoría aplicable tiene ubicaciones y símbolos identificados, consumers comprobados y una clasificación inicial; no se modifica producción.
- **Verificaciones:** búsquedas de referencias en el backend, revisión de módulos/DI, configuración sin leer ni copiar secretos, tests y consumers; `git diff --check`.
- **Tamaño estimado:** S.

### I.1b — Inventario de APIs y proveedores restantes

- **Estado:** Pendiente.
- **Objetivo:** localizar setlist.fm, Bandcamp y cualquier otra API o proveedor externo existente en el backend.
- **Alcance:** documentar las mismas categorías aplicables que en I.1a —ubicación, módulos, services, controllers, entities, auth, DTOs, configuración, consumers y tests— y distinguir integración propia de llamada puntual. No mover código ni tratar proveedores hipotéticos como existentes.
- **Dependencias:** ninguna.
- **Criterio de DONE:** se revisaron las llamadas externas del repositorio y cada proveedor encontrado tiene evidencia y clasificación inicial; producción permanece sin cambios.
- **Verificaciones:** búsquedas de llamadas HTTP/SDK y configuración externa, seguimiento de imports y consumers, revisión de tests; `git diff --check`.
- **Tamaño estimado:** S.

### I.2 — Definir el criterio de ownership

- **Estado:** Pendiente.
- **Objetivo:** aplicar y documentar el límite entre código de integración y reglas de dominio/feature.
- **Alcance:** usar el criterio de ownership de este documento sobre los hallazgos I.1a e I.1b; precisar qué piezas pertenecen al proveedor y cuáles permanecen con sus consumers. Confirmar las convenciones de carpeta y módulo, incluido el casing.
- **Dependencias:** I.1a e I.1b.
- **Criterio de DONE:** las piezas candidatas y sus consumers tienen ownership explícito; cualquier ambigüedad incluye opciones y decisión antes de mover código; no se hacen cambios de producción.
- **Verificaciones:** contrastar clasificaciones con dependencias, imports, comportamiento y consumers observados; `git diff --check`.
- **Tamaño estimado:** XS.

### I.3 — Mover Spotify Integration

- **Estado:** Pendiente.
- **Objetivo:** alojar la integración Spotify existente bajo la nueva frontera física.
- **Alcance:** mover `src/spotify-integration/` a `src/integrations/spotify-integration/`, conservando `SpotifyIntegrationModule`, su API pública, Client Credentials, OAuth, Account API, controllers, DTOs, tests y configuración específica. Actualizar imports, `AppModule`, consumers y tests.
- **Dependencias:** I.1a e I.2; resolver antes cualquier ambigüedad de ownership que afecte el movimiento.
- **Criterio de DONE:** el módulo y la API pública se consumen desde la ubicación nueva; no quedan referencias obsoletas; rutas, payloads, comportamiento y efectos externos se preservan.
- **Verificaciones:** suites focalizadas de API/OAuth/controllers y consumers, DI, typecheck y `git diff --check`.
- **Tamaño estimado:** S.

### I.4 — Migrar WordPress a integración

- **Estado:** Pendiente.
- **Objetivo:** trasladar a la frontera de integraciones el código cuyo ownership principal sea conectar con WordPress.
- **Alcance:** confirmar la clasificación de `src/wordpress/`; si corresponde, mover el módulo y su código de proveedor a `src/integrations/wordpress-integration/`, renombrar `WordpressModule` a `WordpressIntegrationModule` y ajustar nombres de services solo cuando sean ambiguos. Conservar publicación, API, consumers como Lists, configuración y tests. No mover lógica de Lists o Editorial.
- **Dependencias:** I.1a e I.2.
- **Criterio de DONE:** el módulo integra WordPress desde la nueva ubicación y sus consumers siguen funcionando con contratos y comportamiento preservados; las responsabilidades de negocio permanecen con sus dominios.
- **Verificaciones:** tests de cliente y publicación/consumers, DI, rutas aplicables, typecheck y `git diff --check`.
- **Tamaño estimado:** M.

### I.5 — Migrar TikTok a integración

- **Estado:** Pendiente.
- **Objetivo:** alojar la conexión OAuth/API de TikTok en la frontera de integraciones.
- **Alcance:** confirmar que el módulo actual representa OAuth/API externa; si se confirma, moverlo a `src/integrations/tiktok-integration/` y normalizar a `TiktokIntegrationModule` o al casing establecido por el proyecto. Mantener OAuth, callback, tokens, API, configuración y contratos. No implementar el consumer frontend pendiente de `?tiktok=...`.
- **Dependencias:** I.1a e I.2.
- **Criterio de DONE:** el módulo de proveedor se resuelve desde la nueva ubicación; OAuth, callback y contratos existentes se conservan; el consumer frontend continúa fuera de este trabajo.
- **Verificaciones:** tests focalizados de OAuth/callback/API, DI, typecheck y `git diff --check`; registrar sin corregir hallazgos Impeccable preexistentes o fuera de alcance.
- **Tamaño estimado:** S.

### I.6a — Clasificar integraciones puntuales

- **Estado:** Pendiente.
- **Objetivo:** decidir qué llamadas externas, como setlist.fm y Bandcamp, justifican ownership en un módulo propio.
- **Alcance:** evaluar número de operaciones, reutilización, autenticación/configuración propia, adaptación de respuestas, cantidad de consumers y complejidad independiente. Documentar por proveedor si permanece en una feature o amerita módulo `<provider>-integration`; no extraer automáticamente una llamada pequeña exclusiva. Esta tarea decide y documenta; no mueve código.
- **Dependencias:** I.1b e I.2.
- **Criterio de DONE:** cada proveedor puntual encontrado tiene decisión motivada y, si aplica, una frontera y módulo objetivo; no se crean abstracciones multi-provider.
- **Verificaciones:** comprobar usos y dependencias reales del código; revisar que las decisiones distingan API client de orquestación de feature; `git diff --check`.
- **Tamaño estimado:** XS.

### I.6b — Migrar integraciones puntuales aprobadas

- **Estado:** Pendiente.
- **Objetivo:** implementar únicamente las extracciones de proveedores puntuales aprobadas explícitamente en I.6a.
- **Alcance:** para cada proveedor que I.6a haya decidido convertir en integración propia, crear `src/integrations/<provider>-integration/`; crear o mover el módulo `<Provider>IntegrationModule` si realmente corresponde; mover únicamente API clients, auth/config, adapters, DTOs/tipos estrictamente externos y tests pertenecientes al proveedor; actualizar imports, DI y consumers; conservar en la feature consumidora la orquestación y las reglas de negocio. No extraer proveedores que I.6a haya decidido mantener como llamada puntual. No crear abstracciones multi-provider.
- **Dependencias:** I.6a.
- **Criterio de DONE:** todas las extracciones aprobadas en I.6a están implementadas y consumidas desde `src/integrations/`; las llamadas que debían permanecer dentro de sus features siguen allí; rutas, contratos y comportamiento se preservan. Si I.6a determina que ningún proveedor puntual merece integración propia, marcar I.6b N/A con evidencia, sin crear código ni carpetas.
- **Verificaciones:** tests focalizados de las integraciones/consumers afectados, DI, typecheck, búsqueda de imports/rutas antiguas y `git diff --check`.
- **Tamaño estimado:** S.

### I.7 — Normalizar configuración e imports

- **Estado:** Pendiente.
- **Objetivo:** dejar consistentes los imports, módulos y configuración de las integraciones después de los movimientos aprobados.
- **Alcance:** revisar imports absolutos/relativos, exports, módulos NestJS, variables de entorno, tests y documentación. Mantener la configuración específica en cada integración; no crear un mega módulo central de configuración externa.
- **Dependencias:** I.3, I.4, I.5 e I.6b.
- **Criterio de DONE:** referencias, exports, configuración y documentación apuntan a las ubicaciones y módulos vigentes; no quedan imports obsoletos introducidos por las migraciones.
- **Verificaciones:** búsquedas de rutas/nombres antiguos, revisión DI y módulos consumidores, typecheck, tests afectados y `git diff --check`.
- **Tamaño estimado:** S.

### I.8 — Verificar la dirección de dependencias

- **Estado:** Pendiente.
- **Objetivo:** comprobar que el nuevo límite conserva una dirección de dependencias coherente.
- **Alcance:** revisar que dominios/features dependan de `integrations/*`, y que las integraciones dependan de sus APIs externas, no de reglas de dominio o features. Buscar ciclos y ownership invertido en módulos e imports. No introducir abstracciones multi-provider.
- **Dependencias:** I.3, I.4, I.5, I.6b e I.7.
- **Criterio de DONE:** no hay ciclos ni dependencias de integración hacia reglas de dominio/feature sin una decisión explícita y documentada; cada excepción observada queda clasificada y resuelta o reportada.
- **Verificaciones:** inspección del grafo de módulos e imports y búsqueda de ciclos/referencias inversas; typecheck y `git diff --check`.
- **Tamaño estimado:** S.

### I.9 — Regresión final

- **Estado:** Pendiente.
- **Objetivo:** verificar conjuntamente las integraciones migradas y cerrar el trabajo con evidencia.
- **Alcance:** revisar DI, rutas, contratos, OAuth, API clients y consumers; ejecutar typecheck, suites focalizadas y suite completa proporcional. No cambiar comportamiento.
- **Dependencias:** I.7 e I.8.
- **Criterio de DONE:** las verificaciones aplicables pasan o los fallos preexistentes quedan atribuidos y reportados; rutas, contratos y comportamiento observable se conservan; el estado final y cualquier limitación quedan documentados.
- **Verificaciones:** regresión de suites pertinentes, typecheck, revisión de rutas/DI/consumers y `git diff --check`; reportar hallazgos Impeccable preexistentes, fuera de alcance o de atribución desconocida sin corregirlos ni suprimirlos ni modificar `.impeccable/config.json`.
- **Tamaño estimado:** S.

## Resumen de planificación

- **Número de tareas:** 11 (I.1 se divide en I.1a e I.1b por la frontera natural entre módulos de proveedor e integraciones puntuales; I.6 se divide en decisión y migración).
- **Tamaños estimados:** 2 XS, 8 S y 1 M.
- **Dependencias principales:** I.1a e I.1b alimentan I.2; I.2 habilita I.3, I.4, I.5 e I.6a; I.6a decide si I.6b ejecuta extracciones o queda N/A con evidencia; I.3, I.4, I.5 e I.6b preceden a I.7; I.8 verifica las migraciones y la dirección de dependencias; I.9 cierra la regresión. Secuencia: `I.1a + I.1b → I.2 → I.3/I.4/I.5 + I.6a → I.6b → I.7 → I.8 → I.9`.
- **Estado:** I.1a e I.1b siguen pendientes. No se ejecutó el inventario en esta planificación.
