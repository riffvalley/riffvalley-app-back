---
name: database-migrations
description: 'Gestiona migraciones PostgreSQL con TypeORM en el backend NestJS de Riff Valley: creación, revisión, preflight, pruebas aisladas, coordinación de Heroku y verificación posterior.'
---

# Migraciones PostgreSQL de Riff Valley

Usa esta skill para trabajar con migraciones TypeORM del backend. Antes de dar comandos, relee la configuración y scripts actuales: los documentos de planificación pueden conservar datos históricos que ya no coinciden con el código.

Lee [project-context.md](references/project-context.md) al iniciar cada tarea para confirmar datasource, scripts, ledger y salvaguardas. Lee [operations-runbook.md](references/operations-runbook.md) para pruebas, consultas de estado, preparación de despliegues, recuperación o cualquier ejecución.

Los comandos manuales del proyecto trabajan con JavaScript compilado: `yarn db:status` consulta pendientes sin crear el ledger, `yarn db:check` falla si hay pendientes y `yarn db:migrate` los aplica. En producción este último exige confirmación del nombre de la base y la lista ordenada exacta. Consulta el runbook para los ejemplos locales y Heroku `spammusic-back`.

## Reglas que nunca se relajan

- Las migraciones son una operación manual e independiente del despliegue de código. Mantén `migrationsRun: false`, `synchronize: false`, un Procfile sin fase `release` de migración y ningún runner implícito al arrancar NestJS. Automatic Deploys no autoriza ni ejecuta migraciones.
- No ejecutes una migración en producción sin autorización explícita para la aplicación, base de datos y conjunto ordenado de migraciones. La autorización general para crear esta skill o desplegar código no cuenta.
- No ejecutes automáticamente migraciones destructivas, restauraciones ni rollbacks. Si una ejecución falla, detente; no la repitas ni reviertas por iniciativa propia.
- Verifica el destino real antes de conectar. No infieras que una conexión es local por el nombre de una variable ni imprimas credenciales.
- Usa Yarn para comandos del proyecto. No uses pnpm. `migration:roles` es un runner de una cadena concreta; no lo uses ni lo presentes como runner general.
- No modifiques `.impeccable/config.json`, no alteres el esquema durante tareas de análisis y no borres ni ocultes hallazgos preexistentes o fuera de alcance.

## Modo de trabajo

Clasifica el destino como desarrollo local/aislado, preproducción o producción y sigue el procedimiento correspondiente del runbook. Para cada migración, revisa el orden, compatibilidad con el código desplegado, impacto en datos y locks, estrategia transaccional, verificaciones y recuperación. Compara entidades y consultas de la aplicación con el esquema real y el ledger; el estado de una migración no se deduce por el código ni por una nota antigua.

Puedes generar y ejecutar migraciones en una base local o efímera después de verificarla y aislarla. En preproducción limita la actuación a consultas, análisis y preparación, salvo autorización explícita para ejecutar allí. En producción exige el preflight completo, backup reciente y recuperable, release identificado, revisión de mantenimiento y autorización inmediata antes de ejecutar.

Si el código desplegado y el esquema no son compatibles, detén la secuencia y prepara un plan coordinado. Prefiere cambios expand/contract compatibles; si no son posibles, especifica cómo detener tráfico, escrituras y dynos antiguos, migrar y arrancar solo código compatible. Nunca dependas de que el arranque de NestJS o el despliegue automático aplique el esquema.

Después de una ejecución autorizada, valida esquema, datos mediante agregados/invariantes y ledger contra el plan; comprueba el estado de la aplicación solo cuando el orden de despliegue lo permita. Informa qué se ejecutó y qué verificaciones pasaron o quedaron pendientes.
