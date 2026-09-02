# S3.5 — Production probe harness correction

Date: 2026-09-02

During the authorized S3.5 production rollout, the first rollback-only `s3_5_atomic_order_update.sql` execution reached the unaffiliated-authenticated identity case and reported a false failure.

Root cause: the harness changed `request.jwt.claims.sub` but left the legacy `request.jwt.claim.sub` setting pointing to the OWNER. `auth.uid()` continued resolving the OWNER during that synthetic session.

Safety observations:

- the outer transaction rolled back;
- no synthetic Customer, Card, Order, Order Item or NFC row persisted;
- the production RPC/grants/RLS metadata gate was already correct;
- a corrected rollback-only probe that updates both JWT claim settings passed in production;
- Card `public_id`, slug and alias identities remained unchanged.

Repository fix: `supabase/tests/s3_5_atomic_order_update.sql` now updates both `request.jwt.claim.sub` and `request.jwt.claims` before testing an authenticated identity with no admin row.

This is a test-harness correction only. It does not change application runtime behavior, database schema, grants, RLS or QR/NFC identity.
