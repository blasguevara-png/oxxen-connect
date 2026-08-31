-- OXXEN Connect Sprint 2 closeout: avoid per-row re-evaluation of the OWNER MFA predicate.
-- Supabase Performance Advisor recommends wrapping stable auth/RLS helper calls in SELECT.

drop policy if exists oxxen_cards_require_owner_aal2 on public.oxxen_connect_cards;
create policy oxxen_cards_require_owner_aal2
on public.oxxen_connect_cards
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

drop policy if exists oxxen_aliases_require_owner_aal2 on public.oxxen_connect_card_aliases;
create policy oxxen_aliases_require_owner_aal2
on public.oxxen_connect_card_aliases
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

drop policy if exists oxxen_events_require_owner_aal2 on public.oxxen_connect_analytics_events;
create policy oxxen_events_require_owner_aal2
on public.oxxen_connect_analytics_events
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

drop policy if exists oxxen_audit_require_owner_aal2 on public.oxxen_connect_audit_logs;
create policy oxxen_audit_require_owner_aal2
on public.oxxen_connect_audit_logs
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

drop policy if exists oxxen_media_require_owner_aal2 on storage.objects;
create policy oxxen_media_require_owner_aal2
on storage.objects
as restrictive
for all
to authenticated
using (
  bucket_id <> 'oxxen-connect-media'
  or not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  bucket_id <> 'oxxen-connect-media'
  or not (select public.oxxen_connect_current_admin_requires_aal2())
  or (select auth.jwt()->>'aal') = 'aal2'
);
