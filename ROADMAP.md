# Roadmap de migración arquitectónica

## Objetivo

Evolucionar la API hacia una estructura orientada a dominios, con casos de
uso independientes de NestJS y de los proveedores externos. La migración es
incremental: cada iteración debe compilar, pasar sus pruebas relevantes y
mantener las rutas HTTP y el esquema de base de datos actuales.

```text
src/
├── app/
│   ├── router/
│   ├── bootstrap/
│   └── dependencies/
├── modules/
│   ├── identity/
│   ├── catalog/
│   ├── community/
│   ├── releases/
│   ├── editorial/
│   ├── product-ops/
│   └── analytics/
├── integrations/
│   ├── spotify/
│   ├── wordpress/
│   ├── telegram/
│   ├── instagram/
│   ├── lastfm/
│   └── scraping/
└── shared/
    ├── domain/
    │   ├── errors/
    │   └── primitives/
    ├── infrastructure/
    │   └── http/
    └── utils/
```

No se crearán directorios de destino hasta que una iteración necesite un
archivo dentro de ellos.

## Reglas que guían todas las iteraciones

- No hay una migración de esquema solo por mover código. Las entidades y sus
  tablas conservan nombre y migraciones existentes hasta una decisión de
  modelo explícita.
- Un módulo no importa internals de otro módulo. Expone un caso de uso, un
  puerto o una interfaz de lectura pequeña cuando sea necesario.
- `app/dependencies` es el *composition root*: es el único lugar que decide
  qué adaptador satisface cada puerto.
- El dominio y la aplicación no importan `@nestjs/*`, TypeORM, `fetch` ni
  DTOs de proveedores.
- Los DTOs pertenecen a su frontera. No habrá `shared/dto`.
  `DiscApiDto` vive junto al adaptador HTTP de catálogo; `SpotifyAlbumDto` y
  `WordpressPostDto`, junto a sus integraciones. Cada frontera usa mappers.
- Los proveedores se consumen mediante puertos definidos por quien necesita
  la capacidad, no por las clases concretas de `integrations/`.
- Cada PR mueve un flujo vertical pequeño, con pruebas del caso de uso y una
  verificación de regresión de las rutas afectadas.

## Mapa inicial

| Destino | Código actual principal |
| --- | --- |
| `identity` | `auth`, `access-requests`, parte de `users` y roles |
| `catalog` | `discs`, `artists`, `genres`, `countries`, `links` |
| `community` | `rates`, `comments`, `favorites`, `pendings`, `points`, `achievements` |
| `releases` | `national-releases`, `requests`, `suggestions`, `excel` e importación de discos |
| `editorial` | `lists`, `asignations`, `contents`, `articles`, `videos`, `reunions`, `festival-playlists` |
| `product-ops` | `versions`, `news`, `uploads`, `tiktok` y operaciones de producto |
| `analytics` | rankings, actividad y consultas de agregación; inicialmente se extraen desde los módulos que las contienen |
| `integrations` | `wordpress`, `spotify`, `telegram`, `instagram`, `lastfm`, `scaping` y, cuando proceda, mail/R2 |

El mapa es una hipótesis de trabajo, no una orden de renombrado inmediato.
Un caso que cruza dos dominios se mueve por su responsabilidad, no por la
carpeta de la que proceda.

## Iteración 0 — Reglas de arquitectura y red de seguridad

### Objetivo

La arquitectura nueva aún no tiene funcionalidad migrada, pero el repositorio
ya detecta o impide que aumentemos el acoplamiento legacy.

### Acciones

1. Definir y comprobar la dirección de dependencias:

   ```text
   presentation → application → domain
   ```

   `infrastructure` implementa los puertos definidos por `application` o
   `domain`, sin convertirse en dependencia de estas capas.

2. Definir la composición de la aplicación:

   - `app/` contiene bootstrap, router y composición de dependencias.
   - La configuración de autenticación y sesión se realiza desde `app/`.
   - El cliente HTTP común puede vivir en `shared/infrastructure/http`, pero
     su configuración y composición pertenecen a `app/`.
   - Pinia se limita a estado de presentación, cache y coordinación de UI.

