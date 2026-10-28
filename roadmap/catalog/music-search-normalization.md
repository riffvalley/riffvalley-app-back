# MEDIA-2 — Política de normalización de nombres musicales

**Estado:** política implementada de forma aislada y probada el 2026-10-28.

**Alcance:** normalización textual pura y variantes deterministas de nombres de artistas y lanzamientos. No se conecta a búsquedas productivas ni determina identidad.

## 1. Objetivo y límite semántico

La política crea claves comparables y variantes pequeñas para recuperar candidatos. Una coincidencia significa compatibilidad del texto normalizado, no que dos artistas, álbumes o EP sean la misma entidad. La identidad musical requiere señales y evaluación de candidatos en MEDIA-4.

Los valores originales se mantienen intactos: las funciones reciben un `string`, devuelven valores nuevos y no escriben ni dependen de entidades, SQL, TypeORM o proveedores.

## 2. Política elegida

La función principal aplica, en este orden:

1. Unicode NFKD y minúsculas.
2. Eliminación de marcas combinantes asociadas a una letra latina. Las marcas de otros sistemas de escritura se conservan para no borrar distinciones ortográficas ajenas al alfabeto latino.
3. Equivalencias explícitas para letras que no resuelve por sí sola la descomposición Unicode.
4. Eliminación de apóstrofos tipográficos/rectos como unión ortográfica (`O’Connor` → `oconnor`).
5. Conversión de puntuación a separadores; `+` y `&` también separan.
6. Colapso de cualquier espacio Unicode y recorte.

Se eligió **NFKD**, no NFD, para que formas de compatibilidad habituales (por ejemplo, letras latinas fullwidth y números encerrados) tengan una clave legible equivalente. NFKD puede colapsar representaciones tipográficas o de compatibilidad que originalmente eran distintas; por ello la clave es solo una señal de recuperación, no identidad. No se transliteran indiscriminadamente sistemas de escritura completos.

## 3. Equivalencias especiales

La tabla se aplica en minúsculas después de NFKD; por tanto también cubre mayúsculas:

| Carácter | Equivalencia | Ejemplo              |
| -------- | ------------ | -------------------- |
| `ø`      | `o`          | `MØL` → `mol`        |
| `æ`      | `ae`         | `Æther` → `aether`   |
| `œ`      | `oe`         | `cœur` → `coeur`     |
| `ł`      | `l`          | `Łódź` → `lodz`      |
| `ð`      | `d`          | `Ðor` → `dor`        |
| `þ`      | `th`         | `Þór` → `thor`       |
| `ß`      | `ss`         | `Straße` → `strasse` |

Son equivalencias ortográficas explícitas para recuperación. Pueden colisionar con nombres distintos; no se guardan como alias canónicos ni reemplazan los originales.

## 4. Puntuación y espacios

Toda puntuación Unicode (`\p{P}`) se transforma en un espacio: guion corto/largo, punto, coma, paréntesis, dos puntos, barra, exclamación e interrogación no pegan palabras entre sí. `+` y `&` también actúan como separadores. Después se colapsa `\p{White_Space}+`.

Apóstrofos rectos, curvos, modifier-letter y fullwidth se eliminan antes del tratamiento general de puntuación. Así `Guns N' Roses` y `Guns N’ Roses` producen `guns n roses`; `O’Connor` produce `oconnor`. El apóstrofo funciona como unión ortográfica y por eso `O’Connor` no coincide necesariamente con `O Connor` (`oconnor` frente a `o connor`).

No se eliminan símbolos arbitrarios ni se concatenan palabras separadas por puntuación. Diacríticos combinantes de bases no latinas se conservan; transliteración y equivalencias por idioma quedan fuera de esta política.

## 5. Variantes de artículos

`getMusicNameVariants` devuelve la clave primaria y, si el primer token es exactamente uno de `the`, `a`, `an` y queda contenido después, añade una sola variante sin ese artículo:

