# AGENTS.md

Guía de trabajo para el backend Riff Valley, una API REST con NestJS y TypeORM.

## Entorno y comandos

El repositorio requiere Node `24.x` y pnpm `11.28.7`, fijado en `packageManager`. `.nvmrc` mantiene Node 24 como referencia local. Usa pnpm para instalar dependencias y ejecutar tareas del proyecto.

El mínimo anterior `20.18.1` venía de los engines de Cheerio y Undici; Node 24 satisface ambos requisitos. `sanitize-html` se fija en `2.17.5` porque `2.17.6` requiere Node `>=22.12.0`; la aplicación configura allowlists que no permiten `svg`, `math`, `textarea` ni `xmp`, etiquetas necesarias para los casos vulnerables corregidos en `2.17.6`. Antes de subir esa dependencia, revisa la compatibilidad de engines y esas opciones.

```bash
pnpm run start:dev
pnpm run build
pnpm run test
pnpm run test:unit
pnpm run test:watch
pnpm run test:e2e
pnpm run lint
pnpm run migration:generate src/migrations/NombreMigracion
pnpm run migration:run
pnpm run migration:revert
pnpm run test:quality-structure
pnpm run quality:structure
pnpm run test:quality-lint
pnpm run quality:lint
pnpm run test:quality-build
pnpm run test:quality-tests
pnpm run test:quality-typecheck
pnpm run quality:typecheck
pnpm run test:quality-types
pnpm run quality:types
pnpm run verify
```

`pnpm run lint` ejecuta ESLint con `--fix` y puede modificar archivos. Revisa su alcance antes de ejecutarlo. Para comprobar un archivo sin autocorrección, invoca ESLint con `--no-fix`. `pnpm run quality:typecheck` es el chequeo de tipos independiente: comprueba `tsconfig.json` con `noEmit` e `incremental: false`, equivalente al comando directo `pnpm exec tsc --noEmit --incremental false`. `pnpm run test:quality-typecheck` prueba el control con proyectos TypeScript temporales limpios y fallidos. `pnpm run build` ejecuta `nest build` de forma independiente y sin baseline. `pnpm run test:quality-build` comprueba el BuildAction de Nest CLI con un fixture válido y otro con un error de compilación.

`pnpm run verify` es el control estándar completo y ejecuta, en orden, las pruebas y el validador estructural, las pruebas y el validador de tipado seguro, las pruebas y ESLint de solo lectura, las pruebas y el typecheck, las pruebas del build y `pnpm run build`, las pruebas del propio control Jest y todas las suites unitarias en modo serial. Cada paso se encadena con `&&`: cualquier fallo detiene la secuencia y devuelve un código no cero. Los comandos independientes siguen disponibles para trabajo focalizado. E2E permanece separado y no forma parte de `verify` porque puede requerir PostgreSQL u otros servicios reales.

GitHub Actions ejecuta `pnpm run verify` en `push` y `pull_request`, con Node 24. El workflow conserva estado de fallo y logs visibles. No configura protección de ramas ni checks obligatorios para merge; esa política se gestiona fuera de este repositorio.

## Convenciones Git

Antes de editar, parte de `main` y crea una rama con `git switch -c <tipo>/<descripcion-breve-en-kebab-case>`. Elige el tipo según el cambio: `feat/` para funcionalidad, `fix/` para correcciones, `chore/` para mantenimiento, `docs/` para documentación o `refactor/` para refactors. Ejemplo: `git switch -c feat/catalog-work-cat-art-4b`. No uses prefijos de herramienta o persona como `codex/`.

### Flujo obligatorio de publicación

Antes de publicar cambios, comprueba con `git status -sb` y `git branch --show-current` que todos los cambios previstos están en una rama de trabajo distinta de `main` y `origin/main`. La rama debe partir de `origin/main` actualizado y contener únicamente los cambios previstos para el PR. Si estás en `main` o `origin/main`, crea o cambia a una rama de trabajo antes de continuar; conserva los cambios locales existentes.

Publica la rama de trabajo en `origin` y abre un pull request con destino `main`. Comprueba que el PR incluye la rama y los cambios esperados, revisa el resultado de CI y resuelve cualquier fallo o conflicto. Cuando el PR esté listo y autorizado para integrarse, haz el merge mediante GitHub/`gh pr merge` y confirma que `origin/main` contiene el resultado.

