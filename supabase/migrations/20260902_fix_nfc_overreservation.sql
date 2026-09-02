-- Fix: NFC reservations must never exceed the number of NFC units requested by an order.
-- Also repairs legacy reserved assets that belong to an order but lost their order_item_id.

create or replace function public.oxxen_connect_reserve_nfc_assets(
  p_order_id uuid,
  p_quantity integer,
  p_order_item_id uuid default null
)
returns setof public.oxxen_connect_nfc_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_order_status text;
  v_requested integer;
  v_covered integer;
  v_remaining integer;
  v_item record;
  v_item_covered integer;
  v_item_remaining integer;
  v_to_allocate integer;
  v_chunk_size integer;
  v_chunk_ids uuid[];
  v_result_ids uuid[] := '{}'::uuid[];
  v_selected integer;
begin
  select a.role into v_role
  from public.oxxen_connect_admins a
  where a.user_id = auth.uid();

  if v_role not in ('OWNER','ADMIN') then
    raise exception 'Permiso insuficiente para reservar inventario NFC' using errcode = '42501';
  end if;

  if v_role = 'OWNER' and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'OWNER requiere AAL2' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'La cantidad debe estar entre 1 y 500' using errcode = '22023';
  end if;

  -- Serialize reservations for the same order. This prevents two admins from
  -- passing the remaining-capacity check at the same time.
  select o.status into v_order_status
  from public.oxxen_connect_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado' using errcode = '23503';
  end if;

  if v_order_status in ('cancelled','delivered') then
    raise exception 'No se puede reservar NFC para un pedido %', v_order_status using errcode = '23514';
  end if;

  select coalesce(sum(i.quantity), 0)::integer into v_requested
  from public.oxxen_connect_order_items i
  where i.order_id = p_order_id
    and i.item_type = 'nfc_card';

  if v_requested <= 0 then
    raise exception 'El pedido no solicita tarjetas NFC' using errcode = '23514';
  end if;

  -- Only healthy fulfillment states count toward the requested quantity.
  -- defective/lost/retired assets do not satisfy the order and may be replaced.
  select count(*)::integer into v_covered
  from public.oxxen_connect_nfc_assets a
  where a.order_id = p_order_id
    and a.status in ('reserved','programmed','assigned','delivered');

  if v_covered > v_requested then
    raise exception 'El pedido tiene % NFC cubiertos pero solo solicita %. Corrige la inconsistencia antes de reservar más.', v_covered, v_requested using errcode = '23514';
  end if;

  v_remaining := v_requested - v_covered;
  if p_quantity > v_remaining then
    raise exception 'El pedido solicita % NFC, ya tiene % cubiertos y solo faltan %. No se pueden reservar % más.', v_requested, v_covered, v_remaining, p_quantity using errcode = '23514';
  end if;

  if p_order_item_id is not null then
    select i.id, i.quantity, i.item_type into v_item
    from public.oxxen_connect_order_items i
    where i.id = p_order_item_id
      and i.order_id = p_order_id
    for update;

    if not found then
      raise exception 'El order item no pertenece al pedido' using errcode = '23514';
    end if;

    if v_item.item_type <> 'nfc_card' then
      raise exception 'El order item seleccionado no solicita una tarjeta NFC' using errcode = '23514';
    end if;

    select count(*)::integer into v_item_covered
    from public.oxxen_connect_nfc_assets a
    where a.order_item_id = v_item.id
      and a.status in ('reserved','programmed','assigned','delivered');

    v_item_remaining := greatest(v_item.quantity - v_item_covered, 0);
    if p_quantity > v_item_remaining then
      raise exception 'Este item solicita % NFC, ya tiene % cubiertos y solo faltan %.', v_item.quantity, v_item_covered, v_item_remaining using errcode = '23514';
    end if;

    select array_agg(selected.id) into v_chunk_ids
    from (
      select a.id
      from public.oxxen_connect_nfc_assets a
      where a.status = 'available'
      order by a.created_at, a.asset_number
      for update skip locked
      limit p_quantity
    ) selected;

    v_selected := coalesce(array_length(v_chunk_ids, 1), 0);
    if v_selected <> p_quantity then
      raise exception 'Inventario NFC disponible insuficiente o temporalmente bloqueado: % seleccionado(s), % solicitado(s)', v_selected, p_quantity using errcode = 'P0001';
    end if;

    update public.oxxen_connect_nfc_assets a
       set order_id = p_order_id,
           order_item_id = v_item.id,
           status = 'reserved'
     where a.id = any(v_chunk_ids);

    v_result_ids := v_chunk_ids;
  else
    -- Automatic allocation: fill each NFC order item only up to its quantity.
    -- This removes the old behavior that created reservations with Order Item = —.
    v_to_allocate := p_quantity;

    for v_item in
      select i.id, i.quantity, i.item_type
      from public.oxxen_connect_order_items i
      where i.order_id = p_order_id
        and i.item_type = 'nfc_card'
      order by i.created_at, i.id
      for update
    loop
      select count(*)::integer into v_item_covered
      from public.oxxen_connect_nfc_assets a
      where a.order_item_id = v_item.id
        and a.status in ('reserved','programmed','assigned','delivered');

      v_item_remaining := greatest(v_item.quantity - v_item_covered, 0);
      if v_item_remaining = 0 then
        continue;
      end if;

      v_chunk_size := least(v_item_remaining, v_to_allocate);
      select array_agg(selected.id) into v_chunk_ids
      from (
        select a.id
        from public.oxxen_connect_nfc_assets a
        where a.status = 'available'
        order by a.created_at, a.asset_number
        for update skip locked
        limit v_chunk_size
      ) selected;

      v_selected := coalesce(array_length(v_chunk_ids, 1), 0);
      if v_selected <> v_chunk_size then
        raise exception 'Inventario NFC disponible insuficiente o temporalmente bloqueado: % seleccionado(s), % solicitado(s)', v_selected, v_chunk_size using errcode = 'P0001';
      end if;

      update public.oxxen_connect_nfc_assets a
         set order_id = p_order_id,
             order_item_id = v_item.id,
             status = 'reserved'
       where a.id = any(v_chunk_ids);

      v_result_ids := v_result_ids || v_chunk_ids;
      v_to_allocate := v_to_allocate - v_chunk_size;
      exit when v_to_allocate = 0;
    end loop;

    if v_to_allocate <> 0 then
      raise exception 'No se pudo distribuir la reserva entre los items NFC del pedido' using errcode = '23514';
    end if;
  end if;

  return query
  select a.*
  from public.oxxen_connect_nfc_assets a
  where a.id = any(v_result_ids)
  order by a.asset_number;
