-- Defense in depth: enforce NFC request capacity for every row-level write,
-- not only through oxxen_connect_reserve_nfc_assets(). This closes manual
-- edits from the NFC asset editor or any other authenticated write path.

create or replace function public.oxxen_connect_prepare_nfc_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item_order uuid;
  v_item_type text;
  v_item_quantity integer;
  v_order_status text;
  v_requested integer;
  v_existing_covered integer;
  v_item_covered integer;
  v_raw_uid text;
begin
  new.asset_code := 'NFC-' || lpad(new.asset_number::text, 6, '0');

  v_raw_uid := trim(coalesce(new.uid, ''));
  if v_raw_uid = '' then
    new.uid := null;
  else
    new.uid := upper(regexp_replace(v_raw_uid, '[[:space:]:-]', '', 'g'));
    if new.uid !~ '^[0-9A-F]{8,32}$' then
      raise exception 'UID NFC inválido' using errcode = '23514';
    end if;
  end if;

  new.batch_code := nullif(upper(trim(coalesce(new.batch_code, ''))), '');
  new.supplier := nullif(trim(coalesce(new.supplier, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');

  if new.order_item_id is not null then
    select i.order_id, i.item_type, i.quantity
      into v_item_order, v_item_type, v_item_quantity
    from public.oxxen_connect_order_items i
    where i.id = new.order_item_id;

    if v_item_order is null then
      raise exception 'order_item_id no existe' using errcode = '23503';
    end if;

    if new.order_id is null then
      new.order_id := v_item_order;
    elsif new.order_id <> v_item_order then
      raise exception 'order_item_id no pertenece al order_id seleccionado' using errcode = '23514';
    end if;
  end if;

  if new.status = 'available' and (new.order_id is not null or new.order_item_id is not null or new.card_id is not null) then
    raise exception 'Un NFC disponible no debe conservar asignaciones' using errcode = '23514';
  end if;

  if new.status = 'reserved' and new.order_id is null then
    raise exception 'Un NFC reservado debe estar asociado a un pedido' using errcode = '23514';
  end if;

  if new.status in ('assigned','delivered') and new.card_id is null then
    raise exception 'Un NFC asignado/entregado requiere card_id' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  elsif old.status is distinct from new.status then
    if not (
      (old.status = 'available' and new.status in ('reserved','defective','lost','retired')) or
      (old.status = 'reserved' and new.status in ('available','programmed','defective','lost','retired')) or
      (old.status = 'programmed' and new.status in ('assigned','defective','lost','retired')) or
      (old.status = 'assigned' and new.status in ('delivered','defective','lost','retired')) or
      (old.status = 'defective' and new.status = 'retired') or
      (old.status = 'lost' and new.status = 'retired')
    ) then
      raise exception 'Transición NFC inválida: % -> %', old.status, new.status using errcode = '23514';
    end if;
  end if;

  -- Any healthy NFC that counts toward an order must map to an NFC order item.
  -- This prevents new "Order Item = —" reservations.
  if new.order_id is not null
     and new.status in ('reserved','programmed','assigned','delivered') then
    if new.order_item_id is null then
      raise exception 'Un NFC que cubre un pedido requiere order_item_id' using errcode = '23514';
    end if;

    if v_item_type is distinct from 'nfc_card' then
      raise exception 'El order_item_id seleccionado no es de tipo nfc_card' using errcode = '23514';
    end if;

    -- Serialize all capacity-affecting writes for the same order, including
    -- direct row updates from the asset editor.
    select o.status into v_order_status
    from public.oxxen_connect_orders o
    where o.id = new.order_id
    for update;

    if not found then
      raise exception 'order_id no existe' using errcode = '23503';
    end if;

    select coalesce(sum(i.quantity), 0)::integer into v_requested
    from public.oxxen_connect_order_items i
    where i.order_id = new.order_id
      and i.item_type = 'nfc_card';

    if v_requested <= 0 then
      raise exception 'El pedido no solicita tarjetas NFC' using errcode = '23514';
    end if;

    select count(*)::integer into v_existing_covered
    from public.oxxen_connect_nfc_assets a
    where a.order_id = new.order_id
      and a.status in ('reserved','programmed','assigned','delivered')
      and (tg_op = 'INSERT' or a.id <> new.id);

    if v_existing_covered >= v_requested then
      raise exception 'El pedido ya tiene cubiertas sus % unidades NFC; no se puede agregar otra.', v_requested using errcode = '23514';
    end if;

    select count(*)::integer into v_item_covered
    from public.oxxen_connect_nfc_assets a
    where a.order_item_id = new.order_item_id
      and a.status in ('reserved','programmed','assigned','delivered')
      and (tg_op = 'INSERT' or a.id <> new.id);

    if v_item_covered >= v_item_quantity then
      raise exception 'Este order item ya tiene cubiertas sus % unidades NFC; no se puede agregar otra.', v_item_quantity using errcode = '23514';
    end if;
  end if;

  if new.status = 'available' then
    new.reserved_at := null;
  elsif new.status = 'reserved' then
    new.reserved_at := coalesce(new.reserved_at, now());
  end if;

  if new.status = 'programmed' then
    new.programmed_at := coalesce(new.programmed_at, now());
  end if;

  if new.status = 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$;