No publiques cambios directamente en `main`: no uses `git push origin main`, `git push origin HEAD:main` ni un push equivalente. No sustituyas el PR y su merge por un push directo, aunque sea fast-forward. Si no se puede crear o completar el PR por permisos, conflictos, checks fallidos u otro bloqueo, conserva la rama y comunica el impedimento; no cambies a un push directo.

### Quality Gate de pruebas

`pnpm run test:unit` ejecuta las suites unitarias de `src/` usando la configuración Jest de `package.json`; `pnpm run test:e2e` ejecuta únicamente los specs `*.e2e-spec.ts` mediante `test/jest-e2e.json`. Ambos comandos propagan el resultado de Jest: cualquier test fallido termina con código distinto de cero. No hay baseline de tests. `pnpm run test:quality-tests` comprueba esa conducta con un fixture Jest aprobado y otro que falla una expectativa. Las reglas y pruebas unitarias son obligatorias para código nuevo y `pnpm run test:unit` forma parte de `pnpm run verify`. E2E queda fuera del control estándar; ejecútalo solo cuando el entorno esté aislado y autorizado. No conectes tests a PostgreSQL ni servicios reales por defecto.

### Quality Gate de ESLint

`pnpm run quality:lint` ejecuta ESLint sobre `src/` y `test/` mediante su API con `fix: false` y `cache: false`, y presenta diagnósticos agrupados por regla y ruta. No uses `pnpm run lint` para comprobar el gate: ese script aplica `--fix` y puede modificar archivos. Las pruebas del control son `pnpm run test:quality-lint`; ambos se ejecutan en `pnpm run verify` y son obligatorios para código nuevo.

El baseline temporal `scripts/eslint-quality-gate.baseline.json` identifica cada diagnóstico mediante regla, ruta relativa, huella de regla/severidad/mensaje normalizado/línea de origen y ordinal de ocurrencia entre firmas idénticas del archivo. La identidad no incluye línea ni columna de ubicación, que se conservan solo para los informes; así, insertar o eliminar líneas ajenas no invalida entradas históricas. El ordinal conserva cada repetición y el comparador rechaza ocurrencias nuevas, entradas obsoletas y claves duplicadas. La versión 2 del baseline conserva los 2.226 hallazgos preexistentes documentados en BC-QG2; no agregues infracciones nuevas. Cuando un diagnóstico se resuelva, elimina su entrada correspondiente. `pnpm run verify` y CI ejecutan este gate sin autocorrección ni regeneración de baseline.

### Quality Gate de typecheck

`pnpm run quality:typecheck` comprueba el proyecto configurado en `tsconfig.json`, sin emitir archivos y sin depender de Nest build ni Jest. El estado inicial comprobado no tiene diagnósticos, así que no hay baseline histórico. Si una captura futura reproduce deuda preexistente, cualquier baseline temporal debe enumerar diagnósticos exactos por código TypeScript, ruta relativa, línea, columna y huella; el gate rechaza diagnósticos nuevos, entradas obsoletas y duplicadas. Las pruebas son `pnpm run test:quality-typecheck`. `pnpm run verify` y CI ejecutan ambos pasos por separado del build y de Jest.

## Estructura NestJS obligatoria

Esta norma se aplica a todos los módulos NestJS, incluidos los anidados, y a cualquier código nuevo o modificado:

- En la raíz de cada módulo solo se permiten archivos propios `*.controller.ts`, `*.module.ts` y `*.service.ts`.
- Todos los specs (`*.spec.ts` y `*.e2e-spec.ts`) van dentro de una carpeta `__tests__/`; no hay excepciones por tipo de test ni por ubicación del código probado.
- DTOs, entidades, interfaces, constantes, helpers y demás auxiliares van en subcarpetas coherentes con su responsabilidad, como `dto/`, `entities/` o carpetas específicas de una responsabilidad.
- No crear capas artificiales, carpetas vacías ni carpetas por endpoint. Esta regla organiza módulos NestJS; no introduce DDD.

### Quality Gate estructural

El validador `scripts/structural-quality-gate.js` descubre módulos NestJS reales —también anidados— en `src/`, `apps/`, `libs/` y `test/`, y comprueba los archivos de sus raíces y la ubicación de los specs. Sus pruebas están en `scripts/structural-quality-gate.test.js`.

