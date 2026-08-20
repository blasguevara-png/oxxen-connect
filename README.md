# OXXEN Connect

Software propio de OXXEN GROUP para comercializar tarjetas de presentación inteligentes con **NFC + QR** sin pagar una licencia por cada cliente.

## Modelo de funcionamiento

1. El administrador crea o edita un perfil desde `/admin`.
2. Cada cliente recibe una URL estable: `/p/slug-del-cliente`.
3. Esa misma URL se graba en el chip NFC y se codifica en el QR.
4. Si cambian teléfono, cargo, foto, redes o empresa, se actualiza el perfil desde el panel.
5. **La tarjeta física no necesita reprogramarse mientras el slug/URL se conserve.**

## Stack

- React + TypeScript + Vite
- Supabase Auth
- Supabase PostgreSQL + Row Level Security (RLS)
- Supabase Storage
- QR generado en navegador
- vCard `.vcf`

## Base de datos

El sistema usa tablas aisladas para no mezclarse con otros proyectos del mismo Supabase:

- `oxxen_connect_admins`
- `oxxen_connect_cards`
- `oxxen_connect_analytics_events`
- Bucket: `oxxen-connect-media`

La migración reproducible está en:

`supabase/migrations/20260820_create_oxxen_connect_mvp.sql`

## Desarrollo local

```bash
npm install
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173`.

## Variables de entorno

Copia `.env.example` como `.env.local` y completa las dos variables públicas del proyecto Supabase:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
```

**No subas `.env.local` a GitHub.** El `.gitignore` ya excluye archivos `.env*` salvo `.env.example`.

## Primer administrador

1. Crea el usuario en Supabase Auth (email + contraseña).
2. Obtén el UUID de ese usuario.
3. Inserta el UUID en `public.oxxen_connect_admins`:

```sql
insert into public.oxxen_connect_admins (user_id)
values ('UUID-DEL-USUARIO');
```

No existe registro público de administradores desde la web.

## Rutas

- `/` — portada pública de OXXEN Connect
- `/admin/login` — acceso privado
- `/admin` — dashboard
- `/admin/clientes` — gestión de tarjetas
- `/admin/clientes/nuevo` — crear tarjeta
- `/admin/clientes/:id` — editar, QR y URL NFC
- `/p/:slug` — tarjeta digital pública

## Producción en Vercel

1. Importa este repositorio en Vercel.
2. Define `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en Environment Variables.
3. Ejecuta el deploy.
4. Conecta un subdominio propio, por ejemplo `connect.oxxengroup.pe`.

`vercel.json` contiene la reescritura SPA necesaria para que funcionen rutas como `/p/carlos` y `/admin/clientes`.

## Seguridad del MVP

- No hay registro público de administradores.
- `/admin` exige sesión válida y pertenecer a `oxxen_connect_admins`.
- Visitantes anónimos solo pueden leer perfiles activos.
- Visitantes solo pueden insertar eventos de analítica permitidos de perfiles activos.
- Solo administradores pueden crear, editar, desactivar o eliminar tarjetas.
- Solo administradores pueden escribir en el bucket de fotos/logos.
- El frontend usa únicamente la clave publishable de Supabase; nunca `service_role`.

## Roadmap

- Analítica por rango de fechas y gráficos.
- Reordenamiento visual de enlaces.
- Plantillas de perfil por rubro.
- Captura de leads.
- Integración con WhatsApp/CRM.
- Planes de mantenimiento y renovación anual.
