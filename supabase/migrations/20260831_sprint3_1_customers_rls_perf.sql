-- OXXEN Connect — Sprint 3.1 RLS evaluation hardening for customer OWNER MFA policy.

drop policy if exists oxxen_customers_require_owner_aal2 on public.oxxen_connect_customers;
create policy oxxen_customers_require_owner_aal2
on public.oxxen_connect_customers
as restrictive
for all
to authenticated
using (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
);
