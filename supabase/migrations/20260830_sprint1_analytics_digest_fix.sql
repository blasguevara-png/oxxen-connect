-- Supabase installs pgcrypto functions in the extensions schema.
-- Qualify digest explicitly so the SECURITY DEFINER function works with a locked search_path.
create or replace function public.record_public_event(
  p_identifier text,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb,
  p_session_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
  v_headers jsonb := '{}'::jsonb;
  v_forwarded text;
  v_user_agent text;
  v_visitor_hash text;
  v_recent_count integer;
begin
  if p_event_type not in (
    'view','whatsapp','phone','email','website','instagram','facebook',
    'tiktok','linkedin','maps','vcard','share'
  ) then
    return false;
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 2048 then
    return false;
  end if;

  if p_session_id is not null and length(p_session_id) > 100 then
    return false;
  end if;

  select c.id
  into v_card_id
  from public.oxxen_connect_cards c
  where c.active = true
    and c.deleted_at is null
    and (
      c.public_id = p_identifier
      or c.slug = p_identifier
      or exists (
        select 1 from public.oxxen_connect_card_aliases a
        where a.card_id = c.id and a.alias = p_identifier
      )
    )
  limit 1;

  if v_card_id is null then
    return false;
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_forwarded := split_part(
    coalesce(
      v_headers->>'cf-connecting-ip',
      v_headers->>'x-real-ip',
      v_headers->>'x-forwarded-for',
      'unknown'
    ),
    ',',
    1
  );
  v_user_agent := coalesce(v_headers->>'user-agent', 'unknown');

  v_visitor_hash := encode(
    extensions.digest(
      trim(v_forwarded) || '|' || v_user_agent || '|' || current_date::text,
      'sha256'
    ),
    'hex'
  );

  select count(*)::integer
  into v_recent_count
  from public.oxxen_connect_analytics_events e
  where e.visitor_hash = v_visitor_hash
    and e.created_at >= now() - interval '1 minute';

  if v_recent_count >= 30 then
    return false;
  end if;

  if p_event_type = 'view' and p_session_id is not null and exists (
    select 1
    from public.oxxen_connect_analytics_events e
    where e.card_id = v_card_id
      and e.event_type = 'view'
      and e.session_id = p_session_id
      and e.created_at >= now() - interval '10 minutes'
  ) then
    return true;
  end if;

  insert into public.oxxen_connect_analytics_events(
    card_id,
    event_type,
    metadata,
    session_id,
    visitor_hash
  ) values (
    v_card_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(p_session_id, ''),
    v_visitor_hash
  );

  return true;
end;
$$;

revoke all on function public.record_public_event(text, text, jsonb, text) from public;
grant execute on function public.record_public_event(text, text, jsonb, text) to anon, authenticated;
