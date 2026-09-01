-- S3.2 post-migration reconciliation: final OWNER AAL2 policy shape.
-- Semantics are unchanged: OWNER requires aal2; other authenticated admin roles follow their permissive policies.

drop policy if exists oxxen_orders_require_owner_aal2 on public.oxxen_connect_orders;
create policy oxxen_orders_require_owner_aal2
on public.oxxen_connect_orders as restrictive for all to authenticated
using (
  not exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid()) and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid()) and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists oxxen_order_items_require_owner_aal2 on public.oxxen_connect_order_items;
create policy oxxen_order_items_require_owner_aal2
on public.oxxen_connect_order_items as restrictive for all to authenticated
using (
  not exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid()) and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid()) and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
);