3. Activar límites para evitar nueva deuda arquitectónica:

   - No introducir nuevas llamadas HTTP directas desde componentes o vistas.
   - No introducir nueva lógica de negocio en componentes o stores.
   - No introducir nuevos usos de `any`.
   - No crear dependencias entre módulos sin una frontera explícita.

4. Establecer las puertas de calidad obligatorias: `lint`, `typecheck`,
   `test` y `build`. Toda modificación estructural debe superarlas.

5. Añadir tests de caracterización únicamente antes de modificar flujos legacy
   relevantes. No se busca cubrir toda la aplicación antes de migrar, sino
   proteger el comportamiento de cada flujo justo antes de intervenir sobre él.

6. Documentar los criterios de arquitectura:

   - qué constituye un `module`;
   - qué pertenece a `integrations`;
   - qué puede entrar en `shared`;
   - qué responsabilidades corresponden a `domain`, `application`,
     `infrastructure` y `presentation`.

7. No mover código legacy durante esta iteración, salvo los cambios mínimos
   necesarios para configurar tooling, reglas de dependencia y puertas de
   calidad.

### Criterio de salida

- Las reglas de dependencia están documentadas y el repositorio detecta nuevas
  violaciones relevantes.
- No pueden introducirse nuevos `any` sin ser detectados.
- `lint`, `typecheck`, `test` y `build` funcionan de forma reproducible.
- Existe una política clara para `module`, `integration` y `shared`.
- Todavía no se ha realizado ninguna migración funcional significativa.

## Iteración 1 — Crear el composition root real

**Alcance corto:** mover solo el arranque y el ensamblado global.

1. Llevar configuración, TypeORM, i18n, rate limiting y `AppModule` a
   `app/bootstrap/` sin alterar sus opciones.
2. Dejar en `app/router/` los módulos/controladores Nest que registran rutas
   durante la transición.
3. Introducir `app/dependencies/` únicamente al enlazar el primer puerto con
   su adaptador; no crear un contenedor genérico de dependencias por adelantado.
4. Mantener archivos de compatibilidad mínimos para que los imports se muevan
   en PRs separados.

**Salida:** mismo arranque, mismas rutas y misma conexión a PostgreSQL.

## Iteración 2 — Primer vertical de bajo acoplamiento

**Alcance corto:** validar la estructura con `genres` y `countries`, antes de
mover servicios grandes o proveedores externos.

1. Crear `modules/catalog/` solo con los archivos de géneros y países que se
   muevan en este corte.
2. Separar cada flujo en entidad/reglas de dominio, caso de uso, puerto de
   repositorio y adaptadores HTTP/TypeORM.
3. Mantener las rutas `/api/genres` y `/api/countries` y sus respuestas.
4. Hacer que el módulo Nest antiguo delegue temporalmente en los nuevos casos
   de uso si evita un renombrado masivo.
5. Añadir pruebas de caso de uso y de contrato HTTP para ambos recursos.

**Salida:** existe un vertical completo con la dirección de dependencias
correcta, sin modificar tablas ni comportamiento público.

## Iteración 3 — Extraer una integración piloto: WordPress

**Alcance corto:** separar proveedor de negocio usando el flujo editorial que
ya necesita esta frontera.

1. En `modules/editorial`, extraer el caso de uso `PublishArticle` o
   `PublishEditorialPost` desde la lógica actual de listas/publicación.
2. Definir el puerto `PostPublisher` en editorial. Su contrato usa conceptos
   editoriales propios, nunca payloads REST de WordPress.
3. Mover el cliente REST actual a `integrations/wordpress/`, con
   `WordpressPostDto` y un mapper de ida/vuelta.
4. Implementar `WordpressPostPublisher` como adaptador del puerto y enlazarlo
   desde `app/dependencies`.
5. Añadir pruebas unitarias: el caso de uso con un `PostPublisher` falso, y
   el adaptador ante respuestas HTTP correctas y de error.

**Salida:** generar/actualizar posts conserva exactamente las rutas y el
resultado actual, pero editorial ya no importa el cliente concreto de
WordPress.

## Iteración 4 — Repetir el patrón con Spotify

**Alcance corto:** una capacidad concreta, por ejemplo resolver una canción
para un álbum.

