-- OXXEN Connect Sprint 2 closeout: final RLS init-plan optimization.
-- Inline the OWNER role lookup so auth.uid() is explicitly evaluated once per statement.

drop policy if exists oxxen_cards_require_owner_aal2 on public.oxxen_connect_cards;
create policy oxxen_cards_require_owner_aal2
on public.oxxen_connect_cards
as restrictive
for all
to authenticated
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

drop policy if exists oxxen_aliases_require_owner_aal2 on public.oxxen_connect_card_aliases;
create policy oxxen_aliases_require_owner_aal2
on public.oxxen_connect_card_aliases
as restrictive
for all
to authenticated
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

drop policy if exists oxxen_events_require_owner_aal2 on public.oxxen_connect_analytics_events;
create policy oxxen_events_require_owner_aal2
on public.oxxen_connect_analytics_events
as restrictive
for all
to authenticated
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

drop policy if exists oxxen_audit_require_owner_aal2 on public.oxxen_connect_audit_logs;
create policy oxxen_audit_require_owner_aal2
on public.oxxen_connect_audit_logs
as restrictive
for all
to authenticated
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

drop policy if exists oxxen_media_require_owner_aal2 on storage.objects;
create policy oxxen_media_require_owner_aal2
on storage.objects
as restrictive
for all
to authenticated
using (
  bucket_id <> 'oxxen-connect-media'
  or not exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid()) and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  bucket_id <> 'oxxen-connect-media'
  or not exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid()) and a.role = 'OWNER'
  )
  or (select auth.jwt()->>'aal') = 'aal2'
);
