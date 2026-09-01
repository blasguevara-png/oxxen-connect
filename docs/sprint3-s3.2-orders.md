# Sprint 3.2 — Orders / Pedidos

## Current state

Sprint 3.1 introduced `oxxen_connect_customers` and the nullable `oxxen_connect_cards.customer_id` relation. Card identity remains `public_id`; legacy cards may keep `customer_id = NULL`.

## S3.2 implementation

- `oxxen_connect_orders` with sequential `ORD-000001` codes.
- `oxxen_connect_order_items` with optional `card_id` so a sale can exist before digital-card assignment.
- Validated lifecycle: `draft → confirmed → in_production → ready → delivered`, with cancellation before delivery.
- Payment state: `pending | partial | paid | refunded`.
- Financial totals are derived in PostgreSQL from order items; client writes cannot directly update derived subtotal/total/quantity columns.
- RLS: OWNER/ADMIN/SALES may create/update; EDITOR/SUPPORT are read-only; `anon` has no table access.
- OWNER keeps the existing AAL2 restrictive policy.
- No operational DELETE/TRUNCATE grants.
- Order and order-item actions are written to the existing audit log with generic `entity_id` support.
- Admin views: `/admin/pedidos`, `/admin/pedidos/nuevo`, `/admin/pedidos/:id` and customer commercial summary `/admin/clientes/:customerId/resumen`.
- Backup/restore now includes orders and items while remaining compatible with older backups.

## Invariants protected

This sprint does not change:

- `cards.public_id`;
- card slugs or historical aliases;
- QR/NFC URLs;
- public RPCs;
- Vercel legacy redirects;
- card analytics;
- MFA configuration;
- legacy card/customer relationships.

## Pre-production rollout

1. Draft PR must pass `verify` and `e2e-critical`.
2. Review before merge; no automatic merge.
3. After merge, `production-smoke` must pass.
4. Run encrypted backup with reason `pre-migracion-s3.2`.
5. Confirm restore dry-run and encrypted artifact.
6. Apply `20260901_sprint3_2_orders.sql` to Supabase production.
7. Validate RLS, grants, FKs, empty order tables and sequence.
8. Create a transaction-only test customer/order/items and roll it back.
9. Re-check public IDs, slugs, aliases and public profiles.
10. Run Supabase Security/Performance Advisors and reconcile any production hardening back into versioned migrations.

## Testing note

Domain/unit tests cover order codes, money calculations, status transitions and role helpers. Critical Playwright coverage verifies all new order routes remain protected from unauthenticated access. Authenticated CRUD E2E must not target real production customers/cards; it should be expanded against an isolated Supabase staging environment when one is available.
