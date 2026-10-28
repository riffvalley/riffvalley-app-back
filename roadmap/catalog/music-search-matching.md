# Roadmap de búsqueda y matching musical

**Estado:** MEDIA-1 completada como auditoría documental; MEDIA-2 completada; MEDIA-3a y MEDIA-3b.1–3b.5 completadas el 2026-10-28. MEDIA-3b.6–3b.8 y MEDIA-4–MEDIA-6/MEDIA-8 continúan pendientes. MEDIA-7 descartada por decisión del usuario.

**Alcance:** búsqueda interna de artistas y discos, matching de candidatos Spotify/Bandcamp y revisión segura de enlaces históricos.

**Límite vigente:** MEDIA-3b.4 integra los readers principales de Catalog y MEDIA-3b.5 los filtros de búsqueda de candidatos en Community y National Releases, conservando ownership y contratos. Imports/resolución de identidad, reglas de duplicados, elegibilidad CAT-DISC-4c, sincronizaciones y reparación automática de datos permanecen independientes.

## Objetivo

Mejorar la recuperación de artistas y álbumes ante variaciones Unicode, diacríticos, transliteración, artículos y puntuación; mejorar la precisión al relacionar resultados externos con discos existentes; preservar los nombres originales y los metadatos válidos. Riff Valley cataloga álbumes y EP, no singles.

La normalización facilita la búsqueda, pero no prueba identidad. El matching debe tolerar diferencias pequeñas sin asociar un disco a un artista homónimo, un single, una edición distinta u otro lanzamiento. Encontrar candidatos, elegir uno, guardar un enlace y proponer una corrección de metadatos son decisiones separadas.

## Contexto y referencias existentes

- [Auditoría de medios y elegibilidad CAT-DISC-4c.1a](catalog-discs-media-eligibility-audit.md): flujos actuales de Spotify/Bandcamp, riesgos conocidos al elegir resultados y conservación de portadas. Su alcance es distinto de este roadmap.
- [Documentación de Integrations](../integrations/integrations.md): inventario de ownership y transporte de proveedores. La auditoría MEDIA-1 reconcilió su atribución histórica de Bandcamp a `ContentSchedulerService` con el scraper vigente en Catalog/Discs.
- [Inventario Spotify](../integrations/spotify/inventory.md), [clasificación Spotify](../integrations/spotify/classification.md) y [roadmap Spotify](../integrations/spotify/roadmap.md): distinguen la integración externa de Spotify de las playlists propias de Riff Valley.
- [Arquitectura backend](../backend-architecture.md) y [roadmap general](../../roadmap.md): Catalog es dueño del catálogo y los readers deben conservar el ownership de su dominio.

La auditoría MEDIA-1 y sus evidencias están en [music-search-audit.md](music-search-audit.md). Confirma normalizadores divergentes, ausencia de equivalencias explícitas para varias letras especiales, primer resultado sin verificación completa en Spotify, aceptación del primer resultado Bandcamp con enlace y un índice declarado como GIN que una migración posterior reemplaza por B-tree. El informe no consultó una base local; estado efectivo e impacto de rendimiento quedan pendientes. El nombre original persistido y presentado debe conservarse.

La política aislada de MEDIA-2 está en [music-search-normalization.md](music-search-normalization.md) y se implementa en `src/catalog/shared/music-name/`. Ningún consumidor legacy se cambió; MEDIA-3 debe decidir cómo aplicarla a consultas y claves persistidas.

## Principios y límites

1. Una política compartida de normalización puede servir a Catalog y a los adaptadores de proveedores, pero no debe forzar que todos los dominios dependan de una integración externa.
2. Separar búsqueda interna (consulta sobre catálogo local) de matching de candidatos externos (Spotify/Bandcamp). No asumir que comparten transporte, contrato o ranking.
3. Mantener originales y proteger los metadatos manuales. Un resultado remoto dudoso o sin imagen no debe borrar información válida.
4. No realizar peticiones externas al listar Discs. Resolver identidad de proveedor se ejecuta únicamente en flujos de búsqueda/enriquecimiento.
5. Preservar contratos HTTP, respuestas, errores, ownership y semántica actuales salvo decisión contractual explícita posterior.
6. Medir consultas con cardinalidad y datos representativos antes de introducir trigramas, `unaccent`, índices, columnas derivadas o matching difuso. No agregar extensiones o migraciones como supuesto previo.
7. Instrumentar resultados rechazados/dudosos con datos mínimos y sin credenciales, tokens ni información personal; definir retención y formato durante diseño, no volcar respuestas sensibles.
8. No crear capas de matching genéricas antes de que MEDIA-1 identifique reutilización y límites reales.

