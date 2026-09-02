# OXXEN Connect — RBAC matrix

S3.4 documenta permisos observados en las políticas RLS de producción. **No cambia permisos ambiguos de SALES/EDITOR/SUPPORT sin una decisión de negocio explícita.** El backend/RLS continúa siendo la autoridad final.

Leyenda: `R` lectura, `W` escritura operativa, `—` sin acceso.

## Matriz efectiva auditada antes de S3.4

| Módulo | OWNER | ADMIN | SALES | EDITOR | SUPPORT |
| --- | --- | --- | --- | --- | --- |
| Customers | R/W + AAL2 | R/W | R/W | R | R |
| Orders / Items | R/W + AAL2 | R/W | R/W | R | R |
| Cards | R/W + AAL2 | R/W | R/W | R/W | R/W |
| NFC inventory | R/W + AAL2 | R/W | R | R | R |
| Audit activity | R + AAL2 | R | R | R | R |
| Public profile | público por RPC | público por RPC | público por RPC | público por RPC | público por RPC |

No hay permisos operativos DELETE/TRUNCATE en estos módulos.

## Ambigüedad detectada

La política actual de Cards permite escritura a todos los registros administrativos, mientras Customers/Orders/NFC ya tienen separación por rol. No existe todavía una definición de negocio inequívoca que responda, por ejemplo:

- ¿SALES puede editar el contenido público de una tarjeta o solo vender/asociar una existente?
- ¿EDITOR debe poder cambiar `customer_id` o únicamente contenido visual/social?
- ¿SUPPORT puede activar/desactivar perfiles o debe ser estrictamente read-only?

Por la regla S3.4 de no inventar permisos, **no se modifica RLS de Cards en este sprint**.

## Matriz propuesta para decisión posterior

Esta propuesta NO está aplicada:

| Módulo | OWNER | ADMIN | SALES | EDITOR | SUPPORT |
| --- | --- | --- | --- | --- | --- |
| Customers | R/W | R/W | R/W | R | R |
| Orders / Items | R/W | R/W | R/W | R | R |
| Cards: contenido | R/W | R/W | R | R/W | R |
| Cards: customer/status | R/W | R/W | R/W limitado | R limitado | R |
| NFC | R/W | R/W | R | R | R |
| Roles / seguridad | R/W | según política | — | — | — |

## S3.5 — Orders/Items write authority

S3.5 **no cambia la matriz de negocio** de Orders/Items. Cambia únicamente el mecanismo técnico de escritura:

- OWNER: invoca RPC de create/update; AAL2 obligatorio.
- ADMIN: invoca RPC de create/update.
- SALES: invoca RPC de create/update.
- EDITOR: lectura; la RPC de escritura lo rechaza.
- SUPPORT: lectura; la RPC de escritura lo rechaza.
- authenticated sin fila admin: rechazado.
- anon: sin acceso a tablas operativas y sin EXECUTE de RPC administrativas.

Los grants directos de INSERT/UPDATE a columnas de `oxxen_connect_orders` y `oxxen_connect_order_items` dejan de formar parte del contrato después de S3.5. RLS sigue siendo defensa en profundidad para lectura y cualquier acceso directo residual.

## Reglas permanentes

1. RLS es la autoridad. Ocultar un botón no equivale a seguridad.
2. OWNER mantiene AAL2/TOTP para datos operativos.
3. La UI debe reflejar los permisos una vez aprobada la matriz final.
4. No se amplían privilegios a `anon` sobre tablas operativas.
5. No se concede `service_role` al frontend.
6. Los cambios futuros de permisos deben ser migraciones aditivas/versionadas y contar con tests de autorización.
