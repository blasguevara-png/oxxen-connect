-- OXXEN Connect Sprint 2: roles and audit log
alter table public.oxxen_connect_admins add column if not exists role text not null default 'OWNER';
alter table public.oxxen_connect_admins drop constraint if exists oxxen_connect_admins_role_check;
alter table public.oxxen_connect_admins add constraint oxxen_connect_admins_role_check check (role in ('OWNER','ADMIN','EDITOR','SUPPORT','SALES'));

create table if not exists public.oxxen_connect_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  card_id uuid references public.oxxen_connect_cards(id) on delete set null,
  action text not null,
  entity_type text not null default 'card',
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_oxxen_connect_audit_card_created on public.oxxen_connect_audit_logs(card_id, created_at desc);
create index if not exists idx_oxxen_connect_audit_admin_created on public.oxxen_connect_audit_logs(admin_id, created_at desc);
alter table public.oxxen_connect_audit_logs enable row level security;
drop policy if exists oxxen_audit_admin_read on public.oxxen_connect_audit_logs;
create policy oxxen_audit_admin_read on public.oxxen_connect_audit_logs for select to authenticated using (
  exists (select 1 from public.oxxen_connect_admins a where a.user_id = (select auth.uid()))
);
revoke all on public.oxxen_connect_audit_logs from public, anon;
grant select on public.oxxen_connect_audit_logs to authenticated;
revoke insert, update, delete on public.oxxen_connect_audit_logs from authenticated;

create or replace function public.oxxen_connect_audit_card_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text := 'UPDATE_CARD';
  v_changed text[] := array[]::text[];
begin
  if tg_op = 'INSERT' then
    insert into public.oxxen_connect_audit_logs(admin_id, card_id, action, old_value, new_value, metadata)
    values (auth.uid(), new.id, 'CREATE_CARD', null, to_jsonb(new) - 'updated_at', jsonb_build_object('changed_fields', array['create']));
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then v_action := 'ARCHIVE_CARD';
  elsif old.deleted_at is not null and new.deleted_at is null then v_action := 'RESTORE_CARD';
  elsif old.active is distinct from new.active then v_action := case when new.active then 'ACTIVATE_CARD' else 'DEACTIVATE_CARD' end;
  elsif old.slug is distinct from new.slug then v_action := 'CHANGE_SLUG';
  elsif old.profile_image_url is distinct from new.profile_image_url then v_action := 'UPLOAD_PROFILE_IMAGE';
  elsif old.logo_url is distinct from new.logo_url then v_action := 'UPLOAD_LOGO';
  elsif old.phone is distinct from new.phone or old.whatsapp is distinct from new.whatsapp then v_action := 'CHANGE_PHONE';
  elsif old.email is distinct from new.email then v_action := 'CHANGE_EMAIL';
  elsif old.website is distinct from new.website or old.maps_url is distinct from new.maps_url then v_action := 'CHANGE_URL';
  end if;
  if old.slug is distinct from new.slug then v_changed := array_append(v_changed, 'slug'); end if;
  if old.full_name is distinct from new.full_name then v_changed := array_append(v_changed, 'full_name'); end if;
  if old.company is distinct from new.company then v_changed := array_append(v_changed, 'company'); end if;
  if old.job_title is distinct from new.job_title then v_changed := array_append(v_changed, 'job_title'); end if;
  if old.bio is distinct from new.bio then v_changed := array_append(v_changed, 'bio'); end if;
  if old.whatsapp is distinct from new.whatsapp then v_changed := array_append(v_changed, 'whatsapp'); end if;
  if old.phone is distinct from new.phone then v_changed := array_append(v_changed, 'phone'); end if;
  if old.email is distinct from new.email then v_changed := array_append(v_changed, 'email'); end if;
  if old.website is distinct from new.website then v_changed := array_append(v_changed, 'website'); end if;
  if old.maps_url is distinct from new.maps_url then v_changed := array_append(v_changed, 'maps_url'); end if;
  if old.profile_image_url is distinct from new.profile_image_url then v_changed := array_append(v_changed, 'profile_image_url'); end if;
  if old.logo_url is distinct from new.logo_url then v_changed := array_append(v_changed, 'logo_url'); end if;
  if old.active is distinct from new.active then v_changed := array_append(v_changed, 'active'); end if;
  if old.deleted_at is distinct from new.deleted_at then v_changed := array_append(v_changed, 'deleted_at'); end if;
  if coalesce(array_length(v_changed, 1), 0) > 0 then
    insert into public.oxxen_connect_audit_logs(admin_id, card_id, action, old_value, new_value, metadata)
    values (auth.uid(), new.id, v_action, to_jsonb(old) - 'updated_at', to_jsonb(new) - 'updated_at', jsonb_build_object('changed_fields', to_jsonb(v_changed)));
  end if;
  return new;
end;
$$;
revoke all on function public.oxxen_connect_audit_card_change() from public, anon, authenticated;
drop trigger if exists trg_oxxen_connect_audit_card_change on public.oxxen_connect_cards;
create trigger trg_oxxen_connect_audit_card_change after insert or update on public.oxxen_connect_cards for each row execute function public.oxxen_connect_audit_card_change();
