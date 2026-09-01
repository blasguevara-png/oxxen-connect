-- Sprint 3.3 helper: reserve available physical NFC assets atomically for an order.
-- Applies only after 20260901_sprint3_3_nfc_inventory.sql.

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
  v_order_exists boolean;
  v_item_order uuid;
  v_count integer;
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

  select exists(select 1 from public.oxxen_connect_orders o where o.id = p_order_id) into v_order_exists;
  if not v_order_exists then
    raise exception 'Pedido no encontrado' using errcode = '23503';
  end if;

  if p_order_item_id is not null then
    select i.order_id into v_item_order from public.oxxen_connect_order_items i where i.id = p_order_item_id;
    if v_item_order is null or v_item_order <> p_order_id then
      raise exception 'El order item no pertenece al pedido' using errcode = '23514';
    end if;
  end if;

  select count(*) into v_count
  from public.oxxen_connect_nfc_assets a
  where a.status = 'available';
  if v_count < p_quantity then
    raise exception 'Inventario NFC disponible insuficiente: % disponible(s), % solicitado(s)', v_count, p_quantity using errcode = 'P0001';
  end if;

  return query
  with selected as (
    select a.id
    from public.oxxen_connect_nfc_assets a
    where a.status = 'available'
    order by a.created_at, a.asset_number
    for update skip locked
    limit p_quantity
  ), updated as (
    update public.oxxen_connect_nfc_assets a
       set order_id = p_order_id,
           order_item_id = p_order_item_id,
           status = 'reserved'
      from selected s
     where a.id = s.id
     returning a.*
  )
  select * from updated;
end;
$$;

revoke all on function public.oxxen_connect_reserve_nfc_assets(uuid,integer,uuid) from public, anon;
grant execute on function public.oxxen_connect_reserve_nfc_assets(uuid,integer,uuid) to authenticated;