end;
$$;

revoke all on function public.oxxen_connect_reserve_nfc_assets(uuid, integer, uuid) from public, anon;
grant execute on function public.oxxen_connect_reserve_nfc_assets(uuid, integer, uuid) to authenticated;

-- One-time repair for historical reserved assets that were attached only to an
-- order. Assign each orphan to the first NFC item in that same order that still
-- has unfilled capacity. This does not alter UID, card_id, public_id, QR or NFC URL.
do $$
declare
  v_asset record;
  v_target_item uuid;
begin
  for v_asset in
    select a.id, a.order_id
    from public.oxxen_connect_nfc_assets a
    where a.status = 'reserved'
      and a.order_id is not null
      and a.order_item_id is null
    order by a.created_at, a.asset_number
    for update
  loop
    select i.id into v_target_item
    from public.oxxen_connect_order_items i
    where i.order_id = v_asset.order_id
      and i.item_type = 'nfc_card'
      and (
        select count(*)
        from public.oxxen_connect_nfc_assets linked
        where linked.order_item_id = i.id
          and linked.status in ('reserved','programmed','assigned','delivered')
      ) < i.quantity
    order by i.created_at, i.id
    limit 1;

    if v_target_item is not null then
      update public.oxxen_connect_nfc_assets
      set order_item_id = v_target_item
      where id = v_asset.id;
    end if;
  end loop;
end;
$$;
