-- Sprint 3.3 integrity follow-up, applied in the same rollout before production use.
-- Allow multiple physical NFC assets to point at one digital card while keeping each asset linked to only one card.

drop index if exists public.uq_oxxen_connect_nfc_assets_card_id;
create index if not exists idx_oxxen_connect_nfc_assets_card_id
  on public.oxxen_connect_nfc_assets(card_id) where card_id is not null;

create or replace function public.oxxen_connect_validate_nfc_uid()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_raw text;
  v_normalized text;
begin
  v_raw := trim(coalesce(new.uid, ''));
  if v_raw = '' then
    new.uid := null;
    return new;
  end if;

  -- Accept common human-readable separators only; never silently discard arbitrary garbage.
  v_normalized := upper(regexp_replace(v_raw, '[:\-[:space:]]', '', 'g'));
  if v_normalized !~ '^[0-9A-F]{8,32}$' then
    raise exception 'UID NFC inválido' using errcode = '23514';
  end if;

  new.uid := v_normalized;
  return new;
end;
$$;

drop trigger if exists trg_00_oxxen_connect_validate_nfc_uid on public.oxxen_connect_nfc_assets;
create trigger trg_00_oxxen_connect_validate_nfc_uid
before insert or update of uid on public.oxxen_connect_nfc_assets
for each row execute function public.oxxen_connect_validate_nfc_uid();

revoke all on function public.oxxen_connect_validate_nfc_uid() from public, anon, authenticated;