| Entrada                  | Variantes                                      |
| ------------------------ | ---------------------------------------------- |
| `The Secrets of Pandora` | `the secrets of pandora`, `secrets of pandora` |
| `A Perfect Circle`       | `a perfect circle`, `perfect circle`           |
| `An Example`             | `an example`, `example`                        |
| `Secrets of The Pandora` | `secrets of the pandora`                       |

No se eliminan artículos no iniciales, no hay recursión ni combinaciones. El conjunto inglés se limita a los casos del roadmap; añadir artículos de otros idiomas requiere casos reales y evaluación aparte. La variante amplía recuperación de candidatos, no confirma identidad.

## 6. API implementada

Ubicación: `src/catalog/shared/music-name/normalize-music-name.ts`.

- `normalizeMusicName(value: string): string` devuelve la clave básica.
- `getMusicNameVariants(value: string): string[]` devuelve cero claves para entrada vacía, una primaria o primaria + variante de artículo.
- `compareNormalizedMusicNames(left: string, right: string): boolean` devuelve `true` si se intersectan las variantes deterministas. No calcula similitud difusa ni identidad.

Las operaciones son funciones puras, deterministas, síncronas y sin dependencias externas. Esta carpeta de Catalog permite uso futuro por Artists, Discs e imports sin acoplarlos a Integrations. No se ha conectado ningún consumidor productivo.

## 7. Casos cubiertos y colisiones

| Entrada                  | Almacenado/candidato | Resultado de política                                                    |
| ------------------------ | -------------------- | ------------------------------------------------------------------------ |
| `MOL`                    | `MØL`                | Clave igual: `mol`.                                                      |
| `Solstafir`              | `Sólstafir`          | Clave igual: `solstafir`.                                                |
| `Motorhead`              | `Motörhead`          | Clave igual: `motorhead`.                                                |
| `Bjork`                  | `Björk`              | Clave igual: `bjork`.                                                    |
| `Dodsrit`                | `Dödsrit`            | Clave igual: `dodsrit`.                                                  |
| `The Secrets of Pandora` | `Secrets of Pandora` | Comparación positiva por variante inicial.                               |
| `Post-Metal`             | `Post Metal`         | Clave igual: `post metal`.                                               |
| `A Perfect Circle`       | `Perfect Circle`     | Comparación textual positiva por artículo, no identidad garantizada.     |
| `Banda A`                | `Banda B`            | Comparación negativa.                                                    |
| `The Cure`               | `Cureless`           | Comparación negativa.                                                    |
| `Post Metal`             | `Postmetal`          | Comparación negativa; no se juntan palabras.                             |
| `Maße`                   | `Masse`              | Colisión intencional de `ß → ss`; textual positiva, identidad pendiente. |
| `東京`                   | `tokyo`              | Comparación negativa; no se romaniza japonés.                            |

Los nombres de discos homónimos, artistas homónimos, singles y álbumes de otro artista no pueden resolverse con esta API. Artista, artista asociado, título, tipo de lanzamiento, pistas, año y edición deben evaluarse en MEDIA-4.

## 8. Diferencias respecto a normalizadores legacy

| Comportamiento    | `normalizeForSearch` (Artists)    | `normalizeArtistName` (Disc write) | Nueva política                                   |
| ----------------- | --------------------------------- | ---------------------------------- | ------------------------------------------------ |
| Forma Unicode     | NFD                               | NFD                                | NFKD                                             |
| Marcas eliminadas | `\p{Diacritic}` en toda escritura | rango U+0300–U+036F                | marcas solo tras base latina                     |
| Letras especiales | Sin mapa                          | Sin mapa                           | Mapa explícito `ø/æ/œ/ł/ð/þ/ß`                   |
| `+`               | Se convierte en espacio           | Se conserva                        | Separador                                        |
| `&` y puntuación  | Mayormente conservados            | Mayormente conservados             | Separadores; apóstrofos se eliminan              |
| Espacios          | Colapsa y recorta                 | Solo recorta extremos              | Colapsa y recorta todo espacio Unicode           |
| Artículos         | Sin variantes                     | Sin variantes                      | API separada genera una variante inglesa inicial |

