# Runbook de migraciones

## Crear y revisar

1. Comprueba estado Git, instrucciones locales, package.json, `src/data-source.ts`, `src/app.module.ts`, Procfile, entidades afectadas, migraciones existentes y orden temporal. No sobrescribas archivos de usuario ni edites `.impeccable/config.json`.
2. Decide si necesitas una migración generada o manual. Genera el archivo solo después de verificar que las variables del datasource apuntan a una base local/efímera aislada. Si las entidades no pueden representar bien la operación o el cambio incluye backfill/SQL específico, crea el esqueleto y escribe SQL explícito.
3. Revisa el SQL generado completo. Busca operaciones destructivas, defaults que reescriben tablas, cambios NOT NULL sin backfill, locks largos, índices que bloquean escrituras, cambios de tipo, nombres de constraint, datos duplicados y supuestos de orden. Haz `down` útil cuando sea verdaderamente reversible; explica límites cuando no lo sea. No prometas que `down` recupera datos ya perdidos.
4. Las migraciones publicadas o aplicadas son inmutables. Corrige un error con una nueva migración; no edites el archivo histórico ni manipules el ledger.
5. Revisa `migration:show` y el ledger real para distinguir aplicadas y pendientes. Verifica qué ficheros cargará TypeORM: la configuración actual de desarrollo puede recoger specs bajo `src/migrations/*.ts`. Si el descubrimiento no es inequívoco, detente y reporta el hallazgo en lugar de ejecutar.

## Desarrollo: probar en PostgreSQL aislado

- Antes de cualquier conexión, imprime solo metadatos no secretos suficientes para confirmar host local, puerto y nombre de base. Comprueba también `STAGE`, usuario y si hay variables heredadas. Nunca muestres la contraseña o la URL completa.
- Usa una instancia local desechable o base de pruebas aislada, con una versión mayor de PostgreSQL compatible con la del entorno objetivo. Si Docker/PostgreSQL no está disponible, no instales ni aprovisiones infraestructura sin autorización.
- No permitas que dotenv redirija la prueba a una base persistente: exporta valores de conexión locales explícitos antes de invocar Yarn; el entorno exportado debe prevalecer sobre `.env`.
- Inicializa una base vacía y, cuando haya backfill o constraints sensibles, añade fixtures representativos y agregados que ejerciten los casos límite. Nunca copies datos personales o secretos de producción para esta prueba.
- Ejecuta el flujo completo allí: estado inicial, `migration:show`, aplicación de pendientes, comprobación del esquema/datos/ledger, prueba de `down` si procede, y reaplicación. Revisa también que entidades y código de aplicación funcionen con el esquema resultante.
- Mantén las garantías del repo. Si una tarea propone activar `migrationsRun`, `synchronize`, una fase release o migraciones en startup/Automatic Deploys, rechaza ese diseño y presenta una secuencia manual independiente.

Ejemplo para generar una migración contra PostgreSQL local aislado (ajusta el nombre y puerto a la instancia ya verificada):

    STAGE=dev DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=rv_migrations_test DB_USERNAME=postgres DB_PASSWORD='<password-local>' yarn migration:generate src/migrations/AddArtistSearchIndex

Si solo necesitas un archivo vacío, usa `yarn migration:create src/migrations/<Nombre>`; no conectes a producción para generar una migración.

## Preproducción y consulta del ledger

Preproducción permite consultas y análisis del destino confirmado. No ejecutes migraciones allí salvo autorización explícita para ese entorno. Verifica nombre de app/base, stage, release y variables de conexión sin imprimir secretos. Identifica pendientes desde TypeORM y coteja el ledger real en modo de solo lectura.

En Heroku puede consultarse el estado TypeORM con un one-off dyno que use el artefacto desplegado; sustituye `<app>` por el nombre confirmado. Este comando muestra estado, no ejecuta migraciones:

    heroku run --app <app> "yarn node ./node_modules/typeorm/cli.js migration:show --dataSource dist/data-source.js"

