# S3.5 — PRE-MERGE report

Date: 2026-09-02
Status: **PRE-MERGE / DO NOT MERGE / DO NOT MIGRATE PRODUCTION**

## 1. Initial main HEAD

`0ccc7f9245f3db9f656e10dfa2373c21d99cbd8f`

Baseline production was healthy: GitHub verify/E2E/production-smoke green, encrypted backup workflow green, Vercel production READY, no recent production error/fatal logs returned.

## 2. Branch

`s3-5-orders-transactional-editing`

Created directly from the initial main HEAD. PR #24 is intentionally Draft.

## 3. Files changed

- `README.md`
- `docs/RBAC_MATRIX.md`
- `docs/RUNBOOK_S3_5.md`
- `docs/S3_5_ORDER_TRANSACTION_DESIGN.md`
- `docs/S3_5_PRE_CHANGE.md`
- `docs/S3_5_REAL_OPERATION_PILOT.md`
- `docs/SECURITY_DECISIONS_S3_4.md`
- `src/lib/s3-5-orders-contracts.test.ts`
- `src/pages/OrderEditor.test.tsx`
- `src/pages/OrderEditor.tsx`
- `supabase/migrations/20260902_sprint3_5_orders_transactional_editing.sql`
- `supabase/tests/s3_5_atomic_order_update.sql`
- this report.

## 4. Migration

Prepared only; **not applied to production**:

`supabase/migrations/20260902_sprint3_5_orders_transactional_editing.sql`

It adds the transactional update RPC, removes the direct authenticated Orders/Items mutation surface used by the old browser flow, and removes direct commercial write policies that become unnecessary. It does not update business rows or Card identity data.

## 5. RPC created

`oxxen_connect_update_order_with_items(uuid, uuid, jsonb, numeric, text, text, text, text, timestamptz)`

Properties:

- `SECURITY DEFINER`;
- `search_path = ''`;
- only `authenticated` receives EXECUTE;
- internal roles: OWNER / ADMIN / SALES;
- OWNER requires AAL2;
- locks the Order row with `FOR UPDATE`;
- optimistic concurrency through `p_expected_updated_at`, stale writes fail with SQLSTATE `40001`;
- validates Customer, item ownership, quantity, price, discount, Card/Customer consistency, existing Order/Payment enums and status transitions;
- backend remains the authority for subtotal/total;
- no physical Order Item deletion in S3.5;
- emits transaction-level audit summaries.

## 6. Grants — before / planned after

### Before S3.5 in production

Authenticated has SELECT plus column-level direct browser INSERT/UPDATE privileges for the exact commercial Orders/Items fields. This is why `OrderEditor` can currently perform direct writes despite broad table-level privilege inspection primarily showing SELECT.

### Planned after S3.5

- authenticated keeps read access under RLS;
- direct column INSERT/UPDATE privileges on Orders/Items are revoked;
- Orders sequence remains unavailable to direct authenticated callers;
- create/update writes use hardened SECURITY DEFINER RPCs;
- anon receives no administrative RPC EXECUTE;
- no new DELETE/TRUNCATE privilege is introduced.

This is a reduction of direct SQL authority, not a RBAC expansion.

## 7. RLS — before / planned after

RLS is enabled on Orders and Order Items before S3.5 and remains enabled after S3.5.

Business RBAC remains:

- OWNER: R/W + AAL2;
- ADMIN: R/W;
- SALES: R/W;
- EDITOR: R;
- SUPPORT: R.

S3.5 removes only the direct commercial INSERT/UPDATE policies because writes move behind the RPC. Read policies and restrictive OWNER/AAL2 protections remain. Cards/Customers/NFC RLS is not redesigned.

## 8. Tests

The branch adds:

- static contract tests for RPC security, backend validation, grants/policies, concurrency, audit actions and identity non-regression;
- mocked `OrderEditor` component tests covering edit notes + quantity + price + Card → one RPC → reload persisted state;
- UI test for actionable SQLSTATE `40001` concurrency conflict;
- rollback-only PostgreSQL probe for atomicity/security;
- existing full unit/contract suite;
- existing critical Playwright E2E.

On implementation HEAD `08a773b0f87c72f64e24f885e28d52f334885800`, GitHub CI passed `npm ci`, lint, typecheck, tests and build; `e2e-critical` also passed. This report commit must pass the same final gate before approval.

## 9. Atomicity probe

Prepared:

`supabase/tests/s3_5_atomic_order_update.sql`

It has an outer `BEGIN` / `ROLLBACK` and tests:

- valid item mutation followed by invalid item → no partial Order/Item changes;
- Card owned by another Customer → rejected, no partial assignment;
- item ID belonging to another Order → rejected;
- discount greater than subtotal → rejected;
- OWNER AAL1 → rejected;
- authenticated identity without admin row → rejected;
- anon EXECUTE → must be absent.

