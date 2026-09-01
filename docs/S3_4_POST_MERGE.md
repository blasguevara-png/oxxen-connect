# OXXEN Connect — S3.4 POST-MERGE / PRODUCTION ROLLOUT

Fecha: 2026-09-01

## Resultado

S3.4 Operational Closure fue autorizado, mergeado y migrado a producción con los invariantes físicos/digitales preservados.

- PR de rollout: #19
- merge commit: `deb2902cf3d421eb24f14f3de96d43cda4b6bd8b`
- Vercel producción: READY
- CI post-merge: verify + critical E2E + production-smoke = success
- Supabase migration: `sprint3_4_operational_closure` = success

## Backup / recuperación

Se verificó un backup cifrado programado del 2026-09-01, posterior a S3.3 y previo a S3.4:

- workflow run: `33474086897`
- export operational backup: success
- restore package dry-run: success
- encrypted archive: success
- daily artifact: `9787535183`
- monthly artifact: `9787535438`
- ambos artefactos compartían digest SHA-256 `9b0eb60b67d11c299efc20c944b3ef45d281485114fccdde1d3f12d8445066ad`

## Identidad QR/NFC

Snapshot antes y después de la migración: idéntico.

- Cards existentes: 2
- `public_id` faltantes: 0
- grupos de `public_id` duplicados: 0
- grupos de alias duplicados: 0
- Cards sin alias actual reservado: 0
- relaciones Order/Card cruzando Customers: 0

No se regeneraron QR, no se cambiaron destinos NFC y no se retiró el redirect legacy.

## Integridad de S3.4

Verificado en PostgreSQL después de la migración:

- 6 funciones S3.4 presentes;
- 4 triggers de S3.4 presentes y activos;
- RLS habilitado en Customers, Orders, Order Items, Cards, NFC Assets, aliases, analytics y audit logs;
- `anon` sin grants directos sobre tablas operativas;
- 7 foreign keys operativas presentes;
- los RPC públicos siguen resolviendo alias y `public_id` de las Cards existentes.

## Atomicidad de pedidos

El primer probe versionado intentaba crear un OWNER sintético que no existía en `auth.users`, por lo que la FK de `oxxen_connect_admins.user_id` bloqueó el fixture antes de ejecutar la prueba de atomicidad.

Se repitió el probe de forma segura reutilizando únicamente la identidad de un OWNER existente en claims locales de la transacción, sin modificar Auth. Resultado:

- item inválido rechazado;
- 0 Orders parciales sobrevivieron;
- 0 Order Items parciales sobrevivieron;
- `ROLLBACK` eliminó todo dato sintético;
- 0 Customers sintéticos persistieron.

El archivo `supabase/tests/s3_4_atomic_order.sql` se corrigió para reproducir esta estrategia sin depender de un usuario Auth ficticio.

## MFA / RBAC

Contrato verificado mediante transacción local:

- OWNER con AAL1: bloqueado;
- OWNER con AAL2: admitido;
- usuario autenticado sin rol administrativo: bloqueado.

S3.4 no modificó silenciosamente la matriz ambigua SALES/EDITOR/SUPPORT. La decisión continúa documentada en `docs/RBAC_MATRIX.md`.

## Security Advisor

Warnings existentes/aceptados por diseño:

- RPC públicos `get_public_card`, `get_public_card_status` y `record_public_event` como SECURITY DEFINER;
- RPC NFC autenticados;
- nuevos RPC S3.4 `oxxen_connect_create_order_with_items` y `oxxen_connect_get_operational_dashboard` como SECURITY DEFINER para `authenticated`, con validación interna de rol y AAL2 para OWNER.

Los nuevos RPC S3.4 no son ejecutables por `anon`.

Pendiente manual:

- Supabase Auth Leaked Password Protection sigue deshabilitado. Debe habilitarse desde la configuración de Auth cuando el propietario lo decida/disponga.

## Performance Advisor

No se detectó una regresión material propia de S3.4. Permanecen warnings previos de `auth_rls_initplan`, tablas históricas de backup sin PK e índices todavía no utilizados por el bajo volumen actual.

## Smoke post-migración

- `https://connect.oxxengroup.com/p/b`: HTTP 200
- `https://oxxen-connect.vercel.app/p/b`: HTTP 308 hacia dominio canónico
- `/admin/login`: HTTP 200
- `/api/contact` sin identificador: HTTP 400 esperado
- runtime 5xx recientes en Vercel: 0 observados

## Estado final

S3.4 está desplegado en producción y la base operativa continúa sin Customers/Orders/NFC reales al cierre del rollout. Los 2 perfiles legacy existentes conservaron identidad y resolución pública.

La única acción de seguridad pendiente fuera de este rollout es habilitar Leaked Password Protection en Supabase Auth. El E2E autenticado completo con CRUD/lifecycle debe ejecutarse en un staging aislado cuando exista; no se usó producción para crear clientes/pedidos reales de prueba.
