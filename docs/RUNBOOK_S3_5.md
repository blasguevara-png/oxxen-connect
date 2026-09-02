# S3.5 — Production rollout runbook

**Do not execute until the owner explicitly says: `Autorizo merge S3.5 y rollout de producción.`**

## PRE-MERGE gate

Require all of the following:

- PR remains Draft until approval.
- final HEAD CI: `npm ci`, lint, typecheck, unit/contract tests and build green.
- critical E2E green.
- Vercel Preview READY.
- migration reviewed: no public identity mutation, no DELETE/TRUNCATE, no anonymous admin RPC exposure.
- Security/Performance Advisors reviewed against production baseline.
- exact Card `id/public_id/slug/aliases` snapshot recorded.
- rollback-only probe reviewed but not run on production.
- real operation pilot is documentation-only.

## Authorized rollout sequence

1. Verify PR HEAD has not moved since PRE-MERGE approval.
2. Verify required CI checks are green.
3. Merge S3.5 to `main`.
4. Wait for Vercel production deployment to be `READY`.
5. Require `production-smoke` green before database DDL.
6. Verify a recent encrypted backup exists and its restore dry-run passed. If no valid backup: STOP.
7. Snapshot the current production Cards (`id/public_id/slug/aliases`) again.
8. Apply only `20260902_sprint3_5_orders_transactional_editing.sql`.
9. Verify the new RPC signature, `SECURITY DEFINER`, locked `search_path`, EXECUTE grants and role/AAL2 checks.
10. Verify authenticated direct INSERT/UPDATE column grants on Orders/Items are gone and direct write policies were removed; SELECT/RLS remain.
11. Run `supabase/tests/s3_5_atomic_order_update.sql`. It must end in outer `ROLLBACK`.
12. Verify OWNER AAL1 denied / OWNER AAL2 allowed and unaffiliated authenticated denied.
13. Verify public profile RPCs by both existing slug/alias and `public_id`.
14. Compare Card identity snapshot exactly with step 7.
15. Verify the legacy Vercel URL still redirects permanently to the canonical domain.
16. Run Security Advisor; classify leaked-password warning as `ACCEPTED — PLAN LIMITATION (SUPABASE FREE)`.
17. Run Performance Advisor; do not weaken AAL2/RLS to remove warnings.
18. Run final production smoke.
19. Review production runtime error/fatal logs; new 5xx/errors must be zero or understood/non-regressive.
20. Write POST-MERGE report.

## Stop conditions

STOP immediately if:

- backup/restore dry-run is invalid;
- migration fails;
- direct unaffiliated/anon Order mutation becomes possible;
- OWNER can mutate Orders under AAL1;
- atomicity probe leaves any partial change;
- stale concurrency update overwrites newer state;
- any `public_id`, slug ownership or alias changes unexpectedly;
- public QR/NFC resolution or legacy redirect fails;
- production smoke fails or new runtime 5xx appears.

## Rollback posture

Because S3.5 couples UI and database write authority, rollback must keep both sides compatible.

Before DB migration: revert the application deployment/merge only if needed; no DB change exists.

After DB migration but before meaningful S3.5 usage:

- revoke the S3.5 update RPC;
- restore previous versioned column INSERT/UPDATE grants and commercial write policies from S3.2;
- redeploy the pre-S3.5 OrderEditor;
- validate RLS/MFA and identity invariants again.

Once real Orders have been edited using S3.5, prefer a forward fix over destructive rollback. Never recover by regenerating Cards, `public_id`, aliases, QR or NFC destinations.

## Pilot gate

A green rollout does **not** authorize pilot data. Present `docs/S3_5_REAL_OPERATION_PILOT.md` first. Execute pilot records only after the separate explicit phrase:

`Autorizo piloto operativo S3.5.`
