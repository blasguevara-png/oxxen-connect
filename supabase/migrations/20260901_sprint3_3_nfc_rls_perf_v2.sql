-- S3.3 final AAL2 policy shape after production Advisor review.
-- Inline the OWNER lookup and keep auth calls wrapped in SELECT.
drop policy if exists oxxen_nfc_assets_require_owner_aal2 on public.oxxen_connect_nfc_assets;

create policy oxxen_nfc_assets_require_owner_aal2
on public.oxxen_connect_nfc_assets as restrictive for all to authenticated
using (
  not exists (
    select 1
    from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
      and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not exists (
    select 1
    from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
      and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
);
