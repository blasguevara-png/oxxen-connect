# OXXEN Connect

Plataforma propia de OXXEN GROUP para administrar clientes, pedidos, tarjetas digitales e inventario físico **NFC + QR**.

## Producción

- Dominio canónico: `https://connect.oxxengroup.com`
- Dominio histórico: `https://oxxen-connect.vercel.app`
- Hosting: Vercel
- Frontend: React + TypeScript + Vite
- Base de datos: Supabase PostgreSQL
- Auth: Supabase Auth
- Medios: Supabase Storage (`oxxen-connect-media`)

## Invariante físico QR/NFC

La URL que se imprime/graba físicamente usa un identificador permanente:

```text
https://connect.oxxengroup.com/p/{public_id}
```

- `public_id`: permanente e inmutable; identidad física/digital del QR/NFC.
- `slug`: alias amigable editable.
- `oxxen_connect_card_aliases`: historial permanente de slugs; un alias histórico nunca se reutiliza para otra tarjeta.
- `nfc_assets.uid`: metadato físico del chip, nunca reemplaza `public_id`.

Las tarjetas antiguas con `https://oxxen-connect.vercel.app/p/:identifier` conservan redirección permanente **308** al dominio canónico. No retirar el dominio histórico mientras existan tarjetas impresas con esa URL.

## Modelo operativo

S3.1–S3.4 separan identidad comercial, venta, activo físico e identidad pública:

```text
Customer
  ↓
Order
  ↓
Order Item
  ↓
NFC Asset
  ↓
Digital Card
  ↓
public_id
  ↓
QR / NFC físico
```

Relaciones importantes:

- un Customer puede tener varias Cards y varios Orders;
- `cards.customer_id` es nullable para preservar tarjetas legacy;
- un Order Item puede asociarse a una Card antes o durante producción;
- la relación Card↔Order valida que no se mezclen clientes distintos, salvo Cards legacy sin customer;
- el UID NFC es información operativa, no una URL pública.

## Módulos administrativos

- `/admin/clientes`: Customers comerciales reales.
- `/admin/pedidos`: pedidos, items, estado y pago.
- `/admin/tarjetas`: perfiles digitales, `public_id`, QR y contenido público.
- `/admin/inventario-nfc`: activos NFC, UID, lote, proveedor, costo y lifecycle.
- `/admin/actividad`: audit log.

## Base de datos principal

- `oxxen_connect_admins`
- `oxxen_connect_customers`
- `oxxen_connect_orders`
- `oxxen_connect_order_items`
- `oxxen_connect_cards`
- `oxxen_connect_card_aliases`
- `oxxen_connect_nfc_assets`
- `oxxen_connect_analytics_events`
- `oxxen_connect_audit_logs`
- vista `oxxen_connect_analytics_daily`

## Pedidos atómicos — S3.4

La creación de un pedido nuevo usa `oxxen_connect_create_order_with_items(...)`.

La función valida rol, OWNER/AAL2, customer, items, cantidades, precios y relaciones de Card. La ejecución de la función PostgreSQL es transaccional: si cualquier validación o INSERT falla, no debe persistir un pedido parcial.

## Seguridad y RBAC

El acceso administrativo usa Supabase Auth + RLS.

Roles existentes:

- `OWNER`
- `ADMIN`
- `EDITOR`
- `SUPPORT`
- `SALES`

OWNER requiere TOTP MFA/AAL2 para datos operativos. Los secretos TOTP permanecen dentro de Supabase Auth.

La matriz efectiva y las decisiones pendientes están documentadas en `docs/RBAC_MATRIX.md`. S3.4 no inventa permisos ambiguos para SALES/EDITOR/SUPPORT.

Security Advisor decisions: `docs/SECURITY_DECISIONS_S3_4.md`.

Nunca usar `service_role` en variables `VITE_*` ni exponerla al navegador.

## Analytics

El perfil público registra eventos únicamente mediante `record_public_event()`; no existe INSERT anónimo directo a la tabla de analytics. El dashboard S3.4 agrega únicamente métricas operativas básicas y ventanas 7/30 días; no implementa analítica avanzada.

## Storage

El bucket oficial es `oxxen-connect-media`. Los medios nuevos se validan/optimizan antes de subir:

- foto: aproximadamente 512 px máximo;
- logo/banner: aproximadamente 1200 px máximo;
- salida WEBP;
- bucket limitado a JPG/PNG/WEBP y 2 MB por objeto.

Al reemplazar una imagen se vincula primero la nueva y después se elimina el objeto anterior cuando pertenece al Storage oficial.

## Variables de entorno del frontend

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
VITE_PUBLIC_BASE_URL=https://connect.oxxengroup.com
```

## Desarrollo y verificación

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e:critical
```

`package-lock.json` está versionado y CI/backups usan `npm ci` para instalaciones reproducibles.

CI valida lint, TypeScript, unit/contract tests, build y E2E no destructivos. El E2E autenticado mutante de Customer→Order→Card→NFC debe ejecutarse contra un Supabase staging aislado; nunca contra clientes reales de producción.

## Backups y restauración

Scripts:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run backup:export
npm run backup:restore -- backups/<carpeta>
```

El restore es dry-run por defecto y valida IDs/códigos, `public_id`, aliases, relaciones comerciales y UIDs NFC antes de permitir `--apply`.

`.github/workflows/encrypted-backup.yml` mantiene backups externos cifrados:

- diario: 7 días;
- semanal: 28 días;
- mensual: 90 días;
- manual antes de migraciones.

## Migraciones

No editar migraciones históricas aplicadas. Secuencia de rollout:

1. backup cifrado pre-migración;
2. restore dry-run;
3. aplicar únicamente migraciones nuevas autorizadas;
4. validar FKs/RLS/grants;
5. comprobar `public_id`, slugs y aliases;
6. smoke tests públicos/administrativos;
7. revisar Security/Performance Advisors.

## Entregas

- **S3.1 Customers:** entidad comercial separada y `cards.customer_id` nullable.
- **S3.2 Orders:** pedidos/items, lifecycle, totales derivados y audit log.
- **S3.3 NFC inventory:** activos físicos, UID, reserva y lifecycle.
- **S3.4 Operational Closure:** separación UX Customers/Cards, relaciones visibles, creación atómica de pedidos, Customer audit, dashboard operativo, documentación/RBAC y hardening de QA.

## Roadmap posterior a S3.4

- Supabase staging dedicado para E2E autenticado CRUD/lifecycle.
- decisión y aplicación final de permisos granulares SALES/EDITOR/SUPPORT.
- MFA obligatorio para ADMIN si OXXEN incorpora más personal con ese rol.
- retención/rollup físico de analytics cuando el volumen lo justifique.
- plantillas de tarjeta por rubro.
- leads/CRM e integraciones comerciales **solo después de validar el flujo operativo base**.
