# Configuración real del backend

Reconfirma estos datos en el repositorio cada vez que uses la skill. Se observaron al crearla y pueden cambiar.

## Archivos y salvaguardas

- `src/app.module.ts` crea TypeORM con `synchronize: false` y `migrationsRun: false`. Estas opciones deben permanecer así.
- `src/data-source.ts` también usa `synchronize: false`; omite `migrationsRun`, cuyo valor efectivo predeterminado en TypeORM es `false`. Conserva ese comportamiento; si modificas el datasource, fija explícitamente `migrationsRun: false`. El datasource usa `STAGE=prod` para escoger `dist/**/*.entity.js` y `dist/migrations/*.js`; en desarrollo usa `src/**/*.entity.ts` y `src/migrations/*.ts`.
- `Procfile` contiene únicamente `web: yarn start:prod`; no debe añadirse una fase `release` para migraciones.
- NestJS no debe inicializar un runner de migraciones. Heroku Automatic Deploys despliega código y no debe ser conectado a ningún paso que aplique esquema.
- Hay notas históricas en `roadmap/roles-migration-preflight.md` que mencionan `migrationsRun: true` y un Procfile distinto. Son evidencia histórica, no configuración vigente. Contrasta siempre los archivos ejecutables citados arriba y comunica la discrepancia si afecta la tarea; no la “corrijas” dentro de una tarea de skill/análisis.

## Paquete y comandos existentes

El proyecto declara Yarn Classic 1.22.22 y Node 20.x. Usa Yarn, aunque instrucciones antiguas de `AGENTS.md` muestren comandos npm.

- `yarn migration:create src/migrations/<Nombre>` crea una migración vacía.
- `yarn migration:generate src/migrations/<Nombre>` genera diferencias de entidades contra la base indicada por `src/data-source.ts`; solo debe apuntar a una base aislada y verificada.
- `yarn migration:run` ejecuta todas las pendientes con el datasource TypeScript.
- `yarn migration:run:prod` ejecuta todas las pendientes con el datasource compilado `dist/data-source.js`.
- `yarn migration:revert` revierte la última migración con el datasource TypeScript. No usar automáticamente; en producción requiere autorización específica y un plan de recuperación.
- `yarn migration:roles` ejecuta únicamente la cadena de migración de roles y comprueba condiciones particulares de esa cadena. No es un comando general para futuras migraciones.
- El script general de desarrollo usa el glob `src/migrations/*.ts`, que puede incluir specs colocadas directamente en esa carpeta. Antes de confiar en `migration:show` o `migration:run`, verifica el descubrimiento exacto y detente si aparecen specs, duplicados o clases ajenas. El runner de roles aplica un filtro específico; no generalices ese filtro sin revisar el alcance.

## Conexión y ledger

`src/data-source.ts` toma `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME` y `DB_PASSWORD`; carga `.env` mediante dotenv y activa SSL cuando `STAGE=prod`. Valida que existan las variables requeridas y que host/base correspondan al destino antes de conectar. No asumas que `DATABASE_URL` por sí sola configura ese datasource.

No se configura otro nombre de ledger en el datasource, por lo que TypeORM usa su tabla predeterminada `migrations` (en el esquema efectivo de la conexión, normalmente `public`). Confirma la tabla y su esquema en el destino antes de consultar; nunca crees o reconstruyas el ledger para “arreglar” discrepancias. `migration:show` consulta qué migraciones TypeORM considera aplicadas/pendientes; la consulta de solo lectura al ledger confirma los nombres y timestamps reales. Si ambas fuentes difieren, detente y concilia el estado.

La consulta mínima del ledger, una vez confirmado esquema y tabla, es:

    SELECT id, timestamp, name
    FROM public.migrations
    ORDER BY timestamp, id;

En una consulta SQL directa, envuélvela en `BEGIN READ ONLY` y `ROLLBACK`. No consultes filas de negocio para averiguar el estado del ledger.