No se alteraron estos helpers ni el cálculo/escritura de `Artist.nameNormalized`. MEDIA-3b.2 añadió `Artist.searchNameNormalized` y `Disc.searchNameNormalized`, calculados con `normalizeMusicName` en las rutas de escritura cubiertas. La migración aditiva aún no se ha aplicado; una vez aplicada, los registros nuevos y modificados por los servicios propietarios persistirán la clave MEDIA-2. Los históricos permanecen en `NULL` hasta MEDIA-3b.3 y los lectores siguen usando su comportamiento legacy.

## 9. PostgreSQL e integración posterior

La política actual solo existe en TypeScript. PostgreSQL `lower`, `unaccent` y NFKD no son intercambiables: las equivalencias explícitas y el tratamiento selectivo de marcas no se reproducen por asumir una función SQL existente. La columna `Artist.nameNormalized` fue poblada históricamente mediante `lower(unaccent(name))`, y MEDIA-1 encontró una migración posterior que reemplaza el índice GIN declarado por B-tree. La auditoría no consultó una base activa.

MEDIA-3b.2 eligió columnas derivadas separadas y el mismo normalizador TypeScript para escrituras; la migración `1792020000000-AddMusicSearchNormalizedKeys.ts` añade ambas como nullable y todavía no se ha aplicado. MEDIA-3b.3 debe reconstruir/verificar claves históricas por lotes antes de cambiar consumidores; la medición de índices sigue pendiente. Las variantes de artículos pueden ser parámetros alternativos, pero multiplican condiciones y deben medirse. No se añadió extensión ni índice.

## 10. Decisiones para MEDIA-3 y MEDIA-4

**Diferido a MEDIA-3:** lectores autorizados, semántica de búsqueda exacta/parcial, cómo exponer variantes, control de `%`/`_`, backfill, índices y planes, paginación y compatibilidad de contratos. MEDIA-3b.1 fijó el contrato de columnas/consultas y MEDIA-3b.2 añadió persistencia dual sin cambiar lectores.

**Diferido a MEDIA-4:** evaluación de artista y álbum como conjunto, similitud aproximada, clasificación álbum/EP/single, señales por proveedor, ediciones/reediciones, confianza, umbrales y acción ante candidato ambiguo. `compareNormalizedMusicNames` no debe sustituir esas decisiones.

## 11. Pruebas

Las pruebas están en `src/catalog/shared/music-name/__tests__/normalize-music-name.spec.ts`. Cubren equivalencias musicales, NFKD/NFC/NFD, mayúsculas, marcas latinas y no latinas, fullwidth/compatibilidad, puntuación, apóstrofos, espacios Unicode, vacío, idempotencia, determinismo, inmutabilidad, artículos, positivos, negativos, colisión `Maße/Masse`, nombres largos y conservación de escrituras no latinas.

**Resultados de verificación (2026-10-28):** 40 pruebas nuevas pasan; junto con las suites legacy `normalize-for-search` y `normalize-artist-name`, pasan 51 tests en 3 suites. Typecheck independiente y build Nest pasan. ESLint focalizado y Prettier focalizado pasan. Los quality gates de estructura, tipado seguro y typecheck pasan: cero hallazgos nuevos; los gates estructural y de tipos informan de sus baselines históricos. `pnpm run`/`pnpm exec` fallaron intermitentemente antes de ejecutar algunos comandos con `ERR_SQLITE_ERROR: unable to open database file`; se usaron Jest, ESLint, Prettier, TypeScript, Nest y scripts de gates ya instalados directamente. El comando agregado `pnpm run verify` no se ejecutó porque el gestor no podía abrir su base SQLite. No hubo llamadas externas ni conexión a PostgreSQL.