## Matriz inicial de regresión

Esta matriz fija resultados mínimos de producto; debe ampliarse con nombres, fixtures y falsos positivos identificados en el proyecto antes de cerrar MEDIA-4/5/6/8. La auditoría MEDIA-1 documentó los huecos iniciales en el informe vinculado arriba.

| Entrada                     | Candidato                       | Comportamiento esperado                                                         |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `Solstafir`                 | `Sólstafir`                     | Encontrar.                                                                      |
| `MOL`                       | `MØL`                           | Encontrar, mediante equivalencia explícita evaluada.                            |
| `Motorhead`                 | `Motörhead`                     | Encontrar.                                                                      |
| `Bjork`                     | `Björk`                         | Encontrar.                                                                      |
| `Secrets of Pandora`        | `The Secrets of Pandora`        | Coincidencia fuerte; artículo inicial opcional.                                 |
| `The Secrets of Pandora`    | Single homónimo                 | Rechazar si el registro buscado es álbum.                                       |
| Álbum con 10 canciones      | EP homónimo                     | Evaluar como candidato; no aceptar solo por similitud de título.                |
| EP de 5 canciones           | Spotify `single` de 5 canciones | No rechazar solo por `album_type`; evaluar artista, título y datos disponibles. |
| Álbum con portada existente | Spotify sin imagen              | Conservar la portada existente.                                                 |

La suite deberá distinguir exactitud normalizada, coincidencia parcial, coincidencia aproximada, homónimos, artista incorrecto, álbum/EP/single, edición deluxe/reedición/remaster, idioma/escritura no latina y ausencia/error del proveedor. No se fijan umbrales numéricos de confianza hasta tener evidencia y revisión de falsos positivos.

## Secuencia y estados

Estados convencionales: **Pendiente**, **En curso**, **Bloqueada** y **Completada**. No declarar una tarea completada por tener solo typecheck/build; usar la evidencia indicada por su alcance. MEDIA-1 es una auditoría documental; MEDIA-2 añade una utilidad aislada con tests, sin cambiar las búsquedas productivas.

### MEDIA-1 — Auditoría integral

- **Tamaño:** M.
- **Estado:** Completada (auditoría documental, 2026-10-28).
- **Objetivo:** inventariar las búsquedas reales, sus consumers, normalización, persistencia, rendimiento y pruebas antes de seleccionar una estrategia.
- **Alcance de auditoría:** endpoints de búsqueda de artistas y discos; SQL/TypeORM interno; autocompletado; creación/edición de discos; búsqueda Spotify; búsqueda Bandcamp; jobs de enriquecimiento; actualización de metadatos; índices/planes actuales documentados; suites y huecos de cobertura.
- **Entregable:** [music-search-audit.md](music-search-audit.md), con rutas/símbolos, flujos y consumers, política de normalización por flujo, decisiones de matching, riesgos, evidencia estática de índices y cobertura/pruebas propuestas. No se inspeccionó una base PostgreSQL ni se midieron planes.
- **Criterios de cierre:** inventario de lectores, consumers, normalización, proveedores, persistencia, procesos, migraciones y pruebas; discrepancia histórica de ownership Bandcamp reconciliada con código; hallazgos con prioridad y evidencia; plan MEDIA-2–8. El impacto real de índices queda pendiente de PostgreSQL local aislado.
- **Fuera de alcance:** corregir búsquedas, cambiar esquema/índices/contratos, editar datos, llamar a proveedores, ejecutar sincronizaciones o reparar enlaces.
- **Dependencias:** ninguna.

### MEDIA-2 — Política de normalización

