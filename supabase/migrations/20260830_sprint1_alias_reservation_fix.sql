-- Prevent any historical slug/alias from ever being reused by a different card.
create or replace function public.oxxen_connect_sync_slug_aliases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
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
    return new;
  end if;

  if old.slug is distinct from new.slug then
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
