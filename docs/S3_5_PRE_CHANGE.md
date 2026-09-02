# S3.5 — PRE-CHANGE audit

Date: 2026-09-02

## Baseline

- `main`: `0ccc7f9245f3db9f656e10dfa2373c21d99cbd8f`.
- GitHub checks on baseline: `verify`, `e2e-critical`, `production-smoke` and encrypted `backup` all successful.
- Open pull requests before S3.5: 0.
- Vercel production deployment for the baseline commit: `READY`.
- Vercel production runtime error/fatal logs in the previous 24h: none returned.
- Supabase project: `OXXEN Connect`, plan remains FREE.

## Production counts before S3.5

| Entity | Count |
| --- | ---: |
| Cards | 2 |
| Customers | 0 |
| Orders | 0 |
| Order Items | 0 |
| NFC Assets | 0 |
| Analytics Events | 280 |
| Audit Logs | 1 |

## Identity snapshot

The two existing digital identities are the rollback/invariant reference for S3.5:

- card `69bea61f-aeb0-423c-b74b-e9bff5971b74`: `public_id=71a9393a223b70c45c0b9b7c`, `slug=c`, aliases `[c]`.
- card `eed3b1fc-9205-47e3-abaa-36068fc4be75`: `public_id=7f001116b6ac65d7a82d7046`, `slug=b`, aliases `[b]`.

Pre-change invariants: 0 null `public_id`, 0 duplicate `public_id` groups, 0 duplicate slug groups, 0 duplicate alias groups. Relationship checks for Card↔Customer, Order↔Customer, Item↔Order/Card and NFC↔Order/Item all return 0 invalid rows.

## OrderEditor audit

Current creation path is **SAFE**: it calls `oxxen_connect_create_order_with_items(...)`, which creates Order + Items atomically.

Current edit paths are **INCONSISTENT / UNSAFE ARCHITECTURALLY** for S3.5 goals because the browser writes operational tables directly:

- `saveOrder()` → direct `UPDATE oxxen_connect_orders`.
- `changeStatus()` → direct `UPDATE oxxen_connect_orders`.
- `saveExistingItem()` → direct `UPDATE oxxen_connect_order_items`.
- `addItem()` → direct `INSERT oxxen_connect_order_items`.

The database still contains column-level INSERT/UPDATE grants for those exact columns even though table-level privilege checks only show SELECT. S3.5 will remove those direct write grants and move edits behind one transactional RPC.

## Current RBAC

Effective business matrix remains unchanged:

- OWNER: manage Orders/Items + AAL2.
- ADMIN: manage Orders/Items.
- SALES: manage Orders/Items.
- EDITOR: read.
- SUPPORT: read.

S3.5 does not resolve unrelated Cards-role ambiguities.

## Advisors baseline

Security Advisor warnings are pre-existing and accepted/documented where appropriate:

- public `SECURITY DEFINER` profile/event RPC warnings;
- authenticated administrative `SECURITY DEFINER` RPC warnings;
- `Leaked Password Protection Disabled` — **ACCEPTED — PLAN LIMITATION (SUPABASE FREE)**.

Performance Advisor continues to report pre-existing `auth_rls_initplan` warnings on restrictive OWNER/AAL2 policies plus informational backup-table/index notices. S3.5 will not weaken MFA/RLS to silence these warnings.

## S3.5 change boundary

Allowed: a new transactional order-update RPC, removal of direct browser write grants for Orders/Items, OrderEditor migration to RPC usage, tests, rollback-only SQL probes and documentation.

Forbidden: production migration before explicit authorization, identity changes, QR/NFC regeneration, changes to Leaked Password Protection, unrelated feature work, real pilot data during PRE-MERGE.