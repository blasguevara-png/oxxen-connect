-- OXXEN Connect MVP
-- Reproducible schema isolated from QHAPAQ PANGOA tables.

create extension if not exists pgcrypto;

create table if not exists public.oxxen_connect_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.oxxen_connect_cards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  full_name text not null,
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
  cta_text text not null default 'Guardar contacto',
  accent_color text not null default '#20e3b2',
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  profile_image_url text,
  logo_url text,
  active boolean not null default true,
  links_order jsonb not null default '["whatsapp","phone","email","website","maps","instagram","facebook","tiktok","linkedin"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oxxen_connect_cards_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.oxxen_connect_analytics_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.oxxen_connect_cards(id) on delete cascade,
  event_type text not null check (
    event_type in ('view','whatsapp','phone','email','website','instagram','facebook','tiktok','linkedin','maps','vcard')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_oxxen_connect_cards_slug
  on public.oxxen_connect_cards(slug);
create index if not exists idx_oxxen_connect_cards_active
  on public.oxxen_connect_cards(active);
create index if not exists idx_oxxen_connect_events_card_type_created
  on public.oxxen_connect_analytics_events(card_id, event_type, created_at desc);

create or replace function public.oxxen_connect_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_oxxen_connect_cards_updated_at on public.oxxen_connect_cards;
create trigger trg_oxxen_connect_cards_updated_at
before update on public.oxxen_connect_cards
for each row execute function public.oxxen_connect_set_updated_at();

alter table public.oxxen_connect_admins enable row level security;
alter table public.oxxen_connect_cards enable row level security;
alter table public.oxxen_connect_analytics_events enable row level security;

-- Admins: a signed-in user can only verify their own admin row.
drop policy if exists oxxen_admin_self_read on public.oxxen_connect_admins;
create policy oxxen_admin_self_read
on public.oxxen_connect_admins
for select
to authenticated
using (user_id = auth.uid());

-- Cards: active cards are public; admins can also read inactive cards.
drop policy if exists oxxen_cards_public_read_active on public.oxxen_connect_cards;
create policy oxxen_cards_public_read_active
on public.oxxen_connect_cards
for select
to anon, authenticated
using (
  active = true
  or exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = auth.uid()
  )
);

drop policy if exists oxxen_cards_admin_insert on public.oxxen_connect_cards;
create policy oxxen_cards_admin_insert
on public.oxxen_connect_cards
for insert
to authenticated
with check (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = auth.uid()
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
    where a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = auth.uid()
  )
);

drop policy if exists oxxen_cards_admin_delete on public.oxxen_connect_cards;
create policy oxxen_cards_admin_delete
on public.oxxen_connect_cards
for delete
to authenticated
using (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = auth.uid()
  )
);

-- Analytics: public profiles may record only allowlisted events for active cards.
drop policy if exists oxxen_events_public_insert on public.oxxen_connect_analytics_events;
create policy oxxen_events_public_insert
on public.oxxen_connect_analytics_events
for insert
to anon, authenticated
with check (
  event_type in ('view','whatsapp','phone','email','website','instagram','facebook','tiktok','linkedin','maps','vcard')
  and exists (
    select 1 from public.oxxen_connect_cards c
    where c.id = oxxen_connect_analytics_events.card_id
      and c.active = true
  )
);

drop policy if exists oxxen_events_admin_read on public.oxxen_connect_analytics_events;
create policy oxxen_events_admin_read
on public.oxxen_connect_analytics_events
for select
to authenticated
using (
  exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = auth.uid()
  )
);

-- Public media bucket for profile photos and logos. Only admins can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'oxxen-connect-media',
  'oxxen-connect-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists oxxen_media_public_read on storage.objects;
create policy oxxen_media_public_read
on storage.objects
for select
to public
using (bucket_id = 'oxxen-connect-media');

drop policy if exists oxxen_media_admin_insert on storage.objects;
create policy oxxen_media_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'oxxen-connect-media'
  and exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = auth.uid()
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
    where a.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'oxxen-connect-media'
  and exists (
    select 1 from public.oxxen_connect_admins a
    where a.user_id = auth.uid()
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
    where a.user_id = auth.uid()
  )
);
