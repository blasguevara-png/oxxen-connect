-- OXXEN Connect — Sprint 3.5: transactional order editing
-- Additive/security-tightening migration. Does NOT mutate existing card identities,
-- public_id, slugs, aliases, QR/NFC destinations or public-profile RPC contracts.

create or replace function public.oxxen_connect_update_order_with_items(
  p_order_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_discount numeric default 0,
  p_notes text default null,
  p_currency text default 'PEN',
  p_status text default 'draft',
  p_payment_status text default 'pending',
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_order public.oxxen_connect_orders%rowtype;
  v_final public.oxxen_connect_orders%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_item_type text;
  v_description text;
  v_quantity integer;
  v_unit_price numeric;
  v_card_id uuid;
  v_card_customer uuid;
  v_existing public.oxxen_connect_order_items%rowtype;
  v_original_ids uuid[] := '{}'::uuid[];
  v_seen_ids uuid[] := '{}'::uuid[];
  v_changed_item_count integer := 0;
  v_card_change_count integer := 0;
  v_subtotal numeric(12,2);
  v_order_fields_changed boolean := false;
  v_status_changed boolean := false;
  v_payment_changed boolean := false;
begin
  select a.role into v_role
  from public.oxxen_connect_admins a
  where a.user_id = auth.uid();

  if v_role is null or v_role not in ('OWNER', 'ADMIN', 'SALES') then
    raise exception 'Permiso insuficiente para editar pedidos' using errcode = '42501';
  end if;

  if v_role = 'OWNER' and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'OWNER requiere AAL2' using errcode = '42501';
  end if;

  select * into v_order
  from public.oxxen_connect_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  if p_expected_updated_at is not null
     and v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido cambió desde que fue abierto. Recarga antes de guardar.' using errcode = '40001';
  end if;

  if not exists (
    select 1 from public.oxxen_connect_customers c
    where c.id = p_customer_id and c.status <> 'blocked'
  ) then
    raise exception 'Cliente no disponible para pedidos' using errcode = '23503';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido requiere al menos un item' using errcode = '22023';
  end if;

  if p_discount is null or p_discount < 0 then
    raise exception 'Descuento inválido' using errcode = '22023';
  end if;

  if p_currency is null or upper(trim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Moneda inválida' using errcode = '22023';
  end if;

  if p_status is null or p_status not in ('draft','confirmed','in_production','ready','delivered','cancelled') then
    raise exception 'Estado de pedido inválido' using errcode = '22023';
  end if;

  if p_payment_status is null or p_payment_status not in ('pending','partial','paid','refunded') then
    raise exception 'Estado de pago inválido' using errcode = '22023';
  end if;

  if p_status <> v_order.status and not (
    (v_order.status = 'draft' and p_status in ('confirmed','cancelled')) or
    (v_order.status = 'confirmed' and p_status in ('in_production','cancelled')) or
    (v_order.status = 'in_production' and p_status in ('ready','cancelled')) or
    (v_order.status = 'ready' and p_status in ('delivered','cancelled'))
  ) then
    raise exception 'Transición de pedido inválida: % -> %', v_order.status, p_status using errcode = '23514';
  end if;

  -- Commercial structure is immutable after leaving draft. Notes/payment/status
  -- remain administrative fields, but customer/discount/currency/items do not.
  if v_order.status <> 'draft' and (
    p_customer_id is distinct from v_order.customer_id
    or p_discount is distinct from v_order.discount
    or upper(trim(p_currency)) is distinct from v_order.currency
  ) then
    raise exception 'Cliente, moneda y descuento solo pueden editarse en borrador' using errcode = '23514';
  end if;

  -- Snapshot item identity before any insert. This makes omission detection
  -- deterministic and independent of transaction timestamp semantics.
  select coalesce(array_agg(i.id order by i.id), '{}'::uuid[])
    into v_original_ids
  from public.oxxen_connect_order_items i
  where i.order_id = p_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Item inválido' using errcode = '22023';
    end if;

    begin
      v_item_id := nullif(v_item->>'id', '')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
      v_unit_price := (v_item->>'unit_price')::numeric;
      v_card_id := nullif(v_item->>'card_id', '')::uuid;
    exception when others then
      raise exception 'ID, cantidad, precio o card_id inválido' using errcode = '22023';
    end;

    v_item_type := v_item->>'item_type';
    if v_item_type not in ('digital_card', 'nfc_card', 'service', 'other') then
      raise exception 'Tipo de item inválido' using errcode = '22023';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'La cantidad del item debe ser mayor que cero' using errcode = '22023';
    end if;
    if v_unit_price is null or v_unit_price < 0 then
      raise exception 'El precio unitario no puede ser negativo' using errcode = '22023';
    end if;
    if v_item_type in ('service','other') and v_card_id is not null then
      raise exception 'Servicios y otros items no pueden asociarse a una tarjeta' using errcode = '23514';
    end if;

    if v_card_id is not null then
      select c.customer_id into v_card_customer
      from public.oxxen_connect_cards c
      where c.id = v_card_id and c.deleted_at is null;
      if not found then
        raise exception 'Tarjeta no disponible' using errcode = '23503';
      end if;
      if v_card_customer is not null and v_card_customer <> p_customer_id then
        raise exception 'La tarjeta pertenece a un cliente distinto al pedido' using errcode = '23514';
      end if;
    end if;

    v_description := nullif(trim(coalesce(v_item->>'description', '')), '');

    if v_item_id is null then
      if v_order.status <> 'draft' then
        raise exception 'Solo se pueden agregar items mientras el pedido está en borrador' using errcode = '23514';
      end if;

      insert into public.oxxen_connect_order_items(
        order_id, item_type, description, quantity, unit_price, card_id
      ) values (
        p_order_id, v_item_type, v_description, v_quantity, v_unit_price, v_card_id
      );
      v_changed_item_count := v_changed_item_count + 1;
      if v_card_id is not null then v_card_change_count := v_card_change_count + 1; end if;
    else
      if array_position(v_seen_ids, v_item_id) is not null then
        raise exception 'Item duplicado en el payload' using errcode = '22023';
      end if;
      v_seen_ids := array_append(v_seen_ids, v_item_id);

      select * into v_existing
      from public.oxxen_connect_order_items i
      where i.id = v_item_id;

      if not found or v_existing.order_id <> p_order_id then
        raise exception 'El item no pertenece a este pedido' using errcode = '23514';
      end if;

      if v_order.status <> 'draft' and (
        v_existing.item_type is distinct from v_item_type
        or v_existing.description is distinct from v_description
        or v_existing.quantity is distinct from v_quantity
        or v_existing.unit_price is distinct from v_unit_price
        or v_existing.card_id is distinct from v_card_id
      ) then
        raise exception 'Los items solo pueden editarse mientras el pedido está en borrador' using errcode = '23514';
      end if;

      if v_order.status = 'draft' and (
        v_existing.item_type is distinct from v_item_type
        or v_existing.description is distinct from v_description
        or v_existing.quantity is distinct from v_quantity
        or v_existing.unit_price is distinct from v_unit_price
        or v_existing.card_id is distinct from v_card_id
      ) then
        if v_existing.card_id is distinct from v_card_id then
          v_card_change_count := v_card_change_count + 1;
        end if;
        update public.oxxen_connect_order_items
        set item_type = v_item_type,
            description = v_description,
            quantity = v_quantity,
            unit_price = v_unit_price,
            card_id = v_card_id
        where id = v_item_id;
        v_changed_item_count := v_changed_item_count + 1;
      end if;
    end if;
  end loop;

  -- No physical deletion in S3.5. Every row that existed when the call started
  -- must still be represented in the submitted state.
  if exists (
    select 1
    from unnest(v_original_ids) as original(id)
    where not (original.id = any(v_seen_ids))
  ) then
    raise exception 'S3.5 no permite eliminar items; conserva todos los items existentes' using errcode = '23514';
  end if;

  select coalesce(sum(i.subtotal), 0) into v_subtotal
  from public.oxxen_connect_order_items i
  where i.order_id = p_order_id;

  if p_discount > v_subtotal then
    raise exception 'El descuento no puede superar el subtotal' using errcode = '22023';
  end if;

  v_order_fields_changed :=
    v_order.customer_id is distinct from p_customer_id
    or v_order.discount is distinct from p_discount
    or v_order.notes is distinct from nullif(trim(coalesce(p_notes,'')), '')
    or v_order.currency is distinct from upper(trim(p_currency));
  v_status_changed := v_order.status is distinct from p_status;
  v_payment_changed := v_order.payment_status is distinct from p_payment_status;

  update public.oxxen_connect_orders
  set customer_id = p_customer_id,
      payment_status = p_payment_status,
      discount = p_discount,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      currency = upper(trim(p_currency)),
      status = p_status
  where id = p_order_id;

  select * into v_final from public.oxxen_connect_orders where id = p_order_id;

  if v_order_fields_changed then
    insert into public.oxxen_connect_audit_logs(admin_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'order.updated', 'order', p_order_id,
      jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number, 'customer_id', p_customer_id, 'actor_id', auth.uid(), 'changed_item_count', v_changed_item_count));
  end if;
  if v_status_changed then
    insert into public.oxxen_connect_audit_logs(admin_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'order.status_changed', 'order', p_order_id,
      jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number, 'customer_id', p_customer_id, 'actor_id', auth.uid(), 'old_status', v_order.status, 'new_status', p_status));
  end if;
  if v_payment_changed then
    insert into public.oxxen_connect_audit_logs(admin_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'order.payment_status_changed', 'order', p_order_id,
      jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number, 'customer_id', p_customer_id, 'actor_id', auth.uid(), 'old_status', v_order.payment_status, 'new_status', p_payment_status));
  end if;
  if v_changed_item_count > 0 then
    insert into public.oxxen_connect_audit_logs(admin_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'order.items_updated', 'order', p_order_id,
      jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number, 'customer_id', p_customer_id, 'actor_id', auth.uid(), 'changed_item_count', v_changed_item_count));
  end if;
  if v_card_change_count > 0 then
    insert into public.oxxen_connect_audit_logs(admin_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'order.card_assignment_changed', 'order', p_order_id,
      jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number, 'customer_id', p_customer_id, 'actor_id', auth.uid(), 'changed_item_count', v_card_change_count));
  end if;

  return jsonb_build_object('order_id', v_final.id, 'updated_at', v_final.updated_at, 'status', v_final.status, 'payment_status', v_final.payment_status, 'total', v_final.total);
