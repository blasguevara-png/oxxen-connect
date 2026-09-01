# Sprint 3.3 — NFC inventory

## Goal

Separate physical NFC assets from digital card identity. `public_id` remains the permanent public identity; NFC UID is operational metadata only.

## Model

`customer -> order -> order_item -> nfc_asset -> card -> public_id`

`oxxen_connect_nfc_assets` tracks:

- internal `NFC-000001` asset code;
- chip type;
- normalized UID when available;
- lifecycle status;
- optional order/order-item/card relations;
- lot, supplier and purchase cost;
- reserve/program/delivery timestamps.

## Lifecycle

Normal path:

`available -> reserved -> programmed -> assigned -> delivered`

Exceptional paths allow `defective`, `lost` and `retired`; delivered assets cannot return to available through the normal flow.

## Security

- RLS enabled.
- OWNER/ADMIN: read + operational writes.
- EDITOR/SUPPORT/SALES: read only.
- `anon`: no direct access.
- no DELETE/TRUNCATE grants.
- OWNER operations preserve AAL2 requirement.
- bulk creation and atomic reservation RPCs validate role/MFA server-side.

## Rollout

1. CI on Draft PR: `verify` + `e2e-critical`.
2. Review and explicit merge authorization.
3. `production-smoke` after merge.
4. Encrypted backup reason: `pre-migracion-s3.3`.
5. Restore dry-run must pass.
6. Apply migrations in version order.
7. Verify RLS/grants, existing customers/orders/cards/public IDs/slugs/aliases.
8. Transactionally test `NFC-000001`, UID uniqueness, reservation and rollback.
9. Re-sync NFC identity sequence if the transaction consumed sequence values.
10. Run Security Advisor and Performance Advisor.

## Staging limitation

Authenticated lifecycle E2E must not mutate real customer/order/card data. Until an isolated Supabase staging project exists, CI only performs non-destructive route/access checks plus unit/domain tests; the production migration is validated transactionally with rollback after the required backup.