1. Definir el puerto que necesita editorial o catálogo (`AlbumTrackFinder`).
2. Mover OAuth, llamadas HTTP, DTOs y mappers a `integrations/spotify/`.
3. Sustituir las dependencias directas del servicio actual por el puerto.
4. Probar el caso de uso con un falso y la integración con respuestas
   grabadas.

**Salida:** no cambia la selección de pistas visible para clientes; Spotify
es intercambiable desde el punto de vista del módulo consumidor.

## Iteración 5 — Consolidar el módulo editorial

**Alcance corto:** un agregado o flujo por PR, en este orden sugerido:

1. asignaciones y edición de textos;
2. listas semanales/mensuales;
3. contenidos, artículos, vídeos y reuniones;
4. calendario editorial y playlists de festivales.

Para cada flujo, crear solo las carpetas necesarias:

```text
modules/editorial/
├── application/        # casos de uso
├── domain/             # entidades/puertos cuando aparezcan
└── infrastructure/     # controlador y persistencia Nest/TypeORM mientras siga siendo necesaria
```

**Salida:** los flujos editoriales conocen puertos, no WordPress, Spotify ni
TypeORM fuera de sus adaptadores de infraestructura.

## Iteración 6 — Catalog e identity

**Alcance corto:** mover un vertical completo por PR, no todas las entidades
de golpe.

- **Catalog:** empezar por lectura/escritura de discos y artistas; después
  géneros, países y enlaces.
- **Identity:** empezar por sesión/JWT y autorización; después solicitudes de
  acceso y administración de usuarios.

La autenticación HTTP puede seguir como adaptador Nest. Las reglas de rol y
los casos de uso no deben depender de guards o decorators.

**Salida:** cada módulo posee sus casos de uso, entidades y repositorios;
las rutas antiguas siguen apuntando a los mismos casos de uso.

## Iteración 7 — Community, releases y product-ops

**Alcance corto:** agrupar por recorrido de usuario.

- **Community:** primero valoraciones y comentarios; después favoritos,
  pendientes, puntos y logros.
- **Releases:** primero peticiones/sugerencias; después lanzamientos
  nacionales e importación Excel/scraping.
- **Product-ops:** versiones, noticias, subida de archivos y automatismos de
  producto.

No forzar `analytics/` aún: se crea cuando exista un primer caso de uso de
lectura transversal con modelo y tests propios.

**Salida:** se eliminan dependencias circulares entre las antiguas carpetas
de funcionalidad a medida que desaparecen.

## Iteración 8 — Integraciones restantes y limpieza

1. Aplicar el patrón puerto/adaptador a Telegram, Instagram, Last.fm y
   scraping, una integración por PR.
2. Extraer `shared/domain` solo para primitivas o errores genuinamente
   transversales, demostrados por al menos dos módulos.
3. Extraer `shared/infrastructure/http` solo para preocupaciones HTTP
   repetidas (p. ej. filtros, paginación o mapeo de errores), nunca DTOs de
   negocio.
4. Eliminar los reexports y puentes de compatibilidad una vez no queden
   consumidores.

**Salida:** no quedan importaciones de rutas antiguas y cada integración se
puede sustituir mediante su puerto.

## Checklist por PR

- [ ] Un único flujo o capacidad claramente definido.
- [ ] Rutas HTTP, contratos públicos y esquema sin cambios no intencionados.
- [ ] DTOs y mappers en la frontera correspondiente.
- [ ] Dependencias dirigidas hacia el dominio; ningún módulo importa el
      adaptador de un proveedor.
- [ ] Pruebas del caso de uso y de la frontera alterada.
- [ ] Compilación y pruebas relevantes verdes.
- [ ] Ninguna carpeta vacía ni abstracción sin segundo uso real.

## Señales para parar y reevaluar

- El PR requiere mover más de un flujo vertical para poder compilar.
- Aparece una abstracción compartida con un único consumidor.
- Cambiar de carpeta obliga a una migración de base de datos.
- Un puerto replica detalles de WordPress, Spotify o TypeORM.
- La migración modifica respuestas públicas sin una decisión de API explícita.

En cualquiera de esos casos, conservar el adaptador de compatibilidad y
reducir el siguiente corte.
