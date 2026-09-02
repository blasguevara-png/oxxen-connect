# S3.5 — Order Transaction Design

## Problem

S3.4 made order **creation** atomic through `oxxen_connect_create_order_with_items`, but the edit screen still performed four direct browser mutations against Orders/Order Items. That split the operational write model and allowed order fields/items to be saved independently.

S3.5 makes the browser a caller of one server-side transaction instead of an authority for individual table writes.

## Write model

### Create

`OrderEditor → oxxen_connect_create_order_with_items(...)`

Creation remains unchanged.

### Edit

`OrderEditor → oxxen_connect_update_order_with_items(...)`

The update RPC accepts the complete intended Order/Item state for one save operation and performs all validation/mutation in one PostgreSQL function call.

## Authorization

The RPC is `SECURITY DEFINER` with `search_path = ''`.

- OWNER: write, but must present `aal2`.
- ADMIN: write.
- SALES: write.
- EDITOR: denied by RPC.
- SUPPORT: denied by RPC.
- authenticated without an admin row: denied.
- anon/public: no EXECUTE grant.

This matches the existing effective Orders/Items RBAC matrix and does not resolve unrelated Cards permissions.

## Validation authority

PostgreSQL validates:

- Order exists.
- Customer exists and is not blocked.
- payload is a non-empty JSON array.
- quantity is integer and > 0.
- unit price is numeric and >= 0.
- discount is >= 0 and <= resulting subtotal.
- currency matches the existing three-letter contract.
- Order status and payment status are from existing enums.
- status transition is legal.
- item ID, if present, belongs to this Order.
- Card exists, is not deleted, and either belongs to the same Customer or is legacy (`customer_id IS NULL`).
- service/other items cannot reference Cards.

The frontend does not send authoritative `subtotal`, `quantity` or `total`; existing database triggers recalculate item/order totals.

## Item synchronization

S3.5 deliberately does **not** introduce hard delete or a new item lifecycle.

- Existing item IDs must be present in the payload.
- Existing items may be modified only while the Order is `draft`.
- New items use `id = null` and may be inserted only while `draft`.
- Omitting a pre-existing item is rejected instead of deleting it.

A future item-cancellation lifecycle can be designed separately if business requirements demand it.

## Order lifecycle

No new statuses are introduced:

`draft → confirmed → in_production → ready → delivered`

Cancellation remains allowed from `draft`, `confirmed`, `in_production` or `ready`. `delivered` and `cancelled` are terminal under the existing contract.

After leaving `draft`, Customer/currency/discount/items are structurally locked. Notes, payment status and valid forward status transitions remain administratively editable.

## Concurrency

The RPC uses two defenses:

1. `SELECT ... FOR UPDATE` serializes the target Order row during the call.
2. `p_expected_updated_at` implements optimistic concurrency. A stale editor receives SQLSTATE `40001` and is told to reload instead of silently overwriting newer work.

## Atomicity

PostgreSQL function calls run transactionally. Any exception rolls back mutations performed by that RPC call.

The rollback-only probe covers:

- a valid item mutation followed by an invalid item;
- a Card belonging to another Customer;
- an item ID belonging to another Order;
- discount above subtotal;
- OWNER under AAL1;
- authenticated identity without an admin row;
- anon EXECUTE exposure.

## Grants/RLS

After the migration:

- Orders and Order Items keep authenticated SELECT under RLS.
- direct browser column-level INSERT/UPDATE grants are revoked;
- direct write policies are dropped because operational writes go through the hardened RPCs;
- restrictive OWNER/AAL2 read protections and read policies remain unchanged;
- the Order identity sequence remains unavailable to authenticated direct callers.

## Audit

Existing row triggers continue to provide low-level Order/Item audit events. S3.5 additionally emits transaction-level summary events requested by the operational model:

- `order.updated`
- `order.status_changed`
- `order.payment_status_changed`
- `order.items_updated`
- `order.card_assignment_changed`

Summary metadata is intentionally small and contains IDs/state counts rather than secrets or full payloads.

## Rollback

If the migration needs rollback before meaningful S3.5 writes are adopted:

1. revoke EXECUTE on `oxxen_connect_update_order_with_items`;
2. restore the previous column-level Orders/Items INSERT/UPDATE grants;
3. recreate the previous commercial INSERT/UPDATE RLS policies from the versioned S3.2 migrations;
4. revert `OrderEditor` to the previous release only if the database grant rollback is also performed.

Do not rollback only one side of the UI/database write contract.