- **Tamaño:** S.
- **Estado:** Completada (política aislada y probada, 2026-10-28).
- **Objetivo:** definir una política de búsqueda explícita, probada y no destructiva para entradas y claves indexadas.
- **Política definida:** Unicode NFKD; marcas combinantes eliminadas solo después de bases latinas; lowercase; equivalencias explícitas `ø → o`, `æ → ae`, `œ → oe`, `ł → l`, `ð → d`, `þ → th`, `ß → ss`; puntuación separadora y normalización de espacios Unicode. Artículos ingleses iniciales (`the`, `a`, `an`) se exponen como una variante determinista, no se quitan de la clave principal. Las marcas y escrituras no latinas se conservan; no hay transliteración general.
- **Criterios de diseño:** no eliminar palabras significativas ni colapsar caracteres de forma indiscriminada; preservar nombre original; distinguir transformaciones primarias de alias/alternativas; asegurar normalización simétrica de query y datos comparados; no confundir transliteración con nombre canónico.
- **Persistencia/rendimiento:** documentada como pendiente de MEDIA-3. La política solo es TypeScript; no se alteraron `Artist.nameNormalized`, SQL, índices ni datos. La implementación debe mantener la misma función en consulta y clave derivada y medir el plan PostgreSQL antes de elegir almacenamiento.
- **Entregable:** [music-search-normalization.md](music-search-normalization.md); implementación pura en `src/catalog/shared/music-name/normalize-music-name.ts` y tests unitarios en su `__tests__/`.
- **Dependencias:** MEDIA-1.
- **Fuera de alcance:** modificar normalizadores, guardar aliases o renombrar registros.

### MEDIA-3 — Búsqueda interna normalizada

- **Tamaño:** M.
- **Estado:** En curso; MEDIA-3a y MEDIA-3b.1–3b.5 completadas (2026-10-28); MEDIA-3b.6–3b.8 pendientes.
- **Objetivo:** aplicar la política aprobada solo a lectores internos autorizados por MEDIA-1.
- **Criterios:** nombres originales sin cambios; coincidencia normalizada exacta diferenciada de parcial; evitar normalizadores duplicados; resultados y contratos actuales preservados salvo cambio aprobado; no ampliar resultados irrelevantes; latencia y query plan medidos.
- **Evaluar:** `unaccent`, índices funcionales, trigramas, campos normalizados ya existentes u otra solución concreta, según la evidencia de MEDIA-1/2. Cualquier extensión, columna o migración necesita tarea/decisión separada con evaluación `up`/`down` y despliegue.
- **Diseño y avance MEDIA-3b:** [music-search-sql-design.md](music-search-sql-design.md). MEDIA-3b.2 creó las columnas nullable y añadió dual-write; MEDIA-3b.3 aplicó/verificó el backfill en `spammusic-back` con cero claves NULL o discrepantes. MEDIA-3b.4 integró Artist Search/Management/Orphans/exact lookup y Disc Catalog/Calendar. MEDIA-3b.5 adaptó los filtros de candidatos de Community DiscList y la sugerencia revisable de National Releases; la matriz incluye las lecturas que permanecen intactas y los casos diferidos. Fallback legacy solo para claves NULL, sin cambiar nombres, metadatos, decisiones de identidad ni `Artist.nameNormalized`.
- **MEDIA-3b.5:** auditoría y adaptación completadas; Calendar ya estaba cubierto. Requests e Imports de escritura permanecen intactos; comparaciones de duplicados se difieren a MEDIA-3b.6. Sugerencias de National Releases no escriben asociaciones. PostgreSQL 17 aislado, 4 pruebas; 7 suites focalizadas, 63 tests; typecheck, build, ESLint/Prettier focalizados y `git diff --check` aprobados. Los gates arquitectónico y de tipado no detectaron hallazgos nuevos (9 y 5 históricos respectivamente).
- **Siguiente paso:** MEDIA-3b.6, reglas de duplicados; no iniciada aquí.
- **Pruebas:** casos de matriz, Unicode y límites de entrada; consultas de PostgreSQL aislado con datos representativos y `EXPLAIN (ANALYZE, BUFFERS)` antes/después cuando se cambie estrategia SQL.
- **Dependencias:** MEDIA-1 y MEDIA-2.

### MEDIA-4 — Matching de candidatos musicales

