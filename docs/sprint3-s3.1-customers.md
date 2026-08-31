# Sprint 3.1 — Customers model

## Current state

- `oxxen_connect_cards` remains the permanent digital/physical identity record.
- `public_id` stays immutable and continues to drive QR/NFC URLs.
- Existing cards are not reassigned automatically.
- Customer data becomes a separate commercial entity.

## What this delivery adds

- `public.oxxen_connect_customers` with internal `CLI-000001` style codes.
- Nullable `oxxen_connect_cards.customer_id` for a 1:N customer → cards relation.
- RLS for all administrative reads and OWNER/ADMIN/SALES customer writes.
- OWNER AAL2 restriction on the new operational table.
- No hard-delete policy for customers.
- Domain types/helpers and unit tests.

## Safety invariants

This migration does **not** modify:

- existing `public_id` values;
- slugs or alias history;
- public RPCs;
- QR/NFC URLs;
- legacy Vercel redirects;
- existing cards' public visibility.

Legacy cards keep `customer_id = NULL` until an administrator explicitly links them in a later Sprint 3 delivery.

## Production rollout

Do not apply this migration just because the PR exists.

1. Merge only after `verify` and `e2e-critical` are green.
2. Run the existing manual encrypted backup workflow with a pre-migration reason.
3. Confirm the backup and restore dry-run succeed.
4. Apply `20260831_sprint3_1_customers.sql` to Supabase production.
5. Verify customers table RLS and that the two existing cards still have unchanged `public_id`, slug and aliases.
6. Only then start the customer-management UI delivery.

## Rollback posture

Before customer data exists, rollback is straightforward: drop the nullable card FK/column and customer table. After customer records are used, prefer a forward-fix instead of destructive rollback.
