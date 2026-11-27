# MGT-2a — Categorización de Feedback

**Estado:** en revisión

**Rama:** `feat/feedback-improvements`

**Alcance:** contrato y persistencia backend de Suggestions. No inicia MGT-2b.

## Decisiones

- `suggestion.category` es `varchar(20)` nullable. El catálogo se valida en la API y no hay tabla de categorías ni enum de PostgreSQL.
- Catálogo fijo: `albums` — Discos; `artists` — Artistas; `votes` — Votaciones; `statistics` — Estadísticas; `rankings` — Rankings; `events` — Conciertos y festivales; `home` — Inicio; `account` — Perfil y cuenta; `other` — General / Otros.
- Las filas anteriores quedan en `NULL`; la migración no actualiza ni altera los demás campos.
- Durante la transición, `POST /suggestions` acepta que falte `category` para seguir siendo compatible con el frontend desplegado. Los valores presentes deben pertenecer al catálogo.
- Para retirar la excepción, primero se completa y despliega la integración de creación de MGT-2b/MGT-2c. Después, un cambio backend pequeño convierte `category` en obligatorio. No asignar `other` automáticamente.

## Contrato propuesto para MGT-2b

### Crear aportación

`POST /api/suggestions` mantiene autenticación para cualquier rol autenticado.

```json
{
  "title": "Filtro por festival",
  "description": "Añadir un filtro por festival",
  "type": "suggestion",
  "category": "events"
}
```

`category` es temporalmente opcional. Si se incluye, acepta solo los nueve identificadores (no acepta `null`). La respuesta `Suggestion` conserva todos sus campos actuales y añade `category`; será `null` cuando un cliente anterior no la envíe.

### Lecturas

- `GET /api/suggestions?type=bug&status=in_progress&category=events` requiere `superadmin`.
- `GET /api/suggestions/my?category=uncategorized` requiere autenticación y solo devuelve aportaciones de la persona autenticada.
- `category` omitida significa todas las categorías, incluidas las filas `NULL`.
- `category=uncategorized` selecciona explícitamente filas con `category IS NULL`.
- Una categoría del catálogo selecciona esa categoría. Cualquier otro valor produce `400`.
- Las filas de `data` respetan todos los filtros activos. Se conserva `{ data, counts }`.
- `counts` por estado respeta `type` y `category` y omite intencionadamente `status`. En `/suggestions/my` también se limita al usuario autenticado. El resumen del Sidebar no cambia.

Una respuesta de lista conserva el formato existente e incluye la categoría en cada fila:

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "bug",
      "category": "events",
      "status": "in_progress"
    }
  ],
  "counts": { "in_progress": 3, "done": 1, "rejected": 0 }
}
```

Para un registro histórico, `category` aparece como `null`.

### Corrección administrativa

`PATCH /api/suggestions/:id` conserva autorización `superadmin` y admite:

```json
{ "category": "rankings" }
```

Un identificador ajeno al catálogo devuelve `400`. Enviar `null` permite volver a dejar una fila sin categorizar.

## Persistencia y operación

La migración `1792060000000-AddCategoryToSuggestion` añade únicamente una columna nullable `varchar(20)`; su reversión elimina esa columna y, por tanto, los valores de categoría añadidos después. No se ejecutó la migración ni se conectó a bases de datos desplegadas.

El orden seguro es aplicar primero la migración aditiva mediante el proceso manual aprobado y después desplegar el backend; el backend anterior ignora la nueva columna. Desplegar ambos antes del frontend que envía categorías; durante la transición ambas versiones de frontend funcionan. La obligatoriedad final se habilitará solo cuando la integración de creación esté desplegada y comprobada.

## Pendiente para cerrar MGT-2a

- Revisar este contrato y los cambios con el equipo de frontend.
- Confirmar compatibilidad con la versión desplegada antes de aplicar la migración en cada entorno.
- Tras MGT-2b/MGT-2c, registrar y ejecutar en una tarea posterior el cambio de DTO que hace obligatoria la categoría.
- No iniciar MGT-2b como parte de esta tarea.