Como comprobación adicional del ledger, usa `heroku pg:psql` con una consulta SELECT dentro de `BEGIN READ ONLY` y `ROLLBACK`, tras confirmar tabla y esquema. No uses `heroku pg:backups:restore`, `migration:run`, `migration:revert` ni SQL de escritura para una revisión de pendientes.

Antes de comunicar “pendiente”, confirma que el artefacto remoto incluye esa migración, que TypeORM la descubre con el patrón compilado y que la tabla consultada es el ledger real. Si el one-off apunta a otra app/base o el ledger y `migration:show` no coinciden, detente.

## Producción: preflight y autorización

Antes de ejecutar cualquier operación de escritura, completa y comunica todos estos datos:

1. **Destino:** confirma app Heroku, base adjunta, stage, host/base enmascarados y que el one-off usaría el mismo destino. No adivines el nombre de la app ni asumas que la conexión de `.env` es producción.
2. **Release:** registra el release activo, commit/artefacto y versión del código. Comprueba si el código actualmente desplegado puede operar con el esquema antes y después de cada migración.
3. **Pendientes:** lista desde `migration:show` y ledger real los nombres y el orden exactos. Compara contra los archivos compilados. Si `yarn migration:run:prod` ejecutaría pendientes adicionales no autorizadas, no lo uses.
4. **Backup:** requiere un backup completado, reciente para la ventana de cambio y recuperable. Verifica que el backup corresponde a esa base y cuándo se tomó. Si la recuperabilidad no está demostrada, bloquea la ejecución; probar una restauración también requiere autorización explícita y debe hacerse en una base aislada.
5. **Riesgo operativo:** evalúa volumen, backfill, locks, duración, transacciones, bloqueos de escrituras y si hace falta mantenimiento. Define señales de éxito y punto de detención.
6. **Compatibilidad y orden:** para cambios incompatibles prepara una secuencia que impida arrancar código viejo contra el nuevo esquema. Prefiere expand/contract y despliegues de código compatibles. Si no se puede, planifica ventana de mantenimiento: detener tráfico, escrituras y dynos que usen el esquema; ejecutar solo la migración autorizada; arrancar el código compatible; validar; reabrir tráfico. No dependas del release phase ni del arranque de Nest.
7. **Autorización:** presenta destino, release, backup, riesgos y lista ordenada exacta. Espera autorización explícita para ejecutar esas migraciones en esa app/base. La autorización de despliegue o una aprobación pasada no la sustituye.

Solo después de esos pasos, y solo para la lista autorizada, puede usarse el runner manual correspondiente al artefacto. El script existente `yarn migration:run:prod` aplica todas las pendientes descubiertas por el datasource compilado; ejecútalo solo si la lista pendiente completa coincide exactamente con la lista autorizada. `yarn migration:roles` queda limitado a su cadena de roles.

Las migraciones nunca deben añadirse a `Procfile`, hooks de release, `start:prod`, `AppModule`, scripts de arranque ni a Automatic Deploys. El despliegue del backend y la migración de PostgreSQL son acciones separadas y coordinadas.

## Verificación posterior y errores

Después de una migración autorizada:

- Reconsulta el ledger y confirma nombre/timestamp de cada migración, orden y ausencia de pendientes inesperadas.
- Comprueba tablas, columnas, tipos, nullability, defaults, constraints e índices afectados contra el diseño.
- Comprueba conteos y agregados definidos en el preflight; valida invariantes y muestra muestras solo anonimizadas. No leas o expongas datos personales innecesarios.
- Confirma la compatibilidad de la versión desplegada y la salud del backend en el orden previsto. Registra checks no ejecutados como pendientes, no como aprobados.

Ante timeout, desconexión, error de SQL o ledger incierto, detente inmediatamente. No reintentes, no ejecutes `down`, no marques migraciones como aplicadas y no restaures backup automáticamente. Conserva el mensaje exacto sin secretos, averigua si la transacción terminó o quedó parcialmente aplicada mediante consultas de solo lectura y prepara opciones de recuperación. Toda restauración o rollback necesita autorización explícita y evaluación de pérdida de datos.