Las infracciones preexistentes se permiten solo mediante rutas exactas y regla en `scripts/structural-quality-gate.baseline.json`. El baseline es temporal: no añadas entradas para código nuevo; al corregir una infracción, elimina su entrada correspondiente. El gate falla ante infracciones nuevas, entradas obsoletas o duplicadas. `pnpm run verify` ejecuta sus pruebas y validador; CI lo comprueba en `.github/workflows/backend-quality.yml`.

### Quality Gate de tipado seguro

Todo código TypeScript dentro de `src/`, `apps/`, `libs/` y `test/` debe evitar tipos explícitos `any`, cadenas de aserciones `expresión as unknown as Tipo` y directivas `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` o `eslint-disable` (incluidas sus variantes por línea). El validador AST/scanner es `scripts/type-safety-quality-gate.js`; `pnpm run quality:types` lo ejecuta y `pnpm run test:quality-types` corre sus pruebas. Las pruebas Jest `expect.any(...)` no son infracciones.

El baseline temporal `scripts/type-safety-quality-gate.baseline.json` identifica cada hallazgo mediante regla, ruta relativa, huella del texto infractor y su línea de código normalizada, y ordinal entre firmas idénticas del mismo archivo. La identidad no depende de línea ni columna absolutas; esas posiciones se conservan solo para los informes. El comparador conserva cada repetición y rechaza hallazgos nuevos, entradas obsoletas y claves duplicadas. La versión 2 conserva los 551 hallazgos históricos documentados en BC-QG2. No añadas hallazgos nuevos; elimina cada entrada en el mismo cambio que corrija su infracción. No añadas excepciones para código nuevo. `pnpm run verify` y CI ejecutan las pruebas y el validador. Esta regla es obligatoria para código TypeScript nuevo o modificado.

El inventario documentado en `roadmap/backend-cleanup/README.md` cubre los 40 módulos y enlaza las auditorías de Editorial, completado por BC-ED-0 el 2026-10-20. Las normas transversales y el registro BC-QG2 están en `roadmap/backend-cleanup/quality-gates.md`. El registro histórico partió de 201 infracciones del baseline: 46 en Editorial y 155 en el resto del backend. Editorial ya no tiene infracciones en los tres baselines; el resto del backend reduce su deuda progresivamente y, cuando no queden infracciones, se retirarán los baselines y el validador quedará como regla estricta.

## Responsabilidades y organización

Cada servicio debe tener una responsabilidad funcional coherente. Separa lecturas, escrituras, estadísticas o integraciones cuando el código y sus consumidores justifiquen responsabilidades distintas; no crees una clase por método o endpoint. Conserva una fachada cuando mantenga callers existentes o facilite una migración incremental, delegando la implementación sin duplicarla.

El tamaño es una señal para revisar, no una regla de extracción. Alrededor de 300–400 líneas, comprueba si el servicio mantiene una responsabilidad coherente; servicios menores también pueden mezclar responsabilidades y servicios mayores pueden seguir siendo cohesivos.

Mantén los servicios principales junto a los archivos propios permitidos en la raíz del módulo. Un servicio extraído puede vivir en la raíz de su subcarpeta de responsabilidad. Pon los specs en el `__tests__/` más cercano. Usa `helpers/` para transformaciones puras no triviales y relacionadas; prueba directamente los helpers relevantes o deja clara su cobertura. Usa `loaders/` cuando una responsabilidad acumule consultas independientes que se beneficien de esa organización; no crees repositorios genéricos ni capas de consulta sin un uso concreto. No crees `shared/` de antemano ni como cajón de sastre; mueve código allí cuando exista reutilización real por al menos dos responsabilidades.

Antes de mover u optimizar lógica, añade o identifica pruebas que caractericen el comportamiento afectado: entradas, consultas, payloads, errores, orden, diferencias entre `null`, cero y ausencia, relaciones y efectos secundarios cuando apliquen. Extrae de forma incremental: caracteriza, mueve la implementación en vez de copiarla, actualiza providers e inyección y luego limpia imports y referencias. Mantén las pruebas de cada pieza en su `__tests__/`; las pruebas de fachada deben centrarse en delegación y comportamiento propio, sin duplicar caracterizaciones completas.

## Tipado y pruebas