end;
$$;

revoke all on function public.oxxen_connect_update_order_with_items(uuid,uuid,jsonb,numeric,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.oxxen_connect_update_order_with_items(uuid,uuid,jsonb,numeric,text,text,text,text,timestamptz)
  to authenticated;

-- Browser writes to Orders/Items are no longer part of the application contract.
-- Reads remain governed by RLS; create/update are done by hardened RPCs.
revoke insert (customer_id,status,payment_status,currency,discount,notes)
  on table public.oxxen_connect_orders from authenticated;
revoke update (customer_id,status,payment_status,currency,discount,notes)
  on table public.oxxen_connect_orders from authenticated;
revoke insert (order_id,item_type,description,quantity,unit_price,card_id)
  on table public.oxxen_connect_order_items from authenticated;
revoke update (item_type,description,quantity,unit_price,card_id)
  on table public.oxxen_connect_order_items from authenticated;
revoke usage, select on sequence public.oxxen_connect_orders_order_number_seq from authenticated;

drop policy if exists oxxen_orders_commercial_insert on public.oxxen_connect_orders;
drop policy if exists oxxen_orders_commercial_update on public.oxxen_connect_orders;
drop policy if exists oxxen_order_items_commercial_insert on public.oxxen_connect_order_items;
drop policy if exists oxxen_order_items_commercial_update on public.oxxen_connect_order_items;

comment on function public.oxxen_connect_update_order_with_items(uuid,uuid,jsonb,numeric,text,text,text,text,timestamptz) is
  'S3.5 atomic commercial order editor. OWNER/ADMIN/SALES only; OWNER requires AAL2. Uses optimistic concurrency and never deletes order items.';