# S3.5 — Real Operation Pilot

## Safety gate

**NO ejecutar durante PRE-MERGE.** This document prepares the pilot only. Do not create pilot rows automatically after deployment.

The owner must explicitly authorize:

> Autorizo piloto operativo S3.5

Only after S3.5 rollout is green may the controlled pilot begin.

## Target pilot

1 Customer
→ 1 Order
→ 3 Order Items
→ 3 Cards
→ 3 NFC
→ reserve
→ program
→ assign
→ deliver
→ verify QR
→ verify physical NFC

Never start with the planned 100 physical cards.

## Preconditions

- S3.5 migration applied successfully.
- Production `verify`, critical E2E and production smoke green.
- Recent encrypted backup and restore dry-run valid.
- Security/Performance Advisors reviewed.
- Identity snapshot (`id/public_id/slug/aliases`) unchanged.
- OWNER working under AAL2.
- At least three physical NFC tags available if the physical portion will be tested.

## Controlled procedure

1. Create one test/controlled Customer clearly identified as an OXXEN operational pilot record.
2. Create one draft Order through `oxxen_connect_create_order_with_items` with three items.
3. Create/associate three digital Cards through the normal admin UI. Never regenerate an existing `public_id`.
4. Re-open the Order and exercise the S3.5 editor: notes, quantity/price while draft, Card assignment and save/reload persistence.
5. Confirm optimistic concurrency by opening the same Order in two sessions and verifying a stale save is rejected instead of silently overwriting.
6. Confirm the allowed status path: `draft → confirmed → in_production → ready → delivered`.
7. Reserve three NFC assets for the order, then program/assign them to the three Cards using the existing S3.3 lifecycle.
8. Physically verify each QR and NFC opens the expected permanent public profile.
9. Verify OrderDetail/NFC summary matches requested/reserved/programmed/assigned/delivered counts.
10. Review Audit activity for order edits/status/payment/card assignment events.

## Partial pilot when physical NFC is not yet available

Execute only:

Customer → Order → Cards → logical NFC reservation

Do not fake programming/delivery. Record physical QR/NFC verification as pending.

## Success criteria

- No partial Order/Item updates.
- Stale edits are rejected.
- Totals match backend-calculated values.
- Customer/Card consistency remains valid.
- Status transitions are valid and audited.
- `public_id`, slug, aliases and permanent URLs remain unchanged.
- Every physical NFC resolves to the Card it was assigned to.
- No unexpected 5xx/runtime errors.

## Abort criteria

Stop immediately if any of these occur:

- a QR/NFC resolves to the wrong Card;
- a permanent `public_id` changes;
- an Order/Item update persists partially;
- an unauthorized role can mutate an Order;
- OWNER can perform the sensitive operation under AAL1;
- stale concurrent edits overwrite newer data;
- production smoke or runtime health regresses.