- Evita `any`, `as any`, dobles casts y otros casts que eludan la comprobación estática. Prefiere tipos concretos, `Pick` para dependencias parciales, mocks de Jest tipados y narrowing explícito de `unknown`.
- No uses `@ts-ignore`, supresiones de ESLint ni desactivaciones de reglas para ocultar errores. Si una limitación real exige una excepción, documenta la causa y mantén el alcance mínimo, sin debilitar contratos ajenos.
- Mantén las expectativas y el comportamiento existentes durante refactors. El typecheck o el build por sí solos no demuestran equivalencia funcional.
- No conectes pruebas con bases de datos o servicios reales salvo que la tarea lo requiera explícitamente y el entorno esté autorizado. Usa dobles locales para pruebas unitarias y contratos HTTP que no necesiten integración externa.

## HTTP, autenticación y configuración verificada

- `src/main.ts` configura el prefijo global `/api` y un `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.
- Protege rutas con `@Auth()` de `src/identity/auth/decorators/auth.decorator.ts`; `@GetUser()` está en `src/identity/auth/decorators/get-user.decorator.ts`.
- `ValidRoles` en `src/identity/auth/interfaces/valid-roles.ts` define `user`, `collaborator`, `riffvalley` y `superadmin`. El módulo de autenticación configura expiración JWT de `8h`.
- El backend no tiene actualmente un módulo de traducciones ni resuelve idioma en sus respuestas. `X-Custom-Lang` permanece permitido en la lista CORS de sesiones; no asumas que activa traducciones.
- `src/app.module.ts` configura TypeORM con `synchronize: false`; los cambios de esquema deben gestionarse mediante migraciones.
- `.env.template` documenta variables de base de datos (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`), `STAGE`, `JWT_SECRET`, `PORT` y credenciales de integraciones. `main.ts` usa el puerto `3000` cuando `PORT` no está definido. Comprueba el template y el código de configuración antes de afirmar que una variable concreta es obligatoria en todos los entornos.
- Entidades representativas verificadas: `Disc`, `Artist`, `User`, `List`, `Content` y `Version`, ubicadas en las carpetas `entities/` de sus módulos. La lista no pretende ser un catálogo exhaustivo del dominio.

## Consultas y rendimiento

Optimiza y mide SQL antes de introducir caché. No añadas índices por intuición: vincula cada candidato a una consulta real y compara el plan con parámetros y datos representativos mediante `EXPLAIN ANALYZE`, considerando también costes de escritura y almacenamiento. Evita reescrituras o microoptimizaciones sin beneficio demostrado; puede concluirse que no hace falta un cambio de producción.

## Contratos, hallazgos y cambios preexistentes

Preserva por defecto los contratos observables al refactorizar. Antes de cambiar un comportamiento HTTP afectado, informa de contratos inusuales o inconsistentes, payloads costosos o legados, relaciones cargadas, semánticas de filtros o dependencias frontend/backend que impidan una mejora razonable. No amplíes el alcance, cambies contratos, crees endpoints alternativos ni adaptes otro repositorio sin una decisión explícita. Un hallazgo menor puede documentarse sin crear trabajo futuro; recomienda una tarea separada cuando la mejora concreta justifique su coste.

Trata las relaciones eager como parte observable de la respuesta hasta comprobar lo contrario. Identifica coste y consumidores, incluyendo los no confirmados; caracteriza el payload y carga explícitamente las relaciones necesarias antes de retirar una carga eager. Si queda un consumidor observable sin confirmar, conserva la relación. Si una alternativa usa IDs, conteos o proyecciones, aclara si requiere cambios frontend.

Al informar un hallazgo de contrato, usa este formato:

### Contract finding

**Current behavior:** descripción breve.

**Problem:** qué resulta inusual, costoso o difícil de mantener.

**Impact:** backend-only / frontend-only / backend + frontend.

**Options:** preservar compatibilidad; refactorizar internamente; cambiar el contrato; coordinar un refactor backend/frontend.

**Recommendation:** opción preferida y motivo.

**Blocks the current task:** Yes / No, con explicación breve.

Conserva todos los cambios locales preexistentes. Reporta los errores o hallazgos anteriores al alcance y no los corrijas como parte de otra tarea. En particular, no corrijas, suprimas ni modifiques `.impeccable/config.json` por hallazgos preexistentes, desconocidos o fuera de alcance. Evita autocorrecciones globales que oculten o reescriban ese estado; limita las comprobaciones y cambios a lo autorizado.