**PRE-MERGE limitation:** it has not been run against production because the S3.5 RPC does not exist there and production migrations are forbidden before authorization. There is no isolated Supabase staging database on the current Free setup. Creating a paid branch only to run this sprint would violate the plan/cost boundary. Therefore PRE-MERGE database validation is static/contract/component/CI; the rollback-only SQL probe is a mandatory post-migration rollout gate after a valid encrypted backup.

## 10. Security Advisor

Production baseline remains unchanged because S3.5 has not been migrated.

Known warnings:

- anonymous public-profile/event SECURITY DEFINER functions — **ACCEPTED BY DESIGN**;
- authenticated administrative SECURITY DEFINER functions — individually audited/accepted where server-side authorization is required;
- `Leaked Password Protection Disabled` — **ACCEPTED — PLAN LIMITATION (SUPABASE FREE)**.

The new S3.5 update RPC is expected to produce an authenticated SECURITY DEFINER Advisor warning after rollout. Planned classification: **ACCEPTED BY DESIGN** only if post-migration verification confirms `PUBLIC`/`anon` EXECUTE revoked, authenticated-only EXECUTE, OWNER/ADMIN/SALES internal check, OWNER AAL2, locked search path and passing probes.

## 11. Performance Advisor

Production baseline has pre-existing `auth_rls_initplan` warnings on restrictive OWNER/AAL2 policies plus informational backup-table/index notices. S3.5 does not weaken RLS/MFA to silence them and does not remove indexes based solely on an unused-index warning while production volume is near zero.

Classification: **ACCEPTED / MONITOR** for the existing AAL2 lint unless a separate benchmark demonstrates a safe improvement.

## 12. QR/NFC invariants

PRE-CHANGE production snapshot:

- Cards: 2;
- Customer/Order/Item/NFC operational rows: 0/0/0/0;
- null `public_id`: 0;
- duplicate `public_id` groups: 0;
- duplicate slug groups: 0;
- duplicate alias groups: 0;
- invalid Card↔Customer / Order↔Customer / Item↔Order/Card / NFC↔Order/Item relationships: 0.

Exact identity rollback reference:

1. `69bea61f-aeb0-423c-b74b-e9bff5971b74` → `public_id=71a9393a223b70c45c0b9b7c`, slug `c`, aliases `[c]`.
2. `eed3b1fc-9205-47e3-abaa-36068fc4be75` → `public_id=7f001116b6ac65d7a82d7046`, slug `b`, aliases `[b]`.

S3.5 migration contains no Card identity update and no QR/NFC regeneration. A final read-only snapshot comparison is required immediately before authorization and again during rollout.

## 13. Risks

### Database migration/RPC not executed PRE-MERGE

The strongest remaining risk is SQL-runtime behavior because the project has no isolated Supabase staging database. Mitigation: versioned migration, static contract tests, code review, backup gate and mandatory rollback-only probe immediately after migration before continuing rollout.

### Coupled application/database write model

Once `OrderEditor` uses the RPC and direct grants are revoked, UI and DB migration must roll out coherently. Mitigation: production smoke before DDL, short rollout sequence, forward-fix preference after real usage.

### No item deletion lifecycle

S3.5 intentionally rejects omission/deletion instead of inventing hard delete or a new cancelled-item state. This is safer but means removing an item is not supported by this sprint.

### Post-draft structural edits are locked

Customer/currency/discount/items are locked after leaving `draft`; notes/payment/status remain administratively editable. This protects operational consistency but is stricter than the legacy browser UI. It is intentional and documented.

### Advisor SECURITY DEFINER warning

Expected for the new RPC. It is acceptable only if post-migration grant/role/AAL2 probes confirm the intended boundary.

## 14. Rollback

Before DB migration: application merge/deployment can be rolled back without DB recovery.

After DB migration but before meaningful S3.5 writes:

1. revoke the S3.5 update RPC;
2. restore the previous versioned Orders/Items column-level INSERT/UPDATE grants;
3. recreate the previous direct commercial write RLS policies from S3.2;
4. redeploy the pre-S3.5 OrderEditor;
5. re-run RLS/MFA/public identity and smoke checks.

After real S3.5 Order edits begin, prefer a forward fix. Never rollback by regenerating `public_id`, QR, aliases or NFC destinations.

## 15. Pilot proposed

Prepared only in `docs/S3_5_REAL_OPERATION_PILOT.md`:

1 Customer → 1 Order → 3 Items → 3 Cards → 3 NFC → reserve → program → assign → deliver → physical QR/NFC validation.

The pilot is **not authorized by a rollout approval**. It requires the later, separate phrase:

`Autorizo piloto operativo S3.5.`

If physical NFC is unavailable, only the documented partial software flow may be performed; programming/delivery must not be faked.

## 16. Recommendation

**GO FOR OWNER REVIEW / CONDITIONAL GO FOR MERGE+ROLLOUT** once the final report HEAD has:

- verify green;
- critical E2E green;
- Vercel Preview READY;
- final production identity/advisor read-only checks unchanged.

The SQL migration and rollback-only DB probe remain intentionally unexecuted until explicit merge/rollout authorization. The real pilot remains separately gated.

Required next authorization after final gates:

`Autorizo merge S3.5 y rollout de producción.`
