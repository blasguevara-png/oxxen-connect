-- OXXEN Connect Sprint 2: analytics scalability and storage boundary
create or replace function public.get_card_analytics_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  card_id uuid,
  views bigint,
  whatsapp bigint,
  phone bigint,
  email bigint,
  website bigint,
  instagram bigint,
  facebook bigint,
  tiktok bigint,
  linkedin bigint,
  maps bigint,
  vcard bigint,
  share bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    count(e.id) filter (where e.event_type = 'view')::bigint,
    count(e.id) filter (where e.event_type = 'whatsapp')::bigint,
    count(e.id) filter (where e.event_type = 'phone')::bigint,
    count(e.id) filter (where e.event_type = 'email')::bigint,
    count(e.id) filter (where e.event_type = 'website')::bigint,
    count(e.id) filter (where e.event_type = 'instagram')::bigint,
    count(e.id) filter (where e.event_type = 'facebook')::bigint,
    count(e.id) filter (where e.event_type = 'tiktok')::bigint,
    count(e.id) filter (where e.event_type = 'linkedin')::bigint,
    count(e.id) filter (where e.event_type = 'maps')::bigint,
    count(e.id) filter (where e.event_type = 'vcard')::bigint,
    count(e.id) filter (where e.event_type = 'share')::bigint
  from public.oxxen_connect_cards c
  left join public.oxxen_connect_analytics_events e
    on e.card_id = c.id
   and (p_from is null or e.created_at >= p_from)
   and (p_to is null or e.created_at < p_to)
  group by c.id;
$$;
revoke all on function public.get_card_analytics_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_card_analytics_summary(timestamptz, timestamptz) to authenticated;

create or replace view public.oxxen_connect_analytics_daily
with (security_invoker = true)
as
select
  (e.created_at at time zone 'UTC')::date as date,
  e.card_id,
  count(*) filter (where e.event_type = 'view')::bigint as views,
  count(*) filter (where e.event_type = 'whatsapp')::bigint as whatsapp,
  count(*) filter (where e.event_type = 'phone')::bigint as phone,
  count(*) filter (where e.event_type = 'email')::bigint as email,
  count(*) filter (where e.event_type = 'website')::bigint as website,
  count(*) filter (where e.event_type = 'instagram')::bigint as instagram,
  count(*) filter (where e.event_type = 'facebook')::bigint as facebook,
  count(*) filter (where e.event_type = 'tiktok')::bigint as tiktok,
  count(*) filter (where e.event_type = 'linkedin')::bigint as linkedin,
  count(*) filter (where e.event_type = 'maps')::bigint as maps,
  count(*) filter (where e.event_type = 'vcard')::bigint as vcard,
  count(*) filter (where e.event_type = 'share')::bigint as share
from public.oxxen_connect_analytics_events e
group by 1, 2;
revoke all on public.oxxen_connect_analytics_daily from public, anon;
grant select on public.oxxen_connect_analytics_daily to authenticated;

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'oxxen-connect-media';
