# S3.4/S3.5 — Security decisions

Security Advisor is reviewed against production before changes. A warning is not automatically a vulnerability; every finding is classified before changing grants or RLS.

## Security Advisor decisions

| Finding | Decision | Rationale / action |
| --- | --- | --- |
| `auth_leaked_password_protection` disabled | **ACCEPTED — PLAN LIMITATION (SUPABASE FREE)** | The owner explicitly chose to remain on Supabase Free. The Dashboard confirms leaked-password protection is available only on Pro and above. Do not upgrade or create a workaround merely to clear this warning. Keep the existing password/MFA controls and reassess if the plan changes. |
| `anon` can execute `get_public_card` | **ACCEPTED BY DESIGN** | Public QR/NFC profiles require anonymous resolution. Function is `SECURITY DEFINER`, has locked `search_path`, and returns a deliberately limited public projection. |
| `anon` can execute `get_public_card_status` | **ACCEPTED BY DESIGN** | Needed to distinguish missing/inactive/archived public profiles without direct table access. |
| `anon` can execute `record_public_event` | **ACCEPTED BY DESIGN** | Public analytics enters through a validating/deduplicating/rate-limited RPC; anonymous direct INSERT to analytics tables remains revoked. |
| `authenticated` can execute the public RPCs | **ACCEPTED BY DESIGN** | Authenticated administrators may also open public-card functionality. This does not grant table bypass beyond the RPC contract. |
| `authenticated` can execute `oxxen_connect_bulk_create_nfc_assets` | **ACCEPTED BY DESIGN** | RPC checks administrative role and OWNER AAL2 server-side. Direct UI visibility is not the authorization boundary. |
| `authenticated` can execute `oxxen_connect_reserve_nfc_assets` | **ACCEPTED BY DESIGN** | Atomic reservation requires a server-side function; role/MFA validation remains inside the function. |
| `authenticated` can execute `oxxen_connect_create_order_with_items` | **ACCEPTED BY DESIGN** | Creation is atomic; function is granted only to `authenticated`, locks `search_path`, validates OWNER/ADMIN/SALES and OWNER AAL2, Customer, items, prices and Card/Customer consistency. |
| `authenticated` can execute `oxxen_connect_get_operational_dashboard` | **ACCEPTED BY DESIGN** | Granted only to `authenticated`; validates admin membership and OWNER AAL2 and returns operational counts only. |
| S3.5 `oxxen_connect_update_order_with_items` is SECURITY DEFINER | **ACCEPTED BY DESIGN** | Transactional edit requires server-side authority after direct Order/Item browser write grants are revoked. RPC is closed to `PUBLIC`/`anon`, validates OWNER/ADMIN/SALES, OWNER AAL2, item ownership, Card/Customer consistency, status/payment enums and optimistic concurrency. |

## Supabase Free — leaked password warning

Current permanent classification while the project remains on Free:

**ACCEPTED — PLAN LIMITATION (SUPABASE FREE)**

Do not mark it as fixed. Do not pay, upgrade or add custom password-breach infrastructure solely to remove the Advisor warning.

Current compensating controls include the configured minimum password requirements, secure password/email change settings, Supabase Auth, and OWNER TOTP/AAL2 for operational data.

Advisor remediation reference for a future plan change:
`https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection`

## Privileged function grant posture

### Order creation/update

`oxxen_connect_create_order_with_items` and S3.5 `oxxen_connect_update_order_with_items`:

- `PUBLIC`: revoked.
- `anon`: revoked.
- `authenticated`: execute.
- internal authorization: OWNER/ADMIN/SALES only.
- OWNER: JWT AAL2 required.
- `search_path`: empty/locked.
- exceptions abort the complete function call transaction.

S3.5 additionally removes direct browser INSERT/UPDATE grants and direct write RLS policies from Orders/Order Items. This does not expand RBAC; it narrows the write surface.

### `oxxen_connect_get_operational_dashboard`

- `PUBLIC`: revoked.
- `anon`: revoked.
- `authenticated`: execute.
- internal authorization: any registered admin role.
- OWNER: requires JWT AAL2.
- returns operational counts only.

## RLS Performance Advisor

The current `auth_rls_initplan` warnings around OWNER/AAL2 policies were reviewed. Existing policies already use optimized sub-select patterns in multiple places. S3.5 will not weaken or remove AAL2 just to obtain a green Advisor result.

Classification: **ACCEPTED / MONITOR**, unless an EXPLAIN/benchmark demonstrates a safe improvement.

## Unused indexes

Production currently has almost no Customer/Order/NFC records. `unused_index` is therefore not sufficient evidence to remove indexes. Classification: **NOT ACTIONABLE YET**.

## Backup schema no-PK warnings

Warnings on internal snapshot/backup schemas are not operational public tables. Classification: **NOT APPLICABLE to runtime authorization**. They can be cleaned up under a dedicated backup-retention maintenance task after restore requirements are confirmed.

## Prohibited security regressions

S3.5 must not:

- expose `service_role` through any `VITE_*` variable;
- grant anonymous table access to operational records;
- remove OWNER AAL2;
- make `public_id` writable by ordinary card editing;
- turn public-card RPCs into direct table exposure;
- add hard-delete UI or operational DELETE/TRUNCATE privileges;
- restore direct browser writes to Orders/Order Items merely to bypass the transactional RPC.