- **Tamaño:** M.
- **Estado:** Pendiente.
- **Objetivo:** definir cómo ordenar/aceptar candidatos externos sin mezclar búsqueda, selección y escritura.
- **Criterios candidatos:** artista normalizado, título normalizado, similitud aproximada, tipo de lanzamiento, número de pistas, fecha/año, edición y fuente. Tratar metadatos ausentes como evidencia no disponible, no como desacuerdo automático.
- **Salidas:** candidato con evidencia/explicación y confianza revisable. Definir bandas alta/media/baja basadas en fixtures revisados, con acción para cada banda; no aceptar umbrales arbitrarios ni actualizar títulos manuales automáticamente.
- **Separaciones:** encontrar candidatos; elegir/vincular; persistir URL; proponer corrección editorial. Cada acción debe tener su propio control/autorización.
- **Dependencias:** MEDIA-1 y MEDIA-2; MEDIA-3 puede informar reutilización del matching interno, pero no es requisito si son límites distintos.
- **Pruebas:** positivos y falsos positivos reales del catálogo; artista homónimo, single, deluxe, reedición y falta parcial de metadatos.

### MEDIA-5 — Spotify

- **Tamaño:** M.
- **Estado:** Pendiente.
- **Objetivo:** aplicar la política aprobada a la búsqueda manual y al enriquecimiento automático Spotify por separado.
- **Requisitos:** evaluar varios candidatos cuando la API lo permita; verificar artista y título; usar `album_type`, `total_tracks`, fecha y otros campos disponibles como evidencia; no excluir EP únicamente por clasificación `single`; evitar singles incorrectos; no seleccionar siempre el primer resultado; conservar portada/link válidos frente a respuesta sin imagen o coincidencia dudosa; mantener límites, errores y contratos actuales.
- **Criterios de cierre:** casos de éxito, ambigüedad, falso positivo, no encontrado, timeout/rate limit, portada ausente y preservación manual caracterizados con API mockeada; cero sincronización masiva.
- **Dependencias:** MEDIA-4. MEDIA-2 se requiere si una ruta Spotify usa la política directamente.

### MEDIA-6 — Bandcamp

- **Tamaño:** M.
- **Estado:** Pendiente.
- **Objetivo:** elevar precisión del flujo real Bandcamp sin asumir que ofrece campos equivalentes a Spotify.
- **Requisitos:** validar artista y título con la evidencia disponible; evaluar varios candidatos si la fuente lo permite; tolerar variación pequeña; rechazar artistas/lanzamientos ajenos; distinguir fiable de dudoso; conservar metadatos válidos; manejar HTML vacío, incompleto o con estructura cambiada.
- **Aislamiento:** mantener scraping encapsulado en el owner que identifique MEDIA-1 o un adapter local justificado; no inferir API oficial ni crear módulo de integración solo por usar Cheerio.
- **Criterios de cierre:** fixtures HTML versionados, parser probado sin red, errores de transporte y cambios de estructura controlados; no sincronizar contra Bandcamp en vivo.
- **Dependencias:** MEDIA-4. MEDIA-2 se requiere si la comparación usa la política normalizada.

### MEDIA-7 — Enlaces históricos

- **Tamaño:** S.
- **Estado:** Descartada por decisión del usuario; no iniciar diagnóstico ni reparación histórica bajo este roadmap.
- **Objetivo:** diseñar diagnóstico revisable de enlaces posiblemente incorrectos o datos de portada alterados.
- **Investigar:** álbum enlazado a single; artista ajeno; lanzamiento homónimo; divergencia grande de título; evidencia de portada ausente/sobrescrita; fuente y momento si esos datos están disponibles.
- **Entregable:** procedimiento de solo lectura que produzca candidatos, razones/evidencia y confianza para revisión humana, con límites de consulta y salida apta para revisión. No actualizar `Disc`, llamar a proveedores en lote ni aplicar cambios automáticamente.
- **Dependencias:** MEDIA-1 y MEDIA-4; MEDIA-5/6 aportan las señales específicas cuando estén cerradas.
- **Restricción:** cualquier reparación masiva requiere aprobación explícita y una tarea posterior independiente.

### MEDIA-8 — Regresión integral

