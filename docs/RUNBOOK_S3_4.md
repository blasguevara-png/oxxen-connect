# S3.4 — Production rollout runbook

**Do not execute this runbook until the owner explicitly authorizes merge S3.4 and production rollout.**

## Pre-merge gate

Required before requesting authorization:

- Draft PR CI green.
- lint/typecheck/unit/contract/build green.
- critical non-destructive E2E green.
- migration reviewed as additive.
- no diff that rewrites existing `public_id`, aliases or legacy redirects.
- Security/Performance Advisor decisions attached.
- RBAC ambiguity documented, not silently changed.
- `package-lock.json` committed and CI using `npm ci`.

## Authorized rollout sequence

1. Merge the approved PR to `main`.
2. Wait for production CI/smoke; stop on any failure.
3. Run encrypted backup workflow with reason `pre-migracion-s3.4`.
4. Confirm encrypted artifact exists and restore dry-run passed.
5. Re-check the two existing production Cards and snapshot:
   - `id`
   - `public_id`
   - current slug
   - aliases.
6. Apply only the new S3.4 migration(s) in version order.
7. Verify functions/triggers/grants and RLS.
8. Verify Customer/Order/NFC tables and FKs.
9. Run the authorized transaction-only integration probe with `ROLLBACK`; no real customer/card data.
10. Re-query Cards and compare `public_id`/slugs/aliases to step 5.
11. Run Security Advisor.
12. Run Performance Advisor.
13. Verify public profile and legacy Vercel profile redirect.
14. Verify `/api/contact`.
15. Verify admin login + OWNER MFA/AAL2.
16. Verify Customers, Orders, Cards and NFC routes.
17. Run final production smoke.
18. Publish POST-MERGE report.

## Transaction-only probe after authorization

The probe must use synthetic data and remain inside one transaction. It should prove:

- valid Customer → Order → Item can be constructed;
- invalid item causes `oxxen_connect_create_order_with_items` to fail;
- after the failed call, order/item counts for the synthetic reference remain zero;
- mismatched non-legacy Card/customer association is rejected;
- legacy Card with `customer_id = NULL` remains allowed by the consistency rule;
- all synthetic rows are rolled back.

Do not execute this probe before the required encrypted backup and rollout authorization.

## Immediate stop conditions

Stop rollout and do not continue if any occurs:

- backup or restore dry-run fails;
- migration error;
- any existing `public_id` changes;
- an existing alias disappears or moves to another card;
- legacy redirect fails;
- OWNER can access operational data at AAL1;
- `anon` gains direct operational table access;
- order creation leaves a partial order;
- production smoke fails.

## Rollback posture

Before migration: simply do not merge/apply.

After migration but before operational use, a rollback migration may remove S3.4-only RPCs/triggers if absolutely necessary. Once Customers/Orders are used, prefer a forward-fix instead of destructive rollback. Never restore by generating replacement Cards, `public_id`, slugs or QR destinations.
