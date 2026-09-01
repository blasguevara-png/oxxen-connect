-- S3.2 post-migration reconciliation: first RLS performance pass.
-- Applied to production after the primary orders migration.

drop policy if exists oxxen_orders_require_owner_aal2 on public.oxxen_connect_orders;
create policy oxxen_orders_require_owner_aal2
on public.oxxen_connect_orders as restrictive for all to authenticated
using (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists oxxen_order_items_require_owner_aal2 on public.oxxen_connect_order_items;
create policy oxxen_order_items_require_owner_aal2
on public.oxxen_connect_order_items as restrictive for all to authenticated
using (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
);
