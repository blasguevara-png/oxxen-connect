# S3.4 — Security decisions

Security Advisor was reviewed against production before changes. A warning is not automatically a vulnerability; every finding is classified before changing grants or RLS.

## Security Advisor decisions

| Finding | Decision | Rationale / action |
| --- | --- | --- |
| `auth_leaked_password_protection` disabled | **FIX — OWNER ACTION** | Enable Supabase Auth leaked-password protection before production rollout. This is an Auth project setting, not a SQL migration in this repo. |
| `anon` can execute `get_public_card` | **ACCEPTED BY DESIGN** | Public QR/NFC profiles require anonymous resolution. Function is `SECURITY DEFINER`, has locked `search_path`, and returns a deliberately limited public projection. |
| `anon` can execute `get_public_card_status` | **ACCEPTED BY DESIGN** | Needed to distinguish missing/inactive/archived public profiles without direct table access. |
| `anon` can execute `record_public_event` | **ACCEPTED BY DESIGN** | Public analytics enters through a validating/deduplicating/rate-limited RPC; anonymous direct INSERT to analytics tables remains revoked. |
| `authenticated` can execute the public RPCs | **ACCEPTED BY DESIGN** | Authenticated administrators may also open public-card functionality. This does not grant table bypass beyond the RPC contract. |
| `authenticated` can execute `oxxen_connect_bulk_create_nfc_assets` | **ACCEPTED BY DESIGN** | RPC checks administrative role and OWNER AAL2 server-side. Direct UI visibility is not the authorization boundary. |
| `authenticated` can execute `oxxen_connect_reserve_nfc_assets` | **ACCEPTED BY DESIGN** | Atomic reservation requires a server-side function; role/MFA validation remains inside the function. |
| S3.4 `oxxen_connect_create_order_with_items` is SECURITY DEFINER | **FIXED/CONTROLLED BY DESIGN** | New function is granted only to `authenticated`, locks `search_path`, validates role, OWNER AAL2, customer, items, quantities, prices and card/customer consistency. |
| S3.4 dashboard aggregation is SECURITY DEFINER | **FIXED/CONTROLLED BY DESIGN** | Granted only to `authenticated`; validates admin membership and OWNER AAL2 and returns counts only. |

## Manual owner action — leaked password protection

Before rollout S3.4:

1. Open the OXXEN Connect Supabase project.
2. Go to **Authentication** settings and open the password/security configuration.
3. Enable **Leaked Password Protection** (compromised-password checking).
4. Save the Auth configuration.
5. Re-run **Security Advisor** and confirm the leaked-password warning is gone.

Advisor remediation reference:
`https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection`

If the Supabase UI label/location changes, use the Advisor remediation link from the OXXEN Connect project rather than disabling another password rule by mistake.

## S3.4 new functions: grant posture

### `oxxen_connect_create_order_with_items`

- `PUBLIC`: revoked.
- `anon`: revoked.
- `authenticated`: execute.
- internal authorization: OWNER/ADMIN/SALES only.
- OWNER: requires JWT AAL2.
- `search_path`: empty/locked.
- any raised exception aborts the complete function call transaction.

### `oxxen_connect_get_operational_dashboard`

- `PUBLIC`: revoked.
- `anon`: revoked.
- `authenticated`: execute.
- internal authorization: any registered admin role.
- OWNER: requires JWT AAL2.
- returns operational counts only.

## RLS Performance Advisor

The current `auth_rls_initplan` warnings around OWNER/AAL2 policies were reviewed. Existing policies already use optimized sub-select patterns in multiple places. S3.4 will not weaken or remove AAL2 just to obtain a green Advisor result.

Classification: **ACCEPTED / MONITOR**, unless an EXPLAIN/benchmark demonstrates a safe improvement.

## Unused indexes

Production currently has almost no Customer/Order/NFC records. `unused_index` is therefore not sufficient evidence to remove indexes. Classification: **NOT ACTIONABLE YET**.

## Backup schema no-PK warnings

Warnings on internal snapshot/backup schemas are not operational public tables. Classification: **NOT APPLICABLE to runtime authorization**. They can be cleaned up under a dedicated backup-retention maintenance task after restore requirements are confirmed.

## Prohibited security regressions

S3.4 must not:

- expose `service_role` through any `VITE_*` variable;
- grant anonymous table access to operational records;
- remove OWNER AAL2;
- make `public_id` writable by ordinary card editing;
- turn public-card RPCs into direct table exposure;
- add hard-delete UI or operational DELETE/TRUNCATE privileges.
