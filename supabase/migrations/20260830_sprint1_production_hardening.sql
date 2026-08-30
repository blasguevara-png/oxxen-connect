-- OXXEN Connect — Sprint 1 production hardening
-- Non-destructive migration: preserves current cards, slugs, analytics and legacy URLs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Permanent, non-editable public IDs for physical QR/NFC
-- ---------------------------------------------------------------------------
alter table public.oxxen_connect_cards
  add column if not exists public_id text;

update public.oxxen_connect_cards
set public_id = encode(gen_random_bytes(12), 'hex')
where public_id is null or btrim(public_id) = '';

alter table public.oxxen_connect_cards
  alter column public_id set default encode(gen_random_bytes(12), 'hex'),
  alter column public_id set not null;

create unique index if not exists idx_oxxen_connect_cards_public_id
  on public.oxxen_connect_cards(public_id);

alter table public.oxxen_connect_cards
  add column if not exists deleted_at timestamptz;

create index if not exists idx_oxxen_connect_cards_deleted_at
  on public.oxxen_connect_cards(deleted_at)
  where deleted_at is not null;

create or replace function public.oxxen_connect_protect_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.public_id is distinct from new.public_id then
    raise exception 'public_id is permanent and cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_oxxen_connect_protect_public_id on public.oxxen_connect_cards;
create trigger trg_oxxen_connect_protect_public_id
before update of public_id on public.oxxen_connect_cards
for each row execute function public.oxxen_connect_protect_public_id();

