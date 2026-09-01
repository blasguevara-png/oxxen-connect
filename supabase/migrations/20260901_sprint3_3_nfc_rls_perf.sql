-- S3.3 post-migration advisor follow-up.
-- Keep OWNER AAL2 restrictive policy while memoizing the helper call through SELECT.
drop policy if exists oxxen_nfc_assets_require_owner_aal2 on public.oxxen_connect_nfc_assets;

create policy oxxen_nfc_assets_require_owner_aal2
on public.oxxen_connect_nfc_assets as restrictive for all to authenticated
using (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
);
