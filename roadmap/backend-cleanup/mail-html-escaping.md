# COMM-SEC-1 — Escape de contenido dinámico en correos HTML

**Estado:** pendiente; tarea transversal independiente. Identificada durante la auditoría I1-11a y mantenida fuera de I1-11b/I1-11c.

## Hallazgo

`src/communications/mail/mail.service.ts` interpola datos dinámicos en cuerpos HTML sin escaping contextual. En `sendAccessRequestNotification()` se insertan email y alias; `sendNationalReleaseNotification()` incorpora artista, disco, tipo, género, fecha y enlace en texto y atributos `href`; los reminders de Spotify/TikTok usan `displayName` y `subject`. El problema de los correos HTML ya existentes no fue corregido en I1-11b.

## Alcance propuesto

- Inventariar cada valor dinámico y su contexto de salida: nodo de texto, atributo HTML o URL.
- Escapar con una función probada para el contexto correcto; no reutilizar escaping de texto dentro de atributos sin verificar su semántica.
- Validar esquema y destino de URLs antes de construir enlaces (`https:` en producción y allowlist de hosts cuando el dominio esperado sea conocido); escapar el valor serializado como atributo.
- Mantener el contenido estático y los contratos de envío actuales, salvo que haga falta neutralizar una URL no permitida.
- No registrar cuerpos, direcciones, subjects completos ni contenido hostil durante el manejo de errores.

## Criterios de aceptación

- Payloads como `<script>`, comillas, ampersands y atributos de evento se muestran como texto y no alteran el árbol HTML ni crean atributos.
- URLs con esquemas `javascript:`, `data:` o destinos no permitidos no producen enlaces activos.
- Pruebas unitarias cubren cada plantilla y el escaping para texto, atributos y URLs.
- La suite usa un transport mock: no envía correos reales ni cambia credenciales/configuración SMTP.
- Revisar cualquier logging de error de proveedores para excluir cuerpo y datos dinámicos.

## Relación con I1-11

I1-11b no modifica plantillas ni MailService. I1-11c podrá añadir una plantilla nueva para recuperación y debe escapar su URL/token de forma apropiada, pero no se considerará que eso resuelve este inventario transversal. Esta tarea debe planificarse y cerrarse por separado.
