-- OXXEN Connect Sprint 2 closeout: database enforcement for mandatory OWNER TOTP MFA.
-- The admin self-read remains available at AAL1 so Login/AdminGuard can determine the user's role
-- and route an OWNER to the MFA enrollment/challenge flow. Operational data requires AAL2.

create or replace function public.oxxen_connect_current_admin_requires_aal2()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
      and a.role in ('OWNER')
  );
$$;

revoke all on function public.oxxen_connect_current_admin_requires_aal2() from public, anon;
grant execute on function public.oxxen_connect_current_admin_requires_aal2() to authenticated;

-- OWNER must have an aal2 JWT before reading/writing operational tables.
-- ADMIN can be added to the role list above when the business enables mandatory MFA for ADMIN.
drop policy if exists oxxen_cards_require_owner_aal2 on public.oxxen_connect_cards;
create policy oxxen_cards_require_owner_aal2
on public.oxxen_connect_cards
as restrictive
for all
to authenticated
using (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists oxxen_aliases_require_owner_aal2 on public.oxxen_connect_card_aliases;
create policy oxxen_aliases_require_owner_aal2
on public.oxxen_connect_card_aliases
as restrictive
for all
to authenticated
using (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists oxxen_events_require_owner_aal2 on public.oxxen_connect_analytics_events;
create policy oxxen_events_require_owner_aal2
on public.oxxen_connect_analytics_events
as restrictive
for all
to authenticated
using (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists oxxen_audit_require_owner_aal2 on public.oxxen_connect_audit_logs;
create policy oxxen_audit_require_owner_aal2
on public.oxxen_connect_audit_logs
as restrictive
for all
to authenticated
using (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
);

-- Storage enforcement applies only to the OXXEN Connect media bucket.
drop policy if exists oxxen_media_require_owner_aal2 on storage.objects;
create policy oxxen_media_require_owner_aal2
on storage.objects
as restrictive
for all
to authenticated
using (
  bucket_id <> 'oxxen-connect-media'
  or not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  bucket_id <> 'oxxen-connect-media'
  or not public.oxxen_connect_current_admin_requires_aal2()
  or (select auth.jwt()->>'aal') = 'aal2'
);
