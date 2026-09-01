# S3.4 — PRE-CHANGE audit

Fecha de auditoría: 2026-09-01

Este documento captura el estado observado **antes de modificar producción**. La implementación S3.4 se desarrolla únicamente en `s3-4-operational-closure` y no aplica migraciones a Supabase producción.

## Git / deploy

- `main` HEAD auditado: `08ade7fd1a1ef3f4eda8caf64845f2c8a9d42ccd`.
- Vercel `oxxen-connect`: deployment de producción READY para el mismo SHA.
- Dominio canónico conservado: `https://connect.oxxengroup.com`.
- No se modifica la compatibilidad del dominio histórico `oxxen-connect.vercel.app`.
- Runtime Vercel: sin clusters de error en las 24 horas revisadas.

## Supabase producción

Proyecto: `OXXEN Connect` (`qslmppzkpltfuvsqmxqq`), estado `ACTIVE_HEALTHY`.

Conteos read-only:

| Entidad | Filas |
| --- | ---: |
| cards | 2 |
| customers | 0 |
| orders | 0 |
| order_items | 0 |
| nfc_assets | 0 |
| analytics_events | 246 |
| audit_logs | 1 |
| admins | 1 OWNER |

## Invariantes físicos

Consultas read-only previas al cambio:

- `public_id` faltantes: **0**.
- grupos de `public_id` duplicados: **0**.
- aliases históricos duplicados: **0**.
- cards sin alias actual reservado: **0**.

S3.4 no cambia, regenera ni reasigna los dos `public_id` existentes.

## RLS / MFA

- RLS está habilitado en las tablas operativas principales.
- OWNER conserva la exigencia AAL2/TOTP en las políticas operativas.
- El único administrador actual es OWNER.
- Los logs de Auth revisados muestran verificaciones TOTP correctas; no se copian identificadores personales, emails ni direcciones IP a este documento.

## Advisors

### Security Advisor

Hallazgos abiertos al inicio:

1. `Leaked Password Protection` deshabilitado.
2. RPC `SECURITY DEFINER` ejecutables por `anon` para el flujo público: `get_public_card`, `get_public_card_status`, `record_public_event`.
3. RPC `SECURITY DEFINER` ejecutables por `authenticated` para funciones públicas y operación NFC.

Clasificación y decisión detallada: `docs/SECURITY_DECISIONS_S3_4.md`.

### Performance Advisor

- `auth_rls_initplan` en políticas OWNER/AAL2 de varias tablas.
- índices todavía sin uso en tablas con muy poco o ningún tráfico comercial.
- tablas de snapshots internos sin PK en schemas de backup.

No se debilitará MFA/RLS para silenciar estos warnings. La base operativa actual es demasiado pequeña para justificar eliminar índices por estadísticas de uso insuficientes.

## Backup / restore

El workflow cifrado existente:

- exporta Customers, Orders, Cards, Order Items, NFC, aliases, admins, analytics y audit log;
- valida el paquete ejecutando restore en modo dry-run;
- cifra con AES-256-CBC/PBKDF2;
- conserva tiers diario/semanal/mensual.

`restore-backup.mjs` valida explícitamente duplicados de `public_id`, aliases, IDs/códigos comerciales, UIDs NFC y relaciones antes de permitir `--apply`.

## Riesgos S3.4 identificados

1. `/admin/clientes` mezclaba Customer con Card; se separará la UX.
2. creación de pedido e items ocurría en dos escrituras; se reemplazará por RPC atómica.
3. `order_items.card_id` existía en el modelo pero no estaba bien expuesto en UI.
4. Customers no tenía auditoría equivalente a Card/Order/NFC.
5. no existe proyecto Supabase staging; por tanto, E2E autenticado mutante contra producción queda prohibido y se reemplaza por tests no destructivos/contratos hasta disponer de staging.
6. permisos SALES/EDITOR/SUPPORT contienen decisiones de negocio ambiguas; S3.4 documenta la matriz y no modifica esas políticas silenciosamente.

## Go / No-Go pre-change

**GO para implementar en rama / NO-GO para producción.**

Producción permanece sin migraciones S3.4 hasta merge autorizado, backup cifrado previo, restore dry-run y controles de rollout.