-- ---------------------------------------------------------------------------
-- 2) Legacy aliases: old printed QR/NFC URLs keep resolving forever
-- ---------------------------------------------------------------------------
create table if not exists public.oxxen_connect_card_aliases (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.oxxen_connect_cards(id) on delete restrict,
  alias text not null unique,
  created_at timestamptz not null default now(),
  constraint oxxen_connect_alias_format check (alias ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists idx_oxxen_connect_card_aliases_card_id
  on public.oxxen_connect_card_aliases(card_id);

insert into public.oxxen_connect_card_aliases(card_id, alias)
select id, slug
from public.oxxen_connect_cards
on conflict (alias) do nothing;

create or replace function public.oxxen_connect_sync_slug_aliases()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.oxxen_connect_card_aliases(card_id, alias)
    values (new.id, new.slug)
    on conflict (alias) do update
      set card_id = excluded.card_id
      where public.oxxen_connect_card_aliases.card_id = excluded.card_id;
    return new;
  end if;

  if old.slug is distinct from new.slug then
    -- Preserve the old slug and reserve the new one for this same card.
    insert into public.oxxen_connect_card_aliases(card_id, alias)
    values (old.id, old.slug)
    on conflict (alias) do nothing;

    if exists (
      select 1
      from public.oxxen_connect_card_aliases a
      where a.alias = new.slug
        and a.card_id <> new.id
    ) then
      raise exception 'This slug was previously assigned to another card and cannot be reused';
    end if;

    insert into public.oxxen_connect_card_aliases(card_id, alias)
    values (new.id, new.slug)
    on conflict (alias) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_oxxen_connect_sync_slug_aliases on public.oxxen_connect_cards;
create trigger trg_oxxen_connect_sync_slug_aliases
after insert or update of slug on public.oxxen_connect_cards
for each row execute function public.oxxen_connect_sync_slug_aliases();

-- ---------------------------------------------------------------------------
-- 3) Public profile access: single-card RPC, no anonymous table enumeration
-- ---------------------------------------------------------------------------
alter table public.oxxen_connect_card_aliases enable row level security;

drop policy if exists oxxen_cards_public_read_active on public.oxxen_connect_cards;
drop policy if exists oxxen_cards_admin_read on public.oxxen_connect_cards;
create policy oxxen_cards_admin_read
on public.oxxen_connect_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists oxxen_aliases_admin_read on public.oxxen_connect_card_aliases;
create policy oxxen_aliases_admin_read
on public.oxxen_connect_card_aliases
for select
to authenticated
using (
  exists (
    select 1
    from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);

-- RLS performance hardening for the existing admin policies.
drop policy if exists oxxen_admin_self_read on public.oxxen_connect_admins;
create policy oxxen_admin_self_read
on public.oxxen_connect_admins
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists oxxen_cards_admin_insert on public.oxxen_connect_cards;
create policy oxxen_cards_admin_insert
on public.oxxen_connect_cards
for insert
to authenticated
with check (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists oxxen_cards_admin_update on public.oxxen_connect_cards;
create policy oxxen_cards_admin_update
on public.oxxen_connect_cards
for update
to authenticated
using (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);

-- Hard delete is intentionally removed from normal application access.
drop policy if exists oxxen_cards_admin_delete on public.oxxen_connect_cards;

create or replace function public.get_public_card(p_identifier text)
returns table (
  public_id text,
  full_name text,
  company text,
  job_title text,
  bio text,
  whatsapp text,
  phone text,
  email text,
  website text,
  instagram text,
  facebook text,
  tiktok text,
  linkedin text,
  address text,
  maps_url text,
  cta_text text,
  accent_color text,
  theme text,
  profile_image_url text,
  logo_url text,
  links_order jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.public_id,
    c.full_name,
    c.company,
    c.job_title,
    c.bio,
    c.whatsapp,
    c.phone,
    c.email,
    c.website,
    c.instagram,
    c.facebook,
    c.tiktok,
    c.linkedin,
    c.address,
    c.maps_url,
    c.cta_text,
    c.accent_color,
    c.theme,
    c.profile_image_url,
    c.logo_url,
    c.links_order
  from public.oxxen_connect_cards c
  where c.active = true
    and c.deleted_at is null
    and (
      c.public_id = p_identifier
      or c.slug = p_identifier
      or exists (
        select 1
        from public.oxxen_connect_card_aliases a
        where a.card_id = c.id
          and a.alias = p_identifier
      )
    )
  limit 1;
$$;

revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;

create or replace function public.get_public_card_status(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.oxxen_connect_cards c
      where (
        c.public_id = p_identifier
        or c.slug = p_identifier
        or exists (
          select 1 from public.oxxen_connect_card_aliases a
          where a.card_id = c.id and a.alias = p_identifier
        )
      )
      and c.deleted_at is not null
    ) then 'archived'
    when exists (
      select 1
      from public.oxxen_connect_cards c
      where (
        c.public_id = p_identifier
        or c.slug = p_identifier
        or exists (
          select 1 from public.oxxen_connect_card_aliases a
          where a.card_id = c.id and a.alias = p_identifier
        )
      )
      and c.deleted_at is null
      and c.active = false
    ) then 'inactive'
    when exists (
      select 1
      from public.oxxen_connect_cards c
      where (
        c.public_id = p_identifier
        or c.slug = p_identifier
        or exists (
          select 1 from public.oxxen_connect_card_aliases a
          where a.card_id = c.id and a.alias = p_identifier
        )
      )
    ) then 'active'
    else 'missing'
  end;
$$;

revoke all on function public.get_public_card_status(text) from public;
grant execute on function public.get_public_card_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Analytics: no direct anonymous INSERT; use a rate-limited RPC
-- ---------------------------------------------------------------------------
alter table public.oxxen_connect_analytics_events
  add column if not exists session_id text,
  add column if not exists visitor_hash text;

create index if not exists idx_oxxen_events_visitor_created
  on public.oxxen_connect_analytics_events(visitor_hash, created_at desc)
  where visitor_hash is not null;

create index if not exists idx_oxxen_events_session_card_created
  on public.oxxen_connect_analytics_events(card_id, session_id, event_type, created_at desc)
  where session_id is not null;

drop policy if exists oxxen_events_public_insert on public.oxxen_connect_analytics_events;

drop policy if exists oxxen_events_admin_read on public.oxxen_connect_analytics_events;
create policy oxxen_events_admin_read
on public.oxxen_connect_analytics_events
for select
to authenticated
using (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);

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

  -- Only a daily rotating hash is stored; raw IP addresses are never persisted.
  v_visitor_hash := encode(
    digest(
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

  -- A normal browser session should count at most one profile view every 10 minutes.
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

-- Keep Storage write policies, but optimize auth.uid() calls for scale.
drop policy if exists oxxen_media_admin_insert on storage.objects;
create policy oxxen_media_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'oxxen-connect-media'
  and exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists oxxen_media_admin_update on storage.objects;
create policy oxxen_media_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'oxxen-connect-media'
  and exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'oxxen-connect-media'
  and exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists oxxen_media_admin_delete on storage.objects;
create policy oxxen_media_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'oxxen-connect-media'
  and exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = (select auth.uid())
  )
);