- **Tamaño:** M.
- **Estado:** Pendiente.
- **Objetivo:** verificar la combinación de búsqueda interna, normalización, matching y persistencia con los cambios aprobados.
- **Cobertura:** matriz Unicode; coincidencia parcial; álbumes/EP/singles; edición deluxe/reedición/remaster; homónimos y falsos positivos; Spotify/Bandcamp; persistencia; protección de datos manuales; errores externos; contratos; rendimiento e índices.
- **Entorno:** mocks para proveedores, PostgreSQL local aislado para SQL/índices. No acceder a producción. No enviar sincronizaciones o escrituras masivas a proveedores.
- **Criterios de cierre:** regresiones relevantes pasan; planes de consulta y comparación de rendimiento quedan documentados; no hay regresiones contractuales no aprobadas; evidencia y huecos residuales se enlazan desde el informe de auditoría.
- **Dependencias:** MEDIA-2–MEDIA-6 según alcance finalmente aprobado; MEDIA-7 está descartada.

## Dependencias resumidas

```text
MEDIA-1 → MEDIA-2 → MEDIA-3
       └→ MEDIA-4 ─┬→ MEDIA-5 ─┐
                   └→ MEDIA-6 ─┴→ MEDIA-8
```

MEDIA-3 puede avanzar en paralelo con MEDIA-4 una vez aprobada la política, porque búsqueda interna y matching externo son responsabilidades distintas. MEDIA-5 y MEDIA-6 pueden avanzar en paralelo después de MEDIA-4. MEDIA-8 integra las piezas aprobadas. MEDIA-7 fue descartada por decisión del usuario y no forma parte de las dependencias activas.

## Riesgos y decisiones pendientes

- **Colisiones por normalización:** equivalencias amplias mejoran recall y pueden unir nombres distintos. Revisar alias transformados y positivos/negativos antes de aceptar.
- **Singles y EP:** la clasificación de un proveedor puede no coincidir con la regla editorial local. No usar `album_type` como único filtro.
- **Ediciones:** deluxe, reedición y remaster pueden compartir título/artista; la política editorial sobre si enlazar una edición alternativa queda por decidir con casos reales.
- **Calidad del HTML Bandcamp:** scraping sujeto a cambios remotos y datos faltantes; toda coincidencia requiere evidencia proporcionada por el parser.
- **Datos manuales:** no hay que asumir que los valores remotos son más confiables. Falta acordar cómo marcar/identificar una fuente manual si el modelo actual no lo permite; no añadir columnas aquí.
- **Rendimiento:** normalizar en runtime puede impedir uso de índices existentes; `unaccent`/trigramas pueden requerir extensión, índice o migración. Medir antes de elegir.
- **Contratos:** los endpoints externos y DiscList tienen consumers. Cambiar ranking/forma/respuesta requiere revisión contractual, no se incluye automáticamente.
- **Observabilidad:** acordar qué evidencia de candidatos se conserva y por cuánto tiempo, sin registrar secretos ni datos personales.
- **Ownership/documentación desactualizada:** la documentación de Integrations sitúa Bandcamp en un owner histórico diferente; MEDIA-1 confirmó que el scraper activo está en Catalog/Discs y que ContentScheduler crea contenido editorial. No se recomienda movimiento en esta auditoría.
- **Elegibilidad de medios:** CAT-DISC-4c.1 define `hasCover || hasMusicLink` de forma independiente. Matching puede mejorar qué URL se guarda, pero esta iniciativa no cambia el universo de listados ni debe bloquear la elegibilidad.

## Fuera de alcance transversal

- Cambiar o unificar contratos HTTP sin aprobación contractual.
- Modificar nombres originales, títulos manuales o artista asociado de forma automática.
- Reescribir datos históricos, ejecutar reparación por lotes o sincronizar proveedores.
- Hacer peticiones externas desde endpoints de listado.
- Implementar `hasCover || hasMusicLink` o cambiar opciones/totales de DiscList.
- Crear migraciones, extensiones PostgreSQL o dependencias antes de la tarea que las justifique.
- Cambiar frontend o diseño de Discos como consecuencia implícita.

## Registro de esta ejecución

MEDIA-1 se completó como auditoría documental; MEDIA-2 definió e implementó la política; MEDIA-3a y MEDIA-3b.1–3b.5 están completadas. El inventario, adaptaciones, compatibilidad NULL y pruebas están en [music-search-sql-design.md](music-search-sql-design.md). MEDIA-3b.6–3b.8, MEDIA-4–MEDIA-6 y MEDIA-8 siguen pendientes; MEDIA-7 fue descartada por decisión del usuario.
