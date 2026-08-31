# OXXEN Connect

Plataforma propia de OXXEN GROUP para crear y administrar tarjetas de presentación inteligentes vinculadas a **NFC + QR**.

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

- `public_id`: permanente e inmutable. Es el identificador físico del QR/NFC.
- `slug`: alias amigable editable.
- `oxxen_connect_card_aliases`: historial permanente de slugs. Un alias histórico nunca se reutiliza para otra tarjeta.

Las tarjetas antiguas que contienen `https://oxxen-connect.vercel.app/p/:identifier` se conservan mediante redirección permanente **308** al dominio canónico. No eliminar el dominio histórico mientras existan tarjetas impresas con esa URL.

## Base de datos principal

- `oxxen_connect_admins`
- `oxxen_connect_cards`
- `oxxen_connect_card_aliases`
- `oxxen_connect_analytics_events`
- `oxxen_connect_audit_logs`
- vista `oxxen_connect_analytics_daily`

El acceso administrativo está protegido por Supabase Auth + RLS. La tabla de administradores dispone de roles preparados para `OWNER`, `ADMIN`, `EDITOR`, `SUPPORT` y `SALES`; el Sprint 2 mantiene el comportamiento actual de autorización para no romper el panel mientras se prepara la separación granular de permisos.

## Analytics

El perfil público registra únicamente eventos permitidos mediante `record_public_event()`; no existe INSERT anónimo directo a la tabla. La función aplica validación, deduplicación de vistas y rate limiting. El hash de visitante usa una sal privada almacenada fuera del schema público y no persiste la IP en texto plano.

La pantalla Clientes usa `get_card_analytics_summary()` para agregar estadísticas en PostgreSQL en lugar de descargar todos los eventos al navegador.

## Storage

El bucket oficial es `oxxen-connect-media` del proyecto Supabase de OXXEN Connect. Los medios nuevos se validan y optimizan en navegador antes de subir:

- foto: máximo aproximado 512 px;
- logo/banner: máximo aproximado 1200 px;
- salida WEBP;
- bucket limitado a JPG/PNG/WEBP y 2 MB por objeto.

Al reemplazar una imagen, primero se sube y vincula la nueva; solo después se elimina el objeto anterior si pertenece al Storage oficial.

## Variables de entorno del frontend

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
VITE_PUBLIC_BASE_URL=https://connect.oxxengroup.com
```

Nunca usar `service_role` en una variable `VITE_*` ni exponerla al navegador.

## Desarrollo

```bash
npm install
npm run dev
```

Comprobaciones disponibles:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

El CI ejecuta lint, typecheck, tests y build en PR/main. El smoke test de producción verifica el perfil público y la compatibilidad del QR histórico.

## Backups y restauración

Antes de una migración de producción se debe crear un snapshot y, para una copia externa, ejecutar desde un entorno seguro:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run backup:export
```

La restauración es dry-run por defecto:

```bash
npm run backup:restore -- backups/<carpeta>
```

Solo después de revisar el backup:

```bash
npm run backup:restore -- backups/<carpeta> --apply
```

La restauración conserva los `id`, `public_id` y aliases originales; nunca genera identificadores físicos nuevos. Ver `docs/BACKUP_RESTORE.md`.

## Migraciones

Los cambios de esquema se guardan en `supabase/migrations/`. No editar migraciones históricas ya aplicadas. Secuencia de producción:

1. snapshot/backup;
2. inspección;
3. aplicar migración;
4. smoke tests de login, dashboard, perfil público, QR histórico y `/api/contact`;
5. revisar Security/Performance Advisors y logs.

## API de contacto

`/api/contact?id={public_id}` genera una vCard desde `get_public_card()`. Valida el identificador, usa la API WHATWG `URL`, limita tiempos de espera y evita exponer errores internos.

## Roadmap posterior al Sprint 2

- permisos granulares por rol;
- MFA/2FA administrativo;
- analytics comercial por rango de fechas;
- retención/rollup físico de analytics;
- plantillas por rubro;
- gestión de fabricación NFC/QR y pedidos;
- leads/CRM e integraciones comerciales.
